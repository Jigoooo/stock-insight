import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planK4MarketIntelligence } from '../src/analytics/k4-market-intelligence-plan.ts';
import {
  K4_PRIOR_MODEL_KEY,
  K4_PRIOR_MODEL_MINIMUM_PRIOR_OBSERVATIONS,
  planK4PriorModelExpectations,
  priorModelExpectationInputs,
} from '../src/analytics/k4-prior-model-expectation.ts';

const cutoff = '2026-08-08T14:59:59.999Z';

function informationSet() {
  return {
    informationSetId: 'k4:20260808:testdigest',
    validCutoff: cutoff,
    sourceAvailableCutoff: cutoff,
    systemKnownCutoff: cutoff,
    marketObservationCutoff: cutoff,
    semanticSnapshotId: 'k4.semantic.20260808.test',
  };
}

function fact(
  numericFactId: number,
  value: number,
  instantAt: string,
  knownAt: string,
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
    sourceRevisionId: 900 + numericFactId,
    sourcePitQualityId: 800 + numericFactId,
    pitClass: 'PIT_B_VERSIONED_ARTIFACT',
    availableAt: knownAt,
    knownAt,
    locator: { accession: `acc-${numericFactId}` },
    ...overrides,
  };
}

/**
 * Five evenly spaced annual observations. The first four rise by a steady 10,
 * the fifth rises by only 3 — a good actual that still misses the drift.
 */
function annualSeries() {
  return [
    fact(1, 100, '2021-12-31T23:59:59.999Z', '2022-02-15T00:00:00.000Z'),
    fact(2, 110, '2022-12-31T23:59:59.999Z', '2023-02-15T00:00:00.000Z'),
    fact(3, 120, '2023-12-31T23:59:59.999Z', '2024-02-15T00:00:00.000Z'),
    fact(4, 130, '2024-12-31T23:59:59.999Z', '2025-02-15T00:00:00.000Z'),
    fact(5, 133, '2025-12-31T23:59:59.999Z', '2026-02-15T00:00:00.000Z'),
  ];
}

function input(facts: ReturnType<typeof fact>[]) {
  return {
    informationSet: informationSet(),
    securities: [
      {
        securityEntityId: 1,
        issuerEntityId: 101,
        securityIssuerIdentityId: 201,
        sectorPlaybookId: 10,
      },
    ],
    rules: [],
    facts,
    expectations: [],
  };
}

describe('K4 prior-model expectation planner', () => {
  it('forms one annual drift expectation for the latest observed period', () => {
    const plans = planK4PriorModelExpectations(input(annualSeries()));
    assert.equal(plans.length, 1);
    const plan = plans[0]!;
    assert.equal(plan.expectationKind, 'prior_model');
    assert.equal(plan.modelKey, K4_PRIOR_MODEL_KEY);
    assert.equal(plan.issuerEntityId, 101);
    assert.equal(plan.conceptKey, 'InventoryNet');
    assert.equal(plan.targetInstantAt, '2025-12-31T23:59:59.999Z');
    assert.equal(plan.targetPeriodEnd, '2025-12-31');
    // drift = mean(10, 10, 10) = 10 applied to the last prior observation 130
    assert.equal(plan.expectedValue, 140);
    assert.equal(plan.expectedUnit, 'USD');
    assert.equal(plan.priorObservationCount, 4);
  });

  it('reports zero dispersion for a perfectly steady drift', () => {
    const plan = planK4PriorModelExpectations(input(annualSeries()))[0]!;
    assert.equal(plan.dispersion, 0);
  });

  it('reports the population standard deviation of the prior changes', () => {
    const facts = [
      fact(1, 100, '2021-12-31T23:59:59.999Z', '2022-02-15T00:00:00.000Z'),
      fact(2, 110, '2022-12-31T23:59:59.999Z', '2023-02-15T00:00:00.000Z'),
      fact(3, 130, '2023-12-31T23:59:59.999Z', '2024-02-15T00:00:00.000Z'),
      fact(4, 160, '2024-12-31T23:59:59.999Z', '2025-02-15T00:00:00.000Z'),
      fact(5, 175, '2025-12-31T23:59:59.999Z', '2026-02-15T00:00:00.000Z'),
    ];
    const plan = planK4PriorModelExpectations(input(facts))[0]!;
    // changes 10, 20, 30 → mean 20, population stdev sqrt(200/3)
    assert.equal(plan.expectedValue, 180);
    assert.ok(Math.abs(plan.dispersion - Math.sqrt(200 / 3)) < 1e-9);
  });

  it('never uses the target observation itself as a model input', () => {
    const plans = planK4PriorModelExpectations(input(annualSeries()));
    const inputs = priorModelExpectationInputs(plans[0]!);
    assert.deepEqual(
      inputs.map((item) => item.numericFactId),
      [1, 2, 3, 4],
    );
  });

  it('is known strictly before the actual observation became known', () => {
    const facts = annualSeries();
    const plan = planK4PriorModelExpectations(input(facts))[0]!;
    assert.equal(plan.asOfAt, '2025-02-15T00:00:00.000Z');
    assert.equal(plan.availableAt, '2025-02-15T00:00:00.000Z');
    assert.equal(plan.knownAt, '2025-02-15T00:00:00.000Z');
    assert.ok(Date.parse(plan.knownAt) < Date.parse(facts[4]!.knownAt));
  });

  it('refuses to extrapolate from fewer than the minimum prior observations', () => {
    assert.equal(K4_PRIOR_MODEL_MINIMUM_PRIOR_OBSERVATIONS, 3);
    const facts = annualSeries().slice(2); // three facts → only two priors
    assert.deepEqual(planK4PriorModelExpectations(input(facts)), []);
  });

  it('refuses a prior run with a missing year', () => {
    const facts = annualSeries();
    facts.splice(1, 1); // 2021, 2023, 2024 priors are not evenly spaced
    assert.deepEqual(planK4PriorModelExpectations(input(facts)), []);
  });

  it('refuses a target that is not one year after the last prior', () => {
    const facts = annualSeries();
    facts[4] = fact(5, 133, '2026-06-30T23:59:59.999Z', '2026-07-15T00:00:00.000Z');
    assert.deepEqual(planK4PriorModelExpectations(input(facts)), []);
  });

  it('drops observations that are not admissible PIT A/B/C evidence', () => {
    const facts = annualSeries();
    facts[1] = fact(2, 110, '2022-12-31T23:59:59.999Z', '2023-02-15T00:00:00.000Z', {
      pitClass: 'PIT_D_RECONSTRUCTED',
    });
    assert.deepEqual(planK4PriorModelExpectations(input(facts)), []);
  });

  it('drops observations that arrived after the analysis cutoff', () => {
    const facts = annualSeries();
    facts[4] = fact(5, 133, '2025-12-31T23:59:59.999Z', '2026-09-01T00:00:00.000Z');
    // the leaked observation is dropped, leaving a 2024 target built from 2021-2023
    const plan = planK4PriorModelExpectations(input(facts))[0]!;
    assert.equal(plan.targetInstantAt, '2024-12-31T23:59:59.999Z');
    assert.equal(plan.expectedValue, 130);
    assert.ok(Date.parse(plan.knownAt) <= Date.parse(cutoff));
  });

  it('links fiscal years that land a few days apart, as real filings do', () => {
    // A 13-week fiscal calendar: the same quarter drifts by days every year, so exact
    // calendar equality would find no annual pair at all. The quarters in between are
    // present and must not be mistaken for the year-over-year link.
    const quarterly = [
      ['2022-06-02', 100],
      ['2022-09-01', 60],
      ['2022-12-01', 70],
      ['2023-03-02', 80],
      ['2023-06-01', 110],
      ['2023-08-31', 61],
      ['2023-11-30', 71],
      ['2024-02-29', 81],
      ['2024-05-30', 120],
      ['2024-08-29', 62],
      ['2024-11-28', 72],
      ['2025-02-27', 82],
      ['2025-05-29', 130],
      ['2025-08-28', 63],
      ['2025-11-27', 73],
      ['2026-02-26', 83],
      ['2026-05-28', 133],
    ] as const;
    const facts = quarterly.map(([periodEnd, value], index) =>
      fact(index + 1, value, `${periodEnd}T23:59:59.999Z`, `${periodEnd}T00:00:00.000Z`),
    );
    const plan = planK4PriorModelExpectations(input(facts))[0]!;
    assert.equal(plan.targetInstantAt, '2026-05-28T23:59:59.999Z');
    assert.equal(plan.priorObservationCount, 4);
    assert.deepEqual(
      priorModelExpectationInputs(plan).map((item) => item.numericFactId),
      [1, 5, 9, 13],
    );
    // 100 → 110 → 120 → 130 across fiscal years, so the drift is 10 and not the
    // sequential-quarter change between 2026-02-26 and 2026-05-28.
    assert.equal(plan.expectedValue, 140);
  });

  it('never mixes a year-to-date cumulation into a quarterly chain', () => {
    // IFRS filers publish both the quarter and the running year-to-date total under
    // the same concept. A cumulation is not comparable to a quarter, and averaging
    // the two would be invention rather than measurement.
    const duration = (
      id: number,
      value: number,
      periodStart: string,
      periodEnd: string,
      knownAt: string,
    ) => ({
      ...fact(id, value, `${periodEnd}T23:59:59.999Z`, knownAt),
      instantAt: null,
      periodStart,
      periodEnd,
    });
    const facts = [
      duration(1, 77, '2022-01-01', '2022-03-31', '2022-05-15T00:00:00.000Z'),
      duration(2, 63, '2023-01-01', '2023-03-31', '2023-05-15T00:00:00.000Z'),
      duration(3, 71, '2024-01-01', '2024-03-31', '2024-05-15T00:00:00.000Z'),
      duration(4, 79, '2025-01-01', '2025-03-31', '2025-05-15T00:00:00.000Z'),
      // Year-to-date cumulations for the same concept, and a full year.
      duration(5, 153, '2025-01-01', '2025-06-30', '2025-08-15T00:00:00.000Z'),
      duration(6, 239, '2025-01-01', '2025-09-30', '2025-11-15T00:00:00.000Z'),
      duration(7, 333, '2025-01-01', '2025-12-31', '2026-02-15T00:00:00.000Z'),
      duration(8, 133, '2026-01-01', '2026-03-31', '2026-05-15T00:00:00.000Z'),
    ];
    const plan = planK4PriorModelExpectations(input(facts))[0]!;
    assert.equal(plan.periodBasis, 'duration_quarter');
    assert.equal(plan.targetPeriodEnd, '2026-03-31');
    // Only the four first-quarter observations inform it; 153, 239 and 333 are out.
    assert.deepEqual(
      priorModelExpectationInputs(plan).map((item) => item.numericFactId),
      [1, 2, 3, 4],
    );
  });

  it('keys expectations deterministically and independently of the cutoff', () => {
    const first = planK4PriorModelExpectations(input(annualSeries()));
    const later = planK4PriorModelExpectations({
      ...input(annualSeries()),
      informationSet: { ...informationSet(), informationSetId: 'k4:20260809:other' },
    });
    assert.equal(first[0]!.expectationKey, later[0]!.expectationKey);
    assert.match(first[0]!.expectationKey, /^k4:expectation:prior_model:101:us-gaap:InventoryNet:/);
    assert.equal(first[0]!.derivationKey, `k4:derivation:${first[0]!.expectationKey}:v1`);
  });

  it('separates series that differ by unit so unlike units never compare', () => {
    const facts = [
      ...annualSeries(),
      ...annualSeries().map((item) => ({
        ...item,
        numericFactId: item.numericFactId + 50,
        currency: 'KRW',
        sourceRevisionId: item.sourceRevisionId + 50,
        sourcePitQualityId: item.sourcePitQualityId + 50,
      })),
    ];
    const plans = planK4PriorModelExpectations(input(facts));
    assert.deepEqual(
      plans.map((plan) => plan.expectedUnit),
      ['KRW', 'USD'],
    );
  });

  it('lets a good actual and a bad surprise coexist (REQ-EXP-001)', () => {
    const facts = annualSeries();
    const expectations = planK4PriorModelExpectations(input(facts)).map((plan) => ({
      expectationKey: plan.expectationKey,
      issuerEntityId: plan.issuerEntityId,
      conceptNamespace: plan.conceptNamespace,
      conceptKey: plan.conceptKey,
      targetInstantAt: plan.targetInstantAt,
      targetPeriodStart: plan.targetPeriodStart,
      targetPeriodEnd: plan.targetPeriodEnd,
      expectedValue: plan.expectedValue,
      expectedUnit: plan.expectedUnit,
      dispersion: plan.dispersion,
      availableAt: plan.availableAt,
      knownAt: plan.knownAt,
      derivationKey: plan.derivationKey,
      expectationRevisionId: 7,
    }));
    const plan = planK4MarketIntelligence({ ...input(facts), expectations });
    assert.equal(plan.surprises.length, 1);
    const surprise = plan.surprises[0]!;
    // the actual rose 130 → 133, yet it fell short of the 140 drift expectation
    assert.ok(surprise.actualValue > 130);
    assert.equal(surprise.expectedValue, 140);
    assert.equal(surprise.rawSurprise, -7);
    assert.equal(surprise.direction, 'negative');
  });
});
