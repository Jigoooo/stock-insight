# Stocks Briefing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic stock table and 12-axis detail with a holdings-first personal briefing, while keeping the backend, database, and public contracts unchanged.

**Architecture:** `StocksView` remains the shared product view. A page-local briefing model supplies complete data in the dev preview and derives honest partial states from the existing live stock response. Both Today evidence and stock detail use one reusable page-level inspector frame built on the existing shared Dialog primitive.

**Tech Stack:** React 19, TypeScript 6, TanStack Start, CSS Modules, Radix Dialog, Motion, Node test runner, Playwright.

## Global Constraints

- Do not change the database, migrations, API server, or `@stock-insight/contracts` public response schemas.
- Do not add dependencies.
- Preserve the approved Today inspector motion, overlay, resizing, outside-click, and focus contracts.
- Use only information-providing copy. Do not render buy/sell instructions, target prices, stop-loss prices, or predicted winners.
- Priority is provided by the fixture now and by a future batched server read model; do not calculate it in the browser.
- Preview fixture data must be deterministic and must not call authenticated loaders or the live API.
- Keep `.env` and unrelated user files out of every commit.
- Use TDD for new behavior: write and run a failing focused test before production code, then run it green.

---

### Task 1: Checkpoint the approved Today inspector baseline

**Files:** Existing dirty Today fixture/view, Evidence Inspector, Dialog, workspace presentation CSS, related tests, Today E2E, and their 2026-08-06 specs/plans. Do not include `.env` or Stocks redesign files.

- [ ] Run the focused Node tests for Evidence Inspector layout, Dialog, and dev preview routing.
- [ ] Run `e2e/today-preview-experience.spec.ts` on desktop and mobile.
- [ ] Fix only failures inside the already-approved Today interaction scope.
- [ ] Explicitly stage the Today bundle and commit `feat(workspace): 오늘 브리핑 상세 상호작용 완성`.

### Task 2: Extract a reusable detail inspector frame

**Files:**
- Create: `apps/web/src/pages/research-workspace/ui/detail-inspector-frame.tsx`
- Create: `apps/web/src/pages/research-workspace/ui/detail-inspector-frame.module.css`
- Modify/rename: `apps/web/src/pages/research-workspace/model/evidence-inspector-layout.ts`
- Modify: `apps/web/src/pages/research-workspace/ui/evidence-inspector.tsx`
- Test: `apps/web/test/detail-inspector-frame.test.ts`
- Test: `e2e/today-preview-experience.spec.ts`

**Interface:** `DetailInspectorFrame` owns desktop drawer/modal/mobile presentation, 420–760px sizing with 520px default, pointer and keyboard resizing, an injected storage key, quick motion, light overlay, and the `넓게 보기`/`옆에서 보기` control. A render-prop child receives `drawer | modal | mobile`.

- [ ] Write and run a failing frame behavior test.
- [ ] Extract the frame without changing Today behavior.
- [ ] Give Evidence Inspector and Stock Inspector independent session-storage keys.
- [ ] Run the focused Node and Today Playwright tests green.
- [ ] Commit `refactor(workspace): 상세 인스펙터 프레임 공용화`.

### Task 3: Add the stock briefing model and deterministic fixtures

**Files:**
- Create: `apps/web/src/pages/research-workspace/model/stock-briefing.ts`
- Replace: `apps/web/src/pages/dev-preview/model/stock-deep-dive-preview-fixture.ts`
- Modify: `apps/web/src/pages/dev-preview/model/stocks-preview-fixture.ts`
- Modify: `apps/web/src/pages/research-workspace/model/stock-deep-dive.ts`
- Test: `apps/web/test/stock-briefing.test.ts`

**Interfaces:** Define `StockBriefingSummary`, `StockBriefingItem`, `StocksBriefingModel`, `StockBriefingDetail`, `StockBriefingLoadResult`, and `StockBriefingLoader` exactly as approved. Mandatory stock-detail failures reject the load; relation and impact failures populate `partialFailures` and preserve base detail/news.

- [ ] Write failing model tests for max-three priority items, same-stock consolidation, partial supplementary failures, identity mismatch, and empty derivation.
- [ ] Implement the page-local model and live-response transformer.
- [ ] Provide five holdings, four watchlist items, three priority holdings, and two changed watchlist items in the default preview.
- [ ] Use Samsung Electronics, SK Hynix, and NAVER as priorities and NVIDIA and Micron as changed watchlist items; provide HTTPS source links.
- [ ] Run model and existing stock loader tests green.
- [ ] Commit `feat(workspace): 내 종목 브리핑 모델과 fixture 추가`.

### Task 4: Recompose the Stocks view around personal briefings

**Files:**
- Rewrite: `apps/web/src/pages/research-workspace/ui/views/stocks-view.tsx`
- Create: `apps/web/src/pages/research-workspace/ui/views/stocks-view.module.css`
- Create: `apps/web/src/pages/research-workspace/ui/stock-briefing-sections.tsx`
- Modify: `apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx`
- Modify: `apps/web/src/pages/dev-preview/ui/dev-preview-page.tsx`
- Test: `apps/web/test/stock-briefing-structure.test.ts`

**Behavior:** Render briefing summary, max-three priority holdings, paginated full holdings, and changed watchlist items in that order. Use one selection state and one full-border selected surface. Search filters visible rows by entity key but does not alter aggregate counts. The live route derives holdings and last-analysis values; unsupported counts render `—` with an explicit unavailable label.

- [ ] Write and run failing structure/model tests.
- [ ] Implement desktop two-column and <=1240px stacked layouts.
- [ ] Preserve 50-item holdings pagination without a seven-column table.
- [ ] Add `전체 관심종목 보기` / collapse behavior.
- [ ] Render honest no-briefing, no-holdings, and all-empty states.
- [ ] Run focused Node tests, typecheck, and formatting green.
- [ ] Commit `feat(workspace): 내 종목 우선 브리핑 화면 구현`.

### Task 5: Implement the stock briefing inspector

**Files:**
- Create: `apps/web/src/pages/research-workspace/ui/stock-briefing-inspector.tsx`
- Create: `apps/web/src/pages/research-workspace/ui/stock-briefing-inspector.module.css`
- Modify: `apps/web/src/pages/research-workspace/ui/views/stocks-view.tsx`
- Delete after migration: `apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.tsx`
- Delete after migration: `apps/web/src/pages/research-workspace/ui/stock-deep-dive-panel.module.css`
- Replace: `apps/web/test/stock-deep-dive.test.ts`

**Behavior:** Every stock entry opens the same detail in a right drawer. Content order is stock summary, why-now, market paths, max-three related news with source links, risks/checkpoints, and holding-thesis retrospective. Modal mode reuses the loaded data and adds the relation graph, company profile, and metrics. Missing optional sections are omitted; partial failures are localized.

- [ ] Write failing tests for section ordering, omitted missing sections, source links, partial failures, and no-refetch presentation switching.
- [ ] Implement the inspector with focus restoration to its opener.
- [ ] Keep outside click close-only and mobile as a bottom modal without resize/toggle controls.
- [ ] Remove the legacy 12-axis UI after all callers use the new inspector.
- [ ] Run focused tests and Today regression tests green.
- [ ] Commit `feat(workspace): 내 종목 브리핑 상세 인스펙터 구현`.

### Task 6: Add preview scenarios, browser coverage, and close verification

**Files:**
- Modify: `apps/web/src/routes/[__dev-preview].tsx`
- Modify: `apps/web/src/pages/dev-preview/ui/dev-preview-page.tsx`
- Modify: `apps/web/test/dev-surface-routing.test.ts`
- Create: `e2e/stocks-preview-experience.spec.ts`
- Modify: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`
- Include: `docs/superpowers/plans/2026-08-07-stocks-briefing-redesign.md`

**Behavior:** Support `surface=stocks` and `scenario=default|no-holdings|empty|detail-error`. Cover desktop/mobile, dark mode, reduced motion, Axe, selection consistency, overlay close-only, resize/session memory, drawer/modal switching without requests, valid source URLs, and honest empty/error states.

- [ ] Write and run failing dev-route and Playwright tests.
- [ ] Implement the scenario router and deterministic scenario fixtures.
- [ ] Verify `/__dev-preview?surface=stocks` in the Codex in-app browser at desktop and 390px.
- [ ] Run `graphify update .`.
- [ ] Run format, lint, typecheck, focused Node tests, desktop/mobile Playwright, full tests, build, and `pnpm verify:release`; record any environment-gated failures exactly.
- [ ] Update the rollout ledger with approval, adoption, browser, and automated verification evidence.
- [ ] Commit `test(workspace): 내 종목 브리핑 경험 검증`.
