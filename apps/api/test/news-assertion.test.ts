import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAssertions,
  findAssertionViolations,
  modalityForClaimType,
  type ChunkProvenance,
  type ClaimReading,
} from '../src/backfill/claim-assertion.ts';
import {
  buildChunkLineage,
  reconstructChunkText,
  type BundleItem,
  type ChunkReading,
} from '../src/backfill/news-chunk-lineage.ts';

const URL = 'https://www.mk.co.kr/news/economy/12121727';

function item(overrides: Partial<BundleItem> = {}): BundleItem {
  return {
    sourceRevisionId: 5001,
    url: URL,
    title: '“진단비 15만원 지급”…폭염으로 피해 봤다면 보험이 보장한다는데',
    summary: '경기도, 온열질환 등 진단비 지급 위험 대비로 지수형 보험도 관심↑',
    availableAt: '2026-08-07T10:00:00.000Z',
    ingestedAt: '2026-08-07T10:05:00.000Z',
    ...overrides,
  };
}

function chunk(overrides: Partial<ChunkReading> = {}): ChunkReading {
  const source = item();
  return {
    chunkId: 900,
    documentId: 700,
    canonicalUrl: URL,
    content: `${source.title} ${source.summary}`,
    ...overrides,
  };
}

const byUrl = (bundleItem: BundleItem) => new Map([[bundleItem.url, bundleItem]]);

describe('the bridge the K2 survey missed', () => {
  it('links a chunk whose text the retained bytes reproduce', () => {
    // The survey tested content_hash and provider_record_key, found nothing, and
    // concluded no bridge existed. Both stacks carry the article URL.
    const { lineage } = buildChunkLineage([chunk()], byUrl(item()));
    assert.equal(lineage.length, 1);
    assert.equal(lineage[0].sourceRevisionId, 5001);
    assert.equal(lineage[0].evidence.matchedBy, 'canonical_url');
    assert.equal(lineage[0].evidence.reconstructedFrom, 'title+summary');
  });

  it('tolerates the whitespace the chunk assembly collapsed', () => {
    const { lineage } = buildChunkLineage(
      [chunk({ content: `  ${item().title}\n\n${item().summary}  ` })],
      byUrl(item()),
    );
    assert.equal(lineage.length, 1);
  });

  it('refuses a later capture of the same article', () => {
    // Measured on live: "18 tech stocks that have fallen at least 30%" against
    // "19 (mostly) tech stocks that have fallen at least 25%" — same URL, edited
    // headline. Linking it would promise REQ-EVD-004 re-derivability that fails.
    const { lineage, skips } = buildChunkLineage(
      [chunk({ content: '19 (mostly) tech stocks that have fallen at least 25% in July' })],
      byUrl(item({ title: '18 tech stocks that have fallen at least 30% during July' })),
    );
    assert.equal(lineage.length, 0);
    assert.match(skips[0].reason, /later capture of the same url/);
  });

  it('refuses a document with no url and one with no retained bundle', () => {
    const noUrl = buildChunkLineage([chunk({ canonicalUrl: null })], byUrl(item()));
    assert.match(noUrl.skips[0].reason, /no canonical url/);

    const noBundle = buildChunkLineage([chunk()], new Map());
    assert.match(noBundle.skips[0].reason, /no retained bundle item/);
  });

  it('carries a hash so the bridge can be rechecked rather than trusted', () => {
    const { lineage } = buildChunkLineage([chunk()], byUrl(item()));
    assert.match(lineage[0].evidence.reconstructionHash, /^[0-9a-f]{64}$/);
    assert.equal(lineage[0].evidence.bundleUrl, URL);
  });

  it('reconstructs from title and summary in that order', () => {
    assert.equal(reconstructChunkText(item()), `${item().title} ${item().summary}`);
  });
});

describe('claim type to modality — four fit, two do not', () => {
  it('maps the four the freeze has words for', () => {
    assert.equal(modalityForClaimType('asserted_fact'), 'factual');
    assert.equal(modalityForClaimType('forecast'), 'forecast');
    assert.equal(modalityForClaimType('guidance'), 'forecast');
    assert.equal(modalityForClaimType('rumor'), 'alleged');
  });

  it('refuses opinion and reported_claim rather than picking the nearest word', () => {
    // A wrong modality reads as the source's own stance, and nothing downstream
    // can tell it was a mapping default.
    assert.equal(modalityForClaimType('opinion'), null);
    assert.equal(modalityForClaimType('reported_claim'), null);
  });
});

const PROVENANCE: ChunkProvenance = {
  chunkId: 900,
  sourceRevisionId: 5001,
  availableAt: '2026-08-07T10:00:00.000Z',
  ingestedAt: '2026-08-07T10:05:00.000Z',
  bundleUrl: URL,
};

function claim(overrides: Partial<ClaimReading> = {}): ClaimReading {
  return {
    claimId: 42,
    chunkId: 900,
    subjectEntityId: 259,
    predicate: 'ANNOUNCED',
    objectEntityId: null,
    objectValue: 'a heat insurance programme',
    claimType: 'asserted_fact',
    polarity: 1,
    verificationStatus: 'corroborated',
    validFrom: null,
    validTo: null,
    publishedAt: '2026-08-07T09:00:00.000Z',
    extractionRunId: 'run-1',
    predicateOntologyRevisionId: null,
    ...overrides,
  };
}

const provenanceMap = new Map([[900, PROVENANCE]]);

describe('an assertion stands on retained bytes', () => {
  it('places the claim on the source revision its evidence reproduces from', () => {
    const { rows } = buildAssertions([claim()], provenanceMap);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sourceRevisionId, 5001);
    assert.equal(rows[0].assertionKey, 'claim:42');
  });

  it('locates the span rather than pointing at the whole source', () => {
    // REQ-EVD-004 asks for the bytes, so the locator has to say where in them.
    const { rows } = buildAssertions([claim()], provenanceMap);
    assert.deepEqual(rows[0].sourceSpanLocator, {
      bundleUrl: URL,
      field: 'title+summary',
      documentChunkId: 900,
    });
  });

  it('calls the scope a summary, because that is what we retained', () => {
    // The bundle holds an RSS title and summary, not the article body. 'direct'
    // would promise a quotation we do not have.
    assert.equal(buildAssertions([claim()], provenanceMap).rows[0].quotationScope, 'summary');
  });

  it('starts at extracted rather than inheriting the claim status', () => {
    // The assertion states describe span and semantics checks this job did not
    // run. 'corroborated' upstream is recorded in metadata instead.
    const { rows } = buildAssertions([claim()], provenanceMap);
    assert.equal(rows[0].verificationState, 'extracted');
    assert.equal(rows[0].metadata.upstreamVerificationStatus, 'corroborated');
  });

  it('skips a claim whose evidence has no retained source revision', () => {
    const { rows, skips } = buildAssertions([claim()], new Map());
    assert.equal(rows.length, 0);
    assert.match(skips[0].reason, /no retained source revision/);
  });

  it('skips a claim type the freeze has no modality for', () => {
    const { rows, skips } = buildAssertions([claim({ claimType: 'opinion' })], provenanceMap);
    assert.equal(rows.length, 0);
    assert.match(skips[0].reason, /no modality/);
  });

  it('skips a claim that names both an object entity and a literal', () => {
    const { rows, skips } = buildAssertions(
      [claim({ objectEntityId: 7, objectValue: 'also this' })],
      provenanceMap,
    );
    assert.equal(rows.length, 0);
    assert.match(skips[0].reason, /neither .* nor a literal, or names both/);
  });

  it('skips a claim with no extraction run to attribute it to', () => {
    const { rows, skips } = buildAssertions([claim({ extractionRunId: null })], provenanceMap);
    assert.equal(rows.length, 0);
    assert.match(skips[0].reason, /no extraction run/);
  });

  it('never reports knowing an assertion before it was available', () => {
    const { rows } = buildAssertions([claim()], provenanceMap);
    assert.ok(rows[0].knownAt >= rows[0].availableAt);
  });

  it('leaves the ontology revision null when the predicate has no approved one', () => {
    // 11 of the 12 predicates in use have none. Pointing at an unapproved
    // revision would claim an ontology decision nobody made.
    assert.equal(
      buildAssertions([claim()], provenanceMap).rows[0].predicateOntologyRevisionId,
      null,
    );
  });
});

describe('assertion violations are counted before a transaction opens', () => {
  it('passes a well formed assertion', () => {
    assert.deepEqual(findAssertionViolations(buildAssertions([claim()], provenanceMap).rows), []);
  });

  it('catches an object that is both an entity and a literal', () => {
    const [row] = buildAssertions([claim()], provenanceMap).rows;
    const rules = findAssertionViolations([{ ...row, objectEntityId: 7 }]).map((v) => v.rule);
    assert.ok(rules.includes('must name exactly one of object entity or literal'));
  });

  it('catches a modality outside the enum', () => {
    const [row] = buildAssertions([claim()], provenanceMap).rows;
    const rules = findAssertionViolations([{ ...row, modality: 'probably' }]).map((v) => v.rule);
    assert.ok(rules.includes('modality outside the enum'));
  });
});
