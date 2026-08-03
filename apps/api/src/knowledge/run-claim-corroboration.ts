import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

import { transitionVerification } from './verification-store.ts';

// Moves claims from 'unverified' to 'corroborated' where the project's own
// verification policy already says they qualify.
//
// knowledge.claim has sat at verified 0 / 271 since extraction started, and
// transitionVerification() has had no production caller — only tests. That read
// as "verification is unsolved". It is not: ops.verification_policy defines what
// each status requires, and the requirement for 'corroborated' is met by every
// claim in the table today.
//
//   corroborated   min_distinct_documents 1, require_chunk_quote true
//   verified       min_distinct_documents 2, require_chunk_quote true
//
// 'verified' stays out of reach, and not because anyone needs to exercise
// judgement: no claim has evidence from a second independent document. It opens
// on its own when the same claim is extracted from another source. Nothing here
// tries to shortcut that.
//
// The policy is read from the table rather than restated, so a change there
// changes this job instead of silently disagreeing with it.

const JOB_NAME = 'stock-insight-claim-corroboration';
const APPLY = process.argv.includes('--apply');
const ACTOR = 'stock-insight-claim-corroboration';

type PgModule = { Pool: new (options: { connectionString: string; max?: number }) => pg.Pool };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

const POLICY_SQL = `
SELECT min_distinct_documents, require_chunk_quote, policy_version
FROM ops.verification_policy
WHERE subject_type = 'claim' AND target_status = 'corroborated'
`;

// The database trigger checks that a quote is present and non-blank. It does not
// check that the quote is actually in the chunk it points at — a claim could
// carry an invented quote and still pass. This job holds the stronger line,
// because a corroboration that never opened the source is not corroboration.
const ELIGIBLE_SQL = `
WITH evidence AS (
  SELECT ce.claim_id,
         count(DISTINCT ce.document_id) AS document_count,
         count(*) FILTER (
           WHERE ce.chunk_id IS NULL OR nullif(btrim(ce.quote), '') IS NULL
         ) AS missing_anchor,
         count(*) FILTER (
           WHERE dc.chunk_id IS NULL OR position(ce.quote in dc.content) = 0
         ) AS quote_not_in_source
  FROM knowledge.claim_evidence ce
  LEFT JOIN knowledge.document_chunk dc
    ON dc.document_id = ce.document_id AND dc.chunk_id = ce.chunk_id
  GROUP BY ce.claim_id
)
SELECT claim.claim_id,
       evidence.document_count,
       evidence.missing_anchor,
       evidence.quote_not_in_source
FROM knowledge.claim claim
JOIN evidence ON evidence.claim_id = claim.claim_id
WHERE claim.verification_status IN ('unverified', 'untrusted_legacy')
ORDER BY claim.claim_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

type EligibleRow = QueryResultRow & {
  claim_id: string | number;
  document_count: string | number;
  missing_anchor: string | number;
  quote_not_in_source: string | number;
};

export type Eligibility =
  | { eligible: true }
  | { eligible: false; reason: 'too_few_documents' | 'missing_anchor' | 'quote_not_in_source' };

export function classify(
  row: Pick<EligibleRow, 'document_count' | 'missing_anchor' | 'quote_not_in_source'>,
  minDocuments: number,
  requireChunkQuote: boolean,
): Eligibility {
  if (requireChunkQuote && Number(row.missing_anchor) > 0) {
    return { eligible: false, reason: 'missing_anchor' };
  }
  // Checked here rather than trusted from the trigger, which only tests presence.
  if (requireChunkQuote && Number(row.quote_not_in_source) > 0) {
    return { eligible: false, reason: 'quote_not_in_source' };
  }
  if (Number(row.document_count) < minDocuments) {
    return { eligible: false, reason: 'too_few_documents' };
  }
  return { eligible: true };
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client: PoolClient = await pool.connect();

  try {
    const policy = await client.query<
      QueryResultRow & {
        min_distinct_documents: number;
        require_chunk_quote: boolean;
        policy_version: string;
      }
    >(POLICY_SQL);
    const rule = policy.rows[0];
    if (!rule) throw new Error('no ops.verification_policy row for claim/corroborated');

    const { rows } = await client.query<EligibleRow>(ELIGIBLE_SQL);
    const decided = rows.map((row) => ({
      claimId: Number(row.claim_id),
      verdict: classify(row, rule.min_distinct_documents, rule.require_chunk_quote),
    }));
    const eligible = decided.filter((entry) => entry.verdict.eligible);
    const blocked: Record<string, number> = {};
    for (const entry of decided) {
      if (!entry.verdict.eligible) {
        blocked[entry.verdict.reason] = (blocked[entry.verdict.reason] ?? 0) + 1;
      }
    }

    // The reason travels with every row: the audit trigger demands it, and a
    // transition whose justification is "a job did it" is not auditable.
    const reason =
      `policy ${rule.policy_version}: >= ${rule.min_distinct_documents} distinct source ` +
      `document(s), every quote anchored to a chunk and found verbatim in that chunk`;

    let transitioned = 0;
    if (APPLY) {
      for (const entry of eligible) {
        await client.query('BEGIN');
        try {
          const moved = await transitionVerification(client, {
            subject: 'claim',
            subjectId: entry.claimId,
            toStatus: 'corroborated',
            actor: ACTOR,
            reason,
          });
          await client.query('COMMIT');
          if (moved) transitioned += 1;
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        }
      }
    }

    const summary = {
      job: JOB_NAME,
      mode: APPLY ? 'apply' : 'dry-run',
      policyVersion: rule.policy_version,
      minDistinctDocuments: rule.min_distinct_documents,
      requireChunkQuote: rule.require_chunk_quote,
      candidates: decided.length,
      eligible: eligible.length,
      blocked,
      transitioned,
    };
    console.log(JSON.stringify(summary, null, 2));

    if (APPLY && transitioned > 0) {
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

if (process.argv[1]?.endsWith('run-claim-corroboration.ts')) {
  await main();
}
