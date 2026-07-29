import { createHmac, timingSafeEqual } from 'node:crypto';

// Session TOKEN layer only. All password/scrypt primitives moved to the brain
// (apps/api/src/auth/password-record.ts) as part of the P2 split: the BFF never
// sees a password record, so it has no reason to be able to hash or verify one.

function decodeCanonicalBase64Url(value: string, expectedLength: number): Buffer | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;

  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== expectedLength || decoded.toString('base64url') !== value) {
    return undefined;
  }

  return decoded;
}

const SESSION_VERSION = 1;
const SESSION_SIGNATURE_LENGTH = 32;
const MINIMUM_SESSION_SECRET_LENGTH = 32;
const MAXIMUM_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAXIMUM_SESSION_TOKEN_LENGTH = 4_096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Clock = () => number;
type SessionSecret = Buffer | Uint8Array;

export type SessionClaims = Readonly<{
  version: 1;
  sub: string;
  username: string;
  iat: number;
  exp: number;
}>;

export type SessionIdentity = Readonly<Pick<SessionClaims, 'sub' | 'username'>>;

export type CreateSessionTokenOptions = Readonly<{
  secret: SessionSecret;
  ttlSeconds: number;
  clock?: Clock;
}>;

export type VerifySessionTokenOptions = Readonly<{
  secret: SessionSecret;
  clock?: Clock;
}>;

function isSessionSecret(secret: unknown): secret is SessionSecret {
  return secret instanceof Uint8Array && secret.byteLength >= MINIMUM_SESSION_SECRET_LENGTH;
}

function assertSessionSecret(secret: unknown): asserts secret is SessionSecret {
  if (!isSessionSecret(secret)) {
    throw new TypeError(
      `Session secret must contain at least ${MINIMUM_SESSION_SECRET_LENGTH} bytes`,
    );
  }
}

function isValidSubject(sub: unknown): sub is string {
  return typeof sub === 'string' && UUID_PATTERN.test(sub);
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return true;
    }
  }
  return false;
}

function isValidUsername(username: unknown): username is string {
  return (
    typeof username === 'string' &&
    username.length > 0 &&
    username.length <= 128 &&
    username.trim() === username &&
    !containsControlCharacter(username)
  );
}

function readClock(clock: Clock): number {
  const milliseconds = clock();
  if (!Number.isFinite(milliseconds)) throw new TypeError('Session clock must return milliseconds');

  const seconds = Math.floor(milliseconds / 1_000);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new TypeError('Session clock returned an unsupported timestamp');
  }
  return seconds;
}

function signPayload(payloadSegment: string, secret: SessionSecret): Buffer {
  return createHmac('sha256', secret).update(payloadSegment, 'ascii').digest();
}

function serializeClaims(claims: SessionClaims): string {
  return JSON.stringify(claims);
}

function parseSessionClaims(payload: Buffer): SessionClaims | undefined {
  let value: unknown;
  let text: string;
  try {
    text = payload.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(payload)) return undefined;
    value = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== SESSION_VERSION ||
    !isValidSubject(candidate.sub) ||
    !isValidUsername(candidate.username) ||
    !Number.isSafeInteger(candidate.iat) ||
    !Number.isSafeInteger(candidate.exp) ||
    (candidate.iat as number) < 0 ||
    (candidate.exp as number) <= (candidate.iat as number) ||
    (candidate.exp as number) - (candidate.iat as number) > MAXIMUM_SESSION_TTL_SECONDS
  ) {
    return undefined;
  }

  const claims: SessionClaims = {
    version: SESSION_VERSION,
    sub: candidate.sub,
    username: candidate.username,
    iat: candidate.iat as number,
    exp: candidate.exp as number,
  };
  return serializeClaims(claims) === text ? claims : undefined;
}

export function createSessionToken(
  identity: SessionIdentity,
  options: CreateSessionTokenOptions,
): string {
  assertSessionSecret(options.secret);
  if (!isValidSubject(identity.sub))
    throw new TypeError('Session subject must be a canonical UUID');
  if (!isValidUsername(identity.username)) throw new TypeError('Session username is invalid');
  if (
    !Number.isSafeInteger(options.ttlSeconds) ||
    options.ttlSeconds <= 0 ||
    options.ttlSeconds > MAXIMUM_SESSION_TTL_SECONDS
  ) {
    throw new RangeError('Session TTL is outside the supported range');
  }

  const iat = readClock(options.clock ?? Date.now);
  const exp = iat + options.ttlSeconds;
  if (!Number.isSafeInteger(exp))
    throw new RangeError('Session expiration is outside the supported range');

  const claims: SessionClaims = {
    version: SESSION_VERSION,
    sub: identity.sub,
    username: identity.username,
    iat,
    exp,
  };
  const payloadSegment = Buffer.from(serializeClaims(claims), 'utf8').toString('base64url');
  const signatureSegment = signPayload(payloadSegment, options.secret).toString('base64url');
  return `${payloadSegment}.${signatureSegment}`;
}

export function verifySessionToken(
  token: string,
  options: VerifySessionTokenOptions,
): SessionClaims | undefined {
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > MAXIMUM_SESSION_TOKEN_LENGTH ||
    !isSessionSecret(options?.secret)
  ) {
    return undefined;
  }

  const segments = token.split('.');
  if (segments.length !== 2) return undefined;
  const payloadSegment = segments[0] ?? '';
  const signatureSegment = segments[1] ?? '';
  const payload = decodeCanonicalBase64Url(
    payloadSegment,
    Buffer.from(payloadSegment, 'base64url').length,
  );
  const signature = decodeCanonicalBase64Url(signatureSegment, SESSION_SIGNATURE_LENGTH);
  if (!payload || !signature) return undefined;

  const expectedSignature = signPayload(payloadSegment, options.secret);
  if (!timingSafeEqual(signature, expectedSignature)) return undefined;

  const claims = parseSessionClaims(payload);
  if (!claims) return undefined;

  try {
    const now = readClock(options.clock ?? Date.now);
    if (claims.iat > now || claims.exp <= now) return undefined;
  } catch {
    return undefined;
  }

  return claims;
}
