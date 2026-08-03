import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

import { REPORT_CODES, periodEndFor } from './run-dart-financial-facts.ts';

// governance.coverage_ledger (migration 031) has had a schema, an immutability
// trigger, a revision-chain guard and grants since 2026-07-24, and zero lines of
// code. Its purpose is the distinction the rest of the system cannot express:
// "there is nothing here" versus "we never looked".
//
// Nothing reads this table yet. That is a deliberate call and not the same one
// declined for analytics.impact_exposure_revision: that ledger would have needed
// sign, magnitude and materiality invented to fill it, and its only consumer
// started from an empty table. This one is filled entirely from records that
// already exist, and its first consumer is operational — it says where to point
// the collector. A UI surface is a separate decision.
//
// Scope: DART financial facts only, per the plan. The universe is the collector's
// own cross product — issuers with a DART corp code, times the fetched year span,
// times REPORT_CODES — so the ledger measures exactly what the collector attempts.
//
// On last_checked_at: rows are appended only when the computed state differs from
// the latest revision, otherwise a daily run would append ~3,600 revisions a day
// and the ledger would become its own noise. That makes last_checked_at "when this
// state was first observed", not "when it was last verified". The column name
// promises the opposite, so it is stated here rather than left to be discovered.

const JOB_NAME = 'stock-insight-dart-coverage-ledger';
const PROVIDER_KEY = 'opendart';
const FACT_FAMILY = 'market.financial_fact';
const APPLY = process.argv.includes('--apply');

type PgModule = { Pool: new (options: { connectionString: string; max?: number }) => pg.Pool };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

function intOption(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const value = Number(index < 0 ? fallback : (process.argv[index + 1] ?? fallback));
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

// The contract revision is resolved, never hardcoded: the ledger row is scoped to
// the terms in force when the cell was judged, and those terms have revisions.
const CONTRACT_HEAD_SQL = `
SELECT revision.source_contract_revision_id
FROM ingestion.source_contract_revision revision
JOIN ingestion.source source USING (source_id)
WHERE source.provider_key = $1
ORDER BY revision.revision_no DESC
LIMIT 1
`;

// Filing lag is measured, not assumed. It is recorded in metadata so a reader can
// judge whether a recent empty cell is a real gap or a filing window still open;
// no statutory deadline is written into the state rule.
const FILING_LAG_SQL = `
SELECT fiscal_period,
       percentile_disc(0.5) WITHIN GROUP (ORDER BY (filed_at::date - period_end)) AS median_days,
       percentile_disc(0.95) WITHIN GROUP (ORDER BY (filed_at::date - period_end)) AS p95_days,
       count(*) AS sample
FROM market.financial_fact
WHERE source_provider = 'opendart' AND filed_at IS NOT NULL
GROUP BY 1
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

// One statement so the universe, the observations and the previous revision are
// read in a single consistent snapshot. Splitting it would let a concurrent
// collector run land between the read and the write and produce a revision that
// describes neither state.
const APPEND_SQL = `
WITH report AS (
  SELECT * FROM unnest($1::text[], $2::text[], $3::date[]) AS t(report_code, fiscal_period, period_end_ref)
),
issuer AS (
  SELECT company.entity_id, dart.identifier_value AS corp_code
  FROM core.entity company
  JOIN core.entity_identifier dart
    ON dart.entity_id = company.entity_id AND dart.identifier_type = 'DART_CORP_CODE'
  JOIN core.entity_identifier internal
    ON internal.entity_id = company.entity_id AND internal.identifier_type = 'INTERNAL_KEY'
  WHERE company.entity_type = 'Company'
),
universe AS (
  SELECT issuer.entity_id,
         issuer.corp_code,
         years.fiscal_year,
         report.report_code,
         report.fiscal_period,
         make_timestamptz(years.fiscal_year, 1, 1, 0, 0, 0, 'Asia/Seoul') AS period_start,
         ((make_date(years.fiscal_year, extract(month from report.period_end_ref)::int,
                     extract(day from report.period_end_ref)::int) + 1)::timestamp
            AT TIME ZONE 'Asia/Seoul') AS period_end
  FROM issuer
  CROSS JOIN generate_series($4::int, $5::int) AS years(fiscal_year)
  CROSS JOIN report
),
-- What the source actually said, per cell. Present only for cells fetched after
-- empty responses started being recorded; absent means no retained observation.
record AS (
  SELECT DISTINCT ON (identity.provider_record_key)
         identity.provider_record_key,
         revision.payload_metadata -> 'http_meta' ->> 'status' AS http_status
  FROM ingestion.source_record_identity identity
  JOIN ingestion.source source ON source.source_id = identity.source_id
  JOIN ingestion.source_revision revision
    ON revision.source_record_identity_id = identity.source_record_identity_id
  WHERE source.provider_key = $6
  ORDER BY identity.provider_record_key, revision.revision_no DESC
),
issuer_seen AS (
  SELECT DISTINCT split_part(provider_record_key, ':', 1) AS corp_code FROM record
),
-- Scoped by source_provider: market.financial_fact is shared with SEC, and an
-- unscoped count would read SEC filings as DART coverage.
observed AS (
  SELECT fact.issuer_entity_id, fact.fiscal_year, fact.fiscal_period,
         count(DISTINCT fact.filing_ref) AS filings
  FROM market.financial_fact fact
  WHERE fact.source_provider = 'opendart'
  GROUP BY 1, 2, 3
),
computed AS (
  SELECT universe.corp_code || ':' || universe.fiscal_year || ':' || universe.report_code
           AS record_key,
         'dart-financial-fact:' || universe.corp_code || ':' || universe.fiscal_year || ':'
           || universe.report_code AS coverage_key,
         universe.entity_id,
         universe.period_start,
         universe.period_end,
         universe.fiscal_year,
         universe.fiscal_period,
         universe.report_code,
         universe.corp_code,
         coalesce(observed.filings, 0) AS observed_count,
         record.http_status,
         (issuer_seen.corp_code IS NOT NULL) AS issuer_visited
  FROM universe
  LEFT JOIN observed
    ON observed.issuer_entity_id = universe.entity_id
   AND observed.fiscal_year = universe.fiscal_year
   AND observed.fiscal_period = universe.fiscal_period
  LEFT JOIN record
    ON record.provider_record_key
       = universe.corp_code || ':' || universe.fiscal_year || ':' || universe.report_code
  LEFT JOIN issuer_seen ON issuer_seen.corp_code = universe.corp_code
),
judged AS (
  SELECT computed.*,
         CASE
           WHEN observed_count > 0 THEN 'complete'
           WHEN period_end > now() THEN 'not_applicable'
           WHEN http_status = '013' THEN 'source_unavailable'
           WHEN http_status IS NOT NULL THEN 'partial'
           ELSE 'not_collected'
         END AS completeness_state,
         CASE
           WHEN observed_count > 0 THEN 1::bigint
           WHEN period_end > now() THEN 0::bigint
           ELSE NULL::bigint
         END AS expected_count,
         CASE
           WHEN observed_count > 0 THEN NULL
           WHEN period_end > now() THEN NULL
           WHEN http_status = '013' THEN
             'OpenDART returned status 013 (no filing) for this issuer-period. Whether the '
             || 'issuer is exempt from this report or the filing is absent cannot be '
             || 'distinguished from the response.'
           WHEN http_status IS NOT NULL THEN
             'Filing retrieved but none of the tracked market.financial_concept accounts '
             || 'appear in it.'
           WHEN issuer_visited THEN
             'Issuer has been fetched, but this cell has no retained observation: empty '
             || 'responses were discarded before 2026-08-03. Self-heals on the next visit.'
           ELSE
             'The collector cursor has not reached this issuer yet.'
         END AS gap_reason,
         CASE
           WHEN observed_count > 0 OR period_end > now() THEN NULL
           WHEN http_status = '013' THEN 'none: absence is recorded, not a backlog item'
           WHEN http_status IS NOT NULL THEN 'extend market.financial_concept if this filing matters'
           ELSE 'advance the collector cursor to this issuer'
         END AS next_action
  FROM computed
),
latest AS (
  SELECT DISTINCT ON (coverage_key)
         coverage_key, coverage_ledger_id, revision_no, completeness_state,
         expected_artifact_count, observed_artifact_count, gap_reason
  FROM governance.coverage_ledger
  ORDER BY coverage_key, revision_no DESC
),
changed AS (
  SELECT judged.*, latest.coverage_ledger_id AS prev_id, latest.revision_no AS prev_revision
  FROM judged
  LEFT JOIN latest ON latest.coverage_key = judged.coverage_key
  WHERE latest.coverage_key IS NULL
     OR latest.completeness_state IS DISTINCT FROM judged.completeness_state
     OR latest.expected_artifact_count IS DISTINCT FROM judged.expected_count
     OR latest.observed_artifact_count IS DISTINCT FROM judged.observed_count
     OR latest.gap_reason IS DISTINCT FROM judged.gap_reason
)
INSERT INTO governance.coverage_ledger (
  coverage_key, revision_no, entity_id, predicate_or_fact_family,
  source_contract_revision_id, coverage_period_start, coverage_period_end,
  expected_artifact_count, observed_artifact_count, completeness_state,
  last_checked_at, gap_reason, next_action, supersedes_coverage_ledger_id, metadata
)
SELECT coverage_key,
       coalesce(prev_revision, 0) + 1,
       entity_id,
       $7,
       $8,
       period_start,
       period_end,
       expected_count,
       observed_count,
       completeness_state,
       now(),
       gap_reason,
       next_action,
       prev_id,
       jsonb_build_object(
         'corp_code', corp_code,
         'fiscal_year', fiscal_year,
         'fiscal_period', fiscal_period,
         'report_code', report_code,
         'provider_record_key', record_key,
         'http_status', http_status,
         'filing_lag_days', $9::jsonb
       )
FROM changed
RETURNING completeness_state
`;

// Read back over the same universe definition so the report describes the ledger,
// not the computation that wrote it.
const STATE_DISTRIBUTION_SQL = `
SELECT completeness_state, count(*) AS cells
FROM (
  SELECT DISTINCT ON (coverage_key) coverage_key, completeness_state
  FROM governance.coverage_ledger
  WHERE predicate_or_fact_family = $1
  ORDER BY coverage_key, revision_no DESC
) current
GROUP BY 1
ORDER BY 2 DESC
`;

async function main(): Promise<void> {
  const fromYear = intOption('--from-year', 2022);
  const toYear = intOption('--to-year', new Date().getFullYear());
  const startedAt = new Date();

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client: PoolClient = await pool.connect();

  try {
    const contract = await client.query<QueryResultRow & { source_contract_revision_id: string }>(
      CONTRACT_HEAD_SQL,
      [PROVIDER_KEY],
    );
    const contractRevisionId = contract.rows[0]?.source_contract_revision_id;
    if (!contractRevisionId) {
      throw new Error(`no source contract revision for ${PROVIDER_KEY}`);
    }

    const lag = await client.query<QueryResultRow>(FILING_LAG_SQL);
    const filingLag = Object.fromEntries(
      lag.rows.map((row) => [
        row.fiscal_period,
        { median: Number(row.median_days), p95: Number(row.p95_days), sample: Number(row.sample) },
      ]),
    );

    const codes = REPORT_CODES.map((entry) => entry.code);
    const periods = REPORT_CODES.map((entry) => entry.period);
    // A reference year only supplies month/day; the SQL rebuilds the date per
    // fiscal year. Reusing periodEndFor keeps the boundary identical to the one
    // the collector stamped onto the facts.
    const periodEnds = REPORT_CODES.map((entry) => periodEndFor(2000, entry.period));

    if (!APPLY) {
      const preview = await client.query<QueryResultRow>(STATE_DISTRIBUTION_SQL, [FACT_FAMILY]);
      console.log(
        JSON.stringify(
          {
            job: JOB_NAME,
            mode: 'dry-run',
            hint: 'rerun with --apply',
            contractRevisionId,
            filingLag,
            currentLedger: preview.rows,
          },
          null,
          2,
        ),
      );
      return;
    }

    await client.query('BEGIN');
    const appended = await client.query<QueryResultRow & { completeness_state: string }>(
      APPEND_SQL,
      [
        codes,
        periods,
        periodEnds,
        fromYear,
        toYear,
        PROVIDER_KEY,
        FACT_FAMILY,
        contractRevisionId,
        JSON.stringify(filingLag),
      ],
    );
    const distribution = await client.query<QueryResultRow>(STATE_DISTRIBUTION_SQL, [FACT_FAMILY]);
    await client.query('COMMIT');

    const appendedByState: Record<string, number> = {};
    for (const row of appended.rows) {
      appendedByState[row.completeness_state] = (appendedByState[row.completeness_state] ?? 0) + 1;
    }

    const summary = {
      job: JOB_NAME,
      mode: 'apply',
      fromYear,
      toYear,
      contractRevisionId,
      revisionsAppended: appended.rowCount ?? 0,
      appendedByState,
      ledgerState: distribution.rows,
      filingLag,
    };
    console.log(JSON.stringify(summary, null, 2));

    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `${JOB_NAME}-${randomUUID()}`,
      JOB_NAME,
      'completed',
      startedAt.toISOString(),
      JSON.stringify(summary),
    ]);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('run-dart-coverage-ledger.ts')) {
  await main();
}
