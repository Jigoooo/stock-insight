# Data Reliability Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Use TDD and commit each task independently.

**Goal:** Replace the operator-oriented data status tables with an honest user-facing reliability briefing for Today, Stocks, Market Connections, and History.

**Architecture:** `StatusView` consumes a page-local `ReliabilityBriefingModel` derived only from the existing `SystemStatus`. Deterministic preview fixtures provide complete scenarios. The shared `DetailInspectorFrame` owns drawer, modal, bottom sheet, resize memory, overlay, and focus behavior.

**Tech stack:** React 19, TypeScript, TanStack Start, CSS Modules, Radix Dialog, Node test runner, Playwright.

## Global constraints

- Do not change DB schema/data, migrations, API server, public contracts, or dependencies.
- Do not infer unknown dataset meaning, personal holdings completeness, judgment correctness, source identities, or source URLs.
- Do not render row counts, job names, internal domains, analysis ids, percentage trust scores, investment advice, price targets, stops, or success/failure verdicts.
- Keep `.env`, graph output, and unrelated changes out of commits.
- Write and observe a focused failing test before each production behavior.
- Preserve Today, Stocks, Market Connections, and History shared-inspector behavior.

---

### Task 1: Add the page-local reliability model and deterministic preview fixtures

**Primary files:**

- Create `apps/web/src/pages/research-workspace/model/reliability-briefing.ts`.
- Create `apps/web/src/pages/dev-preview/model/status-preview-fixture.ts`.
- Extend the discriminated dev-preview request and page boundaries for `surface=status`.
- Add focused model and route tests.

- [ ] Write RED tests for availability conversion, worst-state ordering, all four mappings, ignored unknown keys, source degradation, job/coverage limitations, zero evidence, and exact scenario validation.
- [ ] Implement the design's exact page-local types and deterministic derivation rules.
- [ ] Build `default`, `all-ready`, `stale`, `source-limited`, `empty`, and `error` fixtures without authenticated or live calls.
- [ ] Keep the existing `SystemStatus` public response unchanged.
- [ ] Run focused tests and static checks.
- [ ] Commit `feat(workspace): 데이터 신뢰도 모델과 fixture 추가`.

### Task 2: Recompose the Status view into a user reliability briefing

**Primary files:**

- Rewrite `apps/web/src/pages/research-workspace/ui/views/status-view.tsx`.
- Add a Status-specific CSS module.
- Adapt `ResearchWorkspacePage` to pass the derived model and exact opener selection boundary.
- Add focused structure tests.

- [ ] Write RED tests for page title, fixed order, three-state wording, fixed card subsections, common limitations, empty evidence, technical copy exclusion, and 1240px stacking contract.
- [ ] Render the overall state and four surface cards with one selected state.
- [ ] Remove raw operational tables from the user view while preserving backend fields.
- [ ] Keep wrapping and explicit overflow behavior at narrow widths.
- [ ] Run focused tests and static checks.
- [ ] Commit `feat(workspace): 사용자 신뢰 브리핑 화면 구현`.

### Task 3: Implement the reliability detail inspector

**Primary files:**

- Create `apps/web/src/pages/research-workspace/ui/reliability-inspector.tsx` and its CSS module.
- Wire selection and opener ownership through `StatusView` and `ResearchWorkspacePage`.
- Add focused inspector tests.

- [ ] Write RED tests for section order, source counts, optional omissions, no invented links, presentation layout, and an independent storage key.
- [ ] Reuse `DetailInspectorFrame` with the approved 420–760px drawer/modal/mobile behavior.
- [ ] Restore exact opener focus for pointer, keyboard, touch, assistive, and programmatic activation paths.
- [ ] Render the modal comparison without fetching or recomputing data.
- [ ] Run focused tests and proportional shared-inspector regressions.
- [ ] Commit `feat(workspace): 데이터 신뢰도 상세 인스펙터 구현`.

### Task 4: Complete scenarios, browser coverage, rollout evidence, and release verification

**Primary files:**

- Add `e2e/status-preview-experience.spec.ts`.
- Extend the route contract tests.
- Update `docs/superpowers/UI-SYSTEM-ROLLOUT.md`.

- [ ] Write RED browser coverage for order, exact selection, drawer geometry, resize/session memory, overlay close-only, modal no-request switching, exact focus restoration, 1240px stacking, 390px bottom sheet, dark mode, reduced motion, Axe, wrapping, overflow, and forbidden copy.
- [ ] Cover all six preview scenarios including error retry.
- [ ] Regress Today, Stocks, Market Connections, and History inspectors on desktop/mobile.
- [ ] Verify `surface=status&scenario=default` in the Codex in-app browser at desktop and 390px using an isolated server when necessary.
- [ ] Run `graphify update .`.
- [ ] Run format, lint, typecheck, focused Node, Status Playwright, full tests, build, release verification, and diff checks.
- [ ] Record exact missing DB/auth variables and unstarted gates without accessing live data.
- [ ] Update the rollout ledger with adoption, browser, automated, and review evidence.
- [ ] Commit `test(workspace): 데이터 신뢰도 경험 검증`.

## Completion conditions

- The approved documentation and four implementation/verification commits contain only their owned scope.
- Browser and automated evidence prove the user-facing surface on desktop and mobile.
- No raw operator table, technical job name, row count, trust score, or advisory/verdict copy renders.
- No DB/API/migration/dependency/public-contract change exists in the branch.
- Final whole-branch review reports no unresolved Critical or Important issue.
