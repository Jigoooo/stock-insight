// P1 live route smoke: boots the real Nest app in-process against the live
// research_app database and asserts every NEW route registers, enforces its
// scope kind, and answers with the expected envelope. Run with:
//   node apps/api-server/scripts/p1-route-smoke.mjs
import { createApp, signAnonymousInternalContext, signInternalUserContext } from '../dist/index.js';

const SECRET = process.env.SMOKE_INTERNAL_SECRET ?? 'x'.repeat(48);
const USER_ID = process.env.SMOKE_USER_ID ?? '';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function userHeader(method, path) {
  return signInternalUserContext(Buffer.from(SECRET, 'utf8'), {
    userId: USER_ID,
    method,
    path,
    now: nowSeconds(),
    ttlSeconds: 60,
  });
}

function anonHeader(method, path) {
  return signAnonymousInternalContext(Buffer.from(SECRET, 'utf8'), {
    method,
    path,
    now: nowSeconds(),
    ttlSeconds: 60,
  });
}

const results = [];
function record(name, actual, expected) {
  const pass = actual === expected;
  results.push({ name, actual, expected, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  got=${actual} want=${expected}`);
}

const app = await createApp({ internalContextSecret: SECRET });
await app.init();
const server = app.getHttpAdapter().getInstance();

async function call(method, path, { scope = 'user', body, header } = {}) {
  const pathOnly = path.split('?')[0];
  const headers = { 'content-type': 'application/json' };
  const token =
    header ??
    (scope === 'anon'
      ? anonHeader(method, pathOnly)
      : scope === 'none'
        ? undefined
        : userHeader(method, pathOnly));
  if (token) headers['x-internal-user-context'] = token;
  const response = await server.inject({ method, url: path, headers, payload: body });
  return response;
}

// --- new gap routes: registered and scope-enforced ---
record(
  'geo/snapshot missing temporal → 400',
  (await call('GET', '/v1/geo/snapshot')).statusCode,
  400,
);
record(
  'geo/tiles missing temporal → 400',
  (await call('GET', '/v1/geo/tiles/1/2/3?snapshot=abc')).statusCode,
  400,
);
record(
  'crypto/workspace unknown query key → 400',
  (await call('GET', '/v1/crypto/workspace?bogus=1')).statusCode,
  400,
);
record(
  'crypto/workspace bad limit → 400',
  (await call('GET', '/v1/crypto/workspace?limit=999')).statusCode,
  400,
);

// --- scope containment: anonymous token must NOT reach data routes ---
record(
  'anon token on /v1/stocks → 401',
  (await call('GET', '/v1/stocks', { scope: 'anon' })).statusCode,
  401,
);
record(
  'anon token on /v1/personal/feed → 401',
  (await call('GET', '/v1/personal/feed', { scope: 'anon' })).statusCode,
  401,
);
record(
  'anon token on /v1/geo/snapshot → 401',
  (
    await call(
      'GET',
      '/v1/geo/snapshot?knownAt=2026-01-01T00:00:00Z&validAt=2026-01-01T00:00:00Z',
      {
        scope: 'anon',
      },
    )
  ).statusCode,
  401,
);
record(
  'anon token on /v1/auth/invitations → 401',
  (await call('GET', '/v1/auth/invitations', { scope: 'anon' })).statusCode,
  401,
);

// --- scope containment: user token must NOT reach pre-auth routes ---
record(
  'user token on /v1/auth/authenticate → 401',
  (
    await call('POST', '/v1/auth/authenticate', {
      scope: 'user',
      body: JSON.stringify({ username: 'x', password: 'y' }),
    })
  ).statusCode,
  401,
);
record(
  'user token on /v1/auth/enroll → 401',
  (
    await call('POST', '/v1/auth/enroll', {
      scope: 'user',
      body: JSON.stringify({ username: 'abc', password: 'y', enrollmentCode: 'z' }),
    })
  ).statusCode,
  401,
);

// --- no token at all fails closed everywhere ---
record(
  'no token on /v1/auth/authenticate → 401',
  (await call('POST', '/v1/auth/authenticate', { scope: 'none' })).statusCode,
  401,
);
record(
  'no token on /v1/geo/snapshot → 401',
  (await call('GET', '/v1/geo/snapshot', { scope: 'none' })).statusCode,
  401,
);

// --- auth: real credential rejection through the full HTTP path ---
const badLogin = await call('POST', '/v1/auth/authenticate', {
  scope: 'anon',
  body: JSON.stringify({ username: 'definitely-not-a-user', password: 'nope' }),
});
record('anon login with unknown user → 200 rejected', badLogin.statusCode, 200);
record('anon login body is rejected', JSON.parse(badLogin.body).status, 'rejected');
record(
  'anon login body carries no credential material',
  /scrypt\$|password_record/.test(badLogin.body),
  false,
);

const lookupPath = `/v1/auth/account?userId=00000000-0000-4000-8000-000000000000`;
const missingAccount = await call('GET', lookupPath, { scope: 'anon' });
record('anon account lookup unknown id → 200', missingAccount.statusCode, 200);
record(
  'anon account lookup body is not_found',
  JSON.parse(missingAccount.body).status,
  'not_found',
);

// --- liveness stays public ---
record(
  'health without token → 200',
  (await call('GET', '/health', { scope: 'none' })).statusCode,
  200,
);
record(
  'v1/meta without token → 200',
  (await call('GET', '/v1/meta', { scope: 'none' })).statusCode,
  200,
);

await app.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
