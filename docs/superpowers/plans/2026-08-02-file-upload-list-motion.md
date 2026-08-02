# FileUpload 목록 모션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI Lab의 FileUpload 비교를 승인된 A `hairline`·B `inset`만 남기고, 파일 추가·삭제·재정렬이 구분되는 Motion 기반 목록 애니메이션을 구현한다.

**Architecture:** 기존 `UploadPreview`의 native file input, drag-and-drop, 단일·다중 선택 상태는 그대로 유지한다. 목록 행만 `AnimatePresence mode="popLayout"`와 `motion.li layout="position"`으로 전환하며, 각 행의 삭제 직전 index로 좌우 퇴장 방향을 정한다. reduced motion은 `useReducedMotion()`에서 분기해 transform과 layout tween을 없애고 opacity만 유지한다. FileUpload 카탈로그 렌더링은 해당 카테고리에서만 `rail`을 제외한다.

**Tech Stack:** React 19, TypeScript, Motion (`motion/react`), CSS Modules, Node test runner, Playwright, pnpm, Graphify.

## Global Constraints

- 작업 기준선은 `/Users/kimjigoooo/workspace/futur/stock-insight/.worktrees/hybrid-research-charts`의 `codex/shared-ui-catalog-charts` 브랜치다.
- 현재 수정 중인 UI Lab 파일 세 개는 승인된 기존 목업 작업이다. 되돌리거나 다른 브랜치의 버전으로 덮어쓰지 않는다.
- 이번 범위는 UI Lab FileUpload 목업의 A/B 노출과 목록 모션뿐이다. 아직 `shared/ui/file-upload` 제품 컴포넌트로 승격하지 않는다.
- FileUpload 외 카테고리는 현재 A/B/C 비교를 그대로 유지한다.
- 새 패키지를 추가하지 않는다. 모션은 이미 설치된 `motion/react`만 사용한다.
- React key는 `file.id`를 유지한다. index를 key로 사용하지 않는다.
- 기본 모션 계약은 다음과 같다.
  - 추가: `opacity: 0 → 1`, `y: 6 → 0`, index당 `28ms`, `160ms` ease-out.
  - 삭제: 삭제 직전 index가 짝수면 `x: -18`, 홀수면 `x: 18`, `opacity: 1 → 0`, `scale: 1 → 0.985`, `140ms` ease-in.
  - 재정렬: 새 index당 `18ms`, bounce 없는 약 `240ms` layout spring.
  - reduced motion: x/y/scale/layout tween을 제거하고 `100ms` opacity만 유지한다.
- CSS `upload-file-enter` keyframe은 제거해 Motion과 중복 실행되지 않게 한다. drag feedback keyframe은 이번 범위에서 유지한다.
- 사람이 보는 확인은 현재 열려 있는 Codex 인앱 브라우저의 단일 탭 `http://127.0.0.1:6100/__ui-lab`에서만 한다. 외부 브라우저를 열지 않는다.
- 각 Task는 테스트 실패 확인 → 최소 구현 → 테스트 통과 → 커밋 순서로 진행한다.

---

### Task 1: FileUpload 비교 화면을 승인된 A/B로 제한

**Files:**

- Modify: `apps/web/test/ui-lab-input-actions.test.ts`
- Modify: `apps/web/src/pages/ui-lab/ui/input-action-catalog.tsx`

- [ ] **Step 1: A/B 전용 렌더 계약을 실패 테스트로 추가**

  기존 `records approved directions...` 테스트 아래에 FileUpload만 `rail`을 렌더 대상에서 제외한다는 소스 계약을 추가한다.

  ```ts
  it('renders only the approved upload directions while preserving three-way comparisons elsewhere', async () => {
    const catalog = await readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx');

    assert.match(
      catalog,
      /activeCategory === 'upload'[\s\S]*directions\.filter\(\(\{ id \}\) => id !== 'rail'\)/,
    );
    assert.match(catalog, /visibleDirections\.map\(\(defaultDirection\) =>/);
  });
  ```

- [ ] **Step 2: 집중 테스트가 현재 구현에서 실패하는지 확인**

  Run:

  ```bash
  pnpm --filter @stock-insight/web exec node --test test/ui-lab-input-actions.test.ts
  ```

  Expected: 새 테스트가 `visibleDirections` 또는 upload filter를 찾지 못해 실패한다.

- [ ] **Step 3: FileUpload에서만 `rail`을 제외하는 렌더 목록 구현**

  `InputActionCatalog`의 상태 계산부에 다음 값을 추가하고 비교 그리드의 `directions.map`을 `visibleDirections.map`으로 교체한다.

  ```ts
  const visibleDirections =
    activeCategory === 'upload'
      ? directions.filter(({ id }) => id !== 'rail')
      : directions;
  ```

  이 필터는 `selectedDirections`의 승인 데이터와 같은 결론을 내리지만, 이번 단계에서는 FileUpload만 시각적으로 숨긴다는 의도를 명시한다. Calendar, OTP, SplitButton 등은 계속 세 방향을 렌더링한다.

- [ ] **Step 4: 집중 테스트와 타입 검사를 통과시킴**

  Run:

  ```bash
  pnpm --filter @stock-insight/web exec node --test test/ui-lab-input-actions.test.ts
  pnpm --filter @stock-insight/web typecheck
  ```

  Expected: UI Lab 입력·액션 테스트 전부 통과, TypeScript 오류 0개.

- [ ] **Step 5: Task 1 커밋**

  ```bash
  git add apps/web/src/pages/ui-lab/ui/input-action-catalog.tsx apps/web/test/ui-lab-input-actions.test.ts
  git commit -m "feat(ui-lab): 승인된 파일 업로드 시안만 표시"
  ```

---

### Task 2: 파일 목록 모션 계약을 회귀 테스트로 고정

**Files:**

- Modify: `apps/web/test/ui-lab-input-actions.test.ts`
- Modify: `apps/web/src/pages/ui-lab/ui/input-action-catalog.tsx`
- Modify: `apps/web/src/pages/ui-lab/ui/input-action-catalog.module.css`

- [ ] **Step 1: Motion 구조와 숫자 계약을 실패 테스트로 추가**

  FileUpload 테스트를 확장해 다음을 검사한다.

  ```ts
  it('animates upload rows with alternating exits, pop-layout reflow, and reduced-motion feedback', async () => {
    const [catalog, styles] = await Promise.all([
      readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx'),
      readSource('../src/pages/ui-lab/ui/input-action-catalog.module.css'),
    ]);

    assert.match(catalog, /useReducedMotion/);
    assert.match(catalog, /<AnimatePresence initial=\{false\} mode="popLayout">/);
    assert.match(catalog, /<motion\.li/);
    assert.match(catalog, /layout=\{reducedMotion \? false : 'position'\}/);
    assert.match(catalog, /index % 2 === 0 \? -18 : 18/);
    assert.match(catalog, /index \* 0\.028/);
    assert.match(catalog, /index \* 0\.018/);
    assert.match(catalog, /duration: 0\.14/);
    assert.match(catalog, /duration: 0\.24/);
    assert.match(catalog, /duration: 0\.1/);
    assert.match(styles, /\.uploadFileList \{[\s\S]*position: relative/);
    assert.doesNotMatch(styles, /upload-file-enter/);
  });
  ```

  기존 테스트의 `key={file.id}` 계약도 명시적으로 추가한다.

  ```ts
  assert.match(catalog, /<motion\.li[\s\S]*key=\{file\.id\}/);
  assert.doesNotMatch(catalog, /key=\{index\}/);
  ```

- [ ] **Step 2: 새 회귀 테스트 실패 확인**

  Run:

  ```bash
  pnpm --filter @stock-insight/web exec node --test test/ui-lab-input-actions.test.ts
  ```

  Expected: `useReducedMotion`, `popLayout`, `motion.li` 및 CSS keyframe 제거 계약에서 실패한다.

- [ ] **Step 3: reduced-motion 상태와 공통 easing 추가**

  import를 다음처럼 확장한다.

  ```ts
  import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
  ```

  업로드 샘플 상수 아래에 easing 상수를 둔다. 배열은 Motion 타입이 tuple로 추론되도록 `as const`를 사용한다.

  ```ts
  const uploadEnterEase = [0.22, 1, 0.36, 1] as const;
  const uploadExitEase = [0.4, 0, 1, 1] as const;
  ```

  `UploadPreview` 시작부에 사용자의 motion 선호를 읽는다.

  ```ts
  const reducedMotion = useReducedMotion();
  ```

- [ ] **Step 4: 목록 행을 `AnimatePresence`와 `motion.li`로 전환**

  기존 `<li>` map을 다음 구조로 교체한다. `AnimatePresence`의 직계 자식이 DOM ref를 전달할 수 있는 `motion.li`이므로 `popLayout`에 별도 wrapper가 필요하지 않다.

  ```tsx
  <ul
    className={styles.uploadFileList}
    aria-label="선택된 파일"
    aria-hidden={files.length === 0 || undefined}
  >
    <AnimatePresence initial={false} mode="popLayout">
      {files.map((file, index) => {
        const exitX = index % 2 === 0 ? -18 : 18;

        return (
          <motion.li
            key={file.id}
            layout={reducedMotion ? false : 'position'}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={
              reducedMotion
                ? { opacity: 1, transition: { duration: 0.1 } }
                : {
                    opacity: 1,
                    x: 0,
                    y: 0,
                    scale: 1,
                    transition: {
                      duration: 0.16,
                      delay: index * 0.028,
                      ease: uploadEnterEase,
                    },
                  }
            }
            exit={
              reducedMotion
                ? { opacity: 0, transition: { duration: 0.1 } }
                : {
                    opacity: 0,
                    x: exitX,
                    scale: 0.985,
                    transition: { duration: 0.14, ease: uploadExitEase },
                  }
            }
            transition={
              reducedMotion
                ? undefined
                : {
                    layout: {
                      type: 'spring',
                      duration: 0.24,
                      bounce: 0,
                      delay: index * 0.018,
                    },
                  }
            }
          >
            {/* 기존 파일 아이콘, 메타데이터, 삭제 버튼을 변경 없이 유지 */}
          </motion.li>
        );
      })}
    </AnimatePresence>
  </ul>
  ```

  구현 시 주의점:

  - 삭제 방향은 클릭 handler가 실행되기 전 렌더의 index가 exit prop에 캡처되므로 짝수/홀수 방향이 안정적으로 유지된다.
  - `file.id` key를 유지해 빠른 연속 삭제에서도 다른 행으로 애니메이션 상태가 전이되지 않게 한다.
  - 삭제 handler, 파일명·크기·준비 상태는 바꾸지 않는다.
  - `<ul>`은 exit가 끝날 때까지 행의 DOM 부모를 유지하기 위해 항상 렌더링한다. 파일이 0개면 `aria-hidden`으로 접근성 트리에서 숨긴다. 빈 grid는 높이와 시각 표면을 만들지 않으므로 별도 빈 목록 UI가 남지 않는다.

- [ ] **Step 5: pop-layout용 CSS 위치 기준을 만들고 중복 keyframe 제거**

  `.uploadFileList`에 위치 기준을 추가한다.

  ```css
  .uploadFileList {
    position: relative;
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  ```

  `.uploadFileList li`의 아래 선언을 삭제한다.

  ```css
  animation: upload-file-enter 160ms ease-out both;
  ```

  `@keyframes upload-file-enter` 전체와 reduced-motion media query의 `.uploadFileList li` selector도 삭제한다. `.previewSurface`와 `.uploadDropFeedback`의 기존 CSS 애니메이션은 유지한다.

- [ ] **Step 6: 집중 테스트, 포맷, 타입 검사 통과**

  Run:

  ```bash
  pnpm exec oxfmt --write apps/web/src/pages/ui-lab/ui/input-action-catalog.tsx apps/web/src/pages/ui-lab/ui/input-action-catalog.module.css apps/web/test/ui-lab-input-actions.test.ts
  pnpm --filter @stock-insight/web exec node --test test/ui-lab-input-actions.test.ts
  pnpm --filter @stock-insight/web typecheck
  git diff --check
  ```

  Expected: 집중 테스트 전부 통과, TypeScript 오류 0개, whitespace 오류 0개.

- [ ] **Step 7: Task 2 커밋**

  ```bash
  git add apps/web/src/pages/ui-lab/ui/input-action-catalog.tsx apps/web/src/pages/ui-lab/ui/input-action-catalog.module.css apps/web/test/ui-lab-input-actions.test.ts
  git commit -m "feat(ui-lab): 파일 목록 전환 모션 추가"
  ```

---

### Task 3: Headless 브라우저 회귀 테스트 추가

**Files:**

- Create: `e2e/ui-lab-file-upload.spec.ts`

- [ ] **Step 1: A/B 노출과 목록 삭제·재정렬 E2E 작성**

  인증이 필요 없는 UI Lab 경로에서 FileUpload 카테고리를 연다. 비교 카드 제목과 실제 목록 행을 역할 기반 locator로 찾는다.

  ```ts
  import { expect, test } from '@playwright/test';

  test.describe('UI Lab FileUpload', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/__ui-lab');
      await page.getByRole('button', { name: 'FileUpload · Dropzone' }).click();
    });

    test('shows only the approved A and B directions', async ({ page }) => {
      const comparison = page.locator('section[aria-labelledby="input-action-title"]');

      await expect(comparison.getByRole('heading', { name: '선과 여백 중심' })).toBeVisible();
      await expect(comparison.getByRole('heading', { name: '낮은 음영의 면' })).toBeVisible();
      await expect(comparison.getByRole('heading', { name: '선택 레일과 높은 밀도' })).toHaveCount(0);
    });

    test('removes one multiple-selection row and compacts the remaining order', async ({ page }) => {
      const firstCard = page.locator('article[data-direction="hairline"]');
      await firstCard.getByRole('button', { name: '다중' }).click();
      await firstCard.getByRole('button', { name: '선택' }).click();

      const list = firstCard.getByRole('list', { name: '선택된 파일' });
      const rows = list.getByRole('listitem');
      await expect(rows).toHaveCount(3);
      await expect(rows.nth(0)).toContainText('portfolio-2026-08.csv');
      await firstCard.getByRole('button', { name: 'portfolio-2026-08.csv 삭제' }).click();
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(0)).toContainText('earnings-notes.pdf');
      await expect(rows.nth(1)).toContainText('watchlist.xlsx');
    });
  });
  ```

  Playwright는 삭제 완료 후 최종 DOM 순서를 검증하고, 세부 duration·방향 숫자는 Task 2의 회귀 테스트가 담당한다. 동일 동작을 두 테스트 계층에서 중복 타이머로 검증하지 않는다.

- [ ] **Step 2: desktop과 mobile에서 새 E2E 실행**

  실행 중인 6100 개발 서버와 충돌하지 않도록 별도 headless 포트를 사용한다.

  Run:

  ```bash
  PLAYWRIGHT_PORT=6151 pnpm exec playwright test e2e/ui-lab-file-upload.spec.ts --project=desktop --project=mobile --workers=1
  ```

  Expected: desktop 2개, mobile 2개 테스트가 모두 통과한다. 인증 서버나 계정은 필요하지 않다.

- [ ] **Step 3: reduced-motion E2E 추가**

  같은 파일에 reduced-motion context 테스트를 추가한다.

  ```ts
  test('keeps opacity feedback without transform motion when reduced motion is requested', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/__ui-lab');
    await page.getByRole('button', { name: 'FileUpload · Dropzone' }).click();

    const firstCard = page.locator('article[data-direction="hairline"]');
    await firstCard.getByRole('button', { name: '다중' }).click();
    await firstCard.getByRole('button', { name: '선택' }).click();

    const firstRow = firstCard.getByRole('listitem').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow).toHaveCSS('transform', 'none');
  });
  ```

  Run the same focused Playwright command again. Expected: desktop/mobile 모두 통과하며 reduced-motion에서 transform이 남지 않는다. 브라우저가 identity matrix를 반환하면 `none` 고정 assertion 대신 `evaluate`로 computed transform이 `none` 또는 identity matrix인지 허용한다.

- [ ] **Step 4: Task 3 커밋**

  ```bash
  git add e2e/ui-lab-file-upload.spec.ts
  git commit -m "test(ui-lab): 파일 업로드 목록 상호작용 검증"
  ```

---

### Task 4: Codex 브라우저 시각 검증과 최종 게이트

**Files:**

- Verify: `apps/web/src/pages/ui-lab/ui/input-action-catalog.tsx`
- Verify: `apps/web/src/pages/ui-lab/ui/input-action-catalog.module.css`
- Verify: `apps/web/test/ui-lab-input-actions.test.ts`
- Verify: `e2e/ui-lab-file-upload.spec.ts`

- [ ] **Step 1: 현재 Codex 인앱 브라우저 단일 탭에서 A/B 노출 확인**

  `http://127.0.0.1:6100/__ui-lab`에서 `FileUpload · Dropzone`을 선택한다.

  확인 기준:

  - A `Hairline`, B `Inset` 카드만 보인다.
  - C `Rail` 카드와 `제외` 표시는 FileUpload 화면에 남지 않는다.
  - 다른 카테고리로 이동하면 기존 A/B/C 비교가 유지된다.

- [ ] **Step 2: 추가·삭제·연속 삭제 모션 확인**

  두 카드 각각에서 다음 순서로 확인한다.

  1. `다중` → `선택`으로 3개 파일을 표시한다.
  2. 세 행이 위에서 아래로 짧은 간격을 두고 나타나는지 확인한다.
  3. 첫째 행 삭제 시 왼쪽, 둘째 위치 행 삭제 시 현재 index 기준 방향으로 퇴장하는지 확인한다.
  4. 남은 행이 점프하거나 겹치지 않고 위로 자리를 메우는지 확인한다.
  5. 삭제 버튼을 빠르게 연속 클릭해 파일명이 바뀌거나 잘못된 행이 남지 않는지 확인한다.
  6. 마지막 행 삭제 후 빈 목록 카드가 남지 않고 dropzone이 대기 상태로 복귀하는지 확인한다.

- [ ] **Step 3: 390px 및 reduced-motion 확인**

  Codex 인앱 브라우저의 viewport를 390px로 바꿔 overflow와 삭제 버튼 터치 영역을 확인한다. reduced-motion emulation에서는 행이 좌우·상하로 이동하지 않고 opacity만 짧게 바뀌는지 확인한다.

- [ ] **Step 4: 전체 검증 게이트 실행**

  Run:

  ```bash
  pnpm format:check
  pnpm lint
  pnpm typecheck
  pnpm --filter @stock-insight/web exec node --test test/ui-lab-input-actions.test.ts
  PLAYWRIGHT_PORT=6151 pnpm exec playwright test e2e/ui-lab-file-upload.spec.ts --project=desktop --project=mobile --workers=1
  pnpm build
  git diff --check
  graphify update .
  ```

  Expected:

  - format, lint, typecheck, focused unit/contract test, desktop/mobile E2E, build 모두 exit 0.
  - `git diff --check` 출력 없음.
  - Graphify가 갱신되며 `graphify-out/`은 저장소 정책대로 커밋하지 않는다.

- [ ] **Step 5: 최종 diff 검토와 완료 커밋**

  `git status --short`와 `git diff --stat`로 범위를 확인한다. 검증 과정의 산출물, screenshot, trace, `graphify-out/`은 커밋하지 않는다. 포맷이나 브라우저 검증에서 생긴 소규모 수정이 있을 때만 다음 커밋을 만든다.

  ```bash
  git add apps/web/src/pages/ui-lab/ui/input-action-catalog.tsx apps/web/src/pages/ui-lab/ui/input-action-catalog.module.css apps/web/test/ui-lab-input-actions.test.ts e2e/ui-lab-file-upload.spec.ts
  git commit -m "fix(ui-lab): 파일 업로드 모션 검증 반영"
  ```

  변경이 없다면 빈 커밋을 만들지 않는다.

## 완료 조건

- FileUpload 비교 화면에는 A/B만 보이고, 다른 입력·액션 카테고리의 비교 수는 바뀌지 않는다.
- 단일·다중 선택, 실제 drop, 파일별 삭제, 마지막 삭제 후 idle 복귀가 기존과 동일하게 동작한다.
- 추가 stagger, 홀짝 좌우 exit, 위쪽 layout reflow가 승인된 timing으로 실행된다.
- reduced-motion은 transform/layout tween 없이 opacity 피드백만 유지한다.
- Codex 인앱 브라우저 1440px/390px 검토와 모든 자동 검증 게이트가 통과한다.

## References

- 승인 설계: `docs/superpowers/specs/2026-08-02-input-action-variants-design.md`
- Motion AnimatePresence: <https://motion.dev/docs/react-animate-presence>
- Motion layout animation: <https://motion.dev/docs/react-layout-animations>
- Animate UI accessibility: <https://animate-ui.com/docs/accessibility>
