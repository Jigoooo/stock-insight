// B6 — news co-mention builder (master plan §4.4, Hilt–Schwenkler guidance).
// Sentence-level co-mentions become NEWS_COMENTION observations that are
// NEVER promoted to accepted structural relations (policy predicate_not_promotable).
// Syndication clusters collapse Reuters-style replicas so one story republished
// N times counts as ONE corroboration, though every replica's source revision
// is preserved as evidence.

import {
  assertPositiveInt,
  assertValidTimestamp,
  decideCandidate,
  parseAsOf,
  relationPayloadHash,
  sortCandidates,
  sourceRevisionEvidence,
  type BuilderResult,
  type BuilderRunOptions,
  type RelationCandidateDraft,
} from '../builder-core.ts';

export type NewsComentionObservation = {
  subjectEntityId: number;
  objectEntityId: number;
  articleSourceRevisionId: number;
  /** Replicas of the same story share one syndication cluster id. */
  syndicationClusterId: string;
  availableAt: string;
  validFrom: string;
};

export function buildNewsComentionCandidates(
  observations: readonly NewsComentionObservation[],
  options: BuilderRunOptions,
): BuilderResult {
  const asOfMs = parseAsOf(options);

  type GroupState = {
    validFrom: string;
    clusters: Set<string>;
    revisions: Map<number, NewsComentionObservation>;
  };
  const groups = new Map<string, GroupState>();

  for (const observation of observations) {
    assertPositiveInt(observation.subjectEntityId, 'subjectEntityId');
    assertPositiveInt(observation.objectEntityId, 'objectEntityId');
    assertPositiveInt(observation.articleSourceRevisionId, 'articleSourceRevisionId');
    assertValidTimestamp(observation.availableAt, 'availableAt');
    assertValidTimestamp(observation.validFrom, 'validFrom');
    if (!observation.syndicationClusterId.trim()) {
      throw new Error('syndicationClusterId is required');
    }
    if (observation.subjectEntityId === observation.objectEntityId) {
      throw new Error('news co-mention must connect two distinct entities');
    }
    if (new Date(observation.availableAt).getTime() > asOfMs) continue;

    // Undirected canonical order: subject < object.
    const [subjectEntityId, objectEntityId] =
      observation.subjectEntityId < observation.objectEntityId
        ? [observation.subjectEntityId, observation.objectEntityId]
        : [observation.objectEntityId, observation.subjectEntityId];
    const key = `${subjectEntityId}|${objectEntityId}`;
    const group = groups.get(key) ?? {
      validFrom: observation.validFrom,
      clusters: new Set<string>(),
      revisions: new Map<number, NewsComentionObservation>(),
    };
    group.clusters.add(observation.syndicationClusterId);
    if (!group.revisions.has(observation.articleSourceRevisionId)) {
      group.revisions.set(observation.articleSourceRevisionId, observation);
    }
    if (observation.validFrom < group.validFrom) group.validFrom = observation.validFrom;
    groups.set(key, group);
  }

  const candidates: RelationCandidateDraft[] = [];
  for (const [key, group] of groups) {
    const [subjectEntityId, objectEntityId] = key.split('|').map(Number) as [number, number];
    const payloadHash = relationPayloadHash({
      predicate: 'NEWS_COMENTION',
      subjectEntityId,
      objectEntityId,
      validFrom: group.validFrom,
    });
    const evidence = [...group.revisions.values()]
      .sort((a, b) => a.articleSourceRevisionId - b.articleSourceRevisionId)
      .map((row) =>
        sourceRevisionEvidence({
          sourceRevisionId: row.articleSourceRevisionId,
          payloadHash,
          evidenceText:
            `News co-mention of ${subjectEntityId} and ${objectEntityId} ` +
            `(syndication cluster ${row.syndicationClusterId}) ` +
            `from immutable source revision ${row.articleSourceRevisionId}`,
          validFrom: row.validFrom,
        }),
      );
    const decision = decideCandidate({
      predicate: 'NEWS_COMENTION',
      evidence,
      hasModelConfigEvidence: false,
      subjectDegree: 1,
      objectDegree: 1,
    });
    candidates.push({
      predicate: 'NEWS_COMENTION',
      subjectEntityId,
      objectEntityId,
      relationKind: 'statistical',
      validFrom: group.validFrom,
      payloadHash,
      evidence,
      ...decision,
      metadata: {
        builder: 'news-relation-v1',
        // Independent corroboration = DISTINCT syndication clusters, not raw articles.
        corroborationCount: group.clusters.size,
        articleCount: group.revisions.size,
      },
    });
  }

  return { candidates: sortCandidates(candidates), exclusions: [] };
}
