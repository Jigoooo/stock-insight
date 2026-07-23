import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  personalizationDecisionSupportSchema,
  personalizationEvaluationGateSchema,
  personalizationPortfolioImpactSchema,
  personalizationPortfolioSnapshotSchema,
  personalizationThesisSchema,
  personalizationThesisWriteInputSchema,
} from '../src/personalization.ts';

const now = '2026-07-23T00:00:00.000Z';
const later = '2026-07-23T01:00:00.000Z';
const snapshotId = '11111111-1111-4111-8111-111111111111';
const packetId = '22222222-2222-4222-8222-222222222222';
const thesisId = '33333333-3333-4333-8333-333333333333';

const approvedPacket = {
  decisionPacketId: packetId,
  entityKey: 'US:NVDA',
  entityName: 'NVIDIA',
  action: 'HOLD',
  actionReason: '현재 비중을 유지합니다.',
  abstentionReason: null,
  commonViewAsOf: now,
  generatedAt: now,
  expiresAt: later,
  legalReviewStatus: 'approved_read_only',
  restrictionReason: null,
  adviceProhibited: true,
  orderExecutable: false,
} as const;

const explanation = {
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
  counterEvidenceAndUnknowns: ['밸류에이션 부담', '다음 분기 마진'],
  invalidationConditions: ['마진 가이던스 하향'],
  validUntil: later,
} as const;

describe('P4-C personalization API contracts', () => {
  it('parses a sealed portfolio snapshot without exposing a user identifier', () => {
    const parsed = personalizationPortfolioSnapshotSchema.parse({
      schemaVersion: 'p4.v1',
      availability: 'available',
      portfolioSnapshotId: snapshotId,
      snapshotAsOf: now,
      sourceKnownAt: now,
      sealedAt: now,
      baseCurrency: 'USD',
      totalMarketValue: '100000.00000000',
      positionCount: 1,
      snapshotDigest: 'a'.repeat(64),
      positions: [
        {
          entityKey: 'US:NVDA',
          entityName: 'NVIDIA',
          market: 'US',
          currency: 'USD',
          quantity: '10.0000000000',
          marketValue: '10000.00000000',
          portfolioWeight: 0.1,
          costBasisTotal: '9000.00000000',
          acquiredAt: null,
        },
      ],
    });
    assert.equal(parsed.positions.length, 1);
    assert.equal('userId' in parsed, false);
    assert.equal(
      personalizationPortfolioSnapshotSchema.safeParse({ ...parsed, sealedAt: null }).success,
      false,
    );
  });

  it('binds portfolio impact to one immutable snapshot and common scenario lineage', () => {
    const parsed = personalizationPortfolioImpactSchema.parse({
      schemaVersion: 'p4.v1',
      availability: 'available',
      portfolioSnapshotId: snapshotId,
      eventId: 'event-1',
      scenarioId: 'base',
      horizon: '90d',
      knownAt: now,
      generatedAt: now,
      aggregateImpact: 0.02,
      affectedPositions: [
        {
          entityKey: 'US:NVDA',
          portfolioWeight: 0.1,
          direction: 'positive',
          impactScore: 0.2,
          contribution: 0.02,
          evidenceRefs: ['evidence-1'],
        },
      ],
    });
    assert.equal(parsed.affectedPositions[0]?.contribution, 0.02);
  });

  it('exposes an approved detailed decision packet while keeping order execution impossible', () => {
    const parsed = personalizationDecisionSupportSchema.parse({
      schemaVersion: 'p4.v1',
      availability: 'available',
      portfolioSnapshotId: snapshotId,
      commonViewKey: 'asset-view:US:NVDA:2026-07-23',
      commonViewDigest: 'b'.repeat(64),
      packet: approvedPacket,
      reasonCodes: ['THESIS_INTACT'],
      targetWeight: { low: 0.1, high: 0.1 },
      explanation,
      readOnly: true,
    });
    assert.equal(parsed.packet.orderExecutable, false);
    assert.equal(parsed.readOnly, true);
  });

  it('requires every legally restricted packet to redact action details and explanation', () => {
    const restrictedPacket = {
      ...approvedPacket,
      action: null,
      actionReason: null,
      legalReviewStatus: 'required',
      restrictionReason: 'LEGAL_REVIEW_REQUIRED',
    } as const;
    const restricted = {
      schemaVersion: 'p4.v1',
      availability: 'available',
      portfolioSnapshotId: snapshotId,
      commonViewKey: 'asset-view:US:NVDA:2026-07-23',
      commonViewDigest: 'b'.repeat(64),
      packet: restrictedPacket,
      reasonCodes: [],
      targetWeight: null,
      explanation: null,
      readOnly: true,
    } as const;
    assert.equal(personalizationDecisionSupportSchema.safeParse(restricted).success, true);
    assert.equal(
      personalizationDecisionSupportSchema.safeParse({
        ...restricted,
        reasonCodes: ['THESIS_INTACT'],
        explanation,
      }).success,
      false,
    );
  });

  it('separates bounded user-authored thesis input from the persisted revision', () => {
    const input = personalizationThesisWriteInputSchema.parse({
      thesisText: 'AI 수요가 데이터센터 매출 성장을 지지한다.',
      evidenceRefs: ['source:filing:1'],
      counterEvidence: ['밸류에이션 부담'],
      invalidationConditions: ['데이터센터 성장률 10% 미만'],
    });
    const thesis = personalizationThesisSchema.parse({
      schemaVersion: 'p4.v1',
      availability: 'available',
      entityKey: 'US:NVDA',
      revision: {
        thesisRevisionId: thesisId,
        revisionNo: 1,
        sourceKind: 'user_authored',
        thesisText: input.thesisText,
        evidenceRefs: input.evidenceRefs,
        counterEvidence: input.counterEvidence,
        invalidationConditions: input.invalidationConditions,
        status: 'active',
        validFrom: now,
        validTo: null,
      },
    });
    assert.equal(thesis.revision?.sourceKind, 'user_authored');
    assert.equal(
      personalizationThesisWriteInputSchema.safeParse({ ...input, thesisText: ' ' }).success,
      false,
    );
  });

  it('makes offline→shadow→limited promotion machine-readable and permanently order-free', () => {
    const gate = personalizationEvaluationGateSchema.parse({
      schemaVersion: 'p4.v1',
      evaluatedAt: now,
      stage: 'limited',
      offline: {
        pitWalkForwardPassed: true,
        costsIncluded: true,
        holdBaselineOutperformed: true,
        netUtility: 0.02,
        downside: 0.05,
      },
      shadow: {
        sampleCount: 100,
        disagreementRate: 0.1,
        calibrationError: 0.03,
        coverage: 0.9,
        abstentionRate: 0.2,
        privateIsolationPassed: true,
        reproducibilityPassed: true,
      },
      limited: {
        actionWeightCap: 0.05,
        highRiskBlocked: true,
        lowLiquidityBlocked: true,
        confirmationRequired: true,
        orderExecutable: false,
      },
      promoted: true,
      blockers: [],
    });
    assert.equal(gate.limited.orderExecutable, false);
    assert.equal(
      personalizationEvaluationGateSchema.safeParse({
        ...gate,
        limited: { ...gate.limited, confirmationRequired: false },
      }).success,
      false,
    );
  });
});
