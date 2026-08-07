# Market Connections Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the equal-weight market visualization catalog with a market-change-first research flow that explains what changed, which holdings or watchlist names are connected, how the effect may propagate, and what evidence or risks to verify.

**Architecture:** Keep `/workspace/radar`, the existing `RadarSignalPage`, `GeoSnapshot`, relationship, and impact APIs unchanged. Add a page-local `MarketConnectionsModel` that derives honest live states from Radar while allowing the dev preview to provide complete grouped stories. `MarketConnectionsView` owns selection and pagination; presentation-only sections consume the page model; `MarketConnectionInspector` reuses `DetailInspectorFrame`; and the former six-mode overview becomes a four-part secondary `MarketExploration` region.

**Tech Stack:** React 19, TypeScript 6, TanStack Start, CSS Modules, Radix Dialog through the shared detail frame, the local motion boundary, Node test runner, Playwright, Axe, Graphify.

## Global Constraints

- Do not change the database, migrations, ingestion jobs, API server, `@stock-insight/contracts`, or public Radar/Geo response schemas.
- Do not add packages or provider-based UI and animation runtimes.
- Keep the product read-only. Do not render buy/sell instructions, target prices, stop-loss prices, predicted winners, or personalized execution advice.
- Preserve the Radar server order. Do not calculate a browser priority score, infer event identity, or merge live Radar rows heuristically.
- Use raw Radar strength only to choose the fixed display label: `>= 0.67` is `high`, `>= 0.34` is `medium`, otherwise `low`. Never use that mapping for priority.
- Do not expose raw strength in cards or rows. Explain the raw value only in the detail metadata and explicitly state that it is not a probability or price forecast.
- Do not use the currently loaded page length as an all-data direct-connection or risk aggregate. Unsupported live aggregates remain `null` and render as `—` with `집계 데이터 없음`.
- Dev-preview fixtures must be deterministic, use HTTPS source links, and never call authenticated live loaders.
- Reuse the approved Today/Stocks drawer, modal, bottom-sheet, overlay, resizing, motion, outside-click, and focus contracts through `DetailInspectorFrame`.
- Give Market Connection inspector width its own session-storage key. Do not reuse the Today or Stocks key.
- Use TDD for every behavior change: write the focused failing test, run it and read the expected failure, implement the smallest production change, then rerun green.
- Keep `.env`, `graphify-out/`, scratch review reports, and unrelated user files out of every commit.
- Run `graphify update .` after the final code change; generated graph output remains ignored.

## File Structure

### New files

- `apps/web/src/pages/research-workspace/model/market-connections.ts` — page-local model, live Radar adapter, strength/scope labels, and supplementary detail loader.
- `apps/web/src/pages/research-workspace/ui/views/market-connections-view.tsx` — route-facing Radar composition, pagination, selection, loading/error state, and inspector orchestration.
- `apps/web/src/pages/research-workspace/ui/views/market-connections-view.module.css` — summary, priority cards, dense list, selected state, responsive flow, and contained overflow.
- `apps/web/src/pages/research-workspace/ui/market-connection-sections.tsx` — pure summary, priority, and remaining-change sections.
- `apps/web/src/pages/research-workspace/ui/market-exploration.tsx` — the four secondary exploration modes.
- `apps/web/src/pages/research-workspace/ui/market-connection-inspector.tsx` — ordered detail content and presentation-aware modal additions.
- `apps/web/src/pages/research-workspace/ui/market-connection-inspector.module.css` — drawer/modal/bottom-sheet detail layout and wrapping.
- `apps/web/src/pages/dev-preview/model/market-connections-preview-fixture.ts` — complete grouped market stories and all preview scenarios.
- `apps/web/test/market-connections.test.ts` — model and loader behavior.
- `apps/web/test/market-connections-structure.test.ts` — page/component ownership and copy boundary contracts.
- `e2e/market-connections-preview-experience.spec.ts` — desktop/mobile behavior, visual geometry, accessibility, and scenarios.

### Modified files

- `apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx` — lazy-view registration, optional preview model/loader props, and live model derivation.
- `apps/web/src/pages/research-workspace/model/market-overview.ts` — retain derivation logic but expose only the four approved exploration modes and fold heatmap data into factors.
- `apps/web/src/pages/research-workspace/ui/market-overview.module.css` — restyle the retained factor, propagation, timeline, map, and comparison-table surfaces for secondary use.
- `apps/web/src/pages/research-workspace/model/detail-inspector-layout.ts` — add the independent Market Connection width key.
- `apps/web/src/pages/dev-preview/ui/dev-preview-page.tsx` — resolve the Market Connections preview data and loader.
- `apps/web/src/routes/[__dev-preview].tsx` — validate the new surface and scenarios.
- `apps/web/test/market-overview.test.ts` — migrate the derivation contract from equal modes to the four exploration modes.
- `apps/web/test/market-overview-ui-structure.test.ts` — migrate owner/source contracts to `MarketExploration`.
- `apps/web/test/dev-surface-routing.test.ts` — cover the new preview surface and scenarios.
- `apps/web/test/detail-inspector-frame.test.ts` — assert the third independent width-storage key.
- `apps/web/test/workspace-view-region-contract.test.ts` — point Radar lazy loading at `MarketConnectionsView`.
- `apps/web/test/research-workspace-v3-structure.test.ts` — assert live Radar-to-page-model wiring without changing the payload contract.
- `e2e/research-workspace-v3.spec.ts` — replace obsolete equal-mode Radar assertions with the live page's new semantic structure.
- `docs/superpowers/UI-SYSTEM-ROLLOUT.md` — record approval, adoption, browser evidence, automated evidence, and any environment-gated release check.

### Removed after migration

- `apps/web/src/pages/research-workspace/ui/views/radar-view.tsx`
- `apps/web/src/pages/research-workspace/ui/market-overview-panel.tsx`

Do not remove the reusable `market-overview.ts` derivation model, `market-overview.module.css`, `GeoMarketMap`, or existing relation graph components.

---

### Task 1: Add the page-local Market Connections model and live adapter

**Files:**

- Create: `apps/web/src/pages/research-workspace/model/market-connections.ts`
- Create: `apps/web/test/market-connections.test.ts`

**Step 1: Write the failing model tests**

- [ ] Add tests that construct a `RadarSignalPage` with holding, watched-only, unconnected, duplicate-looking, and threshold-boundary rows.
- [ ] Assert that the live adapter:
  - reports `scopeTotal` as `changeCount`;
  - keeps `directConnectionCount` and `riskCount` as `null`;
  - uses `signalAsOf` as `analyzedAt`;
  - chooses the first three server-ordered holding/watched rows as priority;
  - does not merge rows with the same type, time, title, or entity;
  - excludes priority keys from the remaining list without reordering the rest;
  - preserves both `holding` and `watched` on a simultaneously held/watched entity;
  - maps `0.67` to `high`, `0.34` to `medium`, and values immediately below those boundaries to the next lower label;
  - produces `market` scope and no fabricated personal copy for unconnected rows;
  - returns an honest empty model for an empty page.
- [ ] Add loader tests that prove relation and impact failures populate only `partialFailures`, identity mismatches discard the supplementary result, and base signal detail remains available.

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/market-connections.test.ts
```

Expected: FAIL because `market-connections.ts` does not exist.

**Step 2: Define the exact page-local interfaces**

- [ ] Implement these public page-model interfaces in `market-connections.ts`:

```ts
import type { ImpactBriefResponse } from '@stock-insight/contracts';
import type {
  EntityRelationGraph,
  RadarSignalPage,
} from '@stock-insight/contracts/research-workspace';

export type MarketConnectionStrength = 'high' | 'medium' | 'low';
export type MarketConnectionScope = 'holding' | 'watchlist' | 'indirect' | 'market';

export type MarketConnectionSummary = {
  changeCount: number;
  directConnectionCount: number | null;
  riskCount: number | null;
  analyzedAt: string | null;
};

export type MarketConnectionItem = {
  connectionKey: string;
  priority?: 1 | 2 | 3;
  market: 'KR' | 'US' | 'GLOBAL';
  regionLabel?: string;
  title: string;
  summary: string;
  whyNow?: string;
  scope: MarketConnectionScope;
  strength: MarketConnectionStrength;
  rawStrength?: number;
  occurredAt: string;
  connectedEntities: Array<{
    entityKey: string;
    displayName: string;
    holding: boolean;
    watched: boolean;
  }>;
  primaryPath?: string;
  riskSummary?: string;
};

export type MarketConnectionsModel = {
  summary: MarketConnectionSummary;
  priorityChanges: MarketConnectionItem[];
  marketChanges: MarketConnectionItem[];
};

export type MarketConnectionDetail = {
  item: MarketConnectionItem;
  generatedAt: string;
  availability: 'available' | 'partial' | 'missing';
  evidenceLevel?: 'high' | 'medium' | 'low';
  paths: Array<{ id: string; label: string; summary?: string }>;
  sources: Array<{
    id: string;
    title: string;
    summary?: string;
    sourceName?: string;
    publishedAt?: string;
    url?: string;
  }>;
  risks: string[];
  counterEvidence: string[];
  checkpoints: string[];
  relatedEvents: MarketConnectionItem[];
  partialFailures: {
    relation?: string;
    impact?: string;
    geo?: string;
    history?: string;
  };
};

export type MarketConnectionLoadResult = {
  detail: MarketConnectionDetail;
  relation: EntityRelationGraph | null;
};

export type MarketConnectionLoader = (connectionKey: string) => Promise<MarketConnectionLoadResult>;

export type RadarSignalItem = RadarSignalPage['items'][number];
```

**Step 3: Implement live normalization without inferred grouping**

- [ ] Add pure functions with these signatures:

```ts
export function marketConnectionStrength(rawStrength: number): MarketConnectionStrength;
export function marketConnectionScope(
  signal: Pick<RadarSignalItem, 'holding' | 'watched'>,
): MarketConnectionScope;
export function marketConnectionStrengthLabel(value: MarketConnectionStrength): string;
export function marketConnectionScopeLabel(value: MarketConnectionScope): string;
export function createMarketConnectionsModel(model: MarketConnectionsModel): MarketConnectionsModel;
export function buildMarketConnectionsModel(page: RadarSignalPage): MarketConnectionsModel;
```

- [ ] `createMarketConnectionsModel` may deduplicate identical `connectionKey` values supplied by a server/fixture and cap `priorityChanges` at three, but it must not infer similarity from any other fields.
- [ ] `buildMarketConnectionsModel` must map one Radar row to one `MarketConnectionItem`, use `signalKey` as `connectionKey`, and use the existing signal-type presenter for the title instead of duplicating display labels.
- [ ] For live rows, create exactly one connected entity from `entityKey`, `name`, `holding`, and `watched`. Do not fabricate a multi-entity story.
- [ ] Preserve server order; split priority and remaining lanes by key only.

**Step 4: Implement the supplementary live detail loader**

- [ ] Add:

```ts
type MarketConnectionLoaders = {
  loadRelation: (entityKey: string) => Promise<EntityRelationGraph>;
  loadImpactBrief?: (entityKey: string) => Promise<ImpactBriefResponse>;
};

export async function loadMarketConnectionData(
  signal: RadarSignalItem,
  loaders: MarketConnectionLoaders,
): Promise<MarketConnectionLoadResult>;
```

- [ ] Build the base detail from the selected signal before starting supplementary calls. Use `sourceName` as non-clickable source metadata when present; do not invent a URL.
- [ ] Use the first explicit connected `entityKey` for relation and impact lookups.
- [ ] Sort returned impact paths by server-provided `pathScore`, retain at most three in the drawer model, and never turn path score into a recommendation.
- [ ] Catch relation and impact failures independently. A root/entity identity mismatch is a localized partial failure and nulls only that supplementary result.
- [ ] Set `availability` to `partial` when any supplementary failure exists, otherwise `available`.
- [ ] Keep `counterEvidence`, `risks`, `checkpoints`, `relatedEvents`, `geo`, and `history` empty for live data when the current APIs do not prove them.

**Step 5: Run focused tests and commit**

- [ ] Run the focused test green.
- [ ] Run `pnpm --filter @stock-insight/web typecheck` and `pnpm format:check`.
- [ ] Commit only the model and its test:

```bash
git add apps/web/src/pages/research-workspace/model/market-connections.ts \
  apps/web/test/market-connections.test.ts
git commit -m "feat(workspace): 시장 연결 브리핑 모델 추가"
```

---

### Task 2: Recompose the Radar route around market changes

**Files:**

- Create: `apps/web/src/pages/research-workspace/ui/views/market-connections-view.tsx`
- Create: `apps/web/src/pages/research-workspace/ui/views/market-connections-view.module.css`
- Create: `apps/web/src/pages/research-workspace/ui/market-connection-sections.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx`
- Modify: `apps/web/test/workspace-view-region-contract.test.ts`
- Modify: `apps/web/test/research-workspace-v3-structure.test.ts`
- Create: `apps/web/test/market-connections-structure.test.ts`

Do not delete `radar-view.tsx` or `market-overview-panel.tsx` until the new view and exploration region are fully wired in Task 4.

**Step 1: Write the failing structure contracts**

- [ ] Assert that the new view renders, in order:
  1. `내 종목에 영향을 줄 시장 변화` header and four summary values;
  2. `내 종목에 연결된 주요 변화` with at most three cards;
  3. `그 밖의 시장 변화` as selectable rows.
- [ ] Keep the initial composition open for Task 4 to append `시장 흐름 더 살펴보기` after both list lanes; do not create a temporary empty surface.
- [ ] Assert that cards and rows receive the same `selectedConnectionKey` and the same opener-aware callback signature:

```ts
onSelectConnection: (
  item: MarketConnectionItem,
  opener: HTMLButtonElement,
) => void;
```

- [ ] Assert that raw strength, `매수`, `매도`, `목표가`, `손절가`, and `내일 오를` do not appear in the list UI source.
- [ ] Assert that live `ResearchWorkspacePage` derives the model from `visibleRadarPage ?? data.radar` and that preview props can override it without changing `ResearchWorkspaceViewPayload`.
- [ ] Assert that the Radar lazy registry points to `MarketConnectionsView` while retaining the section id `radar`.

Run:

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/market-connections-structure.test.ts \
  test/workspace-view-region-contract.test.ts \
  test/research-workspace-v3-structure.test.ts
```

Expected: FAIL because the new view and page props are absent.

**Step 2: Add page props and honest live derivation**

- [ ] Extend `ResearchWorkspacePageProps`:

```ts
loadMarketConnectionDetail?: MarketConnectionLoader;
marketConnections?: MarketConnectionsModel;
```

- [ ] Add:

```ts
const resolvedMarketConnections =
  data.view === 'radar'
    ? (marketConnections ?? buildMarketConnectionsModel(visibleRadarPage ?? data.radar))
    : null;
```

- [ ] Pass both `resolvedMarketConnections` and the current accumulated `RadarSignalPage` to the new view. The raw page stays only at the container boundary so the live loader can resolve `connectionKey` back to `sourceName` and `entityKey`; presentational children consume only the page model.
- [ ] Keep `loadMoreRadar` and its current cursor failure/retry behavior unchanged.

**Step 3: Implement pure section components**

- [ ] Export these component contracts from `market-connection-sections.tsx`:

```ts
type MarketConnectionSelectionProps = {
  interactive: boolean;
  selectedConnectionKey?: string;
  onSelectConnection: (item: MarketConnectionItem, opener: HTMLButtonElement) => void;
};

export function MarketConnectionSummary({
  summary,
}: {
  summary: MarketConnectionSummary;
}): ReactNode;

export function PriorityMarketChanges(
  props: MarketConnectionSelectionProps & {
    items: MarketConnectionItem[];
  },
): ReactNode;

export function MarketChangeList(
  props: MarketConnectionSelectionProps & {
    items: MarketConnectionItem[];
    pageState: DetailState;
    hasNextPage: boolean;
    onLoadMore: () => void;
  },
): ReactNode;
```

- [ ] Summary values with `null` render a visible `—` and an accessible `집계 데이터 없음` explanation.
- [ ] Priority cards render priority, market/region, title, summary/why-now when provided, connected-entity status, primary path/risk only when provided, occurred-at time, and semantic strength label.
- [ ] The remaining list uses button rows rather than a multi-column data table. It renders scope, title, market/region, occurred-at time, and semantic strength label.
- [ ] Use independent held/watched labels so an entity can display `보유종목 · 관심종목`.
- [ ] If there are no personalized priority items but market rows exist, omit the empty priority card shell and place an honest short state before the market list.
- [ ] If every list is empty, render one `WorkspaceState` and do not render empty maps or zero-score placeholders.
- [ ] The current selection uses one shared class and `aria-current="true"`; no vertical accent bar.

**Step 4: Implement `MarketConnectionsView` orchestration**

- [ ] Own these states in the view:

```ts
const [selectedConnectionKey, setSelectedConnectionKey] = useState<string>();
const [detailOpen, setDetailOpen] = useState(false);
const [detailState, setDetailState] = useState<DetailState>('error');
const [detailResult, setDetailResult] = useState<MarketConnectionLoadResult | null>(null);
const openerRef = useRef<HTMLButtonElement | null>(null);
const requestSequenceRef = useRef(0);
```

- [ ] In this task, selection may open a temporary accessible loading/ready state owned by the view; Task 5 replaces it with the full inspector. Do not duplicate the final drawer shell.
- [ ] Resolve the selected raw signal by exact `signalKey`. When a custom preview loader is absent, call `loadMarketConnectionData(signal, { loadRelation, loadImpactBrief })` using the existing lazy API-client pattern.
- [ ] Ignore stale async responses with the request sequence. Preserve selection on error so the final inspector can retry the exact item.
- [ ] Capture `event.currentTarget` explicitly and return focus to that opener on close; do not infer the opener from `document.activeElement`.
- [ ] Keep hydration-safe disabled controls via `interactive` so an SSR button cannot lose its first click before React attaches handlers.

**Step 5: Add responsive and containment CSS**

- [ ] Desktop priority cards use three equal tracks with contained text and no fixed child width:

```css
.priorityGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}
```

- [ ] At `max-width: 1240px`, stack the major sections in one reading flow; at mobile, use one column and maintain minimum 44px interactive targets.
- [ ] Use `min-width: 0`, `overflow-wrap: anywhere` only for identifiers/URLs, normal Korean word wrapping for prose, and explicit internal overflow for future maps/tables.
- [ ] Ensure selected border, background, and shadow are visible in light and dark modes and meet text contrast without relying on color alone.

**Step 6: Run focused tests and commit**

- [ ] Run the three focused Node suites green.
- [ ] Run `pnpm --filter @stock-insight/web typecheck`, `pnpm lint`, and `pnpm format:check`.
- [ ] Commit:

```bash
git add apps/web/src/pages/research-workspace/ui/views/market-connections-view.tsx \
  apps/web/src/pages/research-workspace/ui/views/market-connections-view.module.css \
  apps/web/src/pages/research-workspace/ui/market-connection-sections.tsx \
  apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx \
  apps/web/test/market-connections-structure.test.ts \
  apps/web/test/workspace-view-region-contract.test.ts \
  apps/web/test/research-workspace-v3-structure.test.ts
git commit -m "feat(workspace): 시장 변화 중심 화면 구현"
```

---

### Task 3: Add deterministic preview stories and scenarios

**Files:**

- Create: `apps/web/src/pages/dev-preview/model/market-connections-preview-fixture.ts`
- Modify: `apps/web/src/pages/dev-preview/ui/dev-preview-page.tsx`
- Modify: `apps/web/src/routes/[__dev-preview].tsx`
- Modify: `apps/web/test/dev-surface-routing.test.ts`
- Modify: `apps/web/test/market-connections.test.ts`

**Step 1: Write failing fixture and route tests**

- [ ] Assert support for:

```text
/__dev-preview?surface=market-connections&scenario=default
/__dev-preview?surface=market-connections&scenario=no-personalized
/__dev-preview?surface=market-connections&scenario=empty
/__dev-preview?surface=market-connections&scenario=partial
/__dev-preview?surface=market-connections&scenario=detail-error
```

- [ ] Assert that the default fixture has exactly three priority stories, at least one remaining personalized change, at least two broader market changes, and at least one grouped story whose `connectedEntities` contains multiple entities.
- [ ] Assert that all fixture URLs parse as HTTPS, each key is unique, priority order is deterministic, and no scenario calls a live loader.
- [ ] Assert scenario truthfulness:
  - `no-personalized`: no priority items and all visible items have market-only scope;
  - `empty`: zero count, no items, and no detail entry point;
  - `partial`: base stories load while relation/geo/history failures are localized;
  - `detail-error`: selected story remains selected while the loader rejects.

Run:

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/market-connections.test.ts \
  test/dev-surface-routing.test.ts
```

Expected: FAIL because the fixture, surface, and scenario resolver are absent.

**Step 2: Build complete grouped preview stories**

- [ ] Export:

```ts
export type MarketConnectionsPreviewScenario =
  | 'default'
  | 'no-personalized'
  | 'empty'
  | 'partial'
  | 'detail-error';

export function resolveMarketConnectionsPreview(scenario: MarketConnectionsPreviewScenario): {
  data: Extract<ResearchWorkspaceViewPayload, { view: 'radar' }>;
  marketConnections: MarketConnectionsModel;
  loader: MarketConnectionLoader;
};
```

- [ ] Use complete deterministic stories rather than reusing live Radar normalization. At minimum include:
  - a semiconductor supply/AI infrastructure story connecting Samsung Electronics, SK Hynix, NVIDIA, and Micron;
  - a platform advertising or commerce story connecting NAVER and relevant market factors;
  - a rates/currency/commodity story with a clear propagation path and counter-evidence;
  - broader market-only changes so the lower list remains meaningful.
- [ ] Provide paths, up to three sources per story, risks, counter-evidence, checkpoints, evidence level, related events, relation data, geo data, and history data when the scenario permits.
- [ ] Keep all language informational and uncertainty-aware. Do not include trading instructions or price targets.

**Step 3: Wire the surface without affecting Stocks scenarios**

- [ ] Split the current Stocks-only scenario type so each surface validates its own allowed values. `no-holdings` must remain Stocks-only; `no-personalized` and `partial` must remain Market Connections-only.
- [ ] `DevPreviewPage` chooses the Market Connections resolver only for `surface === 'market-connections'` and passes:

```tsx
<ResearchWorkspacePage
  data={preview.data}
  marketConnections={preview.marketConnections}
  loadMarketConnectionDetail={preview.loader}
  navigationMode="static"
  canManageInvitations={false}
  onLogout={async () => false}
  onPrefetchSection={() => undefined}
  onUrlStateChange={async () => undefined}
  urlState={{ view: 'radar' }}
/>
```

- [ ] Preserve the existing Today, Stocks, workspace, and admin-invitations paths exactly.

**Step 4: Run focused tests and commit**

- [ ] Run the focused model and route tests green.
- [ ] Run `pnpm --filter @stock-insight/web typecheck` and `pnpm format:check`.
- [ ] Open `/__dev-preview?surface=market-connections&scenario=default` locally only to confirm the route renders; visual approval happens after Tasks 4 and 5.
- [ ] Commit:

```bash
git add apps/web/src/pages/dev-preview/model/market-connections-preview-fixture.ts \
  apps/web/src/pages/dev-preview/ui/dev-preview-page.tsx \
  'apps/web/src/routes/[__dev-preview].tsx' \
  apps/web/test/dev-surface-routing.test.ts \
  apps/web/test/market-connections.test.ts
git commit -m "feat(workspace): 시장 연결 프리뷰 fixture 추가"
```

---

### Task 4: Convert the equal-weight overview into secondary exploration

**Files:**

- Create: `apps/web/src/pages/research-workspace/ui/market-exploration.tsx`
- Modify: `apps/web/src/pages/research-workspace/model/market-overview.ts`
- Modify: `apps/web/src/pages/research-workspace/ui/market-overview.module.css`
- Modify: `apps/web/src/pages/research-workspace/ui/views/market-connections-view.tsx`
- Modify: `apps/web/test/market-overview.test.ts`
- Modify: `apps/web/test/market-overview-ui-structure.test.ts`
- Modify: `apps/web/test/market-connections-structure.test.ts`
- Delete after the new owner is wired: `apps/web/src/pages/research-workspace/ui/market-overview-panel.tsx`
- Delete after the lazy registry points only at the new view: `apps/web/src/pages/research-workspace/ui/views/radar-view.tsx`

**Step 1: Rewrite the failing overview contracts**

- [ ] Replace assertions for equal `event_radar`, `heatmap_matrix`, and other primary modes with exactly four secondary exploration ids:

```ts
export const MARKET_EXPLORATION_IDS = [
  'factor_map',
  'propagation_map',
  'timeline',
  'map_globe',
] as const;
```

- [ ] Assert `factor_map` is the default, the heatmap rows render inside its accessible comparison table, and no separate `event_radar` or `heatmap_matrix` trigger exists.
- [ ] Assert each exploration reads its own component watermark, availability, row count, and as-of time.
- [ ] Assert `connectionKey`-less map markers, factor aggregates, and heatmap cells are not buttons and cannot open a fabricated detail.
- [ ] Assert only a genuinely keyed source item may call the shared `onSelectConnection` callback.

Run:

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/market-overview.test.ts \
  test/market-overview-ui-structure.test.ts \
  test/market-connections-structure.test.ts
```

Expected: FAIL against the current equal-mode owner.

**Step 2: Refactor the model without changing its source data**

- [ ] Retain `buildMarketOverview(data.items, geoSnapshot)` or rename it only if all existing callers/tests migrate in the same commit.
- [ ] Remove obsolete primary-mode navigation metadata for event radar and standalone heatmap, but retain the derived signal groups, heatmap rows, propagation items, timeline items, and geo snapshot.
- [ ] Provide a `MarketExplorationId` union from the four ids and a state resolver that reports `available`, `partial`, `stale`, `missing`, or `error` from the relevant component watermark.
- [ ] Do not let one watermark hide another exploration.

**Step 3: Implement `MarketExploration`**

- [ ] Use a small four-option accessible tab/toggle owner with `factor_map` default and component-local state only; do not add localStorage or sessionStorage.
- [ ] Render:
  - `요인별 변화`: signal-group summaries plus the existing heatmap rows as an accessible comparison table with internal horizontal scrolling;
  - `전파 경로`: directionally ordered propagation cards/rows;
  - `시간 흐름`: the existing chronological timeline;
  - `세계 지도`: `GeoMarketMap` with precision and watermark explanation.
- [ ] Keep all aggregate surfaces read-only unless a source record carries an exact `connectionKey` supplied by the page model.
- [ ] Render stale/partial/missing/error states per exploration, including visible as-of information and `갱신 지연` for stale data.

**Step 4: Complete the owner migration**

- [ ] Append `MarketExploration` below both market-change lanes in `MarketConnectionsView`.
- [ ] Remove `MarketOverviewPanel` and the old `RadarView` only after imports and lazy contracts are green.
- [ ] Confirm the route path, navigation id, Radar payload, pagination, and Geo payload stay unchanged.

**Step 5: Run focused tests and commit**

- [ ] Run all three focused suites green.
- [ ] Run `pnpm --filter @stock-insight/web typecheck`, `pnpm lint`, and `pnpm format:check`.
- [ ] Commit:

```bash
git add apps/web/src/pages/research-workspace/ui/market-exploration.tsx \
  apps/web/src/pages/research-workspace/model/market-overview.ts \
  apps/web/src/pages/research-workspace/ui/market-overview.module.css \
  apps/web/src/pages/research-workspace/ui/views/market-connections-view.tsx \
  apps/web/test/market-overview.test.ts \
  apps/web/test/market-overview-ui-structure.test.ts \
  apps/web/test/market-connections-structure.test.ts \
  apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx \
  apps/web/test/workspace-view-region-contract.test.ts
git add -u apps/web/src/pages/research-workspace/ui/market-overview-panel.tsx \
  apps/web/src/pages/research-workspace/ui/views/radar-view.tsx
git commit -m "refactor(workspace): 시장 탐색 보조 화면 재구성"
```

---

### Task 5: Implement the shared Market Connection inspector

**Files:**

- Create: `apps/web/src/pages/research-workspace/ui/market-connection-inspector.tsx`
- Create: `apps/web/src/pages/research-workspace/ui/market-connection-inspector.module.css`
- Modify: `apps/web/src/pages/research-workspace/ui/views/market-connections-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/model/detail-inspector-layout.ts`
- Modify: `apps/web/test/detail-inspector-frame.test.ts`
- Modify: `apps/web/test/market-connections-structure.test.ts`
- Modify: `e2e/today-preview-experience.spec.ts` only if opener regression coverage needs the shared frame's third consumer; do not change approved Today behavior.
- Modify: `e2e/stocks-preview-experience.spec.ts` only if shared-frame regression coverage needs the third consumer; do not change approved Stocks behavior.

**Step 1: Write failing inspector contracts**

- [ ] Assert the ordered drawer/mobile sections are:
  1. `시장 변화 요약`;
  2. `왜 지금 중요한가` when present;
  3. `연결된 내 보유·관심 종목` when present;
  4. `시장 변화가 종목까지 이어지는 영향 경로` when present;
  5. `관련 뉴스·공시·근거 출처` when present;
  6. `반대 근거와 확인할 리스크` when present;
  7. `데이터 기준 시각과 근거 수준`.
- [ ] Assert missing optional sections are omitted, partial failures render only in their owning sections, and source anchors exist only for valid HTTPS URLs.
- [ ] Assert links use `target="_blank"` and `rel="noreferrer"`.
- [ ] Assert the raw value is absent from cards/rows and appears only in the metadata with this boundary:

```text
관측된 신호의 상대 강도이며 상승·하락 확률이나 가격 전망이 아닙니다.
```

- [ ] Assert the modal adds relation graph, geo location/precision, full paths, related companies/themes, previous events, and the factor comparison table only when those data exist.
- [ ] Assert all presentation modes receive the same already-loaded result; switching drawer/modal never calls the loader again.
- [ ] Assert the width key equals `stock-insight:market-connection-inspector-width` and differs from Today and Stocks keys.

Run:

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/market-connections-structure.test.ts \
  test/detail-inspector-frame.test.ts
```

Expected: FAIL because the inspector and storage key are absent.

**Step 2: Add the independent storage key**

- [ ] Add only this constant to `detail-inspector-layout.ts`; do not change frame dimensions or shared motion:

```ts
export const marketConnectionInspectorWidthStorageKey =
  'stock-insight:market-connection-inspector-width';
```

**Step 3: Implement the presentation-aware inspector**

- [ ] Use `DetailInspectorFrame` directly:

```tsx
<DetailInspectorFrame
  open={open}
  titleId={titleId}
  storageKey={marketConnectionInspectorWidthStorageKey}
  onOpenChange={onOpenChange}
  onCloseAutoFocus={onCloseAutoFocus}
>
  {({ presentation }) => (
    <MarketConnectionDetailContent result={result} presentation={presentation} onRetry={onRetry} />
  )}
</DetailInspectorFrame>
```

- [ ] Keep the frame as the sole owner of desktop drawer, wide modal, mobile bottom-sheet, overlay, resizing, transitions, Escape, and reduced-motion behavior.
- [ ] Render loading, required-detail error with retry, missing, partial, and ready states inside the same frame.
- [ ] In drawer/mobile, show the seven approved sections only. In modal, use a two-column layout and add supplementary map/relation/history/factor sections.
- [ ] Use separate blocks for risks and counter-evidence but keep them under the same approved section heading.
- [ ] Render held/watched state independently for every connected entity.
- [ ] Use normal Korean prose wrapping; prevent `PropertyList` or other shared-grid styles from squeezing values into character-level columns at 520px and the 420px minimum.

**Step 4: Connect all exact entry points to one selection/result**

- [ ] Priority cards and remaining rows must use the same `selectedConnectionKey`, loader call, result state, and inspector.
- [ ] If Task 4 exposes an exact keyed source item in an exploration, pass it through the same callback. Aggregate factor/map/timeline cells remain non-interactive.
- [ ] Overlay click and Escape close only the inspector. They must not activate the card or row behind it or replace selection.
- [ ] Restore focus to the exact `event.currentTarget` opener on every viewport, including programmatic, touch, and assistive-technology activation.
- [ ] Ignore late responses after a different item is selected or the same item is retried.

**Step 5: Run focused and shared-frame regressions**

- [ ] Run focused Node tests green.
- [ ] Run the relevant Today and Stocks inspector E2E suites to prove the shared frame has not regressed:

```bash
pnpm exec playwright test \
  e2e/today-preview-experience.spec.ts \
  e2e/stocks-preview-experience.spec.ts \
  --project=desktop --project=mobile --workers=1
```

- [ ] Run `pnpm --filter @stock-insight/web typecheck`, `pnpm lint`, and `pnpm format:check`.
- [ ] Commit:

```bash
git add apps/web/src/pages/research-workspace/ui/market-connection-inspector.tsx \
  apps/web/src/pages/research-workspace/ui/market-connection-inspector.module.css \
  apps/web/src/pages/research-workspace/ui/views/market-connections-view.tsx \
  apps/web/src/pages/research-workspace/model/detail-inspector-layout.ts \
  apps/web/test/detail-inspector-frame.test.ts \
  apps/web/test/market-connections-structure.test.ts \
  e2e/today-preview-experience.spec.ts \
  e2e/stocks-preview-experience.spec.ts
git commit -m "feat(workspace): 시장 연결 상세 인스펙터 구현"
```

If neither existing E2E file changes, omit it from staging rather than touching it mechanically.

---

### Task 6: Add end-to-end scenarios and close the rollout bundle

**Files:**

- Create: `e2e/market-connections-preview-experience.spec.ts`
- Modify: `apps/web/test/dev-surface-routing.test.ts`
- Modify: `e2e/research-workspace-v3.spec.ts`
- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`
- Include: `docs/superpowers/plans/2026-08-07-market-connections-redesign.md`

**Step 1: Write the failing Playwright coverage**

- [ ] Cover the default desktop flow:
  - summary appears before priority changes;
  - priority card count is at most three;
  - personalized changes appear before broader market changes;
  - grouped fixture story shows multiple connected entities;
  - cards, rows, and any exact keyed exploration entry show the same selected state and matching detail;
  - raw strength and prohibited advisory/price-prediction wording are absent from the page list.
- [ ] Cover the inspector contract:
  - drawer overlays without changing the underlying page geometry;
  - default width is 520px and clamps at 420–760px;
  - pointer and keyboard resizing work;
  - width survives close/reopen in its independent session key;
  - overlay click and Escape close only the detail;
  - exact opener regains focus;
  - modal switching does not add a detail request;
  - modal keeps at least 26px design margin after motion settles;
  - source links are valid HTTPS and open a new tab;
  - 420px drawer summary/details do not wrap at character level.
- [ ] Cover secondary exploration:
  - factor view is the default;
  - exactly four exploration triggers exist;
  - heatmap comparison is inside factors rather than a fifth mode;
  - read-only aggregate/map items do not open detail;
  - each partial/stale/missing state is localized.
- [ ] Cover scenarios:
  - `no-personalized` starts with broader market changes and does not fabricate priority cards;
  - `empty` renders one honest empty state without maps or scores;
  - `partial` preserves base stories and marks only failed detail/exploration sections;
  - `detail-error` keeps selection, renders retry, and succeeds when the deterministic retry fixture allows it, or remains a stable error if the fixture is intentionally permanent.
- [ ] Cover 1240px stacked layout, 390px mobile bottom-sheet from below, light/dark modes, reduced motion, keyboard navigation, and Axe smoke.

Run:

```bash
pnpm exec playwright test e2e/market-connections-preview-experience.spec.ts \
  --project=desktop --project=mobile
```

Expected: FAIL until all selectors, scenarios, and final interaction details are implemented.

**Step 2: Implement only the failures inside the approved design**

- [ ] Fix product or fixture failures narrowly. Do not use the E2E step to add new cards, aggregates, tabs, APIs, or copy outside the approved design.
- [ ] For motion-sensitive geometry, wait for stable geometry before measurement and keep a small CSS safety margin for subpixel rounding.
- [ ] For hydration-sensitive controls, assert disabled SSR state and wait for interactive hydration rather than adding arbitrary sleeps.
- [ ] Replace obsolete Radar equal-mode assertions in `e2e/research-workspace-v3.spec.ts` with the new semantic headings and retain payload/pagination checks.

**Step 3: Perform real browser review**

- [ ] In the Codex in-app browser, inspect:
  - `/__dev-preview?surface=market-connections&scenario=default` at desktop;
  - the same route at 1240px or narrower stacked layout;
  - the same route at 390px with the bottom-sheet open;
  - `no-personalized`, `empty`, `partial`, and `detail-error` states;
  - light and dark themes.
- [ ] Check alignment, card density, text wrapping, border clipping, overlay brightness, bottom-sheet direction, selected-state consistency, map/table containment, and drawer/modal controls.
- [ ] Record product defects separately from test-locator or environment issues; fix product defects and rerun the smallest proving test.

**Step 4: Run final automated verification**

- [ ] Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter @stock-insight/web exec node --test \
  test/market-connections.test.ts \
  test/market-connections-structure.test.ts \
  test/market-overview.test.ts \
  test/market-overview-ui-structure.test.ts \
  test/detail-inspector-frame.test.ts \
  test/dev-surface-routing.test.ts \
  test/workspace-view-region-contract.test.ts \
  test/research-workspace-v3-structure.test.ts
pnpm exec playwright test \
  e2e/market-connections-preview-experience.spec.ts \
  e2e/today-preview-experience.spec.ts \
  e2e/stocks-preview-experience.spec.ts \
  --project=desktop --project=mobile
pnpm test
pnpm build
pnpm verify:release
git diff --check
```

- [ ] If `pnpm verify:release` reaches an environment-dependent database or authenticated gate that cannot run, record the exact missing variable and first failing command. Do not claim that gate passed; complete every independent preceding gate.
- [ ] Run `graphify update .` after the last code change, then confirm ignored graph output does not enter staging.

**Step 5: Update the rollout ledger and final commit**

- [ ] Update `docs/superpowers/UI-SYSTEM-ROLLOUT.md` with:
  - approved design/spec and plan paths;
  - shared/ui adoption boundary;
  - desktop, 1240px, and 390px browser review result;
  - default and four non-default scenario result;
  - focused, E2E, full-test, build, and release-gate evidence;
  - exact deferred environment gate, if any;
  - explicit statement that DB/API/contracts were unchanged.
- [ ] Review `git diff --stat`, `git diff --check`, `git status --short`, and the staged file list.
- [ ] Commit only the final verification bundle:

```bash
git add e2e/market-connections-preview-experience.spec.ts \
  e2e/research-workspace-v3.spec.ts \
  apps/web/test/dev-surface-routing.test.ts \
  docs/superpowers/UI-SYSTEM-ROLLOUT.md \
  docs/superpowers/plans/2026-08-07-market-connections-redesign.md
git commit -m "test(workspace): 시장 연결 경험 검증"
```

---

## Plan Self-Review Checklist

- [ ] Every acceptance criterion in `docs/superpowers/specs/2026-08-07-market-connections-redesign-design.md` maps to at least one implementation step and one focused or E2E assertion.
- [ ] No step changes DB, migrations, API server, public contracts, route path, or navigation section id.
- [ ] Live and preview adapters remain visibly separate; live Radar rows are never inferred into grouped stories.
- [ ] Priority order is server/fixture owned and the browser computes no score.
- [ ] Unsupported aggregates, sources, risks, evidence, geo, and history render honest unavailable/omitted states.
- [ ] All exact selected entry points share one key, selection style, load result, frame, and opener restoration path.
- [ ] Aggregate exploration surfaces without an exact key remain read-only.
- [ ] Detail section order, raw-strength boundary, source-link safety, partial failures, and no-refetch switching are explicit.
- [ ] Responsive, dark-mode, reduced-motion, keyboard, focus, overlay, geometry, wrapping, and Axe checks are present.
- [ ] Today and Stocks shared-frame regressions are included.
- [ ] Every task has a failing command, green command, exact paths, and a scoped commit.
- [ ] There are no unfinished markers, omitted interfaces, or unspecified test expectations in this plan.

## Execution Choice

After this plan is approved, choose one execution mode:

1. **Subagent-Driven Development (recommended):** Execute one task at a time with a fresh implementation agent and a separate specification/code-quality review after each task.
2. **Inline execution:** Execute the six tasks sequentially in this task, preserving the same TDD, scoped-commit, browser-review, and verification gates.
