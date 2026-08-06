// Does every ingestion source still have an honest, approved contract?
//
// WHY A JOB AND NOT A TEST — the same argument as run-table-reachability-audit.ts,
// but here the test already existed and that is exactly the problem.
//
// apps/api/test/source-contract-integrity.test.ts carries these assertions. It
// reads STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL and, when that is unset, marks
// every case `skip` — silently, with a green suite. Measured 2026-08-07: 46 of 894
// tests skip by default and these six are among them. Migration 069 approved a
// source with no ADR-002 licence tier, which `invalid_approved` is written to
// catch, and it sat behind a green suite for a day because the detector was off.
//
// A detector that only runs when someone remembers to export a variable is not a
// detector. The four mutating cases genuinely need a disposable database and stay
// where they are. The coverage assertions do not — they are pure SELECT, so they
// belong on a timer against the real database, where the answer actually matters.
//
// EXITS NON-ZERO on a violation, unlike the reachability audit which only reports.
// An unread table is debt; an approved contract with no licence basis is a source
// minting accepted evidence it was never cleared to mint. That should break the
// run and page, not land in a summary nobody opens.

import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

const JOB_NAME = 'stock-insight-source-contract-audit';

/**
 * The transitional-source carve-out, counted rather than merely allowed.
 *
 * Any internal source flagged `transitional_source='true'` is approved without an
 * ADR-002 contract. Nothing capped how many could claim that, and a carve-out that
 * grows without anyone deciding stops being a carve-out. Measured 2026-08-06 and
 * again 2026-08-07: exactly five, all internal snapshots of transitional serving
 * tables — company-profile, etf-holdings, industry-classification,
 * macro-series-window, stock-price-window.
 *
 * A sixth is a decision someone should make deliberately, so it fails here.
 *
 * 5 → 6 on 2026-08-07, and this is that deliberate decision rather than a number
 * bumped to make a red build green. `internal-institutional-holdings-snapshot`
 * joins the five: it is the same kind of object — an internal snapshot of a
 * transitional table owned by a sibling project (public.institutional_holdings),
 * registered so the ownership builder's positions can cite an immutable source
 * revision. It is written by the same ensureSource path and carries the same
 * internal_derived / internal_only policy as the other five, so admitting it under
 * the same carve-out is consistent rather than an exception to it.
 */
const EXPECTED_TRANSITIONAL_EXEMPTIONS = 6;

const AUDIT_SQL = `
SELECT
  (SELECT count(*)::int FROM ingestion.source) AS active_sources,
  (SELECT count(*)::int FROM ingestion.source_contract_current_v1) AS active_contracts,
  (SELECT count(*)::int FROM ingestion.source source
   WHERE NOT EXISTS (
     SELECT 1 FROM ingestion.source_contract_current_v1 contract
     WHERE contract.source_id=source.source_id
   )) AS uncovered,
  (SELECT count(*)::int FROM ingestion.source_contract_current_v1
   WHERE policy_status='provisional_review_required') AS provisional,
  (SELECT count(*)::int FROM ingestion.source_contract_current_v1
   WHERE policy_status='approved') AS approved,
  -- Approved without a basis: neither the internal transitional carve-out nor an
  -- exact ADR-002 tier triple. This is the number migration 069 tripped.
  (SELECT count(*)::int
   FROM ingestion.source_contract_current_v1 contract
   JOIN ingestion.source source USING(source_id)
   WHERE contract.policy_status='approved'
   AND NOT (
     (
       source.source_type='internal'
       AND source.license_status='allowed'
       AND source.redistribution='internal_only'
       AND source.metadata->>'transitional_source'='true'
     )
     OR (
       contract.license_policy->>'adr'='ADR-002'
       AND coalesce(contract.license_policy->>'approved_at','')<>''
       AND (
         contract.license_policy->>'tier',
         contract.license_policy->>'approved_usage',
         contract.redistribution_policy->>'mode'
       ) IN (
         ('T1','accepted_evidence_and_display','attribution_required'),
         ('T3','internal_research_only','no_redistribution'),
         ('T4','candidate_evidence_span_quote','quote_and_link_only'),
         ('T5','internal_ops_only','forbidden')
       )
     )
   )) AS invalid_approved,
  (SELECT count(*)::int
   FROM ingestion.source_contract_current_v1 contract
   JOIN ingestion.source source USING(source_id)
   WHERE contract.policy_status='approved'
     AND source.source_type='internal'
     AND source.license_status='allowed'
     AND source.redistribution='internal_only'
     AND source.metadata->>'transitional_source'='true') AS exempt_approved
`;

/** Names the offenders, because a count alone cannot be acted on. */
const INVALID_DETAIL_SQL = `
SELECT source.provider_key,
       contract.revision_no,
       coalesce(contract.license_policy->>'tier','(none)') AS tier,
       coalesce(contract.license_policy->>'adr','(none)') AS adr,
       coalesce(contract.redistribution_policy->>'mode','(none)') AS redistribution_mode
FROM ingestion.source_contract_current_v1 contract
JOIN ingestion.source source USING(source_id)
WHERE contract.policy_status='approved'
AND NOT (
  (
    source.source_type='internal'
    AND source.license_status='allowed'
    AND source.redistribution='internal_only'
    AND source.metadata->>'transitional_source'='true'
  )
  OR (
    contract.license_policy->>'adr'='ADR-002'
    AND coalesce(contract.license_policy->>'approved_at','')<>''
    AND (
      contract.license_policy->>'tier',
      contract.license_policy->>'approved_usage',
      contract.redistribution_policy->>'mode'
    ) IN (
      ('T1','accepted_evidence_and_display','attribution_required'),
      ('T3','internal_research_only','no_redistribution'),
      ('T4','candidate_evidence_span_quote','quote_and_link_only'),
      ('T5','internal_ops_only','forbidden')
    )
  )
)
ORDER BY source.provider_key
`;

const UNCOVERED_DETAIL_SQL = `
SELECT source.provider_key
FROM ingestion.source source
WHERE NOT EXISTS (
  SELECT 1 FROM ingestion.source_contract_current_v1 contract
  WHERE contract.source_id=source.source_id
)
ORDER BY source.provider_key
`;

const EXEMPT_DETAIL_SQL = `
SELECT source.provider_key
FROM ingestion.source_contract_current_v1 contract
JOIN ingestion.source source USING(source_id)
WHERE contract.policy_status='approved'
  AND source.source_type='internal'
  AND source.license_status='allowed'
  AND source.redistribution='internal_only'
  AND source.metadata->>'transitional_source'='true'
ORDER BY source.provider_key
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

type AuditRow = QueryResultRow & {
  active_sources: number;
  active_contracts: number;
  uncovered: number;
  provisional: number;
  approved: number;
  invalid_approved: number;
  exempt_approved: number;
};

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const startedAt = new Date();

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    // Read-only by construction. The audit must never be the thing that changes
    // what it is auditing.
    await client.query('BEGIN READ ONLY');
    const audit = (await client.query<AuditRow>(AUDIT_SQL)).rows[0]!;
    const invalidDetail = (await client.query(INVALID_DETAIL_SQL)).rows;
    const uncoveredDetail = (await client.query(UNCOVERED_DETAIL_SQL)).rows;
    const exemptDetail = (await client.query(EXEMPT_DETAIL_SQL)).rows;
    await client.query('COMMIT');

    const violations: string[] = [];
    if (audit.uncovered > 0) {
      violations.push(`${audit.uncovered} source(s) have no contract at all`);
    }
    if (audit.active_contracts !== audit.active_sources) {
      violations.push(
        `contract count ${audit.active_contracts} != source count ${audit.active_sources}`,
      );
    }
    if (audit.provisional + audit.approved !== audit.active_sources) {
      violations.push(
        `provisional ${audit.provisional} + approved ${audit.approved} != ${audit.active_sources}`,
      );
    }
    if (audit.invalid_approved > 0) {
      violations.push(
        `${audit.invalid_approved} approved contract(s) have no ADR-002 basis and no transitional carve-out`,
      );
    }
    if (audit.exempt_approved !== EXPECTED_TRANSITIONAL_EXEMPTIONS) {
      // Both directions. A carve-out that shrank is also a fact worth surfacing:
      // it means a source lost the flag that run-v2-graph-publish throws without.
      violations.push(
        `transitional exemptions ${audit.exempt_approved}, expected ${EXPECTED_TRANSITIONAL_EXEMPTIONS} — decide whether the change is intended, then update the constant`,
      );
    }

    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : 'dry-run',
      activeSources: audit.active_sources,
      activeContracts: audit.active_contracts,
      uncovered: audit.uncovered,
      provisional: audit.provisional,
      approved: audit.approved,
      invalidApproved: audit.invalid_approved,
      exemptApproved: audit.exempt_approved,
      violations,
      invalidDetail,
      uncoveredDetail,
      exemptDetail,
    };
    console.log(JSON.stringify(summary, null, 2));

    if (apply) {
      await client.query(INSERT_MIGRATION_RUN_SQL, [
        `${JOB_NAME}-${randomUUID()}`,
        JOB_NAME,
        violations.length === 0 ? 'completed' : 'failed',
        startedAt.toISOString(),
        JSON.stringify(summary),
      ]);
    }

    if (violations.length > 0) {
      throw new Error(`source contract audit found ${violations.length} violation(s)`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('run-source-contract-audit.ts')) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
