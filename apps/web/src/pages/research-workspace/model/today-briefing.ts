import type {
  ResearchFeedItem,
  ResearchFeedLaneId,
  WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

export type SampleMarketIndicator = {
  id: 'kospi' | 'nasdaq' | 'gold';
  label: string;
  value: string;
  change: string;
  direction: 'up' | 'down';
  dataState: 'sample';
  basisLabel: string;
};

export const sampleMarketIndicators: readonly SampleMarketIndicator[] = [
  {
    id: 'kospi',
    label: 'KOSPI',
    value: '2,845.12',
    change: '+0.62%',
    direction: 'up',
    dataState: 'sample',
    basisLabel: '화면 구성 확인용 예시',
  },
  {
    id: 'nasdaq',
    label: 'NASDAQ',
    value: '17,862.23',
    change: '-0.18%',
    direction: 'down',
    dataState: 'sample',
    basisLabel: '화면 구성 확인용 예시',
  },
  {
    id: 'gold',
    label: '금',
    value: '$2,418.70',
    change: '+0.31%',
    direction: 'up',
    dataState: 'sample',
    basisLabel: '화면 구성 확인용 예시',
  },
] as const;

export type TodayBriefing = {
  headlineItems: ResearchFeedItem[];
  curatedItems: ResearchFeedItem[];
  listItems: ResearchFeedItem[];
  connectionItems: ResearchFeedItem[];
};

function laneItems(data: WorkspaceToday, lane: ResearchFeedLaneId): ResearchFeedItem[] {
  return data.lanes.find((item) => item.lane === lane)?.items ?? [];
}

export function deriveTodayBriefing(
  data: WorkspaceToday,
  visibleItems: ResearchFeedItem[],
): TodayBriefing {
  const headlineItems = laneItems(data, 'must_know').slice(0, 3);
  const headlineKeys = new Set(headlineItems.map(({ recordKey }) => recordKey));
  const curatedItems = laneItems(data, 'for_you')
    .filter(
      (item) =>
        !headlineKeys.has(item.recordKey) &&
        (item.relevance.kind === 'direct' || item.relevance.kind === 'related'),
    )
    .slice(0, 4);
  const featuredKeys = new Set([
    ...headlineKeys,
    ...curatedItems.map(({ recordKey }) => recordKey),
  ]);
  const listItems = visibleItems.filter((item) => !featuredKeys.has(item.recordKey));

  return {
    headlineItems,
    curatedItems,
    listItems,
    connectionItems: [...curatedItems, ...headlineItems].slice(0, 3),
  };
}
