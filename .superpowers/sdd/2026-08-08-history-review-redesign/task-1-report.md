# Task 1 implementation report

- Added a page-local history briefing model with `alert_review` observation classification, de-duplication, due ordering/cap, past separation, loaded-scope summary counts, synchronous honest live detail, and HTTPS-only source links.
- Added deterministic `default`, `no-user-judgments`, `no-due`, `empty`, `partial`, and `detail-error` preview fixtures and discriminated `surface=history` routing without authenticated or network loaders.
- RED: `pnpm --filter @stock-insight/web exec node --test test/history-briefing.test.ts test/dev-surface-routing.test.ts` failed 9/21 as expected because the model, fixture, and History route branch did not exist.
- GREEN: the same focused command passed 21/21.
- Static verification: `pnpm --filter @stock-insight/web typecheck` passed; changed-file `oxlint` passed; changed-file `oxfmt --check` passed. The web-wide lint passed with six pre-existing `prefer-tag-over-role` warnings outside Task 1 files.
- Scope note: the existing `apps/web/src/routes/[__dev-preview].tsx` already delegates search validation and spreads the discriminated preview request, so History support required no route-component edit.

## Review fix

- Added a regression for `{ surface: 'history', scenario: 'bogus' }`: RED failed 1/21 with `Missing expected exception`; GREEN passed 21/21 after allowing only an omitted/`undefined` scenario or one of the exact six History scenarios.
- Re-ran the focused tests, web typecheck, changed-file lint/format checks, and diff check before the scoped follow-up commit.
