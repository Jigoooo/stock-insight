#!/usr/bin/env node
// Golden parity diff: legacy Nitro /api/* vs new NestJS /v1/*.
// Both servers run against the SAME database and SAME STOCK_INSIGHT_USER_ID.
// Auth note: the legacy server enforces cookie auth on /api/*; pass GOLDEN_COOKIE
// with a valid session cookie for the legacy server. The new server has no auth
// yet (P2 scope: read parity; auth port comes later with cutover).
//
// Usage:
//   GOLDEN_LEGACY=http://127.0.0.1:6123 GOLDEN_NEST=http://127.0.0.1:6200 \
//   GOLDEN_COOKIE='si_session=...' node scripts/golden-diff.mjs

const legacyBase = process.env.GOLDEN_LEGACY ?? 'http://127.0.0.1:6123';
const nestBase = process.env.GOLDEN_NEST ?? 'http://127.0.0.1:6200';
const cookie = process.env.GOLDEN_COOKIE ?? '';

const CASES = [
  { name: 'dashboard-today', legacy: '/api/dashboard/today', nest: '/v1/dashboard/today' },
  { name: 'me-bootstrap', legacy: '/api/me/bootstrap', nest: '/v1/me/bootstrap' },
  { name: 'portfolio-digest', legacy: '/api/portfolio/digest', nest: '/v1/portfolio/digest' },
  { name: 'stocks-all', legacy: '/api/stocks', nest: '/v1/stocks' },
  {
    name: 'stocks-kr-samsung',
    legacy: '/api/stocks?market=KR&scope=all&q=%EC%82%BC%EC%84%B1',
    nest: '/v1/stocks?market=KR&scope=all&q=%EC%82%BC%EC%84%B1',
  },
  {
    name: 'stocks-invalid-market-dropped',
    legacy: '/api/stocks?market=JP&scope=nope',
    nest: '/v1/stocks?market=JP&scope=nope',
  },
  { name: 'stock-detail-kr', legacy: '/api/stocks/KR%3A005930', nest: '/v1/stocks/KR%3A005930' },
  { name: 'stock-detail-us', legacy: '/api/stocks/US%3AAAPL', nest: '/v1/stocks/US%3AAAPL' },
  {
    name: 'stock-detail-missing',
    legacy: '/api/stocks/KR%3A000000',
    nest: '/v1/stocks/KR%3A000000',
  },
  { name: 'market-news', legacy: '/api/market-news?type=all', nest: '/v1/market-news?type=all' },
  {
    name: 'market-news-kr',
    legacy: '/api/market-news?market=KR&type=all',
    nest: '/v1/market-news?market=KR&type=all',
  },
  {
    name: 'discover-kr',
    legacy: '/api/discover/stocks?market=KR&reason=all',
    nest: '/v1/discover/stocks?market=KR&reason=all',
  },
  { name: 'workspace', legacy: '/api/workspace', nest: '/v1/workspace' },
  { name: 'status', legacy: '/api/status', nest: '/v1/status' },
  { name: 'themes', legacy: '/api/themes', nest: '/v1/themes' },
  { name: 'my-research', legacy: '/api/my-research', nest: '/v1/my-research' },
  { name: 'feed-default', legacy: '/api/feed', nest: '/v1/feed' },
  {
    name: 'feed-must-know',
    legacy: '/api/feed?lane=must_know&limit=10',
    nest: '/v1/feed?lane=must_know&limit=10',
  },
  {
    name: 'feed-invalid-lane-400',
    legacy: '/api/feed?lane=nope',
    nest: '/v1/feed?lane=nope',
    expectStatus: 400,
  },
  { name: 'radar-default', legacy: '/api/radar', nest: '/v1/radar' },
  {
    name: 'radar-invalid-limit-400',
    legacy: '/api/radar?limit=999',
    nest: '/v1/radar?limit=999',
    expectStatus: 400,
  },
  { name: 'history-default', legacy: '/api/history', nest: '/v1/history' },
  {
    name: 'history-invalid-limit-400',
    legacy: '/api/history?limit=0',
    nest: '/v1/history?limit=0',
    expectStatus: 400,
  },
  {
    // NOTE: whitespace-only key (%20) is NOT a valid parity case: the legacy
    // TanStack router misses the route entirely and serves the SPA 404 HTML
    // page. The in-handler invalid_record_key branch is exercised by >320 chars.
    name: 'record-key-too-long-400',
    legacy: `/api/records/${'a'.repeat(321)}`,
    nest: `/v1/records/${'a'.repeat(321)}`,
    expectStatus: 400,
  },
  {
    name: 'record-not-found-404',
    legacy: '/api/records/no-such-record-key',
    nest: '/v1/records/no-such-record-key',
    expectStatus: 404,
  },
  {
    // Regression (T2 review follow-up): decoded >1024 chars must reach the
    // handler and return 400 (not a router-level 414).
    name: 'record-key-degenerate-2000-400',
    legacy: `/api/records/${'a'.repeat(2000)}`,
    nest: `/v1/records/${'a'.repeat(2000)}`,
    expectStatus: 400,
  },
  {
    // Regression: multi-byte key ≤320 decoded chars but >1024 encoded bytes
    // must pass the router and hit handler validation (404 not_found here).
    name: 'record-key-korean-multibyte-404',
    legacy: `/api/records/${encodeURIComponent('한'.repeat(150))}`,
    nest: `/v1/records/${encodeURIComponent('한'.repeat(150))}`,
    expectStatus: 404,
  },
  {
    name: 'relations-invalid-400',
    legacy: '/api/entities/BAD/relations',
    nest: '/v1/entities/BAD/relations',
    expectStatus: 400,
  },
];

// Volatile fields that legitimately differ run-to-run (timestamps computed at read time).
const VOLATILE_KEYS = new Set(['checkedAt', 'generatedAt', 'asOf', 'refreshedAt', 'nowMs']);

function stableSort(value) {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = VOLATILE_KEYS.has(key) ? '<volatile>' : stableSort(value[key]);
    }
    return out;
  }
  return value;
}

async function fetchJson(base, path, withCookie) {
  const headers = withCookie && cookie ? { cookie } : {};
  const res = await fetch(`${base}${path}`, { headers });
  let body;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = { __nonJson: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

let pass = 0;
let fail = 0;
const failures = [];

for (const testCase of CASES) {
  const [legacy, nest] = await Promise.all([
    fetchJson(legacyBase, testCase.legacy, true),
    fetchJson(nestBase, testCase.nest, false),
  ]);

  const statusMatch = legacy.status === nest.status;
  const expectedStatusOk =
    testCase.expectStatus === undefined ||
    (legacy.status === testCase.expectStatus && nest.status === testCase.expectStatus);
  const legacyNorm = JSON.stringify(stableSort(legacy.body));
  const nestNorm = JSON.stringify(stableSort(nest.body));
  const bodyMatch = legacyNorm === nestNorm;

  if (statusMatch && bodyMatch && expectedStatusOk) {
    pass += 1;
    console.log(`PASS ${testCase.name} (status ${legacy.status})`);
  } else {
    fail += 1;
    const detail = {
      name: testCase.name,
      legacyStatus: legacy.status,
      nestStatus: nest.status,
      expectStatus: testCase.expectStatus,
      bodyMatch,
    };
    if (!bodyMatch) {
      // Find first divergence for debuggability.
      let i = 0;
      const max = Math.min(legacyNorm.length, nestNorm.length);
      while (i < max && legacyNorm[i] === nestNorm[i]) i += 1;
      detail.firstDivergence = {
        at: i,
        legacy: legacyNorm.slice(Math.max(0, i - 60), i + 120),
        nest: nestNorm.slice(Math.max(0, i - 60), i + 120),
      };
    }
    failures.push(detail);
    console.log(`FAIL ${testCase.name} legacy=${legacy.status} nest=${nest.status}`);
  }
}

console.log(`\n=== golden diff summary: ${pass} pass / ${fail} fail (${CASES.length} cases) ===`);
if (failures.length > 0) {
  console.log(JSON.stringify(failures, null, 2));
  process.exit(1);
}
