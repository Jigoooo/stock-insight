// B6 — product similarity builder (master plan §4.2, Hoberg–Phillips TNIC).
// PRODUCT_SIMILARITY is a STATISTICAL relation computed from 10-K business
// descriptions / DART 사업의 내용 at a point in time. It must bind the exact
// model configuration (model id, threshold, parameters) as evidence — a score
// without its generating config is quarantined, never accepted. It is not an
// official sector, supply chain, or causal relation.

import {
  assertPositiveInt,
  assertValidTimestamp,
  canonicalJsonClone,
  decideCandidate,
  parseAsOf,
  relationPayloadHash,
  sortCandidates,
  snapshotOwnDataArray,
  snapshotOwnDataRecord,
  sourceRevisionEvidence,
  type BuilderResult,
  type BuilderRunOptions,
  type RelationCandidateDraft,
} from '../builder-core.ts';

export type ProductSimilarityObservation = {
  subjectEntityId: number;
  objectEntityId: number;
  similarityScore: number;
  /** Exact model configuration that produced the score; null = missing. */
  modelConfig: Record<string, unknown> | null;
  /** Source revisions of BOTH underlying business-description filings. */
  sourceRevisionIds: readonly number[];
  /** Latest available_at across the underlying filings. */
  availableAt: string;
  validFrom: string;
};

export function buildProductSimilarityCandidates(
  observations: readonly ProductSimilarityObservation[],
  options: BuilderRunOptions,
): BuilderResult {
  const asOfMs = parseAsOf(options);

  const candidates: RelationCandidateDraft[] = [];
  const observationRows = snapshotOwnDataArray(observations, 'product similarity observations');
  for (const rawObservation of observationRows) {
    const values = snapshotOwnDataRecord(rawObservation, 'product similarity observation');
    const modelConfig =
      values.modelConfig === null
        ? null
        : canonicalJsonClone(values.modelConfig, 'product similarity modelConfig');
    if (modelConfig !== null && (typeof modelConfig !== 'object' || Array.isArray(modelConfig))) {
      throw new Error('product similarity modelConfig must be a JSON object or null');
    }
    const observation: ProductSimilarityObservation = {
      subjectEntityId: values.subjectEntityId as number,
      objectEntityId: values.objectEntityId as number,
      similarityScore: values.similarityScore as number,
      modelConfig: modelConfig as Record<string, unknown> | null,
      sourceRevisionIds: snapshotOwnDataArray(
        values.sourceRevisionIds,
        'product similarity sourceRevisionIds',
      ) as number[],
      availableAt: values.availableAt as string,
      validFrom: values.validFrom as string,
    };
    assertPositiveInt(observation.subjectEntityId, 'subjectEntityId');
    assertPositiveInt(observation.objectEntityId, 'objectEntityId');
    assertValidTimestamp(observation.availableAt, 'availableAt');
    assertValidTimestamp(observation.validFrom, 'validFrom');
    if (observation.subjectEntityId === observation.objectEntityId) {
      throw new Error('product similarity must connect two distinct entities');
    }
    if (
      !Number.isFinite(observation.similarityScore) ||
      observation.similarityScore < 0 ||
      observation.similarityScore > 1
    ) {
      throw new Error('similarityScore must be within [0,1]');
    }
    if (observation.sourceRevisionIds.length === 0) {
      throw new Error('sourceRevisionIds must not be empty');
    }
    for (const revisionId of observation.sourceRevisionIds) {
      assertPositiveInt(revisionId, 'sourceRevisionIds[]');
    }
    if (new Date(observation.availableAt).getTime() > asOfMs) continue;

    // Undirected canonical order: subject < object.
    const [subjectEntityId, objectEntityId] =
      observation.subjectEntityId < observation.objectEntityId
        ? [observation.subjectEntityId, observation.objectEntityId]
        : [observation.objectEntityId, observation.subjectEntityId];

    const payloadHash = relationPayloadHash({
      predicate: 'PRODUCT_SIMILARITY',
      subjectEntityId,
      objectEntityId,
      similarityScore: observation.similarityScore,
      modelConfig: modelConfig,
      validFrom: observation.validFrom,
    });
    const distinctRevisionIds = [...new Set(observation.sourceRevisionIds)].sort((a, b) => a - b);
    const evidence = distinctRevisionIds.map((sourceRevisionId) =>
      sourceRevisionEvidence({
        sourceRevisionId,
        payloadHash,
        evidenceText:
          `Product-description similarity ${observation.similarityScore.toFixed(4)} between ` +
          `${subjectEntityId} and ${objectEntityId} from immutable source revision ${sourceRevisionId}`,
        validFrom: observation.validFrom,
      }),
    );
    const decision = decideCandidate({
      predicate: 'PRODUCT_SIMILARITY',
      evidence,
      hasModelConfigEvidence: modelConfig !== null,
      subjectDegree: 1,
      objectDegree: 1,
    });
    candidates.push({
      predicate: 'PRODUCT_SIMILARITY',
      subjectEntityId,
      objectEntityId,
      relationKind: 'statistical',
      validFrom: observation.validFrom,
      payloadHash,
      evidence,
      ...decision,
      modelConfig: modelConfig as Record<string, unknown> | null,
      metadata: {
        builder: 'product-similarity-v1',
        similarityScore: observation.similarityScore,
        methodology: 'tnic-reference',
      },
    });
  }

  return { candidates: sortCandidates(candidates), exclusions: [] };
}
