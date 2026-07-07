import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PHASE35_SOURCE_ROWS_SQL,
  applyPhase35BackfillPlan,
  buildPhase35BackfillPlan,
  loadPhase35DeepCacheRows,
  normalizeDeepCacheMarket,
  parseSourceLinks,
  summarizePhase35Audit,
  type Phase35DeepCacheRow,
  type Phase35ReadExecutor,
  type Phase35WriteExecutor,
} from '../src/backfill/phase35.ts';

const report = `# 삼성전자 심층 리서치

결론: HBM 공급과 메모리 가격 회복을 같이 봐야 합니다.

- HBM 공급 계약은 단기 실적 민감도를 키웁니다.
- 파운드리 가동률은 중장기 마진 회복의 확인 지표입니다.
- 외국인 수급 둔화는 리스크로 남아 있습니다.
`;

const rows: Phase35DeepCacheRow[] = [
  {
    ticker: '005930',
    market: 'KOSPI',
    name: '삼성전자',
    report,
    durable_facts: '["HBM 공급 민감도", "파운드리 가동률"]',
    sources: '["https://example.com/deep-report"]',
    researched_at: '2026-07-06T02:33:01.271360+09:00',
    publication_sources: [
      { label: '공시', url: 'https://dart.fss.or.kr/' },
      { label: '중복', url: 'https://example.com/deep-report' },
    ],
  },
  {
    ticker: '005380',
    market: 'KRX',
    name: '현대차',
    report: '결론: 출처 없는 deep cache 텍스트만 있습니다. 숫자는 available로 노출하면 안 됩니다.',
    durable_facts: '[]',
    sources: '[]',
    researched_at: '2026-07-05T00:00:00.000Z',
    publication_sources: [],
  },
];

describe('Phase 3.5 deep-cache backfill planner', () => {
  it('normalizes legacy deep_cache markets into API entity keys', () => {
    assert.equal(normalizeDeepCacheMarket('KOSPI'), 'KR');
    assert.equal(normalizeDeepCacheMarket('KOSDAQ'), 'KR');
    assert.equal(normalizeDeepCacheMarket('NASDAQ'), 'US');
    assert.equal(normalizeDeepCacheMarket('NYSE'), 'US');
    assert.equal(normalizeDeepCacheMarket('JP'), null);
  });

  it('parses and deduplicates source links from JSON, raw URL text, and publication refs', () => {
    const links = parseSourceLinks(
      '["https://example.com/a", {"label":"공시","url":"https://dart.fss.or.kr/"}]',
      '참고 https://example.com/b',
      [{ label: '중복', url: 'https://example.com/a' }],
    );

    assert.deepEqual(links, [
      { label: 'example.com', url: 'https://example.com/a' },
      { label: '공시', url: 'https://dart.fss.or.kr/' },
      { label: 'example.com', url: 'https://example.com/b' },
    ]);
  });

  it('loads source rows from deep_cache with publication/source-document URL refs using read-only SQL', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: Phase35ReadExecutor = {
      async queryRows(sql, params = []) {
        calls.push({ sql, params });
        return rows;
      },
    };

    const loadedRows = await loadPhase35DeepCacheRows(executor);

    assert.equal(loadedRows, rows);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.params.length, 0);
    assert.match(PHASE35_SOURCE_ROWS_SQL, /watchlist\.deep_cache/i);
    assert.match(PHASE35_SOURCE_ROWS_SQL, /public\.publication_records/i);
    assert.match(PHASE35_SOURCE_ROWS_SQL, /public\.record_sources/i);
    assert.match(PHASE35_SOURCE_ROWS_SQL, /public\.source_documents/i);
    assert.doesNotMatch(
      PHASE35_SOURCE_ROWS_SQL,
      /\b(insert|update|drop|truncate|delete|alter\s+table)\b/i,
    );
  });

  it('builds idempotent learning-card and text-only profile seeds from deep_cache rows', () => {
    const plan = buildPhase35BackfillPlan(rows);

    assert.equal(plan.learningCards.length, 2);
    assert.equal(plan.companyProfiles.length, 2);
    assert.deepEqual(plan.learningCards[0], {
      entityKey: 'KR:005930',
      cardKey: 'deep-cache-summary',
      section: '심층 리서치',
      title: '삼성전자 심층 리서치',
      bodyMarkdown: '결론: HBM 공급과 메모리 가격 회복을 같이 봐야 합니다.',
      bullets: [
        'HBM 공급 계약은 단기 실적 민감도를 키웁니다.',
        '파운드리 가동률은 중장기 마진 회복의 확인 지표입니다.',
        '외국인 수급 둔화는 리스크로 남아 있습니다.',
      ],
      sources: [
        { label: 'example.com', url: 'https://example.com/deep-report' },
        { label: '공시', url: 'https://dart.fss.or.kr/' },
      ],
      availability: 'available',
      sourceKind: 'watchlist.deep_cache',
      sourceUri: 'watchlist.deep_cache:KR:005930',
      derivedFromDeepCache: true,
      publishedAt: '2026-07-05T17:33:01.271Z',
    });
    assert.equal(plan.learningCards[1]?.availability, 'text_only');
    assert.deepEqual(plan.learningCards[1]?.sources, []);
    assert.equal(plan.companyProfiles[0]?.availability, 'text_only');
    assert.match(plan.companyProfiles[0]?.summaryText ?? '', /HBM 공급/);
  });

  it('summarizes audit counts and flags untraceable source coverage honestly', () => {
    const plan = buildPhase35BackfillPlan(rows);
    const audit = summarizePhase35Audit(plan);

    assert.equal(audit.deepCacheRows, 2);
    assert.equal(audit.learningCards, 2);
    assert.equal(audit.companyProfiles, 2);
    assert.equal(audit.availableLearningCards, 1);
    assert.equal(audit.textOnlyLearningCards, 1);
    assert.equal(audit.learningCardsWithoutSourceLinks, 1);
    assert.deepEqual(audit.warnings, [
      '1 learning card(s) have no URL source links and were downgraded to text_only.',
    ]);
  });

  it('applies card/profile upserts and records a migration_runs audit summary without destructive SQL', async () => {
    const plan = buildPhase35BackfillPlan(rows);
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: Phase35WriteExecutor = {
      async execute(sql, params = []) {
        calls.push({ sql, params });
        return { rowCount: 1 };
      },
    };

    const result = await applyPhase35BackfillPlan(plan, executor, {
      runId: 'phase35-test-run',
      jobName: 'stock-insight-phase35-backfill',
      startedAt: new Date('2026-07-06T00:00:00.000Z'),
      finishedAt: new Date('2026-07-06T00:00:01.000Z'),
    });

    assert.equal(result.audit.rowsRead, 2);
    assert.equal(result.audit.rowsWritten, 4);
    assert.equal(result.audit.rowsSkipped, 1);
    assert.equal(calls.length, 5);
    assert.match(calls[0]?.sql ?? '', /insert into public\.stock_learning_cards/i);
    assert.match(calls[0]?.sql ?? '', /on conflict \(entity_key, card_key\) do update/i);
    assert.match(calls[2]?.sql ?? '', /insert into public\.company_profiles/i);
    assert.match(calls[2]?.sql ?? '', /on conflict \(entity_key\) do update/i);
    assert.match(calls[4]?.sql ?? '', /insert into public\.migration_runs/i);
    assert.equal(calls[4]?.params[0], 'phase35-test-run');

    for (const call of calls) {
      assert.doesNotMatch(call.sql, /\b(drop|truncate|delete|alter\s+table\s+\S+\s+rename)\b/i);
    }
  });
});
