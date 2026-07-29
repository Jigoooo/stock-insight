import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_ENROLLMENT_CODE_LENGTH = 256;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

function normalizeEnrollmentCode(code: string): string {
  const normalized = typeof code === 'string' ? code.trim() : '';
  if (!normalized) throw new TypeError('Enrollment code is required');
  if (normalized.length > MAX_ENROLLMENT_CODE_LENGTH) {
    throw new TypeError('Enrollment code is too long');
  }
  return normalized;
}

export function hashEnrollmentCode(code: string): string {
  return createHash('sha256').update(normalizeEnrollmentCode(code), 'utf8').digest('hex');
}

export function verifyEnrollmentCode(code: string, expectedHash: string): boolean {
  if (typeof expectedHash !== 'string' || !SHA256_HEX_PATTERN.test(expectedHash)) return false;
  try {
    const actual = Buffer.from(hashEnrollmentCode(code), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
