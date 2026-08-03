import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// Builds personalization.portfolio_snapshot and portfolio_lot_snapshot from the
// holdings a user registered.
//
// Both tables have had readers since they were created and no writer at all:
// portfolio-read-model.ts and impact-read-model.ts select from them, nothing
// inserts. public.user_positions has a working write path (POST /api/positions →
// handlePositionUpsert), so registration already lands; it just never became a
// point-in-time snapshot.
//
// Registration is visible immediately without this — apps/api/src/stocks/read-model.ts
// reads user_positions directly. What this adds is the snapshot the personalization
// read models need, and it appears on the next pipeline run rather than on upsert.
//
// Scope note: this fills the snapshot, not the exposure. impact-read-model.ts also
// reads analytics.impact_exposure_revision, which stays empty on purpose — filling
// it would mean inventing sign, materiality and economic magnitude per holding.

const JOB_NAME = 'stock-insight-portfolio-snapshot';
const APPLY = process.argv.includes('--apply');

// KRW, because the product is Korean-facing and the collected rate (fred:DEXKOUS)
// is quoted as KRW per USD — converting the other way would introduce a division
// this code does not need to make.
const BASE_CURRENCY = 'KRW';

type PgModule = { Pool: new (options: { connectionString: string; max?: number }) => pg.Pool };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

// One statement so holdings, prices and the FX vintage are read in a single
// consistent snapshot. Anything that cannot be priced comes back too, because the
// decision about it is made in code rather than by a WHERE clause quietly
// dropping rows.
//
// snapshot_as_of is the OLDEST price time across the user's lots, not the newest:
// the row claims "the portfolio as of T", and that claim has to hold for every
// lot in it. source_known_at is now(). The table CHECKs
// source_known_at >= snapshot_as_of, which only holds in this direction.
const PORTFOLIO_SQL = `
WITH open_position AS (
  SELECT position.id,
         position.user_id,
         position.entity_key,
         position.quantity,
         position.avg_price,
         position.opened_at,
         split_part(position.entity_key, ':', 1) AS market,
         split_part(position.entity_key, ':', 2) AS ticker
  FROM public.user_positions position
  WHERE position.status = 'open'
    AND position.closed_at IS NULL
    AND position.quantity IS NOT NULL
    AND position.quantity > 0
),
-- The rate is point-in-time: the newest observation at or before the price date,
-- and within that the newest vintage. A rate published after the prices would
-- describe a portfolio that did not exist yet.
fx AS (
  SELECT DISTINCT ON (1) 1 AS one,
         vintage.value AS krw_per_usd,
         vintage.observation_date AS fx_observation_date
  FROM market.macro_vintage vintage
  WHERE vintage.series_key = 'fred:DEXKOUS'
    AND vintage.value IS NOT NULL
  ORDER BY 1, vintage.observation_date DESC, vintage.vintage_date DESC
),
priced AS (
  SELECT open_position.*,
         identity.entity_id AS security_entity_id,
         price.latest_price,
         price.currency,
         price.price_as_of,
         fx.krw_per_usd,
         fx.fx_observation_date,
         CASE
           WHEN price.latest_price IS NULL THEN NULL
           WHEN price.currency = 'KRW' THEN open_position.quantity * price.latest_price::numeric
           WHEN price.currency = 'USD' AND fx.krw_per_usd IS NOT NULL
             THEN open_position.quantity * price.latest_price::numeric * fx.krw_per_usd
           ELSE NULL
         END AS market_value
  FROM open_position
  LEFT JOIN core.entity_identifier identity
    ON identity.identifier_type = 'INTERNAL_KEY'
   AND identity.identifier_value = open_position.entity_key
  LEFT JOIN serving.latest_price_v1 price
    ON price.market = open_position.market
   AND price.ticker = open_position.ticker
  LEFT JOIN fx ON true
)
SELECT user_id, id, entity_key, security_entity_id, market, currency,
       quantity, avg_price, opened_at, latest_price, price_as_of,
       market_value, krw_per_usd, fx_observation_date
FROM priced
ORDER BY user_id, entity_key
`;

const LATEST_DIGEST_SQL = `
SELECT snapshot_digest
FROM personalization.portfolio_snapshot
WHERE user_id = $1
ORDER BY snapshot_as_of DESC, created_at DESC
LIMIT 1
`;

const INSERT_SNAPSHOT_SQL = `
INSERT INTO personalization.portfolio_snapshot (
  portfolio_snapshot_id, user_id, snapshot_as_of, source_known_at,
  base_currency, total_market_value, position_count, snapshot_digest
) VALUES ($1, $2, $3, now(), $4, $5, $6, $7)
ON CONFLICT (user_id, snapshot_as_of, snapshot_digest) DO NOTHING
RETURNING portfolio_snapshot_id
`;

const INSERT_LOT_SQL = `
INSERT INTO personalization.portfolio_lot_snapshot (
  portfolio_lot_snapshot_id, portfolio_snapshot_id, user_id, security_entity_id,
  lot_key, market, currency, quantity, market_value, portfolio_weight,
  cost_basis_total, acquired_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

export type PositionRow = QueryResultRow & {
  user_id: string;
  id: string | number;
  entity_key: string;
  security_entity_id: string | number | null;
  market: string;
  currency: string | null;
  quantity: string;
  avg_price: string | null;
  opened_at: string | Date | null;
  latest_price: number | null;
  price_as_of: Date | null;
  market_value: string | null;
  krw_per_usd: string | null;
  fx_observation_date: Date | null;
};

export type UserOutcome = {
  userId: string;
  positions: number;
  written: boolean;
  reason?: string;
  unpriced?: string[];
  unresolved?: string[];
  totalMarketValue?: string;
  snapshotAsOf?: string;
  fxObservationDate?: string | null;
};

// A holding that cannot be priced is not skipped. portfolio_weight is NOT NULL on
// every lot, so one missing price silently rescales the weight of every other
// holding, and position_count plus total_market_value would then describe a
// portfolio the user does not have. Refusing is the only answer that leaves the
// user's own numbers intact.
export function evaluateUser(userId: string, rows: PositionRow[]): UserOutcome {
  const unresolved = rows.filter((row) => row.security_entity_id === null).map((r) => r.entity_key);
  const unpriced = rows
    .filter((row) => row.security_entity_id !== null && row.market_value === null)
    .map((row) => row.entity_key);

  if (unresolved.length > 0 || unpriced.length > 0) {
    return {
      userId,
      positions: rows.length,
      written: false,
      reason: 'holdings without a resolvable entity or a current price',
      unresolved,
      unpriced,
    };
  }

  const total = rows.reduce((sum, row) => sum + Number(row.market_value), 0);
  if (!(total > 0)) {
    return { userId, positions: rows.length, written: false, reason: 'total market value is zero' };
  }

  // Oldest, so "as of" is true for every lot in the snapshot.
  const asOf = rows
    .map((row) => row.price_as_of)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  if (!asOf) {
    return { userId, positions: rows.length, written: false, reason: 'no price timestamp' };
  }

  return {
    userId,
    positions: rows.length,
    written: true,
    totalMarketValue: total.toFixed(8),
    snapshotAsOf: asOf.toISOString(),
    fxObservationDate: rows[0]?.fx_observation_date?.toISOString().slice(0, 10) ?? null,
  };
}

// The FX rate and every price go into the digest. If either moves,
// total_market_value moves, and that is a different snapshot even when the
// holdings are untouched. Without the rate in here a portfolio would look
// unchanged through a currency swing.
async function digestFor(rows: PositionRow[]): Promise<string> {
  const { createHash } = await import('node:crypto');
  const material = rows
    .map((row) =>
      [
        row.entity_key,
        row.quantity,
        row.latest_price ?? '',
        row.currency ?? '',
        row.price_as_of?.toISOString() ?? '',
        row.krw_per_usd ?? '',
      ].join('|'),
    )
    .sort()
    .join('\n');
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client: PoolClient = await pool.connect();

  try {
    const { rows } = await client.query<PositionRow>(PORTFOLIO_SQL);
    const byUser = new Map<string, PositionRow[]>();
    for (const row of rows) {
      const list = byUser.get(row.user_id) ?? [];
      list.push(row);
      byUser.set(row.user_id, list);
    }

    const outcomes: UserOutcome[] = [];
    let snapshotsWritten = 0;
    let unchanged = 0;

    for (const [userId, userRows] of byUser) {
      const outcome = evaluateUser(userId, userRows);
      if (!outcome.written || !APPLY) {
        outcomes.push(outcome);
        continue;
      }

      const digest = await digestFor(userRows);
      const latest = await client.query<QueryResultRow & { snapshot_digest: string }>(
        LATEST_DIGEST_SQL,
        [userId],
      );
      if (latest.rows[0]?.snapshot_digest === digest) {
        unchanged += 1;
        outcomes.push({ ...outcome, written: false, reason: 'unchanged since last snapshot' });
        continue;
      }

      await client.query('BEGIN');
      try {
        const snapshotId = randomUUID();
        const inserted = await client.query(INSERT_SNAPSHOT_SQL, [
          snapshotId,
          userId,
          outcome.snapshotAsOf,
          BASE_CURRENCY,
          outcome.totalMarketValue,
          userRows.length,
          digest,
        ]);
        if (inserted.rowCount === 0) {
          await client.query('ROLLBACK');
          unchanged += 1;
          outcomes.push({ ...outcome, written: false, reason: 'snapshot already recorded' });
          continue;
        }

        const total = Number(outcome.totalMarketValue);
        for (const row of userRows) {
          const marketValue = Number(row.market_value);
          await client.query(INSERT_LOT_SQL, [
            randomUUID(),
            snapshotId,
            userId,
            row.security_entity_id,
            `position:${row.id}`,
            row.market,
            row.currency,
            row.quantity,
            marketValue.toFixed(8),
            (marketValue / total).toFixed(8),
            row.avg_price === null
              ? null
              : (Number(row.avg_price) * Number(row.quantity)).toFixed(8),
            row.opened_at,
          ]);
        }
        await client.query('COMMIT');
        snapshotsWritten += 1;
        outcomes.push(outcome);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }

    const summary = {
      job: JOB_NAME,
      mode: APPLY ? 'apply' : 'dry-run',
      baseCurrency: BASE_CURRENCY,
      usersWithHoldings: byUser.size,
      snapshotsWritten,
      unchanged,
      refused: outcomes.filter(
        (outcome) => outcome.reason && outcome.reason !== 'unchanged since last snapshot',
      ).length,
      outcomes,
    };
    console.log(JSON.stringify(summary, null, 2));

    // Only when something happened: this runs on every pipeline pass and a row per
    // quiet run would bury the ones that matter.
    if (APPLY && (snapshotsWritten > 0 || summary.refused > 0)) {
      await client.query(INSERT_MIGRATION_RUN_SQL, [
        `${JOB_NAME}-${randomUUID()}`,
        JOB_NAME,
        'completed',
        startedAt.toISOString(),
        JSON.stringify(summary),
      ]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('run-portfolio-snapshot.ts')) {
  await main();
}
