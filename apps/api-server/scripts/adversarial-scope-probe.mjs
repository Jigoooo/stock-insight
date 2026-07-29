// Adversarial probe for the P1-P3 brain split.
//
// Attacks the security contracts the split claims, against the REAL Nest app
// booted in-process. Read-only: no container, no live service is touched.
import { createApp } from '../dist/index.js';
import {
  signAnonymousInternalContext,
  signInternalUserContext,
} from '@stock-insight/contracts/internal-context';

const SECRET = 'x'.repeat(48);
const KEY = Buffer.from(SECRET, 'utf8');
const USER_A = '11111111-2222-4333-8444-555555555555';
const USER_B = '99999999-2222-4333-8444-555555555555';
const now = () => Math.floor(Date.now() / 1000);

const app = await createApp({ internalContextSecret: SECRET });
await app.init();
const srv = app.getHttpAdapter().getInstance();

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${actual} want=${expected}`);
}

async function call(method, url, token, payload) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-internal-user-context'] = token;
  return srv.inject({ method, url, headers, payload });
}

const userTok = (m, p, uid = USER_A, ttl = 60) =>
  signInternalUserContext(KEY, { userId: uid, method: m, path: p, now: now(), ttlSeconds: ttl });
const anonTok = (m, p, ttl = 60) =>
  signAnonymousInternalContext(KEY, { method: m, path: p, now: now(), ttlSeconds: ttl });

console.log('=== A. cross-scope containment ===');
check('anon token cannot read user data',
  (await call('GET', '/v1/stocks', anonTok('GET', '/v1/stocks'))).statusCode, 401);
check('user token cannot hit pre-auth login',
  (await call('POST', '/v1/auth/authenticate', userTok('POST', '/v1/auth/authenticate'),
    JSON.stringify({ username: 'a', password: 'b' }))).statusCode, 401);
check('user token cannot hit pre-auth account lookup',
  (await call('GET', '/v1/auth/account?userId=' + USER_A, userTok('GET', '/v1/auth/account'))).statusCode, 401);
check('anon token cannot list invitations',
  (await call('GET', '/v1/auth/invitations', anonTok('GET', '/v1/auth/invitations'))).statusCode, 401);

console.log('\n=== B. MAC domain forgery ===');
{
  const [, iat, exp, mac] = userTok('POST', '/v1/auth/authenticate').split('.');
  check('user MAC replayed under anon subject',
    (await call('POST', '/v1/auth/authenticate', `anon.${iat}.${exp}.${mac}`,
      JSON.stringify({ username: 'a', password: 'b' }))).statusCode, 401);
}
{
  const [, iat, exp, mac] = anonTok('GET', '/v1/stocks').split('.');
  check('anon MAC replayed under uuid subject',
    (await call('GET', '/v1/stocks', `${USER_A}.${iat}.${exp}.${mac}`)).statusCode, 401);
}

console.log('\n=== C. replay / binding ===');
check('token bound to another path is rejected',
  (await call('GET', '/v1/dashboard/today', userTok('GET', '/v1/stocks'))).statusCode, 401);
check('token bound to another method is rejected',
  (await call('GET', '/v1/stocks', userTok('POST', '/v1/stocks'))).statusCode, 401);
{
  const stale = signInternalUserContext(KEY, {
    userId: USER_A, method: 'GET', path: '/v1/stocks', now: now() - 120, ttlSeconds: 60,
  });
  check('expired token is rejected', (await call('GET', '/v1/stocks', stale)).statusCode, 401);
}
{
  const foreign = signInternalUserContext(Buffer.alloc(48, 9), {
    userId: USER_A, method: 'GET', path: '/v1/stocks', now: now(), ttlSeconds: 60,
  });
  check('foreign-secret token is rejected', (await call('GET', '/v1/stocks', foreign)).statusCode, 401);
}
check('no token at all is rejected', (await call('GET', '/v1/stocks', undefined)).statusCode, 401);

console.log('\n=== D. TTL ceiling (MAX_TTL_SECONDS) ===');
try {
  signInternalUserContext(KEY, {
    userId: USER_A, method: 'GET', path: '/v1/stocks', now: now(), ttlSeconds: 86_400,
  });
  check('signing a 24h TTL must throw', 'no-throw', 'throw');
} catch {
  check('signing a 24h TTL must throw', 'throw', 'throw');
}

console.log('\n=== E. query string is not part of the MAC ===');
check('query string does not break path binding',
  (await call('GET', '/v1/stocks?market=KR', userTok('GET', '/v1/stocks'))).statusCode, 200);

console.log('\n=== F. scope isolation between two users ===');
{
  const r = await call('GET', '/v1/me/bootstrap', userTok('GET', '/v1/me/bootstrap', USER_B));
  check('a different user id still authenticates (own scope)', r.statusCode, 200);
}

console.log('\n=== G. auth responses never carry credential material ===');
{
  const r = await call('POST', '/v1/auth/authenticate', anonTok('POST', '/v1/auth/authenticate'),
    JSON.stringify({ username: 'definitely-not-real', password: 'nope' }));
  check('login rejection is 200', r.statusCode, 200);
  check('no scrypt record in body', /scrypt\$|password_record/.test(r.body), false);
  check('no fingerprint leaked on rejection', /credentialFingerprint/.test(r.body), false);
}

console.log('\n=== H. liveness stays open, data does not ===');
check('/health open', (await call('GET', '/health', undefined)).statusCode, 200);
check('/v1/meta open', (await call('GET', '/v1/meta', undefined)).statusCode, 200);

await app.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
