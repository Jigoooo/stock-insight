import type {
  DashboardStock,
  DataAvailability,
  ResponseMeta,
  StockAnalysisStatus,
  StockDetail,
  StockDetailResponse,
  StockListItem,
  StockListResponse,
} from '@stock-insight/contracts';

export type DashboardStockView = DashboardStock & {
  entityKey?: string;
  market?: StockListItem['market'];
  dataAvailability?: DataAvailability;
  dataSource?: ResponseMeta['source'];
  analysisStatus?: StockAnalysisStatus;
  lastAnalyzedAt?: string;
};

export type ResolvedStockListForDashboard = {
  stocks: DashboardStockView[];
  source: ResponseMeta['source'];
  availability: DataAvailability;
  isLiveData: boolean;
};

const FALLBACK_PENDING = '구조화 수집중';
const SOURCE_PENDING = '출처 수집중';

function formatEntityId(entityKey: string): string {
  return entityKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function deriveLogo(item: StockListItem, fallback?: DashboardStock): string {
  if (fallback?.logo) return fallback.logo;
  if (item.market === 'US') return item.ticker.slice(0, 3).toUpperCase();
  return item.name.slice(0, 2).toUpperCase();
}

function formatPrice(item: StockListItem): string {
  if (item.latestPrice === undefined || !item.currency) return '가격 수집중';
  if (item.currency === 'KRW') return `₩${Math.round(item.latestPrice).toLocaleString('ko-KR')}`;
  return `$${item.latestPrice.toLocaleString('en-US', {
    maximumFractionDigits: item.latestPrice >= 100 ? 1 : 2,
    minimumFractionDigits: item.latestPrice >= 100 ? 0 : 2,
  })}`;
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatChange(changePct: number | undefined): string {
  if (changePct === undefined) return '등락률 수집중';
  const sign = changePct > 0 ? '+' : '';
  return `${sign}${trimTrailingZeros(changePct.toFixed(2))}%`;
}

function formatKstDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}.${month}.${day}` : undefined;
}

function analysisStatusLabel(status: StockAnalysisStatus): string {
  switch (status) {
    case 'cached':
      return '심층 리포트 보유';
    case 'queued':
      return '분석 대기열';
    case 'running':
      return '분석 진행 중';
    case 'failed':
      return '분석 오류';
    case 'stale':
      return '리포트 갱신 필요';
    case 'none':
      return '분석 대기';
  }
}

function confidenceLabel(confidence: StockListItem['confidence']): string | undefined {
  switch (confidence) {
    case 'high':
      return '신뢰도 높음';
    case 'medium':
      return '신뢰도 중간';
    case 'low':
      return '신뢰도 낮음';
    default:
      return undefined;
  }
}

function findFallbackStock(item: StockListItem, fallback: readonly DashboardStock[]) {
  return fallback.find(
    (stock) =>
      ('entityKey' in stock && stock.entityKey === item.entityKey) ||
      stock.ticker === item.ticker ||
      stock.id === formatEntityId(item.entityKey),
  );
}

function mapStockListItemToDashboardStock(
  item: StockListItem,
  fallback: readonly DashboardStock[],
): DashboardStockView {
  const matchedFallback = findFallbackStock(item, fallback);
  const statusLabel = analysisStatusLabel(item.analysisStatus);
  const analyzedAt = formatKstDate(item.lastAnalyzedAt);
  const confidence = confidenceLabel(item.confidence);
  const positiveNotes = [item.primaryThesis, confidence].filter((text): text is string =>
    Boolean(text),
  );

  return {
    id: formatEntityId(item.entityKey),
    entityKey: item.entityKey,
    market: item.market,
    dataAvailability: 'available',
    dataSource: 'database',
    analysisStatus: item.analysisStatus,
    ...(item.lastAnalyzedAt ? { lastAnalyzedAt: item.lastAnalyzedAt } : {}),
    holding: item.isHolding,
    ticker: item.ticker,
    name: item.name,
    logo: deriveLogo(item, matchedFallback),
    theme: matchedFallback?.theme ?? item.primaryThesis ?? `${item.market} 리서치 후보`,
    price: formatPrice(item),
    change: formatChange(item.changePct),
    stance: statusLabel,
    summary:
      item.primaryThesis ??
      matchedFallback?.summary ??
      `${item.displayName}의 구조화 리서치 요약은 아직 수집 중입니다.`,
    founded: matchedFallback?.founded ?? FALLBACK_PENDING,
    hq: matchedFallback?.hq ?? FALLBACK_PENDING,
    capital: matchedFallback?.capital ?? SOURCE_PENDING,
    shares: matchedFallback?.shares ?? SOURCE_PENDING,
    marketCap: matchedFallback?.marketCap ?? SOURCE_PENDING,
    sales: matchedFallback?.sales ?? SOURCE_PENDING,
    operatingProfit: matchedFallback?.operatingProfit ?? SOURCE_PENDING,
    debtRatio: matchedFallback?.debtRatio ?? SOURCE_PENDING,
    roe: matchedFallback?.roe ?? SOURCE_PENDING,
    segments: matchedFallback?.segments ?? [],
    shareholders: matchedFallback?.shareholders ?? [],
    history: matchedFallback?.history ?? [
      ['수집중', '회사 연혁 구조화 데이터는 아직 준비 중입니다'],
    ],
    positives:
      positiveNotes.length > 0
        ? positiveNotes
        : (matchedFallback?.positives ?? ['확인 포인트 구조화 수집중']),
    risks: matchedFallback?.risks ?? ['리스크 구조화 수집중'],
    review: [
      statusLabel,
      analyzedAt ? `${analyzedAt} 갱신` : '리포트 갱신일 수집중',
      '조회 전용 리서치 데이터이며 주문 기능은 없습니다',
    ],
  };
}

export function resolveStockListForDashboard(
  response: StockListResponse | undefined,
  fallback: readonly DashboardStock[],
): ResolvedStockListForDashboard {
  if (response?.availability === 'available' && response.meta.source === 'database') {
    return {
      stocks: response.data.map((item) => mapStockListItemToDashboardStock(item, fallback)),
      source: response.meta.source,
      availability: response.availability,
      isLiveData: true,
    };
  }

  return {
    stocks: [...fallback],
    source: response?.meta.source ?? 'fallback',
    availability: response?.availability ?? 'collecting',
    isLiveData: false,
  };
}

export function resolveStockDetailForDashboard(
  response: StockDetailResponse | undefined,
): StockDetail | undefined {
  if (response?.availability !== 'available') return undefined;
  if (response.meta.source !== 'database') return undefined;
  return response.data ?? undefined;
}
