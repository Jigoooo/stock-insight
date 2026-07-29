import { createHmac, timingSafeEqual } from 'node:crypto';

// A short-TTL, HMAC-signed context that the web/BFF mints and the internal
// api-server verifies. The api-server is never browser-reachable; every request
// must carry a fresh context bound to the exact method + path so a captured
// header cannot be replayed against another route or after it expires.
//
// Two subject kinds exist:
//  - user      : a UUID subject; every data route runs under this RLS scope.
//  - anonymous : the fixed `anon` sentinel, used ONLY by pre-authentication auth
//                routes (login / signup / session refresh) where no user id
//                exists yet. Anonymous contexts are signed under a SEPARATE MAC
//                domain, so an anonymous token can never be replayed as a user
//                token even against the same method+path.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_TTL_SECONDS = 300;

// `anon` can never collide with UUID_PATTERN, so the subject field alone is an
// unambiguous discriminator even before the MAC domain is considered.
export const ANONYMOUS_SUBJECT = 'anon';

const USER_MAC_DOMAIN = 'stock-insight:internal-user-context:v1\0';
const ANONYMOUS_MAC_DOMAIN = 'stock-insight:internal-anon-context:v1\0';

export class InternalContextError extends Error {
  constructor(message = 'Invalid internal user context') {
    super(message);
    this.name = 'InternalContextError';
  }
}

export type InternalUserScope = Readonly<{ userId: string }>;

export type InternalScope =
  | Readonly<{ kind: 'user'; userId: string }>
  | Readonly<{ kind: 'anonymous' }>;

type SignInput = Readonly<{
  userId: string;
  method: string;
  path: string;
  now: number; // seconds
  ttlSeconds: number;
}>;

type SignAnonymousInput = Readonly<{
  method: string;
  path: string;
  now: number; // seconds
  ttlSeconds: number;
}>;

type VerifyInput = Readonly<{
  method: string;
  path: string;
  now: number; // seconds
}>;

type Secret = Buffer | Uint8Array;

function macFor(
  secret: Secret,
  domain: string,
  subject: string,
  iat: number,
  exp: number,
  method: string,
  path: string,
): Buffer {
  return createHmac('sha256', secret)
    .update(domain, 'utf8')
    .update(subject, 'utf8')
    .update('\0', 'utf8')
    .update(String(iat), 'utf8')
    .update('\0', 'utf8')
    .update(String(exp), 'utf8')
    .update('\0', 'utf8')
    .update(method.toUpperCase(), 'utf8')
    .update('\0', 'utf8')
    .update(path, 'utf8')
    .digest();
}

function requireWindow(now: number, ttlSeconds: number): void {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds <= 0 ||
    ttlSeconds > MAX_TTL_SECONDS
  ) {
    throw new InternalContextError('Invalid context window');
  }
}

export function signInternalUserContext(secret: Secret, input: SignInput): string {
  if (!UUID_PATTERN.test(input.userId)) throw new InternalContextError('Invalid subject');
  requireWindow(input.now, input.ttlSeconds);
  const iat = input.now;
  const exp = iat + input.ttlSeconds;
  const mac = macFor(
    secret,
    USER_MAC_DOMAIN,
    input.userId,
    iat,
    exp,
    input.method,
    input.path,
  ).toString('base64url');
  return `${input.userId}.${iat}.${exp}.${mac}`;
}

// Pre-authentication context. Carries no subject claim: it only proves the
// caller holds the internal signing secret (i.e. it is the web/BFF), so login
// and signup can reach the brain before any user id exists.
export function signAnonymousInternalContext(secret: Secret, input: SignAnonymousInput): string {
  requireWindow(input.now, input.ttlSeconds);
  const iat = input.now;
  const exp = iat + input.ttlSeconds;
  const mac = macFor(
    secret,
    ANONYMOUS_MAC_DOMAIN,
    ANONYMOUS_SUBJECT,
    iat,
    exp,
    input.method,
    input.path,
  ).toString('base64url');
  return `${ANONYMOUS_SUBJECT}.${iat}.${exp}.${mac}`;
}

export function verifyInternalContext(
  secret: Secret,
  token: string,
  input: VerifyInput,
): InternalScope {
  if (typeof token !== 'string' || token.length === 0 || token.length > 512) {
    throw new InternalContextError();
  }
  const parts = token.split('.');
  if (parts.length !== 4) throw new InternalContextError();
  const [subject, iatText, expText, macText] = parts as [string, string, string, string];

  const isAnonymous = subject === ANONYMOUS_SUBJECT;
  if (!isAnonymous && !UUID_PATTERN.test(subject)) throw new InternalContextError();
  if (!/^\d+$/.test(iatText) || !/^\d+$/.test(expText)) throw new InternalContextError();

  const iat = Number(iatText);
  const exp = Number(expText);
  if (
    !Number.isSafeInteger(iat) ||
    !Number.isSafeInteger(exp) ||
    exp <= iat ||
    exp - iat > MAX_TTL_SECONDS
  ) {
    throw new InternalContextError();
  }
  if (!Number.isSafeInteger(input.now) || input.now < iat || input.now >= exp) {
    throw new InternalContextError('Context outside its validity window');
  }
  const expected = macFor(
    secret,
    isAnonymous ? ANONYMOUS_MAC_DOMAIN : USER_MAC_DOMAIN,
    subject,
    iat,
    exp,
    input.method,
    input.path,
  );
  let provided: Buffer;
  try {
    provided = Buffer.from(macText, 'base64url');
  } catch {
    throw new InternalContextError();
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new InternalContextError();
  }
  return isAnonymous
    ? Object.freeze({ kind: 'anonymous' as const })
    : Object.freeze({
        kind: 'user' as const,
        userId: subject,
      });
}

// Strict variant: rejects anonymous contexts. Every data route resolves its RLS
// scope through this, so an anonymous token can never reach user-scoped reads.
export function verifyInternalUserContext(
  secret: Secret,
  token: string,
  input: VerifyInput,
): InternalUserScope {
  const scope = verifyInternalContext(secret, token, input);
  if (scope.kind !== 'user') throw new InternalContextError();
  return Object.freeze({ userId: scope.userId });
}
