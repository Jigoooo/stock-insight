# Futur Insight UI/UX 재설계 — QA·Release Handoff

- 작성 시각: 2026-07-17 17:43 KST
- 대상 저장소: `/home/jigoo/.hermes/workspace/stock-insight`
- 브랜치: `master`
- 현재 후보 URL: `http://127.0.0.1:8093`
- 상태: **ui-00~ui-06 완료 / ui-07~ui-08 미실행**
- 중요: 사용자 요청으로 이 문서 작성 후 현재 세션은 목표 실행을 중단했다. 새 세션에서 아래 남은 단계만 이어간다.

## 1. 완료된 범위

- `ui-00`: candidate tombstone 초기화·가입 폼 복구
- `ui-01`: 실화면/코드 감사 및 Apple·Emil 기반 디자인 계약
- `ui-02`: 전역 token·surface·input/button·GSAP interaction·custom toast
- `ui-03`: 로그인·가입·상태·오류 화면 통합
- `ui-04`: app shell/sidebar/navigation/header 및 모바일 GSAP drawer
- `ui-05`: feed/detail/inspector/relation graph/empty/loading/error/stale 화면 재설계
- `ui-06`: light/dark, 390px, keyboard, reduced-motion/transparency, WCAG target 하드닝

## 2. ui-06 최종 변경의 핵심

- workspace 사용자 문구를 최소 12px로 상향하고 주요 조작 target을 44px로 정리했다.
- 전역 및 auth에 남은 CSS `transition`/`:active` press를 제거해 GSAP interaction과 중복되지 않게 했다.
- 고정 dark sidebar에 `--color-on-chrome*` semantic token을 도입해 OS dark mode에서도 텍스트가 어두워지지 않게 했다.
- 로그인 비밀번호 `보기` control의 dark contrast를 수정했다.
- 검색 input 자체 hit box를 42px로 확장했다.
- relation fallback의 scroll 주체를 focus 가능한 `<summary>`를 포함한 `<details>`로 이동했다.
- 모바일 inspector에 dismissible blur scrim을 추가하고 fullscreen scrim은 press-scale 대상에서 제외했다.
- 테마 deep-link의 React hydration 오류를 수정했다.
  - 원인: SSR HTML parser가 SVG shape/root 내부 `<title>`을 제거하고 client React가 다시 삽입해 mismatch 발생.
  - 수정: SVG에 직접 `aria-label`, `aria-describedby`를 주고 nested/root `<title>`을 제거. 텍스트 관계 목록은 유지.
- 모바일 종목 table은 semantic table을 유지하면서 390px에서 label/value 카드형으로 재배치했다.

주요 파일:

- `apps/web/public/styles/index.css`
- `apps/web/src/pages/auth/auth-page.module.css`
- `apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx`
- `apps/web/src/pages/research-workspace/ui/research-workspace-page.module.css`
- `apps/web/src/shared/ui/motion/interaction-motion.tsx`
- `apps/web/test/research-workspace-v3-structure.test.ts`
- `e2e/research-workspace-v3.spec.ts`

## 3. 완료 시점의 검증 증거

### 정적/단위 검증

```bash
cd /home/jigoo/.hermes/workspace/stock-insight/apps/web
pnpm typecheck
pnpm lint
pnpm test
```

최종 실측:

- TypeScript: exit 0
- oxlint: **0 warnings / 0 errors**
- web tests: **153 passed / 0 failed**

### workspace 실브라우저 회귀 1회

```bash
cd /home/jigoo/.hermes/workspace/stock-insight
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
PLAYWRIGHT_BASE_URL='http://127.0.0.1:8093' \
PLAYWRIGHT_STORAGE_STATE='/tmp/stock-ui-candidate-state.json' \
PLAYWRIGHT_WORKERS=2 \
pnpm exec playwright test e2e/research-workspace-v3.spec.ts \
  --project=desktop --project=mobile
```

최종 실측:

- **15 passed / 3 intentional viewport skips / 0 failed**
- 검증 범위: root redirect, logout boundary, 7개 section, evidence inspector, APG tabs, Radar/History pagination, mobile nav/focus, mobile stock overflow, empty/loading/error.

### 접근성/시각 매트릭스

최종 matrix:

- light desktop
- dark desktop
- light mobile 390×844
- dark mobile 390×844
- reduced-motion + reduced-transparency mobile

모든 case 실측:

- axe violations: **0**
- console errors: **0**
- page errors: **0**
- horizontal overflow: **0**
- 24px 미만 interactive target: **0**
- SVG를 제외한 12px 미만 사용자 텍스트: **0**
- reduced media query: motion/transparency 모두 `true`
- 최종 contact sheet 시각 감사: **HIGH 0 / MEDIUM 0**

임시 캡처 위치(재부팅 시 사라질 수 있음): `/tmp/ui06-final/`

## 4. 현재 작업 트리 주의사항

- 작업 트리는 **대규모 dirty 상태**이며 이 UI 작업 이전 단계의 API/DB/auth/research-v3 변경도 함께 포함한다.
- 현재 세션은 commit/push를 하지 않았다.
- 절대 `git reset --hard`, 대량 checkout, clean, 무관 파일 revert를 하지 말 것.
- 시작 시 반드시 아래를 재실측한다.

```bash
cd /home/jigoo/.hermes/workspace/stock-insight
git status --short
git branch --show-current
```

- 현재 branch는 `master`였다.
- candidate state는 임시 파일 `/tmp/stock-ui-candidate-state.json`에 있다. 없거나 만료됐으면 secret을 출력하지 말고 candidate 로그인 절차로 새로 만든다.
- candidate server `127.0.0.1:8093`가 살아 있다고 가정하지 말고 health/readback부터 확인한다.

## 5. 남은 작업 — ui-07 QA

상태: **pending, 아직 시작하지 않음**

완료 조건:

1. desktop/mobile 전체 사용자 여정을 실제 브라우저로 검사한다.
2. 로그인·가입·가입 불가/완료·오류 toast·workspace 7개 view·검색·pagination·inspector·relation graph·mobile drawer·keyboard·direct deep-link를 포함한다.
3. light/dark 및 390px를 포함한다.
4. 각 run에서 아래가 모두 0이어야 한다.
   - HIGH defect
   - axe violation
   - unexpected console error
   - pageerror/hydration mismatch
   - horizontal overflow
5. **마지막 코드 변경 이후 동일 전체 QA를 2회 연속 통과**해야 한다.
6. 별도 subagent/독립 reviewer로 코드+스크린샷 감사를 수행하고 HIGH 0을 확인한다. 자기 승인만으로 닫지 않는다.
7. 예상된 503을 의도적으로 주입하는 pagination error test는 unexpected network error로 오판하지 않는다.

권장 시작 명령:

```bash
cd /home/jigoo/.hermes/workspace/stock-insight/apps/web
pnpm typecheck && pnpm lint && pnpm test

cd /home/jigoo/.hermes/workspace/stock-insight
PLAYWRIGHT_SKIP_WEB_SERVER=1 \
PLAYWRIGHT_BASE_URL='http://127.0.0.1:8093' \
PLAYWRIGHT_STORAGE_STATE='/tmp/stock-ui-candidate-state.json' \
PLAYWRIGHT_WORKERS=2 \
pnpm exec playwright test \
  e2e/auth-login.spec.ts \
  e2e/auth-signup.spec.ts \
  e2e/research-workspace-v3.spec.ts \
  --project=desktop --project=mobile
```

주의: auth spec과 authenticated workspace spec의 storage-state 요구가 다를 수 있으므로 기존 Playwright config/test-level `test.use`를 먼저 읽고, 필요하면 suite를 분리 실행한다.

## 6. 남은 작업 — ui-08 Release

상태: **pending, 아직 시작하지 않음**

이 단계는 build/config/DB migration/운영 배포/secret 제거를 포함하므로 **실행 직전 사용자 명시 승인 필수**다. 새 세션에서 자동으로 진행하지 말 것.

승인 후 완료 조건:

1. 대상 repo/compose/runtime/DB를 다시 명시 확인한다.
2. 운영 DB backup 및 restore 가능성/readback을 검증한다.
3. migration 계획과 rollback 조건을 확인한다.
4. 최종 image를 재빌드하고 digest/실행 byte를 확인한다.
5. 운영 배포 후 health/API/UI를 실제 브라우저로 확인한다.
6. 사용자가 운영 가입을 완료한 뒤에만 static bootstrap credential/secret mount를 제거한다.
7. static secret 제거 후 DB-only auth login/readback을 검증한다.
8. 운영 desktop/mobile에서 console/pageerror 0, 주요 사용자 여정 정상, 데이터 readback 정상인지 재검증한다.
9. 실패 시 사전에 적은 rollback을 실제로 수행 가능한 상태로 유지한다.
10. 완료 선언 전 운영 URL, container/image, DB migration, auth mode를 끝단에서 다시 읽는다.

관련 파일은 먼저 읽고 추측하지 말 것:

- `docker-compose.candidate.yml`
- `docker-compose.prod.yml`
- `docker-compose.prod-db-auth.yml`
- `apps/web/Dockerfile`
- `apps/web/src/server/auth/`
- `packages/db-schema/src/migrations/005_local_account_enrollment.ts`
- `apps/web/test/deployment-isolation.test.ts`

secret 값, password, enrollment code, cookie 내용은 문서·로그·채팅에 출력하지 않는다.

## 7. 새 세션 첫 행동

1. `fable-thinking`, `long-task-orchestration`, 관련 UI/QA skill을 로드한다.
2. 이 handoff와 repo 지침을 읽는다.
3. repo/status/candidate health를 재실측한다.
4. todo에는 `ui-07` in_progress, `ui-08` pending만 만든다.
5. ui-07을 수행하고 2회 연속 GREEN + 독립 리뷰를 통과한 뒤 멈춘다.
6. ui-08 실행 직전 사용자 승인을 받는다.

## 8. 현재 세션 종료선

- `ui-06-accessibility`: **completed**
- `ui-07-qa`: **pending**
- `ui-08-release`: **pending**
- 전체 원래 목표: **아직 완료 아님**
- 현재 세션은 사용자 지시에 따라 여기서 중단한다.
