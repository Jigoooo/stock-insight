import {
  entityRelationGraphSchema,
  type EntityRelationGraph,
} from '@stock-insight/contracts/research-workspace';

export type RelationGraphProjectionEdge = {
  relationRevisionId: number;
  relationIdentityId: number;
  predicate: string;
  subjectEntityId: number;
  objectEntityId: number;
  confidence: number;
  evidenceIds: readonly number[];
};

export type RelationGraphProjectionEntity = {
  entityId: number;
  entityKey: string;
  label: string;
  market: 'KR' | 'US' | null;
};

export type RelationGraphProjectionContext = {
  graphSnapshotId: number;
  asOf: string;
  knownAt: string;
  builderVersion: string;
  freshUntil: string;
  marketDataAsOf: string | null;
};

export type RelationGraphProjection = {
  entityId: number;
  entityKey: string;
  depth1: EntityRelationGraph;
  depth2: EntityRelationGraph;
  relationRevisionIds: number[];
  relationEvidenceLedgerIds: number[];
};

type RelationType = EntityRelationGraph['edges'][number]['relationType'];
type ProjectedEdge = {
  fromEntityId: number;
  toEntityId: number;
  relationType: RelationType;
  confidence: number;
  relationRevisionIds: Set<number>;
  evidenceIds: Set<number>;
};

const STOCK_KEY = /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/;
const DIRECT_PREDICATES: Readonly<Record<string, RelationType>> = {
  SAME_ETF_BASKET: 'peer',
  PRODUCT_SIMILARITY: 'peer',
  COMMON_OWNER: 'corroborates',
};

function requirePositiveId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be positive`);
}

function mergeProjectedEdge(
  byKey: Map<string, ProjectedEdge>,
  input: {
    fromEntityId: number;
    toEntityId: number;
    relationType: RelationType;
    confidence: number;
    relationRevisionIds: readonly number[];
    evidenceIds: readonly number[];
  },
): void {
  if (input.fromEntityId === input.toEntityId) return;
  const [fromEntityId, toEntityId] =
    input.fromEntityId < input.toEntityId
      ? [input.fromEntityId, input.toEntityId]
      : [input.toEntityId, input.fromEntityId];
  const key = `${fromEntityId}|${toEntityId}|${input.relationType}`;
  const current = byKey.get(key) ?? {
    fromEntityId,
    toEntityId,
    relationType: input.relationType,
    confidence: 0,
    relationRevisionIds: new Set<number>(),
    evidenceIds: new Set<number>(),
  };
  current.confidence = Math.max(current.confidence, input.confidence);
  for (const revisionId of input.relationRevisionIds) current.relationRevisionIds.add(revisionId);
  for (const evidenceId of input.evidenceIds) current.evidenceIds.add(evidenceId);
  byKey.set(key, current);
}

function edgeId(edge: ProjectedEdge): string {
  return `v2:${edge.relationType}:${[...edge.relationRevisionIds].sort((a, b) => a - b).join('-')}`;
}

export function buildRelationGraphProjections(
  rawEdges: readonly RelationGraphProjectionEdge[],
  rawEntities: readonly RelationGraphProjectionEntity[],
  context: RelationGraphProjectionContext,
): RelationGraphProjection[] {
  requirePositiveId(context.graphSnapshotId, 'graphSnapshotId');
  const entities = new Map<number, RelationGraphProjectionEntity>();
  for (const entity of rawEntities) {
    requirePositiveId(entity.entityId, 'entityId');
    if (entities.has(entity.entityId)) throw new Error(`duplicate entity ${entity.entityId}`);
    entities.set(entity.entityId, { ...entity });
  }

  const usableStock = (entityId: number): boolean => {
    const entity = entities.get(entityId);
    return entity !== undefined && entity.market !== null && STOCK_KEY.test(entity.entityKey);
  };
  const projectedByKey = new Map<string, ProjectedEdge>();
  const classifications = new Map<number, RelationGraphProjectionEdge[]>();

  for (const edge of rawEdges) {
    requirePositiveId(edge.relationRevisionId, 'relationRevisionId');
    requirePositiveId(edge.relationIdentityId, 'relationIdentityId');
    if (!Number.isFinite(edge.confidence) || edge.confidence < 0 || edge.confidence > 1) {
      throw new Error('confidence must be within [0,1]');
    }
    for (const evidenceId of edge.evidenceIds) requirePositiveId(evidenceId, 'evidenceId');
    if (edge.predicate === 'CLASSIFIED_AS') {
      if (!usableStock(edge.subjectEntityId)) continue;
      const rows = classifications.get(edge.objectEntityId) ?? [];
      rows.push(edge);
      classifications.set(edge.objectEntityId, rows);
      continue;
    }
    const relationType = DIRECT_PREDICATES[edge.predicate];
    if (relationType === undefined) continue;
    if (!usableStock(edge.subjectEntityId) || !usableStock(edge.objectEntityId)) continue;
    mergeProjectedEdge(projectedByKey, {
      fromEntityId: edge.subjectEntityId,
      toEntityId: edge.objectEntityId,
      relationType,
      confidence: edge.confidence,
      relationRevisionIds: [edge.relationRevisionId],
      evidenceIds: edge.evidenceIds,
    });
  }

  for (const rows of classifications.values()) {
    const ordered = [...rows].sort(
      (left, right) =>
        left.subjectEntityId - right.subjectEntityId ||
        left.relationRevisionId - right.relationRevisionId,
    );
    for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
        const left = ordered[leftIndex]!;
        const right = ordered[rightIndex]!;
        if (left.subjectEntityId === right.subjectEntityId) continue;
        mergeProjectedEdge(projectedByKey, {
          fromEntityId: left.subjectEntityId,
          toEntityId: right.subjectEntityId,
          relationType: 'same_industry',
          confidence: Math.min(left.confidence, right.confidence),
          relationRevisionIds: [left.relationRevisionId, right.relationRevisionId],
          evidenceIds: [...left.evidenceIds, ...right.evidenceIds],
        });
      }
    }
  }

  const projectedEdges = [...projectedByKey.values()].sort(
    (left, right) =>
      left.fromEntityId - right.fromEntityId ||
      left.toEntityId - right.toEntityId ||
      left.relationType.localeCompare(right.relationType),
  );
  const adjacency = new Map<number, ProjectedEdge[]>();
  for (const edge of projectedEdges) {
    for (const entityId of [edge.fromEntityId, edge.toEntityId]) {
      const rows = adjacency.get(entityId) ?? [];
      rows.push(edge);
      adjacency.set(entityId, rows);
    }
  }

  const buildGraph = (rootEntityId: number, depth: 1 | 2): EntityRelationGraph => {
    const root = entities.get(rootEntityId)!;
    const distances = new Map<number, number>([[rootEntityId, 0]]);
    let frontier = [rootEntityId];
    for (let hop = 1; hop <= depth; hop += 1) {
      const next = new Set<number>();
      for (const entityId of frontier) {
        const edges = [...(adjacency.get(entityId) ?? [])].sort((a, b) =>
          edgeId(a).localeCompare(edgeId(b)),
        );
        for (const edge of edges) {
          const neighbor = edge.fromEntityId === entityId ? edge.toEntityId : edge.fromEntityId;
          if (!distances.has(neighbor)) {
            distances.set(neighbor, hop);
            next.add(neighbor);
          }
        }
      }
      frontier = [...next].sort((left, right) =>
        entities.get(left)!.entityKey.localeCompare(entities.get(right)!.entityKey),
      );
    }
    const selectedIds = [...distances]
      .sort(
        ([leftId, leftDepth], [rightId, rightDepth]) =>
          leftDepth - rightDepth ||
          entities.get(leftId)!.entityKey.localeCompare(entities.get(rightId)!.entityKey),
      )
      .slice(0, 20)
      .map(([entityId]) => entityId);
    const selectedSet = new Set(selectedIds);
    const internalEdges = projectedEdges
      .filter((edge) => selectedSet.has(edge.fromEntityId) && selectedSet.has(edge.toEntityId))
      .sort(
        (left, right) =>
          right.confidence - left.confidence || edgeId(left).localeCompare(edgeId(right)),
      );
    const connected = new Set<number>([rootEntityId]);
    const selectedById = new Map<string, ProjectedEdge>();
    while (connected.size < selectedIds.length) {
      const bridge = internalEdges.find((edge) => {
        const fromConnected = connected.has(edge.fromEntityId);
        const toConnected = connected.has(edge.toEntityId);
        return fromConnected !== toConnected;
      });
      if (bridge === undefined) {
        throw new Error(`selected graph nodes are not connected to root ${root.entityKey}`);
      }
      selectedById.set(edgeId(bridge), bridge);
      connected.add(bridge.fromEntityId);
      connected.add(bridge.toEntityId);
    }
    for (const edge of internalEdges) {
      if (selectedById.size >= 80) break;
      selectedById.set(edgeId(edge), edge);
    }
    const selectedEdges = [...selectedById.values()].sort(
      (left, right) =>
        right.confidence - left.confidence || edgeId(left).localeCompare(edgeId(right)),
    );
    const evidenceCount = selectedEdges.reduce((total, edge) => total + edge.evidenceIds.size, 0);
    return entityRelationGraphSchema.parse({
      meta: {
        schemaVersion: 'v3',
        visibility: 'internal',
        generatedAt: context.knownAt,
        freshness: 'available',
        contentSnapshot: {
          analysisRunId: context.builderVersion,
          analysisRevision: context.graphSnapshotId,
          analysisCutoffAt: context.asOf,
          sourceWatermarkAt: context.knownAt,
          freshUntil: context.freshUntil,
        },
        graphSnapshot: {
          requestedAsOf: context.asOf,
          knownThroughAt: context.knownAt,
          edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
        },
        marketSnapshot: { marketDataAsOf: context.marketDataAsOf },
        sourceCoverage: { linked: evidenceCount, clickable: 0, total: evidenceCount },
        qualityFlags:
          evidenceCount > 0 ? ['graph_source_url_partial', 'v2_transitional_source'] : [],
      },
      rootEntityKey: root.entityKey,
      depth,
      nodes: selectedIds.map((entityId) => {
        const entity = entities.get(entityId)!;
        return {
          entityKey: entity.entityKey,
          label: entity.label,
          market: entity.market,
          watched: false,
          holding: false,
        };
      }),
      edges: selectedEdges.map((edge) => ({
        edgeId: edgeId(edge),
        from: entities.get(edge.fromEntityId)!.entityKey,
        to: entities.get(edge.toEntityId)!.entityKey,
        relationType: edge.relationType,
        direction: 'undirected',
        weight: edge.confidence,
        approved: true,
        inferred: false,
        evidenceQuality: 'medium',
        evidenceCount: edge.evidenceIds.size,
        clickableSourceCount: 0,
      })),
      evidenceSummary: {
        evidenceCount,
        clickableSourceCount: 0,
        limitation: '불변 source revision에 연결된 승인 관계만 표시하며 원문 링크는 준비 중',
      },
    });
  };

  return [...adjacency.keys()]
    .sort((left, right) =>
      entities.get(left)!.entityKey.localeCompare(entities.get(right)!.entityKey),
    )
    .map((entityId) => {
      const depth1 = buildGraph(entityId, 1);
      const depth2 = buildGraph(entityId, 2);
      const depth2EdgeIds = new Set(depth2.edges.map((edge) => edge.edgeId));
      const used = projectedEdges.filter((edge) => depth2EdgeIds.has(edgeId(edge)));
      return {
        entityId,
        entityKey: entities.get(entityId)!.entityKey,
        depth1,
        depth2,
        relationRevisionIds: [
          ...new Set(used.flatMap((edge) => [...edge.relationRevisionIds])),
        ].sort((a, b) => a - b),
        relationEvidenceLedgerIds: [...new Set(used.flatMap((edge) => [...edge.evidenceIds]))].sort(
          (a, b) => a - b,
        ),
      };
    });
}
