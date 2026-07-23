import type { UserScope } from '../shared/user-scope';

import {
  personalizationPortfolioSnapshotSchema,
  type PersonalizationPortfolioSnapshot,
} from '@stock-insight/contracts/personalization';

export type PersonalizationQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetPersonalizationPortfolioSnapshotOptions = Readonly<{
  userScope: UserScope;
  snapshotId?: string | null;
}>;

type PortfolioSnapshotRow = {
  portfolio_snapshot_id: string;
  snapshot_as_of: string | Date;
  source_known_at: string | Date;
  sealed_at: string | Date;
  base_currency: string;
  total_market_value: string | number;
  position_count: string | number;
  snapshot_digest: string;
  entity_key: string | null;
  entity_name: string | null;
  market: string | null;
  currency: string | null;
  quantity: string | number | null;
  market_value: string | number | null;
  portfolio_weight: string | number | null;
  cost_basis_total: string | number | null;
  acquired_at: string | Date | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PORTFOLIO_SNAPSHOT_SQL = `
  WITH selected AS (
    SELECT
      snapshot.*,
      seal.sealed_at
    FROM personalization.portfolio_snapshot snapshot
    JOIN personalization.portfolio_snapshot_seal seal
      ON seal.portfolio_snapshot_id = snapshot.portfolio_snapshot_id
     AND seal.user_id = snapshot.user_id
    WHERE snapshot.user_id = $1::uuid
      AND ($2::uuid IS NULL OR snapshot.portfolio_snapshot_id = $2::uuid)
    ORDER BY snapshot.snapshot_as_of DESC, snapshot.portfolio_snapshot_id DESC
    LIMIT 1
  )
  SELECT
    selected.portfolio_snapshot_id,
    selected.snapshot_as_of,
    selected.source_known_at,
    selected.sealed_at,
    selected.base_currency,
    selected.total_market_value,
    selected.position_count,
    selected.snapshot_digest,
    identifier.identifier_value AS entity_key,
    entity.canonical_name AS entity_name,
    lot.market,
    lot.currency,
    lot.quantity,
    lot.market_value,
    lot.portfolio_weight,
    lot.cost_basis_total,
    lot.acquired_at
  FROM selected
  LEFT JOIN personalization.portfolio_lot_snapshot lot
    ON lot.portfolio_snapshot_id = selected.portfolio_snapshot_id
   AND lot.user_id = selected.user_id
  LEFT JOIN core.entity entity ON entity.entity_id = lot.security_entity_id
  LEFT JOIN LATERAL (
    SELECT candidate.identifier_value
    FROM core.entity_identifier candidate
    WHERE candidate.entity_id = lot.security_entity_id
      AND candidate.identifier_type = 'INTERNAL_KEY'
      AND (candidate.valid_from IS NULL OR candidate.valid_from <= selected.snapshot_as_of)
      AND (candidate.valid_to IS NULL OR candidate.valid_to > selected.snapshot_as_of)
    ORDER BY candidate.valid_from DESC NULLS LAST, candidate.identifier_id DESC
    LIMIT 1
  ) identifier ON true
  ORDER BY lot.market_value DESC NULLS LAST, lot.portfolio_lot_snapshot_id ASC NULLS LAST
`;

function toIso(value: string | Date, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Portfolio snapshot ${field} is invalid`);
  return date.toISOString();
}

function toDecimal(value: string | number, field: string): string {
  const text = String(value);
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Portfolio snapshot ${field} is invalid`);
  }
  return text;
}

function toCount(value: string | number): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0 || count > 1_000) {
    throw new Error('Portfolio snapshot position count is invalid');
  }
  return count;
}

export async function getPersonalizationPortfolioSnapshot(
  executor: PersonalizationQueryExecutor,
  options: GetPersonalizationPortfolioSnapshotOptions,
): Promise<PersonalizationPortfolioSnapshot | null> {
  const snapshotId = options.snapshotId ?? null;
  if (snapshotId !== null && !uuidPattern.test(snapshotId)) {
    throw new Error('Portfolio snapshot id is invalid');
  }
  const rows = await executor.queryRows<PortfolioSnapshotRow>(PORTFOLIO_SNAPSHOT_SQL, [
    options.userScope.userId,
    snapshotId,
  ]);
  const first = rows[0];
  if (!first) return null;
  if (rows.some((row) => row.portfolio_snapshot_id !== first.portfolio_snapshot_id)) {
    throw new Error('Portfolio snapshot rows crossed snapshot identity');
  }

  const positions = rows.flatMap((row) => {
    if (row.market === null) return [];
    if (
      row.entity_key === null ||
      row.entity_name === null ||
      row.currency === null ||
      row.quantity === null ||
      row.market_value === null ||
      row.portfolio_weight === null
    ) {
      throw new Error('Portfolio snapshot position identity is incomplete');
    }
    const weight = Number(row.portfolio_weight);
    if (!Number.isFinite(weight)) throw new Error('Portfolio snapshot weight is invalid');
    return [
      {
        entityKey: row.entity_key,
        entityName: row.entity_name,
        market: row.market,
        currency: row.currency,
        quantity: toDecimal(row.quantity, 'quantity'),
        marketValue: toDecimal(row.market_value, 'market value'),
        portfolioWeight: weight,
        costBasisTotal:
          row.cost_basis_total === null
            ? null
            : toDecimal(row.cost_basis_total, 'cost basis total'),
        acquiredAt: row.acquired_at === null ? null : toIso(row.acquired_at, 'acquired at'),
      },
    ];
  });

  return personalizationPortfolioSnapshotSchema.parse({
    schemaVersion: 'p4.v1',
    availability: 'available',
    portfolioSnapshotId: first.portfolio_snapshot_id,
    snapshotAsOf: toIso(first.snapshot_as_of, 'snapshot as of'),
    sourceKnownAt: toIso(first.source_known_at, 'source known at'),
    sealedAt: toIso(first.sealed_at, 'sealed at'),
    baseCurrency: first.base_currency,
    totalMarketValue: toDecimal(first.total_market_value, 'total market value'),
    positionCount: toCount(first.position_count),
    snapshotDigest: first.snapshot_digest,
    positions,
  });
}
