#!/usr/bin/env bash
set -euo pipefail
umask 077
CONTAINER=${RESEARCH_APP_CONTAINER:-research-app-postgres}
REPO_DIR=${RESEARCH_APP_PGBACKREST_DIR:-/home/jigoo/hermes-work/research-app-db/pgbackrest}
NAME=stock-insight-pgbackrest-restore-drill
VOLUME=stock-insight-pgbackrest-restore-drill-pgdata
IMAGE=$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')
LABEL="stock_insight_drill_$(date -u +%Y%m%dT%H%M%SZ)"
[[ -s "$REPO_DIR/pgbackrest.conf" ]] || { echo 'missing pgBackRest config' >&2; exit 66; }
if docker container inspect "$NAME" >/dev/null 2>&1; then docker rm -f "$NAME" >/dev/null; fi
if docker volume inspect "$VOLUME" >/dev/null 2>&1; then docker volume rm "$VOLUME" >/dev/null; fi
cleanup(){ rc=$?; docker rm -f "$NAME" >/dev/null 2>&1 || rc=1; docker volume rm "$VOLUME" >/dev/null 2>&1 || rc=1; return "$rc"; }
trap cleanup EXIT

SOURCE=$(docker exec "$CONTAINER" psql -U research_app -d research_app -X -At -F= -v ON_ERROR_STOP=1 -c "
  SELECT pg_create_restore_point('$LABEL');
  SELECT 'ITEMS', count(*)::text FROM serving.content_pack_item
  UNION ALL SELECT 'DERIVATIONS', count(*)::text FROM knowledge.derivation WHERE status='sealed'
  UNION ALL SELECT 'HYPERTABLES', count(*)::text FROM timescaledb_information.hypertables
  UNION ALL SELECT 'JOBS', count(*)::text FROM timescaledb_information.jobs
  ORDER BY 1
")
docker exec "$CONTAINER" psql -U research_app -d postgres -X -At -v ON_ERROR_STOP=1 -c 'SELECT pg_switch_wal();' >/dev/null
docker exec "$CONTAINER" pgbackrest --stanza=research-app check

docker volume create --label com.stock-insight.restore-proof=true "$VOLUME" >/dev/null
docker run --rm --user 0:0 --entrypoint /bin/sh -v "$VOLUME:/restore" "$IMAGE" \
  -c 'chown 1000:1000 /restore && chmod 0700 /restore'
docker run --rm --user 1000:1000 --entrypoint pgbackrest \
  -e PGBACKREST_CONFIG=/home/postgres/pgbackrest/pgbackrest.conf \
  -v "$REPO_DIR:/home/postgres/pgbackrest" -v "$VOLUME:/home/postgres/pgdata/data" "$IMAGE" \
  --stanza=research-app --pg1-path=/home/postgres/pgdata/data --type=name --target="$LABEL" \
  --target-action=promote --archive-mode=off restore
docker run -d --name "$NAME" --network none --label com.stock-insight.restore-proof=true \
  -e POSTGRES_USER=research_app -e POSTGRES_DB=research_app \
  -e PGBACKREST_CONFIG=/home/postgres/pgbackrest/pgbackrest.conf \
  -v "$VOLUME:/home/postgres/pgdata/data" -v "$REPO_DIR:/home/postgres/pgbackrest" \
  "$IMAGE" postgres -c archive_mode=off >/dev/null
for _ in $(seq 1 180); do
  docker exec "$NAME" pg_isready -U research_app -d research_app >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME" pg_isready -U research_app -d research_app >/dev/null
docker exec "$NAME" pg_amcheck -U research_app -d research_app --heapallindexed --parent-check --rootdescend
TARGET=$(docker exec "$NAME" psql -U research_app -d research_app -X -At -F= -v ON_ERROR_STOP=1 -c "
  SELECT 'CHECKSUMS', current_setting('data_checksums')
  UNION ALL SELECT 'INVALID', count(*)::text FROM pg_index WHERE NOT indisvalid
  UNION ALL SELECT 'ITEMS', count(*)::text FROM serving.content_pack_item
  UNION ALL SELECT 'DERIVATIONS', count(*)::text FROM knowledge.derivation WHERE status='sealed'
  UNION ALL SELECT 'HYPERTABLES', count(*)::text FROM timescaledb_information.hypertables
  UNION ALL SELECT 'JOBS', count(*)::text FROM timescaledb_information.jobs
  ORDER BY 1
")
value(){ printf '%s\n' "$1" | python3 -c "import sys; k=sys.argv[1]+'='; print(next(x[len(k):] for x in sys.stdin.read().splitlines() if x.startswith(k)))" "$2"; }
[[ "$(value "$TARGET" CHECKSUMS)" == on ]]
[[ "$(value "$TARGET" INVALID)" == 0 ]]
for key in ITEMS DERIVATIONS HYPERTABLES JOBS; do [[ "$(value "$TARGET" "$key")" == "$(value "$SOURCE" "$key")" ]]; done
printf '%s\n' "$TARGET"
printf 'pgbackrest_restore_drill=PASS restore_point=%s\n' "$LABEL"
