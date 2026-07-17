import assert from 'node:assert/strict';
import { createHmac, scryptSync } from 'node:crypto';
import { test } from 'node:test';

import {
  createScryptPasswordRecordAsync,
  createSessionToken,
  parseScryptPasswordRecord,
  verifyScryptPassword,
  verifyScryptPasswordAsync,
  verifySessionToken,
} from '../src/server/auth/session-core.ts';

const PASSWORD = 'not-a-real-password';
const SALT = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const SESSION_SECRET = Buffer.alloc(32, 0x5a);
const NOW_MS = Date.UTC(2026, 6, 17, 12, 0, 0);
const CLOCK = () => NOW_MS;
const SUBJECT = '123e4567-e89b-42d3-a456-426614174000';

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

function signRawSessionPayload(payload: string, secret = SESSION_SECRET) {
  const payloadSegment = Buffer.from(payload, 'utf8').toString('base64url');
  const signatureSegment = createHmac('sha256', secret)
    .update(payloadSegment, 'ascii')
    .digest('base64url');
  return `${payloadSegment}.${signatureSegment}`;
}

function createSessionFixture() {
  return createSessionToken(
    { sub: SUBJECT, username: 'test-user' },
    { secret: SESSION_SECRET, ttlSeconds: 900, clock: CLOCK },
  );
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

test('creates and verifies a deterministic signed session token', () => {
  const token = createSessionFixture();

  assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(verifySessionToken(token, { secret: SESSION_SECRET, clock: CLOCK }), {
    version: 1,
    sub: SUBJECT,
    username: 'test-user',
    iat: NOW_MS / 1_000,
    exp: NOW_MS / 1_000 + 900,
  });
});

test('rejects a token verified with the wrong secret', () => {
  assert.equal(
    verifySessionToken(createSessionFixture(), {
      secret: Buffer.alloc(32, 0xa5),
      clock: CLOCK,
    }),
    undefined,
  );
});

test('rejects payload and signature tampering', () => {
  const token = createSessionFixture();
  const [payloadSegment, signatureSegment] = token.split('.') as [string, string];
  const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  payload.username = 'attacker';
  const tamperedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const tamperedSignature = `${signatureSegment[0] === 'A' ? 'B' : 'A'}${signatureSegment.slice(1)}`;

  assert.equal(
    verifySessionToken(`${tamperedPayload}.${signatureSegment}`, {
      secret: SESSION_SECRET,
      clock: CLOCK,
    }),
    undefined,
  );
  assert.equal(
    verifySessionToken(`${payloadSegment}.${tamperedSignature}`, {
      secret: SESSION_SECRET,
      clock: CLOCK,
    }),
    undefined,
  );
});

test('rejects expired tokens at the expiration boundary', () => {
  const token = createSessionFixture();

  assert.notEqual(
    verifySessionToken(token, { secret: SESSION_SECRET, clock: () => NOW_MS + 899_000 }),
    undefined,
  );
  assert.equal(
    verifySessionToken(token, { secret: SESSION_SECRET, clock: () => NOW_MS + 900_000 }),
    undefined,
  );
});

test('rejects tokens issued in the future', () => {
  const futureToken = createSessionToken(
    { sub: SUBJECT, username: 'test-user' },
    { secret: SESSION_SECRET, ttlSeconds: 900, clock: () => NOW_MS + 1_000 },
  );

  assert.equal(
    verifySessionToken(futureToken, { secret: SESSION_SECRET, clock: CLOCK }),
    undefined,
  );
});

test('rejects malformed token envelopes without throwing', () => {
  const token = createSessionFixture();
  const [payloadSegment, signatureSegment] = token.split('.') as [string, string];
  const malformed = [
    '',
    '.',
    token.replace('.', ''),
    `${token}.extra`,
    `${payloadSegment}=.${signatureSegment}`,
    `${payloadSegment}.${signatureSegment}=`,
    `*.${signatureSegment}`,
    `${payloadSegment}.*`,
    `${payloadSegment}.${Buffer.alloc(31).toString('base64url')}`,
  ];

  for (const candidate of malformed) {
    assert.equal(
      verifySessionToken(candidate, { secret: SESSION_SECRET, clock: CLOCK }),
      undefined,
      candidate,
    );
  }
});

test('rejects validly signed but malformed or overlong-lived claims', () => {
  const now = NOW_MS / 1_000;
  const malformedPayloads = [
    'null',
    '[]',
    '{}',
    JSON.stringify({ version: 2, sub: SUBJECT, username: 'test-user', iat: now, exp: now + 900 }),
    JSON.stringify({
      version: 1,
      sub: 'not-a-uuid',
      username: 'test-user',
      iat: now,
      exp: now + 900,
    }),
    JSON.stringify({ version: 1, sub: SUBJECT, username: '', iat: now, exp: now + 900 }),
    JSON.stringify({
      version: 1,
      sub: SUBJECT,
      username: 'test-user',
      iat: now + 0.5,
      exp: now + 900,
    }),
    JSON.stringify({ version: 1, sub: SUBJECT, username: 'test-user', iat: now, exp: now }),
    JSON.stringify({
      version: 1,
      sub: SUBJECT,
      username: 'test-user',
      iat: now,
      exp: now + 900,
      role: 'admin',
    }),
    JSON.stringify({ sub: SUBJECT, username: 'test-user', version: 1, iat: now, exp: now + 900 }),
    JSON.stringify({
      version: 1,
      sub: SUBJECT,
      username: 'test-user',
      iat: now,
      exp: now + 30 * 24 * 60 * 60 + 1,
    }),
  ];

  for (const payload of malformedPayloads) {
    assert.equal(
      verifySessionToken(signRawSessionPayload(payload), {
        secret: SESSION_SECRET,
        clock: CLOCK,
      }),
      undefined,
      payload,
    );
  }
});

test('fails closed for weak secrets and invalid issuance claims', () => {
  assert.throws(
    () =>
      createSessionToken(
        { sub: SUBJECT, username: 'test-user' },
        { secret: Buffer.alloc(31), ttlSeconds: 900, clock: CLOCK },
      ),
    /at least 32 bytes/,
  );
  assert.throws(
    () =>
      createSessionToken(
        { sub: 'NOT-A-UUID', username: 'test-user' },
        { secret: SESSION_SECRET, ttlSeconds: 900, clock: CLOCK },
      ),
    /canonical UUID/,
  );
  assert.throws(
    () =>
      createSessionToken(
        { sub: SUBJECT, username: ' test-user ' },
        { secret: SESSION_SECRET, ttlSeconds: 900, clock: CLOCK },
      ),
    /username/,
  );
  assert.equal(
    verifySessionToken(createSessionFixture(), {
      secret: Buffer.alloc(31),
      clock: CLOCK,
    }),
    undefined,
  );
});
