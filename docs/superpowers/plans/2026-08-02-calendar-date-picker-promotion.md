# Calendar + DatePicker + RangePicker 공용화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Every production behavior starts with a failing test.

**Goal:** UI Lab에서 승인된 Calendar 세 variant와 DatePicker/RangePicker 세 surface variant를 접근 가능한 `shared/ui` 공개 컴포넌트로 승격하고, UI Lab을 실제 공용 API 소비자로 전환한다.

**Architecture:** `@daypicker/react@10.0.1`이 날짜 grid, roving focus, single/range selection과 월 탐색을 소유한다. `Calendar`는 한국어 locale, Market Graphite 토큰과 `compact | soft-inset | ledger` 외형만 소유한다. `DatePicker`와 `RangePicker`는 Radix Popover를 내부 focus/overlay 경계로 사용하고, 읽기 가능한 trigger 값과 controlled/uncontrolled 상태를 제공한다. 제품 계층에 실제 날짜 입력 요구가 없으면 가짜 기능은 만들지 않고 UI Lab을 상호작용 fixture로 유지한다.

**Tech Stack:** React 19, TypeScript 6, `@daypicker/react` 10.0.1, Radix UI 1.6.7 Popover, CSS Modules, Playwright 1.60, Node test runner, pnpm 10.

## Global Constraints

- 활성 묶음은 `1B 날짜 입력` 하나뿐이다.
- Calendar 공개 variant는 정확히 `compact | soft-inset | ledger`다.
- DatePicker/RangePicker 공개 variant는 정확히 `hairline | inset | rail`이다.
- 날짜 행동과 keyboard 계약은 variant에 따라 분기하지 않는다.
- 날짜 값은 popup을 열지 않아도 trigger 텍스트로 읽을 수 있어야 한다.
- Calendar 날짜 셀은 둥근 사각형이며 desktop은 승인 밀도, 390px은 최소 44px hit area를 제공한다.
- UI Lab은 `@/shared/ui/calendar`, `@/shared/ui/date-picker` 공개 API만 소비한다.
- motion은 CSS와 저장소의 motion 경계만 사용하며 reduced motion에서 transform/reveal을 제거한다.
- 실제 제품 사용처가 없으면 UI Lab 외 가짜 filter나 폼을 추가하지 않는다.
- 검증은 타입 fixture, 관련 Node 테스트, desktop/mobile Playwright, web typecheck/lint/build, `git diff --check`, `graphify update .`를 포함한다.

---

### Task 1: Calendar 공개 컴포넌트

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/shared/ui/calendar/calendar.tsx`
- Create: `apps/web/src/shared/ui/calendar/calendar.module.css`
- Create: `apps/web/src/shared/ui/calendar/index.ts`
- Modify: `apps/web/src/shared/ui/index.ts`
- Modify: `e2e/fixtures/control-public-props/main.tsx`
- Create: `apps/web/test/shared-date-controls.test.ts`

**Public API:**

```ts
export type CalendarVariant = 'compact' | 'soft-inset' | 'ledger';

export type CalendarProps = Omit<DayPickerProps, 'mode' | 'selected' | 'onSelect'> & {
  disabled?: Matcher | Matcher[];
  onValueChange?: (value: Date | undefined) => void;
  pending?: boolean;
  value?: Date;
  defaultValue?: Date;
  variant?: CalendarVariant;
};
```

- Anatomy: `calendar`, `calendar-caption`, `calendar-grid`, `calendar-day`, `calendar-nav-previous`, `calendar-nav-next` data slots.
- 한국어 locale과 월 label을 기본 제공하되 caller override를 허용한다.
- controlled/uncontrolled 값, disabled, pending, outside day, today를 하나의 계약으로 처리한다.

- [ ] Write fixture and contract/behavior tests first; verify failure because the public module is absent.
- [ ] Add exact `@daypicker/react@10.0.1` dependency and implement the minimal Calendar.
- [ ] Verify controlled/uncontrolled selection, month navigation, keyboard selection, three variants and mobile hit area.
- [ ] Commit Calendar as one reviewable unit.

### Task 2: DatePicker 공개 컴포넌트

**Files:**
- Create: `apps/web/src/shared/ui/date-picker/date-picker.tsx`
- Create: `apps/web/src/shared/ui/date-picker/date-picker.module.css`
- Create: `apps/web/src/shared/ui/date-picker/date-format.ts`
- Create: `apps/web/src/shared/ui/date-picker/index.ts`
- Modify: `apps/web/src/shared/ui/index.ts`
- Modify: `e2e/fixtures/control-public-props/main.tsx`
- Modify: `apps/web/test/shared-date-controls.test.ts`

**Public API:**

```ts
export type DatePickerVariant = 'hairline' | 'inset' | 'rail';

export type DatePickerProps = {
  value?: Date;
  defaultValue?: Date;
  onValueChange?: (value: Date | undefined) => void;
  label?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  pending?: boolean;
  variant?: DatePickerVariant;
  calendarVariant?: CalendarVariant;
};
```

- Radix Popover가 open/close, Escape, outside click, focus return을 소유한다.
- trigger는 현재 날짜를 `Intl.DateTimeFormat('ko-KR')`로 항상 읽을 수 있게 표시한다.
- 선택 후 popup은 닫히고 trigger로 focus가 복귀한다.

- [ ] Extend tests first; verify RED for absent DatePicker.
- [ ] Implement readable trigger, controlled/uncontrolled selection and Popover focus contract.
- [ ] Verify three variants, disabled/invalid/pending and reduced motion.
- [ ] Commit DatePicker as one reviewable unit.

### Task 3: RangePicker 공개 컴포넌트

**Files:**
- Create: `apps/web/src/shared/ui/date-picker/range-picker.tsx`
- Modify: `apps/web/src/shared/ui/date-picker/date-picker.module.css`
- Modify: `apps/web/src/shared/ui/date-picker/index.ts`
- Modify: `e2e/fixtures/control-public-props/main.tsx`
- Modify: `apps/web/test/shared-date-controls.test.ts`

**Public API:**

```ts
export type DateRangeValue = { from?: Date; to?: Date };

export type RangePickerProps = {
  value?: DateRangeValue;
  defaultValue?: DateRangeValue;
  onValueChange?: (value: DateRangeValue | undefined) => void;
  startLabel?: ReactNode;
  endLabel?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  pending?: boolean;
  variant?: DatePickerVariant;
  calendarVariant?: CalendarVariant;
};
```

- single Calendar range mode를 사용하며 시작/종료 값을 popup 없이 trigger에서 읽을 수 있게 한다.
- 첫 선택은 열린 범위, 두 번째 선택은 완료 범위가 된다. 완료 후 focus는 trigger로 복귀한다.

- [ ] Extend tests first; verify RED for absent RangePicker.
- [ ] Implement controlled/uncontrolled range selection and readable range trigger.
- [ ] Verify range reset, keyboard selection, open/close/focus and three variants.
- [ ] Commit RangePicker as one reviewable unit.

### Task 4: UI Lab 이식과 번들 검증

**Files:**
- Modify: `apps/web/src/pages/ui-lab/ui/input-action-catalog.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/input-action-catalog.module.css`
- Modify: `apps/web/test/ui-lab-input-actions.test.ts`
- Create: `e2e/ui-lab-date-controls.spec.ts`
- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`

- [x] Write UI Lab adoption and browser tests first; verify RED while raw calendar/date preview remains.
- [x] Replace `CalendarPreview` with shared Calendar using the A/B/C-to-public-variant adapter.
- [x] Replace `DateRangePreview` with shared DatePicker and RangePicker; preserve all three approved surface variants.
- [x] Remove page-owned date focus/selected/open styling and keep only catalog layout.
- [x] Audit product usage and record no-use truth instead of creating a fake feature.
- [x] Run the full 1B gate: fixture typecheck, Node contracts, desktop/mobile Playwright, typecheck, lint, build, diff check and graphify.
- [x] Update the ledger to `1B 검증 완료`, clear active bundle, and point to `1C FileUpload + Dropzone`.
