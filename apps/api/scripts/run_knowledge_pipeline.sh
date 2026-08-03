#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=/home/jigoo/.hermes/workspace/stock-insight
DB_URL=postgresql://research_app@127.0.0.1:55432/research_app
ENV_FILE=/home/jigoo/.hermes/.env
source "$ROOT/apps/api/scripts/pipeline_common.sh"

pipeline_acquire_lock knowledge || exit $?
RUN_STARTED_AT=$(pipeline_db_now) || exit $?
pipeline_start_wrapper_attempt stock-insight-knowledge-wrapper "$RUN_STARTED_AT" || exit $?
WRAPPER_ATTEMPT_ID="$PIPELINE_WRAPPER_ATTEMPT_ID"
# Stages record a row only on success, so a mid-pipeline failure used to leave
# just `wrapper_failed`. The ERR trap captures the command that actually failed
# and hands it to the audit row, so migration_runs names the culprit.
PIPELINE_FAILED_COMMAND=""
trap 'PIPELINE_FAILED_COMMAND=$BASH_COMMAND' ERR
trap 'rc=$?; trap - EXIT; if ((rc != 0)); then pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" failed "$PIPELINE_FAILED_COMMAND" >/dev/null 2>&1 || true; fi; exit "$rc"' EXIT
pipeline_require_db_assertion knowledge-input "
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM public.migration_runs
  WHERE job_name='stock-insight-rss-news-ingest'
    AND status='completed'
    AND finished_at >= now() - interval '2 hours'
) THEN 1 ELSE 0 END
" || exit $?
cd "$ROOT"

KNOWLEDGE_SYNC_RUN_ID="knowledge-sync-wrapper-$(openssl rand -hex 16)" || exit 70
pending_news_for_run() {
  local sync_run_id="$1"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt \
    -v sync_run_id="$sync_run_id" \
    -f <(printf '%s\n' "SELECT count(*) FROM knowledge.document WHERE processing_status='pending' AND source_type='news' AND metadata->>'knowledge_sync_run_id'=:'sync_run_id'")
}
DATABASE_URL="$DB_URL" KNOWLEDGE_SYNC_RUN_ID="$KNOWLEDGE_SYNC_RUN_ID" \
  node apps/api/src/ingest/run-knowledge-document-sync.ts --apply
pipeline_record_stage_success stock-insight-knowledge-document-sync-stage "$RUN_STARTED_AT" || exit $?

DATABASE_URL="$DB_URL" KNOWLEDGE_SYNC_RUN_ID="$KNOWLEDGE_SYNC_RUN_ID" node --env-file="$ENV_FILE" \
  apps/api/src/ingest/run-knowledge-extraction.ts --limit 100 --apply

pending_news=$(pending_news_for_run "$KNOWLEDGE_SYNC_RUN_ID") || exit 70
drain_iterations=0
while (( pending_news > 0 )); do
  ((drain_iterations += 1))
  if (( drain_iterations > 100 )); then
    echo "knowledge extraction current-run drain exceeded 100 iterations" >&2
    exit 70
  fi
  DATABASE_URL="$DB_URL" KNOWLEDGE_SYNC_RUN_ID="$KNOWLEDGE_SYNC_RUN_ID" node --env-file="$ENV_FILE" \
    apps/api/src/ingest/run-knowledge-extraction.ts --limit 100 --apply
  after_pending=$(pending_news_for_run "$KNOWLEDGE_SYNC_RUN_ID") || exit 70
  if (( after_pending >= pending_news )); then
    echo "knowledge extraction current-run drain made no progress" >&2
    exit 70
  fi
  pending_news="$after_pending"
done
if (( pending_news == 0 )); then
  :
else
  echo "knowledge extraction current-run backlog remains" >&2
  exit 70
fi
pipeline_record_stage_success stock-insight-knowledge-extraction-stage "$RUN_STARTED_AT" || exit $?

# Migration 012 carried the legacy entity link with a LEFT JOIN onto
# core.entity_identifier, so signals whose identifier did not exist yet landed
# unattributed — 1,516 of them. The identifiers arrived later and nothing re-ran
# the join. This must precede the world projection: event participants are derived
# from target_entity_id, so resolving after projecting would leave them empty.
DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-event-entity-resolution.ts --apply
pipeline_record_stage_success stock-insight-event-entity-resolution-stage "$RUN_STARTED_AT" || exit $?

# The world plane is a projection of knowledge.event and had no producer: migration
# 032 filled it once and it then drifted 923 events behind before anyone noticed,
# because its serving view reports 100% yield over whatever it happens to hold.
# Projecting here, right after extraction, is what keeps the two in step.
DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-world-event-sync.ts --apply
pipeline_record_stage_success stock-insight-world-event-sync-stage "$RUN_STARTED_AT" || exit $?

# Claims sat at verified 0 / 271 not because verification was unsolved but because
# nothing ran it: ops.verification_policy already defines what 'corroborated'
# requires, transitionVerification() had only test callers, and every claim in the
# table met the rule. Runs after extraction so new claims are judged the same day.
# 'verified' needs a second independent document and is left to arrive on its own.
DATABASE_URL="$DB_URL" node apps/api/src/knowledge/run-claim-corroboration.ts --apply
pipeline_record_stage_success stock-insight-claim-corroboration-stage "$RUN_STARTED_AT" || exit $?

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
     'stock-insight-knowledge-document-sync-stage',
     'stock-insight-knowledge-extraction-stage',
     'stock-insight-event-entity-resolution-stage',
     'stock-insight-world-event-sync-stage',
     'stock-insight-claim-corroboration-stage',
     'stock-insight-event-brief'
   )
     AND status='completed'
     AND finished_at >= '${RUN_STARTED_AT}'::timestamptz) = 6
  AND (SELECT count(*) FROM knowledge.document) >= 2500
  -- The world plane must be a complete projection, not a partial one. A partial
  -- plane still reports 100% yield through its serving view, which is exactly how
  -- 923 missing events went unnoticed for ten days.
  AND (SELECT count(*) FROM world.event WHERE event_key LIKE 'legacy-event:%')
      = (SELECT count(*) FROM knowledge.event)
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
    -- A prior extractor still owns work, or crashed before its lease could be
    -- reclaimed. Never certify the wrapper while a news claim is non-terminal.
    SELECT 1 FROM knowledge.document
    WHERE processing_status='chunked'
      AND source_type='news'
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
