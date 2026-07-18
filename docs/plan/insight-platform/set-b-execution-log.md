# SET B 실행 기록 — 정본 기반 (core·ingestion·운영 인프라)

> 실행일: 2026-07-18, `master` (SET A `652cb95` 이후)
> 계획 근거: `00-B-execution-bundles.md` §3, `02-A-ddl-and-migration-spec.md`

## B-1 인프라 (재시작 창 1회)

| 항목 | 결과 |
|---|---|
| WAL 아카이빙 | `archive_mode=on`, `archive_command`=in-container copy to `wal_archive/`, `archive_timeout=15min`. 컨테이너 재시작 1회 후 `pg_switch_wal()` 실측 — `archived_count=1, failed_count=0` |
| 일일 base backup | `research-app-db/scripts/base_backup_daily.sh` + systemd user timer `research-app-base-backup.timer` (04:30 KST). 첫 실행 실측: 819M dump + globals, `pg_restore --list` 검증 통과, retention 14d |
| raw object store | `/home/jigoo/hermes-work/raw-objects/{provider}/{yyyy}/{mm}/{hash[:2]}/` + `_manifest/{day}.jsonl`. S3/MinIO 승격은 구현 교체만으로 가능 |
| 재시작 영향 | web/app·api-server 헬스 정상 복귀 확인 (병행 서비스 무중단) |

RPO: DB WAL 15분 / raw manifest 일 단위. 오프호스트 미러는 후속(수동 rsync 대상 경로 문서화만).

## B-2 스키마 (migration 008)

- `core`: entity / entity_identifier / entity_alias / listing (+타입 CHECK, 인덱스)
- `ingestion`: source / source_contract / fetch_run / raw_object / source_watermark
- `ops`: model_registry / prompt_registry
- 워커 role 6종(`si_*`) NOLOGIN 생성 + 스키마별 최소 GRANT. 앱 reader는 core/ingestion read-only
- 멱등 재실행 검증: 2회차 전체 no-op

## B-3 백필 (migration 009, 원천: public.entities + company_profiles)

| 검증 | 결과 |
|---|---|
| 분해 | Stock 254 + Company 254 + Exchange 3 (KOSPI/KOSDAQ/US_COMPOSITE) |
| 식별자 | INTERNAL_KEY 511, LOCAL_TICKER 254(거래소 namespace), **DART_CORP_CODE 151 (KR 100%)**, CIK 96, MIC 2 |
| 상장 | KOSPI 106 / KOSDAQ 45 (corporationClass 기반) / US placeholder 103 |
| alias | 표시명 254 + 영문 공식명 151 |
| V1 손실 0 | `t` (legacy ticker 수 = core Stock INTERNAL_KEY 수) |
| V2 listing 중복 0 | `0` |
| V3 universe parity | `core.v_security_universe` = `serving.security_universe_v1`, diff 0 |

의도적 보류: 코인/theme/macro 엔티티는 transitional 유지 (SET D 지식화에서 분류), US 거래소 실명은 SEC submissions 확보 시 백필 (`exchange_confidence='placeholder'` 라벨).

## B-4 커넥터 규약 첫 적용 (RSS)

- `apps/api/src/ingest/raw-object-store.ts`: content-addressed 저장 + manifest + fetch_run open/close/raw register SQL
- `run-news-rss.ts`: Persist Raw(수집 번들 원본) → fetch_run open → 기존 적재 → close. 실패는 legacy 적재를 막지 않음(additive 원칙)
- 운영 실측: fetch_run 1건 `partial`(feedErrors=1 반영), raw_object 1건, 파일·manifest 존재, 계보 `raw_object→fetch_run→source` 조인 성공
- `ingestion.source` 시드: 기존 정책 28 provider + `rss-news-bundle` = 29

## B-5 복구 리허설

격리 컨테이너(`timescale/timescaledb:latest-pg16`)에서 당일 dump(819M) 복원 실측:

| probe | 복원값 | 판정 |
|---|---|---|
| core Stock / identifiers / listings | 254 / 1,014 / 254 | ✅ 운영과 일치 |
| market_ts.ohlcv | 2,427,150 (chunk 포함 전체 도메인) | ✅ |
| source_documents / forecast_issuance | 3,133 / 3,565 | ✅ |
| serving.security_universe_v1 | KR 151 / US 103 — 뷰가 복원 DB에서 동작 | ✅ |
| fetch_run | 0 — dump(13:26)가 첫 fetch_run(13:37) 이전 시점이라 정합 | ✅ (시점 정합) |
| restore 오류 | 478건 전부 `role "stock_insight_reader" does not exist` (GRANT 실패) | ⚠️ globals 선적용으로 해소 — backup 스크립트에 복원 순서 주석 반영 |

교훈: 복원 절차는 `globals-*.sql → timescaledb_pre_restore → pg_restore → post_restore` 순서 고정. 데이터 손실 0.

## 남긴 것 (SET B 범위 밖으로 이월)

- Dagster 오케스트레이터: **도입 보류** — ready 게이트 스크립트 선적용은 SET D 발행 전환과 함께 (06-A §1.4 승인 항목, 현 시점 실익 대비 운영 리스크 판단)
- 워커 role LOGIN 전환: 신규 워커 작성 시점(SET C/D)부터 적용
- 오프호스트 백업 미러: 수동 절차 문서화만, 자동화는 후속
