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

pipeline_db_now() {
  local result
  if ! result="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt -c 'SELECT clock_timestamp()')"; then
    echo "database clock read failed" >&2
    return 70
  fi
  if [[ -z "$result" ]]; then
    echo "database clock returned no timestamp" >&2
    return 70
  fi
  printf '%s\n' "$result"
}

pipeline_record_stage_success() {
  local job_name="$1"
  local started_at="$2"
  if ! psql "$DB_URL" -X -v ON_ERROR_STOP=1 \
    -v stage_job="$job_name" -v stage_started_at="$started_at" <<'SQL' >/dev/null
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES (
  'pipeline-stage-' || gen_random_uuid()::text,
  :'stage_job',
  'pipeline-wrapper',
  'completed',
  :'stage_started_at'::timestamptz,
  clock_timestamp(),
  0, 0, 0, NULL,
  jsonb_build_object('wrapper_stage', true)
);
SQL
  then
    echo "$job_name stage-success audit write failed" >&2
    return 70
  fi
}

pipeline_start_wrapper_attempt() {
  local job_name="$1"
  local started_at="$2"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt \
    -v wrapper_job="$job_name" -v wrapper_started_at="$started_at" <<'SQL'
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES (
  'wrapper-attempt-' || gen_random_uuid()::text,
  :'wrapper_job',
  'pipeline-wrapper',
  'running',
  :'wrapper_started_at'::timestamptz,
  NULL,
  0, 0, 0, NULL,
  jsonb_build_object('wrapper_attempt', true)
)
RETURNING run_id;
SQL
}

pipeline_finish_wrapper_attempt() {
  local run_id="$1"
  local status="$2"
  local result
  if [[ "$status" != "completed" && "$status" != "failed" ]]; then
    echo "invalid wrapper attempt status: $status" >&2
    return 64
  fi
  if ! result="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt \
    -v wrapper_run_id="$run_id" -v wrapper_status="$status" <<'SQL'
UPDATE public.migration_runs
SET status = :'wrapper_status',
    finished_at = clock_timestamp(),
    error = CASE WHEN :'wrapper_status' = 'failed' THEN 'wrapper_failed' ELSE NULL END
WHERE run_id = :'wrapper_run_id'
  AND status = 'running'
RETURNING 1;
SQL
)"; then
    echo "$run_id wrapper attempt update failed" >&2
    return 70
  fi
  if [[ "$result" != "1" ]]; then
    echo "$run_id wrapper attempt update affected an unexpected row count" >&2
    return 70
  fi
}
