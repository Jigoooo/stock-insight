// Moved from apps/web/test/ by the P2 brain split: the module under test now
// lives in the brain (apps/api/src/auth). Assertions are unchanged.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hashEnrollmentCode, verifyEnrollmentCode } from '../src/auth/enrollment-code.ts';

describe('enrollment code verification', () => {
  it('hashes and verifies a high-entropy enrollment code without storing plaintext', () => {
    const code = 'setup_0123456789abcdefghijklmnopqrstuvwxyz';
    const hash = hashEnrollmentCode(code);

    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(verifyEnrollmentCode(`  ${code}\n`, hash), true);
    assert.equal(verifyEnrollmentCode(`${code}x`, hash), false);
  });

  it('fails closed for empty, oversized, or malformed values', () => {
    assert.equal(verifyEnrollmentCode('', 'ab'.repeat(32)), false);
    assert.equal(verifyEnrollmentCode('x'.repeat(257), 'ab'.repeat(32)), false);
    assert.equal(verifyEnrollmentCode('valid-code', 'not-a-hash'), false);
    assert.throws(() => hashEnrollmentCode('   '), /Enrollment code is required/);
  });
});
