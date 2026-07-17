import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDartBackfillPlan,
  buildDartFinancialSeed,
  buildDartProfileSeed,
  DART_KR_ENTITY_ROWS_SQL,
  parseDartAmount,
  type DartBackfillPlan,
} from '../src/backfill/opendart.ts';

test('OpenDART source query covers canonical KR entities read-only', () => {
  assert.match(DART_KR_ENTITY_ROWS_SQL, /public\.entities/i);
  assert.match(DART_KR_ENTITY_ROWS_SQL, /upper\(market\) = 'KR'/i);
  assert.doesNotMatch(DART_KR_ENTITY_ROWS_SQL, /\b(insert|update|delete|alter|drop|truncate)\b/i);
});

test('parses DART amounts including commas and accounting negatives', () => {
  assert.equal(parseDartAmount('1,234,567'), 1_234_567);
  assert.equal(parseDartAmount('(42)'), -42);
  assert.equal(parseDartAmount('-'), undefined);
});

test('builds source-backed profile and prefers CFS financial accounts', () => {
  const row = { entity_key: 'KR:005930', symbol: '005930', market: 'KR', name: '삼성전자' };
  const profile = buildDartProfileSeed(
    row,
    '00126380',
    { status: '000', corp_name: '삼성전자', ceo_nm: '홍길동', induty_code: '264' },
    '2026-07-18T00:00:00.000Z',
  );
  assert.equal(profile?.name, '삼성전자');
  assert.equal(profile?.profile.corpCode, '00126380');
  assert.match(profile?.sources[0]?.url ?? '', /opendart/);

  const financial = buildDartFinancialSeed('KR:005930', 2025, {
    status: '000',
    list: [
      { account_nm: '매출액', fs_div: 'OFS', thstrm_amount: '90' },
      { account_nm: '매출액', fs_div: 'CFS', thstrm_amount: '100' },
      { account_nm: '영업이익', fs_div: 'CFS', thstrm_amount: '20' },
      { account_nm: '당기순이익', fs_div: 'CFS', thstrm_amount: '10' },
      { account_nm: '자산총계', fs_div: 'CFS', thstrm_amount: '500' },
    ],
  });
  assert.equal(financial?.metrics.find((metric) => metric.key === 'revenue')?.value, 100);
  assert.equal(financial?.metrics.find((metric) => metric.key === 'operatingMarginPct')?.value, 20);
});

test('applies profile and financial upserts idempotently with audit ledger', async () => {
  const plan: DartBackfillPlan = {
    sourceRows: 1,
    mappedRows: 1,
    profiles: [
      {
        entityKey: 'KR:005930',
        symbol: '005930',
        name: '삼성전자',
        summaryText: '삼성전자 기업 개황',
        profile: { corpCode: '00126380' },
        sources: [{ label: 'OpenDART', url: 'https://opendart.fss.or.kr/' }],
        availability: 'available',
        capturedAt: '2026-07-18T00:00:00.000Z',
      },
    ],
    financials: [
      {
        entityKey: 'KR:005930',
        fiscalYear: 2025,
        fiscalPeriod: 'FY',
        metricGroup: 'dart_annual_facts',
        currency: 'KRW',
        metrics: [{ key: 'revenue', label: '매출', value: 100, unit: 'currency' }],
        sources: [{ label: 'OpenDART', url: 'https://opendart.fss.or.kr/' }],
        availability: 'available',
      },
    ],
    tickers: [
      {
        entityKey: 'KR:005930',
        symbol: '005930',
        corpCode: '00126380',
        status: 'ready',
        profileReady: true,
        financialReady: true,
      },
    ],
  };
  const calls: { sql: string; params: readonly unknown[] }[] = [];
  const result = await applyDartBackfillPlan(
    plan,
    {
      async execute(sql, params = []) {
        calls.push({ sql, params });
        return { rowCount: 1 };
      },
    },
    {
      runId: 'dart-test',
      jobName: 'dart',
      startedAt: new Date('2026-07-18T00:00:00Z'),
      finishedAt: new Date('2026-07-18T00:00:01Z'),
    },
  );
  assert.equal(result.rowsWritten, 2);
  assert.equal(calls.length, 3);
  assert.match(calls[0]?.sql ?? '', /insert into public\.company_profiles/i);
  assert.match(calls[1]?.sql ?? '', /insert into public\.company_financials/i);
  assert.match(calls[2]?.sql ?? '', /insert into public\.migration_runs/i);
});
