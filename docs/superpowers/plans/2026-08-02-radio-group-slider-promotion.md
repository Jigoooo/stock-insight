# RadioGroup + Slider 공용화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI Lab에서 승인된 `RadioGroup`과 `Slider`의 세 가지 시각 변형을 접근 가능한 `shared/ui` 공개 컴포넌트로 승격하고, UI Lab을 실제 공용 API 소비자로 바꾼다.

**Architecture:** Radix UI의 `RadioGroup`과 `Slider` primitives가 keyboard semantics, focus management, controlled/uncontrolled state를 소유한다. Stock Insight의 `shared/ui/radio-group`과 `shared/ui/slider`는 Market Graphite 토큰, 세 가지 승인 variant, pending/disabled 상태와 reduced-motion CSS만 소유한다. 제품 계층에는 현재 실제 RadioGroup/Slider 요구사항이 없으므로 가짜 기능을 추가하지 않고 UI Lab을 브라우저 fixture로 사용한다.

**Tech Stack:** React 19, TypeScript 6, Radix UI 1.6.7 umbrella package, CSS Modules, Playwright 1.60, Node test runner, pnpm 10.

## Global Constraints

- 한 번에 활성화되는 묶음은 `1A RadioGroup + Slider` 하나뿐이다.
- 승인 variant 이름은 정확히 `hairline | inset | rail`이다.
- 공용 구현은 `@/shared/ui/radio-group`과 `@/shared/ui/slider` public API로만 노출한다.
- UI Lab은 공용 컴포넌트를 소비하며 raw `<input type="radio">`와 `<input type="range">` 구현을 소유하지 않는다.
- Radix UI 외의 Provider, UI runtime, 애니메이션 dependency를 추가하지 않는다.
- focus, selected, disabled, pending 상태 스타일은 공용 컴포넌트가 단독 소유한다.
- motion은 CSS transition만 사용하며 `prefers-reduced-motion`에서 transform과 긴 transition을 제거한다.
- 실제 제품 사용처가 없으면 가짜 filter나 설정 기능을 만들지 않는다.
- light/dark 토큰은 기존 `--color-*`, `--radius-*`, `--duration-*`, `--ease-*` 변수를 그대로 사용한다.
- 최소 검증은 공용 props fixture typecheck, 관련 Node 계약 테스트, desktop/mobile Playwright, web typecheck, lint, build, `git diff --check`, `graphify update .`이다.

---

### Task 1: RadioGroup 공개 컴포넌트

**Files:**
- Create: `apps/web/src/shared/ui/radio-group/radio-group.tsx`
- Create: `apps/web/src/shared/ui/radio-group/radio-group.module.css`
- Create: `apps/web/src/shared/ui/radio-group/index.ts`
- Modify: `apps/web/src/shared/ui/index.ts`
- Modify: `e2e/fixtures/control-public-props/main.tsx`
- Create: `apps/web/test/shared-choice-controls.test.ts`

**Interfaces:**
- Consumes: `RadioGroup as RadioGroupPrimitive` from `radix-ui`, `cn` from `@/shared/lib/utils`.
- Produces:

```ts
export type RadioGroupVariant = 'hairline' | 'inset' | 'rail';

export type RadioGroupOption = {
  description?: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  value: string;
};

export type RadioGroupProps = Omit<
  ComponentProps<typeof RadioGroupPrimitive.Root>,
  'children'
> & {
  label?: ReactNode;
  items: readonly RadioGroupOption[];
  pending?: boolean;
  variant?: RadioGroupVariant;
};

export function RadioGroup(props: RadioGroupProps): ReactElement;
```

- Anatomy: root `data-slot="radio-group"`, item `data-slot="radio-group-item"`, indicator `data-slot="radio-group-indicator"`, label `data-slot="control-label"`.
- Default variant: `hairline`. `pending` sets `aria-busy` and disables every option without destroying the selected value.

- [ ] **Step 1: Write failing public-contract tests**

Add a `RadioGroup` consumer to `e2e/fixtures/control-public-props/main.tsx`:

```tsx
<RadioGroup
  aria-label="Research scope"
  items={[
    { label: 'Holdings', value: 'holding' },
    { description: 'Watched names', label: 'Watchlist', value: 'watch' },
  ]}
  onValueChange={() => undefined}
  value="watch"
  variant="rail"
/>
```

Create `shared-choice-controls.test.ts` with a test that reads the new public module and asserts the Radix root, the three variant union members, canonical `data-slot` anatomy, `pending` disable behavior, and `shared/ui/index.ts` export.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm typecheck:controls:fixture
pnpm --filter @stock-insight/web exec node --test test/shared-choice-controls.test.ts
```

Expected: both commands fail because `@/shared/ui/radio-group` and its public implementation do not exist.

- [ ] **Step 3: Implement the minimal RadioGroup**

Implement the interface verbatim using Radix `Root`, `Item`, and `Indicator`. Generate a label id with `useId`; when `label` exists, connect it through `aria-labelledby` unless the caller already supplied one. Keep label and description inside each Radix item so its accessible name contains both. Style all three approved variants in the component CSS Module and give focus-visible a single subtle two-pixel halo on the visual radio mark.

- [ ] **Step 4: Verify GREEN**

Run the two Step 2 commands and expect PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/ui/radio-group apps/web/src/shared/ui/index.ts \
  apps/web/test/shared-choice-controls.test.ts e2e/fixtures/control-public-props/main.tsx
git commit -m "feat(ui): add shared radio group"
```

### Task 2: Slider 공개 컴포넌트

**Files:**
- Create: `apps/web/src/shared/ui/slider/slider.tsx`
- Create: `apps/web/src/shared/ui/slider/slider.module.css`
- Create: `apps/web/src/shared/ui/slider/index.ts`
- Modify: `apps/web/src/shared/ui/index.ts`
- Modify: `e2e/fixtures/control-public-props/main.tsx`
- Modify: `apps/web/test/shared-choice-controls.test.ts`

**Interfaces:**
- Consumes: `Slider as SliderPrimitive` from `radix-ui`, `cn` from `@/shared/lib/utils`.
- Produces:

```ts
export type SliderVariant = 'hairline' | 'inset' | 'rail';

export type SliderProps = Omit<ComponentProps<typeof SliderPrimitive.Root>, 'children'> & {
  endLabel?: ReactNode;
  formatValue?: (values: readonly number[]) => ReactNode;
  label?: ReactNode;
  pending?: boolean;
  startLabel?: ReactNode;
  thumbLabels?: readonly string[];
  variant?: SliderVariant;
};

export function Slider(props: SliderProps): ReactElement;
```

- Anatomy: root `data-slot="slider-control"`, track `data-slot="slider-track"`, range `data-slot="slider-range"`, thumb `data-slot="slider-thumb"`, value output `data-slot="slider-value"`.
- Default variant: `hairline`. Thumb count is derived from controlled `value`, otherwise `defaultValue`, otherwise `[min ?? 0]`. `pending` sets `aria-busy` and disables the root.

- [ ] **Step 1: Extend tests first**

Add this fixture consumer:

```tsx
<Slider
  aria-label="Confidence threshold"
  endLabel="Strict"
  onValueChange={() => undefined}
  startLabel="Broad"
  thumbLabels={['Confidence threshold']}
  value={[64]}
  variant="inset"
/>
```

Extend `shared-choice-controls.test.ts` to assert the Radix anatomy, three variant union members, pending disable behavior, derived thumb rendering, and public export.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm typecheck:controls:fixture
pnpm --filter @stock-insight/web exec node --test test/shared-choice-controls.test.ts
```

Expected: FAIL because `@/shared/ui/slider` does not exist.

- [ ] **Step 3: Implement the minimal Slider**

Use Radix `Root`, `Track`, `Range`, and one `Thumb` for every derived value. Render the optional heading only when `label` or `formatValue` is supplied. Call `formatValue(values)` for the output and default to a localized comma-separated numeric value. Render scale labels only when either endpoint label exists. Use a three-pixel track, 16px circular thumbs, token colors, one subtle focus halo, and the approved inset/rail containers.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 commands and expect PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/ui/slider apps/web/src/shared/ui/index.ts \
  apps/web/test/shared-choice-controls.test.ts e2e/fixtures/control-public-props/main.tsx
git commit -m "feat(ui): add shared slider"
```

### Task 3: UI Lab 이식과 브라우저 계약

**Files:**
- Modify: `apps/web/src/pages/ui-lab/ui/input-action-catalog.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/input-action-catalog.module.css`
- Modify: `apps/web/test/ui-lab-input-actions.test.ts`
- Create: `e2e/ui-lab-choice-controls.spec.ts`
- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`

**Interfaces:**
- Consumes: `RadioGroup`, `RadioGroupVariant` from `@/shared/ui/radio-group`; `Slider`, `SliderVariant` from `@/shared/ui/slider`.
- Produces: UI Lab fixtures that exercise all `hairline`, `inset`, `rail` variants without duplicating control-state CSS.

- [ ] **Step 1: Write failing UI Lab adoption tests**

Update `ui-lab-input-actions.test.ts` so the 1A contract requires imports from both canonical public paths, rejects raw `type="radio"` and `type="range"` inside `RadioPreview`/`SliderPreview`, and rejects `.radioMark` plus range pseudo-element ownership from the page CSS.

Create `ui-lab-choice-controls.spec.ts` with these observable checks:

```ts
test('selects every approved radio variant with keyboard semantics', async ({ page }) => {
  // Open /__ui-lab, keep RadioGroup active, inspect all three direction cards.
  // In each card focus the selected radio, press ArrowRight, and expect the next radio checked.
});

test('updates every approved slider variant from the keyboard', async ({ page }) => {
  // Open Slider category, focus each slider, press ArrowRight, and expect its output to move 64% -> 65%.
});

test('keeps choice controls compact on desktop and tappable on mobile', async ({ page }, testInfo) => {
  // Assert compact desktop controls and >=44px mobile option hit targets without horizontal overflow.
});

test('removes transform motion in reduced-motion mode', async ({ page }) => {
  // Select a radio and move a slider; computed transforms remain none while selected/value feedback remains visible.
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/ui-lab-input-actions.test.ts
PLAYWRIGHT_PORT=18101 pnpm exec playwright test e2e/ui-lab-choice-controls.spec.ts --project=desktop
```

Expected: Node contract fails because UI Lab still owns raw controls; Playwright fails because canonical `data-slot` anatomy is absent.

- [ ] **Step 3: Replace previews with shared components**

Remove `useId` and raw native inputs from the two preview functions. Pass `direction` directly as the shared component `variant`, preserve the approved Korean labels and the 64% initial value, and format Slider output as `${values[0] ?? 0}%`. Delete only the RadioGroup/Slider control-state rules from `input-action-catalog.module.css`; retain generic preview layout rules that are still used by other catalog categories.

- [ ] **Step 4: Verify GREEN and audit product usage**

Run the Step 2 commands for both desktop and mobile. Then run:

```bash
rg -n "type=['\"](?:radio|range)['\"]|<RadioGroup|<Slider" \
  apps/web/src/pages apps/web/src/widgets apps/web/src/features apps/web/src/entities
```

Expected: RadioGroup/Slider product usage is absent outside UI Lab; record this truth in the rollout ledger instead of adding a fake feature.

- [ ] **Step 5: Run the bundle gate**

```bash
pnpm typecheck:controls:fixture
pnpm --filter @stock-insight/web exec node --test \
  test/shared-choice-controls.test.ts \
  test/ui-lab-input-actions.test.ts \
  test/shared-state-controls.test.ts \
  test/primitive-adoption-contract.test.ts \
  test/shared-ui-boundary.test.ts
pnpm --filter @stock-insight/web typecheck
pnpm --filter @stock-insight/web lint
pnpm --filter @stock-insight/web build
PLAYWRIGHT_PORT=18101 pnpm exec playwright test e2e/ui-lab-choice-controls.spec.ts
git diff --check
graphify update .
```

- [ ] **Step 6: Update the rollout ledger and commit**

Set 1A to `검증 완료`, clear the active bundle, set the next bundle to `1B Calendar + DatePicker + RangePicker`, and record commits, tests, browser matrix, and the no-product-usage ruling.

```bash
git add apps/web/src/pages/ui-lab/ui/input-action-catalog.tsx \
  apps/web/src/pages/ui-lab/ui/input-action-catalog.module.css \
  apps/web/test/ui-lab-input-actions.test.ts \
  e2e/ui-lab-choice-controls.spec.ts \
  docs/superpowers/UI-SYSTEM-ROLLOUT.md
git commit -m "feat(ui): promote choice controls"
```
