#!/usr/bin/env bash
set -uo pipefail
umask 077

ROOT=${STOCK_INSIGHT_ROOT:-/home/jigoo/.hermes/workspace/stock-insight}
DB_URL=${STOCK_INSIGHT_DATABASE_URL:-postgresql://research_app@127.0.0.1:55432/research_app}
source "$ROOT/apps/api/scripts/pipeline_common.sh"

pipeline_acquire_lock fundamentals || exit $?
pipeline_wait_for_network fundamentals \
  'https://opendart.fss.or.kr/api/company.json?corp_code=00126380' 6 5 || exit $?
cd "$ROOT"

RUNTIME_ROOT="$(pipeline_runtime_root)" || exit $?
RUN_DIR="$RUNTIME_ROOT/stock-insight"
DART_RESULT="$RUN_DIR/opendart-result.json"
SEC_RESULT="$RUN_DIR/sec-result.json"
RC=0

DART_FRESH="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -At -c "
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM public.migration_runs
  WHERE source_system = 'opendart'
    AND status = 'completed'
    AND rows_written >= 300
    AND rows_skipped = 0
    AND finished_at >= now() - interval '6 days'
) THEN 1 ELSE 0 END
")" || exit 70

if [[ "$DART_FRESH" != "1" ]]; then
  DATABASE_URL="$DB_URL" node --env-file=/home/jigoo/.hermes/.env \
    apps/api/src/backfill/run-opendart.ts --apply >"$DART_RESULT" || RC=$?
fi

DATABASE_URL="$DB_URL" node apps/api/src/backfill/run-sec-edgar.ts --apply >"$SEC_RESULT" || RC=$?

pipeline_require_db_assertion fundamentals "
SELECT CASE WHEN
  (SELECT count(*) FROM public.company_profiles WHERE market = 'KR') >= 151
  AND (SELECT count(*) FROM public.company_financials WHERE metric_group = 'dart_annual_facts') >= 151
  AND (SELECT count(*) FROM public.company_profiles WHERE market = 'US') >= 90
  AND (SELECT count(*) FROM public.company_financials WHERE metric_group = 'sec_companyfacts_momentum') >= 30
  AND EXISTS (
    SELECT 1 FROM public.migration_runs
    WHERE source_system = 'opendart' AND status = 'completed'
      AND rows_written >= 300 AND rows_skipped = 0
      AND finished_at >= now() - interval '6 days'
  )
THEN 1 ELSE 0 END
" || RC=$?

SEC_RUN_ID=
SEC_CACHE_RUN_ID=
SEC_LIVE_STATUS=
if [[ "$RC" == 0 && ! -s "$SEC_RESULT" ]]; then
  echo "fundamentals runner produced an empty SEC result" >&2
  RC=70
fi
if [[ "$RC" == 0 ]]; then
  SEC_META="$(node -e "
const x=require(process.argv[1]);
const runPattern=/^sec-edgar-[0-9]{8}-[0-9]{9}Z$/;
if (x.mode !== 'apply' || !runPattern.test(x.runId)) process.exit(70);
if (!['available','blocked_403_cache_fallback','transient_cache_fallback'].includes(x.liveStatus)) process.exit(70);
const fallback=x.liveStatus.endsWith('_cache_fallback');
if (fallback && (x.cacheRunId !== x.runId + '-cache' || !x.cacheFallback || x.cacheFallback.rowsWritten < 30)) process.exit(70);
if (!fallback && x.cacheRunId !== null) process.exit(70);
if (!fallback && (!x.audit || !x.audit.summary || !Number.isInteger(x.audit.summary.metricGroups) || x.audit.summary.metricGroups < 30)) process.exit(70);
process.stdout.write([x.runId, x.cacheRunId ?? '', x.liveStatus].join('\\n'));
" "$SEC_RESULT")" || RC=70
  if [[ "$RC" == 0 ]]; then
    mapfile -t SEC_META_LINES <<<"$SEC_META"
    SEC_RUN_ID=${SEC_META_LINES[0]:-}
    SEC_CACHE_RUN_ID=${SEC_META_LINES[1]:-}
    SEC_LIVE_STATUS=${SEC_META_LINES[2]:-}
    RECEIPT_SQL="
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM public.migration_runs
  WHERE run_id = '$SEC_RUN_ID'
    AND source_system = 'sec-edgar'
    AND status = 'completed'
)"
    if [[ "$SEC_LIVE_STATUS" == *_cache_fallback ]]; then
      RECEIPT_SQL+=" AND EXISTS (
  SELECT 1 FROM public.migration_runs
  WHERE run_id = '$SEC_CACHE_RUN_ID'
    AND source_system = 'sec-edgar-cache'
    AND status = 'completed'
    AND rows_written >= 30
    AND (summary ->> 'snapshotGeneratedAt')::timestamptz >= now() - interval '48 hours'
)"
    else
      RECEIPT_SQL+=" AND EXISTS (
  SELECT 1 FROM public.migration_runs
  WHERE run_id = '$SEC_RUN_ID'
    AND source_system = 'sec-edgar'
    AND status = 'completed'
    AND (summary ->> 'metricGroups')::integer >= 30
)"
    fi
    RECEIPT_SQL+=" THEN 1 ELSE 0 END"
    RECEIPT_RESULT="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -At -c "$RECEIPT_SQL")" || RC=70
    if [[ "$RECEIPT_RESULT" != 1 ]]; then
      echo "fundamentals current SEC run receipt assertion failed" >&2
      RC=70
    fi
  fi
fi

if [[ "$RC" == 0 && "$SEC_LIVE_STATUS" == *_cache_fallback ]]; then
  echo "SEC live endpoint degraded; fresh cache fallback was applied; quality gate passed" >&2
fi

exit "$RC"
