import type { RadarSignalItem } from '@stock-insight/contracts/research-workspace';

export const MARKET_MODE_IDS = [
  'event_radar',
  'factor_map',
  'propagation_map',
  'theme_community',
  'heatmap_matrix',
  'timeline',
  'map_globe',
  'value_chain',
] as const;

export type MarketModeId = (typeof MARKET_MODE_IDS)[number];
export type MarketModeAvailability = 'available' | 'partial' | 'empty' | 'missing';
export type MarketEvidenceBasis = 'direct' | 'derived_observation' | 'unavailable';

export type MarketModeDefinition = {
  id: MarketModeId;
  title: string;
  shortTitle: string;
  description: string;
  availability: MarketModeAvailability;
  evidenceBasis: MarketEvidenceBasis;
  limitation: string | null;
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
  modes: MarketModeDefinition[];
  signalTypeGroups: SignalTypeGroup[];
  heatmapRows: HeatmapRow[];
  timelineItems: RadarSignalItem[];
};

export type MarketModeDisplayState =
  | { kind: 'content' }
  | { kind: 'empty' | 'missing'; title: string; description: string };

export function describeMarketModeState(mode: MarketModeDefinition): MarketModeDisplayState {
  if (mode.availability === 'missing') {
    return {
      kind: 'missing',
      title: `${mode.title} 데이터 준비 중`,
      description: mode.limitation ?? '시장 신호가 들어오면 이 화면을 채웁니다.',
    };
  }
  if (mode.availability === 'empty') {
    return {
      kind: 'empty',
      title: `${mode.title}에 표시할 신호 없음`,
      description:
        '현재 범위에서 관측된 시장 신호가 없습니다. 원천은 연결되어 있으며 새 신호가 들어오면 이 화면에 표시합니다.',
    };
  }
  return { kind: 'content' };
}

export function marketConnectionLabel(item: Pick<RadarSignalItem, 'watched' | 'holding'>): string {
  const relationships: string[] = [];
  if (item.holding) relationships.push('보유');
  if (item.watched) relationships.push('관심');
  return relationships.join(' · ') || '일반';
}

const MODE_DEFINITIONS: ReadonlyArray<MarketModeDefinition> = [
  {
    id: 'event_radar',
    title: '이벤트 레이더',
    shortTitle: '이벤트',
    description: '서버가 반환한 시장 신호를 강도와 발생 시각 순으로 확인합니다.',
    availability: 'available',
    evidenceBasis: 'direct',
    limitation: null,
  },
  {
    id: 'factor_map',
    title: '팩터 맵',
    shortTitle: '팩터',
    description: '관측된 신호 유형별 대상과 최대 강도를 비교합니다.',
    availability: 'partial',
    evidenceBasis: 'derived_observation',
    limitation: '팩터 노출 계수나 인과 추정값이 아니라 관측 신호 유형의 묶음입니다.',
  },
  {
    id: 'propagation_map',
    title: '전파 맵',
    shortTitle: '전파',
    description: '같은 유형으로 관측된 신호와 종목의 연결 범위를 확인합니다.',
    availability: 'partial',
    evidenceBasis: 'derived_observation',
    limitation: '동일 유형 관측 연결이며 전파 방향이나 인과관계를 뜻하지 않습니다.',
  },
  {
    id: 'theme_community',
    title: '테마 커뮤니티',
    shortTitle: '테마',
    description: '테마 구성원과 커뮤니티 결속도를 비교합니다.',
    availability: 'missing',
    evidenceBasis: 'unavailable',
    limitation: '현재 레이더 응답에 테마 구성원 원천이 연결되지 않았습니다.',
  },
  {
    id: 'heatmap_matrix',
    title: '히트맵 매트릭스',
    shortTitle: '히트맵',
    description: '종목별 신호 강도와 관심·보유 연결 상태를 한눈에 비교합니다.',
    availability: 'available',
    evidenceBasis: 'direct',
    limitation: null,
  },
  {
    id: 'timeline',
    title: '타임라인',
    shortTitle: '시간',
    description: '반환된 신호를 실제 발생 시각의 역순으로 추적합니다.',
    availability: 'available',
    evidenceBasis: 'direct',
    limitation: null,
  },
  {
    id: 'map_globe',
    title: '지도·글로브',
    shortTitle: '지도',
    description: '사건과 기업 노출의 지리적 범위를 탐색합니다.',
    availability: 'missing',
    evidenceBasis: 'unavailable',
    limitation: '검증된 GeoJSON 위치 원천은 P3-D에서 연결됩니다.',
  },
  {
    id: 'value_chain',
    title: '밸류체인',
    shortTitle: '밸류체인',
    description: '공급·수요·생산 관계의 방향과 근거를 확인합니다.',
    availability: 'missing',
    evidenceBasis: 'unavailable',
    limitation: '현재 레이더 응답에는 승인된 공급망 관계가 없습니다.',
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

export function buildMarketOverview(items: RadarSignalItem[]): MarketOverview {
  const hasSignals = items.length > 0;
  return {
    modes: MODE_DEFINITIONS.map((mode) => ({
      ...mode,
      availability:
        hasSignals || mode.evidenceBasis === 'unavailable' ? mode.availability : 'empty',
    })),
    signalTypeGroups: buildSignalTypeGroups(items),
    heatmapRows: items.map((item) => ({
      ...item,
      strengthPercent: Math.round(item.strength * 100),
    })),
    timelineItems: [...items].sort((left, right) =>
      left.occurredAt > right.occurredAt ? -1 : left.occurredAt < right.occurredAt ? 1 : 0,
    ),
  };
}
