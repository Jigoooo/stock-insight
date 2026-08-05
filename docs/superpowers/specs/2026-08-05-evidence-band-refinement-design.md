# 6A Evidence Band A/B/C 개선 설계

## 배경

6A Charts End-to-End의 첫 시각 비교에서 사용자는 Market Tape A/B/C와 Candle Ledger A/B/C를
모두 유지하기로 승인했다. Evidence Band는 세 시안 모두 가격선, 조건 구간, 사건 marker, 근거
목록을 제공하지만 실제 차트 내부의 의미 계층이 거의 같아 A/B/C의 차이가 주변 레이아웃에만
머무르고, 다음 문제가 함께 확인됐다.

- 조건 구간 label이 plot 위에 분리된 chip처럼 놓여 차트 범례보다 필터처럼 보인다.
- pattern과 dashed edge가 가격선보다 먼저 읽혀 주가 경로와 사건의 관계를 가린다.
- marker와 근거 목록이 같은 선택 상태를 공유하더라도 시각적으로 직접 연결돼 보이지 않는다.
- A/B/C가 각각 구간, 사건, 연결 분석이라는 이름을 갖지만 실제 읽기 순서는 거의 같다.

이번 개선은 새로운 차트 기능을 추가하는 작업이 아니라, 같은 fixture와 같은 상호작용을 세 가지
명확한 분석 방식으로 재배치하는 작업이다.

## 승인 결정

다음 세 접근을 비교했다.

1. **의미 분리**: A는 조건 구간, B는 사건 시점, C는 차트와 근거의 연결 분석을 우선한다.
2. **TradingView primitive 전환**: Evidence Band도 Lightweight Charts custom primitive와 series
   marker로 다시 구현한다.
3. **현재 구조 보정**: 기존 구조를 유지하고 opacity, pattern, 간격만 조절한다.

사용자는 첫 번째 접근을 승인했다. 기존 Bklit 경계를 유지하고 새 의존성을 추가하지 않는다.
TradingView primitive 전환은 custom hit testing과 renderer 중복을 늘리므로 이번 범위에서 제외한다.
단순 보정만으로는 세 시안의 역할 차이가 약한 문제가 남으므로 채택하지 않는다.

## 공통 시각 계층

세 시안은 같은 데이터와 선택 상태를 공유하되 다음 우선순위를 지킨다.

1. **가격 경로**: 가장 밝고 연속적인 선으로 항상 첫 번째 데이터 층을 형성한다.
2. **현재 시안의 주 정보**: A의 조건 구간, B의 사건 marker, C의 선택 연결선이다.
3. **보조 정보**: 나머지 band, marker, grid, 축과 근거 metadata다.

ReferenceArea는 series 뒤의 underlay로만 사용한다. 넓은 pattern carpet은 제거하고 낮은 alpha의 단색
면, 얇은 경계, 필요한 경우에만 짧은 fade edge로 표현한다. 구간 이름은 plot 위의 별도 chip 열에서
제거하고 해당 구간 시작점 또는 plot 내부의 작은 범례로 이동한다.

가격선, 조건 구간, 사건 marker는 색상 하나에만 의존하지 않는다. 구간은 면과 edge, 사건은 점과
stem, 선택은 ring과 rail을 함께 사용한다.

## A — Range Ledger

A는 조건 구간의 시작과 끝, 가격 경로가 그 구간을 통과한 방식을 먼저 읽는 시안이다.

- 조건 구간은 낮은 opacity의 단색 underlay와 1px 경계로 표현한다.
- 구간 label은 plot 안쪽 시작 모서리에 붙이고 장식적인 dashed chip은 제거한다.
- 선택하지 않은 사건 marker는 작은 중립 점으로 낮추고 선택 marker만 ring을 표시한다.
- 차트 아래 근거 목록은 날짜순 3열 카드 대신 한 줄씩 읽는 compact ledger로 배치한다.
- ledger 행에는 날짜, tone, 제목, 출처 수를 유지하고 선택 행은 왼쪽 rail로 표시한다.
- 구간 표시 토글을 끄면 label과 edge도 함께 사라지고 가격선과 사건만 남는다.

첫 ready 진입에서는 band opacity만 짧게 나타난다. 가격선과 marker는 부모 rerender 때 다시
재생하지 않는다.

## B — Event Pulse

B는 어떤 사건이 어느 시점에 발생했고 당시 가격 경로가 어디에 있었는지를 먼저 읽는 시안이다.

- 기본 상태의 조건 구간은 A보다 더 희미한 context underlay로 둔다.
- 사건은 timestamp에 붙은 20~24px marker와 짧은 vertical stem으로 표시한다.
- 선택 사건은 marker ring, 해당 시점 vertical guide, 가격선의 교차점으로 동시에 표시한다.
- 우측 근거 목록은 marker와 같은 tone·날짜·제목·출처 수를 사용하고 선택 즉시 동기화한다.
- 선택 tooltip은 사건 제목과 가격 readout을 한 표면에서 보여주되 plot을 넓게 가리지 않는다.
- 사건 marker 자체를 모두 tab stop으로 만들지 않고 keyboard 탐색은 근거 목록이 소유한다.

첫 ready 진입에서 marker가 짧게 나타날 수 있지만 반복 pulse와 glow는 사용하지 않는다. 선택 전환은
위치를 움직이지 않고 opacity, ring, guide만 180ms 이내에 바꾼다.

## C — Linked Evidence

C는 차트와 근거 원장을 같은 분석 표면으로 연결하는 시안이다.

- 데스크톱은 차트 약 65%, 근거 원장 약 35%의 2열 split을 사용한다.
- plot과 근거 원장은 같은 높이를 갖고 목록만 내부 세로 스크롤을 소유한다.
- 선택 행은 왼쪽 rail, 차트의 vertical guide, marker ring에서 같은 tone으로 확인된다.
- 고정된 선택 요약에는 날짜, 사건 제목, 당시 가격, 출처 수만 표시해 중복 문장을 만들지 않는다.
- 조건 구간 범례는 plot 좌상단에 compact legend로 통합하고 별도 label 행을 만들지 않는다.
- 목록 선택으로 현재 visible domain 밖의 사건을 열면 확대율을 유지한 채 시점만 이동한다.

900px 이하에서는 차트 다음 근거 원장 순서로 적층한다. 두 영역을 연결하는 수직 divider는 제거하고
선택 rail과 동일한 tone의 짧은 상단 경계로 관계를 유지한다.

## 상호작용과 상태

- `range`, `visibleDomain`, `selectedEvidenceId`, 조건 구간 표시 여부는 기존처럼 A/B/C가 공유한다.
- 목록 선택과 marker 선택은 같은 callback을 사용하고 한 시안에서 선택한 근거가 다른 시안에도
  반영된다.
- brush 또는 기간 변경 후 선택 사건이 범위 밖이면 선택 ID를 유지하되 해당 시안에서 범위 밖임을
  알리는 작은 상태를 제공한다. 사용자가 사건을 다시 선택하면 확대율을 유지한 채 domain을 옮긴다.
- loading, stale, partial, empty, error, unavailable 상태는 기존 ChartFrame 계약과 고정 높이를
  유지한다.
- 조건 구간이 없거나 timestamp가 없는 근거를 시각적으로 만들어내지 않는다.

## 반응형·접근성·모션

- 390px에서 chart viewport와 근거 목록이 페이지 가로 overflow를 만들지 않는다.
- 축 글자는 11px 아래로 줄이지 않고 긴 근거 제목은 두 줄 이후 잘림과 전체 accessible name을 함께
  제공한다.
- 근거 목록 행의 pointer target은 최소 44px를 유지한다.
- 선택 상태는 `aria-current` 또는 동등한 명시적 상태와 visible rail을 함께 제공한다.
- 데이터 표 disclosure와 keyboard 경로를 유지한다.
- `prefers-reduced-motion`에서는 band fade, marker enter, guide 전환을 즉시 적용한다.
- 자동 반복 pulse, glow, parallax, spring overshoot를 사용하지 않는다.

## 구현 경계

- `apps/web/src/pages/ui-lab/ui/evidence-band-preview.tsx`와
  `apps/web/src/pages/ui-lab/ui/chart-catalog.module.css`의 목업 표현을 우선 수정한다.
- repository-owned Bklit wrapper에서 필요한 prop만 조정하고
  `apps/web/src/shared/ui/chart/vendor/bklit`의 upstream source는 수정하지 않는다.
- Evidence Band의 공개 `shared/ui/chart` API와 제품 연결은 개선 목업의 사용자 시각 승인 이후에만
  진행한다.
- Market Tape와 Candle Ledger의 승인된 A/B/C 표현은 이번 개선에서 변경하지 않는다.
- 새 차트·애니메이션 의존성을 추가하지 않는다.

## 좁은 검증

목업 개선 단계에서는 다음 검증만 수행한다.

1. Evidence Band 전용 source contract
2. web typecheck와 변경 파일 format·lint
3. 전용 Playwright에서 A/B/C 3개 렌더링, 목록·marker 선택 동기화, 조건 구간 토글
4. 390px overflow, reduced motion, Axe smoke
5. Codex 인앱 브라우저에서 가격선 우선순위, A/B/C 역할 차이, C split 높이와 모바일 적층 확인

전체 release gate와 제품 사용처 회귀는 6A 공용화·제품 연결이 끝난 묶음 종료 시점에 실행한다.

## 승인 기준

- A는 조건 구간, B는 사건 시점, C는 연결 분석이라는 차이가 설명 없이도 보인다.
- 세 시안 모두 가격선이 pattern이나 marker보다 먼저 읽힌다.
- 근거 목록을 선택하면 해당 시점과 선택 상태가 즉시 연결돼 보인다.
- plot 위에 분리된 조건 구간 chip 열이 남지 않는다.
- Market Tape와 Candle Ledger의 승인된 표현에는 회귀가 없다.

## 참고 자료

- Bklit Reference Area: <https://bklit.com/docs/utility/reference-area>
- Bklit Composed Chart: <https://bklit.com/docs/components/composed-chart>
- TradingView Lightweight Charts Series Markers:
  <https://tradingview.github.io/lightweight-charts/tutorials/how_to/series-markers>
- TradingView Lightweight Charts Series Primitives:
  <https://tradingview.github.io/lightweight-charts/docs/plugins/series-primitives>
