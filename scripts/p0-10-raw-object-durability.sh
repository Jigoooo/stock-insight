#!/usr/bin/env bash
# P0-10 — raw object durability: hash scrub + second physical copy + manifest.
# Usage: p0-10-raw-object-durability.sh [--scrub-only]
# - Verifies every ingestion.raw_object file exists and its SHA-256 matches the
#   content-addressed filename (hash scrub).
# - Maintains a second physical copy under $REPLICA_ROOT (rsync, append-only).
# - Emits a JSON summary; non-zero exit on any scrub failure (fail-closed).
set -euo pipefail
umask 077

PRIMARY_ROOT="${PRIMARY_ROOT:-/home/jigoo/hermes-work/raw-objects}"
REPLICA_ROOT="${REPLICA_ROOT:-/home/jigoo/.hermes/state/stock-insight-raw-replica}"
PSQL_BIN="${PSQL_BIN:-psql}"
RSYNC_BIN="${RSYNC_BIN:-rsync}"

mkdir -p "$REPLICA_ROOT"
primary_root=$(realpath -m -- "$PRIMARY_ROOT")
replica_root=$(realpath -m -- "$REPLICA_ROOT")
manifest=$(mktemp)
trap 'rm -f "$manifest"' EXIT

if ! "$PSQL_BIN" -X -A -t -h 127.0.0.1 -p 55432 -U research_app -d research_app \
  -v ON_ERROR_STOP=1 \
  -c "SELECT object_uri FROM ingestion.raw_object WHERE object_uri LIKE 'file://%'" \
  >"$manifest"; then
  echo "raw object manifest query failed" >&2
  exit 70
fi

total=0; ok=0; missing=0; corrupt=0; outside=0
while IFS= read -r uri; do
  [[ -z "$uri" ]] && continue
  path=$(realpath -m -- "${uri#file://}")
  total=$((total+1))
  if [[ "$path" != "$primary_root"/* ]]; then
    echo "OUTSIDE PRIMARY ROOT: $path" >&2
    outside=$((outside+1))
    continue
  fi
  if [[ ! -f "$path" ]]; then
    echo "MISSING: $path" >&2
    missing=$((missing+1))
    continue
  fi
  expected=$(basename "$path")
  expected="${expected%%.*}"
  if [[ ! "$expected" =~ ^[0-9a-f]{64}$ ]]; then
    echo "CORRUPT: invalid content-addressed filename $path" >&2
    corrupt=$((corrupt+1))
    continue
  fi
  actual=$(sha256sum "$path" | cut -d' ' -f1)
  if [[ "$actual" != "$expected" ]]; then
    echo "CORRUPT: $path (expected $expected got $actual)" >&2
    corrupt=$((corrupt+1))
    continue
  fi
  ok=$((ok+1))
done <"$manifest"

if ((total == 0)); then
  echo "raw object manifest is empty" >&2
fi
if [[ "${1:-}" != "--scrub-only" ]] &&
  ((total > 0 && missing == 0 && corrupt == 0 && outside == 0)); then
  "$RSYNC_BIN" -a --checksum "$primary_root/" "$replica_root/"
fi

replica_ok=0; replica_missing=0; replica_corrupt=0
while IFS= read -r uri; do
  [[ -z "$uri" ]] && continue
  path=$(realpath -m -- "${uri#file://}")
  [[ "$path" == "$primary_root"/* ]] || continue
  expected=$(basename "$path")
  expected="${expected%%.*}"
  [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || continue
  relative=${path#"$primary_root"/}
  replica_path="$replica_root/$relative"
  if [[ ! -f "$replica_path" ]]; then
    echo "REPLICA MISSING: $replica_path" >&2
    replica_missing=$((replica_missing+1))
    continue
  fi
  replica_actual=$(sha256sum "$replica_path" | cut -d' ' -f1)
  if [[ "$replica_actual" != "$expected" ]]; then
    echo "REPLICA CORRUPT: $replica_path (expected $expected got $replica_actual)" >&2
    replica_corrupt=$((replica_corrupt+1))
    continue
  fi
  replica_ok=$((replica_ok+1))
done <"$manifest"

replica_files=$(find "$replica_root" -type f | wc -l)
printf '{"scrub":{"total":%d,"ok":%d,"missing":%d,"corrupt":%d,"outside":%d},"replica":{"ok":%d,"missing":%d,"corrupt":%d},"replica_files":%d,"replica_root":"%s"}\n' \
  "$total" "$ok" "$missing" "$corrupt" "$outside" \
  "$replica_ok" "$replica_missing" "$replica_corrupt" "$replica_files" "$replica_root"

((total > 0 && missing == 0 && corrupt == 0 && outside == 0 &&
  replica_ok == total && replica_missing == 0 && replica_corrupt == 0))
