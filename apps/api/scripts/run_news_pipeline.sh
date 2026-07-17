#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=/home/jigoo/.hermes/workspace/stock-insight
DB_URL=postgresql://research_app@127.0.0.1:55432/research_app
source "$ROOT/apps/api/scripts/pipeline_common.sh"

pipeline_acquire_lock news || exit $?
pipeline_wait_for_network news https://finance.yahoo.com 6 10 || exit $?
cd "$ROOT"

DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-news-rss.ts --apply --force-refresh
DATABASE_URL="$DB_URL" node --env-file=/home/jigoo/.hermes/.env apps/api/src/ingest/run-news-translation.ts --apply --limit 500

pipeline_require_db_assertion news "
SELECT CASE WHEN count(*) >= 20
  AND count(*) = count(title_ko)
  AND count(*) = count(url)
  AND count(*) FILTER (
    WHERE valid_at IS NULL OR known_at IS NULL
       OR policy_decision IS NULL OR revision_fingerprint IS NULL
  ) = 0
THEN 1 ELSE 0 END
FROM public.source_documents
WHERE source_system = 'rss_news'
" || exit $?
