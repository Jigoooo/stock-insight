import {
  K4_PLANNER_VERSION,
  K4_SCORE_COMPONENT_KINDS,
  K4_SCORE_FORMULA_VERSION,
  type EvaluationPlan,
  type K4FilingEventPlan,
  type K4MarketIntelligencePlan,
  type K4ShockPlan,
} from './k4-market-intelligence-plan.ts';
import { K4_SHADOW_COHORT_SIZE, K4_SHADOW_COHORT_VERSION } from './k4-shadow-cohort.ts';

export type K4PersistenceResult = {
  receiptId: number;
  idempotent: boolean;
  acceptedEvaluationCount: number;
  rejectedEvaluationCount: number;
  sealedExposureCount: number;
  surpriseCount: number;
  valuationCount: number;
  outcomeCount: number;
};

export type K4OutcomePlan = {
  outcomeKey: string;
  exposureKey: string;
  horizonSessions: 1 | 5 | 20;
  anchorSessionDate: string;
  outcomeState: 'pending' | 'evaluated';
  outcomeSessionDate: string | null;
  securityReturn: number | null;
  benchmarkReturn: number | null;
  abnormalReturn: number | null;
  marketDataKnownAt: string | null;
};

export type K4PersistenceOptions = {
  runKind: 'replay' | 'canary';
  cutoff: string;
  requestDigest: string;
  planDigest: string;
  outcomes?: readonly K4OutcomePlan[];
};

export type K4PersistenceClient = {
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

type DerivationInput =
  | { kind: 'numeric_fact'; numericFactId: number; role: string }
  | { kind: 'derivation_step'; derivationStepId: number; role: string };

type SealedDerivation = { derivationId: number; derivationStepId: number };

function positiveId(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} was not returned`);
  return parsed;
}

function iso(value: unknown): string {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.valueOf())) throw new Error('database returned an invalid timestamp');
  return parsed.toISOString();
}

function requireDigest(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a lowercase SHA-256`);
}

function validateK4PersistencePlan(
  plan: K4MarketIntelligencePlan,
  outcomes: readonly K4OutcomePlan[],
): void {
  const coverageIds = new Set(plan.coverage.map((row) => row.securityEntityId));
  // Two different properties, so two different errors. Size says the whole cohort was
  // evaluated; the set says no security was evaluated twice. They were one condition
  // while the cohort was ten hand-picked tickers that could not collide — a wider
  // cohort resolved through issuers can, which is the grain hazard that already bit
  // the common asset view's numeric facts.
  if (plan.coverage.length !== K4_SHADOW_COHORT_SIZE) {
    throw new Error(
      `K4 persistence requires the whole cohort: ${K4_SHADOW_COHORT_SIZE} securities, got ${plan.coverage.length}`,
    );
  }
  if (coverageIds.size !== plan.coverage.length) {
    throw new Error(
      `K4 coverage names ${plan.coverage.length} rows but only ${coverageIds.size} distinct securities`,
    );
  }

  const evaluationKeys = new Set<string>();
  for (const evaluation of plan.evaluations) {
    if (evaluationKeys.has(evaluation.evaluationKey)) {
      throw new Error(`duplicate K4 evaluation key ${evaluation.evaluationKey}`);
    }
    evaluationKeys.add(evaluation.evaluationKey);
    if (!coverageIds.has(evaluation.securityEntityId)) {
      throw new Error('K4 evaluation is outside requested coverage');
    }
  }
  for (const coverage of plan.coverage) {
    const rows = plan.evaluations.filter(
      (evaluation) => evaluation.securityEntityId === coverage.securityEntityId,
    );
    const acceptedCount = rows.filter(
      (evaluation) => evaluation.evaluationDisposition === 'accepted',
    ).length;
    const reasonCodes = [
      ...new Set(
        rows
          .filter((evaluation) => evaluation.evaluationDisposition !== 'accepted')
          .map((evaluation) => evaluation.evaluationDisposition),
      ),
    ].sort();
    if (
      rows.length !== coverage.evaluationCount ||
      acceptedCount !== coverage.acceptedEvaluationCount ||
      JSON.stringify(reasonCodes) !== JSON.stringify([...coverage.reasonCodes].sort())
    ) {
      throw new Error(`K4 coverage summary differs for security ${coverage.securityEntityId}`);
    }
  }

  const accepted = new Map(
    plan.evaluations
      .filter((evaluation) => evaluation.evaluationDisposition === 'accepted')
      .map((evaluation) => [evaluation.evaluationKey, evaluation]),
  );
  const exposureKeys = new Set<string>();
  const exposedEvaluations = new Set<string>();
  const shockByKey = new Map(plan.shocks.map((shock) => [shock.shockKey, shock]));
  const eventKeys = new Set(plan.filingEvents.map((event) => event.eventKey));
  if (shockByKey.size !== plan.shocks.length || eventKeys.size !== plan.filingEvents.length) {
    throw new Error('K4 filing event and shock keys must be unique');
  }
  for (const shock of plan.shocks) {
    if (!eventKeys.has(shock.eventKey)) throw new Error('K4 shock has no exact filing event');
  }
  for (const exposure of plan.exposures) {
    const evaluation = accepted.get(exposure.evaluationKey);
    const shock = shockByKey.get(exposure.shockKey);
    if (!evaluation || !shock || shock.eventKey !== exposure.eventKey) {
      throw new Error(`K4 exposure ${exposure.exposureKey} has no exact accepted basis`);
    }
    if (
      evaluation.securityEntityId !== exposure.securityEntityId ||
      evaluation.issuerEntityId !== exposure.issuerEntityId
    ) {
      throw new Error('K4 exposure identity differs from its evaluation');
    }
    if (exposureKeys.has(exposure.exposureKey) || exposedEvaluations.has(exposure.evaluationKey)) {
      throw new Error('K4 accepted evaluation must map to exactly one exposure');
    }
    exposureKeys.add(exposure.exposureKey);
    exposedEvaluations.add(exposure.evaluationKey);
    const scoreKinds = exposure.scoreComponents.map((row) => row.componentKind);
    if (
      scoreKinds.length !== K4_SCORE_COMPONENT_KINDS.length ||
      new Set(scoreKinds).size !== K4_SCORE_COMPONENT_KINDS.length ||
      K4_SCORE_COMPONENT_KINDS.some((kind) => !scoreKinds.includes(kind))
    ) {
      throw new Error(`exposure ${exposure.exposureKey} lacks exactly eight score components`);
    }
  }
  if (exposedEvaluations.size !== accepted.size) {
    throw new Error('every accepted K4 evaluation requires exactly one exposure');
  }

  const expectationByKey = new Map(
    plan.expectations.map((expectation) => [expectation.expectationKey, expectation]),
  );
  for (const surprise of plan.surprises) {
    const expectation = expectationByKey.get(surprise.expectationKey);
    if (!expectation?.expectationRevisionId || expectation.expectedUnit !== surprise.unit) {
      throw new Error(`surprise ${surprise.surpriseKey} lacks an exact expectation basis`);
    }
    if (!surprise.surpriseKey.startsWith(`k4:surprise:${plan.informationSet.informationSetId}:`)) {
      throw new Error('K4 surprise key is not information-set scoped');
    }
  }
  for (const valuation of plan.valuations) {
    const evaluation = accepted.get(valuation.evaluationKey);
    if (!evaluation || evaluation.securityEntityId !== valuation.securityEntityId) {
      throw new Error('K4 valuation has no exact accepted evaluation');
    }
  }
  for (const citation of plan.pathCitations) {
    if (!exposureKeys.has(citation.exposureKey)) {
      throw new Error('K4 path citation has no exact exposure');
    }
  }
  const outcomeKeys = new Set<string>();
  for (const outcome of outcomes) {
    if (!exposureKeys.has(outcome.exposureKey)) {
      throw new Error('K4 outcome has no exact exposure');
    }
    if (outcomeKeys.has(outcome.outcomeKey)) throw new Error('duplicate K4 outcome key');
    outcomeKeys.add(outcome.outcomeKey);
  }
}

function requireOne<T extends Record<string, unknown>>(
  rows: Array<Record<string, unknown>>,
  label: string,
): T {
  if (rows.length !== 1) throw new Error(`${label} did not resolve exactly once`);
  return rows[0] as T;
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of [...values].sort()) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

export async function ensureInformationSet(
  client: K4PersistenceClient,
  informationSet: K4MarketIntelligencePlan['informationSet'],
  runKind: K4PersistenceOptions['runKind'],
): Promise<void> {
  if (!informationSet.semanticSnapshotId) {
    throw new Error('K4 persistence requires the exact semantic snapshot id');
  }
  const mode = runKind === 'replay' ? 'EX_ANTE' : 'LIVE';
  await client.query(
    `/* k4_insert_information_set */
     INSERT INTO governance.analysis_information_set (
       information_set_id, mode, valid_cutoff, source_available_cutoff,
       system_known_cutoff, market_observation_cutoff, semantic_snapshot_id,
       allowed_information_classes, timezone, created_by
     ) VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5::timestamptz,
               $6::timestamptz, $7, $8::text[], 'Asia/Seoul', 'k4-market-intelligence')
     ON CONFLICT (information_set_id) DO NOTHING`,
    [
      informationSet.informationSetId,
      mode,
      informationSet.validCutoff,
      informationSet.sourceAvailableCutoff,
      informationSet.systemKnownCutoff,
      informationSet.marketObservationCutoff,
      informationSet.semanticSnapshotId,
      ['source', 'fact', 'observation', 'estimate', 'hypothesis'],
    ],
  );
  const row = requireOne(
    (
      await client.query(
        `/* k4_verify_information_set */
         SELECT mode, valid_cutoff, source_available_cutoff, system_known_cutoff,
                market_observation_cutoff, semantic_snapshot_id
           FROM governance.analysis_information_set
          WHERE information_set_id=$1
          `,
        [informationSet.informationSetId],
      )
    ).rows,
    'K4 information set',
  );
  if (
    row.mode !== mode ||
    row.semantic_snapshot_id !== informationSet.semanticSnapshotId ||
    iso(row.valid_cutoff) !== informationSet.validCutoff ||
    iso(row.source_available_cutoff) !== informationSet.sourceAvailableCutoff ||
    iso(row.system_known_cutoff) !== informationSet.systemKnownCutoff ||
    iso(row.market_observation_cutoff) !== informationSet.marketObservationCutoff
  ) {
    throw new Error('existing K4 information set differs from the cutoff plan');
  }
}

async function ensureEvent(client: K4PersistenceClient, event: K4FilingEventPlan): Promise<number> {
  const insertedEvent = await client.query(
    `/* k4_insert_event */
     INSERT INTO world.event (event_key, event_type, subject_scope)
     VALUES ($1, $2, 'single_entity')
     ON CONFLICT (event_key) DO NOTHING
     RETURNING event_id`,
    [event.eventKey, event.eventType],
  );
  let eventId: number;
  if (insertedEvent.rows.length === 1) {
    eventId = positiveId(insertedEvent.rows[0]?.event_id, 'event_id');
  } else {
    const existing = requireOne(
      (
        await client.query(
          `/* k4_read_event */
           SELECT event_id, event_type, subject_scope
             FROM world.event
            WHERE event_key=$1
            `,
          [event.eventKey],
        )
      ).rows,
      'existing K4 event',
    );
    if (existing.event_type !== event.eventType || existing.subject_scope !== 'single_entity') {
      throw new Error('existing K4 event identity has different semantics');
    }
    eventId = positiveId(existing.event_id, 'event_id');
  }

  const insertedRevision = await client.query(
    `/* k4_insert_event_revision */
     INSERT INTO world.event_revision (
       event_id, revision_no, lifecycle_state, summary_text, source_revision_id,
       published_at, available_at, known_at, valid_from, metadata
     ) VALUES ($1, 1, 'confirmed', $2, $3, $4::timestamptz, $4::timestamptz,
               $5::timestamptz, $4::timestamptz, $6::jsonb)
     ON CONFLICT (event_id, revision_no) DO NOTHING
     RETURNING event_revision_id`,
    [
      eventId,
      `Source-grounded filing numeric fact for issuer ${event.issuerEntityId}`,
      event.sourceRevisionId,
      event.availableAt,
      event.knownAt,
      JSON.stringify({ locator: event.locator, k4_event_key: event.eventKey }),
    ],
  );
  let eventRevisionId: number;
  if (insertedRevision.rows.length === 1) {
    eventRevisionId = positiveId(insertedRevision.rows[0]?.event_revision_id, 'event_revision_id');
  } else {
    const existing = requireOne(
      (
        await client.query(
          `/* k4_read_event_revision */
           SELECT event_revision_id, lifecycle_state, source_revision_id,
                  available_at, known_at
             FROM world.event_revision
            WHERE event_id=$1 AND revision_no=1
            `,
          [eventId],
        )
      ).rows,
      'existing K4 event revision',
    );
    if (
      existing.lifecycle_state !== 'confirmed' ||
      Number(existing.source_revision_id) !== event.sourceRevisionId ||
      iso(existing.available_at) !== event.availableAt ||
      iso(existing.known_at) !== event.knownAt
    ) {
      throw new Error('existing K4 event revision differs from source lineage');
    }
    eventRevisionId = positiveId(existing.event_revision_id, 'event_revision_id');
  }
  await client.query(
    `/* k4_insert_event_participant */
     INSERT INTO world.event_participant (
       event_revision_id, entity_id, participant_role, role_detail
     )
     SELECT $1, $2, 'issuer', $3::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM world.event_participant
         WHERE event_revision_id=$1 AND entity_id=$2 AND participant_role='issuer'
      )`,
    [eventRevisionId, event.issuerEntityId, JSON.stringify({ source: 'k4' })],
  );
  return eventRevisionId;
}

export async function insertSealedDerivation(
  client: K4PersistenceClient,
  input: {
    key: string;
    kind: 'calculation' | 'inference';
    method: string;
    outputType: string;
    outputLocator: Record<string, unknown>;
    parameters: Record<string, unknown>;
    inputs: readonly DerivationInput[];
  },
): Promise<SealedDerivation> {
  if (input.inputs.length === 0) throw new Error('K4 derivation requires exact inputs');
  const derivation = requireOne(
    (
      await client.query(
        `/* k4_insert_derivation */
         INSERT INTO knowledge.derivation (
           derivation_key, derivation_kind, method, method_version, created_by, metadata
         ) VALUES ($1, $2, $3, $4, 'k4-market-intelligence', $5::jsonb)
         RETURNING derivation_id`,
        [
          input.key,
          input.kind,
          input.method,
          K4_PLANNER_VERSION,
          JSON.stringify({ planner_version: K4_PLANNER_VERSION }),
        ],
      )
    ).rows,
    'new K4 derivation',
  );
  const derivationId = positiveId(derivation.derivation_id, 'derivation_id');
  const step = requireOne(
    (
      await client.query(
        `/* k4_insert_derivation_step */
         INSERT INTO knowledge.derivation_step (
           derivation_id, step_no, activity_type, activity_version,
           output_type, output_locator, parameters
         ) VALUES ($1, 1, $2, $3, $4, $5::jsonb, $6::jsonb)
         RETURNING derivation_step_id`,
        [
          derivationId,
          input.kind,
          K4_PLANNER_VERSION,
          input.outputType,
          JSON.stringify(input.outputLocator),
          JSON.stringify(input.parameters),
        ],
      )
    ).rows,
    'new K4 derivation step',
  );
  const derivationStepId = positiveId(step.derivation_step_id, 'derivation_step_id');
  for (const [index, item] of input.inputs.entries()) {
    await client.query(
      `/* k4_insert_derivation_input */
       INSERT INTO knowledge.derivation_input (
         derivation_step_id, input_no, input_kind, numeric_fact_id,
         source_derivation_step_id, input_role, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb)`,
      [
        derivationStepId,
        index + 1,
        item.kind,
        item.kind === 'numeric_fact' ? item.numericFactId : null,
        item.kind === 'derivation_step' ? item.derivationStepId : null,
        item.role,
      ],
    );
  }
  const digest = requireOne(
    (
      await client.query(
        `/* k4_compute_derivation_digest */
         SELECT knowledge.compute_derivation_digest($1) AS derivation_digest`,
        [derivationId],
      )
    ).rows,
    'K4 derivation digest',
  ).derivation_digest;
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error('K4 derivation digest was not canonical');
  }
  const sealed = await client.query(
    `/* k4_seal_derivation */
     UPDATE knowledge.derivation
        SET status='sealed', step_count=1, input_count=$2,
            derivation_digest=$3, sealed_at=clock_timestamp()
      WHERE derivation_id=$1 AND status='building'
     RETURNING derivation_id`,
    [derivationId, input.inputs.length, digest],
  );
  requireOne(sealed.rows, 'sealed K4 derivation');
  return { derivationId, derivationStepId };
}

async function ensureShock(
  client: K4PersistenceClient,
  shock: K4ShockPlan,
  eventRevisionId: number,
): Promise<number> {
  const inserted = await client.query(
    `/* k4_insert_shock */
     INSERT INTO analytics.impact_shock (
       shock_key, event_revision_id, shock_type, magnitude, magnitude_unit,
       evidence_locator, available_at, known_at, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz,
               $8::timestamptz, $9::jsonb)
     ON CONFLICT (shock_key) DO NOTHING
     RETURNING impact_shock_id`,
    [
      shock.shockKey,
      eventRevisionId,
      shock.shockType,
      shock.magnitude,
      shock.magnitudeUnit,
      JSON.stringify({ event_key: shock.eventKey }),
      shock.availableAt,
      shock.knownAt,
      JSON.stringify({ planner_version: K4_PLANNER_VERSION }),
    ],
  );
  if (inserted.rows.length === 1) {
    return positiveId(inserted.rows[0]?.impact_shock_id, 'impact_shock_id');
  }
  const existing = requireOne(
    (
      await client.query(
        `/* k4_read_shock */
         SELECT impact_shock_id, event_revision_id, shock_type, magnitude::text,
                magnitude_unit, available_at, known_at
           FROM analytics.impact_shock
          WHERE shock_key=$1
          `,
        [shock.shockKey],
      )
    ).rows,
    'existing K4 shock',
  );
  if (
    Number(existing.event_revision_id) !== eventRevisionId ||
    existing.shock_type !== shock.shockType ||
    Number(existing.magnitude) !== shock.magnitude ||
    existing.magnitude_unit !== shock.magnitudeUnit ||
    iso(existing.available_at) !== shock.availableAt ||
    iso(existing.known_at) !== shock.knownAt
  ) {
    throw new Error('existing K4 shock differs from exact measurement basis');
  }
  return positiveId(existing.impact_shock_id, 'impact_shock_id');
}

async function insertRejectedEvaluation(
  client: K4PersistenceClient,
  evaluation: EvaluationPlan,
  informationSetId: string,
): Promise<void> {
  if (evaluation.evaluationDisposition === 'accepted' || !evaluation.reasonDetail) {
    throw new Error('rejected K4 evaluation has an invalid shape');
  }
  await client.query(
    `/* k4_insert_rejected_evaluation */
     INSERT INTO analytics.impact_evaluation_revision (
       evaluation_key, revision_no, security_entity_id, issuer_entity_id,
       security_issuer_identity_id, sector_playbook_id, business_driver_id,
       business_driver_measurement_rule_id, information_set_id,
       evaluation_disposition, reason_detail, metadata
     ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     RETURNING impact_evaluation_revision_id`,
    [
      evaluation.evaluationKey,
      evaluation.securityEntityId,
      evaluation.issuerEntityId,
      evaluation.securityIssuerIdentityId,
      evaluation.sectorPlaybookId,
      evaluation.businessDriverId,
      evaluation.businessDriverMeasurementRuleId,
      informationSetId,
      evaluation.evaluationDisposition,
      evaluation.reasonDetail,
      JSON.stringify({ driver_key: evaluation.driverKey, rule_key: evaluation.ruleKey }),
    ],
  );
}

export async function persistK4MarketIntelligencePlan(
  client: K4PersistenceClient,
  plan: K4MarketIntelligencePlan,
  options: K4PersistenceOptions,
): Promise<K4PersistenceResult> {
  requireDigest(options.requestDigest, 'requestDigest');
  requireDigest(options.planDigest, 'planDigest');
  if (options.cutoff !== plan.informationSet.validCutoff) {
    throw new Error('K4 persistence cutoff differs from the planned information set');
  }
  const outcomes = [...(options.outcomes ?? [])].sort((left, right) =>
    left.outcomeKey.localeCompare(right.outcomeKey),
  );
  validateK4PersistencePlan(plan, outcomes);
  const existingReceipt = await client.query(
    `/* k4_read_receipt */
     SELECT market_intelligence_run_receipt_id, plan_digest,
            accepted_evaluation_count, evaluation_count,
            (outcome_counts->>'total')::int AS outcome_count,
            (artifact_counts->>'sealed_exposure')::int AS sealed_exposure_count,
            (artifact_counts->>'surprise')::int AS surprise_count,
            (artifact_counts->>'valuation')::int AS valuation_count
       FROM analytics.market_intelligence_run_receipt
      WHERE run_kind=$1 AND cutoff_at=$2::timestamptz AND request_digest=$3
      `,
    [options.runKind, options.cutoff, options.requestDigest],
  );
  if (existingReceipt.rows.length > 1) throw new Error('duplicate K4 run receipts');
  if (existingReceipt.rows.length === 1) {
    const receipt = existingReceipt.rows[0]!;
    if (receipt.plan_digest !== options.planDigest) {
      throw new Error('K4 cutoff receipt plan digest mismatch');
    }
    const accepted = Number(receipt.accepted_evaluation_count ?? 0);
    const evaluations = Number(receipt.evaluation_count ?? accepted);
    return {
      receiptId: positiveId(
        receipt.market_intelligence_run_receipt_id,
        'market_intelligence_run_receipt_id',
      ),
      idempotent: true,
      acceptedEvaluationCount: accepted,
      rejectedEvaluationCount: Math.max(0, evaluations - accepted),
      sealedExposureCount: Number(receipt.sealed_exposure_count ?? accepted),
      surpriseCount: Number(receipt.surprise_count ?? 0),
      valuationCount: Number(receipt.valuation_count ?? 0),
      outcomeCount: Number(receipt.outcome_count ?? 0),
    };
  }

  await ensureInformationSet(client, plan.informationSet, options.runKind);
  const eventRevisionIds = new Map<string, number>();
  for (const event of plan.filingEvents) {
    eventRevisionIds.set(event.eventKey, await ensureEvent(client, event));
  }

  let surpriseCount = 0;
  for (const surprise of plan.surprises) {
    const expectation = plan.expectations.find(
      (candidate) => candidate.expectationKey === surprise.expectationKey,
    );
    if (!expectation?.expectationRevisionId) {
      throw new Error(`surprise ${surprise.surpriseKey} has no exact expectation revision`);
    }
    // Migration 031 makes a derivation a self-contained DAG: a derivation_input may
    // only reference an earlier step of the *same* derivation. Citing the
    // expectation's step from here was therefore rejected outright — the path simply
    // had never run, because nothing produced expectations until 2026-08-10.
    //
    // Cross-artifact lineage belongs in the ledger, and it is guaranteed there:
    // surprise_revision.expectation_revision_id and expectation_revision.derivation_id
    // are both NOT NULL, so surprise → expectation → derivation → facts always
    // traverses. What this derivation cites is what it actually consumed: the actual
    // observation and the facts the expectation was computed from.
    const expectationBasis = (
      await client.query(
        `/* k4_read_expectation_basis_facts */
         SELECT input.numeric_fact_id
           FROM knowledge.derivation derivation
           JOIN knowledge.derivation_step step USING (derivation_id)
           JOIN knowledge.derivation_input input USING (derivation_step_id)
          WHERE derivation.derivation_key=$1 AND derivation.status='sealed'
            AND input.numeric_fact_id IS NOT NULL
          ORDER BY step.step_no, input.input_no`,
        [expectation.derivationKey],
      )
    ).rows.map((row) => positiveId(row.numeric_fact_id, 'expectation basis numeric fact id'));
    if (expectationBasis.length === 0) {
      throw new Error(`surprise ${surprise.surpriseKey} has no expectation basis facts`);
    }
    const derivation = await insertSealedDerivation(client, {
      key: `k4:derivation:${surprise.surpriseKey}:v1`,
      kind: 'calculation',
      method: 'actual-minus-expectation',
      outputType: 'surprise_revision',
      outputLocator: { surprise_key: surprise.surpriseKey },
      parameters: {
        formula: 'actual_value - expected_value',
        unit: surprise.unit,
        expectation_key: expectation.expectationKey,
        expectation_derivation_key: expectation.derivationKey,
      },
      inputs: [
        { kind: 'numeric_fact', numericFactId: surprise.actualNumericFactId, role: 'actual' },
        ...expectationBasis.map((numericFactId) => ({
          kind: 'numeric_fact' as const,
          numericFactId,
          role: 'expected_basis',
        })),
      ],
    });
    await client.query(
      `/* k4_insert_surprise */
       INSERT INTO analytics.surprise_revision (
         surprise_key, revision_no, expectation_revision_id, actual_numeric_fact_id,
         raw_surprise, standardized_surprise, historical_percentile,
         expectation_dispersion, direction, materiality, unit,
         information_set_id, derivation_id, metadata
       ) VALUES ($1, 1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [
        surprise.surpriseKey,
        expectation.expectationRevisionId,
        surprise.actualNumericFactId,
        surprise.rawSurprise,
        surprise.standardizedSurprise,
        expectation.dispersion,
        surprise.direction,
        surprise.materiality,
        surprise.unit,
        plan.informationSet.informationSetId,
        derivation.derivationId,
        JSON.stringify({
          actual_value: surprise.actualValue,
          expected_value: surprise.expectedValue,
        }),
      ],
    );
    surpriseCount += 1;
  }

  const accepted = plan.evaluations.filter(
    (evaluation) => evaluation.evaluationDisposition === 'accepted',
  );
  const evaluationDerivations = new Map<string, SealedDerivation>();
  for (const evaluation of accepted) {
    if (evaluation.evidence.length < 2) {
      throw new Error(`accepted evaluation ${evaluation.evaluationKey} lacks exact evidence`);
    }
    evaluationDerivations.set(
      evaluation.evaluationKey,
      await insertSealedDerivation(client, {
        key: `k4:derivation:${evaluation.evaluationKey}:driver-measurement-v1`,
        kind: 'calculation',
        method: 'executable-driver-year-over-year-delta',
        outputType: 'impact_evaluation_revision',
        outputLocator: { evaluation_key: evaluation.evaluationKey },
        parameters: {
          rule_key: evaluation.ruleKey,
          measurement_unit: evaluation.measurementUnit,
          measurement_currency: evaluation.measurementCurrency,
        },
        inputs: evaluation.evidence.map((evidence) => ({
          kind: 'numeric_fact' as const,
          numericFactId: evidence.numericFactId,
          role: evidence.inputRole,
        })),
      }),
    );
  }

  const shockIds = new Map<string, number>();
  for (const shock of plan.shocks) {
    const eventRevisionId = eventRevisionIds.get(shock.eventKey);
    if (!eventRevisionId) throw new Error(`shock ${shock.shockKey} has no exact filing event`);
    shockIds.set(shock.shockKey, await ensureShock(client, shock, eventRevisionId));
  }

  const channelIds = new Map<string, number>();
  for (const channelClass of [...new Set(plan.exposures.map((row) => row.channelClass))].sort()) {
    const channel = requireOne(
      (
        await client.query(
          `/* k4_read_channel */
           SELECT impact_channel_id
             FROM analytics.impact_channel
            WHERE channel_class=$1
            `,
          [channelClass],
        )
      ).rows,
      `impact channel ${channelClass}`,
    );
    channelIds.set(channelClass, positiveId(channel.impact_channel_id, 'impact_channel_id'));
  }

  const exposureIds = new Map<string, number>();
  for (const exposure of plan.exposures) {
    const evaluation = accepted.find(
      (candidate) => candidate.evaluationKey === exposure.evaluationKey,
    );
    const shock = plan.shocks.find((candidate) => candidate.shockKey === exposure.shockKey);
    const derivation = evaluationDerivations.get(exposure.evaluationKey);
    const shockId = shockIds.get(exposure.shockKey);
    const channelId = channelIds.get(exposure.channelClass);
    if (!evaluation || !shock || !derivation || !shockId || !channelId) {
      throw new Error(`exposure ${exposure.exposureKey} has an incomplete exact basis`);
    }
    const currentEvidence = evaluation.evidence.find((row) => row.inputRole === 'current');
    if (!currentEvidence) throw new Error('accepted exposure has no current source revision');
    const exposureRow = requireOne(
      (
        await client.query(
          `/* k4_insert_exposure */
           INSERT INTO analytics.impact_exposure_revision (
             exposure_key, revision_no, impact_shock_id, impact_channel_id,
             entity_id, sign, horizon, materiality, uncertainty,
             economic_magnitude, economic_magnitude_unit, epistemic_confidence,
             evidence_locator, source_revision_id, available_at, known_at, metadata
           ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                     $12::jsonb, $13, $14::timestamptz, $15::timestamptz, $16::jsonb)
           RETURNING impact_exposure_revision_id`,
          [
            exposure.exposureKey,
            shockId,
            channelId,
            exposure.securityEntityId,
            exposure.sign,
            exposure.horizon,
            exposure.materiality,
            exposure.uncertainty,
            exposure.economicMagnitude,
            exposure.economicMagnitudeUnit,
            exposure.epistemicConfidence,
            JSON.stringify({
              event_key: exposure.eventKey,
              shock_key: exposure.shockKey,
              evaluation_key: exposure.evaluationKey,
              numeric_fact_ids: evaluation.evidence.map((row) => row.numericFactId),
            }),
            currentEvidence.sourceRevisionId,
            shock.availableAt,
            shock.knownAt,
            JSON.stringify({ planner_version: K4_PLANNER_VERSION }),
          ],
        )
      ).rows,
      'new K4 exposure',
    );
    const exposureId = positiveId(
      exposureRow.impact_exposure_revision_id,
      'impact_exposure_revision_id',
    );
    exposureIds.set(exposure.exposureKey, exposureId);
    const evaluationRow = requireOne(
      (
        await client.query(
          `/* k4_insert_accepted_evaluation */
           INSERT INTO analytics.impact_evaluation_revision (
             evaluation_key, revision_no, security_entity_id, issuer_entity_id,
             security_issuer_identity_id, sector_playbook_id, business_driver_id,
             business_driver_measurement_rule_id, information_set_id, derivation_id,
             evaluation_disposition, measurement_value, measurement_unit,
             measurement_currency, direction, materiality, impact_exposure_revision_id,
             metadata
           ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, 'accepted',
                     $10, $11, $12, $13, $14, $15, $16::jsonb)
           RETURNING impact_evaluation_revision_id`,
          [
            evaluation.evaluationKey,
            evaluation.securityEntityId,
            evaluation.issuerEntityId,
            evaluation.securityIssuerIdentityId,
            evaluation.sectorPlaybookId,
            evaluation.businessDriverId,
            evaluation.businessDriverMeasurementRuleId,
            plan.informationSet.informationSetId,
            derivation.derivationId,
            evaluation.measurementValue,
            evaluation.measurementUnit,
            evaluation.measurementCurrency,
            evaluation.direction,
            evaluation.materiality,
            exposureId,
            JSON.stringify({ driver_key: evaluation.driverKey, rule_key: evaluation.ruleKey }),
          ],
        )
      ).rows,
      'new accepted K4 evaluation',
    );
    const evaluationId = positiveId(
      evaluationRow.impact_evaluation_revision_id,
      'impact_evaluation_revision_id',
    );
    for (const evidence of evaluation.evidence) {
      await client.query(
        `/* k4_insert_evaluation_evidence */
         INSERT INTO analytics.impact_evaluation_evidence (
           impact_evaluation_revision_id, numeric_fact_id, source_revision_id,
           source_pit_quality_id, input_role
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          evaluationId,
          evidence.numericFactId,
          evidence.sourceRevisionId,
          evidence.sourcePitQualityId,
          evidence.inputRole,
        ],
      );
    }
    const componentKinds = new Set(exposure.scoreComponents.map((row) => row.componentKind));
    if (componentKinds.size !== 8 || exposure.scoreComponents.length !== 8) {
      throw new Error(`exposure ${exposure.exposureKey} lacks exactly eight score components`);
    }
    for (const component of exposure.scoreComponents) {
      await client.query(
        `/* k4_insert_score_components */
         INSERT INTO analytics.impact_score_component (
           impact_exposure_revision_id, component_kind, component_value,
           rationale, metadata
         ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          exposureId,
          component.componentKind,
          component.componentValue,
          component.rationale,
          JSON.stringify({ score_formula_version: K4_SCORE_FORMULA_VERSION }),
        ],
      );
    }
    requireOne(
      (
        await client.query(
          `/* k4_seal_exposure */
           UPDATE analytics.impact_exposure_revision
              SET exposure_state='sealed', sealed_at=clock_timestamp()
            WHERE impact_exposure_revision_id=$1 AND exposure_state='building'
           RETURNING impact_exposure_revision_id`,
          [exposureId],
        )
      ).rows,
      'sealed K4 exposure',
    );
  }

  const rejected = plan.evaluations.filter(
    (evaluation) => evaluation.evaluationDisposition !== 'accepted',
  );
  for (const evaluation of rejected) {
    await insertRejectedEvaluation(client, evaluation, plan.informationSet.informationSetId);
  }

  for (const citation of plan.pathCitations) {
    const exposureId = exposureIds.get(citation.exposureKey);
    if (!exposureId) throw new Error('path citation has no sealed K4 exposure');
    await client.query(
      `/* k4_insert_path_citation */
       INSERT INTO analytics.impact_path_step_exposure_citation (
         impact_path_step_id, impact_exposure_revision_id, citation_role
       ) VALUES ($1, $2, $3)`,
      [citation.impactPathStepId, exposureId, citation.citationRole],
    );
  }

  let valuationCount = 0;
  for (const valuation of plan.valuations) {
    const basis = evaluationDerivations.get(valuation.evaluationKey);
    if (!basis) throw new Error('valuation has no accepted driver derivation');
    // Same kernel rule as the surprise derivation: migration 031 forbids citing a step
    // of another derivation, so the valuation cites the driver measurement's own
    // evidence facts. The evaluation link itself is carried by the ledger.
    const basisEvidence =
      plan.evaluations.find((row) => row.evaluationKey === valuation.evaluationKey)?.evidence ?? [];
    if (basisEvidence.length === 0) {
      throw new Error(`valuation ${valuation.valuationEstimateKey} has no driver evidence`);
    }
    const derivation = await insertSealedDerivation(client, {
      key: `k4:derivation:${valuation.valuationEstimateKey}:v1`,
      kind: 'inference',
      method: valuation.methodKey,
      outputType: 'valuation_estimate_revision',
      outputLocator: { valuation_estimate_key: valuation.valuationEstimateKey },
      parameters: {
        lower_estimate: valuation.lowerEstimate,
        upper_estimate: valuation.upperEstimate,
        estimate_unit: valuation.estimateUnit,
        horizon: valuation.horizon,
        driver_evaluation_key: valuation.evaluationKey,
        driver_derivation_step_id: basis.derivationStepId,
      },
      inputs: basisEvidence.map((evidence) => ({
        kind: 'numeric_fact' as const,
        numericFactId: evidence.numericFactId,
        role: `driver_measurement_${evidence.inputRole}`,
      })),
    });
    await client.query(
      `/* k4_insert_valuation */
       INSERT INTO analytics.valuation_estimate_revision (
         valuation_estimate_key, revision_no, security_entity_id, method_key,
         lower_estimate, upper_estimate, estimate_unit, as_of_at, horizon,
         information_set_id, derivation_id, metadata
       ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10, $11::jsonb)`,
      [
        valuation.valuationEstimateKey,
        valuation.securityEntityId,
        valuation.methodKey,
        valuation.lowerEstimate,
        valuation.upperEstimate,
        valuation.estimateUnit,
        options.cutoff,
        valuation.horizon,
        plan.informationSet.informationSetId,
        derivation.derivationId,
        JSON.stringify({ evaluation_key: valuation.evaluationKey }),
      ],
    );
    valuationCount += 1;
  }

  for (const outcome of outcomes) {
    const exposureId = exposureIds.get(outcome.exposureKey);
    if (!exposureId) throw new Error('outcome has no sealed K4 exposure');
    await client.query(
      `/* k4_insert_outcome */
       INSERT INTO analytics.impact_outcome_revision (
         outcome_key, revision_no, impact_exposure_revision_id, horizon_sessions,
         outcome_state, anchor_session_date, outcome_session_date, security_return,
         benchmark_return, abnormal_return, market_data_known_at, metadata
       ) VALUES ($1, 1, $2, $3, $4, $5::date, $6::date, $7, $8, $9,
                 $10::timestamptz, $11::jsonb)`,
      [
        outcome.outcomeKey,
        exposureId,
        outcome.horizonSessions,
        outcome.outcomeState,
        outcome.anchorSessionDate,
        outcome.outcomeSessionDate,
        outcome.securityReturn,
        outcome.benchmarkReturn,
        outcome.abnormalReturn,
        outcome.marketDataKnownAt,
        JSON.stringify({ planner_version: K4_PLANNER_VERSION }),
      ],
    );
  }

  const reasonCounts = countBy(rejected.map((row) => row.evaluationDisposition));
  const outcomeCounts = {
    ...countBy(outcomes.map((row) => row.outcomeState)),
    total: outcomes.length,
  };
  const receipt = requireOne(
    (
      await client.query(
        `/* k4_insert_receipt */
         INSERT INTO analytics.market_intelligence_run_receipt (
           run_key, run_kind, cutoff_at, request_digest, plan_digest,
           information_set_id, requested_security_count, evaluation_count,
           accepted_evaluation_count, reason_counts, outcome_counts, artifact_counts,
           planner_version, score_formula_version, metadata
         ) VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9,
                   $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15::jsonb)
         RETURNING market_intelligence_run_receipt_id`,
        [
          `k4:${options.runKind}:${options.cutoff}:${options.requestDigest}`,
          options.runKind,
          options.cutoff,
          options.requestDigest,
          options.planDigest,
          plan.informationSet.informationSetId,
          plan.coverage.length,
          plan.evaluations.length,
          accepted.length,
          JSON.stringify(reasonCounts),
          JSON.stringify(outcomeCounts),
          JSON.stringify({
            sealed_exposure: exposureIds.size,
            surprise: surpriseCount,
            valuation: valuationCount,
          }),
          K4_PLANNER_VERSION,
          K4_SCORE_FORMULA_VERSION,
          JSON.stringify({
            source: 'deterministic-k4-writer',
            shadow_cohort_version: K4_SHADOW_COHORT_VERSION,
          }),
        ],
      )
    ).rows,
    'new K4 run receipt',
  );
  return {
    receiptId: positiveId(
      receipt.market_intelligence_run_receipt_id,
      'market_intelligence_run_receipt_id',
    ),
    idempotent: false,
    acceptedEvaluationCount: accepted.length,
    rejectedEvaluationCount: rejected.length,
    sealedExposureCount: exposureIds.size,
    surpriseCount,
    valuationCount,
    outcomeCount: outcomes.length,
  };
}
