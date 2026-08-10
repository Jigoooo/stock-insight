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
# Stages record a row only on success, so a mid-pipeline failure used to leave
# just `wrapper_failed`. The ERR trap captures the command that actually failed
# and hands it to the audit row, so migration_runs names the culprit.
PIPELINE_FAILED_COMMAND=""
trap 'PIPELINE_FAILED_COMMAND=$BASH_COMMAND' ERR
trap 'rc=$?; trap - EXIT; if ((rc != 0)); then pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" failed "$PIPELINE_FAILED_COMMAND" >/dev/null 2>&1 || true; fi; exit "$rc"' EXIT
pipeline_wait_for_network market-enrichment https://opendart.fss.or.kr 6 10 || exit $?
cd "$ROOT"

# Quota-safe resumable KR filing facts, cursor in ingestion.source_watermark; an
# unfinished issuer is retried after quota reset.
#
# 5 issuers/day meant 36 days for one pass over the 182-issuer universe, and the
# coverage ledger put a number on it: 1,862 of 3,640 cells sit at not_collected
# purely because the cursor has not arrived.
#
# 15 is chosen from the only quota evidence that exists, which is this job's own
# quotaExhausted flag:
#   100 requests/day  — ran six consecutive days, never tripped
#   361 requests/day  — tripped (2026-08-03)
# So the ceiling is above 100 and at or below 361; its exact value is not
# published anywhere we can read and has not been measured. 15 issuers is 300
# requests, under the observed trip point with headroom for the occasional
# opendart-backfill run. That is a 3x speedup — a full pass in 12 days.
#
# Overshooting is not fatal: on status 020 the collector stops, reports 'partial'
# and leaves the cursor on the unfinished issuer, so the next night resumes. The
# limit is set below the wall anyway because a run that ends early every night
# makes the pass rate unpredictable.
DATABASE_URL="$DB_URL" node --env-file="$ENV_FILE" \
  apps/api/src/ingest/run-dart-financial-facts.ts --from-year 2022 --limit 15 --apply

# Must follow the DART step: the ledger judges the cells that were just fetched.
# It appends a revision only where the computed state changed, so a steady day
# writes nothing and the ledger stays a change log rather than a daily dump.
DATABASE_URL="$DB_URL" node \
  apps/api/src/ingest/run-dart-coverage-ledger.ts --apply

# Must also follow the DART step, and for the same reason: it reads the raw
# objects that step just stored. Unlike the folded market.financial_fact above,
# this writes the unfolded statement into world.numeric_fact with the cell
# address, the dimensions and the restatement chain that canonical/11 §2 asks for.
#
# Idempotent by cell address: a filing's fact_key contains its receipt number and
# never changes, so a re-run recognises what it already wrote and only the newly
# collected filings turn into facts. The first run is the large one — 168,417
# facts from 1,362 filings measured 2026-08-08 — and every run after it is small.
DATABASE_URL="$DB_URL" node \
  apps/api/src/backfill/run-dart-numeric-fact.ts --apply

# US filing facts are idempotent and accession-keyed.
DATABASE_URL="$DB_URL" node \
  apps/api/src/ingest/run-sec-financial-facts.ts --since-year 2020 --limit 200 --apply

# Canonicalize every already-collected SEC companyfacts revision without fetching again.
# The writer defaults to dry-run elsewhere; the recurring pipeline commits explicitly.
DATABASE_URL="$DB_URL" node \
  apps/api/src/backfill/run-sec-numeric-fact.ts --since-year 2020 --limit 200 --apply

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

# The claim-continuity bridge of canonical/03 §6, from the actions the step above
# collects. Runs every day rather than only on Sunday: the collector refreshes
# weekly but the bridge is keyed by (security, effective date, kind) and writes
# only what is missing, so a daily pass costs one query and closes the gap left by
# a Sunday run that failed.
DATABASE_URL="$DB_URL" node apps/api/src/backfill/run-security-corporate-action.ts --apply

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

# B — promote research-common's calendar snapshots. Read-only against another
# project's disk, so it is cheap and cannot fail on a rate limit; placed here
# because the enrichment run is the daily one and a calendar is a daily thing.
#
# These dates have been collected daily for months and discarded: event_calendar.py
# and macro_calendar.py both write JSON, and the path that reaches Postgres keeps
# the derived signal card and drops the date. This is the last hop, not new
# collection.
DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-calendar-promote.ts --apply
pipeline_record_stage_success stock-insight-calendar-promote-stage "$RUN_STARTED_AT" || exit $?

# Legislative actions. The one gap no project filled — migration 074 recorded it as
# absent, and CONGRESS_GOV_API_KEY arrived 2026-08-07. Two pages of 250 is two
# requests against a 5,000/hour allowance, sorted newest-action-first so a bounded
# run gets the actions that just happened rather than an arbitrary slice.
DATABASE_URL="$DB_URL" node --env-file="$ENV_FILE" \
  apps/api/src/ingest/run-congress-bills.ts --pages 2 --apply
pipeline_record_stage_success stock-insight-congress-bills-stage "$RUN_STARTED_AT" || exit $?

# The KSIC code→name table. Idempotent and cheap: it fills only empty labels, so a
# rerun after the first is a no-op unless a new KSIC code arrived. Without it every
# Korean taxonomy node reads as a bare number — DART reports the code and never its
# name — and a sector playbook cannot be written against '66121'.
DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-ksic-classification-table.ts --apply
pipeline_record_stage_success stock-insight-ksic-classification-table-stage "$RUN_STARTED_AT" || exit $?

# SEC submissions, for the SIC that companyfacts does not carry. Self-limiting: the
# target list is filers whose classification is still UNCLASSIFIED, so a run costs one
# request per genuinely unclassified US filer and shrinks to zero as the gap closes.
# 250ms apart, matching sec-edgar-fetcher's answer to SEC's rate guidance.
DATABASE_URL="$DB_URL" node apps/api/src/ingest/run-sec-submissions.ts --apply
pipeline_record_stage_success stock-insight-sec-submissions-stage "$RUN_STARTED_AT" || exit $?

# B3 — supply/customer disclosure out of 사업보고서. LAST on purpose, and Sunday
# only.
#
# Last, because the DART budget above is already spent: the financial-facts step
# takes 15 issuers at 20 requests each = 300, against a ceiling this file measures
# as "above 100, at or below 361". A new consumer placed earlier would eat the
# headroom that step deliberately left, and a failure here must not be able to
# stop the four proven jobs that follow. Nothing follows it now, so a genuine
# failure aborts only the wrapper's completion record — which is the signal, and
# is not swallowed.
#
# Sunday only, because 사업보고서 is filed ANNUALLY. There is nothing to re-read
# daily. 10 issuers per week is 20 requests on top of 300, so the ceiling keeps its
# margin, and the 182-issuer universe completes a pass in about 19 weeks — well
# inside the yearly refresh the filings themselves need.
#
# Quota exhaustion is not a failure: on status 020 the collector stops, keeps the
# cursor on the unfinished issuer and exits 0, so the next Sunday resumes.
if [[ "$(date +%u)" == "7" ]]; then
  DATABASE_URL="$DB_URL" node --env-file="$ENV_FILE" \
    apps/api/src/ingest/run-dart-supply-disclosure.ts --limit 10 --apply
  pipeline_record_stage_success stock-insight-dart-supply-disclosure-stage "$RUN_STARTED_AT" || exit $?
fi

pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" completed || exit $?
trap - EXIT
