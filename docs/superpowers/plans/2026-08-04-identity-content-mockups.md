# Identity & Content Mockups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a six-tab Identity & Content catalog to UI Lab where every component has its own A/B/C comparison and interactive variants share local selection state, while making the completed Button refresh demo repeatable.

**Architecture:** Keep the mock contract and fixtures in `identity-content-model.ts`, render the catalog shell in `identity-content-catalog.tsx`, and isolate the six preview families in `identity-content-previews.tsx`. Reuse the existing Tabs and Badge boundaries, keep Avatar/List/Carousel local to UI Lab, and leave all shared/public APIs and product routes unchanged until visual approval.

**Tech Stack:** React 19, TypeScript, CSS Modules, existing Animate UI Tabs boundary, existing Badge and Button components, Node test runner, Playwright, Axe.

## Global Constraints

- Show Avatar, Badge, Status, List, Timeline, Carousel as six horizontal tabs in that order.
- Each component owns independent A/B/C visual directions; A/B/C is not a global design language.
- List, Timeline, and Carousel variants share the same selected content item.
- Keep the current UI Lab URL and product data unchanged.
- Use local fixtures only; do not request external avatar images or APIs.
- Preserve 390px horizontal tab scrolling, 44px touch targets, keyboard access, and `prefers-reduced-motion`.
- Remove completed Menu & Overlay from planned cards and leave exactly Identity & Content, Data & Feedback, Charts End-to-End.
- Do not change shared/public APIs or product usages before user visual approval.
- Do not add dependencies, providers, autoplay, or a drag runtime.
- Run only the approved narrow Node, Playwright, typecheck, Oxfmt, Oxlint, and browser checks.
- Replace the permanently pending refresh example with `새로고침 → 불러오는 중 for 900ms → 새로고침 완료`, and restart that cycle on the next click.

---

## File Structure

- Create `apps/web/src/pages/ui-lab/ui/identity-content-model.ts`: tab ids, A/B/C metadata, local identity/content/status fixtures, and adjacent-selection helper.
- Create `apps/web/src/pages/ui-lab/ui/identity-content-catalog.tsx`: controlled horizontal tabs and shared selection ownership.
- Create `apps/web/src/pages/ui-lab/ui/identity-content-previews.tsx`: six focused preview renderers and common variant card wrapper.
- Create `apps/web/src/pages/ui-lab/ui/identity-content-catalog.module.css`: all local visual, responsive, focus, and reduced-motion rules.
- Modify `apps/web/src/pages/ui-lab/ui/menu-overlay-model.ts`: planned-card list becomes the remaining three bundles.
- Modify `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx`: mount the 5A catalog in `목업 진행 중`.
- Modify `apps/web/src/pages/ui-lab/ui/completed-components-catalog.tsx`: own the repeatable refresh state and clear its timer on unmount.
- Modify `apps/web/test/menu-overlay-model.test.ts`: remove the completed four-card roadmap assertion.
- Create `apps/web/test/identity-content-model.test.ts`: model and remaining-roadmap contracts.
- Create `e2e/ui-lab-identity-content.spec.ts`: behavior, mobile, reduced-motion, and Axe contracts.
- Modify `docs/superpowers/UI-SYSTEM-ROLLOUT.md`: record implementation and verification evidence without marking 5A complete before visual approval.

---

### Task 1: Lock the 5A model and remaining roadmap

**Files:**

- Create: `apps/web/test/identity-content-model.test.ts`
- Create: `apps/web/src/pages/ui-lab/ui/identity-content-model.ts`
- Modify: `apps/web/src/pages/ui-lab/ui/menu-overlay-model.ts`
- Modify: `apps/web/test/menu-overlay-model.test.ts`

**Interfaces:**

- Produces: `IdentityContentTabId`, `ContentItemId`, `identityContentTabs`, `identityContentVariants`, `identitySamples`, `statusSamples`, `contentItems`, `getAdjacentContentId`.
- Produces: `roadmapBatches` with three entries: Identity & Content `진행 중`, Data & Feedback `예정`, Charts End-to-End `예정`.
- Consumes: no runtime API or network data.

- [ ] **Step 1: Write the failing model contracts**

```ts
assert.deepEqual(
  identityContentTabs.map((tab) => tab.id),
  ['avatar', 'badge', 'status', 'list', 'timeline', 'carousel'],
);
for (const tab of identityContentTabs) {
  assert.equal(identityContentVariants[tab.id].length, 3);
}
assert.deepEqual(
  roadmapBatches.map(({ state, title }) => [state, title]),
  [
    ['진행 중', 'Identity & Content'],
    ['예정', 'Data & Feedback'],
    ['예정', 'Charts End-to-End'],
  ],
);
assert.equal(getAdjacentContentId('ai-infrastructure', -1), 'ai-infrastructure');
assert.equal(getAdjacentContentId('ai-infrastructure', 1), 'memory-cycle');
assert.equal(getAdjacentContentId('supply-risk', 1), 'supply-risk');
```

- [ ] **Step 2: Run the model tests and verify RED**

Run:

```bash
node --test apps/web/test/identity-content-model.test.ts apps/web/test/menu-overlay-model.test.ts
```

Expected: FAIL because `identity-content-model.ts` does not exist and the roadmap still contains Menu & Overlay.

- [ ] **Step 3: Implement the minimal typed model**

```ts
export type IdentityContentTabId = 'avatar' | 'badge' | 'status' | 'list' | 'timeline' | 'carousel';
export type ContentItemId = 'ai-infrastructure' | 'memory-cycle' | 'supply-risk';
export type IdentityContentVariant = { id: string; label: string; description: string };

export const identityContentTabs = [
  { id: 'avatar', label: 'Avatar' },
  { id: 'badge', label: 'Badge' },
  { id: 'status', label: 'Status' },
  { id: 'list', label: 'List' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'carousel', label: 'Carousel' },
] as const;

export function getAdjacentContentId(currentId: ContentItemId, delta: -1 | 1): ContentItemId {
  const index = contentItems.findIndex((item) => item.id === currentId);
  const nextIndex = Math.max(0, Math.min(contentItems.length - 1, index + delta));
  return contentItems[nextIndex].id;
}
```

Define the exact variant labels from the approved spec and local fixtures for 김지구/NVIDIA plus the three content ids used by the tests. Move the four-card assertion out of `menu-overlay-model.test.ts`; keep its menu action contract intact.

- [ ] **Step 4: Run the model tests and verify GREEN**

Run:

```bash
node --test apps/web/test/identity-content-model.test.ts apps/web/test/menu-overlay-model.test.ts
```

Expected: all model tests pass.

- [ ] **Step 5: Commit the model contract**

```bash
git add apps/web/src/pages/ui-lab/ui/identity-content-model.ts apps/web/src/pages/ui-lab/ui/menu-overlay-model.ts apps/web/test/identity-content-model.test.ts apps/web/test/menu-overlay-model.test.ts
git commit -m "feat(ui-lab): Identity Content 목업 모델 추가"
```

---

### Task 2: Build the tabbed A/B/C catalog

**Files:**

- Create: `e2e/ui-lab-identity-content.spec.ts`
- Create: `apps/web/src/pages/ui-lab/ui/identity-content-catalog.tsx`
- Create: `apps/web/src/pages/ui-lab/ui/identity-content-previews.tsx`
- Create: `apps/web/src/pages/ui-lab/ui/identity-content-catalog.module.css`
- Modify: `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/completed-components-catalog.tsx`

**Interfaces:**

- Consumes: every Task 1 export.
- Produces: `IdentityContentCatalog(): ReactElement` with `data-slot="identity-content-catalog"`.
- Produces: tab panels whose A/B/C articles use `data-component` and `data-variant`.
- Produces: shared selection controls named `<item label> 선택`, carousel controls named `이전 콘텐츠` and `다음 콘텐츠`.

- [ ] **Step 1: Write the failing Playwright contracts**

```ts
await page.goto('/__ui-lab');
await page.waitForLoadState('networkidle');
const refreshButton = page.getByRole('button', { name: '새로고침' });
await refreshButton.click();
await expect(refreshButton).toHaveAttribute('data-refresh-state', 'pending');
await expect(refreshButton).toHaveAttribute('data-refresh-state', 'complete', { timeout: 1_500 });
await expect(refreshButton).toHaveAccessibleName('새로고침 완료');
await refreshButton.click();
await expect(refreshButton).toHaveAttribute('data-refresh-state', 'pending');
await page.getByRole('tab', { name: '목업 진행 중' }).click();
const catalog = page.locator('[data-slot="identity-content-catalog"]');
await expect(catalog).toBeVisible();
await expect(catalog.getByRole('tab')).toHaveCount(6);
await catalog.getByRole('tab', { name: 'List' }).click();
await expect(catalog.locator('article[data-component="list"]')).toHaveCount(3);
await catalog.getByRole('button', { name: '메모리 사이클 선택' }).first().click();
await expect(catalog.locator('article[data-component="list"] [aria-current="true"]')).toHaveCount(
  3,
);
expect(page.url()).toBe(initialUrl);
```

The second test sets a 390x844 viewport and reduced motion, checks horizontal tab overflow stays internal, verifies every visible control is at least 44px high, switches Carousel to the final item, checks `다음 콘텐츠` is disabled in all three variants, and runs Axe against the catalog.

- [ ] **Step 2: Run the E2E spec and verify RED**

Run:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:6110 \
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER \
pnpm exec playwright test e2e/ui-lab-identity-content.spec.ts --project=desktop --workers=1
```

Expected: FAIL because the catalog does not exist.

- [ ] **Step 3: Implement the catalog state and semantic tabs**

```tsx
export function IdentityContentCatalog(): ReactElement {
  const [activeTab, setActiveTab] = useState<IdentityContentTabId>('avatar');
  const [selectedId, setSelectedId] = useState<ContentItemId>('ai-infrastructure');

  return (
    <section data-slot="identity-content-catalog" aria-labelledby="identity-content-title">
      <Tabs value={activeTab} variant="sliding-underline" onValueChange={setActiveTab}>
        <TabsHighlight>
          <TabsList aria-label="Identity & Content 목업 종류">
            {identityContentTabs.map((tab) => (
              <TabsHighlightItem value={tab.id} key={tab.id}>
                <TabsTrigger value={tab.id}>{tab.label}</TabsTrigger>
              </TabsHighlightItem>
            ))}
          </TabsList>
        </TabsHighlight>
        <TabsContents>
          {identityContentTabs.map((tab) => (
            <TabsContent value={tab.id} key={tab.id}>
              <IdentityContentPreviews
                component={tab.id}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </TabsContent>
          ))}
        </TabsContents>
      </Tabs>
    </section>
  );
}
```

Use an explicit `switch (component)` in `identity-content-previews.tsx`. Each branch returns exactly three `VariantCard` articles with approved labels. List and Timeline selection buttons set `aria-current={selectedId === item.id ? 'true' : undefined}`. Carousel arrows call `getAdjacentContentId`, direct indicators call `onSelect`, and boundary arrows are disabled.

In `completed-components-catalog.tsx`, replace the permanently pending Button with this local state machine and keep the rest of the Button examples static:

```tsx
type RefreshState = 'idle' | 'pending' | 'complete';

const [refreshState, setRefreshState] = useState<RefreshState>('idle');

useEffect(() => {
  if (refreshState !== 'pending') return;
  const refreshTimer = window.setTimeout(() => setRefreshState('complete'), 900);
  return () => window.clearTimeout(refreshTimer);
}, [refreshState]);

function runRefresh() {
  if (refreshState === 'pending') return;
  setRefreshState('pending');
}

<Button
  data-refresh-state={refreshState}
  pending={refreshState === 'pending'}
  pendingLabel="불러오는 중"
  onClick={runRefresh}
>
  {refreshState === 'complete' ? '새로고침 완료' : '새로고침'}
</Button>;
```

- [ ] **Step 4: Implement visual and responsive contracts**

Use CSS Grid for the three comparison cards, collapse to one column below 1120px, keep the component tab list horizontally scrollable, and prevent page-level horizontal overflow. Give interactive rows, arrows, indicators, and filmstrip buttons `min-height: 44px`. Use only existing color, radius, shadow, duration, and easing tokens. Under `prefers-reduced-motion`, set transitions and animations to `0.01ms` and remove transforms.

- [ ] **Step 5: Connect UI Lab and run targeted checks**

Import `IdentityContentCatalog` in `ui-lab-page.tsx`, change the 5A intro marker to `In progress`, and render the catalog below it.

Run:

```bash
node --test apps/web/test/identity-content-model.test.ts apps/web/test/menu-overlay-model.test.ts
pnpm --filter @stock-insight/web typecheck
PLAYWRIGHT_BASE_URL=http://127.0.0.1:6110 PLAYWRIGHT_SKIP_WEB_SERVER=1 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/ui-lab-identity-content.spec.ts --project=desktop --workers=1
```

Expected: model tests and both Playwright tests pass with no URL change or Axe violations.

- [ ] **Step 6: Commit the interactive catalog**

```bash
git add apps/web/src/pages/ui-lab/ui/identity-content-catalog.tsx apps/web/src/pages/ui-lab/ui/identity-content-previews.tsx apps/web/src/pages/ui-lab/ui/identity-content-catalog.module.css apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx apps/web/src/pages/ui-lab/ui/completed-components-catalog.tsx e2e/ui-lab-identity-content.spec.ts
git commit -m "feat(ui-lab): Identity Content 비교 목업 추가"
```

---

### Task 3: Verify in the in-app browser and record the approval gate

**Files:**

- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`

**Interfaces:**

- Consumes: the complete Task 2 catalog at `http://127.0.0.1:6110/__ui-lab`.
- Produces: ledger evidence that the mock is implemented and awaiting visual selection, not publicized.

- [ ] **Step 1: Run changed-file static verification**

Run Oxfmt on the exact changed Markdown, TS, TSX, and CSS files; run Oxlint on the changed TS/TSX files; then run `git diff --check`. Expected: all exit 0.

- [ ] **Step 2: Verify the visible UI in the Codex in-app browser**

Reload the existing 6110 UI Lab tab, open `목업 진행 중`, and confirm:

- six horizontal component tabs appear in the approved order;
- each tab exposes exactly three A/B/C cards;
- List, Timeline, and Carousel selection changes stay synchronized;
- planned cards contain exactly three entries and no Menu & Overlay;
- the URL remains unchanged after interactions.

Leave the browser on the 5A catalog for user comparison.

- [ ] **Step 3: Update the rollout ledger**

Set 5A to `목업`, keep the current pointer at 5A, record Node/Playwright/typecheck/static/browser evidence, and state that shared/ui promotion and product adoption are blocked on user visual approval.

- [ ] **Step 4: Commit verification evidence**

```bash
git add docs/superpowers/UI-SYSTEM-ROLLOUT.md
git commit -m "docs(ui): Identity Content 목업 검증 기록"
```

- [ ] **Step 5: Stop at the visual approval gate**

Ask the user which A/B/C variants to keep for Avatar, Badge, Status, List, Timeline, and Carousel. Do not change shared/ui or product usage before that response.
