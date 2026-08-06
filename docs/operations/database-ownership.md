# research_app 데이터베이스 소유권 지도

`research_app` PostgreSQL 은 이 저장소만의 것이 아니다. 네 프로젝트가 같은
데이터베이스를 공유하고, 각자 자기 마이그레이션과 스케줄로 쓴다. 이 문서가
없으면 남의 테이블을 "우리가 버린 것"으로 읽거나, 남이 이미 하는 일을 "우리가
해야 할 결정"으로 세우게 된다. 2026-08-03 조사에서 실제로 세 번 그랬다.

## 프로젝트

| 프로젝트 | 위치 | 실행 |
| --- | --- | --- |
| **stock-insight** | `~/.hermes/workspace/stock-insight` | `ops/systemd/user/*.timer` |
| **research-app-db** | `~/hermes-work/research-app-db` | `~/.hermes/scripts/research_app_publish.sh` |
| **research-common** | `~/.hermes/workspace/research-common` | `scripts/run_collectors.py` |
| **crypto-research** | `~/.hermes/workspace/crypto-research` | `scripts/ingest_crypto_market_ts.py` |

## 스키마 소유

### stock-insight (이 저장소)

`analytics` · `knowledge` · `world` · `governance` · `ingestion` · `serving`
· `personalization` · `content` · `core` · `crypto_identity` · `crypto_truth`
· `crypto_analytics` · `crypto_serving` · `cross_domain` · `geo` · `market`

### research-app-db — 발행·브리핑

`ops` 스키마의 다음 테이블들. 스키마 전체가 아니라 테이블 단위로 갈린다.

```
ops.publication_identity_registry   ops.publication_record_revision
ops.expected_output                 ops.entity_alias_ledger
ops.entity_alias_resolution         ops.job_run
ops.analysis_run_contract           ops.analysis_run_revision
ops.forecast_outcome_ledger         ops.forecast_first_mature_outcome
ops.temporal_graph_edge_closure     ops.model_registry
ops.pipeline_edge                   ops.gbrain_ingest_proof
ops.source_collection_policy        ops.source_collection_policy_revision
ops.stock_prediction_loop_runs
```

### research-common — 수집기·시그널 그래프

레거시 스키마를 `search_path` 로 잡아 쓴다: `stock, public` / `crypto, public`
/ `watchlist, public`. SQL 에 스키마명이 없으므로 스키마 한정 grep 으로는 안
잡힌다. 한정 참조는 `quality.events` · `quality.runs` · `market_ts.ohlcv`.

### crypto-research — 크립토 파생 시계열

`market_ts.funding` · `market_ts.open_interest`.
Binance(`exchange='binance'`, `source_id='binance_funding'`) 와 Deribit 에서
수집한다. `research_common/scripts/run_collectors.py` 가 호출하지만 적재 코드는
crypto-research 에 있다.

### 공유

`market_ts.ohlcv` — **양쪽이 쓴다.** 이 문서는 오래도록 "research-common 이 쓰고
stock-insight 가 읽는다" 로 적혀 있었는데 **틀렸다.** `run-ohlcv.ts:147` 이 INSERT
한다. 2026-08-07 실측:

```
소유자     postgres (공유)
source_id='ict-bot'    2,364,041행  exchange=bitget · 심볼 4 · 2023-01-01~2026-06-28
                                    research-common/scripts/migrate_ict_candles_to_pg.py
source_id='yfinance'     299,619행  exchange=KOSPI/KOSDAQ/US · 심볼 332 · 1D
                                    ← 우리 것. apps/api/src/ingest/run-ohlcv.ts
(exchange,symbol,timeframe) 교집합        0
```

**둘은 exchange 로 갈리고 한 번도 겹친 적이 없다.** 그 분리가 하중을 받고 있는데
아무것도 강제하지 않고 있었다 — 우리 UPSERT 의 conflict target 이
`(exchange,symbol,timeframe,ts)` 이고 **`source_id` 가 없다.** 저쪽 키 공간에 한 행만
들어가도 저쪽 행을 덮어쓰면서 `source_id` 까지 우리 것으로 바꾼다.

`verify-table-ownership.sh` 는 이것을 못 잡는다. 그 스크립트는 표 이름을 grep 하는데
이 표는 **양쪽이 정당하게 쓰는** 표라서 이름만으로는 위반과 정상을 구분할 수 없다.
그래서 교집합이 0 이라는 불변조건을 `run_ohlcv_daily.sh` 의 DB 단언에 넣었다(1.9초).
스크립트 쪽에는 이 쓰기를 **선언**해 두어, 선언이 사라지면 STALE_ALLOWANCE 로 걸리게 했다.

## stock-insight 가 남의 테이블에 쓰는 곳

`ops.source_collection_policy` 하나뿐이다. 마이그레이션 058 이 sec-edgar 와
finra 를 등록한다. 경계를 모른 채 한 일이지만 되돌리지 않는다:

- research-app-db 는 이 테이블을 `phase17_maturity_gate.py` 에서
  `source_documents.provider_key` 에 정책 행이 **없는 개수** 를 세는 데 쓴다.
  행이 늘면 그 수는 줄어들 뿐이라 그쪽 게이트를 깨뜨리지 않는다.
- stock-insight 의 수집 거버넌스 기록(약관 판단, `decision_reason`)이 여기
  들어 있어 지우면 우리 지표가 깨진다.

`ops/scripts/verify-table-ownership.sh` 가 이 하나를 명시적 예외로 두고,
새로운 교차 쓰기가 생기면 실패한다.

## stock-insight 소유이면서 아무도 읽지 않는 것

2026-08-03 기준. 전부 마이그레이션이 심고 그 뒤 손대지 않은 것들이다.

| 테이블 | 행 | 비고 |
| --- | ---: | --- |
| `analytics.theme_membership` | 396 | 종목 198개, `rationale_relation_ids` 로 근거 보유 |
| `analytics.theme` | 138 | `THEME:ev` 34 · `ai_semi` 31 · `battery` 19 |
| `core.security_master` | 297 | + `security_listing_revision`, `security_ticker_history` |
| `knowledge.ontology_rfc` | 22 | + `ontology_revision` |
| `analytics.impact_channel` | 17 | |
| `serving.truth_geo_serving_manifest` | 8 | |
| `analytics.meta_path_policy` | 4 | |

테마 두 테이블이 가장 값어치가 크다. 사건을 테마로 분류하는 코드만 붙이면,
기업 이름이 본문에 없는 시장 뉴스도 테마를 거쳐 종목에 닿는다.

## 조사할 때 틀리기 쉬운 것

1. **`pg_stat_user_tables.n_live_tup` 은 추정치다.** `analytics.theme` 이
   138행인데 0으로 나온다. 소유권 판단에는 `count(*)` 를 써야 한다.
2. **단어 매칭은 소유 증거가 아니다.** `theme` 으로 grep 하면 research-common 의
   SQLite 테이블과 `theme:crypto` 라는 문자열 라벨이 걸린다. 스키마 한정 참조나
   실제 INSERT 를 봐야 한다.
3. **`search_path` 를 쓰는 프로젝트는 스키마 한정 grep 에 안 잡힌다.**
   research-common 이 그렇다. 그 프로젝트의 `_SEARCH_PATH` 를 먼저 읽어야 한다.
4. **마이그레이션만 참조하는 테이블은 런타임 grep 에서 0 으로 보인다.** 둘을
   나눠 세야 "버려진 것" 과 "스키마만 있는 것" 이 구분된다.
