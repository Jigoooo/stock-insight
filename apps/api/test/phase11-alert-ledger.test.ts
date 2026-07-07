import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PHASE11_ALERT_SOURCE_ROWS_SQL,
  applyPhase11AlertLedgerPlan,
  buildPhase11AlertLedgerPlan,
  loadPhase11AlertRows,
  summarizePhase11AlertAudit,
  type Phase11AlertSourceRow,
  type Phase11ReadExecutor,
  type Phase11WriteExecutor,
} from '../src/backfill/phase11.ts';

const rows: Phase11AlertSourceRow[] = [
  {
    id: 'feed:101',
    title: 'NVDA 공급망 변화 확인 필요',
    summary: '관련 피드 신뢰도가 높아 확인 항목으로 기록합니다.',
    severity: 'medium',
    reason: 'feed_change',
    entity_key: 'US:NVDA',
    market: 'US',
    created_at: '2026-07-07T00:00:00.000Z',
  },
  {
    id: 'feed:crypto-1',
    title: 'BTC 변동성 확대',
    summary: 'crypto row must not leak into stock alerts.',
    severity: 'high',
    reason: 'feed_change',
    entity_key: 'CRYPTO:BTC',
    market: 'CRYPTO',
    created_at: '2026-07-07T00:01:00.000Z',
  },
  {
    id: 'feed:bad-action',
    title: 'TSLA 매수 시점 임박',
    summary: '행동 지시처럼 보이는 문구는 기록하지 않습니다.',
    severity: 'high',
    reason: 'feed_change',
    entity_key: 'US:TSLA',
    market: 'US',
    created_at: '2026-07-07T00:02:00.000Z',
  },
];

describe('Phase 11 notification and alert ledger pipeline', () => {
  it('loads stock alert source rows through read-only SQL', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: Phase11ReadExecutor = {
      async queryRows(sql, params = []) {
        calls.push({ sql, params });
        return rows;
      },
    };

    const loadedRows = await loadPhase11AlertRows(executor);

    assert.equal(loadedRows, rows);
    assert.equal(calls.length, 1);
    assert.match(PHASE11_ALERT_SOURCE_ROWS_SQL, /public\.change_events/i);
    assert.match(PHASE11_ALERT_SOURCE_ROWS_SQL, /public\.v_user_feed_dedup/i);
    assert.match(PHASE11_ALERT_SOURCE_ROWS_SQL, /domain\s*=\s*'stock'/i);
    assert.doesNotMatch(PHASE11_ALERT_SOURCE_ROWS_SQL, /opendart|fmp|api[_-]?key|secret|token/i);
    assert.doesNotMatch(
      PHASE11_ALERT_SOURCE_ROWS_SQL,
      /\b(insert|update|drop|truncate|delete|alter\s+table)\b/i,
    );
  });

  it('builds a default stock-only rule and filters non-stock or action-advice alerts', () => {
    const plan = buildPhase11AlertLedgerPlan(rows, { userId: 'default' });

    assert.deepEqual(plan.rule, {
      userId: 'default',
      ruleKey: 'default-stock-digest',
      scope: 'portfolio_digest',
      channel: 'in_app',
      enabled: true,
      severityThreshold: 'low',
      stockOnly: true,
      rateLimitMinutes: 60,
    });
    assert.equal(plan.sourceRows, 3);
    assert.equal(plan.alertEvents.length, 1);
    assert.equal(plan.alertEvents[0]?.eventKey, 'portfolio-alert:feed:101');
    assert.equal(plan.alertEvents[0]?.entityKey, 'US:NVDA');
    assert.equal(plan.alertEvents[0]?.market, 'US');
    assert.equal(plan.filteredNonStock, 1);
    assert.equal(plan.filteredActionAdvice, 1);
    assert.doesNotMatch(
      JSON.stringify(plan),
      /매수\s*(추천|시점|타이밍|지시)|매도\s*(추천|시점|타이밍|지시)/,
    );
  });

  it('summarizes alert ledger audit counts', () => {
    const audit = summarizePhase11AlertAudit(buildPhase11AlertLedgerPlan(rows));

    assert.equal(audit.sourceRows, 3);
    assert.equal(audit.alertEvents, 1);
    assert.equal(audit.filteredNonStock, 1);
    assert.equal(audit.filteredActionAdvice, 1);
    assert.deepEqual(audit.warnings, [
      '1 non-stock alert candidate(s) were filtered.',
      '1 action-advice alert candidate(s) were filtered.',
    ]);
  });

  it('applies a rule and alert events idempotently without destructive SQL', async () => {
    const plan = buildPhase11AlertLedgerPlan(rows);
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    const executor: Phase11WriteExecutor = {
      async queryRows(sql, params = []) {
        calls.push({ sql, params });
        return [];
      },
    };

    const result = await applyPhase11AlertLedgerPlan(plan, executor, {
      runId: 'phase11-test-run',
      jobName: 'stock-insight-phase11-alert-ledger',
      startedAt: new Date('2026-07-07T00:00:00.000Z'),
      finishedAt: new Date('2026-07-07T00:00:01.000Z'),
    });

    assert.equal(result.audit.rowsRead, 3);
    assert.equal(result.audit.rowsWritten, 2);
    assert.equal(result.audit.rowsSkipped, 2);
    assert.match(calls[0]?.sql ?? '', /insert into public\.user_notification_rules/i);
    assert.match(calls[0]?.sql ?? '', /on conflict \(user_id, rule_key\) do update/i);
    assert.match(calls[1]?.sql ?? '', /insert into public\.user_alert_events/i);
    assert.match(calls[1]?.sql ?? '', /on conflict \(user_id, event_key\) do update/i);
    assert.match(calls.at(-1)?.sql ?? '', /insert into public\.migration_runs/i);

    for (const call of calls) {
      assert.doesNotMatch(call.sql, /\b(drop|truncate|delete|alter\s+table\s+\S+\s+rename)\b/i);
      assert.doesNotMatch(JSON.stringify(call.params), /opendart|fmp|api[_-]?key|secret|token/i);
    }
  });
});
