# Stock Insight Workspace A+B Hybrid Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every authenticated Stock Insight surface with the approved OpenHuman-like A+B workspace language while preserving routes, data, authorization, research semantics, focus behavior, and read-only product boundaries.

**Architecture:** Finish and integrate the existing authentication branch first, then create `codex/workspace-openhuman-redesign` from the updated `master`. Keep official Animate UI and shadcn registry source under `shared/ui`, place authenticated shell ownership under `widgets/workspace-shell`, place reusable data-display compositions under `shared/ui/workspace`, and keep route-specific grids and visualizations in page CSS Modules.

**Tech Stack:** TanStack Start, React 19, TypeScript, Motion, Tailwind CSS v4 without Preflight, Animate UI registry source, shadcn registry source, CSS Modules, Node test runner, Playwright, Axe.

## Global Constraints

- OpenHuman defines composition, restraint, surface tone, and typography.
- Animate UI official registry source defines motion and interactive component behavior.
- shadcn official source supplies unanimated structural primitives when Animate UI does not own the component.
- SaaS UI is an anatomy reference only; do not add SaaS UI, Chakra, Aceternity, Animata, Smooth UI, or another UI runtime.
- Do not add a global theme Provider. Registry-local state providers may exist only inside the component that requires them.
- Tailwind v4 remains build-time only and Preflight remains disabled.
- Use the current neutral `calm-market` profile with low-chroma sage as the only supporting accent.
- Visible branding is `Stock Insight`; internal package names and API contracts do not change.
- Expanded navigation is 210px at widths of 1240px and above.
- Compact navigation is 68px from 768px through 1239px.
- Mobile navigation uses a Sheet below 768px.
- Do not introduce option C or another global horizontal navigation layout.
- The mounted-shell override is session-local React state and is not persisted.
- Follow the operating-system light/dark preference and do not add a manual theme toggle.
- Buttons use hover scale `1.01` and tap scale `0.985`; icon, disclosure, row, and navigation controls do not scale.
- Do not animate whole pages, every panel, or every card.
- Keep existing Motion toast behavior and do not add a second notification system.
- Do not rewrite visualization canvases or page-layout CSS entirely in Tailwind.
- Preserve `view`, `lane`, `record`, and `cursor` URL authority.
- Preserve loader, cache, prefetch, authorization, focus restoration, inert, Escape, graph fallback, pagination, and test-ID contracts.
- Preserve read-only, information-providing investment language and do not add trading or personalized buy/sell instructions.
- Do not merge a partially converted authenticated workspace into `master`.

---

## File Structure

### Registry source

- `apps/web/src/shared/ui/animate-ui/components/radix/sidebar.tsx` — official animated sidebar anatomy.
- `apps/web/src/shared/ui/animate-ui/components/radix/sheet.tsx` — official Radix Sheet composition.
- `apps/web/src/shared/ui/animate-ui/components/radix/tabs.tsx` — official animated Tabs composition.
- `apps/web/src/shared/ui/animate-ui/components/radix/tooltip.tsx` — official animated Tooltip composition.
- `apps/web/src/shared/ui/animate-ui/components/radix/accordion.tsx` — official disclosure animation.
- `apps/web/src/shared/ui/animate-ui/components/radix/popover.tsx` — official contextual overlay.
- `apps/web/src/shared/ui/card.tsx` — shadcn Card anatomy.
- `apps/web/src/shared/ui/table.tsx` — shadcn semantic Table anatomy.
- `apps/web/src/shared/ui/scroll-area.tsx` — shadcn ScrollArea anatomy.
- `apps/web/src/shared/ui/skeleton.tsx` — shadcn Skeleton anatomy.
- `apps/web/src/shared/ui/badge.tsx` — shadcn Badge anatomy.
- `apps/web/src/shared/lib/use-mobile.ts` — registry-generated 768px mobile query helper when required by Sidebar.

### Authenticated shell

- `apps/web/src/features/workspace-navigation/model/sections.ts` — canonical eight-section IDs, labels, icons, and route order.
- `apps/web/src/features/workspace-navigation/index.ts` — public navigation model exports.
- `apps/web/src/widgets/workspace-shell/model/workspace-shell-state.ts` — breakpoint defaults and mounted-shell override reducer.
- `apps/web/src/widgets/workspace-shell/ui/workspace-shell.tsx` — expanded, compact, and mobile shell owner.
- `apps/web/src/widgets/workspace-shell/ui/workspace-navigation.tsx` — one route-linked navigation tree.
- `apps/web/src/widgets/workspace-shell/ui/workspace-topbar.tsx` — current section, search, progress, and contextual actions.
- `apps/web/src/widgets/workspace-shell/ui/workspace-shell.module.css` — 210px/68px/Sheet layout and restrained shell motion.
- `apps/web/src/widgets/workspace-shell/index.ts` — public shell exports.

### Shared workspace compositions

- `apps/web/src/shared/ui/workspace/page-header.tsx` — route heading and optional as-of time.
- `apps/web/src/shared/ui/workspace/metric-strip.tsx` — compact metric definition list.
- `apps/web/src/shared/ui/workspace/panel.tsx` — `Panel`, `PanelHeader`, and `DetailSurface`.
- `apps/web/src/shared/ui/workspace/data-table.tsx` — semantic table wrapper with horizontal overflow ownership.
- `apps/web/src/shared/ui/workspace/structured-list.tsx` — row/list composition.
- `apps/web/src/shared/ui/workspace/property-list.tsx` — label/value properties.
- `apps/web/src/shared/ui/workspace/timeline.tsx` — retrospective event list.
- `apps/web/src/shared/ui/workspace/status-summary.tsx` — compact health/availability summary.
- `apps/web/src/shared/ui/workspace/workspace-state.tsx` — loading, empty, error, stale, partial, and unavailable states.
- `apps/web/src/shared/ui/workspace/workspace-surfaces.module.css` — neutral surface, spacing, type, table, and state rules.
- `apps/web/src/shared/ui/workspace/index.ts` — public composition exports.

### Route-specific styling

- `apps/web/src/pages/research-workspace/ui/research-workspace-page.module.css` — only page-level content grid and route-specific glue after extraction.
- `apps/web/src/pages/research-workspace/ui/feed-ledger.module.css` — Today, Radar, History rows, tabs, pagination, and append state.
- `apps/web/src/pages/research-workspace/ui/relation-detail.module.css` — Themes relation ledger, graph frame, text fallback, and evidence inspector.
- `apps/web/src/pages/research-workspace/ui/market-overview.module.css` — Radar modes, heatmap, timeline, and map shell.
- `apps/web/src/pages/research-workspace/ui/personalization.module.css` — My Research decision support and explanation panels.
- Existing `stock-deep-dive-panel.module.css` and `views/crypto-workspace-view.module.css` remain dedicated modules and are restyled in place.

### Feedback and verification

- `apps/web/src/pages/auth/auth-feedback-region.tsx` — keyed idle, pending, and error feedback with one live region per state.
- `apps/web/test/workspace-shell-state.test.ts` — responsive/default/override shell state.
- `apps/web/test/workspace-registry-contract.test.ts` — official registry and attribution contract.
- `apps/web/test/workspace-compositions.test.ts` — semantic surface and no-page-override contract.
- `apps/web/test/auth-feedback-region.test.ts` — stable geometry and live-region contract.
- `e2e/workspace-visual.spec.ts` — 1440, 1180, 768, and 390 light/dark visual and overflow matrix.
- Existing workspace, crypto, admin, auth, relation, motion, and accessibility tests remain authoritative.

---

### Task 1: Finish and Integrate the Authentication Branch

**Files:**
- Modify: current uncommitted authentication and registry files shown by `git status --short`
- Verify merge overlap: `README.md`
- Verify merge overlap: `package.json`
- Verify lockfile: `pnpm-lock.yaml`
- Preserve: `docs/superpowers/specs/2026-07-31-stock-insight-workspace-hybrid-redesign-design.md`
- Preserve: `docs/superpowers/plans/2026-07-31-stock-insight-workspace-hybrid-redesign.md`

**Interfaces:**
- Consumes: `codex/openhuman-auth-motion` at `91371aa`, clean `master` at `1ec97ad`.
- Produces: verified authentication work merged into `master`, then clean branch `codex/workspace-openhuman-redesign`.

- [ ] **Step 1: Record the exact starting state**

Run:

```bash
git status --short --branch
git log --oneline --left-right master...HEAD
git diff --check
```

Expected: authentication registry files are uncommitted, feature history is 20 commits ahead, and `master` has the two remote-launcher commits.

- [ ] **Step 2: Re-run the authentication change-set gate before committing**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/auth-registry-components.test.ts \
  test/tailwind-shadcn-foundation.test.ts \
  test/login-page-structure.test.ts \
  test/signup-page-structure.test.ts \
  test/design-profile-contract.test.ts
pnpm --filter @stock-insight/web typecheck
pnpm --filter @stock-insight/web lint
pnpm --filter @stock-insight/web build
git diff --check
```

Expected: all focused tests, typecheck, lint, build, and whitespace checks pass.

- [ ] **Step 3: Commit only the current authentication registry and polish set**

Run:

```bash
git add \
  .oxfmtrc.json \
  .oxlintrc.json \
  THIRD_PARTY_NOTICES.md \
  apps/web/components.json \
  apps/web/package.json \
  apps/web/public/styles/profiles/calm-market.css \
  apps/web/src/pages/auth \
  apps/web/src/routes/__root.tsx \
  apps/web/src/routes/login.tsx \
  apps/web/src/routes/signup.tsx \
  apps/web/src/shared/lib \
  apps/web/src/shared/theme/design-profile-contract.ts \
  apps/web/src/shared/ui/animate-ui \
  apps/web/src/shared/ui/button.tsx \
  apps/web/src/shared/ui/field.tsx \
  apps/web/src/shared/ui/input-group.tsx \
  apps/web/src/shared/ui/input.tsx \
  apps/web/src/shared/ui/label.tsx \
  apps/web/src/shared/ui/separator.tsx \
  apps/web/src/shared/ui/tailwind.css \
  apps/web/src/shared/ui/textarea.tsx \
  apps/web/test \
  apps/web/vite.config.ts \
  e2e/auth-login.spec.ts \
  e2e/auth-signup.spec.ts \
  e2e/auth-visual.spec.ts \
  e2e/motion-performance.spec.ts \
  pnpm-lock.yaml
git diff --cached --name-only
git commit -m "feat(auth): Animate UI 원본 기반 인증 UI 완성"
```

Expected: only the authentication/registry set is committed; the approved spec and this plan remain separate documentation commits.

- [ ] **Step 4: Merge `master` into the feature branch**

Run:

```bash
git merge --no-edit master
```

If Git reports overlap, retain both categories in the merged result:

```json
{
  "dev": "turbo run dev",
  "dev:web": "pnpm --filter @stock-insight/web dev",
  "dev:api": "pnpm --filter @stock-insight/api-server dev",
  "verify:release": "pnpm lint && pnpm typecheck && pnpm typecheck:p6:fixture && pnpm test && pnpm test:design:hard && pnpm test:p6:db && pnpm test:xg:db && pnpm build && pnpm test:p6:browser && pnpm test:auth:visual:production && pnpm test:select-controls:browser && pnpm test:p6:browser:production && pnpm test:design:browser:production && pnpm test:p3d:browser:production && pnpm test:sigma:browser:production && pnpm test:motion:browser:production"
}
```

Expected: secure remote launcher documentation/scripts and UI release gates both remain present.

- [ ] **Step 5: Run the full feature-branch gate**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git diff --check
graphify update .
```

Expected: all repository-owned gates pass. If credential-dependent tests cannot run, preserve the exact failure output and do not describe them as passed.

- [ ] **Step 6: Merge the verified branch into `master`**

Run from `/Users/kimjigoooo/workspace/futur/stock-insight`:

```bash
git switch master
git merge --no-ff codex/openhuman-auth-motion -m "merge: OpenHuman 인증과 Motion 전환"
git status --short --branch
```

Expected: `master` contains the authentication work and is clean.

- [ ] **Step 7: Create the isolated implementation branch**

Use `superpowers:using-git-worktrees`, then create:

```bash
git worktree add /private/tmp/stock-insight-workspace-redesign -b codex/workspace-openhuman-redesign master
```

Expected: all remaining tasks run only in `/private/tmp/stock-insight-workspace-redesign`.

---

### Task 2: Lock Existing Workspace Behavior Before Visual Conversion

**Files:**
- Create: `apps/web/test/workspace-shell-state.test.ts`
- Modify: `apps/web/test/research-workspace-v3-structure.test.ts`
- Modify: `apps/web/test/workspace-overlay-integration-contract.test.ts`
- Modify: `e2e/research-workspace-v3.spec.ts`

**Interfaces:**
- Consumes: current `SectionId`, current navigation test IDs, current Sheet/inspector focus behavior.
- Produces: failing contracts for the 210px/68px/below-768 shell and preserved route behavior.

- [ ] **Step 1: Write the shell-state contract**

Create `apps/web/test/workspace-shell-state.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createWorkspaceShellState,
  reduceWorkspaceShellState,
  resolveResponsiveNavigationMode,
} from '../src/widgets/workspace-shell/model/workspace-shell-state.ts';

describe('workspace shell state', () => {
  it('uses the approved responsive defaults', () => {
    assert.equal(resolveResponsiveNavigationMode(1440), 'expanded');
    assert.equal(resolveResponsiveNavigationMode(1240), 'expanded');
    assert.equal(resolveResponsiveNavigationMode(1239), 'compact');
    assert.equal(resolveResponsiveNavigationMode(768), 'compact');
    assert.equal(resolveResponsiveNavigationMode(767), 'mobile');
  });

  it('keeps an explicit desktop override only for the mounted shell', () => {
    const initial = createWorkspaceShellState(1440);
    const compact = reduceWorkspaceShellState(initial, { type: 'toggle-desktop-mode' });
    assert.equal(compact.mode, 'compact');
    assert.equal(compact.override, 'compact');
    assert.deepEqual(createWorkspaceShellState(1440), {
      mode: 'expanded',
      override: null,
      mobileOpen: false,
    });
  });

  it('closes the mobile sheet when a route is committed', () => {
    const opened = reduceWorkspaceShellState(createWorkspaceShellState(390), {
      type: 'set-mobile-open',
      open: true,
    });
    assert.equal(opened.mobileOpen, true);
    assert.equal(
      reduceWorkspaceShellState(opened, { type: 'route-committed' }).mobileOpen,
      false,
    );
  });
});
```

- [ ] **Step 2: Add structural assertions for the future component boundary**

Append tests to `apps/web/test/research-workspace-v3-structure.test.ts` that assert:

```ts
assert.match(page, /<WorkspaceShell/);
assert.match(page, /<WorkspaceNavigation/);
assert.match(page, /<WorkspaceTopbar/);
assert.match(page, /data-testid="workspace-content"/);
assert.doesNotMatch(page, /const sections:\s*Array/);
```

Update the fixture to read the future widget sources into `workspace` before applying the assertions.

- [ ] **Step 3: Add browser assertions for all three navigation modes**

Add one Playwright test to `e2e/research-workspace-v3.spec.ts`:

```ts
test('uses expanded, compact, and mobile navigation without duplicating routes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/workspace/today');
  await expect(page.getByTestId('workspace-sidebar')).toHaveAttribute(
    'data-navigation-mode',
    'expanded',
  );
  await expect(page.getByTestId('workspace-nav-today')).toHaveCount(1);

  await page.setViewportSize({ width: 1180, height: 900 });
  await expect(page.getByTestId('workspace-sidebar')).toHaveAttribute(
    'data-navigation-mode',
    'compact',
  );
  await expect(page.getByTestId('workspace-nav-today')).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('workspace-sidebar')).toHaveCount(0);
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await expect(page.getByRole('dialog', { name: '워크스페이스 메뉴' })).toBeVisible();
  await expect(page.getByTestId('workspace-nav-today')).toHaveCount(1);
});
```

- [ ] **Step 4: Run the new tests and confirm they fail for missing implementation**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/workspace-shell-state.test.ts \
  test/research-workspace-v3-structure.test.ts \
  test/workspace-overlay-integration-contract.test.ts
```

Expected: FAIL because `widgets/workspace-shell` and the new composition boundary do not exist.

- [ ] **Step 5: Commit the red tests**

```bash
git add \
  apps/web/test/workspace-shell-state.test.ts \
  apps/web/test/research-workspace-v3-structure.test.ts \
  apps/web/test/workspace-overlay-integration-contract.test.ts \
  e2e/research-workspace-v3.spec.ts
git commit -m "test(workspace): A+B 셸 동작 계약 고정"
```

---

### Task 3: Import Official Animate UI and shadcn Registry Source

**Files:**
- Create: registry files listed under “Registry source”
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `THIRD_PARTY_NOTICES.md`
- Create: `apps/web/test/workspace-registry-contract.test.ts`

**Interfaces:**
- Consumes: `components.json`, `cn()`, semantic Tailwind tokens, root `MotionConfig reducedMotion="user"`.
- Produces: official `Sidebar`, `Sheet`, `Tabs`, `Tooltip`, `Accordion`, `Popover`, `Card`, `Table`, `ScrollArea`, `Skeleton`, and `Badge` exports.

- [ ] **Step 1: Write the registry provenance test**

Create `apps/web/test/workspace-registry-contract.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('workspace registry source', () => {
  it('keeps Animate UI source local and attributed', async () => {
    for (const name of ['sidebar', 'sheet', 'tabs', 'tooltip', 'accordion', 'popover']) {
      const source = await read(`shared/ui/animate-ui/components/radix/${name}.tsx`);
      assert.match(source, /Upstream: https:\/\/animate-ui\.com\//);
      assert.match(source, /Registry item: @animate-ui\//);
    }
  });

  it('keeps registry state styling out of page CSS', async () => {
    const pageCss = await read(
      'pages/research-workspace/ui/research-workspace-page.module.css',
    );
    assert.doesNotMatch(pageCss, /data-\[state=|focus-visible:ring-|whileHover|whileTap/);
  });
});
```

- [ ] **Step 2: Run the provenance test and verify it fails**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/workspace-registry-contract.test.ts
```

Expected: FAIL because the six Animate UI registry files do not exist.

- [ ] **Step 3: Install the official registry items from `apps/web`**

Run from `apps/web`:

```bash
pnpm dlx shadcn@latest add \
  --yes \
  @animate-ui/components-radix-sidebar \
  @animate-ui/components-radix-sheet \
  @animate-ui/components-radix-tabs \
  @animate-ui/components-radix-tooltip \
  @animate-ui/components-radix-accordion \
  @animate-ui/components-radix-popover
pnpm dlx shadcn@latest add --yes card table scroll-area skeleton badge
```

Do not pass `--overwrite`: the audited authentication Button, Input, Field, Label, Separator, and utility files remain authoritative. Expected: missing source is generated under the aliases configured by `components.json`; no SaaS UI or Chakra package is added.

- [ ] **Step 4: Normalize only local import paths and add provenance comments**

Pin the generated files to the same audited Animate UI revision already used by the authentication Button. For example, `sidebar.tsx` starts with:

```ts
// Upstream: https://animate-ui.com/docs/components/radix/sidebar
// Registry item: @animate-ui/components-radix-sidebar
// Revision: efeb96ffd7a3b7a4868667e4ac3c346620fb3044
```

Apply the same literal hash to Sheet, Tabs, Tooltip, Accordion, and Popover. Compare the generated files against that revision before committing; if the registry response has moved, use the response's exact full revision in all six comments and `THIRD_PARTY_NOTICES.md`. Do not change primitive motion APIs or state selectors.

- [ ] **Step 5: Record licenses**

Add each registry item, upstream URL, revision, and the Animate UI license to `THIRD_PARTY_NOTICES.md`. Keep existing Button attribution unchanged.

- [ ] **Step 6: Verify dependencies and source**

Run:

```bash
pnpm install --lockfile-only
pnpm --filter @stock-insight/web exec node --test \
  test/workspace-registry-contract.test.ts \
  test/auth-registry-components.test.ts \
  test/tailwind-shadcn-foundation.test.ts
pnpm --filter @stock-insight/web typecheck
git diff --check
```

Expected: tests and typecheck pass; `package.json` contains only dependencies pulled by the selected official registry items.

- [ ] **Step 7: Commit**

```bash
git add \
  THIRD_PARTY_NOTICES.md \
  apps/web/package.json \
  apps/web/src/shared/lib \
  apps/web/src/shared/ui \
  apps/web/test/workspace-registry-contract.test.ts \
  pnpm-lock.yaml
git commit -m "feat(ui): workspace registry 기반 추가"
```

---

### Task 4: Build the A+B Workspace Shell

**Files:**
- Create: `apps/web/src/features/workspace-navigation/model/sections.ts`
- Create: `apps/web/src/features/workspace-navigation/index.ts`
- Create: `apps/web/src/widgets/workspace-shell/model/workspace-shell-state.ts`
- Create: `apps/web/src/widgets/workspace-shell/ui/workspace-navigation.tsx`
- Create: `apps/web/src/widgets/workspace-shell/ui/workspace-topbar.tsx`
- Create: `apps/web/src/widgets/workspace-shell/ui/workspace-shell.tsx`
- Create: `apps/web/src/widgets/workspace-shell/ui/workspace-shell.module.css`
- Create: `apps/web/src/widgets/workspace-shell/index.ts`
- Modify: `apps/web/src/pages/research-workspace/model/workspace-search.ts`
- Modify: `apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx`
- Modify: `apps/web/src/routes/_authenticated/workspace.tsx`
- Modify: `apps/web/src/routes/_authenticated/workspace/today.tsx`
- Modify: `apps/web/src/routes/_authenticated/workspace/radar.tsx`
- Modify: `apps/web/src/routes/_authenticated/workspace/stocks.tsx`
- Modify: `apps/web/src/routes/_authenticated/workspace/crypto.tsx`
- Modify: `apps/web/src/routes/_authenticated/workspace/themes.tsx`
- Modify: `apps/web/src/routes/_authenticated/workspace/research.tsx`
- Modify: `apps/web/src/routes/_authenticated/workspace/history.tsx`
- Modify: `apps/web/src/routes/_authenticated/workspace/status.tsx`
- Delete: `apps/web/src/pages/research-workspace/ui/research-workspace-shell.tsx`
- Delete: `apps/web/src/pages/research-workspace/ui/research-workspace-shell.module.css`

**Interfaces:**
- Consumes: route `Link`, search element, navigation counts, pending section, invitation capability, logout callback.
- Produces:

```ts
export const workspaceSectionIds = [
  'today',
  'radar',
  'stocks',
  'crypto',
  'themes',
  'research',
  'history',
  'status',
] as const;

export type WorkspaceSectionId = (typeof workspaceSectionIds)[number];

export type WorkspaceNavigationMode = 'expanded' | 'compact' | 'mobile';
export type WorkspaceNavigationItem = {
  id: WorkspaceSectionId;
  label: string;
  icon: LucideIcon;
  href: `/workspace/${WorkspaceSectionId}`;
  count?: number;
};
export type WorkspaceShellProps = {
  activeSection: WorkspaceSectionId | 'admin-invitations';
  children: ReactNode;
  contextualActions?: ReactNode;
  mobileModalInert?: boolean;
  navigationItems: readonly WorkspaceNavigationItem[];
  navigationPending: WorkspaceSectionId | null;
  onLogout?: () => void;
  onNavigate?: (section: WorkspaceSectionId) => void;
  search?: ReactNode;
};
```

- [ ] **Step 1: Implement the pure shell reducer**

Create `workspace-shell-state.ts`:

```ts
export type WorkspaceNavigationMode = 'expanded' | 'compact' | 'mobile';
export type WorkspaceDesktopMode = Exclude<WorkspaceNavigationMode, 'mobile'>;

export type WorkspaceShellState = {
  mode: WorkspaceNavigationMode;
  override: WorkspaceDesktopMode | null;
  mobileOpen: boolean;
};

export type WorkspaceShellAction =
  | { type: 'viewport-changed'; width: number }
  | { type: 'toggle-desktop-mode' }
  | { type: 'set-mobile-open'; open: boolean }
  | { type: 'route-committed' };

export function resolveResponsiveNavigationMode(width: number): WorkspaceNavigationMode {
  if (width < 768) return 'mobile';
  if (width < 1240) return 'compact';
  return 'expanded';
}

export function createWorkspaceShellState(width: number): WorkspaceShellState {
  return {
    mode: resolveResponsiveNavigationMode(width),
    override: null,
    mobileOpen: false,
  };
}

export function reduceWorkspaceShellState(
  state: WorkspaceShellState,
  action: WorkspaceShellAction,
): WorkspaceShellState {
  if (action.type === 'viewport-changed') {
    const responsive = resolveResponsiveNavigationMode(action.width);
    return {
      ...state,
      mode: responsive === 'mobile' ? 'mobile' : (state.override ?? responsive),
      mobileOpen: responsive === 'mobile' ? state.mobileOpen : false,
    };
  }
  if (action.type === 'toggle-desktop-mode' && state.mode !== 'mobile') {
    const mode = state.mode === 'expanded' ? 'compact' : 'expanded';
    return { ...state, mode, override: mode };
  }
  if (action.type === 'set-mobile-open') return { ...state, mobileOpen: action.open };
  if (action.type === 'route-committed') return { ...state, mobileOpen: false };
  return state;
}
```

- [ ] **Step 2: Run the reducer test**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/workspace-shell-state.test.ts
```

Expected: PASS.

- [ ] **Step 3: Extract the canonical section model and navigation component**

Move the current `sections` configuration to `features/workspace-navigation/model/sections.ts`. Update `workspace-search.ts` to import `WorkspaceSectionId` from the feature model. Keep `export type SectionId = WorkspaceSectionId` in `research-workspace-page.tsx` temporarily so existing external test contracts remain source-compatible.

Build `WorkspaceNavigation` so every item remains a real TanStack `Link`, uses the existing `workspace-nav-${id}` test ID, retains count/pending/active state, and wraps compact labels in Animate UI Tooltip.

Compact buttons must use:

```tsx
<Tooltip delayDuration={120}>
  <TooltipTrigger asChild>{link}</TooltipTrigger>
  <TooltipContent side="right" sideOffset={8}>
    {item.label}
  </TooltipContent>
</Tooltip>
```

Do not add scale motion to navigation rows.

- [ ] **Step 4: Build the single-tree responsive shell**

`WorkspaceShell` must:

- initialize width through an SSR-safe `useSyncExternalStore` subscription;
- render one persistent sidebar only when mode is `expanded` or `compact`;
- render no persistent sidebar when mode is `mobile`;
- render the same `WorkspaceNavigation` component inside one open Sheet on mobile;
- close the Sheet after a route commit;
- keep current route content mounted while changing desktop width;
- expose `data-navigation-mode` on `workspace-sidebar`;
- keep the desktop override only in component state.

Use a tween without overshoot:

```ts
const shellTransition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
```

Set the width immediately when `useReducedMotion()` is true.

- [ ] **Step 5: Move top-bar ownership**

Build `WorkspaceTopbar` with:

- current section label;
- existing `WorkspaceSearch`;
- `aria-live="polite"` navigation status;
- contextual invitation/logout actions;
- mobile menu trigger;
- desktop expand/compact trigger.

Pending route state belongs in the top bar. Do not apply opacity or transform to `WorkspaceViewRegion`.

- [ ] **Step 6: Replace the inline shell in `ResearchWorkspacePage`**

Keep pagination, URL authority, inspector state, prefetch, and view dispatch in `ResearchWorkspacePage`. Replace only the render-owned sidebar/topbar/scrim sections with:

```tsx
<WorkspaceShell
  activeSection={section}
  contextualActions={contextualActions}
  mobileModalInert={inspectorModalOpen}
  navigationItems={navigationItems}
  navigationPending={navigationIntent.pendingSection as WorkspaceSectionId | null}
  onLogout={() => void handleLogout()}
  onNavigate={selectSection}
  search={
    <WorkspaceSearch
      disabled={!hydrated}
      onQueryChange={setQuery}
      onSubmit={() => selectSection('stocks')}
      pending={searchPending}
      query={query}
    />
  }
>
  <WorkspaceViewRegion
    navigationSequence={navigationIntent.sequence}
    pending={viewNavigationPending}
    viewKey={section}
  >
    {workspaceViewContent}
  </WorkspaceViewRegion>
</WorkspaceShell>
```

Extract the current conditional view block into the local `workspaceViewContent` variable without changing any child props. Keep the existing navigation intent reducer and call `onNavigate` from the real route link click so mobile state closes without issuing a second navigation.

- [ ] **Step 7: Update authenticated route branding**

Change only the document-title suffix in the workspace layout and all eight child routes from `Futur Insight` to `Stock Insight`. Keep route paths, descriptions, loaders, pending settings, and search validation unchanged.

- [ ] **Step 8: Run shell contracts and focused browser tests**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/workspace-shell-state.test.ts \
  test/research-workspace-v3-structure.test.ts \
  test/workspace-navigation-intent.test.ts \
  test/workspace-navigation-transition-contract.test.ts \
  test/workspace-overlay-integration-contract.test.ts \
  test/workspace-view-transition-state.test.ts
pnpm exec playwright test e2e/research-workspace-v3.spec.ts \
  --project=desktop \
  --grep "expanded, compact, and mobile navigation|newer external focus"
pnpm exec playwright test e2e/research-workspace-v3.spec.ts \
  --project=mobile \
  --grep "expanded, compact, and mobile navigation|run-bound evidence detail"
```

Expected: unit contracts pass; credential-backed browser tests pass with exactly one route link per navigation item.

- [ ] **Step 9: Commit**

```bash
git add \
  apps/web/src/widgets/workspace-shell \
  apps/web/src/features/workspace-navigation \
  apps/web/src/pages/research-workspace/model/workspace-search.ts \
  apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx \
  apps/web/src/pages/research-workspace/ui/research-workspace-shell.tsx \
  apps/web/src/pages/research-workspace/ui/research-workspace-shell.module.css \
  apps/web/src/routes/_authenticated/workspace.tsx \
  apps/web/src/routes/_authenticated/workspace \
  apps/web/test
git commit -m "feat(workspace): A+B 하이브리드 셸 적용"
```

---

### Task 5: Build Shared Workspace Surfaces

**Files:**
- Create: all files under `apps/web/src/shared/ui/workspace/`
- Create: `apps/web/test/workspace-compositions.test.ts`
- Modify: `apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/*.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.tsx`

**Interfaces:**
- Consumes: shadcn Card/Table/ScrollArea/Skeleton/Badge and existing semantic tokens.
- Produces:

```ts
export type WorkspaceStateKind =
  | 'loading'
  | 'empty'
  | 'error'
  | 'stale'
  | 'partial'
  | 'unavailable';

export type MetricItem = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
};

export type PropertyItem = {
  label: string;
  value: ReactNode;
};
```

- [ ] **Step 1: Write semantic composition tests**

Create `apps/web/test/workspace-compositions.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('workspace compositions', () => {
  it('preserves native data semantics', async () => {
    assert.match(await read('shared/ui/workspace/metric-strip.tsx'), /<dl/);
    assert.match(await read('shared/ui/workspace/property-list.tsx'), /<dl/);
    assert.match(await read('shared/ui/workspace/data-table.tsx'), /<Table/);
    assert.match(await read('shared/ui/workspace/structured-list.tsx'), /<ul/);
    assert.match(await read('shared/ui/workspace/timeline.tsx'), /<ol/);
  });

  it('owns shared visual states outside route CSS', async () => {
    const state = await read('shared/ui/workspace/workspace-state.tsx');
    const pageCss = await read(
      'pages/research-workspace/ui/research-workspace-page.module.css',
    );
    assert.match(state, /loading.*empty.*error.*stale.*partial.*unavailable/s);
    assert.doesNotMatch(pageCss, /\.panel\s*\{|\.pageHeader\s*\{|\.stateSurface\s*\{/);
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @stock-insight/web exec node --test test/workspace-compositions.test.ts
```

Expected: FAIL because the shared composition files do not exist.

- [ ] **Step 3: Implement `PageHeader`, `MetricStrip`, and panels**

Move `PageHeader` out of `research-workspace-page.tsx` without changing `data-workspace-view-heading`, `tabIndex={-1}`, date formatting, heading level, or visible copy.

Implement `MetricStrip` as:

```tsx
export function MetricStrip({
  items,
  label,
}: Readonly<{ items: readonly MetricItem[]; label: string }>) {
  return (
    <dl className={styles.metricStrip} aria-label={label}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.detail ? <small>{item.detail}</small> : null}
        </div>
      ))}
    </dl>
  );
}
```

`Panel`, `PanelHeader`, and `DetailSurface` must retain semantic `section`/`aside` selection through an `as` prop and must not add hover elevation.

- [ ] **Step 4: Implement data display compositions**

Use native semantics:

- `DataTable` renders shadcn `Table` inside one horizontal scroll owner and accepts `caption`.
- `StructuredList` renders `ul > li`.
- `PropertyList` renders `dl > div > dt + dd`.
- `Timeline` renders `ol > li`.
- `StatusSummary` renders a compact definition list, not a badge cloud.

Keep `font-variant-numeric: tabular-nums` on values and timestamps.

- [ ] **Step 5: Implement the expanded `WorkspaceState`**

Move current `WorkspaceState` and `AvailabilityNotice` logic to the shared folder. Map:

```ts
const liveMode: Record<WorkspaceStateKind, 'off' | 'polite' | 'assertive'> = {
  loading: 'polite',
  empty: 'off',
  error: 'assertive',
  stale: 'polite',
  partial: 'polite',
  unavailable: 'polite',
};
```

Use one icon/visual slot, one heading, and one description. Keep delayed loading behavior and reduced-motion-safe skeletons.

- [ ] **Step 6: Replace local surface markup**

Update all views to import from `@/shared/ui/workspace`. Preserve all current visible copy, ARIA attributes, test IDs, selection state, table headings, and link behavior.

- [ ] **Step 7: Run composition and current structure tests**

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/workspace-compositions.test.ts \
  test/research-workspace-v3-structure.test.ts \
  test/task4-feedback-surface-adoption.test.ts \
  test/deep-dive-feedback-accessibility-render.test.ts \
  test/p4-personalization-workspace-ui.test.ts \
  test/p6-crypto-workspace-ui.test.ts
pnpm --filter @stock-insight/web typecheck
```

Expected: PASS with native tables/lists/definition lists preserved.

- [ ] **Step 8: Commit**

```bash
git add \
  apps/web/src/shared/ui/workspace \
  apps/web/src/pages/research-workspace/ui \
  apps/web/test/workspace-compositions.test.ts \
  apps/web/test/research-workspace-v3-structure.test.ts
git commit -m "feat(ui): workspace 데이터 표면 통합"
```

---

### Task 6: Split the Monolithic Workspace Stylesheet

**Files:**
- Modify: `apps/web/src/pages/research-workspace/ui/research-workspace-page.module.css`
- Create: `apps/web/src/pages/research-workspace/ui/feed-ledger.module.css`
- Create: `apps/web/src/pages/research-workspace/ui/relation-detail.module.css`
- Create: `apps/web/src/pages/research-workspace/ui/market-overview.module.css`
- Create: `apps/web/src/pages/research-workspace/ui/personalization.module.css`
- Modify: importing workspace view components
- Modify: `apps/web/test/research-workspace-v3-structure.test.ts`

**Interfaces:**
- Consumes: class names already used by route views.
- Produces: route CSS with one responsibility per module and no registry interaction overrides.

- [ ] **Step 1: Add a CSS ownership test**

Add to `workspace-compositions.test.ts`:

```ts
for (const path of [
  'pages/research-workspace/ui/research-workspace-page.module.css',
  'pages/research-workspace/ui/feed-ledger.module.css',
  'pages/research-workspace/ui/relation-detail.module.css',
  'pages/research-workspace/ui/market-overview.module.css',
  'pages/research-workspace/ui/personalization.module.css',
]) {
  const css = await read(path);
  assert.doesNotMatch(css, /focus-visible:ring-|data-\[state=|whileHover|whileTap/);
}
```

- [ ] **Step 2: Move selectors by ownership**

Move, without changing behavior:

- shell selectors into `widgets/workspace-shell/ui/workspace-shell.module.css`;
- `laneTabs`, `laneIndicator`, `feed`, `feedRow`, `ledger`, `ledgerRow`, `historyRow`, and pager selectors into `feed-ledger.module.css`;
- `themeLedger`, `relationPanel`, graph, fallback, inspector, evidence, and overlay selectors into `relation-detail.module.css`;
- `marketMode*`, `marketFlow*`, `marketHeat*`, `marketTimeline`, `geoMap*`, and geo evidence selectors into `market-overview.module.css`;
- `personalization*`, `decision*`, and `explanation*` selectors into `personalization.module.css`.

Keep only route content grid and one-off view composition selectors in `research-workspace-page.module.css`.

- [ ] **Step 3: Update imports one view at a time**

Each view imports only its responsible module. Do not create a merged `styles` object or duplicate class definitions.

- [ ] **Step 4: Run the style and bundle gates**

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/workspace-compositions.test.ts \
  test/research-workspace-v3-structure.test.ts \
  test/design-audit.test.ts \
  test/product-design-system.test.ts \
  test/workspace-render-threshold.test.ts
pnpm --filter @stock-insight/web audit:workspace:bundle
pnpm --filter @stock-insight/web build
git diff --check
```

Expected: all tests pass; the old stylesheet no longer owns shell, shared panel, or registry states.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/research-workspace/ui apps/web/src/widgets/workspace-shell apps/web/test
git commit -m "refactor(ui): workspace 스타일 책임 분리"
```

---

### Task 7: Convert Today and Radar

**Files:**
- Modify: `apps/web/src/pages/research-workspace/ui/views/today-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/radar-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/market-overview-panel.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/geo-market-map.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/feed-ledger.module.css`
- Modify: `apps/web/src/pages/research-workspace/ui/market-overview.module.css`
- Modify: `apps/web/test/research-workspace-v3-structure.test.ts`
- Modify: `e2e/research-workspace-v3.spec.ts`

**Interfaces:**
- Consumes: Animate UI Tabs, shared panels/tables/states, existing append reveal.
- Produces: compact Today feed and structured Radar modes without changing lane or cursor authority.

- [ ] **Step 1: Write assertions for Today and Radar anatomy**

Require:

```ts
assert.match(workspace, /<Tabs[^>]*value=\{lane\}/);
assert.match(workspace, /<MetricStrip/);
assert.match(workspace, /<StructuredList/);
assert.match(workspace, /<DataTable/);
assert.match(workspace, /useWorkspaceAppendReveal/);
```

- [ ] **Step 2: Convert Today lane navigation**

Use Animate UI Tabs with `value={lane}` and `onValueChange={onLaneChange}`. Preserve:

- URL-authoritative lane;
- ArrowLeft/ArrowRight/Home/End behavior;
- existing tab IDs and `research-feed-panel`;
- pending marker;
- selected record;
- append reveal;
- stable pager feedback.

Override Tabs transition only to the calm contract:

```ts
const tabsTransition = { duration: 0.16, ease: [0.22, 1, 0.36, 1] } as const;
```

Do not animate the panel content when the URL route changes.

- [ ] **Step 3: Convert Today metrics and feed**

Use `MetricStrip`, `Panel`, and `StructuredList`. Rows remain buttons because they open the inspector. Row hover is background/foreground only.

- [ ] **Step 4: Convert Radar modes and data surfaces**

Use Animate UI Tabs for the eight market modes. Use:

- `StructuredList` for signal ledger and timeline;
- `DataTable` for heatmap and geo evidence;
- `PropertyList` for map metadata;
- `WorkspaceState` for empty, missing, partial, stale, and error.

Preserve every existing `data-testid`, `aria-controls`, component watermark, and map control.

- [ ] **Step 5: Run focused unit and browser tests**

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/research-workspace-v3-structure.test.ts \
  test/market-overview-ui-structure.test.ts \
  test/market-overview.test.ts \
  test/geo-map-ui-structure.test.ts \
  test/geo-map-geometry.test.ts \
  test/segmented-tabs-behavior.test.ts \
  test/workspace-append-reveal.test.ts \
  test/workspace-pagination-authority.test.ts
pnpm exec playwright test e2e/research-workspace-v3.spec.ts \
  --grep "APG keyboard navigation|all eight market screens|empty Radar truth"
```

Expected: Today lane URL behavior, Radar mode keyboard behavior, geo fallback, cursor paging, and append reveal pass.

- [ ] **Step 6: Commit**

```bash
git add \
  apps/web/src/pages/research-workspace/ui/views/today-view.tsx \
  apps/web/src/pages/research-workspace/ui/views/radar-view.tsx \
  apps/web/src/pages/research-workspace/ui/market-overview-panel.tsx \
  apps/web/src/pages/research-workspace/ui/geo-market-map.tsx \
  apps/web/src/pages/research-workspace/ui/feed-ledger.module.css \
  apps/web/src/pages/research-workspace/ui/market-overview.module.css \
  apps/web/test \
  e2e/research-workspace-v3.spec.ts
git commit -m "feat(workspace): 오늘과 레이더 표면 전환"
```

---

### Task 8: Convert Stocks, Themes, Relations, and Evidence Detail

**Files:**
- Modify: `apps/web/src/pages/research-workspace/ui/views/stocks-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/themes-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.module.css`
- Modify: `apps/web/src/pages/research-workspace/ui/relation-sigma-graph.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/relation-detail.module.css`
- Modify: related unit and E2E tests

**Interfaces:**
- Consumes: `DataTable`, `DetailSurface`, `PropertyList`, `StructuredList`, Animate UI Accordion/Popover, existing relation crossfade and overlay controller.
- Produces: selected-row table/detail composition and accessible relation/evidence surfaces.

- [ ] **Step 1: Lock selected-row and detail contracts**

Extend tests to assert:

```ts
assert.match(workspace, /aria-pressed=\{selectedStockKey === stock\.entityKey\}/);
assert.match(workspace, /data-selected=\{selectedStockKey === stock\.entityKey/);
assert.match(workspace, /<DetailSurface/);
assert.match(workspace, /<PropertyList/);
assert.match(workspace, /useWorkspaceRelationCrossfade/);
assert.match(workspace, /관계를 텍스트로 보기/);
```

- [ ] **Step 2: Convert the stocks master-detail layout**

Use `DataTable` for the stock table and `DetailSurface` for the deep dive. At narrow widths, stack the detail below the table; do not hide columns without a corresponding accessible label. Preserve selected row, search, relation load state, focus, and horizontal table scrolling.

- [ ] **Step 3: Convert themes and relation ledger**

Use `StructuredList` for themes and evidence relations. Theme selection remains a button with `aria-pressed`; no scale motion. Keep relation crossfade limited to opacity and a 2px offset.

- [ ] **Step 4: Convert graph fallback and inspector disclosure**

Keep the Sigma canvas and verified-edge constraints unchanged. Use Animate UI Accordion for the text fallback and disclosure height only. Keep the evidence inspector on the existing overlay controller so desktop remains non-modal and mobile retains focus trap, inert, Escape, scrim, and opener restoration.

- [ ] **Step 5: Run focused verification**

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/stock-deep-dive-ui-structure.test.ts \
  test/deep-dive-feedback-accessibility-render.test.ts \
  test/relation-sigma-structure.test.ts \
  test/relation-sigma-runtime.test.ts \
  test/research-workspace-relation-root.test.ts \
  test/workspace-relation-crossfade.test.ts \
  test/workspace-overlay-integration-contract.test.ts \
  test/workspace-overlay-motion-runtime.test.ts
pnpm exec playwright test e2e/research-workspace-v3.spec.ts \
  --grep "run-bound evidence detail|theme relation|layout overflow"
pnpm exec playwright test e2e/relation-sigma.spec.ts
```

Expected: table selection, graph text fallback, inspector focus/inert behavior, and relation crossfade pass.

- [ ] **Step 6: Commit**

```bash
git add \
  apps/web/src/pages/research-workspace/ui/views/stocks-view.tsx \
  apps/web/src/pages/research-workspace/ui/views/themes-view.tsx \
  apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.tsx \
  apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.module.css \
  apps/web/src/pages/research-workspace/ui/relation-sigma-graph.tsx \
  apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx \
  apps/web/src/pages/research-workspace/ui/relation-detail.module.css \
  apps/web/test \
  e2e/research-workspace-v3.spec.ts
git commit -m "feat(workspace): 종목과 관계 상세 전환"
```

---

### Task 9: Convert Crypto, My Research, History, and Status

**Files:**
- Modify: `apps/web/src/pages/research-workspace/ui/views/crypto-workspace-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/crypto-workspace-view.module.css`
- Modify: `apps/web/src/pages/research-workspace/ui/views/my-research-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/personalization-workspace-panel.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/history-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/status-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/personalization.module.css`
- Modify: `apps/web/src/pages/research-workspace/ui/feed-ledger.module.css`
- Modify: related unit and E2E tests

**Interfaces:**
- Consumes: shared Panel, PropertyList, StructuredList, Timeline, DataTable, StatusSummary, WorkspaceState.
- Produces: the remaining four views with the same density and state vocabulary.

- [ ] **Step 1: Convert Crypto**

Replace repeated generic cards with:

- one `MetricStrip` summary;
- `Panel` sections for asset/company/event/risk groups;
- `DataTable` for evidence;
- `PropertyList` for limitations;
- `WorkspaceState` for unsupported and unavailable states.

Preserve all read-only notices and existing test IDs.

- [ ] **Step 2: Convert My Research**

Use `PropertyList` for personalization inputs, `StructuredList` for watchlist and explanation evidence, and one `DetailSurface` for decision support. Preserve the nine-part decision-support presentation and non-advisory copy.

- [ ] **Step 3: Convert History**

Use `Timeline` for retrospective rows and keep cursor pagination, status labels, append reveal, and focus behavior unchanged.

- [ ] **Step 4: Convert Status**

Use `StatusSummary` for health counts and `DataTable` or `PropertyList` for coverage, freshness, limitations, and source availability. Do not collapse unavailable data into a positive badge.

- [ ] **Step 5: Run focused verification**

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/p6-crypto-workspace-ui.test.ts \
  test/p6-crypto-query.test.ts \
  test/p4-personalization-workspace-ui.test.ts \
  test/p4-decision-support-ui-structure.test.ts \
  test/p4-decision-support-presentation.test.ts \
  test/workspace-pagination-authority.test.ts \
  test/research-workspace-v3-structure.test.ts
pnpm exec playwright test e2e/crypto-workspace.spec.ts
pnpm exec playwright test e2e/research-workspace-v3.spec.ts \
  --grep "loads every real-data section|history|data status"
```

Expected: all four views pass data, overflow, accessibility, empty, and unsupported contracts.

- [ ] **Step 6: Commit**

```bash
git add \
  apps/web/src/pages/research-workspace/ui/views \
  apps/web/src/pages/research-workspace/ui/personalization.module.css \
  apps/web/src/pages/research-workspace/ui/feed-ledger.module.css \
  apps/web/test \
  e2e/crypto-workspace.spec.ts \
  e2e/research-workspace-v3.spec.ts
git commit -m "feat(workspace): 리서치와 상태 화면 전환"
```

---

### Task 10: Convert Invitation Administration to the Shared Shell

**Files:**
- Modify: `apps/web/src/pages/admin-invitations/ui/admin-invitation-page.tsx`
- Modify: `apps/web/src/pages/admin-invitations/ui/admin-invitation-page.module.css`
- Modify: `apps/web/src/routes/_authenticated/admin/invitations.tsx`
- Modify: `apps/web/test/admin-invitation-page.test.ts`
- Modify: `e2e/admin-invitations.spec.ts`

**Interfaces:**
- Consumes: `WorkspaceShell`, `PageHeader`, `Panel`, shadcn Field/Input, existing provider-free SelectBox, `DataTable`, `WorkspaceState`.
- Produces: authenticated administration surface matching the workspace without changing issue/revoke behavior.

- [ ] **Step 1: Add shell and state assertions**

Require:

```ts
assert.match(source, /<WorkspaceShell/);
assert.match(source, /<PageHeader/);
assert.match(source, /<Panel/);
assert.match(source, /<DataTable/);
assert.match(source, /<output[^>]*aria-live="polite"/);
assert.match(source, /이 코드는 지금 한 번만 표시됩니다/);
```

- [ ] **Step 2: Recompose the page**

Use the same `Stock Insight` workspace shell and top bar. Keep:

- owner/admin loader rejection;
- form field names and validation;
- `SelectBox` behavior;
- one-time code disclosure;
- clipboard error;
- revocation persistence;
- list-heading focus after revoke;
- semantic caption and row headers.

Change the admin document title suffix to `Stock Insight` while leaving its route description and authorization loader unchanged.

Use no independent marketing card or special blue accent.

- [ ] **Step 3: Add pending, success, error, and empty states**

Keep the output region stable. Use `WorkspaceState` for empty history and error. Use a compact success `DetailSurface` for the one-time code and do not persist or duplicate the plaintext value.

- [ ] **Step 4: Run admin tests**

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/admin-invitation-page.test.ts \
  test/admin-invitation-functions.test.ts \
  test/admin-capability-fail-closed.test.ts
pnpm exec playwright test e2e/admin-invitations.spec.ts --project=desktop
```

Expected: capability blocking, code issuance, one-time disclosure, member rejection, revocation, focus, and Axe pass.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web/src/pages/admin-invitations \
  apps/web/src/routes/_authenticated/admin/invitations.tsx \
  apps/web/test/admin-invitation-page.test.ts \
  e2e/admin-invitations.spec.ts
git commit -m "feat(admin): 초대 관리 workspace 표면 적용"
```

---

### Task 11: Add Stable Authentication Feedback Presence

**Files:**
- Create: `apps/web/src/pages/auth/auth-feedback-region.tsx`
- Modify: `apps/web/src/pages/auth/auth-page.module.css`
- Modify: `apps/web/src/pages/auth/login-page.tsx`
- Modify: `apps/web/src/pages/auth/signup-page.tsx`
- Create: `apps/web/test/auth-feedback-region.test.ts`
- Modify: `e2e/auth-login.spec.ts`
- Modify: `e2e/auth-signup.spec.ts`

**Interfaces:**
- Consumes: `PresenceRegion`, root reduced-motion preference, login/signup error and pending state.
- Produces:

```ts
export type AuthFeedbackState =
  | { key: 'idle' }
  | { key: 'pending'; message: string }
  | { key: 'error'; id: string; message: string };

export type AuthFeedbackRegionProps = {
  state: AuthFeedbackState;
};
```

- [ ] **Step 1: Write the source contract**

Create `apps/web/test/auth-feedback-region.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('authentication feedback presence', () => {
  it('uses one keyed fixed-geometry region', async () => {
    const source = await read('pages/auth/auth-feedback-region.tsx');
    const css = await read('pages/auth/auth-page.module.css');
    assert.match(source, /key:\s*'idle'/);
    assert.match(source, /key:\s*'pending'/);
    assert.match(source, /key:\s*'error'/);
    assert.match(source, /mode="sync"/);
    assert.match(source, /role=\{state\.key === 'error' \? 'alert' : 'status'\}/);
    assert.match(source, /aria-live=\{state\.key === 'error' \? 'assertive' : 'polite'\}/);
    assert.match(source, /aria-hidden="true"/);
    assert.match(css, /\.feedbackSlot\s*\{[\s\S]*min-height:/);
  });

  it('does not keep separate pending and error nodes in auth pages', async () => {
    for (const page of ['login-page.tsx', 'signup-page.tsx']) {
      const source = await read(`pages/auth/${page}`);
      assert.match(source, /<AuthFeedbackRegion/);
      assert.doesNotMatch(source, /className=\{styles\.(?:errorMessage|pendingMessage)\}/);
    }
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @stock-insight/web exec node --test test/auth-feedback-region.test.ts
```

Expected: FAIL because `AuthFeedbackRegion` does not exist.

- [ ] **Step 3: Implement keyed presence**

Use one stable live region for assistive technology and one `aria-hidden` visual layer for keyed presence. This prevents the entering and exiting visual copies from being announced twice:

```tsx
const message = state.key === 'idle' ? '' : state.message;

return (
  <>
    <div
      id={state.key === 'error' ? state.id : undefined}
      className={styles.feedbackAnnouncement}
      role={state.key === 'error' ? 'alert' : 'status'}
      aria-live={state.key === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {message}
    </div>
    <div className={styles.feedbackSlot} data-feedback-key={state.key} aria-hidden="true">
      <PresenceRegion
        mode="sync"
        presenceKey={state.key}
        present
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        exit={
          reducedMotion
            ? { opacity: 0, transition: { duration: 0.06 } }
            : {
                opacity: 0,
                y: -1,
                transition: { duration: 0.1, ease: 'easeOut' },
              }
        }
        transition={{
          duration: reducedMotion ? 0.08 : 0.16,
          ease: 'easeOut',
        }}
      >
        <p>{message || '\u00a0'}</p>
      </PresenceRegion>
    </div>
  </>
);
```

`idle` keeps the stable announcement region empty. `pending` uses the same region as a polite status. `error` uses it as an assertive alert. Only the current message exists in the live region; entering and exiting visual nodes stay hidden from the accessibility tree.

Keep the announcement available to assistive technology without rendering duplicate visible text:

```css
.feedbackAnnouncement {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.feedbackSlot {
  display: grid;
  min-height: 20px;
  align-items: center;
}

.feedbackSlot > * {
  grid-area: 1 / 1;
}
```

- [ ] **Step 4: Replace login and signup feedback**

Derive exactly one state:

```ts
const feedbackState: AuthFeedbackState = error
  ? { key: 'error', id: 'login-error', message: error }
  : pending
    ? { key: 'pending', message: '계정 정보를 확인하고 있습니다.' }
    : { key: 'idle' };
```

Use the corresponding signup error ID and pending copy in `SignupPage`. Preserve `aria-describedby`, validation, enrollment availability, redirect, and focus-first-invalid behavior.

- [ ] **Step 5: Add layout and announcement browser assertions**

In login E2E, record the submit button bounding box before submission and after error:

```ts
const before = await page.getByRole('button', { name: '로그인', exact: true }).boundingBox();
await page.getByRole('button', { name: '로그인', exact: true }).click();
await expect(page.getByRole('alert')).toBeVisible();
const after = await page.getByRole('button', { name: '로그인', exact: true }).boundingBox();
expect(after?.y).toBe(before?.y);
await expect(page.locator('[role="alert"]')).toHaveCount(1);
```

Add a reduced-motion case that checks no feedback transform lasts beyond the current frame.

- [ ] **Step 6: Run auth verification**

```bash
pnpm --filter @stock-insight/web exec node --test \
  test/auth-feedback-region.test.ts \
  test/login-page-structure.test.ts \
  test/signup-page-structure.test.ts \
  test/login-validation.test.ts \
  test/signup-validation.test.ts
pnpm exec playwright test \
  e2e/auth-login.spec.ts \
  e2e/auth-signup.spec.ts \
  --grep "failure|pending|reduced motion|stable"
```

Expected: stable button position, one announcement, natural pending-to-error crossfade, and no reduced-motion translation.

- [ ] **Step 7: Commit**

```bash
git add \
  apps/web/src/pages/auth \
  apps/web/test/auth-feedback-region.test.ts \
  apps/web/test/login-page-structure.test.ts \
  apps/web/test/signup-page-structure.test.ts \
  e2e/auth-login.spec.ts \
  e2e/auth-signup.spec.ts
git commit -m "feat(auth): 피드백 전환을 안정된 presence로 통합"
```

---

### Task 12: Add the Full Visual and Accessibility Matrix

**Files:**
- Create: `e2e/workspace-visual.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Modify: `apps/web/test/release-ui-gates.test.ts`

**Interfaces:**
- Consumes: all converted authenticated routes, existing Playwright auth fixture environment.
- Produces: deterministic desktop/compact/boundary/mobile, light/dark, reduced-motion, overflow, and Axe gates.

- [ ] **Step 1: Add viewport projects**

Ensure Playwright can run the exact matrix:

```ts
const workspaceViewports = {
  expanded: { width: 1440, height: 960 },
  compact: { width: 1180, height: 900 },
  boundary: { width: 768, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;
```

- [ ] **Step 2: Create the visual route matrix**

`workspace-visual.spec.ts` must iterate:

```ts
const routes = [
  '/workspace/today',
  '/workspace/radar',
  '/workspace/stocks',
  '/workspace/crypto',
  '/workspace/themes',
  '/workspace/research',
  '/workspace/history',
  '/workspace/status',
  '/admin/invitations',
] as const;
```

For each route and viewport:

- wait for `document.fonts.ready`;
- assert root horizontal overflow is at most 1px;
- assert the expected shell mode;
- run Axe;
- capture light and dark screenshots;
- repeat the interaction-critical routes with `prefers-reduced-motion: reduce`.

- [ ] **Step 3: Add focused interaction screenshots**

Capture:

- mobile Sheet open;
- Today pending lane;
- evidence inspector;
- Stocks selected row and deep dive;
- Themes relation graph plus text fallback;
- Radar map fallback;
- invitation one-time code disclosure;
- login pending-to-error.

Mask only values that are intentionally time- or credential-dependent. Do not mask layout containers.

- [ ] **Step 4: Add release scripts**

Add:

```json
{
  "test:workspace:visual": "playwright test e2e/workspace-visual.spec.ts",
  "test:workspace:visual:production": "PLAYWRIGHT_USE_PRODUCTION_BUILD=1 PLAYWRIGHT_PORT=18098 playwright test e2e/workspace-visual.spec.ts"
}
```

Add the production visual command after `pnpm build` in `verify:release`.

- [ ] **Step 5: Run the matrix**

```bash
pnpm build
pnpm test:workspace:visual
pnpm test:workspace:visual:production
```

Expected: nine routes pass the viewport/theme matrix with no Axe violation or document overflow.

- [ ] **Step 6: Commit**

```bash
git add e2e/workspace-visual.spec.ts playwright.config.ts package.json apps/web/test/release-ui-gates.test.ts
git commit -m "test(ui): workspace 시각·접근성 매트릭스 추가"
```

---

### Task 13: Final Cleanup, Verification, and Master Merge

**Files:**
- Modify only files required by failing gates
- Verify: all changed source, tests, documentation, and lockfiles

**Interfaces:**
- Consumes: Tasks 1–12.
- Produces: one clean, fully converted branch ready for a single final merge.

- [ ] **Step 1: Remove obsolete internal primitives and overrides only when unused**

Run:

```bash
rg -n "ResearchWorkspaceShell|styles\\.(sidebar|topbar|panel|pageHeader|stateSurface)" apps/web/src
rg -n "FieldMotionHalo|SegmentedTabs|shared/ui/primitives/(button|form|surface)" apps/web/src/pages apps/web/src/widgets
rg -n "Futur Insight" apps/web/src/routes apps/web/src/pages apps/web/src/widgets
```

Expected:

- old shell imports are zero;
- route/page code uses registry/shared workspace compositions;
- visible authenticated branding uses `Stock Insight`;
- any retained primitive has a non-authenticated or compatibility consumer and is not deleted prematurely.

- [ ] **Step 2: Verify no forbidden dependency or styling ownership**

Run:

```bash
rg -n "\"(@chakra-ui|@saas-ui|aceternity|animata|smoothui)" package.json apps/*/package.json packages/*/package.json
rg -n "backdrop-filter|blur\\(" apps/web/src/widgets/workspace-shell apps/web/src/pages/research-workspace
rg -n "hover:scale|whileHover|whileTap" apps/web/src/pages/research-workspace apps/web/src/widgets/workspace-shell
rg -n "data-\\[state=|focus-visible:ring-" apps/web/src/pages/research-workspace/**/*.css
```

Expected: no forbidden package, no blurred scrim, no page-owned registry states, and no scale on navigation/row/panel controls.

- [ ] **Step 3: Run the complete static and unit gate**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:design:hard
pnpm build
git diff --check
```

Expected: all commands pass.

- [ ] **Step 4: Run every browser gate**

Run with either `PLAYWRIGHT_STORAGE_STATE` or the existing Stock Insight E2E credential variables configured:

```bash
pnpm test:e2e
pnpm test:auth:visual:production
pnpm test:select-controls:browser
pnpm test:p6:browser:production
pnpm test:design:browser:production
pnpm test:p3d:browser:production
pnpm test:sigma:browser:production
pnpm test:motion:browser:production
pnpm test:workspace:visual:production
```

Expected: all credential-free and credential-backed gates pass. Do not substitute skips for required authenticated route coverage.

- [ ] **Step 5: Update the code graph and inspect the final diff**

```bash
graphify update .
git status --short
git diff --stat master...HEAD
git diff --check master...HEAD
```

Expected: graph update completes, the branch is clean, and changes remain inside authenticated UI, shared UI, tests, registry attribution, and release scripts.

- [ ] **Step 6: Request code review and fix findings**

Use `superpowers:requesting-code-review`. Review must explicitly cover:

- route/loader/auth behavior;
- reduced motion;
- focus, inert, Escape, return focus;
- URL and cache authority;
- table/list semantics;
- read-only product wording;
- registry attribution and dependency scope;
- light/dark and all four viewport modes.

Repeat the narrowest failing gate after each correction, then rerun Steps 3–5.

- [ ] **Step 7: Merge only the fully verified branch**

Run from `/Users/kimjigoooo/workspace/futur/stock-insight`:

```bash
git switch master
git merge --no-ff codex/workspace-openhuman-redesign -m "merge: Stock Insight workspace A+B 리디자인"
git status --short --branch
```

Expected: one final merge commit; no partial workspace conversion was merged earlier.
