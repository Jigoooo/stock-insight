import '@tanstack/react-start/server-only';

import { loadAuthRuntimeConfig, type AuthRuntimeConfig } from './auth-runtime-config.ts';
import { hashEnrollmentCode } from './enrollment-code.ts';
import {
  loadLocalAccountById,
  loadLocalAccountByUsername,
  type LocalAccount,
} from './local-account-repository.ts';
import {
  authenticateAccount,
  issueSessionForAccount,
  resolveSessionFromAccount,
} from './multi-user-auth.ts';
import { readSessionCookie } from './session-cookie.ts';
import { createScryptPasswordRecordAsync, type SessionClaims } from './session-core.ts';

import { createReadOnlyDatabaseClient, createSignupDatabaseClient } from '@stock-insight/api';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let authConfigPromise: Promise<AuthRuntimeConfig> | undefined;

function getAuthConfig(): Promise<AuthRuntimeConfig> {
  authConfigPromise ??= loadAuthRuntimeConfig();
  return authConfigPromise;
}

function baseSessionSecret(config: AuthRuntimeConfig): Buffer {
  return Buffer.from(config.sessionSecret, 'utf8');
}

function requireReadDatabase() {
  const database = createReadOnlyDatabaseClient();
  if (database.kind !== 'configured') throw new Error('Authentication database is unavailable');
  return database;
}

// Login: resolve the account by canonical username (no fixed server-owned id),
// then verify username + password and issue a credential-bound session.
export async function authenticateConfiguredCredentials(input: {
  username: string;
  password: string;
}): Promise<{ token: string; maxAgeSeconds: number; session: SessionClaims } | undefined> {
  const config = await getAuthConfig();
  const database = requireReadDatabase();
  const account = await loadLocalAccountByUsername(database.queryRows, input.username);
  return authenticateAccount(
    baseSessionSecret(config),
    config.sessionTtlSeconds,
    account,
    input.username,
    input.password,
  );
}

// Session refresh: the token carries a verified UUID subject; rebuild the
// credential from that id and re-validate the signature against it.
export async function readBoundSession(
  cookieHeader: string | null | undefined,
): Promise<SessionClaims | undefined> {
  const token = readSessionCookie(cookieHeader);
  if (!token) return undefined;
  const subject = peekSessionSubject(token);
  if (!subject) return undefined;
  const config = await getAuthConfig();
  const database = requireReadDatabase();
  const account = await loadLocalAccountById(database.queryRows, subject);
  return resolveSessionFromAccount(baseSessionSecret(config), token, account);
}

// The token subject is only trusted after the signature check inside
// resolveSessionFromAccount; here we merely peek at the claimed id to know which
// account row to load. Malformed tokens resolve to undefined and fail closed.
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

// Signup is invitation-gated. The invite code itself is the credential: it is
// hashed to a digest and validated against the durable invitation ledger inside
// the atomic consume function, so signup is available whenever the feature is on.
export async function getEnrollmentAvailability(): Promise<boolean> {
  const config = await getAuthConfig();
  return config.signupEnabled;
}

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

  const passwordRecord = await createScryptPasswordRecordAsync(input.password);
  const codeDigest = hashEnrollmentCode(input.enrollmentCode);
  // Signup mints the user, so there is no pre-existing scope; the SECURITY
  // DEFINER consume function sets its own scope internally.
  const writeDatabase = createSignupDatabaseClient();
  if (writeDatabase.kind !== 'configured') {
    throw new Error('Authentication database is unavailable');
  }

  const result = await writeDatabase.withTransaction(async (executor) => {
    const rows = await executor.queryRows<{ status: string; user_id: string | null }>(
      `SELECT status, user_id::text AS user_id
         FROM public.consume_invitation_and_create_account($1, $2, $3)`,
      [codeDigest, input.username, passwordRecord],
    );
    return rows[0];
  });

  if (!result) return { status: 'unavailable' };
  if (result.status === 'created' && result.user_id && UUID_PATTERN.test(result.user_id)) {
    const localAccount: LocalAccount = {
      userId: result.user_id,
      username: input.username,
      passwordRecord,
    };
    return {
      status: 'created',
      ...issueSessionForAccount(baseSessionSecret(config), config.sessionTtlSeconds, localAccount),
    };
  }
  // username_taken / exhausted / expired / revoked are all conflict-like states
  // where the operator or user must act; everything else is an invalid code.
  if (['username_taken', 'exhausted', 'expired', 'revoked'].includes(result.status)) {
    return { status: 'unavailable' };
  }
  return { status: 'invalid_code' };
}

export async function getAuthenticationOrigin(): Promise<string> {
  return (await getAuthConfig()).appOrigin;
}
