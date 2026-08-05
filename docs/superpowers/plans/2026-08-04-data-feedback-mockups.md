# Data & Feedback Mockups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build interactive A/B/C UI Lab mockups for Table, DataGrid, Progress, Spinner, Skeleton, Empty, Error, and Loading without changing public shared UI APIs or product behavior.

**Architecture:** Keep deterministic demo data and pure sort/edit/virtual-range helpers in a model file. Split the native Table preview, application-style virtualized DataGrid, and feedback-state previews into focused UI Lab components, then compose them through one horizontal-tab catalog. All state remains local to the catalog so A/B/C variants share the same comparison truth without changing the URL.

**Tech Stack:** React 19, TypeScript, CSS Modules, local Motion boundary, existing shared Tabs/Button/Table/Input/Select primitives, Node test runner, Playwright, Axe.

## Global Constraints

- Render exactly eight horizontal component tabs in this order: Table, DataGrid, Progress, Spinner, Skeleton, Empty, Error, Loading.
- Render exactly three independently named A/B/C variants inside the selected component tab.
- DataGrid uses exactly 1,000 deterministic local rows, fixed 44px row height, 320px viewport, and overscan 6.
- DataGrid A/B/C share rows, sort, selection, edits, and column widths.
- Do not add a table, grid, animation, or virtualization dependency.
- Do not change `shared/ui` public APIs or connect mockups to product screens before visual approval.
- Do not issue network requests, persist server data, or change the UI Lab URL.
- Respect `prefers-reduced-motion`; Error owns the only assertive announcement and progress/completion use polite announcements.
- Run only two model Node tests, two focused Playwright tests, web typecheck, changed-file Oxfmt/Oxlint, and `git diff --check`; do not run the full test suite or full build.

---

## File Structure

- Create `apps/web/src/pages/ui-lab/ui/data-feedback-model.ts` — tab/variant definitions, deterministic rows, sort/edit helpers, and virtual range calculation.
- Create `apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx` — shared local state, eight horizontal tabs, variant-card composition, and action-result live region.
- Create `apps/web/src/pages/ui-lab/ui/data-feedback-table-preview.tsx` — native Table A/B/C sorting, selection, and expandable evidence rows.
- Create `apps/web/src/pages/ui-lab/ui/data-feedback-grid-preview.tsx` — ARIA grid, roving focus, editing, column resizing, and fixed-row virtualization.
- Create `apps/web/src/pages/ui-lab/ui/data-feedback-state-previews.tsx` — Progress, Spinner, Skeleton, Empty, Error, and Loading A/B/C.
- Create `apps/web/src/pages/ui-lab/ui/data-feedback-catalog.module.css` — catalog layout, all mockup variants, virtualization positioning, mobile containment, and reduced motion.
- Create `apps/web/test/data-feedback-model.test.ts` — the only pure model contract file for this bundle.
- Create `e2e/ui-lab-data-feedback.spec.ts` — the only focused browser contract file for this bundle.
- Modify `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx` — render the 5B catalog in `목업 진행 중`.
- Modify `docs/superpowers/UI-SYSTEM-ROLLOUT.md` — record implementation and focused verification evidence.

---

### Task 1: Lock the 5B model and deterministic data contract

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/data-feedback-model.ts`
- Create: `apps/web/test/data-feedback-model.test.ts`

**Interfaces:**

- Consumes: no earlier task output.
- Produces: `DataFeedbackTabId`, `DataFeedbackVariant`, `DataRow`, `DataColumnKey`, `SortState`, `dataFeedbackTabs`, `dataFeedbackVariants`, `createDataRows(count)`, `sortDataRows(rows, sort)`, `updateDataCell(rows, rowId, column, value)`, and `getVirtualRange(options)`.

- [ ] **Step 1: Write the failing model tests**

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDataRows,
  dataFeedbackTabs,
  dataFeedbackVariants,
  getVirtualRange,
  sortDataRows,
  updateDataCell,
} from '../src/pages/ui-lab/ui/data-feedback-model.ts';

describe('Data & Feedback model', () => {
  it('keeps eight independent A/B/C comparisons and deterministic grid rows', () => {
    assert.deepEqual(
      dataFeedbackTabs.map(({ id }) => id),
      ['table', 'data-grid', 'progress', 'spinner', 'skeleton', 'empty', 'error', 'loading'],
    );
    assert.deepEqual(
      dataFeedbackTabs.map(({ id }) => dataFeedbackVariants[id].length),
      [3, 3, 3, 3, 3, 3, 3, 3],
    );
    const rows = createDataRows(1_000);
    assert.equal(rows.length, 1_000);
    assert.deepEqual(createDataRows(3), rows.slice(0, 3));
  });

  it('sorts, edits, and virtualizes without mutating source rows', () => {
    const rows = createDataRows(1_000);
    const sorted = sortDataRows(rows, { key: 'score', direction: 'desc' });
    assert.ok(sorted[0]!.score >= sorted[1]!.score);
    assert.deepEqual(rows[0], createDataRows(1)[0]);
    const edited = updateDataCell(rows, rows[20]!.id, 'note', '다시 확인');
    assert.equal(edited[20]!.note, '다시 확인');
    assert.notEqual(edited, rows);
    assert.deepEqual(getVirtualRange({ scrollTop: 8_800, viewportHeight: 320, rowCount: 1_000 }), {
      start: 194,
      end: 214,
      offsetTop: 8_536,
      totalHeight: 44_000,
    });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/web/test/data-feedback-model.test.ts`

Expected: FAIL because `data-feedback-model.ts` does not exist.

- [ ] **Step 3: Implement the model**

Define the variant IDs exactly as specified:

```ts
export const dataFeedbackVariants = {
  table: [
    { id: 'expandable-rows', label: 'A · Expandable Rows', description: '행 아래 근거 펼침' },
    { id: 'sticky-surface', label: 'B · Sticky Surface', description: '고정 헤더와 낮은 표면' },
    { id: 'compact-ledger', label: 'C · Compact Ledger', description: '압축된 원장과 요약값' },
  ],
  'data-grid': [
    { id: 'precision-grid', label: 'A · Precision Grid', description: '선과 리사이저 중심' },
    { id: 'soft-sheet', label: 'B · Soft Sheet', description: '선택·편집 면 강조' },
    { id: 'dense-matrix', label: 'C · Dense Matrix', description: '숫자 정렬과 고정 식별 열' },
  ],
  progress: [
    { id: 'hairline-progress', label: 'A · Hairline Progress', description: '얇은 진행선' },
    { id: 'soft-meter', label: 'B · Soft Meter', description: '낮은 배경의 진행 면' },
    { id: 'segmented-track', label: 'C · Segmented Track', description: '구간별 진행 표시' },
  ],
  spinner: [
    { id: 'orbit', label: 'A · Orbit', description: '단일 궤도' },
    { id: 'three-dot', label: 'B · Three Dot', description: '순차 점 신호' },
    { id: 'signal-sweep', label: 'C · Signal Sweep', description: '짧은 스캔 신호' },
  ],
  skeleton: [
    { id: 'quiet-blocks', label: 'A · Quiet Blocks', description: '정적인 구조 블록' },
    { id: 'shimmer-surface', label: 'B · Shimmer Surface', description: '제한된 표면 이동' },
    { id: 'ledger-rows', label: 'C · Ledger Rows', description: '표 행 구조 미리보기' },
  ],
  empty: [
    { id: 'quiet-empty', label: 'A · Quiet Empty', description: '최소 안내' },
    { id: 'guided-empty', label: 'B · Guided Empty', description: '다음 행동을 포함한 면' },
    { id: 'inline-empty', label: 'C · Inline Empty', description: '데이터 영역 안 한 줄' },
  ],
  error: [
    { id: 'quiet-alert', label: 'A · Quiet Alert', description: '절제된 오류 안내' },
    { id: 'recovery-panel', label: 'B · Recovery Panel', description: '복구 행동 중심' },
    { id: 'inline-critical', label: 'C · Inline Critical', description: '행 안의 위험 상태' },
  ],
  loading: [
    { id: 'skeleton-first', label: 'A · Skeleton First', description: '구조를 먼저 표시' },
    { id: 'progress-panel', label: 'B · Progress Panel', description: '설명과 진행률 결합' },
    { id: 'staged-ledger', label: 'C · Staged Ledger', description: '단계별 수집 상태' },
  ],
} as const;
```

Generate row IDs as `research-0001` through `research-1000`, cycle through fixed ticker/company/source/status arrays, and derive `score` from `(index * 37) % 101`. Implement stable sorting with the original index as the tie-breaker. `updateDataCell` may edit only `note` and `status`. Implement virtual range with `rowHeight = 44` and `overscan = 6`, clamped to `0..rowCount`.

- [ ] **Step 4: Run the model tests and verify GREEN**

Run: `node --test apps/web/test/data-feedback-model.test.ts`

Expected: 2 tests pass.

- [ ] **Step 5: Commit the model contract**

```bash
git add apps/web/src/pages/ui-lab/ui/data-feedback-model.ts apps/web/test/data-feedback-model.test.ts
git commit -m "feat(ui-lab): Data Feedback 목업 모델 추가"
```

---

### Task 2: Build and connect the catalog shell

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx`
- Create: `apps/web/src/pages/ui-lab/ui/data-feedback-catalog.module.css`
- Modify: `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx`
- Test: `apps/web/test/data-feedback-model.test.ts`

**Interfaces:**

- Consumes: `dataFeedbackTabs`, `DataFeedbackTabId`, and the variant map from Task 1.
- Produces: `DataFeedbackCatalog`, `VariantCard`, and shared catalog state passed into Tasks 3–5.

- [ ] **Step 1: Extend the model test with the integration contract**

Read `ui-lab-page.tsx` and assert that it imports and renders `<DataFeedbackCatalog />` inside the `in-progress` tab while Identity & Content remains in `completed`.

```ts
const pageSource = await readFile(
  new URL('../src/pages/ui-lab/ui/ui-lab-page.tsx', import.meta.url),
  'utf8',
);
assert.match(pageSource, /import \{ DataFeedbackCatalog \}/);
assert.match(pageSource, /<TabsContent value="in-progress">[\s\S]*?<DataFeedbackCatalog \/>/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/web/test/data-feedback-model.test.ts`

Expected: FAIL because the catalog import and render do not exist.

- [ ] **Step 3: Implement the catalog shell and base responsive CSS**

Use the existing public `Tabs` composition and create these shared state values in `DataFeedbackCatalog`:

```ts
const [activeTab, setActiveTab] = useState<DataFeedbackTabId>('table');
const [tableSort, setTableSort] = useState<SortState>({ key: 'ticker', direction: 'none' });
const [selectedTableIds, setSelectedTableIds] = useState<readonly string[]>([]);
const [expandedTableId, setExpandedTableId] = useState<string>();
const [gridRows, setGridRows] = useState(() => createDataRows(1_000));
const [gridSort, setGridSort] = useState<SortState>({ key: 'ticker', direction: 'none' });
const [selectedGridIds, setSelectedGridIds] = useState<readonly string[]>([]);
const [columnWidths, setColumnWidths] =
  useState<Record<DataColumnKey, number>>(initialColumnWidths);
```

Render the eight tab triggers with `data-slot="data-feedback-tabs"` and one selected panel at a time. The CSS must provide a three-column variant grid above 1120px, one column below it, a horizontally scrollable tab row at 390px, and no page-level horizontal overflow.

- [ ] **Step 4: Render the catalog in the in-progress status tab**

Import `DataFeedbackCatalog` into `ui-lab-page.tsx`, retain the `Data & Feedback` status intro, and render the catalog directly after it.

- [ ] **Step 5: Run the model test and web typecheck**

Run: `node --test apps/web/test/data-feedback-model.test.ts && pnpm --filter @stock-insight/web typecheck`

Expected: 2 model tests pass and typecheck passes.

- [ ] **Step 6: Commit the catalog shell**

```bash
git add apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx apps/web/src/pages/ui-lab/ui/data-feedback-catalog.module.css apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx apps/web/test/data-feedback-model.test.ts
git commit -m "feat(ui-lab): Data Feedback 비교 카탈로그 연결"
```

---

### Task 3: Implement native Table A/B/C interaction

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/data-feedback-table-preview.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/data-feedback-catalog.module.css`

**Interfaces:**

- Consumes: the first six deterministic rows, shared `SortState`, selected IDs, expanded ID, `sortDataRows`, and existing shared Table primitives.
- Produces: `DataFeedbackTablePreview` with native sorting, selection, and expansion shared by all three variants.

- [ ] **Step 1: Compose one semantic table renderer used by all variants**

Define props with explicit controlled state:

```ts
type TablePreviewProps = {
  expandedId?: string;
  onExpandedIdChange: (id?: string) => void;
  onSelectedIdsChange: (ids: readonly string[]) => void;
  onSortChange: (sort: SortState) => void;
  selectedIds: readonly string[];
  sort: SortState;
};
```

For each variant render a shared `Table` with sortable button labels such as `점수 정렬`, `aria-sort` on the active header, existing `selectionMode="multiple"`, and an independent expand button labelled `${company} 근거 펼치기`. The detail row must use one cell with the exact visible copy `연결 근거`, source, note, and update time.

- [ ] **Step 2: Preserve variant differences without changing semantics**

- A `expandable-rows`: plain surface and the expanded detail visually attached to its row.
- B `sticky-surface`: framed surface, 280px internal vertical viewport, sticky header.
- C `compact-ledger`: plain dense surface, numeric score alignment, summary footer.

All table controls must remain at least 44px high on 390px screens; horizontal overflow must stay inside each table container.

- [ ] **Step 3: Run typecheck and changed-file lint**

Run: `pnpm --filter @stock-insight/web typecheck && pnpm exec oxlint apps/web/src/pages/ui-lab/ui/data-feedback-table-preview.tsx apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx`

Expected: both commands pass.

- [ ] **Step 4: Commit Table previews**

```bash
git add apps/web/src/pages/ui-lab/ui/data-feedback-table-preview.tsx apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx apps/web/src/pages/ui-lab/ui/data-feedback-catalog.module.css
git commit -m "feat(ui-lab): Table 확장 A/B/C 목업 추가"
```

---

### Task 4: Implement the full virtualized DataGrid A/B/C

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/data-feedback-grid-preview.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/data-feedback-catalog.module.css`
- Test: `e2e/ui-lab-data-feedback.spec.ts`

**Interfaces:**

- Consumes: the 1,000 rows, `SortState`, selected IDs, shared widths, `sortDataRows`, `updateDataCell`, and `getVirtualRange`.
- Produces: `DataFeedbackGridPreview` with three controlled grid variants and stable `data-grid-*` slots used by Playwright.

- [ ] **Step 1: Write the focused desktop Playwright test before implementation**

Create the first test in `e2e/ui-lab-data-feedback.spec.ts`:

```ts
test('shares Table and virtual DataGrid interactions across A/B/C', async ({ page }) => {
  await page.goto('/__ui-lab');
  await page.waitForLoadState('networkidle');
  const initialUrl = page.url();
  await page.getByRole('tab', { name: '목업 진행 중', exact: true }).click();
  const catalog = page.locator('[data-slot="data-feedback-catalog"]');
  await catalog.getByRole('tab', { name: 'Table', exact: true }).click();
  await catalog
    .getByRole('button', { name: /근거 펼치기/ })
    .first()
    .click();
  await expect(catalog.getByText('연결 근거')).toHaveCount(3);
  await catalog.getByRole('tab', { name: 'DataGrid', exact: true }).click();
  await expect(catalog.locator('[role="grid"]')).toHaveCount(3);
  await catalog.getByRole('button', { name: '점수 정렬' }).first().click();
  await expect(catalog.locator('[role="columnheader"][aria-sort="ascending"]')).toHaveCount(3);
  const firstGrid = catalog.locator('[role="grid"]').first();
  await firstGrid.locator('[role="gridcell"][data-column="note"]').first().dblclick();
  await firstGrid.getByRole('textbox').fill('다시 확인');
  await firstGrid.getByRole('textbox').press('Enter');
  await expect(catalog.getByText('다시 확인', { exact: true })).toHaveCount(3);
  const mountedRows = await firstGrid.locator('[role="row"]').count();
  expect(mountedRows).toBeGreaterThan(8);
  expect(mountedRows).toBeLessThan(40);
  await firstGrid.locator('[data-slot="data-grid-viewport"]').evaluate((element) => {
    element.scrollTop = 8_800;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect(firstGrid.locator('[role="row"][aria-rowindex="201"]')).toBeVisible();
  expect(page.url()).toBe(initialUrl);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:6110 PLAYWRIGHT_SKIP_WEB_SERVER=1 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/ui-lab-data-feedback.spec.ts --project=desktop --workers=1`

Expected: FAIL because the DataGrid preview does not exist.

- [ ] **Step 3: Implement fixed-row virtualization and semantic grid structure**

Render each grid with `role="grid"`, `aria-rowcount={1_001}`, a header `role="row"`, and a 320px viewport. Inside the viewport use a spacer with `height: totalHeight`, then position the visible range at `transform: translateY(offsetTop)` and render only `rows.slice(start, end)` with `aria-rowindex={rowIndex + 2}`. Give data rows `height: 44px` and overscan 6.

Track one logical active cell `{ rowId, column }`. Arrow keys update it, scroll the row into view when it leaves the virtual range, and focus the mounted cell after the range updates. Home and End select the first and last focusable data column in the same row.

- [ ] **Step 4: Implement shared sorting, selection, and editing**

Header buttons call the shared sort cycle `none → asc → desc → none`. Row selection toggles IDs in catalog state. Editable `note` and `status` cells start editing on Enter, F2, or double click. Text input Enter commits, Escape restores the original value, and blur commits. Status uses the existing Select primitive with `확인 전`, `확인 중`, `확인 완료` options.

- [ ] **Step 5: Implement pointer and keyboard column resizing**

Render a focusable `role="separator"` at the right edge of each resizable column header with `aria-orientation="vertical"`, `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`. Pointer down records the starting X and width, document pointer move clamps the width, and pointer up removes listeners. ArrowLeft/ArrowRight changes width by 8px. Update catalog-owned widths so all three grids change together.

- [ ] **Step 6: Apply the three independent visual variants**

- A `precision-grid`: 1px hairlines and visible resize guides.
- B `soft-sheet`: low selected/editing surfaces and rounded viewport.
- C `dense-matrix`: tabular numeric alignment and sticky first identity column, without a pinning settings UI.

At 390px, keep horizontal scrolling inside the grid viewport and preserve 44px rows and resize hit areas. Reduced motion disables animated selection and shimmer but not scrolling or focus movement.

- [ ] **Step 7: Run the desktop test, typecheck, and lint**

Run the focused Playwright command from Step 2, then:

`pnpm --filter @stock-insight/web typecheck && pnpm exec oxlint apps/web/src/pages/ui-lab/ui/data-feedback-grid-preview.tsx apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx e2e/ui-lab-data-feedback.spec.ts`

Expected: one Playwright test passes; typecheck and lint pass.

- [ ] **Step 8: Commit DataGrid interaction**

```bash
git add apps/web/src/pages/ui-lab/ui/data-feedback-grid-preview.tsx apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx apps/web/src/pages/ui-lab/ui/data-feedback-catalog.module.css e2e/ui-lab-data-feedback.spec.ts
git commit -m "feat(ui-lab): 가상 DataGrid A/B/C 목업 추가"
```

---

### Task 5: Add Progress, Spinner, Skeleton, Empty, Error, and Loading previews

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/data-feedback-state-previews.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/data-feedback-catalog.module.css`
- Modify: `e2e/ui-lab-data-feedback.spec.ts`

**Interfaces:**

- Consumes: variant definitions, existing Button/Input and local Motion boundary.
- Produces: `DataFeedbackStatePreviews`, repeatable progress/loading actions, and visual slots used by the mobile/reduced-motion/Axe test.

- [ ] **Step 1: Implement one controlled preview per state family**

Use catalog-owned state for progress and loading:

```ts
const progressSteps = [0, 36, 68, 100] as const;
const [progressIndex, setProgressIndex] = useState(0);
const [loadingState, setLoadingState] = useState<'idle' | 'pending' | 'complete'>('idle');
```

Progress advances cyclically on `진행 상태 변경`. Loading uses one effect-owned 900ms timeout when state becomes `pending`, then switches to `complete`; `다시 불러오기` returns to `pending`. Empty action reports `필터 초기화됨`, Error action cycles `다시 시도 중 → 복구됨`, and all three A/B/C variants read the same result.

Spinner variants are indeterminate and carry the visible label `새 근거 확인 중`. Skeleton variants preserve the final card/table dimensions. Use Lucide icons only; do not add emoji or external images.

- [ ] **Step 2: Add the mobile, reduced-motion, and Axe Playwright test**

```ts
test('contains all state variants on mobile with reduced motion and accessible feedback', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/__ui-lab');
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: '목업 진행 중', exact: true }).click();
  const catalog = page.locator('[data-slot="data-feedback-catalog"]');
  await expect(catalog.getByRole('tab')).toHaveCount(8);
  for (const name of ['Progress', 'Spinner', 'Skeleton', 'Empty', 'Error', 'Loading']) {
    await catalog.getByRole('tab', { name, exact: true }).click();
    await expect(catalog.locator('article[data-component]')).toHaveCount(3);
  }
  await catalog.getByRole('button', { name: '다시 불러오기' }).first().click();
  await expect(catalog.getByText('불러오는 중', { exact: true })).toHaveCount(3);
  await expect(catalog.getByText('불러오기 완료', { exact: true })).toHaveCount(3, {
    timeout: 2_000,
  });
  const moving = catalog.locator('[data-motion-indicator]').first();
  expect(await moving.evaluate((element) => getComputedStyle(element).animationPlayState)).toBe(
    'paused',
  );
  const results = await new AxeBuilder({ page })
    .include('[data-slot="data-feedback-catalog"]')
    .analyze();
  expect(results.violations).toEqual([]);
});
```

- [ ] **Step 3: Run both focused Playwright tests**

Run: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:6110 PLAYWRIGHT_SKIP_WEB_SERVER=1 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/ui-lab-data-feedback.spec.ts --project=desktop --workers=1`

Expected: 2 tests pass.

- [ ] **Step 4: Run changed-file type, lint, and format checks**

Run:

```bash
pnpm --filter @stock-insight/web typecheck
pnpm exec oxlint apps/web/src/pages/ui-lab/ui/data-feedback-*.tsx apps/web/src/pages/ui-lab/ui/data-feedback-model.ts e2e/ui-lab-data-feedback.spec.ts
pnpm exec oxfmt --check apps/web/src/pages/ui-lab/ui/data-feedback-* apps/web/test/data-feedback-model.test.ts e2e/ui-lab-data-feedback.spec.ts
git diff --check
```

Expected: all commands pass.

- [ ] **Step 5: Commit the remaining state previews**

```bash
git add apps/web/src/pages/ui-lab/ui/data-feedback-state-previews.tsx apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx apps/web/src/pages/ui-lab/ui/data-feedback-catalog.module.css e2e/ui-lab-data-feedback.spec.ts
git commit -m "feat(ui-lab): Data Feedback 상태 A/B/C 목업 추가"
```

---

### Task 6: Verify in the in-app browser and update the ledger

**Files:**

- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`

**Interfaces:**

- Consumes: complete 5B UI Lab catalog and all focused checks.
- Produces: browser evidence, final verification record, and a clean visual-approval handoff.

- [ ] **Step 1: Verify the desktop catalog in the Codex in-app browser**

Open `http://127.0.0.1:6110/__ui-lab`, select `목업 진행 중`, and verify:

- exactly eight component tabs and three cards per selected tab;
- Table sort, shared selection, and shared expanded evidence rows;
- DataGrid shared sort, selection, edit result, and width change;
- a scrolled grid mounts only the virtual window while reporting 1,001 ARIA rows;
- Progress and Loading repeat after completion;
- Empty and Error actions update only the local result;
- the URL remains unchanged.

- [ ] **Step 2: Verify the 390px and reduced-motion contracts**

Use the focused Playwright result as the 390px/Axe evidence and visually confirm the tab row scrolls horizontally without page overflow. Confirm Orbit, Three Dot, Signal Sweep, shimmer, and loading transitions become static under reduced motion.

- [ ] **Step 3: Update the canonical ledger**

Append a `2026-08-04 — 5B Data & Feedback 목업 구현` record with:

- eight independent horizontal tabs and A/B/C names;
- Table and full DataGrid interaction scope;
- 1,000 deterministic rows and the 44px/320px/overscan 6 virtualizer contract;
- repeatable progress/loading and local recovery actions;
- exact Node, Playwright, typecheck, Oxfmt, Oxlint, diff, and in-app browser evidence;
- `사용자 시각 승인 대기` as the next action.

Keep 5B status as `목업`; do not publicize or connect product usage yet.

- [ ] **Step 4: Refresh graphify and run the final narrow gate**

Run:

```bash
node --test apps/web/test/data-feedback-model.test.ts
pnpm --filter @stock-insight/web typecheck
pnpm exec oxfmt --check apps/web/src/pages/ui-lab/ui/data-feedback-model.ts apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx apps/web/src/pages/ui-lab/ui/data-feedback-table-preview.tsx apps/web/src/pages/ui-lab/ui/data-feedback-grid-preview.tsx apps/web/src/pages/ui-lab/ui/data-feedback-state-previews.tsx apps/web/src/pages/ui-lab/ui/data-feedback-catalog.module.css apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx apps/web/test/data-feedback-model.test.ts e2e/ui-lab-data-feedback.spec.ts docs/superpowers/UI-SYSTEM-ROLLOUT.md
pnpm exec oxlint apps/web/src/pages/ui-lab/ui/data-feedback-model.ts apps/web/src/pages/ui-lab/ui/data-feedback-catalog.tsx apps/web/src/pages/ui-lab/ui/data-feedback-table-preview.tsx apps/web/src/pages/ui-lab/ui/data-feedback-grid-preview.tsx apps/web/src/pages/ui-lab/ui/data-feedback-state-previews.tsx apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx apps/web/test/data-feedback-model.test.ts e2e/ui-lab-data-feedback.spec.ts
git diff --check
graphify update .
```

Expected: 2 Node tests pass, typecheck/lint/format/diff pass, and graphify completes.

- [ ] **Step 5: Commit the ledger and hand off visual approval**

```bash
git add docs/superpowers/UI-SYSTEM-ROLLOUT.md
git commit -m "docs(ui): Data Feedback 목업 검증 기록"
```

Leave the in-app browser on the 5B catalog and ask the user which A/B/C variants to keep for each component. Do not change `shared/ui` or product consumers before that answer.
