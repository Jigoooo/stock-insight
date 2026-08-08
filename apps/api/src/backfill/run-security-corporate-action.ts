import pg, { type PoolClient } from 'pg';

import {
  buildCorporateActionRows,
  corporateActionKey,
  type CollectedAction,
  type CorporateActionRow,
} from './security-corporate-action.ts';

/**
 * Fills core.security_corporate_action, the claim-continuity bridge of
 * canonical/03 §6, from the actions already collected into market.corporate_action.
 *
 * Same shape as the numeric fact backfill and for the same reason: the collected
 * table is a serving convenience keyed by whatever the vendor sent, and the
 * canonical one is the record a valuation has to be able to walk backwards
 * through. A price series that spans a split and does not know it is wrong in a
 * way nothing downstream can detect, which is why the bridge is separate.
 *
 * Measured 2026-08-08: market.corporate_action holds 10,040 rows, 508 splits and
 * 9,532 dividends. Only the splits cross over — see the module comment.
 */

const JOB_NAME = 'stock-insight-security-corporate-action';

const COLLECTED_SQL = `
SELECT sm.security_master_id,
       ca.action_type,
       to_char(ca.effective_date, 'YYYY-MM-DD') AS effective_date,
       ca.ratio::text AS ratio,
       ca.currency,
       ca.source_provider,
       ca.available_at
  FROM market.corporate_action ca
  JOIN core.security_master sm ON sm.security_entity_id = ca.security_entity_id
 WHERE ca.effective_date IS NOT NULL
 ORDER BY sm.security_master_id, ca.effective_date, ca.action_id
`;

/** Actions whose security is not in the master, counted rather than dropped silently. */
const UNMAPPED_SQL = `
SELECT count(*)::int AS n
  FROM market.corporate_action ca
 WHERE NOT EXISTS (
   SELECT 1 FROM core.security_master sm WHERE sm.security_entity_id = ca.security_entity_id
 )
`;

const EXISTING_SQL = `
SELECT security_master_id, to_char(effective_at, 'YYYY-MM-DD') AS effective_at, action_kind
  FROM core.security_corporate_action
`;

const INSERT_COLUMNS = `
  security_master_id, action_kind, effective_at, known_at,
  ratio_numerator, ratio_denominator, metadata`;

const INSERT_CHUNK_ROWS = 500;

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for the corporate action bridge');
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

/**
 * The table's own CHECK, applied before a transaction opens.
 *
 * `known_at >= effective_at - interval '1 day'` is the one that can actually fail
 * here: the collected available_at is a collection timestamp and the effective
 * dates run back to 1965, so it holds today, but a future collector that
 * backdated availability would break every row in one batch and name one.
 */
export function findBridgeViolations(
  rows: readonly CorporateActionRow[],
): { rule: string; count: number; example: string }[] {
  const found = new Map<string, { count: number; example: string }>();
  const record = (rule: string, example: string): void => {
    const entry = found.get(rule);
    if (entry) entry.count += 1;
    else found.set(rule, { count: 1, example });
  };

  const oneDay = 24 * 60 * 60 * 1000;
  for (const row of rows) {
    const at = corporateActionKey(row);
    if (Date.parse(row.knownAt) < Date.parse(row.effectiveAt) - oneDay) {
      record('known_at is more than a day before effective_at', at);
    }
    if (row.ratioDenominator === 0) record('ratio_denominator is zero', at);
    if ((row.ratioNumerator === null) !== (row.ratioDenominator === null)) {
      record('half a ratio is not a ratio', at);
    }
  }

  return [...found.entries()].map(([rule, entry]) => ({ rule, ...entry }));
}

async function write(client: PoolClient, rows: readonly CorporateActionRow[]): Promise<number> {
  let written = 0;
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_ROWS) {
    const batch = rows.slice(index, index + INSERT_CHUNK_ROWS);
    const params = batch.flatMap((row) => [
      row.securityMasterId,
      row.actionKind,
      row.effectiveAt,
      row.knownAt,
      row.ratioNumerator,
      row.ratioDenominator,
      JSON.stringify({ ...row.metadata, writtenBy: JOB_NAME }),
    ]);
    const result = await client.query(
      `INSERT INTO core.security_corporate_action (${INSERT_COLUMNS})
       VALUES ${placeholders(batch.length, 7)}`,
      params,
    );
    written += result.rowCount ?? 0;
  }
  return written;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const rehearse = process.argv.includes('--rehearse');
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: getDatabaseUrl(), max: 1 });
  const client = await pool.connect();

  try {
    const [collected, unmapped, existing] = await Promise.all([
      client.query<{
        security_master_id: string;
        action_type: string;
        effective_date: string;
        ratio: string | null;
        currency: string | null;
        source_provider: string;
        available_at: Date;
      }>(COLLECTED_SQL),
      client.query<{ n: number }>(UNMAPPED_SQL),
      client.query<{ security_master_id: string; effective_at: string; action_kind: string }>(
        EXISTING_SQL,
      ),
    ]);

    const inputs: CollectedAction[] = collected.rows.map((row) => ({
      securityMasterId: Number(row.security_master_id),
      actionType: row.action_type,
      effectiveDate: row.effective_date,
      ratio: row.ratio,
      currency: row.currency,
      sourceProvider: row.source_provider,
      availableAt: new Date(row.available_at).toISOString(),
    }));

    const { rows: built, skips } = buildCorporateActionRows(inputs);

    const alreadyWritten = new Set(
      existing.rows.map(
        (row) => `${row.security_master_id}:${row.effective_at}:${row.action_kind}`,
      ),
    );
    const seen = new Set<string>();
    const toWrite: CorporateActionRow[] = [];
    let duplicatesInSource = 0;
    for (const row of built) {
      const key = corporateActionKey(row);
      if (alreadyWritten.has(key)) continue;
      if (seen.has(key)) {
        duplicatesInSource += 1;
        continue;
      }
      seen.add(key);
      toWrite.push(row);
    }

    const violations = findBridgeViolations(toWrite);
    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : rehearse ? 'rehearse' : 'dry-run',
      collected: inputs.length,
      unmappedSecurities: unmapped.rows[0]?.n ?? 0,
      alreadyWritten: alreadyWritten.size,
      toWrite: toWrite.length,
      splits: toWrite.filter((row) => row.actionKind === 'split').length,
      reverseSplits: toWrite.filter((row) => row.actionKind === 'reverse_split').length,
      withExactRatio: toWrite.filter((row) => row.ratioNumerator !== null).length,
      duplicatesInSource,
      schemaViolations: violations,
      skips,
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
