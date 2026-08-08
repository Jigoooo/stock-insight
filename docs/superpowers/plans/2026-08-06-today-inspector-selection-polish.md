# Today Inspector and Selection Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Today 뉴스 상세의 바깥 클릭 닫기·빠른 전환·밝은 공통 오버레이를 구현하고 카드 뉴스, 리스트 뉴스, 시장 연결 경로의 선택 상태를 하나의 고급스러운 전체 보더 표현으로 통일한다.

**Architecture:** 공용 `Dialog`에는 기존 기본 동작을 바꾸지 않는 `quick` 모션 프리셋과 `light` 오버레이 톤만 추가한다. `EvidenceInspector`가 이 전용 옵션과 바깥 클릭 정책, 라벨이 있는 표시 방식 전환 버튼을 선택하고, `TodayView`의 기존 `aria-current` 데이터 흐름은 유지한 채 `feed-ledger.module.css`가 카드·리스트의 동일한 선택 표면을 소유한다.

**Tech Stack:** React 19, TypeScript, Radix Dialog, Motion, CSS Modules, Node test runner, Playwright, graphify

## Global Constraints

- `apps/web`의 다른 Dialog 호출부는 현재 기본 모션과 기본 오버레이를 그대로 사용한다.
- 드로어와 모달은 모두 밝은 오버레이와 포커스 잠금을 사용한다.
- 바깥 카드 위치를 눌러도 현재 상세만 닫고 해당 클릭을 뒤 콘텐츠에 전달하지 않는다.
- 카드, 리스트, 시장 연결 경로 선택 상태에서 방향성 컬러바를 모두 제거한다.
- 선택 전후 콘텐츠 위치와 카드·행 크기가 바뀌지 않아야 한다.
- 표시 방식 전환 버튼은 `넓게 보기` / `옆에서 보기` 텍스트를 가진 36px 보조 액션이어야 하며, 32px 정사각형 X 닫기 버튼과 구분되어야 한다.
- `prefers-reduced-motion`에서는 인스펙터 전환을 즉시 끝낸다.
- 새 UI·모션 의존성을 추가하지 않는다.
- 백엔드, DB, 스키마, API 응답 계약과 `.env`를 변경하지 않는다.
- 현재 dirty `master`에서 기존 Today 변경을 보존한다. 아래 체크포인트 커밋은 사용자가 구현 커밋을 명시적으로 요청한 경우에만 실행한다.

---

### Task 1: Dialog의 범위 제한형 빠른 모션·밝은 오버레이 옵션

**Files:**

- Modify: `apps/web/src/shared/ui/dialog/dialog.tsx:18-145`
- Modify: `apps/web/src/shared/ui/dialog/dialog.module.css:1-12`
- Modify: `apps/web/test/dialog-system.test.ts`
- Modify: `apps/web/test/workspace-overlay-integration-contract.test.ts`

**Interfaces:**

- Consumes: 기존 `DialogContentProps`, `DialogPresentation`, `dialogTransition`, `dialogOverlayTransition`
- Produces: `DialogMotionPreset = 'default' | 'quick'`, `DialogOverlayTone = 'default' | 'light'`, `motionPreset?: DialogMotionPreset`, `overlayTone?: DialogOverlayTone`

- [ ] **Step 1: 공용 기본값 보존과 새 옵션을 고정하는 실패 테스트 작성**

`apps/web/test/dialog-system.test.ts`에 다음 계약을 추가한다.

```ts
it('offers scoped quick motion and a light overlay without changing dialog defaults', async () => {
  const source = await read('shared/ui/dialog/dialog.tsx');
  const css = await read('shared/ui/dialog/dialog.module.css');

  assert.match(source, /export type DialogMotionPreset = 'default' \| 'quick'/);
  assert.match(source, /export type DialogOverlayTone = 'default' \| 'light'/);
  assert.match(source, /motionPreset = 'default'/);
  assert.match(source, /overlayTone = 'default'/);
  assert.match(source, /stiffness:\s*3\d\d/);
  assert.match(source, /damping:\s*3\d/);
  assert.match(source, /data-overlay-tone=\{overlayTone\}/);
  assert.match(css, /\.overlay\[data-overlay-tone='light'\]/);
});
```

`apps/web/test/workspace-overlay-integration-contract.test.ts`에는 다른 공용 호출부의 기본값을 변경하지 않고 인스펙터가 명시적으로 옵션을 사용해야 한다는 기대를 추가한다.

```ts
assert.match(inspector, /motionPreset="quick"/);
assert.match(inspector, /overlayTone="light"/);
```

- [ ] **Step 2: 테스트가 새 타입과 호출부 부재로 실패하는지 확인**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/dialog-system.test.ts test/workspace-overlay-integration-contract.test.ts
```

Expected: `DialogMotionPreset`, `DialogOverlayTone`, `motionPreset="quick"` 또는 `overlayTone="light"`가 없어 FAIL.

- [ ] **Step 3: Dialog에 최소 범위 옵션 구현**

`apps/web/src/shared/ui/dialog/dialog.tsx`에 다음 타입과 전환을 추가한다.

```ts
export type DialogMotionPreset = 'default' | 'quick';
export type DialogOverlayTone = 'default' | 'light';

export const dialogQuickTransition = {
  type: 'spring',
  stiffness: 340,
  damping: 34,
  mass: 0.72,
} as const;
```

`DialogContentProps`와 구조 분해 기본값을 확장한다.

```ts
motionPreset?: DialogMotionPreset;
overlayTone?: DialogOverlayTone;

motionPreset = 'default',
overlayTone = 'default',
```

프레젠테이션에 따라 초기 이동을 제한하고 전환을 선택한다.

```ts
const quickMotion = motionPreset === 'quick';
const initial = reducedMotion
  ? false
  : presentation === 'modal'
    ? { y: quickMotion ? 10 : 0, x: quickMotion ? 0 : 72, opacity: 0 }
    : { x: quickMotion ? 44 : 72, opacity: 0 };
const transition = quickMotion ? dialogQuickTransition : dialogTransition;
```

`motion.div`에는 선택된 `transition`을 전달하고 Overlay에는 톤 데이터를 전달한다.

```tsx
<motion.div
  animate={{ opacity: 1 }}
  className={styles.overlay}
  data-motion-owner="motion"
  data-overlay-tone={overlayTone}
  data-slot="dialog-overlay"
  exit={{ opacity: 0, pointerEvents: 'none' }}
  initial={reducedMotion ? false : { opacity: 0 }}
  transition={reducedMotion ? { duration: 0 } : dialogOverlayTransition}
/>
```

콘텐츠 `motion.div`의 기존 `transition={dialogTransition}`은 `transition={transition}`으로 교체한다.

`apps/web/src/shared/ui/dialog/dialog.module.css`에는 테마 캔버스를 사용하는 밝은 톤을 추가한다.

```css
.overlay[data-overlay-tone='light'] {
  background: color-mix(in srgb, var(--color-canvas) 54%, transparent);
}
```

기본 `.overlay` 규칙은 수정하지 않는다.

- [ ] **Step 4: 공용 Dialog 계약 테스트 통과 확인**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/dialog-system.test.ts test/workspace-overlay-integration-contract.test.ts
```

Expected: PASS. 기존 기본 전환 상수와 AlertDialog 계약도 유지됨.

- [ ] **Step 5: 체크포인트 커밋 — 사용자 요청 시에만 실행**

```bash
git add apps/web/src/shared/ui/dialog/dialog.tsx apps/web/src/shared/ui/dialog/dialog.module.css apps/web/test/dialog-system.test.ts apps/web/test/workspace-overlay-integration-contract.test.ts
git commit -m "feat(workspace): 인스펙터 전환 모션 범위화"
```

---

### Task 2: 바깥 클릭 닫기와 구분되는 표시 방식 전환 버튼

**Files:**

- Modify: `apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx:1-265`
- Modify: `apps/web/src/pages/research-workspace/ui/relation-detail.module.css:330-430`
- Modify: `apps/web/test/task-1-product-adoption.test.ts`
- Modify: `apps/web/test/workspace-overlay-integration-contract.test.ts`
- Modify: `e2e/today-preview-experience.spec.ts`

**Interfaces:**

- Consumes: Task 1의 `DialogContent` props `motionPreset="quick"`, `overlayTone="light"`
- Produces: 차단 오버레이 바깥 클릭 닫기, 뒤 콘텐츠 비활성화, `넓게 보기` / `옆에서 보기` 보조 버튼

- [ ] **Step 1: 바깥 클릭·즉시 교체·버튼 구분 실패 테스트 작성**

`apps/web/test/workspace-overlay-integration-contract.test.ts`에서 드로어와 모달 모두 Dialog의 모달 포커스·포인터 차단과 오버레이를 사용하도록 고정한다.

```ts
assert.doesNotMatch(inspector, /onPointerDownOutside=.*preventDefault/);
assert.match(inspector, /<Dialog\s+modal\s/);
assert.match(inspector, /\bshowOverlay\s/);
assert.doesNotMatch(inspector, /onFocusOutside=/);
assert.match(inspector, /<Button[\s\S]*?넓게 보기[\s\S]*?옆에서 보기/);
assert.doesNotMatch(inspector, /<IconButton[\s\S]*?inspectorPresentationToggle/);
```

`e2e/today-preview-experience.spec.ts`에 다음 시나리오를 추가한다.

```ts
test('uses a drawer overlay that closes without activating the card behind it', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop drawer contract');
  const stories = page.getByTestId('today-headline-news').getByRole('button');
  await stories.nth(0).click();
  const inspector = page.getByTestId('evidence-inspector');
  const secondBox = await stories.nth(1).boundingBox();
  await page.mouse.click(
    (secondBox?.x ?? 0) + (secondBox?.width ?? 0) / 2,
    (secondBox?.y ?? 0) + (secondBox?.height ?? 0) / 2,
  );
  await expect(inspector).toHaveCount(0);
  await expect(stories.nth(0)).toHaveAttribute('aria-current', 'true');
  await expect(stories.nth(1)).toHaveAttribute('aria-current', 'false');
});
```

같은 파일에 모달 오버레이 클릭 닫기와 전환 버튼 기하를 추가한다.

```ts
await inspector.getByRole('button', { name: '넓게 보기' }).click();
const switchButton = inspector.getByRole('button', { name: '옆에서 보기' });
const box = await switchButton.boundingBox();
expect(box?.height).toBeCloseTo(36, 0);
expect(box?.width ?? 0).toBeGreaterThan(box?.height ?? 0);
await page.mouse.click(8, 8);
await expect(inspector).toHaveCount(0);
```

- [ ] **Step 2: 기존 바깥 클릭 방지와 아이콘 전용 버튼 때문에 실패하는지 확인**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/task-1-product-adoption.test.ts test/workspace-overlay-integration-contract.test.ts
PLAYWRIGHT_SKIP_WEB_SERVER=1 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/today-preview-experience.spec.ts --project=desktop --grep "dismisses outside|toggles the same evidence"
```

Expected: 정적 계약은 `preventDefault`와 `IconButton` 때문에 FAIL하고, 브라우저 테스트는 드로어가 닫히지 않거나 새 라벨을 찾지 못해 FAIL.

- [ ] **Step 3: EvidenceInspector 동작과 버튼 구현**

`apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx`에서 `IconButton`을 `Button`으로 교체한다.

```ts
import { Button } from '@/shared/ui/button';
```

`DialogContent`에 Task 1 옵션을 적용하고 포인터 바깥 클릭 방지 handler를 제거한다.

```tsx
motionPreset = 'quick';
overlayTone = 'light';
showOverlay;
```

기존 `onPointerDownOutside` prop 블록은 전체 삭제한다.

표시 방식 버튼을 라벨이 있는 보조 액션으로 변경한다.

```tsx
<Button
  className={styles.inspectorPresentationToggle}
  motion="quiet"
  size="sm"
  variant="secondary"
  onClick={() => setDesktopPresentation((current) => (current === 'drawer' ? 'modal' : 'drawer'))}
>
  {desktopPresentation === 'drawer' ? (
    <>
      <Maximize2 aria-hidden="true" />
      <span>넓게 보기</span>
    </>
  ) : (
    <>
      <PanelRight aria-hidden="true" />
      <span>옆에서 보기</span>
    </>
  )}
</Button>
```

`relation-detail.module.css`에서 버튼을 X와 다른 pill형 36px 액션으로 만든다.

```css
.inspectorHeader {
  padding-right: 182px;
}

.inspectorPresentationToggle[data-slot='button-control'] {
  min-height: 36px;
  position: absolute;
  top: 15px;
  right: 62px;
  padding-inline: 12px;
  border-radius: 999px;
  box-shadow:
    0 4px 12px rgb(20 21 19 / 7%),
    inset 0 1px rgb(255 255 255 / 42%);
}
```

모바일 숨김 규칙은 그대로 유지한다.

- [ ] **Step 4: 바깥 클릭과 버튼 테스트 통과 확인**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/task-1-product-adoption.test.ts test/workspace-overlay-integration-contract.test.ts
PLAYWRIGHT_SKIP_WEB_SERVER=1 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/today-preview-experience.spec.ts --project=desktop --grep "dismisses outside|toggles the same evidence"
```

Expected: 한 클릭 새 상세 교체, 빈 바깥 영역 닫기, 모달 오버레이 닫기, 36px 라벨 버튼이 모두 PASS.

- [ ] **Step 5: 체크포인트 커밋 — 사용자 요청 시에만 실행**

```bash
git add apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx apps/web/src/pages/research-workspace/ui/relation-detail.module.css apps/web/src/shared/ui/dialog/dialog.tsx apps/web/src/shared/ui/dialog/dialog.module.css apps/web/test/task-1-product-adoption.test.ts apps/web/test/workspace-overlay-integration-contract.test.ts e2e/today-preview-experience.spec.ts
git commit -m "feat(workspace): 상세 닫기와 전환 동작 개선"
```

---

### Task 3: 카드·리스트·연결 경로 선택 표면 통일

**Files:**

- Modify: `apps/web/src/pages/research-workspace/ui/feed-ledger.module.css:96-140, 296-338, 470-482`
- Modify: `apps/web/test/research-workspace-v3-structure.test.ts`
- Modify: `e2e/today-preview-experience.spec.ts`

**Interfaces:**

- Consumes: `TodayView`가 카드와 리스트 버튼에 제공하는 `aria-current={selected}`
- Produces: 방향성 컬러바 없는 동일한 선택 배경·전체 보더·깊이 효과와 잘리지 않는 목록 여백

- [ ] **Step 1: 선택 표면 통일 실패 테스트 작성**

`apps/web/test/research-workspace-v3-structure.test.ts`에서 방향성 inset shadow를 금지하고 공통 선택 selector를 요구한다.

```ts
assert.doesNotMatch(css, /box-shadow:\s*0 3px 0 var\(--color-accent\) inset/);
assert.doesNotMatch(css, /box-shadow:\s*3px 0 0 var\(--color-accent\) inset/);
assert.match(
  css,
  /\.headlineCard\[aria-current='true'\],\s*\.feedRow\[aria-current='true'\]\s*\{[^}]*border-color:[^}]*background:[^}]*box-shadow:/,
);
assert.match(
  css,
  /\.feedRow\[data-slot='button-control'\]\s*\{[^}]*border:\s*1px solid transparent/,
);
```

`e2e/today-preview-experience.spec.ts`에 카드와 리스트의 선택 계산값을 비교한다.

```ts
test('uses one full-border selected surface for cards and list rows', async ({ page }) => {
  const card = page.getByTestId('today-headline-news').getByRole('button').first();
  await card.click();
  const cardStyle = await card.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    border: getComputedStyle(element).borderColor,
  }));

  const row = page.getByTestId('today-news-list').getByTestId('research-feed-record').first();
  await row.click();
  const rowStyle = await row.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    border: getComputedStyle(element).borderColor,
  }));

  expect(rowStyle).toEqual(cardStyle);
  expect(rowStyle.border).not.toBe('rgba(0, 0, 0, 0)');
});
```

- [ ] **Step 2: 기존 상단·좌측 컬러바 때문에 실패하는지 확인**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/research-workspace-v3-structure.test.ts
PLAYWRIGHT_SKIP_WEB_SERVER=1 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/today-preview-experience.spec.ts --grep "one full-border selected surface"
```

Expected: 기존 방향성 inset shadow와 리스트의 `border: 0` 때문에 FAIL.

- [ ] **Step 3: 공통 선택 표면 구현**

`feed-ledger.module.css`에서 리스트 행이 항상 보더 공간을 예약하게 한다.

```css
.feedRow[data-slot='button-control'] {
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
}
```

두 개별 선택 규칙의 방향성 shadow를 제거하고 공통 규칙으로 합친다.

```css
.headlineCard[aria-current='true'],
.feedRow[aria-current='true'] {
  border-color: color-mix(in srgb, var(--color-accent) 34%, var(--color-border-strong));
  background: color-mix(in srgb, var(--color-accent) 7%, var(--color-surface));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-accent) 9%, transparent) inset,
    0 8px 22px rgb(20 21 19 / 6%);
}
```

hover 규칙은 `[aria-current='true']`를 계속 제외하고 focus-visible은 공용 Button의 focus ring을 유지한다.

- [ ] **Step 4: 정적·브라우저 선택 상태 테스트 통과 확인**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/research-workspace-v3-structure.test.ts
PLAYWRIGHT_SKIP_WEB_SERVER=1 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/today-preview-experience.spec.ts --grep "one full-border selected surface"
```

Expected: 카드·리스트 계산 배경과 보더가 동일하고 방향성 컬러바가 없어 PASS.

- [ ] **Step 5: 체크포인트 커밋 — 사용자 요청 시에만 실행**

```bash
git add apps/web/src/pages/research-workspace/ui/feed-ledger.module.css apps/web/test/research-workspace-v3-structure.test.ts e2e/today-preview-experience.spec.ts
git commit -m "style(workspace): 뉴스 선택 표면 통일"
```

---

### Task 4: 실제 화면·회귀·릴리스 검증

**Files:**

- Verify: `apps/web/src/shared/ui/dialog/dialog.tsx`
- Verify: `apps/web/src/shared/ui/dialog/dialog.module.css`
- Verify: `apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx`
- Verify: `apps/web/src/pages/research-workspace/ui/relation-detail.module.css`
- Verify: `apps/web/src/pages/research-workspace/ui/feed-ledger.module.css`
- Verify: `e2e/today-preview-experience.spec.ts`

**Interfaces:**

- Consumes: Tasks 1~3의 완성된 인스펙터 동작과 선택 스타일
- Produces: 브라우저 시각 증거, 전체 회귀 결과, 명시적인 DB 검증 공백 기록

- [ ] **Step 1: 관련 Node 계약 전체 실행**

Run:

```bash
pnpm --filter @stock-insight/web exec node --test test/dialog-system.test.ts test/research-workspace-v3-structure.test.ts test/task-1-product-adoption.test.ts test/workspace-overlay-integration-contract.test.ts test/workspace-shell-current-contract.test.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 2: Today 데스크톱·모바일·reduced-motion 전체 실행**

Run:

```bash
PLAYWRIGHT_SKIP_WEB_SERVER=1 STOCK_INSIGHT_E2E_EXISTING_SERVER_ACK=I_ACKNOWLEDGE_EXISTING_SERVER pnpm exec playwright test e2e/today-preview-experience.spec.ts
```

Expected: 데스크톱·모바일 대상 테스트 PASS, 플랫폼 비대상 테스트만 명시적으로 skip.

- [ ] **Step 3: 실제 1440×960과 390×844 화면 확인**

데스크톱에서 다음을 직접 확인한다.

- 카드 선택: 컬러바 없이 전체 보더와 은은한 배경만 표시
- 리스트 선택: 카드와 같은 배경·보더·그림자
- 드로어 진입: 빠르게 안정되고 본문을 밀지 않음
- 바깥 카드 위치 클릭: 뒤 카드는 활성화되지 않고 드로어만 닫힘
- 연결 경로 선택: 카드·리스트와 같은 배경·전체 보더·그림자
- `넓게 보기`: 36px 라벨 pill 버튼이며 X와 구분
- 중앙 모달: 밝은 오버레이, 배경 구조 식별 가능, 오버레이 클릭 닫힘

모바일에서는 전환 버튼이 없고 기존 하단 모달과 포커스 잠금이 유지되는지 확인한다.

- [ ] **Step 4: graphify와 정적 검증 갱신**

Run:

```bash
graphify update .
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Expected: 포맷, lint, typecheck, 테스트, build, diff check 모두 exit 0.

- [ ] **Step 5: 전체 릴리스 게이트 시도와 DB 경계 기록**

Run:

```bash
pnpm verify:release
```

Expected: 일회용 `STOCK_INSIGHT_E2E_DATABASE_URL`이 제공된 환경에서는 전체 PASS. 현재처럼 값이 없으면 `test:p6:db`의 `ERR_INVALID_URL`에서 중단되는 사실을 기록하고, 이 UI 작업을 위해 DB를 생성하거나 조작하지 않는다.

- [ ] **Step 6: 최종 작업 트리와 민감 파일 확인**

Run:

```bash
git status --short --branch
git status --short -- .env
git diff --check
```

Expected: `.env` 출력 없음. 기존 dirty Today 변경과 이번 변경만 남고 공백 오류 없음.

- [ ] **Step 7: 최종 커밋 — 사용자가 요청한 경우에만 실행**

```bash
git add apps/web/src/shared/ui/dialog/dialog.tsx apps/web/src/shared/ui/dialog/dialog.module.css apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx apps/web/src/pages/research-workspace/ui/relation-detail.module.css apps/web/src/pages/research-workspace/ui/feed-ledger.module.css apps/web/test/dialog-system.test.ts apps/web/test/research-workspace-v3-structure.test.ts apps/web/test/task-1-product-adoption.test.ts apps/web/test/workspace-overlay-integration-contract.test.ts e2e/today-preview-experience.spec.ts
git commit -m "feat(workspace): Today 상세 탐색 경험 개선"
```
