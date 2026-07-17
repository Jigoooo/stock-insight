#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=/home/jigoo/.hermes/workspace/stock-insight
DB_URL=postgresql://research_app@127.0.0.1:55432/research_app
source "$ROOT/apps/api/scripts/pipeline_common.sh"

pipeline_acquire_lock ohlcv || exit $?
pipeline_wait_for_network ohlcv https://query1.finance.yahoo.com 6 10 || exit $?
cd "$ROOT"

DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-ohlcv.ts --apply --period 7d

pipeline_require_db_assertion ohlcv "
SELECT CASE WHEN
  EXISTS (
    SELECT 1 FROM public.migration_runs
    WHERE source_system = 'yfinance'
      AND status = 'completed'
      AND finished_at >= now() - interval '30 minutes'
      AND rows_written >= 500
      AND rows_skipped <= 5
  )
  AND (SELECT count(*) FROM market_ts.ohlcv WHERE domain = 'stock') >= 60000
  AND NOT EXISTS (
    SELECT 1 FROM market_ts.ohlcv
    WHERE domain = 'stock'
      AND (high < greatest(open, low, close)
        OR low > least(open, high, close)
        OR volume_base < 0)
  )
THEN 1 ELSE 0 END
" || exit $?
