#!/usr/bin/env bash
# Checks that every Stock Insight systemd user unit under version control matches
# what is actually installed, and that every installed one is under version
# control.
#
# On 2026-08-03 three units — stock-insight-news, -ohlcv, -fundamentals — were
# running daily from ~/.config/systemd/user with no copy in this repo at all.
# They execute scripts from this tree, so their schedules and timeouts were
# production configuration that no review, diff or history covered. Copying them
# in fixes that once; this script is what keeps it fixed.
#
# Usage:
#   bash ops/scripts/verify-systemd-units.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
REPO_DIR="$ROOT/ops/systemd/user"
INSTALLED_DIR="${SYSTEMD_USER_DIR:-$HOME/.config/systemd/user}"

drift=0

for repo_unit in "$REPO_DIR"/stock-insight-*; do
  name=$(basename "$repo_unit")
  installed="$INSTALLED_DIR/$name"
  if [[ ! -f "$installed" ]]; then
    echo "MISSING_INSTALL $name (in repo, not installed)"
    drift=$((drift + 1))
    continue
  fi
  if ! diff -q "$repo_unit" "$installed" >/dev/null; then
    echo "DIVERGED $name"
    diff -u "$repo_unit" "$installed" | sed 's/^/    /'
    drift=$((drift + 1))
  fi
done

# The reverse direction is the one that actually bit: a unit can be installed and
# scheduled while the repo knows nothing about it.
for installed in "$INSTALLED_DIR"/stock-insight-*; do
  [[ -e "$installed" ]] || continue
  name=$(basename "$installed")
  if [[ ! -f "$REPO_DIR/$name" ]]; then
    echo "UNVERSIONED $name (installed, not in repo)"
    drift=$((drift + 1))
  fi
done

# Every pipeline service must be able to say that it failed. A unit without
# OnFailure= fails silently: nothing writes to the journal and, if the process was
# killed outright, nothing writes an audit row either.
for service in "$REPO_DIR"/stock-insight-*.service; do
  name=$(basename "$service")
  [[ "$name" == *alert@* ]] && continue
  if ! grep -q '^OnFailure=' "$service"; then
    echo "NO_ONFAILURE $name"
    drift=$((drift + 1))
  fi
done

if ((drift == 0)); then
  echo "systemd_units=PASS"
else
  echo "systemd_units=FAIL drift=$drift" >&2
  exit 1
fi
