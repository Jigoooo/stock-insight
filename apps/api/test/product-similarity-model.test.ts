import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildProductSimilarityObservations,
  PRODUCT_SIMILARITY_MODEL_CONFIG,
} from '../src/relations/product-similarity-model.ts';

const profile = (entityId: number, text: string, sourceRevisionId = 10_000 + entityId) => ({
  entityId,
  text,
  sourceRevisionId,
  availableAt: '2026-07-20T00:00:00.000Z',
  validFrom: '2026-07-20T00:00:00.000Z',
});

describe('production product-similarity model', () => {
  it('is deterministic across input order and binds both source revisions', () => {
    const rows = [
      profile(1, 'semiconductor memory chip artificial intelligence'),
      profile(2, 'semiconductor chip memory data center artificial intelligence'),
      profile(3, 'biotechnology clinical drug discovery'),
    ];
    const forward = buildProductSimilarityObservations(rows);
    const reversed = buildProductSimilarityObservations([...rows].reverse());
    assert.deepEqual(forward, reversed);
    const pair = forward.find((row) => row.subjectEntityId === 1 && row.objectEntityId === 2);
    assert.ok(pair);
    assert.deepEqual(pair.sourceRevisionIds, [10_001, 10_002]);
    assert.deepEqual(pair.modelConfig['corpusSourceRevisionIds'], [10_001, 10_002, 10_003]);
    assert.equal(pair.modelConfig['corpusEntityCount'], 3);
    assert.match(String(pair.modelConfig['corpusRevisionDigest']), /^[a-f0-9]{64}$/);
    for (const [key, value] of Object.entries(PRODUCT_SIMILARITY_MODEL_CONFIG)) {
      assert.deepEqual(pair.modelConfig[key], value);
    }
  });

  it('binds pair scores and availability to the exact full corpus revision set', () => {
    const rows = [
      profile(1, 'semiconductor memory chip artificial intelligence'),
      profile(2, 'semiconductor chip memory data center artificial intelligence'),
      {
        ...profile(3, 'biotechnology clinical drug discovery'),
        availableAt: '2026-07-21T00:00:00.000Z',
        validFrom: '2026-07-21T00:00:00.000Z',
      },
    ];
    const original = buildProductSimilarityObservations(rows).find(
      (row) => row.subjectEntityId === 1 && row.objectEntityId === 2,
    );
    const changedCorpus = buildProductSimilarityObservations([
      rows[0]!,
      rows[1]!,
      { ...rows[2]!, sourceRevisionId: 99_999 },
    ]).find((row) => row.subjectEntityId === 1 && row.objectEntityId === 2);
    assert.ok(original);
    assert.ok(changedCorpus);
    assert.equal(original.availableAt, '2026-07-21T00:00:00.000Z');
    assert.equal(original.validFrom, '2026-07-21T00:00:00.000Z');
    assert.notEqual(
      original.modelConfig['corpusRevisionDigest'],
      changedCorpus.modelConfig['corpusRevisionDigest'],
    );
    assert.deepEqual(
      changedCorpus.modelConfig['corpusSourceRevisionIds'],
      [10_001, 10_002, 99_999],
    );
  });

  it('enforces the configured per-entity degree cap after ranking', () => {
    const rows = Array.from({ length: 30 }, (_, index) =>
      profile(index + 1, `shared semiconductor memory chip token${index}`),
    );
    const observations = buildProductSimilarityObservations(rows);
    const degree = new Map<number, number>();
    for (const row of observations) {
      degree.set(row.subjectEntityId, (degree.get(row.subjectEntityId) ?? 0) + 1);
      degree.set(row.objectEntityId, (degree.get(row.objectEntityId) ?? 0) + 1);
    }
    assert.ok(observations.length > 0);
    assert.ok(
      [...degree.values()].every((value) => value <= PRODUCT_SIMILARITY_MODEL_CONFIG.degreeCap),
    );
  });

  it('does not manufacture a relation when cosine similarity is below threshold', () => {
    const observations = buildProductSimilarityObservations([
      profile(1, 'semiconductor memory accelerator'),
      profile(2, 'clinical biotechnology therapy'),
    ]);
    assert.deepEqual(observations, []);
  });
});
