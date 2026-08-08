/**
 * Turns a claim into the assertion canonical/02 calls the minimal unit a source
 * stated, now that news chunks can name the source revision they came from.
 *
 * An assertion is not a claim renamed. `knowledge.claim` is what the extraction
 * pipeline produced; `knowledge.assertion` is that same statement placed on a
 * retained source revision with a span locator, so REQ-EVD-004 can be answered —
 * "show me the bytes this came from" — rather than asserted.
 */

export type ClaimReading = {
  claimId: number;
  chunkId: number;
  subjectEntityId: number;
  predicate: string;
  objectEntityId: number | null;
  objectValue: string | null;
  claimType: string;
  polarity: number;
  verificationStatus: string;
  validFrom: string | null;
  validTo: string | null;
  publishedAt: string | null;
  extractionRunId: string | null;
  predicateOntologyRevisionId: number | null;
};

export type ChunkProvenance = {
  chunkId: number;
  sourceRevisionId: number;
  availableAt: string;
  ingestedAt: string;
  bundleUrl: string;
};

export type AssertionRow = {
  assertionKey: string;
  sourceRevisionId: number;
  subjectEntityId: number;
  predicateKey: string;
  predicateOntologyRevisionId: number | null;
  objectEntityId: number | null;
  literalValue: string | null;
  polarity: 'affirmed' | 'negated';
  modality: string;
  quotationScope: string;
  validTimeStart: string | null;
  validTimeEnd: string | null;
  publishedAt: string | null;
  availableAt: string;
  knownAt: string;
  sourceSpanLocator: Record<string, unknown>;
  parserVersion: string;
  extractionRunId: string;
  verificationState: string;
  metadata: Record<string, unknown>;
};

export type AssertionSkip = { reason: string; count: number };

export const CLAIM_ASSERTION_PARSER_VERSION = 'claim-assertion/1';

/**
 * How the source presented the proposition, in the five words the table accepts:
 * factual, planned, possible, alleged, forecast.
 *
 * Four claim types land cleanly. Two do not, and are refused rather than pushed
 * into the nearest word:
 *
 *   opinion (45)         A stated view is not a claim about how likely something
 *                        is, so 'possible' would misdescribe it, and none of the
 *                        other four is closer. Under canonical/00 §4 an opinion
 *                        reads as NARRATIVE rather than as an assertion of fact,
 *                        which is a different object than this table holds.
 *
 *   reported_claim (40)  Modality is about the proposition; who reported it is
 *                        what attribution_entity_id is for. A correctly reported
 *                        fact and an unfounded report share this claim type, so
 *                        one modality would mislabel one of them. The claim
 *                        carries nothing that separates them.
 *
 * Refusing 85 of 374 is the point rather than a shortfall: a wrong modality is
 * read as the source's own stance, and nothing downstream can tell it was a
 * mapping default.
 */
const MODALITY_BY_CLAIM_TYPE: Record<string, string> = {
  asserted_fact: 'factual',
  forecast: 'forecast',
  // A company's guidance is its own forecast of its own results.
  guidance: 'forecast',
  // A rumour is a claim circulated without establishment, which is what
  // 'alleged' names.
  rumor: 'alleged',
};

export function modalityForClaimType(claimType: string): string | null {
  return MODALITY_BY_CLAIM_TYPE[claimType] ?? null;
}

export function buildAssertions(
  claims: readonly ClaimReading[],
  provenanceByChunk: ReadonlyMap<number, ChunkProvenance>,
): { rows: AssertionRow[]; skips: AssertionSkip[] } {
  const rows: AssertionRow[] = [];
  const counts = new Map<string, number>();
  const bump = (reason: string): void => {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  };

  for (const claim of claims) {
    const provenance = provenanceByChunk.get(claim.chunkId);
    if (!provenance) {
      bump('evidence chunk has no retained source revision');
      continue;
    }

    const modality = modalityForClaimType(claim.claimType);
    if (modality === null) {
      bump(`claim type '${claim.claimType}' has no modality in the freeze's five`);
      continue;
    }

    // The table allows exactly one of the two, and a claim carrying both or
    // neither is a claim we cannot place without choosing for it.
    const objectCount =
      (claim.objectEntityId === null ? 0 : 1) + (claim.objectValue === null ? 0 : 1);
    if (objectCount !== 1) {
      bump('claim names neither an object entity nor a literal, or names both');
      continue;
    }

    if (claim.polarity !== 1 && claim.polarity !== -1) {
      bump(`unrecognised polarity ${claim.polarity}`);
      continue;
    }

    if (!claim.extractionRunId) {
      // extraction_run_id is NOT NULL, and inventing one would erase the link
      // back to the run that produced the claim.
      bump('claim has no extraction run to attribute the assertion to');
      continue;
    }

    rows.push({
      assertionKey: `claim:${claim.claimId}`,
      sourceRevisionId: provenance.sourceRevisionId,
      subjectEntityId: claim.subjectEntityId,
      predicateKey: claim.predicate,
      // Null where the predicate has no approved ontology revision — measured
      // 2026-08-08, that is 11 of the 12 predicates in use. Pointing at an
      // unapproved revision would claim an ontology decision nobody made.
      predicateOntologyRevisionId: claim.predicateOntologyRevisionId,
      objectEntityId: claim.objectEntityId,
      literalValue: claim.objectValue,
      polarity: claim.polarity === 1 ? 'affirmed' : 'negated',
      modality,
      // The retained bytes are an RSS title and summary, not the article body, so
      // the assertion rests on a summary of what the source said rather than on
      // its words. Calling it 'direct' would promise a quotation we do not hold.
      quotationScope: 'summary',
      validTimeStart: claim.validFrom,
      validTimeEnd: claim.validTo,
      publishedAt: claim.publishedAt,
      availableAt: provenance.availableAt,
      // known_at >= available_at is a table CHECK. The ingestion moment is the
      // later of the two by construction, but clamping keeps a clock skew in the
      // collector from failing an entire batch.
      knownAt:
        provenance.ingestedAt >= provenance.availableAt
          ? provenance.ingestedAt
          : provenance.availableAt,
      sourceSpanLocator: {
        bundleUrl: provenance.bundleUrl,
        field: 'title+summary',
        documentChunkId: claim.chunkId,
      },
      parserVersion: CLAIM_ASSERTION_PARSER_VERSION,
      extractionRunId: claim.extractionRunId,
      // Not 'accepted', and not a translation of the claim's own status. The
      // assertion pipeline's states describe checks it performs — span and
      // semantics — and none of them has run here. 'extracted' is what this is.
      verificationState: 'extracted',
      metadata: {
        fromClaimId: claim.claimId,
        claimType: claim.claimType,
        upstreamVerificationStatus: claim.verificationStatus,
      },
    });
  }

  return {
    rows,
    skips: [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count),
  };
}

/** The table's CHECKs, applied before a transaction opens. */
export function findAssertionViolations(
  rows: readonly AssertionRow[],
): { rule: string; count: number; example: string }[] {
  const found = new Map<string, { count: number; example: string }>();
  const record = (rule: string, example: string): void => {
    const entry = found.get(rule);
    if (entry) entry.count += 1;
    else found.set(rule, { count: 1, example });
  };

  const MODALITIES = new Set(['factual', 'planned', 'possible', 'alleged', 'forecast']);
  const SCOPES = new Set(['direct', 'indirect', 'summary', 'table_cell', 'xbrl_fact']);

  for (const row of rows) {
    const at = row.assertionKey;
    if (row.assertionKey.trim() === '') record('assertion_key blank', at);
    if (row.predicateKey.trim() === '') record('predicate_key blank', at);
    if (row.parserVersion.trim() === '') record('parser_version blank', at);
    if (row.extractionRunId.trim() === '') record('extraction_run_id blank', at);
    if (!MODALITIES.has(row.modality)) record('modality outside the enum', at);
    if (!SCOPES.has(row.quotationScope)) record('quotation_scope outside the enum', at);
    if ((row.objectEntityId === null) === (row.literalValue === null)) {
      record('must name exactly one of object entity or literal', at);
    }
    if (row.knownAt < row.availableAt) record('known_at before available_at', at);
    if (
      row.validTimeStart !== null &&
      row.validTimeEnd !== null &&
      row.validTimeEnd <= row.validTimeStart
    ) {
      record('valid interval ends before it starts', at);
    }
  }

  return [...found.entries()].map(([rule, entry]) => ({ rule, ...entry }));
}
