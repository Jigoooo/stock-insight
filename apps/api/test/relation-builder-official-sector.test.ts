import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildOfficialSectorCandidates,
  type OfficialSectorObservation,
} from '../src/relations/builders/official-sector.ts';

const baseObservation: OfficialSectorObservation = {
  subjectEntityId: 101,
  taxonomyEntityId: 501,
  taxonomySystem: 'SIC',
  taxonomyCode: '3674',
  classificationStatus: 'source_reported',
  sourceRevisionId: 9001,
  availableAt: '2026-07-01T00:00:00.000Z',
  validFrom: '2026-07-01T00:00:00.000Z',
};

const AS_OF = '2026-07-19T00:00:00.000Z';

describe('B6 official sector builder (tracer bullet)', () => {
  it('emits a CLASSIFIED_AS candidate bound to the exact immutable source revision', () => {
    const candidates = buildOfficialSectorCandidates([baseObservation], { asOf: AS_OF });
    assert.equal(candidates.length, 1);
    const candidate = candidates[0]!;
    assert.equal(candidate.predicate, 'CLASSIFIED_AS');
    assert.equal(candidate.subjectEntityId, 101);
    assert.equal(candidate.objectEntityId, 501);
    assert.match(candidate.payloadHash, /^[a-f0-9]{64}$/);
    assert.equal(candidate.evidence.length, 1);
    assert.equal(candidate.evidence[0]!.sourceRevisionId, 9001);
    assert.equal(candidate.evidence[0]!.relationPayloadHash, candidate.payloadHash);
    assert.match(candidate.evidence[0]!.evidenceHash, /^[a-f0-9]{64}$/);
    assert.match(candidate.evidence[0]!.evidenceText, /SIC/);
    assert.match(candidate.evidence[0]!.evidenceText, /3674/);
  });

  it('is deterministic: identical input produces identical payload and evidence hashes', () => {
    const [first] = buildOfficialSectorCandidates([baseObservation], { asOf: AS_OF });
    const [second] = buildOfficialSectorCandidates([{ ...baseObservation }], { asOf: AS_OF });
    assert.equal(first!.payloadHash, second!.payloadHash);
    assert.equal(first!.evidence[0]!.evidenceHash, second!.evidence[0]!.evidenceHash);
    const [changed] = buildOfficialSectorCandidates(
      [{ ...baseObservation, taxonomyCode: '3675' }],
      { asOf: AS_OF },
    );
    assert.notEqual(changed!.payloadHash, first!.payloadHash);
  });

  it('excludes observations whose source revision is not yet available at asOf (PIT timing)', () => {
    const future = { ...baseObservation, availableAt: '2026-08-01T00:00:00.000Z' };
    const candidates = buildOfficialSectorCandidates([future], { asOf: AS_OF });
    assert.equal(candidates.length, 0);
  });

  it('keeps unclassified entities as unknown — no relation candidate, no closed-world absence', () => {
    const unclassified = {
      ...baseObservation,
      classificationStatus: 'unclassified' as const,
    };
    const candidates = buildOfficialSectorCandidates([unclassified], { asOf: AS_OF });
    assert.equal(candidates.length, 0);
  });

  it('rejects non-approved taxonomy systems (GICS must not become canonical)', () => {
    assert.throws(
      () =>
        buildOfficialSectorCandidates([{ ...baseObservation, taxonomySystem: 'GICS' as never }], {
          asOf: AS_OF,
        }),
      /taxonomy system/i,
    );
  });

  it('deduplicates identical observations and counts DISTINCT source revisions once', () => {
    const candidates = buildOfficialSectorCandidates(
      [baseObservation, { ...baseObservation }, { ...baseObservation, sourceRevisionId: 9002 }],
      { asOf: AS_OF },
    );
    assert.equal(candidates.length, 1);
    const candidate = candidates[0]!;
    assert.equal(candidate.evidence.length, 2);
    assert.deepEqual(candidate.evidence.map((row) => row.sourceRevisionId).sort(), [9001, 9002]);
  });

  it('routes every candidate through the relation policy gate', () => {
    const [candidate] = buildOfficialSectorCandidates([baseObservation], { asOf: AS_OF });
    // CLASSIFIED_AS policy: minSourceRevisions=1 → single revision accepted.
    assert.equal(candidate!.policyDecision.decision, 'accepted');
    assert.deepEqual(candidate!.policyDecision.reasons, []);
  });

  it('never emits a candidate for a different predicate than CLASSIFIED_AS', () => {
    const candidates = buildOfficialSectorCandidates(
      [baseObservation, { ...baseObservation, subjectEntityId: 102, sourceRevisionId: 9100 }],
      { asOf: AS_OF },
    );
    assert.ok(candidates.every((row) => row.predicate === 'CLASSIFIED_AS'));
    assert.equal(candidates.length, 2);
  });
});
