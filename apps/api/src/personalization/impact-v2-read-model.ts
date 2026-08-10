import type { UserScope } from '../shared/user-scope';

import {
  personalizationPortfolioImpactV2Schema,
  type PersonalizationPortfolioImpactV2,
} from '@stock-insight/contracts/personalization';

export type PersonalizationImpactV2QueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetPersonalizationPortfolioImpactV2Options = Readonly<{
  userScope: UserScope;
  eventId: string | null;
  scenarioId: string | null;
  horizon: string | null;
  knownAt: Date;
}>;

const boundedKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,319}$/;
const allowedHorizons = new Set(['immediate', 'short', 'medium', 'long']);
const horizonOrder = new Map([
  ['immediate', 0],
  ['short', 1],
  ['medium', 2],
  ['long', 3],
]);

const SELECTED_SNAPSHOT_V2_SQL = `
/* k4_selected_snapshot */
SELECT snapshot.portfolio_snapshot_id
  FROM personalization.portfolio_snapshot snapshot
  JOIN personalization.portfolio_snapshot_seal seal
    ON seal.portfolio_snapshot_id = snapshot.portfolio_snapshot_id
   AND seal.user_id = snapshot.user_id
   AND seal.sealed_at <= $2::timestamptz
 WHERE snapshot.user_id = $1::uuid
   AND snapshot.source_known_at <= $2::timestamptz
 ORDER BY snapshot.snapshot_as_of DESC, snapshot.portfolio_snapshot_id DESC
 LIMIT 1
`;

const COVERAGE_V2_SQL = `
/* k4_portfolio_impact_coverage_v2 */
WITH selected AS MATERIALIZED (
  SELECT snapshot.portfolio_snapshot_id, snapshot.user_id
    FROM personalization.portfolio_snapshot snapshot
    JOIN personalization.portfolio_snapshot_seal seal
      ON seal.portfolio_snapshot_id = snapshot.portfolio_snapshot_id
     AND seal.user_id = snapshot.user_id
     AND seal.sealed_at <= $3::timestamptz
   WHERE snapshot.user_id = $1::uuid
     AND snapshot.portfolio_snapshot_id = $2::uuid
     AND snapshot.source_known_at <= $3::timestamptz
), eligible_coverage AS MATERIALIZED (
  SELECT coverage.*
    FROM analytics.k4_portfolio_impact_coverage_v2 coverage
   WHERE coverage.evaluation_created_at <= $3::timestamptz
     AND coverage.information_set_created_at <= $3::timestamptz
     AND NOT EXISTS (
       SELECT 1
         FROM analytics.k4_portfolio_impact_coverage_v2 successor
        WHERE successor.evaluation_key = coverage.evaluation_key
          AND successor.revision_no > coverage.revision_no
          AND successor.evaluation_created_at <= $3::timestamptz
     )
), latest_information_set AS MATERIALIZED (
  SELECT coverage.information_set_id
    FROM eligible_coverage coverage
   WHERE coverage.valid_cutoff <= $3::timestamptz
   GROUP BY coverage.information_set_id, coverage.valid_cutoff
   ORDER BY coverage.valid_cutoff DESC, coverage.information_set_id DESC
   LIMIT 1
), positions AS (
  SELECT lot.security_entity_id, sum(lot.portfolio_weight) AS portfolio_weight
    FROM selected
    JOIN personalization.portfolio_lot_snapshot lot
      ON lot.portfolio_snapshot_id = selected.portfolio_snapshot_id
     AND lot.user_id = selected.user_id
   GROUP BY lot.security_entity_id
)
SELECT selected.portfolio_snapshot_id,
       identifier.identifier_value AS entity_key,
       positions.portfolio_weight,
       count(*)::integer AS evaluation_count,
       count(*) FILTER (
         WHERE coverage.evaluation_disposition = 'accepted'
       )::integer AS accepted_evaluation_count,
       coalesce(
         array_agg(DISTINCT coverage.evaluation_disposition
                   ORDER BY coverage.evaluation_disposition)
           FILTER (WHERE coverage.evaluation_disposition <> 'accepted'),
         ARRAY[]::text[]
       ) AS reason_codes,
       coalesce(
         array_agg(DISTINCT coverage.reason_detail ORDER BY coverage.reason_detail)
           FILTER (WHERE coverage.evaluation_disposition <> 'accepted'
                   AND coverage.reason_detail IS NOT NULL),
         ARRAY[]::text[]
       ) AS reason_details
  FROM selected
  CROSS JOIN latest_information_set
  JOIN eligible_coverage coverage
    ON coverage.information_set_id = latest_information_set.information_set_id
  JOIN LATERAL (
    SELECT candidate.identifier_value
      FROM core.entity_identifier candidate
     WHERE candidate.entity_id = coverage.security_entity_id
       AND candidate.identifier_type = 'INTERNAL_KEY'
       AND (candidate.valid_from IS NULL OR candidate.valid_from <= $3::timestamptz)
       AND (candidate.valid_to IS NULL OR candidate.valid_to > $3::timestamptz)
     ORDER BY candidate.valid_from DESC NULLS LAST, candidate.entity_identifier_id DESC
     LIMIT 1
  ) identifier ON true
  LEFT JOIN positions ON positions.security_entity_id = coverage.security_entity_id
 GROUP BY selected.portfolio_snapshot_id, identifier.identifier_value,
          positions.portfolio_weight
 ORDER BY identifier.identifier_value
`;

const EXPOSURE_V2_SQL = `
/* k4_portfolio_impact_exposure_v2 */
WITH selected AS MATERIALIZED (
  SELECT snapshot.portfolio_snapshot_id, snapshot.user_id
    FROM personalization.portfolio_snapshot snapshot
    JOIN personalization.portfolio_snapshot_seal seal
      ON seal.portfolio_snapshot_id = snapshot.portfolio_snapshot_id
     AND seal.user_id = snapshot.user_id
     AND seal.sealed_at <= $3::timestamptz
   WHERE snapshot.user_id = $1::uuid
     AND snapshot.portfolio_snapshot_id = $2::uuid
     AND snapshot.source_known_at <= $3::timestamptz
), eligible_coverage AS MATERIALIZED (
  SELECT coverage.*
    FROM analytics.k4_portfolio_impact_coverage_v2 coverage
   WHERE coverage.evaluation_created_at <= $3::timestamptz
     AND coverage.information_set_created_at <= $3::timestamptz
     AND NOT EXISTS (
       SELECT 1
         FROM analytics.k4_portfolio_impact_coverage_v2 successor
        WHERE successor.evaluation_key = coverage.evaluation_key
          AND successor.revision_no > coverage.revision_no
          AND successor.evaluation_created_at <= $3::timestamptz
     )
), latest_information_set AS MATERIALIZED (
  SELECT coverage.information_set_id
    FROM eligible_coverage coverage
   WHERE coverage.valid_cutoff <= $3::timestamptz
   GROUP BY coverage.information_set_id, coverage.valid_cutoff
   ORDER BY coverage.valid_cutoff DESC, coverage.information_set_id DESC
   LIMIT 1
), positions AS (
  SELECT lot.security_entity_id, sum(lot.portfolio_weight) AS portfolio_weight
    FROM selected
    JOIN personalization.portfolio_lot_snapshot lot
      ON lot.portfolio_snapshot_id = selected.portfolio_snapshot_id
     AND lot.user_id = selected.user_id
   GROUP BY lot.security_entity_id
)
SELECT selected.portfolio_snapshot_id,
       exposure.impact_exposure_revision_id,
       exposure.impact_evaluation_revision_id,
       identifier.identifier_value AS entity_key,
       positions.portfolio_weight,
       exposure.sign,
       exposure.horizon,
       exposure.channel_class,
       exposure.economic_magnitude,
       exposure.economic_magnitude_unit,
       exposure.materiality,
       exposure.uncertainty,
       exposure.epistemic_confidence,
       exposure.security_issuer_identity_id,
       exposure.sector_playbook_id,
       exposure.business_driver_id,
       exposure.business_driver_measurement_rule_id,
       exposure.information_set_id,
       exposure.valid_cutoff,
       exposure.source_available_cutoff,
       exposure.system_known_cutoff,
       exposure.market_observation_cutoff,
       exposure.semantic_snapshot_id,
       exposure.derivation_id,
       exposure.event_revision_id,
       coalesce(score_components.items, '[]'::jsonb) AS score_components,
       coalesce(evidence_refs.items, '[]'::jsonb) AS evidence_refs,
       coalesce(path_step_refs.items, '[]'::jsonb) AS path_step_refs
  FROM selected
  CROSS JOIN latest_information_set
  JOIN positions ON true
  JOIN analytics.k4_portfolio_impact_exposure_v2 exposure
    ON exposure.security_entity_id = positions.security_entity_id
   AND exposure.information_set_id = latest_information_set.information_set_id
   AND exposure.evaluation_created_at <= $3::timestamptz
   AND exposure.information_set_created_at <= $3::timestamptz
   AND exposure.shock_known_at <= $3::timestamptz
   AND exposure.event_known_at <= $3::timestamptz
   AND exposure.known_at <= $3::timestamptz
   AND exposure.sealed_at <= $3::timestamptz
  JOIN LATERAL (
    SELECT candidate.identifier_value
      FROM core.entity_identifier candidate
     WHERE candidate.entity_id = exposure.security_entity_id
       AND candidate.identifier_type = 'INTERNAL_KEY'
       AND (candidate.valid_from IS NULL OR candidate.valid_from <= $3::timestamptz)
       AND (candidate.valid_to IS NULL OR candidate.valid_to > $3::timestamptz)
     ORDER BY candidate.valid_from DESC NULLS LAST, candidate.entity_identifier_id DESC
     LIMIT 1
  ) identifier ON true
  JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'kind', component.component_kind,
               'value', component.component_value,
               'rationale', component.rationale
             ) ORDER BY component.component_kind
           ) AS items
      FROM analytics.k4_portfolio_impact_score_component_v2 component
     WHERE component.impact_exposure_revision_id = exposure.impact_exposure_revision_id
  ) score_components ON true
  JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'numericFactId', evidence.numeric_fact_id::text,
               'sourceRevisionId', evidence.source_revision_id::text,
               'sourcePitQualityId', evidence.source_pit_quality_id::text,
               'pitQualityClass', evidence.pit_quality_class,
               'inputRole', evidence.input_role
             ) ORDER BY evidence.input_role, evidence.numeric_fact_id
           ) AS items
      FROM analytics.k4_portfolio_impact_evidence_v2 evidence
     WHERE evidence.impact_evaluation_revision_id = exposure.impact_evaluation_revision_id
  ) evidence_refs ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'impactPathStepId', path.impact_path_step_id::text,
               'citationRole', path.citation_role
             ) ORDER BY path.impact_path_step_id, path.citation_role
           ) AS items
      FROM analytics.k4_portfolio_impact_path_step_v2 path
     WHERE path.impact_exposure_revision_id = exposure.impact_exposure_revision_id
  ) path_step_refs ON true
 WHERE ($4::text IS NULL OR exposure.event_key = $4::text)
   AND ($6::text IS NULL OR exposure.horizon = $6::text)
   AND (
     $5::text IS NULL
     OR EXISTS (
       SELECT 1
         FROM analytics.scenario_set scenario_set
         JOIN analytics.scenario_branch branch
           ON branch.scenario_set_id = scenario_set.scenario_set_id
          AND branch.branch_state = 'sealed'
        WHERE scenario_set.impact_shock_id = exposure.impact_shock_id
          AND scenario_set.known_at <= $3::timestamptz
          AND branch.branch_key = $5::text
     )
   )
 ORDER BY exposure.horizon, exposure.channel_class,
          exposure.economic_magnitude_unit, identifier.identifier_value,
          exposure.impact_exposure_revision_id
`;

type CoverageRow = {
  portfolio_snapshot_id: unknown;
  entity_key: unknown;
  portfolio_weight: unknown;
  evaluation_count: unknown;
  accepted_evaluation_count: unknown;
  reason_codes: unknown;
  reason_details: unknown;
};

type ExposureRow = Record<string, unknown> & {
  portfolio_snapshot_id: unknown;
  impact_exposure_revision_id: unknown;
  impact_evaluation_revision_id: unknown;
  entity_key: unknown;
  portfolio_weight: unknown;
  sign: unknown;
  horizon: unknown;
  channel_class: unknown;
  economic_magnitude: unknown;
  economic_magnitude_unit: unknown;
};

function validateOptionalKey(value: string | null, field: string): void {
  if (value !== null && !boundedKeyPattern.test(value)) {
    throw new Error(`Portfolio impact v2 ${field} is invalid`);
  }
}

function requiredText(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!text) throw new Error(`Portfolio impact v2 ${field} is missing`);
  return text;
}

function finiteNumber(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Portfolio impact v2 ${field} is invalid`);
  return result;
}

function probability(value: unknown, field: string): number {
  const result = finiteNumber(value, field);
  if (result < 0 || result > 1) throw new Error(`Portfolio impact v2 ${field} is invalid`);
  return result;
}

function positiveInteger(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) {
    throw new Error(`Portfolio impact v2 ${field} is invalid`);
  }
  return result;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Portfolio impact v2 ${field} is invalid`);
  return value.map((item) => requiredText(item, field));
}

function objectArray(value: unknown, field: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`Portfolio impact v2 ${field} is invalid`);
  return value.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`Portfolio impact v2 ${field} is invalid`);
    }
    return item as Record<string, unknown>;
  });
}

function dateTime(value: unknown, field: string): string {
  const date = value instanceof Date ? value : new Date(requiredText(value, field));
  if (!Number.isFinite(date.getTime())) throw new Error(`Portfolio impact v2 ${field} is invalid`);
  return date.toISOString();
}
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function mapExposure(row: ExposureRow) {
  const scoreComponents = objectArray(row.score_components, 'score components').map((item) => ({
    kind: requiredText(item.kind, 'score component kind'),
    value: probability(item.value, 'score component value'),
    rationale: requiredText(item.rationale, 'score component rationale'),
  }));
  const evidence = objectArray(row.evidence_refs, 'evidence references').map((item) => ({
    numericFactId: requiredText(item.numericFactId, 'numeric fact id'),
    sourceRevisionId: requiredText(item.sourceRevisionId, 'source revision id'),
    sourcePitQualityId: requiredText(item.sourcePitQualityId, 'source PIT quality id'),
    pitQualityClass: requiredText(item.pitQualityClass, 'PIT quality class'),
    inputRole: requiredText(item.inputRole, 'evidence input role'),
  }));
  const pathSteps = objectArray(row.path_step_refs, 'path step references').map((item) => ({
    impactPathStepId: requiredText(item.impactPathStepId, 'impact path step id'),
    citationRole: requiredText(item.citationRole, 'path citation role'),
  }));
  return {
    horizon: requiredText(row.horizon, 'horizon'),
    channel: requiredText(row.channel_class, 'channel'),
    unit: requiredText(row.economic_magnitude_unit, 'economic magnitude unit'),
    exposure: {
      exposureRevisionId: requiredText(row.impact_exposure_revision_id, 'exposure revision id'),
      evaluationRevisionId: requiredText(
        row.impact_evaluation_revision_id,
        'evaluation revision id',
      ),
      entityKey: requiredText(row.entity_key, 'entity key'),
      portfolioWeight: probability(row.portfolio_weight, 'portfolio weight'),
      direction: requiredText(row.sign, 'direction'),
      economicMagnitude: {
        value: finiteNumber(row.economic_magnitude, 'economic magnitude'),
        unit: requiredText(row.economic_magnitude_unit, 'economic magnitude unit'),
      },
      materiality: probability(row.materiality, 'materiality'),
      uncertainty: probability(row.uncertainty, 'uncertainty'),
      epistemicConfidence: probability(row.epistemic_confidence, 'epistemic confidence'),
      scoreComponents,
      references: {
        securityIssuerIdentityId: requiredText(
          row.security_issuer_identity_id,
          'security issuer identity id',
        ),
        sectorPlaybookId: requiredText(row.sector_playbook_id, 'sector playbook id'),
        businessDriverId: requiredText(row.business_driver_id, 'business driver id'),
        businessDriverMeasurementRuleId: requiredText(
          row.business_driver_measurement_rule_id,
          'business driver measurement rule id',
        ),
        analysisInformationSet: {
          informationSetId: requiredText(row.information_set_id, 'information set id'),
          validCutoff: dateTime(row.valid_cutoff, 'valid cutoff'),
          sourceAvailableCutoff: dateTime(row.source_available_cutoff, 'source available cutoff'),
          systemKnownCutoff: dateTime(row.system_known_cutoff, 'system known cutoff'),
          marketObservationCutoff: dateTime(
            row.market_observation_cutoff,
            'market observation cutoff',
          ),
          semanticSnapshotId: requiredText(row.semantic_snapshot_id, 'semantic snapshot id'),
        },
        derivationId: requiredText(row.derivation_id, 'derivation id'),
        eventRevisionId: requiredText(row.event_revision_id, 'event revision id'),
        evidence,
        pathSteps,
      },
    },
  };
}

export async function getPersonalizationPortfolioImpactV2(
  executor: PersonalizationImpactV2QueryExecutor,
  options: GetPersonalizationPortfolioImpactV2Options,
): Promise<PersonalizationPortfolioImpactV2 | null> {
  validateOptionalKey(options.eventId, 'event id');
  validateOptionalKey(options.scenarioId, 'scenario id');
  if (options.horizon !== null && !allowedHorizons.has(options.horizon)) {
    throw new Error('Portfolio impact v2 horizon is invalid');
  }
  if (!Number.isFinite(options.knownAt.getTime())) {
    throw new Error('Portfolio impact v2 knownAt is invalid');
  }
  const knownAt = options.knownAt.toISOString();
  const snapshots = await executor.queryRows<{ portfolio_snapshot_id: unknown }>(
    SELECTED_SNAPSHOT_V2_SQL,
    [options.userScope.userId, knownAt],
  );
  const snapshot = snapshots[0];
  if (!snapshot) return null;
  const snapshotId = requiredText(snapshot.portfolio_snapshot_id, 'portfolio snapshot id');
  const coverageRows = await executor.queryRows<CoverageRow>(COVERAGE_V2_SQL, [
    options.userScope.userId,
    snapshotId,
    knownAt,
  ]);
  if (coverageRows.length === 0) {
    return personalizationPortfolioImpactV2Schema.parse({
      schemaVersion: 'p4.v2',
      availability: 'not_computed',
      portfolioSnapshotId: snapshotId,
      eventId: options.eventId,
      scenarioId: options.scenarioId,
      knownAt,
      generatedAt: knownAt,
      groups: [],
      coverage: [],
    });
  }
  // No size check here any more, and none is possible honestly. This used to demand
  // exactly ten rows, which worked only because the cohort was a fixed ten and made
  // growing it a 500. The coverage query already selects every security evaluated
  // under one information set, so the rows ARE the evaluated set by construction —
  // there is no upstream count for this path to compare against. "The whole requested
  // universe was evaluated" is checked where the request lives: the K4 store.
  // What remains checkable here is snapshot identity, asserted per row below.
  const coverage = coverageRows.map((row) => {
    if (requiredText(row.portfolio_snapshot_id, 'coverage snapshot id') !== snapshotId) {
      throw new Error('Portfolio impact v2 crossed snapshot identity');
    }
    return {
      entityKey: requiredText(row.entity_key, 'coverage entity key'),
      portfolioWeight:
        row.portfolio_weight == null
          ? null
          : probability(row.portfolio_weight, 'coverage portfolio weight'),
      evaluationCount: positiveInteger(row.evaluation_count, 'evaluation count'),
      acceptedEvaluationCount: Number(row.accepted_evaluation_count),
      reasonCodes: stringArray(row.reason_codes, 'reason codes'),
      reasonDetails: stringArray(row.reason_details, 'reason details'),
    };
  });
  const exposureRows = await executor.queryRows<ExposureRow>(EXPOSURE_V2_SQL, [
    options.userScope.userId,
    snapshotId,
    knownAt,
    options.eventId,
    options.scenarioId,
    options.horizon,
  ]);
  const grouped = new Map<
    string,
    {
      horizon: string;
      channel: string;
      economicMagnitude: { unit: string };
      exposures: ReturnType<typeof mapExposure>['exposure'][];
    }
  >();
  for (const row of exposureRows) {
    if (requiredText(row.portfolio_snapshot_id, 'exposure snapshot id') !== snapshotId) {
      throw new Error('Portfolio impact v2 crossed snapshot identity');
    }
    const mapped = mapExposure(row);
    const key = `${mapped.horizon}\u0000${mapped.channel}\u0000${mapped.unit}`;
    const group = grouped.get(key) ?? {
      horizon: mapped.horizon,
      channel: mapped.channel,
      economicMagnitude: { unit: mapped.unit },
      exposures: [],
    };
    group.exposures.push(mapped.exposure);
    grouped.set(key, group);
  }
  const groups = [...grouped.values()].sort((left, right) => {
    const horizon =
      (horizonOrder.get(left.horizon) ?? Number.MAX_SAFE_INTEGER) -
      (horizonOrder.get(right.horizon) ?? Number.MAX_SAFE_INTEGER);
    if (horizon !== 0) return horizon;
    const channel = compareText(left.channel, right.channel);
    return channel !== 0
      ? channel
      : compareText(left.economicMagnitude.unit, right.economicMagnitude.unit);
  });
  return personalizationPortfolioImpactV2Schema.parse({
    schemaVersion: 'p4.v2',
    availability: 'available',
    portfolioSnapshotId: snapshotId,
    eventId: options.eventId,
    scenarioId: options.scenarioId,
    knownAt,
    generatedAt: knownAt,
    groups,
    coverage,
  });
}
