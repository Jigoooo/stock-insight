# Stock Insight 연구뇌 재구축 로드맵 — Phase 13~21

- 작성: 2026-07-11 KST
- 선행 근거: [`stock_insight_research_brain_deep_audit_2026-07-11.md`](./stock_insight_research_brain_deep_audit_2026-07-11.md)
- 상태: **실행 중 — Phase 13 A~D 구현 완료, Phase 13 통합 게이트 진행 전**
- 대상: `research-common`, `stock-research`, `crypto-research`, `research-app-db`, `stock-insight`, GBrain bridge

## 0. 목표와 완료 정의

### 목표

주식·코인·거시·뉴스·재무·정책·사회 사건을 하나의 **point-in-time 연구 계약**으로 연결하고, 같은 근거 snapshot에서 다음 두 제품을 만든다.

- 브리핑: 자연어 요약, 인과가 아닌 가설·근거·불확실성 중심
- Stock Insight: 구조화 수치, 시계열, 관계 경로, source/freshness 중심

### 전체 프로그램 완료 조건

1. PostgreSQL 18 + pinned TimescaleDB/pgvector에서 기존 schema parity가 검증된다.
2. 모든 canonical fact/event/relation에 `available_at`과 source lineage가 있다.
3. briefing/web의 공통 분석 claim이 같은 `analysis_run_id`, `snapshot_id`, `cutoff_at`을 노출한다. 웹 live quote는 별도 `market_data_as_of`를 노출한다.
4. expected publication 누락이 정상 skip으로 숨지 않는다.
5. horizon 종료 전 평가가 final score에 들어가지 않는다.
6. relation은 evidence 없는 mutable edge가 아니라 증거 집합에서 파생된다.
7. 리서치 의미그래프 정본이 SQLite에서 PG18로 이동한다.
8. GBrain은 장기 semantic archive로만 동작하며 검색 건강성이 별도 검증된다.
9. 라이브봇 로컬 SQLite 권위원장은 무변경·무회귀다.
10. legacy 경로 제거 전 14일 이상 dual-run parity와 rollback rehearsal을 통과한다.

## 1. 실행 원칙

- **major upgrade와 schema rewrite를 분리한다.** 동시에 바꾸면 실패 원인을 분리할 수 없다.
- **현재 장애를 새 architecture로 덮지 않는다.** Phase 13에서 schedule·sync·평가원장을 먼저 고정한다.
- **additive → dual-run → shadow read → cutover → retire** 순서를 지킨다.
- “cron 성공”이 아니라 row·watermark·API readback으로 완료를 판정한다.
- LLM은 claim/event/relation 후보를 만들 수 있지만 source span과 review 없이 canonical로 승격하지 않는다.
- 모든 모델은 단순 baseline과 point-in-time walk-forward를 이겨야 한다.
- 리서치 시스템 작업은 라이브 주문 경로와 분리한다.

### 가치 전달 트랜치

1. **필수 조기 실익:** Phase 13 → Phase 14 → Phase 19 최소계약. 기존 schema에 `analysis_run_id/cutoff/watermark`를 additive로 붙여 발행·웹 정합성을 먼저 회복한다.
2. **decision-grade 연구기반:** Phase 15·16·18. provenance, PIT identity/graph, 만기 평가가 필요한 분석만 이 트랜치를 통과해 승격한다.
3. **조건부 고급 연구:** Phase 17의 connectedness/causal validation과 Phase 20 고도화. 충분한 시계열·만기 outcome·골든셋이 없으면 착수하지 않는다.

최종 목표는 Phase 21까지 유지하지만, 앞 트랜치가 독립적으로 실익을 내도록 설계해 장기 작업이 반쪽 migration으로 남는 위험을 줄인다.

## 2. 대상 저장소와 소유 경계

| 영역 | 주 저장소 | 책임 |
|---|---|---|
| 수집·정규화 공통 | `research-common` | source registry client, canonical DTO, graph/feature adapters, quality gates |
| 주식 원천 | `stock-research` | 주식 collectors, briefing/candidate 원본, forecast 후보 |
| 코인 원천 | `crypto-research` | 코인 collectors, briefing/candidate 원본 |
| 중앙 DB·migration | `research-app-db` | PG18 image, schema, migration, outbox, projection builders, parity audit |
| 앱/API/Web | `stock-insight` | read-only app views/contracts, freshness/source UX, projection 소비 |
| 장기 지식 기억 | GBrain bridge | 검증된 publication/claim을 별도 PostgreSQL GBrain에 one-way ingest |
| 라이브봇 | 별도 surge/ICT 프로젝트 | 로컬 SQLite 권위원장 유지. 본 프로그램에서 수정 금지 |

## 3. Phase 13 — 운영 진실 고정과 P0 복구

### 목적

새 schema 전에 현재 pipeline이 무엇을 성공·실패했는지 정확히 말하게 만든다.

### 구현 진행 상태 — 2026-07-11 KST

- Phase 13-A 완료: graph FK introspection·detached wrapper를 수정하고 full sync 2회 idempotency를 검증했다.
- Phase 13-B 완료: publication commit과 projection pending 상태를 결합하고 재처리 가능한 feed outbox, expected-slot failure, AM/PM watchdog를 운영 반영했다.
- Phase 13-C 완료: dashboard/market-news가 72시간 초과 또는 timestamp 미상 projection을 `available`로 표시하지 않도록 API·resolver 계약을 수정했다.
- Phase 13-D 완료: stock legacy 평가 3,834행을 1:1 보존하고 interim/final, horizon-aware native dedup, mature-only score view, rollback을 운영 반영했다.
- Phase 13 통합은 아직 미완료다. machine-readable source→projection DAG, 연속 run 증거 취합, 전체 장애주입·최종 readback을 통과해야 Phase 13 전체 완료로 판정한다.

Phase 13-D 실측: legacy source count/checksum `3834 / 5dcf6586fa50722398d3eee2d9e3ad64` 불변, ledger legacy/interim `3834/3834`, final·mature score `0/0`, DB integration `105 tests` 통과, 독립 리뷰 `BLOCKER 0 / HIGH 0`.

### 작업

1. 단기 완화로 publication schedule을 briefing 완료 뒤로 이동하되, 최종 계약은 outbox trigger로 전환
2. `No matching briefing`을 expected slot에서는 실패/SLA incident로 취급
3. publication commit 뒤 feed/cache rebuild가 반드시 실행되도록 outbox dependency 추가
4. graph sync FK introspection이 `conkey`와 `confkey`를 함께 읽어 실제 참조 컬럼끼리 비교하도록 수정
5. detached graph wrapper가 child exit·summary를 scheduler 상태로 전달하도록 변경
6. `publication_records`, `market_signals`, `user_feed_index`, GBrain 검색에 실제 freshness/coverage watchdog 추가
7. market-news/dashboard가 stale feed를 행 존재만으로 `available` 처리하지 못하게 availability contract 수정
8. forecast 평가를 interim과 final로 분리하고 현재 3,834행을 legacy snapshot으로 표시
9. `(candidate_id, as_of_date)` 중복 방지와 mature-only score view 추가
10. current source→projection DAG를 machine-readable contract로 기록

### 산출물

- `ops.job_run`, `ops.dataset_watermark`, `ops.expected_output`, `ops.quality_incident` 계약
- publication/graph/feed/GBrain run별 expected/actual row 및 upstream run ID
- 기존 07:10 fixed-clock 발행 제거 또는 의존성 가드
- 평가 원장 ADR

### 완료 게이트

- 3회 연속 morning/evening에서 briefing→publication→feed가 같은 run ID로 연결
- 각 단계에 `expected_output`, `upstream_run_id`, `idempotency_key`가 기록되고 actual row readback과 일치
- 정상 기대 slot에서 silent skip 0; schedule 이동만으로 Phase 13 완료 판정 금지
- 누락을 인위적으로 주입했을 때 job이 red/alert로 종료
- graph sync full run 2회 idempotent 성공, FK/type error 0
- publication/feed/market signal freshness SLA 내
- horizon 전 row가 final performance view에 0건
- 기존 API contract 회귀 0

### 롤백

- scheduler만 이전 schedule로 되돌릴 수 있게 변경을 분리
- DB 변경은 additive table/view만 사용
- legacy 평가 view 보존

## 4. Phase 14 — PostgreSQL 18 blue/green parity 전환

### 목적

현재 schema를 먼저 그대로 PG18에 옮겨 플랫폼 변경과 데이터모델 변경을 분리한다.

### 현재 판정

**NO-GO.** 전체 DB는 Timescale chunk 포함 약 1.36GB이며, 최신 확인 dump는 약 5일 전이고 PG18 실제 restore/readback·정지시간·green-write rollback 증거가 없다. 아래 사전조건과 gate를 통과하기 전에는 실행하지 않는다.

### 사전조건

- Phase 13 완료
- 현재 PG16 image tag/digest 고정
- fresh full DB backup + globals checksum과 PG18 restore rehearsal 성공
- `public/stock/crypto/watchlist/market_ts/surge` 전체 dependency inventory 승인
- 대표 workload latency·job duration 기준선 확보
- green 첫 write 전/후의 서로 다른 rollback·RPO/RTO 승인

### 이미지 원칙

- `latest-pg18` 금지
- PostgreSQL 18.x, TimescaleDB 2.28.2 이상 호환 버전, pgvector 버전을 tag+digest로 고정
- extension package와 old/new cluster의 major compatibility를 CI에서 확인
- PG16 data volume 재사용 금지. PG18 이미지의 실제 `PGDATA`/volume mount contract를 image inspect로 확인

### 절차

1. **Inventory**
   - server/extension version, locale, timezone, roles/grants, sequences
   - hypertable 9, continuous aggregate 2, Timescale job 7
   - views, triggers, functions, FK/check/index, schema sizes
2. **Backup**
   - globals/roles와 DB logical backup 분리
   - backup checksum과 restore log 보존
3. **Green restore**
   - 빈 PG18 cluster에 extension 선설치
   - `timescaledb_pre_restore()` → `pg_restore` → `timescaledb_post_restore()`
   - Timescale 공식 지침에 따라 `pg_restore -j` 미사용
   - CAGG 내부 materialization, 압축 chunk, compression/refresh policy를 실패 1순위로 두고 별도 restore rehearsal
4. **Static parity**
   - row count, sequence next value, FK/orphan, view/function compile
   - hypertable/chunk/compression/CAGG/policy/job parity
5. **Read shadow**
   - 같은 dump snapshot을 기준으로 Stock Insight SQL을 PG16/PG18 양쪽에 실행해 canonicalized JSON diff
   - publication/feed/graph audits를 양쪽에 실행
   - green에 production dual-write를 기본 요구하지 않는다. 필요 시 별도 outbox replay/dual-write 설계와 승인을 거친다.
6. **Cutover window**
   - research_app writer·mirror만 일시 정지
   - 라이브봇 로컬 SQLite는 계속 운영
   - fresh final dump/restore 또는 승인된 change replay 후 DATABASE_URL/service endpoint 전환
   - cutover 동안 로컬 원장에 쌓인 surge/ICT mirror backlog를 idempotent replay하고 event/count/hash parity 확인
7. **Rollback hold**
   - PG16을 read-only로 보존하고 rollback TTL 동안 삭제 금지
   - green 첫 write 전에는 endpoint 원복이 가능하다. 첫 write 이후에는 단순 endpoint 원복을 금지하고, reverse sync 또는 green backup→blue restore와 parity를 수행한다.
   - 첫 green write를 명시적 point-of-no-return으로 기록하고 승인된 RPO/RTO를 적용한다.

### 완료 게이트

- table별 count와 핵심 checksum 100% 일치
- 9 hypertable, 2 CAGG, 7 job/policy 동등
- API fixture/live read diff 0 또는 승인된 timestamp 차이만 존재
- p95 read latency가 PG16 대비 허용범위 내
- restore rehearsal과 동일-snapshot read shadow에서 오류·데이터 손실 0
- 별도 dual-write를 선택한 경우에만 24시간 writer parity를 추가 적용
- pgvector extension/version, 선택 vector type DDL, sample index build/query/drop을 green에서 비파괴 smoke
- CAGG full refresh와 압축 chunk read/write 정책 rehearsal 성공; 실패 시 CAGG/policy 재수립 후 재검증
- restore와 rollback을 각각 1회 실연

### 중단 조건

- extension version mismatch
- Timescale catalog restore warning 미해결
- live-bot mirror parity 불명
- sequence/FK/view mismatch
- API contract diff

## 5. Phase 15 — canonical source·identity·bitemporal schema

### 목적

“수집한 값”이 아니라 “그 시점에 알 수 있었던 값”을 정본으로 만든다.

### 신규 schema 제안

```text
registry.*   source, license, entity, identifier, instrument, series
raw.*        observation metadata, content hash, object URI, fetch run
research.*   fact, event, claim, relation_evidence, extraction_run
features.*   feature_spec, feature_value, snapshot_manifest
publish.*    analysis_run, publication, targets, sources, outbox, projection_state
ops.*        job_run, watermark, incident, gate_result
```

기존 `stock/crypto/watchlist/public`은 transitional source/projection으로 유지하고 즉시 rename/drop하지 않는다.

### 사전조건 — source/license/credential gate

- 신규 collector·외부 API·계약 데이터는 registry 승인 전 구현·운영 적재 금지
- 각 source에 `allowed_use`, `redistribution`, `retention`, `rate_limit`, authority, SLA를 기록
- credential이 필요하면 owner, scope, rotation/revocation, 저장 위치를 승인하고 repo·로그·산출물 secret scan 통과
- 일회성 승인 key도 원문을 문서/DB/GBrain에 기록하지 않으며 작업 종료 후 폐기 확인
- 라이선스 불명·재배포 금지 source는 링크/허용 snippet/derived aggregate 범위를 명시할 때까지 decision-grade projection 제외

### 핵심 시각

| 시각 | 의미 |
|---|---|
| `occurred_at` / `period_end` | 현실에서 사건·측정이 일어난 시점 |
| `published_at` | 제공자가 공개한 시점 |
| `available_at` | 시스템이 실제 사용할 수 있게 된 시점 |
| `ingested_at` | 수집·저장 시점 |
| `valid_from/to` | 사실·관계가 현실에서 유효한 기간 |
| `system_from/to` | DB에서 해당 version을 믿었던 기간 |

구현은 단계화한다. 모든 decision-grade 행에는 먼저 `effective/period + available_at`을 강제하고, 정정·철회·재현 요구가 있는 공시·거시·관계에 `system_from/to`를 적용한다. 단순 immutable source까지 형식적 system-time을 강제해 복잡도만 늘리지 않는다.

### 작업

1. source registry에 authority/license/redistribution/SLA/rate-limit 등록
2. raw payload는 content-addressed object/Parquet에 두고 PG는 hash·URI·메타를 정본으로 보관
3. ALFRED/release calendar/filing acceptance/correction을 bitemporal event/fact로 적재
4. CIK/OpenDART corp code/MIC/ticker/chain+contract 식별자 registry 구축
5. corporate action과 ticker change를 instrument valid interval로 기록
6. `supersedes/corrects/retracts` revision chain과 파생물 invalidation ledger 구축
7. 공개시각은 `verified|bounded|unknown`으로 구분하고 `time_precision/timezone`을 보존
8. legacy `company_financials`, macro, market snapshot을 canonical fact/bar로 dual-write
9. every numeric fact에 source/unit/period/available time CHECK 또는 validator 적용
10. source/공개시각 복구 불가능 legacy 행은 임의 보정하지 않고 quarantine

### 완료 게이트

- 샘플 KR/US/crypto/macro 각각 PIT reconstruction 가능
- 수정 공시·revision의 이전/현재 version 모두 재현
- forecast cutoff 이후 공개된 row가 학습 snapshot에 0건
- source 없는 numeric available row 0
- 명시적 namespace pollution(`CRYPTO:QQQ/SPY/^VIX`)이 identifier registry로 해소되고 의미가 다른 same-name node는 보존
- 원문 hash→fact→projection 역추적 100%
- 정정·철회 이후 활성 파생 fact/edge/feature/projection 0
- decision-grade 포함 행의 source/time 상태 `unknown` 0; legacy 전체를 억지로 승격하지 않음

## 6. Phase 16 — temporal evidence graph와 pgvector

### 목적

한 행짜리 mutable edge를 근거 집합과 시간축이 있는 관계로 바꾼다.

### 모델

```text
relation_evidence
  subject_entity_id
  relation_type
  object_entity_id
  valid_from / valid_to
  observed_at / available_at
  source_observation_id / evidence_span
  assertion_type: observed|reported|derived_statistical|llm_hypothesis
  evidence_role: supporting|contradicting
  extraction_method / model_version
  confidence
  review_status: pending|approved|rejected|expired

relation_current (view/materialized projection)
  evidence aggregation + temporal decay + authority weighting
```

### 관계 등급

1. **결정적**: issuer-instrument, industry classification, 공식 ETF holding, 공시 고객/공급자
2. **통계적**: connectedness, rolling beta, lead-lag. `derived_metric`으로 저장하고 인과 관계와 분리
3. **문서 추론**: news co-mention, LLM relation extraction. 기본 pending
4. **서술 요약**: GraphRAG community/claim summary. relation 근거로 역사용 금지

### vector 설계

- 원문 chunk/claim embedding만 저장
- model ID, dimension, normalization, created_at, source observation 연결
- 3,072d Gemini를 유지하면 `halfvec(3072)` HNSW; 1,024d 이하 차원 축소/모델 대안과 recall·latency·storage benchmark 후 선택
- GBrain embedding과 research embedding을 물리 공유하지 않고 canonical source ID만 공유
- GraphRAG DB role은 feature/forecast canonical write 권한을 갖지 않으며, 응답 schema에 causal effect·target price·trade action 필드를 두지 않는다.

### migration

- SQLite signal cards를 legacy source로 import
- `source_document_id/raw_ref`가 없는 카드는 `untrusted_legacy` 격리
- 기존 edge는 provenance가 확인된 것만 approved relation evidence로 승격
- SQLite와 PG query result를 dual-run 비교

### 완료 게이트

- approved relation evidence source coverage 100%
- pending LLM edge의 자동 product 노출 0
- point-in-time graph snapshot 재현
- graph retrieval recall benchmark와 source precision 기준 통과
- SQLite/PG top-k 및 path parity 승인
- embedding backlog/freshness SLA 통과
- correction/retraction golden test에서 과거 as-of는 불변이고 이후 snapshot만 변경
- causal/prediction 유도 adversarial query에서 relation retrieval 이상의 단정 0

## 7. Phase 17 — 정량 feature·nowcast·connectedness

### 목적

LLM 설명층과 분리된 재현 가능한 정량 분석층을 만든다.

### 데이터 성숙 사전조건

- connectedness/FEVD는 사전 정의한 최소 관측기간·빈도·결측률과 stationarity/structural-break 진단을 통과하기 전 착수 금지
- 관계형 예측은 PIT entity/edge와 상장폐지 포함 universe가 준비되기 전 착수 금지
- 기준 미달이면 current heuristic와 단순 baseline만 유지하고 “모델 없음”을 정상 상태로 표시

### 17.1 baseline 먼저

- 가격/수익률: naive, seasonal, historical mean
- 후보 ranking: logistic/elastic net, tree baseline
- macro regime: current heuristic를 baseline으로 보존
- 어떤 새 모델도 baseline·transaction cost·turnover를 이기기 전 제품 승격 금지

### 17.2 macro nowcast

- FRED-MD/ALFRED vintage와 release calendar로 ragged-edge matrix 생성
- dynamic factor/state-space 모델로 현재 성장·물가·유동성 posterior 추정
- 값 하나가 아니라 posterior/interval과 revision surprise 저장
- fixed threshold regime는 비교 baseline으로만 유지

### 17.3 spillover/관계 feature

- rolling VAR FEVD connectedness
- frequency connectedness로 단기/중기/장기 구분
- 공급망·공통보유·ETF·산업 relation exposure와 결합
- 결과는 `feature_value`이며 causal relation으로 자동 승격하지 않음

### 17.4 이벤트 효과

- earnings/macro/policy event study
- staggered 정책은 Callaway–Sant'Anna/Sun–Abraham 계열 오프라인 검증
- overlap, anticipation, market model, multiple testing 기록

### 완료 게이트

- 모든 feature가 snapshot manifest와 code hash로 재생성 가능
- PIT walk-forward에서 leakage test 0
- White Reality Check 또는 Model Confidence Set로 data-snooping 통제
- horizon/regime별 incremental score와 비용 반영 성능 보고
- baseline 미개선 모델은 보류 상태 유지

## 8. Phase 18 — forecast·outcome·calibration 원장

### 목적

“예측을 냈다”와 “결과를 관찰했다”를 분리하고 독립표본으로 평가한다.

### 객체

```text
forecast
  target, horizon_end, cutoff_at, point/distribution/probability,
  model_id, feature_snapshot_id, universe_snapshot_id

forecast_mark
  forecast_id, observed_at, interim value/status

outcome
  forecast_id, matured_at, realized value, source, version, final flag

forecast_score
  forecast_id, scorer_version, Brier/log/MAE/rank metrics
```

### 작업

- 현재 3,834 evaluations는 `legacy_interim`으로 분류
- 만기 전 verdict를 UI/학습에서 final로 사용 금지
- delisted·suspended·missing outcome을 명시적으로 보존
- Brier/log score, reliability diagram, ECE 보조, rank/return metric 분리
- adaptive conformal pilot은 coverage와 interval width를 같이 평가
- adaptive conformal은 horizon/regime별 matured outcome 최소표본 계획을 사전 등록하고 충족 전 결과 생성·승격 금지
- model registry·prompt/model/data snapshot versioning

### 완료 게이트

- duplicate final outcome 0
- final score의 maturity violation 0
- universe survivorship audit 통과
- horizon/regime/market별 calibration report 생성
- model promotion은 사전 등록된 metric/gate로만 수행

## 9. Phase 19 — briefing/web 공동 publication 계약

### 목적

모양은 다르지만 근거 snapshot이 같은 제품 projection을 만든다.

### 공동 run

```text
analysis_run
  id, domain, run_type, cutoff_at, snapshot_id,
  input_watermarks, model/prompt/code versions, gate result

briefing_projection
  analysis_run_id, markdown, claims, citations, limitations

web_projection
  analysis_run_id, structured cards, relation paths, status

market_overlay
  instrument_id, quote/bar series, market_data_as_of, source/quality
```

### 작업

1. LLM/수집 호출은 DB transaction 밖에서 끝내고, 완성된 briefing persist와 publication outbox enqueue만 같은 짧은 transaction 경계에 둔다.
2. outbox consumer가 web publication/feed를 멱등 생성한다.
3. GBrain ingest는 web/briefing projection 성공 후 실행한다.
4. 모든 분석 API envelope에 `analysisRunId`, `analysisCutoffAt`, `updatedAt`, `freshness`, `sourceCoverage`, `qualityFlags`를 추가한다.
5. live quote/bar overlay는 `marketDataAsOf`와 독립 source/quality를 노출한다. 새 시세가 오래된 분석 claim을 갱신한 것처럼 표시하지 않는다.
6. dashboard/news/discover의 공통 claim이 서로 다른 분석 snapshot을 섞지 못하게 request-level snapshot을 고정한다.
7. `market_signals`/`market_ts`/canonical facts를 app-facing views로 연결한다.
8. Phase 15 완료 전에도 기존 `stock/crypto/public` schema에 최소 `analysis_run_id/cutoff/watermark` sidecar를 additive 적용해 조기 실익 트랜치를 가능하게 한다.
9. contracts에 신규 meta를 optional additive로 먼저 배포 → API dual-shape → web consumer 전환 → required 승격 순으로 호환 migration한다.

### 브리핑 계약

- 핵심 사건·시나리오·반대근거·불확실성
- 숫자는 canonical fact ID에서 렌더링
- “인과” 대신 검증 수준(관찰/통계/공식관계/가설) 표시
- source citation과 cutoff 명시

### 웹 계약

- 원시 정량 시계열과 계산식
- relation evidence path와 승인상태
- stale/collecting/error/unsupported를 섹션별 표시
- 브리핑 문장을 parsing해 숫자를 복구하지 않음

### 완료 게이트

- 7일 연속 briefing/web 공통 claim의 `analysis_run_id` 일치
- web quote overlay의 `marketDataAsOf`와 분석 cutoff가 독립적으로 정확히 표시
- projection expected/actual row mismatch 0
- API가 stale projection을 `available`로 표시하는 사례 0
- source click-through와 relation path readback 통과
- no-data fault injection에서 UI stale/error 상태 정상
- 이전 web/API client가 additive meta 기간 동안 깨지지 않고, required 승격 전 모든 consumer 전환 확인

## 10. Phase 20 — GBrain과 semantic QA 고도화

### 목적

GBrain을 정본으로 만들지 않고 검증된 연구 지식을 잘 회상하게 한다.

### 작업

- canonical publication ID와 source URI를 GBrain page frontmatter에 포함
- ingest child RC를 cron exit에 전파
- put/embed/link/query를 별도 gate로 분리
- keyword, vector, hybrid, relation traversal golden query set 구축: 질문·정답 source·관련도 라벨·reviewer 합의 프로토콜을 별도 산출물로 관리
- embedding config mismatch·link extraction lag 모니터링
- weekly regime page는 canonical facts를 복사하지 않고 publication/source 링크 중심으로 생성

### 완료 게이트

- 최신 stock/crypto page keyword/vector/hybrid 검색 모두 hit
- golden query precision@k/recall 기준 통과
- link extraction lag SLA 내
- ingest 실패가 scheduler ok로 기록되는 사례 0
- GBrain 결과가 숫자 정본으로 API에 직접 사용되는 경로 0

## 11. Phase 21 — legacy SQLite·projection 퇴출

### 대상

| 저장소 | 최종 상태 |
|---|---|
| `stock_research.db`, `crypto_research.db`, `stock_watchlist.db` | checksum 보존 cold archive 후 writer/reader 제거 |
| `signal_graph.db` | PG18 parity 완료 후 read-only archive, 운영 reader 제거 |
| orchestration checkpoint SQLite | 필요하면 유지; canonical 데이터 금지 |
| surge/ICT local SQLite | **계속 권위 원장, 퇴출 대상 아님** |
| GBrain PostgreSQL | 별도 semantic store로 유지 |

### 절차

1. 코드 전체 writer/reader inventory
2. 14일 dual-run parity
3. SQLite write deny test
4. fallback 제거
5. archive checksum·restore test
6. cron/script/spec 문서 정리
7. 30일 관찰 후 cold file 보존정책 적용

### 완료 게이트

- research canonical SQLite writes 0
- PG outage 시 조용한 SQLite fallback 0
- 모든 운영 script가 PG backend를 명시
- archived DB restore/read test 성공
- 라이브봇 원장 row·replay·mirror parity 무회귀

## 12. 데이터 도입 순서

### Wave A — 정합성

1. source/license/credential registry와 no-secret gate
2. 라이선스 가능한 KR/US canonical bar source 확정; yfinance/비공식 feed는 연구 보조·교차검증으로 강등
3. ALFRED/FRED-MD vintage
4. SEC filing acceptance/amendment + OpenDART receipt/correction
5. corporate actions/trading calendars
6. 과거 지수 구성종목·상장폐지 universe source
7. canonical bars와 identifier registry

### Wave B — 관계

1. 13F/N-PORT/ETF holding
2. 공시 고객·공급자·segment
3. UN Comtrade
4. FINRA short volume/CFTC COT
5. BIS/OECD/ECOS 확대

### Wave C — 코인·정책·사회

1. Coin Metrics core network metrics
2. exchange derivatives/OI/funding/basis
3. DefiLlama protocol facts
4. Federal Register/Congress.gov policy lifecycle
5. GDELT attention/event normalized features

### Wave D — 계약형 데이터

- OPRA/Cboe options, consensus revisions, securities lending, licensed news, commercial supply chain
- 비용·재배포·latency ROI 승인을 받은 뒤에만 도입

## 13. 검증 매트릭스

| 축 | 필수 검증 |
|---|---|
| 정본 | row/checksum/FK/sequence/view/function/trigger parity |
| 시점 | future-available row 0, revision 재현, exchange calendar 경계 |
| 식별자 | cross-market collision 0, ticker change/corporate action 재현 |
| provenance | numeric/edge/claim→source 역추적 100% |
| 모델 | PIT walk-forward, baseline, cost, multiple testing, calibration |
| GraphRAG | source precision, retrieval recall, pending edge 격리 |
| projection | 같은 run/snapshot, expected count, freshness SLA |
| API/UI | availability/freshness/source 상태, stale 혼합 방지 |
| 운영 | fault injection, retry/idempotency, alert, rollback rehearsal |
| 안전 | 주문 경로 무변경, secret scan, 라이선스·재배포 gate |

## 14. 구현 중 금지사항

- PG18 cutover와 legacy table drop을 같은 변경으로 묶기
- signal graph SQLite 삭제부터 시작하기
- GBrain DB를 research_app에 병합하기
- `latest` image tag로 production 전환하기
- GraphRAG community summary를 source로 등록하기
- LLM edge를 confidence threshold만으로 자동 승인하기
- Granger/correlation을 `causes` relation으로 저장하기
- horizon 전 outcome으로 모델 승격하기
- source 없는 숫자를 UI `available`로 표시하기
- 라이브봇 원장 또는 주문 경로를 이 프로그램에 포함하기

## 15. 우선순위와 ROI

| 우선순위 | 작업 | 직접 실익 |
|---|---|---|
| P0 | 발행 DAG·graph sync·mature evaluation | 웹 5일 지연, 가짜 성공, 무효 성과 측정 제거 |
| P1 | PG18 parity lift-and-shift | 지원기간·확장기반 확보, 이후 schema 작업의 안전한 기반 |
| P1 | bitemporal source/identity | look-ahead·revision·ticker 충돌 제거 |
| P1 | 공동 analysis run/projection | briefing과 웹의 같은 사실·다른 표현 보장 |
| P2 | temporal evidence graph/pgvector | 근거 경로·과거 graph 재현·SQLite drift 제거 |
| P2 | nowcast/connectedness/event validation | 설명을 정량적 posterior와 사후 검증으로 보강 |
| P2 | calibration/outcome ledger | “잘 맞는 모델”이 아니라 “검증된 모델”만 승격 |
| P3 | 유료·social·고급 GNN | 데이터 계약·baseline이 완성된 뒤 증분가치 확인 |

가장 큰 ROI는 새 모델이 아니라 **같은 날의 같은 사실이 브리핑과 웹에 함께 도달하고, 그 사실이 언제 공개됐으며 어떤 원문에서 왔는지 재현되는 것**이다.
