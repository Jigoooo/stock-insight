import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applySecEdgarBackfillPlan,
  buildSecEdgarDryRunPlan,
  cik10,
  SEC_APP_SURFACE_US_TICKER_ROWS_SQL,
  secCompanyFactsUrl,
  summarizeSecEdgarDryRunAudit,
  type SecCompanyFacts,
  type SecCompanyTickerIndex,
  type SecTickerEntityRow,
} from '../src/backfill/sec-edgar.ts';

const rows: SecTickerEntityRow[] = [
  { entity_key: 'US:NVDA', symbol: 'NVDA', market: 'US', name: 'NVIDIA Corporation' },
  { entity_key: 'US:FIG', symbol: 'FIG', market: 'US', name: 'Figma, Inc.' },
  { entity_key: 'KR:005930', symbol: '005930', market: 'KR', name: '삼성전자' },
];

const tickerIndex: SecCompanyTickerIndex = {
  '0': { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
  '1': { cik_str: 999999, ticker: 'FIG', title: 'FIGMA INC' },
};

const nvdaFacts: SecCompanyFacts = {
  cik: 1045810,
  entityName: 'NVIDIA CORP',
  facts: {
    'us-gaap': {
      Revenues: {
        units: {
          USD: [
            { val: 1, fy: 2025, fp: 'Q1', form: '10-Q', filed: '2025-05-01', end: '2025-04-30' },
            {
              accn: '0001045810-26-000001',
              val: 130_497_000_000,
              fy: 2026,
              fp: 'FY',
              form: '10-K',
              filed: '2026-02-26',
              end: '2026-01-25',
            },
          ],
        },
      },
      GrossProfit: {
        units: {
          USD: [{ val: 97_858_000_000, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-02-26' }],
        },
      },
      OperatingIncomeLoss: {
        units: {
          USD: [{ val: 81_453_000_000, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-02-26' }],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [{ val: 72_880_000_000, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-02-26' }],
        },
      },
      Assets: {
        units: {
          USD: [{ val: 111_601_000_000, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-02-26' }],
        },
      },
    },
  },
};

const impossibleMarginFacts: SecCompanyFacts = {
  cik: 999999,
  entityName: 'FIGMA INC',
  facts: {
    'us-gaap': {
      Revenues: {
        units: {
          USD: [
            {
              accn: '0000999999-26-000001',
              val: 100,
              fy: 2026,
              fp: 'FY',
              form: '10-K',
              filed: '2026-03-01',
            },
          ],
        },
      },
      GrossProfit: {
        units: {
          USD: [{ val: 111, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-03-01' }],
        },
      },
      OperatingIncomeLoss: {
        units: {
          USD: [{ val: -122, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-03-01' }],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [{ val: -118, fy: 2026, fp: 'FY', form: '10-K', filed: '2026-03-01' }],
        },
      },
    },
  },
};

describe('SEC EDGAR dry-run planner', () => {
  it('uses read-only SQL scoped to app-surface US tickers', () => {
    assert.match(SEC_APP_SURFACE_US_TICKER_ROWS_SQL, /watchlist\.deep_cache/i);
    assert.match(SEC_APP_SURFACE_US_TICKER_ROWS_SQL, /upper\(deep\.market\) = 'US'/i);
    assert.doesNotMatch(
      SEC_APP_SURFACE_US_TICKER_ROWS_SQL,
      /\b(insert|update|drop|truncate|delete|alter\s+table)\b/i,
    );
  });

  it('normalizes CIKs and companyfacts URLs', () => {
    assert.equal(cik10(1045810), '0001045810');
    assert.equal(
      secCompanyFactsUrl('0001045810'),
      'https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json',
    );
  });

  it('builds source-backed annual metric groups from FY 10-K USD facts only', () => {
    const plan = buildSecEdgarDryRunPlan(rows, tickerIndex, {
      '0001045810': nvdaFacts,
      '0000999999': impossibleMarginFacts,
    });

    assert.equal(plan.sourceRows, 3);
    assert.equal(plan.usTickerRows, 2);
    assert.equal(plan.matchedTickers, 2);
    assert.equal(plan.companyFactsAvailable, 2);
    assert.equal(plan.metricGroups.length, 2);

    const nvda = plan.metricGroups.find((group) => group.symbol === 'NVDA');
    assert.equal(nvda?.fiscalYear, 2026);
    assert.equal(nvda?.metricGroup, 'sec_annual_facts');
    assert.equal(nvda?.currency, 'USD');
    assert.equal(nvda?.availability, 'available');
    assert.deepEqual(
      nvda?.metrics.map((metric) => metric.key),
      [
        'revenue',
        'grossProfit',
        'operatingIncome',
        'netIncome',
        'assets',
        'grossMarginPct',
        'operatingMarginPct',
        'netMarginPct',
      ],
    );
    assert.equal(nvda?.sources[0]?.label, 'SEC EDGAR companyfacts');
    assert.match(nvda?.sources[1]?.url ?? '', /000104581026000001/);
  });

  it('surfaces invariant warnings instead of promoting impossible derived metrics', () => {
    const plan = buildSecEdgarDryRunPlan(rows, tickerIndex, {
      '0001045810': nvdaFacts,
      '0000999999': impossibleMarginFacts,
    });
    const fig = plan.metricGroups.find((group) => group.symbol === 'FIG');

    assert.deepEqual(
      fig?.metrics.map((metric) => metric.key),
      [
        'revenue',
        'grossProfit',
        'operatingIncome',
        'netIncome',
        'operatingMarginPct',
        'netMarginPct',
      ],
    );
    assert.equal(
      fig?.metrics.some((metric) => metric.key === 'grossMarginPct'),
      false,
    );
    assert.match(fig?.warnings[0] ?? '', /outside the guarded range/);
    assert.match(fig?.warnings[1] ?? '', /extreme; kept for review/);

    const audit = summarizeSecEdgarDryRunAudit(plan);
    assert.equal(audit.availableMetricGroups, 2);
    assert.equal(audit.skippedRows, 1);
    assert.equal(
      audit.tickers.find((ticker) => ticker.symbol === 'KR:005930'),
      undefined,
    );
    assert.equal(
      audit.tickers.find((ticker) => ticker.symbol === '005930')?.status,
      'unsupported_market',
    );
  });

  it('upserts SEC annual facts idempotently and records a migration_runs audit', async () => {
    const plan = buildSecEdgarDryRunPlan(rows, tickerIndex, {
      '0001045810': nvdaFacts,
      '0000999999': impossibleMarginFacts,
    });
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];

    const result = await applySecEdgarBackfillPlan(
      plan,
      {
        async execute(sql, params = []) {
          calls.push({ sql, params });
          return { rowCount: 1 };
        },
      },
      {
        runId: 'sec-edgar-test-run',
        jobName: 'stock-insight-sec-edgar-backfill',
        startedAt: new Date('2026-07-07T00:00:00.000Z'),
        finishedAt: new Date('2026-07-07T00:00:01.000Z'),
      },
    );

    assert.equal(result.audit.rowsRead, 3);
    assert.equal(result.audit.rowsWritten, 2);
    assert.equal(result.audit.rowsSkipped, 1);
    assert.equal(calls.length, 3);
    assert.match(calls[0]?.sql ?? '', /insert into public\.company_financials/i);
    assert.match(
      calls[0]?.sql ?? '',
      /on conflict \(entity_key, fiscal_year, fiscal_period, metric_group\) do update/i,
    );
    assert.equal(calls[0]?.params[0], 'US:NVDA');
    assert.equal(calls[0]?.params[3], 'sec_annual_facts');
    assert.match(String(calls[0]?.params[5] ?? ''), /sec-edgar-companyfacts/);
    assert.match(String(calls[0]?.params[5] ?? ''), /"warnings":\[\]/);
    assert.match(String(calls[0]?.params[6] ?? ''), /SEC EDGAR/);
    assert.match(String(calls[1]?.params[5] ?? ''), /extreme; kept for review/);
    assert.match(calls[2]?.sql ?? '', /insert into public\.migration_runs/i);
    for (const call of calls) {
      assert.doesNotMatch(call.sql, /\b(drop|truncate|delete|alter\s+table\s+\S+\s+rename)\b/i);
    }
  });
});
