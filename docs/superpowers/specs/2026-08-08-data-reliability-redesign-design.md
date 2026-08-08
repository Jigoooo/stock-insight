# Data Reliability Redesign Design

## Product decision

- The menu and page title are both `데이터 신뢰도`.
- The fixed page order is `전체 신뢰 상태 → 오늘 → 내 종목 → 시장 연결 → 복기 → 공통 제한 사항`.
- Reliability uses three honest states: `활용 가능`, `일부 제한`, and `확인 필요`. It never invents a percentage score.
- The page answers how far each product surface can currently be trusted, rather than exposing an operator dashboard.
- Dataset row counts, pipeline job names, internal domains, analysis run ids, and raw operational tables are not user-facing.

## Architecture and boundaries

- `StatusView` remains the shared live and preview product view.
- A page-local adapter derives a `ReliabilityBriefingModel` from the existing `SystemStatus` response.
- The existing `DetailInspectorFrame` supplies the desktop drawer/modal and mobile bottom-sheet behavior.
- Detail presentation uses the already-derived model and performs no additional request.
- Do not change the database, migrations, API server, public `@stock-insight/contracts` responses, or dependencies.
- The existing operational response fields remain available to the backend; this work only removes their raw presentation from the user tab.

## Page-local model

```ts
type ReliabilityLevel = 'ready' | 'limited' | 'attention';

type ReliabilitySurface = 'today' | 'stocks' | 'market_connections' | 'history';

type ReliabilityEvidence = {
  id: string;
  label: string;
  availability: SystemStatus['datasets'][number]['availability'];
  checkedAt: string | null;
};

type ReliabilityBriefingItem = {
  surface: ReliabilitySurface;
  title: string;
  level: ReliabilityLevel;
  summary: string;
  availableNow: string[];
  limitations: string[];
  cautions: string[];
  evidence: ReliabilityEvidence[];
  sourceTraceability: {
    linked: number;
    clickable: number;
    total: number;
  } | null;
};

type ReliabilityBriefingModel = {
  summary: {
    level: ReliabilityLevel;
    generatedAt: string;
    headline: string;
    commonLimitations: string[];
  };
  surfaces: ReliabilityBriefingItem[];
};
```

## Reliability derivation

- `available` maps to `ready`.
- `collecting`, `stale`, and `text_only` map to `limited`.
- `missing`, `unsupported`, and `error` map to `attention`.
- A surface with no mapped evidence is `attention`.
- Source traceability that is incomplete degrades an otherwise-ready surface to `limited`; it never creates a fabricated `attention` state.
- The overall state is the worst of `SystemStatus.overall` and the four surface states.
- A stuck or consecutively failing pipeline job degrades only the overall state to at least `limited`; it is not guessed into a specific product surface.
- Blind failure recording and coverage gaps become plain common-limitations copy without inferring a surface state.
- Unknown dataset names are ignored until explicitly mapped.
- Only mapped datasets present in the response are evaluated. The absence of an unreported mapping key is not treated as a missing dataset.

## Explicit surface mapping

- `today`: `rss_news`, `news_translation`, `publication_records`, `market_snapshots`, `macro_observations`, `ohlcv_1d`.
- `stocks`: `market_snapshots`, `ohlcv_1d`, `company_profiles`, `company_financials`, `rss_news`, `news_translation`.
- `market_connections`: `market_signals`, `graph_edges`, `macro_observations` plus graph source coverage.
- `history`: `decision_history`, `forecast_outcome`, `rss_news`, `market_signals`.
- Publication source coverage is attached to `today`, `stocks`, and `history`; graph source coverage is attached only to `market_connections`.
- The Stocks card describes price, company, and news enrichment reliability, not completeness of a user's holdings.
- The History card describes evidence used to compare changes, not whether a judgment was correct.

## Screen behavior

- The header shows the page title, an explanatory sentence, and `generatedAt`.
- The overall card shows the three-state label and one concise headline.
- Four surface cards render in a two-column grid above 1240px and a single column at or below 1240px.
- Each surface card uses the fixed order `현재 확인 가능 → 부족한 정보 → 이용 시 주의점`.
- Common limitations show at most three user-impacting messages. With none, render `현재 확인된 공통 제한이 없습니다`.
- Empty status evidence is an honest `확인 필요` state, not an outage.
- All entry points share one selected surface and the approved full-border/background/shadow selection treatment.

## Inspector behavior

- Desktop uses a 420–760px resizable drawer with a wide modal presentation.
- Mobile uses a bottom sheet entering from the bottom with no resize or presentation toggle.
- The detail order is `상태 요약 → 최근 확인된 데이터 → 출처 근거 수준 → 부족한 범위 → 이용 시 주의점`.
- The wide modal compares `확인 가능한 근거` and `제한과 영향` in two columns.
- Overlay click and Escape close only the detail and restore focus to the exact opener.
- Switching drawer/modal uses the same model and performs no request.
- The current contract exposes source coverage counts, not source identities or URLs; the UI must not fabricate them.

## Development preview

`surface=status` supports exactly:

- `default`: realistic mixed states and all four details.
- `all-ready`: all four surfaces are ready.
- `stale`: freshness limitations.
- `source-limited`: incomplete publication and graph traceability.
- `empty`: no status evidence and an honest attention state.
- `error`: initial load failure with retry through the same preview loader boundary.

## Verification contract

- Focused model tests cover state conversion, worst-state ordering, explicit mapping, unknown keys, incomplete sources, operational common limitations, empty evidence, and forbidden technical/advisory copy.
- Playwright covers section order, exact selection, drawer geometry, resize memory, modal no-request switching, overlay close-only, exact focus restoration, 1240px stacking, 390px bottom sheet, dark mode, reduced motion, Axe, wrapping, overflow, and all six scenarios.
- Regress the Today, Stocks, Market Connections, and History inspectors on desktop and mobile.

