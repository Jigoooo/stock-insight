# research_app PITR·checksum 운영 절차

## 목표

- PostgreSQL page checksum 활성화
- pgBackRest full/diff backup과 지속 WAL archive
- restore point 기반 disposable-volume 복원 실증
- 논리백업·암호화 off-host DR과 독립적으로 병행

## 적용 전 gate

1. 최신 strict logical backup의 checksum·metadata·full restore·`pg_amcheck` PASS
2. 운영 volume 이름과 digest-pinned image 기록
3. News/OHLCV/Fundamentals/Market/Knowledge/Analytics timer 중지
4. 앱·API writer 중지 및 활성 DB session drain
5. rollback 명령과 기존 Compose 사본 확인

## checksum cutover

```bash
docker compose -f /home/jigoo/hermes-work/research-app-db/docker-compose.yml stop postgres
docker run --rm --user 1000:1000 --entrypoint pg_checksums \
  -v research-app-db_research_app_pgdata_ha_logical_20260725:/pgdata \
  timescale/timescaledb-ha@sha256:b8891426a9a877bcc29f85572134ec66d258aebd6bdcf84ddb853d73a6ccf29a \
  --enable -D /pgdata
```

`pg_checksums --check`가 PASS하기 전에는 DB를 재기동하지 않는다.

## WAL archive 활성화

`ops/config/pgbackrest-research-app.conf`를 mode 0600으로 runtime `pgbackrest/pgbackrest.conf`에 설치하고 다음 두 파일을 함께 사용한다.

```bash
docker compose --project-directory /home/jigoo/hermes-work/research-app-db \
  -f /home/jigoo/hermes-work/research-app-db/docker-compose.yml \
  -f /home/jigoo/.hermes/workspace/stock-insight/ops/compose/research-app-pgbackrest.override.yml \
  up -d postgres
```

기동 후 `data_checksums=on`, `archive_mode=on`, exact `archive_command`를 확인한다. 그 다음 `stanza-create → check → full backup → pg_switch_wal → check` 순서로 수행한다.

## 복원 실증

writer가 중지된 maintenance window에서 다음을 실행한다.

```bash
ops/scripts/verify-research-app-pgbackrest-restore.sh
```

restore point까지 WAL 복원·timeline 승격·checksum·`pg_amcheck`·critical row/Timescale parity가 모두 PASS해야 한다.

## rollback

checksum 자체는 데이터 format과 호환되므로 유지한다. pgBackRest/archiving만 되돌릴 때는 override 없이 기존 base Compose로 재생성한다.

```bash
docker compose -f /home/jigoo/hermes-work/research-app-db/docker-compose.yml up -d --force-recreate postgres
```

그 후 `archive_mode=off`, DB health, API/App health를 확인하고 writer timer를 재개한다. 기존 논리복원 volume과 strict logical backup은 삭제하지 않는다.
