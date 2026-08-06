#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=/home/jigoo/.hermes/workspace/stock-insight
DB_URL=postgresql://research_app@127.0.0.1:55432/research_app
source "$ROOT/apps/api/scripts/pipeline_common.sh"

pipeline_acquire_lock ohlcv || exit $?
RUN_STARTED_AT=$(pipeline_db_now) || exit $?
pipeline_start_wrapper_attempt stock-insight-ohlcv-wrapper "$RUN_STARTED_AT" || exit $?
WRAPPER_ATTEMPT_ID="$PIPELINE_WRAPPER_ATTEMPT_ID"
# Stages record a row only on success, so a mid-pipeline failure used to leave
# just `wrapper_failed`. The ERR trap captures the command that actually failed
# and hands it to the audit row, so migration_runs names the culprit.
PIPELINE_FAILED_COMMAND=""
trap 'PIPELINE_FAILED_COMMAND=$BASH_COMMAND' ERR
trap 'rc=$?; trap - EXIT; if ((rc != 0)); then pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" failed "$PIPELINE_FAILED_COMMAND" >/dev/null 2>&1 || true; fi; exit "$rc"' EXIT
pipeline_wait_for_network ohlcv https://query1.finance.yahoo.com 6 10 || exit $?
cd "$ROOT"

DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-ohlcv.ts --apply --period 7d

pipeline_require_db_assertion ohlcv "
SELECT CASE WHEN
  EXISTS (
    SELECT 1 FROM public.migration_runs
    WHERE source_system = 'yfinance'
      AND status = 'completed'
      AND finished_at >= '${RUN_STARTED_AT}'::timestamptz
      AND rows_written >= 500
      AND rows_skipped <= 5
  )
  AND (SELECT count(*) FROM market_ts.ohlcv WHERE domain = 'stock') >= 60000
  AND NOT EXISTS (
    SELECT 1 FROM market_ts.ohlcv
    WHERE domain = 'stock'
      AND (high < greatest(open, low, close)
        OR low > least(open, high, close)
        OR least(open, high, low, close) <= 0
        OR volume_base < 0)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM market_ts.ohlcv bar
    JOIN public.entities entity
      ON upper(entity.market) = 'KR'
     AND upper(entity.symbol) = upper(bar.symbol)
    JOIN public.company_profiles profile ON profile.entity_key = entity.entity_key
    WHERE bar.domain = 'stock'
      AND profile.profile_json ->> 'corporationClass' IN ('Y', 'K')
      AND bar.exchange IS DISTINCT FROM CASE
        WHEN profile.profile_json ->> 'corporationClass' = 'Y' THEN 'KOSPI'
        WHEN profile.profile_json ->> 'corporationClass' = 'K' THEN 'KOSDAQ'
      END
  )
  -- market_ts.ohlcv is SHARED, not ours and not theirs: research-common writes
  -- source_id='ict-bot' (bitget crypto, 2.36M rows) and run-ohlcv.ts writes
  -- source_id='yfinance' (KOSPI/KOSDAQ/US equities, 300k rows). The two have never
  -- overlapped — measured 2026-08-07, intersection of (exchange,symbol,timeframe)
  -- is exactly 0.
  --
  -- That separation is load-bearing and nothing enforced it. Our UPSERT conflict
  -- target is (exchange,symbol,timeframe,ts) with NO source_id, so a single bar
  -- emitted into their key space would overwrite their row AND relabel its
  -- source_id as ours — a silent cross-project write that
  -- verify-table-ownership.sh cannot see, because it greps for table names and
  -- this table is legitimately written by both.
  AND NOT EXISTS (
    SELECT exchange, symbol, timeframe FROM market_ts.ohlcv WHERE source_id = 'yfinance'
    INTERSECT
    SELECT exchange, symbol, timeframe FROM market_ts.ohlcv WHERE source_id IS DISTINCT FROM 'yfinance'
  )
THEN 1 ELSE 0 END
" || exit $?

pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" completed || exit $?
trap - EXIT
