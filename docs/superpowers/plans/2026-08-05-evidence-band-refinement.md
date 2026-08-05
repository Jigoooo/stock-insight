# Evidence Band Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the existing Evidence Band A/B/C mockups so A reads as a range ledger, B as an event-first chart, and C as a linked chart-and-evidence analysis surface while preserving shared state and renderer boundaries.

**Architecture:** Keep the existing `EvidenceBandVariantId` values and shared catalog state. Move semantic layout and evidence-row composition into the UI Lab preview, keep Bklit series/band/marker tuning inside the existing non-public renderer adapter, and express the three visual languages through the existing CSS module. Do not publicize chart APIs or connect product routes before the refined mockups receive visual approval.

**Tech Stack:** React 19, TypeScript 6, CSS Modules, Motion reduced-motion hook, vendored Bklit/Visx, Node test runner, Playwright, Axe.

## Global Constraints

- Worktree: `/Users/kimjigoooo/workspace/futur/stock-insight/.worktrees/menu-overlay-mockups`.
- Preserve Market Tape A/B/C and Candle Ledger A/B/C without visual or behavioral edits.
- Preserve `band-ledger`, `event-pulse`, and `evidence-split` as internal variant IDs; only user-facing titles change to Range Ledger, Event Pulse, and Linked Evidence.
- Keep `rangeSelection`, `selectedEvidenceId`, `showBands`, and evidence selection callbacks shared across all three variants.
- Use the existing Bklit `ComposedChart`, `ReferenceArea`, `Area`, `Line`, `ChartMarkers`, tooltip, axes, and brush boundary.
- Do not modify `apps/web/src/shared/ui/chart/vendor/bklit/**`.
- Do not add or upgrade dependencies.
- Do not create or export the public `shared/ui/chart` API in this refinement.
- Use solid low-opacity reference areas; do not restore broad diagonal or dotted pattern fills.
- Preserve keyboard ownership in the evidence list, minimum 44px pointer targets, native chart data-table disclosure, 390px containment, and `prefers-reduced-motion`.
- Run only the focused Node contract, chart Playwright spec, web typecheck, changed-file format/lint, `git diff --check`, and browser visual comparison.
- Each commit stages only the paths named in its task.

---

### Task 1: Lock the refined Evidence Band source contract

**Files:**

- Create: `apps/web/test/ui-lab-evidence-band.test.ts`

**Interfaces:**

- Consumes: source text from `evidence-band-preview.tsx`, `bklit-preview.tsx`, and `chart-catalog.module.css`.
- Produces: two focused Node cases that fail until the approved copy, semantic slots, solid reference bands, and distinct layouts exist.

- [ ] **Step 1: Write the failing source contract**

Create the test with these assertions:

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('UI Lab Evidence Band refinement', () => {
  it('defines range, event, and linked-evidence reading modes with shared selection semantics', async () => {
    const preview = await read('../src/pages/ui-lab/ui/evidence-band-preview.tsx');
    assert.match(preview, /A · Range Ledger/);
    assert.match(preview, /B · Event Pulse/);
    assert.match(preview, /C · Linked Evidence/);
    assert.match(preview, /data-slot="evidence-context-legend"/);
    assert.match(preview, /data-slot="evidence-selected-summary"/);
    assert.match(preview, /aria-current=\{selected \? 'true' : undefined\}/);
    assert.doesNotMatch(preview, /className=\{styles\.bandLabels\}/);
  });

  it('uses solid reference underlays and three distinct evidence layouts', async () => {
    const renderer = await read('../src/shared/ui/chart/internal/bklit-preview.tsx');
    const css = await read('../src/pages/ui-lab/ui/chart-catalog.module.css');
    assert.match(renderer, /pattern="none"/);
    assert.match(renderer, /fadeEdges=\{tone !== 'evidence-split'\}/);
    assert.match(css, /\.variantCard\[data-variant='band-ledger'\] \.evidenceRow/);
    assert.match(css, /\.variantCard\[data-variant='event-pulse'\] \.evidencePreview/);
    assert.match(css, /\.variantCard\[data-variant='evidence-split'\] \.evidencePreview/);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails for the old design**

Run:

```bash
cd apps/web && node --test test/ui-lab-evidence-band.test.ts
```

Expected: FAIL because `Range Ledger`, `Linked Evidence`, the new semantic slots, and solid band configuration do not exist yet.

- [ ] **Step 3: Commit the red contract**

```bash
git add apps/web/test/ui-lab-evidence-band.test.ts
git commit -m "test(ui-lab): Evidence Band 개선 계약 추가"
```

Expected: the commit contains only the new focused contract.

### Task 2: Implement the three semantic reading modes

**Files:**

- Modify: `apps/web/src/pages/ui-lab/ui/evidence-band-preview.tsx`
- Modify: `apps/web/src/shared/ui/chart/internal/bklit-preview.tsx`

**Interfaces:**

- Consumes: `EvidenceBandPreviewProps`, `EvidenceRecord`, `ReferenceBand`, `BklitEvidenceBandRendererProps`, and existing shared selection callbacks.
- Produces: `EvidenceContextLegend`, a variant-aware `EvidenceList`, optional C selected summary, explicit selected/out-of-range row semantics, and tone-specific Bklit band/marker hierarchy.

- [ ] **Step 1: Replace the user-facing variant copy**

Keep the IDs unchanged and replace only the copy:

```ts
const variantCopy = {
  'band-ledger': {
    title: 'A · Range Ledger',
    description: '조건 구간의 시작과 끝, 가격 경로의 통과 방식을 먼저 읽습니다.',
  },
  'event-pulse': {
    title: 'B · Event Pulse',
    description: '사건 시점과 당시 가격을 marker와 guide로 연결해 탐색합니다.',
  },
  'evidence-split': {
    title: 'C · Linked Evidence',
    description: '차트와 근거 원장을 한 선택 상태로 연결해 함께 분석합니다.',
  },
} satisfies Record<EvidenceBandVariantId, { title: string; description: string }>;
```

- [ ] **Step 2: Add the in-plot context legend and selected summary**

Create `EvidenceContextLegend` in `evidence-band-preview.tsx`. Render two non-interactive labels as spans with `data-slot="reference-band"`, `data-band-tone="copper|risk"`, and the existing band label. Place the legend in `evidenceChartColumn` so CSS can position it over the plot rather than in a separate row.

For C, derive the selected evidence and bar once and render:

```tsx
<aside className={styles.selectedEvidenceSummary} data-slot="evidence-selected-summary">
  <span>{toneLabel(selectedEvidence.tone)}</span>
  <strong>{selectedEvidence.title}</strong>
  <small>
    {selectedBar.date.toLocaleDateString('ko-KR')} · {formatPrice(currency, selectedBar.close)} ·{' '}
    {selectedEvidence.sourceCount}개 출처
  </small>
</aside>
```

Do not render an empty summary when no evidence is selected.

- [ ] **Step 3: Make the evidence list variant-aware**

Pass `variantId` and the current `rangeSelection` into `EvidenceList`. Each row keeps one button and the existing click behavior, adds `aria-current={selected ? 'true' : undefined}`, renders the date in a `<time>`, and shows `선택 시점이 현재 범위 밖` only when the selected bar is outside the current range. A uses the same DOM as B/C; CSS owns horizontal ledger versus card versus split-row layout.

- [ ] **Step 4: Tune Bklit underlays and markers without changing the vendor**

In `BklitEvidenceBandRenderer`:

```tsx
<ReferenceArea
  axisLabelColor={bandColor}
  fadeEdges={tone !== 'evidence-split'}
  fadeEdgesLength={tone === 'band-ledger' ? 4 : 8}
  fill={bandColor}
  fillOpacity={tone === 'band-ledger' ? 0.1 : tone === 'event-pulse' ? 0.045 : 0.065}
  pattern="none"
  showMarkers={tone === 'band-ledger'}
  stroke={bandColor}
  strokeStyle="solid"
  strokeWidth={tone === 'band-ledger' ? 1.25 : 0.75}
  x1={band.start}
  x2={band.end}
  y1={band.low}
  y2={band.high}
/>
```

Use marker sizes 18 for A, 24 for B, and 21 for C. Show vertical marker lines only for B and C. Use a brighter selected marker color and keep non-selected A markers neutral. Animate only B marker entrance when reduced motion is off. Keep the price line at 2px or wider for every variant and lower area fill below `0.08`.

- [ ] **Step 5: Run the Node contract until it passes**

Run:

```bash
cd apps/web && node --test test/ui-lab-evidence-band.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit the semantic renderer change**

```bash
git add \
  apps/web/src/pages/ui-lab/ui/evidence-band-preview.tsx \
  apps/web/src/shared/ui/chart/internal/bklit-preview.tsx
git commit -m "feat(ui-lab): Evidence Band 의미 계층 개선"
```

Expected: Market Tape and Candle Ledger source files are absent from the staged diff.

### Task 3: Implement the A/B/C layouts and focused browser contracts

**Files:**

- Modify: `apps/web/src/pages/ui-lab/ui/chart-catalog.module.css`
- Modify: `e2e/ui-lab-charts.spec.ts`

**Interfaces:**

- Consumes: `data-variant`, `data-slot="evidence-context-legend"`, `data-slot="evidence-selected-summary"`, `data-slot="evidence-row"`, and `data-selected` from Task 2.
- Produces: A compact ledger, B event-first chart/list split, C 65/35 linked split, mobile stacking, reduced-motion-safe transitions, and Playwright evidence for the refined contract.

- [ ] **Step 1: Replace the detached label-row CSS with an in-plot legend**

Make `.evidenceChartColumn` position relative and one-row. Position `.evidenceContextLegend` at `top: 8px; left: 12px; z-index: 2`; use a translucent canvas background and solid 1px swatches. A uses edge-like labels, B reduces legend opacity, and C uses one compact legend rail. Remove `.bandLabels` rules completely.

- [ ] **Step 2: Define the three layouts**

Use these layout contracts:

```css
.variantCard[data-variant='band-ledger'] .evidencePreview {
  grid-template-columns: 1fr;
}

.variantCard[data-variant='band-ledger'] .evidenceRow {
  min-height: 48px;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  border-width: 0 0 1px;
  border-radius: 0;
}

.variantCard[data-variant='event-pulse'] .evidencePreview {
  grid-template-columns: minmax(0, 1.5fr) minmax(230px, 0.5fr);
}

.variantCard[data-variant='evidence-split'] .evidencePreview {
  grid-template-columns: minmax(0, 1.85fr) minmax(260px, 1fr);
  gap: 0;
}
```

C keeps equal-height columns, gives only `.evidenceList` vertical scrolling, and uses a selected 2px rail. At `max-width: 900px`, stack chart then list, remove the vertical divider, and use a short top border. At `max-width: 720px`, make every evidence row at least 44px and return A rows to one text column.

- [ ] **Step 3: Extend the existing Evidence Band Playwright case**

Keep the spec at three total test cases. In the Evidence Band case, assert:

```ts
await expect(catalog.getByRole('heading', { name: 'A · Range Ledger' })).toHaveCount(1);
await expect(catalog.getByRole('heading', { name: 'B · Event Pulse' })).toHaveCount(1);
await expect(catalog.getByRole('heading', { name: 'C · Linked Evidence' })).toHaveCount(1);
await expect(catalog.locator('[data-slot="evidence-context-legend"]')).toHaveCount(3);
await expect(catalog.locator('[data-slot="reference-band"]')).toHaveCount(6);
await expect(catalog.locator('[data-slot="evidence-selected-summary"]')).toHaveCount(1);
```

After selecting `evidence-demand`, assert all three rows have `aria-pressed="true"` and `aria-current="true"`. After turning bands off, assert both reference-band labels and SVG `.chart-reference-area` elements are absent. Set viewport to 390px, assert the catalog `scrollWidth <= clientWidth`, and run Axe against the chart catalog.

- [ ] **Step 4: Run the focused verification**

Run:

```bash
cd apps/web && node --test test/ui-lab-evidence-band.test.ts test/ui-lab-chart-model.test.ts
pnpm --filter @stock-insight/web typecheck
PLAYWRIGHT_BASE_URL=http://127.0.0.1:6110 \
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER \
pnpm exec playwright test e2e/ui-lab-charts.spec.ts --project=desktop --workers=1
pnpm exec oxfmt --check \
  apps/web/src/pages/ui-lab/ui/evidence-band-preview.tsx \
  apps/web/src/pages/ui-lab/ui/chart-catalog.module.css \
  apps/web/src/shared/ui/chart/internal/bklit-preview.tsx \
  apps/web/test/ui-lab-evidence-band.test.ts \
  e2e/ui-lab-charts.spec.ts
pnpm exec oxlint \
  apps/web/src/pages/ui-lab/ui/evidence-band-preview.tsx \
  apps/web/src/shared/ui/chart/internal/bklit-preview.tsx \
  apps/web/test/ui-lab-evidence-band.test.ts \
  e2e/ui-lab-charts.spec.ts
git diff --check
```

Expected: Node 4 tests pass, web typecheck passes, Playwright 3 tests pass, format/lint/diff checks pass.

- [ ] **Step 5: Commit the layout and browser contract**

```bash
git add \
  apps/web/src/pages/ui-lab/ui/chart-catalog.module.css \
  e2e/ui-lab-charts.spec.ts
git commit -m "fix(ui-lab): Evidence Band 비교 레이아웃 보정"
```

Expected: the commit contains only CSS and the existing chart Playwright spec.

### Task 4: Verify visually and record the pending approval state

**Files:**

- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`

**Interfaces:**

- Consumes: the refined UI Lab running at `http://127.0.0.1:6110/__ui-lab` and the focused verification results from Task 3.
- Produces: browser evidence for desktop and 390px, an updated 6A ledger entry, and a clean graph/worktree ready for user visual approval.

- [ ] **Step 1: Inspect the three refined variants in the Codex in-app browser**

Open the existing UI Lab tab, select `목업 진행 중` and `Evidence Band`, then verify:

- A shows quiet solid ranges and a compact chronological ledger.
- B makes event markers and vertical guides dominant while bands remain contextual.
- C keeps a 65/35 chart/list split with one selected summary and synchronized selected rail.
- No detached dashed label-chip row remains.
- Market Tape and Candle Ledger still mount three cards each.

- [ ] **Step 2: Verify the 390px layout and reduced motion**

Use the existing Playwright evidence from Task 3 plus a browser viewport check where available. Confirm chart/list stacking, 44px evidence rows, zero catalog overflow, and immediate reduced-motion transitions.

- [ ] **Step 3: Update the rollout ledger**

Append a `2026-08-05 — 6A Evidence Band 개선 목업 구현·검증` entry recording:

- Range Ledger, Event Pulse, Linked Evidence semantics.
- solid underlays, in-plot legend, selected summary/rail, shared selection.
- focused Node, typecheck, format/lint, Playwright, Axe, 390px, reduced-motion, and in-app browser evidence.
- next action remains user visual approval; do not change 6A to `승인` or start publicization.

- [ ] **Step 4: Refresh graph and commit the ledger**

Run:

```bash
graphify update .
git diff --check
git add docs/superpowers/UI-SYSTEM-ROLLOUT.md
git commit -m "docs(ui): Evidence Band 개선 검증 기록"
```

Expected: graph update completes, the ledger commit contains only the rollout file, and `git status --short` is clean.
