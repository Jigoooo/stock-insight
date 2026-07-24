import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileFacilityCandidates } from '../src/experimental/remote-sensing-candidate.ts';

const base = {
  imagery: {
    providerId: 'provider-1',
    sceneId: 'scene-20260720-a',
    capturedAt: '2026-07-20T00:00:00.000Z',
    knownAt: '2026-07-21T00:00:00.000Z',
    crs: 'EPSG:4326',
    cloudCover: 0.05,
    groundSampleDistanceMeters: 10,
    rawArtifactDigest: 'a'.repeat(64),
    license: {
      status: 'approved_research',
      retentionAllowed: true,
      redistributionAllowed: false,
    },
  },
  model: {
    modelVersion: 'facility-detector-v1',
    modelArtifactDigest: 'b'.repeat(64),
    trainedCutoff: '2026-07-19T00:00:00.000Z',
  },
  policy: {
    minimumConfidence: 0.7,
    maximumCloudCover: 0.2,
    maximumGroundSampleDistanceMeters: 30,
    maximumCandidates: 100,
  },
  detections: [
    {
      detectionKey: 'detection-a',
      facilityKind: 'factory',
      longitude: 127.1,
      latitude: 37.4,
      areaSquareMeters: 10_000,
      confidence: 0.9,
    },
    {
      detectionKey: 'detection-b',
      facilityKind: 'warehouse',
      longitude: 127.2,
      latitude: 37.5,
      areaSquareMeters: 5_000,
      confidence: 0.8,
    },
    {
      detectionKey: 'low-confidence',
      facilityKind: 'factory',
      longitude: 127.3,
      latitude: 37.6,
      areaSquareMeters: 3_000,
      confidence: 0.2,
    },
  ],
};

describe('P5-7 remote-sensing facility candidate contract', () => {
  it('emits only review-pending, lineage-bound facility candidates', () => {
    const result = compileFacilityCandidates(base);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.deepEqual(
      result.candidates.map(({ detectionKey, rank }) => ({ detectionKey, rank })),
      [
        { detectionKey: 'detection-a', rank: 1 },
        { detectionKey: 'detection-b', rank: 2 },
      ],
    );
    assert.ok(
      result.candidates.every(({ reviewStatus }) => reviewStatus === 'pending_human_review'),
    );
    assert.equal(result.sceneId, 'scene-20260720-a');
    assert.equal(result.candidateOnly, true);
    assert.equal(result.acceptedFactAllowed, false);
    assert.equal(result.orderExecutable, false);
  });

  it('is deterministic for reversed detector output', () => {
    assert.deepEqual(
      compileFacilityCandidates({ ...base, detections: [...base.detections].reverse() }),
      compileFacilityCandidates(base),
    );
  });

  it('fails closed on unapproved use, missing retention, future training, poor imagery, or invalid geometry', () => {
    for (const input of [
      {
        ...base,
        imagery: { ...base.imagery, license: { ...base.imagery.license, status: 'unknown' } },
      },
      {
        ...base,
        imagery: {
          ...base.imagery,
          license: { ...base.imagery.license, retentionAllowed: false },
        },
      },
      { ...base, model: { ...base.model, trainedCutoff: '2026-07-22T00:00:00.000Z' } },
      { ...base, imagery: { ...base.imagery, cloudCover: 0.9 } },
      {
        ...base,
        detections: [{ ...base.detections[0]!, latitude: 91 }],
      },
    ]) {
      assert.deepEqual(compileFacilityCandidates(input), {
        status: 'abstained',
        reason: 'INVALID_REMOTE_SENSING_INPUT',
        humanReviewRequired: true,
        candidateOnly: true,
        acceptedFactAllowed: false,
        orderExecutable: false,
      });
    }
  });
});
