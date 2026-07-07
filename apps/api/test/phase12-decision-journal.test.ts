import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PHASE12_JOURNAL_SOURCE_ROWS_SQL,
  applyPhase12DecisionJournalPlan,
  buildPhase12DecisionJournalPlan,
  loadPhase12JournalRows,
  summarizePhase12DecisionJournalAudit,
  type Phase12JournalSourceRow,
  type Phase12ReadExecutor,
  type Phase12WriteExecutor,
} from '../src/backfill/phase12.ts';

const rows: Phase12JournalSourceRow[] = [
  {
    event_key: 'portfolio-alert:feed:589',
    entity_key: 'US:NVDA',
    market: 'US',
    severity: 'high',
    reason: 'feed_change',
    title: 'NVIDIA 공급망 변화 기록',
    summary: '관련 피드가 강하게 감지되어 나중에 판단 근거로 복기합니다.',
    payload_json: { stockOnly: true },
    source_kind: 'v_user_feed_dedup',
    source_ref: 'feed:589',
    occurred_at: '2026-07-07T00:00:00.000Z',
  },
  {
    event_key: 'portfolio-alert:crypto-1',
    entity_key: 'CRYPTO:BTC',
    market: 'CRYPTO',
    severity: 'high',
    reason: 'feed_change',
    title: 'BTC 변화',
    summary: '비주식 row는 journal로 승격하면 안 됩니다.',
    payload_json: {},
    source_kind: 'v_user_feed_dedup',
    source_ref: 'feed:crypto-1',
    occurred_at: '2026-07-07T00:01:00.000Z',
  },
  {
    event_key: 'portfolio-alert:bad-advice',
    entity_key: 'KR:005930',
    market: 'KR',
    severity: 'high',
    reason: 'feed_change',
    title: '삼성전자 매수 시점 기록',
    summary: '행동 조언처럼 보이면 기록형 journal에서도 제외합니다.',
    payload_json: {},
    source_kind: 'v_user_feed_dedup',
    source_ref: 'feed:bad-advice',
    occurred_at: '2026-07-07T00:02:00.000Z',
  },
];

describe('Phase 12 decision journal pipeline', () => {
  it('loads alert ledger rows through read-only SQL', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: Phase12ReadExecutor = {
      async queryRows(sql, params = []) {
        calls.push({ sql, params });
        return rows;
      },
    };

    const loadedRows = await loadPhase12JournalRows(executor);

    assert.equal(loadedRows, rows);
    assert.equal(calls.length, 1);
    assert.match(PHASE12_JOURNAL_SOURCE_ROWS_SQL, /public\.user_alert_events/i);
    assert.match(PHASE12_JOURNAL_SOURCE_ROWS_SQL, /market\s+in\s+\('KR',\s*'US'\)/i);
    assert.doesNotMatch(PHASE12_JOURNAL_SOURCE_ROWS_SQL, /opendart|fmp|api[_-]?key|secret|token/i);
    assert.doesNotMatch(
      PHASE12_JOURNAL_SOURCE_ROWS_SQL,
      /\b(insert|update|drop|truncate|delete|alter\s+table)\b/i,
    );
  });

  it('creates recording-only journal entries and filters non-stock/action-advice rows', () => {
    const plan = buildPhase12DecisionJournalPlan(rows, { userId: 'default' });

    assert.equal(plan.sourceRows, 3);
    assert.equal(plan.journalEntries.length, 1);
    assert.deepEqual(plan.journalEntries[0], {
      userId: 'default',
      entryKey: 'alert-review:portfolio-alert:feed:589',
      entityKey: 'US:NVDA',
      market: 'US',
      entryType: 'alert_review',
      title: 'NVIDIA 공급망 변화 기록',
      thesisText: '기록용 관찰: 관련 피드가 강하게 감지되어 나중에 판단 근거로 복기합니다.',
      evidence: {
        alertEventKey: 'portfolio-alert:feed:589',
        severity: 'high',
        reason: 'feed_change',
        stockOnly: true,
      },
      sourceKind: 'v_user_feed_dedup',
      sourceRef: 'feed:589',
      occurredAt: '2026-07-07T00:00:00.000Z',
      status: 'open',
      adviceProhibited: true,
    });
    assert.equal(plan.filteredNonStock, 1);
    assert.equal(plan.filteredActionAdvice, 1);
    assert.doesNotMatch(
      JSON.stringify(plan),
      /매수\s*(추천|시점|타이밍|지시)|매도\s*(추천|시점|타이밍|지시)/,
    );
  });

  it('summarizes recording-only journal audit counts', () => {
    const audit = summarizePhase12DecisionJournalAudit(buildPhase12DecisionJournalPlan(rows));

    assert.equal(audit.sourceRows, 3);
    assert.equal(audit.journalEntries, 1);
    assert.equal(audit.filteredNonStock, 1);
    assert.equal(audit.filteredActionAdvice, 1);
    assert.deepEqual(audit.warnings, [
      '1 non-stock journal candidate(s) were filtered.',
      '1 action-advice journal candidate(s) were filtered.',
    ]);
  });

  it('applies journal entries idempotently without destructive SQL or advice fields', async () => {
    const plan = buildPhase12DecisionJournalPlan(rows);
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: Phase12WriteExecutor = {
      async queryRows(sql, params = []) {
        calls.push({ sql, params });
        return [];
      },
    };

    const result = await applyPhase12DecisionJournalPlan(plan, executor, {
      runId: 'phase12-test-run',
      jobName: 'stock-insight-phase12-decision-journal',
      startedAt: new Date('2026-07-07T00:00:00.000Z'),
      finishedAt: new Date('2026-07-07T00:00:01.000Z'),
    });

    assert.equal(result.audit.rowsRead, 3);
    assert.equal(result.audit.rowsWritten, 1);
    assert.equal(result.audit.rowsSkipped, 2);
    assert.match(calls[0]?.sql ?? '', /insert into public\.user_decision_journal_entries/i);
    assert.match(calls[0]?.sql ?? '', /on conflict \(user_id, entry_key\) do update/i);
    assert.match(calls.at(-1)?.sql ?? '', /insert into public\.migration_runs/i);

    for (const call of calls) {
      assert.doesNotMatch(call.sql, /\b(drop|truncate|delete|alter\s+table\s+\S+\s+rename)\b/i);
      assert.doesNotMatch(JSON.stringify(call.params), /opendart|fmp|api[_-]?key|secret|token/i);
      assert.doesNotMatch(
        JSON.stringify(call.params),
        /매수\s*(추천|시점|타이밍|지시)|매도\s*(추천|시점|타이밍|지시)/,
      );
    }
  });
});
