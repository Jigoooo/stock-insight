# Task 2 implementation report

- Replaced the chronological History timeline with the approved read-only briefing order: summary, `오늘 다시 볼 판단`, `진행 중 판단`, `자동 시장 관찰`, then collapsed `지난 복기`.
- Kept loaded-scope claims explicit: the overall `scopeTotal` is labelled as the record scope, due/observation counts are labelled as loaded counts, and cursor pagination reports only the number currently loaded.
- Added a shared full-border/background/shadow selection surface with a single selection/open callback boundary for Task 3, capped priority rendering at three, preserved active-item separation, and kept past entries collapsed by default.
- Added normal zero-record and exact no-due states, 1240px principal-column stacking, stable wrapping, and bounded overflow behavior without adding API, DB, contract, dependency, advisory, performance, or success/failure semantics.
- Wired live History data through `buildHistoryBriefingModel` and injected the Task 1 deterministic briefing fixture into the development preview.
- RED: `pnpm --filter @stock-insight/web exec node --test test/history-briefing-structure.test.ts` failed 6/6 because `HistoryBriefingContent` and `history-view.module.css` did not exist.
- GREEN: the same structure test passed 6/6. The focused Task 1/History regression command passed 72/72, including model, preview routing, composition, pagination authority, shared UI, view-region, and decision-support coverage.
- Static verification: `pnpm --filter @stock-insight/web typecheck` passed; changed-file `oxlint`, changed-file `oxfmt --check`, and `git diff --check` passed.
- Scope note: Task 3's inspector was intentionally not implemented. Task 2 only establishes selected-item state plus the item/opener callback boundary.
