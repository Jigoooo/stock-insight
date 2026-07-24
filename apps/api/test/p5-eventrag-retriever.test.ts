import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { retrieveEventCandidates } from '../src/experimental/eventrag-retriever.ts';

const input = {
  graphSnapshotId: 42,
  cutoff: '2026-07-23T00:00:00.000Z',
  seedEntityIds: [1],
  events: [
    {
      eventRevisionId: 101,
      knownAt: '2026-07-22T00:00:00.000Z',
      participantEntityIds: [1, 2],
    },
    {
      eventRevisionId: 102,
      knownAt: '2026-07-22T01:00:00.000Z',
      participantEntityIds: [3],
    },
    {
      eventRevisionId: 103,
      knownAt: '2026-07-22T02:00:00.000Z',
      participantEntityIds: [4],
    },
  ],
  entityEdges: [
    {
      relationRevisionId: 501,
      subjectEntityId: 2,
      objectEntityId: 3,
      confidence: 0.8,
      knownAt: '2026-07-22T00:00:00.000Z',
    },
  ],
  eventEdges: [
    {
      sourceEventRevisionId: 102,
      targetEventRevisionId: 103,
      relation: 'candidate_influence' as const,
      confidence: 0.5,
      knownAt: '2026-07-22T02:00:00.000Z',
    },
  ],
  maxCandidates: 10,
};

describe('P5-1 EventRAG entity-event dual graph retrieval', () => {
  it('ranks direct, entity-linked, and event-linked candidates with bounded lineage', () => {
    const result = retrieveEventCandidates(input);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.deepEqual(
      result.candidates.map(({ eventRevisionId }) => eventRevisionId),
      [101, 102, 103],
    );
    assert.ok(result.candidates.every(({ score }) => score > 0 && score <= 1));
    assert.deepEqual(
      result.candidates.map(({ rank }) => rank),
      [1, 2, 3],
    );
    assert.equal(result.candidateOnly, true);
    assert.equal(result.acceptedFactAllowed, false);
    assert.equal(result.orderExecutable, false);
    assert.ok(result.candidates[1]?.path.some(({ kind }) => kind === 'entity_relation'));
    assert.ok(result.candidates[2]?.path.some(({ kind }) => kind === 'event_relation'));
  });

  it('is input-order independent and excludes post-cutoff knowledge', () => {
    const forward = retrieveEventCandidates(input);
    const reverse = retrieveEventCandidates({
      ...input,
      events: [...input.events].reverse(),
      entityEdges: [...input.entityEdges].reverse(),
      eventEdges: [...input.eventEdges].reverse(),
    });
    assert.deepEqual(reverse, forward);

    const result = retrieveEventCandidates({
      ...input,
      events: [
        ...input.events,
        {
          eventRevisionId: 999,
          knownAt: '2026-07-24T00:00:00.000Z',
          participantEntityIds: [1],
        },
      ],
    });
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') {
      assert.doesNotMatch(JSON.stringify(result), /999/);
    }
  });

  it('fails closed on malformed probabilities, duplicate identities, or unbounded requests', () => {
    for (const malformed of [
      { ...input, maxCandidates: 1001 },
      { ...input, entityEdges: [{ ...input.entityEdges[0]!, confidence: Number.NaN }] },
      { ...input, events: [input.events[0]!, input.events[0]!] },
    ]) {
      assert.deepEqual(retrieveEventCandidates(malformed), {
        status: 'abstained',
        reason: 'INVALID_EVENTRAG_INPUT',
        candidateOnly: true,
        acceptedFactAllowed: false,
        orderExecutable: false,
      });
    }
  });
});
