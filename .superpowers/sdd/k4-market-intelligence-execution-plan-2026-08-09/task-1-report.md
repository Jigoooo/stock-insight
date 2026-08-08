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

# Review fix round 1/5 — 2026-08-09

## Status and files changed

All review findings were resolved without changing the execution plan, touching
the live database, or editing migrations 037, 079, or 087. The implementation
commit changed exactly these four files:

- `packages/db-schema/src/migrations/088_issuer_playbook_measurement_rule.ts`
- `packages/db-schema/src/migrations/089_k4_market_intelligence_ledger.ts`
- `packages/db-schema/test/k4-market-intelligence-migration.test.ts`
- `apps/api/scripts/run-kernel-db-rehearsal.mjs`

The unrelated untracked file
`docs/plan/k4-market-intelligence-execution-plan-2026-08-09.md` was preserved
untouched.

## Root-cause architecture and design decisions

The review fix replaces the former collection of sealing predicates with one
explicit economic-evidence validation boundary:

- `analytics.validate_k4_evaluation_basis(evaluation_id, exposure_id,
  exposure_unit)` owns canonical issuer/playbook assignment, exact security to
  issuer identity, active/effective/known playbook and rule resolution, rule
  selectors, current/comparison period semantics, exact sealed derivation
  inputs, fact issuer/source/unit/cutoffs, PIT A/B/C policy, minimum history,
  and the executable measurement result. The validator is 200 lines (migration
  089 lines 460-659).
- `analytics.guard_k4_impact_exposure_write()` owns only exposure lifecycle,
  immutable fields, exact revision succession, the one-accepted-evaluation
  requirement, eight score components, and delegation to the validator. It is
  89 lines (migration 089 lines 664-752); the former ad-hoc evidence checks were
  removed.
- `analytics.guard_impact_evaluation_evidence()` is a 47-line insertion
  boundary for exact source/PIT identity and rejects appending evidence after
  an accepted exposure is sealed.
- `governance.validate_exact_revision_chain()` (26 lines) and
  `analytics.validate_k4_exact_revision_chain()` (27 lines) enforce the same
  logical key and exactly revision N-1 for the new versioned rules and ledgers.
- Migration 088 now aborts before canonicalization if an open semiconductor
  Stock assignment has no exact `core.security_issuer_identity`; it never
  invents an issuer.
- Raw evaluation/evidence ledgers are explicitly revoked from `si_readapi`.
  `accepted_impact_evaluation_v1` and
  `accepted_impact_evaluation_evidence_v1` expose only sealed accepted rows and
  A/B/C evidence. Pipeline roles retain the diagnostic ledgers.

Final source sizes are 330 lines for migration 088 and 816 lines for migration
089. The focused static test is 299 lines and the full disposable rehearsal
harness is 1,661 lines.

## Strict TDD evidence

The review tests were added before the production SQL. Static RED:

```text
node --test packages/db-schema/test/k4-market-intelligence-migration.test.ts
Result: exit 1; 11 passed, 8 failed. The failures named the missing unresolved
identity preflight, exact revision chains, issuer assignment/cutoffs,
issuer-selector-period-derivation binding, sealed evidence freeze, temporal
rule/quality checks, and diagnostic/serving privilege separation.
```

The same negative cases were then added to the disposable PostgreSQL harness
before production changes. Review RED:

```text
KERNEL_REHEARSAL_ADMIN_DATABASE_URL=postgresql://postgres:<ephemeral-password>@127.0.0.1:55490/postgres pnpm --filter @stock-insight/api test:kernel-db-rehearsal
Result: exit 1. The new K4 assertions failed for unresolvedAssignmentMigrationRejected,
exactRuleRevisionChainRejected, exactLedgerRevisionChainRejected,
unassignedIssuerRejected, wrongIssuerRejected, wrongConceptRejected,
wrongPeriodRejected, unrelatedDerivationRejected, futureKnownRuleRejected,
futureKnownQualityRejected, sealedEvidenceAppendRejected,
rawDiagnosticsHidden, and acceptedServingViewsVisible. The existing PIT-quality
row-count assertion also exposed the deliberate future-known fixture revision
and was corrected from eight seeded revisions to nine fixture revisions.
```

Rehearsal-driven implementation failures were kept visible rather than hidden:

1. The first structural edit placed the rule-chain function between the
   measurement-rule `INSERT INTO` header and its column list, so PostgreSQL
   rejected migration 088. The function/trigger boundary was moved before the
   complete seed statement.
2. A first serving-boundary edit placed the accepted views inside the exposure
   trigger function body, so PostgreSQL rejected migration 089. The views and
   grants were moved after the completed trigger/function DDL.
3. The future-known PIT-quality fixture initially made the old seeded-row
   assertion fail (eight versus nine). The assertion now distinguishes seeded
   grades from the intentional extra revision.
4. The duration-period regression fixture initially nested `BEGIN`; its
   `ROLLBACK` discarded the outer accepted fixture and produced `accepted
   evaluation must reference a sealed exposure`. The transactions were made
   independent before judging production behavior.

Once the fixture was valid, self-review of the reviewed period-semantics
finding added calendar-year assertions before changing SQL:

```text
node --test packages/db-schema/test/k4-market-intelligence-migration.test.ts
RED result: exit 1; 18 passed, 1 failed because duration comparison used +365.

KERNEL_REHEARSAL_ADMIN_DATABASE_URL=postgresql://postgres:<ephemeral-password>@127.0.0.1:55490/postgres pnpm --filter @stock-insight/api test:kernel-db-rehearsal
RED result: exit 1; only k4.durationYearOverYearAccepted failed.
```

The minimal production change used `interval '1 year'` for both duration
period boundaries. Final focused GREEN:

```text
node --test packages/db-schema/test/k4-market-intelligence-migration.test.ts
Result: exit 0; 19 passed, 0 failed, 0 skipped.
```

Final real-database GREEN:

```text
KERNEL_REHEARSAL_ADMIN_DATABASE_URL=postgresql://postgres:<ephemeral-password>@127.0.0.1:55490/postgres pnpm --filter @stock-insight/api test:kernel-db-rehearsal
Result: exit 0. Reapply idempotence and role restoration were true; all 25 K4
assertions were true, including the negative issuer/selector/derivation/PIT,
sealed-append, raw-ACL, revision-chain, and duration-period cases.
```

## Broader verification

```text
pnpm format:check
Initial result: exit 1; only the modified rehearsal and focused-test files
needed formatting. After running oxfmt on those two files, final result: exit 0.

pnpm lint
Result: exit 0; 0 errors. Six pre-existing accessibility warnings were emitted
from untouched web files.

pnpm typecheck
Result: exit 0; 11/11 tasks successful.

pnpm --filter @stock-insight/db-schema test -- k4-market-intelligence-migration.test.ts
Result: exit 0; the package runner executed 268 tests, all passed.

pnpm --filter @stock-insight/api test
Result: exit 0; 1,017 passed, 0 failed, 45 environment-gated skips.

pnpm build
Result: exit 0; 7/7 tasks successful. Vite emitted its existing large-chunk
advisory only.

graphify update .
Result: exit 0; 12,778 nodes, 17,701 edges, 852 communities. Generated graph
output remained ignored and was not committed.

git diff --check
git diff --cached --check
Result: exit 0 for both hygiene checks.
```

## Disposable database cleanup

The rehearsal used only local container
`stock-insight-k4-rehearsal-fix1-20260809` on port 55490. No live database or
deployment was touched.

```text
docker rm -f stock-insight-k4-rehearsal-fix1-20260809
Result: exit 0; printed the exact container name.

docker ps -a --filter name=stock-insight-k4-rehearsal-fix1-20260809 --format '{{.Names}}'
Result: exit 0 with empty output; the disposable container is absent.
```

## Self-review

- Confirmed the staged implementation contains only the four intended files;
  migrations 037, 079, and 087 and the execution plan have no changes.
- Confirmed the assignment is exact on issuer and playbook, temporally valid
  and known at AIS cutoffs, and identity-cited where present.
- Confirmed every accepted evidence fact is issuer-owned, selector-admitted,
  source-exact, period-role correct, and an exact input to the sealed cited
  derivation; extra derivation inputs and extra evidence both fail closed.
- Confirmed playbook, rule, fact, identity, assignment, and PIT-quality cutoffs
  are evaluated at the AIS rather than wall-clock time.
- Confirmed accepted evidence freezes at exposure sealing and raw rejected/D/E
  diagnostics are not reachable by `si_readapi`.
- Confirmed exact N-1 same-key succession covers the new measurement rules and
  five new versioned K4 ledgers.
- Confirmed the generic helpers remain purpose-specific and the exposure guard
  delegates the complete economic-evidence decision to one named validator.

## Commit

The review-fix implementation and executable tests are committed at
`800134fd583456938545874437f786dfe8329058`. This appended report is committed
separately so it can cite the immutable implementation SHA.

## Concerns

No Task 1 blocker. The six lint warnings and Vite chunk-size advisory are
pre-existing and outside the touched schema/rehearsal files. Environment-gated
API database tests remained skipped by their existing contracts; the dedicated
K4 PostgreSQL rehearsal ran against the disposable database and passed.
