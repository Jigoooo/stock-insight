/**
 * 블록 4 가 "무엇을 실었고 무엇을 뺐는가" 를 **한 문장으로** 말하는 자리.
 *
 * ## 왜 별도 파일인가
 *
 * `asset-packet.ts` 는 `@/features/industry-primer` 를 끌어오므로 노드 테스트가
 * 별칭 없이 불러올 수 없다. 이 문구는 라이브에서 이미 한 번 거짓을 말한 적이
 * 있는 자리라 단언으로 못박아야 하고, 그러려면 순수 함수 하나만 있는 모듈이어야
 * 한다. 그래서 타입도 구조적으로만 요구한다 — `RecentEventsView` 가 이 모양을
 * 만족한다.
 *
 * ## 무엇이 틀렸었나
 *
 * 두 화면(above-the-fold 의 "확인된 사건", 사건 탭의 "실린 범위")이 잘림만 보고
 * 제외는 보지 않았다. 그래서 제외를 안은 30개 블록 중 27개가
 * **"N건 전부가 실렸습니다"** 를 그렸다 — 한화오션 1/제외 7, LG유플러스 2/7,
 * 삼성전기 15/8, BGF리테일 1/6. 세어서 남긴 수를 아무도 읽지 않으면 그것은
 * 이유 있는 부재가 아니라 거짓 완결 주장이다.
 *
 * ## 총계가 둘인 이유
 *
 * 빌더가 `withTruncation` 에 넘기는 목록은 **이미 걸러진** 목록이다
 * (`common-asset-view-store.ts` 의 `capped(eligibleEventRows, …)`). 그래서
 * `truncated.total` 에는 제외분이 들어 있지 않고, 관측된 총계는 둘의 합이다.
 * 잘림과 제외가 함께 있을 때 문장을 둘로 쪼개면 서로 다른 두 총계가 나란히
 * 놓이고 어느 쪽이 무엇의 총계인지 읽는 사람이 알 수 없다. 그래서 한 문장이다.
 *
 * ## 낱말
 *
 * "정보 제공 범위를 벗어난" 이라고 쓴다. 이 제품은 매수·매도·목표 수치를
 * 옮기지 않으며(CLAUDE.md), 그 판정의 내부 이름은 화면에 나가지 않는다
 * (UX 헌법 7번).
 */
export type EventCoverageCounts = {
  /** 화면에 실린 사건 수. */
  keptEventCount: number;
  /** 잘림 상한이 말하는 총계. **제외분은 여기 들어 있지 않다.** */
  totalEventCount: number;
  /** 정보 제공 범위를 벗어나 빌더가 제외한 사건 수. */
  excludedEventCount: number;
};

export function describeEventCoverage(counts: EventCoverageCounts): string {
  const { keptEventCount, totalEventCount, excludedEventCount } = counts;
  const observed = totalEventCount + excludedEventCount;
  const truncated = totalEventCount > keptEventCount;

  // 아무것도 없는 자리에 "0건 전부가 실렸습니다" 를 쓰지 않는다. 블록 4 가
  // `not_produced` 인 종목(라이브 297 중 약 120)에서 이 화면이 그리던 문장이고,
  // 완결을 주장할 대상이 없는데 완결을 주장한다는 점에서 "전부가 실렸습니다" 가
  // 안고 있던 문제와 같은 종류다. 바로 위 `BlockStateNotice` 가 이미
  // "만들어진 결과가 없습니다" 를 그리므로 여기서는 사실만 말한다.
  if (observed === 0) return '기록된 사건이 없습니다.';
  if (excludedEventCount === 0) {
    return truncated
      ? `전체 ${totalEventCount}건 중 최근 ${keptEventCount}건만 실렸습니다.`
      : `${keptEventCount}건 전부가 실렸습니다.`;
  }
  if (keptEventCount === 0) {
    // 이 갈래에서만 바로 위에 `no_eligible_source` 고지가 함께 놓인다:
    // "이 항목이 근거로 삼아도 되는 **자료** 자체가 없습니다." 그 위에
    // "**확인된** N건" 이라고 쓰면 같은 화면이 없다/있다로 갈라져 보인다 —
    // `comparability-notice.tsx` 의 "동종" 이 겪은 것과 같은 모양이다.
    // 그래서 여기서는 낱말을 "수집된 사건" 으로 두어 위 문장의 **이유**로
    // 읽히게 한다: 모아 둔 사건은 있지만 근거로 삼아도 되는 것이 없다.
    return `수집된 사건 ${observed}건은 모두 정보 제공 범위를 벗어나 이 화면에 실리지 않았습니다.`;
  }
  return truncated
    ? `확인된 ${observed}건 중 ${excludedEventCount}건은 정보 제공 범위를 벗어나 제외했고, 남은 ${totalEventCount}건에서 최근 ${keptEventCount}건만 실렸습니다.`
    : `확인된 ${observed}건 중 ${keptEventCount}건이 실렸습니다. 정보 제공 범위를 벗어난 ${excludedEventCount}건은 제외했습니다.`;
}
