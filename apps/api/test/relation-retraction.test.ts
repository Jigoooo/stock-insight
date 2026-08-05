import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonicalPairKey,
  planRetractions,
  retractionPayloadHash,
  type AcceptedIdentity,
  type MeasuredAbsence,
} from '../src/relations/relation-retraction.ts';

/**
 * The dangerous half of retraction is choosing the set. Removing an edge on the
 * strength of an absence would delete real relations whenever an input went
 * missing, so only a pair this run MEASURED and found below threshold may be
 * retracted.
 *
 * Context: beta adjustment cut MACRO_COMOVEMENT to 23 accepted candidates on
 * 2026-08-05 while snapshot 22 still carried 36 edges, because a builder that
 * stops producing a pair used to leave its last acceptance standing forever.
 */
const SERIES = 100;
const STOCK = 200;

function identity(overrides: Partial<AcceptedIdentity> = {}): AcceptedIdentity {
  return {
    relationIdentityId: 1,
    subjectEntityId: Math.min(SERIES, STOCK),
    objectEntityId: Math.max(SERIES, STOCK),
    relationKind: 'association',
    validFrom: '2026-07-31T00:00:00.000Z',
    predicateOntologyRevisionId: 7,
    ...overrides,
  };
}

function measured(overrides: Partial<MeasuredAbsence> = {}): MeasuredAbsence {
  return {
    subjectEntityId: SERIES,
    objectEntityId: STOCK,
    measuredValue: 0.11,
    ...overrides,
  };
}

describe('macro co-movement retraction set', () => {
  it('retracts an accepted edge the run measured and found below threshold', () => {
    const planned = planRetractions([identity()], [measured()]);

    assert.equal(planned.length, 1);
    assert.equal(planned[0]!.identity.relationIdentityId, 1);
    assert.equal(planned[0]!.measurement.measuredValue, 0.11);
  });

  it('leaves an accepted edge alone when the run did not measure that pair', () => {
    // The pair could be missing because the overlap was too short, because an
    // input never loaded, or because the degree cap dropped it. None of those
    // mean the relation stopped holding, and we have nothing to contradict it
    // with — so it stays.
    const planned = planRetractions([identity()], []);
    assert.deepEqual(planned, []);

    const otherPair = planRetractions([identity()], [measured({ objectEntityId: 999 })]);
    assert.deepEqual(otherPair, [], 'a measurement of a different pair must not retract this one');
  });

  it('matches the pair in either orientation, like the identity it has to find', () => {
    // The builder mints the identity in canonical id order, so the series can sit
    // on either side. Looking the pair up in one fixed order would silently
    // retract nothing for half the edges.
    assert.equal(canonicalPairKey(SERIES, STOCK), canonicalPairKey(STOCK, SERIES));

    const seriesIsSubject = planRetractions(
      [identity({ subjectEntityId: SERIES, objectEntityId: STOCK })],
      [measured()],
    );
    const stockIsSubject = planRetractions(
      [identity({ subjectEntityId: STOCK, objectEntityId: SERIES })],
      [measured()],
    );
    assert.equal(seriesIsSubject.length, 1);
    assert.equal(stockIsSubject.length, 1);
  });

  it('does not let two predicates share one retraction payload', () => {
    // The hash is what makes a re-run replay instead of appending. If it ignored
    // the predicate, retracting a MACRO_COMOVEMENT pair would look identical to
    // retracting the PRODUCT_SIMILARITY pair between the same two entities, and
    // the second retraction would silently replay the first.
    assert.notEqual(
      retractionPayloadHash('MACRO_COMOVEMENT', SERIES, STOCK),
      retractionPayloadHash('PRODUCT_SIMILARITY', SERIES, STOCK),
    );
  });

  it('keeps the retraction payload stable so a re-run replays instead of appending', () => {
    // The verdict "this pair no longer qualifies" does not change as the window
    // slides. If the hash moved with the measurement, every daily run would
    // append another revision that said nothing new.
    const first = retractionPayloadHash('MACRO_COMOVEMENT', SERIES, STOCK);
    const second = retractionPayloadHash('MACRO_COMOVEMENT', SERIES, STOCK);
    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.notEqual(
      first,
      retractionPayloadHash('MACRO_COMOVEMENT', SERIES, STOCK + 1),
      'a different pair must not share a retraction payload',
    );
  });

  it('retracts every measured-below-threshold edge, not just the first', () => {
    const identities = [
      identity({ relationIdentityId: 1, subjectEntityId: 100, objectEntityId: 200 }),
      identity({ relationIdentityId: 2, subjectEntityId: 100, objectEntityId: 300 }),
      identity({ relationIdentityId: 3, subjectEntityId: 100, objectEntityId: 400 }),
    ];
    // Only two of the three were measured this run.
    const planned = planRetractions(identities, [
      measured({ subjectEntityId: 100, objectEntityId: 200 }),
      measured({ subjectEntityId: 100, objectEntityId: 400 }),
    ]);

    assert.deepEqual(
      planned.map((entry) => entry.identity.relationIdentityId),
      [1, 3],
    );
  });
});
