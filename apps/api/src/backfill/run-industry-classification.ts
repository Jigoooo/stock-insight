// Maps DART-reported industry codes onto the taxonomy.
//
//   node apps/api/src/backfill/run-industry-classification.ts            # dry run
//   node apps/api/src/backfill/run-industry-classification.ts --apply
//
// 178 of 297 stocks carry an explicit UNCLASSIFIED membership. That was honest — the
// legacy import's public.entities.industry_code covered 119 — but 135 of those 178 are
// Korean stocks whose KSIC code has been sitting in this database the whole time, in
// public.company_profiles.profile_json->>'industryCode'. Nothing needed collecting.
// The codes were never mapped.
//
// The remaining 43 are US stocks. SEC keeps SIC in its submissions endpoint and this
// repository ingests companyfacts, whose payload carries no classification at all —
// verified against governance.source_shape_revision rather than assumed. Closing that
// gap is a collector change and is deliberately not attempted here.
//
// WHY A NEW RELEASE, AND WHY THE OLD ROW IS CLOSED RATHER THAN EDITED. Migration 021
// froze the baseline and said what comes next: "Later source changes require a new
// taxonomy release + temporal membership; reapplying this import must never replace or
// collide with baseline history." The table could not express that until migration 102
// added valid_to — uq_entity_taxonomy_system allowed one KSIC membership per entity
// ever, so the only available move was an in-place UPDATE that would have deleted the
// fact that we did not know this company's industry until today.
//
// So: the baseline row is closed with valid_to, and a new membership opens under
// dart-company-profile-v1 (migration 101). Closing happens first, so a crash between
// the two leaves the old answer standing rather than leaving none.
//
// WHY A JOB AND NOT A MIGRATION. A migration would classify the 222 companies that
// happened to exist on 2026-08-10 and never run again, recreating the same gap for
// every Korean listing added afterwards. The profile snapshot is refreshed by the
// pipeline; this reads whatever it currently holds.

import pg from 'pg';

export type IndustryClassificationArgs = { mode: 'dry-run' | 'apply' };

export function parseIndustryClassificationArgs(
  argv: readonly string[],
): IndustryClassificationArgs {
  let mode: IndustryClassificationArgs['mode'] = 'dry-run';
  for (const flag of argv) {
    if (flag === '--apply') {
      mode = 'apply';
      continue;
    }
    throw new Error(`unknown argument: ${flag}`);
  }
  return { mode };
}

export type QueryClient = {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
};

/**
 * What the taxonomy currently says about a stock, and what a source currently reports.
 *
 * `currentState` distinguishes three things the first version of this job collapsed
 * into two, and got wrong for 34 stocks because of it:
 *
 *   'absent'        no membership at all — worse than UNCLASSIFIED, which at least
 *                   says "we looked and did not know"
 *   'unclassified'  an explicit UNCLASSIFIED membership
 *   'classified'    a real code, from whichever source got there first
 *
 * 356 stocks exist and 297 had a membership. The 59 with none were invisible to a
 * check written as "does an UNCLASSIFIED membership exist", which reads false for a
 * stock that has nothing — the same shape as a stock that is already classified.
 */
export type CurrentState = 'absent' | 'unclassified' | 'classified';

export type ClassificationCandidate = {
  entityId: number;
  entityKey: string;
  countryCode: string;
  code: string | null;
  sourceRevisionId: number | null;
  currentState: CurrentState;
};

/**
 * Candidates, with their provenance resolved in the same statement that reads them.
 *
 * The join to ingestion.source_revision is not decoration. The taxonomy contract test
 * asserts no `source_reported` membership carries a code that cannot be traced to the
 * source that reported it, and a membership whose provenance is the string
 * "company profile" would satisfy nothing. Every row here names the immutable revision
 * the code came from.
 */
const CANDIDATE_SQL = `
SELECT stock.entity_id,
       identifier.identifier_value AS entity_key,
       stock.country_code,
       nullif(btrim(profile.profile_json->>'industryCode'), '') AS code,
       revision.source_revision_id,
       CASE
         WHEN current.taxonomy_node_id IS NULL THEN 'absent'
         WHEN current.code = 'UNCLASSIFIED' THEN 'unclassified'
         ELSE 'classified'
       END AS current_state
  FROM core.entity stock
  JOIN core.entity_identifier identifier
    ON identifier.entity_id = stock.entity_id
   AND identifier.identifier_type = 'INTERNAL_KEY'
  LEFT JOIN public.company_profiles profile
    ON profile.entity_key = identifier.identifier_value
  LEFT JOIN LATERAL (
    SELECT node.code, node.taxonomy_node_id
      FROM core.entity_taxonomy_membership membership
      JOIN core.taxonomy_node node
        ON node.taxonomy_node_id = membership.taxonomy_node_id
     WHERE membership.entity_id = stock.entity_id
       AND membership.valid_to IS NULL
     ORDER BY membership.valid_from DESC, membership.entity_taxonomy_membership_id DESC
     LIMIT 1
  ) current ON TRUE
  LEFT JOIN LATERAL (
    SELECT revision.source_revision_id
      FROM ingestion.source source
      JOIN ingestion.source_record_identity record
        ON record.source_id = source.source_id
       AND record.provider_record_key = 'profile:' || identifier.identifier_value
      JOIN ingestion.source_revision revision
        ON revision.source_record_identity_id = record.source_record_identity_id
     WHERE source.provider_key = 'internal-company-profile-snapshot'
     ORDER BY revision.revision_no DESC
     LIMIT 1
  ) revision ON TRUE
 WHERE stock.entity_type = 'Stock'
 ORDER BY identifier.identifier_value
`;

export async function loadClassificationCandidates(
  client: QueryClient,
): Promise<ClassificationCandidate[]> {
  const { rows } = await client.query<Record<string, unknown>>(CANDIDATE_SQL);
  return rows.map((row) => ({
    entityId: Number(row.entity_id),
    entityKey: String(row.entity_key),
    countryCode: String(row.country_code ?? ''),
    code: row.code == null ? null : String(row.code).trim(),
    sourceRevisionId: row.source_revision_id == null ? null : Number(row.source_revision_id),
    currentState: String(row.current_state) as CurrentState,
  }));
}

/**
 * KSIC codes arrive at three widths — 3, 4 and 5 digits — because DART reports at
 * whichever level it classified the company. Measured on the live snapshot: 42 at
 * three digits, 21 at four, 72 at five.
 *
 * The width IS the hierarchy level, so it is recorded rather than normalised away.
 * Padding everything to five digits would invent precision the source never claimed,
 * and truncating to three would throw away the precision it did.
 */
export function ksicHierarchyLevel(code: string): number {
  return code.length;
}

/** A code the taxonomy can hold: digits only, and no wider than KSIC goes. */
export function isUsableKsicCode(code: string): boolean {
  return /^[0-9]{2,5}$/.test(code);
}

export type ClassificationPlan = {
  candidates: ClassificationCandidate[];
  /** A reported code the taxonomy does not yet carry. Closed-then-opened if superseding. */
  toClassify: ClassificationCandidate[];
  /** Stocks with no membership at all and no reported code — they get an honest UNCLASSIFIED. */
  toMarkUnclassified: ClassificationCandidate[];
  /** Already carrying a real code. Left alone: this job maps, it does not arbitrate. */
  leftAlone: number;
  rejected: { entityKey: string; code: string; reason: string }[];
};

export function planIndustryClassification(
  candidates: readonly ClassificationCandidate[],
): ClassificationPlan {
  const toClassify: ClassificationCandidate[] = [];
  const toMarkUnclassified: ClassificationCandidate[] = [];
  const rejected: { entityKey: string; code: string; reason: string }[] = [];
  let leftAlone = 0;

  for (const candidate of candidates) {
    if (candidate.currentState === 'classified') {
      // Two sources disagreeing is a question this job is not equipped to answer, and
      // silently preferring the newer one would be answering it.
      leftAlone += 1;
      continue;
    }
    if (candidate.code === null || candidate.sourceRevisionId === null) {
      // Nothing reports a code. A stock with no membership still needs one — absence
      // says nothing, while UNCLASSIFIED says we looked and did not find.
      if (candidate.currentState === 'absent') toMarkUnclassified.push(candidate);
      continue;
    }
    if (!isUsableKsicCode(candidate.code)) {
      // Reported, never guessed at. A code we cannot read is a coverage fact worth
      // surfacing, not a row worth inventing.
      rejected.push({
        entityKey: candidate.entityKey,
        code: candidate.code,
        reason: 'not a 2-5 digit KSIC code',
      });
      if (candidate.currentState === 'absent') toMarkUnclassified.push(candidate);
      continue;
    }
    toClassify.push(candidate);
  }

  return { candidates: [...candidates], toClassify, toMarkUnclassified, leftAlone, rejected };
}

const RELEASE_SQL = `
SELECT taxonomy_release_id
  FROM core.taxonomy_release
 WHERE taxonomy_system = 'KSIC' AND release_version = 'dart-company-profile-v1'
`;

export type ClassificationPersistence = {
  nodesInserted: number;
  closedMemberships: number;
  membershipsInserted: number;
  unclassifiedInserted: number;
};

export async function applyIndustryClassification(
  client: QueryClient,
  plan: ClassificationPlan,
): Promise<ClassificationPersistence> {
  const { rows } = await client.query<{ taxonomy_release_id: string }>(RELEASE_SQL);
  const releaseId = rows[0]?.taxonomy_release_id;
  if (!releaseId) {
    throw new Error('KSIC dart-company-profile-v1 release is missing; apply migration 101 first');
  }

  const codes = [...new Set(plan.toClassify.map((candidate) => candidate.code))]
    .filter((code): code is string => code !== null)
    .sort();
  const nodeResult = await client.query<{ taxonomy_node_id: string }>(
    `INSERT INTO core.taxonomy_node
       (taxonomy_release_id, code, label, hierarchy_level, node_status, metadata)
     SELECT $1::bigint, code, 'KSIC ' || code, length(code), 'source_reported',
            jsonb_build_object('provider', 'opendart', 'policy', 'b3-v1')
       FROM unnest($2::text[]) AS code
     ON CONFLICT (taxonomy_release_id, code) DO NOTHING
     RETURNING taxonomy_node_id`,
    [releaseId, codes],
  );

  // Close the membership being superseded before opening its replacement. The unique
  // index allows one live classification per (entity, system), so these cannot both be
  // open — and closing first means a crash between the two leaves the old answer
  // standing rather than leaving none.
  //
  // Only UNCLASSIFIED rows are closed; `absent` stocks have nothing to close. A stock
  // already carrying a real code never reaches here — this job maps codes the taxonomy
  // never had, it does not arbitrate between two sources that disagree.
  const supersededIds = plan.toClassify
    .filter((candidate) => candidate.currentState === 'unclassified')
    .map((candidate) => candidate.entityId);
  const closedResult = await client.query<{ entity_taxonomy_membership_id: string }>(
    `UPDATE core.entity_taxonomy_membership membership
        SET valid_to = now()
      WHERE membership.entity_id = ANY($1::bigint[])
        AND membership.valid_to IS NULL
        AND membership.metadata->>'taxonomy_system' = 'KSIC'
        AND EXISTS (
          SELECT 1
            FROM core.taxonomy_node node
           WHERE node.taxonomy_node_id = membership.taxonomy_node_id
             AND node.code = 'UNCLASSIFIED'
        )
      RETURNING membership.entity_taxonomy_membership_id`,
    [supersededIds],
  );

  // One statement, so a membership can never reference a node from a different release
  // than the one just resolved. The UNIQUE (entity_id, taxonomy_node_id) makes a rerun
  // a no-op rather than a duplicate, which is what lets this sit in a daily pipeline.
  const membershipResult = await client.query<{ entity_taxonomy_membership_id: string }>(
    `INSERT INTO core.entity_taxonomy_membership
       (entity_id, taxonomy_node_id, classification_status, source_reference,
        valid_from, known_from, metadata)
     SELECT candidate.entity_id,
            node.taxonomy_node_id,
            'source_reported',
            'ingestion.source_revision:' || candidate.source_revision_id,
            now(),
            now(),
            jsonb_build_object(
              'taxonomy_system', 'KSIC',
              'policy', 'b3-v1',
              'source_revision_id', candidate.source_revision_id
            )
       FROM unnest($2::bigint[], $3::text[], $4::bigint[])
         AS candidate(entity_id, code, source_revision_id)
       JOIN core.taxonomy_node node
         ON node.taxonomy_release_id = $1::bigint AND node.code = candidate.code
     ON CONFLICT (entity_id, taxonomy_node_id) DO NOTHING
     RETURNING entity_taxonomy_membership_id`,
    [
      releaseId,
      plan.toClassify.map((candidate) => candidate.entityId),
      plan.toClassify.map((candidate) => candidate.code),
      plan.toClassify.map((candidate) => candidate.sourceRevisionId),
    ],
  );

  // Stocks with no membership at all and nothing reporting a code. They get the same
  // explicit UNCLASSIFIED migration 021 gave the baseline, in the baseline release and
  // the system that release picked by country — absence is not a classification, and a
  // stock the taxonomy has never heard of reads identically to one it decided about.
  const unclassifiedResult = await client.query<{ entity_taxonomy_membership_id: string }>(
    `INSERT INTO core.entity_taxonomy_membership
       (entity_id, taxonomy_node_id, classification_status, source_reference,
        valid_from, known_from, metadata)
     SELECT candidate.entity_id,
            node.taxonomy_node_id,
            'unclassified',
            'b3-explicit-unclassified',
            now(),
            now(),
            jsonb_build_object('taxonomy_system', release.taxonomy_system, 'policy', 'b3-v1')
       FROM unnest($1::bigint[], $2::text[]) AS candidate(entity_id, country_code)
       JOIN core.taxonomy_release release
         ON release.release_version = 'legacy-import-b3-v1'
        AND release.taxonomy_system =
            CASE WHEN candidate.country_code = 'KR' THEN 'KSIC' ELSE 'SIC' END
       JOIN core.taxonomy_node node
         ON node.taxonomy_release_id = release.taxonomy_release_id
        AND node.code = 'UNCLASSIFIED'
     ON CONFLICT (entity_id, taxonomy_node_id) DO NOTHING
     RETURNING entity_taxonomy_membership_id`,
    [
      plan.toMarkUnclassified.map((candidate) => candidate.entityId),
      plan.toMarkUnclassified.map((candidate) => candidate.countryCode),
    ],
  );

  return {
    nodesInserted: nodeResult.rows.length,
    closedMemberships: closedResult.rows.length,
    membershipsInserted: membershipResult.rows.length,
    unclassifiedInserted: unclassifiedResult.rows.length,
  };
}

async function main(): Promise<void> {
  const args = parseIndustryClassificationArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const pool = new pg.Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  try {
    const candidates = await loadClassificationCandidates(client as unknown as QueryClient);
    const plan = planIndustryClassification(candidates);

    let persistence: Awaited<ReturnType<typeof applyIndustryClassification>> | null = null;
    if (args.mode === 'apply') {
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          'industry-classification',
        ]);
        persistence = await applyIndustryClassification(client as unknown as QueryClient, plan);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: args.mode,
          stocks: plan.candidates.length,
          toClassify: plan.toClassify.length,
          toMarkUnclassified: plan.toMarkUnclassified.length,
          leftAlone: plan.leftAlone,
          rejected: plan.rejected,
          persistence,
        },
        null,
        2,
      ),
    );
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
