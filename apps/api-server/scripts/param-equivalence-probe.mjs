// Param-handling equivalence probe.
//
// The web routes dropped their local normalization (searchParams.getAll +
// normalizeProduct*Param, discoverStocksQuerySchema) and now forward raw values
// to the brain. This asserts the brain actually re-validates each one, so no
// validation was lost in the move.
import { createApp } from '../dist/index.js';
import { signInternalUserContext } from '@stock-insight/contracts/internal-context';

const SECRET = 'x'.repeat(48);
const KEY = Buffer.from(SECRET, 'utf8');
const USER = process.env.PROBE_USER_ID ?? '11111111-2222-4333-8444-555555555555';

const app = await createApp({ internalContextSecret: SECRET });
await app.init();
const srv = app.getHttpAdapter().getInstance();

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) pass += 1;
  else fail += 1;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
}

// Responses embed generatedAt/checkedAt timestamps, so raw body equality gives
// false negatives. Compare with volatile fields stripped.
function stable(body) {
  return body.replace(/"(generatedAt|checkedAt|asOf)":"[^"]*"/g, '"$1":"<t>"');
}

async function get(url) {
  const path = url.split('?')[0];
  const token = signInternalUserContext(KEY, {
    userId: USER,
    method: 'GET',
    path,
    now: Math.floor(Date.now() / 1000),
    ttlSeconds: 60,
  });
  return srv.inject({ method: 'GET', url, headers: { 'x-internal-user-context': token } });
}

// 1. Hostile limit values must never reach the query layer unclamped.
console.log('=== limit normalization (was normalizeProductLimitParam in the BFF) ===');
for (const [label, q] of [
  ['non-numeric', 'limit=abc'],
  ['negative', 'limit=-5'],
  ['zero', 'limit=0'],
  ['huge', 'limit=999999999'],
  ['float', 'limit=1.5'],
  ['sql-ish', 'limit=1;DROP TABLE x'],
  ['empty', 'limit='],
]) {
  const r = await get(`/v1/features?${q}`);
  check(`limit ${label} handled (${q})`, r.statusCode === 200, `-> ${r.statusCode}`);
}

// 2. Repeated params: the BFF used getAll()[0]; the brain must take the same one.
console.log('\n=== repeated params take the FIRST value (getAll()[0] parity) ===');
{
  const a = await get('/v1/features?entityKey=US%3AAMZN');
  const b = await get('/v1/features?entityKey=US%3AAMZN&entityKey=US%3ANVDA');
  check('duplicate entityKey matches single first value', stable(a.body) === stable(b.body));
}

// 3. Whitespace-only text params must normalize to "absent", not to a literal.
console.log('\n=== text param trimming ===');
{
  const blank = await get('/v1/features?entityKey=%20%20');
  const absent = await get('/v1/features');
  check('whitespace-only entityKey == omitted', stable(blank.body) === stable(absent.body));
}

// 4. discover/stocks lost discoverStocksQuerySchema in the BFF.
console.log('\n=== discover/stocks (was discoverStocksQuerySchema in the BFF) ===');
for (const [label, q] of [
  ['bogus market', 'market=NOPE'],
  ['bogus limit', 'limit=abc'],
  ['negative limit', 'limit=-1'],
  ['huge limit', 'limit=100000'],
  ['unknown key', 'wat=1'],
]) {
  const r = await get(`/v1/discover/stocks?${q}`);
  check(
    `discover ${label} fails closed or normalizes (${q})`,
    [200, 400].includes(r.statusCode),
    `-> ${r.statusCode}`,
  );
}

// 5. Path-parameter injection must not escape the route.
console.log('\n=== path param injection ===');
for (const [label, key] of [
  ['traversal', '..%2F..%2Fhealth'],
  ['encoded slash', 'US%2FAMZN'],
  ['null byte', 'US%00AMZN'],
]) {
  const r = await get(`/v1/stocks/${key}`);
  check(`stock detail ${label} contained`, r.statusCode !== 500, `-> ${r.statusCode}`);
}

await app.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
