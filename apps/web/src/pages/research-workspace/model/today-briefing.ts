import type {
  ResearchFeedItem,
  ResearchFeedLaneId,
  WorkspaceToday,
} from '@stock-insight/contracts/research-workspace';

/*
  `SampleMarketIndicator` 와 `sampleMarketIndicators`(KOSPI·NASDAQ·금 세 줄)가
  여기 있었다. 「오늘의 시장 요약」이 정본 01 §2 네 축(금리·FX·원자재·정책)의
  실데이터로 바뀌면서 화면에서 빠졌고, export 와 그것을 단언하던 테스트만
  남았다 — 오늘 지운 mock 들과 같은 모양이라 함께 내린다.
*/

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
    /*
      **이미 보여준 것을 다시 보여주지 않는다.**

      이 자리는 `[...curatedItems, ...headlineItems].slice(0, 3)` 이었다. 그 세
      항목은 바로 위 두 패널에 이미 그려진 것들이라 한 화면에서 같은 뉴스가
      **세 번** 나왔다. 정본 01 §2 는 이 자리에 "공통 opportunity 후보 + 왜 지금"
      을 요구하는데(REQ-PROD-011), 앞 패널의 재탕은 후보도 새 정보도 아니다.

      아직 안 보여준 항목에서 뽑는다. 이 패널이 실제로 말하는 것은
      `whySurfacedLabel()` — "이것이 왜 당신에게 닿았는가" 이고 그 문장은 어느
      항목에나 성립하므로, 아직 안 본 연결을 보여주는 편이 목적에 맞는다.

      남은 항목이 없으면 **비운다.** 채우려고 위를 다시 가져오는 순간 원래
      결함으로 돌아간다 — 화면은 이미 그 경우의 빈 상태 문구를 갖고 있다.

      정본이 요구하는 opportunity 후보 자체는 아직 생산자가 없다. 이 수정은 그
      자리를 만드는 것이 아니라 **거짓 채움을 멈추는 것**이다.
    */
    connectionItems: listItems.slice(0, 3),
  };
}
