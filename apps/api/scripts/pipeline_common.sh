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

pipeline_resolve_provenance() {
  local label="$1"
  local repo_root wrapper_script common_script git_root wrapper_relative common_relative
  if [[ -z "${ROOT:-}" ]]; then
    echo "$label provenance ROOT is required" >&2
    return 70
  fi
  if ! repo_root="$(realpath -e -- "$ROOT")" ||
     ! wrapper_script="$(realpath -e -- "$0")" ||
     ! common_script="$(realpath -e -- "${BASH_SOURCE[0]}")"; then
    echo "$label provenance script resolution failed" >&2
    return 70
  fi
  if ! git_root="$(git -C "$repo_root" rev-parse --show-toplevel 2>/dev/null)" ||
     ! git_root="$(realpath -e -- "$git_root")" || [[ "$git_root" != "$repo_root" ]]; then
    echo "$label provenance repository root mismatch" >&2
    return 70
  fi
  case "$wrapper_script" in
    "$repo_root"/*) wrapper_relative="${wrapper_script#"$repo_root"/}" ;;
    *) echo "$label provenance wrapper is outside ROOT" >&2; return 70 ;;
  esac
  case "$common_script" in
    "$repo_root"/*) common_relative="${common_script#"$repo_root"/}" ;;
    *) echo "$label provenance common script is outside ROOT" >&2; return 70 ;;
  esac
  if ! git -C "$repo_root" ls-files --error-unmatch \
    "$wrapper_relative" "$common_relative" >/dev/null 2>&1; then
    echo "$label provenance scripts are not tracked" >&2
    return 70
  fi
  if ! PIPELINE_PROVENANCE_CODE_COMMIT="$(git -C "$repo_root" rev-parse --verify HEAD 2>/dev/null)" ||
     [[ -z "$PIPELINE_PROVENANCE_CODE_COMMIT" ]]; then
    echo "$label provenance commit resolution failed" >&2
    return 70
  fi
  if ! PIPELINE_PROVENANCE_CONFIG_HASH="$({ sha256sum --binary "$common_script" "$wrapper_script"; } | sha256sum | cut -d' ' -f1)" ||
     [[ ! "$PIPELINE_PROVENANCE_CONFIG_HASH" =~ ^[0-9a-f]{64}$ ]]; then
    echo "$label provenance config hash failed" >&2
    return 70
  fi
  if ! PIPELINE_PROVENANCE_SOURCE_TREE_HASH="$(
    set -o pipefail
    git -C "$repo_root" ls-files -z |
      while IFS= read -r -d '' tracked_file; do
        sha256sum --binary "$repo_root/$tracked_file" || exit 1
      done |
      sha256sum | cut -d' ' -f1
  )" || [[ ! "$PIPELINE_PROVENANCE_SOURCE_TREE_HASH" =~ ^[0-9a-f]{64}$ ]]; then
    echo "$label provenance source tree hash failed" >&2
    return 70
  fi
  PIPELINE_PROVENANCE_REPO_ROOT="$repo_root"
  PIPELINE_PROVENANCE_WRAPPER_SCRIPT="$wrapper_script"
}

pipeline_record_stage_success() {
  local job_name="$1"
  local started_at="$2"
  # P0-9: stage attempts carry code identity (commit) + config hash so any
  # output row is traceable to the exact code/config that produced it.
  pipeline_resolve_provenance "$job_name" || return $?
  if ! psql "$DB_URL" -X -v ON_ERROR_STOP=1 \
    -v stage_job="$job_name" -v stage_started_at="$started_at" \
    -v stage_commit="$PIPELINE_PROVENANCE_CODE_COMMIT" \
    -v stage_config_hash="$PIPELINE_PROVENANCE_CONFIG_HASH" \
    -v stage_source_tree_hash="$PIPELINE_PROVENANCE_SOURCE_TREE_HASH" \
    -v stage_repo_root="$PIPELINE_PROVENANCE_REPO_ROOT" \
    -v stage_wrapper_script="$PIPELINE_PROVENANCE_WRAPPER_SCRIPT" <<'SQL' >/dev/null
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
  jsonb_build_object(
    'wrapper_stage', true,
    'code_commit', :'stage_commit',
    'config_hash', :'stage_config_hash',
    'source_tree_hash', :'stage_source_tree_hash',
    'repo_root', :'stage_repo_root',
    'wrapper_script', :'stage_wrapper_script'
  )
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
  local attempt_token attempt_token_hash run_id
  pipeline_resolve_provenance "$job_name" || return $?
  if ! attempt_token="$(openssl rand -hex 32)" || [[ ! "$attempt_token" =~ ^[0-9a-f]{64}$ ]]; then
    echo "$job_name wrapper attempt token generation failed" >&2
    return 70
  fi
  if ! attempt_token_hash="$(printf '%s' "$attempt_token" | sha256sum | cut -d' ' -f1)" ||
     [[ ! "$attempt_token_hash" =~ ^[0-9a-f]{64}$ ]]; then
    echo "$job_name wrapper attempt token hash failed" >&2
    return 70
  fi
  if ! run_id="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt \
    -v wrapper_job="$job_name" -v wrapper_started_at="$started_at" \
    -v wrapper_commit="$PIPELINE_PROVENANCE_CODE_COMMIT" \
    -v wrapper_config_hash="$PIPELINE_PROVENANCE_CONFIG_HASH" \
    -v wrapper_source_tree_hash="$PIPELINE_PROVENANCE_SOURCE_TREE_HASH" \
    -v wrapper_repo_root="$PIPELINE_PROVENANCE_REPO_ROOT" \
    -v wrapper_script="$PIPELINE_PROVENANCE_WRAPPER_SCRIPT" \
    -v wrapper_token_hash="$attempt_token_hash" <<'SQL'
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
  jsonb_build_object(
    'wrapper_attempt', true,
    'code_commit', :'wrapper_commit',
    'config_hash', :'wrapper_config_hash',
    'source_tree_hash', :'wrapper_source_tree_hash',
    'repo_root', :'wrapper_repo_root',
    'wrapper_script', :'wrapper_script',
    'attempt_token_hash', :'wrapper_token_hash'
  )
)
RETURNING run_id;
SQL
  )" || [[ ! "$run_id" =~ ^wrapper-attempt-[0-9a-f-]{36}$ ]]; then
    echo "$job_name wrapper attempt audit creation failed" >&2
    return 70
  fi
  PIPELINE_WRAPPER_ATTEMPT_ID="$run_id"
  PIPELINE_WRAPPER_ATTEMPT_TOKEN="$attempt_token"
}

pipeline_finish_wrapper_attempt() {
  local run_id="$1"
  local status="$2"
  local result finish_commit="" finish_config_hash="" finish_source_tree_hash=""
  local finish_repo_root="" finish_wrapper_script="" finish_token finish_token_hash
  if [[ "$status" != "completed" && "$status" != "failed" ]]; then
    echo "invalid wrapper attempt status: $status" >&2
    return 64
  fi
  finish_token="${PIPELINE_WRAPPER_ATTEMPT_TOKEN:-}"
  if [[ "$run_id" != "${PIPELINE_WRAPPER_ATTEMPT_ID:-}" ||
        ! "$finish_token" =~ ^[0-9a-f]{64}$ ]]; then
    echo "$run_id wrapper attempt capability is unavailable" >&2
    return 70
  fi
  if ! finish_token_hash="$(printf '%s' "$finish_token" | sha256sum | cut -d' ' -f1)" ||
     [[ ! "$finish_token_hash" =~ ^[0-9a-f]{64}$ ]]; then
    echo "$run_id wrapper attempt capability hash failed" >&2
    return 70
  fi
  if [[ "$status" = "completed" ]]; then
    pipeline_resolve_provenance "$run_id completion" || return $?
    finish_commit="$PIPELINE_PROVENANCE_CODE_COMMIT"
    finish_config_hash="$PIPELINE_PROVENANCE_CONFIG_HASH"
    finish_source_tree_hash="$PIPELINE_PROVENANCE_SOURCE_TREE_HASH"
    finish_repo_root="$PIPELINE_PROVENANCE_REPO_ROOT"
    finish_wrapper_script="$PIPELINE_PROVENANCE_WRAPPER_SCRIPT"
  fi
  if ! result="$(psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt \
    -v wrapper_run_id="$run_id" -v wrapper_status="$status" \
    -v finish_commit="$finish_commit" -v finish_config_hash="$finish_config_hash" \
    -v finish_source_tree_hash="$finish_source_tree_hash" \
    -v finish_repo_root="$finish_repo_root" \
    -v finish_wrapper_script="$finish_wrapper_script" \
    -v finish_token_hash="$finish_token_hash" <<'SQL'
UPDATE public.migration_runs
SET status = :'wrapper_status',
    finished_at = clock_timestamp(),
    error = CASE WHEN :'wrapper_status' = 'failed' THEN 'wrapper_failed' ELSE NULL END
WHERE run_id = :'wrapper_run_id'
  AND status = 'running'
  AND summary ->> 'attempt_token_hash' = :'finish_token_hash'
  AND (
    :'wrapper_status' = 'failed'
    OR (
      summary ->> 'wrapper_attempt' = 'true'
      AND summary ->> 'code_commit' ~ '^[0-9a-f]{40,64}$'
      AND summary ->> 'config_hash' ~ '^[0-9a-f]{64}$'
      AND summary ->> 'source_tree_hash' ~ '^[0-9a-f]{64}$'
      AND summary ->> 'repo_root' LIKE '/%'
      AND summary ->> 'wrapper_script' LIKE (summary ->> 'repo_root') || '/%'
      AND summary ->> 'code_commit' = :'finish_commit'
      AND summary ->> 'config_hash' = :'finish_config_hash'
      AND summary ->> 'source_tree_hash' = :'finish_source_tree_hash'
      AND summary ->> 'repo_root' = :'finish_repo_root'
      AND summary ->> 'wrapper_script' = :'finish_wrapper_script'
    )
  )
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
