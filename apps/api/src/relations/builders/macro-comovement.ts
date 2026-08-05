// Macro co-movement builder (roadmap 2b, phase 3).
//
// MACRO_COMOVEMENT is a STATISTICAL relation between a FRED series entity and a
// stock: the two moved together across a stated window. It must bind the exact
// model configuration as evidence — a correlation without the configuration that
// produced it cannot be re-run, and one that cannot be re-run cannot be
// contradicted. It is not a causal relation, not an exposure, and not a claim
// that the series drives the stock. The measurement is symmetric and so is the
// predicate.
//
// The pair is written in canonical id order for the same reason
// PRODUCT_SIMILARITY is: an undirected fact stored in one direction would let
// two identities exist for one relation.
//
// Evidence is two immutable source revisions — the macro series window and the
// stock price window that produced the number. Two, not one, because the
// correlation does not exist without both, and because the accepted-revision
// guard in migration 024 does not accept model_config on its own: model_config
// is not in its qualifying-evidence list, so a candidate carrying only that
// would raise rather than quarantine and take the whole publish transaction
// down with it.

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

export type MacroComovementObservation = {
  /** core.entity id of the FRED series (entity_type 'Metric'). */
  seriesEntityId: number;
  /** core.entity id of the stock. */
  stockEntityId: number;
  seriesKey: string;
  /** PARTIAL correlation controlling for the stock's market factor, within [-1,1]. */
  correlation: number;
  /** Raw correlation before the market factor was removed. */
  rawCorrelation: number;
  /** The stock's correlation with its market factor over the same dates. */
  stockMarketCorrelation: number;
  overlappingObservations: number;
  windowStartDate: string;
  windowEndDate: string;
  /** Exact model configuration that produced the correlation; null = missing. */
  modelConfig: Record<string, unknown> | null;
  /** Source revisions of BOTH windows: the macro series and the stock prices. */
  sourceRevisionIds: readonly number[];
  /** Latest available_at across the two window revisions. */
  availableAt: string;
  validFrom: string;
};

export function buildMacroComovementCandidates(
  observations: readonly MacroComovementObservation[],
  options: BuilderRunOptions,
): BuilderResult {
  const asOfMs = parseAsOf(options);

  const candidateSeeds: Array<
    Omit<RelationCandidateDraft, 'policyDecision' | 'targetRevisionStatus'>
  > = [];
  const observationRows = snapshotOwnDataArray(observations, 'macro comovement observations');
  for (const rawObservation of observationRows) {
    const values = snapshotOwnDataRecord(rawObservation, 'macro comovement observation');
    const modelConfig =
      values.modelConfig === null
        ? null
        : canonicalJsonClone(values.modelConfig, 'macro comovement modelConfig');
    if (modelConfig !== null && (typeof modelConfig !== 'object' || Array.isArray(modelConfig))) {
      throw new Error('macro comovement modelConfig must be a JSON object or null');
    }
    const observation: MacroComovementObservation = {
      seriesEntityId: values.seriesEntityId as number,
      stockEntityId: values.stockEntityId as number,
      seriesKey: values.seriesKey as string,
      correlation: values.correlation as number,
      rawCorrelation: values.rawCorrelation as number,
      stockMarketCorrelation: values.stockMarketCorrelation as number,
      overlappingObservations: values.overlappingObservations as number,
      windowStartDate: values.windowStartDate as string,
      windowEndDate: values.windowEndDate as string,
      modelConfig: modelConfig as Record<string, unknown> | null,
      sourceRevisionIds: snapshotOwnDataArray(
        values.sourceRevisionIds,
        'macro comovement sourceRevisionIds',
      ) as number[],
      availableAt: values.availableAt as string,
      validFrom: values.validFrom as string,
    };
    assertPositiveInt(observation.seriesEntityId, 'seriesEntityId');
    assertPositiveInt(observation.stockEntityId, 'stockEntityId');
    assertPositiveInt(observation.overlappingObservations, 'overlappingObservations');
    assertValidTimestamp(observation.availableAt, 'availableAt');
    assertValidTimestamp(observation.validFrom, 'validFrom');
    if (typeof observation.seriesKey !== 'string' || observation.seriesKey.length === 0) {
      throw new Error('seriesKey is required');
    }
    if (observation.seriesEntityId === observation.stockEntityId) {
      throw new Error('macro comovement must connect two distinct entities');
    }
    if (
      !Number.isFinite(observation.correlation) ||
      observation.correlation < -1 ||
      observation.correlation > 1
    ) {
      throw new Error('correlation must be within [-1,1]');
    }
    if (observation.sourceRevisionIds.length === 0) {
      throw new Error('sourceRevisionIds must not be empty');
    }
    for (const revisionId of observation.sourceRevisionIds) {
      assertPositiveInt(revisionId, 'sourceRevisionIds[]');
    }
    if (new Date(observation.availableAt).getTime() > asOfMs) continue;

    // Undirected canonical order: subject < object. The series may sort either
    // side of the stock — which is the point, since neither endpoint is claimed
    // to act on the other.
    const [subjectEntityId, objectEntityId] =
      observation.seriesEntityId < observation.stockEntityId
        ? [observation.seriesEntityId, observation.stockEntityId]
        : [observation.stockEntityId, observation.seriesEntityId];

    const payloadHash = relationPayloadHash({
      predicate: 'MACRO_COMOVEMENT',
      subjectEntityId,
      objectEntityId,
      correlation: observation.correlation,
      rawCorrelation: observation.rawCorrelation,
      overlappingObservations: observation.overlappingObservations,
      windowStartDate: observation.windowStartDate,
      windowEndDate: observation.windowEndDate,
      modelConfig,
      validFrom: observation.validFrom,
    });
    const distinctRevisionIds = [...new Set(observation.sourceRevisionIds)].sort((a, b) => a - b);
    const evidence = distinctRevisionIds.map((sourceRevisionId) =>
      sourceRevisionEvidence({
        sourceRevisionId,
        payloadHash,
        evidenceText:
          `Co-movement ${observation.correlation.toFixed(4)} between ${observation.seriesKey} and ` +
          `entity ${observation.stockEntityId} over ${observation.overlappingObservations} ` +
          `overlapping observations ${observation.windowStartDate}..${observation.windowEndDate}, ` +
          `from immutable source revision ${sourceRevisionId}`,
        validFrom: observation.validFrom,
      }),
    );
    candidateSeeds.push({
      predicate: 'MACRO_COMOVEMENT',
      subjectEntityId,
      objectEntityId,
      relationKind: 'statistical',
      validFrom: observation.validFrom,
      payloadHash,
      evidence,
      modelConfig: modelConfig as Record<string, unknown> | null,
      metadata: {
        builder: 'macro-comovement-v1',
        seriesKey: observation.seriesKey,
        // Signed, so a reader can tell "moved with" from "moved against".
        // Confidence on the revision is the magnitude and would lose the sign.
        correlation: observation.correlation,
        correlationDirection: observation.correlation >= 0 ? 'same' : 'opposite',
        // Both kept so the subtraction can be checked rather than trusted. A
        // large gap between raw and partial means the pair was mostly beta.
        rawCorrelation: observation.rawCorrelation,
        stockMarketCorrelation: observation.stockMarketCorrelation,
        overlappingObservations: observation.overlappingObservations,
        windowStartDate: observation.windowStartDate,
        windowEndDate: observation.windowEndDate,
        methodology: 'pearson-partial-controlling-for-market',
        // Said in the row itself, not only in a document, because this metadata
        // is what a rendering layer reaches for first.
        interpretation: 'statistical_comovement_not_causal',
      },
    });
  }

  const degree = new Map<number, number>();
  for (const candidate of candidateSeeds) {
    degree.set(candidate.subjectEntityId, (degree.get(candidate.subjectEntityId) ?? 0) + 1);
    degree.set(candidate.objectEntityId, (degree.get(candidate.objectEntityId) ?? 0) + 1);
  }
  const candidates: RelationCandidateDraft[] = candidateSeeds.map((candidate) => ({
    ...candidate,
    ...decideCandidate({
      predicate: candidate.predicate,
      evidence: candidate.evidence,
      hasModelConfigEvidence: candidate.modelConfig !== null,
      subjectDegree: degree.get(candidate.subjectEntityId) ?? 0,
      objectDegree: degree.get(candidate.objectEntityId) ?? 0,
    }),
  }));

  return { candidates: sortCandidates(candidates), exclusions: [] };
}
