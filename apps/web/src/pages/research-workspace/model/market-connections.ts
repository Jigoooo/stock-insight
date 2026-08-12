import { signalTypeLabel } from '../ui/workspace-presenters.ts';

import type { ImpactBriefPath, ImpactBriefResponse } from '@stock-insight/contracts';
import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type {
  EntityRelationGraph,
  RadarSignalPage,
} from '@stock-insight/contracts/research-workspace';

export type MarketConnectionStrength = 'high' | 'medium' | 'low';
export type MarketConnectionScope = 'holding' | 'watchlist' | 'indirect' | 'market';

export type MarketConnectionSummary = {
  changeCount: number;
  directConnectionCount: number | null;
  riskCount: number | null;
  analyzedAt: string | null;
};

export type MarketConnectionItem = {
  connectionKey: string;
  priority?: 1 | 2 | 3;
  market: 'KR' | 'US' | 'GLOBAL';
  regionLabel?: string;
  title: string;
  summary: string;
  whyNow?: string;
  scope: MarketConnectionScope;
  strength: MarketConnectionStrength;
  rawStrength?: number;
  occurredAt: string;
  connectedEntities: Array<{
    entityKey: string;
    displayName: string;
    holding: boolean;
    watched: boolean;
  }>;
  primaryPath?: string;
  riskSummary?: string;
};

export type MarketConnectionsModel = {
  summary: MarketConnectionSummary;
  priorityChanges: MarketConnectionItem[];
  marketChanges: MarketConnectionItem[];
};

export type MarketConnectionDetail = {
  item: MarketConnectionItem;
  generatedAt: string;
  availability: 'available' | 'partial' | 'missing';
  evidenceLevel?: 'high' | 'medium' | 'low';
  paths: Array<{ id: string; label: string; summary?: string }>;
  sources: Array<{
    id: string;
    title: string;
    summary?: string;
    sourceName?: string;
    publishedAt?: string;
    url?: string;
  }>;
  /*
    `risks` · `counterEvidence` · `checkpoints` 가 여기 있었다. 셋 다 `[]` 로
    초기화된 뒤 최종 반환이 `availability`·`paths`·`partialFailures` 만 덮어
    **프로덕션에서 영원히 빈 배열**이었다. 그런데 프리뷰 픽스처는 셋을 채웠고,
    inspector 는 "반대 근거와 확인할 리스크" 라는 제목으로 그것을 그렸다.
    사용자는 결코 볼 수 없는 화면을 프리뷰와 e2e 만 보고 있었던 셈이다.

    죽은 코드보다 나쁘다 — 죽은 코드는 아무것도 주장하지 않는데 이쪽은 제품이
    가진 적 없는 기능을 프리뷰에서 보여줬다. 미검증 고지로 감싸는 것도 답이
    아니다. 그러면 "처리했다"는 기록만 남고 다음 사람이 그것을 완료로 읽는다.

    되살리려면 필드가 아니라 **생산자**가 먼저다. 정본 01 §3 항목 9 의
    catalyst/risk/invalidation 은 `knowledge.assertion` 이 `extracted` 를 벗어나
    블록 10 이 `available` 이 되는 경로로 오지, 이 모델의 빈 배열로 오지 않는다.
  */
  relatedEvents: MarketConnectionItem[];
  partialFailures: {
    relation?: string;
    impact?: string;
    geo?: string;
    history?: string;
  };
};

export type MarketConnectionLoadResult = {
  detail: MarketConnectionDetail;
  geo?: GeoSnapshot | null;
  relation: EntityRelationGraph | null;
};

export type MarketConnectionLoader = (connectionKey: string) => Promise<MarketConnectionLoadResult>;

export type RadarSignalItem = RadarSignalPage['items'][number];

type MarketConnectionLoaders = {
  loadRelation: (entityKey: string) => Promise<EntityRelationGraph>;
  loadImpactBrief?: (entityKey: string) => Promise<ImpactBriefResponse>;
};

export function marketConnectionStrength(rawStrength: number): MarketConnectionStrength {
  if (rawStrength >= 0.67) return 'high';
  if (rawStrength >= 0.34) return 'medium';
  return 'low';
}

export function marketConnectionScope(
  signal: Pick<RadarSignalItem, 'holding' | 'watched'>,
): MarketConnectionScope {
  if (signal.holding) return 'holding';
  if (signal.watched) return 'watchlist';
  return 'market';
}

export function marketConnectionStrengthLabel(value: MarketConnectionStrength): string {
  return { high: '강함', medium: '보통', low: '낮음' }[value];
}

export function marketConnectionScopeLabel(value: MarketConnectionScope): string {
  return {
    holding: '보유종목',
    watchlist: '관심종목',
    indirect: '간접 연결',
    market: '시장 전반 변화',
  }[value];
}

type MarketConnectionGeoPrecision =
  GeoSnapshot['geojson']['features'][number]['properties']['precisionClass'];

export function marketConnectionGeoPrecisionLabel(value: MarketConnectionGeoPrecision): string {
  return {
    exact: '정확한 위치',
    approximate: '근사 위치',
    admin_area: '행정구역',
    country: '국가 범위',
    unknown: '정밀도 미확인',
  }[value];
}

export function hasMarketConnectionGeoSection(
  geo: GeoSnapshot | null | undefined,
  failure: string | undefined,
): boolean {
  return Boolean(geo?.geojson.features.length || failure);
}

export function createMarketConnectionsModel(
  model: MarketConnectionsModel,
): MarketConnectionsModel {
  const seenPriorityKeys = new Set<string>();
  const priorityChanges = model.priorityChanges
    .filter(({ connectionKey }) => {
      if (seenPriorityKeys.has(connectionKey)) return false;
      seenPriorityKeys.add(connectionKey);
      return true;
    })
    .slice(0, 3);
  const priorityKeys = new Set(priorityChanges.map(({ connectionKey }) => connectionKey));
  const marketKeys = new Set<string>();
  const marketChanges = model.marketChanges.filter(({ connectionKey }) => {
    if (priorityKeys.has(connectionKey) || marketKeys.has(connectionKey)) return false;
    marketKeys.add(connectionKey);
    return true;
  });

  return { summary: model.summary, priorityChanges, marketChanges };
}

function radarSignalToMarketConnection(signal: RadarSignalItem): MarketConnectionItem {
  return {
    connectionKey: signal.signalKey,
    market: signal.market,
    title: `${signal.name} · ${signalTypeLabel(signal.signalType)}`,
    summary: signal.summary,
    scope: marketConnectionScope(signal),
    strength: marketConnectionStrength(signal.strength),
    rawStrength: signal.strength,
    occurredAt: signal.occurredAt,
    connectedEntities: [
      {
        entityKey: signal.entityKey,
        displayName: signal.name,
        holding: signal.holding,
        watched: signal.watched,
      },
    ],
  };
}

export function buildMarketConnectionsModel(page: RadarSignalPage): MarketConnectionsModel {
  const items = page.items.map(radarSignalToMarketConnection);
  const priorityChanges = items
    .filter((_, index) => page.items[index]?.holding || page.items[index]?.watched)
    .slice(0, 3)
    .map((item, index) => ({ ...item, priority: (index + 1) as 1 | 2 | 3 }));
  const priorityKeys = new Set(priorityChanges.map(({ connectionKey }) => connectionKey));

  return createMarketConnectionsModel({
    summary: {
      changeCount: page.scopeTotal,
      directConnectionCount: null,
      riskCount: null,
      analyzedAt: page.signalAsOf,
    },
    priorityChanges,
    marketChanges: items.filter(({ connectionKey }) => !priorityKeys.has(connectionKey)),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류';
}

function impactPaths(response: ImpactBriefResponse | null) {
  if (!response?.data) return [];
  return response.data.paths
    .slice()
    .sort((left, right) => right.pathScore - left.pathScore)
    .slice(0, 3)
    .map((path: ImpactBriefPath) => ({
      id: `impact-${path.impactPathV2Id}`,
      label: path.sourceName ?? `${path.hopCount}단계 연결`,
      summary: path.note,
    }));
}

export async function loadMarketConnectionData(
  signal: RadarSignalItem,
  loaders: MarketConnectionLoaders,
): Promise<MarketConnectionLoadResult> {
  const item = radarSignalToMarketConnection(signal);
  const entityKey = item.connectedEntities[0]!.entityKey;
  const baseDetail: MarketConnectionDetail = {
    item,
    generatedAt: signal.occurredAt,
    availability: 'available',
    paths: [],
    sources:
      signal.sourceName === null
        ? []
        : [
            {
              id: `radar-${signal.signalKey}`,
              title: item.title,
              summary: signal.summary,
              sourceName: signal.sourceName,
              publishedAt: signal.occurredAt,
            },
          ],
    relatedEvents: [],
    partialFailures: {},
  };

  const [relationResult, impactResult] = await Promise.all([
    loaders
      .loadRelation(entityKey)
      .then((value) => ({ value, error: undefined }))
      .catch((error: unknown) => ({ value: null, error: errorMessage(error) })),
    loaders.loadImpactBrief === undefined
      ? Promise.resolve({ value: null, error: undefined })
      : loaders
          .loadImpactBrief(entityKey)
          .then((value) => ({ value, error: undefined }))
          .catch((error: unknown) => ({ value: null, error: errorMessage(error) })),
  ]);
  const partialFailures: MarketConnectionDetail['partialFailures'] = {};

  let relation = relationResult.value;
  if (relationResult.error !== undefined) {
    partialFailures.relation = relationResult.error;
  } else if (relation && relation.rootEntityKey !== entityKey) {
    partialFailures.relation = `Market relation identity mismatch: requested ${entityKey}, received ${relation.rootEntityKey}`;
    relation = null;
  }

  let impact = impactResult.value;
  if (impactResult.error !== undefined) {
    partialFailures.impact = impactResult.error;
  } else if (impact?.availability === 'error') {
    partialFailures.impact = impact.error?.message ?? 'Impact brief response reported an error';
    impact = null;
  } else if (impact?.data && impact.data.entityKey !== entityKey) {
    partialFailures.impact = `Impact brief identity mismatch: requested ${entityKey}, received ${impact.data.entityKey}`;
    impact = null;
  }

  return {
    geo: null,
    relation,
    detail: {
      ...baseDetail,
      availability: Object.keys(partialFailures).length > 0 ? 'partial' : 'available',
      paths: impactPaths(impact),
      partialFailures,
    },
  };
}
