#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=/home/jigoo/.hermes/workspace/stock-insight
DB_URL=postgresql://research_app@127.0.0.1:55432/research_app
ENV_FILE=/home/jigoo/.hermes/.env
source "$ROOT/apps/api/scripts/pipeline_common.sh"

pipeline_acquire_lock knowledge || exit $?
RUN_STARTED_AT=$(pipeline_db_now) || exit $?
WRAPPER_ATTEMPT_ID=$(pipeline_start_wrapper_attempt stock-insight-knowledge-wrapper "$RUN_STARTED_AT") || exit $?
trap 'rc=$?; trap - EXIT; if ((rc != 0)); then pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" failed >/dev/null 2>&1 || true; fi; exit "$rc"' EXIT
pipeline_require_db_assertion knowledge-input "
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM public.migration_runs
  WHERE job_name='stock-insight-rss-news-ingest'
    AND status='completed'
    AND finished_at >= now() - interval '2 hours'
) THEN 1 ELSE 0 END
" || exit $?
cd "$ROOT"

DATABASE_URL="$DB_URL" node --env-file="$ENV_FILE" \
  apps/api/src/ingest/run-knowledge-extraction.ts --limit 100 --apply
pipeline_record_stage_success stock-insight-knowledge-extraction-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/publish/run-event-brief.ts --apply

# B0: record the known backlog as an explicit gauge — never hidden by success.
PENDING_DISCLOSURE=$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt -c \
  "SELECT count(*) FROM knowledge.document WHERE processing_status='pending' AND source_type='disclosure'") || exit 70
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q \
  -v backlog_started_at="$RUN_STARTED_AT" -v pending_disclosure="$PENDING_DISCLOSURE" <<'SQL' || exit 70
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES (
  'knowledge-backlog-' || gen_random_uuid()::text,
  'stock-insight-knowledge-backlog',
  'pipeline-wrapper',
  'completed',
  :'backlog_started_at'::timestamptz,
  clock_timestamp(),
  :'pending_disclosure'::int, 0, 0, NULL,
  jsonb_build_object('pending_disclosure', :'pending_disclosure'::int, 'policy', 'b0-v1')
);
SQL

pipeline_require_db_assertion knowledge "
SELECT CASE WHEN
  (SELECT count(DISTINCT job_name)
   FROM public.migration_runs
   WHERE job_name IN (
     'stock-insight-knowledge-extraction-stage',
     'stock-insight-event-brief'
   )
     AND status='completed'
     AND finished_at >= '${RUN_STARTED_AT}'::timestamptz) = 2
  AND (SELECT count(*) FROM knowledge.document) >= 2500
  AND NOT EXISTS (
    SELECT 1
    FROM knowledge.claim claim
    LEFT JOIN knowledge.claim_evidence evidence ON evidence.claim_id=claim.claim_id
    WHERE evidence.document_id IS NULL OR coalesce(evidence.quote,'')=''
  )
  AND NOT EXISTS (
    SELECT 1 FROM content.report report
    WHERE report.status='published'
      AND NOT EXISTS (SELECT 1 FROM content.report_evidence evidence WHERE evidence.report_id=report.report_id)
  )
  AND NOT EXISTS (
    -- B0 fail-closed: pending documents outside the explicit allowlist mean the
    -- skip policy or a new source type is broken. 'news' pending is in-flight
    -- work; 'disclosure' pending is the surfaced B4 backlog gauge above.
    SELECT 1 FROM knowledge.document
    WHERE processing_status='pending'
      AND source_type NOT IN ('news','disclosure')
  )
  AND NOT EXISTS (
    -- B0 fail-closed: fresh news must drain within the ingest SLA.
    SELECT 1 FROM knowledge.document
    WHERE processing_status='pending'
      AND source_type='news'
      AND observed_at < now() - interval '6 hours'
  )
THEN 1 ELSE 0 END
" || exit $?

pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" completed || exit $?
trap - EXIT
