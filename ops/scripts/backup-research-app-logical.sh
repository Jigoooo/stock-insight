#!/usr/bin/env bash
set -euo pipefail
shopt -s inherit_errexit
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CONTAINER=${RESEARCH_APP_CONTAINER:-research-app-postgres}
DATABASE_URL=${RESEARCH_APP_DATABASE_URL:-postgresql://research_app@127.0.0.1:55432/research_app}
BACKUP_ROOT=${RESEARCH_APP_LOGICAL_BACKUP_ROOT:-/home/jigoo/hermes-work/research-app-db/backups/logical}
KEEP_DAYS=${RESEARCH_APP_LOGICAL_BACKUP_KEEP_DAYS:-14}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FINAL_DIR="$BACKUP_ROOT/logical-$STAMP"
PARTIAL_DIR="$BACKUP_ROOT/.partial-$STAMP-$$"
SNAPSHOT_STATE="$PARTIAL_DIR/.snapshot.json"
SNAPSHOT_RELEASE="$PARTIAL_DIR/.snapshot.release"
SNAPSHOT_PID=''

[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || { echo 'invalid retention' >&2; exit 64; }
docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "missing database container: $CONTAINER" >&2; exit 69; }
install -d -m 700 "$BACKUP_ROOT"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '.partial-*' -mmin +1440 -exec rm -rf -- {} +
install -d -m 700 "$PARTIAL_DIR"

cleanup() {
  rc=$?
  if [[ -n "$SNAPSHOT_PID" ]] && kill -0 "$SNAPSHOT_PID" 2>/dev/null; then
    : >"$SNAPSHOT_RELEASE"
    wait "$SNAPSHOT_PID" || rc=1
  fi
  if [[ $rc -ne 0 ]]; then rm -rf "$PARTIAL_DIR"; fi
  return "$rc"
}
trap cleanup EXIT

capture_globals_hash() {
  local user=$1 exclude_role=$2 payload
  [[ "$exclude_role" =~ ^[a-z_][a-z0-9_]*$ ]] || return 64
  payload=$(docker exec "$CONTAINER" psql -U "$user" -d postgres -X -At -v ON_ERROR_STOP=1 -c "
    WITH roles AS (
      SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
             rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil::text, rolpassword
      FROM pg_authid WHERE rolname !~ '^pg_' AND rolname <> '$exclude_role' ORDER BY rolname
    ), memberships AS (
      SELECT role_role.rolname AS role_name, member_role.rolname AS member_name,
             grantor_role.rolname AS grantor_name, m.admin_option,
             m.inherit_option, m.set_option
      FROM pg_auth_members m
      JOIN pg_roles role_role ON role_role.oid = m.roleid
      JOIN pg_roles member_role ON member_role.oid = m.member
      JOIN pg_roles grantor_role ON grantor_role.oid = m.grantor
      WHERE (role_role.rolname !~ '^pg_' OR member_role.rolname !~ '^pg_')
        AND role_role.rolname <> '$exclude_role' AND member_role.rolname <> '$exclude_role'
      ORDER BY role_name, member_name, grantor_name
    ), settings AS (
      SELECT role_role.rolname AS role_name, COALESCE(database_name.datname, '') AS database_name,
             setting.setconfig
      FROM pg_db_role_setting setting
      JOIN pg_roles role_role ON role_role.oid = setting.setrole
      LEFT JOIN pg_database database_name ON database_name.oid = NULLIF(setting.setdatabase, 0)
      WHERE role_role.rolname !~ '^pg_' AND role_role.rolname <> '$exclude_role'
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
  [[ -n "$payload" ]] || { echo 'empty global role manifest' >&2; return 76; }
  printf '%s' "$payload" | sha256sum | cut -d' ' -f1
}

capture_static_state() {
  docker inspect "$CONTAINER" --format '{{.Config.Image}}'
  docker exec "$CONTAINER" psql -U research_app -d research_app -X -At -F= -v ON_ERROR_STOP=1 -c "
    SELECT 'POSTGRES_VERSION', split_part(current_setting('server_version'),' ',1)
    UNION ALL SELECT 'DATABASE_OWNER', pg_get_userbyid(datdba) FROM pg_database WHERE datname='research_app'
    UNION ALL SELECT 'SOURCE_' || upper(extname) || '_VERSION', extversion
      FROM pg_extension WHERE extname IN ('timescaledb','postgis','vector')
    ORDER BY 1
  "
}

GLOBALS_BEFORE=$(capture_globals_hash research_app __none__)
STATIC_BEFORE=$(capture_static_state)
DATABASE_URL="$DATABASE_URL" node "$SCRIPT_DIR/export-research-app-snapshot.mjs" \
  "$SNAPSHOT_STATE" "$SNAPSHOT_RELEASE" &
SNAPSHOT_PID=$!
for _ in $(seq 1 300); do
  [[ -s "$SNAPSHOT_STATE" ]] && break
  kill -0 "$SNAPSHOT_PID" 2>/dev/null || { wait "$SNAPSHOT_PID"; exit 1; }
  sleep 0.1
done
[[ -s "$SNAPSHOT_STATE" ]] || { echo 'snapshot keeper readiness timeout' >&2; exit 70; }
SNAPSHOT_ID=$(node -e "const x=require(process.argv[1]); process.stdout.write(x.snapshotId)" "$SNAPSHOT_STATE")

docker exec "$CONTAINER" pg_dump -U research_app -d research_app -Fc -Z6 \
  --snapshot="$SNAPSHOT_ID" >"$PARTIAL_DIR/research_app.dump"
: >"$SNAPSHOT_RELEASE"
wait "$SNAPSHOT_PID"
SNAPSHOT_PID=''
docker exec "$CONTAINER" pg_dumpall -U research_app --globals-only >"$PARTIAL_DIR/globals.sql"
pg_restore --list "$PARTIAL_DIR/research_app.dump" \
  | python3 -c "import sys; print(''.join(x for x in sys.stdin if ' SEQUENCE SET ' in x), end='')" \
  >"$PARTIAL_DIR/.sequence.list"
pg_restore --use-list="$PARTIAL_DIR/.sequence.list" --file="$PARTIAL_DIR/.sequence.sql" "$PARTIAL_DIR/research_app.dump"
DUMP_SEQUENCE_COUNT=$(python3 "$SCRIPT_DIR/research-app-backup-contract.py" sequence-count "$PARTIAL_DIR/.sequence.sql")
rm -f "$PARTIAL_DIR/.sequence.list" "$PARTIAL_DIR/.sequence.sql"
GLOBALS_AFTER=$(capture_globals_hash research_app __none__)
STATIC_AFTER=$(capture_static_state)
[[ "$GLOBALS_BEFORE" == "$GLOBALS_AFTER" ]] || { echo 'global role state changed during backup' >&2; exit 75; }
[[ "$STATIC_BEFORE" == "$STATIC_AFTER" ]] || { echo 'extension/database state changed during backup' >&2; exit 75; }

POSTGRES_IMAGE=$(printf '%s\n' "$STATIC_BEFORE" | sed -n '1p')
state_value() { printf '%s\n' "$STATIC_BEFORE" | python3 -c "import sys; key=sys.argv[1]+'='; print(next(x[len(key):] for x in sys.stdin.read().splitlines() if x.startswith(key)))" "$1"; }
snapshot_value() { node -e "const x=require(process.argv[1]); const v=x[process.argv[2]]; if(v===undefined)process.exit(1); process.stdout.write(String(v))" "$SNAPSHOT_STATE" "$1"; }
POSTGRES_VERSION=$(state_value POSTGRES_VERSION)
DATABASE_OWNER=$(state_value DATABASE_OWNER)
SOURCE_TIMESCALE_VERSION=$(state_value SOURCE_TIMESCALEDB_VERSION)
SOURCE_POSTGIS_VERSION=$(state_value SOURCE_POSTGIS_VERSION)
SOURCE_VECTOR_VERSION=$(state_value SOURCE_VECTOR_VERSION)
SOURCE_CONTENT_PACK_ITEMS=$(snapshot_value contentPackItems)
SOURCE_SEALED_DERIVATIONS=$(snapshot_value sealedDerivations)
SOURCE_INVALID_INDEXES=$(snapshot_value invalidIndexes)
SOURCE_HYPERTABLES=$(snapshot_value hypertables)
SOURCE_TIMESCALE_JOBS=$(snapshot_value timescaleJobs)
SOURCE_CAPTURED_AT=$(snapshot_value capturedAt)
rm -f "$SNAPSHOT_STATE" "$SNAPSHOT_RELEASE"

cat >"$PARTIAL_DIR/RESTORE_METADATA" <<EOF
FORMAT_VERSION=3
POSTGRES_IMAGE=$POSTGRES_IMAGE
POSTGRES_VERSION=$POSTGRES_VERSION
SOURCE_TIMESCALE_VERSION=$SOURCE_TIMESCALE_VERSION
SOURCE_POSTGIS_VERSION=$SOURCE_POSTGIS_VERSION
SOURCE_VECTOR_VERSION=$SOURCE_VECTOR_VERSION
SOURCE_GLOBALS_SHA256=$GLOBALS_BEFORE
DATABASE_OWNER=$DATABASE_OWNER
SOURCE_CONTENT_PACK_ITEMS=$SOURCE_CONTENT_PACK_ITEMS
SOURCE_SEALED_DERIVATIONS=$SOURCE_SEALED_DERIVATIONS
SOURCE_INVALID_INDEXES=$SOURCE_INVALID_INDEXES
SOURCE_HYPERTABLES=$SOURCE_HYPERTABLES
SOURCE_TIMESCALE_JOBS=$SOURCE_TIMESCALE_JOBS
DUMP_SEQUENCE_COUNT=$DUMP_SEQUENCE_COUNT
SOURCE_CAPTURED_AT=$SOURCE_CAPTURED_AT
EOF
python3 "$SCRIPT_DIR/research-app-backup-contract.py" validate "$PARTIAL_DIR/RESTORE_METADATA" >/dev/null
(
  cd "$PARTIAL_DIR"
  sha256sum research_app.dump globals.sql RESTORE_METADATA >SHA256SUMS
  sha256sum -c SHA256SUMS
)
pg_restore --list "$PARTIAL_DIR/research_app.dump" >/dev/null
chmod 600 "$PARTIAL_DIR"/*
python3 "$SCRIPT_DIR/research-app-backup-contract.py" publish "$PARTIAL_DIR" "$FINAL_DIR" >/dev/null
printf '%s\n' "$FINAL_DIR" >"$BACKUP_ROOT/LAST_SUCCESS.tmp"
python3 -c "import os,sys; p=sys.argv[1]; f=open(p,'rb'); os.fsync(f.fileno()); f.close()" "$BACKUP_ROOT/LAST_SUCCESS.tmp"
mv -f "$BACKUP_ROOT/LAST_SUCCESS.tmp" "$BACKUP_ROOT/LAST_SUCCESS"
python3 -c "import os,sys; fd=os.open(sys.argv[1],os.O_RDONLY|os.O_DIRECTORY); os.fsync(fd); os.close(fd)" "$BACKUP_ROOT"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'logical-*' -mtime +"$KEEP_DAYS" -exec rm -rf -- {} +

printf 'backup_dir=%s\n' "$FINAL_DIR"
stat -c '%n\t%s bytes\t%a' "$FINAL_DIR"/{research_app.dump,globals.sql,RESTORE_METADATA,SHA256SUMS}
