// Collects SEC submissions records for the filer metadata companyfacts does not carry.
//
//   node apps/api/src/ingest/run-sec-submissions.ts            # dry run
//   node apps/api/src/ingest/run-sec-submissions.ts --apply
//
// The only field this job exists for today is `sic`. 43 US stocks sit at explicit
// UNCLASSIFIED because the legacy import had no industry_code for them and
// internal-company-profile-snapshot — which closed the Korean gap — carries no code for
// any US company. Their SIC has always existed; it lives in an endpoint this repository
// did not read. Verified against governance.source_shape_revision rather than assumed:
// no sec-edgar payload field matches /sic/ outside XBRL concept names containing
// "Classified".
//
// This writes raw objects and revisions only. Mapping them onto the taxonomy is
// run-industry-classification.ts, the same separation the Korean side uses: ingestion
// records what a source said, and a later pass decides what it means.

import { randomUUID } from 'node:crypto';

import pg, { type PoolClient } from 'pg';

import {
  CLOSE_FETCH_RUN_SQL,
  OPEN_FETCH_RUN_SQL,
  appendRawObjectManifest,
  registerRawObjectWithRevision,
  writeRawObject,
} from './raw-object-store.ts';

const JOB_NAME = 'stock-insight-sec-submissions';
const PROVIDER_KEY = 'sec-edgar-submissions';
const SUBMISSIONS_BASE = 'https://data.sec.gov/submissions';
const DEFAULT_USER_AGENT = 'stock-insight research contact@jigooo.com';

/**
 * SEC asks for no more than 10 requests a second and a declared user agent. 250ms is
 * what sec-edgar-fetcher.ts already uses; matching it keeps one repository-wide answer
 * to "how fast do we hit SEC" rather than two that drift apart.
 */
const REQUEST_INTERVAL_MS = 250;

export type SecSubmissionsArgs = { mode: 'dry-run' | 'apply'; limit: number };

export function parseSecSubmissionsArgs(argv: readonly string[]): SecSubmissionsArgs {
  let mode: SecSubmissionsArgs['mode'] = 'dry-run';
  let limit = 200;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--apply') {
      mode = 'apply';
      continue;
    }
    if (flag === '--limit') {
      const value = argv[index + 1];
      if (!value) throw new Error('--limit requires a value');
      limit = Number(value);
      if (!Number.isInteger(limit) || limit <= 0) throw new Error('--limit must be positive');
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${flag}`);
  }
  return { mode, limit };
}

/**
 * Filers whose classification is still missing, and who have a CIK to ask about.
 *
 * Scoped to the gap on purpose. Submissions is a per-filer request and refetching 300
 * companies to re-learn a code we already hold would spend SEC's rate limit on nothing.
 * A company that later reclassifies keeps its old code here until something else
 * notices — recorded as a known limit rather than solved by polling everyone daily.
 */
const UNCLASSIFIED_FILERS_SQL = `
SELECT DISTINCT company.entity_id AS issuer_entity_id,
       cik.identifier_value AS cik,
       internal.identifier_value AS company_key
  FROM core.entity stock
  JOIN core.security_issuer_identity identity
    ON identity.security_entity_id = stock.entity_id
  JOIN core.entity company
    ON company.entity_id = identity.issuer_entity_id
  JOIN core.entity_identifier cik
    ON cik.entity_id = company.entity_id AND cik.identifier_type = 'CIK'
  JOIN core.entity_identifier internal
    ON internal.entity_id = company.entity_id AND internal.identifier_type = 'INTERNAL_KEY'
  JOIN core.entity_taxonomy_current_v1 current
    ON current.entity_id = stock.entity_id
 WHERE stock.entity_type = 'Stock'
   AND current.code = 'UNCLASSIFIED'
 ORDER BY internal.identifier_value
`;

export type FilerTarget = { issuerEntityId: number; cik: string; companyKey: string };

export type SubmissionsSummary = {
  targets: number;
  fetched: number;
  missing: number;
  withSic: number;
  withoutSic: number;
  revisionsRegistered: number;
  revisionsReplayed: number;
};

/** The one field this job is for, plus its label. Absent is a fact, not a failure. */
export function readSic(payload: unknown): { sic: string; description: string | null } | null {
  if (payload === null || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const sic = typeof record.sic === 'string' ? record.sic.trim() : '';
  // SEC returns "" for filers it has not classified — a real state, and one that must
  // not become a taxonomy node.
  if (!/^[0-9]{3,4}$/.test(sic)) return null;
  const description =
    typeof record.sicDescription === 'string' && record.sicDescription.trim().length > 0
      ? record.sicDescription.trim()
      : null;
  return { sic, description };
}

type Fetcher = (url: string) => Promise<{ status: number; body: string }>;

function createFetcher(userAgent: string): Fetcher {
  let lastRequestAt = 0;
  return async (url: string) => {
    const wait = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': userAgent },
      signal: AbortSignal.timeout(30_000),
    });
    return { status: response.status, body: response.status === 200 ? await response.text() : '' };
  };
}

export async function collectSecSubmissions(
  client: PoolClient,
  fetcher: Fetcher,
  args: SecSubmissionsArgs,
): Promise<SubmissionsSummary> {
  const startedAt = new Date();
  const { rows } = await client.query<Record<string, string>>(UNCLASSIFIED_FILERS_SQL);
  const targets: FilerTarget[] = rows.slice(0, args.limit).map((row) => ({
    issuerEntityId: Number(row.issuer_entity_id),
    cik: String(row.cik),
    companyKey: String(row.company_key),
  }));

  const summary: SubmissionsSummary = {
    targets: targets.length,
    fetched: 0,
    missing: 0,
    withSic: 0,
    withoutSic: 0,
    revisionsRegistered: 0,
    revisionsReplayed: 0,
  };
  if (targets.length === 0 || args.mode === 'dry-run') {
    // A dry run says what it would ask for without spending SEC's rate limit on a
    // request whose answer it will throw away.
    return summary;
  }

  const sourceRows = await client.query<{ source_id: string }>(
    `SELECT source_id FROM ingestion.source WHERE provider_key = $1`,
    [PROVIDER_KEY],
  );
  const sourceId = Number(sourceRows.rows[0]?.source_id);
  if (!Number.isFinite(sourceId)) {
    throw new Error(`${PROVIDER_KEY} is not registered; apply migration 103 first`);
  }

  const runId = `${JOB_NAME}-${randomUUID()}`;
  await client.query('BEGIN');
  const opened = await client.query<{ fetch_run_id: string }>(OPEN_FETCH_RUN_SQL, [
    PROVIDER_KEY,
    runId,
    `${PROVIDER_KEY}:${runId}`,
    startedAt.toISOString(),
  ]);
  const fetchRunId = Number(opened.rows[0]?.fetch_run_id);
  await client.query('COMMIT');

  for (const target of targets) {
    const response = await fetcher(`${SUBMISSIONS_BASE}/CIK${target.cik}.json`);
    if (response.status === 404) {
      summary.missing += 1;
      continue;
    }
    if (response.status !== 200) {
      throw new Error(`SEC submissions CIK${target.cik} failed with HTTP ${response.status}`);
    }
    summary.fetched += 1;

    const fetchedAt = new Date();
    const ref = await writeRawObject({
      providerKey: PROVIDER_KEY,
      content: response.body,
      extension: 'json',
      fetchedAt,
    });

    await client.query('BEGIN');
    const registered = await registerRawObjectWithRevision(client, {
      fetchRunId,
      sourceId,
      providerRecordKey: `submissions:${target.cik}`,
      contentHash: ref.contentHash,
      objectUri: ref.objectUri,
      httpMeta: { status: response.status, url: `${SUBMISSIONS_BASE}/CIK${target.cik}.json` },
      fetchedAt: fetchedAt.toISOString(),
    });
    await client.query('COMMIT');

    if (registered.replay) summary.revisionsReplayed += 1;
    else summary.revisionsRegistered += 1;
    // Manifest only after the authoritative transaction commits, per raw-object-store.
    await appendRawObjectManifest({ providerKey: PROVIDER_KEY, ref, fetchedAt });

    if (readSic(JSON.parse(response.body))) summary.withSic += 1;
    else summary.withoutSic += 1;
  }

  const finishedAt = new Date().toISOString();
  await client.query(CLOSE_FETCH_RUN_SQL, [
    fetchRunId,
    finishedAt,
    // 'success', not 'completed' — ingestion.fetch_run allows running/success/partial/failed.
    'success',
    summary.fetched,
    summary.revisionsRegistered,
    summary.revisionsReplayed + summary.missing,
    null,
    finishedAt,
    JSON.stringify(summary),
  ]);
  return summary;
}

async function main(): Promise<void> {
  const args = parseSecSubmissionsArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const userAgent = process.env.SEC_USER_AGENT?.trim() || DEFAULT_USER_AGENT;

  const pool = new pg.Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const summary = await collectSecSubmissions(client, createFetcher(userAgent), args);
    console.log(JSON.stringify({ mode: args.mode, ...summary }, null, 2));
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
