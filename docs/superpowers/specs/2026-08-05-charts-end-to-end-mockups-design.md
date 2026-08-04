# 6A Charts End-to-End 9종 목업 설계

## 배경

Stock Insight UI 시스템의 마지막 묶음인 6A는 차트 기반, 시각 비교, 공용화, 제품 연결을 한
흐름으로 완결한다. 이번 목업 단계에서는 Market Tape, Evidence Band, Candle Ledger의 세 역할을
상단 수평 탭으로 나누고 각 역할 안에 독립적인 A/B/C를 제공한다. 총 아홉 시안은 동일한
결정론적 가격·거래량·근거 fixture와 핵심 상호작용을 공유하며 정보 위계, 표면, 강조, 모션만
다르게 비교한다.

브라우저 시각 동반 화면은 사용자 환경에서 보이지 않았으므로 최종 시각 승인은 기존 6110 UI
Lab에서 진행한다. 사용자 승인 전에는 저장소 소유 공개 차트 API나 실제 제품 사용처를 변경하지
않는다.

## 현재 저장소 기준

- Bklit registry namespace와 필요한 AreaChart, ComposedChart, ReferenceArea 계층이
  `apps/web/src/shared/ui/chart/vendor/bklit` 아래 private upstream 경계로 이미 고정돼 있다.
- Bklit revision, registry item, 수동 이식 파일, compatibility patch는
  `upstream-manifest.json`이 기록한다.
- `lightweight-charts`는 `5.2.0` exact version으로 설치돼 있고 Bklit·TradingView 라이선스 고지는
  `THIRD_PARTY_NOTICES.md`에 존재한다.
- 제품 계층의 Bklit 또는 Lightweight Charts 직접 import를 막는
  `chart-upstream-contract.test.ts`가 존재한다.
- 아직 저장소 소유 `shared/ui/chart` 공개 API, renderer-neutral adapter, UI Lab 차트 카탈로그,
  실제 제품 차트 연결은 없다.
- 기존 `2026-08-01-hybrid-research-charts-design.md`의 세 차트 역할과 진실성·라이선스 경계는
  유지한다. 다만 그 문서의 “차트 런타임이 아직 없다”는 현재 상태 설명은 이 문서가 대체한다.

## 확정한 접근

다음 세 접근을 비교했다.

1. 세 차트 역할별로 독립적인 A/B/C를 설계해 총 아홉 시안을 비교한다.
2. 모든 차트에 Hairline, Soft Surface, Dense Ledger라는 공통 A/B/C 언어를 반복한다.
3. 같은 차트를 간결형, 리서치형, 전문가형으로 나눠 기능 밀도까지 다르게 만든다.

사용자는 첫 번째 접근을 승인했다. 각 역할의 A/B/C는 같은 fixture, 상태, 기간, tooltip 값,
brush 또는 zoom·pan 계약을 공유한다. 시안별 차이는 레이아웃과 표현에만 두며 한 시안만 더 많은
핵심 기능을 갖지 않는다.

## UI Lab 구조

6A 카탈로그는 UI Lab `목업 진행 중` 탭에 배치한다. 상단 수평 탭은 다음 세 항목을 유지한다.

1. Market Tape
2. Evidence Band
3. Candle Ledger

선택한 역할 안에는 A/B/C를 세로 전체 너비로 렌더링한다. 차트는 좁은 3열 카드에서 축, tooltip,
brush와 crosshair가 왜곡되므로 데스크톱에서도 한 행에 하나만 놓는다. 390px에서도 같은 단일 열
구조를 유지하고 차트 viewport 자체가 페이지 전체의 가로 overflow를 만들지 않게 한다.

카탈로그 상단의 공용 목업 controls는 다음 상태를 세 시안에 함께 적용한다.

- `1M | 3M | 6M | 1Y` 기간
- `ready | loading | stale | partial | empty | error | unavailable` 상태
- KRW 또는 USD formatter fixture
- Evidence Band의 선택 근거와 reference band 표시 여부
- chart data table disclosure

`range`, `visibleDomain`, `selectedEvidenceId`, 상태는 A/B/C가 공유한다. pointer hover와 crosshair의
프레임 단위 위치는 각 renderer가 로컬로 소유해 세 차트 사이의 callback loop를 만들지 않는다.
같은 timestamp를 가리킬 때는 세 tooltip이 같은 formatter와 값 순서를 사용한다.

## 결정론적 fixture

목업은 실제 API나 로그인 상태에 의존하지 않는다.

- 정렬된 일봉 OHLCV 180개
- 상승, 하락, 횡보와 gap을 모두 포함하되 유효한 OHLC 범위만 사용
- nullable volume 3개
- timestamp가 실제 bar와 일치하는 evidence marker 3개
- 시간·가격 범위를 모두 갖는 reference band 2개
- 종목, 시장, 통화, 기준 시각과 freshness metadata
- 긴 회사명과 좁은 모바일에서 wrapping을 확인할 별도 label fixture

fixture는 한 번 생성한 상수 배열을 공유하며 렌더 중 무작위 값을 만들지 않는다. 기간 전환은
같은 원본 배열의 결정론적 slice를 사용한다. invalid OHLC와 중복·역순 timestamp는 별도 순수 함수
계약 테스트에서 fail closed를 검증하고 시각 fixture에는 섞지 않는다.

## Market Tape A/B/C

세 시안 모두 Bklit AreaChart, Grid, XAxis, ChartTooltip, ChartBrushLayout, ChartBrush를 사용한다.
hover, 가장 가까운 point tooltip, 기간 변경, brush resize와 range pan이 동일하게 동작한다.

### A — Quiet Trace

- 최신값, 기간 변화율, 얇은 종가선, 최소 수평 grid 순서로 읽힌다.
- 면 채움은 거의 보이지 않게 유지하고 선택 point만 작은 ring으로 표시한다.
- brush는 낮은 44px hairline strip으로 두고 handle 경계만 명확하게 한다.
- 첫 ready 진입에서 Bklit path reveal을 한 번만 사용하며 hover나 parent rerender 때 재생하지 않는다.

### B — Layered Range

- 낮은 opacity의 area fill과 main plot, 별도 brush surface를 층으로 구분한다.
- 선택 범위의 시작일, 종료일, bar 수를 brush 바로 위에서 읽을 수 있다.
- brush 이동 시 Bklit의 y-domain tween을 사용하되 선택 영역 이동과 tooltip은 즉시 반응한다.
- surface와 fill은 Market Graphite의 저채도 토큰만 사용하고 glass, glow, 큰 shadow를 쓰지 않는다.

### C — Signal Ledger

- 날짜, latest, 변화율, 거래량 상태와 오른쪽 가격축을 압축된 원장 문법으로 노출한다.
- area fill보다 선, 축, tabular numerals, rectangular tooltip을 우선한다.
- 종가선은 즉시 표시하고 상단 숫자와 tooltip 내용만 짧게 교체한다.
- 고밀도여도 축 글자는 모바일에서 11px 아래로 줄이지 않는다.

## Evidence Band A/B/C

세 시안 모두 Bklit ComposedChart, Area, ReferenceArea, ChartMarkers 또는 저장소 소유 marker layer,
tooltip과 brush를 사용한다. marker 선택과 근거 목록 선택은 양방향으로 동기화하고 현재 범위 밖의
근거를 선택하면 확대율을 유지한 채 visible domain만 이동한다.

### A — Band Ledger

- pattern, dashed edge, 짧은 label을 가진 ReferenceArea가 가격선보다 먼저 읽힌다.
- 근거 목록은 차트 아래 3열 요약으로 두고 900px 이하에서는 단일 열로 바뀐다.
- band가 한 번 낮게 나타난 뒤 marker는 정지 상태로 유지한다.
- 색상 외에도 edge style, label, 범례로 조건 구간 의미를 전달한다.

### B — Event Pulse

- 사건 marker, 선택 crosshair, marker tooltip을 주된 탐색 축으로 둔다.
- marker는 첫 ready 진입에만 짧은 stagger로 나타나고 이후 선택은 위치 이동 없이 강조만 바뀐다.
- 우측 근거 목록은 marker tone, 발생 시각, 제목, 근거 수를 압축해 보여준다.
- marker를 수십 개의 tab stop으로 만들지 않고 keyboard 경로는 근거 목록이 소유한다.

### C — Evidence Split

- 데스크톱에서 차트와 근거 원장을 명확한 2열 split으로 두고 중간 경계를 공유한다.
- 선택 항목은 왼쪽 rail, crosshair, 관련 marker의 세 위치에서 동시에 확인된다.
- 900px 이하에서는 목록을 차트 아래로 이동하고 focus 순서는 차트 controls 다음 목록을 유지한다.
- 가격 경로는 고정하며 선택 rail, crosshair, 관련 행만 180ms 이내에 전환한다.

## Candle Ledger A/B/C

세 시안 모두 TradingView Lightweight Charts의 CandlestickSeries와 HistogramSeries를 client-only
effect 안에서 생성한다. crosshair, wheel zoom, drag pan, 기간 변경, responsive resize, cleanup과
visible attribution이 동일하다. 캔들 자체에 별도 enter animation을 덧씌우지 않는다.

### A — Clean Candle

- 가격 pane을 우선하고 거래량은 하단의 낮은 통합 strip으로 둔다.
- 상단에는 latest, 변화율과 선택 bar의 OHLCV만 보여준다.
- tooltip과 grid 대비를 낮춰 제품 Card 안에서도 주변 정보를 압도하지 않게 한다.
- crosshair 이동 시 HTML OHLCV readout만 120ms 이내에 교체한다.

### B — Dual Pane

- 가격과 거래량을 두 개의 고정 pane으로 분리하고 separator를 명시한다.
- 두 pane은 같은 time scale과 crosshair timestamp를 공유한다.
- 거래량 pane은 전체 높이의 약 24~30%를 유지하며 이번 목업에서는 사용자 resize 기능을
  추가하지 않는다.
- 가격과 거래량의 관계를 분석하는 시안이지만 indicator나 보조지표는 만들지 않는다.

### C — Market Ledger

- 날짜와 OHLCV를 plot 위 고정 원장 행으로 노출하고 촘촘한 grid와 오른쪽 가격축을 사용한다.
- tooltip은 현재 bar 번호, 변화율, 일중 범위를 압축해 표시한다.
- 가격과 거래량 pane은 A보다 명확히 분리하되 B보다 수직 밀도를 높인다.
- chart canvas는 즉시 유지하고 원장 행과 crosshair만 짧게 동기화한다.

## 저장소 소유 경계

목업 단계부터 다음 경계를 지킨다.

```text
apps/web/src/pages/ui-lab/ui/
├── chart-catalog.tsx
├── chart-catalog.module.css
├── chart-fixtures.ts
├── market-tape-preview.tsx
├── evidence-band-preview.tsx
└── candle-ledger-preview.tsx

apps/web/src/shared/ui/chart/
└── vendor/bklit/        # 기존 private upstream source, 목업에서 직접 수정하지 않음
```

- UI Lab preview adapter만 private Bklit source와 `lightweight-charts`를 사용할 수 있다.
- 제품 계층은 계속 두 renderer를 직접 import하지 않는다.
- Bklit vendor 파일은 목업 디자인을 맞추기 위해 임의 수정하지 않고 repository-owned CSS와 wrapper
  props로만 조정한다.
- Lightweight Charts 객체와 subscription은 preview wrapper 내부에서 생성·정리한다.
- 목업 승인 후 renderer-neutral 타입, adapter, `ChartFrame`, 상태, 접근성 표와 승인 variant를
  `shared/ui/chart` 공개 API로 승격한다.
- 여러 시안을 모두 승인할 수 있으며 하나만 남는다고 미리 가정하지 않는다.

## 데이터 흐름

```text
deterministic fixture
  -> chart catalog shared state
  -> range/status/selection props
  -> role preview A/B/C
  -> Bklit or Lightweight Charts adapter
  -> local hover/crosshair readout
```

차트는 fetch하지 않는다. 목업 controls가 range나 상태를 변경하면 카탈로그가 같은 props를 세
시안에 전달한다. Evidence 선택은 카탈로그가 ID로 소유하고 목록과 marker가 같은 callback을
호출한다. 기간이 바뀌면 visible domain과 selected evidence가 새 slice에서 유효한지 검사하고,
유효하지 않은 선택은 조용히 첫 항목으로 바꾸지 않고 명시적으로 해제한다.

## 상태와 오류 처리

5B에서 공용화한 Feedback API를 재사용한다.

- `loading`: 고정 높이 chart skeleton과 polite status. 이전 데이터가 있으면 stale overlay를 사용한다.
- `ready`: 전체 상호작용을 허용한다.
- `stale`: 마지막 기준 시각과 지연을 표시하되 차트 탐색은 유지한다.
- `partial`: 유효한 가격은 표시하고 누락 거래량·근거 범위를 별도 limitation으로 알린다.
- `empty`: 정상 응답이지만 bar가 없음을 설명한다.
- `error`: 공용 ErrorState와 UI Lab 로컬 `다시 시도`를 제공한다.
- `unavailable`: 해당 역할을 제공할 근거나 시장 데이터가 없음을 설명한다.

상태 전환은 chart viewport 높이를 바꾸지 않는다. stale, partial, unavailable을 empty처럼 위장하지
않고 invalid OHLC를 조용히 그리지 않는다.

## 모션 원칙

- A/B의 path reveal, y-domain tween, brush geometry는 Bklit가 소유한다.
- Candle Ledger의 pan, zoom, crosshair는 Lightweight Charts가 소유한다.
- 프로젝트의 local Motion 경계는 숫자 readout, tooltip presence, evidence list selection, 상태
  surface 전환에만 사용한다.
- ReactBits, 21st.dev, SmoothUI, Animate UI, Magic UI, Animata의 number flow, stagger, tooltip,
  selection feedback를 참고하되 저장소의 `motion`과 CSS로 다시 표현한다.
- hover 때마다 전체 경로 reveal, 자동 ticker, 무한 pulse, parallax, glow, WebGL transition을 사용하지
  않는다.
- `prefers-reduced-motion`에서는 path reveal, y-domain tween, marker stagger, number slide를 즉시
  반영한다. pan, zoom, brush 같은 직접 조작 자체는 유지한다.
- GSAP, Rive, Lottie, Anime.js는 시각 참고 범위에만 두고 런타임·asset·provider를 추가하지 않는다.

## 레퍼런스 적용 경계

### 실제 구현 기준

- [Bklit Area/Composed Charts](https://bklit.com/docs/components/composed-chart)
- [Bklit Brush](https://bklit.com/docs/utility/brush)
- [Bklit Reference Area](https://bklit.com/docs/utility/reference-area)
- [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/docs/5.0)
- [TradingView panes](https://tradingview.github.io/lightweight-charts/tutorials/how_to/panes)
- [Motion reduced motion](https://motion.dev/docs/react-use-reduced-motion)

### UI와 모션 참고

- ReactBits, 21st.dev: line draw, hover point, compact chart card와 staged bar 표현
- shadcn/ui: chart container, token mapping, tooltip content anatomy
- Base UI, Radix UI: tooltip은 보조 정보이며 keyboard·touch 사용자가 핵심 값을 잃지 않는 경계
- React Aria/Spectrum: native data table label, row header와 keyboard 접근성
- SmoothUI: tabular numeral과 direction-aware number flow, reduced-motion instant swap
- Animate UI: collision-aware tooltip presence와 짧은 selection feedback
- Magic UI, Animata: restrained list stagger와 layout feedback
- Uiverse, Aceternity UI, GetDesign, Watermelon UI, Cult UI, UUPM, Skiper UI, Shadcn Space,
  Kokonut UI: spacing, surface, compact dashboard composition 참고

이 사이트들의 코드를 복사하거나 기존 renderer, theme, FSD 경계를 교체하지 않는다. 예제에서 요구하는
Recharts, Framer Motion, GSAP, WebGL, proprietary asset는 도입하지 않는다.

## 접근성

- 각 preview는 `figure`, 고유 title과 description, `figcaption`을 가진다.
- latest, 기간 변화, 고가·저가, 기준 시각, 상태를 canvas나 SVG 밖의 HTML로 제공한다.
- tooltip은 보조 정보이며 같은 OHLCV를 keyboard와 screen reader로 읽을 수 있는 접힌 native
  `ChartDataTable`을 제공한다.
- 기간 selector는 공용 ToggleGroup의 arrow key, Home, End, focus-visible 계약을 따른다.
- Evidence marker의 keyboard 진입점은 근거 목록이고 선택 후 관련 행으로 focus를 이동하지 않는다.
- brush의 keyboard 대체는 data table disclosure 안 시작일·종료일 controls로 제공한다.
- 상승, 하락, risk, band는 색뿐 아니라 몸통 방향, label, pattern, dash, 텍스트를 함께 사용한다.
- 390px에서 직접 조작 대상은 최소 44px hit area를 가지며 tooltip과 focus ring이 잘리지 않는다.

## 성능과 lifecycle

- UI Lab은 선택한 역할의 A/B/C만 mount한다. 숨은 여섯 차트를 동시에 생성하지 않는다.
- Lightweight Charts는 Candle Ledger 탭이 활성화됐을 때만 dynamic import한다.
- ResizeObserver와 crosshair subscription은 preview별로 한 번만 만들고 unmount 때 해제한 뒤
  `chart.remove()`를 호출한다.
- crosshair 이동은 React state를 매 frame 갱신하지 않고 requestAnimationFrame 단위 DOM readout
  또는 renderer callback의 최소 변경으로 처리한다.
- 기간 변경은 전체 chart card를 remount하지 않고 renderer data와 visible range만 갱신한다.
- 목업 fixture는 최대 180 bars로 제한해 세 preview 동시 비교에서도 입력 반응을 우선한다.

## 좁은 검증 범위

사용자가 목업 단계에서 과도한 테스트와 토큰 사용을 피하도록 요청했으므로 다음만 실행한다.

1. Node 모델 계약 2건
   - 세 역할, 각 A/B/C, 결정론적 180 bars와 상태 정의
   - 기간 slice, invalid OHLC, marker·band integrity
2. Playwright 3건
   - Market Tape: 기간 공유, tooltip, brush resize·pan
   - Evidence Band: marker·목록 양방향 선택과 range 이동
   - Candle Ledger 및 통합: canvas, crosshair, zoom·pan, attribution, cleanup, 390px,
     reduced-motion, Axe
3. web typecheck
4. 변경 파일 Oxfmt·Oxlint와 `git diff --check`
5. Codex 인앱 브라우저 6110에서 세 탭과 아홉 시안 시각 비교

전체 테스트, 전체 빌드, 실제 인증 제품 E2E는 목업 승인 뒤 공용화·제품 연결 단계에서 수행한다.

## 승인 후 공용화와 제품 감사

시각 승인 후에만 다음 단계로 넘어간다.

1. 승인된 variant union과 renderer-neutral types, strict adapters를 `shared/ui/chart`에 공개한다.
2. `ChartFrame`, Feedback states, range selector, native data table을 세 역할이 공유한다.
3. Bklit와 Lightweight Charts import는 public wrapper 내부에만 남긴다.
4. 선택 종목 Deep Dive의 실제 `PriceSeries` 사용처를 감사한다.
5. Market Tape와 Candle Ledger는 실제 가격 데이터가 있는 화면에만 연결한다.
6. Evidence Band는 timestamp가 있는 실제 evidence가 있을 때만 연결하고 그렇지 않으면 marker를
   꾸며내지 않는다.
7. 적합한 제품 사용처가 없으면 가짜 기능을 추가하지 않고 진행 원장에 사유를 기록한다.

## 제외 범위

- live quote stream, polling, WebSocket, 자동 ticker animation
- 기술 지표, 이동평균, 매매 신호, 목표가, 손절가와 advisory 표현
- Bklit Studio, proprietary source, Bklit Candlestick Chart
- 사용자 승인 전 public chart API와 제품 화면 변경
- chart library가 fetch, route, toast, Evidence Inspector 또는 theme를 소유하는 구조
- 근거 timestamp가 없는 marker, 임의 threshold와 장식용 reference band
- 새 Recharts, GSAP, Rive, Lottie, Anime.js 또는 다른 animation runtime
- 전체 회귀와 실제 인증 제품 연결을 목업 비교 전에 수행하는 것

## 승인 기준

- UI Lab `목업 진행 중`에서 세 역할을 수평 탭으로 선택할 수 있다.
- 각 탭은 전체 너비의 독립 A/B/C 세 시안을 보여준다.
- Market Tape A/B/C가 같은 기간, tooltip, brush range를 공유한다.
- Evidence Band A/B/C가 같은 marker, band, 선택 ID를 공유하고 목록과 양방향으로 동기화한다.
- Candle Ledger A/B/C가 실제 Lightweight Charts canvas, 캔들·거래량, zoom·pan·crosshair를 제공한다.
- 일곱 상태가 사실에 맞게 구분되고 chart viewport geometry가 안정적이다.
- 핵심 값은 HTML summary와 native data table에서도 읽을 수 있다.
- 390px, keyboard, focus-visible, reduced-motion, Axe, TradingView attribution과 cleanup 계약을
  만족한다.
- 사용자 승인 전에는 UI Lab 밖의 public API와 제품 동작이 바뀌지 않는다.
