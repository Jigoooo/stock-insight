import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMacroTopicCandidates,
  type MacroTopicObservation,
} from '../src/relations/builders/macro-topic.ts';

/**
 * MEASURED_BY ties a macro topic to the series that indicate it.
 *
 * It exists because knowledge.event.target_entity_id is a SINGLE value: an event
 * about rates cannot attach to DGS10, DGS2, FEDFUNDS and WALCL at once, and
 * run-event-text-attribution refuses to guess. Attaching to the topic removes
 * the ambiguity, and this edge is what carries it back down to the series.
 */
const TOPIC = 700;
const SERIES = 800;
const AS_OF = '2026-08-05T00:00:00.000Z';

function observation(overrides: Partial<MacroTopicObservation> = {}): MacroTopicObservation {
  return {
    topicEntityId: TOPIC,
    seriesEntityId: SERIES,
    topic: 'energy',
    seriesKey: 'fred:DCOILWTICO',
    sourceRevisionId: 5000,
    availableAt: '2026-08-04T00:00:00.000Z',
    validFrom: '2026-08-04T00:00:00.000Z',
    ...overrides,
  };
}

describe('macro topic builder', () => {
  it('emits a directional topic → series edge backed by a source revision', () => {
    const { candidates } = buildMacroTopicCandidates([observation()], { asOf: AS_OF });

    assert.equal(candidates.length, 1);
    const candidate = candidates[0]!;
    assert.equal(candidate.predicate, 'MEASURED_BY');
    // Subject is always the topic. Unlike MACRO_COMOVEMENT the endpoints are not
    // interchangeable — a series indicates a topic, never the reverse — so there
    // is no canonical id ordering to apply here.
    assert.equal(candidate.subjectEntityId, TOPIC);
    assert.equal(candidate.objectEntityId, SERIES);
    assert.equal(candidate.relationKind, 'structural');
    assert.equal(candidate.evidence.length, 1);
    // Evidence is a source revision — the only kind migration 024's guard opens
    // for this predicate. identity_mapping is ISSUED_BY-only, and claim/document
    // both need a VERIFIED claim, of which production has zero.
    assert.equal(candidate.evidence[0]!.sourceRevisionId, 5000);
    assert.equal(candidate.evidence[0]!.relationPayloadHash, candidate.payloadHash);
    assert.equal(
      candidate.targetRevisionStatus,
      'accepted',
      'one source revision satisfies minSourceRevisions: 1',
    );
  });

  it('says in metadata that it is a definition, not a measurement', () => {
    const { candidates } = buildMacroTopicCandidates([observation()], { asOf: AS_OF });

    // Nothing here was observed: no correlation, no window, no model. Reading
    // this edge as evidence that the series drives the topic would be exactly
    // the causal claim the naming avoids.
    assert.equal(candidates[0]!.metadata['interpretation'], 'curated_definition_not_measurement');
    assert.equal(candidates[0]!.metadata['builder'], 'macro-topic-v1');
    assert.ok(
      candidates[0]!.evidence.every((row) => Number.isSafeInteger(row.sourceRevisionId)),
      'every evidence row must point at a real source revision',
    );
  });

  it('will not back-date an edge from a revision that did not exist yet', () => {
    const { candidates } = buildMacroTopicCandidates(
      [observation({ availableAt: '2026-08-06T00:00:00.000Z' })],
      { asOf: AS_OF },
    );

    assert.deepEqual(candidates, [], 'a revision available after asOf is not visible to this run');
  });

  it('emits one edge per pair even when the mapping repeats', () => {
    // A duplicate would append a second revision of the same identity inside one
    // run, which reads as "the mapping changed" when it did not.
    const { candidates } = buildMacroTopicCandidates(
      [observation(), observation({ sourceRevisionId: 5001 })],
      { asOf: AS_OF },
    );

    assert.equal(candidates.length, 1);
  });

  it('refuses a topic that indicates itself', () => {
    assert.throws(
      () =>
        buildMacroTopicCandidates([observation({ seriesEntityId: TOPIC })], {
          asOf: AS_OF,
        }),
      /own indicator/,
    );
  });

  it('keeps several series under one topic and orders them deterministically', () => {
    // rates has four mapped series — the case that motivated the topic node.
    const { candidates } = buildMacroTopicCandidates(
      [
        observation({ seriesEntityId: 803, topic: 'rates', seriesKey: 'fred:WALCL' }),
        observation({ seriesEntityId: 801, topic: 'rates', seriesKey: 'fred:DGS10' }),
        observation({ seriesEntityId: 802, topic: 'rates', seriesKey: 'fred:DGS2' }),
      ],
      { asOf: AS_OF },
    );

    assert.deepEqual(
      candidates.map((row) => row.objectEntityId),
      [801, 802, 803],
    );
  });
});
