import '@tanstack/react-start/server-only';

import { brainRequest } from '../brain-client.ts';
import { loadAuthRuntimeConfig, type AuthRuntimeConfig } from './auth-runtime-config.ts';
import { fingerprintSessionSecret, type AccountIdentity } from './credential-binding.ts';
import { createInFlightAccountIdentityLoader } from './in-flight-account-identity-loader.ts';
import { readSessionCookie } from './session-cookie.ts';
import { createSessionToken, verifySessionToken, type SessionClaims } from './session-core.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let authConfigPromise: Promise<AuthRuntimeConfig> | undefined;

function getAuthConfig(): Promise<AuthRuntimeConfig> {
  authConfigPromise ??= loadAuthRuntimeConfig();
  return authConfigPromise;
}

function baseSessionSecret(config: AuthRuntimeConfig): Buffer {
  return Buffer.from(config.sessionSecret, 'utf8');
}

const anonymous = { kind: 'anonymous' as const };

const loadAccountIdentity = createInFlightAccountIdentityLoader<AccountIdentity>(async (userId) => {
  const result = await brainRequest<
    { status: 'found'; identity: AccountIdentity } | { status: 'not_found' }
  >('/v1/auth/account', { scope: anonymous, query: { userId } });
  return result.status === 'found' ? result.identity : undefined;
});

// Session keys are still credential-bound, but the binding material is now the
// brain-issued credentialFingerprint rather than the raw password record — which
// never leaves the brain. Rotating a password changes the fingerprint, so every
// previously issued session stops verifying, exactly as before.
function sessionSecretFor(config: AuthRuntimeConfig, identity: AccountIdentity): Buffer {
  return fingerprintSessionSecret(baseSessionSecret(config), identity);
}

function issueSession(
  config: AuthRuntimeConfig,
  identity: AccountIdentity,
): { token: string; maxAgeSeconds: number; session: SessionClaims } {
  const secret = sessionSecretFor(config, identity);
  const token = createSessionToken(
    { sub: identity.userId, username: identity.username },
    { secret, ttlSeconds: config.sessionTtlSeconds },
  );
  const session = verifySessionToken(token, { secret });
  if (!session || session.sub !== identity.userId || session.username !== identity.username) {
    throw new Error('Failed to issue a bound authentication session');
  }
  return { token, maxAgeSeconds: config.sessionTtlSeconds, session };
}

// Login: the brain verifies username + password (it owns the scrypt records) and
// returns only an opaque identity. The plaintext password is forwarded over the
// internal channel and never stored here.
export async function authenticateConfiguredCredentials(input: {
  username: string;
  password: string;
}): Promise<{ token: string; maxAgeSeconds: number; session: SessionClaims } | undefined> {
  const config = await getAuthConfig();
  const result = await brainRequest<
    { status: 'authenticated'; identity: AccountIdentity } | { status: 'rejected' }
  >('/v1/auth/authenticate', {
    scope: anonymous,
    method: 'POST',
    body: { username: input.username, password: input.password },
  });
  if (result.status !== 'authenticated') return undefined;
  return issueSession(config, result.identity);
}

// Session refresh: the token carries a verified UUID subject; rebuild the
// credential fingerprint from that id and re-validate the signature against it.
export async function readBoundSession(
  cookieHeader: string | null | undefined,
): Promise<SessionClaims | undefined> {
  const token = readSessionCookie(cookieHeader);
  if (!token) return undefined;
  const subject = peekSessionSubject(token);
  if (!subject) return undefined;
  const config = await getAuthConfig();

  const identity = await loadAccountIdentity(subject);
  if (!identity) return undefined;

  const session = verifySessionToken(token, { secret: sessionSecretFor(config, identity) });
  if (!session) return undefined;
  // Bind the claims to the resolved account so a token cannot be replayed under
  // a different identity even if its signature somehow validated.
  return session.sub === identity.userId && session.username === identity.username
    ? session
    : undefined;
}

// The token subject is only trusted after the signature check above; here we
// merely peek at the claimed id to know which account to resolve. Malformed
// tokens resolve to undefined and fail closed.
function peekSessionSubject(token: string): string | undefined {
  const segments = token.split('.');
  if (segments.length !== 2) return undefined;
  try {
    const payload = Buffer.from(segments[0] ?? '', 'base64url').toString('utf8');
    const value = JSON.parse(payload) as { sub?: unknown };
    const sub = value.sub;
    return typeof sub === 'string' && UUID_PATTERN.test(sub) ? sub : undefined;
  } catch {
    return undefined;
  }
}

export async function getEnrollmentAvailability(): Promise<boolean> {
  const config = await getAuthConfig();
  return config.signupEnabled;
}

// Signup is invitation-gated. The brain hashes the code, mints the user inside
// the atomic SECURITY DEFINER consume function, and returns the identity.
export async function enrollLocalAccountCredentials(input: {
  username: string;
  password: string;
  enrollmentCode: string;
}): Promise<
  | {
      status: 'created';
      token: string;
      maxAgeSeconds: number;
      session: SessionClaims;
    }
  | { status: 'invalid_code' | 'unavailable' }
> {
  const config = await getAuthConfig();
  if (!config.signupEnabled) return { status: 'unavailable' };

  const result = await brainRequest<
    | { status: 'created'; identity: AccountIdentity }
    | { status: 'invalid_code' }
    | { status: 'unavailable' }
  >('/v1/auth/enroll', {
    scope: anonymous,
    method: 'POST',
    body: {
      username: input.username,
      password: input.password,
      enrollmentCode: input.enrollmentCode,
    },
  });

  if (result.status !== 'created') return { status: result.status };
  return { status: 'created', ...issueSession(config, result.identity) };
}

export async function getAuthenticationOrigin(): Promise<string> {
  return (await getAuthConfig()).appOrigin;
}
