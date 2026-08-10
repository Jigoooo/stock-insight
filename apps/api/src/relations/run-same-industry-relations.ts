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
// The classification exists now, so the edge can be derived instead of asserted.
//
// THIS JOB REPORTS; IT DOES NOT WRITE, AND THERE IS NO POLICY ROW YET. Both omissions
// are deliberate and they are the same omission. RELATION_BUILDER_POLICIES entries with
// absenceSemantics 'closed_world' are required by absence-semantics-contract.test.ts to
// have retraction wired in run-v2-graph-publish.ts, and SAME_INDUSTRY genuinely is
// closed-world: this builder evaluates every pair from the full classification each run,
// so a pair that stops appearing has been reclassified, which is a verdict rather than a
// silence. Registering the policy before the retraction exists would declare a promise
// nothing keeps — and the contract test caught exactly that when it was tried.
//
// So this stage establishes the measurement: how many pairs the classification yields
// and how many of them carry two traceable sides. Persistence, the evidence ledger rows
// that make a revision auditable, the policy row and the retraction all belong to one
// later change, because any of them alone is a half-built guarantee.
//
// Measured 2026-08-11: 602 directed edges across 62 codes. 250 of them sit in codes
// where every member's classification traces to an ingestion revision; the rest come
// from the legacy baseline import, whose source_reference is
// 'public.entities.industry_code' — a table name, not a revision — and an edge asserted
// on a classification nobody can trace is exactly what a source-revision minimum is for.

import pg, { type PoolClient } from 'pg';

import {
  planSameIndustryCandidates,
  type ClassifiedSecurity,
  type SameIndustryPlan,
} from './same-industry-candidates.ts';

const PREDICATE = 'SAME_INDUSTRY';

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
 * Current classifications, with the ingestion revision behind each where one exists.
 *
 * The legacy baseline import records `public.entities.industry_code` in
 * source_reference — a table name, not a revision — so it parses to null and its pairs
 * carry fewer distinct revisions than the policy requires. That is the intended outcome
 * and not a bug to route around.
 */
const CLASSIFIED_SQL = `
SELECT current.entity_id,
       identifier.identifier_value AS entity_key,
       current.taxonomy_system,
       current.code,
       CASE WHEN current.source_reference LIKE 'ingestion.source_revision:%'
            THEN substring(current.source_reference from 'ingestion\\.source_revision:(\\d+)')::bigint
       END AS source_revision_id
  FROM core.entity_taxonomy_current_v1 current
  JOIN core.v_security_universe universe
    ON universe.security_entity_id = current.entity_id
  JOIN core.entity_identifier identifier
    ON identifier.entity_id = current.entity_id
   AND identifier.identifier_type = 'INTERNAL_KEY'
 ORDER BY current.entity_id
`;

export type SameIndustrySummary = {
  classified: number;
  candidates: number;
  /** Pairs where BOTH classifications trace to an ingestion revision. */
  fullyTraceable: number;
  /** Pairs where only one side is traceable — the legacy import supplies the other. */
  halfTraceable: number;
  /** Pairs where neither side traces to a revision. */
  untraceable: number;
  /** The widest per-endpoint degree any candidate carries. */
  maxDegree: number;
  skippedCodes: SameIndustryPlan['skippedCodes'];
  singletonCodes: number;
};

export async function planSameIndustryRun(client: {
  query: <Row extends Record<string, unknown>>(text: string) => Promise<{ rows: Row[] }>;
}): Promise<{ summary: SameIndustrySummary; plan: SameIndustryPlan }> {
  const { rows } = await client.query<Record<string, unknown>>(CLASSIFIED_SQL);
  const securities: ClassifiedSecurity[] = rows.map((row) => ({
    entityId: Number(row.entity_id),
    entityKey: String(row.entity_key),
    taxonomySystem: String(row.taxonomy_system),
    code: String(row.code),
    sourceRevisionId: row.source_revision_id == null ? null : Number(row.source_revision_id),
  }));

  const plan = planSameIndustryCandidates(securities);
  // Traceability is counted, not judged. Whether two revisions is enough is a policy
  // decision, and the policy row does not exist yet for the reason in the header — so
  // this reports the fact the decision will turn on rather than pre-empting it.
  let fullyTraceable = 0;
  let halfTraceable = 0;
  let untraceable = 0;
  let maxDegree = 0;
  for (const candidate of plan.candidates) {
    const traced = candidate.distinctSourceRevisionIds.length;
    if (traced >= 2) fullyTraceable += 1;
    else if (traced === 1) halfTraceable += 1;
    else untraceable += 1;
    if (candidate.degree > maxDegree) maxDegree = candidate.degree;
  }

  return {
    plan,
    summary: {
      classified: securities.length,
      candidates: plan.candidates.length,
      fullyTraceable,
      halfTraceable,
      untraceable,
      maxDegree,
      skippedCodes: plan.skippedCodes,
      singletonCodes: plan.singletonCodes,
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
    const { summary } = await planSameIndustryRun(client as unknown as PoolClient);
    if (args.mode === 'apply') {
      throw new Error(
        'SAME_INDUSTRY persistence is not implemented; see the header — the policy row, the evidence ledger and the retraction land together or not at all',
      );
    }
    console.log(JSON.stringify({ mode: args.mode, predicate: PREDICATE, ...summary }, null, 2));
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
