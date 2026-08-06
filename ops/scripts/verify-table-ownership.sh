#!/usr/bin/env bash
# Fails when this repository writes to a table another project owns.
#
# research_app is shared by four projects (see docs/operations/database-ownership.md).
# On 2026-08-03 a migration here registered two collectors in
# ops.source_collection_policy without anyone knowing that table belongs to
# research-app-db. It turned out harmless, but nothing would have caught it.
#
# Only writes are checked. Reading another project's table is a design decision
# worth making deliberately; writing to one is a collision.
#
# Usage:
#   bash ops/scripts/verify-table-ownership.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

# Owned by ~/hermes-work/research-app-db. Derived from that repo's migrations and
# runtime, not guessed — see the ownership doc for how each was established.
EXTERNAL_TABLES=(
  ops.publication_identity_registry
  ops.publication_record_revision
  ops.expected_output
  ops.entity_alias_ledger
  ops.entity_alias_resolution
  ops.job_run
  ops.analysis_run_contract
  ops.analysis_run_revision
  ops.forecast_outcome_ledger
  ops.forecast_first_mature_outcome
  ops.temporal_graph_edge_closure
  ops.model_registry
  ops.pipeline_edge
  ops.gbrain_ingest_proof
  ops.source_collection_policy_revision
  ops.stock_prediction_loop_runs
  # crypto-research owns these; research-common only labels them in strings.
  market_ts.funding
  market_ts.open_interest
)

# Documented, deliberate, and load-bearing in both directions. research-app-db
# counts source_documents whose provider_key has NO policy row, so adding rows can
# only shrink that count; removing ours would erase this repo's collection
# governance records. Anything else appearing here is a mistake, not an exception.
ALLOWED_EXTERNAL_WRITES=(
  ops.source_collection_policy
  # Shared, not theirs — and that is why it is declared here rather than in
  # EXTERNAL_TABLES. research-common writes source_id='ict-bot' (bitget crypto)
  # and run-ohlcv.ts writes source_id='yfinance' (KOSPI/KOSDAQ/US equities);
  # measured 2026-08-07 the two key spaces intersect in exactly 0 rows.
  #
  # Name-based grepping cannot tell a legitimate write here from a collision, so
  # the real guard is the disjointness assertion in run_ohlcv_daily.sh. This entry
  # exists so the write is DECLARED: it was undeclared and undetected for months
  # while the ownership doc claimed this repo only read the table.
  market_ts.ohlcv
)

writes=$(grep -ohrE --include=*.ts --include=*.mjs --include=*.sh \
  '(INSERT INTO|UPDATE|DELETE FROM)[[:space:]]+[a-z_]+\.[a-z_]+' \
  "$ROOT/apps/api/src" "$ROOT/apps/api-server/src" "$ROOT/apps/api/scripts" \
  "$ROOT/ops/scripts" "$ROOT/packages/db-schema/src/migrations" 2>/dev/null \
  | awk '{print $NF}' | sort -u)

violations=0
for table in "${EXTERNAL_TABLES[@]}"; do
  if grep -qx "$table" <<<"$writes"; then
    echo "CROSS_PROJECT_WRITE $table — owned by another project" >&2
    violations=$((violations + 1))
  fi
done

# An allowance that no longer corresponds to a real write is stale: it would keep
# a future mistake on the same table invisible.
for table in "${ALLOWED_EXTERNAL_WRITES[@]}"; do
  if ! grep -qx "$table" <<<"$writes"; then
    echo "STALE_ALLOWANCE $table — allowed but nothing writes it; drop the entry" >&2
    violations=$((violations + 1))
  fi
done

if ((violations == 0)); then
  echo "table_ownership=PASS external_tables=${#EXTERNAL_TABLES[@]} allowed=${#ALLOWED_EXTERNAL_WRITES[@]}"
else
  echo "table_ownership=FAIL violations=$violations" >&2
  exit 1
fi
