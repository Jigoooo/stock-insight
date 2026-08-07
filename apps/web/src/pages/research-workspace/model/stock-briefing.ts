import type {
  ImpactBriefPath,
  ImpactBriefResponse,
  StockCompanyMetricGroup,
  StockCompanyProfile,
  StockDetailResponse,
  StockListItem,
  StockListResponse,
} from '@stock-insight/contracts';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

export type StockBriefingSummary = {
  holdingCount: number;
  connectedNewsCount: number | null;
  riskCount: number | null;
  analyzedAt: string | null;
};

export type StockBriefingItem = {
  entityKey: string;
  priority?: 1 | 2 | 3;
  changeSummary: string;
  connectionReason: string;
  newsCount: number;
  primaryPath?: string;
  riskSummary?: string;
};

export type StocksBriefingModel = {
  summary: StockBriefingSummary;
  priorityHoldings: StockBriefingItem[];
  watchlistChanges: StockBriefingItem[];
};

export type StockBriefingDetail = {
  stock: StockListItem;
  generatedAt: string;
  availability: 'available' | 'partial' | 'missing';
  whyNow?: StockBriefingItem;
  paths: Array<{ id: string; label: string; summary?: string }>;
  news: Array<{
    id: string;
    title: string;
    summary?: string;
    sourceName?: string;
    publishedAt?: string;
    url?: string;
  }>;
  risks: string[];
  checkpoints: string[];
  primaryThesis?: string;
  companyProfile?: StockCompanyProfile;
  companyMetrics: StockCompanyMetricGroup[];
  partialFailures: { relation?: string; impact?: string };
};

export type StockBriefingLoadResult = {
  detail: StockBriefingDetail;
  relation: EntityRelationGraph | null;
};

export type StockBriefingLoader = (entityKey: string) => Promise<StockBriefingLoadResult>;

type StockBriefingLoaders = {
  loadDetail: (entityKey: string) => Promise<StockDetailResponse>;
  loadRelation: (entityKey: string) => Promise<EntityRelationGraph>;
  loadImpactBrief?: (entityKey: string) => Promise<ImpactBriefResponse>;
  whyNow?: StockBriefingItem;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류';
}

function latestAnalyzedAt(stocks: StockListItem[]): string | null {
  return (
    stocks
      .filter(({ isHolding, lastAnalyzedAt }) => isHolding && lastAnalyzedAt !== undefined)
      .map(({ lastAnalyzedAt }) => lastAnalyzedAt!)
      .sort((left, right) => right.localeCompare(left))[0] ?? null
  );
}

/**
 * Normalize server- or fixture-provided briefing lanes without inventing a
 * browser-side priority score. A stock already selected as a priority is not
 * repeated in the changed-watchlist lane.
 */
export function createStocksBriefingModel(model: StocksBriefingModel): StocksBriefingModel {
  const priorityKeysSeen = new Set<string>();
  const priorityHoldings = model.priorityHoldings
    .filter(({ entityKey }) => {
      if (priorityKeysSeen.has(entityKey)) return false;
      priorityKeysSeen.add(entityKey);
      return true;
    })
    .slice(0, 3);
  const priorityKeys = new Set(priorityHoldings.map(({ entityKey }) => entityKey));
  const watchlistKeys = new Set<string>();
  return {
    summary: model.summary,
    priorityHoldings,
    watchlistChanges: model.watchlistChanges.filter(({ entityKey }) => {
      if (priorityKeys.has(entityKey) || watchlistKeys.has(entityKey)) return false;
      watchlistKeys.add(entityKey);
      return true;
    }),
  };
}

/**
 * The stock-list response currently proves only holdings and analysis recency.
 * News/risk totals and priority ordering stay unavailable until a server-owned
 * briefing read model supplies them.
 */
export function buildStocksBriefingModel(response: StockListResponse): StocksBriefingModel {
  const stocks = response.data ?? [];
  return {
    summary: {
      holdingCount: stocks.filter(({ isHolding }) => isHolding).length,
      connectedNewsCount: null,
      riskCount: null,
      analyzedAt: latestAnalyzedAt(stocks),
    },
    priorityHoldings: [],
    watchlistChanges: [],
  };
}

const IMPACT_EVENT_LABELS: Readonly<Record<string, string>> = {
  supply_disruption: '공급 차질',
  capex_increase: '설비 투자 확대',
  ma_deal: '인수·합병',
  regulation: '규제',
  earnings: '실적 발표',
  sec_8k: '수시 공시',
  policy_event: '정책',
  analyst: '애널리스트 의견',
  insider_trade: '내부자 거래',
  macro_shock: '거시 충격',
  legal_action: '법적 조치',
};

function pathSummary(path: ImpactBriefPath): string {
  const event = IMPACT_EVENT_LABELS[path.eventType] ?? path.eventType;
  return `${event} · 관계 ${path.hopCount}단계 · 연결 강도 ${path.pathScore.toFixed(2)}`;
}

function briefingPaths(response: ImpactBriefResponse | null) {
  if (!response?.data) return [];
  return response.data.paths
    .slice()
    .sort((left, right) => right.pathScore - left.pathScore)
    .slice(0, 3)
    .map((path) => ({
      id: `impact-${path.impactPathV2Id}`,
      label: path.sourceName ?? `${path.hopCount}단계 떨어진 기업`,
      summary: pathSummary(path),
    }));
}

function assertUsableDetail(entityKey: string, response: StockDetailResponse) {
  if (response.availability === 'error') {
    throw new Error(response.error?.message ?? 'Stock detail response reported an error');
  }
  if (
    response.data === null ||
    response.availability === 'missing' ||
    response.availability === 'unsupported'
  ) {
    throw new Error(`Stock detail unavailable for ${entityKey}`);
  }
  if (response.data.stock.entityKey !== entityKey) {
    throw new Error(
      `Stock detail identity mismatch: requested ${entityKey}, received ${response.data.stock.entityKey}`,
    );
  }
  return response.data;
}

export async function loadStockBriefingData(
  entityKey: string,
  loaders: StockBriefingLoaders,
): Promise<StockBriefingLoadResult> {
  const [detailResponse, relationResult, impactResult] = await Promise.all([
    loaders.loadDetail(entityKey),
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
  const detail = assertUsableDetail(entityKey, detailResponse);
  const partialFailures: StockBriefingDetail['partialFailures'] = {};

  let relation = relationResult.value;
  if (relationResult.error !== undefined) {
    partialFailures.relation = relationResult.error;
  } else if (relation && relation.rootEntityKey !== entityKey) {
    partialFailures.relation = `Stock relation identity mismatch: requested ${entityKey}, received ${relation.rootEntityKey}`;
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

  const hasPartialFailure = Object.keys(partialFailures).length > 0;
  return {
    relation,
    detail: {
      stock: detail.stock,
      generatedAt: detailResponse.meta.generatedAt,
      availability:
        hasPartialFailure || detailResponse.availability !== 'available' ? 'partial' : 'available',
      whyNow: loaders.whyNow,
      paths: briefingPaths(impact),
      news: detail.relatedNews.slice(0, 3).map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.context,
      })),
      risks: detail.risks,
      checkpoints: detail.checkpoints,
      primaryThesis: detail.stock.primaryThesis,
      companyProfile: detail.companyProfile,
      companyMetrics: detail.companyMetrics ?? [],
      partialFailures,
    },
  };
}
