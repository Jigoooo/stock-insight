import assert from 'node:assert/strict';
import test from 'node:test';

import { handleThesisAppend } from '../dist/index.js';

const userId = 'b3ca4de6-905c-484e-bfd6-a927c801d903';
const key = '3f2b8c1a-9d4e-4f6a-8b2c-1d3e5f7a9b0c';
const revisionId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-07-23T00:00:00.000Z');
const body = {
  thesisText: 'AI 수요가 데이터센터 매출 성장을 지지한다.',
  evidenceRefs: ['source:filing:1'],
  counterEvidence: ['밸류에이션 부담'],
  invalidationConditions: ['데이터센터 성장률 10% 미만'],
};

test('personalization mutation policy fails before touching the database', async () => {
  const result = await handleThesisAppend(key, 'US:NVDA', body, {
    resolvePolicy: () => ({
      enabled: false,
      status: 503,
      errorCode: 'PERSONALIZATION_MUTATIONS_DISABLED',
    }),
    routeDatabase: () => {
      throw new Error('database must not be touched');
    },
    now: () => now,
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'PERSONALIZATION_MUTATIONS_DISABLED');
});

test('personalization thesis requires a canonical idempotency UUID', async () => {
  const result = await handleThesisAppend(undefined, 'US:NVDA', body, {
    resolvePolicy: () => ({ enabled: true }),
    routeDatabase: () => {
      throw new Error('database must not be touched');
    },
    now: () => now,
  });
  assert.equal(result.status, 428);
  assert.equal(result.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
});

test('personalization thesis claims, appends, and completes in one transaction', async () => {
  const queries: string[] = [];
  let transactions = 0;
  const executor = {
    queryRows: async (sql: string) => {
      queries.push(sql);
      if (sql.includes('INSERT INTO public.app_mutation_idempotency')) return [{ inserted: true }];
      if (sql.includes('pg_advisory_xact_lock')) {
        return [{ security_entity_id: '42', predecessor_id: null, next_revision_no: 1 }];
      }
      if (sql.includes('INSERT INTO personalization.thesis_revision')) {
        return [
          {
            thesis_revision_id: revisionId,
            revision_no: 1,
            source_kind: 'user_authored',
            thesis_text: body.thesisText,
            evidence_refs: body.evidenceRefs,
            counter_evidence: body.counterEvidence,
            invalidation_conditions: body.invalidationConditions,
            status: 'active',
            valid_from: now.toISOString(),
            valid_to: null,
          },
        ];
      }
      if (sql.includes("SET state = 'completed'")) return [{ completed: true }];
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const result = await handleThesisAppend(key, 'US:NVDA', body, {
    resolvePolicy: () => ({ enabled: true }),
    routeDatabase: () => ({
      userScope: { userId },
      database: {
        kind: 'configured',
        withTransaction: async (work: (value: typeof executor) => Promise<unknown>) => {
          transactions += 1;
          return work(executor);
        },
      },
    }),
    now: () => now,
    generateId: () => revisionId,
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.revision.sourceKind, 'user_authored');
  assert.equal(transactions, 1);
  assert.equal(queries.length, 4);
});
