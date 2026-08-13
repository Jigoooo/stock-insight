/**
 * 늦게 도착한 응답이 화면을 덮어쓰지 못하게 하는 세대 카운터.
 *
 * `StocksView` 가 종목을 빠르게 바꾸면 이전 요청이 나중에 돌아와 지금 고른
 * 종목의 브리핑을 덮는다. 각 요청이 자기 세대 번호를 들고 나가고, 돌아왔을 때
 * `isCurrent` 로 자기가 아직 최신인지 묻는다. 언마운트 때는 `invalidate` 로
 * 남은 응답을 전부 무효로 만든다.
 *
 * 이 모듈이 따로 있는 이유: 원래 `stock-deep-dive.ts` 안에 살았는데, 그 파일의
 * 나머지(12섹션 기계)는 `pages/asset-deep-dive` 의 11탭 × CAV 12블록에 대체돼
 * 렌더되지 않는 채 남아 있었다. 그 기계를 걷어내면서 **유일하게 살아 있는
 * 이 함수**를 함께 잃지 않도록 먼저 옮겼다.
 */
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
