import type { UserScope } from '../shared/user-scope';

import {
  personalizationPortfolioImpactSchema,
  type PersonalizationPortfolioImpact,
} from '@stock-insight/contracts/personalization';

export type PersonalizationImpactQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetPersonalizationPortfolioImpactOptions = Readonly<{
  userScope: UserScope;
  eventId: string | null;
  scenarioId: string | null;
  horizon: string | null;
  knownAt: Date;
}>;

type ImpactRow = {
  portfolio_snapshot_id: string;
  entity_key: string | null;
  portfolio_weight: string | number;
  sign: string;
  economic_magnitude: string | number;
  impact_exposure_revision_id: string | number;
  evidence_locator: unknown;
};

const boundedKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,319}$/;
const allowedHorizons = new Set(['immediate', 'short', 'medium', 'long']);

const PORTFOLIO_IMPACT_SQL = `
  WITH selected AS MATERIALIZED (
    SELECT snapshot.portfolio_snapshot_id, snapshot.user_id
    FROM personalization.portfolio_snapshot snapshot
    JOIN personalization.portfolio_snapshot_seal seal
      ON seal.portfolio_snapshot_id = snapshot.portfolio_snapshot_id
     AND seal.user_id = snapshot.user_id
     AND seal.sealed_at <= $5::timestamptz
    WHERE snapshot.user_id = $1::uuid
      AND snapshot.source_known_at <= $5::timestamptz
    ORDER BY snapshot.snapshot_as_of DESC, snapshot.portfolio_snapshot_id DESC
    LIMIT 1
  )
  SELECT
    selected.portfolio_snapshot_id,
    identifier.identifier_value AS entity_key,
    lot.portfolio_weight,
    exposure.sign,
    exposure.economic_magnitude,
    exposure.impact_exposure_revision_id,
    exposure.evidence_locator
  FROM selected
  JOIN personalization.portfolio_lot_snapshot lot
    ON lot.portfolio_snapshot_id = selected.portfolio_snapshot_id
   AND lot.user_id = selected.user_id
  JOIN analytics.impact_exposure_revision exposure
    ON exposure.entity_id = lot.security_entity_id
   AND exposure.exposure_state = 'sealed'
   AND exposure.known_at <= $5::timestamptz
   AND exposure.sealed_at <= $5::timestamptz
   AND exposure.economic_magnitude IS NOT NULL
  JOIN analytics.impact_shock shock ON shock.impact_shock_id = exposure.impact_shock_id
  JOIN world.event_revision event_revision
    ON event_revision.event_revision_id = shock.event_revision_id
   AND event_revision.known_at <= $5::timestamptz
  JOIN world.event event ON event.event_id = event_revision.event_id
  JOIN core.entity_identifier identifier
    ON identifier.entity_id = lot.security_entity_id
   AND identifier.identifier_type = 'INTERNAL_KEY'
   AND (identifier.valid_from IS NULL OR identifier.valid_from <= $5::timestamptz)
   AND (identifier.valid_to IS NULL OR identifier.valid_to > $5::timestamptz)
  WHERE ($2::text IS NULL OR event.event_key = $2::text)
    AND ($4::text IS NULL OR exposure.horizon = $4::text)
    AND (
      $3::text IS NULL
      OR EXISTS (
        SELECT 1
        FROM analytics.scenario_set scenario_set
        JOIN analytics.scenario_branch branch
          ON branch.scenario_set_id = scenario_set.scenario_set_id
         AND branch.branch_state = 'sealed'
        WHERE scenario_set.impact_shock_id = shock.impact_shock_id
          AND scenario_set.known_at <= $5::timestamptz
          AND branch.branch_key = $3::text
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM analytics.impact_exposure_revision successor
      WHERE successor.supersedes_impact_exposure_revision_id = exposure.impact_exposure_revision_id
        AND successor.known_at <= $5::timestamptz
    )
  ORDER BY identifier.identifier_value, exposure.impact_exposure_revision_id
`;

function validateOptionalKey(value: string | null, field: string): void {
  if (value !== null && !boundedKeyPattern.test(value)) {
    throw new Error(`Portfolio impact ${field} is invalid`);
  }
}

function evidenceRefs(value: unknown, exposureId: string | number): string[] {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const refs = ['source_uri', 'url', 'source_ref', 'id']
      .map((key) => record[key])
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (refs.length > 0) return [...new Set(refs)].slice(0, 50);
  }
  return [`impact-exposure:${String(exposureId)}`];
}

function normalizeMetric(value: number): number {
  const rounded = Number(value.toFixed(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export async function getPersonalizationPortfolioImpact(
  executor: PersonalizationImpactQueryExecutor,
  options: GetPersonalizationPortfolioImpactOptions,
): Promise<PersonalizationPortfolioImpact | null> {
  validateOptionalKey(options.eventId, 'event id');
  validateOptionalKey(options.scenarioId, 'scenario id');
  if (options.horizon !== null && !allowedHorizons.has(options.horizon)) {
    throw new Error('Portfolio impact horizon is invalid');
  }
  if (!Number.isFinite(options.knownAt.getTime())) {
    throw new Error('Portfolio impact knownAt is invalid');
  }
  const rows = await executor.queryRows<ImpactRow>(PORTFOLIO_IMPACT_SQL, [
    options.userScope.userId,
    options.eventId,
    options.scenarioId,
    options.horizon,
    options.knownAt.toISOString(),
  ]);
  const first = rows[0];
  if (!first) return null;
  if (rows.some((row) => row.portfolio_snapshot_id !== first.portfolio_snapshot_id)) {
    throw new Error('Portfolio impact crossed snapshot identity');
  }

  const byEntity = new Map<
    string,
    {
      portfolioWeight: number;
      impactScore: number;
      positive: boolean;
      negative: boolean;
      evidenceRefs: Set<string>;
    }
  >();
  for (const row of rows) {
    if (row.entity_key === null) throw new Error('Portfolio impact entity identity is missing');
    const weight = Number(row.portfolio_weight);
    const magnitude = Number(row.economic_magnitude);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1 || !Number.isFinite(magnitude)) {
      throw new Error('Portfolio impact numeric input is invalid');
    }
    const signedMagnitude =
      row.sign === 'positive' ? magnitude : row.sign === 'negative' ? -magnitude : 0;
    const current = byEntity.get(row.entity_key) ?? {
      portfolioWeight: weight,
      impactScore: 0,
      positive: false,
      negative: false,
      evidenceRefs: new Set<string>(),
    };
    if (Math.abs(current.portfolioWeight - weight) > 1e-8) {
      throw new Error('Portfolio impact position weight is inconsistent');
    }
    current.impactScore += signedMagnitude;
    current.positive ||= signedMagnitude > 0;
    current.negative ||= signedMagnitude < 0;
    for (const reference of evidenceRefs(row.evidence_locator, row.impact_exposure_revision_id)) {
      current.evidenceRefs.add(reference);
    }
    byEntity.set(row.entity_key, current);
  }

  const affectedPositions = [...byEntity.entries()].map(([entityKey, item]) => ({
    entityKey,
    portfolioWeight: item.portfolioWeight,
    direction:
      item.positive && item.negative
        ? ('mixed' as const)
        : item.positive
          ? ('positive' as const)
          : item.negative
            ? ('negative' as const)
            : ('neutral' as const),
    impactScore: normalizeMetric(item.impactScore),
    contribution: normalizeMetric(item.portfolioWeight * item.impactScore),
    evidenceRefs: [...item.evidenceRefs],
  }));
  const aggregateImpact = affectedPositions.reduce((sum, item) => sum + item.contribution, 0);
  if (!Number.isFinite(aggregateImpact)) throw new Error('Portfolio impact aggregate is invalid');

  return personalizationPortfolioImpactSchema.parse({
    schemaVersion: 'p4.v1',
    availability: 'available',
    portfolioSnapshotId: first.portfolio_snapshot_id,
    eventId: options.eventId,
    scenarioId: options.scenarioId,
    horizon: options.horizon ?? 'all',
    knownAt: options.knownAt.toISOString(),
    generatedAt: options.knownAt.toISOString(),
    aggregateImpact: normalizeMetric(aggregateImpact),
    affectedPositions,
  });
}
