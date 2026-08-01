# Stock Insight 하이브리드 리서치 차트 설계

## 목표

승인된 Market Graphite UI 안에 정적인 장식이 아니라 실제 탐색 가능한 리서치 차트 계층을
추가한다. A와 B는 Bklit 원본 registry 컴포넌트를 사용하고, C 캔들 차트만 TradingView
Lightweight Charts를 사용한다.

이번 설계가 고정하는 세 가지 차트는 다음과 같다.

- A `Market Tape`: 종가 흐름을 빠르게 훑는 Bklit Area Chart.
- B `Evidence Band`: 가격 흐름, 조건 구간, 근거 사건을 함께 읽는 Bklit Area 또는 Composed
  Chart.
- C `Candle Ledger`: OHLC와 거래량을 정밀하게 탐색하는 TradingView Lightweight Charts.

“움직인다”는 자동 갱신이나 장식용 반복 재생이 아니라 hover, crosshair, tooltip, 기간 변경,
범위 brush, 선택 연동, zoom, pan에 즉시 반응한다는 뜻이다. 라이브 시세 스트리밍과 자동으로
흘러가는 차트는 이번 범위에서 제외한다.

## 현재 저장소 기준

- 프런트엔드에는 아직 차트 런타임이나 차트 컴포넌트가 없다.
- 계약에는 이미 `PriceSeriesRange = 1M | 3M | 6M | 1Y`와 일봉 OHLCV `PriceBar`가 있다.
  차트용 별도 API 계약을 중복해서 만들지 않는다.
- `apps/web/components.json`은 shadcn registry와 FSD `shared/ui` 출력 경계를 이미 갖고 있다.
  여기에 Bklit registry namespace만 추가한다.
- Market Graphite는 `--chart-1`부터 `--chart-5`까지 의미 토큰을 제공한다. 차트는 이 토큰을
  원색 팔레트로 덮지 않는다.
- 공용 UI는 `apps/web/src/shared/ui/<component>` 단위로 공개된다. 제품 페이지는 Bklit 내부
  파일이나 `lightweight-charts`를 직접 import하지 않는다.

## 소스 선택과 책임

| 시안 | 공용 컴포넌트 | 구현 기준 | 핵심 상호작용 |
| --- | --- | --- | --- |
| A | `ResearchAreaChart` | Bklit `AreaChart`, `Area`, `Grid`, 축, `ChartTooltip`, `ChartBrushLayout`, `ChartBrush` | crosshair, point tooltip, 기간 변경, brush 범위 이동·확대·축소 |
| B | `ResearchEvidenceChart` | Bklit `ComposedChart`, `Area`, `ReferenceArea`, `useChart` 기반 marker layer, tooltip, brush | A의 동작 + 사건 marker 선택 + 우측 근거 목록 양방향 연동 |
| C | `ResearchCandlestickChart` | Lightweight Charts `CandlestickSeries`, `HistogramSeries` | crosshair, wheel zoom, drag pan, 기간 변경, OHLC·거래량 tooltip |

Bklit는 패키지형 Provider가 아니라 shadcn registry를 통해 소스 파일을 저장소 안으로 가져온다.
공식 설치 방식대로 `@bklit` registry item을 추가하되, 필요한 Area/Composed/Brush/Reference
Area 계층만 이식한다. Bklit Studio 코드는 사용하지 않는다.

Lightweight Charts는 캔들 렌더러로만 설치한다. 카드, 버튼, tooltip 외형, 기간 선택기, 상태 UI,
근거 목록은 저장소 공용 컴포넌트가 소유한다.

## FSD 구조

```text
apps/web/src/shared/ui/chart/
├── index.ts
├── model/
│   └── chart-types.ts
├── lib/
│   ├── adapt-price-series.ts
│   ├── chart-formatters.ts
│   └── chart-summary.ts
├── ui/
│   ├── chart-frame.tsx
│   ├── chart-state.tsx
│   ├── chart-data-table.tsx
│   ├── research-area-chart.tsx
│   ├── research-evidence-chart.tsx
│   └── research-candlestick-chart.tsx
├── vendor/
│   └── bklit/
│       └── 공식 registry가 생성한 최소 차트 소스
└── chart.module.css
```

- `vendor/bklit`은 upstream 소스 경계다. import 경로와 프로젝트 토큰 연결 외의 임의 재작성은
  하지 않는다.
- `lib`은 계약의 ISO datetime, nullable volume, currency, range를 각 렌더러 형식으로 바꾸는
  순수 함수만 가진다.
- `ui`는 제품에서 사용할 안정된 API와 접근성, 상태, 레이아웃을 소유한다.
- `index.ts`는 `ChartFrame`, 세 Research 차트, 공용 타입만 export한다. Bklit 원시 API와
  Lightweight Charts 객체는 공개하지 않는다.
- 라우트와 widget은 `@/shared/ui/chart`만 import한다. 차트 선택, 종목 선택, 데이터 fetch와
  근거 inspector 열기는 feature/page가 소유한다.

## 공용 데이터와 인터페이스

### 기본 타입

```ts
type ChartStatus =
  | 'loading'
  | 'empty'
  | 'error'
  | 'ready'
  | 'stale'
  | 'partial'
  | 'unavailable';

type ChartRange = PriceSeriesRange; // '1M' | '3M' | '6M' | '1Y'

type EvidenceMarker = {
  id: string;
  occurredAt: string;
  title: string;
  summary: string;
  tone: 'context' | 'positive' | 'risk';
  sourceCount: number;
};

type ReferenceBand = {
  id: string;
  label: string;
  from: string;
  to: string;
  lower?: number;
  upper?: number;
  tone: 'neutral' | 'positive' | 'risk';
};
```

- `ResearchAreaChart`는 `PriceSeries`, `status`, `range`, `onRangeChange`, 선택적
  `visibleDomain`, `onVisibleDomainChange`를 받는다.
- `ResearchEvidenceChart`는 같은 가격 계열과 함께 `markers`, `referenceBands`,
  `selectedEvidenceId`, `onEvidenceSelect`를 받는다.
- `ResearchCandlestickChart`는 `PriceSeries`, `status`, `range`, `onRangeChange`를 받는다.
- 통화와 숫자 표기는 공용 formatter가 처리한다. KRW와 USD, 거래량, 날짜를 렌더러마다 따로
  포맷하지 않는다.
- 차트는 데이터 fetch를 직접 하지 않는다. 기간 변경은 `onRangeChange`만 호출하고, pending,
  성공, 오류 전환은 상위 계층의 단일 source of truth를 따른다.

### 진실성 경계

- marker와 reference band는 실제 timestamp와 근거 ID가 있을 때만 표시한다.
- 근거 timestamp를 가격 bar에 억지로 맞추거나 장식용 사건을 생성하지 않는다.
- 빈 volume은 0으로 바꾸지 않는다. volume series에서 해당 점을 생략하고 접근성 요약에
  `거래량 없음`으로 표시한다.
- stale, partial, unavailable, error를 empty와 구분한다.
- 기간을 바꿀 때 이전 데이터는 stale 상태로 유지할 수 있지만 새 기간 데이터처럼 표시하지
  않는다.

## 공통 `ChartFrame`

`ChartFrame`은 라이브러리에 상관없이 동일한 차트 문법을 제공한다.

- 상단: 제목, 종목·시장, 기준 시각, freshness 또는 limitation.
- 요약: 최신 가격, 기간 변화, 기간 고가·저가, 거래량 상태. 값은 tabular numerals를 쓴다.
- 제어: 공용 `ToggleGroup` 기반 `1M / 3M / 6M / 1Y` 기간 선택기와 선택적 데이터 표 버튼.
- 본문: 고정된 최소 높이의 chart viewport. 상태 전환 중 레이아웃이 흔들리지 않는다.
- 하단: 범례, 선택 범위, 출처 또는 방법론, TradingView attribution처럼 필요한 고지.
- loading, empty, stale, error는 공용 `ChartState`로 렌더링한다. spinner 하나만 띄우지 않고
  상태 설명과 가능한 복구 action을 제공한다.

`ChartFrame`은 `figure`와 `figcaption`을 기본으로 사용한다. 차트 canvas나 SVG에만 중요한 값을
남기지 않고 HTML 요약과 펼칠 수 있는 `ChartDataTable`을 함께 제공한다.

## A — Market Tape

- Bklit `AreaChart`를 단일 close series로 사용한다.
- 선은 Market Graphite의 가장 강한 중성 대비를 사용하고 fill은 저채도 accent를 낮은
  opacity로만 사용한다. 모호한 파란 gradient를 추가하지 않는다.
- hover 시 가장 가까운 point에 crosshair와 tooltip을 표시한다. tooltip에는 날짜, 종가,
  전일 대비, 거래량 상태를 보여준다.
- 하단의 Bklit `ChartBrushLayout`과 `ChartBrush`는 전체 기간의 mini area를 유지한다. 사용자는
  handle을 끌어 표시 범위를 줄이고, 선택 영역을 끌어 이동한다.
- 기간 selector를 바꾸면 상위 계층이 데이터를 교체한다. brush는 새 기간의 전체 범위로
  초기화하고 기존 범위를 다른 기간에 암묵적으로 재사용하지 않는다.
- 초기 enter animation은 한 번만 허용하고, hover나 부모 rerender 때 replay하지 않는다.
- 자동 데이터 append, ticker loop, 무한 pulse는 없다.

## B — Evidence Band

- B는 Bklit `ComposedChart`를 고정으로 사용하고 가격 흐름을 `Area`로 그린다. 유효한 거래량이나
  보조 series가 실제로 제공되는 화면만 `SeriesBar` 또는 추가 `Line`을 렌더링한다.
- `ReferenceArea`는 시간·가격 조건 구간을 plot 아래 layer로 표시한다. 의미는 색만으로 전달하지
  않고 dashed edge, 짧은 label, 하단 범례를 함께 쓴다.
- 사건 marker는 Bklit `useChart` 또는 공식 Custom Indicator 확장점 위의 저장소 소유
  `EvidenceMarkerLayer`로 구현하며 hover와 click을 모두 지원한다. click하면
  `selectedEvidenceId`가 바뀌고 우측 근거 목록의 같은 항목이 선택·스크롤·focus된다.
- 우측 근거 목록에서 항목을 선택하면 chart marker와 crosshair가 해당 시점으로 이동한다.
  marker가 현재 brush 범위 밖이면 범위를 자동 이동하되 확대 비율은 유지한다.
- 선택 상태는 한 번에 하나다. 같은 항목을 다시 눌러 inspector를 닫는 동작은 제품 feature가
  결정하며 차트 내부에서 추측하지 않는다.
- marker tooltip은 제목, 발생 시각, 근거 수, `context / positive / risk` 역할만 요약한다.
  원문과 상세 근거는 기존 Evidence Inspector가 소유한다.
- 900px 이하에서는 우측 목록을 chart 아래로 쌓는다. 390px에서는 chart와 목록이 각자 수평
  overflow를 만들지 않는다.

## C — Candle Ledger

- `lightweight-charts`는 client effect 안에서 동적 import한다. 서버 렌더와 build 과정에서
  `window` 또는 canvas를 참조하지 않는다.
- `createChart` 후 `CandlestickSeries`와 `HistogramSeries`를 추가한다. 가격과 거래량은 같은
  time scale을 공유하고 거래량은 별도 scale margin 또는 pane으로 분리한다.
- `PriceBar`를 시간순으로 정렬하고 중복 timestamp를 거부한 뒤 `setData` 한다. 실시간
  `series.update` loop는 사용하지 않는다.
- 기본 상호작용은 crosshair, wheel zoom, drag pan이다. 기간 selector는 A/B와 같은 공용
  `ToggleGroup`을 사용한다.
- crosshair 이동은 React state를 매 frame 갱신하지 않는다. tooltip DOM은 requestAnimationFrame
  단위로 갱신하거나 라이브러리 callback 안에서 최소 변경한다.
- container 크기는 `autoSize` 또는 `ResizeObserver`로 추적한다. unmount 때 subscription,
  observer, chart를 모두 해제하고 `chart.remove()`를 호출한다.
- up/down 색은 positive/risk 의미 토큰을 사용하되 몸통 방향, wick, tooltip의 `상승/하락`
  텍스트를 함께 제공한다.
- 차트 viewport 안이나 바로 아래에 TradingView attribution logo 또는 동등한 공식 링크를
  항상 표시한다. 테마 변경으로 숨기지 않는다.

## 시각 언어

- 차트 배경은 카드와 분리된 짙은 panel을 새로 만들지 않고 기존 `Panel` 또는 `Card` surface를
  이어 쓴다.
- grid는 낮은 대비의 수평선 위주이며 A/B의 세로 grid는 기본 비활성화한다.
- 선, 캔들, band, marker는 `--chart-*`와 Market Graphite 의미 토큰에 매핑한다.
- positive와 risk는 채도가 높은 네온색을 쓰지 않는다. 방향, pattern, label을 병행한다.
- tooltip은 공용 Popover/Card 표면 문법을 사용한다. 과한 blur, glass, glow, 큰 shadow를 쓰지
  않는다.
- 축 글자는 본문보다 작되 모바일에서 11px 아래로 줄이지 않는다.
- chart viewport 목표 높이는 desktop 320~380px, compact 280~340px, mobile 240~300px다.

## Motion과 상호작용 안전

- A/B의 chart enter와 y-domain tween은 Bklit가 소유한다. 프로젝트가 경로 animation을 다시
  덧씌우지 않는다.
- panel, tooltip, evidence list presence만 기존 local Motion 경계를 사용한다.
- `prefers-reduced-motion`에서는 A/B enter, y-domain tween, marker 이동을 즉시 반영하고 shimmer를
  정적 skeleton으로 바꾼다. C의 pan/zoom 입력 자체는 유지하되 관성·장식 transition은 끈다.
- brush, zoom, pan 중 cursor는 상호작용 의미에 맞게 바뀔 수 있지만 loading 상태는 cursor를
  wait로 바꾸지 않는다.
- 선택이나 기간 변경으로 전체 카드가 remount되지 않는다.

## 접근성

- 모든 차트에는 고유 제목과 설명 ID가 있고 `figure`가 이를 참조한다.
- 최신값, 기간 변화, 고가·저가, 기준 시각, 데이터 상태는 chart 밖의 HTML로 읽을 수 있다.
- `ChartDataTable`은 현재 기간의 날짜, OHLC, 거래량을 native table로 제공한다. 기본은 접혀
  있어도 keyboard와 screen reader로 열 수 있어야 한다.
- 기간 selector는 arrow key, Home/End, focus-visible을 지원하는 공용 ToggleGroup을 사용한다.
- B marker의 keyboard 진입점은 우측 근거 목록이다. canvas/SVG marker 자체를 수십 개의 tab
  stop으로 만들지 않는다.
- brush를 keyboard로 완전히 조작하기 어려운 경우 시작일·종료일 Select 또는 slider 대체
  control을 데이터 표 disclosure 안에 제공한다.
- 색상만으로 상승, 하락, 선택, 위험, 조건 구간을 표현하지 않는다.
- 390px에서 비의도성 horizontal overflow와 focus clipping이 없어야 한다.

## 상태와 오류 처리

- `loading`: 고정 높이 skeleton과 `차트 데이터를 불러오는 중` status. 이전 데이터가 있으면
  stale overlay를 사용하고 지우지 않는다.
- `empty`: 정상 응답이지만 bars가 0개임을 설명한다.
- `stale`: 마지막 기준 시각과 갱신 지연을 표시하고 데이터 자체는 탐색 가능하게 둔다.
- `error`: fetch 오류를 설명하고 공용 secondary `다시 시도` action을 제공한다.
- `unavailable` 또는 unsupported: 해당 시장·종목에 차트를 제공하지 못하는 이유를 표시한다.
- 잘못된 OHLC(`low > high`, open/close가 범위 밖, 중복·역순 timestamp)는 adapter에서 감지하고
  조용히 그리지 않는다. 개발 환경에서는 진단을 남기고 UI는 error 또는 partial 상태를 쓴다.

## 의존성과 라이선스

- Bklit registry namespace는 `https://ui.bklit.com/r/{name}.json`을 사용한다.
- registry로 가져온 각 Bklit 파일은 upstream URL, 설치 시점 revision, registry item과 MIT
  copyright 고지를 유지한다.
- Bklit의 `packages/ui`와 registry chart source만 사용한다. proprietary Bklit Studio source,
  export 결과물의 무단 복제, Studio runtime은 사용하지 않는다.
- Bklit registry가 요구하는 `@visx/*`, `d3-array`, `react-use-measure` 등은 실제 설치 결과를
  검토한 뒤 필요한 것만 lockfile에 추가한다. 기존 `motion`은 재사용한다.
- `lightweight-charts`는 구현 시작 시 공식 최신 안정 5.x를 확인하고 exact version으로 고정한다.
- Lightweight Charts의 Apache-2.0 LICENSE와 NOTICE를 `THIRD_PARTY_NOTICES`에 포함하고,
  사용자에게 보이는 TradingView 링크 또는 기본 attribution logo를 유지한다.

## 테스트 전략

### 계약과 단위 테스트

- `PriceSeries`에서 Bklit point, candlestick, histogram으로의 변환을 검증한다.
- ISO timestamp 정렬, 중복 제거 또는 거부, nullable volume, KRW/USD formatter, 기간별 reset을
  검증한다.
- invalid OHLC, empty, stale, error, partial 분기를 고정한다.
- product layer가 Bklit와 `lightweight-charts`를 직접 import하지 않는 FSD boundary test를
  추가한다.

### 브라우저 상호작용

- A: crosshair tooltip, 1M/3M/6M/1Y 변경, brush handle resize와 range pan.
- B: marker click → 근거 목록 선택, 근거 목록 선택 → marker/crosshair 이동, brush 밖 marker
  선택 시 범위 이동.
- C: crosshair OHLCV, wheel zoom, drag pan, 기간 변경, resize 후 canvas 크기, unmount cleanup.
- loading 중 cursor가 wait로 바뀌지 않고 control이 중복 submit되지 않는지 확인한다.
- reduced motion에서 enter, tween, shimmer가 제거되고 정보 피드백은 남는지 확인한다.

### 시각·접근성·회귀

- 1440px, 1180px, 768px, 390px의 light/dark에서 세 차트를 비교한다.
- 긴 ticker, KRW/USD, 400 bars, volume 없음, 여러 marker, 선택 marker 없음 케이스를 캡처한다.
- Axe, keyboard focus order, ToggleGroup keyboard, 근거 목록, 데이터 표 disclosure를 검증한다.
- 기존 workspace shell, Panel, Card, Evidence Inspector, route, API, auth와 read-only 문구 회귀를
  확인한다.
- 최종 게이트는 format, lint, typecheck, 단위 테스트, build, credential-free E2E, 인증 가능
  환경의 workspace visual E2E, `git diff --check`, `graphify update .` 순서로 실행한다.

## 구현 순서

1. 현재 브라우저 목업의 A/B를 Bklit 상호작용으로, C를 Lightweight Charts로 교체해 시각과
   입력 감각을 먼저 확인한다.
2. `components.json`에 Bklit registry를 추가하고 필요한 공식 source만 가져와 upstream diff와
   라이선스를 검토한다.
3. 차트 공용 타입, adapter, `ChartFrame`, 상태, 데이터 표를 회귀 테스트와 함께 만든다.
4. A와 B를 구현하고 기간·brush·근거 선택 상호작용을 검증한다.
5. C를 client-only adapter로 구현하고 resize, cleanup, attribution을 검증한다.
6. 제품 화면은 mock 또는 기존 `PriceSeries`가 준비된 위치부터 공용 차트로 연결한다. 근거
   timestamp가 없는 화면은 B를 꾸며내지 않고 명시적 unavailable 상태를 유지한다.
7. 전체 visual, accessibility, reduced-motion, performance gate 후 기존 정적 placeholder를
   제거한다.

## 완료 조건

- A와 B가 Bklit registry 원본 계층으로 실제 hover, tooltip, 기간, brush, 선택 상호작용을 한다.
- C가 Lightweight Charts candlestick과 volume으로 zoom, pan, crosshair를 제공한다.
- 세 차트가 동일한 `ChartFrame`, 기간 선택기, 상태, 접근성 요약, 데이터 표를 공유한다.
- 제품 코드에 Bklit 또는 Lightweight Charts 직접 import가 없다.
- 자동/live 움직임, 근거 없는 marker, 데이터 상태 위장, ambiguous blue, canvas-only 핵심 정보가
  없다.
- light/dark, 390px, keyboard, Axe, reduced motion, attribution, 라이선스, cleanup 검증이 통과한다.

## 명시적 제외

- live quote stream, polling, WebSocket, 자동 ticker animation.
- 주문, 매수·매도 지시, 목표가·손절가 같은 advisory 표현.
- Bklit Candlestick Chart 사용. 캔들은 승인대로 TradingView Lightweight Charts만 사용한다.
- Bklit Studio source 또는 proprietary 기능 사용.
- chart library가 application theme, route, fetch, toast, dialog, Evidence Inspector를 소유하는
  구조.
- 실제 근거가 없는 시각적 marker와 threshold 생성.

## 공식 참고 자료

- [Bklit 설치와 registry namespace](https://bklit.com/docs/installation)
- [Bklit Composed Chart](https://bklit.com/docs/components/composed-chart)
- [Bklit Brush](https://bklit.com/docs/utility/brush)
- [Bklit Reference Area](https://bklit.com/docs/utility/reference-area)
- [Bklit UI repository와 라이선스 경계](https://github.com/bklit/bklit-ui)
- [Lightweight Charts API](https://tradingview.github.io/lightweight-charts/docs/api)
- [Lightweight Charts series types](https://tradingview.github.io/lightweight-charts/docs/series-types)
- [Lightweight Charts Apache-2.0 LICENSE](https://github.com/tradingview/lightweight-charts/blob/master/LICENSE)
- [Lightweight Charts NOTICE](https://github.com/tradingview/lightweight-charts/blob/master/NOTICE)
