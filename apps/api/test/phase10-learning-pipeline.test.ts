import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PHASE10_SOURCE_ROWS_SQL,
  applyPhase10LearningPlan,
  buildPhase10LearningPlan,
  loadPhase10DeepCacheRows,
  normalizeGlossaryTerm,
  summarizePhase10LearningAudit,
  type Phase10DeepCacheRow,
  type Phase10ReadExecutor,
  type Phase10WriteExecutor,
} from '../src/backfill/phase10.ts';

const sourceRows: Phase10DeepCacheRow[] = [
  {
    entity_key: 'US:FIG',
    ticker: 'FIG',
    market: 'US',
    name: 'Figma Inc',
    report: `# Figma 심층 리서치

결론: 협업 디자인 플랫폼의 좌석 확장과 AI 크레딧 과금이 핵심입니다.

- 좌석 확장 모델은 조직 내 사용자가 늘수록 매출이 커지는 구조입니다.
- AI 크레딧 과금은 사용량 기반 수익화를 검증해야 합니다.
`,
    durable_facts: [
      '좌석 확장 모델=조직 내 사용자가 늘어날수록 과금 좌석이 증가해 매출이 확대되는 SaaS 성장 구조다.',
      'AI 크레딧 과금=생성형 AI 기능 사용량을 별도 과금 단위로 전환해 AI 인프라 비용을 수익화하려는 전략이다.',
    ],
    sources: [
      { label: 'SEC EDGAR', url: 'https://www.sec.gov/Archives/edgar/data/0000000000/fig-s1.htm' },
    ],
    researched_at: '2026-07-06T03:00:00.000Z',
  },
  {
    entity_key: 'US:BMNR',
    ticker: 'BMNR',
    market: 'US',
    name: 'BitMine Immersion Technologies Inc',
    report: '결론: deep cache 원문은 있으나 durable fact가 비어 있습니다.',
    durable_facts: [],
    sources: [],
    researched_at: '2026-07-06T03:30:00.000Z',
  },
];

describe('Phase 10 analysis job and learning pipeline', () => {
  it('loads deep_cache rows through read-only SQL without external API keys', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: Phase10ReadExecutor = {
      async queryRows(sql, params = []) {
        calls.push({ sql, params });
        return sourceRows;
      },
    };

    const rows = await loadPhase10DeepCacheRows(executor);

    assert.equal(rows, sourceRows);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.params.length, 0);
    assert.match(PHASE10_SOURCE_ROWS_SQL, /watchlist\.deep_cache/i);
    assert.match(PHASE10_SOURCE_ROWS_SQL, /public\.entities/i);
    assert.doesNotMatch(PHASE10_SOURCE_ROWS_SQL, /opendart|fmp|api[_-]?key|secret|token/i);
    assert.doesNotMatch(
      PHASE10_SOURCE_ROWS_SQL,
      /\b(insert|update|drop|truncate|delete|alter\s+table)\b/i,
    );
  });

  it('builds completed analysis jobs, progress events, learning cards, and glossary terms', () => {
    const plan = buildPhase10LearningPlan(sourceRows);

    assert.equal(plan.sourceRows, 2);
    assert.equal(plan.eligibleRows, 2);
    assert.equal(plan.jobs.length, 2);
    assert.deepEqual(plan.jobs[0], {
      entityKey: 'US:FIG',
      jobKey: 'deep-cache-learning:US:FIG',
      idempotencyKey: 'deep-cache-learning:US:FIG',
      requestedScope: 'deep_cache_learning',
      requestedBy: 'system:phase10',
      resultDeepCacheKey: 'watchlist.deep_cache:US:FIG',
      status: 'completed',
      progressPct: 100,
    });
    assert.deepEqual(
      plan.events.map((event) => event.eventKey),
      [
        'queued:US:FIG',
        'source-check:US:FIG',
        'learning-card:US:FIG',
        'glossary:US:FIG',
        'completed:US:FIG',
        'queued:US:BMNR',
        'source-check:US:BMNR',
        'learning-card:US:BMNR',
        'glossary:US:BMNR',
        'completed:US:BMNR',
      ],
    );
    assert.equal(plan.learningCards.length, 2);
    assert.equal(plan.learningCards[0]?.availability, 'available');
    assert.equal(plan.learningCards[1]?.availability, 'text_only');
    assert.equal(plan.glossaryTerms.length, 2);
    assert.equal(plan.glossaryTerms[0]?.term, '좌석 확장 모델');
    assert.equal(plan.glossaryTerms[0]?.normalizedTerm, '좌석 확장 모델');
    assert.match(plan.glossaryTerms[1]?.definition ?? '', /AI 인프라 비용/);

    const serialized = JSON.stringify(plan);
    assert.doesNotMatch(
      serialized,
      /매수\s*(추천|시점|타이밍|지시)|매도\s*(추천|시점|타이밍|지시)/,
    );
    assert.doesNotMatch(
      serialized,
      /buy\s*(recommendation|timing|signal)|sell\s*(recommendation|timing|signal)/i,
    );
  });

  it('normalizes glossary terms conservatively', () => {
    assert.equal(normalizeGlossaryTerm('  AI   크레딧 과금  '), 'ai 크레딧 과금');
    assert.equal(normalizeGlossaryTerm('mNAV'), 'mnav');
  });

  it('summarizes audit counts honestly', () => {
    const audit = summarizePhase10LearningAudit(buildPhase10LearningPlan(sourceRows));

    assert.equal(audit.deepCacheRows, 2);
    assert.equal(audit.eligibleRows, 2);
    assert.equal(audit.analysisJobs, 2);
    assert.equal(audit.analysisJobEvents, 10);
    assert.equal(audit.learningCards, 2);
    assert.equal(audit.glossaryTerms, 2);
    assert.equal(audit.textOnlyLearningCards, 1);
    assert.deepEqual(audit.warnings, [
      '1 learning card(s) have no URL source links and stayed text_only.',
    ]);
  });

  it('applies jobs/events/cards/glossary idempotently without destructive SQL', async () => {
    const plan = buildPhase10LearningPlan(sourceRows);
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    let jobId = 100;
    const executor: Phase10WriteExecutor = {
      async queryRows(sql, params = []) {
        calls.push({ sql, params });
        if (/returning\s+id/i.test(sql)) {
          jobId += 1;
          return [{ id: jobId }];
        }
        return [];
      },
    };

    const result = await applyPhase10LearningPlan(plan, executor, {
      runId: 'phase10-test-run',
      jobName: 'stock-insight-phase10-learning-pipeline',
      startedAt: new Date('2026-07-07T00:00:00.000Z'),
      finishedAt: new Date('2026-07-07T00:00:01.000Z'),
    });

    assert.equal(result.audit.rowsRead, 2);
    assert.equal(result.audit.rowsWritten, 16);
    assert.equal(result.audit.rowsSkipped, 0);
    assert.match(calls[0]?.sql ?? '', /insert into public\.analysis_jobs/i);
    assert.match(calls[0]?.sql ?? '', /on conflict \(job_key\) do update/i);
    assert.match(calls[2]?.sql ?? '', /insert into public\.analysis_job_events/i);
    assert.match(calls[12]?.sql ?? '', /insert into public\.stock_learning_cards/i);
    assert.match(calls[14]?.sql ?? '', /insert into public\.entity_glossary_terms/i);
    assert.match(calls.at(-1)?.sql ?? '', /insert into public\.migration_runs/i);
    assert.equal(calls.at(-1)?.params[0], 'phase10-test-run');

    for (const call of calls) {
      assert.doesNotMatch(call.sql, /\b(drop|truncate|delete|alter\s+table\s+\S+\s+rename)\b/i);
      assert.doesNotMatch(JSON.stringify(call.params), /opendart|fmp|api[_-]?key|secret|token/i);
    }
  });
});
