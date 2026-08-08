import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { personalizationPortfolioImpactV2Schema } from '../src/personalization.ts';

const scoreKinds = [
  'evidence_confidence',
  'relation_strength',
  'materiality',
  'transmission',
  'direction',
  'lag',
  'market_reflection',
  'model_uncertainty',
] as const;

function exposure(id: string, unit: string) {
  return {
    exposureRevisionId: id,
    evaluationRevisionId: String(Number(id) + 100),
    entityKey: 'US:NVDA',
    portfolioWeight: 0.1,
    direction: 'negative' as const,
    economicMagnitude: { value: 12, unit },
    materiality: 0.2,
    uncertainty: 0.2,
    epistemicConfidence: 0.8,
    scoreComponents: scoreKinds.map((kind) => ({ kind, value: 0.5, rationale: kind })),
    references: {
      securityIssuerIdentityId: '11',
      sectorPlaybookId: '12',
      businessDriverId: '13',
      businessDriverMeasurementRuleId: '14',
      analysisInformationSet: {
        informationSetId: 'k4:2026-08-08',
        validCutoff: '2026-08-08T14:59:59.999Z',
        sourceAvailableCutoff: '2026-08-08T14:59:59.999Z',
        systemKnownCutoff: '2026-08-08T14:59:59.999Z',
        marketObservationCutoff: '2026-08-08T14:59:59.999Z',
        semanticSnapshotId: 'snapshot-1',
      },
      derivationId: '15',
      eventRevisionId: '16',
      evidence: [
        {
          numericFactId: '21',
          sourceRevisionId: '31',
          sourcePitQualityId: '41',
          pitQualityClass: 'PIT_C_OUR_ARCHIVE',
          inputRole: 'current',
        },
        {
          numericFactId: '22',
          sourceRevisionId: '32',
          sourcePitQualityId: '42',
          pitQualityClass: 'PIT_C_OUR_ARCHIVE',
          inputRole: 'comparison',
        },
      ],
      pathSteps: [{ impactPathStepId: '51', citationRole: 'economic_basis' }],
    },
  };
}

function response() {
  return {
    schemaVersion: 'p4.v2' as const,
    availability: 'available' as const,
    portfolioSnapshotId: '11111111-1111-4111-8111-111111111111',
    eventId: null,
    scenarioId: null,
    knownAt: '2026-08-09T00:00:00.000Z',
    generatedAt: '2026-08-09T00:00:00.000Z',
    groups: [
      {
        horizon: 'short' as const,
        channel: 'operational_capacity',
        economicMagnitude: { unit: 'USD' },
        exposures: [exposure('1', 'USD')],
      },
      {
        horizon: 'short' as const,
        channel: 'operational_capacity',
        economicMagnitude: { unit: 'shares' },
        exposures: [exposure('2', 'shares')],
      },
    ],
    coverage: Array.from({ length: 10 }, (_, index) => ({
      entityKey: `KR:${String(index + 1).padStart(6, '0')}`,
      portfolioWeight: index === 0 ? 0.1 : null,
      evaluationCount: 1,
      acceptedEvaluationCount: index === 0 ? 1 : 0,
      reasonCodes: index === 0 ? [] : ['no_recent_observation'],
      reasonDetails: index === 0 ? [] : ['no cutoff-valid observation'],
    })),
  };
}

describe('p4.v2 unit-aware portfolio impact contract', () => {
  it('keeps unlike units in separate groups and exposes no scalar aggregateImpact', () => {
    const parsed = personalizationPortfolioImpactV2Schema.parse(response());
    assert.deepEqual(
      parsed.groups.map((group) => group.economicMagnitude.unit),
      ['USD', 'shares'],
    );
    assert.equal('aggregateImpact' in parsed, false);
    assert.equal(parsed.coverage.length, 10);
    assert.equal(parsed.groups[0]?.exposures[0]?.scoreComponents.length, 8);
    assert.equal(
      personalizationPortfolioImpactV2Schema.safeParse({ ...response(), aggregateImpact: 12 })
        .success,
      false,
    );
  });

  it('rejects a group whose exposure unit differs from the group key', () => {
    const value = response();
    value.groups[0]!.exposures[0]!.economicMagnitude.unit = 'shares';
    assert.equal(personalizationPortfolioImpactV2Schema.safeParse(value).success, false);
  });

  it('requires the exact eight score kinds and current/comparison PIT A/B/C evidence', () => {
    const value = response();
    value.groups[0]!.exposures[0]!.scoreComponents.pop();
    assert.equal(personalizationPortfolioImpactV2Schema.safeParse(value).success, false);
    const pitE = response();
    pitE.groups[0]!.exposures[0]!.references.evidence[0]!.pitQualityClass =
      'PIT_E_UNVERSIONED_FEED';
    assert.equal(personalizationPortfolioImpactV2Schema.safeParse(pitE).success, false);
  });

  it('requires complete ten-security coverage whenever computation is available', () => {
    const incomplete = response();
    incomplete.coverage.pop();
    assert.equal(personalizationPortfolioImpactV2Schema.safeParse(incomplete).success, false);
  });

  it('allows not_computed only with no groups and no partial coverage', () => {
    const unavailable = {
      ...response(),
      availability: 'not_computed' as const,
      groups: [],
      coverage: [],
    };
    assert.equal(personalizationPortfolioImpactV2Schema.safeParse(unavailable).success, true);
    assert.equal(
      personalizationPortfolioImpactV2Schema.safeParse({ ...unavailable, availability: 'stale' })
        .success,
      false,
    );
  });
});
