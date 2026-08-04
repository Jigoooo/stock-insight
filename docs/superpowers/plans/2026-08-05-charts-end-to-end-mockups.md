# Charts End-to-End Mockups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build nine deterministic, interactive chart mockups in UI Lab: Market Tape, Evidence Band, and Candle Ledger, each with independently styled A/B/C variants that share state and behavior.

**Architecture:** Keep all comparison state and fixtures in `pages/ui-lab`; keep direct Bklit and TradingView imports in non-public `shared/ui/chart/internal` adapters; expose no `shared/ui/chart` public barrel until visual approval. Mount only the active role, reuse the 5B Feedback API for non-ready states, and give every visual chart an HTML summary plus native data-table alternative.

**Tech Stack:** React 19, TypeScript 6, CSS Modules, existing Tabs/ToggleGroup/Feedback/Motion primitives, vendored Bklit built on Visx, TradingView Lightweight Charts `5.2.0`, Node test runner, Playwright, Axe.

## Global Constraints

- Worktree: `/Users/kimjigoooo/workspace/futur/stock-insight/.worktrees/menu-overlay-mockups`.
- Complete and commit the already-approved 5B dirty changes before Task 1; never mix 5B files into a chart commit.
- Build exactly three roles × three variants: Market Tape A/B/C, Evidence Band A/B/C, Candle Ledger A/B/C.
- A/B/C within one role share fixture, range, status, selection, formatter, and core interactions; only visual hierarchy, surface, emphasis, and motion differ.
- Use one deterministic 180-bar fixture. Never call `Math.random()`, fetch, route navigation, timers that simulate live quotes, or authenticated APIs.
- Use Bklit and TradingView Lightweight Charts as the only renderers. Do not add Recharts, Framer Motion, GSAP, Rive, Lottie, Anime.js, WebGL, providers, packages, or proprietary assets.
- Do not modify `apps/web/src/shared/ui/chart/vendor/bklit/**` for mockup styling.
- Do not create or export the public `shared/ui/chart` API before visual approval.
- Product layers must not import `lightweight-charts` or Bklit vendor files directly.
- UI Lab may import only the non-public adapters under `shared/ui/chart/internal`.
- Preserve `prefers-reduced-motion`; direct brush, pan, zoom, and crosshair manipulation remains available.
- Preserve visible TradingView attribution.
- Keep all chart viewports fixed-height and horizontally contained at 390px.
- Run only the narrow tests named in this plan during mockup work.
- Each commit stages only the files named in that task.

## File Map

### UI Lab model and composition

- Create `apps/web/src/pages/ui-lab/ui/chart-catalog-model.ts`: role/variant/state metadata, range slicing, OHLC validation, range clamping, selection helpers, formatter contract.
- Create `apps/web/src/pages/ui-lab/ui/chart-fixtures.ts`: deterministic 180 bars, three evidence records, two bands, stock metadata.
- Create `apps/web/src/pages/ui-lab/ui/chart-preview-frame.tsx`: shared figure header, current-value summary, state surface, attribution slot, and native data-table disclosure.
- Create `apps/web/src/pages/ui-lab/ui/chart-catalog.tsx`: role tabs and shared controls/state; mounts A/B/C only for the active role.
- Create `apps/web/src/pages/ui-lab/ui/chart-catalog.module.css`: full-width variant stack, three role-specific visual languages, fixed viewport geometry, mobile and reduced-motion rules.
- Create `apps/web/src/pages/ui-lab/ui/market-tape-preview.tsx`: Market Tape A/B/C shells using the internal Bklit renderer.
- Create `apps/web/src/pages/ui-lab/ui/evidence-band-preview.tsx`: Evidence Band A/B/C shells and keyboard-owned evidence list.
- Create `apps/web/src/pages/ui-lab/ui/candle-ledger-preview.tsx`: Candle Ledger A/B/C shells and OHLCV readout.
- Modify `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx`: mount `ChartCatalog` inside `TabsContent value="in-progress"`.

### Renderer boundary

- Create `apps/web/src/shared/ui/chart/internal/bklit-preview.tsx`: non-public Area/Composed/Brush/ReferenceArea/marker adapters.
- Create `apps/web/src/shared/ui/chart/internal/lightweight-preview.tsx`: dynamic Lightweight Charts client lifecycle adapter.
- Do not create `apps/web/src/shared/ui/chart/index.ts` in this phase.
- Do not modify `apps/web/src/shared/ui/index.ts` in this phase.

### Tests and rollout record

- Create `apps/web/test/ui-lab-chart-model.test.ts`: exactly two Node test cases.
- Create `e2e/ui-lab-charts.spec.ts`: exactly three Playwright test cases.
- Modify `apps/web/test/chart-upstream-contract.test.ts`: assert the two internal adapter files are the only non-vendor direct renderer import boundary without weakening product-layer checks.
- Modify `docs/superpowers/UI-SYSTEM-ROLLOUT.md`: record implementation and narrow verification, leaving visual approval and publicization pending.

---

### Task 0: Close the prior 5B dirty lane

**Files:**

- Verify and commit only the currently dirty 5B files already present before this plan starts.
- Do not stage any file listed in the chart File Map above except pre-existing `ui-lab-page.tsx` and rollout-ledger hunks that belong to 5B.

**Interfaces:**

- Consumes: the already-approved 5B public Table, DataGrid, Feedback, and product-audit changes.
- Produces: a worktree where subsequent chart edits can be staged independently and `git status --short` has no unexplained 5B changes.

- [ ] **Step 1: Capture the prior lane inventory**

Run:

```bash
git status --short
git diff -- apps/web/src/shared/ui apps/web/src/pages/ui-lab docs/superpowers/UI-SYSTEM-ROLLOUT.md
```

Expected: only the known 5B publicization/product-audit family from the preceding approved work.

- [ ] **Step 2: Run the narrow 5B checks**

Run:

```bash
cd apps/web && node --test test/data-feedback-model.test.ts test/data-feedback-public.test.ts
pnpm --filter @stock-insight/web typecheck
PLAYWRIGHT_BASE_URL=http://127.0.0.1:6110 \
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER \
pnpm exec playwright test e2e/ui-lab-data-feedback.spec.ts --project=desktop --workers=1
pnpm exec oxfmt --check \
  apps/web/src/entities/stock/ui/stock-detail.module.css \
  apps/web/src/entities/stock/ui/stock-detail.tsx \
  apps/web/src/pages/ui-lab/ui/data-feedback-catalog.module.css \
  apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx \
  apps/web/src/pages/ui-lab/ui/data-feedback-grid-preview.tsx \
  apps/web/src/pages/ui-lab/ui/data-feedback-model.ts \
  apps/web/src/pages/ui-lab/ui/data-feedback-sort-indicator.tsx \
  apps/web/src/pages/ui-lab/ui/data-feedback-state-previews.tsx \
  apps/web/src/pages/ui-lab/ui/data-feedback-table-preview.tsx \
  apps/web/src/pages/ui-lab/ui/menu-overlay-model.ts \
  apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx \
  apps/web/src/shared/ui/data-grid \
  apps/web/src/shared/ui/feedback \
  apps/web/src/shared/ui/index.ts \
  apps/web/src/shared/ui/table \
  apps/web/src/shared/ui/workspace/workspace-state.tsx \
  apps/web/test/data-feedback-model.test.ts \
  apps/web/test/data-feedback-public.test.ts \
  docs/superpowers/UI-SYSTEM-ROLLOUT.md \
  e2e/ui-lab-data-feedback.spec.ts
pnpm exec oxlint \
  apps/web/src/entities/stock/ui/stock-detail.tsx \
  apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx \
  apps/web/src/pages/ui-lab/ui/data-feedback-grid-preview.tsx \
  apps/web/src/pages/ui-lab/ui/data-feedback-model.ts \
  apps/web/src/pages/ui-lab/ui/data-feedback-sort-indicator.tsx \
  apps/web/src/pages/ui-lab/ui/data-feedback-state-previews.tsx \
  apps/web/src/pages/ui-lab/ui/data-feedback-table-preview.tsx \
  apps/web/src/pages/ui-lab/ui/menu-overlay-model.ts \
  apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx \
  apps/web/src/shared/ui/data-grid \
  apps/web/src/shared/ui/feedback \
  apps/web/src/shared/ui/index.ts \
  apps/web/src/shared/ui/table \
  apps/web/src/shared/ui/workspace/workspace-state.tsx \
  apps/web/test/data-feedback-model.test.ts \
  apps/web/test/data-feedback-public.test.ts \
  e2e/ui-lab-data-feedback.spec.ts
git diff --check
```

Expected: every recorded command exits `0`; failures are repaired within the 5B files before continuing.

- [ ] **Step 3: Commit the prior lane separately**

Stage the explicit 5B paths shown in Step 2, including `apps/web/src/shared/ui/data-grid/`, then inspect `git diff --cached --name-only`. The staged set must exclude `docs/superpowers/plans/2026-08-05-charts-end-to-end-mockups.md` and every chart implementation file. Commit:

```bash
git commit -m "feat(ui): Data Feedback 공용화와 제품 연결"
```

Expected: no chart implementation file is present in this commit.

### Task 1: Lock the chart catalog model and deterministic fixture

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/chart-catalog-model.ts`
- Create: `apps/web/src/pages/ui-lab/ui/chart-fixtures.ts`
- Create: `apps/web/test/ui-lab-chart-model.test.ts`

**Interfaces:**

- Produces: `ChartRoleId`, `ChartVariantId`, role-specific variant IDs, `ChartPreviewState`, `ChartRange`, `ChartBar`, `EvidenceRecord`, `ReferenceBand`, `ChartRangeSelection`, `ChartFixture`, `chartRoles`, `chartVariants`, `chartPreviewStates`, `sliceBarsByRange()`, `filterBarsBySelection()`, `validateChartBars()`, `clampRangeSelection()`, `findEvidenceVisibleDomain()`, `chartFixture`.
- Consumes: `PriceSeriesRange` semantics from `@stock-insight/contracts`, without importing product data or fetching.

- [ ] **Step 1: Write the two failing Node contracts**

Create the test with exactly these two cases:

```ts
describe('UI Lab chart model', () => {
  it('defines three roles with three independent variants and a deterministic 180-bar fixture', () => {
    assert.deepEqual(
      chartRoles.map(({ id }) => id),
      ['market-tape', 'evidence-band', 'candle-ledger'],
    );
    assert.deepEqual(
      chartRoles.map(({ id }) => chartVariants[id].length),
      [3, 3, 3],
    );
    assert.equal(chartFixture.bars.length, 180);
    assert.deepEqual(createChartFixture(), chartFixture);
    assert.equal(chartFixture.bars.filter(({ volume }) => volume === null).length, 3);
    assert.deepEqual(chartPreviewStates, [
      'ready',
      'loading',
      'stale',
      'partial',
      'empty',
      'error',
      'unavailable',
    ]);
  });

  it('slices ranges and rejects invalid OHLC, duplicate timestamps, and broken evidence bounds', () => {
    assert.equal(sliceBarsByRange(chartFixture.bars, '1M').length, 22);
    assert.equal(sliceBarsByRange(chartFixture.bars, '3M').length, 66);
    assert.equal(sliceBarsByRange(chartFixture.bars, '6M').length, 126);
    assert.equal(sliceBarsByRange(chartFixture.bars, '1Y').length, 180);
    assert.deepEqual(validateChartBars(chartFixture.bars), { valid: true, issues: [] });
    assert.equal(validateChartBars([...chartFixture.bars, chartFixture.bars[0]!]).valid, false);
    assert.ok(chartFixture.evidence.every(({ barIndex }) => chartFixture.bars[barIndex]));
    assert.ok(
      chartFixture.bands.every(
        ({ startIndex, endIndex }) =>
          startIndex >= 0 && endIndex < chartFixture.bars.length && startIndex < endIndex,
      ),
    );
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run:

```bash
cd apps/web && node --test test/ui-lab-chart-model.test.ts
```

Expected: FAIL because `chart-catalog-model.ts` and `chart-fixtures.ts` do not exist.

- [ ] **Step 3: Implement the exact model surface**

Use these unions and range counts:

```ts
export type ChartRoleId = 'market-tape' | 'evidence-band' | 'candle-ledger';
export type ChartRange = '1M' | '3M' | '6M' | '1Y';
export type MarketTapeVariantId = 'quiet-trace' | 'layered-range' | 'signal-ledger';
export type EvidenceBandVariantId = 'band-ledger' | 'event-pulse' | 'evidence-split';
export type CandleLedgerVariantId = 'clean-candle' | 'dual-pane' | 'market-ledger';
export type ChartVariantId = MarketTapeVariantId | EvidenceBandVariantId | CandleLedgerVariantId;
export type ChartPreviewState =
  | 'ready'
  | 'loading'
  | 'stale'
  | 'partial'
  | 'empty'
  | 'error'
  | 'unavailable';

export type ChartBar = {
  date: Date;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type ChartRangeSelection = {
  start: Date;
  end: Date;
};

export type EvidenceRecord = {
  id: string;
  barIndex: number;
  tone: 'positive' | 'neutral' | 'risk';
  title: string;
  sourceCount: number;
};

export type ReferenceBand = {
  id: string;
  startIndex: number;
  endIndex: number;
  low: number;
  high: number;
  label: string;
};

export type ChartFixture = {
  entityKey: string;
  ticker: string;
  market: 'KR' | 'US';
  currency: 'KRW' | 'USD';
  asOf: string;
  bars: readonly ChartBar[];
  evidence: readonly EvidenceRecord[];
  bands: readonly ReferenceBand[];
};

export const rangeBarCounts: Record<ChartRange, number> = {
  '1M': 22,
  '3M': 66,
  '6M': 126,
  '1Y': 180,
};
```

`validateChartBars()` must report an issue when timestamps are not strictly increasing, duplicate, non-finite, or when `low > min(open, close)`, `high < max(open, close)`, or `low > high`. `clampRangeSelection()` must order and clamp dates to the current slice without mutating its input.

Use these signatures:

```ts
export function sliceBarsByRange(bars: readonly ChartBar[], range: ChartRange): ChartBar[];
export function filterBarsBySelection(
  bars: readonly ChartBar[],
  selection: ChartRangeSelection | null,
): ChartBar[];
export function clampRangeSelection(
  selection: ChartRangeSelection | null,
  bars: readonly ChartBar[],
): ChartRangeSelection | null;
export function findEvidenceVisibleDomain(
  evidence: EvidenceRecord,
  bars: readonly ChartBar[],
  visibleBarCount: number,
): ChartRangeSelection;
```

- [ ] **Step 4: Implement the deterministic fixture**

Use UTC day increments from `2026-01-02T00:00:00.000Z`; derive open/close from fixed sine, trend, and modulo terms; derive `high` and `low` from `Math.max/Math.min`; set volume to `null` only at indexes `19`, `83`, and `147`. Evidence indexes are `44`, `96`, and `152`; band bounds are `35..61` and `118..141`. Export both `createChartFixture()` and module-level `chartFixture = createChartFixture()`.

- [ ] **Step 5: Run the model test and commit**

Run:

```bash
cd apps/web && node --test test/ui-lab-chart-model.test.ts
```

Expected: 2 tests pass.

Commit:

```bash
git add apps/web/src/pages/ui-lab/ui/chart-catalog-model.ts apps/web/src/pages/ui-lab/ui/chart-fixtures.ts apps/web/test/ui-lab-chart-model.test.ts
git commit -m "feat(ui-lab): 결정론적 차트 목업 모델 추가"
```

### Task 2: Create the non-public Bklit preview boundary

**Files:**

- Create: `apps/web/src/shared/ui/chart/internal/bklit-preview.tsx`
- Modify: `apps/web/test/chart-upstream-contract.test.ts`

**Interfaces:**

- Consumes: `ChartBar`, `ChartRangeSelection`, `EvidenceRecord`, `ReferenceBand` from Task 1.
- Produces: `BklitMarketTapeRenderer`, `BklitEvidenceBandRenderer`, `BklitVariantTone`.

- [ ] **Step 1: Extend the renderer-boundary contract before implementation**

Add a third test that reads the two internal adapters and asserts direct imports are restricted to them:

```ts
it('limits direct renderer imports to non-public chart adapters', async () => {
  const internalRoot = new URL('../src/shared/ui/chart/internal/', import.meta.url);
  const files = await readdir(internalRoot, { withFileTypes: true });
  assert.deepEqual(
    files
      .filter(({ name }) => /-preview\.tsx$/.test(name))
      .map(({ name }) => name)
      .sort(),
    ['bklit-preview.tsx'],
  );
  const sources = await sourceFiles(internalRoot);
  assert.equal(sources.filter((source) => /vendor\/bklit/.test(source)).length, 1);
  assert.equal(
    sources.filter((source) => /from ['"]lightweight-charts['"]/.test(source)).length,
    0,
  );
  assert.equal(
    sources.filter((source) => /import\(['"]lightweight-charts['"]\)/.test(source)).length,
    0,
  );
});
```

- [ ] **Step 2: Implement the Bklit props and direct imports**

Use explicit file imports, not a new barrel:

```ts
import { AreaChart } from '@/shared/ui/chart/vendor/bklit/area-chart';
import { Area } from '@/shared/ui/chart/vendor/bklit/area';
import { ChartBrush } from '@/shared/ui/chart/vendor/bklit/chart-brush';
import { ChartBrushLayout } from '@/shared/ui/chart/vendor/bklit/chart-brush-layout';
import { ComposedChart } from '@/shared/ui/chart/vendor/bklit/composed-chart';
import { Grid } from '@/shared/ui/chart/vendor/bklit/grid';
import { ChartMarkers } from '@/shared/ui/chart/vendor/bklit/markers';
import { ReferenceArea } from '@/shared/ui/chart/vendor/bklit/reference-area';
import { Line } from '@/shared/ui/chart/vendor/bklit/line';
import { SeriesBar } from '@/shared/ui/chart/vendor/bklit/series-bar';
import { ChartTooltip } from '@/shared/ui/chart/vendor/bklit/tooltip/chart-tooltip';
import { XAxis } from '@/shared/ui/chart/vendor/bklit/x-axis';
import { YAxis } from '@/shared/ui/chart/vendor/bklit/y-axis';
```

Define props with controlled selection:

```ts
export type BklitMarketTapeRendererProps = {
  bars: readonly ChartBar[];
  currency: 'KRW' | 'USD';
  rangeSelection: ChartRangeSelection | null;
  reducedMotion: boolean;
  status: 'ready' | 'loading';
  tone: 'quiet-trace' | 'layered-range' | 'signal-ledger';
  onRangeSelectionChange: (selection: ChartRangeSelection | null) => void;
};
```

The evidence renderer receives the same controlled range plus evidence, bands, selected ID, and `onSelectEvidence`.

- [ ] **Step 3: Render Market Tape with one main chart and one brush strip**

`ChartBrushLayout` supplies the main/strip geometry, while catalog `rangeSelection` remains the source of truth. Ignore the layout state's `xDomain` and use the catalog selection for the main `AreaChart` and `ChartBrush selection`; the brush callback calls both `layout.onBrushSelectionChange(selection)` and catalog `onRangeSelectionChange(selection)`. The main `AreaChart` receives `xDomain`, `xDomainSlotCount`, and `tweenYDomainOnXDomainChange={tone === 'layered-range'}`. Set `revealSignature` only from role + initial ready epoch, never from hover or parent render count.

Wrap the main plot in `data-slot="chart-plot"` and the brush strip in `data-slot="chart-brush"`. The tooltip `content` renderer must return a root with `data-slot="chart-tooltip-content"` so Playwright can observe real hover content without coupling to Bklit classes.

- [ ] **Step 4: Render Evidence Band from the controlled slice**

Because the vendored `ComposedChart` has no `xDomain` prop, filter the full bars with a pure `filterBarsBySelection()` helper before passing them to `ComposedChart`; keep its brush strip on the full dataset. Render `ReferenceArea`, `Line dataKey="close"`, nullable `SeriesBar dataKey="volume"`, `ChartMarkers`, axes, and tooltip. Pass `animate={!reducedMotion && tone === 'event-pulse'}` to markers.

- [ ] **Step 5: Run typecheck for this boundary and commit**

Run:

```bash
pnpm --filter @stock-insight/web typecheck
```

Then run:

```bash
cd apps/web && node --test test/chart-upstream-contract.test.ts
```

Expected: the Bklit adapter compiles and all current source-contract tests pass.

Commit:

```bash
git add apps/web/src/shared/ui/chart/internal/bklit-preview.tsx apps/web/test/chart-upstream-contract.test.ts
git commit -m "feat(chart): Bklit 목업 렌더러 경계 추가"
```

### Task 3: Build the shared chart preview frame and data table

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/chart-preview-frame.tsx`
- Create: `apps/web/src/pages/ui-lab/ui/chart-catalog.module.css`

**Interfaces:**

- Consumes: `ChartBar`, `ChartPreviewState`, role/variant metadata.
- Produces: `ChartPreviewFrame`, `ChartDataTable`, `ChartStateSurface`, `ChartSummary`.

- [ ] **Step 1: Define the stable frame props**

```ts
export type ChartPreviewFrameProps = {
  attribution?: ReactNode;
  bars: readonly ChartBar[];
  children: ReactNode;
  description: string;
  limitation?: string;
  state: ChartPreviewState;
  summary: ChartSummary;
  title: string;
  variantId: string;
  onRetry: () => void;
};

export type ChartSummary = {
  latest: string;
  change: string;
  high: string;
  low: string;
  asOf: string;
};
```

Use `<article data-component="chart" data-variant={variantId}>`, a `<figure>`, unique `<h3>`, `<figcaption>`, fixed `.chartViewport`, and an HTML `<dl>` for latest, change, high, low, and as-of.

- [ ] **Step 2: Map all seven states to the existing Feedback API**

- `ready`: render chart.
- `loading`: render a fixed-height `Skeleton variant="surface-sweep"` with `aria-live="polite"` text.
- `stale`: keep chart interactive and add `StatusBadge availability="stale"` plus as-of limitation.
- `partial`: keep chart interactive and identify missing volume/evidence in text.
- `empty`: replace plot with `EmptyState variant="quiet-empty"`.
- `error`: replace plot with `ErrorState variant="recovery-panel"` and a local `Button` labeled `다시 시도`.
- `unavailable`: replace plot with `EmptyState variant="inline-empty"` and explicit unsupported copy.

Every branch keeps `.chartViewport` at the same block size.

- [ ] **Step 3: Add the keyboard and screen-reader data alternative**

Use native elements:

```tsx
<details data-slot="chart-data-table">
  <summary>차트 데이터 표로 보기</summary>
  <div className={styles.dataTableViewport} tabIndex={0}>
    <table>
      <caption>{title} 일봉 데이터</caption>
      <thead>...</thead>
      <tbody>...</tbody>
    </table>
  </div>
</details>
```

Columns are date, open, high, low, close, volume. Render missing volume as `없음`, not zero. Limit the expanded mockup table to the current visible slice.

- [ ] **Step 4: Add fixed geometry, overflow, focus, and reduced-motion CSS**

Use one full-width column, `min-width: 0`, `overflow: clip` on cards, `overflow-x: auto` only on the table viewport, a 360px desktop plot and 300px mobile plot, 44px controls, visible focus rings, 11px minimum axis/readout text, and a reduced-motion block that removes CSS transitions and keyframes inside the catalog.

- [ ] **Step 5: Format and commit**

Run:

```bash
pnpm exec oxfmt --check apps/web/src/pages/ui-lab/ui/chart-preview-frame.tsx apps/web/src/pages/ui-lab/ui/chart-catalog.module.css
```

Commit:

```bash
git add apps/web/src/pages/ui-lab/ui/chart-preview-frame.tsx apps/web/src/pages/ui-lab/ui/chart-catalog.module.css
git commit -m "feat(ui-lab): 차트 공용 프레임과 상태 표면 추가"
```

### Task 4: Implement Market Tape A/B/C

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/market-tape-preview.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/chart-catalog.module.css`

**Interfaces:**

- Consumes: `BklitMarketTapeRenderer`, `ChartPreviewFrame`, controlled bars/range/state/selection.
- Produces: `MarketTapePreview` with `variantId: 'quiet-trace' | 'layered-range' | 'signal-ledger'`.

- [ ] **Step 1: Implement one behavior surface for all three variants**

```ts
export type MarketTapePreviewProps = {
  bars: readonly ChartBar[];
  range: ChartRange;
  rangeSelection: ChartRangeSelection | null;
  state: ChartPreviewState;
  variantId: MarketTapeVariantId;
  onRangeSelectionChange: (selection: ChartRangeSelection | null) => void;
  onRetry: () => void;
};
```

Compute summary and formatter once from props; pass identical bars, selection, and callbacks to every variant.

- [ ] **Step 2: Style A — Quiet Trace**

Use the thinnest plot stroke, nearly transparent area fill, two horizontal grid cues, a 44px brush strip, a compact latest/change header, and a ring tooltip point. First ready mount may reveal once; range and hover changes do not replay it.

- [ ] **Step 3: Style B — Layered Range**

Use a low-opacity area surface, a separate brush well, and a range readout containing start date, end date, and selected bar count. Enable y-domain tween only here. Use no glow, blur-glass panel, or large shadow.

- [ ] **Step 4: Style C — Signal Ledger**

Use rectangular cells for date/latest/change/volume status, tabular numerals, a right-oriented price axis, sharper tooltip geometry, and immediate line rendering. Animate only number/readout replacement through the local Motion boundary.

- [ ] **Step 5: Typecheck, format, and commit**

Run:

```bash
pnpm --filter @stock-insight/web typecheck
pnpm exec oxfmt --check apps/web/src/pages/ui-lab/ui/market-tape-preview.tsx apps/web/src/pages/ui-lab/ui/chart-catalog.module.css
```

Commit:

```bash
git add apps/web/src/pages/ui-lab/ui/market-tape-preview.tsx apps/web/src/pages/ui-lab/ui/chart-catalog.module.css
git commit -m "feat(ui-lab): Market Tape A B C 목업 추가"
```

### Task 5: Implement Evidence Band A/B/C

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/evidence-band-preview.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/chart-catalog.module.css`

**Interfaces:**

- Consumes: `BklitEvidenceBandRenderer`, shared evidence selection, brush selection, and band visibility.
- Produces: `EvidenceBandPreview` and keyboard-owned `EvidenceList`.

- [ ] **Step 1: Implement controlled marker/list synchronization**

The list uses real buttons with `aria-pressed={selected}` and calls `onSelectEvidence(id)`. Renderer marker callbacks call the same function. If selected evidence falls outside the current visible selection, call `findEvidenceVisibleDomain()` and preserve the current bar-count span while moving the domain around the evidence timestamp.

- [ ] **Step 2: Style A — Band Ledger**

Make patterned `ReferenceArea` bands visually primary, add dashed edges and short labels outside the SVG, render the evidence list as three summary cells on wide screens and one column below 900px, and stop band motion after the initial ready fade.

- [ ] **Step 3: Style B — Event Pulse**

Make markers and selected crosshair primary, use one initial stagger only when reduced motion is off, render a compact right-side evidence list on desktop, and keep markers out of the keyboard tab sequence by assigning keyboard ownership to the list.

- [ ] **Step 4: Style C — Evidence Split**

Use a two-column chart/list split with one shared divider; selected evidence appears in the list rail, renderer crosshair, and related marker. Below 900px move the list after the chart in DOM and visual order. Keep the price path stationary while selection decoration changes within 180ms.

- [ ] **Step 5: Typecheck, format, and commit**

Run:

```bash
pnpm --filter @stock-insight/web typecheck
pnpm exec oxfmt --check apps/web/src/pages/ui-lab/ui/evidence-band-preview.tsx apps/web/src/pages/ui-lab/ui/chart-catalog.module.css
```

Commit:

```bash
git add apps/web/src/pages/ui-lab/ui/evidence-band-preview.tsx apps/web/src/pages/ui-lab/ui/chart-catalog.module.css
git commit -m "feat(ui-lab): Evidence Band A B C 목업 추가"
```

### Task 6: Create the client-only Lightweight Charts adapter

**Files:**

- Create: `apps/web/src/shared/ui/chart/internal/lightweight-preview.tsx`
- Test: `apps/web/test/chart-upstream-contract.test.ts`

**Interfaces:**

- Consumes: `ChartBar`, visual tone, pane mode, selected crosshair callback.
- Produces: `LightweightCandleRenderer`, `CandleReadout`, cleanup and resize lifecycle.

- [ ] **Step 1: Define the stable adapter props**

```ts
export type LightweightCandleRendererProps = {
  bars: readonly ChartBar[];
  mode: 'clean-candle' | 'dual-pane' | 'market-ledger';
  onCrosshairChange: (value: CandleReadout | null) => void;
};

export type CandleReadout = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  index: number;
};
```

The file begins with `'use client'`; it contains no top-level import from `lightweight-charts`.

- [ ] **Step 2: Dynamically import and create the chart lifecycle**

Inside the effect:

```ts
const { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart } =
  await import('lightweight-charts');
```

Guard cancellation before creation. The creation effect depends only on the fixed `mode`; store chart, candlestick series, histogram series, and the latest callback in refs. Create candlesticks in pane `0`; create histogram in pane `0` with a lower scale margin for `clean-candle`, and pane `1` for `dual-pane` and `market-ledger`. For split panes call `chart.panes()[0]?.setStretchFactor(72)` and `chart.panes()[1]?.setStretchFactor(28)`. Set `attributionLogo: true` and wrap the container with `data-slot="lightweight-chart-root"`.

Add a separate data effect that maps `ts.slice(0, 10)` to `time`, omits nullable volume bars from histogram data, calls both series' `setData()`, and calls `fitContent()`. Range changes update series data through this effect and must not recreate the chart instance.

- [ ] **Step 3: Add crosshair, resize, and cleanup without React frame churn**

Subscribe once to crosshair movement. Store the latest payload in a ref and schedule one `requestAnimationFrame`; call `onCrosshairChange` only from that frame. Create one `ResizeObserver` that calls `chart.resize(width, height)`. Cleanup must cancel the frame, disconnect the observer, unsubscribe the handler, and call `chart.remove()` exactly once.

- [ ] **Step 4: Pass the renderer-boundary test**

First change the expected adapter filenames from `['bklit-preview.tsx']` to
`['bklit-preview.tsx', 'lightweight-preview.tsx']` and change the dynamic-import count from `0`
to `1`. Keep the top-level `from 'lightweight-charts'` count at `0`.

Run:

```bash
cd apps/web && node --test test/chart-upstream-contract.test.ts
```

Expected: all three upstream/source-boundary tests pass; product layers still contain zero direct imports.

- [ ] **Step 5: Typecheck and commit**

Run:

```bash
pnpm --filter @stock-insight/web typecheck
```

Commit:

```bash
git add apps/web/src/shared/ui/chart/internal/lightweight-preview.tsx apps/web/test/chart-upstream-contract.test.ts
git commit -m "feat(chart): Lightweight Charts 목업 어댑터 추가"
```

### Task 7: Implement Candle Ledger A/B/C

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/candle-ledger-preview.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/chart-catalog.module.css`

**Interfaces:**

- Consumes: `LightweightCandleRenderer`, visible range slice, chart frame, HTML summary.
- Produces: `CandleLedgerPreview` with consistent zoom, pan, crosshair, attribution, and readout.

- [ ] **Step 1: Implement the common OHLCV readout**

Initialize readout to the last visible bar and update it from the adapter crosshair callback. Keep the readout outside canvas with date, O/H/L/C, change, intraday range, volume, and visible bar index. Missing volume renders `없음`.

- [ ] **Step 2: Style A — Clean Candle**

Use one price pane and a low integrated volume strip, minimal grid contrast, compact latest/change summary, and a small readout. Do not add a candle enter animation; only the HTML readout may crossfade within 120ms.

- [ ] **Step 3: Style B — Dual Pane**

Use separate price and volume panes, a visible separator, synchronized timestamp, and a fixed 72/28 height relationship. Do not add pane resizing or indicators.

- [ ] **Step 4: Style C — Market Ledger**

Use a fixed ledger row above the plot, denser grid and right price scale, a distinct but compact volume pane, and tabular numerals. Keep canvas stationary while the ledger row changes.

- [ ] **Step 5: Add visible attribution and commit**

The frame must contain a visible link labeled `TradingView Lightweight Charts` pointing to `https://www.tradingview.com/` in addition to the library attribution logo.

Run:

```bash
pnpm --filter @stock-insight/web typecheck
pnpm exec oxfmt --check apps/web/src/pages/ui-lab/ui/candle-ledger-preview.tsx apps/web/src/pages/ui-lab/ui/chart-catalog.module.css
```

Commit:

```bash
git add apps/web/src/pages/ui-lab/ui/candle-ledger-preview.tsx apps/web/src/pages/ui-lab/ui/chart-catalog.module.css
git commit -m "feat(ui-lab): Candle Ledger A B C 목업 추가"
```

### Task 8: Compose the catalog and mount it in UI Lab

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/chart-catalog.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/chart-catalog.module.css`
- Modify: `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx`

**Interfaces:**

- Consumes: all role previews and model metadata.
- Produces: one `ChartCatalog` mounted under `목업 진행 중`.

- [ ] **Step 1: Create the controlled catalog state**

```ts
const [activeRole, setActiveRole] = useState<ChartRoleId>('market-tape');
const [range, setRange] = useState<ChartRange>('3M');
const [state, setState] = useState<ChartPreviewState>('ready');
const [currency, setCurrency] = useState<'KRW' | 'USD'>('KRW');
const [showBands, setShowBands] = useState(true);
const [selectedEvidenceId, setSelectedEvidenceId] = useState<string>();
const [rangeSelection, setRangeSelection] = useState<ChartRangeSelection | null>(null);
```

Reset/clamp `rangeSelection` only when `range` changes. Clear an evidence selection when it is no longer in the selected range; do not silently select the first evidence item.

- [ ] **Step 2: Build the top horizontal role tabs**

Use existing `Tabs` with `variant="sliding-underline"`, labels `Market Tape`, `Evidence Band`, and `Candle Ledger`, a horizontally scrollable 44px control row, and centered highlight bars. Render `TabsContent` from metadata, but each inactive content must not mount its three renderer previews.

- [ ] **Step 3: Build shared controls**

Use `ToggleGroup` for `1M | 3M | 6M | 1Y`; use labeled native selects for the seven states and KRW/USD; use the existing Checkbox for `근거 구간 표시`. Hide the checkbox outside Evidence Band without changing the rest of the control row height.

- [ ] **Step 4: Render the active role's three full-width variants**

Map exactly three variant descriptors to previews. Add `data-slot="chart-catalog"`, `data-role`, and stable `data-variant` hooks. All three receive the same selected slice, selection, state, and callbacks.

- [ ] **Step 5: Mount under the existing in-progress intro**

Add:

```tsx
import { ChartCatalog } from './chart-catalog';
```

and:

```tsx
<TabsContent value="in-progress">
  <div className={styles.statusIntro}>...</div>
  <ChartCatalog />
</TabsContent>
```

Do not move the completed catalogs or change URL state.

- [ ] **Step 6: Run model test and typecheck, then commit**

Run:

```bash
cd apps/web && node --test test/ui-lab-chart-model.test.ts
pnpm --filter @stock-insight/web typecheck
```

Commit:

```bash
git add apps/web/src/pages/ui-lab/ui/chart-catalog.tsx apps/web/src/pages/ui-lab/ui/chart-catalog.module.css apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx
git commit -m "feat(ui-lab): 차트 9종 비교 카탈로그 연결"
```

### Task 9: Add the three browser contracts

**Files:**

- Create: `e2e/ui-lab-charts.spec.ts`

**Interfaces:**

- Consumes: stable `data-slot`, `data-role`, and `data-variant` hooks from Task 8.
- Produces: exactly three focused Playwright tests.

- [ ] **Step 1: Add the Market Tape shared-interaction test**

Navigate to `/__ui-lab`, wait for `networkidle`, click `목업 진행 중`, and assert three Market Tape figures. Change range to `1M` and assert every figure reports `22 bars`. Drag the first brush handle and assert all three cards show the same range start/end text. Move over each plot and assert a tooltip/readout appears while `page.url()` remains unchanged.

- [ ] **Step 2: Add the Evidence Band synchronization test**

Open Evidence Band, assert three charts, six total reference bands, and nine evidence rows. Click the second evidence row in the first variant and assert the same ID is selected in all three variants; assert the visible domain contains that evidence timestamp. Toggle `근거 구간 표시` and assert all reference areas are hidden without changing selection.

- [ ] **Step 3: Add the Candle/integration/mobile/a11y test**

Open Candle Ledger and assert three Lightweight Charts canvases, three visible TradingView links, and three OHLCV readouts. Dispatch wheel and pointer drag on the first chart and assert the canvas remains mounted. Switch away and back, then assert exactly three chart roots exist, proving inactive cleanup. At 390×844 with reduced motion, assert no page-level horizontal overflow, every role tab is reachable, CSS animation durations resolve to `0s` inside the catalog, and Axe has no violations.

- [ ] **Step 4: Run the dedicated spec against 6110**

Run:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:6110 \
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER \
pnpm exec playwright test e2e/ui-lab-charts.spec.ts --project=desktop --workers=1
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/ui-lab-charts.spec.ts
git commit -m "test(ui-lab): 차트 9종 브라우저 계약 추가"
```

### Task 10: Record completion and perform the approval build verification

**Files:**

- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`
- Verify: every file added or changed in Tasks 1–9.

**Interfaces:**

- Consumes: passing Node, typecheck, formatter, lint, Playwright, and browser evidence.
- Produces: a ledger entry that marks mockup implementation/technical verification complete and visual approval/publicization pending.

- [ ] **Step 1: Run the narrow automated gate**

Run:

```bash
cd apps/web && node --test test/ui-lab-chart-model.test.ts test/chart-upstream-contract.test.ts
pnpm --filter @stock-insight/web typecheck
pnpm exec oxfmt --check \
  apps/web/src/pages/ui-lab/ui/chart-catalog-model.ts \
  apps/web/src/pages/ui-lab/ui/chart-fixtures.ts \
  apps/web/src/pages/ui-lab/ui/chart-preview-frame.tsx \
  apps/web/src/pages/ui-lab/ui/chart-catalog.tsx \
  apps/web/src/pages/ui-lab/ui/chart-catalog.module.css \
  apps/web/src/pages/ui-lab/ui/market-tape-preview.tsx \
  apps/web/src/pages/ui-lab/ui/evidence-band-preview.tsx \
  apps/web/src/pages/ui-lab/ui/candle-ledger-preview.tsx \
  apps/web/src/shared/ui/chart/internal/bklit-preview.tsx \
  apps/web/src/shared/ui/chart/internal/lightweight-preview.tsx \
  apps/web/test/ui-lab-chart-model.test.ts \
  apps/web/test/chart-upstream-contract.test.ts \
  e2e/ui-lab-charts.spec.ts
pnpm exec oxlint \
  apps/web/src/pages/ui-lab/ui/chart-catalog-model.ts \
  apps/web/src/pages/ui-lab/ui/chart-fixtures.ts \
  apps/web/src/pages/ui-lab/ui/chart-preview-frame.tsx \
  apps/web/src/pages/ui-lab/ui/chart-catalog.tsx \
  apps/web/src/pages/ui-lab/ui/market-tape-preview.tsx \
  apps/web/src/pages/ui-lab/ui/evidence-band-preview.tsx \
  apps/web/src/pages/ui-lab/ui/candle-ledger-preview.tsx \
  apps/web/src/shared/ui/chart/internal/bklit-preview.tsx \
  apps/web/src/shared/ui/chart/internal/lightweight-preview.tsx \
  apps/web/test/ui-lab-chart-model.test.ts \
  apps/web/test/chart-upstream-contract.test.ts \
  e2e/ui-lab-charts.spec.ts
git diff --check
```

Then rerun the dedicated Playwright command from Task 9. Expected: all commands exit `0`.

- [ ] **Step 2: Update the rollout ledger with exact evidence**

Record:

- 6A state: `목업 구현·기술 검증 완료 / 사용자 시각 승인 대기`.
- Nine variant names.
- Exact commands and pass counts.
- Browser URL `http://127.0.0.1:6110/__ui-lab`.
- Explicit statement that no public chart API or product use was added.
- Next action: compare all nine in the Codex in-app browser and ask which variants to retain per role.

- [ ] **Step 3: Refresh graphify and commit the ledger**

Run:

```bash
graphify update .
git add docs/superpowers/UI-SYSTEM-ROLLOUT.md
git commit -m "docs(ui): 6A 차트 목업 검증 기록"
```

- [ ] **Step 4: Perform the in-app browser visual pass**

Open the `목업 진행 중` tab on port 6110 and inspect all three role tabs. For every role, compare A/B/C at desktop width and 390px; exercise range, state, brush or evidence selection, crosshair, zoom/pan, data table, and reduced motion. Report any visual defect before asking for approval.

- [ ] **Step 5: Stop at the visual approval gate**

Ask once for the retained variants for each role. Accept one, two, or all three variants per role. Do not create public exports, connect `PriceSeries`, or move the catalog to `완료` until that answer is explicit.
