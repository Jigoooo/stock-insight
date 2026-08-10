#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=/home/jigoo/.hermes/workspace/stock-insight
DB_URL=postgresql://research_app@127.0.0.1:55432/research_app
source "$ROOT/apps/api/scripts/pipeline_common.sh"

pipeline_acquire_lock analytics
RUN_STARTED_AT=$(pipeline_db_now) || exit $?
pipeline_start_wrapper_attempt stock-insight-analytics-wrapper "$RUN_STARTED_AT" || exit $?
WRAPPER_ATTEMPT_ID="$PIPELINE_WRAPPER_ATTEMPT_ID"
# Stages record a row only on success, so a mid-pipeline failure used to leave
# just `wrapper_failed`. The ERR trap captures the command that actually failed
# and hands it to the audit row, so migration_runs names the culprit.
PIPELINE_FAILED_COMMAND=""
trap 'PIPELINE_FAILED_COMMAND=$BASH_COMMAND' ERR
trap 'rc=$?; trap - EXIT; if ((rc != 0)); then pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" failed "$PIPELINE_FAILED_COMMAND" >/dev/null 2>&1 || true; fi; exit "$rc"' EXIT
pipeline_require_db_assertion analytics-input "
WITH latest_wrapper AS (
  SELECT DISTINCT ON (job_name) job_name, status, started_at, finished_at
  FROM public.migration_runs
  WHERE job_name IN (
    'stock-insight-ohlcv-wrapper',
    'stock-insight-knowledge-wrapper',
    'stock-insight-market-enrichment-wrapper'
  )
  ORDER BY job_name, started_at DESC, id DESC
)
SELECT CASE WHEN
  EXISTS (
    SELECT 1 FROM latest_wrapper
    WHERE job_name='stock-insight-ohlcv-wrapper'
      AND status='completed'
      AND finished_at >= now() - interval '36 hours'
  )
  AND EXISTS (
    SELECT 1 FROM latest_wrapper
    WHERE job_name='stock-insight-knowledge-wrapper'
      AND status='completed'
      AND finished_at >= now() - interval '4 hours'
  )
  AND EXISTS (
    SELECT 1 FROM latest_wrapper
    WHERE job_name='stock-insight-market-enrichment-wrapper'
      AND status='completed'
      AND finished_at >= now() - interval '36 hours'
  )
THEN 1 ELSE 0 END
" || exit $?
cd "$ROOT"
DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-core-identity-sync.ts --apply
pipeline_record_stage_success stock-insight-core-identity-sync-stage "$RUN_STARTED_AT" || exit $?
# Must follow the identity sync: it opens one economic claim per security in the
# master, and the master is what that step maintains. Writes an undetermined claim
# for anything it cannot evidence, which is nearly all of them — the point is that
# a consumer joining here gets NULL and has to decide, instead of getting nothing
# and assuming common equity (canonical/03 §2).
DATABASE_URL="$DB_URL" node apps/api/src/backfill/run-economic-claim.ts --apply
pipeline_record_stage_success stock-insight-economic-claim-stage "$RUN_STARTED_AT" || exit $?
# Must precede playbook assignment: a playbook is assigned by sector, and a stock the
# taxonomy has never classified cannot receive one. 178 of 297 stocks sat at explicit
# UNCLASSIFIED while 135 of them had a DART industry code already in this database,
# unmapped — and 59 more had no membership at all, which reads the same as classified
# to any check that looks for an UNCLASSIFIED row.
DATABASE_URL="$DB_URL" node apps/api/src/backfill/run-industry-classification.ts --apply
pipeline_record_stage_success stock-insight-industry-classification-stage "$RUN_STARTED_AT" || exit $?
# Must follow the identity sync for the same reason: it reads taxonomy membership,
# which that stage maintains. Gives every governed company a playbook revision to
# cite, which is the whole of REQ-DOM-001 — without one an analysis reinvents the
# sector's KPIs each run and nothing records that the list moved.
DATABASE_URL="$DB_URL" node apps/api/src/backfill/run-playbook-assignment.ts --apply
pipeline_record_stage_success stock-insight-playbook-assignment-stage "$RUN_STARTED_AT" || exit $?
# Must follow the classification for the obvious reason and must run EVERY time for a
# less obvious one: the predicate declares closed_world, so this job's output is what
# says a pair is still peers. Skipping it does not freeze the graph, it leaves a
# reclassified pair asserted — retraction only happens on a run.
DATABASE_URL="$DB_URL" node apps/api/src/relations/run-same-industry-relations.ts --apply
pipeline_record_stage_success stock-insight-same-industry-relations-stage "$RUN_STARTED_AT" || exit $?
# The cutoff is the audited database clock captured at wrapper start, normalized
# to the canonical ISO form required by the PIT runner. This keeps the live
# canary explicit and reproducible instead of letting the job consult now().
K4_CANARY_CUTOFF=$(
  node -e 'const value = new Date(process.argv[1]); if (Number.isNaN(value.valueOf())) process.exit(64); process.stdout.write(value.toISOString())' "$RUN_STARTED_AT"
)
# Must precede the K4 canary: the market-intelligence writer reads expectations and
# refuses to invent one, so without a producer analytics.surprise_revision is
# unreachable and REQ-EXP-001 can only hold in fixtures. The model is a random walk
# with drift over an evenly spaced annual run, and it emits nothing when the run has
# a gap or fewer than three priors.
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-k4-prior-model-expectation.ts --live --cutoff "$K4_CANARY_CUTOFF" --apply
pipeline_record_stage_success stock-insight-k4-prior-model-expectation-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-k4-market-intelligence.ts --canary --cutoff "$K4_CANARY_CUTOFF" --apply
pipeline_record_stage_success stock-insight-k4-market-intelligence-canary-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-feature-snapshot.ts --apply
pipeline_record_stage_success stock-insight-feature-snapshot-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-graph-inference.ts --events 500 --apply
pipeline_record_stage_success stock-insight-graph-inference-stage "$RUN_STARTED_AT" || exit $?
# v2 impact publishing runs before report publishing on purpose.
#
# On 2026-08-03 a single news headline failed run-report-publish's action-advice
# gate, and because report publishing sat earlier in the file, `set -e` took the
# whole pipeline down with it — including every impact path the product serves.
# One rejected report block stopped the graph.
#
# The two are independent, checked in both directions: report publishing reads
# content.report_definition, knowledge.claim, knowledge.event and
# latest_report_pointer; v2 publishing writes analytics.graph_* and
# impact_path_*. Neither reads what the other writes. v2 publishing also does not
# read analytics.calibration_profile or personalization.user_feed_item, so it is
# safe ahead of those steps too.
#
# run-feed-build is the one later step that genuinely depends on report output —
# it reads content.report — so it stays after report publishing.
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-v2-graph-publish.ts --apply
pipeline_record_stage_success stock-insight-v2-graph-publish-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-v2-analytics-publish.ts --apply
pipeline_record_stage_success stock-insight-v2-l5-publish-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/publish/run-report-publish.ts --apply
pipeline_record_stage_success stock-insight-report-publish-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/personalization/run-feed-build.ts --apply
pipeline_record_stage_success stock-insight-feed-build-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-probability-calibration.ts --apply
pipeline_record_stage_success stock-insight-probability-calibration-stage "$RUN_STARTED_AT" || exit $?
# K6 common asset view. After the v2 publishes because it reads what they leave in
# serving.impact_summary_v2 and serving.market_confirmation_v1, and before nothing —
# no other stage reads it. It is shadow until K7 wires a surface onto it.
#
# It also opens and publishes the release manifest, which migration 081 created in
# August and nothing has written since; REQ-REL-001 cannot compare releases that do
# not exist. The release id is derived from the as-of date, so a same-day rerun
# collides on the primary key rather than minting a second release for one day.
DATABASE_URL="$DB_URL" node apps/api/src/serving/run-common-asset-view.ts --apply
pipeline_record_stage_success stock-insight-common-asset-view-stage "$RUN_STARTED_AT" || exit $?
# Needs prices and registered holdings, nothing else — independent of report and
# impact publishing. personalization.portfolio_snapshot had readers and no writer
# since it was created; registration itself was already visible because the stocks
# read model selects user_positions directly.
DATABASE_URL="$DB_URL" node apps/api/src/personalization/run-portfolio-snapshot.ts --apply
pipeline_record_stage_success stock-insight-portfolio-snapshot-stage "$RUN_STARTED_AT" || exit $?
# Which tables we own, fill, and nobody reads. Read-only; reports a gauge rather
# than failing, because "built and unconsumed" is a backlog to watch, not an error
# to page on. The number moving is the signal — the same reason the unattributed
# event count is reported every knowledge cycle.
DATABASE_URL="$DB_URL" node apps/api/src/ops/run-table-reachability-audit.ts --apply
pipeline_record_stage_success stock-insight-table-reachability-audit-stage "$RUN_STARTED_AT" || exit $?
# Whether every source still has an honest, approved contract. Unlike the audit
# above this one FAILS the run: an unread table is backlog, but an approved
# contract with no ADR-002 basis is a source minting accepted evidence it was
# never cleared to mint.
#
# These assertions already existed in source-contract-integrity.test.ts and were
# skipping silently — that test needs STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL
# and marks every case skip without it, which is how migration 069's violation sat
# behind a green suite for a day. The mutating cases still need a disposable DB and
# stay there; these are pure SELECT and belong on a timer against the real one.
DATABASE_URL="$DB_URL" node apps/api/src/ops/run-source-contract-audit.ts --apply
pipeline_record_stage_success stock-insight-source-contract-audit-stage "$RUN_STARTED_AT" || exit $?

# REQ-PIT-003: now() must not be a business cutoff. A source audit rather than a
# database one — the defect lives in SQL text, so it reads no database and could
# run in CI. It runs here because the same reasoning applies as to the source
# contract audit above: an assertion that only lives in a test suite is one
# skipped environment away from being silently green, and this one guards the
# property every backtest rests on. Two known exceptions are recorded in the job
# itself with the phase that closes them; a new violation fails the pipeline.
node apps/api/src/ops/run-pit-now-audit.ts
pipeline_record_stage_success stock-insight-pit-now-audit-stage "$RUN_STARTED_AT" || exit $?

DATABASE_URL="$DB_URL" node apps/api/src/ops/run-outbox-delivery.ts --apply --loop
pipeline_record_stage_success stock-insight-outbox-delivery-stage "$RUN_STARTED_AT" || exit $?

pipeline_require_db_assertion analytics "
SELECT CASE WHEN
  (SELECT count(DISTINCT job_name)
   FROM public.migration_runs
   WHERE job_name IN (
     'stock-insight-core-identity-sync-stage',
     'stock-insight-feature-snapshot-stage',
     'stock-insight-graph-inference-stage',
     'stock-insight-report-publish-stage',
     'stock-insight-feed-build-stage',
     'stock-insight-probability-calibration-stage',
     'stock-insight-v2-graph-publish-stage',
     'stock-insight-k4-prior-model-expectation-stage',
     'stock-insight-k4-market-intelligence-canary-stage',
     'stock-insight-v2-l5-publish-stage',
     'stock-insight-portfolio-snapshot-stage',
     -- Listed, unlike the reachability gauge above it, because the whole point of
     -- this stage is that its predecessor was a detector nobody noticed was off.
     -- Asserting it RAN is the part that was missing.
     'stock-insight-source-contract-audit-stage',
     'stock-insight-outbox-delivery-stage'
   )
     AND status='completed'
     AND finished_at >= '${RUN_STARTED_AT}'::timestamptz) = 13
  AND (SELECT count(*) FROM serving.latest_feature_snapshot_v1) >= 250
  AND (SELECT count(*) FROM serving.market_confirmation_v1) >= 250
  AND (SELECT count(*) FROM personalization.user_feed_item WHERE feed_date=current_date) >= 1
  AND EXISTS (SELECT 1 FROM serving.probability_scorecard_v1)
  AND EXISTS (
    SELECT 1 FROM ops.pipeline_run_claim claim
    -- Prefix match: a re-run publishes under 'v2-graph-publish:<date>#<suffix>'
    -- (see SLOT_SUFFIX in run-v2-graph-publish.ts). Exact equality here would make
    -- a supported re-run fail its own readback.
    WHERE claim.natural_run_key LIKE 'v2-graph-publish:' ||
          to_char(clock_timestamp() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') || '%'
      AND claim.claim_status='completed'
      AND claim.completed_at IS NOT NULL
  )
  AND EXISTS (SELECT 1 FROM analytics.graph_snapshot WHERE status='sealed')
  AND EXISTS (SELECT 1 FROM analytics.impact_path_v2 WHERE status='sealed')
  AND EXISTS (SELECT 1 FROM analytics.graph_community)
  AND EXISTS (SELECT 1 FROM analytics.relation_measurement)
  AND (SELECT count(*) FROM ops.outbox_delivery
       WHERE destination='consumer_inbox:selective-recompute'
         AND status IN ('pending','leased')) = 0
  AND (SELECT count(*) FROM ops.outbox_delivery WHERE status = 'dead') = 0
  AND (SELECT count(*) FROM ops.dead_letter WHERE dead_at >= '${RUN_STARTED_AT}'::timestamptz) = 0
  AND EXISTS (
    SELECT 1 FROM serving.v_relation_graph_freshness
    WHERE servable=true
  )
THEN 1 ELSE 0 END
" || exit $?

pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" completed || exit $?
trap - EXIT
