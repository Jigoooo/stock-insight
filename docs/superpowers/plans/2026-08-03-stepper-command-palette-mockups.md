# Stepper + CommandPalette Mockups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build interactive A/B/C Stepper and CommandPalette mockups in the dev-only UI Lab without promoting unapproved APIs to `shared/ui`.

**Architecture:** Add one focused 3D catalog composed from local mockup components and existing shared Dialog, Input, Button, and Motion boundaries. Stepper state and CommandPalette execution stay local to the catalog, so all previews synchronize without URL or product-data changes.

**Tech Stack:** React 19, TanStack Start UI Lab, CSS Modules, existing `motion`, existing Radix-backed Dialog, Lucide icons already installed, Playwright, Node contract tests.

## Global Constraints

- Do not add `cmdk`, providers, Tailwind Preflight, or another animation runtime.
- Keep 3D in UI Lab mockup scope; do not create `shared/ui/stepper` or `shared/ui/command-palette` yet.
- Use existing semantic theme tokens and one neutral Market Graphite palette.
- Keep the current UI Lab URL unchanged during every mockup interaction.
- Support `prefers-reduced-motion` and 390px mobile without horizontal document overflow.
- Do not use em-dashes, AI-purple glow, gradient text, decorative badges, or fake marketing copy.

---

### Task 1: Stepper A/B/C catalog

**Files:**

- Create: `apps/web/src/pages/ui-lab/ui/stepper-command-catalog.tsx`
- Create: `apps/web/src/pages/ui-lab/ui/stepper-command-catalog.module.css`
- Create: `apps/web/test/ui-lab-stepper-command.test.ts`

**Interfaces:**

- Produces: `export function StepperCommandCatalog(): ReactElement`
- Internal variants: `type StepperVariant = 'hairline-flow' | 'soft-track' | 'ledger-steps'`
- Internal state: `type ResearchStepId = 'sources' | 'evidence' | 'impact' | 'review'`

- [ ] **Step 1: Write the failing source contract**

Assert that the catalog exports `StepperCommandCatalog`, declares all three variant IDs, renders an `ol`, exposes `aria-current="step"`, and owns one `activeStep` state shared by all previews.

- [ ] **Step 2: Run the contract and verify failure**

Run: `node --test test/ui-lab-stepper-command.test.ts`

Expected: FAIL because `stepper-command-catalog.tsx` does not exist.

- [ ] **Step 3: Implement synchronized Stepper previews**

Use this data boundary:

```ts
const researchSteps = [
  { id: 'sources', label: '소스 확인', description: '뉴스와 공시의 출처를 확인합니다.' },
  { id: 'evidence', label: '근거 연결', description: '종목과 연결된 근거를 묶습니다.' },
  { id: 'impact', label: '영향 경로', description: '기업까지 이어지는 변화를 봅니다.' },
  { id: 'review', label: '검토 완료', description: '확인한 내용을 기록합니다.' },
] as const;
```

Render each variant from the same `activeStep` state. Each step button sets only local state, completed/current/upcoming are derived from the active index, and the current button receives `aria-current="step"`.

- [ ] **Step 4: Implement variant-specific CSS and reduced motion**

A uses a horizontal hairline, B uses a low moving selection surface, C uses a compact vertical ledger. Animate only transform and opacity. Under reduced motion, remove animated movement while preserving immediate selection feedback.

- [ ] **Step 5: Run focused checks**

Run:

```bash
node --test test/ui-lab-stepper-command.test.ts
pnpm --filter @stock-insight/web typecheck
pnpm exec oxlint apps/web/src/pages/ui-lab/ui/stepper-command-catalog.tsx apps/web/test/ui-lab-stepper-command.test.ts
pnpm exec oxfmt --check apps/web/src/pages/ui-lab/ui/stepper-command-catalog.tsx apps/web/src/pages/ui-lab/ui/stepper-command-catalog.module.css apps/web/test/ui-lab-stepper-command.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/ui-lab/ui/stepper-command-catalog.tsx apps/web/src/pages/ui-lab/ui/stepper-command-catalog.module.css apps/web/test/ui-lab-stepper-command.test.ts
git commit -m "feat(ui-lab): Stepper 3안 비교 추가"
```

### Task 2: CommandPalette A/B/C interaction

**Files:**

- Modify: `apps/web/src/pages/ui-lab/ui/stepper-command-catalog.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/stepper-command-catalog.module.css`
- Modify: `apps/web/test/ui-lab-stepper-command.test.ts`
- Create: `e2e/ui-lab-stepper-command.spec.ts`

**Interfaces:**

- Internal variants: `type CommandVariant = 'compact-command' | 'split-context' | 'quick-actions'`
- Palette item: `{ id: string; group: '이동' | '실행'; label: string; description: string; shortcut?: string[]; keywords: string[] }`
- Local result: `lastAction: string | null`

- [ ] **Step 1: Extend the failing contract**

Assert the source contains all three command variant IDs, the `Cmd/Ctrl+K` listener cleanup, combobox/listbox/option semantics, ArrowUp/ArrowDown/Enter/Escape handling, empty state copy, and local `lastAction` result.

- [ ] **Step 2: Add failing browser tests**

Cover these exact behaviors:

```ts
test('opens A with Cmd/Ctrl+K and focuses search');
test('filters results and executes the active option with arrows and Enter');
test('closes with Escape without changing the URL');
test('updates B preview and renders C compact results');
test('shows an empty state for an unmatched query');
```

- [ ] **Step 3: Implement the palette state machine**

Maintain `openVariant`, `query`, and `activeIndex`. Opening resets query and active index. Filtering searches label, description, and keywords. Arrow keys clamp within results, Enter stores the selected label in `lastAction` and closes, Escape closes. A global `keydown` listener opens A for `metaKey || ctrlKey` plus `k` and is removed on unmount.

- [ ] **Step 4: Compose existing shared primitives**

Use existing `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogBody`, `Input`, and `Button`. Do not add a new provider or package. The input owns combobox attributes and the result container owns listbox semantics.

- [ ] **Step 5: Implement the three information structures**

A is one column with grouped results. B is a desktop split result/preview layout and collapses below 768px. C prioritizes recent and quick actions in a narrower panel. Reuse one item renderer while changing only the surrounding composition and density.

- [ ] **Step 6: Run focused checks**

Run the Node contract, web typecheck, owned lint/format, and the new desktop Playwright spec. Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/ui-lab/ui/stepper-command-catalog.tsx apps/web/src/pages/ui-lab/ui/stepper-command-catalog.module.css apps/web/test/ui-lab-stepper-command.test.ts e2e/ui-lab-stepper-command.spec.ts
git commit -m "feat(ui-lab): Command Palette 3안 비교 추가"
```

### Task 3: UI Lab integration and visual verification

**Files:**

- Modify: `apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx`
- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`
- Modify: `e2e/ui-lab-stepper-command.spec.ts`

**Interfaces:**

- Consumes: `StepperCommandCatalog`
- Produces: 3D under the `목업 진행 중` tab; keeps 3C under `완료` and 4A first under `예정`

- [ ] **Step 1: Add the catalog to the active UI Lab tab**

Import and render `<StepperCommandCatalog />` below the 3D status intro. Do not change the current URL props or the completed catalog composition.

- [ ] **Step 2: Add responsive, accessibility, and reduced-motion browser contracts**

At 390px verify no document overflow and every visible step/trigger is at least 44px high. Run Axe within the 3D catalog. Under reduced motion verify moving indicators do not retain transform transitions.

- [ ] **Step 3: Verify in the existing Codex in-app browser tab**

Use only the current 6110 tab. Verify all Stepper variants synchronize, A/B/C command panels open, keyboard navigation works, B collapses on mobile, C remains compact, Escape releases overlay interaction, and the URL remains unchanged.

- [ ] **Step 4: Update the rollout ledger**

Set 3D to `목업`, record the three Stepper and three CommandPalette directions, browser evidence, and leave user visual approval as the next action. Keep 4A as the next planned bundle.

- [ ] **Step 5: Run final targeted gates**

Run Node contract, web typecheck, the 3D Playwright spec for desktop and mobile, owned oxlint/oxfmt, `git diff --check`, and `graphify update .`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/ui-lab/ui/ui-lab-page.tsx docs/superpowers/UI-SYSTEM-ROLLOUT.md e2e/ui-lab-stepper-command.spec.ts
git commit -m "test(ui-lab): 3D 목업 브라우저 계약 추가"
```
