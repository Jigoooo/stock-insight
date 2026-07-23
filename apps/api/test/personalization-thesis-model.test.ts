import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  appendUserThesisRevision,
  getPersonalizationThesis,
  type PersonalizationThesisExecutor,
} from '../src/personalization/thesis-model.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;
const entityKey = 'US:NVDA';
const revisionId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-07-23T00:00:00.000Z');

const revisionRow = {
  thesis_revision_id: revisionId,
  revision_no: 1,
  source_kind: 'user_authored',
  thesis_text: 'AI 수요가 데이터센터 매출 성장을 지지한다.',
  evidence_refs: ['source:filing:1'],
  counter_evidence: ['밸류에이션 부담'],
  invalidation_conditions: ['데이터센터 성장률 10% 미만'],
  status: 'active',
  valid_from: now.toISOString(),
  valid_to: null,
};

describe('P4-C thesis read/write model', () => {
  it('reads the point-in-time successor head for the authenticated user only', async () => {
    let sql = '';
    let parameters: readonly unknown[] = [];
    const executor: PersonalizationThesisExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(
        query: string,
        queryParameters: readonly unknown[] = [],
      ) => {
        sql = query;
        parameters = queryParameters;
        return [revisionRow] as unknown as TRow[];
      },
    };
    const result = await getPersonalizationThesis(executor, { userScope, entityKey, now });
    assert.equal(result.revision?.sourceKind, 'user_authored');
    assert.match(sql, /thesis\.user_id = \$1::uuid/);
    assert.match(sql, /NOT EXISTS[\s\S]*successor\.supersedes_thesis_revision_id/);
    assert.match(sql, /successor\.valid_from <= \$3::timestamptz/);
    assert.deepEqual(parameters, [userScope.userId, entityKey, now.toISOString()]);
  });

  it('appends a user-authored successor under the same thesis advisory lock', async () => {
    const calls: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const executor: PersonalizationThesisExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(
        sql: string,
        parameters: readonly unknown[] = [],
      ) => {
        calls.push({ sql, parameters });
        return (calls.length === 1
          ? [{ security_entity_id: '42', predecessor_id: null, next_revision_no: 1 }]
          : [revisionRow]) as unknown as TRow[];
      },
    };
    const result = await appendUserThesisRevision(executor, {
      userScope,
      entityKey,
      input: {
        thesisText: revisionRow.thesis_text,
        evidenceRefs: revisionRow.evidence_refs,
        counterEvidence: revisionRow.counter_evidence,
        invalidationConditions: revisionRow.invalidation_conditions,
      },
      now,
      generateId: () => revisionId,
    });
    assert.equal(result.revision?.revisionNo, 1);
    assert.match(calls[0]!.sql, /pg_advisory_xact_lock/);
    assert.match(calls[0]!.sql, /'p4-thesis:' \|\| \$1::text/);
    assert.match(calls[1]!.sql, /'user_authored'/);
    assert.deepEqual(calls[0]!.parameters, [userScope.userId, entityKey, now.toISOString()]);
    assert.equal(calls[1]!.parameters[0], revisionId);
    assert.equal(calls[1]!.parameters[1], userScope.userId);
  });

  it('fails closed when the security identity cannot be resolved', async () => {
    const executor: PersonalizationThesisExecutor = { queryRows: async () => [] };
    await assert.rejects(
      appendUserThesisRevision(executor, {
        userScope,
        entityKey,
        input: {
          thesisText: '유효한 논지',
          evidenceRefs: [],
          counterEvidence: [],
          invalidationConditions: ['무효화 조건'],
        },
        now,
        generateId: () => revisionId,
      }),
      /identity/i,
    );
  });
});
