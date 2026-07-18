# 01 — 현재 ↔ 목표 갭 상세 매핑

> Baseline: `../stock-crypto-insight-platform-architecture.md` §5~§6 (목표 아키텍처·논리 데이터 계층)
> 실측: 2026-07-18 03:53 KST, research-app-postgres/research_app, `master@7034d77`, BEGIN READ ONLY
> 목적: Baseline의 9개 스키마 각각에 대해 "현재 무엇이 있고, 무엇이 없고, 무엇을 이관하는가"를 확정

---

## 1. ingestion ← 현재 수집 계층

### 있음

| 현재 자산 | 실측 | Baseline 대응 |
|---|---|---|
| `public.source_documents` | 2,826건 (url 44.2%, summary 767, title_ko 121, summary_ko 0) | `knowledge.document`의 전신 |
| `ops.source_document_revision` | 5,028 revision (content_hash·known_at·revision_no) | document 버전 관리의 전신 |
| `ops.source_collection_policy(+revision)` | 15 provider (license/redistribution/enforcement) | Source Contract의 라이선스 부분 |
| `public.migration_runs` | rss 30분 주기, yfinance/opendart/sec-edgar 일 배치 정상 | fetch_run의 전신 |
| `stock.data_collection_runs` | 'all' 러너 126회 정상, 개별 collector 5/3 이후 정지 | 〃 |
| systemd user timer + flock(exit 75) | news/ohlcv/fundamentals 3종 | 크론 트리거 계층 |

### 없음 (Baseline §7 요구)

- **원본 객체 저장소**: raw HTML/PDF/API 응답 원본 보존 없음 → PG에 요약 메타만 존재
- **Source Contract**: 수집 주기·지연 허용치·필수 필드·품질 기대치가 문서·테이블 어디에도 없음 (라이선스 정책만 존재)
- rss:* provider 27+ 건이 policy 미등록 (UNREGISTERED)
- 워터마크: `ops.dataset_watermark`가 발행 3종뿐 (ohlcv/재무/뉴스/신호/그래프 미계측)
- 지연 데이터 정책(§7.4): 컷오프 후 도착분 처리 규약 없음

### 이관 결정

- `source_documents` + `source_document_revision` → Wave 2에서 `knowledge.document`로 승격 (스키마 호환: content_hash·observed_at 이미 존재, raw_object_uri만 신규)
- `migration_runs`/`data_collection_runs` → `ingestion.fetch_run`으로 통합 (둘의 필드 합집합)
- `source_collection_policy` → `ingestion.source` + `source_contract`로 확장

## 2. core ← 현재 entities

### 있음

- `public.entities`: ticker KR 151 / US 102, theme/macro 엔티티 일부

### 없음

- 회사(LegalEntity) / 발행증권(Stock) / 상장(listing) 분리 — 현재 ticker 문자열이 곧 정체성
- `entity_identifier` (CIK, OpenDART corp code, MIC, ISIN, chain+contract) — 없음
- `entity_alias` (한/영 명칭, 구명칭) — 없음
- 상장폐지·ticker 변경 이력 — 없음 (survivorship 취약)
- 코인: Token/Protocol/Blockchain 엔티티 체계 미정비 (crypto 도메인은 briefing 위주)
- 과거 감사에서 확인된 namespace 오염(`CRYPTO:QQQ/SPY/^VIX`) 해소 미완

### 이관 결정

- Baseline §6.1 DDL 그대로 채택. `public.entities`는 `core.entity`로 매핑 백필 후 view 호환 유지
- entity_type 어휘: Baseline의 20종 채택 (Company, Stock, ETF, Token, Protocol, Blockchain, Exchange, Product, Technology, Industry, Theme, Country, Person, Fund, Wallet, Commodity, Metric, Regulation, RiskFactor, LegalEntity)

## 3. knowledge ← 현재 신호·그래프

### 있음

| 현재 | 실측 | 문제 |
|---|---|---|
| `public.market_signals` | 13,269건 | source_document_id 0건, raw_json 유효 0건 → 근거 추적 불가 |
| `ops.temporal_graph_edge(+current view)` | current 3,318 (approved·not inferred) | valid/known 시간축은 있음 (재사용 가치 높음) |
| `ops.graph_evidence` | 25,332건 | 전량 source_key NULL, payload는 edge 메타 복사 → Baseline evidence 요건 미달 |
| `ops.evidence_embedding` | 0건 | 벡터 검색 불가 |
| `news_comention_obs` 등 R-빌더 산출 | 6/29 이후 정지 | 스테일 |

### 없음

- `document_chunk`(+embedding), `claim`, `event` 테이블 자체가 없음
- claim_type 구분 (`asserted_fact/reported_claim/forecast/guidance/rumor/...`) 없음 — 현재 신호는 전부 동급
- NLI 검증·cross-source corroboration·모순 보존(`contradicts`) 없음
- Hypothesis Queue / Quarantine 없음

### 이관 결정

- `market_signals` → Wave 2에서 3분류: ①문서 링크 복구 가능 → `knowledge.event`/`claim`, ②수치성 신호 → `analytics` feature 입력, ③불가 → `untrusted_legacy` 격리
- `temporal_graph_edge` → Wave 3에서 `knowledge.relation`으로 이관 (bitemporal 필드 호환)
- `graph_evidence` → 재구축. 문서 span 연결 가능한 것만 `relation_evidence` 승격, 나머지 격리 (기존 25,332건을 근거 수로 세지 않음)

## 4. market ← 현재 시계열·재무

### 있음

| 현재 | 실측 |
|---|---|
| `market_ts.ohlcv` | 63,109 bars / 256 symbols / 1D (KR 151 + US 101) — hypertable |
| `stock.market_snapshots` | single_stock US 24,537 / market_proxy KR·US / 진단행 1,479 혼입 |
| `stock.macro_observations` | 10,251건 (KR 100 + US 21 시리즈) — release_date 전무 |
| `public.company_financials` | 208행 (KR 151 DART 연간 + US 37 SEC + snapshot 20) — 행당 지표 2~3개 |
| `public.company_profiles` | KR 151 available / US 96 text_only — sector/industry 구조화 0% |

### 없음 (Baseline §10 + 기존 Wave A 요구)

- 조정주가·corporate action(배당/분할/상폐)·adjustment version
- 거래소 세션·휴장 calendar
- 인트라데이/주봉, volume_quote(전부 NULL), FX
- macro vintage(ALFRED류)·release calendar·surprise
- 재무의 filing-fact 단위 저장 (XBRL concept/unit/context/accession) — 현재 JSON 요약 수준
- 자본구조: 발행주식수·시총·주요주주·13F/ETF/insider — institutional_holdings는 6/29 정지 250건뿐
- 수급: KR 외국인/기관 플로우는 KR 전용 신호로만 존재, US 수급 전무
- 온체인: 코인 계열 market 데이터 전무 (briefing 텍스트만)

### 이관 결정

- `market_ts.ohlcv` 유지·확장 (raw/adjusted 병행 컬럼 추가) — Baseline §6.4 "규모 커지면 Timescale" 조건을 이미 충족
- `company_financials` → `market.financial_fact` (filing 단위)로 재적재, 기존 행은 legacy 뷰로 보존
- `macro_observations` → `market.macro_series` + vintage 테이블 신설, release_date 백필

## 5. analytics ← 현재 예측 원장

### 있음 (가장 성숙)

| 현재 | 실측 |
|---|---|
| `ops.forecast_issuance_ledger` | 3,554 (cutoff_at·horizon·probability·target_definition·PIT 위반 0) |
| `ops.forecast_outcome_ledger` | 8,283 (final 3,083 / interim 5,200, 고아 FK 0) |
| `public.forecast_evaluation_ledger` | 4,654 (final 340 = 7.3%) |
| `stock.evaluations` | 1,285 후보 평가 (관측형 verdict) |

### 없음

- `asset_feature_snapshot` — candidate_context_features 0건, feature store 부재
- `impact_path` — 이벤트→자산 영향 경로 없음
- 시장 확인 계층 (산업 연결 강도 / 시장 확인 / 기대 반영도 3축 분리) 없음
- `calibration_profiles` 0건 — Brier/reliability/ECE 미계산
- Theme/Community 객체 없음 (테마는 graph edge로만 암시)

### 이관 결정

- forecast 원장 3종은 Baseline 구조와 이미 정합 → 유지하고 `analytics`로 논리 귀속
- `stock.evaluations`의 관측치는 `forecast_mark`(interim) 개념으로 재라벨, 최종 성과 집계에서 배제 유지

## 6. content ← 현재 발행

### 있음

- `ops.internal_web_publication_records` 132 (최신 run) + `analysis_run_revision` 20 + `analysis_run_record_source` (run별 source 바인딩·lifecycle)
- `ops.publication_projection_status` (cutoff·watermark·fresh_until·expected/actual)
- briefing 파이프라인 (stock/crypto 일 2회) + quality.runs 게이트(warn 수준)

### 없음

- `report_definition`(섹션·품질·스케줄 정책) / `report_run`(model·prompt·pipeline version) — 현재 run에는 모델 버전 기록 없음
- Report Planner / coverage universe / editorial_importance / 다양성 제약
- Evidence Pack (facts/claims/metrics/impact_paths/contradicting/unknowns/citation_map/retrieval_trace)
- 구조화 JSON 리포트 (block_type: fact/inference/counter_evidence/...) — 현재는 Markdown 텍스트
- draft→validating→approved→published→superseded 상태 머신 — 현재 lifecycle_state는 active/expired 수준
- 부분 재생성 (블록 단위)

### 이관 결정

- `analysis_run_*`을 `content.report_run`의 전신으로 승격 (cutoff·watermark·revision 개념 호환)
- 최신 발행물의 클릭 가능 출처 7/132(5.3%) → Evidence Pack 도입과 함께 "핵심 사실 문장 인용 100%" 게이트로 전환

## 7. personalization ← 현재 피드

### 있음

- `public.user_watchlist`(9) / `user_positions` / `app_users`
- `public.user_feed_index` 15,074 + `v_user_feed_dedup` (direct/related/indirect hops·primary_kind·top_reason)
- portfolio digest API (노출·신선도·변화 알림)

### 없음

- `user_profile`(locale/risk/preferred_markets/opt_in) / `user_asset_affinity`(가중·시간감쇠) / `user_feed_item`(rank·relevance_score·explanation_codes)
- 후보 생성→순위화 2단계, 다양성 제약, 반복 노출 억제
- 콜드 스타트·개인화 해제 정책
- 민감정보(매입가·수량) 암호화/토큰화 정책

### 이관 결정

- `v_user_feed_dedup`의 관계 신호(hops·reason)는 후보 생성기의 입력으로 재사용
- `user_feed_index`는 Wave 4에서 `user_feed_item`으로 대체, 병행 기간 dual-run

## 8. serving ← 현재 read 경로

### 있음

- NestJS api-server (소스): 23 라우트, per-request read snapshot, v3 meta(cutoff/watermark/freshness/sourceCoverage) — Baseline §15.2 응답 공통 필드와 정합
- zod 계약 + api-client

### 없음

- `serving.latest_global_report / latest_asset_snapshot / latest_theme_snapshot / user_daily_feed / asset_event_timeline / evidence_card / graph_path_view` — 전무. API가 ops/public/stock 원계층을 직접 조인
- 발행 트랜잭션 내 최신 포인터 원자 교체
- Redis/CDN 캐시, 버전 키
- **운영 불일치**: 컨테이너는 레거시 artifact 실행 중 (`/api/meta` 404, `.output/server/index.mjs`)

### 이관 결정

- Wave 0에서 cutover + 최소 serving 뷰 2종(latest_price, universe), Wave 2~4에서 Baseline 읽기모델 7종 완성
- 캐시는 Baseline §15.3대로 "버전 키 우선, 삭제보다 전환" — Redis 도입은 Wave 2 이후 트래픽 근거로 결정

## 9. ops ← 현재 운영

### 있음

- `ops.job_run` (stage DAG: briefing_saved→publication_built→feed_rebuilt→gbrain_ingested) + `expected_output` (기대/실제 count)
- `quality.runs/events` (diff/drift/missing_source/prediction_track 게이트, 최근 stock=warn)
- `public.quality_incidents` 49
- systemd timer + flock + exit 75 마스킹 방지

### 없음

- 워크플로 오케스트레이터 (의존성·백필·부분 재실행·동시성 제한) — 현재 고정 시각 cron 연쇄
- 마감 조건(ready = 워터마크 충족) 게이트 — 현재 시각 기반
- LLM 비용 예산·토큰 계측, 드리프트 감지, 모델·프롬프트 레지스트리
- gbrain_ingested stage 29건 pending 방치 (7/12 이후)

### 이관 결정

- `job_run`/`expected_output`은 오케스트레이터 도입 후에도 계보 원장으로 유지
- 오케스트레이터 선정(Dagster/Airflow/Temporal 계열)은 Wave 1 착수 시 결정 — 단일 호스트 규모에서는 경량(예: Dagster OSS 단일 프로세스)이 우선 후보. **도입 자체는 승인 필요**

## 10. 갭 요약 매트릭스

| 스키마 | 재사용 | 신설 | 격리/정리 |
|---|---|---|---|
| ingestion | source_documents·revision, migration_runs, policy | 객체저장소, source_contract, fetch_run 통합 | yfinance-error 등 오류 provider |
| core | entities | entity/identifier/alias/listing | CRYPTO:QQQ류 오염 3건 |
| knowledge | temporal_graph_edge | chunk/claim/event, NLI, hypothesis queue | market_signals 무근거분, graph_evidence 전량 재평가 |
| market | market_ts.ohlcv, macro, financials | corporate action, calendar, vintage, filing-fact, 자본·수급 | snapshots 진단행, fiscal_year=0 |
| analytics | forecast 3원장 | feature_snapshot, impact_path, calibration, theme | evaluations 중간관측 재라벨 |
| content | analysis_run_*, briefing | definition/planner/evidence pack/구조화 생성/상태머신 | 클릭출처 5.3% 상태 |
| personalization | watchlist/positions, feed_dedup 신호 | profile/affinity/feed_item/순위화 | user_feed_index 병행 후 대체 |
| serving | NestJS 계약·meta | 읽기모델 7종, 원자 포인터, 캐시 | 레거시 artifact |
| ops | job_run, expected_output, quality.* | 오케스트레이터, 마감조건, 비용예산, 레지스트리 | pending gbrain stage |
