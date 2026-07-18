#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=/home/jigoo/.hermes/workspace/stock-insight
DB_URL=postgresql://research_app@127.0.0.1:55432/research_app
source "$ROOT/apps/api/scripts/pipeline_common.sh"

pipeline_acquire_lock analytics
RUN_STARTED_AT=$(pipeline_db_now) || exit $?
WRAPPER_ATTEMPT_ID=$(pipeline_start_wrapper_attempt stock-insight-analytics-wrapper "$RUN_STARTED_AT") || exit $?
trap 'rc=$?; trap - EXIT; if ((rc != 0)); then pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" failed >/dev/null 2>&1 || true; fi; exit "$rc"' EXIT
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
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-feature-snapshot.ts --apply
pipeline_record_stage_success stock-insight-feature-snapshot-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-graph-inference.ts --events 500 --apply
pipeline_record_stage_success stock-insight-graph-inference-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/publish/run-report-publish.ts --apply
pipeline_record_stage_success stock-insight-report-publish-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/personalization/run-feed-build.ts --apply
pipeline_record_stage_success stock-insight-feed-build-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/analytics/run-probability-calibration.ts --apply
pipeline_record_stage_success stock-insight-probability-calibration-stage "$RUN_STARTED_AT" || exit $?

pipeline_require_db_assertion analytics "
SELECT CASE WHEN
  (SELECT count(DISTINCT job_name)
   FROM public.migration_runs
   WHERE job_name IN (
     'stock-insight-feature-snapshot-stage',
     'stock-insight-graph-inference-stage',
     'stock-insight-report-publish-stage',
     'stock-insight-feed-build-stage',
     'stock-insight-probability-calibration-stage'
   )
     AND status='completed'
     AND finished_at >= '${RUN_STARTED_AT}'::timestamptz) = 5
  AND (SELECT count(*) FROM serving.latest_feature_snapshot_v1) >= 250
  AND (SELECT count(*) FROM serving.market_confirmation_v1) >= 250
  AND (SELECT count(*) FROM personalization.user_feed_item WHERE feed_date=current_date) >= 1
  AND EXISTS (SELECT 1 FROM serving.probability_scorecard_v1)
THEN 1 ELSE 0 END
" || exit $?

pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" completed || exit $?
trap - EXIT
