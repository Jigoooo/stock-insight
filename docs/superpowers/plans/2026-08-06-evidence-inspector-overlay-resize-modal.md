# Evidence Inspector Overlay, Resize, and Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Today evidence inspector open above the workspace without changing existing content geometry, support accessible 420–760px drawer resizing with session persistence, and toggle the same detail into a centered 760–960px modal.

**Architecture:** Keep record selection, URL state, and focus return in `ResearchWorkspacePage`. Move desktop inspector rendering into the existing Radix `Dialog` portal, keep width parsing as a pure model function, and let `EvidenceInspector` own only drawer width and drawer/modal presentation state. Reuse the existing shared `Dialog` and DataGrid separator patterns; add no dependency and make no backend or database change.

**Tech Stack:** React 19, TypeScript 6, Radix Dialog, Motion, CSS Modules, Node test runner, Playwright.

## Global Constraints

- The workspace is read-only and must not add order, execution, buy, or sell behavior.
- Desktop drawer default width is exactly 520px; minimum is 420px and maximum is 760px.
- Drawer width persists only in `sessionStorage`; a new browser session returns to 520px.
- The inspector must not change the x-position, width, transform, margin, or scroll position of existing workspace content.
- The centered modal uses `clamp(760px, 72vw, 960px)` and keeps at least 24px viewport margin on each side.
- Every newly selected record starts in drawer mode; drawer/modal presentation is not persisted.
- Drawer and centered modal both use the light blocking overlay; outside click closes only the inspector and never activates content behind it.
- At 767px and below, preserve the existing bottom modal, overlay, focus lock, inert workspace, and focus-return behavior.
- Use CSS and the existing local Motion boundary only; support `prefers-reduced-motion`.
- Add no package, provider, backend endpoint, database migration, or API contract change.
- Preserve every pre-existing dirty-worktree change. Do not stage or commit implementation files unless the user explicitly asks after verification.

---

## File Map

- Create `apps/web/src/pages/research-workspace/model/evidence-inspector-layout.ts`: drawer width constants, storage key, viewport clamp, and stored-value parser.
- Create `apps/web/test/evidence-inspector-layout.test.ts`: pure width-model regression coverage.
- Modify `apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx`: presentation state, session persistence, resize separator, and modal toggle.
- Modify `apps/web/src/pages/research-workspace/ui/relation-detail.module.css`: drawer resize handle, header toggle, centered modal sizing, drag state, and responsive hiding.
- Modify `apps/web/src/shared/ui/dialog/dialog.module.css`: portalled inspector desktop placement and 767px bottom-modal boundary.
- Modify `apps/web/src/widgets/workspace-shell/ui/workspace-shell.module.css`: remove the third inspector grid column that compresses content.
- Modify `apps/web/test/workspace-overlay-integration-contract.test.ts`: update static integration expectations for a portalled drawer and modal truth.
- Modify `e2e/today-preview-experience.spec.ts`: no-reflow, resize persistence, modal toggle, mobile, and reduced-motion behavior tests.

---

### Task 1: Lock the drawer width model

**Files:**

- Create: `apps/web/src/pages/research-workspace/model/evidence-inspector-layout.ts`
- Create: `apps/web/test/evidence-inspector-layout.test.ts`

**Interfaces:**

- Produces: `evidenceInspectorDefaultWidth`, `evidenceInspectorMinWidth`, `evidenceInspectorMaxWidth`, `evidenceInspectorWidthStorageKey`.
- Produces: `clampEvidenceInspectorWidth(width: number, viewportWidth: number): number`.
- Produces: `parseStoredEvidenceInspectorWidth(value: string | null, viewportWidth: number): number`.
- Consumes: no UI or browser dependency.

- [ ] **Step 1: Write the failing pure-model test**

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clampEvidenceInspectorWidth,
  evidenceInspectorDefaultWidth,
  evidenceInspectorMaxWidth,
  evidenceInspectorMinWidth,
  parseStoredEvidenceInspectorWidth,
} from '../src/pages/research-workspace/model/evidence-inspector-layout';

describe('evidence inspector layout', () => {
  it('uses the approved defaults and clamps width to the desktop viewport', () => {
    assert.equal(evidenceInspectorDefaultWidth, 520);
    assert.equal(evidenceInspectorMinWidth, 420);
    assert.equal(evidenceInspectorMaxWidth, 760);
    assert.equal(clampEvidenceInspectorWidth(300, 1440), 420);
    assert.equal(clampEvidenceInspectorWidth(900, 1440), 760);
    assert.equal(clampEvidenceInspectorWidth(760, 700), 676);
  });

  it('accepts only finite stored widths and falls back to 520px', () => {
    assert.equal(parseStoredEvidenceInspectorWidth('612', 1440), 612);
    assert.equal(parseStoredEvidenceInspectorWidth('999', 1440), 760);
    assert.equal(parseStoredEvidenceInspectorWidth('invalid', 1440), 520);
    assert.equal(parseStoredEvidenceInspectorWidth(null, 1440), 520);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/evidence-inspector-layout.test.ts
```

Expected: FAIL because `evidence-inspector-layout.ts` does not exist.

- [ ] **Step 3: Implement the pure width model**

```ts
export const evidenceInspectorDefaultWidth = 520;
export const evidenceInspectorMinWidth = 420;
export const evidenceInspectorMaxWidth = 760;
export const evidenceInspectorWidthStorageKey = 'stock-insight:evidence-inspector-width';

const viewportMargin = 24;

export function clampEvidenceInspectorWidth(width: number, viewportWidth: number) {
  const viewportMaximum = Math.max(
    evidenceInspectorMinWidth,
    Math.min(evidenceInspectorMaxWidth, viewportWidth - viewportMargin),
  );
  return Math.round(Math.min(viewportMaximum, Math.max(evidenceInspectorMinWidth, width)));
}

export function parseStoredEvidenceInspectorWidth(value: string | null, viewportWidth: number) {
  if (value === null) return evidenceInspectorDefaultWidth;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return evidenceInspectorDefaultWidth;
  return clampEvidenceInspectorWidth(parsed, viewportWidth);
}
```

- [ ] **Step 4: Run the focused test and web typecheck**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/evidence-inspector-layout.test.ts
pnpm --filter @stock-insight/web typecheck
```

Expected: the two width-model tests pass and TypeScript reports no error.

- [ ] **Step 5: Check the scoped diff without committing**

Run:

```bash
git diff --check -- apps/web/src/pages/research-workspace/model/evidence-inspector-layout.ts apps/web/test/evidence-inspector-layout.test.ts
git status --short
```

Expected: no whitespace error; existing Today changes remain present and untouched.

---

### Task 2: Move the desktop inspector above the workspace without reflow

**Files:**

- Modify: `apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx`
- Modify: `apps/web/src/shared/ui/dialog/dialog.module.css`
- Modify: `apps/web/src/widgets/workspace-shell/ui/workspace-shell.module.css`
- Modify: `apps/web/test/workspace-overlay-integration-contract.test.ts`
- Modify: `e2e/today-preview-experience.spec.ts`

**Interfaces:**

- Consumes: `evidenceInspectorDefaultWidth` and `clampEvidenceInspectorWidth` from Task 1.
- Produces: a portalled desktop inspector with `data-inspector-presentation="drawer"`.
- Preserves: `EvidenceInspector` public props and `ResearchWorkspacePage` selection/focus behavior.

- [ ] **Step 1: Add a failing no-reflow Playwright test**

Append a desktop-only test that measures a Today panel before and after opening the inspector:

```ts
test('opens the evidence drawer above the workspace without changing card geometry', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop drawer contract');
  const panel = page.getByTestId('today-headline-news');
  const before = await panel.boundingBox();
  await panel.getByRole('button', { name: /메모리 가격 반등/ }).click();
  const inspector = page.getByTestId('evidence-inspector');
  await expect(inspector).toBeVisible();
  const after = await panel.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((after?.width ?? 0) - (before?.width ?? 0))).toBeLessThanOrEqual(1);
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'drawer');
  const placement = await inspector.evaluate((element) => ({
    position: getComputedStyle(element).position,
    zIndex: Number(getComputedStyle(element).zIndex),
  }));
  expect(placement.position).toBe('fixed');
  expect(placement.zIndex).toBeGreaterThan(30);
});
```

- [ ] **Step 2: Update the static contract so it fails on the current in-flow implementation**

Change `workspace-overlay-integration-contract.test.ts` to require:

```ts
assert.match(inspector, /portalled/);
assert.match(inspector, /data-inspector-presentation/);
assert.match(inspector, /<Dialog\s+modal\s/);
assert.match(inspector, /\bshowOverlay\s/);
assert.doesNotMatch(shellCss, /shell:has\(> \[data-testid='evidence-inspector'\]\)/);
```

Also load `shellCssUrl` in that test case. Remove the obsolete assertions requiring `portalled={modal}` and `showOverlay={modal}`.

- [ ] **Step 3: Run both focused tests and verify RED**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/workspace-overlay-integration-contract.test.ts
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:6100 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/today-preview-experience.spec.ts --project=desktop --workers=1 --grep "without changing card geometry"
```

Expected: static contract fails on `portalled={modal}` or `.shell:has(...)`; Playwright reports the panel width changes when the 400px column appears.

- [ ] **Step 4: Portal the desktop inspector and remove the shell grid column**

In `EvidenceInspector`, derive modal truth and always portal:

```tsx
const [desktopPresentation, setDesktopPresentation] = useState<'drawer' | 'modal'>('drawer');
const modalPresentation = modal || desktopPresentation === 'modal';

<Dialog modal open={open} onOpenChange={...}>
  <DialogContent
    data-inspector-presentation={modal ? 'mobile' : desktopPresentation}
    portalled
    presentation={modalPresentation ? 'modal' : 'inspector'}
    showOverlay
    {...existingProps}
  >
```

In `dialog.module.css`, make a portalled inspector a full-height right drawer on desktop:

```css
.content[data-presentation='inspector'][data-portalled='true'] {
  position: fixed;
  z-index: 81;
  top: 0;
  right: 0;
  bottom: auto;
  left: auto;
  width: min(var(--evidence-inspector-width, 520px), calc(100vw - 24px));
  height: 100dvh;
  max-height: 100dvh;
  border-width: 0 0 0 1px;
  border-radius: 0;
  translate: none;
}
```

Move the current portalled inspector bottom-sheet rules into `@media (max-width: 767px)` and preserve `width: 100%`, bottom placement, rounded top corners, and no left border.

Delete both `.shell:has(> [data-testid='evidence-inspector'])` selectors from `workspace-shell.module.css` so the shell always has two grid columns on desktop and `display: block` only depends on `.shell` on mobile.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run the two commands from Step 3.

Expected: the static contract passes and Today panel x/width differ by at most 1px after the drawer opens.

- [ ] **Step 6: Check the scoped diff without committing**

Run:

```bash
git diff --check -- apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx apps/web/src/shared/ui/dialog/dialog.module.css apps/web/src/widgets/workspace-shell/ui/workspace-shell.module.css apps/web/test/workspace-overlay-integration-contract.test.ts e2e/today-preview-experience.spec.ts
```

Expected: no whitespace error and no unrelated shell behavior change.

---

### Task 3: Add accessible resizing and session persistence

**Files:**

- Modify: `apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/relation-detail.module.css`
- Modify: `e2e/today-preview-experience.spec.ts`

**Interfaces:**

- Consumes: all width constants, clamp, parser, and storage key from Task 1.
- Produces: `role="separator"` named `근거 인스펙터 너비 조절` with current/min/max ARIA values.
- Produces: CSS custom property `--evidence-inspector-width` on drawer content.

- [ ] **Step 1: Add failing keyboard and persistence coverage**

```ts
test('resizes the evidence drawer accessibly and remembers the width for the session', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop resize contract');
  const headline = page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ });
  await headline.click();
  const inspector = page.getByTestId('evidence-inspector');
  const separator = page.getByRole('separator', { name: '근거 인스펙터 너비 조절' });
  await expect(separator).toHaveAttribute('aria-valuenow', '520');
  await separator.press('ArrowLeft');
  await expect(separator).toHaveAttribute('aria-valuenow', '536');
  expect((await inspector.boundingBox())?.width).toBeCloseTo(536, 0);
  await inspector.getByRole('button', { name: '인스펙터 닫기' }).click();
  await headline.click();
  await expect(page.getByRole('separator', { name: '근거 인스펙터 너비 조절' })).toHaveAttribute(
    'aria-valuenow',
    '536',
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem('stock-insight:evidence-inspector-width')),
  ).toBe('536');
});
```

- [ ] **Step 2: Run the test and verify the separator is missing**

Run:

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:6100 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/today-preview-experience.spec.ts --project=desktop --workers=1 --grep "remembers the width"
```

Expected: FAIL because no resize separator exists.

Also add a pointer-drag test so mouse resizing cannot regress behind the keyboard contract:

```ts
test('resizes the evidence drawer from its left edge with pointer input', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop resize contract');
  await page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ })
    .click();
  const separator = page.getByRole('separator', { name: '근거 인스펙터 너비 조절' });
  const handle = await separator.boundingBox();
  expect(handle).not.toBeNull();
  const startWidth = Number(await separator.getAttribute('aria-valuenow'));
  await page.mouse.move((handle?.x ?? 0) + 6, (handle?.y ?? 0) + 120);
  await page.mouse.down();
  await page.mouse.move((handle?.x ?? 0) - 42, (handle?.y ?? 0) + 120);
  await page.mouse.up();
  await expect
    .poll(async () => Number(await separator.getAttribute('aria-valuenow')))
    .toBeGreaterThan(startWidth);
});
```

- [ ] **Step 3: Implement width restore, viewport clamp, pointer capture, and keyboard resizing**

Use `useState`, `useEffect`, `useRef`, `CSSProperties`, and `PointerEvent as ReactPointerEvent`. Restore storage only on the client and fail safely:

```tsx
const [drawerWidth, setDrawerWidth] = useState(evidenceInspectorDefaultWidth);
const resizeRef = useRef<{ pointerId: number; startWidth: number; startX: number }>();

useEffect(() => {
  try {
    setDrawerWidth(
      parseStoredEvidenceInspectorWidth(
        window.sessionStorage.getItem(evidenceInspectorWidthStorageKey),
        window.innerWidth,
      ),
    );
  } catch {
    setDrawerWidth(evidenceInspectorDefaultWidth);
  }
}, []);

const commitDrawerWidth = (nextWidth: number) => {
  const clamped = clampEvidenceInspectorWidth(nextWidth, window.innerWidth);
  setDrawerWidth(clamped);
  try {
    window.sessionStorage.setItem(evidenceInspectorWidthStorageKey, String(clamped));
  } catch {
    // The in-memory width remains usable in restricted browser contexts.
  }
};
```

Render the separator only for desktop drawer mode. Because the handle is on the left edge, subtract pointer delta:

```tsx
<div
  aria-label="근거 인스펙터 너비 조절"
  aria-orientation="vertical"
  aria-valuemax={evidenceInspectorMaxWidth}
  aria-valuemin={evidenceInspectorMinWidth}
  aria-valuenow={drawerWidth}
  className={styles.inspectorResizer}
  role="separator"
  tabIndex={0}
  onKeyDown={(event) => {
    if (event.key === 'ArrowLeft') commitDrawerWidth(drawerWidth + 16);
    if (event.key === 'ArrowRight') commitDrawerWidth(drawerWidth - 16);
  }}
  onPointerDown={(event) => {
    resizeRef.current = {
      pointerId: event.pointerId,
      startWidth: drawerWidth,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }}
  onPointerMove={(event) => {
    const drag = resizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    commitDrawerWidth(drag.startWidth - (event.clientX - drag.startX));
  }}
  onPointerUp={(event) => {
    resizeRef.current = undefined;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }}
/>
```

Apply the CSS variable to `DialogContent`:

```tsx
style={{ '--evidence-inspector-width': `${drawerWidth}px` } as CSSProperties}
```

Add a `resize` listener that re-clamps the current width when the viewport changes.

- [ ] **Step 4: Add the 12px hit target and restrained visual affordance**

```css
.inspectorResizer {
  position: absolute;
  z-index: 2;
  top: 0;
  left: -6px;
  width: 12px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
}

.inspectorResizer::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 5px;
  width: 1px;
  background: var(--color-border-strong);
  transition: background-color var(--duration-fast) var(--ease-out);
}

.inspectorResizer:is(:hover, :focus-visible)::after,
.inspector[data-resizing='true'] .inspectorResizer::after {
  background: var(--color-focus);
}
```

Set `user-select: none` only while resizing. Hide the separator at 767px and below.

- [ ] **Step 5: Run the focused test, width-model test, and typecheck**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/evidence-inspector-layout.test.ts
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:6100 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/today-preview-experience.spec.ts --project=desktop --workers=1 --grep "remembers the width"
pnpm --filter @stock-insight/web typecheck
```

Expected: model and browser tests pass; TypeScript reports no error.

- [ ] **Step 6: Check the scoped diff without committing**

Run `git diff --check` for the three files and confirm `.env` is not staged.

---

### Task 4: Toggle the same detail into a centered wide modal

**Files:**

- Modify: `apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/relation-detail.module.css`
- Modify: `e2e/today-preview-experience.spec.ts`

**Interfaces:**

- Consumes: `desktopPresentation: 'drawer' | 'modal'` from Task 2.
- Produces: header buttons named `넓은 모달로 보기` and `우측 드로어로 보기`.
- Preserves: one mounted detail tree and zero extra research-record requests during presentation changes.

- [ ] **Step 1: Add a failing presentation-toggle test**

```ts
test('toggles the same evidence detail between drawer and centered modal', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop presentation contract');
  const detailRequests: string[] = [];
  page.on('request', (request) => {
    if (/research-record|entity-relations/.test(request.url())) detailRequests.push(request.url());
  });
  await page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ })
    .click();
  const inspector = page.getByTestId('evidence-inspector');
  const title = inspector.getByRole('heading', { level: 2 });
  const expectedTitle = await title.textContent();
  const requestCountBeforeToggle = detailRequests.length;
  await inspector.getByRole('button', { name: '넓은 모달로 보기' }).click();
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'modal');
  await expect(page.locator('[data-slot="dialog-overlay"]')).toBeVisible();
  const modalBox = await inspector.boundingBox();
  expect(modalBox?.width ?? 0).toBeGreaterThanOrEqual(760);
  expect(modalBox?.width ?? Infinity).toBeLessThanOrEqual(960);
  await expect(title).toHaveText(expectedTitle ?? '');
  expect(detailRequests).toHaveLength(requestCountBeforeToggle);
  await expect(page.getByRole('separator', { name: '근거 인스펙터 너비 조절' })).toHaveCount(0);
  await inspector.getByRole('button', { name: '우측 드로어로 보기' }).click();
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'drawer');
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the test and verify the toggle is missing**

Run the Today preview Playwright file with desktop project and grep `toggles the same evidence detail`.

Expected: FAIL because the header toggle button does not exist.

- [ ] **Step 3: Add the header toggle and reset every new record to drawer mode**

Import `Maximize2` and `PanelRight` from `lucide-react` and the shared `IconButton`. In the header, render one toggle only on desktop:

```tsx
{
  !modal && (
    <IconButton
      aria-label={desktopPresentation === 'drawer' ? '넓은 모달로 보기' : '우측 드로어로 보기'}
      className={styles.inspectorPresentationToggle}
      motion="quiet"
      onClick={() =>
        setDesktopPresentation((current) => (current === 'drawer' ? 'modal' : 'drawer'))
      }
    >
      {desktopPresentation === 'drawer' ? (
        <Maximize2 aria-hidden="true" />
      ) : (
        <PanelRight aria-hidden="true" />
      )}
    </IconButton>
  );
}
```

Reset only when open state or the selected record changes:

```tsx
useEffect(() => {
  if (open) setDesktopPresentation('drawer');
}, [detail?.recordKey, open]);
```

Do not include `desktopPresentation` in this effect and do not call the record loader from the toggle.

- [ ] **Step 4: Add centered modal sizing and header control placement**

```css
.inspector[data-inspector-presentation='modal'] {
  --dialog-width: clamp(760px, 72vw, 960px);
}

.inspectorPresentationToggle {
  position: absolute;
  top: 17px;
  right: 60px;
  width: 32px;
  height: 32px;
}
```

At 767px and below, hide the presentation toggle. Keep the existing close button at the far right and preserve a clear 8px gap.

- [ ] **Step 5: Run the toggle test and inspector integration tests**

Run:

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:6100 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/today-preview-experience.spec.ts --project=desktop --workers=1 --grep "toggles the same evidence detail"
pnpm --filter @stock-insight/web exec node --test test/workspace-overlay-integration-contract.test.ts test/evidence-inspector-layout.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 6: Check the scoped diff without committing**

Run `git diff --check` for `evidence-inspector.tsx`, `relation-detail.module.css`, and the Today preview spec.

---

### Task 5: Preserve mobile, reduced motion, and the complete Today experience

**Files:**

- Modify: `e2e/today-preview-experience.spec.ts`
- Verify: all files from Tasks 1–4.

**Interfaces:**

- Consumes: completed drawer, resize, and modal behavior.
- Produces: cross-viewport completion evidence.

- [ ] **Step 1: Add mobile and reduced-motion regression assertions**

```ts
test('keeps mobile evidence detail as the existing bottom modal', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile contract');
  await page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ })
    .click();
  const inspector = page.getByTestId('evidence-inspector');
  await expect(inspector).toHaveAttribute('data-inspector-presentation', 'mobile');
  await expect(page.locator('[data-slot="dialog-overlay"]')).toBeVisible();
  await expect(page.getByTestId('workspace-content')).toHaveAttribute('inert', '');
  await expect(page.getByRole('separator', { name: '근거 인스펙터 너비 조절' })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: '넓은 모달로 보기' })).toHaveCount(0);
});

test('settles the evidence drawer without transform motion when reduced motion is requested', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop reduced-motion contract');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page
    .getByTestId('today-headline-news')
    .getByRole('button', { name: /메모리 가격 반등/ })
    .click();
  const inspector = page.getByTestId('evidence-inspector');
  await expect(inspector).toBeVisible();
  await expect
    .poll(() => inspector.evaluate((element) => getComputedStyle(element).transform))
    .toBe('none');
});
```

- [ ] **Step 2: Run the complete Today preview spec on desktop and mobile**

Run:

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:6100 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/today-preview-experience.spec.ts --project=desktop --project=mobile --workers=1
```

Expected: all Today preview tests pass on applicable projects; project-specific tests skip only their opposite viewport.

- [ ] **Step 3: Run related authenticated/static workspace regressions**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/evidence-inspector-layout.test.ts test/workspace-overlay-integration-contract.test.ts test/workspace-shell-current-contract.test.ts test/research-workspace-v3-structure.test.ts
```

Expected: all related Node tests pass. If authenticated Playwright credentials are available, also run the `opens run-bound evidence detail` test in `e2e/research-workspace-v3.spec.ts` for desktop and mobile; otherwise record that environment gap without using the live database.

- [ ] **Step 4: Inspect the real rendered preview at 1440px, the current 938px window, and 390px**

Verify visually:

- opening the drawer does not move or resize cards;
- the 520px drawer has readable three-column metadata;
- the resize handle is discoverable but visually quiet;
- the centered modal is centered, 760–960px wide, and uses a dim overlay;
- returning to drawer restores the prior width;
- the 390px bottom modal has no desktop-only controls;
- no horizontal overflow or purple initial canvas flash appears.

- [ ] **Step 5: Run the full release gate**

Run:

```bash
pnpm verify:release
```

Expected: format, lint, typecheck, tests, and build all exit 0. Existing non-blocking lint warnings must be reported separately from errors.

- [ ] **Step 6: Refresh the graph and inspect final repository state**

Run:

```bash
graphify update .
git diff --check
git status --short
```

Expected: graph refresh exits 0, no whitespace error exists, `.env` is not staged, and only the previously approved Today work plus this inspector implementation remains uncommitted.
