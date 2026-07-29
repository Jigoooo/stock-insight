// Session forgery probe (P2 credential-binding contract).
//
// TARGET: readBoundSession() reads the token's `sub` claim BEFORE verifying the
// signature, so it knows which account to fetch. That is only safe if the
// unverified subject is used for NOTHING except selecting the lookup, and the
// signature check that follows is bound to that account's fingerprint.
//
// The brain is stubbed here (this is a pure web/BFF-side crypto test), so the
// probe can mint arbitrary identities and password rotations at will.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'session-forgery-'));
const sessionSecretPath = join(dir, 'session-secret');
writeFileSync(sessionSecretPath, '0123456789abcdef0123456789abcdef\n');

process.env.STOCK_INSIGHT_SESSION_SECRET_FILE = sessionSecretPath;
process.env.STOCK_INSIGHT_APP_ORIGIN = 'https://stock.jigooo.com';
process.env.STOCK_INSIGHT_SIGNUP_ENABLED = 'true';
process.env.STOCK_INSIGHT_BRAIN_URL = 'http://brain.invalid';
process.env.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET = 'i'.repeat(48);

const VICTIM = {
  userId: '11111111-2222-4333-8444-555555555555',
  username: 'victim',
  credentialFingerprint: 'VICTIM-FINGERPRINT-v1',
};
const ATTACKER = {
  userId: '99999999-2222-4333-8444-555555555555',
  username: 'attacker',
  credentialFingerprint: 'ATTACKER-FINGERPRINT-v1',
};
// Same account after the victim changes their password: the brain recomputes the
// fingerprint over the NEW password record, so this value differs.
const VICTIM_ROTATED = { ...VICTIM, credentialFingerprint: 'VICTIM-FINGERPRINT-v2' };

// --- brain stub -------------------------------------------------------------
const directory = new Map([
  [VICTIM.userId, VICTIM],
  [ATTACKER.userId, ATTACKER],
]);
let accountLookups = [];

globalThis.fetch = async (url) => {
  const target = new URL(url);
  accountLookups.push(target.pathname + target.search);
  if (target.pathname === '/v1/auth/account') {
    const id = target.searchParams.get('userId');
    const identity = directory.get(id);
    const body = identity ? { status: 'found', identity } : { status: 'not_found' };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (target.pathname === '/v1/auth/authenticate') {
    return new Response(JSON.stringify({ status: 'authenticated', identity: VICTIM }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  throw new Error(`unexpected brain call: ${target.pathname}`);
};

const { authenticateConfiguredCredentials, readBoundSession } =
  await import('../src/server/auth/auth-runtime.ts');
const { fingerprintSessionSecret } = await import('../src/server/auth/credential-binding.ts');
const { createSessionToken } = await import('../src/server/auth/session-core.ts');

const BASE = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
// Import the real cookie name: hardcoding it made the baseline silently fail,
// which would have made every "rejected" result meaningless (a probe that
// rejects everything proves nothing).
const { SESSION_COOKIE_NAME } = await import('../src/server/auth/session-cookie.ts');
const cookie = (token) => `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) pass += 1;
  else fail += 1;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}

// A genuine login, used as the baseline everything else is compared against.
const issued = await authenticateConfiguredCredentials({ username: 'victim', password: 'pw' });
assert.ok(issued, 'baseline login must succeed');

console.log('=== baseline ===');
{
  const s = await readBoundSession(cookie(issued.token));
  check('a genuine session verifies', s?.sub === VICTIM.userId);
}

console.log('\n=== forgery: attacker signs a token claiming the victim ===');
{
  // The attacker knows the victim's user id and username (they are not secret),
  // and signs with their OWN fingerprint-derived key.
  const attackerKey = fingerprintSessionSecret(BASE, ATTACKER);
  const forged = createSessionToken(
    { sub: VICTIM.userId, username: VICTIM.username },
    { secret: attackerKey, ttlSeconds: 900 },
  );
  const s = await readBoundSession(cookie(forged));
  check('attacker-signed token claiming victim is rejected', s === undefined);
}

console.log('\n=== forgery: guessed / absent fingerprint ===');
{
  // Signing with the BASE secret alone — i.e. an attacker who somehow learned the
  // session secret but not the fingerprint.
  const forged = createSessionToken(
    { sub: VICTIM.userId, username: VICTIM.username },
    { secret: BASE, ttlSeconds: 900 },
  );
  const s = await readBoundSession(cookie(forged));
  check('base-secret-only token is rejected (fingerprint is required)', s === undefined);
}

console.log('\n=== cross-account replay ===');
{
  // The attacker holds a VALID token for their own account and swaps the subject
  // in the payload, keeping the original signature.
  const attackerKey = fingerprintSessionSecret(BASE, ATTACKER);
  const valid = createSessionToken(
    { sub: ATTACKER.userId, username: ATTACKER.username },
    { secret: attackerKey, ttlSeconds: 900 },
  );
  const [payloadSeg, sigSeg] = valid.split('.');
  const claims = JSON.parse(Buffer.from(payloadSeg, 'base64url').toString('utf8'));
  claims.sub = VICTIM.userId;
  claims.username = VICTIM.username;
  const swapped = `${Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')}.${sigSeg}`;
  const s = await readBoundSession(cookie(swapped));
  check('payload-swapped token is rejected', s === undefined);
}

console.log('\n=== password rotation invalidates issued sessions ===');
{
  directory.set(VICTIM.userId, VICTIM_ROTATED);
  const s = await readBoundSession(cookie(issued.token));
  check('session issued before rotation stops verifying', s === undefined);
  directory.set(VICTIM.userId, VICTIM);
  const back = await readBoundSession(cookie(issued.token));
  check('and verifies again once the fingerprint matches', back?.sub === VICTIM.userId);
}

console.log('\n=== unverified subject must not be usable beyond lookup selection ===');
{
  accountLookups = [];
  // Subject claims the victim, but the token is signed for the attacker, so the
  // lookup happens for the CLAIMED id and then the signature check must fail.
  const attackerKey = fingerprintSessionSecret(BASE, ATTACKER);
  const forged = createSessionToken(
    { sub: VICTIM.userId, username: VICTIM.username },
    { secret: attackerKey, ttlSeconds: 900 },
  );
  const s = await readBoundSession(cookie(forged));
  check('claimed-subject lookup does not grant a session', s === undefined);
  check(
    'exactly one brain lookup per attempt (no amplification)',
    accountLookups.length === 1,
    `lookups=${accountLookups.length}`,
  );
  check(
    'the lookup is a bounded account query',
    accountLookups[0]?.startsWith('/v1/auth/account?userId='),
  );
}

console.log('\n=== malformed tokens fail closed without touching the brain ===');
{
  for (const [label, token] of [
    ['empty', ''],
    ['single segment', 'abc'],
    ['three segments', 'a.b.c'],
    [
      'non-uuid subject',
      `${Buffer.from(JSON.stringify({ sub: 'not-a-uuid', username: 'x' })).toString('base64url')}.sig`,
    ],
    [
      'nil-uuid subject',
      `${Buffer.from(JSON.stringify({ sub: '00000000-0000-0000-0000-000000000000', username: 'x' })).toString('base64url')}.sig`,
    ],
    ['non-json payload', `${Buffer.from('not json').toString('base64url')}.sig`],
    ['null sub', `${Buffer.from(JSON.stringify({ sub: null })).toString('base64url')}.sig`],
    ['array sub', `${Buffer.from(JSON.stringify({ sub: ['a'] })).toString('base64url')}.sig`],
  ]) {
    accountLookups = [];
    const s = await readBoundSession(cookie(token));
    check(
      `${label} rejected without a brain call`,
      s === undefined && accountLookups.length === 0,
      `lookups=${accountLookups.length}`,
    );
  }
}

console.log('\n=== unknown subject is not an oracle ===');
{
  accountLookups = [];
  const ghost = '77777777-2222-4333-8444-555555555555';
  const key = fingerprintSessionSecret(BASE, { ...VICTIM, userId: ghost });
  const forged = createSessionToken(
    { sub: ghost, username: 'ghost' },
    { secret: key, ttlSeconds: 900 },
  );
  const s = await readBoundSession(cookie(forged));
  check('token for a non-existent account is rejected', s === undefined);
}

console.log('\n=== username binding ===');
{
  // Correct fingerprint and subject, but a username the account does not have.
  const key = fingerprintSessionSecret(BASE, VICTIM);
  const forged = createSessionToken(
    { sub: VICTIM.userId, username: 'someone-else' },
    { secret: key, ttlSeconds: 900 },
  );
  const s = await readBoundSession(cookie(forged));
  check('mismatched username is rejected', s === undefined);
}

console.log('\n=== v2 (pre-split) scheme tokens must not verify ===');
{
  const { createHmac } = await import('node:crypto');
  // The retired v2 derivation bound the key to the raw password record under a
  // different MAC label.
  const v2Key = createHmac('sha256', BASE)
    .update('stock-insight:credential-session:v2\0', 'utf8')
    .update('local', 'utf8')
    .update('\0', 'utf8')
    .update(VICTIM.userId, 'utf8')
    .update('\0', 'utf8')
    .update(VICTIM.username, 'utf8')
    .update('\0', 'utf8')
    .update('scrypt$v=1$N=16384$r=8$p=1$AAAA$BBBB', 'utf8')
    .digest();
  const legacy = createSessionToken(
    { sub: VICTIM.userId, username: VICTIM.username },
    { secret: v2Key, ttlSeconds: 900 },
  );
  const s = await readBoundSession(cookie(legacy));
  check('a v2-derived session token is rejected under v3', s === undefined);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
