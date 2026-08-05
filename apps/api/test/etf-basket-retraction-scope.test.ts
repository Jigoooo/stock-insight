import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildEtfBasketCandidates } from '../src/relations/builders/etf-overlap.ts';
import {
  isWithinEnumerationScope,
  planRetractionsNotInFromDatabase,
  retractEdgesNotIn,
} from '../src/relations/relation-retraction.ts';

/**
 * C — SAME_ETF_BASKET retraction, and the guard that makes it safe.
 *
 * Co-membership is a fact, not a score, so there is no "below threshold" verdict:
 * the only evidence of absence is that an evaluated basket stopped listing both
 * names. The danger is that the same observation — "this pair is not in today's
 * candidate set" — is also what a collection outage looks like, and what the
 * degree cap looks like.
 *
 * This is the PRODUCT_SIMILARITY mistake with a bigger blast radius. There,
 * subtracting candidates from accepted predicted 633 retractions and the truth was
 * 8, because 625 were degree-cap drops. Here an uncollected ETF would take out
 * every pair it contributed.
 */

const ASOF = '2026-08-06T00:00:00.000Z';

const observation = (etfEntityId: number, memberEntityId: number) => ({
  etfEntityId,
  memberEntityId,
  sourceRevisionId: 1,
  availableAt: '2026-08-05T00:00:00.000Z',
  validFrom: '2026-08-05T00:00:00.000Z',
});

describe('the builder reports which baskets it evaluated', () => {
  it('counts a basket only after both gates', () => {
    const result = buildEtfBasketCandidates(
      [
        // Evaluated: two members, well under the cap of 100.
        observation(10, 1),
        observation(10, 2),
        // Read but not evaluated: a single member has no pair to measure.
        observation(11, 3),
      ],
      { asOf: ASOF },
    );

    assert.deepEqual(result.evaluatedHubEntityIds, [10]);
    assert.equal(result.candidates.length, 1);
  });

  it('excludes a cap-suppressed basket — read is not evaluated', () => {
    // 101 members exceeds SAME_ETF_BASKET's cap of 100, so every pair in it is
    // suppressed. Reporting it as evaluated would let the cap retract real edges.
    const wide = Array.from({ length: 101 }, (_, index) => observation(20, 1000 + index));
    const result = buildEtfBasketCandidates([...wide, observation(21, 1), observation(21, 2)], {
      asOf: ASOF,
    });

    assert.equal(result.exclusions.length, 1);
    assert.equal(result.exclusions[0]?.hubEntityId, 20);
    assert.deepEqual(result.evaluatedHubEntityIds, [21]);
  });
});

describe('scope decides whether an absence is a verdict', () => {
  const scope = { metadataKey: 'etfEntityIds', evaluatedValues: [10, 11] };

  it('admits an edge only when every contributing basket was evaluated', () => {
    assert.equal(isWithinEnumerationScope({ etfEntityIds: [10] }, scope), true);
    assert.equal(isWithinEnumerationScope({ etfEntityIds: [10, 11] }, scope), true);
    // 12 was not evaluated, so this pair's absence is not measured — even though
    // basket 10 was read and no longer lists the pair. One unread source is enough
    // to make the whole edge unknown.
    assert.equal(isWithinEnumerationScope({ etfEntityIds: [10, 12] }, scope), false);
  });

  it('treats missing provenance as out of scope, not as measured', () => {
    // Fail-closed: an edge that cannot name its sources cannot prove they were
    // evaluated. The opposite default would retract every edge predating the
    // metadata.
    assert.equal(isWithinEnumerationScope({}, scope), false);
    assert.equal(isWithinEnumerationScope({ etfEntityIds: [] }, scope), false);
    assert.equal(isWithinEnumerationScope(null, scope), false);
    assert.equal(isWithinEnumerationScope({ etfEntityIds: 'ten' }, scope), false);
  });

  it('is a no-op when no scope is given, so globally complete predicates are unaffected', () => {
    // MEASURED_BY passes no scope: one mapping table is its whole world.
    assert.equal(isWithinEnumerationScope({}, undefined), true);
    assert.equal(isWithinEnumerationScope(null, undefined), true);
  });
});

describe('the guard survives a basket going missing', () => {
  // Three accepted edges. A|B came from basket 10 alone, C|D from basket 12 alone,
  // and E|F from both. Today only basket 10 was evaluated, and it lists nothing.
  const accepted = [
    { subject: 1, object: 2, etfEntityIds: [10] },
    { subject: 3, object: 4, etfEntityIds: [12] },
    { subject: 5, object: 6, etfEntityIds: [10, 12] },
  ];
  const client = {
    query: <T>(_sql: string, _params: readonly unknown[]): Promise<{ rows: T[] }> =>
      Promise.resolve({
        rows: accepted.map((row, index) => ({
          relation_identity_id: index + 1,
          subject_entity_id: row.subject,
          object_entity_id: row.object,
          relation_kind: 'statistical',
          valid_from: '2026-08-05T00:00:00.000Z',
          predicate_ontology_revision_id: 7,
          metadata: { builder: 'etf-overlap-v1', etfEntityIds: row.etfEntityIds },
        })) as unknown as T[],
      }),
  };

  it('retracts only the pair whose every basket was evaluated', async () => {
    const plan = await planRetractionsNotInFromDatabase(client, 'SAME_ETF_BASKET', {
      // One unrelated pair holds, so the empty-set refusal does not fire.
      holdingPairs: [{ subjectEntityId: 7, objectEntityId: 8 }],
      sourceWasRead: true,
      scope: { metadataKey: 'etfEntityIds', evaluatedValues: [10] },
    });

    assert.equal(plan.inspected, 3);
    // Only 1|2 — basket 10 was evaluated and dropped it.
    assert.equal(plan.wouldRetract, 1);
    // 3|4 and 5|6 both depend on basket 12, which was never collected today.
    assert.equal(plan.outOfScope, 2);
  });

  it('retracts nothing at all when no basket was evaluated', async () => {
    // A total collection failure. Subtraction would call this "every pair is gone".
    const plan = await planRetractionsNotInFromDatabase(client, 'SAME_ETF_BASKET', {
      holdingPairs: [{ subjectEntityId: 7, objectEntityId: 8 }],
      sourceWasRead: false,
      scope: { metadataKey: 'etfEntityIds', evaluatedValues: [] },
    });

    assert.equal(plan.wouldRetract, 0);
    assert.equal(plan.outOfScope, 0);
  });

  it('refuses to apply when the run claims a read but evaluated no basket', async () => {
    // The contradictory state: "I read the source" plus "I evaluated nothing".
    // Silently retracting nothing would hide the contradiction; this is a caller
    // bug and it should say so.
    await assert.rejects(
      () =>
        retractEdgesNotIn(client as never, 'SAME_ETF_BASKET', 'etf-basket-co-membership-absent', {
          holdingPairs: [{ subjectEntityId: 7, objectEntityId: 8 }],
          sourceWasRead: true,
          scope: { metadataKey: 'etfEntityIds', evaluatedValues: [] },
        }),
      /evaluated scope is empty/,
    );
  });
});
