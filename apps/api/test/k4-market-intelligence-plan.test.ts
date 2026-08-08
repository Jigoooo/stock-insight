import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildK4DailyCutoffs,
  digestK4MarketIntelligencePlan,
  planK4MarketIntelligence,
  planK4OutcomeRows,
} from '../src/analytics/k4-market-intelligence-plan.ts';

const cutoff = '2026-08-08T14:59:59.999Z';

function security(securityEntityId: number) {
  return {
    securityEntityId,
    issuerEntityId: securityEntityId + 100,
    securityIssuerIdentityId: securityEntityId + 200,
    sectorPlaybookId: 10,
  };
}

function rule(securityEntityId: number) {
  return {
    securityEntityId,
    issuerEntityId: securityEntityId + 100,
    sectorPlaybookId: 10,
    businessDriverId: 20,
    businessDriverMeasurementRuleId: 30,
    driverKey: 'inventory_position',
    ruleKey: 'inventory_yoy',
    comparisonMethod: 'period_end_year_over_year_delta' as const,
    outputUnit: 'currency',
    outputCurrency: 'USD',
    inputConceptSelectors: [{ conceptNamespace: 'us-gaap', conceptKeys: ['InventoryNet'] }],
    directionPolicy: { positive: 'negative', negative: 'positive', zero: 'ambiguous' },
    materialityPolicy: { method: 'absolute_change_over_prior_absolute' },
    minimumHistoryObservations: 2,
    allowedPitClasses: ['PIT_A_NATIVE_VINTAGE', 'PIT_B_VERSIONED_ARTIFACT', 'PIT_C_OUR_ARCHIVE'],
    horizon: 'short' as const,
    channelClass: 'operational_capacity',
  };
}

function fact(
  numericFactId: number,
  value: number,
  instantAt: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    numericFactId,
    entityId: 101,
    conceptNamespace: 'us-gaap',
    conceptKey: 'InventoryNet',
    value,
    unit: 'currency',
    currency: 'USD',
    instantAt,
    periodStart: null,
    periodEnd: null,
    sourceRevisionId: numericFactId + 1_000,
    sourcePitQualityId: numericFactId + 2_000,
    pitClass: 'PIT_A_NATIVE_VINTAGE',
    availableAt: '2026-08-01T12:00:00.000Z',
    knownAt: '2026-08-01T12:01:00.000Z',
    locator: { accession: `accession-${numericFactId}`, filed: '2026-08-01' },
    ...overrides,
  };
}

function baseInput() {
  return {
    informationSet: {
      informationSetId: 'k4:2026-08-08',
      validCutoff: cutoff,
      sourceAvailableCutoff: cutoff,
      systemKnownCutoff: cutoff,
      marketObservationCutoff: cutoff,
    },
    securities: [security(1)],
    rules: [rule(1)],
    facts: [fact(1, 120, '2025-12-31T23:59:59.999Z'), fact(2, 100, '2024-12-31T23:59:59.999Z')],
    expectations: [
      {
        expectationKey: 'prior-model:101:InventoryNet:2025-12-31',
        issuerEntityId: 101,
        conceptNamespace: 'us-gaap',
        conceptKey: 'InventoryNet',
        targetInstantAt: '2025-12-31T23:59:59.999Z',
        expectedValue: 130,
        expectedUnit: 'USD',
        dispersion: 5,
        availableAt: '2026-08-01T10:00:00.000Z',
        knownAt: '2026-08-01T10:01:00.000Z',
        derivationKey: 'expectation:101:InventoryNet:2025-12-31',
      },
    ],
  };
}

describe('K4 seven-cutoff replay planning', () => {
  it('builds all seven KST end-of-day cutoffs without pretending a live week elapsed', () => {
    assert.deepEqual(
      buildK4DailyCutoffs({
        from: '2026-08-02',
        to: '2026-08-08',
        kstCutoffTime: '23:59:59.999',
      }),
      [
        '2026-08-02T14:59:59.999Z',
        '2026-08-03T14:59:59.999Z',
        '2026-08-04T14:59:59.999Z',
        '2026-08-05T14:59:59.999Z',
        '2026-08-06T14:59:59.999Z',
        '2026-08-07T14:59:59.999Z',
        '2026-08-08T14:59:59.999Z',
      ],
    );
  });

  it('keeps a positive actual change and a negative surprise as separate claims', () => {
    const plan = planK4MarketIntelligence(baseInput());
    assert.equal(plan.evaluations[0]?.evaluationDisposition, 'accepted');
    assert.equal(plan.evaluations[0]?.measurementValue, 20);
    assert.equal(plan.evaluations[0]?.direction, 'negative');
    assert.equal(plan.surprises[0]?.rawSurprise, -10);
    assert.equal(plan.surprises[0]?.direction, 'negative');
    assert.equal(
      plan.surprises[0]?.surpriseKey,
      'k4:surprise:k4:2026-08-08:prior-model:101:InventoryNet:2025-12-31:1',
    );
    assert.equal(plan.exposures.length, 1);
    assert.match(String(plan.shocks[0]?.shockKey), /:1:2$/);
    assert.deepEqual(
      plan.exposures[0]?.scoreComponents.map((component) => component.componentKind).sort(),
      [
        'direction',
        'evidence_confidence',
        'lag',
        'market_reflection',
        'materiality',
        'model_uncertainty',
        'relation_strength',
        'transmission',
      ],
    );
    const scores = Object.fromEntries(
      plan.exposures[0]!.scoreComponents.map((row) => [row.componentKind, row.componentValue]),
    );
    assert.equal(scores.market_reflection, 0);
    assert.equal(scores.transmission, 1);
  });

  it('refuses to turn an unexplained revenue surprise into demand, ASP, or mix', () => {
    const input = baseInput();
    input.facts = [
      fact(10, 150, '2025-12-31T23:59:59.999Z', {
        conceptKey: 'RevenueFromContractWithCustomerExcludingAssessedTax',
      }),
    ];
    input.expectations = [
      {
        ...input.expectations[0]!,
        expectationKey: 'prior-model:101:Revenue:2025-12-31',
        conceptKey: 'RevenueFromContractWithCustomerExcludingAssessedTax',
        expectedValue: 140,
      },
    ];
    const plan = planK4MarketIntelligence(input);
    assert.equal(plan.surprises.length, 1);
    assert.equal(plan.evaluations[0]?.evaluationDisposition, 'ambiguous_driver_attribution');
    assert.match(plan.evaluations[0]?.reasonDetail ?? '', /revenue.*cause/i);
    assert.equal(plan.exposures.length, 0);
  });

  it('rejects future-known and PIT E evidence instead of leaking it into acceptance', () => {
    for (const overrides of [
      { knownAt: '2026-08-09T00:00:00.000Z' },
      { pitClass: 'PIT_E_UNKNOWN_OR_IRREPRODUCIBLE' },
    ]) {
      const input = baseInput();
      input.facts = [input.facts[0]!, { ...input.facts[1]!, ...overrides }];
      const plan = planK4MarketIntelligence(input);
      assert.equal(plan.evaluations[0]?.evaluationDisposition, 'no_pit_evidence');
      assert.equal(plan.exposures.length, 0);
    }
  });

  it('ignores inadmissible later rows when a complete PIT-safe pair already exists', () => {
    const input = baseInput();
    input.facts.push(
      fact(3, 140, '2026-12-31T23:59:59.999Z', {
        knownAt: '2026-08-09T00:00:00.000Z',
      }),
    );
    const plan = planK4MarketIntelligence(input);
    assert.equal(plan.evaluations[0]?.evaluationDisposition, 'accepted');
    assert.equal(plan.evaluations[0]?.measurementValue, 20);
  });

  it('matches calendar years exactly as comparison plus one PostgreSQL year', () => {
    const input = baseInput();
    input.facts = [
      fact(1, 120, '2025-02-28T23:59:59.999Z'),
      fact(2, 100, '2024-02-29T23:59:59.999Z'),
    ];
    const plan = planK4MarketIntelligence(input);
    assert.equal(plan.evaluations[0]?.evaluationDisposition, 'accepted');
    assert.equal(plan.evaluations[0]?.measurementValue, 20);
  });

  it('rejects measurement pairs whose units do not match the executable rule', () => {
    const input = baseInput();
    input.facts = [input.facts[0]!, { ...input.facts[1]!, unit: 'shares', currency: null }];
    const plan = planK4MarketIntelligence(input);
    assert.equal(plan.evaluations[0]?.evaluationDisposition, 'unsupported_measurement');
    assert.match(plan.evaluations[0]?.reasonDetail ?? '', /unit/i);
    assert.equal(plan.exposures.length, 0);
  });

  it('always emits explicit coverage for all ten requested securities', () => {
    const input = baseInput();
    input.securities = Array.from({ length: 10 }, (_, index) => security(index + 1));
    const plan = planK4MarketIntelligence(input);
    assert.equal(plan.coverage.length, 10);
    assert.deepEqual(
      plan.coverage.map((row) => row.securityEntityId),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    assert.equal(plan.coverage[0]?.acceptedEvaluationCount, 1);
    assert.equal(plan.coverage[9]?.reasonCodes[0], 'unsupported_measurement');
  });

  it('evaluates only outcomes backed by a mature trading-session bar', () => {
    const rows = planK4OutcomeRows({
      exposureKey: 'k4:exposure:1',
      anchorSessionDate: '2026-07-31',
      marketDataCutoff: cutoff,
      securityBars: [
        { sessionDate: '2026-07-31', close: 100, knownAt: '2026-07-31T21:00:00Z' },
        { sessionDate: '2026-08-03', close: 110, knownAt: '2026-08-03T21:00:00Z' },
        { sessionDate: '2026-08-04', close: 120, knownAt: '2026-08-04T21:00:00Z' },
      ],
      benchmarkBars: [
        { sessionDate: '2026-07-31', close: 200, knownAt: '2026-07-31T21:00:00Z' },
        { sessionDate: '2026-08-03', close: 210, knownAt: '2026-08-03T21:00:00Z' },
        { sessionDate: '2026-08-04', close: 220, knownAt: '2026-08-04T21:00:00Z' },
      ],
    });
    assert.equal(rows[0]?.horizonSessions, 1);
    assert.equal(rows[0]?.outcomeState, 'evaluated');
    assert.ok(Math.abs((rows[0]?.abnormalReturn ?? 0) - 0.05) < 1e-12);
    assert.deepEqual(
      rows.slice(1).map((row) => row.outcomeState),
      ['pending', 'pending'],
    );
  });

  it('produces the same digest when database rows arrive in reverse order', () => {
    const left = baseInput();
    const right = baseInput();
    right.facts = [...right.facts].reverse();
    right.securities = [...right.securities].reverse();
    right.rules = [...right.rules].reverse();
    right.expectations = [...right.expectations].reverse();
    const leftPlan = planK4MarketIntelligence(left);
    const rightPlan = planK4MarketIntelligence(right);
    assert.deepEqual(rightPlan, leftPlan);
    assert.equal(
      digestK4MarketIntelligencePlan(rightPlan),
      digestK4MarketIntelligencePlan(leftPlan),
    );
  });
});
