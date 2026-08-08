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

const boundedKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,319}$/;
const allowedHorizons = new Set(['immediate', 'short', 'medium', 'long']);

const SELECTED_SNAPSHOT_SQL = `
/* p4_v1_selected_snapshot_only */
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

function validateOptionalKey(value: string | null, field: string): void {
  if (value !== null && !boundedKeyPattern.test(value)) {
    throw new Error(`Portfolio impact ${field} is invalid`);
  }
}

/**
 * p4.v1 has one scalar aggregateImpact field and therefore cannot represent
 * unit-aware K4 exposures without either adding unlike units or dropping data.
 * It deliberately serves only the legacy not-computed envelope. p4.v2 is the
 * sole read path for sealed K4 economic magnitudes.
 */
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
  const knownAt = options.knownAt.toISOString();
  const snapshots = await executor.queryRows<{ portfolio_snapshot_id: string }>(
    SELECTED_SNAPSHOT_SQL,
    [options.userScope.userId, knownAt],
  );
  const snapshot = snapshots[0];
  if (!snapshot) return null;
  return personalizationPortfolioImpactSchema.parse({
    schemaVersion: 'p4.v1',
    availability: 'not_computed',
    portfolioSnapshotId: snapshot.portfolio_snapshot_id,
    eventId: options.eventId,
    scenarioId: options.scenarioId,
    horizon: options.horizon ?? 'all',
    knownAt,
    generatedAt: knownAt,
    aggregateImpact: 0,
    affectedPositions: [],
  });
}
