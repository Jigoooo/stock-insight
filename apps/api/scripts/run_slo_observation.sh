#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT=/home/jigoo/.hermes/workspace/stock-insight
DB_URL=postgresql://research_app@127.0.0.1:55432/research_app
source "$ROOT/apps/api/scripts/pipeline_common.sh"

# Its own timer, not a stage inside analytics. During the 2026-08-08 outage the
# analytics wrapper never got past its input gate, so an observer living there would
# have been silent for exactly the two days it existed to describe.
pipeline_acquire_lock slo-observation
RUN_STARTED_AT=$(pipeline_db_now) || exit $?
pipeline_start_wrapper_attempt stock-insight-slo-observation-wrapper "$RUN_STARTED_AT" || exit $?
WRAPPER_ATTEMPT_ID="$PIPELINE_WRAPPER_ATTEMPT_ID"
PIPELINE_FAILED_COMMAND=""
trap 'PIPELINE_FAILED_COMMAND=$BASH_COMMAND' ERR
trap 'rc=$?; trap - EXIT; if ((rc != 0)); then pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" failed "$PIPELINE_FAILED_COMMAND" >/dev/null 2>&1 || true; fi; exit "$rc"' EXIT

cd "$ROOT"

# Measure, then decide. Migration 082 keeps the two apart and so does this: the
# observer is a gauge that never fails the run, the downgrade rule reads the ledger
# it wrote rather than re-measuring.
DATABASE_URL="$DB_URL" node apps/api/src/ops/run-slo-observation.ts --apply
pipeline_record_stage_success stock-insight-slo-observation-stage "$RUN_STARTED_AT" || exit $?
DATABASE_URL="$DB_URL" node apps/api/src/ops/run-safety-state-downgrade.ts --apply
pipeline_record_stage_success stock-insight-safety-state-downgrade-stage "$RUN_STARTED_AT" || exit $?

pipeline_finish_wrapper_attempt "$WRAPPER_ATTEMPT_ID" completed
