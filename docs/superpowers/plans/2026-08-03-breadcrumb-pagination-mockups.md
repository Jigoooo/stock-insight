# Breadcrumb + Pagination Mockups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build interactive A/B/C Breadcrumb and Pagination comparison mockups in the authenticated-free UI Lab without promoting them to `shared/ui` or changing product cursor APIs.

**Architecture:** Add one UI Lab catalog composed from focused Breadcrumb and Pagination mockup renderers. The UI Lab route owns validated preview search state (`breadcrumb`, `page`) so every link has a real URL, while cursor loading remains local fixture state. Visual state stays in UI Lab CSS until the user approves variants; Motion is limited to the B pagination selection indicator and short cursor status transitions.

**Tech Stack:** React 19, TanStack Router Link/search validation, Motion 12 through `motion/react`, CSS Modules, Node test runner, Playwright, Axe.

## Global Constraints

- Implement only the 3C comparison mockups; do not create `shared/ui/breadcrumb` or `shared/ui/pagination` yet.
- Preserve the existing `route-tab` and `side-route` query values whenever Breadcrumb or Pagination links update `breadcrumb` or `page`.
- Breadcrumb variants are `hairline`, `soft-inset`, and `ledger`.
- Pagination visual variants are `hairline`, `soft-inset`, and `ledger`; its future data modes remain `pages`, `compact`, and `cursor`.
- Do not invent numeric pages for cursor data.
- Links use real `href` values through TanStack `Link` and preserve modified-click behavior.
- The current item uses `aria-current="page"`; disabled pagination actions do not navigate.
- Interactive targets are at least 44px high at 390px.
- Reduced motion removes layout/transform interpolation while keeping essential color and opacity feedback.
- No provider, dependency, product loader, authentication, cursor API, or product information architecture changes.
- Browser review uses the existing Codex in-app browser tab only.

---

## File Structure

- Create `apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx`: 3C section composition, variant metadata, fixture coordination, and public UI Lab types.
- Create `apps/web/src/pages/ui-lab/ui/breadcrumb-mockup.tsx`: semantic Breadcrumb A/B/C renderers and collapsed-path representation.
- Create `apps/web/src/pages/ui-lab/ui/pagination-mockup.tsx`: numeric, compact, and cursor preview behavior plus Motion indicator.
- Create `apps/web/src/pages/ui-lab/ui/location-navigation-catalog.module.css`: catalog layout and mockup-only visual states.
- Modify `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx`: mount the 3C catalog and pass validated preview state.
- Modify `apps/web/src/routes/[__ui-lab].tsx`: validate `breadcrumb` and `page`, preserve existing query contracts, and pass the values to `UiLabPage`.
- Create `apps/web/test/location-navigation-catalog.test.ts`: source/semantic/motion boundary contracts.
- Create `e2e/ui-lab-location-navigation.spec.ts`: desktop/mobile interaction, accessibility, reduced-motion, and overflow coverage.
- Modify `docs/superpowers/UI-SYSTEM-ROLLOUT.md`: record mockup availability and browser/test evidence after implementation.

---

### Task 1: UI Lab route and catalog shell

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx`
- Modify: `apps/web/src/routes/[__ui-lab].tsx`
- Create: `apps/web/test/location-navigation-catalog.test.ts`

**Interfaces:**

- Produces: `BreadcrumbPreviewId = 'workspace' | 'stocks' | 'nvda' | 'evidence'`.
- Produces: `LocationNavigationCatalogProps` with `initialBreadcrumb`, `initialPage`, `initialRouteTab`, and `initialSideRoute`.
- Consumes: existing `RouteTabId` and `SideRouteId` UI Lab query types.

- [ ] **Step 1: Write the failing catalog wiring test**

```ts
describe('UI Lab location navigation catalog', () => {
  it('validates and passes location navigation preview state', async () => {
    const route = await readFile(new URL('../src/routes/[__ui-lab].tsx', import.meta.url), 'utf8');
    const page = await readUiLabSource('ui-lab-page.tsx');

    assert.match(
      route,
      /const breadcrumbPreviews = \['workspace', 'stocks', 'nvda', 'evidence'\] as const/,
    );
    assert.match(
      route,
      /breadcrumb: isBreadcrumbPreview\(search\.breadcrumb\) \? search\.breadcrumb : 'evidence'/,
    );
    assert.match(route, /page: isPageNumber\(search\.page\) \? search\.page : 3/);
    assert.match(page, /<LocationNavigationCatalog/);
    assert.match(page, /initialBreadcrumb=\{initialBreadcrumb\}/);
    assert.match(page, /initialPage=\{initialPage\}/);
  });
});
```

- [ ] **Step 2: Run the test and confirm red**

Run: `cd apps/web && node --test test/location-navigation-catalog.test.ts`

Expected: FAIL because the test and catalog/query contracts do not exist yet.

- [ ] **Step 3: Add bounded query validators**

```ts
const breadcrumbPreviews = ['workspace', 'stocks', 'nvda', 'evidence'] as const;

function isBreadcrumbPreview(value: unknown): value is BreadcrumbPreviewId {
  return typeof value === 'string' && breadcrumbPreviews.some((breadcrumb) => breadcrumb === value);
}

function isPageNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12;
}
```

Extend `validateSearch` without removing `route-tab` or `side-route`:

```ts
breadcrumb: isBreadcrumbPreview(search.breadcrumb) ? search.breadcrumb : 'evidence',
page: isPageNumber(search.page) ? search.page : 3,
```

- [ ] **Step 4: Create the catalog shell and page wiring**

```ts
export type BreadcrumbPreviewId = 'workspace' | 'stocks' | 'nvda' | 'evidence';

export interface LocationNavigationCatalogProps {
  initialBreadcrumb: BreadcrumbPreviewId;
  initialPage: number;
  initialRouteTab: RouteTabId;
  initialSideRoute: SideRouteId;
}

export function LocationNavigationCatalog(props: LocationNavigationCatalogProps) {
  return (
    <section aria-labelledby="location-navigation-title" data-catalog="location-navigation">
      <h2 id="location-navigation-title">Breadcrumb · Pagination</h2>
    </section>
  );
}
```

- [ ] **Step 5: Run the targeted test and typecheck**

Run: `cd apps/web && node --test test/location-navigation-catalog.test.ts`

Expected: PASS.

Run: `pnpm --filter @stock-insight/web typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx 'apps/web/src/routes/[__ui-lab].tsx' apps/web/test/location-navigation-catalog.test.ts
git commit -m "feat(ui-lab): 3C 위치 탐색 카탈로그 연결"
```

---

### Task 2: Breadcrumb A/B/C mockups

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/breadcrumb-mockup.tsx`
- Create: `apps/web/src/pages/ui-lab/ui/location-navigation-catalog.module.css`
- Modify: `apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx`
- Modify: `apps/web/test/location-navigation-catalog.test.ts`

**Interfaces:**

- Consumes: `BreadcrumbPreviewId` and all four UI Lab query values.
- Produces: `BreadcrumbMockupProps` with `active`, `variant`, and `searchContext`.
- Produces: `BreadcrumbVariant = 'hairline' | 'soft-inset' | 'ledger'`.

- [ ] **Step 1: Add failing Breadcrumb semantic tests**

```ts
it('renders three Breadcrumb directions with real links and one current page', async () => {
  const source = await readUiLabSource('breadcrumb-mockup.tsx');
  const catalog = await readUiLabSource('location-navigation-catalog.tsx');

  for (const variant of ['hairline', 'soft-inset', 'ledger']) {
    assert.match(catalog, new RegExp(`id: '${variant}'`));
  }

  assert.match(source, /<nav[^>]*aria-label=\{`현재 위치 · \$\{title\}`\}/);
  assert.match(source, /<ol/);
  assert.match(source, /<Link[\s\S]*to="\/__ui-lab"/);
  assert.match(source, /aria-current="page"/);
  assert.match(source, /중간 경로 1개 생략/);
  assert.doesNotMatch(source, /href="#"/);
});
```

- [ ] **Step 2: Run and confirm red**

Run: `cd apps/web && node --test test/location-navigation-catalog.test.ts`

Expected: FAIL because `breadcrumb-mockup.tsx` and variant rendering do not exist.

- [ ] **Step 3: Implement the semantic path model**

```ts
const breadcrumbItems = [
  { id: 'workspace', label: '워크스페이스' },
  { id: 'stocks', label: '종목' },
  { id: 'nvda', label: 'NVDA' },
  { id: 'evidence', label: '근거 기록' },
] as const;

export type BreadcrumbVariant = 'hairline' | 'soft-inset' | 'ledger';
```

Each non-current item renders a TanStack `Link` with:

```tsx
<Link
  search={{
    'route-tab': searchContext.routeTab,
    'side-route': searchContext.sideRoute,
    breadcrumb: item.id,
    page: searchContext.page,
  }}
  to="/__ui-lab"
>
  {item.label}
</Link>
```

The current item renders a non-link element with `aria-current="page"`. Ledger renders an accessible collapsed item with visible ellipsis and `<span className="sr-only">중간 경로 1개 생략</span>`.

- [ ] **Step 4: Add the three visual recipes**

Implement CSS selectors under `[data-breadcrumb-variant]`:

```css
.breadcrumbLink:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

[data-breadcrumb-variant='soft-inset'] .breadcrumbCurrent {
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 58%, transparent);
}

[data-breadcrumb-variant='ledger'] .breadcrumbCurrent {
  box-shadow: inset 0 -1px 0 var(--foreground);
}
```

Do not add scale or translate effects to Breadcrumb items.

- [ ] **Step 5: Run targeted test, typecheck, and formatter**

Run: `cd apps/web && node --test test/location-navigation-catalog.test.ts`

Expected: PASS.

Run: `pnpm --filter @stock-insight/web typecheck`

Expected: exit 0.

Run: `pnpm exec oxfmt --check apps/web/src/pages/ui-lab/ui/breadcrumb-mockup.tsx apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx apps/web/src/pages/ui-lab/ui/location-navigation-catalog.module.css apps/web/test/location-navigation-catalog.test.ts`

Expected: all files formatted.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/web/src/pages/ui-lab/ui/breadcrumb-mockup.tsx apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx apps/web/src/pages/ui-lab/ui/location-navigation-catalog.module.css apps/web/test/location-navigation-catalog.test.ts
git commit -m "feat(ui-lab): Breadcrumb 3안 비교 추가"
```

---

### Task 3: Pagination A/B/C and cursor state mockups

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/pagination-mockup.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/location-navigation-catalog.module.css`
- Modify: `apps/web/test/location-navigation-catalog.test.ts`

**Interfaces:**

- Consumes: current page `1..12` and all four UI Lab search values.
- Produces: `PaginationVariant = 'hairline' | 'soft-inset' | 'ledger'`.
- Produces: local `CursorPreviewState = 'idle' | 'loading' | 'complete'` for the C fixture only.

- [ ] **Step 1: Add failing Pagination behavior tests**

```ts
it('separates numeric page links from the cursor preview', async () => {
  const source = await readUiLabSource('pagination-mockup.tsx');

  assert.match(source, /type PaginationVariant = 'hairline' \| 'soft-inset' \| 'ledger'/);
  assert.match(source, /aria-label=\{`페이지 탐색 · \$\{title\}`\}/);
  assert.match(source, /aria-current=\{page === currentPage \? 'page' : undefined\}/);
  assert.match(source, /layoutId="pagination-soft-inset-indicator"/);
  assert.match(source, /useReducedMotion\(\)/);
  assert.match(source, /type CursorPreviewState = 'idle' \| 'loading' \| 'complete'/);
  assert.match(source, /불러오는 중/);
  assert.match(source, /마지막 기록/);
  assert.doesNotMatch(source, /cursor.*12|12.*cursor/);
});
```

- [ ] **Step 2: Run and confirm red**

Run: `cd apps/web && node --test test/location-navigation-catalog.test.ts`

Expected: FAIL because `pagination-mockup.tsx` does not exist.

- [ ] **Step 3: Implement page-window and link search helpers**

```ts
const totalPages = 12;

function pageWindow(currentPage: number) {
  if (currentPage <= 3) return [1, 2, 3, 4, 'ellipsis', totalPages] as const;
  if (currentPage >= totalPages - 2)
    return [1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
  return [
    1,
    'ellipsis',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'ellipsis-end',
    totalPages,
  ] as const;
}
```

Every numeric/previous/next link preserves `route-tab`, `side-route`, and `breadcrumb`. Boundary actions render `aria-disabled="true"`, omit navigation, and remain focus-order safe.

- [ ] **Step 4: Implement A/B/C renderers and Motion ownership**

For B, render the indicator inside only the current link:

```tsx
{
  variant === 'soft-inset' && page === currentPage ? (
    <motion.span
      aria-hidden="true"
      className={styles.paginationIndicator}
      layoutId="pagination-soft-inset-indicator"
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 32 }}
    />
  ) : null;
}
```

For C, render compact status separately from cursor state. `03 / 12` belongs only to numeric fixture state. Cursor status never displays a total page count.

- [ ] **Step 5: Implement cursor loading transition**

```ts
type CursorPreviewState = 'idle' | 'loading' | 'complete';

async function loadCursorPreview() {
  if (cursorState !== 'idle') return;
  setCursorState('loading');
  await new Promise((resolve) => window.setTimeout(resolve, 650));
  setCursorState('complete');
}
```

The pending button is disabled, keeps `cursor: default`, and shows the existing small spinner recipe plus `불러오는 중`. Completion uses `마지막 기록` and no fabricated page number.

- [ ] **Step 6: Add responsive and reduced-motion CSS**

```css
@media (max-width: 520px) {
  .breadcrumbLink,
  .paginationLink,
  .paginationAction,
  .cursorAction {
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .paginationIndicator,
  .cursorStatus {
    transition-duration: 0.01ms;
  }
}
```

At 390px the numeric list scrolls internally if needed; the page itself must not gain horizontal overflow.

- [ ] **Step 7: Run targeted verification**

Run: `cd apps/web && node --test test/location-navigation-catalog.test.ts`

Expected: PASS.

Run: `pnpm --filter @stock-insight/web typecheck`

Expected: exit 0.

Run: `pnpm exec oxlint apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx apps/web/src/pages/ui-lab/ui/breadcrumb-mockup.tsx apps/web/src/pages/ui-lab/ui/pagination-mockup.tsx apps/web/test/location-navigation-catalog.test.ts`

Expected: 0 warnings/errors.

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/web/src/pages/ui-lab/ui/pagination-mockup.tsx apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx apps/web/src/pages/ui-lab/ui/location-navigation-catalog.module.css apps/web/test/location-navigation-catalog.test.ts
git commit -m "feat(ui-lab): Pagination 3안과 cursor 상태 추가"
```

---

### Task 4: Desktop/mobile browser contracts

**Files:**

- Create: `e2e/ui-lab-location-navigation.spec.ts`
- Modify only if a browser failure identifies a product bug: files owned by Tasks 1-3.

**Interfaces:**

- Consumes: `data-catalog="location-navigation"`, `data-breadcrumb-variant`, and `data-pagination-variant` selectors.
- Verifies: real URL state, semantics, Motion boundary, cursor status, mobile targets, overflow, Axe.

- [ ] **Step 1: Write the Playwright cases**

```ts
test.describe('UI Lab location navigation', () => {
  test('keeps three Breadcrumb variants on one authoritative preview path', async ({ page }) => {
    await page.goto('/__ui-lab?route-tab=evidence&side-route=today&breadcrumb=evidence&page=3');
    await page
      .locator('[data-breadcrumb-variant="hairline"]')
      .getByRole('link', { name: 'NVDA' })
      .click();
    await expect(page).toHaveURL(/breadcrumb=nvda/);
    await expect(page.locator('[data-breadcrumb-variant] [aria-current="page"]')).toHaveCount(3);
  });

  test('moves numeric pages and respects boundaries', async ({ page }) => {
    await page.goto('/__ui-lab?route-tab=evidence&side-route=today&breadcrumb=evidence&page=3');
    await page
      .locator('[data-pagination-variant="hairline"]')
      .getByRole('link', { name: '4페이지' })
      .click();
    await expect(page).toHaveURL(/page=4/);
  });

  test('shows cursor loading without fabricating a total', async ({ page }) => {
    const cursor = page.locator('[data-cursor-preview]');
    await cursor.getByRole('button', { name: '다음 기록' }).click();
    await expect(cursor.getByText('불러오는 중')).toBeVisible();
    await expect(cursor.getByText('마지막 기록')).toBeVisible();
    await expect(cursor).not.toContainText('/ 12');
  });
});
```

- [ ] **Step 2: Add mobile target and overflow assertions**

For each interactive Breadcrumb/Pagination element visible at 390px, assert `height >= 44`. Assert `document.documentElement.scrollWidth - document.documentElement.clientWidth === 0`.

- [ ] **Step 3: Add reduced-motion and Axe assertions**

With reduced motion enabled, change from page 3 to 4 and assert the B indicator has no active transform transition. Run `AxeBuilder` on the 3C catalog and expect zero violations.

- [ ] **Step 4: Run the focused browser suite**

Run: `PLAYWRIGHT_PORT=6195 pnpm exec playwright test e2e/ui-lab-location-navigation.spec.ts --project=desktop --project=mobile --workers=1`

Expected: all 3C tests pass in both projects.

- [ ] **Step 5: Fix only demonstrated failures and rerun**

When a failure occurs, first preserve it as an assertion, patch the smallest owner file, then rerun the single failing test followed by the whole 3C spec.

- [ ] **Step 6: Commit Task 4**

```bash
git add e2e/ui-lab-location-navigation.spec.ts apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx apps/web/src/pages/ui-lab/ui/breadcrumb-mockup.tsx apps/web/src/pages/ui-lab/ui/pagination-mockup.tsx apps/web/src/pages/ui-lab/ui/location-navigation-catalog.module.css
git commit -m "test(ui-lab): 3C 위치 탐색 브라우저 계약 추가"
```

---

### Task 5: Codex browser comparison and rollout record

**Files:**

- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`

**Interfaces:**

- Consumes: completed UI Lab mockups and focused verification results.
- Produces: 3C status remains `목업` until the user chooses variants; the next action becomes `A/B/C 사용자 비교·승인`.

- [ ] **Step 1: Open the existing Codex in-app browser tab**

Navigate the existing tab to:

`http://127.0.0.1:6100/__ui-lab?route-tab=evidence&side-route=today&breadcrumb=evidence&page=3`

Do not open an external browser or a component-specific extra tab.

- [ ] **Step 2: Visually verify desktop interaction**

Check all six cards for equal information density, no duplicate surface behind B/C, aligned separators, current-state clarity, B indicator first-render stability, and C cursor loading transition.

- [ ] **Step 3: Verify the 390px layout**

Check that Breadcrumb truncates rather than pushing the page, Pagination remains usable, target sizes are at least 44px, and no page-level horizontal overflow appears.

- [ ] **Step 4: Update the rollout ledger**

Record:

```md
### 2026-08-03 — 3C Breadcrumb + Pagination 목업 비교 준비

- Breadcrumb: A Hairline Trail, B Soft Current, C Compact Ledger
- Pagination: A Hairline Pages, B Soft Inset Track, C Compact Ledger
- Pagination mode boundary: pages, compact, cursor; no fabricated cursor page totals
- UI Lab and focused desktop/mobile browser verification complete
- Status remains `목업`; next action is user A/B/C comparison and approval
```

- [ ] **Step 5: Run the final focused gates**

Run: `pnpm --filter @stock-insight/web typecheck`

Run: `cd apps/web && node --test test/location-navigation-catalog.test.ts test/navigation-tabs-catalog.test.ts`

Run: `pnpm exec oxlint apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx apps/web/src/pages/ui-lab/ui/breadcrumb-mockup.tsx apps/web/src/pages/ui-lab/ui/pagination-mockup.tsx apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx 'apps/web/src/routes/[__ui-lab].tsx' apps/web/test/location-navigation-catalog.test.ts e2e/ui-lab-location-navigation.spec.ts`

Run: `pnpm exec oxfmt --check apps/web/src/pages/ui-lab/ui/location-navigation-catalog.tsx apps/web/src/pages/ui-lab/ui/breadcrumb-mockup.tsx apps/web/src/pages/ui-lab/ui/pagination-mockup.tsx apps/web/src/pages/ui-lab/ui/location-navigation-catalog.module.css apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx 'apps/web/src/routes/[__ui-lab].tsx' apps/web/test/location-navigation-catalog.test.ts e2e/ui-lab-location-navigation.spec.ts docs/superpowers/UI-SYSTEM-ROLLOUT.md`

Run: `git diff --check`

Run: `graphify update .`

Expected: every command exits 0; Graphify may print existing package/skill version warnings but must complete the code graph update.

- [ ] **Step 6: Commit Task 5**

```bash
git add docs/superpowers/UI-SYSTEM-ROLLOUT.md
git commit -m "docs(ui): 3C 위치 탐색 목업 검증 기록"
```

The branch stays unmerged until the user compares and approves Breadcrumb and Pagination variants in the Codex browser.
