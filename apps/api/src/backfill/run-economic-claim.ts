import pg, { type PoolClient } from 'pg';

import {
  buildEconomicClaims,
  findClaimViolations,
  type EconomicClaimRow,
  type SecurityReading,
} from './economic-claim.ts';

/**
 * Fills core.economic_claim, one open row per security.
 *
 * It writes far more "we do not know" than anything else, and that is the
 * deliverable rather than a shortfall: until this table exists a consumer that
 * reaches for a security gets nothing back about what the security is and carries
 * on assuming common equity. canonical/03 §2 says that assumption is wrong, and a
 * NULL that has to be handled is the smallest honest correction.
 */

const JOB_NAME = 'stock-insight-economic-claim';

/**
 * The holdings snapshots are the only claim-type evidence the database holds.
 *
 * They live under provider_key 'internal-etf-holdings-snapshot', which also
 * carries 998 documents that belong to four other snapshot sources — an
 * attribution bug fixed on 2026-08-05 whose historical rows were never moved
 * (see migrations 068 and 069). The document id prefix is therefore the filter,
 * not the provider key: 'etf:<ticker>' is an ETF holdings document and nothing
 * else under that source is.
 */
const SECURITIES_SQL = `
WITH etf_ticker AS (
  SELECT DISTINCT split_part(ro.source_document_id, ':', 2) AS ticker
    FROM ingestion.raw_object ro
    JOIN ingestion.source s ON s.source_id = ro.source_id
   WHERE s.provider_key = 'internal-etf-holdings-snapshot'
     AND ro.source_document_id LIKE 'etf:%'
)
SELECT sm.security_master_id,
       sm.primary_ticker,
       sm.created_at,
       issuer.issuer_entity_id,
       listing.currency,
       listing.valid_from AS listed_from,
       (etf_ticker.ticker IS NOT NULL) AS has_holdings_snapshot
  FROM core.security_master sm
  LEFT JOIN LATERAL (
    SELECT sii.issuer_entity_id
      FROM core.security_issuer_identity sii
     WHERE sii.security_entity_id = sm.security_entity_id
     ORDER BY sii.valid_from DESC
     LIMIT 1
  ) issuer ON true
  LEFT JOIN LATERAL (
    SELECT l.currency, l.valid_from
      FROM core.listing l
     WHERE l.security_entity_id = sm.security_entity_id
     ORDER BY l.valid_from
     LIMIT 1
  ) listing ON true
  LEFT JOIN etf_ticker ON etf_ticker.ticker = sm.primary_ticker
 ORDER BY sm.security_master_id
`;

const EXISTING_SQL = `
SELECT security_master_id, claim_type_state
  FROM core.economic_claim
 WHERE valid_to IS NULL
`;

const INSERT_COLUMNS = `
  security_master_id, issuer_entity_id, claim_type, claim_type_state,
  determination_basis, valid_from, known_at, determined_by`;

const INSERT_CHUNK_ROWS = 200;

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for the economic claim backfill');
  return url;
}

function placeholders(rowCount: number, columnCount: number): string {
  const rows: string[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const cells: string[] = [];
    for (let column = 0; column < columnCount; column += 1) {
      cells.push(`$${row * columnCount + column + 1}`);
    }
    rows.push(`(${cells.join(',')})`);
  }
  return rows.join(',');
}

async function write(client: PoolClient, rows: readonly EconomicClaimRow[]): Promise<number> {
  let written = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_ROWS) {
    const batch = rows.slice(index, index + INSERT_CHUNK_ROWS);
    const params = batch.flatMap((row) => [
      row.securityMasterId,
      row.issuerEntityId,
      row.claimType,
      row.claimTypeState,
      row.determinationBasis,
      row.validFrom,
      row.knownAt,
      JOB_NAME,
    ]);
    const result = await client.query(
      `INSERT INTO core.economic_claim (${INSERT_COLUMNS})
       VALUES ${placeholders(batch.length, 8)}
       ON CONFLICT (security_master_id, valid_from) DO NOTHING`,
      params,
    );
    written += result.rowCount ?? 0;
  }
  return written;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const rehearse = process.argv.includes('--rehearse');
  // Passed in rather than read from now() inside SQL, so a run is reproducible
  // and REQ-PIT-003's audit has nothing to find.
  const knownAt = new Date().toISOString();

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: getDatabaseUrl(), max: 1 });
  const client = await pool.connect();

  try {
    const [securities, existing] = await Promise.all([
      client.query<{
        security_master_id: string;
        primary_ticker: string;
        created_at: Date;
        issuer_entity_id: string | null;
        currency: string | null;
        listed_from: Date | null;
        has_holdings_snapshot: boolean;
      }>(SECURITIES_SQL),
      client.query<{ security_master_id: string; claim_type_state: string }>(EXISTING_SQL),
    ]);

    const readings: SecurityReading[] = securities.rows.map((row) => ({
      securityMasterId: Number(row.security_master_id),
      primaryTicker: row.primary_ticker,
      issuerEntityId: row.issuer_entity_id === null ? null : Number(row.issuer_entity_id),
      currency: row.currency,
      listedFrom: row.listed_from ? new Date(row.listed_from).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      hasHoldingsSnapshot: row.has_holdings_snapshot,
    }));

    const built = buildEconomicClaims(readings, knownAt);
    const alreadyOpen = new Set(existing.rows.map((row) => Number(row.security_master_id)));
    const toWrite = built.rows.filter((row) => !alreadyOpen.has(row.securityMasterId));
    const violations = findClaimViolations(toWrite);

    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : rehearse ? 'rehearse' : 'dry-run',
      securities: readings.length,
      determined: built.determined,
      undetermined: built.undetermined,
      alreadyOpen: alreadyOpen.size,
      toWrite: toWrite.length,
      determinedTickers: built.rows
        .filter((row) => row.claimTypeState === 'determined')
        .map(
          (row) => readings.find((r) => r.securityMasterId === row.securityMasterId)?.primaryTicker,
        )
        .filter(Boolean),
      withoutIssuer: toWrite.filter((row) => row.issuerEntityId === null).length,
      schemaViolations: violations,
    };

    if (!apply && !rehearse) {
      console.log(JSON.stringify({ ...summary, hint: 'rerun with --apply' }, null, 2));
      return;
    }
    if (violations.length > 0) {
      throw new Error(`refusing to write: ${JSON.stringify(violations)}`);
    }

    await client.query('BEGIN');
    try {
      const written = await write(client, toWrite);
      await client.query(rehearse ? 'ROLLBACK' : 'COMMIT');
      console.log(
        JSON.stringify({ ...summary, [rehearse ? 'rolledBack' : 'written']: written }, null, 2),
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
