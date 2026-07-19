import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  relationPayloadHash,
  sortCandidates,
  type RelationCandidateDraft,
} from '../src/relations/builder-core.ts';
import { buildProductSimilarityCandidates } from '../src/relations/builders/product-similarity.ts';

const candidate = (validFrom: string, payloadHash: string) =>
  ({
    predicate: 'PRODUCT_SIMILARITY',
    subjectEntityId: 1,
    objectEntityId: 2,
    validFrom,
    payloadHash,
    relationKind: 'statistical',
    evidence: [],
    policyDecision: { decision: 'accepted', reasons: [] },
    targetRevisionStatus: 'accepted',
    metadata: {},
  }) as RelationCandidateDraft;

describe('B6 builder-core deterministic contracts', () => {
  it('hashes nested relation payloads independently of object key insertion order', () => {
    const forward = relationPayloadHash({
      predicate: 'PRODUCT_SIMILARITY',
      modelConfig: { model: 'tnic', parameters: { alpha: 0.4, threshold: 0.7 } },
    });
    const reversed = relationPayloadHash({
      modelConfig: { parameters: { threshold: 0.7, alpha: 0.4 }, model: 'tnic' },
      predicate: 'PRODUCT_SIMILARITY',
    });

    assert.equal(forward, reversed);
  });

  it('rejects sparse arrays and non-JSON own keys fail-closed', () => {
    assert.throws(() => relationPayloadHash({ values: Array(1) }), /sparse array/i);
    const symbolPayload: Record<string, unknown> = {};
    Object.defineProperty(symbolPayload, Symbol('hidden'), { value: 1, enumerable: true });
    assert.throws(() => relationPayloadHash(symbolPayload), /symbol key/i);
    const extendedArray = [1] as number[] & { extra?: number };
    extendedArray.extra = 2;
    assert.throws(() => relationPayloadHash({ values: extendedArray }), /array key/i);
    const dangerous = JSON.parse('{"__proto__":{"polluted":true},"safe":1}') as Record<
      string,
      unknown
    >;
    assert.notEqual(relationPayloadHash(dangerous), relationPayloadHash({ safe: 1 }));
    const accessorPayload: Record<string, unknown> = {};
    Object.defineProperty(accessorPayload, 'value', { enumerable: true, get: () => 1 });
    assert.throws(() => relationPayloadHash(accessorPayload), /accessor/i);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.throws(() => relationPayloadHash(cyclic), /cyclic/i);
    const originalToJson = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
    Object.defineProperty(Array.prototype, 'toJSON', { configurable: true, value: () => 0 });
    try {
      assert.notEqual(relationPayloadHash({ bins: [1] }), relationPayloadHash({ bins: [2] }));
    } finally {
      if (originalToJson) Object.defineProperty(Array.prototype, 'toJSON', originalToJson);
      else delete (Array.prototype as unknown as { toJSON?: unknown }).toJSON;
    }
    assert.throws(() => relationPayloadHash({ value: '\ud800' }), /surrogate|Unicode/i);
  });

  it('totally orders candidates sharing a logical relation key', () => {
    const earlier = candidate('2026-06-01T00:00:00.000Z', 'b'.repeat(64));
    const later = candidate('2026-07-01T00:00:00.000Z', 'a'.repeat(64));

    const forward = sortCandidates([later, earlier]).map((row) => row.payloadHash);
    const reversed = sortCandidates([earlier, later]).map((row) => row.payloadHash);

    assert.deepEqual(forward, reversed);
    assert.deepEqual(forward, [earlier.payloadHash, later.payloadHash]);
  });

  it('breaks exact payload/evidence ties with all remaining semantic fields', () => {
    const base = {
      ...candidate('2026-01-01T00:00:00.000Z', 'a'.repeat(64)),
      relationKind: 'statistical',
      evidence: [],
      policyDecision: { decision: 'accepted', reasons: [] },
      targetRevisionStatus: 'accepted',
      modelConfig: { version: 1 },
    } as unknown as RelationCandidateDraft;
    const alpha = { ...base, metadata: { source: 'alpha' } };
    const beta = { ...base, metadata: { source: 'beta' } };

    const forward = sortCandidates([alpha, beta]).map((item) => item.metadata?.source);
    const reverse = sortCandidates([beta, alpha]).map((item) => item.metadata?.source);

    assert.deepEqual(forward, reverse);
    assert.deepEqual(forward, ['alpha', 'beta']);
  });

  it('normalizes evidence order and distinguishes absent from explicit-null model config', () => {
    const evidence = [1, 2].map((id) => ({
      sourceRevisionId: id,
      relationPayloadHash: `${id}`.repeat(64),
      evidenceText: `evidence-${id}`,
      evidenceHash: `${id + 2}`.repeat(64),
      validFrom: '2026-01-01T00:00:00.000Z',
    }));
    const base = candidate('2026-01-01T00:00:00.000Z', 'a'.repeat(64));
    const normalizedForward = sortCandidates([{ ...base, evidence: [...evidence].reverse() }])[0]!;
    const normalizedReverse = sortCandidates([{ ...base, evidence }])[0]!;
    assert.deepEqual(normalizedForward, normalizedReverse);
    assert.deepEqual(
      normalizedForward.evidence.map((row) => row.sourceRevisionId),
      [1, 2],
    );
    const originalToJson = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
    Object.defineProperty(Array.prototype, 'toJSON', { configurable: true, value: () => [] });
    try {
      const ordered = sortCandidates([
        { ...base, evidence: [evidence[1]!] },
        { ...base, evidence: [evidence[0]!] },
      ]);
      assert.deepEqual(
        ordered.map((row) => row.evidence[0]!.sourceRevisionId),
        [1, 2],
      );
    } finally {
      if (originalToJson) Object.defineProperty(Array.prototype, 'toJSON', originalToJson);
      else delete (Array.prototype as unknown as { toJSON?: unknown }).toJSON;
    }

    const absent = { ...base };
    const explicitNull = { ...base, modelConfig: null };
    const presence = (rows: RelationCandidateDraft[]) =>
      sortCandidates(rows).map((row) => Object.hasOwn(row, 'modelConfig'));
    assert.deepEqual(presence([absent, explicitNull]), presence([explicitNull, absent]));
    assert.throws(
      () => sortCandidates([{ ...base, modelConfig: undefined }]),
      /modelConfig.*undefined/i,
    );
    const accessorCandidate = { ...base };
    Object.defineProperty(accessorCandidate, 'modelConfig', {
      enumerable: true,
      get: () => null,
    });
    assert.throws(() => sortCandidates([accessorCandidate]), /accessor/i);
    assert.throws(() => sortCandidates([{ ...base, predicate: '\ud801' }]), /surrogate|Unicode/i);
  });

  it('snapshots product modelConfig once for payload, policy, and candidate', () => {
    const observation = {
      subjectEntityId: 1,
      objectEntityId: 2,
      similarityScore: 0.8,
      modelConfig: { model: 'v1' } as Record<string, unknown> | null,
      sourceRevisionIds: [10, 11],
      availableAt: '2026-01-01T00:00:00.000Z',
      validFrom: '2026-01-01T00:00:00.000Z',
    };
    Object.defineProperty(observation, 'modelConfig', {
      enumerable: true,
      get: () => ({ model: 'unstable' }),
    });
    assert.throws(
      () =>
        buildProductSimilarityCandidates([observation], {
          asOf: '2026-07-19T00:00:00.000Z',
        }),
      /accessor/i,
    );
  });
});
