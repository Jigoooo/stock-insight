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
// The US side comes from SEC submissions, collected by run-sec-submissions.ts. Its
// payload is where `sic` lives; companyfacts, which this repository already ingested,
// carries no classification at all — verified against governance.source_shape_revision
// rather than assumed. Both sides land here so one job owns "what does the taxonomy
// currently say, and what do sources currently report".
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

import { readRawObjectVerified } from '../ingest/raw-object-store.ts';
import { readSic } from '../ingest/run-sec-submissions.ts';

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
  /** Which system the reported code belongs to. KSIC from DART, SIC from SEC. */
  taxonomySystem: 'KSIC' | 'SIC' | null;
  /**
   * The source's own name for the code, when it gives one.
   *
   * SEC returns sicDescription ("Air Transportation, Scheduled") next to the code, and
   * the first version of this job threw it away and synthesised "SIC 4512" instead.
   * That reads like a label and carries nothing: a reviewer looking at a node needs to
   * know what the code MEANS, and inventing a name that only restates the number is
   * worse than admitting we have none. DART's profile gives no name, so KSIC nodes
   * stay unlabelled until a KSIC name table arrives.
   */
  codeLabel: string | null;
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
       sec.source_revision_id AS sec_source_revision_id,
       sec.object_uri AS sec_object_uri,
       sec.content_hash AS sec_content_hash,
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
  -- The SEC side. Its code is not in a column: submissions payloads are immutable raw
  -- objects on disk, so the loader reads and hash-verifies them. Only the newest
  -- revision per filer is offered, for the same reason the profile side takes the
  -- newest — an older capture is history, not a competing answer.
  LEFT JOIN LATERAL (
    SELECT revision.source_revision_id, object.object_uri, object.content_hash
      FROM core.security_issuer_identity issuer_identity
      JOIN core.entity_identifier cik
        ON cik.entity_id = issuer_identity.issuer_entity_id AND cik.identifier_type = 'CIK'
      JOIN ingestion.source source ON source.provider_key = 'sec-edgar-submissions'
      JOIN ingestion.source_record_identity record
        ON record.source_id = source.source_id
       AND record.provider_record_key = 'submissions:' || cik.identifier_value
      JOIN ingestion.source_revision revision
        ON revision.source_record_identity_id = record.source_record_identity_id
      JOIN ingestion.raw_object object ON object.raw_object_id = revision.raw_object_id
     WHERE issuer_identity.security_entity_id = stock.entity_id
     ORDER BY revision.revision_no DESC
     LIMIT 1
  ) sec ON TRUE
 WHERE stock.entity_type = 'Stock'
 ORDER BY identifier.identifier_value
`;

export async function loadClassificationCandidates(
  client: QueryClient,
  readRawObject: (ref: { objectUri: string; contentHash: string }) => Promise<Buffer>,
): Promise<ClassificationCandidate[]> {
  const { rows } = await client.query<Record<string, unknown>>(CANDIDATE_SQL);
  const candidates: ClassificationCandidate[] = [];
  for (const row of rows) {
    const base = {
      entityId: Number(row.entity_id),
      entityKey: String(row.entity_key),
      countryCode: String(row.country_code ?? ''),
      currentState: String(row.current_state) as CurrentState,
    };
    const profileCode = row.code == null ? null : String(row.code).trim();
    if (profileCode) {
      candidates.push({
        ...base,
        code: profileCode,
        sourceRevisionId: Number(row.source_revision_id),
        taxonomySystem: 'KSIC',
        codeLabel: null,
      });
      continue;
    }
    if (row.sec_object_uri != null && row.sec_content_hash != null) {
      // Hash-verified, not just read. A raw object whose bytes no longer match its
      // registered hash is not evidence, and silently classifying from one would make
      // the provenance chain a decoration.
      const payload = await readRawObject({
        objectUri: String(row.sec_object_uri),
        contentHash: String(row.sec_content_hash),
      });
      const sic = readSic(JSON.parse(payload.toString('utf8')));
      if (sic) {
        candidates.push({
          ...base,
          code: sic.sic,
          sourceRevisionId: Number(row.sec_source_revision_id),
          taxonomySystem: 'SIC',
          codeLabel: sic.description,
        });
        continue;
      }
    }
    candidates.push({
      ...base,
      code: null,
      sourceRevisionId: null,
      taxonomySystem: null,
      codeLabel: null,
    });
  }
  return candidates;
}

/**
 * Codes arrive at several widths. KSIC reports at 3, 4 or 5 digits depending on how
 * finely DART classified the company — measured live: 42 at three, 21 at four, 72 at
 * five. SIC is 3 or 4.
 *
 * The width IS the hierarchy level, so it is recorded rather than normalised away.
 * Padding to a common width would invent precision the source never claimed, and
 * truncating would throw away the precision it did.
 */
export function industryHierarchyLevel(code: string): number {
  return code.length;
}

/** A code the taxonomy can hold: digits only, within the widths the two systems use. */
export function isUsableIndustryCode(code: string): boolean {
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
    if (!isUsableIndustryCode(candidate.code)) {
      // Reported, never guessed at. A code we cannot read is a coverage fact worth
      // surfacing, not a row worth inventing.
      rejected.push({
        entityKey: candidate.entityKey,
        code: candidate.code,
        reason: 'not a 2-5 digit industry code',
      });
      if (candidate.currentState === 'absent') toMarkUnclassified.push(candidate);
      continue;
    }
    toClassify.push(candidate);
  }

  return { candidates: [...candidates], toClassify, toMarkUnclassified, leftAlone, rejected };
}

// One release per system, both opened by migrations 101 and 103 for the same reason:
// migration 021 froze the baseline import and later source changes get their own
// release rather than an edit to it.
const RELEASE_SQL = `
SELECT taxonomy_system, taxonomy_release_id
  FROM core.taxonomy_release
 WHERE (taxonomy_system = 'KSIC' AND release_version = 'dart-company-profile-v1')
    OR (taxonomy_system = 'SIC'  AND release_version = 'sec-submissions-v1')
`;

export type ClassificationPersistence = {
  nodesInserted: number;
  labelsFilled: number;
  closedMemberships: number;
  membershipsInserted: number;
  unclassifiedInserted: number;
};

export async function applyIndustryClassification(
  client: QueryClient,
  plan: ClassificationPlan,
): Promise<ClassificationPersistence> {
  const { rows } = await client.query<{ taxonomy_system: string; taxonomy_release_id: string }>(
    RELEASE_SQL,
  );
  const releaseOf = new Map(rows.map((row) => [row.taxonomy_system, row.taxonomy_release_id]));
  for (const system of ['KSIC', 'SIC'] as const) {
    if (!releaseOf.has(system)) {
      throw new Error(`${system} source release is missing; apply migrations 101 and 103 first`);
    }
  }

  const provider: Record<string, string> = { KSIC: 'opendart', SIC: 'sec-edgar-submissions' };
  let nodesInserted = 0;
  let labelsFilled = 0;
  for (const system of ['KSIC', 'SIC'] as const) {
    // One row per code, keeping whichever label the source supplied. A code reported
    // by two companies with two spellings takes the first; disagreeing labels for one
    // code is a source problem, and picking arbitrarily is better than inventing a
    // third name to reconcile them.
    const labelled = new Map<string, string | null>();
    for (const candidate of plan.candidates) {
      if (candidate.taxonomySystem !== system || candidate.code === null) continue;
      if (!labelled.has(candidate.code)) labelled.set(candidate.code, candidate.codeLabel);
    }
    // Nodes are only created for codes being written now; labels are repaired for any
    // code this system reports, including ones whose node already exists.
    const writing = new Set(
      plan.toClassify
        .filter((candidate) => candidate.taxonomySystem === system)
        .map((candidate) => candidate.code),
    );
    const codes = [...labelled.keys()].filter((code) => writing.has(code)).sort();
    const inserted = await client.query<{ taxonomy_node_id: string }>(
      `INSERT INTO core.taxonomy_node
         (taxonomy_release_id, code, label, hierarchy_level, node_status, metadata)
       SELECT $1::bigint, entry.code, coalesce(entry.label, ''), length(entry.code),
              'source_reported',
              jsonb_build_object('provider', $4::text, 'policy', 'b3-v1')
         FROM unnest($2::text[], $3::text[]) AS entry(code, label)
       ON CONFLICT (taxonomy_release_id, code) DO NOTHING
       RETURNING taxonomy_node_id`,
      [
        releaseOf.get(system),
        codes,
        codes.map((code) => labelled.get(code) ?? null),
        provider[system],
      ],
    );
    nodesInserted += inserted.rows.length;

    // Fill a label we did not have when the node was first created. ON CONFLICT DO
    // NOTHING above means an existing node keeps whatever label it was born with, and
    // the first version of this job was born with none — so without this the gap would
    // persist for every code already inserted.
    //
    // Only ever fills an empty one. Overwriting a label a source previously gave would
    // let today's spelling silently rewrite yesterday's.
    const named = [...labelled.keys()].filter((code) => (labelled.get(code) ?? null) !== null);
    if (named.length > 0) {
      const relabelled = await client.query<{ taxonomy_node_id: string }>(
        `UPDATE core.taxonomy_node node
            SET label = entry.label
           FROM unnest($2::text[], $3::text[]) AS entry(code, label)
          WHERE node.taxonomy_release_id = $1::bigint
            AND node.code = entry.code
            AND btrim(node.label) = ''
          RETURNING node.taxonomy_node_id`,
        [releaseOf.get(system), named, named.map((code) => labelled.get(code))],
      );
      labelsFilled += relabelled.rows.length;
    }
  }

  // Close the membership being superseded before opening its replacement. The unique
  // index allows one live classification per (entity, system), so these cannot both be
  // open — and closing first means a crash between the two leaves the old answer
  // standing rather than leaving none.
  //
  // Only UNCLASSIFIED rows are closed; `absent` stocks have nothing to close. A stock
  // already carrying a real code never reaches here — this job maps codes the taxonomy
  // never had, it does not arbitrate between two sources that disagree.
  const supersededIds = plan.toClassify.filter(
    (candidate) => candidate.currentState === 'unclassified',
  );
  const closedResult = await client.query<{ entity_taxonomy_membership_id: string }>(
    `UPDATE core.entity_taxonomy_membership membership
        SET valid_to = now()
       FROM unnest($1::bigint[], $2::text[]) AS superseded(entity_id, taxonomy_system)
      WHERE membership.entity_id = superseded.entity_id
        AND membership.valid_to IS NULL
        AND membership.metadata->>'taxonomy_system' = superseded.taxonomy_system
        AND EXISTS (
          SELECT 1
            FROM core.taxonomy_node node
           WHERE node.taxonomy_node_id = membership.taxonomy_node_id
             AND node.code = 'UNCLASSIFIED'
        )
      RETURNING membership.entity_taxonomy_membership_id`,
    [
      supersededIds.map((candidate) => candidate.entityId),
      supersededIds.map((candidate) => candidate.taxonomySystem),
    ],
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
              'taxonomy_system', candidate.taxonomy_system,
              'policy', 'b3-v1',
              'source_revision_id', candidate.source_revision_id
            )
       FROM unnest($1::bigint[], $2::text[], $3::bigint[], $4::text[])
         AS candidate(entity_id, code, source_revision_id, taxonomy_system)
       JOIN core.taxonomy_release release
         ON release.taxonomy_system = candidate.taxonomy_system
        AND release.release_version = CASE candidate.taxonomy_system
              WHEN 'KSIC' THEN 'dart-company-profile-v1'
              ELSE 'sec-submissions-v1' END
       JOIN core.taxonomy_node node
         ON node.taxonomy_release_id = release.taxonomy_release_id
        AND node.code = candidate.code
     ON CONFLICT (entity_id, taxonomy_node_id) DO NOTHING
     RETURNING entity_taxonomy_membership_id`,
    [
      plan.toClassify.map((candidate) => candidate.entityId),
      plan.toClassify.map((candidate) => candidate.code),
      plan.toClassify.map((candidate) => candidate.sourceRevisionId),
      plan.toClassify.map((candidate) => candidate.taxonomySystem),
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
    nodesInserted,
    labelsFilled,
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
    const candidates = await loadClassificationCandidates(
      client as unknown as QueryClient,
      readRawObjectVerified,
    );
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
