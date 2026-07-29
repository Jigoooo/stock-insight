import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

// Session TOKEN layer only. The scrypt password-record cases moved to
// apps/api/test/password-record.test.ts with the P2 brain split: apps/web no
// longer holds or verifies credential material.
import { createSessionToken, verifySessionToken } from '../src/server/auth/session-core.ts';

const SESSION_SECRET = Buffer.alloc(32, 0x5a);
const NOW_MS = Date.UTC(2026, 6, 17, 12, 0, 0);
const CLOCK = () => NOW_MS;
const SUBJECT = '123e4567-e89b-42d3-a456-426614174000';

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
