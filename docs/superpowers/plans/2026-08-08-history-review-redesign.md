# Judgment Review Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Use TDD and commit each task independently.

**Goal:** Replace the chronological history timeline with an honest, read-only judgment-review briefing while preserving existing backend and public contracts.

**Architecture:** `HistoryView` consumes a page-local `HistoryBriefingModel`. Live data is derived only from the existing history response; preview data is deterministic and complete. One shared `DetailInspectorFrame` owns drawer, modal, bottom-sheet, overlay, resize memory, and focus behavior.

**Tech stack:** React 19, TypeScript, TanStack Start, CSS Modules, Radix Dialog, Node test runner, Playwright.

## Global constraints

- Do not change DB schema/data, migrations, API server, public `@stock-insight/contracts` responses, or dependencies.
- Do not add a live detail request or infer unsupported evidence/change/checkpoint data.
- Preserve read-only behavior and safe information language; do not render buy/sell advice, targets, stops, predictions, or success/failure judgments.
- Keep `.env`, graph output, and unrelated user changes out of commits.
- Write a focused failing test before each production behavior and run it green.
- Preserve Today, Stocks, and Market Connections shared-inspector behavior.

---

### Task 1: Add the page-local history model and deterministic preview fixtures

**Files:**
- Create: `apps/web/src/pages/research-workspace/model/history-briefing.ts`
- Create: `apps/web/src/pages/dev-preview/model/history-preview-fixture.ts`
- Modify: `apps/web/src/pages/dev-preview/ui/dev-preview-page.tsx`
- Modify: `apps/web/src/routes/[__dev-preview].tsx`
- Test: `apps/web/test/history-briefing.test.ts`
- Test: `apps/web/test/dev-surface-routing.test.ts`

- [ ] Write RED tests for `alert_review` classification, max-three due ordering, duplicate removal, past separation, honest live null detail, HTTPS-only links, zero records, and all six scenario names.
- [ ] Implement the exact types and deterministic derivation rules from the design document.
- [ ] Build `default`, `no-user-judgments`, `no-due`, `empty`, `partial`, and `detail-error` fixtures without authenticated/live calls.
- [ ] Keep live detail synchronous from the selected item and preview detail deterministic.
- [ ] Run focused tests, typecheck, lint, and format checks.
- [ ] Commit `feat(workspace): 판단 복기 모델과 fixture 추가`.

### Task 2: Recompose the History view into a briefing

**Files:**
- Rewrite: `apps/web/src/pages/research-workspace/ui/views/history-view.tsx`
- Create: `apps/web/src/pages/research-workspace/ui/views/history-view.module.css`
- Modify: `apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx`
- Test: `apps/web/test/history-briefing-structure.test.ts`

- [ ] Write RED structure tests for fixed section order, summary labels, max-three priority, honest no-due/no-record states, collapsed past entries, and forbidden copy.
- [ ] Render summary, priority judgments, active judgments, observations, and collapsed past entries in the approved order.
- [ ] Use one selection surface with the approved full-border/background/shadow treatment.
- [ ] Stack the principal columns at 1240px and preserve wrapping/explicit overflow behavior.
- [ ] Keep existing history pagination available without presenting it as a complete total.
- [ ] Run focused tests and static checks.
- [ ] Commit `feat(workspace): 판단 복기 브리핑 화면 구현`.

### Task 3: Implement the history detail inspector

**Files:**
- Create: `apps/web/src/pages/research-workspace/ui/history-briefing-inspector.tsx`
- Create: `apps/web/src/pages/research-workspace/ui/history-briefing-inspector.module.css`
- Modify: `apps/web/src/pages/research-workspace/ui/views/history-view.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx`
- Test: `apps/web/test/history-briefing-inspector.test.ts`

- [ ] Write RED tests for judgment/observation section order, optional omission, localized partial failures, valid source links, retry, and no-refetch switching.
- [ ] Reuse `DetailInspectorFrame` with an independent session-storage key.
- [ ] Share exact selection across every opener and restore exact opener focus after overlay/Escape close.
- [ ] Render judgment and automatic-observation details with their distinct approved information hierarchy.
- [ ] Render modal comparison in two columns without fetching; keep mobile as a bottom sheet.
- [ ] Run focused tests and proportional Today/Stocks/Market Connections regressions.
- [ ] Commit `feat(workspace): 판단 복기 상세 인스펙터 구현`.

### Task 4: Complete scenarios, real-browser coverage, and release verification

**Files:**
- Create: `e2e/history-preview-experience.spec.ts`
- Modify: `apps/web/test/dev-surface-routing.test.ts`
- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`
- Include: `docs/superpowers/plans/2026-08-08-history-review-redesign.md`

- [ ] Write RED Playwright coverage for section order, exact selection, drawer geometry, overlay close-only, modal/no-request switching, width memory, exact focus restoration, 1240px stacking, 390px bottom sheet, dark mode, reduced motion, Axe, wrapping, and overflow.
- [ ] Cover all six preview scenarios, detail retry, and forbidden advisory/performance-verdict copy.
- [ ] Regress Today, Stocks, and Market Connections inspector specs on desktop/mobile.
- [ ] Verify `/__dev-preview?surface=history&scenario=default` in the Codex in-app browser at desktop and 390px without stopping the user's 6100 server; use an isolated port if needed.
- [ ] Run `graphify update .`.
- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, focused Node tests, History Playwright, `pnpm test`, `pnpm build`, and `pnpm verify:release`.
- [ ] Record exact missing DB/auth variables and skipped scope for environment-gated checks.
- [ ] Update the rollout ledger with approval, adoption, browser, and automated evidence.
- [ ] Commit `test(workspace): 판단 복기 경험 검증`.

## Completion conditions

- All four implementation commits exist and contain only their owned scope.
- Browser and automated checks prove the approved surface at desktop and mobile.
- Live data is honest about loaded scope and unsupported detail fields.
- No DB/API/migration/dependency/public-contract change exists in the branch.
- Final whole-branch review reports no unresolved Critical or Important issue.
