# Menu & Overlay Mockups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the active UI Lab catalog with a lightweight A/B/C comparison for DropdownMenu, ContextMenu, Popover, Drawer, Sheet, and BottomSheet while reducing the planned roadmap cards from six to four.

**Architecture:** Keep every unapproved variant page-owned under `pages/ui-lab`. Use the installed `radix-ui` DropdownMenu, ContextMenu, and Popover primitives directly, and reuse the existing shared Sheet runtime for left drawer, right sheet, and bottom sheet presentations. All variants share one local research-action list and one local execution result; no route or product data changes.

**Tech Stack:** React 19, TypeScript, CSS Modules, `radix-ui`, existing `shared/ui` Button and Sheet, Motion boundary already owned by Sheet, Node test runner, Playwright, Axe.

## Global Constraints

- Keep the catalog at `http://127.0.0.1:6110/__ui-lab` in the existing `목업 진행 중` tab.
- Reduce the UI Lab planned cards from six to exactly four: Menu & Overlay, Identity & Content, Data & Feedback, Charts End-to-End.
- Move the completed Stepper and CommandPalette catalog to the `완료` tab.
- Compare one shared design language across all six surfaces: `hairline`, `soft-surface`, and `compact-ledger`.
- DropdownMenu and ContextMenu consume the same research-action array.
- Menu scope is limited to normal actions, icons, shortcuts, separators, and disabled state.
- Do not add menu checkbox items, radio items, submenus, packages, or an overlay provider.
- Keep URL and product data unchanged; actions update only an `aria-live` UI Lab result.
- Preserve Escape/outside-click dismissal, focus return, 390px no-overflow, 44px touch targets, and `prefers-reduced-motion`.
- Mock verification is intentionally narrow: two Node source-contract tests, two Playwright tests, web typecheck, changed-file Oxfmt/Oxlint, and `git diff --check`.
- Do not run the full repository test or build gate during this mockup plan.

---

## File Map

- Create `apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.tsx`: owns variant metadata, shared action fixtures, local result state, Radix menu/popover markup, and Sheet presentations.
- Create `apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.module.css`: owns only the unapproved A/B/C catalog visuals and responsive/reduced-motion rules.
- Modify `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx`: moves 3D to completed, installs 4A in progress, and renders four roadmap cards.
- Create `apps/web/test/ui-lab-menu-overlay.test.ts`: two narrow source-contract tests for page wiring and catalog scope.
- Create `e2e/ui-lab-menu-overlay.spec.ts`: two browser tests covering the six surfaces and the mobile/reduced-motion/Axe contract.
- Modify `docs/superpowers/UI-SYSTEM-ROLLOUT.md`: records mock implementation and focused verification without advancing to publicization.

---

### Task 1: Rewire UI Lab status tabs and four roadmap cards

**Files:**

- Modify: `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx`
- Create: `apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.tsx`
- Test: `apps/web/test/ui-lab-menu-overlay.test.ts`

**Interfaces:**

- Consumes: existing `StepperCommandCatalog` and `TabsContent` composition.
- Produces: exported `MenuOverlayCatalog(): ReactElement` catalog shell that Task 2 fills with interactive comparisons; `roadmapBatches` with exactly four entries.

- [ ] **Step 1: Write the failing page-wiring contract**

Create `apps/web/test/ui-lab-menu-overlay.test.ts` with the first test:

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

async function readUiLabSource(path: string) {
  return readFile(new URL(`../src/pages/ui-lab/ui/${path}`, import.meta.url), 'utf8');
}

describe('UI Lab Menu & Overlay catalog', () => {
  it('moves 3D to completed and exposes four consolidated roadmap cards', async () => {
    const page = await readUiLabSource('ui-lab-page.tsx');

    assert.match(page, /<StepperCommandCatalog \/>/);
    assert.match(page, /<MenuOverlayCatalog \/>/);
    assert.match(page, /<h2>Menu & Overlay<\/h2>/);

    for (const title of [
      'Menu & Overlay',
      'Identity & Content',
      'Data & Feedback',
      'Charts End-to-End',
    ]) {
      assert.match(page, new RegExp(`title: '${title}'`));
    }
    assert.equal(page.match(/title: '/g)?.length, 4);
  });
});
```

- [ ] **Step 2: Run the source contract and confirm RED**

Run:

```bash
cd apps/web
node --test test/ui-lab-menu-overlay.test.ts
```

Expected: FAIL because `MenuOverlayCatalog` and the four object-based roadmap entries do not exist.

- [ ] **Step 3: Add the page wiring and minimal catalog boundary**

In `ui-lab-page.tsx`, replace `futureBatches` with:

```ts
const roadmapBatches = [
  { state: '진행 중', title: 'Menu & Overlay' },
  { state: '예정', title: 'Identity & Content' },
  { state: '예정', title: 'Data & Feedback' },
  { state: '예정', title: 'Charts End-to-End' },
] as const;
```

Import `MenuOverlayCatalog`, render `StepperCommandCatalog` after `LocationNavigationCatalog` in the completed content, and replace the in-progress intro/catalog with:

```tsx
<div className={styles.statusIntro}>
  <span>In progress</span>
  <h2>Menu & Overlay</h2>
  <p>메뉴와 연결형·패널형 오버레이를 하나의 A/B/C 디자인 언어로 비교합니다.</p>
</div>
<MenuOverlayCatalog />
```

Render planned cards from `roadmapBatches` and use `batch.state` as the `<small>` text.

Create the initial catalog boundary:

```tsx
import type { ReactElement } from 'react';

export function MenuOverlayCatalog(): ReactElement {
  return (
    <section aria-labelledby="menu-overlay-title" data-slot="menu-overlay-catalog">
      <h2 id="menu-overlay-title">Menu & Overlay</h2>
      <p>메뉴와 패널 오버레이의 세 가지 디자인 언어를 비교합니다.</p>
    </section>
  );
}
```

- [ ] **Step 4: Run the source contract and confirm GREEN**

Run:

```bash
cd apps/web
node --test test/ui-lab-menu-overlay.test.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Commit the status-tab slice**

```bash
git add apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.tsx apps/web/test/ui-lab-menu-overlay.test.ts
git commit -m "feat(ui-lab): 통합 오버레이 묶음으로 전환"
```

---

### Task 2: Build the page-owned A/B/C Menu & Overlay catalog

**Files:**

- Modify: `apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.tsx`
- Create: `apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.module.css`
- Modify: `apps/web/test/ui-lab-menu-overlay.test.ts`

**Interfaces:**

- Consumes: `Button`, `Sheet`, `SheetContent`, `SheetDescription`, `SheetHeader`, `SheetTitle`, `SheetTrigger`; Radix `DropdownMenu`, `ContextMenu`, and `Popover` primitives.
- Produces: `MenuOverlayVariant`, three variant cards, stable `data-slot` hooks, and one `data-slot="menu-overlay-result"` live result.

- [ ] **Step 1: Add the failing catalog-scope contract**

Append this test to `ui-lab-menu-overlay.test.ts`:

```ts
it('keeps all six surfaces page-owned and shares one menu action fixture', async () => {
  const catalog = await readUiLabSource('menu-overlay-catalog.tsx');

  assert.match(
    catalog,
    /export type MenuOverlayVariant = 'hairline' \| 'soft-surface' \| 'compact-ledger'/,
  );
  assert.match(catalog, /const researchActions = \[/);
  assert.equal(catalog.match(/researchActions\.map/g)?.length, 2);

  for (const primitive of ['DropdownMenu', 'ContextMenu', 'Popover']) {
    assert.match(catalog, new RegExp(`${primitive}Primitive`));
  }
  for (const kind of ['drawer', 'sheet', 'bottom-sheet']) {
    assert.match(catalog, new RegExp(`kind: '${kind}'`));
  }

  assert.doesNotMatch(catalog, /CheckboxItem|RadioItem|Sub/);
});
```

- [ ] **Step 2: Run the source contract and confirm RED**

Run:

```bash
cd apps/web
node --test test/ui-lab-menu-overlay.test.ts
```

Expected: the first test passes and the new catalog-scope test fails.

- [ ] **Step 3: Define the shared variants, actions, and panel presentations**

Use these exact public-in-file types and fixtures in `menu-overlay-catalog.tsx`:

```tsx
export type MenuOverlayVariant = 'hairline' | 'soft-surface' | 'compact-ledger';
type ResearchActionId = 'evidence' | 'impact' | 'copy-link' | 'archived';
type PanelKind = 'drawer' | 'sheet' | 'bottom-sheet';

const variants = [
  { id: 'hairline', label: 'A · Hairline', description: '얇은 경계와 최소 표면' },
  { id: 'soft-surface', label: 'B · Soft Surface', description: '낮은 배경과 그룹 면' },
  { id: 'compact-ledger', label: 'C · Compact Ledger', description: '조밀한 행과 보조 정보' },
] as const;

const researchActions = [
  { id: 'evidence', label: '근거 보기', shortcut: 'Enter' },
  { id: 'impact', label: '영향 경로 확인', shortcut: 'I' },
  { id: 'copy-link', label: '링크 복사', shortcut: '⌘ C' },
  { id: 'archived', label: '보관된 항목 열기', shortcut: '', disabled: true },
] as const satisfies ReadonlyArray<{
  id: ResearchActionId;
  label: string;
  shortcut: string;
  disabled?: boolean;
}>;

const panels = [
  { kind: 'drawer', label: 'Drawer', side: 'left' },
  { kind: 'sheet', label: 'Sheet', side: 'right' },
  { kind: 'bottom-sheet', label: 'BottomSheet', side: 'bottom' },
] as const;
```

Use `BookOpen`, `GitBranch`, `Copy`, and `Archive` from `lucide-react` by mapping action IDs to icons. Keep the fixture data immutable and outside the component.

- [ ] **Step 4: Implement the menu, popover, and panel markup**

Import primitives without adding dependencies:

```tsx
import {
  ContextMenu as ContextMenuPrimitive,
  DropdownMenu as DropdownMenuPrimitive,
  Popover as PopoverPrimitive,
} from 'radix-ui';
```

For each variant card:

- Render a DropdownMenu button and map `researchActions` once to `DropdownMenuPrimitive.Item`.
- Render a focusable ContextMenu target and map the same `researchActions` once to `ContextMenuPrimitive.Item`.
- Render a Popover button whose content shows `선택 근거`, `삼성전자`, and `최근 공시와 시장 변화를 같은 기준 시점으로 확인합니다.`
- Render Drawer, Sheet, and BottomSheet buttons by mapping `panels`; use the existing Sheet runtime with each entry's `side`.
- Set `data-variant={variant.id}` on every portalled content surface and `data-overlay-kind={panel.kind}` on Sheet content.
- On enabled action selection, set `lastAction` to `${action.label} 실행됨`; disabled items must not call the setter.
- End the catalog with:

```tsx
<p aria-live="polite" data-slot="menu-overlay-result">
  {lastAction ?? '아직 실행한 메뉴 액션이 없습니다.'}
</p>
```

Use stable accessible names: `DropdownMenu A 열기`, `ContextMenu B 대상`, `Popover C 열기`, `Drawer A 열기`, `Sheet B 열기`, and `BottomSheet C 열기`.

- [ ] **Step 5: Add the three design languages and responsive rules**

In `menu-overlay-catalog.module.css`:

- Use a three-column grid above 1120px and one column below it.
- Give preview triggers and menu rows `min-height: 44px`.
- Style `[data-variant='hairline']` with a 1px border, transparent/solid canvas, and no large shadow.
- Style `[data-variant='soft-surface']` with `var(--color-surface-subtle)`, grouped inset spacing, and `var(--radius-md)`.
- Style `[data-variant='compact-ledger']` with tighter copy, aligned shortcut columns, and horizontal separators.
- Keep portal surfaces inside `max-width: calc(100vw - 24px)` and panel bodies inside `max-height: 100dvh`.
- Add 80–170ms CSS entry/exit motion for Radix menu/popover content only.
- Under `@media (prefers-reduced-motion: reduce)`, set those animation durations to `0.01ms`; Sheet already removes transform animation through `useReducedMotion`.

- [ ] **Step 6: Run source and static checks**

Run:

```bash
cd apps/web
node --test test/ui-lab-menu-overlay.test.ts
cd ../..
pnpm --filter @stock-insight/web typecheck
pnpm exec oxfmt --check apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.tsx apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.module.css apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx apps/web/test/ui-lab-menu-overlay.test.ts
pnpm exec oxlint apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.tsx apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx apps/web/test/ui-lab-menu-overlay.test.ts
git diff --check
```

Expected: 2 Node tests and all static checks pass.

- [ ] **Step 7: Commit the catalog slice**

```bash
git add apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.tsx apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.module.css apps/web/test/ui-lab-menu-overlay.test.ts
git commit -m "feat(ui-lab): 메뉴와 오버레이 통합 목업 추가"
```

---

### Task 3: Add two focused browser contracts and record the mock state

**Files:**

- Create: `e2e/ui-lab-menu-overlay.spec.ts`
- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`

**Interfaces:**

- Consumes: stable accessible names and `data-slot` hooks from Task 2.
- Produces: exactly two Playwright tests and ledger evidence that 4A remains in mock/visual-approval state.

- [ ] **Step 1: Write the focused interaction test**

Create `e2e/ui-lab-menu-overlay.spec.ts` with `openCatalog(page)` matching the established `networkidle` + selected-tab check. The first test must:

```ts
test('opens the six surfaces and keeps menu actions local', async ({ page }) => {
  const catalog = await openCatalog(page);
  const initialUrl = page.url();

  await catalog.getByRole('button', { name: 'DropdownMenu A 열기' }).click();
  await page.getByRole('menuitem', { name: '근거 보기' }).click();
  await expect(catalog.locator('[data-slot="menu-overlay-result"]')).toContainText('근거 보기');

  await catalog.getByRole('button', { name: 'ContextMenu B 대상' }).click({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveAttribute('data-variant', 'soft-surface');
  await page.keyboard.press('Escape');

  await catalog.getByRole('button', { name: 'Popover C 열기' }).click();
  await expect(page.getByText('선택 근거', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  for (const [kind, variant] of [
    ['Drawer A', 'hairline'],
    ['Sheet B', 'soft-surface'],
    ['BottomSheet C', 'compact-ledger'],
  ] as const) {
    await catalog.getByRole('button', { name: `${kind} 열기` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('data-variant', variant);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }

  expect(page.url()).toBe(initialUrl);
});
```

- [ ] **Step 2: Run the interaction test and confirm RED**

Run:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:6110 \
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER \
pnpm exec playwright test e2e/ui-lab-menu-overlay.spec.ts --project=desktop --workers=1 --grep "opens the six surfaces"
```

Expected: FAIL until any missing stable hook, focus behavior, or portal attribute is corrected.

- [ ] **Step 3: Make the smallest catalog/CSS corrections and confirm GREEN**

Change only stable labels, data attributes, or dismissal/focus wiring required by the failing test. Re-run the same command until 1 test passes.

- [ ] **Step 4: Add the combined mobile, reduced-motion, and Axe test**

Append one test that:

- sets `390x844` viewport and `reducedMotion: 'reduce'` before `openCatalog`;
- asserts catalog `scrollWidth <= clientWidth`;
- checks all visible preview triggers have rounded height at least 44px;
- opens BottomSheet C and asserts `[data-slot="sheet-content"]` has computed `transform: none`;
- runs `new AxeBuilder({ page }).include('[data-slot="menu-overlay-catalog"]').analyze()` and expects no violations.

- [ ] **Step 5: Run only the two-test browser file**

Run:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:6110 \
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER \
pnpm exec playwright test e2e/ui-lab-menu-overlay.spec.ts --project=desktop --workers=1
```

Expected: 2 tests pass. Do not expand to existing UI Lab specs during this mock stage.

- [ ] **Step 6: Verify in the existing Codex in-app browser**

At the user's existing URL, select `목업 진행 중` after hydration and confirm:

- A/B/C cards render in both menu and panel sections;
- Dropdown A action updates the local result;
- ContextMenu B opens by right-click and `Shift+F10`;
- Popover C opens and closes;
- Drawer A, Sheet B, and BottomSheet C open from the expected edge and close with Escape;
- the URL does not change.

This is a visual review handoff, not approval. Stop before `shared/ui` promotion.

- [ ] **Step 7: Update the rollout ledger and final narrow checks**

Append a 4A mock implementation entry to `docs/superpowers/UI-SYSTEM-ROLLOUT.md` containing:

- A Hairline, B Soft Surface, C Compact Ledger;
- six surfaces implemented in one catalog;
- planned cards reduced from six to four;
- Node 2 and Playwright 2 results;
- in-app browser evidence;
- next action: user visual approval.

Then run:

```bash
pnpm exec oxfmt --check apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.tsx apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.module.css apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx apps/web/test/ui-lab-menu-overlay.test.ts e2e/ui-lab-menu-overlay.spec.ts docs/superpowers/UI-SYSTEM-ROLLOUT.md
pnpm exec oxlint apps/web/src/pages/ui-lab/ui/menu-overlay-catalog.tsx apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx apps/web/test/ui-lab-menu-overlay.test.ts e2e/ui-lab-menu-overlay.spec.ts
git diff --check
```

- [ ] **Step 8: Commit the browser-contract slice**

```bash
git add e2e/ui-lab-menu-overlay.spec.ts docs/superpowers/UI-SYSTEM-ROLLOUT.md
git commit -m "test(ui-lab): 메뉴 오버레이 목업 검증 고정"
```

Stop with 4A awaiting the user's visual selection. Do not publicize components or audit product adoption in this plan.
