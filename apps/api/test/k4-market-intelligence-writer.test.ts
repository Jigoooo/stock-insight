import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  persistK4MarketIntelligencePlan,
  type K4PersistenceClient,
} from '../src/analytics/k4-market-intelligence-writer.ts';

const cutoff = '2026-08-08T14:59:59.999Z';
const requestDigest = 'a'.repeat(64);
const planDigest = 'b'.repeat(64);

function plan() {
  const rejectedEvaluations = Array.from({ length: 9 }, (_, index) => ({
    evaluationKey: `k4:evaluation:k4:20260808:fixture:${index + 2}:coverage`,
    securityEntityId: index + 2,
    issuerEntityId: null,
    securityIssuerIdentityId: null,
    sectorPlaybookId: null,
    businessDriverId: null,
    businessDriverMeasurementRuleId: null,
    driverKey: null,
    ruleKey: null,
    evaluationDisposition: 'missing_identity' as const,
    reasonDetail: 'identity missing at cutoff',
    measurementValue: null,
    measurementUnit: null,
    measurementCurrency: null,
    direction: null,
    materiality: null,
    evidence: [],
  }));
  const scoreKinds = [
    'evidence_confidence',
    'relation_strength',
    'materiality',
    'transmission',
    'direction',
    'lag',
    'market_reflection',
    'model_uncertainty',
  ];
  return {
    informationSet: {
      informationSetId: 'k4:20260808:fixture',
      validCutoff: cutoff,
      sourceAvailableCutoff: cutoff,
      systemKnownCutoff: cutoff,
      marketObservationCutoff: cutoff,
      semanticSnapshotId: 'snapshot-before-cutoff',
    },
    expectations: [
      {
        expectationRevisionId: 77,
        expectationKey: 'prior-model:101:InventoryNet:2026-06-30',
        issuerEntityId: 101,
        conceptNamespace: 'us-gaap',
        conceptKey: 'InventoryNet',
        targetInstantAt: '2026-06-30T23:59:59.999Z',
        expectedValue: 125,
        expectedUnit: 'USD',
        dispersion: 5,
        availableAt: '2026-07-31T12:00:00.000Z',
        knownAt: '2026-07-31T12:01:00.000Z',
        derivationKey: 'expectation:101:InventoryNet:2026-06-30',
      },
    ],
    surprises: [
      {
        surpriseKey: 'k4:surprise:k4:20260808:fixture:prior-model:101:InventoryNet:2026-06-30:1',
        expectationKey: 'prior-model:101:InventoryNet:2026-06-30',
        actualNumericFactId: 1,
        actualValue: 120,
        expectedValue: 125,
        rawSurprise: -5,
        standardizedSurprise: -1,
        direction: 'negative',
        materiality: 0.04,
        unit: 'USD',
      },
    ],
    filingEvents: [
      {
        eventKey: 'k4:filing:101:1001',
        eventType: 'regulatory_filing_numeric_fact',
        issuerEntityId: 101,
        sourceRevisionId: 1001,
        availableAt: '2026-08-01T12:00:00.000Z',
        knownAt: '2026-08-01T12:01:00.000Z',
        locator: { accession: 'a1' },
      },
    ],
    shocks: [
      {
        shockKey: 'k4:filing:101:1001:inventory_position:1:2',
        eventKey: 'k4:filing:101:1001',
        shockType: 'measured_driver_change',
        magnitude: 20,
        magnitudeUnit: 'USD',
        availableAt: '2026-08-01T12:00:00.000Z',
        knownAt: '2026-08-01T12:01:00.000Z',
      },
    ],
    evaluations: [
      {
        evaluationKey: 'k4:evaluation:k4:20260808:fixture:1:inventory_position',
        securityEntityId: 1,
        issuerEntityId: 101,
        securityIssuerIdentityId: 201,
        sectorPlaybookId: 10,
        businessDriverId: 20,
        businessDriverMeasurementRuleId: 30,
        driverKey: 'inventory_position',
        ruleKey: 'inventory_yoy',
        evaluationDisposition: 'accepted',
        reasonDetail: null,
        measurementValue: 20,
        measurementUnit: 'currency',
        measurementCurrency: 'USD',
        direction: 'negative',
        materiality: 0.2,
        evidence: [
          {
            numericFactId: 1,
            sourceRevisionId: 1001,
            sourcePitQualityId: 2001,
            inputRole: 'current',
          },
          {
            numericFactId: 2,
            sourceRevisionId: 1002,
            sourcePitQualityId: 2001,
            inputRole: 'comparison',
          },
        ],
      },
      ...rejectedEvaluations,
    ],
    exposures: [
      {
        exposureKey: 'k4:exposure:k4:20260808:fixture:1:inventory_position',
        evaluationKey: 'k4:evaluation:k4:20260808:fixture:1:inventory_position',
        shockKey: 'k4:filing:101:1001:inventory_position:1:2',
        eventKey: 'k4:filing:101:1001',
        securityEntityId: 1,
        issuerEntityId: 101,
        channelClass: 'operational_capacity',
        sign: 'negative',
        horizon: 'short',
        economicMagnitude: 20,
        economicMagnitudeUnit: 'USD',
        materiality: 0.2,
        uncertainty: 0.1,
        epistemicConfidence: 0.9,
        scoreComponents: scoreKinds.map((componentKind) => ({
          componentKind,
          componentValue: 0.5,
          rationale: componentKind,
        })),
      },
    ],
    valuations: [
      {
        valuationEstimateKey: 'k4:valuation:k4:20260808:fixture:1:inventory_position',
        securityEntityId: 1,
        methodKey: 'inventory-adjusted-range',
        lowerEstimate: 90,
        upperEstimate: 110,
        estimateUnit: 'USD_per_share',
        horizon: 'short',
        evaluationKey: 'k4:evaluation:k4:20260808:fixture:1:inventory_position',
      },
    ],
    pathCitations: [
      {
        impactPathStepId: 501,
        exposureKey: 'k4:exposure:k4:20260808:fixture:1:inventory_position',
        citationRole: 'economic_basis',
      },
    ],
    coverage: [
      { securityEntityId: 1, acceptedEvaluationCount: 1, evaluationCount: 1, reasonCodes: [] },
      ...rejectedEvaluations.map((evaluation) => ({
        securityEntityId: evaluation.securityEntityId,
        acceptedEvaluationCount: 0,
        evaluationCount: 1,
        reasonCodes: ['missing_identity'],
      })),
    ],
  };
}

function outcomes() {
  return ([1, 5, 20] as const).map((horizonSessions) => ({
    outcomeKey: `k4:outcome:1:${horizonSessions}`,
    exposureKey: 'k4:exposure:k4:20260808:fixture:1:inventory_position',
    horizonSessions,
    anchorSessionDate: '2026-07-31',
    outcomeState: 'pending' as const,
    outcomeSessionDate: null,
    securityReturn: null,
    benchmarkReturn: null,
    abnormalReturn: null,
    marketDataKnownAt: null,
  }));
}

function tag(sql: string): string {
  return /\/\* (k4_[a-z0-9_]+) \*\//.exec(sql)?.[1] ?? 'untagged';
}

class FakeWriterClient implements K4PersistenceClient {
  readonly calls: Array<{ tag: string; sql: string; params: readonly unknown[] }> = [];
  private readonly receipt: Record<string, unknown> | null;

  constructor(receipt: Record<string, unknown> | null = null) {
    this.receipt = receipt;
  }

  async query(sql: string, params: readonly unknown[] = []) {
    const queryTag = tag(sql);
    this.calls.push({ tag: queryTag, sql, params });
    const rows: Array<Record<string, unknown>> = (() => {
      switch (queryTag) {
        case 'k4_read_receipt':
          return this.receipt ? [this.receipt] : [];
        case 'k4_verify_information_set':
          return [
            {
              mode: 'EX_ANTE',
              valid_cutoff: cutoff,
              source_available_cutoff: cutoff,
              system_known_cutoff: cutoff,
              market_observation_cutoff: cutoff,
              semantic_snapshot_id: 'snapshot-before-cutoff',
            },
          ];
        case 'k4_insert_event':
          return [{ event_id: 11 }];
        case 'k4_insert_event_revision':
          return [{ event_revision_id: 12 }];
        case 'k4_insert_derivation':
          return [{ derivation_id: 21 }];
        case 'k4_insert_derivation_step':
          return [{ derivation_step_id: 22 }];
        case 'k4_compute_derivation_digest':
          return [{ derivation_digest: 'd'.repeat(64) }];
        case 'k4_seal_derivation':
          return [{ derivation_id: 21 }];
        case 'k4_read_expectation_basis_facts':
          return [{ numeric_fact_id: 91 }, { numeric_fact_id: 92 }];
        case 'k4_insert_shock':
          return [{ impact_shock_id: 31 }];
        case 'k4_read_channel':
          return [{ impact_channel_id: 32 }];
        case 'k4_insert_exposure':
          return [{ impact_exposure_revision_id: 41 }];
        case 'k4_insert_accepted_evaluation':
          return [{ impact_evaluation_revision_id: 42 }];
        case 'k4_insert_rejected_evaluation':
          return [{ impact_evaluation_revision_id: 43 }];
        case 'k4_seal_exposure':
          return [{ impact_exposure_revision_id: 41 }];
        case 'k4_insert_receipt':
          return [{ market_intelligence_run_receipt_id: 51 }];
        default:
          return [];
      }
    })();
    return { rows, rowCount: rows.length };
  }
}

describe('K4 market-intelligence persistence', () => {
  it('treats an exact existing receipt as a zero-write idempotent rerun', async () => {
    const client = new FakeWriterClient({
      market_intelligence_run_receipt_id: 7,
      plan_digest: planDigest,
      accepted_evaluation_count: 1,
      evaluation_count: 10,
      sealed_exposure_count: 1,
      surprise_count: 1,
      valuation_count: 1,
      outcome_count: 3,
    });
    const result = await persistK4MarketIntelligencePlan(client, plan(), {
      runKind: 'replay',
      cutoff,
      requestDigest,
      planDigest,
    });
    assert.equal(result.idempotent, true);
    assert.equal(result.acceptedEvaluationCount, 1);
    assert.equal(result.rejectedEvaluationCount, 9);
    assert.equal(result.sealedExposureCount, 1);
    assert.equal(result.surpriseCount, 1);
    assert.equal(result.valuationCount, 1);
    assert.equal(result.outcomeCount, 3);
    assert.deepEqual(
      client.calls.map((call) => call.tag),
      ['k4_read_receipt'],
    );
  });

  it('fails closed before writes when the cutoff receipt has another plan digest', async () => {
    const client = new FakeWriterClient({
      market_intelligence_run_receipt_id: 7,
      plan_digest: 'c'.repeat(64),
    });
    await assert.rejects(
      persistK4MarketIntelligencePlan(client, plan(), {
        runKind: 'replay',
        cutoff,
        requestDigest,
        planDigest,
      }),
      /digest/i,
    );
    assert.deepEqual(
      client.calls.map((call) => call.tag),
      ['k4_read_receipt'],
    );
  });

  it('writes the complete accepted basis before sealing and appends the receipt last', async () => {
    const client = new FakeWriterClient();
    const result = await persistK4MarketIntelligencePlan(client, plan(), {
      runKind: 'replay',
      cutoff,
      requestDigest,
      planDigest,
      outcomes: outcomes(),
    });
    const tags = client.calls.map((call) => call.tag);
    const before = (left: string, right: string) =>
      assert.ok(
        tags.indexOf(left) >= 0 && tags.indexOf(left) < tags.indexOf(right),
        `${left} < ${right}`,
      );
    before('k4_insert_information_set', 'k4_insert_event');
    before('k4_insert_event', 'k4_insert_event_revision');
    before('k4_insert_event_revision', 'k4_insert_event_participant');
    before('k4_insert_event_participant', 'k4_insert_derivation');
    before('k4_insert_derivation', 'k4_insert_shock');
    before('k4_insert_shock', 'k4_insert_exposure');
    before('k4_insert_exposure', 'k4_insert_accepted_evaluation');
    before('k4_insert_accepted_evaluation', 'k4_insert_evaluation_evidence');
    before('k4_insert_evaluation_evidence', 'k4_insert_score_components');
    before('k4_insert_score_components', 'k4_seal_exposure');
    before('k4_seal_exposure', 'k4_insert_path_citation');
    assert.equal(tags.at(-1), 'k4_insert_receipt');
    assert.equal(result.idempotent, false);
    assert.equal(result.acceptedEvaluationCount, 1);
    assert.equal(result.rejectedEvaluationCount, 9);
    assert.equal(result.sealedExposureCount, 1);
    assert.equal(result.surpriseCount, 1);
    assert.equal(result.valuationCount, 1);
    assert.equal(result.outcomeCount, 3);
    assert.equal(tags.filter((value) => value === 'k4_insert_surprise').length, 1);
    assert.equal(tags.filter((value) => value === 'k4_insert_valuation').length, 1);
    assert.equal(tags.filter((value) => value === 'k4_insert_outcome').length, 3);
    assert.equal(
      client.calls.some((call) => /\bFOR (SHARE|UPDATE)\b/.test(call.sql)),
      false,
      'append-only writer reads must not require UPDATE privileges',
    );
  });

  it('never cites another derivation from the surprise derivation', async () => {
    // Migration 031 makes a derivation a self-contained DAG — a derivation_input may
    // only reference an earlier step of the same derivation. The surprise writer used
    // to cite the expectation's step across derivations, which the kernel rejects with
    // `derivation step input must reference an earlier step in the same derivation`.
    // Nothing produced expectations until 2026-08-10, so the path had never executed
    // and the defect only surfaced once the analytics pipeline was unblocked.
    const client = new FakeWriterClient();
    await persistK4MarketIntelligencePlan(client, plan(), {
      runKind: 'replay',
      cutoff,
      requestDigest,
      planDigest,
    });
    const inputs = client.calls.filter((call) => call.tag === 'k4_insert_derivation_input');
    assert.ok(inputs.length > 0);
    // param 4 is source_derivation_step_id, param 2 is input_kind.
    assert.deepEqual([...new Set(inputs.map((call) => call.params[2]))], ['numeric_fact']);
    assert.deepEqual([...new Set(inputs.map((call) => call.params[4]))], [null]);
    // The expectation's own basis facts are what the surprise cites instead.
    const roles = new Set(inputs.map((call) => call.params[5]));
    assert.ok(roles.has('expected_basis'));
    assert.ok(!roles.has('expected'));
  });

  it('rejects an evaluation whose security is not in coverage, before any database statement', async () => {
    // "The whole requested universe was evaluated" moved to the store, which is the
    // only place that knows what was requested. What the writer still owns is that
    // the plan is internally consistent: every evaluation names a covered security.
    const client = new FakeWriterClient();
    const invalid = plan();
    invalid.coverage.pop();
    await assert.rejects(
      persistK4MarketIntelligencePlan(client, invalid, {
        runKind: 'replay',
        cutoff,
        requestDigest,
        planDigest,
      }),
      /outside requested coverage/i,
    );
    assert.deepEqual(client.calls, []);
  });

  it('rejects an empty coverage plan', async () => {
    const client = new FakeWriterClient();
    const empty = plan();
    empty.coverage = [];
    empty.evaluations = [];
    await assert.rejects(
      persistK4MarketIntelligencePlan(client, empty, {
        runKind: 'replay',
        cutoff,
        requestDigest,
        planDigest,
      }),
      /non-empty coverage/i,
    );
    assert.deepEqual(client.calls, []);
  });

  it('rejects the same security appearing twice in coverage', async () => {
    // Ten hand-picked tickers could not collide. A universe resolved through issuers
    // can, which is the grain hazard that already bit the common asset view.
    const client = new FakeWriterClient();
    const duplicated = plan();
    const first = duplicated.coverage[0];
    if (first) duplicated.coverage.push({ ...first });
    await assert.rejects(
      persistK4MarketIntelligencePlan(client, duplicated, {
        runKind: 'replay',
        cutoff,
        requestDigest,
        planDigest,
      }),
      /distinct securities/i,
    );
    assert.deepEqual(client.calls, []);
  });

  it('rejects a malformed score decomposition before any database statement', async () => {
    const client = new FakeWriterClient();
    const invalid = plan();
    invalid.exposures[0]!.scoreComponents.pop();
    await assert.rejects(
      persistK4MarketIntelligencePlan(client, invalid, {
        runKind: 'replay',
        cutoff,
        requestDigest,
        planDigest,
      }),
      /eight score components/i,
    );
    assert.deepEqual(client.calls, []);
  });
});
