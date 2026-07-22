import type { StockDetailResponse } from '@stock-insight/contracts';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

export const DEEP_DIVE_SECTION_IDS = [
  'identity',
  'performance',
  'direct_relations',
  'secondary_exposure',
  'factor_exposure',
  'active_events',
  'historical_analog',
  'scenario',
  'counter_evidence',
  'derivation',
  'holding_judgment',
  'invalidation',
] as const;

export type StockDeepDiveSectionId = (typeof DEEP_DIVE_SECTION_IDS)[number];
export type StockDeepDiveAvailability = 'available' | 'partial' | 'missing';

export type StockDeepDiveSection = {
  id: StockDeepDiveSectionId;
  title: string;
  summary: string;
  availability: StockDeepDiveAvailability;
  items: string[];
  itemCount: number;
};

export type StockDeepDive = {
  entityKey: string | null;
  displayName: string;
  availability: StockDeepDiveAvailability;
  generatedAt: string;
  sections: StockDeepDiveSection[];
};

export function createLatestRequestGate() {
  let generation = 0;
  return {
    next: () => ++generation,
    invalidate: () => {
      generation += 1;
    },
    isCurrent: (candidate: number) => candidate === generation,
  };
}

const SECTION_META: Record<StockDeepDiveSectionId, { title: string; missing: string }> = {
  identity: { title: '정체성', missing: '기업 정체성 데이터가 없습니다.' },
  performance: { title: '실적 구조', missing: '실적 구조 데이터가 없습니다.' },
  direct_relations: { title: '직접 관계', missing: '확인된 직접 관계가 없습니다.' },
  secondary_exposure: { title: '2차 노출', missing: '검증된 2차 노출 경로가 없습니다.' },
  factor_exposure: { title: '요인 노출', missing: '검증된 요인 노출 데이터가 없습니다.' },
  active_events: { title: '진행 사건', missing: '연결된 진행 사건이 없습니다.' },
  historical_analog: { title: '과거 유사 사례', missing: '검증된 과거 유사 사례가 없습니다.' },
  scenario: { title: '시나리오', missing: '봉인된 시나리오가 없습니다.' },
  counter_evidence: { title: '반대 근거', missing: '명시된 반대 근거가 없습니다.' },
  derivation: { title: '도출 과정', missing: '재실행 가능한 도출 과정이 없습니다.' },
  holding_judgment: { title: '보유 판단', missing: '보유 상태 또는 판단 근거가 없습니다.' },
  invalidation: { title: '무효화 조건', missing: '명시된 무효화 조건이 없습니다.' },
};

function section(
  id: StockDeepDiveSectionId,
  availability: StockDeepDiveAvailability,
  items: string[],
  summary?: string,
): StockDeepDiveSection {
  const meta = SECTION_META[id];
  return {
    id,
    title: meta.title,
    availability,
    items,
    itemCount: items.length,
    summary: summary ?? (items.length > 0 ? `${items.length}개 근거 연결됨` : meta.missing),
  };
}

function stringifyMetricGroups(
  groups: NonNullable<StockDetailResponse['data']>['companyMetrics'],
): string[] {
  if (!groups) return [];
  const performanceGroup =
    /companyfacts|fundamental|income|balance|cash[_ -]?flow|profit|revenue|earnings|margin|growth|수익|매출|이익|재무|실적/i;
  return groups
    .filter(
      (group) => group.availability === 'available' && performanceGroup.test(group.metricGroup),
    )
    .flatMap((group) =>
      group.metrics.map(
        (item) =>
          `${group.metricGroup} · ${item.label} ${item.value}${item.unit ? ` ${item.unit}` : ''}`,
      ),
    );
}

function isVerifiedRootEdge(
  graph: EntityRelationGraph,
  edge: EntityRelationGraph['edges'][number],
): boolean {
  return (
    edge.approved === true &&
    edge.inferred === false &&
    (edge.from === graph.rootEntityKey || edge.to === graph.rootEntityKey)
  );
}

function relationItems(graph: EntityRelationGraph | null): string[] {
  if (!graph) return [];
  const labels = new Map(graph.nodes.map((node) => [node.entityKey, node.label]));
  return graph.edges
    .filter((edge) => isVerifiedRootEdge(graph, edge))
    .map((edge) => {
      const source = labels.get(edge.from) ?? edge.from;
      const target = labels.get(edge.to) ?? edge.to;
      const connector = edge.direction === 'directed' ? '→' : '↔';
      return `${source} ${connector} ${target} · ${edge.relationType}`;
    });
}

function rootDirectRelationGraph(graph: EntityRelationGraph | null): EntityRelationGraph | null {
  if (!graph) return null;
  const edges = graph.edges.filter((edge) => isVerifiedRootEdge(graph, edge));
  if (edges.length === 0) return null;
  const nodeKeys = new Set([graph.rootEntityKey]);
  for (const edge of edges) {
    nodeKeys.add(edge.from);
    nodeKeys.add(edge.to);
  }
  return {
    ...graph,
    depth: 1,
    nodes: graph.nodes.filter(({ entityKey }) => nodeKeys.has(entityKey)),
    edges,
    evidenceSummary: {
      ...graph.evidenceSummary,
      evidenceCount: edges.reduce((total, edge) => total + edge.evidenceCount, 0),
      clickableSourceCount: edges.reduce((total, edge) => total + edge.clickableSourceCount, 0),
    },
  };
}

function allMissing(generatedAt: string, entityKey: string | null = null): StockDeepDive {
  return {
    entityKey,
    displayName: entityKey ?? '선택 종목 없음',
    availability: 'missing',
    generatedAt,
    sections: DEEP_DIVE_SECTION_IDS.map((id) => section(id, 'missing', [])),
  };
}

/**
 * Compose the 12-section Deep Dive from already-grounded stock detail and
 * relation read models. Unsupported P2 surfaces remain explicitly `missing`;
 * this function never invents factor/scenario/derivation data.
 */
export function buildStockDeepDive(
  response: StockDetailResponse,
  graph: EntityRelationGraph | null,
): StockDeepDive {
  const detail = response.data;
  if (
    !detail ||
    response.availability === 'missing' ||
    response.availability === 'unsupported' ||
    response.availability === 'error'
  ) {
    return allMissing(response.meta.generatedAt, detail?.stock.entityKey ?? null);
  }

  const profile = detail.companyProfile?.status === 'available' ? detail.companyProfile : null;
  const identityItems = [
    detail.stock.displayName,
    detail.stock.ticker,
    profile?.sector,
    profile?.industry,
    profile?.summaryText,
  ].filter((value): value is string => Boolean(value));
  const performanceItems = stringifyMetricGroups(detail.companyMetrics);
  const groundedGraph = graph?.rootEntityKey === detail.stock.entityKey ? graph : null;
  const directItems = relationItems(groundedGraph);
  const holdingItems = detail.stock.isHolding
    ? [
        '현재 보유 상태',
        detail.stock.primaryThesis ? `기본 논지: ${detail.stock.primaryThesis}` : null,
      ].filter((value): value is string => Boolean(value))
    : [];

  const sections: StockDeepDiveSection[] = [
    section('identity', identityItems.length > 0 ? 'available' : 'missing', identityItems),
    section('performance', performanceItems.length > 0 ? 'available' : 'missing', performanceItems),
    section('direct_relations', directItems.length > 0 ? 'available' : 'missing', directItems),
    // A one-hop relation graph cannot prove a second-order exposure.
    section('secondary_exposure', 'missing', []),
    // Feature/impact serving surfaces are not yet wired to this read model.
    section('factor_exposure', 'missing', []),
    // Generic related news has no event lifecycle/horizon contract.
    section('active_events', 'missing', []),
    section('historical_analog', 'missing', []),
    section('scenario', 'missing', []),
    // Generic risk strings are not provenance-backed counter-evidence assertions.
    section('counter_evidence', 'missing', []),
    // A narrative report is not a replayable derivation; keep this missing until
    // a sealed program + input snapshot is wired.
    section('derivation', 'missing', []),
    section(
      'holding_judgment',
      holdingItems.length > 0 ? 'partial' : 'missing',
      holdingItems,
      holdingItems.length > 0
        ? '보유 상태와 기본 논지를 의사결정 근거로 표시합니다. 투자 행동 제안은 포함하지 않습니다.'
        : undefined,
    ),
    // Generic checkpoints are not a sealed decision-packet invalidation contract.
    section('invalidation', 'missing', []),
  ];

  return {
    entityKey: detail.stock.entityKey,
    displayName: detail.stock.displayName,
    availability:
      response.availability === 'available' &&
      sections.every((item) => item.availability === 'available')
        ? 'available'
        : 'partial',
    generatedAt: response.meta.generatedAt,
    sections,
  };
}

type StockDeepDiveLoaders = {
  loadDetail: (entityKey: string) => Promise<StockDetailResponse>;
  loadRelation: (entityKey: string) => Promise<EntityRelationGraph>;
};

function isMissingRelationEndpoint(error: unknown): boolean {
  return error instanceof Error && /Entity relations failed with 404$/.test(error.message);
}

/**
 * Load the mandatory stock detail and optional relation graph concurrently.
 * Only a confirmed 404 is degraded to partial availability; transport 5xx and
 * schema/integrity failures remain fail-closed.
 */
export async function loadStockDeepDiveData(
  entityKey: string,
  loaders: StockDeepDiveLoaders,
): Promise<{ deepDive: StockDeepDive; relation: EntityRelationGraph | null }> {
  const [detail, relationResult] = await Promise.all([
    loaders.loadDetail(entityKey),
    loaders
      .loadRelation(entityKey)
      .then((graph) => ({ graph, unavailable: false }))
      .catch((error: unknown) => {
        if (isMissingRelationEndpoint(error)) return { graph: null, unavailable: true };
        throw error;
      }),
  ]);
  if (detail.availability === 'error') {
    throw new Error(detail.error?.message ?? 'Stock detail response reported an error');
  }
  if (detail.data && detail.data.stock.entityKey !== entityKey) {
    throw new Error(
      `Stock detail identity mismatch: requested ${entityKey}, received ${detail.data.stock.entityKey}`,
    );
  }
  if (relationResult.graph && relationResult.graph.rootEntityKey !== entityKey) {
    throw new Error(
      `Stock relation identity mismatch: requested ${entityKey}, received ${relationResult.graph.rootEntityKey}`,
    );
  }
  const detailUsable =
    detail.data !== null &&
    detail.availability !== 'missing' &&
    detail.availability !== 'unsupported';
  const relation = detailUsable ? rootDirectRelationGraph(relationResult.graph) : null;
  let deepDive = detailUsable
    ? buildStockDeepDive(detail, relation)
    : allMissing(detail.meta.generatedAt, entityKey);
  if (relationResult.unavailable && deepDive.availability === 'available') {
    deepDive = { ...deepDive, availability: 'partial' };
  }
  return { deepDive, relation };
}
