export type EventRagEvent = Readonly<{
  eventRevisionId: number;
  knownAt: string;
  participantEntityIds: readonly number[];
}>;

export type EventRagEntityEdge = Readonly<{
  relationRevisionId: number;
  subjectEntityId: number;
  objectEntityId: number;
  confidence: number;
  knownAt: string;
}>;

export type EventRagEventEdge = Readonly<{
  sourceEventRevisionId: number;
  targetEventRevisionId: number;
  relation: 'same_story' | 'precedes' | 'candidate_influence';
  confidence: number;
  knownAt: string;
}>;

export type EventRagInput = Readonly<{
  graphSnapshotId: number;
  cutoff: string;
  seedEntityIds: readonly number[];
  events: readonly EventRagEvent[];
  entityEdges: readonly EventRagEntityEdge[];
  eventEdges: readonly EventRagEventEdge[];
  maxCandidates: number;
}>;

export type EventRagPathStep = Readonly<{
  kind: 'seed_event' | 'entity_relation' | 'event_relation';
  fromId: number;
  toId: number;
  evidenceRevisionId?: number;
}>;

export type EventRagResult =
  | Readonly<{
      status: 'ok';
      graphSnapshotId: number;
      cutoff: string;
      candidates: readonly Readonly<{
        eventRevisionId: number;
        score: number;
        rank: number;
        path: readonly EventRagPathStep[];
      }>[];
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_EVENTRAG_INPUT';
      candidateOnly: true;
      acceptedFactAllowed: false;
      orderExecutable: false;
    }>;

const abstained: EventRagResult = {
  status: 'abstained',
  reason: 'INVALID_EVENTRAG_INPUT',
  candidateOnly: true,
  acceptedFactAllowed: false,
  orderExecutable: false,
};

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function parseUtcTimestamp(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  try {
    return new Date(parsed).toISOString() === value ? parsed : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function hasUniqueIds(values: readonly number[]): boolean {
  return new Set(values).size === values.length;
}

export function retrieveEventCandidates(input: EventRagInput): EventRagResult {
  try {
    const cutoff = parseUtcTimestamp(input.cutoff);
    if (
      !isPositiveId(input.graphSnapshotId) ||
      !Number.isFinite(cutoff) ||
      !Number.isSafeInteger(input.maxCandidates) ||
      input.maxCandidates < 1 ||
      input.maxCandidates > 1_000 ||
      input.seedEntityIds.length < 1 ||
      input.seedEntityIds.length > 100 ||
      input.events.length > 10_000 ||
      input.entityEdges.length > 50_000 ||
      input.eventEdges.length > 50_000 ||
      !input.seedEntityIds.every(isPositiveId) ||
      !hasUniqueIds(input.seedEntityIds)
    ) {
      return abstained;
    }

    const events = [...input.events].sort(
      (left, right) => left.eventRevisionId - right.eventRevisionId,
    );
    if (
      !events.every(
        (event) =>
          isPositiveId(event.eventRevisionId) &&
          Number.isFinite(parseUtcTimestamp(event.knownAt)) &&
          event.participantEntityIds.length > 0 &&
          event.participantEntityIds.length <= 1_000 &&
          event.participantEntityIds.every(isPositiveId) &&
          hasUniqueIds(event.participantEntityIds),
      ) ||
      !hasUniqueIds(events.map(({ eventRevisionId }) => eventRevisionId))
    ) {
      return abstained;
    }

    const entityEdges = [...input.entityEdges].sort(
      (left, right) => left.relationRevisionId - right.relationRevisionId,
    );
    if (
      !entityEdges.every(
        (edge) =>
          isPositiveId(edge.relationRevisionId) &&
          isPositiveId(edge.subjectEntityId) &&
          isPositiveId(edge.objectEntityId) &&
          isProbability(edge.confidence) &&
          Number.isFinite(parseUtcTimestamp(edge.knownAt)),
      ) ||
      !hasUniqueIds(entityEdges.map(({ relationRevisionId }) => relationRevisionId))
    ) {
      return abstained;
    }

    const eventEdgeKeys = input.eventEdges.map(
      (edge) => `${edge.sourceEventRevisionId}:${edge.targetEventRevisionId}:${edge.relation}`,
    );
    const eventEdges = [...input.eventEdges].sort((left, right) =>
      `${left.sourceEventRevisionId}:${left.targetEventRevisionId}:${left.relation}`.localeCompare(
        `${right.sourceEventRevisionId}:${right.targetEventRevisionId}:${right.relation}`,
      ),
    );
    if (
      !eventEdges.every(
        (edge) =>
          isPositiveId(edge.sourceEventRevisionId) &&
          isPositiveId(edge.targetEventRevisionId) &&
          edge.sourceEventRevisionId !== edge.targetEventRevisionId &&
          ['same_story', 'precedes', 'candidate_influence'].includes(edge.relation) &&
          isProbability(edge.confidence) &&
          Number.isFinite(parseUtcTimestamp(edge.knownAt)),
      ) ||
      new Set(eventEdgeKeys).size !== eventEdgeKeys.length
    ) {
      return abstained;
    }

    const eligibleEvents = events.filter((event) => parseUtcTimestamp(event.knownAt) <= cutoff);
    const eligibleEventIds = new Set(eligibleEvents.map(({ eventRevisionId }) => eventRevisionId));
    const seedIds = new Set(input.seedEntityIds);
    const entityReach = new Map<number, { score: number; path: EventRagPathStep[] }>();
    for (const entityId of [...seedIds].sort((left, right) => left - right)) {
      entityReach.set(entityId, { score: 1, path: [] });
    }

    for (const event of eligibleEvents) {
      const seed = event.participantEntityIds.find((entityId) => seedIds.has(entityId));
      if (seed === undefined) continue;
      for (const entityId of event.participantEntityIds) {
        if (seedIds.has(entityId)) continue;
        const existing = entityReach.get(entityId);
        if (existing === undefined || existing.score < 0.6) {
          entityReach.set(entityId, {
            score: 0.6,
            path: [{ kind: 'seed_event', fromId: seed, toId: event.eventRevisionId }],
          });
        }
      }
    }

    for (const edge of entityEdges) {
      if (parseUtcTimestamp(edge.knownAt) > cutoff) continue;
      const directions = [
        [edge.subjectEntityId, edge.objectEntityId],
        [edge.objectEntityId, edge.subjectEntityId],
      ] as const;
      for (const [fromId, toId] of directions) {
        const source = entityReach.get(fromId);
        if (source === undefined) continue;
        const score = source.score * edge.confidence * 0.5;
        const existing = entityReach.get(toId);
        if (score <= 0 || (existing !== undefined && existing.score >= score)) continue;
        entityReach.set(toId, {
          score,
          path: [
            ...source.path,
            {
              kind: 'entity_relation',
              fromId,
              toId,
              evidenceRevisionId: edge.relationRevisionId,
            },
          ],
        });
      }
    }

    const candidateState = new Map<number, { score: number; path: EventRagPathStep[] }>();
    for (const event of eligibleEvents) {
      const directSeed = event.participantEntityIds.find((entityId) => seedIds.has(entityId));
      if (directSeed !== undefined) {
        candidateState.set(event.eventRevisionId, {
          score: 1,
          path: [{ kind: 'seed_event', fromId: directSeed, toId: event.eventRevisionId }],
        });
        continue;
      }
      const bestParticipant = event.participantEntityIds
        .map((entityId) => ({ entityId, reach: entityReach.get(entityId) }))
        .filter(
          (
            entry,
          ): entry is { entityId: number; reach: { score: number; path: EventRagPathStep[] } } =>
            entry.reach !== undefined,
        )
        .sort(
          (left, right) => right.reach.score - left.reach.score || left.entityId - right.entityId,
        )[0];
      if (bestParticipant !== undefined && bestParticipant.reach.score > 0) {
        candidateState.set(event.eventRevisionId, {
          score: bestParticipant.reach.score,
          path: [...bestParticipant.reach.path],
        });
      }
    }

    for (const edge of eventEdges) {
      if (
        parseUtcTimestamp(edge.knownAt) > cutoff ||
        !eligibleEventIds.has(edge.sourceEventRevisionId) ||
        !eligibleEventIds.has(edge.targetEventRevisionId)
      ) {
        continue;
      }
      const source = candidateState.get(edge.sourceEventRevisionId);
      if (source === undefined) continue;
      const score = source.score * edge.confidence * 0.5;
      const existing = candidateState.get(edge.targetEventRevisionId);
      if (score <= 0 || (existing !== undefined && existing.score >= score)) continue;
      candidateState.set(edge.targetEventRevisionId, {
        score,
        path: [
          ...source.path,
          {
            kind: 'event_relation',
            fromId: edge.sourceEventRevisionId,
            toId: edge.targetEventRevisionId,
          },
        ],
      });
    }

    const candidates = [...candidateState.entries()]
      .map(([eventRevisionId, state]) => ({
        eventRevisionId,
        score: Math.min(1, state.score),
        path: state.path,
      }))
      .filter(({ score }) => Number.isFinite(score) && score > 0)
      .sort(
        (left, right) => right.score - left.score || left.eventRevisionId - right.eventRevisionId,
      )
      .slice(0, input.maxCandidates)
      .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

    return {
      status: 'ok',
      graphSnapshotId: input.graphSnapshotId,
      cutoff: input.cutoff,
      candidates,
      candidateOnly: true,
      acceptedFactAllowed: false,
      orderExecutable: false,
    };
  } catch {
    return abstained;
  }
}
