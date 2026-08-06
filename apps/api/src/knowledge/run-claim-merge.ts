// C4 step 1 — give a claim the second document it already has.
//
// knowledge.claim sat at corroborated 325 / verified 0, and the plan recorded that
// as "no verification criteria have ever been defined". That was wrong.
// ops.verification_policy has defined them since 2026-07-19: corroborated needs 1
// distinct document, verified needs 2, both need a chunk quote. All 325 claims
// carry a quote and exactly one document, so they stop precisely at corroborated.
//
// The second document is not missing either. Measured 2026-08-06: 10 groups of
// claims share (subject, predicate, object) across 2+ DISTINCT documents — 엔비디아
// PARTNERS_WITH across 3, Nvidia COMPETES_WITH across 3 — and 6 of the 10 are same
// day. Extraction simply writes a NEW claim row per document instead of attaching
// the second document as further evidence on the existing one.
//
// So what is missing is not a criterion and not data. It is this step. That is the
// third time tonight the same shape appeared: absenceSemantics had no reader, the
// attribution jobs had no caller, and now corroboration has no merge.
//
// This job ONLY adds evidence. Promotion stays with run-claim-corroboration, which
// already owns transitionVerification and runs every knowledge cycle — splitting it
// keeps the guarded, audited status transition in the one place that is tested for
// it.

import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

const JOB_NAME = 'stock-insight-claim-merge';

/**
 * How far apart two documents may be and still be reporting the same claim.
 *
 * Chosen by judgement, NOT by the curve, and the difference matters. Merged pairs
 * by window: 0d 33 · 1d 40 · 3d 41 · 7d 44 · 14d 50 · 30d 50 · 90d 50. The tail
 * looks reassuringly flat — and that is an artifact: the entire claim corpus spans
 * 20 days (2026-07-17 → 08-06), so nothing CAN be 30 days apart. Reading the flat
 * tail as "any window is safe" would be reading the corpus width, not the data.
 *
 * 7 days takes 44 of the 50 pairs and matches what corroboration of one event
 * actually looks like in news. REVISIT once the corpus is meaningfully wider than
 * the window — only then does the shape of the curve past 7 days mean anything.
 */
export const DEFAULT_WINDOW_DAYS = 7;

type PgModule = { Pool: new (config: { connectionString: string; max: number }) => Pool };
type Pool = { connect: () => Promise<PoolClient>; end: () => Promise<void> };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function intOption(flag: string, fallback: number, max: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const parsed = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
    throw new Error(`${flag} must be an integer between 0 and ${max}`);
  }
  return parsed;
}

/**
 * Claims that say the same thing, with the evidence each one carries.
 *
 * Grouped on the object's TEXT because claim.object_entity_id is null for all 325
 * rows — objects are free text like {"text":"엔비디아"}. That is also why merging
 * alone cannot produce a graph edge: the relation ledger needs entity ids on both
 * ends, and resolving these objects is step 2, not this job.
 */
const GROUPS_SQL = `
SELECT c.claim_id,
       c.subject_entity_id,
       c.predicate,
       c.object_value::text AS object_text,
       c.observed_at,
       c.verification_status,
       ce.document_id,
       ce.chunk_id,
       ce.quote
FROM knowledge.claim c
JOIN knowledge.claim_evidence ce ON ce.claim_id = c.claim_id
WHERE c.object_entity_id IS NULL
ORDER BY c.subject_entity_id, c.predicate, c.object_value::text, c.observed_at, c.claim_id
`;

// INSERT only. claim_evidence carries an immutability trigger that rejects UPDATE
// and DELETE, the same append-only discipline the relation ledger uses, so a merge
// can only ever ADD the document a claim was missing.
const INSERT_EVIDENCE_SQL = `
INSERT INTO knowledge.claim_evidence (claim_id, document_id, chunk_id, quote)
VALUES ($1, $2, $3, $4)
ON CONFLICT (claim_id, document_id) DO NOTHING
RETURNING claim_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

type EvidenceRow = QueryResultRow & {
  claim_id: string | number;
  subject_entity_id: string | number;
  predicate: string;
  object_text: string;
  observed_at: Date | string;
  verification_status: string;
  document_id: string | number;
  chunk_id: string | number | null;
  quote: string | null;
};

export type ClaimForMerge = {
  claimId: number;
  observedAtMs: number;
  documents: { documentId: number; chunkId: number | null; quote: string | null }[];
};

export type MergePlan = {
  canonicalClaimId: number;
  /** Documents to attach to the canonical claim that it does not already carry. */
  addedDocuments: { documentId: number; chunkId: number | null; quote: string | null }[];
  /** Claims folded in. They are NOT deleted — see the note in planMerges. */
  absorbedClaimIds: number[];
  documentsAfter: number;
};

/**
 * Pure, so the decision is testable without a database. Merging is additive and
 * therefore hard to undo in an append-only table: an evidence row written against
 * the wrong claim cannot be deleted, only reasoned around.
 *
 * The canonical claim is the EARLIEST in the group, and every other claim within
 * the window of it is folded in. Anchoring on the earliest rather than chaining
 * neighbour-to-neighbour is deliberate: chaining would let a 20-day span merge
 * through three 7-day hops, which is exactly the over-merge the window exists to
 * prevent.
 *
 * Absorbed claims are left standing. claim rows have guarded status transitions and
 * no deletion path, and inventing one to tidy up duplicates would be a much larger
 * decision than supplying missing evidence. The count is reported instead.
 */
export function planMerges(group: readonly ClaimForMerge[], windowDays: number): MergePlan | null {
  if (group.length < 2) return null;
  const ordered = [...group].sort(
    (left, right) => left.observedAtMs - right.observedAtMs || left.claimId - right.claimId,
  );
  const canonical = ordered[0]!;
  const windowMs = windowDays * 24 * 60 * 60 * 1000;

  const have = new Set(canonical.documents.map((row) => row.documentId));
  const added: MergePlan['addedDocuments'] = [];
  const absorbed: number[] = [];

  for (const other of ordered.slice(1)) {
    if (Math.abs(other.observedAtMs - canonical.observedAtMs) > windowMs) continue;
    let contributed = false;
    for (const evidence of other.documents) {
      if (have.has(evidence.documentId)) continue;
      have.add(evidence.documentId);
      added.push(evidence);
      contributed = true;
    }
    if (contributed) absorbed.push(other.claimId);
  }

  if (added.length === 0) return null;
  return {
    canonicalClaimId: canonical.claimId,
    addedDocuments: added,
    absorbedClaimIds: absorbed,
    documentsAfter: have.size,
  };
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const windowDays = intOption('--window-days', DEFAULT_WINDOW_DAYS, 365);
  const startedAt = new Date();
  const runId = `${JOB_NAME}-${randomUUID()}`;

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();

  try {
    // The dry run does the SAME writes and rolls back, rather than predicting them.
    // Two dry runs today failed to predict their apply — synthetic ETF ids put every
    // edge out of retraction scope, and a dry-run-only valid_from could not tell a
    // replay from an insert. Here the writes pass through guard_evidence_anchor, so
    // only a real INSERT proves the merge is accepted at all.
    await client.query('BEGIN');

    const { rows } = await client.query<EvidenceRow>(GROUPS_SQL, []);
    const groups = new Map<string, Map<number, ClaimForMerge>>();
    for (const row of rows) {
      const key = `${row.subject_entity_id}|${row.predicate}|${row.object_text}`;
      const byClaim = groups.get(key) ?? new Map<number, ClaimForMerge>();
      const claimId = Number(row.claim_id);
      const claim = byClaim.get(claimId) ?? {
        claimId,
        observedAtMs: new Date(row.observed_at).getTime(),
        documents: [],
      };
      claim.documents.push({
        documentId: Number(row.document_id),
        chunkId: row.chunk_id === null ? null : Number(row.chunk_id),
        quote: row.quote,
      });
      byClaim.set(claimId, claim);
      groups.set(key, byClaim);
    }

    const plans: MergePlan[] = [];
    let groupsWithDuplicates = 0;
    for (const byClaim of groups.values()) {
      if (byClaim.size > 1) groupsWithDuplicates += 1;
      const plan = planMerges([...byClaim.values()], windowDays);
      if (plan !== null) plans.push(plan);
    }

    let evidenceInserted = 0;
    for (const plan of plans) {
      for (const evidence of plan.addedDocuments) {
        const written = await client.query(INSERT_EVIDENCE_SQL, [
          plan.canonicalClaimId,
          evidence.documentId,
          evidence.chunkId,
          evidence.quote,
        ]);
        evidenceInserted += written.rowCount ?? 0;
      }
    }

    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : 'dry-run',
      windowDays,
      claimGroups: groups.size,
      // Groups holding more than one claim row for the same statement.
      groupsWithDuplicates,
      groupsMerged: plans.length,
      evidenceInserted,
      // Claims that now hold 2+ distinct documents and therefore meet
      // ops.verification_policy's bar for `verified`. This job does NOT promote
      // them — run-claim-corroboration owns that transition.
      claimsNowVerifiable: plans.filter((plan) => plan.documentsAfter >= 2).length,
      // Left standing on purpose: claim rows are guarded and have no deletion path,
      // so tidying duplicates is a larger decision than supplying missing evidence.
      absorbedClaimsLeftStanding: plans.reduce(
        (sum, plan) => sum + plan.absorbedClaimIds.length,
        0,
      ),
      sample: plans.slice(0, 8).map((plan) => ({
        canonicalClaimId: plan.canonicalClaimId,
        documentsAfter: plan.documentsAfter,
        absorbed: plan.absorbedClaimIds,
      })),
    };
    console.log(JSON.stringify(summary, null, 2));

    if (apply) {
      await client.query(INSERT_MIGRATION_RUN_SQL, [
        runId,
        JOB_NAME,
        'completed',
        startedAt.toISOString(),
        JSON.stringify(summary),
      ]);
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('run-claim-merge.ts')) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
