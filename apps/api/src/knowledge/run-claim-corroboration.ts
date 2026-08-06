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
// UPDATE 2026-08-06: this file used to say verified was out of reach. It was, and
// for two reasons this job owned — it read only the corroborated policy row, and it
// never re-examined an already-corroborated claim. run-claim-merge now supplies the
// second document, and both tiers are evaluated here.
// (original note follows)
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

// Both tiers, strongest first. This job read ONLY the 'corroborated' row until
// 2026-08-06, so the 'verified' row — which has existed since 2026-07-19 — was
// defined and never consulted. Nothing could reach verified no matter how much
// evidence it gathered, which is the same shape as absenceSemantics having no
// reader and the attribution jobs having no caller.
const POLICY_SQL = `
SELECT target_status, min_distinct_documents, require_chunk_quote, policy_version
FROM ops.verification_policy
WHERE subject_type = 'claim' AND target_status IN ('corroborated', 'verified')
ORDER BY min_distinct_documents DESC
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
       claim.verification_status,
       evidence.document_count,
       evidence.missing_anchor,
       evidence.quote_not_in_source
FROM knowledge.claim claim
JOIN evidence ON evidence.claim_id = claim.claim_id
-- 'corroborated' is included so a claim that later gains a second document can
-- still rise. Excluding it was the second half of why verified stayed at 0: even
-- with the evidence in place, an already-corroborated claim was never looked at
-- again. run-claim-merge supplies exactly that second document.
WHERE claim.verification_status IN ('unverified', 'untrusted_legacy', 'corroborated')
ORDER BY claim.claim_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

type EligibleRow = QueryResultRow & {
  claim_id: string | number;
  verification_status: string;
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

export type VerificationTier = {
  targetStatus: 'corroborated' | 'verified';
  minDistinctDocuments: number;
  requireChunkQuote: boolean;
  policyVersion: string;
};

/**
 * How far up the ladder a status already sits. `untrusted_legacy` ranks with
 * `unverified` on purpose — both mean "not yet judged", not "judged and rejected".
 */
const STATUS_RANK: Record<string, number> = {
  unverified: 0,
  untrusted_legacy: 0,
  corroborated: 1,
  verified: 2,
};

/**
 * The strongest tier a claim's evidence supports, or null with the reason it fell
 * short of the weakest one.
 *
 * Pure, because the dangerous half is not the promotion — it is a DEMOTION. Claims
 * carry a guarded, audited status transition, and now that already-corroborated
 * rows are re-examined every cycle, a tier chosen without comparing rank would
 * walk a verified claim back down the moment a tier's rule changed. The caller
 * only transitions when the rank strictly increases.
 */
export type BlockReason = 'too_few_documents' | 'missing_anchor' | 'quote_not_in_source';

export function selectTier(
  row: Pick<EligibleRow, 'document_count' | 'missing_anchor' | 'quote_not_in_source'>,
  tiers: readonly VerificationTier[],
): { tier: VerificationTier | null; reason: BlockReason | null } {
  // Strongest first, so the first tier that accepts is the answer.
  const ordered = [...tiers].sort((a, b) => b.minDistinctDocuments - a.minDistinctDocuments);
  let reason: BlockReason | null = null;
  for (const tier of ordered) {
    const verdict = classify(row, tier.minDistinctDocuments, tier.requireChunkQuote);
    if (verdict.eligible) return { tier, reason: null };
    // Keep the WEAKEST tier's reason: that is why the claim failed everything.
    reason = verdict.reason;
  }
  return { tier: null, reason };
}

/** Only ever upward. A guarded, audited transition must not be walked back. */
export function isPromotion(from: string, toStatus: string): boolean {
  return (STATUS_RANK[toStatus] ?? -1) > (STATUS_RANK[from] ?? -1);
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client: PoolClient = await pool.connect();

  try {
    const policy = await client.query<
      QueryResultRow & {
        target_status: string;
        min_distinct_documents: number;
        require_chunk_quote: boolean;
        policy_version: string;
      }
    >(POLICY_SQL);
    const tiers: VerificationTier[] = policy.rows.map((row) => ({
      targetStatus: row.target_status as VerificationTier['targetStatus'],
      minDistinctDocuments: row.min_distinct_documents,
      requireChunkQuote: row.require_chunk_quote,
      policyVersion: row.policy_version,
    }));
    if (tiers.length === 0) throw new Error('no ops.verification_policy rows for claim');

    const { rows } = await client.query<EligibleRow>(ELIGIBLE_SQL);
    const decided = rows.map((row) => {
      const picked = selectTier(row, tiers);
      return {
        claimId: Number(row.claim_id),
        from: row.verification_status,
        picked,
        // Already at or above what the evidence supports. Not a failure — most
        // claims land here every cycle once they are corroborated.
        promotes:
          picked.tier !== null && isPromotion(row.verification_status, picked.tier.targetStatus),
      };
    });
    const eligible = decided.filter((entry) => entry.promotes);
    const blocked: Record<string, number> = {};
    for (const entry of decided) {
      if (entry.picked.tier === null && entry.picked.reason !== null) {
        blocked[entry.picked.reason] = (blocked[entry.picked.reason] ?? 0) + 1;
      }
    }

    let transitioned = 0;
    const promotedTo: Record<string, number> = {};
    if (APPLY) {
      for (const entry of eligible) {
        const tier = entry.picked.tier!;
        // The reason travels with every row: the audit trigger demands it, and a
        // transition whose justification is "a job did it" is not auditable.
        const reason =
          `policy ${tier.policyVersion}: >= ${tier.minDistinctDocuments} distinct source ` +
          `document(s), every quote anchored to a chunk and found verbatim in that chunk`;
        await client.query('BEGIN');
        try {
          const moved = await transitionVerification(client, {
            subject: 'claim',
            subjectId: entry.claimId,
            toStatus: tier.targetStatus,
            actor: ACTOR,
            reason,
          });
          await client.query('COMMIT');
          if (moved) {
            transitioned += 1;
            promotedTo[tier.targetStatus] = (promotedTo[tier.targetStatus] ?? 0) + 1;
          }
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw error;
        }
      }
    }

    const summary = {
      job: JOB_NAME,
      mode: APPLY ? 'apply' : 'dry-run',
      // Every tier this job now evaluates, so a reader can tell which rules were
      // in force rather than inferring them from one number.
      tiers: tiers.map((tier) => ({
        targetStatus: tier.targetStatus,
        minDistinctDocuments: tier.minDistinctDocuments,
        requireChunkQuote: tier.requireChunkQuote,
        policyVersion: tier.policyVersion,
      })),
      candidates: decided.length,
      eligible: eligible.length,
      // Already at or above what their evidence supports. The bulk, every cycle.
      alreadyAtTier: decided.filter((entry) => entry.picked.tier !== null && !entry.promotes)
        .length,
      blocked,
      transitioned,
      promotedTo,
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
