#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=/home/jigoo/.hermes/workspace/stock-insight
DB_URL=postgresql://research_app@127.0.0.1:55432/research_app
ENV_FILE=/home/jigoo/.hermes/.env
source "$ROOT/apps/api/scripts/pipeline_common.sh"

pipeline_acquire_lock market-enrichment || exit $?
RUN_STARTED_AT=$(pipeline_db_now) || exit $?
pipeline_start_wrapper_attempt stock-insight-market-enrichment-wrapper "$RUN_STARTED_AT" || exit $?
WRAPPER_ATTEMPT_ID="$PIPELINE_WRAPPER_ATTEMPT_ID"
trap 'rc=$?; trap - EXIT; if ((rc != 0)); then pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" failed >/dev/null 2>&1 || true; fi; exit "$rc"' EXIT
pipeline_wait_for_network market-enrichment https://opendart.fss.or.kr 6 10 || exit $?
cd "$ROOT"

# Quota-safe resumable KR filing facts: five issuers per day, cursor in
# ingestion.source_watermark; an unfinished issuer is retried after quota reset.
DATABASE_URL="$DB_URL" node --env-file="$ENV_FILE" \
  apps/api/src/ingest/run-dart-financial-facts.ts --from-year 2022 --limit 5 --apply

# US filing facts are idempotent and accession-keyed.
DATABASE_URL="$DB_URL" node \
  apps/api/src/ingest/run-sec-financial-facts.ts --since-year 2020 --limit 200 --apply

# Short-volume and macro vintage refresh windows are bounded for daily operation.
DATABASE_URL="$DB_URL" node \
  apps/api/src/ingest/run-finra-short-volume.ts --days 35 --apply
DATABASE_URL="$DB_URL" node --env-file="$ENV_FILE" \
  apps/api/src/ingest/run-fred-vintage.ts --from 2024-01-01 --apply

# Full corporate-action history is heavier; refresh weekly on Sunday only.
if [[ "$(date +%u)" == "7" ]]; then
  DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-corporate-actions.ts --apply
fi
DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-ohlcv-adjust.ts --apply

pipeline_require_db_assertion market-enrichment "
SELECT CASE WHEN
  (SELECT count(DISTINCT job_name)
   FROM public.migration_runs
   WHERE finished_at >= '${RUN_STARTED_AT}'::timestamptz
     AND (
       (job_name='stock-insight-dart-financial-facts' AND status IN ('completed','partial'))
       OR (job_name IN (
         'stock-insight-sec-financial-facts',
         'stock-insight-finra-short-volume',
         'stock-insight-fred-vintage',
         'stock-insight-split-factors'
       ) AND status='completed')
     )) = 5
  AND (SELECT count(*) FROM market.financial_fact WHERE source_provider='sec-companyfacts') >= 40000
  AND (SELECT count(*) FROM market.macro_vintage) >= 30000
  AND (SELECT count(*) FROM market.short_volume_daily) >= 2000
  AND EXISTS (
    SELECT 1 FROM ingestion.source_watermark watermark
    JOIN ingestion.source source USING (source_id)
    WHERE source.provider_key='opendart'
      AND watermark.dataset_name='dart_financial_facts_cursor'
  )
THEN 1 ELSE 0 END
" || exit $?

if [[ "$(date +%u)" == "7" ]]; then
  pipeline_require_db_assertion market-enrichment-actions "
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.migration_runs
    WHERE job_name='stock-insight-corporate-actions'
      AND status='completed'
      AND finished_at >= '${RUN_STARTED_AT}'::timestamptz
  ) THEN 1 ELSE 0 END
  " || exit $?
fi

pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" completed || exit $?
trap - EXIT
