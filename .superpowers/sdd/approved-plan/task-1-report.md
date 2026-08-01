# Task 1 실행 보고서

## Status

DONE_WITH_CONCERNS

제품 callsite의 공용 UI adoption, 정적 회귀 테스트, 전체 web 테스트, 타입체크, 포맷, lint, build, diff 검증과 커밋까지 완료했다. Playwright와 실제 브라우저 검증은 root agent가 단일 브라우저 게이트를 소유한다는 지시에 따라 이 작업에서는 실행하지 않았다.

## Commit

- `494a1b2` — `refactor(ui): 제품 화면을 공용 컴포넌트로 통합`

## Files changed

### Product and route callsites

- `apps/web/src/pages/admin-invitations/ui/admin-invitation-page.tsx`
- `apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx`
- `apps/web/src/pages/research-workspace/ui/market-overview-panel.tsx`
- `apps/web/src/pages/research-workspace/ui/relation-sigma-graph.tsx`
- `apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.tsx`
- `apps/web/src/pages/research-workspace/ui/use-workspace-append-reveal.ts`
- `apps/web/src/pages/research-workspace/ui/use-workspace-overlay-motion.ts`
- `apps/web/src/pages/research-workspace/ui/use-workspace-relation-crossfade.ts`
- `apps/web/src/pages/research-workspace/ui/views/stocks-view.tsx`
- `apps/web/src/pages/research-workspace/ui/views/themes-view.tsx`
- `apps/web/src/pages/research-workspace/ui/views/today-view.tsx`
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/routes/_authenticated.tsx`

### Route layout CSS

- `apps/web/src/pages/research-workspace/ui/feed-ledger.module.css`
- `apps/web/src/pages/research-workspace/ui/market-overview.module.css`
- `apps/web/src/pages/research-workspace/ui/relation-detail.module.css`
- `apps/web/src/pages/research-workspace/ui/research-workspace-page.module.css`
- `apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.module.css`
- `apps/web/src/pages/research-workspace/ui/workspace-route-boundary.module.css`

### Shared UI public APIs and state ownership

- `apps/web/src/shared/ui/button/button.module.css`
- `apps/web/src/shared/ui/dialog/dialog.module.css`
- `apps/web/src/shared/ui/dialog/dialog.tsx`
- `apps/web/src/shared/ui/motion/index.ts`
- `apps/web/src/shared/ui/scroll/index.ts`

### Regression and adoption tests

- `apps/web/test/task-1-product-adoption.test.ts`
- `apps/web/test/market-overview-ui-structure.test.ts`
- `apps/web/test/research-workspace-v3-structure.test.ts`
- `apps/web/test/stock-deep-dive-ui-structure.test.ts`
- `apps/web/test/workspace-navigation-transition-contract.test.ts`
- `apps/web/test/workspace-overlay-integration-contract.test.ts`
- `apps/web/test/workspace-shell-current-contract.test.ts`
- `e2e/admin-invitations.spec.ts`
- `e2e/research-workspace-v3.spec.ts`
- `e2e/workspace-visual.spec.ts`

## RED evidence

Command:

```sh
pnpm --filter @stock-insight/web exec node --test test/task-1-product-adoption.test.ts
```

Expected failure result:

- exit code `1`
- tests `4`, pass `0`, fail `4`
- public-purpose import contract reported 8 deep imports
- evidence inspector contract reported the native `<dialog>` and custom focus trap
- display/selection contract reported market `Tabs` and page-owned stock selection
- invitation result contract reported no shared `notify` producer

## GREEN and full verification

- Targeted adoption: `pnpm --filter @stock-insight/web exec node --test test/task-1-product-adoption.test.ts` → tests `4`, pass `4`, fail `0`
- Targeted affected contracts: `pnpm --filter @stock-insight/web exec node --test test/task-1-product-adoption.test.ts test/market-overview-ui-structure.test.ts test/stock-deep-dive-ui-structure.test.ts test/workspace-overlay-integration-contract.test.ts test/admin-invitation-page.test.ts` → tests `29`, pass `29`, fail `0`
- Full web tests: `pnpm --filter @stock-insight/web test` → tests `553`, pass `553`, fail `0`
- Typecheck: `pnpm typecheck` → tasks `11 successful`, exit code `0`
- Format: `pnpm format:check` → all `1054` matched files formatted, exit code `0`
- Lint: `pnpm lint` → exit code `0`; four pre-existing `prefer-tag-over-role` warnings remain, no errors
- Build: `pnpm build` → tasks `7 successful`, exit code `0`; Vite emitted the existing large-chunk advisory
- Diff: `git diff --check` and `git diff --cached --check` → no output, exit code `0`

## Self-review findings

- Authentication validation, submission, redirect, and route gates were not changed.
- Evidence inspector data loading and close callback contracts were preserved while focus trap, Escape handling, overlay dismissal, and modal semantics moved to Radix through the shared `Dialog` composition.
- Desktop evidence inspector stays inline/non-modal; mobile uses the same shared inspector presentation through a portalled modal.
- Market display switching now uses `ToggleGroup`; route-level feed navigation uses hairline `Tabs`.
- Stock selection now uses the shared semantic table's single-selection radio owner instead of a nested pressed button and route CSS state.
- Invitation issue, revoke, copy, and failure outcomes now publish custom Sonner toasts while existing inline live-region output remains intact.
- Product TypeScript consumers now import public `@/shared/ui/<purpose>` entry points; CSS URL loading is re-exported by the scroll purpose boundary.
- Route CSS no longer owns the migrated selected, pressed, open, focus, and pending visuals.
- No development authentication bypass, UI Lab route, dependency, or invented Switch/Checkbox/Textarea workflow was added.

## Concerns

- Playwright and actual browser verification were intentionally not executed in this lane because the root agent owns the single browser/headless gate. E2E selectors were updated for ToggleGroup and radio-table semantics but require the root gate for runtime confirmation.
- `graphify update .` attempted the required graph refresh but its background rebuild failed with `Operation not permitted`; the commit hook launched a second background graphify rebuild. No tracked graph output changed.
- Lint retains four non-blocking `prefer-tag-over-role` warnings, three in existing Field/InputGroup code and one for the labelled market region.

## Fix round 1 — independent review Important findings

### Changes

- Replaced the admin invitation result container's implicit live `output` semantics with a layout-preserving `div`. Sonner remains the single assistive announcement owner for issue, revoke, copy, and error results; only the transient pending message uses its own polite `output`. Inline code disclosure, error, and revocation-result geometry remain visible.
- Prevented pointer-down and focus-outside dismissal only for the desktop `modal={false}` evidence inspector. Mobile modal dismissal behavior and explicit close actions remain unchanged.
- Updated every market ToggleGroup E2E locator to the rendered Radix `radiogroup` / `radio` contract and changed state assertions to `aria-checked`. The keyboard contract now verifies ArrowRight roving focus without selection, followed by Space activation.

### TDD evidence

- Initial RED: `pnpm --filter @stock-insight/web exec node --test test/task-1-product-adoption.test.ts test/admin-invitation-page.test.ts` → tests `9`, pass `5`, fail `4`, exit code `1`. Failures covered the invitation live owner, desktop inspector outside guards, and ToggleGroup E2E semantics.
- Lint-warning RED refinement: the same command → tests `9`, pass `7`, fail `2`, exit code `1`, after requiring a semantic pending-only `output` before replacing the warning-producing `span role="status"`.
- GREEN: the same command → tests `9`, pass `9`, fail `0`, exit code `0`.
- Affected contracts: `pnpm --filter @stock-insight/web exec node --test test/task-1-product-adoption.test.ts test/admin-invitation-page.test.ts test/workspace-state-announcement-render.test.ts test/market-overview-ui-structure.test.ts test/stock-deep-dive-ui-structure.test.ts test/workspace-overlay-integration-contract.test.ts` → tests `32`, pass `32`, fail `0`.

### Full verification

- Full web tests: `pnpm --filter @stock-insight/web test` → tests `554`, pass `554`, fail `0`.
- Typecheck: `pnpm typecheck` → tasks `11 successful`, exit code `0`.
- Format: `pnpm format:check` → all `1054` matched files formatted, exit code `0`.
- Lint: `pnpm lint` → exit code `0`; the same four pre-existing `prefer-tag-over-role` warnings remain, no new warnings and no errors.
- Build: `pnpm build` → tasks `7 successful`, exit code `0`; Vite emitted the existing large-chunk advisory.
- Diff: `git diff --check` → no output, exit code `0`.
- Graph: `graphify update .` attempted the required refresh and again failed with `Operation not permitted`; no tracked graph output changed.
- Playwright/browser: intentionally not run per fix-round instruction.
