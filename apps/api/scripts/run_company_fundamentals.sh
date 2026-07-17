#!/usr/bin/env bash
set -uo pipefail
umask 077

ROOT=/home/jigoo/.hermes/workspace/stock-insight
DB_URL=postgresql://research_app@127.0.0.1:55432/research_app
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
  AND EXISTS (
    SELECT 1 FROM public.migration_runs
    WHERE source_system = 'sec-edgar-cache' AND status = 'completed'
      AND rows_written >= 30
      AND (summary ->> 'snapshotGeneratedAt')::timestamptz >= now() - interval '48 hours'
  )
THEN 1 ELSE 0 END
" || RC=$?

if [[ -s "$SEC_RESULT" ]] && node -e "
const x=require(process.argv[1]);
process.exit(x.liveStatus === 'blocked_403_cache_fallback' ? 0 : 1)
" "$SEC_RESULT"; then
  echo "SEC live endpoint degraded; fresh cache fallback was applied" >&2
  if [[ "$RC" -eq 0 ]]; then RC=75; fi
fi

exit "$RC"
