# Hybrid Research Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three production-ready, interactive research charts: Bklit Area and Evidence charts plus a TradingView Lightweight Charts candlestick/volume chart, expose them through the FSD shared UI boundary, and integrate truthful price charts into the selected-stock Deep Dive.

**Architecture:** Official Bklit source is vendored behind `shared/ui/chart/vendor/bklit`, while `lightweight-charts` is hidden behind a client-only adapter. Repository-owned `ChartFrame`, data adapters, state surfaces, accessibility table, and three research chart wrappers are the only public API. Product pages fetch typed `PriceSeries` data and never import either renderer directly.

**Tech Stack:** React 19, TypeScript 6, TanStack Start, Tailwind v4 utilities without Preflight, CSS Modules, Bklit UI revision `c57f66bfa7c3198edb677b567ce08cbf364ae159`, shadcn CLI `4.14.1`, `lightweight-charts` `5.2.0`, Motion `12.43`, Node test runner, Vite fixtures, Playwright, Axe.

## Global Constraints

- A and B use official Bklit source; C alone uses TradingView Lightweight Charts.
- Bklit Studio source, runtime, exports, and proprietary code are forbidden.
- No UI Provider, chart Provider at the application root, second theme runtime, GSAP, live quote stream, polling, WebSocket, or automatic ticker animation.
- The canonical periods are exactly `1M | 3M | 6M | 1Y`, backed by `PriceSeriesRange`.
- Preserve the existing `PriceSeries` and `PriceBar` API contracts; do not add a duplicate chart API schema.
- Product layers import only `@/shared/ui/chart`; direct Bklit and `lightweight-charts` imports are forbidden outside the private chart boundary.
- Marker and reference-band timestamps must be evidence-backed. Never fabricate a marker, threshold, or event date.
- `loading | empty | error | ready | stale | partial | unavailable` remain distinguishable states.
- Keep TradingView attribution visible and retain Apache-2.0 `LICENSE` and `NOTICE` text.
- Keep Bklit MIT attribution, upstream URL, revision, registry items, and manually vendored source list.
- Respect `prefers-reduced-motion`; Bklit reveal, y-domain tween, marker entrance, and shimmer become immediate or static.
- At 390px, no unintended horizontal overflow or clipped focus is allowed.
- Color cannot be the sole carrier of price direction, risk, selection, or reference-band meaning.
- Use information-providing investment language only. No buy/sell instruction, target price, stop-loss, or return promise.
- The user-owned untracked file `docs/superpowers/plans/2026-08-01-shared-ui-system.md` must never be staged, edited, or deleted.

---

## Locked file structure

```text
apps/web/src/shared/ui/chart/
├── index.ts                         # public FSD exports only
├── chart.module.css                 # ChartFrame and wrapper composition
├── model/
│   └── chart-types.ts               # stable renderer-neutral public types
├── lib/
│   ├── adapt-price-series.ts        # PriceSeries → Bklit/LWC data
│   ├── chart-formatters.ts          # KRW/USD/date/volume formatting
│   ├── chart-summary.ts             # latest/high/low/change summary
│   └── lightweight-chart-theme.ts   # CSS token → LWC options
├── ui/
│   ├── chart-frame.tsx              # title, period, summary, state, footer
│   ├── chart-state.tsx              # seven truthful states
│   ├── chart-data-table.tsx         # native table fallback
│   ├── research-area-chart.tsx      # A: Bklit Area + Brush
│   ├── research-evidence-chart.tsx  # B: Bklit Composed + markers/bands
│   └── research-candlestick-chart.tsx # C: client-only LWC
└── vendor/
    └── bklit/                       # pinned upstream source, private

apps/web/src/pages/research-workspace/
├── model/
│   └── stock-price-series.ts        # product request state and latest gate
└── ui/
    ├── stock-chart-panel.tsx        # product chart-mode composition
    ├── stock-chart-panel.module.css
    ├── stock-deep-dive-panel.tsx    # mounts chart panel
    └── views/stocks-view.tsx        # owns fetch/range/retry

e2e/fixtures/research-charts/        # public visual and interaction gallery
scripts/run-research-charts-browser-gate.mjs
```

`vendor/bklit` may contain many registry-generated files. Its complete path list is recorded in
`apps/web/src/shared/ui/chart/vendor/bklit/upstream-manifest.json`; no product import may bypass
`apps/web/src/shared/ui/chart/index.ts`.

---

### Task 1: Pin and intake the two upstream chart sources

**Files:**

- Modify: `apps/web/components.json`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/shared/ui/tailwind.css`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `README.md`
- Modify: `apps/web/test/shared-ui-boundary.test.ts`
- Create: `apps/web/test/chart-upstream-contract.test.ts`
- Create: `apps/web/src/shared/ui/chart/vendor/bklit/upstream-manifest.json`
- Create: `apps/web/src/shared/ui/chart/vendor/bklit/**` from Bklit registry items and the pinned official source files listed below

**Interfaces:**

- Consumes: existing `@/*` alias, `cn`, Tailwind v4 utilities, Market Graphite CSS tokens, local Motion dependency.
- Produces: private Bklit exports under `@/shared/ui/chart/vendor/bklit`; exact `lightweight-charts@5.2.0`; complete source provenance.

- [ ] **Step 1: Write the failing provenance and boundary test**

Create `apps/web/test/chart-upstream-contract.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';

const webPackageUrl = new URL('../package.json', import.meta.url);
const componentsUrl = new URL('../components.json', import.meta.url);
const manifestUrl = new URL(
  '../src/shared/ui/chart/vendor/bklit/upstream-manifest.json',
  import.meta.url,
);
const noticesUrl = new URL('../../../THIRD_PARTY_NOTICES.md', import.meta.url);
const productRoots = ['pages', 'widgets', 'features', 'entities'].map(
  (layer) => new URL(`../src/${layer}/`, import.meta.url),
);

async function sourceFiles(directory: URL): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
    if (entry.isDirectory()) result.push(...(await sourceFiles(child)));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) result.push(await readFile(child, 'utf8'));
  }
  return result;
}

describe('chart upstream contract', () => {
  it('pins official sources and licenses', async () => {
    const packageJson = JSON.parse(await readFile(webPackageUrl, 'utf8'));
    const components = JSON.parse(await readFile(componentsUrl, 'utf8'));
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
    const notices = await readFile(noticesUrl, 'utf8');

    assert.equal(components.registries['@bklit'], 'https://ui.bklit.com/r/{name}.json');
    assert.equal(packageJson.dependencies['lightweight-charts'], '5.2.0');
    assert.equal(manifest.revision, 'c57f66bfa7c3198edb677b567ce08cbf364ae159');
    assert.deepEqual(manifest.registryItems, [
      '@bklit/area-chart',
      '@bklit/composed-chart',
      '@bklit/reference-area',
    ]);
    assert.match(notices, /## Bklit UI/);
    assert.match(notices, /## TradingView Lightweight Charts/);
    assert.match(notices, /Apache License, Version 2\.0/);
    assert.match(notices, /TradingView Lightweight Charts™/);
  });

  it('keeps renderer imports inside shared ui chart', async () => {
    const sources = (await Promise.all(productRoots.map(sourceFiles))).flat();
    const offenders = sources.filter((source) =>
      /from ['"](?:lightweight-charts|@\/shared\/ui\/chart\/vendor\/bklit)/.test(source),
    );
    assert.equal(offenders.length, 0);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing manifest and registry fail**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/chart-upstream-contract.test.ts
```

Expected: FAIL because `upstream-manifest.json` and `@bklit` do not exist.

- [ ] **Step 3: Add the Bklit registry and exact Lightweight Charts dependency**

Add to `apps/web/components.json`:

```json
"registries": {
  "@animate-ui": "https://animate-ui.com/r/{name}.json",
  "@bklit": "https://ui.bklit.com/r/{name}.json"
}
```

Run from the repository root:

```bash
pnpm --filter @stock-insight/web add --save-exact lightweight-charts@5.2.0 @visx/brush@4.0.1-alpha.0
pnpm --dir apps/web dlx shadcn@4.14.1 add -y @bklit/area-chart @bklit/composed-chart @bklit/reference-area
```

Expected: the CLI writes Bklit chart source under `apps/web/src/shared/ui/charts` and adds its
declared `@visx/*`, `d3-array`, `react-use-measure`, and Motion-compatible dependencies. The exact
`@visx/brush` dependency is installed explicitly because Brush comes from the pinned manual-source
set rather than the registry dependency graph.

- [ ] **Step 4: Move the generated registry source behind the private vendor boundary**

Move the complete generated directory to:

```text
apps/web/src/shared/ui/chart/vendor/bklit/
```

Preserve relative imports. Patch only alias imports generated as `@/lib/utils` or
`@/components/...` to the repository aliases `@/shared/lib/utils` and the new private Bklit path.
Do not rewrite component behavior, Tailwind classes, Motion transitions, chart geometry, or public
prop defaults.

The official Bklit docs expose Brush and Marker APIs, but the pinned public registry JSON currently
omits their source files. Copy these exact MIT files from revision
`c57f66bfa7c3198edb677b567ce08cbf364ae159` into the same vendor boundary:

```text
packages/ui/src/charts/chart-brush.tsx
packages/ui/src/charts/chart-brush-handle.tsx
packages/ui/src/charts/chart-brush-layout.tsx
packages/ui/src/charts/chart-brush-selection-overlay.tsx
packages/ui/src/charts/chart-brush-track-overlay.tsx
packages/ui/src/charts/markers/chart-markers.tsx
packages/ui/src/charts/markers/index.ts
packages/ui/src/charts/markers/marker-group.tsx
```

Record those paths under `manualSourceFiles` in `upstream-manifest.json`:

```json
{
  "source": "https://github.com/bklit/bklit-ui",
  "revision": "c57f66bfa7c3198edb677b567ce08cbf364ae159",
  "license": "MIT",
  "registryItems": [
    "@bklit/area-chart",
    "@bklit/composed-chart",
    "@bklit/reference-area"
  ],
  "manualSourceFiles": [
    "packages/ui/src/charts/chart-brush.tsx",
    "packages/ui/src/charts/chart-brush-handle.tsx",
    "packages/ui/src/charts/chart-brush-layout.tsx",
    "packages/ui/src/charts/chart-brush-selection-overlay.tsx",
    "packages/ui/src/charts/chart-brush-track-overlay.tsx",
    "packages/ui/src/charts/markers/chart-markers.tsx",
    "packages/ui/src/charts/markers/index.ts",
    "packages/ui/src/charts/markers/marker-group.tsx"
  ]
}
```

- [ ] **Step 5: Map Bklit tokens to Market Graphite without changing upstream source**

Add to `apps/web/src/shared/ui/tailwind.css` under `:root`:

```css
--chart-background: transparent;
--chart-foreground: var(--color-text-primary);
--chart-foreground-muted: var(--color-text-tertiary);
--chart-label: var(--color-text-tertiary);
--chart-line-primary: var(--color-accent);
--chart-line-secondary: var(--color-copper);
--chart-crosshair: var(--color-text-secondary);
--chart-grid: color-mix(in srgb, var(--color-border) 72%, transparent);
--chart-indicator-color: var(--color-text-primary);
--chart-indicator-secondary-color: var(--color-text-secondary);
--chart-marker-background: var(--color-surface-raised);
--chart-marker-border: var(--color-border-strong);
--chart-marker-foreground: var(--color-text-primary);
--chart-marker-badge-background: var(--color-text-primary);
--chart-marker-badge-foreground: var(--color-canvas);
--chart-segment-background: color-mix(in srgb, var(--color-accent) 7%, transparent);
--chart-segment-line: color-mix(in srgb, var(--color-accent) 34%, transparent);
```

If the generated source references more `--chart-*` variables, map them in the same root block to
existing semantic tokens. Do not introduce a standalone blue palette.

- [ ] **Step 6: Add complete third-party notices and update the README stack**

Append `## Bklit UI` with source, pinned revision, registry items, manual file list, and the MIT
license text. Append `## TradingView Lightweight Charts` with version `5.2.0`, Apache-2.0 license,
and the two-line NOTICE:

```text
TradingView Lightweight Charts™
Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/
```

Change README `Visualization` to `Bklit/Visx, TradingView Lightweight Charts, Motion`.

- [ ] **Step 7: Run source, type, and license gates**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/chart-upstream-contract.test.ts
pnpm --filter @stock-insight/web typecheck
pnpm format:check
git diff --check
```

Expected: PASS. `rg -n "packages/studio|Bklit Studio" apps/web/src/shared/ui/chart/vendor` returns no
matches.

- [ ] **Step 8: Commit the upstream intake**

```bash
git add apps/web/components.json apps/web/package.json pnpm-lock.yaml apps/web/src/shared/ui/tailwind.css apps/web/src/shared/ui/chart/vendor apps/web/test/chart-upstream-contract.test.ts apps/web/test/shared-ui-boundary.test.ts THIRD_PARTY_NOTICES.md README.md
git commit -m "chore(chart): Bklit과 Lightweight Charts 소스 고정"
```

---

### Task 2: Add renderer-neutral chart types, adapters, formatters, and summaries

**Files:**

- Create: `apps/web/src/shared/ui/chart/model/chart-types.ts`
- Create: `apps/web/src/shared/ui/chart/lib/adapt-price-series.ts`
- Create: `apps/web/src/shared/ui/chart/lib/chart-formatters.ts`
- Create: `apps/web/src/shared/ui/chart/lib/chart-summary.ts`
- Create: `apps/web/test/chart-data-adapters.test.ts`

**Interfaces:**

- Consumes: `PriceSeries`, `PriceSeriesRange`, `PriceBar` from `@stock-insight/contracts`; LWC data types only inside `adapt-price-series.ts`.
- Produces: `ChartStatus`, `ChartRange`, `ResearchChartBaseProps`, `EvidenceMarker`, `ReferenceBand`, `BklitPricePoint`, `LightweightPriceData`, `ChartSummary`, `adaptPriceSeriesForBklit`, `adaptPriceSeriesForLightweight`, `summarizePriceSeries`.

- [ ] **Step 1: Write failing adapter and integrity tests**

Create `apps/web/test/chart-data-adapters.test.ts` with these cases:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ChartDataIntegrityError,
  adaptPriceSeriesForBklit,
  adaptPriceSeriesForLightweight,
} from '../src/shared/ui/chart/lib/adapt-price-series.ts';
import { summarizePriceSeries } from '../src/shared/ui/chart/lib/chart-summary.ts';
import type { PriceSeries } from '@stock-insight/contracts';

const series: PriceSeries = {
  entityKey: 'KR:005930',
  market: 'KR',
  ticker: '005930',
  currency: 'KRW',
  timeframe: '1D',
  range: '3M',
  asOf: '2026-07-31T00:00:00.000Z',
  bars: [
    { ts: '2026-07-31T00:00:00.000Z', open: 72000, high: 75000, low: 71000, close: 74000, volume: null },
    { ts: '2026-07-30T00:00:00.000Z', open: 70000, high: 73000, low: 69000, close: 72000, volume: 1200000 },
  ],
};

describe('chart data adapters', () => {
  it('sorts price bars without replacing missing volume with zero', () => {
    const bklit = adaptPriceSeriesForBklit(series);
    assert.deepEqual(bklit.map(({ close }) => close), [72000, 74000]);
    assert.equal(bklit[1]?.volume, null);

    const lightweight = adaptPriceSeriesForLightweight(series);
    assert.equal(lightweight.candles.length, 2);
    assert.equal(lightweight.volumes.length, 1);
  });

  it('rejects duplicate timestamps and impossible OHLC', () => {
    assert.throws(
      () => adaptPriceSeriesForBklit({ ...series, bars: [series.bars[0]!, series.bars[0]!] }),
      ChartDataIntegrityError,
    );
    assert.throws(
      () => adaptPriceSeriesForBklit({
        ...series,
        bars: [{ ...series.bars[0]!, low: 76000 }],
      }),
      /low.*high|OHLC/,
    );
  });

  it('summarizes the selected period from sorted data', () => {
    assert.deepEqual(summarizePriceSeries(series), {
      firstClose: 72000,
      lastClose: 74000,
      absoluteChange: 2000,
      changePct: 2.7777777777777777,
      high: 75000,
      low: 69000,
      latestVolume: null,
    });
  });
});
```

- [ ] **Step 2: Run the test and verify missing modules fail**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/chart-data-adapters.test.ts
```

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Define the stable public types**

Create `chart-types.ts`:

```ts
import type { ReactNode } from 'react';
import type { PriceSeries, PriceSeriesRange } from '@stock-insight/contracts';

export type ChartStatus =
  | 'loading'
  | 'empty'
  | 'error'
  | 'ready'
  | 'stale'
  | 'partial'
  | 'unavailable';
export type ChartRange = PriceSeriesRange;
export type ChartMode = 'trend' | 'evidence' | 'candlestick';
export type EvidenceTone = 'context' | 'positive' | 'risk';

export type ResearchChartBaseProps = {
  series: PriceSeries | null;
  status: ChartStatus;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  onRetry?: () => void;
};

export type EvidenceMarker = {
  id: string;
  occurredAt: string;
  title: string;
  summary: string;
  tone: EvidenceTone;
  sourceCount: number;
  icon?: ReactNode;
};

export type ReferenceBand = {
  id: string;
  label: string;
  from: string;
  to: string;
  lower?: number;
  upper?: number;
  tone: 'neutral' | 'positive' | 'risk';
};

export type VisibleChartDomain = { start: string; end: string };
```

- [ ] **Step 4: Implement strict sorting and renderer adapters**

`adapt-price-series.ts` must:

1. parse every ISO timestamp;
2. reject non-finite OHLC values;
3. enforce `low <= open/close <= high`;
4. sort ascending;
5. reject duplicate timestamps;
6. omit `null` volume from the LWC histogram;
7. set histogram color from direction only through a semantic token string.

Expose these exact signatures:

```ts
export type BklitPricePoint = {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  change: number | null;
  changePct: number | null;
};

export type LightweightPriceData = {
  candles: CandlestickData<UTCTimestamp>[];
  volumes: HistogramData<UTCTimestamp>[];
};

export class ChartDataIntegrityError extends Error {}
export function adaptPriceSeriesForBklit(series: PriceSeries): BklitPricePoint[];
export function adaptPriceSeriesForLightweight(series: PriceSeries): LightweightPriceData;
```

- [ ] **Step 5: Implement shared formatters and summary**

Expose:

```ts
export function formatChartCurrency(value: number, currency: 'KRW' | 'USD'): string;
export function formatChartVolume(value: number | null): string;
export function formatChartDate(value: Date | string, withTime?: boolean): string;
export function summarizePriceSeries(series: PriceSeries): ChartSummary;
```

Use `ko-KR`, `Asia/Seoul`, zero currency fraction digits for KRW, two for USD, and the literal
`거래량 없음` for null volume.

- [ ] **Step 6: Run adapter tests and typecheck**

```bash
pnpm --filter @stock-insight/web exec node --test test/chart-data-adapters.test.ts
pnpm --filter @stock-insight/web typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit the renderer-neutral data layer**

```bash
git add apps/web/src/shared/ui/chart/model apps/web/src/shared/ui/chart/lib apps/web/test/chart-data-adapters.test.ts
git commit -m "feat(chart): 가격 계열 공용 데이터 계약 추가"
```

---

### Task 3: Build ChartFrame, seven visual states, and the accessible table

**Files:**

- Create: `apps/web/src/shared/ui/chart/ui/chart-frame.tsx`
- Create: `apps/web/src/shared/ui/chart/ui/chart-state.tsx`
- Create: `apps/web/src/shared/ui/chart/ui/chart-data-table.tsx`
- Create: `apps/web/src/shared/ui/chart/chart.module.css`
- Create: `apps/web/src/shared/ui/chart/index.ts`
- Modify: `apps/web/src/shared/ui/index.ts`
- Create: `apps/web/test/chart-frame-accessibility-render.test.ts`

**Interfaces:**

- Consumes: Task 2 types and formatters, shared `ToggleGroup`, `Button`, `WorkspaceState`, `DataTable`.
- Produces: `ChartFrame`, `ChartState`, `ChartDataTable`, `ChartFrameProps` and root `@/shared/ui/chart` export.

- [ ] **Step 1: Write the failing static accessibility test**

The test renders ready, loading, and unavailable frames with `renderToStaticMarkup` and asserts:

```ts
assert.match(readyHtml, /<figure/);
assert.match(readyHtml, /aria-labelledby="price-chart-title"/);
assert.match(readyHtml, /aria-describedby="price-chart-description"/);
assert.match(readyHtml, /aria-label="차트 기간"/);
assert.match(readyHtml, /1M/);
assert.match(readyHtml, /3M/);
assert.match(readyHtml, /6M/);
assert.match(readyHtml, /1Y/);
assert.match(readyHtml, /<details/);
assert.match(readyHtml, /데이터 표 보기/);
assert.match(readyHtml, /<table/);
assert.match(loadingHtml, /aria-busy="true"/);
assert.match(unavailableHtml, /현재 제공하지 않습니다/);
```

- [ ] **Step 2: Run the test and verify missing exports fail**

```bash
pnpm --filter @stock-insight/web exec node --test test/chart-frame-accessibility-render.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `ChartState` as a thin truthful mapping**

Map chart states to `WorkspaceState`:

```ts
const stateCopy = {
  loading: ['차트 데이터를 불러오는 중', '선택한 기간의 가격과 거래량을 확인하고 있습니다.'],
  empty: ['표시할 가격 기록이 없습니다', '정상 응답이지만 선택한 기간에 가격 bar가 없습니다.'],
  error: ['차트를 불러오지 못했습니다', '잠시 후 같은 기간을 다시 시도해 주세요.'],
  stale: ['갱신이 필요한 가격 기록입니다', '마지막 기준 시각을 확인한 뒤 참고용으로 살펴보세요.'],
  partial: ['일부 가격 기록만 표시합니다', '누락된 거래량이나 기간이 있어 범위를 함께 확인하세요.'],
  unavailable: ['현재 제공하지 않습니다', '이 종목 또는 시장에는 확인 가능한 가격 계열이 없습니다.'],
} as const;
```

`ready` renders children and never renders a status announcement. `stale` and `partial` keep
children interactive and add a compact labelled notice above the viewport. `loading` with a non-null
previous series keeps that plot visible under a non-blocking stale/loading overlay; initial loading
without a series renders only the fixed-height skeleton. `empty`, `error`, and `unavailable` replace
the plot with their truthful state surface.

- [ ] **Step 4: Implement native `ChartDataTable`**

Render a native table with headers `날짜 / 시가 / 고가 / 저가 / 종가 / 거래량`. Keep all rows for
the selected period, put horizontal scrolling on the shared `DataTable` container, and use the Task
2 formatters. Null volume must render `거래량 없음`.

- [ ] **Step 5: Implement `ChartFrame`**

Use this exact interface:

```ts
export type ChartFrameProps = {
  chartId: string;
  title: string;
  description: string;
  status: ChartStatus;
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  series: PriceSeries | null;
  visibleDomain?: VisibleChartDomain;
  onVisibleDomainChange?: (domain: VisibleChartDomain) => void;
  onRetry?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
};
```

Use `ToggleGroup` with `aria-label="차트 기간"`. Keep a fixed chart viewport. Put latest, period
change, high, low, volume, market, and `series.asOf` basis time in semantic HTML above the viewport.
Use one `details/summary` for the
data table. When both visible-domain props are present, include labelled start-date and end-date
native selects inside the same disclosure. Their options come from the selected series, they enforce
`start <= end`, and they call the same controlled domain callback as the Brush. This is the keyboard
fallback for pointer-oriented Brush handles. Do not give the SVG or canvas a separate tab stop.

- [ ] **Step 6: Style responsive frame geometry**

In `chart.module.css` define desktop viewport `350px`, compact `310px`, mobile `260px`; a 24px
minimum target for summary and range controls; 11px minimum axis-support copy; wrapping title/meta;
and no fixed width on the figure. Tooltip and table use existing surface and border tokens.

- [ ] **Step 7: Run render, type, and shared boundary tests**

```bash
pnpm --filter @stock-insight/web exec node --test test/chart-frame-accessibility-render.test.ts test/shared-ui-boundary.test.ts
pnpm --filter @stock-insight/web typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 8: Commit the common chart frame**

```bash
git add apps/web/src/shared/ui/chart apps/web/src/shared/ui/index.ts apps/web/test/chart-frame-accessibility-render.test.ts
git commit -m "feat(chart): 공용 차트 프레임과 접근성 표 추가"
```

---

### Task 4: Implement A Market Tape with Bklit Area and Brush

**Files:**

- Create: `apps/web/src/shared/ui/chart/ui/research-area-chart.tsx`
- Modify: `apps/web/src/shared/ui/chart/index.ts`
- Modify: `apps/web/src/shared/ui/chart/chart.module.css`
- Create: `apps/web/test/research-area-chart-contract.test.ts`

**Interfaces:**

- Consumes: `ChartFrame`, `adaptPriceSeriesForBklit`, Bklit `AreaChart`, `Area`, `Grid`, `XAxis`, `ChartTooltip`, `ChartBrushLayout`, `ChartBrush`.
- Produces: `ResearchAreaChart(props)` and `onVisibleDomainChange(domain)`.

- [ ] **Step 1: Write the failing Area wrapper contract test**

Read `research-area-chart.tsx` as source and assert it contains:

```ts
assert.match(source, /ChartBrushLayout/);
assert.match(source, /ChartBrush/);
assert.match(source, /tweenYDomainOnXDomainChange/);
assert.match(source, /showMarkers=\{false\}/);
assert.match(source, /animationDuration=\{reducedMotion \? 0 : 560\}/);
assert.doesNotMatch(source, /setInterval|WebSocket|requestAnimationFrame\([^)]*setState/);
```

- [ ] **Step 2: Run the contract test and verify the wrapper is missing**

```bash
pnpm --filter @stock-insight/web exec node --test test/research-area-chart-contract.test.ts
```

Expected: FAIL because the source file does not exist.

- [ ] **Step 3: Implement the main Area chart and tooltip**

Use this interface:

```ts
export type ResearchAreaChartProps = ResearchChartBaseProps & {
  reducedMotion?: boolean;
  visibleDomain?: VisibleChartDomain;
  onVisibleDomainChange?: (domain: VisibleChartDomain) => void;
};
```

Render `ChartFrame` for every state and mount the Bklit plot for
`loading | ready | stale | partial` whenever a non-null series exists. Inside the viewport, render
`AreaChart` with `xDataKey="date"`, horizontal `Grid`,
one `Area dataKey="close"`, `XAxis`, and `ChartTooltip`. Tooltip rows are 날짜, 종가, 전일 대비,
거래량. Set normal
`animationDuration={560}`, reduced `0`, normal y-domain tween `280`, reduced `0`. Never set
`revealSignature` from hover or parent render state.

The product composition passes the same controlled `visibleDomain` and
`onVisibleDomainChange` pair to `ChartFrame`, so pointer Brush updates and keyboard fallback updates
remain synchronized.

- [ ] **Step 4: Add the controlled Brush strip**

Wrap the chart in `ChartBrushLayout enabled height={64}`. Its strip uses another `AreaChart` with
`animationDuration={0}`, `animate={false}`, `showHighlight={false}`, and `ChartBrush`. Intercept
`onSelectionChange` to call both the layout callback and:

```ts
onVisibleDomainChange?.({
  start: selection.start.toISOString(),
  end: selection.end.toISOString(),
});
```

Reset to full extent when `series.range` changes. Put `data-visible-start` and `data-visible-end` on
the wrapper for browser verification, not on product business state.

- [ ] **Step 5: Apply restrained Market Graphite styling**

Use `--chart-line-primary`, low-opacity fill, horizontal grid only, no blue gradient, no glow, and no
card elevation. Brush handles need 24px effective hit targets even if their visible grip is narrower.

- [ ] **Step 6: Run the focused tests and typecheck**

```bash
pnpm --filter @stock-insight/web exec node --test test/research-area-chart-contract.test.ts test/chart-data-adapters.test.ts
pnpm --filter @stock-insight/web typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit A Market Tape**

```bash
git add apps/web/src/shared/ui/chart apps/web/test/research-area-chart-contract.test.ts
git commit -m "feat(chart): Bklit Market Tape 상호작용 추가"
```

---

### Task 5: Implement B Evidence Band with Composed Chart and linked evidence

**Files:**

- Create: `apps/web/src/shared/ui/chart/ui/research-evidence-chart.tsx`
- Modify: `apps/web/src/shared/ui/chart/index.ts`
- Modify: `apps/web/src/shared/ui/chart/chart.module.css`
- Create: `apps/web/test/research-evidence-chart-contract.test.ts`

**Interfaces:**

- Consumes: `PriceSeries`, `EvidenceMarker`, `ReferenceBand`, Task 4 brush behavior, Bklit `ComposedChart`, `Area`, `ReferenceArea`, `ChartMarkers`, `MarkerTooltipContent`.
- Produces: controlled `ResearchEvidenceChart`, `selectedEvidenceId`, and bidirectional selection callbacks.

- [ ] **Step 1: Write the failing evidence integrity and composition test**

Assert the wrapper:

```ts
assert.match(source, /ComposedChart/);
assert.match(source, /ReferenceArea/);
assert.match(source, /ChartMarkers/);
assert.match(source, /selectedEvidenceId/);
assert.match(source, /onEvidenceSelect/);
assert.match(source, /data-selected-evidence-id/);
assert.doesNotMatch(source, /Math\.random|mock marker|synthetic threshold/i);
```

Also test a pure exported `filterEvidenceForSeries` so markers outside the current series extent are
not rendered and invalid timestamps throw `ChartDataIntegrityError`.

- [ ] **Step 2: Run the test and verify the wrapper is missing**

```bash
pnpm --filter @stock-insight/web exec node --test test/research-evidence-chart-contract.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement evidence and band conversion without fabrication**

Expose:

```ts
export function filterEvidenceForSeries(
  markers: readonly EvidenceMarker[],
  series: PriceSeries,
): EvidenceMarker[];
```

Parse every `occurredAt`. Keep only markers within the series first/last timestamp. Convert tones to
existing semantic tokens. Convert reference bands only when `from <= to` and at least one of the
time or value bounds is meaningful. Invalid inputs fail closed.

- [ ] **Step 4: Implement the Bklit Composed chart**

Use this exact prop interface:

```ts
export type ResearchEvidenceChartProps = ResearchChartBaseProps & {
  markers: readonly EvidenceMarker[];
  referenceBands: readonly ReferenceBand[];
  selectedEvidenceId: string | null;
  onEvidenceSelect: (evidenceId: string) => void;
  reducedMotion?: boolean;
  visibleDomain?: VisibleChartDomain;
  onVisibleDomainChange?: (domain: VisibleChartDomain) => void;
};
```

Always render `ChartFrame`; mount the Bklit plot for `loading | ready | stale | partial` whenever a
non-null series exists. The plot renders `ComposedChart` with `Area dataKey="close"`. Render
`ReferenceArea` below the series.
Use dashed edges and labels. Convert markers to official `ChartMarker` objects with `onClick` calling
`onEvidenceSelect(id)`. Derive the selected marker's color and icon treatment from
`selectedEvidenceId` using existing semantic chart tokens, so the chart and list expose the same
selection without adding a second control. Marker tooltip content is limited to title, occurred-at,
source count, and the `context / positive / risk` role; the existing Evidence Inspector owns source
detail. Set `animate={!reducedMotion}`.

- [ ] **Step 5: Add the keyboard-owned evidence list**

Render a semantic `<ol>` next to the chart. Each item uses the shared `Button` with `motion="quiet"`,
`aria-current={selected}`, timestamp, title, role label, and source count. Selecting a list item calls
`onEvidenceSelect`, scrolls the matching chart time into the current brush window while preserving
window width, and updates `data-selected-evidence-id`. Mount a private
`SelectedEvidenceSynchronizer` inside the Bklit chart; it uses Bklit's existing chart context to set
the tooltip/crosshair datum for the selected timestamp, and clears it when selection disappears.
It must not introduce a React render loop or a second source of selection truth.

Track whether selection originated from a marker or the list. After a marker-originated controlled
selection is reflected back through `selectedEvidenceId`, scroll and focus the matching list button.
List-originated selection keeps focus on the already active button and does not refocus it.

Do not add every SVG marker to the tab sequence; the list is the keyboard interaction owner.

- [ ] **Step 6: Add responsive and reduced-motion behavior**

Use two columns above 900px and stack the list below the chart at 900px and below. At 390px the list
uses normal wrapping. Under reduced motion, marker entrance and brush y-domain tween are disabled.

- [ ] **Step 7: Run evidence, type, and boundary tests**

```bash
pnpm --filter @stock-insight/web exec node --test test/research-evidence-chart-contract.test.ts test/shared-ui-boundary.test.ts
pnpm --filter @stock-insight/web typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 8: Commit B Evidence Band**

```bash
git add apps/web/src/shared/ui/chart apps/web/test/research-evidence-chart-contract.test.ts
git commit -m "feat(chart): Bklit 근거 밴드와 선택 연동 추가"
```

---

### Task 6: Implement C Candle Ledger with Lightweight Charts

**Files:**

- Create: `apps/web/src/shared/ui/chart/lib/lightweight-chart-theme.ts`
- Create: `apps/web/src/shared/ui/chart/ui/research-candlestick-chart.tsx`
- Modify: `apps/web/src/shared/ui/chart/index.ts`
- Modify: `apps/web/src/shared/ui/chart/chart.module.css`
- Create: `apps/web/test/research-candlestick-chart-contract.test.ts`

**Interfaces:**

- Consumes: `adaptPriceSeriesForLightweight`, CSS semantic tokens, `lightweight-charts@5.2.0` only inside the private file.
- Produces: `ResearchCandlestickChart`, HTML OHLCV tooltip, visible TradingView attribution.

- [ ] **Step 1: Write the failing client-only lifecycle test**

Assert source contains:

```ts
assert.match(source, /import\(['"]lightweight-charts['"]\)/);
assert.match(source, /CandlestickSeries/);
assert.match(source, /HistogramSeries/);
assert.match(source, /subscribeCrosshairMove/);
assert.match(source, /unsubscribeCrosshairMove/);
assert.match(source, /chart\.remove\(\)/);
assert.match(source, /attributionLogo:\s*true/);
assert.doesNotMatch(source, /^import .* from ['"]lightweight-charts['"]/m);
assert.doesNotMatch(source, /setInterval|WebSocket|\.update\(/);
```

- [ ] **Step 2: Run the test and verify the wrapper is missing**

```bash
pnpm --filter @stock-insight/web exec node --test test/research-candlestick-chart-contract.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement CSS-token theme resolution**

Create a pure `readLightweightChartTheme(element)` returning layout, grid, crosshair, candlestick,
volume, and text colors from computed `--color-*` variables. Use positive/risk tokens; never hardcode
blue, green, or red hex values.

- [ ] **Step 4: Implement the client-only chart lifecycle**

Use this prop interface:

```ts
export type ResearchCandlestickChartProps = ResearchChartBaseProps & {
  reducedMotion?: boolean;
  onVisibleDomainChange?: (domain: VisibleChartDomain) => void;
};
```

Always render `ChartFrame`; run the client effect for `loading | ready | stale | partial` whenever a
non-null series exists. Inside `useEffect`, dynamically import:

```ts
const { CandlestickSeries, HistogramSeries, createChart } = await import('lightweight-charts');
```

Create the chart with `autoSize: true`, `layout.attributionLogo: true`, crosshair enabled, wheel
scale enabled, drag scroll enabled, and kinetic scroll disabled when `reducedMotion`. Add candlestick
series in pane 0 and histogram series in pane 1. Call `setData` only when the `series` prop changes.
Subscribe to visible time-range changes, normalize the bounds to `VisibleChartDomain`, and call
`onVisibleDomainChange` only when both bounds resolve to valid chart timestamps.

- [ ] **Step 5: Add a non-React hot-path OHLCV tooltip**

Create one absolutely positioned HTML tooltip ref. `subscribeCrosshairMove` schedules at most one
`requestAnimationFrame` DOM update. It writes date, 시가, 고가, 저가, 종가, 거래량 and the literal
`상승`, `하락`, or `보합`. It does not call React `setState` on every pointer move.

- [ ] **Step 6: Add cleanup and attribution guard**

Cleanup must cancel the pending frame, unsubscribe crosshair and range listeners, disconnect any
explicit observer, and call `chart.remove()`. Keep the default TradingView logo visible and add a
text fallback link below the viewport:

```tsx
<a href="https://www.tradingview.com/" rel="noreferrer" target="_blank">
  차트 제공: TradingView
</a>
```

- [ ] **Step 7: Run lifecycle, type, and license tests**

```bash
pnpm --filter @stock-insight/web exec node --test test/research-candlestick-chart-contract.test.ts test/chart-upstream-contract.test.ts
pnpm --filter @stock-insight/web typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 8: Commit C Candle Ledger**

```bash
git add apps/web/src/shared/ui/chart apps/web/test/research-candlestick-chart-contract.test.ts
git commit -m "feat(chart): TradingView 캔들·거래량 차트 추가"
```

---

### Task 7: Build the interactive A/B/C browser gallery and browser gate

**Files:**

- Create: `e2e/fixtures/research-charts/index.html`
- Create: `e2e/fixtures/research-charts/main.tsx`
- Create: `e2e/fixtures/research-charts/fixture.css`
- Create: `e2e/fixtures/research-charts/mock-price-series.ts`
- Create: `e2e/fixtures/research-charts/tsconfig.json`
- Create: `e2e/fixtures/research-charts/vite.config.ts`
- Create: `scripts/run-research-charts-browser-gate.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: all three shared chart components and controlled callbacks.
- Produces: a public gallery that can run at `http://127.0.0.1:6130/`; browser assertions for interaction, reduced motion, mobile, and Axe.

- [ ] **Step 1: Add failing root scripts**

Add:

```json
"typecheck:charts:fixture": "tsc -p e2e/fixtures/research-charts/tsconfig.json --noEmit",
"test:charts:browser": "node scripts/run-research-charts-browser-gate.mjs"
```

Run `pnpm typecheck:charts:fixture` and expect FAIL because the fixture is missing.

- [ ] **Step 2: Create deterministic fixture data**

Create 90 daily OHLCV bars with a deterministic seeded function, not `Math.random`. Create three
evidence markers whose timestamps are existing bar dates and two reference bands with explicit
labels. Also export deterministic variants covering a long ticker/display name, USD, 400 bars,
all-null volume, multiple markers, and no selected marker. Export `fixtureSeries`,
`fixtureMarkers`, `fixtureBands`, and the edge-case variants.

- [ ] **Step 3: Render the controlled gallery**

`main.tsx` renders:

1. `A · Market Tape` with Area hover, tooltip, range control, and Brush.
2. `B · Evidence Band` with selected evidence list and ReferenceArea.
3. `C · Candle Ledger` with candlestick, volume, zoom, and pan.

Expose only fixture probe data on `window.__researchChartProbe`:

```ts
type ResearchChartProbe = {
  areaRange: ChartRange;
  areaDomain: VisibleChartDomain | null;
  evidenceId: string | null;
  candleDomain: VisibleChartDomain | null;
  candleReady: boolean;
};
```

- [ ] **Step 4: Write browser assertions for real interaction**

The runner starts the fixture Vite server and Playwright Chromium, then asserts:

- clicking `1Y` updates `areaRange` to `1Y`;
- dragging a Brush handle changes `areaDomain.start` or `areaDomain.end`;
- changing the keyboard fallback start/end selects updates the same `areaDomain` without pointer
  input;
- selecting the second evidence list item sets `evidenceId` and `aria-current="true"`;
- hovering A shows a tooltip with 날짜, 종가, 전일 대비, 거래량;
- C contains canvases and `차트 제공: TradingView`;
- wheel and drag gestures change `candleDomain` through the public
  `onVisibleDomainChange` callback;
- resize updates C's canvas without remounting or duplicating subscriptions;
- loading controls do not set a wait cursor and cannot dispatch duplicate range changes;
- long ticker, USD, 400 bars, null volume, multiple markers, and no selected marker remain truthful;
- there is no horizontal overflow at 1440, 1180, 768, or 390×844;
- light and dark schemes preserve tooltip, grid, marker, and focus contrast at all four widths;
- reduced motion has no repeating shimmer and marker transform settles immediately;
- Axe reports zero serious or critical violations at 1440 and 390 widths, and keyboard focus order
  covers the period selector, domain fallback, evidence list, and data-table disclosure.

- [ ] **Step 5: Run fixture typecheck and browser gate**

```bash
pnpm typecheck:charts:fixture
pnpm test:charts:browser
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Run the gallery at the user's comparison port and inspect it in-browser**

Run:

```bash
pnpm exec vite --config e2e/fixtures/research-charts/vite.config.ts --host 127.0.0.1 --port 6130 --strictPort
```

Open `http://127.0.0.1:6130/`, interact with A, B, and C, compare 1440px and 390px, and correct any
visible overlap, delayed selection, tooltip clipping, center alignment, or low-contrast defects
before committing.

- [ ] **Step 7: Commit the interactive gallery and gate**

```bash
git add e2e/fixtures/research-charts scripts/run-research-charts-browser-gate.mjs package.json
git commit -m "test(chart): A B C 상호작용 브라우저 게이트 추가"
```

---

### Task 8: Add typed price-series loading to the API client and product model

**Files:**

- Modify: `packages/api-client/src/index.ts`
- Create: `packages/api-client/test/price-series.test.ts`
- Create: `apps/web/src/pages/research-workspace/model/stock-price-series.ts`
- Create: `apps/web/test/stock-price-series.test.ts`

**Interfaces:**

- Consumes: existing `/api/stocks/$entityKey/prices`, `priceSeriesResponseSchema`, `PriceSeriesRange`.
- Produces: `api.stockPriceSeries(entityKey, range)`, `createStockPriceSeriesController`, latest-request state transitions.

- [ ] **Step 1: Write the failing API client test**

Use a capturing fetcher and assert:

```ts
const response = await client.stockPriceSeries('KR:005930', '6M');
assert.equal(requestedUrl, 'http://stock.local/api/stocks/KR%3A005930/prices?range=6M');
assert.equal(response.data?.range, '6M');
```

Return a valid `PriceSeriesResponse` envelope in the fake fetcher.

- [ ] **Step 2: Run the client test and verify the method is missing**

```bash
pnpm --filter @stock-insight/api-client exec node --test test/price-series.test.ts
```

Expected: FAIL because `stockPriceSeries` does not exist.

- [ ] **Step 3: Add the typed API client method**

Import `priceSeriesResponseSchema`, `PriceSeriesRange`, and `PriceSeriesResponse`, then implement:

```ts
async stockPriceSeries(
  entityKey: string,
  range: PriceSeriesRange,
): Promise<PriceSeriesResponse> {
  const response = await fetcher(
    buildUrl(`/api/stocks/${encodeURIComponent(entityKey)}/prices`, { range }),
  );
  if (!response.ok) throw new Error(`Stock price series failed with ${response.status}`);
  return priceSeriesResponseSchema.parse(await response.json());
}
```

- [ ] **Step 4: Write failing latest-request controller tests**

Test that:

- initial state is `idle` with range `3M`;
- `load(entity, range)` emits `loading` then `ready`;
- a range change keeps the prior series during `loading` so `ChartFrame` can label it as stale rather
  than blanking the viewport;
- a slow prior request cannot overwrite a later stock or range;
- missing data maps to `unavailable`, zero bars maps to `empty`, stale envelope maps to `stale`;
- retry repeats the latest entity and range.

- [ ] **Step 5: Implement the product request controller**

Expose:

```ts
export type StockPriceSeriesState = {
  entityKey: string | null;
  range: PriceSeriesRange;
  status: 'idle' | ChartStatus;
  series: PriceSeries | null;
  errorMessage?: string;
};

export function createStockPriceSeriesController(options: {
  load: (entityKey: string, range: PriceSeriesRange) => Promise<PriceSeriesResponse>;
  onState: (state: StockPriceSeriesState) => void;
}): {
  select: (entityKey: string, range?: PriceSeriesRange) => Promise<void>;
  changeRange: (range: PriceSeriesRange) => Promise<void>;
  retry: () => Promise<void>;
  dispose: () => void;
};
```

Use a monotonic request generation exactly like `createLatestRequestGate` and ignore stale
completions. Preserve the previous series only while the same entity loads a new range; clear it
immediately when the selected entity changes so one stock is never shown under another stock's name.

- [ ] **Step 6: Run client, controller, and contract tests**

```bash
pnpm --filter @stock-insight/api-client exec node --test test/price-series.test.ts
pnpm --filter @stock-insight/web exec node --test test/stock-price-series.test.ts
pnpm typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit typed price loading**

```bash
git add packages/api-client/src/index.ts packages/api-client/test/price-series.test.ts apps/web/src/pages/research-workspace/model/stock-price-series.ts apps/web/test/stock-price-series.test.ts
git commit -m "feat(stock): 기간별 가격 계열 로더 추가"
```

---

### Task 9: Integrate truthful price charts into the selected-stock Deep Dive

**Files:**

- Create: `apps/web/src/pages/research-workspace/ui/stock-chart-panel.tsx`
- Create: `apps/web/src/pages/research-workspace/ui/stock-chart-panel.module.css`
- Modify: `apps/web/src/pages/research-workspace/ui/views/stocks-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.module.css`
- Modify: `apps/web/test/stock-deep-dive-ui-structure.test.ts`
- Create: `apps/web/test/stock-chart-panel-render.test.ts`

**Interfaces:**

- Consumes: Task 8 controller state; shared `ChartFrame`, Area and Candlestick charts; optional evidence data only when real timestamps exist.
- Produces: `StockChartPanel` with controlled mode/range, A and C product views, truthful B availability.

- [ ] **Step 1: Write failing product integration tests**

Assert `StocksView` creates and disposes a price-series controller, calls `api.stockPriceSeries`,
changes range through the controller, and passes state to `StockDeepDivePanel`.

Render `StockChartPanel` and assert:

```ts
assert.match(html, /aria-label="차트 보기"/);
assert.match(html, /가격 흐름/);
assert.match(html, /캔들·거래량/);
assert.doesNotMatch(html, /근거 연결/); // no evidence-backed markers supplied
```

When real markers are supplied, assert `근거 연결` appears and renders `ResearchEvidenceChart`.

- [ ] **Step 2: Run the tests and verify integration is missing**

```bash
pnpm --filter @stock-insight/web exec node --test test/stock-chart-panel-render.test.ts test/stock-deep-dive-ui-structure.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `StockChartPanel`**

Use this prop interface:

```ts
export type StockChartPanelProps = {
  displayName: string;
  state: StockPriceSeriesState;
  markers?: readonly EvidenceMarker[];
  referenceBands?: readonly ReferenceBand[];
  selectedEvidenceId?: string | null;
  onEvidenceSelect?: (id: string) => void;
  onRangeChange: (range: ChartRange) => void;
  onRetry: () => void;
};
```

Own `ChartMode` locally. Default to `candlestick`. The `ToggleGroup` named `차트 보기` contains
`가격 흐름` and `캔들·거래량`. Include `근거 연결` only when at least one evidence-backed marker is
inside the returned series extent. Never render a disabled decorative evidence tab.

- [ ] **Step 4: Connect price loading to stock selection and range changes**

In `StocksView`, instantiate the Task 8 controller once with `api.stockPriceSeries`. On stock
selection, start detail/relation and default `3M` price requests independently. Detail remains ready
if price fails; the chart alone shows error. Dispose the controller on unmount. A later stock or range
must win over earlier requests.

- [ ] **Step 5: Mount the chart panel in the Deep Dive**

Place `StockChartPanel` after the Deep Dive header and before the twelve-section Accordion. Preserve
the existing idle/loading/error states for the entire Deep Dive. The price panel has its own fixed
state geometry and must not replace the stock table or relation sections.

- [ ] **Step 6: Add responsive layout and scroll ownership**

The sticky Deep Dive remains the only vertical scroll owner. The chart itself never adds horizontal
page overflow. At widths below 1240px, the Deep Dive continues below the stock table. At 390px,
chart controls wrap above the viewport and the data table scrolls inside its own container.

- [ ] **Step 7: Run stock, chart, and browser regression tests**

```bash
pnpm --filter @stock-insight/web exec node --test test/stock-price-series.test.ts test/stock-chart-panel-render.test.ts test/stock-deep-dive.test.ts test/stock-deep-dive-ui-structure.test.ts
pnpm test:charts:browser
pnpm --filter @stock-insight/web typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 8: Commit the product integration**

```bash
git add apps/web/src/pages/research-workspace apps/web/test/stock-chart-panel-render.test.ts apps/web/test/stock-deep-dive-ui-structure.test.ts
git commit -m "feat(stock): Deep Dive에 가격 차트 연결"
```

---

### Task 10: Complete visual, accessibility, performance, and release evidence

**Files:**

- Modify: `package.json`
- Modify: `apps/web/test/shared-ui-boundary.test.ts`
- Modify: `apps/web/test/primitive-adoption-contract.test.ts`
- Modify: `e2e/workspace-visual.spec.ts`
- Create: `docs/reviews/market-graphite-chart-system-20260801.md`

**Interfaces:**

- Consumes: the completed shared charts, gallery gate, stock integration, existing release scripts.
- Produces: one release matrix proving interaction, attribution, a11y, responsive safety, reduced motion, and no direct renderer leakage.

- [ ] **Step 1: Add chart gates to the release command**

Insert `pnpm typecheck:charts:fixture` and `pnpm test:charts:browser` into `verify:release` after the
other fixture typechecks and before authenticated visual tests.

- [ ] **Step 2: Strengthen FSD and adoption tests**

Update the shared boundary test to walk `pages`, `widgets`, `features`, and `entities` and fail any
direct import of:

```regex
(?:lightweight-charts|shared/ui/chart/vendor/bklit)
```

Add `stock-chart-panel.tsx` to the bounded product-control inventory so its ToggleGroup and Buttons
remain shared primitives.

- [ ] **Step 3: Add authenticated workspace visual coverage when credentials exist**

Extend `e2e/workspace-visual.spec.ts` to select the first stock, wait for
`[data-testid="stock-price-chart"]`, switch between `가격 흐름` and `캔들·거래량`, open the data table,
and capture desktop/mobile light/dark screenshots. If the authenticated price endpoint is unavailable,
assert the truthful `unavailable` or `error` state instead of skipping the chart region.

- [ ] **Step 4: Record release evidence**

Create `docs/reviews/market-graphite-chart-system-20260801.md` with exact sections:

```markdown
# Market Graphite chart system release evidence

## Upstream provenance
## A Market Tape interaction
## B Evidence Band interaction
## C Candle Ledger interaction
## Product integration
## 1440px and 390px visual results
## Light and dark results
## Reduced-motion results
## Axe and keyboard results
## TradingView attribution
## Credential-dependent gap, if any
## Final command matrix
```

Record command, exit code, and concise evidence. Do not mark credential-dependent checks passed when
credentials are absent.

- [ ] **Step 5: Run the narrow release matrix**

```bash
pnpm --filter @stock-insight/web exec node --test test/chart-upstream-contract.test.ts test/chart-data-adapters.test.ts test/chart-frame-accessibility-render.test.ts test/research-area-chart-contract.test.ts test/research-evidence-chart-contract.test.ts test/research-candlestick-chart-contract.test.ts test/stock-price-series.test.ts test/stock-chart-panel-render.test.ts test/stock-deep-dive-ui-structure.test.ts test/shared-ui-boundary.test.ts test/primitive-adoption-contract.test.ts
pnpm --filter @stock-insight/api-client exec node --test test/price-series.test.ts
pnpm typecheck:charts:fixture
pnpm test:charts:browser
```

Expected: PASS.

- [ ] **Step 6: Run the full static and build gate**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:design:hard
pnpm build
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Run browser gates in safe environments**

```bash
pnpm test:charts:browser
pnpm test:workspace:visual:production
pnpm test:design:browser:production
```

Expected: the credential-free chart fixture passes. Authenticated workspace tests either pass with
approved disposable/QA credentials or report the existing credential gap explicitly; they must not
connect to production-like data through a bypass.

- [ ] **Step 8: Refresh graphify and verify no forbidden imports or live loops remain**

```bash
graphify update .
rg -n "from ['\"]lightweight-charts|shared/ui/chart/vendor/bklit" apps/web/src/pages apps/web/src/widgets apps/web/src/features apps/web/src/entities
rg -n "setInterval|WebSocket|series\.update" apps/web/src/shared/ui/chart
git status --short
```

Expected: both `rg` commands return no forbidden product imports or live update loops. Git status
contains only intended task files plus the untouched user-owned untracked shared UI plan.

- [ ] **Step 9: Commit release evidence**

```bash
git add package.json apps/web/test/shared-ui-boundary.test.ts apps/web/test/primitive-adoption-contract.test.ts e2e/workspace-visual.spec.ts docs/reviews/market-graphite-chart-system-20260801.md
git commit -m "test(chart): Market Graphite 차트 릴리스 근거 고정"
```

Do not add `docs/superpowers/plans/2026-08-01-shared-ui-system.md`.

---

## Final acceptance checklist

- [ ] Bklit Area, Composed, ReferenceArea, Brush, and Marker source is pinned and attributed.
- [ ] `lightweight-charts` is exactly `5.2.0`, client-only, cleaned up, and visibly attributed.
- [ ] A responds to hover, tooltip, period changes, Brush resize, and Brush pan.
- [ ] B responds to marker/list selection in both directions and moves its visible range when needed.
- [ ] C responds to crosshair, wheel zoom, drag pan, period changes, and container resize.
- [ ] No automatic/live movement exists.
- [ ] All seven chart states are truthful and geometrically stable.
- [ ] `ChartDataTable` exposes OHLCV without requiring canvas or SVG interpretation.
- [ ] Product pages import only `@/shared/ui/chart`.
- [ ] Stock Deep Dive renders A and C from real `PriceSeries`; B appears only with timestamped evidence.
- [ ] 1440px, 1180px, 768px, and 390px have no overlap or unintended horizontal overflow.
- [ ] Light, dark, keyboard, Axe, and reduced-motion checks pass.
- [ ] Invalid OHLC and duplicate timestamps fail closed.
- [ ] The user-owned untracked shared UI plan remains untouched.
