#!/usr/bin/env bash
# P0-10 — raw object durability: hash scrub + second physical copy + manifest.
# Usage: p0-10-raw-object-durability.sh [--scrub-only]
# - Verifies every ingestion.raw_object file exists and its SHA-256 matches the
#   content-addressed filename (hash scrub).
# - Maintains a second physical copy under $REPLICA_ROOT (rsync, append-only).
# - Emits a JSON summary; non-zero exit on any scrub failure (fail-closed).
set -euo pipefail
umask 077

PRIMARY_ROOT=/home/jigoo/hermes-work/raw-objects
REPLICA_ROOT=/home/jigoo/.hermes/state/stock-insight-raw-replica
DB="psql -X -A -t -h 127.0.0.1 -p 55432 -U research_app -d research_app"

mkdir -p "$REPLICA_ROOT"

total=0; ok=0; missing=0; corrupt=0
while IFS= read -r uri; do
  path="${uri#file://}"
  total=$((total+1))
  if [[ ! -f "$path" ]]; then
    echo "MISSING: $path" >&2
    missing=$((missing+1))
    continue
  fi
  expected=$(basename "$path")
  expected="${expected%%.*}"
  actual=$(sha256sum "$path" | cut -d' ' -f1)
  if [[ "$actual" != "$expected" ]]; then
    echo "CORRUPT: $path (expected $expected got $actual)" >&2
    corrupt=$((corrupt+1))
    continue
  fi
  ok=$((ok+1))
done < <($DB -c "SELECT object_uri FROM ingestion.raw_object WHERE object_uri LIKE 'file://%'")

if [[ "${1:-}" != "--scrub-only" ]]; then
  rsync -a --ignore-existing "$PRIMARY_ROOT/" "$REPLICA_ROOT/"
fi
replica_files=$(find "$REPLICA_ROOT" -type f | wc -l)

printf '{"scrub":{"total":%d,"ok":%d,"missing":%d,"corrupt":%d},"replica_files":%d,"replica_root":"%s"}\n' \
  "$total" "$ok" "$missing" "$corrupt" "$replica_files" "$REPLICA_ROOT"

[[ $missing -eq 0 && $corrupt -eq 0 ]]
