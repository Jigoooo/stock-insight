// Fetches the KSIC code→name table and labels the KSIC taxonomy nodes with it.
//
//   node apps/api/src/ingest/run-ksic-classification-table.ts            # dry run
//   node apps/api/src/ingest/run-ksic-classification-table.ts --apply
//
// 169 Korean stocks carry a KSIC code and every one of their nodes has an empty label,
// because DART's company profile reports the code and never its name. '66121' is not
// something a reviewer can act on; '증권 중개업' is. Sector playbooks are written by
// reading what an industry IS, so this blocks that work outright.
//
// Migration 106 records where this comes from and why it is registered as an
// unlicensed third-party mirror. The short version: Statistics Korea publishes the
// table, its portal does not resolve from this network, and data.go.kr and KOSIS carry
// no KSIC code→name API — all three checked rather than assumed.

import { createGunzip } from 'node:zlib';

import pg, { type PoolClient } from 'pg';

import {
  CLOSE_FETCH_RUN_SQL,
  OPEN_FETCH_RUN_SQL,
  appendRawObjectManifest,
  registerRawObjectWithRevision,
  writeRawObject,
} from './raw-object-store.ts';

const JOB_NAME = 'stock-insight-ksic-classification-table';
const PROVIDER_KEY = 'ksic-classification-table';
const TABLE_URL = 'https://raw.githubusercontent.com/FinanceData/KSIC/master/KSIC_10.csv.gz';

/**
 * The revision travels with the label, because the two revisions disagree.
 *
 * Measured against the 123 KSIC codes this database holds: the 9th revision names 118
 * of them and the 10th names 121, and the two give DIFFERENT names to 50 of the codes
 * we hold — 20111 is '석유화학계 기초화학물질 제조업' in the 9th and '석유화학계 기초 화학
 * 물질 제조업' in the 10th. A label with no revision behind it cannot be checked.
 */
const KSIC_REVISION = 'KSIC 10th (2017)';

export type KsicTableArgs = { mode: 'dry-run' | 'apply' };

export function parseKsicTableArgs(argv: readonly string[]): KsicTableArgs {
  let mode: KsicTableArgs['mode'] = 'dry-run';
  for (const flag of argv) {
    if (flag === '--apply') {
      mode = 'apply';
      continue;
    }
    throw new Error(`unknown argument: ${flag}`);
  }
  return { mode };
}

/** Strips one layer of CSV quoting, including doubled quotes inside a quoted field. */
function unquote(cell: string): string {
  const trimmed = cell.trim();
  if (!trimmed.startsWith('"')) return trimmed;
  return trimmed.slice(1, trimmed.endsWith('"') ? -1 : undefined).replace(/""/g, '"');
}

/**
 * Parses the mirror's CSV.
 *
 * Its header carries a typo — `Industy_code`, `Industy_name` — matched exactly rather
 * than normalised. A parser that silently accepted both spellings would not notice the
 * day the mirror fixes it, and an unnoticed shape change in a source is what this
 * repository builds gauges to catch.
 */
export function parseKsicTable(csv: string): Map<string, string> {
  const lines = csv.split('\n').filter((line) => line.trim().length > 0);
  const header = (lines[0] ?? '').split(',').map(unquote);
  if (header[0] !== 'Industy_code' || header[1] !== 'Industy_name') {
    throw new Error(
      `KSIC table header changed: expected Industy_code,Industy_name, got ${header.join(',')}`,
    );
  }
  const table = new Map<string, string>();
  for (const line of lines.slice(1)) {
    // The code is always the first quoted field; the name is everything after it,
    // because names contain commas ('그 외 기타 봉제의복 제조업, 기타'). Splitting on
    // every comma would truncate them.
    const match = /^\s*"?([0-9]{2,5})"?\s*,(.*)$/.exec(line);
    if (!match) continue;
    const [, code, rest] = match;
    const name = unquote(rest ?? '');
    if (code && name.length > 0) table.set(code, name);
  }
  return table;
}

export type KsicTableSummary = {
  tableEntries: number;
  ksicNodes: number;
  labelled: number;
  alreadyLabelled: number;
  /** Codes this database holds that the table does not name. Reported, never guessed. */
  unnamed: string[];
};

async function gunzip(body: ArrayBuffer): Promise<string> {
  const chunks: Buffer[] = [];
  const stream = createGunzip();
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  stream.end(Buffer.from(body));
  await done;
  return Buffer.concat(chunks).toString('utf8');
}

export async function runKsicClassificationTable(
  client: PoolClient,
  fetchTable: () => Promise<{ raw: Buffer; csv: string }>,
  args: KsicTableArgs,
): Promise<KsicTableSummary> {
  const startedAt = new Date();
  const { raw, csv } = await fetchTable();
  const table = parseKsicTable(csv);

  const { rows: nodeRows } = await client.query<{ code: string; label: string }>(
    `SELECT node.code, coalesce(node.label, '') AS label
       FROM core.taxonomy_node node
       JOIN core.taxonomy_release release USING (taxonomy_release_id)
      WHERE release.taxonomy_system = 'KSIC' AND node.code <> 'UNCLASSIFIED'`,
  );
  const summary: KsicTableSummary = {
    tableEntries: table.size,
    ksicNodes: nodeRows.length,
    labelled: 0,
    alreadyLabelled: nodeRows.filter((row) => row.label.trim().length > 0).length,
    unnamed: [
      ...new Set(nodeRows.filter((row) => !table.has(row.code)).map((row) => row.code)),
    ].sort(),
  };
  if (args.mode === 'dry-run') return summary;

  const sourceRows = await client.query<{ source_id: string }>(
    `SELECT source_id FROM ingestion.source WHERE provider_key = $1`,
    [PROVIDER_KEY],
  );
  const sourceId = Number(sourceRows.rows[0]?.source_id);
  if (!Number.isFinite(sourceId)) {
    throw new Error(`${PROVIDER_KEY} is not registered; apply migration 106 first`);
  }

  await client.query('BEGIN');
  const opened = await client.query<{ fetch_run_id: string }>(OPEN_FETCH_RUN_SQL, [
    PROVIDER_KEY,
    `${JOB_NAME}-${startedAt.toISOString()}`,
    `${PROVIDER_KEY}:${KSIC_REVISION}`,
    startedAt.toISOString(),
  ]);
  const fetchRunId = Number(opened.rows[0]?.fetch_run_id);
  await client.query('COMMIT');

  // The bytes are kept, not just the parse. A label nobody can trace back to the table
  // it came from is an assertion, and the whole point of registering this mirror was
  // to avoid making one.
  const ref = await writeRawObject({
    providerKey: PROVIDER_KEY,
    content: raw,
    extension: 'csv.gz',
    fetchedAt: startedAt,
  });
  await client.query('BEGIN');
  await registerRawObjectWithRevision(client, {
    fetchRunId,
    sourceId,
    providerRecordKey: `ksic-table:${KSIC_REVISION}`,
    contentHash: ref.contentHash,
    objectUri: ref.objectUri,
    httpMeta: { url: TABLE_URL, revision: KSIC_REVISION },
    fetchedAt: startedAt.toISOString(),
  });

  const codes = [...table.keys()];
  const labelled = await client.query<{ taxonomy_node_id: string }>(
    `UPDATE core.taxonomy_node node
        SET label = entry.name,
            metadata = node.metadata || jsonb_build_object('label_source', $3::text, 'ksic_revision', $4::text)
       FROM unnest($1::text[], $2::text[]) AS entry(code, name),
            core.taxonomy_release release
      WHERE release.taxonomy_release_id = node.taxonomy_release_id
        AND release.taxonomy_system = 'KSIC'
        AND node.code = entry.code
        AND btrim(coalesce(node.label, '')) = ''
      RETURNING node.taxonomy_node_id`,
    [codes, codes.map((code) => table.get(code)), PROVIDER_KEY, KSIC_REVISION],
  );
  await client.query('COMMIT');
  summary.labelled = labelled.rows.length;

  await appendRawObjectManifest({ providerKey: PROVIDER_KEY, ref, fetchedAt: startedAt });
  const finishedAt = new Date().toISOString();
  await client.query(CLOSE_FETCH_RUN_SQL, [
    fetchRunId,
    finishedAt,
    'success',
    table.size,
    summary.labelled,
    summary.unnamed.length,
    null,
    finishedAt,
    JSON.stringify(summary),
  ]);
  return summary;
}

async function main(): Promise<void> {
  const args = parseKsicTableArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const pool = new pg.Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const summary = await runKsicClassificationTable(
      client,
      async () => {
        const response = await fetch(TABLE_URL, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`KSIC table fetch failed with HTTP ${response.status}`);
        const body = await response.arrayBuffer();
        return { raw: Buffer.from(body), csv: await gunzip(body) };
      },
      args,
    );
    console.log(JSON.stringify({ mode: args.mode, revision: KSIC_REVISION, ...summary }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
