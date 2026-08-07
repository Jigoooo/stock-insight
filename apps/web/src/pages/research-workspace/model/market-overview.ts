import type { GeoSnapshot } from '@stock-insight/contracts/geo-api-contract';
import type {
  MarketComponentWatermark,
  MarketComponentWatermarks,
  RadarSignalItem,
} from '@stock-insight/contracts/research-workspace';

export const MARKET_EXPLORATION_IDS = [
  'factor_map',
  'propagation_map',
  'timeline',
  'map_globe',
] as const;

export type MarketExplorationId = (typeof MARKET_EXPLORATION_IDS)[number];
export type MarketExplorationAvailability = 'available' | 'partial' | 'stale' | 'missing' | 'error';

export type MarketExplorationDefinition = {
  id: MarketExplorationId;
  title: string;
  shortTitle: string;
  description: string;
  limitation: string | null;
};

export type MarketExplorationState = Omit<MarketComponentWatermark, 'availability'> & {
  availability: MarketExplorationAvailability;
};

export type SignalTarget = Pick<RadarSignalItem, 'entityKey' | 'name' | 'symbol' | 'market'>;

export type SignalTypeGroup = {
  signalType: string;
  signalCount: number;
  maxStrength: number;
  targets: SignalTarget[];
  semantics: 'observed_association';
};

export type HeatmapRow = RadarSignalItem & { strengthPercent: number };

export type MarketOverview = {
  explorations: ReadonlyArray<MarketExplorationDefinition>;
  signalTypeGroups: SignalTypeGroup[];
  heatmapRows: HeatmapRow[];
  propagationItems: SignalTypeGroup[];
  timelineItems: RadarSignalItem[];
};

const EXPLORATION_DEFINITIONS: ReadonlyArray<MarketExplorationDefinition> = [
  {
    id: 'factor_map',
    title: '요인별 변화',
    shortTitle: '요인',
    description: '관측된 신호 유형별 대상과 강도를 종목 비교표와 함께 살펴봅니다.',
    limitation: '팩터 노출 계수나 인과 추정값이 아니라 관측 신호 유형을 묶은 결과입니다.',
  },
  {
    id: 'propagation_map',
    title: '전파 경로',
    shortTitle: '전파',
    description: '같은 유형으로 관측된 신호에서 연결 대상까지의 범위를 순서대로 확인합니다.',
    limitation: '관측 신호에서 대상 방향으로 정렬한 표현이며 인과관계를 뜻하지 않습니다.',
  },
  {
    id: 'timeline',
    title: '시간 흐름',
    shortTitle: '시간',
    description: '반환된 시장 신호를 실제 발생 시각의 역순으로 추적합니다.',
    limitation: null,
  },
  {
    id: 'map_globe',
    title: '세계 지도',
    shortTitle: '지도',
    description: '검증된 위치 snapshot의 지리적 범위와 정밀도를 확인합니다.',
    limitation: 'WGS84 정본 geometry와 위치별 정밀도·근거 정보를 함께 표시합니다.',
  },
];

function buildSignalTypeGroups(items: RadarSignalItem[]): SignalTypeGroup[] {
  const groups = new Map<string, SignalTypeGroup>();
  for (const item of items) {
    const existing = groups.get(item.signalType);
    const target: SignalTarget = {
      entityKey: item.entityKey,
      name: item.name,
      symbol: item.symbol,
      market: item.market,
    };
    if (!existing) {
      groups.set(item.signalType, {
        signalType: item.signalType,
        signalCount: 1,
        maxStrength: item.strength,
        targets: [target],
        semantics: 'observed_association',
      });
      continue;
    }
    existing.signalCount += 1;
    existing.maxStrength = Math.max(existing.maxStrength, item.strength);
    if (!existing.targets.some(({ entityKey }) => entityKey === item.entityKey)) {
      existing.targets.push(target);
    }
  }
  return [...groups.values()];
}

function normalizeAvailability(
  availability: MarketComponentWatermark['availability'] | GeoSnapshot['availability'],
): MarketExplorationAvailability {
  if (availability === 'empty' || availability === 'unavailable') return 'missing';
  return availability;
}

export function resolveMarketExplorationState(
  explorationId: MarketExplorationId,
  watermarks: MarketComponentWatermarks,
  geoSnapshot?: GeoSnapshot,
): MarketExplorationState {
  if (explorationId !== 'map_globe' || !geoSnapshot) {
    const watermark = watermarks[explorationId];
    return { ...watermark, availability: normalizeAvailability(watermark.availability) };
  }

  const availability = normalizeAvailability(geoSnapshot.availability);
  const hasContent = ['available', 'partial', 'stale'].includes(availability);
  return {
    availability,
    watermarkAt: hasContent ? geoSnapshot.sourceAsOf : null,
    rowCount: hasContent ? geoSnapshot.geojson.features.length : 0,
  };
}

export function marketConnectionLabel(item: Pick<RadarSignalItem, 'watched' | 'holding'>): string {
  const relationships: string[] = [];
  if (item.holding) relationships.push('보유');
  if (item.watched) relationships.push('관심');
  return relationships.join(' · ') || '일반';
}

export function buildMarketOverview(
  items: RadarSignalItem[],
  _geoSnapshot?: GeoSnapshot,
): MarketOverview {
  const signalTypeGroups = buildSignalTypeGroups(items);
  return {
    explorations: EXPLORATION_DEFINITIONS,
    signalTypeGroups,
    heatmapRows: items.map((item) => ({
      ...item,
      strengthPercent: Math.round(item.strength * 100),
    })),
    propagationItems: signalTypeGroups.map((group) => ({
      ...group,
      targets: [...group.targets],
    })),
    timelineItems: [...items].sort((left, right) =>
      left.occurredAt > right.occurredAt ? -1 : left.occurredAt < right.occurredAt ? 1 : 0,
    ),
  };
}
