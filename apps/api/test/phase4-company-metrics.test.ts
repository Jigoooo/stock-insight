import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyPhase4CompanyMetricsPlan,
  buildPhase4CompanyMetricsPlan,
  PHASE4_MARKET_SNAPSHOT_ROWS_SQL,
  summarizePhase4CompanyMetricsAudit,
  type Phase4MarketSnapshotRow,
  type Phase4WriteExecutor,
} from '../src/backfill/phase4.ts';

const rows: Phase4MarketSnapshotRow[] = [
  {
    entity_key: 'US:NVDA',
    symbol: 'NVDA',
    market: 'US',
    name: 'NVIDIA',
    source: 'yfinance',
    currency: 'USD',
    latest_price: '196.52',
    change_pct: '0.87',
    payload_json:
      '{"last":196.52,"prev":194.83,"ma20":202.38,"ma50":209.68,"rsi14":41.9,"vol":51535676,"pct_from_ma20":-2.9}',
    captured_at: '2026-07-06T00:00:00.000Z',
  },
  {
    entity_key: 'KR:^KS11',
    symbol: '^KS11',
    market: 'KR',
    name: 'KOSPI proxy',
    source: 'yfinance',
    currency: null,
    latest_price: '8051.33',
    change_pct: '-0.45',
    payload_json: '{"last_close":8051.33,"prev_close":8088.33}',
    captured_at: '2026-07-06T00:00:00.000Z',
  },
  {
    entity_key: 'US:BROKEN',
    symbol: 'BROKEN',
    market: 'US',
    name: 'Broken Inc.',
    source: 'yfinance',
    currency: 'USD',
    latest_price: '-1',
    change_pct: '0.1',
    payload_json: '{"last":-1,"rsi14":140}',
    captured_at: '2026-07-06T00:00:00.000Z',
  },
];

describe('Phase 4 company metrics backfill planner', () => {
  it('selects latest source-backed market snapshots with read-only SQL', () => {
    assert.match(PHASE4_MARKET_SNAPSHOT_ROWS_SQL, /stock\.market_snapshots/i);
    assert.match(PHASE4_MARKET_SNAPSHOT_ROWS_SQL, /public\.entities/i);
    assert.match(PHASE4_MARKET_SNAPSHOT_ROWS_SQL, /DISTINCT ON/i);
    assert.doesNotMatch(
      PHASE4_MARKET_SNAPSHOT_ROWS_SQL,
      /\b(insert|update|drop|truncate|delete|alter\s+table)\b/i,
    );
  });

  it('builds only source-backed, currency-backed market snapshot metric groups', () => {
    const plan = buildPhase4CompanyMetricsPlan(rows);

    assert.equal(plan.sourceRows, 3);
    assert.equal(plan.eligibleRows, 1);
    assert.equal(plan.metricGroups.length, 1);
    assert.deepEqual(plan.metricGroups[0], {
      entityKey: 'US:NVDA',
      metricGroup: 'market_snapshot',
      fiscalYear: 0,
      fiscalPeriod: 'latest',
      currency: 'USD',
      availability: 'available',
      reportedAt: '2026-07-06T00:00:00.000Z',
      sources: [{ label: 'Yahoo Finance', url: 'https://finance.yahoo.com/quote/NVDA' }],
      metrics: [
        { key: 'latestPrice', label: '현재가', value: 196.52, unit: 'currency' },
        { key: 'changePct', label: '등락률', value: 0.87, unit: 'percent' },
        { key: 'ma20', label: '20일 이동평균', value: 202.38, unit: 'currency' },
        { key: 'ma50', label: '50일 이동평균', value: 209.68, unit: 'currency' },
        { key: 'rsi14', label: 'RSI(14)', value: 41.9, unit: 'score' },
        { key: 'volume', label: '거래량', value: 51535676, unit: 'shares' },
        { key: 'pctFromMa20', label: '20일선 대비', value: -2.9, unit: 'percent' },
      ],
    });
  });

  it('summarizes skipped rows without pretending missing-currency values are available', () => {
    const audit = summarizePhase4CompanyMetricsAudit(buildPhase4CompanyMetricsPlan(rows));

    assert.equal(audit.marketSnapshotRows, 3);
    assert.equal(audit.metricGroups, 1);
    assert.equal(audit.availableMetricGroups, 1);
    assert.equal(audit.skippedRows, 2);
    assert.deepEqual(audit.warnings, [
      '2 market snapshot row(s) were skipped because source/currency/range checks failed.',
    ]);
  });

  it('upserts metric groups idempotently and records migration_runs audit without destructive SQL', async () => {
    const plan = buildPhase4CompanyMetricsPlan(rows);
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: Phase4WriteExecutor = {
      async execute(sql, params = []) {
        calls.push({ sql, params });
        return { rowCount: 1 };
      },
    };

    const result = await applyPhase4CompanyMetricsPlan(plan, executor, {
      runId: 'phase4-test-run',
      jobName: 'stock-insight-phase4-company-metrics',
      startedAt: new Date('2026-07-06T00:00:00.000Z'),
      finishedAt: new Date('2026-07-06T00:00:01.000Z'),
    });

    assert.equal(result.audit.rowsRead, 3);
    assert.equal(result.audit.rowsWritten, 1);
    assert.equal(result.audit.rowsSkipped, 2);
    assert.equal(calls.length, 2);
    assert.match(calls[0]?.sql ?? '', /insert into public\.company_financials/i);
    assert.match(
      calls[0]?.sql ?? '',
      /on conflict \(entity_key, fiscal_year, fiscal_period, metric_group\) do update/i,
    );
    assert.match(calls[1]?.sql ?? '', /insert into public\.migration_runs/i);
    for (const call of calls) {
      assert.doesNotMatch(call.sql, /\b(drop|truncate|delete|alter\s+table\s+\S+\s+rename)\b/i);
    }
  });
});
