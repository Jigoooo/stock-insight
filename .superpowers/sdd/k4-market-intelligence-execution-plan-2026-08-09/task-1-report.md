# Task 1 report: canonical issuer/playbook resolution and K4 schema

## Status

DONE. Implementation commit:
`e0399b6f3d4b10f41b47b642d4f430ee84aef779`.

## Files changed

- `packages/db-schema/src/migrations/088_issuer_playbook_measurement_rule.ts`
  adds canonical issuer-subject playbook assignments, migrates open legacy
  semiconductor security assignments through the exact temporal
  `core.security_issuer_identity` row, adds versioned executable measurement
  rules, seeds inventory/fixed-cost-PPE/capex rules, and exposes the v2
  security-to-issuer/playbook/driver/rule view.
- `packages/db-schema/src/migrations/089_k4_market_intelligence_ledger.ts`
  adds the append-only expectation, surprise, range valuation, evaluation,
  evidence, path-citation, and +1/+5/+20 outcome ledgers and installs the
  forward-only strengthened exposure guard.
- `packages/db-schema/src/index.ts` registers migrations 088 and 089 in
  dependency order and exports their SQL.
- `packages/db-schema/test/k4-market-intelligence-migration.test.ts` adds 11
  focused static migration tests.
- `apps/api/scripts/run-kernel-db-rehearsal.mjs` extends the disposable DB
  rehearsal through migration 089 and exercises the K4 invariants.
- `.superpowers/sdd/k4-market-intelligence-execution-plan-2026-08-09/task-1-report.md`
  is this report.

The pre-existing untracked
`docs/plan/k4-market-intelligence-execution-plan-2026-08-09.md` was not
modified or committed.

## Design decisions

- Added only migrations 088 and 089; migrations 037, 079, and 087 remain
  unchanged.
- Playbook assignments are canonical at issuer Company level. The migrated
  successor retains `security_issuer_identity_id`, so resolution to a security
  is exact and temporally auditable rather than inferred from a current issuer.
- Measurement rules are versioned executable records containing concept
  selectors, comparison method, output unit, direction and materiality policy,
  minimum history, PIT A/B/C allow-list, and the exact eight score inputs.
- Valuation revisions intentionally store only lower and upper estimates; no
  point estimate column exists.
- Accepted evaluations and exposure sealing form one atomic transaction. A
  deferred constraint trigger permits creating the evaluation against a
  building exposure, while commit still fails unless the exposure is sealed.
- Rejected evaluations require non-empty detail and cannot cite an exposure.
  Diagnostic evidence may be retained, but accepted evidence admits only exact
  PIT A/B/C source-quality citations.
- The migration replaces the migration-037 write trigger forward-only instead
  of editing historical migration SQL. The new guard preserves the old
  lifecycle constraints and adds the K4 exact-citation, unit, history, and
  eight-component requirements.
- Append-only ledgers reject mutation with SQLSTATE `55000`.

## TDD evidence

Baseline before changes:

```text
pnpm --filter @stock-insight/db-schema test
Result: exit 0; 249 tests passed, 0 failed.
```

Initial RED after adding the focused tests but before migrations 088/089:

```text
node --test packages/db-schema/test/k4-market-intelligence-migration.test.ts
Result: exit 1; 0 passed, 11 failed. Registration, issuer migration, rule
registry/view, ledgers, and strengthened guard were all absent as expected.
```

The first implementation run produced 9/11 passing; two assertions were too
source-specific (`entity_type` versus the implemented `subject_type`, and a
comment containing `point_estimate`). The tests were tightened to assert schema
semantics rather than spelling/comments. Focused GREEN:

```text
node --test packages/db-schema/test/k4-market-intelligence-migration.test.ts
Result: exit 0; 11 passed, 0 failed.
```

Self-review added two missing contract assertions before production changes:
rejections require `reason_detail IS NOT NULL`, and minimum history counts
distinct numeric facts.

```text
node --test packages/db-schema/test/k4-market-intelligence-migration.test.ts
RED result: exit 1; 9 passed, 2 failed.
GREEN result after the minimal SQL changes: exit 0; 11 passed, 0 failed.
```

Final focused refresh after review and graph update:

```text
node --test packages/db-schema/test/k4-market-intelligence-migration.test.ts
Result: exit 0; 11 passed, 0 failed, 0 skipped.
```

## Disposable database rehearsal

The rehearsal used only the uniquely named local ephemeral Postgres 17
container `stock-insight-k4-rehearsal-20260809` on port 55489. The credential
below is intentionally redacted; no live database or deployment was touched.

```text
KERNEL_REHEARSAL_ADMIN_DATABASE_URL=postgresql://postgres:<ephemeral-password>@127.0.0.1:55489/postgres pnpm --filter @stock-insight/api test:kernel-db-rehearsal
Final result: exit 0. Reapply idempotence, all prior kernel groups, role-state
restoration, and every K4 assertion were true.
```

Rehearsal-driven failures fixed before the final pass:

1. SQLSTATE `42703`: the harness selected `source_pit_quality_id` from a current
   view that does not project it. It now joins the exact ledger revision.
2. The append-only test expected `P0001`, but the intentional ledger SQLSTATE is
   `55000`; the rehearsal now asserts the actual contract.
3. The migrated issuer identity citation was NULL because `assignment.*` and a
   join field shared a record-field name. The join value now has the unique
   alias `exact_identity_id`.
4. SQLSTATE `42601`: the `reason_detail IS NOT NULL` hardening was initially
   patched outside its CHECK branch. It was moved into the rejected-row branch.

Final cleanup evidence:

```text
docker ps -a --filter name=^/stock-insight-k4-rehearsal-20260809$ --format "{{.Names}} {{.Status}}"
Result: exit 0 with empty output; the ephemeral container was removed.
```

## Broader verification

```text
pnpm format:check && pnpm lint && pnpm typecheck
Result: exit 0. Formatting and typecheck passed. Lint reported 0 errors and 6
pre-existing unrelated web accessibility warnings.

pnpm --filter @stock-insight/db-schema test && pnpm --filter @stock-insight/api test && pnpm build
Result: exit 0; both test suites and the workspace build passed.

graphify update .
Result: exit 0; 12,755 nodes, 17,675 edges, 847 communities. `graphify-out/`
remained ignored and was not committed.

git diff --cached --check
Result: exit 0 before the implementation commit.
```

## Self-review

- Confirmed migrations 037, 079, and 087 have no changes.
- Confirmed 088/089 are registered after 087 and reapply idempotently.
- Confirmed exact identity, issuer assignment, rule identity, AIS, derivation,
  evidence source revision/PIT quality, unit, minimum-history, and all eight
  score citations fail closed at exposure sealing.
- Confirmed accepted evaluation sealing succeeds atomically and rejected rows,
  PIT D/E evidence, mixed units, missing citations, and ledger rewrites fail.
- Confirmed no live DB, deployment, or unrelated file was touched.

## Commit

The implementation and executable verification changes are committed at
`e0399b6f3d4b10f41b47b642d4f430ee84aef779`. This report is intentionally a
separate follow-up commit so it can cite the immutable implementation SHA.

## Concerns

No Task 1 blocker. The six lint warnings are pre-existing and outside this
scope. Full release/browser gates belong to the later integration task and were
not run here; the focused schema/API/build and real disposable-DB gates passed.
