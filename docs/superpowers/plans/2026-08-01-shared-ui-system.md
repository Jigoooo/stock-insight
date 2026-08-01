# Stock Insight Shared UI System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the authentication and research workspace presentation layer with the approved Market Graphite shared UI system while preserving all auth, routing, data, and accessibility contracts.

**Architecture:** `shared/ui` becomes the single business-agnostic owner of component semantics, state visuals, and Motion behavior. Animate UI and Radix stay internal implementation sources, Sonner stays the toast transport, and pages/widgets own only composition, spacing, and product copy. Migration uses compatibility re-exports so every task ends in a buildable state.

**Tech Stack:** React 19.2, TypeScript 6, TanStack Start, Tailwind v4 without Preflight, CSS Modules, CVA, Radix UI 1.6, Motion 12.43, Sonner 2.0.7, Node test runner, Playwright 1.60, Axe.

## Global Constraints

- Treat `docs/plans/2026-08-01-shared-ui-system-design.md` as the design source of truth.
- Preserve the UX hard invariants in `docs/design/ux-constitution.md`.
- Preserve login, signup, enrollment, redirect, routing, data, and API contracts.
- Do not add SaaS UI, Chakra, Base UI, a UI Provider, or another animation runtime.
- Use `motion` for JavaScript animation; keep only short CSS color/border transitions and spinner keyframes.
- Use `MotionConfig reducedMotion="user"` and remove transform motion under reduced motion.
- Do not restore ambiguous blue controls or focus rings.
- Keep OpenHuman as layout inspiration only; do not copy GPL source.
- Preserve upstream URL, revision, registry item, and license notices on Animate UI-derived source.
- Public component imports must converge on `@/shared/ui/<purpose>`.
- `shared/ui` must remain business-agnostic and must not import features, entities, widgets, or pages.
- Page and widget styles may own layout and spacing; they may not redefine component focus, option, pressed, selected, dialog-action, or toast-state visuals.
- Existing uncommitted files at plan creation are `auth-input-field.tsx`, `input.tsx`, `input-group.tsx`, and `auth-login.spec.ts`; inspect and preserve them before editing.
- Stage exact files only. Never use `git add -A`.

## Execution Preflight

Run these commands before Task 1:

```bash
git status --short --branch
git diff -- apps/web/src/pages/auth/auth-input-field.tsx apps/web/src/shared/ui/input.tsx apps/web/src/shared/ui/input-group.tsx e2e/auth-login.spec.ts
git switch -c codex/shared-ui-system
```

Expected: the branch changes while the four existing working-tree edits remain present. If the branch already exists, use `git switch codex/shared-ui-system` and verify the same files are still modified.

---

## Phase A — Foundation and canonical controls

### Task 1: Add the Market Graphite profile

**Files:**
- Create: `apps/web/public/styles/profiles/market-graphite.css`
- Create: `docs/design/profiles/market-graphite.md`
- Modify: `apps/web/src/shared/theme/design-profile-contract.ts`
- Modify: `docs/futur_insight_design_system.md`
- Modify: `apps/web/test/design-profile-contract.test.ts`
- Modify: `apps/web/test/product-design-system.test.ts`
- Test: `e2e/auth-login.spec.ts`

**Interfaces:**
- Consumes: `requiredSemanticTokens` from `design-profile-contract.ts`.
- Produces: `activeDesignProfile.id === 'market-graphite'`, `/styles/profiles/market-graphite.css`, complete light/dark semantic tokens.

- [ ] **Step 1: Write the failing profile contract assertions**

Add these assertions to `design-profile-contract.test.ts`:

```ts
assert.equal(activeDesignProfile.id, 'market-graphite');
assert.equal(activeDesignProfile.cssHref, '/styles/profiles/market-graphite.css');
assert.deepEqual(activeDesignProfile.themeColors, {
  light: '#f2f1ec',
  dark: '#11120f',
});
```

In `product-design-system.test.ts`, read the new profile and assert that it contains no blue profile literals:

```ts
for (const blue of ['#356faf', '#7fb0eb', '#07101e', '#0e1724']) {
  assert.doesNotMatch(profileSource.toLowerCase(), new RegExp(blue));
}
```

- [ ] **Step 2: Run the contract tests and verify failure**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/design-profile-contract.test.ts test/product-design-system.test.ts
```

Expected: FAIL because `market-graphite.css` and the active profile do not exist.

- [ ] **Step 3: Implement the profile**

Set the metadata exactly:

```ts
export const activeDesignProfile = {
  id: 'market-graphite',
  label: 'Market Graphite',
  cssHref: '/styles/profiles/market-graphite.css',
  colorSchemes: ['light', 'dark'],
  themeColors: { light: '#f2f1ec', dark: '#11120f' },
} as const satisfies DesignProfileMetadata;
```

The CSS must define every `requiredSemanticTokens` entry in the top-level `:root`, map the approved light values there, and override the same roles inside `@media (prefers-color-scheme: dark)`. Use `#11120f`, `#171815`, `#1c1d19`, `#353830`, `#606459`, `#efefea`, `#b8bbb2`, and `#7d8177` for the dark foundation. Use positive/signal/risk only for semantic state.

- [ ] **Step 4: Verify the profile and browser theme metadata**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/design-profile-contract.test.ts test/product-design-system.test.ts
pnpm test:design:browser -- --grep "loads the active profile|dark-mode authentication accessible"
```

Expected: all selected tests PASS and both color schemes load `market-graphite.css`.

- [ ] **Step 5: Commit the profile**

```bash
git add apps/web/public/styles/profiles/market-graphite.css apps/web/src/shared/theme/design-profile-contract.ts apps/web/test/design-profile-contract.test.ts apps/web/test/product-design-system.test.ts e2e/auth-login.spec.ts docs/design/profiles/market-graphite.md docs/futur_insight_design_system.md
git commit -m "feat(theme): Market Graphite 프로필 적용"
```

### Task 2: Canonicalize Button, Field, and Input

**Files:**
- Create: `apps/web/src/shared/ui/button/button.tsx`
- Create: `apps/web/src/shared/ui/button/button.module.css`
- Create: `apps/web/src/shared/ui/button/index.ts`
- Create: `apps/web/src/shared/ui/field/field.tsx`
- Create: `apps/web/src/shared/ui/field/index.ts`
- Create: `apps/web/src/shared/ui/input/input.tsx`
- Create: `apps/web/src/shared/ui/input/input-group.tsx`
- Create: `apps/web/src/shared/ui/input/input.module.css`
- Create: `apps/web/src/shared/ui/input/index.ts`
- Delete: `apps/web/src/shared/ui/button.tsx`
- Delete: `apps/web/src/shared/ui/field.tsx`
- Delete: `apps/web/src/shared/ui/input.tsx`
- Delete: `apps/web/src/shared/ui/input-group.tsx`
- Modify: `apps/web/src/shared/ui/primitives/button.tsx`
- Modify: `apps/web/src/shared/ui/primitives/form.tsx`
- Modify: `apps/web/src/shared/ui/animate-ui/components/buttons/button.tsx`
- Modify: `apps/web/src/pages/auth/auth-input-field.tsx`
- Create: `apps/web/test/shared-control-system.test.ts`
- Modify: `apps/web/test/primitive-adoption-contract.test.ts`
- Test: `e2e/auth-login.spec.ts`

**Interfaces:**
- Consumes: Animate UI `ButtonPrimitiveProps`, shadcn Field/Input anatomy, Market Graphite tokens.
- Produces:

```ts
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';
export type ButtonProps = ButtonPrimitiveProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
  pendingLabel?: ReactNode;
};
```

`Input`, `InputGroup`, `InputGroupAddon`, `InputGroupInput`, `Field`, `FieldLabel`, `FieldDescription`, and `FieldError` remain native-prop compatible.

- [ ] **Step 1: Write failing canonical-path and interaction tests**

Create `shared-control-system.test.ts` with source and render checks:

```ts
it('exposes one canonical button and input owner', async () => {
  const button = await read('shared/ui/button/button.tsx');
  const input = await read('shared/ui/input/input.tsx');
  assert.match(button, /pendingLabel/);
  assert.match(button, /data-slot="button-spinner"/);
  assert.match(input, /data-slot="input-shell"/);
  assert.doesNotMatch(input, /focus-visible:ring-[23]/);
});

it('keeps press feedback calm and loading geometry stable', async () => {
  const css = await read('shared/ui/button/button.module.css');
  assert.match(css, /translateY\(1px\)/);
  assert.match(css, /cursor:\s*default/);
  assert.doesNotMatch(css, /scale\(/);
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm --filter @stock-insight/web exec node --test test/shared-control-system.test.ts test/primitive-adoption-contract.test.ts
```

Expected: FAIL on missing canonical folders and loading slots.

- [ ] **Step 3: Implement canonical Button**

Wrap the existing Animate UI primitive, keep `hoverScale` and `tapScale` in the public type for compatibility, but default both to `1`. Render a stable label and spinner grid:

```tsx
<ButtonPrimitive
  {...props}
  disabled={disabled || pending}
  aria-busy={pending || undefined}
  hoverScale={hoverScale ?? 1}
  tapScale={tapScale ?? 1}
  data-variant={variant}
  data-size={size}
>
  <span className={styles.content} data-slot="button-content" data-pending={pending || undefined}>
    <span data-slot="button-label">{pending ? pendingLabel ?? children : children}</span>
    <LoaderCircle data-slot="button-spinner" aria-hidden="true" />
  </span>
</ButtonPrimitive>
```

CSS must keep the content grid stable, use `translateY(1px)` plus inset shadow for `:active`, and set pending/disabled cursor to `default`.

- [ ] **Step 4: Implement the single-owner Input shell**

Move the current dirty Input/InputGroup work into the new folders. `InputGroup` owns the border and focus ring; `InputGroupInput` must have `border: 0`, `outline: 0`, and `box-shadow: none`. Use CSS state only:

```css
.inputShell:focus-within {
  border-color: var(--color-border-strong);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-focus) 12%, transparent);
}
```

Do not add a keyed Motion wrapper for focus. Keep native label targeting so clicking an already-focused label does not restart animation.

- [ ] **Step 5: Add compatibility re-exports and migrate auth imports**

`primitives/button.tsx`, `primitives/form.tsx`, and the Animate UI component path must re-export canonical components without duplicating implementation. Update `auth-input-field.tsx` to import from `@/shared/ui/field` and `@/shared/ui/input` only.

- [ ] **Step 6: Verify component and browser behavior**

```bash
pnpm --filter @stock-insight/web exec node --test test/shared-control-system.test.ts test/primitive-adoption-contract.test.ts test/field-anatomy-render.test.ts
pnpm exec playwright test e2e/auth-login.spec.ts --grep "input focus visible|pending|password"
pnpm typecheck
```

Expected: PASS; computed auth input has one ring and button width is unchanged while pending.

- [ ] **Step 7: Commit canonical controls**

```bash
git add apps/web/src/shared/ui/button apps/web/src/shared/ui/field apps/web/src/shared/ui/input apps/web/src/shared/ui/primitives/button.tsx apps/web/src/shared/ui/primitives/form.tsx apps/web/src/shared/ui/animate-ui/components/buttons/button.tsx apps/web/src/pages/auth/auth-input-field.tsx apps/web/test/shared-control-system.test.ts apps/web/test/primitive-adoption-contract.test.ts e2e/auth-login.spec.ts
git commit -m "feat(ui): Button과 Input 공용 경계 통합"
```

## Phase B — Form controls and data surfaces

### Task 3: Build canonical Select and Combobox

**Files:**
- Create: `apps/web/src/shared/ui/select/select.tsx`
- Create: `apps/web/src/shared/ui/select/select-controller.ts`
- Create: `apps/web/src/shared/ui/select/select.module.css`
- Create: `apps/web/src/shared/ui/select/index.ts`
- Create: `apps/web/src/shared/ui/combobox/combobox.tsx`
- Create: `apps/web/src/shared/ui/combobox/combobox.module.css`
- Create: `apps/web/src/shared/ui/combobox/index.ts`
- Modify: `apps/web/src/shared/ui/primitives/select-box.tsx`
- Modify: `apps/web/src/shared/ui/primitives/combobox.tsx`
- Modify: `apps/web/src/shared/ui/primitives/select-controls-controller.ts`
- Modify: `apps/web/test/select-controls.test.ts`
- Modify: `scripts/run-select-controls-browser-gate.mjs`
- Modify: `apps/web/src/pages/admin-invitations/ui/admin-invitation-page.tsx`

**Interfaces:**
- Produces `Select`, `Combobox`, `SelectOption`, and `SelectOptionFilter` from canonical public paths.
- `SelectOption` keeps `{ value: string; label: ReactNode; description?: ReactNode; disabled?: boolean }`.

- [ ] **Step 1: Extend failing tests for the A+C contract**

Assert canonical paths, `data-density`, 2px option gap, hidden native form value, and the close timing constant:

```ts
assert.match(selectSource, /const optionCloseDurationMs = 155/);
assert.match(selectCss, /gap:\s*2px/);
assert.match(selectCss, /\[data-density='compact'\][\s\S]*min-height:\s*38px/);
assert.match(selectCss, /\[data-density='descriptive'\][\s\S]*min-height:\s*51px/);
```

- [ ] **Step 2: Run the select tests and verify failure**

```bash
pnpm --filter @stock-insight/web exec node --test test/select-controls.test.ts
```

- [ ] **Step 3: Move controller logic and implement canonical UI**

Move arrow/Home/End/filter/select helpers to `select/select-controller.ts`. Keep immediate `onValueChange`, then schedule close with `155ms`; do not delay value updates. Use one shared option component for Select and Combobox and expose `data-selected`, `data-highlighted`, and `data-disabled`.

- [ ] **Step 4: Keep compatibility and migrate admin invitations**

Make legacy primitive paths re-export the canonical components, then update admin invitations to import from `@/shared/ui/select`.

- [ ] **Step 5: Run behavior and browser gates**

```bash
pnpm --filter @stock-insight/web exec node --test test/select-controls.test.ts test/admin-invitation-page.test.ts
pnpm test:select-controls:browser
pnpm typecheck
```

- [ ] **Step 6: Commit Select and Combobox**

```bash
git add apps/web/src/shared/ui/select apps/web/src/shared/ui/combobox apps/web/src/shared/ui/primitives/select-box.tsx apps/web/src/shared/ui/primitives/combobox.tsx apps/web/src/shared/ui/primitives/select-controls-controller.ts apps/web/test/select-controls.test.ts scripts/run-select-controls-browser-gate.mjs apps/web/src/pages/admin-invitations/ui/admin-invitation-page.tsx
git commit -m "feat(ui): Select와 Combobox 상호작용 통합"
```

### Task 4: Build Accordion, Card, and Table roles

**Files:**
- Create: `apps/web/src/shared/ui/accordion/accordion.tsx`
- Create: `apps/web/src/shared/ui/accordion/accordion.module.css`
- Create: `apps/web/src/shared/ui/accordion/index.ts`
- Create: `apps/web/src/shared/ui/card/card.tsx`
- Create: `apps/web/src/shared/ui/card/card.module.css`
- Create: `apps/web/src/shared/ui/card/index.ts`
- Create: `apps/web/src/shared/ui/table/table.tsx`
- Create: `apps/web/src/shared/ui/table/table-selection-summary.tsx`
- Create: `apps/web/src/shared/ui/table/table.module.css`
- Create: `apps/web/src/shared/ui/table/index.ts`
- Delete: `apps/web/src/shared/ui/card.tsx`
- Delete: `apps/web/src/shared/ui/table.tsx`
- Modify: `apps/web/src/shared/ui/animate-ui/components/radix/accordion.tsx`
- Modify: `apps/web/src/shared/ui/animate-ui/primitives/radix/accordion.tsx`
- Modify: `apps/web/src/shared/ui/workspace/data-table.tsx`
- Create: `apps/web/test/shared-data-surfaces.test.ts`

**Interfaces:**

```ts
type AccordionVariant = 'editorial' | 'ledger' | 'index';
type CardVariant = 'panel' | 'quiet' | 'editorial' | 'selectable';
type TableSurface = 'framed' | 'plain';
type TableSelectionMode = 'none' | 'single' | 'multiple';
```

- [ ] **Step 1: Write failing semantic and visual contract tests**

Test that Table renders a real `<table>`, exposes `surface` and `selectionMode`, Accordion movement never exceeds 4px, and Card selectable state is explicit.

```ts
assert.match(tableSource, /<table\b/);
assert.doesNotMatch(tableSource, /role="table"/);
assert.match(tableSource, /surface\?: TableSurface/);
assert.match(accordionSource, /y:\s*4/);
assert.doesNotMatch(accordionSource, /y:\s*20/);
```

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm --filter @stock-insight/web exec node --test test/shared-data-surfaces.test.ts
```

- [ ] **Step 3: Implement Accordion and Card variants**

Use the Animate UI/Radix Accordion primitive, change default content transition to `220ms`, opacity, height, and `y: 4`. Card is static unless `variant="selectable"`; only the selectable variant receives button/pressed semantics.

- [ ] **Step 4: Implement native Table selection and surfaces**

Keep `<table>`, `<thead>`, `<tbody>`, and `<tr>`. Add row click selection with a radio/checkbox focus owner. Multiple mode toggles the selected key off on the second click. Render `TableSelectionSummary` after the table, not inside it.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @stock-insight/web exec node --test test/shared-data-surfaces.test.ts test/workspace-compositions.test.ts
pnpm typecheck
git add apps/web/src/shared/ui/accordion apps/web/src/shared/ui/card apps/web/src/shared/ui/table apps/web/src/shared/ui/animate-ui/components/radix/accordion.tsx apps/web/src/shared/ui/animate-ui/primitives/radix/accordion.tsx apps/web/src/shared/ui/workspace/data-table.tsx apps/web/test/shared-data-surfaces.test.ts
git commit -m "feat(ui): Accordion Card Table 역할 체계 추가"
```

### Task 5: Build state controls, Textarea, and Tabs

**Files:**
- Create: `apps/web/src/shared/ui/switch/switch.tsx`
- Create: `apps/web/src/shared/ui/switch/switch.module.css`
- Create: `apps/web/src/shared/ui/switch/index.ts`
- Create: `apps/web/src/shared/ui/checkbox/checkbox.tsx`
- Create: `apps/web/src/shared/ui/checkbox/checkbox.module.css`
- Create: `apps/web/src/shared/ui/checkbox/index.ts`
- Create: `apps/web/src/shared/ui/toggle-group/toggle-group.tsx`
- Create: `apps/web/src/shared/ui/toggle-group/toggle-group.module.css`
- Create: `apps/web/src/shared/ui/toggle-group/index.ts`
- Create: `apps/web/src/shared/ui/textarea/textarea.tsx`
- Create: `apps/web/src/shared/ui/textarea/textarea.module.css`
- Create: `apps/web/src/shared/ui/textarea/index.ts`
- Create: `apps/web/src/shared/ui/tabs/tabs.tsx`
- Create: `apps/web/src/shared/ui/tabs/tabs.module.css`
- Create: `apps/web/src/shared/ui/tabs/index.ts`
- Delete: `apps/web/src/shared/ui/textarea.tsx`
- Modify: `apps/web/src/shared/ui/primitives/controls.tsx`
- Modify: `apps/web/src/shared/ui/primitives/segmented-tabs.tsx`
- Create: `apps/web/test/shared-state-controls.test.ts`

**Interfaces:**

```ts
type SwitchVariant = 'quiet' | 'inset';
type CheckboxVariant = 'plain' | 'inset' | 'ledger';
type TextareaVariant = 'plain' | 'composer' | 'editorial';
type TabsVariant = 'inset' | 'hairline';
```

- [ ] **Step 1: Add failing structure tests**

Assert Radix/native semantics, no pressed scale, sliding indicator ownership, and Textarea variants.

```ts
assert.doesNotMatch(toggleSource, /whileTap|scale/);
assert.match(toggleSource, /layoutId="toggle-group-indicator"/);
assert.match(textareaSource, /variant\?: TextareaVariant/);
```

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm --filter @stock-insight/web exec node --test test/shared-state-controls.test.ts test/segmented-tabs-behavior.test.ts
```

- [ ] **Step 3: Implement the components**

Use Radix state primitives. Switch A/B and Checkbox A/B/C are visual variants over one semantic component. Toggle Group B uses one Motion `layoutId` background and no press transform. Tabs hairline is reserved for route-level navigation; inset is for display-mode selection. Textarea owns focus shell and exposes optional composer footer slots.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @stock-insight/web exec node --test test/shared-state-controls.test.ts test/segmented-tabs-behavior.test.ts test/animate-ui-tabs-accessibility-render.test.ts
pnpm typecheck
git add apps/web/src/shared/ui/switch apps/web/src/shared/ui/checkbox apps/web/src/shared/ui/toggle-group apps/web/src/shared/ui/textarea apps/web/src/shared/ui/tabs apps/web/src/shared/ui/primitives/controls.tsx apps/web/src/shared/ui/primitives/segmented-tabs.tsx apps/web/test/shared-state-controls.test.ts
git commit -m "feat(ui): 상태 컨트롤과 Textarea Tabs 통합"
```

## Phase C — Overlays and feedback

### Task 6: Implement Dialog and AlertDialog composition

**Files:**
- Create: `apps/web/src/shared/ui/dialog/dialog.tsx`
- Create: `apps/web/src/shared/ui/dialog/alert-dialog.tsx`
- Create: `apps/web/src/shared/ui/dialog/dialog.module.css`
- Create: `apps/web/src/shared/ui/dialog/index.ts`
- Create: `apps/web/test/dialog-system.test.ts`
- Create: `e2e/dialog-system.spec.ts`

**Interfaces:**

```ts
type DialogSize = 'sm' | 'md' | 'lg';
type DialogComposition = 'form' | 'detail' | 'decision';
type DialogActionTone = 'secondary' | 'primary' | 'danger';
```

Export `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogBody`, `DialogFooter`, `DialogClose`, `AlertDialog`, and matching Alert parts.

- [ ] **Step 1: Write failing render and browser tests**

`dialog-system.test.ts` must assert the 32px close slot, action width data, Alert without an X, and one Motion owner. `dialog-system.spec.ts` must open a form Dialog, tab through it, press Escape, verify opener focus restore, then open Alert and verify outside/Escape do not close it.

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm --filter @stock-insight/web exec node --test test/dialog-system.test.ts
pnpm exec playwright test e2e/dialog-system.spec.ts
```

- [ ] **Step 3: Implement Radix semantics and the B spring**

Use Radix Dialog/AlertDialog for focus and dismissal. Wrap Content with Motion using:

```ts
const dialogTransition = { type: 'spring', stiffness: 150, damping: 25 } as const;
const initial = reducedMotion ? false : { x: 72, opacity: 0 };
const animate = { x: 0, opacity: 1 };
```

CSS sets close to `32×32px`, `7px` radius, footer height `62px`, secondary min-width `92px`, and primary/danger min-width `104px`.

- [ ] **Step 4: Compose shared primitives in fixture cases**

The E2E fixture route must render Form using Input/Select/Textarea/Checkbox and Decision using Toggle Group/Selectable Card. No Dialog stylesheet may target nested `input`, `textarea`, or component class names.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @stock-insight/web exec node --test test/dialog-system.test.ts
pnpm exec playwright test e2e/dialog-system.spec.ts
pnpm typecheck
git add apps/web/src/shared/ui/dialog apps/web/test/dialog-system.test.ts e2e/dialog-system.spec.ts
git commit -m "feat(ui): Dialog와 AlertDialog 공용 계층 추가"
```

### Task 7: Rebuild Toast on Sonner custom JSX

**Files:**
- Create: `apps/web/src/shared/ui/toast/app-toast.tsx`
- Create: `apps/web/src/shared/ui/toast/toast-controller.ts`
- Create: `apps/web/src/shared/ui/toast/toast.module.css`
- Modify: `apps/web/src/shared/ui/toast/motion-toast.tsx`
- Delete: `apps/web/src/shared/ui/toast/motion-toast.module.css`
- Modify: `apps/web/src/shared/ui/toast/notify.ts`
- Modify: `apps/web/src/shared/ui/toast/index.ts`
- Create: `apps/web/test/toast-system.test.ts`
- Create: `e2e/toast-system.spec.ts`

**Interfaces:**

```ts
type ToastKind = 'status' | 'action' | 'progress' | 'critical';
type ProgressToastController = {
  id: string | number;
  success: (title: ReactNode, description?: ReactNode) => void;
  error: (title: ReactNode, description?: ReactNode) => void;
  dismiss: () => void;
};
```

Keep `notify.message`, `success`, `info`, `warning`, `error`, `loading`, and `dismiss`; add `notify.action`, `notify.progress`, and controller updates without breaking existing callers.

- [ ] **Step 1: Write failing custom Sonner tests**

Assert `toast.custom`, `unstyled: true`, no tone rail, four kind layouts, 2px border, and progress controller exports.

```ts
assert.match(source, /toast\.custom/);
assert.match(source, /unstyled:\s*true/);
assert.doesNotMatch(source, /toneRail/);
assert.match(css, /border:\s*2px solid/);
assert.match(controller, /ProgressToastController/);
```

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm --filter @stock-insight/web exec node --test test/toast-system.test.ts
```

- [ ] **Step 3: Implement AppToast and controller**

Sonner owns only Toaster/queue/stack/swipe. `AppToast` owns A–D layout, close/action buttons, local progress and retry state. Use stable `18×18px` icon boxes and dedicated close/action columns. Remove the vertical rail. Implement progress updates by re-rendering the custom toast with the same ID.

- [ ] **Step 4: Add browser behavior tests**

The E2E test must trigger four toasts, verify four `[data-sonner-toast]` nodes, wait for status auto-dismiss, verify progress title changes without node replacement, click retry on critical and observe loading/success, then swipe an action toast to dismiss.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @stock-insight/web exec node --test test/toast-system.test.ts test/root-startup-boundary.test.ts
pnpm exec playwright test e2e/toast-system.spec.ts
pnpm typecheck
git add apps/web/src/shared/ui/toast apps/web/test/toast-system.test.ts e2e/toast-system.spec.ts
git commit -m "feat(ui): Sonner custom Toast 상태 체계 적용"
```

## Phase D — Screen migration and cleanup

### Task 8: Migrate login and signup to canonical controls

**Files:**
- Modify: `apps/web/src/pages/auth/auth-shell.tsx`
- Modify: `apps/web/src/pages/auth/auth-page.module.css`
- Modify: `apps/web/src/pages/auth/auth-input-field.tsx`
- Modify: `apps/web/src/pages/auth/auth-feedback-region.tsx`
- Modify: `apps/web/src/pages/auth/login-page.tsx`
- Modify: `apps/web/src/pages/auth/signup-page.tsx`
- Modify: `apps/web/test/login-page-structure.test.ts`
- Modify: `apps/web/test/signup-page-structure.test.ts`
- Modify: `apps/web/test/auth-feedback-region.test.ts`
- Modify: `e2e/auth-login.spec.ts`
- Modify: `e2e/auth-signup.spec.ts`
- Modify: `e2e/auth-visual.spec.ts`

**Interfaces:**
- Consumes canonical Button, Field/Input, TextLink, PresenceRegion.
- Produces the shared 420px auth shell and unchanged auth function inputs/outputs.

- [ ] **Step 1: Lock the auth behavior before visual edits**

Keep existing dirty E2E assertions and add a computed-style assertion that each field has exactly one non-none focus shadow owner. Add title/wordmark assertions for `Stock Insight` and ensure the rejected marketing copy is absent.

- [ ] **Step 2: Run auth tests before edits**

```bash
pnpm --filter @stock-insight/web exec node --test test/login-page-structure.test.ts test/signup-page-structure.test.ts test/auth-feedback-region.test.ts
pnpm exec playwright test e2e/auth-login.spec.ts e2e/auth-signup.spec.ts
```

Expected: current behavior tests PASS; new canonical visual assertions FAIL.

- [ ] **Step 3: Migrate composition and CSS ownership**

Use canonical imports. Auth CSS may define page background, 420px card, spacing, typography, and responsive rules only. Delete selectors that target input border, focus ring, button transform, or nested control state. Preserve one fixed-height feedback slot and the existing `aria-live` state derivation.

- [ ] **Step 4: Verify auth matrix**

```bash
pnpm --filter @stock-insight/web exec node --test test/login-page-structure.test.ts test/signup-page-structure.test.ts test/auth-feedback-region.test.ts
pnpm exec playwright test e2e/auth-login.spec.ts e2e/auth-signup.spec.ts e2e/auth-visual.spec.ts
pnpm test:auth:visual:production
```

- [ ] **Step 5: Commit auth migration**

```bash
git add apps/web/src/pages/auth apps/web/test/login-page-structure.test.ts apps/web/test/signup-page-structure.test.ts apps/web/test/auth-feedback-region.test.ts e2e/auth-login.spec.ts e2e/auth-signup.spec.ts e2e/auth-visual.spec.ts
git commit -m "feat(auth): 공용 UI 시스템으로 인증 화면 통합"
```

### Task 9: Migrate workspace shell, navigation, and tabs

**Files:**
- Modify: `apps/web/src/widgets/workspace-shell/ui/workspace-shell.tsx`
- Modify: `apps/web/src/widgets/workspace-shell/ui/workspace-navigation.tsx`
- Modify: `apps/web/src/widgets/workspace-shell/ui/workspace-topbar.tsx`
- Modify: `apps/web/src/widgets/workspace-shell/ui/workspace-shell.module.css`
- Modify: `apps/web/test/workspace-shell-current-contract.test.ts`
- Modify: `apps/web/test/workspace-navigation-transition-contract.test.ts`
- Modify: `e2e/research-workspace-v3.spec.ts`
- Modify: `e2e/workspace-visual.spec.ts`

**Interfaces:**
- Consumes canonical Button, Tabs, Sheet, Tooltip, SearchField.
- Preserves `WorkspaceShellProps` and expanded/compact/mobile state transitions.

- [ ] **Step 1: Add failing canonical-import and shell-style assertions**

Assert that widget files do not import `shared/ui/animate-ui` or `shared/ui/primitives`, and that `Stock Insight` remains the brand. Add E2E checks for expanded/compact/mobile navigation and hairline route tabs.

- [ ] **Step 2: Run shell tests and verify failure**

```bash
pnpm --filter @stock-insight/web exec node --test test/workspace-shell-current-contract.test.ts test/workspace-navigation-transition-contract.test.ts
pnpm exec playwright test e2e/research-workspace-v3.spec.ts
```

- [ ] **Step 3: Migrate imports and apply A+B composition**

Replace direct Animate UI and primitive imports with canonical paths. Keep the navigation rail, bounded topbar, search slot, and mobile Sheet. Shell CSS may style macro surfaces and dimensions but not Button/Input internals.

- [ ] **Step 4: Verify the shell matrix and commit**

```bash
pnpm --filter @stock-insight/web exec node --test test/workspace-shell-current-contract.test.ts test/workspace-navigation-transition-contract.test.ts
pnpm exec playwright test e2e/research-workspace-v3.spec.ts
pnpm test:workspace:visual
git add apps/web/src/widgets/workspace-shell apps/web/test/workspace-shell-current-contract.test.ts apps/web/test/workspace-navigation-transition-contract.test.ts e2e/research-workspace-v3.spec.ts e2e/workspace-visual.spec.ts
git commit -m "feat(workspace): 셸과 탐색 UI 공용화"
```

### Task 10: Migrate research workspace surfaces

**Files:**
- Modify: `apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/research-workspace-page.module.css`
- Modify: `apps/web/src/pages/research-workspace/ui/market-overview-panel.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/geo-market-map.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/workspace-search.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/today-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/radar-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/stocks-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/crypto-workspace-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/themes-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/my-research-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/history-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/views/status-view.tsx`
- Modify: `apps/web/src/shared/ui/workspace/data-table.tsx`
- Modify: `apps/web/src/shared/ui/workspace/panel.tsx`
- Modify: `apps/web/src/shared/ui/workspace/structured-list.tsx`
- Modify: `apps/web/test/primitive-adoption-contract.test.ts`
- Modify: `apps/web/test/workspace-compositions.test.ts`
- Modify: `e2e/workspace-visual.spec.ts`

**Interfaces:**
- Consumes canonical Accordion, Button, Card, Table, Tabs, Dialog, Input, and state controls.
- Preserves loader boundaries, route cache, append reveal, overlay state, relation crossfade, and product wording.

- [ ] **Step 1: Expand the adoption contract**

Parse the exact files above and fail on imports containing `/shared/ui/primitives` or `/shared/ui/animate-ui`. Fail on page CSS selectors that contain `.button:active`, `input:focus`, `[role='option']`, or toast/dialog component state selectors.

- [ ] **Step 2: Run bounded tests and verify failure**

```bash
pnpm --filter @stock-insight/web exec node --test test/primitive-adoption-contract.test.ts test/workspace-compositions.test.ts test/workspace-overlay-integration-contract.test.ts test/workspace-relation-crossfade.test.ts
```

- [ ] **Step 3: Migrate one view family at a time**

Use the approved roles:

```text
Today/feed          -> Editorial Section + flat ledger rows
Radar/stocks        -> Research Ledger + native Table
Themes/relation     -> Index Accordion + bounded inspector
Research/history    -> Plain Table + Detail Dialog
Status/admin        -> Quiet Surface + explicit state controls
```

After each family, run its existing source contract test before moving on. Do not alter query, loader, or schema code.

- [ ] **Step 4: Verify workspace behavior and visuals**

```bash
pnpm --filter @stock-insight/web test
pnpm exec playwright test e2e/research-workspace-v3.spec.ts e2e/workspace-lazy-focus.spec.ts
pnpm test:workspace:visual
```

- [ ] **Step 5: Commit workspace migration**

```bash
git add apps/web/src/pages/research-workspace apps/web/src/shared/ui/workspace apps/web/test/primitive-adoption-contract.test.ts apps/web/test/workspace-compositions.test.ts e2e/workspace-visual.spec.ts
git commit -m "feat(workspace): 리서치 화면 공용 컴포넌트 전환"
```

### Task 11: Remove legacy UI paths and enforce FSD public APIs

**Files:**
- Create: `apps/web/src/shared/ui/index.ts`
- Modify: every `index.ts` under `apps/web/src/shared/ui/*/index.ts`
- Delete: `apps/web/src/shared/ui/primitives/`
- Delete: unused files under `apps/web/src/shared/ui/animate-ui/components/`
- Delete: unused files under `apps/web/src/shared/ui/animate-ui/primitives/`
- Delete: `apps/web/src/shared/ui/motion/motion-button.tsx` if no canonical consumer remains
- Delete: `apps/web/src/shared/ui/primitives/field-motion-halo.tsx`
- Delete: `apps/web/src/shared/ui/primitives/field-motion-halo.module.css`
- Modify: `apps/web/test/primitive-adoption-contract.test.ts`
- Create: `apps/web/test/shared-ui-boundary.test.ts`
- Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Produces stable canonical public APIs only.
- Root barrel exports lightweight controls; overlay/toast remain component-path imports.

- [ ] **Step 1: Write failing boundary tests**

Recursively scan `src/pages`, `src/widgets`, `src/features`, and `src/entities` for forbidden legacy imports. Assert the legacy folders/files are absent and third-party notices retain Animate UI and Sonner entries.

```ts
for (const source of sources) {
  assert.doesNotMatch(source, /@\/shared\/ui\/(?:primitives|animate-ui)\//);
}
assert.equal(existsSync(primitivesUrl), false);
```

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm --filter @stock-insight/web exec node --test test/shared-ui-boundary.test.ts test/primitive-adoption-contract.test.ts
```

- [ ] **Step 3: Remove compatibility code in dependency order**

Run `rg` before each deletion, update remaining imports to public component paths, then delete only zero-consumer compatibility files. Preserve upstream notices on retained source.

- [ ] **Step 4: Verify the entire web package and commit**

```bash
rg -n "@/shared/ui/(primitives|animate-ui)/" apps/web/src
pnpm --filter @stock-insight/web test
pnpm --filter @stock-insight/web typecheck
pnpm --filter @stock-insight/web build
git add apps/web/src/shared/ui apps/web/src/pages apps/web/src/widgets apps/web/src/features apps/web/src/entities apps/web/test THIRD_PARTY_NOTICES.md
git commit -m "refactor(ui): legacy 공용 UI 경로 제거"
```

Expected: `rg` returns no product-layer imports; tests, typecheck, and build PASS.

### Task 12: Run the release matrix and update design evidence

**Files:**
- Modify: `docs/design/profiles/market-graphite.md`
- Modify: `docs/futur_insight_design_system.md`
- Create: `docs/reviews/market-graphite-shared-ui-20260801.md`
- Modify: `apps/web/test/release-ui-gates.test.ts`

**Interfaces:**
- Consumes all prior tasks.
- Produces release evidence and no remaining implementation work.

- [ ] **Step 1: Add the final release gate assertions**

Assert the active profile, canonical import scan, custom Sonner transport, and absence of page-owned control state selectors in `release-ui-gates.test.ts`.

- [ ] **Step 2: Run the complete static gate**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:design:hard
pnpm build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run the browser matrix**

```bash
pnpm test:design:browser:production
pnpm test:auth:visual:production
pnpm test:select-controls:browser
pnpm test:workspace:visual:production
pnpm test:e2e
```

Expected: desktop/mobile, light/dark, reduced-motion, Axe, auth, overlays, and workspace suites PASS. If authorized workspace credentials are unavailable, record the exact skipped projects and run every credential-free project.

- [ ] **Step 4: Inspect browser-computed invariants**

Record evidence for:

```text
Input focus ring owners: 1
Button pending width delta: 0px
Dialog action overlap: false
Toast action/close overlap: false
Toast icon center delta: <= 0.5px
390px horizontal overflow: 0px
Reduced-motion running transform animations: 0
```

Write the commands, screenshots, skipped authenticated cases, and remaining risks to `docs/reviews/market-graphite-shared-ui-20260801.md`.

- [ ] **Step 5: Refresh graph and commit evidence**

```bash
graphify update .
git add docs/design/profiles/market-graphite.md docs/futur_insight_design_system.md docs/reviews/market-graphite-shared-ui-20260801.md apps/web/test/release-ui-gates.test.ts graphify-out
git commit -m "test(ui): Market Graphite 릴리스 근거 고정"
```

## Plan self-review checklist

- [ ] Every design-spec component is owned by Tasks 1–7.
- [ ] Auth and workspace migration are owned by Tasks 8–10.
- [ ] Legacy duplicate paths and license notices are owned by Task 11.
- [ ] light/dark, mobile, reduced-motion, accessibility, and final release evidence are owned by Task 12.
- [ ] No task changes auth APIs, loaders, schemas, or financial-language boundaries.
- [ ] Every task has a failing-test step, a passing-test step, and an isolated commit.
