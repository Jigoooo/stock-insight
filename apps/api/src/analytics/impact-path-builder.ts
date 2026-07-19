// B7 — impact path builder v2 (master plan §8 B7).
// Bounded relation walk over a SEALED graph snapshot: event source entity →
// snapshot edges → Stock targets, max N hops, no cycles. Every step records
// the exact analytics.graph_snapshot_edge FK — no array columns, 100% step
// FK evidence. Scores are industrial-linkage strength, never price predictions.

export type ImpactPathEdge = {
  graphSnapshotEdgeId: number;
  subjectEntityId: number;
  objectEntityId: number;
  predicate: string;
  confidence: number;
};

export type ImpactPathEvent = {
  eventId: number;
  sourceEntityId: number;
  /** Normalized event strength within [0,1]. */
  eventStrength: number;
};

export type ImpactPathStep = {
  stepNo: number;
  graphSnapshotEdgeId: number;
  fromEntityId: number;
  toEntityId: number;
  edgeContribution: number;
};

export type ImpactPath = {
  eventId: number;
  sourceEntityId: number;
  targetEntityId: number;
  hopCount: number;
  pathScore: number;
  steps: ImpactPathStep[];
};

export type ImpactPathOptions = {
  maxHops: number;
  /** Multiplier applied per hop beyond the first. */
  hopDecay: number;
  maxPathsPerEvent: number;
  /** Hard traversal-work budget; exhaustion fails closed rather than returning a partial top-K. */
  maxExpandedStates: number;
  /** Walk terminates only on these (Stock) entities. */
  stockEntityIds: ReadonlySet<number>;
};

export function buildImpactPaths(
  event: ImpactPathEvent,
  edges: readonly ImpactPathEdge[],
  options: ImpactPathOptions,
): ImpactPath[] {
  const assertPositiveId = (value: number, label: string): void => {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`${label} must be a positive integer`);
  };
  assertPositiveId(event.eventId, 'eventId');
  assertPositiveId(event.sourceEntityId, 'sourceEntityId');
  if (!Number.isFinite(event.eventStrength) || event.eventStrength < 0 || event.eventStrength > 1) {
    throw new Error('eventStrength must be within [0,1]');
  }
  if (!Number.isSafeInteger(options.maxHops) || options.maxHops < 1) {
    throw new Error('maxHops must be a positive integer');
  }
  // Hard ceiling: traversal work grows O(degree^maxHops); the product contract
  // (master plan §8 B7 "bounded graph") allows at most 2 hops today. Cap at 4
  // so a config typo cannot request an exponential walk.
  if (options.maxHops > 4) {
    throw new Error('maxHops must not exceed 4 (bounded graph contract)');
  }
  if (!Number.isFinite(options.hopDecay) || options.hopDecay <= 0 || options.hopDecay > 1) {
    throw new Error('hopDecay must be within (0,1]');
  }
  if (!Number.isSafeInteger(options.maxPathsPerEvent) || options.maxPathsPerEvent < 1) {
    throw new Error('maxPathsPerEvent must be a positive integer');
  }
  if (
    !Number.isSafeInteger(options.maxExpandedStates) ||
    options.maxExpandedStates < 1 ||
    options.maxExpandedStates > 100_000
  ) {
    throw new Error('maxExpandedStates must be a positive integer not exceeding 100000');
  }
  for (const stockEntityId of options.stockEntityIds) {
    assertPositiveId(stockEntityId, 'stockEntityId');
  }
  if (options.stockEntityIds.has(event.sourceEntityId)) {
    throw new Error('event source stock is terminal and cannot be expanded');
  }

  // Deterministic adjacency: edges sorted by snapshot edge id.
  const adjacency = new Map<number, ImpactPathEdge[]>();
  const seenEdgeIds = new Set<number>();
  for (const edge of [...edges].sort((a, b) => a.graphSnapshotEdgeId - b.graphSnapshotEdgeId)) {
    assertPositiveId(edge.graphSnapshotEdgeId, 'graphSnapshotEdgeId');
    assertPositiveId(edge.subjectEntityId, 'subjectEntityId');
    assertPositiveId(edge.objectEntityId, 'objectEntityId');
    if (seenEdgeIds.has(edge.graphSnapshotEdgeId)) {
      throw new Error(`duplicate graph snapshot edge id: ${edge.graphSnapshotEdgeId}`);
    }
    seenEdgeIds.add(edge.graphSnapshotEdgeId);
    if (
      !Number.isFinite(edge.confidence) ||
      Object.is(edge.confidence, -0) ||
      edge.confidence < 0 ||
      edge.confidence > 1
    ) {
      throw new Error('edge confidence must be within [0,1]');
    }
    const list = adjacency.get(edge.subjectEntityId) ?? [];
    list.push(edge);
    adjacency.set(edge.subjectEntityId, list);
  }

  const results: ImpactPath[] = [];
  let expandedStates = 0;

  const walk = (
    fromEntityId: number,
    visited: ReadonlySet<number>,
    steps: readonly ImpactPathStep[],
    scoreSoFar: number,
  ): void => {
    if (steps.length >= options.maxHops) return;
    const outgoing = adjacency.get(fromEntityId) ?? [];
    for (const edge of outgoing) {
      expandedStates += 1;
      if (expandedStates > options.maxExpandedStates) {
        throw new Error('impact path traversal work budget exceeded');
      }
      if (visited.has(edge.objectEntityId)) continue;
      const hopNo = steps.length + 1;
      const decay = hopNo > 1 ? options.hopDecay : 1;
      const nextScore = scoreSoFar * edge.confidence * decay;
      const nextSteps: ImpactPathStep[] = [
        ...steps,
        {
          stepNo: hopNo,
          graphSnapshotEdgeId: edge.graphSnapshotEdgeId,
          fromEntityId,
          toEntityId: edge.objectEntityId,
          edgeContribution: edge.confidence * decay,
        },
      ];
      if (options.stockEntityIds.has(edge.objectEntityId)) {
        results.push({
          eventId: event.eventId,
          sourceEntityId: event.sourceEntityId,
          targetEntityId: edge.objectEntityId,
          hopCount: hopNo,
          pathScore: nextScore,
          steps: nextSteps,
        });
        continue;
      }
      walk(edge.objectEntityId, new Set([...visited, edge.objectEntityId]), nextSteps, nextScore);
    }
  };

  walk(event.sourceEntityId, new Set([event.sourceEntityId]), [], event.eventStrength);

  // Deterministic total ranking: score desc, hops asc, numeric step ids, then target id.
  const compareStepIds = (left: ImpactPath, right: ImpactPath): number => {
    for (let index = 0; index < Math.min(left.steps.length, right.steps.length); index += 1) {
      const difference =
        left.steps[index]!.graphSnapshotEdgeId - right.steps[index]!.graphSnapshotEdgeId;
      if (difference !== 0) return difference;
    }
    return left.steps.length - right.steps.length;
  };
  results.sort(
    (a, b) =>
      b.pathScore - a.pathScore ||
      a.hopCount - b.hopCount ||
      compareStepIds(a, b) ||
      a.targetEntityId - b.targetEntityId ||
      a.sourceEntityId - b.sourceEntityId ||
      a.eventId - b.eventId,
  );
  return results.slice(0, options.maxPathsPerEvent);
}
