import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getPersonalizationDecisionHistory,
  getPersonalizationDecisionSupport,
  type PersonalizationDecisionQueryExecutor,
} from '../src/personalization/decision-read-model.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;
const now = new Date('2026-07-23T00:30:00.000Z');
const packetId = '22222222-2222-4222-8222-222222222222';
const snapshotId = '11111111-1111-4111-8111-111111111111';

const runtimePacket = {
  generatedAt: '2026-07-23T00:00:00.000Z',
  expiresAt: '2026-07-23T01:00:00.000Z',
  action: 'HOLD',
  reasonCodes: ['THESIS_INTACT'],
  abstentionReason: null,
  portfolioContext: {
    currentWeight: 0.1,
    targetWeight: 0.1,
    tradeWeight: 0,
    cashBefore: 0.2,
    cashAfter: 0.2,
    liquidityTradeCap: 0.05,
  },
  explanation: {
    whatChanged: ['공식 공시가 갱신됨'],
    commonAssetView: {
      availability: 'available',
      calibration: 'sufficient',
      direction: 'neutral',
      coverage: 0.9,
    },
    personalizedReason: '현재 비중과 위험 예산을 함께 반영했습니다.',
    eventAndGeoPaths: {
      eventTransmission: 0.1,
      geoConcentrationRisk: 0.2,
      valuationRisk: 0.3,
    },
    upsideDownsideAndHorizon: {
      expectedReturn: 0.01,
      downsideCvar: 0.08,
      lowerReturn: -0.05,
      upperReturn: 0.09,
      horizon: '90d',
    },
    costTaxAndConcentration: {
      transactionCostRate: 0.001,
      transactionCost: 0.001,
      taxCostRate: 0,
      taxCost: 0,
      totalCost: 0.001,
      concentrationBefore: 0.1,
      concentrationAfter: 0.1,
    },
    counterEvidenceAndUnknowns: ['밸류에이션 부담'],
    invalidationConditions: ['마진 가이던스 하향'],
    validUntil: '2026-07-23T01:00:00.000Z',
  },
};

const approvedRow = {
  decision_packet_id: packetId,
  portfolio_snapshot_id: snapshotId,
  entity_key: 'US:NVDA',
  entity_name: 'NVIDIA',
  action: 'HOLD',
  action_reason: '현재 비중을 유지합니다.',
  abstention_reason: null,
  common_view_key: 'asset-view:US:NVDA:2026-07-23',
  common_view_digest: 'b'.repeat(64),
  common_view_as_of: '2026-07-23T00:00:00.000Z',
  generated_at: '2026-07-23T00:00:00.000Z',
  expires_at: '2026-07-23T01:00:00.000Z',
  legal_review_status: 'approved_read_only',
  advice_prohibited: true,
  order_executable: false,
  runtime_packet: runtimePacket,
};

describe('P4-C decision support read model', () => {
  it('returns an approved runtime packet from a sealed same-user lineage', async () => {
    let sql = '';
    let parameters: readonly unknown[] = [];
    const executor: PersonalizationDecisionQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(
        query: string,
        queryParameters: readonly unknown[] = [],
      ) => {
        sql = query;
        parameters = queryParameters;
        return [approvedRow] as unknown as TRow[];
      },
    };
    const result = await getPersonalizationDecisionSupport(executor, {
      userScope,
      entityKey: 'US:NVDA',
      now,
    });
    assert.ok(result);
    assert.equal(result.packet.action, 'HOLD');
    assert.deepEqual(result.reasonCodes, ['THESIS_INTACT']);
    assert.deepEqual(result.targetWeight, { low: 0.1, high: 0.1 });
    assert.match(sql, /JOIN personalization\.portfolio_snapshot_seal seal/);
    assert.match(sql, /packet\.user_id = \$1::uuid/);
    assert.match(sql, /candidate\.identifier_value = \$2::text/);
    assert.deepEqual(parameters, [userScope.userId, 'US:NVDA', now.toISOString()]);
  });

  it('redacts every private decision detail before legal approval', async () => {
    const executor: PersonalizationDecisionQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>() =>
        [{ ...approvedRow, legal_review_status: 'required' }] as unknown as TRow[],
    };
    const result = await getPersonalizationDecisionSupport(executor, {
      userScope,
      entityKey: 'US:NVDA',
      now,
    });
    assert.ok(result);
    assert.equal(result.packet.action, null);
    assert.deepEqual(result.reasonCodes, []);
    assert.equal(result.targetWeight, null);
    assert.equal(result.explanation, null);
  });

  it('redacts expired history items and never trusts the legacy packet review column', async () => {
    let sql = '';
    const executor: PersonalizationDecisionQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(query: string) => {
        sql = query;
        return [
          {
            ...approvedRow,
            expires_at: '2026-07-23T00:15:00.000Z',
            legal_review_status: 'approved_read_only',
            packet_count: 1,
          },
        ] as unknown as TRow[];
      },
    };
    const result = await getPersonalizationDecisionHistory(executor, {
      userScope,
      entityKey: 'US:NVDA',
      now,
      limit: 20,
    });
    assert.equal(result.items[0]?.action, null);
    assert.equal(result.items[0]?.restrictionReason, 'PACKET_EXPIRED');
    assert.match(sql, /ELSE 'required'/);
    assert.doesNotMatch(sql, /ELSE packet\.legal_review_status/);
  });
});
