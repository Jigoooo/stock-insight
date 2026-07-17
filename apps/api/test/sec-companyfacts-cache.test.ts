import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySecMomentumSeeds,
  buildSecMomentumSeeds,
} from '../src/backfill/sec-companyfacts-cache.ts';

const snapshot = {
  source: 'sec_companyfacts',
  generated_at_kst: '2026-07-17T21:31:57+09:00',
  n_universe: 2,
  n_collected: 1,
  companies: [
    {
      ticker: 'AAPL',
      cik: 320193,
      entity: 'Apple Inc.',
      revenue_yoy_pct: 16.6,
      revenue_yoy_prev_pct: 15.65,
      revenue_accel_pct: 0.95,
      net_income_yoy_pct: 19.36,
      gross_margin_pct: 49.27,
      latest_period: '2026-03-28',
      latest_form: '10-Q',
      latest_revenue_usd: 111_184_000_000,
    },
  ],
  errors: [{ ticker: 'XOM', reason: 'fetch failed' }],
};

test('builds a provenance-preserving SEC momentum metric group from cache', () => {
  const seeds = buildSecMomentumSeeds(snapshot);
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0]?.entityKey, 'US:AAPL');
  assert.equal(seeds[0]?.metricGroup, 'sec_companyfacts_momentum');
  assert.equal(seeds[0]?.fiscalYear, 2026);
  assert.equal(seeds[0]?.metrics.length, 6);
  assert.match(seeds[0]?.sources[0]?.url ?? '', /CIK0000320193\.json$/);
});

test('rejects snapshots without explicit SEC companyfacts provenance', () => {
  assert.deepEqual(buildSecMomentumSeeds({ ...snapshot, source: 'unknown' }), []);
});

test('upserts cache metrics and records the live 403 fallback in migration audit', async () => {
  const seeds = buildSecMomentumSeeds(snapshot);
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  const result = await applySecMomentumSeeds(
    snapshot,
    seeds,
    {
      async execute(sql, params = []) {
        calls.push({ sql, params });
        return { rowCount: 1 };
      },
    },
    {
      runId: 'sec-cache-test',
      jobName: 'sec-cache',
      startedAt: new Date('2026-07-18T00:00:00Z'),
      finishedAt: new Date('2026-07-18T00:00:01Z'),
      liveError: 'SEC request failed: HTTP 403',
    },
  );
  assert.deepEqual(result, { rowsWritten: 1, rowsSkipped: 0 });
  assert.equal(calls.length, 2);
  assert.match(calls[0]?.sql ?? '', /company_financials/i);
  assert.equal(calls[0]?.params[3], 'sec_companyfacts_momentum');
  assert.match(String(calls[1]?.params[7] ?? ''), /HTTP 403/);
});
