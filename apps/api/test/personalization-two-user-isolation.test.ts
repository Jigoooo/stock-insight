import assert from 'node:assert/strict';
import test from 'node:test';

import { getPersonalizationDecisionSupport } from '../src/personalization/decision-read-model.ts';
import { getPersonalizationPortfolioImpact } from '../src/personalization/impact-read-model.ts';
import { getPersonalizationPortfolioSnapshot } from '../src/personalization/portfolio-read-model.ts';
import { getPersonalizationThesis } from '../src/personalization/thesis-model.ts';

const userA = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as const;
const userB = { userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } as const;
const now = new Date('2026-07-23T00:30:00.000Z');
const snapshotId = '11111111-1111-4111-8111-111111111111';

function userAOnly(rows: Record<string, unknown>[]) {
  return {
    queryRows: async <TRow extends Record<string, unknown>>(
      _sql: string,
      parameters: readonly unknown[] = [],
    ) => (parameters[0] === userA.userId ? rows : []) as unknown as TRow[],
  };
}

test('P4-C two-user negative fixture returns zero private rows for user B', async () => {
  const portfolioRows = [
    {
      portfolio_snapshot_id: snapshotId,
      snapshot_as_of: '2026-07-23T00:00:00.000Z',
      source_known_at: '2026-07-23T00:01:00.000Z',
      sealed_at: '2026-07-23T00:02:00.000Z',
      base_currency: 'USD',
      total_market_value: '100000.00000000',
      position_count: 1,
      snapshot_digest: 'a'.repeat(64),
      entity_key: 'US:NVDA',
      entity_name: 'NVIDIA',
      market: 'US',
      currency: 'USD',
      quantity: '10.0000000000',
      market_value: '10000.00000000',
      portfolio_weight: '0.10000000',
      cost_basis_total: null,
      acquired_at: null,
    },
  ];
  const decisionRows = [
    {
      decision_packet_id: '22222222-2222-4222-8222-222222222222',
      portfolio_snapshot_id: snapshotId,
      entity_key: 'US:NVDA',
      entity_name: 'NVIDIA',
      action: 'HOLD',
      action_reason: '유지',
      abstention_reason: null,
      common_view_key: 'asset-view:US:NVDA',
      common_view_digest: 'b'.repeat(64),
      common_view_as_of: '2026-07-23T00:00:00.000Z',
      generated_at: '2026-07-23T00:00:00.000Z',
      expires_at: '2026-07-23T01:00:00.000Z',
      legal_review_status: 'required',
      advice_prohibited: true,
      order_executable: false,
      runtime_packet: {},
    },
  ];
  const thesisRows = [
    {
      thesis_revision_id: '33333333-3333-4333-8333-333333333333',
      revision_no: 1,
      source_kind: 'user_authored',
      thesis_text: '비공개 사용자 A 논지',
      evidence_refs: [],
      counter_evidence: [],
      invalidation_conditions: ['무효화 조건'],
      status: 'active',
      valid_from: '2026-07-23T00:00:00.000Z',
      valid_to: null,
    },
  ];
  const impactRows = [
    {
      portfolio_snapshot_id: snapshotId,
      entity_key: 'US:NVDA',
      portfolio_weight: '0.1',
      sign: 'positive',
      economic_magnitude: '0.2',
      impact_exposure_revision_id: '77',
      evidence_locator: {},
    },
  ];

  assert.ok(
    await getPersonalizationPortfolioSnapshot(userAOnly(portfolioRows), {
      userScope: userA,
      snapshotId,
    }),
  );
  assert.equal(
    await getPersonalizationPortfolioSnapshot(userAOnly(portfolioRows), {
      userScope: userB,
      snapshotId,
    }),
    null,
  );
  assert.ok(
    await getPersonalizationDecisionSupport(userAOnly(decisionRows), {
      userScope: userA,
      entityKey: 'US:NVDA',
      now,
    }),
  );
  assert.equal(
    await getPersonalizationDecisionSupport(userAOnly(decisionRows), {
      userScope: userB,
      entityKey: 'US:NVDA',
      now,
    }),
    null,
  );
  assert.equal(
    (
      await getPersonalizationThesis(userAOnly(thesisRows), {
        userScope: userB,
        entityKey: 'US:NVDA',
        now,
      })
    ).revision,
    null,
  );
  assert.equal(
    await getPersonalizationPortfolioImpact(userAOnly(impactRows), {
      userScope: userB,
      eventId: null,
      scenarioId: null,
      horizon: null,
      knownAt: now,
    }),
    null,
  );
});
