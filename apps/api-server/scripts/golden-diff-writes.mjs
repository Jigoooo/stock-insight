#!/usr/bin/env node
// Write-path golden parity: legacy Nitro /api/* vs NestJS /v1/*.
// Isolation: BOTH servers must be started with STOCK_INSIGHT_USER_ID set to the
// dedicated TEST user (never the production user). This script seeds that test
// user, runs the identical mutation scenario against each server with fresh
// idempotency keys, normalizes volatile fields, and diffs the transcripts.
// Cleanup deletes the test user (FK CASCADE clears watchlist/positions) and its
// idempotency rows.
//
// Env: DATABASE_URL, TEST_USER_ID, GOLDEN_LEGACY, GOLDEN_NEST, GOLDEN_COOKIE
import { randomUUID } from 'node:crypto';

import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const testUserId = process.env.TEST_USER_ID;
const legacyBase = process.env.GOLDEN_LEGACY ?? 'http://127.0.0.1:6123';
const nestBase = process.env.GOLDEN_NEST ?? 'http://127.0.0.1:6200';
const cookie = process.env.GOLDEN_COOKIE ?? '';
if (!databaseUrl || !testUserId) {
  console.error('DATABASE_URL and TEST_USER_ID are required');
  process.exit(1);
}

const VOLATILE_KEYS = new Set(['generatedAt', 'addedAt', 'openedAt', 'checkedAt', 'asOf']);

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

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

async function resetTestUser() {
  await pool.query(`DELETE FROM public.app_mutation_idempotency WHERE user_id = $1::uuid`, [
    testUserId,
  ]);
  await pool.query(`DELETE FROM public.app_users WHERE id = $1::uuid`, [testUserId]);
  await pool.query(
    `INSERT INTO public.app_users (id, external_ref, display_name, channel_type)
     VALUES ($1::uuid, 'golden-write-parity-test', '쓰기 파리티 테스트', 'test')`,
    [testUserId],
  );
}

async function cleanupTestUser() {
  await pool.query(`DELETE FROM public.app_mutation_idempotency WHERE user_id = $1::uuid`, [
    testUserId,
  ]);
  await pool.query(`DELETE FROM public.app_users WHERE id = $1::uuid`, [testUserId]);
}

async function call(base, method, path, { body, idemKey, withCookie, origin } = {}) {
  const headers = {};
  // Mirror @stock-insight/api-client: content-type only when a JSON body is sent.
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (withCookie && cookie) headers.cookie = cookie;
  // Legacy CSRF middleware requires a same-origin Origin header on non-GET.
  if (origin) headers.origin = origin;
  if (idemKey !== undefined) headers['idempotency-key'] = idemKey;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    // Capture the ORIGINAL status (legacy h3 emits 307 for some malformed
    // paths); auto-follow would hide it behind the redirect target's response.
    redirect: 'manual',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { __nonJson: text.slice(0, 160) };
  }
  return {
    status: res.status,
    replayed: res.headers.get('idempotency-replayed'),
    body: parsed,
  };
}

// The scenario runs with per-run fresh idempotency keys; steps are pure
// functions of the key map so both servers execute identical logic.
function buildScenario(k) {
  return [
    ['watchlist-upsert-no-key', 'POST', '/watchlist', { body: { market: 'KR', ticker: '005930' } }],
    [
      'watchlist-upsert-bad-key',
      'POST',
      '/watchlist',
      { body: { market: 'KR', ticker: '005930' }, idemKey: 'not-a-uuid' },
    ],
    [
      'watchlist-upsert-invalid-body',
      'POST',
      '/watchlist',
      { body: { market: 'KR' }, idemKey: k.k1 },
    ],
    [
      'watchlist-upsert-ok',
      'POST',
      '/watchlist',
      { body: { market: 'KR', ticker: '005930', displayName: '삼성전자' }, idemKey: k.k1 },
    ],
    [
      'watchlist-upsert-replay',
      'POST',
      '/watchlist',
      { body: { market: 'KR', ticker: '005930', displayName: '삼성전자' }, idemKey: k.k1 },
    ],
    [
      'watchlist-upsert-conflict',
      'POST',
      '/watchlist',
      { body: { market: 'US', ticker: 'AAPL' }, idemKey: k.k1 },
    ],
    [
      'position-upsert-ok',
      'POST',
      '/positions',
      {
        body: { market: 'US', ticker: 'AAPL', avgPrice: 190.5, quantity: 2 },
        idemKey: k.k2,
      },
    ],
    ['watchlist-remove-ok', 'DELETE', '/watchlist/KR%3A005930', { idemKey: k.k3 }],
    ['position-close-ok', 'DELETE', '/positions/US%3AAAPL', { idemKey: k.k4 }],
    [
      // KNOWN DIVERGENCE (documented, intentional): legacy's h3 router answers
      // /watchlist/%20 with a 307 redirect (route-normalization artifact) — its
      // handler's `entityKey가 필요합니다` 400 branch is unreachable via URL.
      // The NestJS port keeps the handler-level 400 (the legacy CODE contract).
      'watchlist-remove-blank-key',
      'DELETE',
      '/watchlist/%20',
      { idemKey: k.k5, expect: { legacy: 307, nest: 400 } },
    ],
    ['position-close-missing-entity', 'DELETE', '/positions/US%3AZZZZTEST', { idemKey: k.k6 }],
  ];
}

async function runScenario(base, prefix, withCookie, origin) {
  const keys = {
    k1: randomUUID(),
    k2: randomUUID(),
    k3: randomUUID(),
    k4: randomUUID(),
    k5: randomUUID(),
    k6: randomUUID(),
  };
  await resetTestUser();
  const transcript = [];
  for (const [name, method, path, options] of buildScenario(keys)) {
    const result = await call(base, method, `${prefix}${path}`, {
      ...options,
      withCookie,
      origin,
    });
    transcript.push({
      name,
      status: result.status,
      replayed: result.replayed,
      body: stableSort(result.body),
    });
  }
  // Raw-body edge cases (cannot go through buildScenario's JSON body path):
  // malformed JSON with json content-type → legacy parses to undefined → 400
  // MANUAL_PORTFOLIO_BAD_REQUEST envelope. Same for empty body with json header.
  for (const [name, raw] of [
    ['watchlist-upsert-malformed-json', '{not json'],
    ['watchlist-upsert-empty-json-body', ''],
  ]) {
    const headers = { 'content-type': 'application/json', 'idempotency-key': randomUUID() };
    if (withCookie && cookie) headers.cookie = cookie;
    if (origin) headers.origin = origin;
    const res = await fetch(`${base}${prefix}/watchlist`, { method: 'POST', headers, body: raw });
    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { __nonJson: text.slice(0, 160) };
    }
    transcript.push({ name, status: res.status, replayed: null, body: stableSort(parsed) });
  }
  return { keys, transcript };
}

let exitCode = 0;
// Per-case status expectations for documented divergences (see buildScenario).
const scenarioExpectations = new Map([['watchlist-remove-blank-key', { legacy: 307, nest: 400 }]]);
try {
  const legacyRun = await runScenario(legacyBase, '/api', true, legacyBase);
  const nestRun = await runScenario(nestBase, '/v1', false, undefined);

  let pass = 0;
  const failures = [];
  for (let i = 0; i < legacyRun.transcript.length; i += 1) {
    const l = legacyRun.transcript[i];
    const n = nestRun.transcript[i];
    const expected = scenarioExpectations.get(l.name);
    const same = expected
      ? l.status === expected.legacy && n.status === expected.nest
      : l.status === n.status &&
        l.replayed === n.replayed &&
        JSON.stringify(l.body) === JSON.stringify(n.body);
    if (same) {
      pass += 1;
      const suffix = expected ? `, documented divergence ${l.status}/${n.status}` : '';
      console.log(`PASS ${l.name} (status ${l.status}${l.replayed ? ', replayed' : ''}${suffix})`);
    } else {
      failures.push({ legacy: l, nest: n });
      console.log(`FAIL ${l.name} legacy=${l.status} nest=${n.status}`);
    }
  }

  // Cross-server idempotency: a key claimed via the NEST run must replay with
  // the SAME stored response when re-sent to the LEGACY server (shared ledger).
  const crossReplay = await call(legacyBase, 'POST', '/api/watchlist', {
    body: { market: 'KR', ticker: '005930', displayName: '삼성전자' },
    idemKey: nestRun.keys.k1,
    withCookie: true,
    origin: legacyBase,
  });
  const nestOriginal = nestRun.transcript.find((t) => t.name === 'watchlist-upsert-ok');
  const crossOk =
    crossReplay.status === 200 &&
    crossReplay.replayed === 'true' &&
    JSON.stringify(stableSort(crossReplay.body)) === JSON.stringify(nestOriginal.body);
  if (crossOk) {
    pass += 1;
    console.log('PASS cross-server-replay (nest-claimed key replayed by legacy)');
  } else {
    failures.push({ name: 'cross-server-replay', crossReplay: stableSort(crossReplay.body) });
    console.log('FAIL cross-server-replay');
  }

  const total = legacyRun.transcript.length + 1;
  console.log(`\n=== write parity summary: ${pass} pass / ${total - pass} fail (${total}) ===`);
  if (failures.length > 0) {
    console.log(JSON.stringify(failures, null, 2));
    exitCode = 1;
  }
} finally {
  await cleanupTestUser();
  const leftovers = await pool.query(
    `SELECT (SELECT count(*) FROM public.app_users WHERE id = $1::uuid) AS users,
            (SELECT count(*) FROM public.user_watchlist WHERE user_id = $1::uuid) AS watchlist,
            (SELECT count(*) FROM public.user_positions WHERE user_id = $1::uuid) AS positions,
            (SELECT count(*) FROM public.app_mutation_idempotency WHERE user_id = $1::uuid) AS idem`,
    [testUserId],
  );
  console.log('cleanup readback:', JSON.stringify(leftovers.rows[0]));
  await pool.end();
}
process.exit(exitCode);
