#!/usr/bin/env bash
set -euo pipefail
shopt -s inherit_errexit
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
mode=full
if [[ "${1:-}" == "--preflight" ]]; then mode=preflight; shift; fi
[[ $# -eq 1 ]] || { echo "usage: $0 [--preflight] BACKUP_DIR" >&2; exit 64; }
BACKUP_DIR=$(realpath "$1")
METADATA="$BACKUP_DIR/RESTORE_METADATA"
DUMP="$BACKUP_DIR/research_app.dump"
GLOBALS="$BACKUP_DIR/globals.sql"
NAME=${RESEARCH_APP_RESTORE_NAME:-stock-insight-post-recovery-restore-proof}
VOLUME=${RESEARCH_APP_RESTORE_VOLUME:-stock-insight-post-recovery-restore-proof-pgdata}
LOG=${RESEARCH_APP_RESTORE_LOG:-/tmp/stock-insight-post-recovery-restore-proof-container.log}
RESTORE_ADMIN=postgres

python3 "$SCRIPT_DIR/research-app-backup-contract.py" verify "$BACKUP_DIR" >/dev/null
metadata_value() {
  python3 -c "import pathlib,sys; p=pathlib.Path(sys.argv[1]); key=sys.argv[2]+'='; rows=p.read_text().splitlines(); print(next(x[len(key):] for x in rows if x.startswith(key)))" "$METADATA" "$1"
}
IMAGE=$(metadata_value POSTGRES_IMAGE)
POSTGRES_VERSION=$(metadata_value POSTGRES_VERSION)
TIMESCALE_VERSION=$(metadata_value SOURCE_TIMESCALE_VERSION)
POSTGIS_VERSION=$(metadata_value SOURCE_POSTGIS_VERSION)
VECTOR_VERSION=$(metadata_value SOURCE_VECTOR_VERSION)
GLOBALS_SHA256=$(metadata_value SOURCE_GLOBALS_SHA256)
DATABASE_OWNER=$(metadata_value DATABASE_OWNER)
EXPECTED_ITEMS=$(metadata_value SOURCE_CONTENT_PACK_ITEMS)
EXPECTED_DERIVATIONS=$(metadata_value SOURCE_SEALED_DERIVATIONS)
EXPECTED_INVALID=$(metadata_value SOURCE_INVALID_INDEXES)
EXPECTED_HYPERTABLES=$(metadata_value SOURCE_HYPERTABLES)
EXPECTED_JOBS=$(metadata_value SOURCE_TIMESCALE_JOBS)
EXPECTED_SEQUENCE_COUNT=$(metadata_value DUMP_SEQUENCE_COUNT)
docker image inspect "$IMAGE" >/dev/null
SEQUENCE_LIST=$(mktemp)
SEQUENCE_SQL=$(mktemp)
cleanup_sequence_files() { rm -f "$SEQUENCE_LIST" "$SEQUENCE_SQL"; }
trap cleanup_sequence_files EXIT
pg_restore --list "$DUMP" \
  | python3 -c "import sys; print(''.join(x for x in sys.stdin if ' SEQUENCE SET ' in x), end='')" \
  >"$SEQUENCE_LIST"
pg_restore --use-list="$SEQUENCE_LIST" --file="$SEQUENCE_SQL" "$DUMP"
ACTUAL_SEQUENCE_COUNT=$(python3 "$SCRIPT_DIR/research-app-backup-contract.py" sequence-count "$SEQUENCE_SQL")
[[ "$ACTUAL_SEQUENCE_COUNT" == "$EXPECTED_SEQUENCE_COUNT" ]] || { echo 'dump sequence count mismatch' >&2; exit 76; }
printf 'image=%s\npostgres=%s\ntimescaledb=%s\npostgis=%s\nvector=%s\n' \
  "$IMAGE" "$POSTGRES_VERSION" "$TIMESCALE_VERSION" "$POSTGIS_VERSION" "$VECTOR_VERSION"
if [[ "$mode" == preflight ]]; then rm -f "$SEQUENCE_LIST" "$SEQUENCE_SQL"; echo 'preflight=PASS'; exit 0; fi

reconcile_stale() {
  if docker container inspect "$NAME" >/dev/null 2>&1; then
    local created now age label
    label=$(docker inspect "$NAME" --format '{{index .Config.Labels "com.stock-insight.restore-proof"}}')
    [[ "$label" == true ]] || { echo 'restore name collision with unowned container' >&2; exit 73; }
    created=$(date -d "$(docker inspect "$NAME" --format '{{.Created}}')" +%s)
    now=$(date +%s); age=$((now-created))
    (( age >= 21600 )) || { echo 'recent restore proof already exists' >&2; exit 73; }
    docker rm -f "$NAME" >/dev/null
  fi
  if docker volume inspect "$VOLUME" >/dev/null 2>&1; then
    local label
    label=$(docker volume inspect "$VOLUME" --format '{{index .Labels "com.stock-insight.restore-proof"}}')
    [[ "$label" == true ]] || { echo 'restore volume collision with unowned volume' >&2; exit 73; }
    docker volume rm "$VOLUME" >/dev/null
  fi
}
reconcile_stale

cleanup() {
  rc=$?
  cleanup_sequence_files
  if [[ $rc -ne 0 ]] && docker container inspect "$NAME" >/dev/null 2>&1; then
    docker logs "$NAME" >"$LOG" 2>&1 || true
    printf 'failure_container_log=%s\n' "$LOG" >&2
  fi
  docker rm -f "$NAME" >/dev/null 2>&1 || rc=1
  docker volume rm "$VOLUME" >/dev/null 2>&1 || rc=1
  if docker container inspect "$NAME" >/dev/null 2>&1 || docker volume inspect "$VOLUME" >/dev/null 2>&1; then rc=1; fi
  return "$rc"
}
trap cleanup EXIT

docker volume create --label com.stock-insight.restore-proof=true "$VOLUME" >/dev/null
docker run -d --name "$NAME" --network none --label com.stock-insight.restore-proof=true \
  -e POSTGRES_USER="$RESTORE_ADMIN" -e POSTGRES_PASSWORD=restore-proof-only -e POSTGRES_DB=postgres \
  -v "$VOLUME:/home/postgres/pgdata/data" "$IMAGE" >/dev/null
stable=0; previous=''
for _ in $(seq 1 120); do
  current=$(docker exec "$NAME" psql -U "$RESTORE_ADMIN" -d postgres -X -At -c 'SELECT pg_postmaster_start_time()' 2>/dev/null || true)
  if [[ -n "$current" && "$current" == "$previous" ]]; then stable=$((stable+1)); else stable=0; fi
  previous=$current
  (( stable >= 5 )) && break
  sleep 2
done
(( stable >= 5 )) || { echo 'final postmaster readiness timeout' >&2; exit 70; }

python3 - "$GLOBALS" <<'PY' | docker exec -i "$NAME" psql -U "$RESTORE_ADMIN" -d postgres -X -v ON_ERROR_STOP=1 >/tmp/stock-insight-restore-proof-globals.log
import pathlib
import sys

for line in pathlib.Path(sys.argv[1]).read_text(encoding='utf-8').splitlines():
    if line != 'CREATE ROLE postgres;':
        print(line)
PY

capture_globals_hash() {
  local payload
  payload=$(docker exec "$NAME" psql -U "$RESTORE_ADMIN" -d postgres -X -At -v ON_ERROR_STOP=1 -c "
    WITH roles AS (
      SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
             rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil::text, rolpassword
      FROM pg_authid WHERE rolname !~ '^pg_' ORDER BY rolname
    ), memberships AS (
      SELECT role_role.rolname AS role_name, member_role.rolname AS member_name,
             grantor_role.rolname AS grantor_name, m.admin_option,
             m.inherit_option, m.set_option
      FROM pg_auth_members m
      JOIN pg_roles role_role ON role_role.oid = m.roleid
      JOIN pg_roles member_role ON member_role.oid = m.member
      JOIN pg_roles grantor_role ON grantor_role.oid = m.grantor
      WHERE role_role.rolname !~ '^pg_' OR member_role.rolname !~ '^pg_'
      ORDER BY role_name, member_name, grantor_name
    ), settings AS (
      SELECT role_role.rolname AS role_name, COALESCE(database_name.datname, '') AS database_name,
             setting.setconfig
      FROM pg_db_role_setting setting
      JOIN pg_roles role_role ON role_role.oid = setting.setrole
      LEFT JOIN pg_database database_name ON database_name.oid = NULLIF(setting.setdatabase, 0)
      WHERE role_role.rolname !~ '^pg_'
      ORDER BY role_name, database_name
    ), tablespaces AS (
      SELECT spcname, pg_get_userbyid(spcowner) AS owner_name, spcoptions
      FROM pg_tablespace WHERE spcname NOT IN ('pg_default','pg_global') ORDER BY spcname
    )
    SELECT jsonb_build_object(
      'roles', COALESCE((SELECT jsonb_agg(to_jsonb(roles) ORDER BY rolname) FROM roles), '[]'::jsonb),
      'memberships', COALESCE((SELECT jsonb_agg(to_jsonb(memberships) ORDER BY role_name, member_name, grantor_name) FROM memberships), '[]'::jsonb),
      'settings', COALESCE((SELECT jsonb_agg(to_jsonb(settings) ORDER BY role_name, database_name) FROM settings), '[]'::jsonb),
      'tablespaces', COALESCE((SELECT jsonb_agg(to_jsonb(tablespaces) ORDER BY spcname) FROM tablespaces), '[]'::jsonb)
    )::text
  ")
  [[ -n "$payload" ]] || { echo 'empty restored global role manifest' >&2; return 76; }
  printf '%s' "$payload" | sha256sum | cut -d' ' -f1
}
[[ "$(capture_globals_hash)" == "$GLOBALS_SHA256" ]] || { echo 'restored global role semantics mismatch' >&2; exit 76; }

docker exec "$NAME" psql -U "$RESTORE_ADMIN" -d postgres -X -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE research_app OWNER $DATABASE_OWNER TEMPLATE template0;" >/dev/null
docker exec "$NAME" psql -U "$RESTORE_ADMIN" -d research_app -X -v ON_ERROR_STOP=1 \
  -c "CREATE EXTENSION timescaledb VERSION '$TIMESCALE_VERSION'; SELECT timescaledb_pre_restore();" >/dev/null
docker exec -i "$NAME" pg_restore -U "$RESTORE_ADMIN" -d research_app --exit-on-error <"$DUMP"
docker exec "$NAME" psql -U "$RESTORE_ADMIN" -d research_app -X -v ON_ERROR_STOP=1 \
  -c 'SELECT timescaledb_post_restore();' >/dev/null
docker exec "$NAME" pg_amcheck -U "$RESTORE_ADMIN" -d research_app --heapallindexed --parent-check --rootdescend

ACTUAL=$(docker exec "$NAME" psql -U "$RESTORE_ADMIN" -d research_app -X -At -F= -v ON_ERROR_STOP=1 -c "
  SELECT 'TIMESCALE_VERSION', extversion FROM pg_extension WHERE extname='timescaledb'
  UNION ALL SELECT 'POSTGIS_VERSION', extversion FROM pg_extension WHERE extname='postgis'
  UNION ALL SELECT 'VECTOR_VERSION', extversion FROM pg_extension WHERE extname='vector'
  UNION ALL SELECT 'ITEMS', count(*)::text FROM serving.content_pack_item
  UNION ALL SELECT 'DERIVATIONS', count(*)::text FROM knowledge.derivation WHERE status='sealed'
  UNION ALL SELECT 'INVALID', count(*)::text FROM pg_index WHERE NOT indisvalid
  UNION ALL SELECT 'HYPERTABLES', count(*)::text FROM timescaledb_information.hypertables
  UNION ALL SELECT 'JOBS', count(*)::text FROM timescaledb_information.jobs
  ORDER BY 1
")
actual_value() { printf '%s\n' "$ACTUAL" | python3 -c "import sys; key=sys.argv[1]+'='; print(next(x[len(key):] for x in sys.stdin.read().splitlines() if x.startswith(key)))" "$1"; }
[[ "$(actual_value TIMESCALE_VERSION)" == "$TIMESCALE_VERSION" ]]
[[ "$(actual_value POSTGIS_VERSION)" == "$POSTGIS_VERSION" ]]
[[ "$(actual_value VECTOR_VERSION)" == "$VECTOR_VERSION" ]]
[[ "$(actual_value ITEMS)" == "$EXPECTED_ITEMS" ]]
[[ "$(actual_value DERIVATIONS)" == "$EXPECTED_DERIVATIONS" ]]
[[ "$(actual_value INVALID)" == "$EXPECTED_INVALID" && "$EXPECTED_INVALID" == 0 ]]
[[ "$(actual_value HYPERTABLES)" == "$EXPECTED_HYPERTABLES" ]]
[[ "$(actual_value JOBS)" == "$EXPECTED_JOBS" ]]
python3 "$SCRIPT_DIR/research-app-backup-contract.py" sequence-validation-sql "$SEQUENCE_SQL" \
  | docker exec -i "$NAME" psql -U "$RESTORE_ADMIN" -d research_app -X -v ON_ERROR_STOP=1 >/dev/null
printf '%s\n' "$ACTUAL"
printf 'sequence_count=%s\nrestore_rehearsal=PASS\n' "$ACTUAL_SEQUENCE_COUNT"
