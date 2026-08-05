import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MacroComovementMeasuredAbsence } from '../src/relations/macro-comovement-model.ts';
import {
  canonicalPairKey,
  planMacroRetractions,
  retractionPayloadHash,
  type AcceptedMacroIdentity,
} from '../src/relations/macro-comovement-retraction.ts';

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

function identity(overrides: Partial<AcceptedMacroIdentity> = {}): AcceptedMacroIdentity {
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

function measured(
  overrides: Partial<MacroComovementMeasuredAbsence> = {},
): MacroComovementMeasuredAbsence {
  return {
    seriesEntityId: SERIES,
    stockEntityId: STOCK,
    correlation: 0.11,
    overlappingObservations: 247,
    lastObservedDate: '2026-08-04',
    ...overrides,
  };
}

describe('macro co-movement retraction set', () => {
  it('retracts an accepted edge the run measured and found below threshold', () => {
    const planned = planMacroRetractions([identity()], [measured()]);

    assert.equal(planned.length, 1);
    assert.equal(planned[0]!.identity.relationIdentityId, 1);
    assert.equal(planned[0]!.measurement.correlation, 0.11);
  });

  it('leaves an accepted edge alone when the run did not measure that pair', () => {
    // The pair could be missing because the overlap was too short, because an
    // input never loaded, or because the degree cap dropped it. None of those
    // mean the relation stopped holding, and we have nothing to contradict it
    // with — so it stays.
    const planned = planMacroRetractions([identity()], []);
    assert.deepEqual(planned, []);

    const otherPair = planMacroRetractions([identity()], [measured({ stockEntityId: 999 })]);
    assert.deepEqual(otherPair, [], 'a measurement of a different pair must not retract this one');
  });

  it('matches the pair in either orientation, like the identity it has to find', () => {
    // The builder mints the identity in canonical id order, so the series can sit
    // on either side. Looking the pair up in one fixed order would silently
    // retract nothing for half the edges.
    assert.equal(canonicalPairKey(SERIES, STOCK), canonicalPairKey(STOCK, SERIES));

    const seriesIsSubject = planMacroRetractions(
      [identity({ subjectEntityId: SERIES, objectEntityId: STOCK })],
      [measured()],
    );
    const stockIsSubject = planMacroRetractions(
      [identity({ subjectEntityId: STOCK, objectEntityId: SERIES })],
      [measured()],
    );
    assert.equal(seriesIsSubject.length, 1);
    assert.equal(stockIsSubject.length, 1);
  });

  it('keeps the retraction payload stable so a re-run replays instead of appending', () => {
    // The verdict "this pair no longer qualifies" does not change as the window
    // slides. If the hash moved with the measurement, every daily run would
    // append another revision that said nothing new.
    const first = retractionPayloadHash(SERIES, STOCK);
    const second = retractionPayloadHash(SERIES, STOCK);
    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.notEqual(
      first,
      retractionPayloadHash(SERIES, STOCK + 1),
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
    const planned = planMacroRetractions(identities, [
      measured({ seriesEntityId: 100, stockEntityId: 200 }),
      measured({ seriesEntityId: 100, stockEntityId: 400 }),
    ]);

    assert.deepEqual(
      planned.map((entry) => entry.identity.relationIdentityId),
      [1, 3],
    );
  });
});
