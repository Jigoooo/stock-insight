import { createHash } from 'node:crypto';

import type { ProductSimilarityObservation } from './builders/product-similarity.ts';

export type ProductSimilarityProfile = {
  entityId: number;
  text: string;
  sourceRevisionId: number;
  availableAt: string;
  validFrom: string;
};

export const PRODUCT_SIMILARITY_MODEL_CONFIG = Object.freeze({
  model: 'tfidf-cosine-v1',
  tokenizer: 'unicode-alnum-min2-lowercase',
  termFrequency: 'one-plus-log',
  inverseDocumentFrequency: 'smooth-log',
  threshold: 0.04,
  degreeCap: 12,
  scorePrecision: 6,
  sourceField: 'company_profile_summary',
});

type VectorizedProfile = ProductSimilarityProfile & {
  vector: Map<string, number>;
  norm: number;
};

type ScoredPair = {
  subject: VectorizedProfile;
  object: VectorizedProfile;
  score: number;
};

function assertPositive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be positive`);
}

function assertTimestamp(value: string, label: string): void {
  if (Number.isNaN(new Date(value).getTime())) throw new Error(`${label} must be a timestamp`);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
}

function laterTimestamp(left: string, right: string): string {
  return new Date(left).getTime() >= new Date(right).getTime() ? left : right;
}

export function buildProductSimilarityObservations(
  rawProfiles: readonly ProductSimilarityProfile[],
): ProductSimilarityObservation[] {
  const profiles = [...rawProfiles].sort((left, right) => left.entityId - right.entityId);
  const seenEntities = new Set<number>();
  const termCounts = new Map<number, Map<string, number>>();
  const documentFrequency = new Map<string, number>();

  for (const profile of profiles) {
    assertPositive(profile.entityId, 'entityId');
    assertPositive(profile.sourceRevisionId, 'sourceRevisionId');
    assertTimestamp(profile.availableAt, 'availableAt');
    assertTimestamp(profile.validFrom, 'validFrom');
    if (seenEntities.has(profile.entityId))
      throw new Error(`duplicate profile ${profile.entityId}`);
    seenEntities.add(profile.entityId);
    const counts = new Map<string, number>();
    for (const token of tokenize(profile.text)) counts.set(token, (counts.get(token) ?? 0) + 1);
    termCounts.set(profile.entityId, counts);
    for (const token of counts.keys()) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  if (profiles.length < 2) return [];
  const corpusSourceRevisionIds = [...new Set(profiles.map((row) => row.sourceRevisionId))].sort(
    (left, right) => left - right,
  );
  const corpusRevisionDigest = createHash('sha256')
    .update(JSON.stringify(corpusSourceRevisionIds))
    .digest('hex');
  const modelConfig = {
    ...PRODUCT_SIMILARITY_MODEL_CONFIG,
    corpusEntityCount: profiles.length,
    corpusSourceRevisionIds,
    corpusRevisionDigest,
  };
  const corpusAvailableAt = profiles.map((row) => row.availableAt).reduce(laterTimestamp);
  const corpusValidFrom = profiles.map((row) => row.validFrom).reduce(laterTimestamp);

  const vectorized: VectorizedProfile[] = profiles.map((profile) => {
    const vector = new Map<string, number>();
    let squaredNorm = 0;
    for (const [token, count] of termCounts.get(profile.entityId) ?? []) {
      const tf = 1 + Math.log(count);
      const idf = Math.log((profiles.length + 1) / ((documentFrequency.get(token) ?? 0) + 1)) + 1;
      const value = tf * idf;
      vector.set(token, value);
      squaredNorm += value * value;
    }
    return { ...profile, vector, norm: Math.sqrt(squaredNorm) };
  });

  const pairs: ScoredPair[] = [];
  for (let leftIndex = 0; leftIndex < vectorized.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < vectorized.length; rightIndex += 1) {
      const subject = vectorized[leftIndex]!;
      const object = vectorized[rightIndex]!;
      const smaller = subject.vector.size <= object.vector.size ? subject : object;
      const larger = smaller === subject ? object : subject;
      let dot = 0;
      for (const [token, value] of smaller.vector) {
        dot += value * (larger.vector.get(token) ?? 0);
      }
      const rawScore = subject.norm > 0 && object.norm > 0 ? dot / (subject.norm * object.norm) : 0;
      const score = Number(rawScore.toFixed(PRODUCT_SIMILARITY_MODEL_CONFIG.scorePrecision));
      if (score >= PRODUCT_SIMILARITY_MODEL_CONFIG.threshold) {
        pairs.push({ subject, object, score });
      }
    }
  }
  pairs.sort(
    (left, right) =>
      right.score - left.score ||
      left.subject.entityId - right.subject.entityId ||
      left.object.entityId - right.object.entityId,
  );

  const degree = new Map<number, number>();
  const selected: ScoredPair[] = [];
  for (const pair of pairs) {
    if (
      (degree.get(pair.subject.entityId) ?? 0) >= PRODUCT_SIMILARITY_MODEL_CONFIG.degreeCap ||
      (degree.get(pair.object.entityId) ?? 0) >= PRODUCT_SIMILARITY_MODEL_CONFIG.degreeCap
    ) {
      continue;
    }
    selected.push(pair);
    degree.set(pair.subject.entityId, (degree.get(pair.subject.entityId) ?? 0) + 1);
    degree.set(pair.object.entityId, (degree.get(pair.object.entityId) ?? 0) + 1);
  }

  return selected
    .sort(
      (left, right) =>
        left.subject.entityId - right.subject.entityId ||
        left.object.entityId - right.object.entityId,
    )
    .map((pair) => ({
      subjectEntityId: pair.subject.entityId,
      objectEntityId: pair.object.entityId,
      similarityScore: pair.score,
      modelConfig,
      sourceRevisionIds: [pair.subject.sourceRevisionId, pair.object.sourceRevisionId].sort(
        (left, right) => left - right,
      ),
      availableAt: corpusAvailableAt,
      validFrom: corpusValidFrom,
    }));
}
