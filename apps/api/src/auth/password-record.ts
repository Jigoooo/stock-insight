import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';

// Credential material lives ONLY in the brain. The web/BFF never receives a
// password record, so every scrypt primitive that touches one is owned here.

const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_LENGTH = 16;
const SCRYPT_OPTIONS = Object.freeze({ N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });

export type ScryptPasswordRecord = Readonly<{
  algorithm: 'scrypt';
  version: 1;
  N: 16_384;
  r: 8;
  p: 1;
  salt: Buffer;
  digest: Buffer;
}>;

export function decodeCanonicalBase64Url(
  value: string,
  expectedLength: number,
): Buffer | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;

  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== expectedLength || decoded.toString('base64url') !== value) {
    return undefined;
  }

  return decoded;
}

export function parseScryptPasswordRecord(record: string): ScryptPasswordRecord | undefined {
  if (typeof record !== 'string') return undefined;

  const parts = record.split('$');
  if (
    parts.length !== 7 ||
    parts[0] !== 'scrypt' ||
    parts[1] !== 'v=1' ||
    parts[2] !== 'N=16384' ||
    parts[3] !== 'r=8' ||
    parts[4] !== 'p=1'
  ) {
    return undefined;
  }

  const salt = decodeCanonicalBase64Url(parts[5] ?? '', SCRYPT_SALT_LENGTH);
  const digest = decodeCanonicalBase64Url(parts[6] ?? '', SCRYPT_KEY_LENGTH);
  if (!salt || !digest) return undefined;

  return {
    algorithm: 'scrypt',
    version: 1,
    N: SCRYPT_OPTIONS.N,
    r: SCRYPT_OPTIONS.r,
    p: SCRYPT_OPTIONS.p,
    salt,
    digest,
  };
}

export function verifyScryptPassword(password: string, record: string): boolean {
  if (typeof password !== 'string' || typeof record !== 'string') return false;

  const parsed = parseScryptPasswordRecord(record);
  if (!parsed) return false;

  try {
    const candidate = scryptSync(password, parsed.salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
    return timingSafeEqual(candidate, parsed.digest);
  } catch {
    return false;
  }
}

function deriveScryptKeyAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function createScryptPasswordRecordAsync(
  password: string,
  salt: Buffer = randomBytes(SCRYPT_SALT_LENGTH),
): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('Password is required');
  }
  if (!Buffer.isBuffer(salt) || salt.length !== SCRYPT_SALT_LENGTH) {
    throw new TypeError(`Scrypt salt must contain exactly ${SCRYPT_SALT_LENGTH} bytes`);
  }
  const digest = await deriveScryptKeyAsync(password, salt);
  return [
    'scrypt',
    'v=1',
    'N=16384',
    'r=8',
    'p=1',
    salt.toString('base64url'),
    digest.toString('base64url'),
  ].join('$');
}

export async function verifyScryptPasswordAsync(
  password: string,
  record: string,
): Promise<boolean> {
  if (typeof password !== 'string' || typeof record !== 'string') return false;
  const parsed = parseScryptPasswordRecord(record);
  if (!parsed) return false;

  try {
    const candidate = await deriveScryptKeyAsync(password, parsed.salt);
    return timingSafeEqual(candidate, parsed.digest);
  } catch {
    return false;
  }
}
