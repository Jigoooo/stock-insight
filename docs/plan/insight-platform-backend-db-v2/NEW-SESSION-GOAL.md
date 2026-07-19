# NEW SESSION GOAL — Stock-Insight Backend/DB 강화

## 1. Authoritative artifacts

- Repository: `/home/jigoo/.hermes/workspace/stock-insight`
- Plan: `/home/jigoo/.hermes/workspace/stock-insight/docs/plan/insight-platform-backend-db-v2/00-backend-db-master-plan.md`
- Expected plan SHA-256: `d4ad8998ab1fe3dc1197491e19682e1655ee6b9545fd54e3093efdccfb039f0f`
- Handoff: `/home/jigoo/.hermes/workspace/stock-insight/docs/plan/insight-platform-backend-db-v2/NEW-SESSION-GOAL.md`
- Baseline architecture: `/home/jigoo/.hermes/workspace/stock-insight/docs/plan/stock-crypto-insight-platform-architecture.md`
- Historical A~G plans/logs: `/home/jigoo/.hermes/workspace/stock-insight/docs/plan/insight-platform/`

Trust order: fresh live readback > exact-hash master plan > this handoff > historical plans/logs > old conversation/memory.

If the plan hash differs, stop. Report the observed hash and inspect the diff before inheriting any approval or review verdict.

## 2. Truthful current state at handoff creation

- Date/time basis: 2026-07-19 Asia/Seoul.
- Git branch: `master`.
- Git HEAD: `a4a01d63699bf13c0b95c95185d5fa2a84f956ae`.
- Repo was already dirty from concurrent UI/frontend work before these documents were created.
- Latest `git status --porcelain` count during handoff creation: 45 entries, including the untracked new plan folder. This count can change because another UI task is active.
- Existing dirty areas include `apps/web`, `apps/web/test`, `e2e`, `pnpm-lock.yaml`, fonts/motion/form/accessibility files. They are unrelated and must be preserved.
- This planning session added only:
  - `docs/plan/insight-platform-backend-db-v2/00-backend-db-master-plan.md`
  - `docs/plan/insight-platform-backend-db-v2/NEW-SESSION-GOAL.md`
- Artifact review history: independent operational/data-contract audit found `BLOCKER 0 / HIGH 9`; all nine findings were incorporated into master plan SHA `d4ad8998...`. The edited revision has direct hash/readback validation only and no inherited independent PASS verdict.
- Master plan §3.9 now specifies deferred UI integration: current UI code remains forbidden, but future existing-surface changes, new graph/sector/theme/event/evidence screens, API contracts, rollout order, rollback, and UI acceptance gates are defined.
- No code, migration, DB data, config, Docker, systemd, cron, runtime, build, deploy, commit, push, reset, clean, or stash occurred in this planning session.
- Current production/live DB/runtime facts in the plan are dated baseline evidence, not inherited truth. Re-probe them.

## 3. Goal

UI 코드는 계속 동결한 채 master plan을 실행 가능한 backend/DB 강화 프로그램으로 전환한다. master plan §3.9의 deferred UI integration contract는 미래 제품 연결의 필수 downstream 계약으로 보존하되, 별도 UI 계획·승인 전에는 어떤 React/API-client 파일도 수정하지 않는다. 먼저 문서·live 상태와 plan-only checkpoint 여부를 재검증하고 TODO를 만든 뒤, 사용자 승인 전에는 계획 검토와 read-only preflight만 수행한다. 승인 후 첫 구현은 **B0 — Product truth stop-line** 하나로 제한한다.

## 4. Mandatory startup procedure

1. Load skills:
   - `fable-thinking`
   - `writing-plans`
   - `subagent-driven-development` and `test-driven-development` only after implementation approval
   - DB migration work before execution: `fable-thinking/references/db-migration-verification.md`
   - independent plan/code review: `fable-thinking/references/verifier-review-protocol.md`
   - outbox work: `crash-consistent-event-systems`
2. Run `date --iso-8601=seconds`.
3. `git -C /home/jigoo/.hermes/workspace/stock-insight status --short`, branch, HEAD, remotes.
4. Compute SHA-256 of the master plan and compare with the expected hash above. 이 일치는 변경 감지일 뿐 승인 앵커가 아니다. Git tree/commit 또는 외부 승인 기록의 plan-only checkpoint가 없으면 구현 전 이를 사용자에게 요청한다.
5. Read this handoff, the full master plan(특히 §0.3, §3.9, §5, §7, B0/B1/B9), and baseline architecture. Read historical A~G files only as evidence needed for the current bundle.
6. Re-probe read-only:
   - PostgreSQL version/extensions/roles
   - migration registry and migration IDs
   - source/source_contract/raw_object counts
   - entity/company/stock/listing/identifier coverage
   - claim/event verification states
   - relation/relation_evidence and theme/path counts
   - report run/pointer lineage
   - product API freshness semantics
   - systemd units/timers and deployed image/HEAD
7. Recreate TODOs for plan audit, B0 scope, tests, data migration, operational cutover, independent review. Only one item may be in progress.
8. Report to 주인님:
   - exact repo and branch/HEAD
   - plan hash status
   - unrelated dirty work discovered
   - live drift from the plan baseline
   - exact B0 proposed files/tests
   - code/DB/config/runtime side effects still pending approval
9. Wait for explicit approval before any source edit, build, migration, DB write, config change, service operation, commit, or push.

## 5. First implementation slice after approval: B0 only

Objective: stop current truth/lineage/freshness defects without building UI or expanding feature scope.

Expected code-contract files from the master plan; fresh inspection may refine exact paths before approval:

- Create: `packages/db-schema/src/migrations/018_backend_truth_gate.ts`
- Modify: `packages/db-schema/src/index.ts`
- Modify: `apps/api/src/publish/run-report-publish.ts`
- Modify: `apps/api/src/publish/run-event-brief.ts`
- Modify: `apps/api/src/product/read-model.ts`
- Modify: `apps/api/src/analytics/run-graph-inference.ts`
- Modify: `apps/api/scripts/run_knowledge_pipeline.sh`
- Create focused tests under `apps/api/test/`
- Create machine-readable `docs/plan/insight-platform-backend-db-v2/backend-db-gates.json`

Required RED cases:

1. unverified event is selected as a `fact`.
2. same-day report rerun reuses stale cutoff/snapshot metadata.
3. impact path with relation IDs but no immutable source evidence is exposed.
4. stale feature/impact/report/calibration rows remain `available`.
5. non-news pending knowledge documents are masked by a successful wrapper.

Implementation approval does not authorize migration apply or existing-data repair. Split B0 into:

- code/schema contract + tests
- migration rehearsal on temporary/clone DB
- live migration/data action
- build/deploy/service restart
- commit/push

Each requires the applicable explicit approval.

## 6. Forbidden actions

- Do not reset, clean, stash, checkout, reformat, or commit unrelated UI work.
- Do not assume the Workspace snapshot or this handoff is current.
- Do not edit `docs/plan/insight-platform/` history to make the new plan look complete.
- Do not invent source evidence for legacy relations.
- Do not label hypotheses/statistical/news co-mentions as structural facts.
- Do not install Kafka/Redpanda/Redis/Neo4j/AGE/Dagster before the relevant approved bundle and runtime gate.
- Do not run crash tests against live PostgreSQL.
- Do not apply a migration merely because migration SQL tests pass.
- Do not combine code commit approval with operational GO.
- Do not start UI/API client integration in this backend-first program.

## 7. Handoff completion criteria for the new session

Before saying “ready to implement,” the new session must prove:

- exact documents read
- plan hash matched
- date/repo/branch/HEAD/dirty state remeasured
- live DB/runtime baseline remeasured
- target repo identity reported
- B0 exact scope and tests reported
- TODO ledger created
- implementation side effects remain zero
- explicit user implementation approval is pending

---

## 8. Copy-paste prompt

```text
Goal: Stock-Insight의 UI 코드는 동결하고 backend·PostgreSQL 강화 계획을 이어서 진행한다. master plan §3.9의 향후 UI 연결 계약은 보존·검증하되 지금 UI를 구현하지 않는다. 먼저 문서와 live 상태를 재검증한 뒤 B0 실행 준비 상태를 보고하고 명시승인을 기다려라.

대상 repo:
/home/jigoo/.hermes/workspace/stock-insight

반드시 먼저 읽을 파일:
1. /home/jigoo/.hermes/workspace/stock-insight/docs/plan/insight-platform-backend-db-v2/NEW-SESSION-GOAL.md
2. /home/jigoo/.hermes/workspace/stock-insight/docs/plan/insight-platform-backend-db-v2/00-backend-db-master-plan.md
3. /home/jigoo/.hermes/workspace/stock-insight/docs/plan/stock-crypto-insight-platform-architecture.md

기대 master plan SHA-256:
d4ad8998ab1fe3dc1197491e19682e1655ee6b9545fd54e3093efdccfb039f0f

시작 절차:
- fable-thinking, writing-plans를 로드한다.
- date, git branch/HEAD/status/remotes, plan SHA-256을 실측한다. SHA 일치는 변경 감지일 뿐 승인 앵커가 아니므로 plan-only Git checkpoint 또는 외부 승인 해시가 없으면 구현 전 요청한다.
- 현재 repo에는 다른 UI/frontend dirty 작업이 있으므로 reset/clean/stash/commit/reformat하지 않는다.
- master plan §3.9에서 backend 완료 후 기존 화면 변경, 신규 graph/sector/theme/event/evidence 화면, API 계약, UI rollout/rollback/gate를 확인하되 별도 승인 전 UI 파일은 수정하지 않는다.
- PostgreSQL·migration registry·source contract·raw lineage·identity/taxonomy·claim/event verification·relation evidence·report lineage·API freshness·systemd/runtime을 read-only로 재측정한다.
- master plan의 B0~B9를 TODO로 복원하되 코어와 후속을 분리하고 한 항목만 in_progress로 둔다.
- 현재 live 상태와 계획 기준선의 차이, 정확한 B0 파일·테스트, 승인 경계를 나에게 먼저 보고한다.
- 내 명시승인 전 코드/DDL/DB/config/systemd/Docker/cron/build/deploy/commit/push를 수행하지 않는다.

첫 구현 후보는 B0 — Product truth stop-line 하나뿐이다. B0의 code contract, clone migration rehearsal, live DB action, deploy, commit/push를 각각 분리 승인한다. 현재 UI 구현·연결은 금지하지만 §3.9의 향후 UI integration contract는 backend acceptance의 downstream 호환성 기준으로 유지한다.
```
