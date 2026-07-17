# Stock Insight 연구뇌 심층 감사·방법론 리서치

- 기준시각: **2026-07-11 15:23 KST**
- 범위: `stock-insight`, `research-common`, `stock-research`, `crypto-research`, `stock-watchlist`, `research-app-db`, 관련 Hermes cron/scripts, GBrain
- 성격: **설계·로드맵 전용**. 이 조사에서는 코드·DB·cron·운영 설정을 변경하지 않았다.
- 제품 경계: KR/US 주식 중심 조회형 리서치 터미널. 주문·매수/매도 지시·브로커 자격증명은 범위 밖이다.

## 1. 결론

현재 계층들은 **같은 PostgreSQL 일부를 공유하지만 하나의 연구뇌로 작동하지는 않는다.** 연결은 다음 네 수준으로 갈라져 있다.

1. 주식·코인 도메인 원본(`stock.*`, `crypto.*`)은 PostgreSQL에 당일까지 저장된다.
2. 웹 뉴스·개인 피드용 `publication_records`/`user_feed_index`는 별도 projection이며 약 5일 지연됐다.
3. 브리핑용 GraphRAG의 실질 정본은 PostgreSQL이 아니라 `signal_graph.db` SQLite와 JSON 캐시다.
4. GBrain은 최신 브리핑을 받는 별도 PostgreSQL+pgvector 지식 아카이브이지, 웹·정량분석의 계산 정본이 아니다.

따라서 목표는 물리적으로 모든 것을 한 DB에 합치는 것이 아니라 다음처럼 **논리 정본과 계약을 하나로 만드는 것**이다.

- PostgreSQL 18 + TimescaleDB: 식별자, 원문 메타, 시점 정합 사실·이벤트, 정량 시계열, 관계 근거, 분석 run의 정본
- pgvector: 근거 문서·claim의 검색 보조 인덱스. 수치 정본이나 인과 판정기가 아님
- 브리핑/Web의 **분석 claim**: 서로 다른 출력 모양을 유지하되 같은 `analysis_run_id`, `snapshot_id`, `cutoff_at`, fact/evidence ID를 소비
- Web live quote overlay: 분석 run과 분리된 `market_data_as_of`를 허용하되, 새 가격이 오래된 분석을 자동 갱신한 것처럼 보이게 하지 않음
- GBrain: 검증된 브리핑·해설의 장기 검색/회상 계층. 수치·예측 원장으로 역사용 금지
- SQLite: 라이브봇 권위원장과 일시적 checkpoint/cache만 유지. 리서치 정본·의미그래프에서는 단계적으로 퇴출

**새 예측모델보다 먼저 고쳐야 할 것**은 발행 DAG, 시점 정본, provenance, 평가원장이다. 현재 평가 데이터로 새 모델을 비교하면 좋아 보이기만 하는 결과를 만들 위험이 크다.

## 2. 조사 방법과 증거 수준

### 2.1 실측

- 운영 컨테이너의 PostgreSQL 버전·확장·스키마·hypertable·continuous aggregate·row count·freshness를 읽기 전용 조회
- SQLite `signal_graph.db`의 카드·임베딩·엔티티·엣지와 품질 게이트 실행
- Hermes cron의 실제 schedule/last run 확인
- Stock Insight API SQL read model과 수집·발행·graph sync·GBrain ingest 코드 추적
- Claude CLI, Codex CLI, Hermes Kanban 4개 완료 작업의 읽기 전용 감사와 반대검토 병행
- 학술 메타데이터는 arXiv, Crossref, 원저자/학회·저널 URL로 확인
- 공식 데이터 소스는 기관 문서·API 안내를 우선

### 2.2 한계

- 기본 `web_search` 백엔드는 조사 중 HTTP 432로 실패했다. 동일 경로 반복 대신 Firecrawl, arXiv API, Crossref, 기관·GitHub 원문 직접 조회로 전환했다.
- 별도 Hermes 서브에이전트 fan-out 3개는 모두 600초 timeout으로 요약을 반환하지 못해 증거·결론에서 제외했다.
- 유료 데이터의 실제 계약·재배포 권리는 계약서 검토 전 확정할 수 없다.
- 본 문서의 운영 수치는 기준시각의 snapshot이다. 구현 착수 전 동일 probe를 재실행해야 한다.

## 3. 현재계 실측 요약

| 항목 | 실측 | 판단 |
|---|---:|---|
| 연구 앱 DB | PostgreSQL **16.14**, TimescaleDB **2.28.2** | 사용자가 원한 PG18은 아직 미전환 |
| 컨테이너 선언 | `timescale/timescaledb:latest-pg16` | PG major는 16으로 고정되지만 minor·Timescale extension·image digest가 부동 (`research-app-db/docker-compose.yml:3-4`) |
| Timescale 객체 | hypertable 9, continuous aggregate 2, job 7 | 단순 public 스키마 DB가 아님 |
| 전체 DB 크기 | 약 **1.36 GB** | Timescale 내부 chunk 포함 실측. `surge.market_bars_evented`가 약 1.02GB로 지배적 |
| user schema parent relation 합계 | 약 **133.8 MB** | Timescale 내부 chunk를 제외한 값이므로 전체 DB 크기로 사용 금지 |
| 도메인 backend | stock/crypto/watchlist=`pg` | 도메인 SQLite는 cold archive에 가까움 (`research_common/store_backend.py`) |
| 최신 도메인 briefing | stock 약 7.0h, crypto 약 6.8h | 원본층은 당일 정상 |
| `publication_records` | 약 **119.4h** 지연 | 웹 발행 projection 정지 |
| `user_feed_index` | 약 **118.9h** 지연 | 뉴스·개인화 피드 정지 |
| PG `market_signals` | 약 **110.7h** 지연, 7,622행 | 의미그래프 projection 정지 |
| SQLite signal cards | 10,157행, embedding 7,229행(전체 71.2%) | 주식 도메인(stock+watchlist) 63.0%, stock 단독 59.1%, 코인 66.8%; 품질 기준 95% 미달 |
| graph insight cache | 약 146h stale | 주식·코인 quality gate 모두 fail |
| PG 신호 출처 FK | 7,622/7,622 `source_document_id IS NULL` | 수치→근거문서 끝단 추적 불가 |
| PG graph edges | 1,947, 빈 meta 606, inferred 73, approved 1,928 | 승인 의미와 provenance가 느슨함 |
| 회사 재무 | 25행/22종목, profile 8행 | 시점 정합 재무분석에 턱없이 부족 |
| 엔티티 오염 | `CRYPTO:QQQ/SPY/^VIX`와 대응 macro/US proxy가 공존 | entity key 전체 중복이 아니라 DDL도 오분류로 명시한 3개 namespace pollution 사례 |
| 후보 평가 | 3,834행/후보 958개, `(candidate, date)` 중복 779행 | 독립표본 수 부풀림 |
| 만기 평가 | horizon 종료 후 평가 **0건** | 3,019건에 중간 verdict가 이미 부여됨 |
| GBrain | 별도 PostgreSQL direct+pgvector, 최신 일일 페이지 존재 | CLI exact hybrid query는 성공. MCP는 `ClosedResourceError`, 일부 broad query는 0건, link extraction lag 100% |

### 3.1 오래된 문서 판단의 정정

`phase8-12-data-readiness-roadmap.md:117-127`은 cron `last_status=ok`를 발행·graph sync 정상으로 해석했다. 현재 실측은 반대다.

- cron wrapper의 종료코드 0은 **업무 산출물 성공**을 뜻하지 않는다.
- 오전 발행은 07:10에 실행되지만 주식·코인 morning briefing은 각각 약 08:14, 08:26에 저장됐다.
- 발행기는 “데이터 없음”을 skip으로 삼키고 rc 0으로 종료한다 (`~/.hermes/scripts/research_app_publish.sh:55-79`).
- graph sync의 detached wrapper도 실제 하위 작업 실패와 scheduler 상태가 분리될 수 있다.

## 4. 실제 데이터 흐름

```text
[Collectors]
  ├─ JSON/raw snapshot + ledger
  ├─ stock.* / crypto.* / watchlist.* (현재 PG direct)
  └─ signal_graph.db (SQLite semantic cards/entities/edges)

[Briefing path]
  domain tables + JSON + signal_graph.db + stale graph insight
    → pre-run context → LLM briefing
    → stock.briefings / crypto.briefings + Markdown
    → Discord
    → 09:30 GBrain one-way ingest

[Web publication path]
  stock.briefings / crypto.briefings
    → app_records/app_sources generator
    → public.publication_records
    → record_sources/targets
    → entity_reach_cache / user_feed_index / v_user_feed_dedup
    → Stock Insight API/Web

[Graph projection path]
  signal_graph.db
    → PG entities/graph_edges/market_signals
    → R1~R9 relational builders
    → entity_reach_cache / feed rebuild
```

### 4.1 브리핑과 웹의 차이는 정상, 근거 분리는 비정상

브리핑은 자연어, 웹은 차트·카드·시계열이므로 출력 schema가 달라야 한다. 그러나 현재는 **모양만 다른 것이 아니라 데이터 cutoff와 근거 ID까지 다르다.**

- 웹 dashboard는 `stock.candidates`, `stock.market_snapshots`와 `v_user_feed_dedup`을 한 SQL에서 섞는다 (`apps/api/src/dashboard/read-model.ts:90-234`).
- 뉴스는 오직 `public.v_user_feed_dedup`을 읽는다 (`apps/api/src/market-news/read-model.ts:36-82`).
- discover는 `stock.candidates`와 `entity_reach_cache`를 결합한다 (`apps/api/src/discover/read-model.ts:100-184`).
- Stock Insight API는 `market_signals`나 Timescale `market_ts.ohlcv`를 주요 read model에서 소비하지 않는다.
- 브리핑 enrichment는 PostgreSQL 공통 fact layer가 아니라 JSON·ledger·외부 함수들을 직접 읽는다 (`research_common/briefing_context.py:1-90,159-192,232-272`).

정상 목표는 `같은 형식`이 아니라 **같은 분석 snapshot과 lineage에서 파생된 서로 다른 projection**이다. 단, 웹의 현재가·장중 시계열은 별도 market-data watermark로 더 빨리 갱신할 수 있다. 이 경우 UI/API가 `analysis_cutoff_at`과 `market_data_as_of`를 동시에 노출하고, 새 가격을 근거로 오래된 thesis·관계·시나리오를 몰래 재해석하지 않아야 한다.

## 5. 핵심 결함과 위험

### P0-1. 발행 schedule 역전과 silent skip

- 오전 publication cron: 07:10
- 오후 publication cron: 16:15
- 데이터 수집: 07:40
- 주식 briefing: 08:00 job, 실제 DB 기록 약 08:14
- 코인 briefing: 08:20 job, 실제 DB 기록 약 08:26
- 저녁 briefing: 주식 21:30, 코인 21:45
- GBrain ingest: 09:30

오전·오후 발행 작업이 각각 아침·저녁 원본보다 먼저 실행돼 둘 다 skip한다. `research_app_publish.sh:8-10,63-79`는 이 상태를 정상·무출력으로 취급한다. 결과적으로 GBrain에는 오늘 briefing이 있지만 웹 publication/feed에는 없다.

스케줄만 늦춰도 충분하지 않다. 현재 daily publication sync는 publication upsert 후 feed/cache rebuild를 호출하지 않으므로 graph sync가 계속 실패하면 새 publication이 생겨도 `user_feed_index`는 갱신되지 않는다. publication commit과 feed rebuild를 같은 outbox/DAG의 후속 단계로 묶어야 한다.

**필요 불변식:** fixed clock 연쇄가 아니라 `briefing_saved → publication_built → feed_rebuilt → gbrain_ingested`의 idempotent event/outbox DAG로 전환하고, 기대된 산출물이 없으면 실패로 기록한다.

### P0-2. graph sync FK 자동가드의 타입 오류

`sync_graph_to_postgres.py:400-430`은 `entities`를 참조하는 모든 FK를 찾지만 참조 대상 컬럼(`id`인지 `entity_key`인지)을 읽지 않는다. 결과적으로 text FK도 `e.id(bigint)`와 비교한다.

```text
analysis_jobs.entity_key(text) = entities.id(bigint)
```

운영 로그에서 이 연산자 타입 오류로 transaction이 실패했다. 현재 코드는 “모든 FK 자동발견”이라는 주석과 달리 `confkey`/참조 컬럼을 매핑하지 않아 재발방지 불변식이 완성되지 않았다.

### P0-3. 평가원장이 만기 성과와 중간 관찰을 혼합

- `stock.evaluations`: 3,834행, 후보 958개
- `(candidate_id, as_of_date)` 중복: 779행
- 후보당 최대 반복: 12회
- horizon 종료 후 평가: 0행
- horizon 전인데 verdict가 붙은 행: 3,019행

`evaluate_candidates.py:240-290`은 최근 후보를 매일 가져와 오늘 가격으로 즉시 verdict를 만들며, schema에는 유일성 제약이 없다 (`stock_research_store.py:88-107`). 따라서 현재 win rate/n은 최종 독립성과가 아니다.

**필요 불변식:** forecast, interim mark, matured outcome, score를 별도 원장으로 분리하고 `(forecast_id, horizon_end, outcome_version)`을 유일하게 만든다.

### P1-1. GraphRAG는 인과·예측 엔진이 아님

현재 signal graph는 카드 임베딩 검색, 2-hop 이웃, LLM 설명 합성에 가깝다. quality gate도 embedding coverage, stale insight, macro reach, crypto hygiene, orphan만 본다 (`research_common/quality_gate.py:17-24,167-204`).

할 수 있는 것:
- 관련 근거 검색
- 관계 경로 설명
- 여러 문서의 주제 요약

할 수 없는 것:
- 정책/뉴스가 가격을 **원인으로** 움직였다는 판정
- 수익률 예측의 통계적 유의성 보장
- revision/look-ahead가 제거된 point-in-time backtest

### P1-2. 관계가 근거가 아니라 mutable edge 한 행

현 `edges`는 `(src,dst,edge_type)` 하나에 weight/meta를 덮어쓴다 (`signal_graph_store.py:58-69`). `valid_from/to`, evidence ID, source span, extraction model/version, review history가 없다. 관계의 발견 증거와 현재 유효 관계를 분리하지 않으면 과거 시점 그래프를 재현할 수 없다.

### P1-3. source lineage 단절

PG `market_signals` 전량이 `source_document_id` 없이 존재하고 `raw_ref`도 7,390/7,622건이 비어 있다. SQLite signal card도 9,735/10,157건에 `raw_ref`가 없다. `publication_records.published_at` 416/416건도 NULL이다. 숫자나 graph edge가 웹 카드에 도달해도 “어떤 원문·어떤 공개시각·어떤 수집 run·어떤 변환 코드”인지 끝까지 추적할 수 없다. 복구 불가능한 legacy 행에 파일 mtime/created_at을 공개시각처럼 소급 대입하지 말고 `unknown/untrusted_legacy`로 격리해야 한다.

### P1-4. 식별자 모델 부족

`entity_key`와 ticker 문자열이 사실상 정체성이다. `entity_key` 자체와 같은 entity type/market의 normalized symbol은 고유하지만, `CRYPTO:QQQ/SPY/^VIX` 3건은 대응 macro/US proxy와 함께 존재하며 기존 정리 DDL도 오분류로 명시한다. KR ticker와 DART org처럼 역할이 다른 same-name node까지 전부 “중복”으로 합치면 안 된다. 목표 식별자는 다음을 분리해야 한다.

- issuer/company: CIK, OpenDART corp code, LEI 등
- listed instrument: exchange MIC + local ticker + currency + valid interval
- crypto asset: chain ID + contract address, native asset 여부
- macro series: source namespace + series ID + frequency/unit
- theme/concept: 내부 ontology ID

### P1-5. GBrain 역할과 건강상태

GBrain ingest는 briefing을 `gbrain put`한 후 embed하고 explicit link를 만든다 (`gbrain_research_ingest.py:458-568`). 이는 **후행 아카이브**다. Stock Insight나 briefing generator가 GBrain을 다시 읽는 운영 배선은 없다.

또한 cron wrapper는 내부 RC가 실패여도 마지막에 항상 0을 반환한다 (`gbrain_daily_ingest_cron.sh:11-19`). 독립 재검증에서 CLI exact hybrid query는 최신 stock page를 정상 반환했으므로 “GBrain hybrid 검색 전체 실패”로 일반화하면 안 된다. 다만 이 조사 세션의 MCP query/get_stats는 `ClosedResourceError`, 일부 broad CLI query는 0건이었고 doctor는 link extraction lag 100%를 표시했다. 따라서 **저장·embedding·keyword/vector/hybrid golden query·MCP transport·link extraction을 각각** 측정해야 한다.

## 6. 목표 연구뇌: 7개 논리층

```text
L0 Source & Identity Registry
   source license/SLA, canonical entity/instrument/series identifiers

L1 Immutable Evidence
   raw object hash/URI, source document, release/filing metadata, fetched_at

L2 Bitemporal Facts & Events
   valid time + available time + system time, revisions/supersession

L3 Temporal Evidence Graph
   relation evidence rows → reviewed/aggregated relation views

L4 Quant Feature & Nowcast
   Timescale bars, PIT feature values, regime posterior, connectedness

L5 Analysis & Evaluation
   hypothesis/forecast, model+data snapshot, maturity/outcome, calibration

L6 Product Projections
   one analysis run → briefing projection + web projection + outbox/watermark

L7 Semantic Memory
   pgvector retrieval + GBrain curated archive; never numeric SoT
```

### 6.1 최소 canonical 객체

| 객체 | 필수 필드 |
|---|---|
| `source_registry` | provider, source_type, authority, license, redistribution, rate_limit, SLA |
| `raw_observation` | source_event_id, content_hash, raw_uri, published_at, publication_time_status, time_precision/timezone, fetched_at, available_at, parser_version |
| `entity` / `entity_identifier` | canonical UUID, scheme, value, valid_from/to, confidence, review_status |
| `instrument` | issuer_id, MIC, ticker, currency, asset type, valid interval, corporate-action lineage |
| `fact` | subject, predicate, typed value, unit, period, valid/system interval, available_at, source_observation_id, supersession/retraction |
| `event` | event_type, occurred interval·precision, announced/effective/available timestamps, jurisdiction, surprise/revision |
| `relation_evidence` | subject/object/type, assertion type, valid/system interval, supporting/contradicting source span, method/model version, confidence, review status |
| `feature_value` | feature spec/version, entity, feature_time, cutoff_at, value, lineage, code hash |
| `forecast` | target, horizon, distribution/probability, cutoff_at, snapshot/model/version |
| `outcome` | forecast_id, matured_at, realized value, source/version, final/interim 구분 |
| `analysis_run` | cutoff_at, snapshot_id, input watermarks, model/prompt/code versions, gate result |
| `projection_state` | projection, analysis_run_id, watermark, expected/actual count, freshness SLA |

### 6.2 하드 불변식

1. forecast·backtest 입력은 `available_at <= cutoff_at`인 행만 사용한다.
2. 모든 숫자형 fact는 source, unit, period, available time을 가진다.
3. 모든 graph relation은 하나 이상의 `relation_evidence`를 가진다.
4. LLM 추출 relation은 기본 `pending`; 자동 `approved` 금지.
5. briefing과 web의 공통 분석 claim은 같은 `analysis_run_id/snapshot_id`를 가진다. live quote overlay는 독립 watermark를 가진다.
6. horizon 전 관찰은 `interim`; 최종 score 집계 금지.
7. GBrain page와 graph community summary는 원문 source를 대체하지 못한다.
8. 기대된 publication이 없으면 skip이 아니라 SLA incident다.
9. 연구 canonical write가 PG로 전환된 뒤 SQLite fallback을 금지한다.
10. 라이선스상 재배포 불가 원문은 hash/URI/짧은 허용 snippet만 보관·노출한다.
11. 공개시각·source lineage를 복구할 수 없는 legacy 행은 임의 timestamp로 보정하지 않고 decision-grade projection에서 제외한다.
12. source 정정·철회는 fact/edge/feature/projection/GBrain archive까지 dependency invalidation을 전파한다.

## 7. 방법론 채택 매트릭스

| 방법 | 담당 질문 | 판정 | 적용 조건·한계 |
|---|---|---|---|
| Dynamic factor / ragged-edge nowcasting | 현재 거시상태와 미발표 구간 추정 | **채택** | ALFRED vintage·release calendar 필수. 최신값으로 과거를 재구성하면 무효 |
| Event study | 특정 발표 전후 비정상 수익·거래량 | **채택(사후 검증)** | 겹친 이벤트, 예상/비예상, 시장모형, multiple testing 통제 |
| Staggered DiD | 정책·규제의 이질적 사후 효과 | **채택(오프라인)** | parallel trend와 treatment timing 검증. 실시간 인과 라벨로 사용 금지 |
| VAR FEVD connectedness | 금리·FX·주식·코인 충격 전이 | **파일럿** | 정상성·창 길이·ordering·구조변화 민감. 인과 edge가 아니라 spillover feature |
| Frequency connectedness | 단기/중기/장기 전이 분리 | **파일럿** | 충분한 시계열과 안정적 샘플 필요 |
| Temporal evidence graph | 관계의 유효기간·증거 변화 | **채택(데이터 모델)** | learned TKG보다 먼저 deterministic/evidence graph 완성 |
| GraphRAG | 관계·근거 탐색, global/local 요약 | **제한 채택** | 설명·검색 전용. causal/forecast score 산출 금지 |
| Relational ranking/GNN | 기업관계가 순위예측에 주는 증분 | **후순위 파일럿** | PIT 관계·delisted universe·walk-forward가 먼저. 단순 baseline을 이겨야 함 |
| LLM event/claim extraction | 문서→구조화 사건·주장 후보 | **파일럿** | ontology constrained JSON, evidence span, confidence, review queue 필수 |
| Multimodal temporal RAG | 표·공시·뉴스·시계열 질의응답 | **파일럿** | 설명/QA benchmark부터. 가격예측 성능 주장은 별도 검증 |
| Proper scores + calibration | 확률예측 품질 | **즉시 채택** | Brier/log score, reliability, horizon/regime별 calibration |
| Adaptive conformal | 분포변화 하 예측구간 | **파일럿** | exchangeability 완화일 뿐 regime break를 해결하지 않음; coverage/width 함께 측정 |
| Granger/transfer entropy/causal discovery | 선행·정보흐름 가설 생성 | **보류/탐색** | confounding·비정상성·다중검정 때문에 canonical 인과 edge 자동생성 금지 |
| Social sentiment 단독 예측 | 군중심리→가격 방향 | **보류** | 플랫폼 편향·봇·API 약관·survivorship. attention/dispersion 보조지표로만 사용 |

### 7.1 방법론 원문

- Edge et al. (2024), **From Local to Global: A Graph RAG Approach to Query-Focused Summarization** — <https://arxiv.org/abs/2404.16130>
- Giannone, Reichlin, Small (2008), **Nowcasting: The real-time informational content of macroeconomic data** — <https://doi.org/10.1016/j.jmoneco.2008.05.010>
- McCracken, Ng (2016), **FRED-MD: A Monthly Database for Macroeconomic Research** — <https://doi.org/10.1080/07350015.2015.1086655>
- Diebold, Yilmaz (2014), **On the network topology of variance decompositions** — <https://doi.org/10.1016/j.jeconom.2014.04.012>
- Baruník, Křehlík (2018), **Measuring the Frequency Dynamics of Financial Connectedness and Systemic Risk** — <https://doi.org/10.1093/jjfinec/nby001>
- Billio et al. (2012), **Econometric measures of connectedness and systemic risk** — <https://doi.org/10.1016/j.jfineco.2011.12.010>
- Feng et al. (2019), **Temporal Relational Ranking for Stock Prediction** — <https://doi.org/10.1145/3309547>, <https://arxiv.org/abs/1809.09441>
- Anton, Polk (2014), **Connected Stocks** — <https://doi.org/10.1111/jofi.12149>
- Cohen, Frazzini (2008), **Economic Links and Predictable Returns** — <https://doi.org/10.1111/j.1540-6261.2008.01379.x>
- Callaway, Sant'Anna (2021), **Difference-in-Differences with Multiple Time Periods** — <https://doi.org/10.1016/j.jeconom.2020.12.001>
- Sun, Abraham (2021), **Estimating dynamic treatment effects in event studies with heterogeneous treatment effects** — <https://doi.org/10.1016/j.jeconom.2020.09.006>
- Chernozhukov et al. (2018), **Double/debiased machine learning** — <https://doi.org/10.1111/ectj.12097>
- Gneiting, Raftery (2007), **Strictly Proper Scoring Rules, Prediction, and Estimation** — <https://doi.org/10.1198/016214506000001437>
- Gibbs, Candès (2021), **Adaptive Conformal Inference Under Distribution Shift** — <https://arxiv.org/abs/2106.00170>
- White (2000), **A Reality Check for Data Snooping** — <https://doi.org/10.1111/1468-0262.00152>
- Hansen, Lunde, Nason (2011), **The Model Confidence Set** — <https://doi.org/10.3982/ecta5771>
- Chen et al. (2021), **FinQA** — <https://doi.org/10.18653/v1/2021.emnlp-main.300>
- FinTMMBench (2025 preprint) — <https://arxiv.org/abs/2503.05185>
- FinMultiTime (2025 preprint) — <https://arxiv.org/abs/2506.05019>
- Time-MMD (NeurIPS 2024 dataset/benchmark) — <https://openreview.net/forum?id=fuD0h4R1IL>

최근 preprint는 아이디어·benchmark 후보이지 production 근거로 승격하지 않는다.

## 8. 데이터 보강 우선순위

현재는 소스 수보다 **시점·revision·식별자·라이선스**가 더 부족하다.

### Must — 정본 완성 전 필수

| 데이터 | 목적 | 핵심 계약 |
|---|---|---|
| ALFRED/FRED-MD vintage | macro nowcast·look-ahead 방지 | observation date, release/vintage date, revision |
| BLS/BEA/Fed/BOK ECOS release calendar | 발표 surprise와 first release | scheduled/actual release time, first/revised value |
| SEC EDGAR submissions/companyfacts + filing acceptance | US 재무·공시 PIT | CIK, accession, accepted_at, period, amendment/restatement |
| OpenDART 공시·XBRL | KR 재무·이벤트 PIT | corp code, receipt no/date, report period, corrected filing |
| 거래소 calendar·corporate action | 가격 정본 | MIC, session, split/dividend/delisting, adjustment version |
| 라이선스 가능한 canonical bars | web·briefing·backtest 공동 수치 | instrument_id, ts, source, allowed use/redistribution, available_at, adjustment version |
| 과거 universe·상장폐지 | survivorship 없는 평가 | index membership valid interval, listing/delisting reason/date, inactive instrument 보존 |
| source/license registry | 재배포·품질 | authority, allowed use, retention, SLA, rate limit |
| forecast maturity ledger | 모델 비교 | cutoff, horizon_end, interim/final, outcome version |

### Should — 관계·전이 분석 강화

- SEC 13F/N-PORT, ETF holdings: 기관·공통보유 관계. 공시 지연을 관계 `available_at`에 반영
- FINRA short volume, CFTC COT: 수급·포지셔닝. short volume을 short interest로 오해하지 않음
- BIS/OECD SDMX: 글로벌 신용·은행·선행 지표
- UN Comtrade: 국가/품목 공급망. 월/연 지연과 revision 고려
- Federal Register/Congress.gov: 정책 제안→규칙→시행 lifecycle
- 기업 공시의 고객/공급자·segment: 관계 근거 span 보존
- Coin Metrics Community + 거래소 파생 + DefiLlama: on-chain/market/protocol 지표를 분리

### Later / 유료·계약 필요

- OPRA/Cboe options full history, consensus estimate/revision, securities lending/borrow, proprietary supply-chain, licensed full-text news
- ACLED 등 정치·분쟁 데이터: 라이선스와 재배포 조건 확인 전 원문 저장 금지
- X/Reddit/StockTwits: 방향예측보다 attention·dispersion 보조변수로 제한

### 이미 쓰는 소스의 승격 제한

| 소스/신호 | 잘못 쓰기 쉬운 방식 | canonical 승격 조건 |
|---|---|---|
| FRED/BLS 최신값 | 현재 수정값으로 과거 판단을 재구성 | ALFRED vintage 또는 first-release snapshot과 release timestamp 보존 |
| World Bank 연간 지표 | 일일 시장 timing feature로 사용 | 구조적 배경 변수로만 사용하고 저빈도·공표지연 표시 |
| yfinance/pykrx | 단일 production 가격 정본 | 공식/계약 소스와 교차검증, provider·수집시각·adjustment version 보존 |
| GDELT | 기사량 증가를 현실 사건·인과로 단정 | 전체 보도량 대비 정규화, 언어/지역/source coverage bias, 원문 교차확인 |
| Polymarket | 확률을 객관적 정책 가능성으로 단정 | liquidity·volume·spread·resolution criteria·관측시각과 함께 보조 feature로만 사용 |
| 13F/N-PORT | 현재 기관 포지션으로 해석 | filing/available delay를 관계 유효시점에 반영하고 현재 보유로 단정 금지 |
| FINRA short volume | short interest로 해석 | 데이터 정의를 별도 보존하고 총 거래량·venue coverage와 함께 사용 |
| StockTwits/X/Reddit | 감성을 가격 방향의 원인으로 저장 | bot/표본/API 약관 검토 후 attention·dispersion signal로만 저장 |
| 거래소별 crypto 지표 | 한 거래소 값을 시장 전체로 일반화 | venue ID, 계약명세, timestamp, cross-venue dispersion과 함께 저장 |
| SEC/DART 공시 | 최초 제출과 정정본을 한 행으로 덮어쓰기 | accession/receipt, accepted_at, amendment/correction, supersession 보존 |

### 공식 소스 예시

- ALFRED/FRED API: <https://fred.stlouisfed.org/docs/api/fred/>
- SEC API: <https://www.sec.gov/search-filings/edgar-application-programming-interfaces>
- SEC 13F data sets: <https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets>
- OpenDART: <https://engopendart.fss.or.kr/guide/main.do?apiGrpCd=DE003>
- BIS SDMX: <https://stats.bis.org/api-doc/v1/>
- OECD SDMX: <https://www.oecd.org/en/data/insights/data-explainers/2024/09/api.html>
- CFTC COT: <https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm>
- FINRA short sale volume: <https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data/daily-short-sale-volume-files>
- GDELT: <https://www.gdeltproject.org/data.html>
- Federal Register API: <https://www.federalregister.gov/developers/documentation/api/v1>
- Congress.gov API: <https://api.congress.gov/>
- UN Comtrade: <https://comtradedeveloper.un.org/>
- Coin Metrics Community API: <https://docs.coinmetrics.io/api/v4/>
- DefiLlama API: <https://api-docs.defillama.com/>

## 9. PostgreSQL 18 전환 원칙

### 9.1 현재 호환성

- TimescaleDB 2.28.2 릴리스는 PostgreSQL 15~18을 지원한다.
- pgvector 최신 계열은 PostgreSQL 18 패키지를 제공한다.
- 현재 3,072차원 Gemini embedding을 HNSW로 인덱싱하려면 `vector`의 2,000차원 index 한계를 넘으므로 `halfvec(3072)` 또는 모델/차원 재선택이 필요하다. pgvector HNSW는 halfvec 최대 4,000차원을 지원한다.

원문:
- PostgreSQL 18 release: <https://www.postgresql.org/docs/release/18.0/>
- TimescaleDB releases: <https://github.com/timescale/timescaledb/releases>
- Timescale major upgrade: <https://www.tigerdata.com/docs/self-hosted/latest/upgrades/upgrade-pg>
- Timescale logical backup/restore: <https://www.tigerdata.com/docs/self-hosted/latest/backup-and-restore/logical-backup>
- pgvector: <https://github.com/pgvector/pgvector>

### 9.2 결론

**major upgrade와 연구뇌 schema 재작성은 한 cutover에서 하지 않는다.**

1. PG16에서 P0 운영장애와 parity probe를 먼저 고정
2. PG18로 동일 schema를 blue/green lift-and-shift
3. PG18 안정화 후 canonical bitemporal schema를 additive 생성
4. legacy→canonical dual-run과 shadow read
5. web/briefing projection 전환
6. signal graph SQLite 퇴출

현재 DB는 Timescale 내부 chunk 포함 약 1.36GB로 여전히 짧은 점검창 dump/restore를 우선 검토할 규모다. 기본안은 pinned PG18/Timescale/pgvector 이미지에 `pg_dump/pg_restore` blue-green 복원이다. Timescale 공식 절차의 `timescaledb_pre_restore()`/`timescaledb_post_restore()`를 사용하고 `pg_restore -j`는 사용하지 않는다. RTO가 실제로 요구될 때만 더 복잡한 논리복제를 검토한다.

**현재 실행 판정은 NO-GO다.** 최신 확인 backup은 약 5일 전이고 PG18 실제 restore/readback 증거가 없으며 `archive_mode=off`다. fresh full backup+globals, PG18 isolated restore, exact parity, 정지시간, green 첫 write 이후 rollback/RPO를 실연하기 전에는 전환을 승인하지 않는다.

### 9.3 절대 건드리지 않을 경계

- `surge`/ICT 라이브봇의 로컬 SQLite 원장은 계속 권위 원장이다.
- PG의 `surge`·`market_ts`는 mirror/evented analytics 계층으로 취급하고 별도 parity gate를 둔다.
- GBrain의 별도 PostgreSQL을 research_app에 물리 병합하지 않는다.
- 기존 PG16 data directory를 PG18 컨테이너에 직접 마운트하지 않는다.

## 10. 기각하는 접근

1. **GraphRAG=인과추론/가격예측**으로 간주
2. LLM이 만든 관계를 evidence 없이 자동 승인
3. 최신 FRED/재무값으로 과거를 재구성
4. PG18 major upgrade와 destructive schema migration을 동시에 실행
5. 모든 저장소를 물리적으로 한 PostgreSQL에 병합
6. social sentiment·상관·Granger 결과를 canonical causal edge로 저장
7. 고정 가중치 stock score를 검증 없이 제품 점수로 노출
8. cron rc=0을 업무 성공으로 해석
9. 만기 전 verdict를 최종 성과로 집계
10. 현재 SQLite signal graph를 영구 SoT로 유지하면서 PG projection drift를 감수

## 11. 구현 판단

이 조사에서 코드·DB·cron·설정은 변경하지 않았다. 구현 순서는 별도 문서 [`stock_insight_research_brain_rebuild_roadmap_2026-07-11.md`](./stock_insight_research_brain_rebuild_roadmap_2026-07-11.md)에 정의한다.
