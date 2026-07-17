import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyDartBackfillPlan,
  assertDartApiSuccess,
  assertDartEndpointCoverage,
  assertDartPlanUsable,
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

test('rejects every non-success OpenDART API status and empty mapped plans', () => {
  assert.doesNotThrow(() => assertDartApiSuccess({ status: '000' }, 'company.json'));
  assert.throws(
    () => assertDartApiSuccess({ status: '010', message: '등록되지 않은 키' }, 'company.json'),
    /010.*등록되지 않은 키/,
  );
  assert.throws(
    () =>
      assertDartPlanUsable({
        sourceRows: 1,
        mappedRows: 1,
        profiles: [],
        financials: [],
        tickers: [],
      }),
    /no usable data/i,
  );
  assert.throws(
    () =>
      assertDartEndpointCoverage({
        mappedRows: 2,
        companySuccesses: 2,
        financialSuccesses: 0,
      }),
    /financial endpoint failed for all 2 mapped rows/i,
  );
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
  assert.match(profile?.sources[0]?.url ?? '', /dart\.fss\.or\.kr/);

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

test('never mixes CFS and OFS accounts in one financial group', () => {
  const financial = buildDartFinancialSeed('KR:005930', 2025, {
    status: '000',
    list: [
      { account_nm: '매출액', fs_div: 'CFS', thstrm_amount: '100' },
      { account_nm: '영업이익', fs_div: 'OFS', thstrm_amount: '20' },
      { account_nm: '당기순이익', fs_div: 'OFS', thstrm_amount: '10' },
    ],
  });
  assert.deepEqual(
    financial?.metrics.map((metric) => metric.key),
    ['revenue'],
  );
  assert.equal(financial?.statementScope, 'CFS');
});

test('binds DART responses to the requested company and exact filing receipt', () => {
  const row = { entity_key: 'KR:005930', symbol: '005930', market: 'KR', name: '삼성전자' };
  assert.equal(
    buildDartProfileSeed(
      row,
      '00126380',
      { status: '000', stock_code: '000660', corp_name: '다른 회사' },
      '2026-07-18T00:00:00.000Z',
    ),
    undefined,
  );

  const financial = buildDartFinancialSeed(
    'KR:005930',
    2025,
    {
      status: '000',
      list: [
        {
          account_nm: '매출액',
          fs_div: 'CFS',
          thstrm_amount: '100',
          corp_code: '00126380',
          stock_code: '005930',
          bsns_year: '2025',
          reprt_code: '11011',
          rcept_no: '20260317001234',
        },
      ],
    },
    { corpCode: '00126380', symbol: '005930' },
  );
  assert.equal(financial?.filingReceiptNo, '20260317001234');
  assert.equal(financial?.reportedAt, '2026-03-17T00:00:00.000Z');
  assert.match(financial?.sources[0]?.url ?? '', /rcpNo=20260317001234/);

  assert.equal(
    buildDartFinancialSeed(
      'KR:005930',
      2025,
      {
        status: '000',
        list: [
          {
            account_nm: '매출액',
            fs_div: 'CFS',
            thstrm_amount: '100',
            corp_code: '99999999',
            stock_code: '005930',
          },
        ],
      },
      { corpCode: '00126380', symbol: '005930' },
    ),
    undefined,
  );
});

test('uses metrics from one latest filing receipt only', () => {
  const financial = buildDartFinancialSeed('KR:005930', 2025, {
    status: '000',
    list: [
      {
        account_nm: '매출액',
        fs_div: 'CFS',
        thstrm_amount: '100',
        rcept_no: '20260301000001',
      },
      {
        account_nm: '매출액',
        fs_div: 'CFS',
        thstrm_amount: '200',
        rcept_no: '20260317000002',
      },
      {
        account_nm: '영업이익',
        fs_div: 'CFS',
        thstrm_amount: '20',
        rcept_no: '20260317000002',
      },
    ],
  });
  assert.equal(financial?.filingReceiptNo, '20260317000002');
  assert.equal(financial?.metrics.find((metric) => metric.key === 'revenue')?.value, 200);
  assert.equal(financial?.metrics.find((metric) => metric.key === 'operatingMarginPct')?.value, 10);
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
        statementScope: 'CFS',
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
