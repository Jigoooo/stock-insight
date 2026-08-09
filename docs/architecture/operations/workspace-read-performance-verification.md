# Workspace read performance verification

Verified on 2026-08-09 for the `codex/workspace-read-performance` candidate.

## Implemented contracts

- The canonical Today, Stocks, Market Connections, History, and Status first-load paths can use one V2 BFF-to-brain request.
- Shell and active-view reads run inside one user-scoped `REPEATABLE READ READ ONLY` snapshot.
- Stock, market-connection, and Today record detail each use one aggregate briefing request.
- Pagination keeps its existing list endpoint and does not reload the shell.
- Drawer/modal presentation changes reuse the loaded detail.
- Retired Crypto, Themes, and Market Topic News routes replace-redirect before their former loaders can run.
- Query metrics expose only the approved query ID, elapsed milliseconds, and row count.
- `STOCK_INSIGHT_WORKSPACE_READ_V2` defaults to `legacy`; candidate activation requires an explicit `v2` value.

## Automated evidence

| Gate | Result |
| --- | --- |
| Focused web call-budget, redirect, release, and V2 routing tests | Passed |
| Focused API bundle, briefing, query metric, migration, and SQL tests | Passed |
| Five canonical preview surfaces, desktop and mobile | 108 passed, 36 viewport-conditional skipped, 0 failed |
| Repository format check | Passed |
| Repository lint | Passed with 6 pre-existing accessibility warnings and 0 errors |
| Repository typecheck | 11/11 tasks passed |
| Repository test | 10/10 tasks passed |
| Repository build | 7/7 tasks passed |
| Hard design gate | 17/17 passed |
| Graphify update | 11,180 nodes, 19,225 edges, 768 communities |

The retired Crypto UI fixture and browser gates were removed with the retired screen. Backend crypto contract/read-model coverage remains in place.

## Environment-gated evidence

`pnpm verify:release` passed lint, typecheck, the full test suite, and the hard design gate. It then stopped at `test:p6:db` because `P6_REHEARSAL_ADMIN_DATABASE_URL` was unset (`ERR_INVALID_URL`, input `''`). No database was contacted.

The following variables were also absent, so downstream disposable-DB and authenticated-browser gates were not started:

- `XG_REHEARSAL_ADMIN_DATABASE_URL`
- `STOCK_INSIGHT_E2E_DATABASE_URL`
- `STOCK_INSIGHT_E2E_SESSION_SECRET_PATH`
- `STOCK_INSIGHT_E2E_USER_ID`
- `STOCK_INSIGHT_E2E_USERNAME`
- `STOCK_INSIGHT_E2E_PASSWORD`

## Performance claims intentionally deferred

No disposable rehearsal database was available. Therefore this candidate does not claim endpoint p50/p95, SQL p50/p95, buffer reduction, execution-plan stability, RLS two-user parity, lock impact, or index size. No index or migration was applied and no production database was accessed.

Before enabling `v2` in a candidate environment:

1. Run 5 warm-up and 30 measured iterations on a safety-checked disposable rehearsal database.
2. Compare normalized legacy and V2 responses for all five views.
3. Verify two-user RLS isolation and single-snapshot consistency.
4. Confirm warm endpoint p95 is at most 500ms and named SQL p95 is at most 250ms.
5. Add an index only when the documented 20% improvement and stability criteria are met.
