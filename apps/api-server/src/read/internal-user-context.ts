import { createHmac, timingSafeEqual } from 'node:crypto';

// A short-TTL, HMAC-signed context that the web/BFF mints and the internal
// api-server verifies. The api-server is never browser-reachable; every request
// must carry a fresh context bound to the exact method + path so a captured
// header cannot be replayed against another route or after it expires.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_TTL_SECONDS = 300;

export class InternalContextError extends Error {
  constructor(message = 'Invalid internal user context') {
    super(message);
    this.name = 'InternalContextError';
  }
}

export type InternalUserScope = Readonly<{ userId: string }>;

type SignInput = Readonly<{
  userId: string;
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
  userId: string,
  iat: number,
  exp: number,
  method: string,
  path: string,
): Buffer {
  return createHmac('sha256', secret)
    .update('stock-insight:internal-user-context:v1\0', 'utf8')
    .update(userId, 'utf8')
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

export function signInternalUserContext(secret: Secret, input: SignInput): string {
  if (!UUID_PATTERN.test(input.userId)) throw new InternalContextError('Invalid subject');
  if (
    !Number.isSafeInteger(input.now) ||
    input.now < 0 ||
    !Number.isSafeInteger(input.ttlSeconds) ||
    input.ttlSeconds <= 0 ||
    input.ttlSeconds > MAX_TTL_SECONDS
  ) {
    throw new InternalContextError('Invalid context window');
  }
  const iat = input.now;
  const exp = iat + input.ttlSeconds;
  const mac = macFor(secret, input.userId, iat, exp, input.method, input.path).toString(
    'base64url',
  );
  return `${input.userId}.${iat}.${exp}.${mac}`;
}

export function verifyInternalUserContext(
  secret: Secret,
  token: string,
  input: VerifyInput,
): InternalUserScope {
  if (typeof token !== 'string' || token.length === 0 || token.length > 512) {
    throw new InternalContextError();
  }
  const parts = token.split('.');
  if (parts.length !== 4) throw new InternalContextError();
  const [userId, iatText, expText, macText] = parts as [string, string, string, string];
  if (!UUID_PATTERN.test(userId) || !/^\d+$/.test(iatText) || !/^\d+$/.test(expText)) {
    throw new InternalContextError();
  }
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
  const expected = macFor(secret, userId, iat, exp, input.method, input.path);
  let provided: Buffer;
  try {
    provided = Buffer.from(macText, 'base64url');
  } catch {
    throw new InternalContextError();
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new InternalContextError();
  }
  return Object.freeze({ userId });
}
