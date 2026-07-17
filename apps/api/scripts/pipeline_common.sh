#!/usr/bin/env bash

pipeline_runtime_root() {
  local root="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
  if [[ ! -d "$root" || -L "$root" || "$(stat -c '%u' "$root")" != "$(id -u)" ]]; then
    echo "unsafe user runtime directory: $root" >&2
    return 73
  fi
  printf '%s\n' "$root"
}

pipeline_acquire_lock() {
  local name="$1"
  local root lock_dir lock
  root="$(pipeline_runtime_root)" || return $?
  lock_dir="$root/stock-insight"
  install -d -m 700 "$lock_dir" || return 73
  lock="$lock_dir/$name.lock"
  exec 9>>"$lock"
  chmod 600 "$lock" || return 73
  if ! flock -n 9; then
    echo "stock-insight $name skipped: another worker holds $lock" >&2
    return 75
  fi
}

pipeline_wait_for_network() {
  local label="$1"
  local url="$2"
  local attempts="${3:-6}"
  local delay_seconds="${4:-10}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --silent --show-error --connect-timeout 3 --max-time 5 --output /dev/null "$url"; then
      return 0
    fi
    if ((attempt < attempts)); then sleep "$delay_seconds"; fi
  done
  echo "$label network probe failed after $attempts attempts: $url" >&2
  return 75
}

pipeline_require_db_assertion() {
  local label="$1"
  local sql="$2"
  local result
  if ! result="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -At -c "$sql")"; then
    echo "$label DB readback query failed" >&2
    return 70
  fi
  if [[ "$result" != "1" ]]; then
    echo "$label DB readback assertion failed: result=$result" >&2
    return 70
  fi
}
