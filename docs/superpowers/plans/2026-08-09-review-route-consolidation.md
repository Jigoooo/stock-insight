# Review Route Consolidation Implementation Plan

## Goal

Make `/workspace/history` the only user-facing review surface, preserve old bookmarks through a no-load redirect, and delete the duplicate web UI without changing backend or public contracts.

## Constraints

- Use TDD for every behavior change.
- Do not change DB schema/data, migrations, API-server endpoints, public contracts, or dependencies.
- Do not move portfolio valuation, projected returns, or technical personalization packet content into another tab.
- Keep `.env`, generated graph output, and unrelated worktree changes out of commits.

## Tasks

### 1. Lock the canonical navigation and redirect

- Add failing tests proving `history` is the primary `복기` navigation item and `research` is absent from workspace identifiers.
- Add a failing route test proving `/workspace/research` performs a replace redirect before any loader exists.
- Update navigation, search, cache, route-loader validation, prefetch, lazy component, and active-view contracts.
- Commit `refactor(workspace): 복기 화면과 내비게이션 통합`.

### 2. Remove the duplicate web composition

- Add failing tests proving the workspace payload and orchestrator no longer accept or load `research`.
- Remove the `research` payload branch, orchestration branch, web BFF loader composition, legacy view, personalization UI helpers, and unused CSS.
- Migrate affected structural tests to canonical History behavior; delete only tests whose sole subject was removed UI.
- Commit `refactor(workspace): 중복 내 리서치 UI 제거`.

### 3. Verify the user journey

- Add or update browser coverage for the canonical History heading, legacy redirect, zero legacy requests, and exact inspector behavior.
- Regress Today, Stocks, Market Connections, and Status on desktop/mobile.
- Update `docs/superpowers/UI-SYSTEM-ROLLOUT.md` with browser and automated evidence.
- Run focused tests, format, lint, typecheck, full tests, build, release verification, `graphify update .`, and `git diff --check`.
- Record missing release DB/auth variables without accessing a live database.
- Commit `test(workspace): 복기 정본 경로 검증`.

## Completion conditions

- Navigation and direct URLs converge on `/workspace/history`.
- `/workspace/research` initiates no retired workspace data request.
- No legacy `내 리서치` UI or internal `research` view branch remains.
- Public/backend data contracts remain unchanged.
- Browser and automated verification report no unresolved product regression.
