import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { test } from 'node:test';

// Moved from apps/web/test/session-core.test.ts by the P2 brain split: password
// records live in the brain now, so their contract is verified here.
import {
  createScryptPasswordRecordAsync,
  parseScryptPasswordRecord,
  verifyScryptPassword,
  verifyScryptPasswordAsync,
} from '../src/auth/password-record.ts';

const PASSWORD = 'not-a-real-password';
const SALT = Buffer.from('00112233445566778899aabbccddeeff', 'hex');

function createPasswordRecord(password = PASSWORD) {
  const digest = scryptSync(password, SALT, 32, { N: 16_384, r: 8, p: 1 });
  return [
    'scrypt',
    'v=1',
    'N=16384',
    'r=8',
    'p=1',
    SALT.toString('base64url'),
    digest.toString('base64url'),
  ].join('$');
}

test('parses only the canonical scrypt password record shape', () => {
  const parsed = parseScryptPasswordRecord(createPasswordRecord());

  assert.equal(parsed?.algorithm, 'scrypt');
  assert.equal(parsed?.version, 1);
  assert.equal(parsed?.N, 16_384);
  assert.equal(parsed?.r, 8);
  assert.equal(parsed?.p, 1);
  assert.deepEqual(parsed?.salt, SALT);
  assert.equal(parsed?.digest.length, 32);
});

test('rejects malformed or non-canonical scrypt records without throwing', () => {
  const canonical = createPasswordRecord();
  const parts = canonical.split('$');
  const malformed = [
    '',
    canonical.replace('scrypt', 'pbkdf2'),
    canonical.replace('v=1', 'v=2'),
    canonical.replace('N=16384', 'N=32768'),
    canonical.replace('r=8', 'r=08'),
    canonical.replace('p=1', 'p=2'),
    `${canonical}$extra`,
    parts.slice(0, -1).join('$'),
    canonical.replace(parts[5]!, `${parts[5]}=`),
    canonical.replace(parts[5]!, Buffer.alloc(15).toString('base64url')),
    canonical.replace(parts[6]!, Buffer.alloc(31).toString('base64url')),
    canonical.replace(parts[6]!, '*'.repeat(43)),
  ];

  for (const record of malformed) {
    assert.equal(parseScryptPasswordRecord(record), undefined, record);
    assert.equal(verifyScryptPassword(PASSWORD, record), false, record);
  }

  assert.equal(parseScryptPasswordRecord(42 as unknown as string), undefined);
});

test('verifies a canonical scrypt password record', () => {
  assert.equal(verifyScryptPassword(PASSWORD, createPasswordRecord()), true);
  assert.equal(verifyScryptPassword('definitely-wrong', createPasswordRecord()), false);
});

test('verifies passwords through the asynchronous scrypt boundary', async () => {
  assert.equal(await verifyScryptPasswordAsync(PASSWORD, createPasswordRecord()), true);
  assert.equal(await verifyScryptPasswordAsync('definitely-wrong', createPasswordRecord()), false);
});

test('creates a canonical password record through the asynchronous scrypt boundary', async () => {
  const record = await createScryptPasswordRecordAsync(PASSWORD, SALT);

  assert.equal(record, createPasswordRecord());
  assert.equal(await verifyScryptPasswordAsync(PASSWORD, record), true);
  await assert.rejects(createScryptPasswordRecordAsync('', SALT), /Password is required/);
  await assert.rejects(createScryptPasswordRecordAsync(PASSWORD, Buffer.alloc(15)), /salt/i);
});
