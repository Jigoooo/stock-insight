# K4 Market Intelligence Execution Plan

## Global constraints

- Work only in the isolated `codex/k4-market-intelligence` worktree created from
  master `5b66df1`; never edit migrations 037, 079, or 087.
- Use strict TDD for every production behavior: add the focused test, run it and
  observe the expected failure, then write the minimum implementation and rerun.
- Product output stays read-only research. Do not add order execution or buy/sell
  advisory language.
- Accepted/served K4 evidence is limited to PIT classes A, B, and C. PIT D/E,
  including RSS, may appear only in diagnostic rejection receipts.
- Do not alter or bulk-promote the existing association-derived impact paths.
- Every new runner defaults to dry-run and supports `--rehearse` (write then
  rollback) and `--apply`; repeated identical cutoff inputs must have the same
  digest and produce no duplicate writes.

### Task 1: Canonical issuer/playbook resolution and K4 schema

- Add only new additive migrations after 087 and register them in dependency
  order. Add an executable, versioned business-driver measurement-rule registry
  for inventory, fixed-cost/PPE, and capex measurements. Each rule stores input
  concept selectors, comparison method, output unit, direction/materiality
  policy, minimum history, allowed PIT classes, and all eight score-component
  formula inputs.
- Make issuer company the canonical playbook-assignment subject. Migrate open
  semiconductor assignments by closing security-subject rows and adding issuer
  rows through the exact temporal `core.security_issuer_identity` row.
- Add a v2 resolved view returning security entity, issuer entity,
  `security_issuer_identity_id`, playbook revision, and driver/rule identity.
- Add append-only K4 ledgers for expectation revisions, surprise revisions,
  range-only valuation estimates, impact evaluation revisions, path-step to
  exposure citations, and +1/+5/+20 outcome revisions.
- An evaluation records one of accepted, missing_identity, no_pit_evidence,
  unsupported_measurement, ambiguous_driver_attribution, or
  no_recent_observation. Accepted rows must reference a sealed exposure;
  rejected rows must not.
- Strengthen exposure sealing through a new guard without changing migration
  037: require one accepted evaluation basis, exact playbook/driver/rule/AIS/
  derivation/identity citations, PIT A/B/C evidence, matched units, and all eight
  score components.
- Add migration static tests and disposable-DB rehearsal coverage for additive
  DDL, append-only behavior, citation checks, unit rejection, and PIT D/E
  rejection. Commit the task.

### Task 2: SEC raw companyfacts to canonical numeric facts

- Add a pure SEC mapper and planning module plus an I/O runner that reads existing
  `sec-edgar` raw objects/source revisions directly, never
  `market.financial_fact` as input.
- Resolve issuer by CIK. Preserve taxonomy, tag, unit, accession, form, filed
  date, fiscal period, period bounds, and deterministic entry identity in the
  original XBRL locator.
- Use conservative filing-day availability and source-revision ingestion time as
  `known_at`; a fact must never appear at a cutoff before it was collected.
- Build stable fact/restatement keys, deterministic revision chains, metric
  definitions, schema preflight, folded-table parity diagnostics, and
  idempotent batch writes.
- Default to dry-run and support `--rehearse`, `--apply`, and bounded issuer
  selection. Wire the recurring job adjacent to SEC collection and add a DB
  rehearsal command.
- Test mapping, locator completeness, unit handling, amendments/restatements,
  PIT timing, missing CIK, idempotency, and job wiring using red-green TDD.
  Commit the task.

### Task 3: Market-intelligence writer and seven-cutoff replay

- Implement a deterministic writer that plans source-grounded filing events,
  prior-model expectations, actual-vs-expected surprises, executable driver
  measurements, shocks, evaluations, exposures, score components, valuation
  ranges, path citations, and outcome rows in that order.
- Never attribute a revenue surprise to demand, ASP, or mix without direct
  evidence; record `ambiguous_driver_attribution` instead.
- Evaluate all ten semiconductor securities at every requested cutoff and persist
  an explicit reason for unsupported rows. Only accepted evaluations may produce
  sealed exposures.
- Create/seal one Analysis Information Set per cutoff with observed, available,
  known, and market-data cutoffs fixed to that run. Enforce source/fact
  `available_at` and `known_at` at or before the cutoff.
- Add a replay CLI accepting `--from`, `--to`, and KST cutoff time. The initial
  target is seven daily cutoffs from 2026-08-02 through 2026-08-08 inclusive.
- Compute outcomes only when the corresponding trading-session bar exists:
  mature +1d may be evaluated; +5d/+20d remain pending until mature.
- The runner defaults to dry-run and supports rehearse/apply/canary, deterministic
  digest, and idempotent rerun receipts. Wire it into the analytics pipeline.
- Test good-actual/bad-surprise coexistence, unknown-cause refusal, future leak
  rejection, PIT D/E rejection, unit mismatch, ten-security coverage, outcome
  maturity, and replay determinism with red-green TDD. Commit the task.

### Task 4: Unit-aware p4.v2 shadow API

- Preserve `GET /personalization/portfolio-impact` and the `p4.v1` schema, but
  make it return `availability: not_computed` without summing exposure units.
- Add `GET /personalization/portfolio-impact/v2` and a `p4.v2` contract.
  Do not include scalar `aggregateImpact`.
- Group only by equal horizon, channel, and `economicMagnitude.unit`. Each
  exposure returns magnitude/value+unit, direction, materiality, uncertainty,
  eight decomposed score components, and playbook/driver/AIS/derivation/evidence
  references.
- Return ten-security coverage and the persisted reason codes for unsupported
  evaluations. Fail closed: no uncited/unsealed exposure or path step is served.
- Keep the current web UI on p4.v1; p4.v2 is a shadow API for K4 and UI migration
  remains K7.
- Add contract, read-model, controller/auth, user-isolation, mixed-unit, and
  fail-closed tests through red-green TDD. Commit the task.

### Task 5: Verification, live landing, and handoff

- Run format check, lint, typecheck, all tests, build, disposable DB rehearsals,
  and `verify:release` with the documented rehearsal DSNs. Fix only failures
  caused by this branch and preserve unrelated user work.
- Review the complete branch against this plan. Resolve all critical/important
  findings before live work.
- Perform the documented live sequence: backup and restore verification; confirm
  exact pending migrations; apply schema; repin catalog digests if app grants
  moved; rebuild/pin/restart the API image and verify health.
- Target Samsung OpenDART with offset 17 and limit 1, then apply DART and SEC
  canonical numeric-fact writers. Do not wait for the normal cursor cycle.
- Dry-run, rehearse, and apply the 2026-08-02..08 seven-cutoff replay, rerun it to
  prove identical digest/no duplicates, then execute one current live canary.
- Require ten evaluated securities, explicit missing reasons, at least one live
  accepted exposure, 100% accepted citation completeness, zero PIT D/E accepted,
  zero mixed-unit scalar aggregation, zero uncited v2 path steps, mature +1d
  outcomes evaluated, and immature +5/+20 outcomes pending.
- Update the execution log current marker and correct canonical names:
  K6 Common Asset View, K7 Product Surface, K8 Recommendation Shadow. Record that
  historical replay plus one canary replaced the literal live-week wait; do not
  claim a live week was observed.

