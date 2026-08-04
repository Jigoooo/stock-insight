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
  /**
   * When true, every snapshot edge is walkable in BOTH directions (subject→object
   * and object→subject). The recorded step still carries the exact
   * graph_snapshot_edge FK plus the actual traversal direction
   * (fromEntityId/toEntityId), so step evidence stays exact. Structural
   * predicates in the sealed snapshot (peer/basket/sector pairs) are
   * symmetric, which is why the walk may treat them as undirected.
   */
  undirectedEdges?: boolean;
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

  // Deterministic adjacency: edges sorted by snapshot edge id. In undirected
  // mode each edge is registered under both endpoints with subject/object
  // swapped for the reverse hop — the snapshot edge FK is unchanged.
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
    if (options.undirectedEdges === true && edge.objectEntityId !== edge.subjectEntityId) {
      const reverse: ImpactPathEdge = {
        graphSnapshotEdgeId: edge.graphSnapshotEdgeId,
        subjectEntityId: edge.objectEntityId,
        objectEntityId: edge.subjectEntityId,
        predicate: edge.predicate,
        confidence: edge.confidence,
      };
      const reverseList = adjacency.get(reverse.subjectEntityId) ?? [];
      reverseList.push(reverse);
      adjacency.set(reverse.subjectEntityId, reverseList);
    }
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

  // Spend the per-event budget across KINDS of connection, not just the highest
  // scores.
  //
  // Taking the top N by score alone let one predicate own every slot: measured
  // 2026-08-05, 502 of 655 events produced paths that all used a single
  // predicate, and only 2 events reached three. A UAL event has 68
  // SAME_ETF_BASKET edges at a flat 0.800 against 2 MACRO_COMOVEMENT at 0.391,
  // so all 20 paths said "same ETF" and the macro edge — the one that explains
  // something the other 19 do not — was never reachable.
  //
  // This does NOT touch confidence. Confidence stays a measurement; only the
  // selection becomes diversity-aware, so nothing is promoted above its evidence.
  // Within a predicate the order is unchanged, so the best ETF path is still the
  // first ETF path.
  const predicateByEdgeId = new Map(
    [...edges].map((edge) => [edge.graphSnapshotEdgeId, edge.predicate] as const),
  );
  const signatureOf = (path: ImpactPath): string =>
    [
      ...new Set(
        path.steps.map((step) => predicateByEdgeId.get(step.graphSnapshotEdgeId) ?? 'unknown'),
      ),
    ]
      .sort()
      .join('+');
  const bySignature = new Map<string, ImpactPath[]>();
  for (const path of results) {
    const bucket = bySignature.get(signatureOf(path));
    if (bucket) bucket.push(path);
    else bySignature.set(signatureOf(path), [path]);
  }
  // Insertion order follows the sorted results, so the group holding the single
  // best path is visited first and a tie between groups is broken the same way
  // on a replay.
  const groups = [...bySignature.values()];
  const selected: ImpactPath[] = [];
  for (let round = 0; selected.length < options.maxPathsPerEvent; round += 1) {
    let tookAny = false;
    for (const group of groups) {
      if (selected.length >= options.maxPathsPerEvent) break;
      const path = group[round];
      if (path === undefined) continue;
      selected.push(path);
      tookAny = true;
    }
    if (!tookAny) break;
  }
  // Re-sort so the returned order is still score-ranked; only the membership of
  // the set changed, not how it is presented.
  return selected.sort(
    (a, b) =>
      b.pathScore - a.pathScore ||
      a.hopCount - b.hopCount ||
      compareStepIds(a, b) ||
      a.targetEntityId - b.targetEntityId ||
      a.sourceEntityId - b.sourceEntityId ||
      a.eventId - b.eventId,
  );
}
