// Derives SAME_INDUSTRY relations from the industry taxonomy.
//
//   node apps/api/src/relations/run-same-industry-relations.ts            # dry run
//   node apps/api/src/relations/run-same-industry-relations.ts --apply
//
// canonical/01 §5 requires Discovery to give every related company a reason, and
// competitor/peer is the first it lists. The graph had no accepted evidence for it:
// SAME_INDUSTRY held 418 revisions, all quarantined, seeded once in July by a path that
// predates the B6 policy gate and backed by no source revision at all.
//
// The classification exists now, so the edge is derived instead of asserted. Every
// candidate cites the ingestion revisions that reported both sides.
//
// WHY THIS JOB OWNS THE PREDICATE END TO END. Four things have to be true together or
// the guarantee is half-built, and each was added in this change:
//
//   the ontology revision is approved          migration 115
//   the policy row exists                      relation-policy.ts
//   candidates carry their evidence            same-industry-candidates.ts
//   retraction is wired                        below
//
// The last one is why the first attempt was reverted. absence-semantics-contract.test.ts
// requires every closed_world predicate to have retraction, and SAME_INDUSTRY genuinely
// is closed-world: this builder evaluates every pair from the full classification each
// run, so a pair that stops appearing has been reclassified, which is a verdict rather
// than a silence. Declaring the policy without the retraction promised something nothing
// kept, and the contract test caught it.
//
// Retraction lives here rather than in run-v2-graph-publish because the helpers are
// importable and the v2 plan says that 121KB file stays shut. Nothing about retraction
// requires the publisher; it required a caller.
//
// RETRACTION TAKES THE ENUMERATION SHAPE, WITH NO EnumerationScope. SAME_ETF_BASKET
// needs a scope because its world is one basket at a time and a basket can go
// uncollected; this predicate's world is a single table, core.entity_taxonomy_membership,
// read whole on every run. It does not degrade when a collector fails — a row leaves the
// current view only when something closed it, which is a verdict. That makes it the
// MEASURED_BY shape, where sourceWasRead is the whole completeness proof, and inventing a
// per-code scope would only make the guard look stronger than the thing it guards.
//
// The holding set is EVERY pair this run produced, whatever the policy then decided.
// A pair rejected by the degree cap or quarantined for thin evidence was still OBSERVED
// sharing a code; only the assertion was refused. Retracting on the policy's output
// instead of the builder's is the exact mistake relation-retraction.ts records at the
// top of its own file — 625 of a predicted 633 PRODUCT_SIMILARITY retractions were
// degree-cap drops, not verdicts.

import pg, { type PoolClient } from 'pg';

import { relationPayloadHash, sourceRevisionEvidence } from './builder-core.ts';
import { persistRelationCandidates } from './relation-candidate-store.ts';
import { evaluateRelationCandidate } from './relation-policy.ts';
import { planRetractionsNotInFromDatabase, retractEdgesNotIn } from './relation-retraction.ts';
import {
  planSameIndustryCandidates,
  type ClassifiedSecurity,
  type SameIndustryCandidate,
  type SameIndustryPlan,
} from './same-industry-candidates.ts';

const PREDICATE = 'SAME_INDUSTRY';
const JOB_NAME = 'stock-insight-same-industry-relations';

export type SameIndustryArgs = { mode: 'dry-run' | 'apply' };

export function parseSameIndustryArgs(argv: readonly string[]): SameIndustryArgs {
  let mode: SameIndustryArgs['mode'] = 'dry-run';
  for (const flag of argv) {
    if (flag === '--apply') {
      mode = 'apply';
      continue;
    }
    throw new Error(`unknown argument: ${flag}`);
  }
  return { mode };
}

/**
 * Current classifications, with the ingestion revision behind each and whether that
 * revision can back an ACCEPTED relation.
 *
 * Two ways a classification ends up with no usable evidence, and they are different
 * findings that must not be collapsed:
 *
 *   no revision at all      The legacy baseline import records
 *                           `public.entities.industry_code` in source_reference — a
 *                           table name, not a revision — so it parses to null.
 *   revision, unapproved    The source contract behind it is not `approved`. Measured
 *                           2026-08-11: 34 US securities cite sec-edgar-submissions,
 *                           whose contract is still provisional_review_required.
 *
 * `evidence_qualifies` mirrors knowledge.guard_accepted_relation_revision exactly
 * rather than approximating it. Approximating is what failed: the builder counted a
 * revision the guard then refused, and the guard RAISEs, so one unusable revision
 * aborted the entire run instead of quarantining one candidate. The two predicates the
 * guard applies to the contract — approved, and effective at collection time — are
 * repeated here verbatim so the builder's verdict and the ledger's agree.
 */
const CLASSIFIED_SQL = `
SELECT current.entity_id,
       identifier.identifier_value AS entity_key,
       current.taxonomy_system,
       current.code,
       current.valid_from,
       cited.source_revision_id,
       (contract_revision.policy_status = 'approved'
        AND contract_revision.effective_from <= revision.available_at) AS evidence_qualifies
  FROM core.entity_taxonomy_current_v1 current
  JOIN core.v_security_universe universe
    ON universe.security_entity_id = current.entity_id
  JOIN core.entity_identifier identifier
    ON identifier.entity_id = current.entity_id
   AND identifier.identifier_type = 'INTERNAL_KEY'
  LEFT JOIN LATERAL (
    SELECT CASE WHEN current.source_reference LIKE 'ingestion.source_revision:%'
                THEN substring(current.source_reference from 'ingestion\\.source_revision:(\\d+)')::bigint
           END AS source_revision_id
  ) cited ON true
  LEFT JOIN ingestion.source_revision revision
    ON revision.source_revision_id = cited.source_revision_id
  LEFT JOIN ingestion.source_contract_revision contract_revision
    ON contract_revision.source_contract_revision_id = revision.source_contract_revision_id
 ORDER BY current.entity_id
`;

const ONTOLOGY_SQL = `
SELECT predicate, max(predicate_ontology_revision_id) AS predicate_ontology_revision_id
  FROM knowledge.predicate_ontology_revision
 WHERE predicate = $1 AND policy_status = 'approved'
 GROUP BY predicate
`;

export type SameIndustrySummary = {
  classified: number;
  candidates: number;
  accepted: number;
  quarantined: number;
  rejected: number;
  /** Why the non-accepted candidates were not accepted, counted by reason. */
  reasons: Record<string, number>;
  skippedCodes: SameIndustryPlan['skippedCodes'];
  singletonCodes: number;
  /** Classifications whose revision exists but whose source contract is not approved. */
  unqualifiedEvidenceClassifications: number;
};

/**
 * One candidate as the persister's draft.
 *
 * validFrom comes from the classification, never from the clock. REQ-PIT-003 forbids
 * now() as a business cutoff, and this is a business fact: an edge stamped today would
 * tell a reader asking about March that the two were peers then, on no evidence but the
 * job's schedule. The candidate already resolved which of the two dates the claim
 * actually begins on.
 */
function buildDraft(candidate: SameIndustryCandidate) {
  const validFrom = candidate.validFrom;
  const payload = {
    predicate: PREDICATE,
    subjectEntityId: candidate.subjectEntityId,
    objectEntityId: candidate.objectEntityId,
    taxonomySystem: candidate.taxonomySystem,
    code: candidate.code,
  };
  const payloadHash = relationPayloadHash(payload);
  const decision = evaluateRelationCandidate({
    predicate: PREDICATE,
    distinctSourceRevisionIds: candidate.distinctSourceRevisionIds,
    hasModelConfigEvidence: false,
    subjectDegree: candidate.degree,
    objectDegree: candidate.degree,
  });
  return {
    predicate: PREDICATE,
    subjectEntityId: candidate.subjectEntityId,
    objectEntityId: candidate.objectEntityId,
    relationKind: 'structural' as const,
    validFrom,
    payloadHash,
    // One evidence row per side that has a revision. A pair from the legacy import
    // produces none, which is why it quarantines rather than being written as accepted.
    evidence: candidate.distinctSourceRevisionIds.map((sourceRevisionId) =>
      sourceRevisionEvidence({
        sourceRevisionId,
        payloadHash,
        evidenceText: `${candidate.taxonomySystem} ${candidate.code}`,
        validFrom,
      }),
    ),
    policyDecision: decision,
    targetRevisionStatus:
      decision.decision === 'accepted'
        ? ('accepted' as const)
        : ('quarantined_unverified' as const),
    metadata: {
      taxonomySystem: candidate.taxonomySystem,
      code: candidate.code,
      degree: candidate.degree,
      builder: 'same-industry-v1',
    },
  };
}

export async function planSameIndustryRun(client: {
  query: <Row extends Record<string, unknown>>(text: string) => Promise<{ rows: Row[] }>;
}): Promise<{
  summary: SameIndustrySummary;
  plan: SameIndustryPlan;
  drafts: ReturnType<typeof buildDraft>[];
}> {
  const { rows } = await client.query<Record<string, unknown>>(CLASSIFIED_SQL);
  const securities: ClassifiedSecurity[] = rows.map((row) => ({
    entityId: Number(row.entity_id),
    entityKey: String(row.entity_key),
    taxonomySystem: String(row.taxonomy_system),
    code: String(row.code),
    sourceRevisionId: row.source_revision_id == null ? null : Number(row.source_revision_id),
    evidenceQualifies: row.evidence_qualifies === true,
    // Normalised here so the candidate planner compares like with like; pg hands back
    // a Date for timestamptz, and a raw string only when the driver is stubbed.
    validFrom:
      row.valid_from instanceof Date
        ? row.valid_from.toISOString()
        : new Date(String(row.valid_from)).toISOString(),
  }));

  const plan = planSameIndustryCandidates(securities);
  const drafts = plan.candidates.map((candidate) => buildDraft(candidate));

  const reasons: Record<string, number> = {};
  let accepted = 0;
  let quarantined = 0;
  let rejected = 0;
  for (const draft of drafts) {
    for (const reason of draft.policyDecision.reasons) {
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
    if (draft.policyDecision.decision === 'accepted') accepted += 1;
    else if (draft.policyDecision.decision === 'quarantined_unverified') quarantined += 1;
    else rejected += 1;
  }

  return {
    plan,
    drafts,
    summary: {
      classified: securities.length,
      candidates: plan.candidates.length,
      accepted,
      quarantined,
      rejected,
      reasons,
      skippedCodes: plan.skippedCodes,
      singletonCodes: plan.singletonCodes,
      unqualifiedEvidenceClassifications: plan.unqualifiedEvidenceClassifications,
    },
  };
}

async function main(): Promise<void> {
  const args = parseSameIndustryArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const pool = new pg.Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const { summary, plan, drafts } = await planSameIndustryRun(client as unknown as PoolClient);

    const holdingPairs = plan.candidates.map((candidate) => ({
      subjectEntityId: candidate.subjectEntityId,
      objectEntityId: candidate.objectEntityId,
    }));
    // Two conditions, not one. Zero classifications means the read failed or the
    // taxonomy is empty, and zero pairs means every code collapsed to a singleton —
    // either way this run has proven nothing, and retractEdgesNotIn would otherwise
    // refuse outright rather than quietly do nothing.
    const sourceWasRead = summary.classified > 0 && plan.candidates.length > 0;

    if (args.mode === 'dry-run') {
      const retraction = await planRetractionsNotInFromDatabase(
        client as unknown as PoolClient,
        PREDICATE,
        { holdingPairs, sourceWasRead },
      );
      console.log(
        JSON.stringify({ mode: args.mode, predicate: PREDICATE, ...summary, retraction }, null, 2),
      );
      return;
    }

    const ontology = await client.query<{ predicate_ontology_revision_id: string }>(ONTOLOGY_SQL, [
      PREDICATE,
    ]);
    const ontologyRevisionId = Number(ontology.rows[0]?.predicate_ontology_revision_id);
    if (!Number.isFinite(ontologyRevisionId)) {
      throw new Error(
        `${PREDICATE} has no approved predicate ontology revision; apply migration 115`,
      );
    }

    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JOB_NAME]);
      const persisted = await persistRelationCandidates(client as unknown as PoolClient, drafts, {
        predicateOntologyRevisionIds: { [PREDICATE]: ontologyRevisionId },
        confidence: 1,
      });
      // Retract AFTER writing, so a pair that moved from one code to another is never
      // absent from the graph in between.
      const retraction = await retractEdgesNotIn(
        client as unknown as PoolClient,
        PREDICATE,
        JOB_NAME,
        { holdingPairs, sourceWasRead },
      );
      await client.query('COMMIT');
      console.log(
        JSON.stringify(
          {
            mode: args.mode,
            predicate: PREDICATE,
            ...summary,
            persisted: persisted.persisted.length,
            retraction,
          },
          null,
          2,
        ),
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
