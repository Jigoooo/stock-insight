# 02 — 데이터 아키텍처와 이관 전략

> Baseline: §4(원칙), §6(논리 데이터 계층 DDL), §25(주요 결정)
> 목적: 목표 스키마를 확정하고, 기존 테이블의 additive 수렴 절차와 시간 규약을 정의

---

## 1. 스키마 채택 결정

Baseline §6의 9개 스키마를 **그대로 채택**한다. 기존 감사 로드맵(2026-07-11)의 `registry/raw/research/features/publish` 명명은 폐기하고 Baseline 명명으로 통일한다.

```text
ingestion / core / knowledge / market / analytics / content / personalization / serving / ops
```

기존 `stock / watchlist / public / market_ts` 는 transitional로 유지한다.
`ops`는 이미 존재하므로 신규 객체를 추가하는 방식으로 수렴한다.
`market_ts`는 물리적으로 유지하되 논리상 `market` 계층 소속으로 문서화한다 (hypertable 재생성 비용 회피).

## 2. 시간·버전 규약 (전 계층 공통)

Baseline §4.4 + §6.3 + 기존 감사의 시간 규약을 병합한다.

| 필드 | 의미 | 강제 대상 |
|---|---|---|
| `occurred_at` / `period_end` | 현실 사건·측정 시점 | event, fact |
| `published_at` | 제공자 공개 시점 | document, claim, fact |
| `observed_at` | 시스템 관측 시점 | document, claim, event (NOT NULL) |
| `available_at` | 시스템이 사용 가능해진 시점 | 모든 decision-grade 행 |
| `ingested_at` | 저장 시점 | fetch_run 연결 |
| `valid_from/to` | 현실 유효 기간 | relation, identifier, listing, affinity |
| `recorded_from/to` | 시스템 기록 기간 (bitemporal) | relation (수정 시 close+새 버전) |
| `as_of` + `data_cutoff` | 분석·리포트 기준 | feature_snapshot, report_run |

하드 불변식:

1. 모든 분석/리포트 입력은 `available_at <= data_cutoff`
2. 공개시각 미상은 `publication_time_status: verified|bounded|unknown`으로 구분, 임의 timestamp 소급 금지
3. 수정·정정은 삭제가 아니라 supersession (relation은 recorded_to close, report는 supersedes_report_id)
4. **신규 테이블의 시간 컬럼은 전부 TIMESTAMPTZ** (현재 stock.* TEXT 24개 재발 방지)

## 3. core 스키마 (Baseline §6.1 채택 + 상장 확장)

Baseline DDL(entity / entity_identifier / entity_alias)을 그대로 쓰고 1개 테이블을 추가한다.

```sql
-- Baseline §6.1 3개 테이블 + 추가:
CREATE TABLE core.listing (
    listing_id      BIGSERIAL PRIMARY KEY,
    security_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id), -- Stock/ETF/Token
    exchange_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id), -- Exchange(MIC)
    local_ticker    TEXT NOT NULL,
    currency        TEXT NOT NULL,
    listing_status  TEXT NOT NULL DEFAULT 'listed',   -- listed|suspended|delisted
    valid_from      TIMESTAMPTZ NOT NULL,
    valid_to        TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    UNIQUE (exchange_entity_id, local_ticker, valid_from)
);
```

identifier_type 통제어휘: `CIK, DART_CORP_CODE, ISIN, MIC, LOCAL_TICKER, LEI, FIGI(도입 시), CHAIN_CONTRACT, COINGECKO_ID, FRED_SERIES, ECOS_SERIES, INTERNAL_KEY`.

### 백필 계획 (Wave 1)

1. `public.entities`(ticker) → Company + Stock + listing 분해. `entity_key`(KR:005930)는 `INTERNAL_KEY` identifier로 보존해 기존 API 호환 유지
2. KR: OpenDART corp_code 매핑 (기존 opendart 수집분에 존재), US: SEC CIK 매핑 (sec-edgar 수집분에 존재)
3. 코인: crypto briefing에서 등장 상위 Universe만 Token/Protocol/Blockchain으로 생성
4. namespace 오염(`CRYPTO:QQQ/SPY/^VIX`) → 올바른 entity_type으로 재배치, 구 키는 alias로 보존
5. 호환 뷰: `public.entities`와 동형의 `core.v_entities_compat` 제공, read-model 전환 후 원본 freeze

## 4. ingestion 스키마

```sql
CREATE TABLE ingestion.source (            -- ops.source_collection_policy 승계·확장
    source_id       BIGSERIAL PRIMARY KEY,
    provider_key    TEXT NOT NULL UNIQUE,  -- 기존 provider_key + rss:* 전부 등록
    source_type     TEXT NOT NULL,         -- api|feed|file|crawler|internal
    tier            SMALLINT NOT NULL,     -- 1~4 (Baseline §7.1)
    license_status  TEXT NOT NULL,
    redistribution  TEXT NOT NULL,
    enforcement     TEXT NOT NULL,         -- hard|warn|shadow
    metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE ingestion.source_contract (   -- Baseline §7.1 Source Contract
    contract_id     BIGSERIAL PRIMARY KEY,
    source_id       BIGINT NOT NULL REFERENCES ingestion.source(source_id),
    version         INTEGER NOT NULL,
    schedule_policy JSONB NOT NULL,        -- 주기, 지연 허용치
    required_fields JSONB NOT NULL,
    quality_policy  JSONB NOT NULL,        -- 레코드 수 기대범위, 단조성
    revision_policy JSONB NOT NULL,        -- 수정 데이터 처리(무시|새버전)
    active          BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (source_id, version)
);

CREATE TABLE ingestion.fetch_run (         -- migration_runs + data_collection_runs 통합
    fetch_run_id    BIGSERIAL PRIMARY KEY,
    source_id       BIGINT NOT NULL REFERENCES ingestion.source(source_id),
    run_id          TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    started_at      TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ,
    status          TEXT NOT NULL,         -- success|partial|failed
    records_read    INTEGER, records_written INTEGER, records_skipped INTEGER,
    error_summary   JSONB,
    watermark_at    TIMESTAMPTZ            -- 이 run이 보증하는 소스 커버 시점
);

CREATE TABLE ingestion.raw_object (        -- 신규: 원본 보존
    raw_object_id   BIGSERIAL PRIMARY KEY,
    fetch_run_id    BIGINT NOT NULL REFERENCES ingestion.fetch_run(fetch_run_id),
    source_id       BIGINT NOT NULL,
    source_document_id TEXT,
    content_hash    TEXT NOT NULL,
    object_uri      TEXT NOT NULL,         -- 객체 저장소 경로
    http_meta       JSONB,                 -- status/headers/ETag
    fetched_at      TIMESTAMPTZ NOT NULL,
    UNIQUE (source_id, content_hash)
);
```

객체 저장소: 초기에는 로컬 파일시스템 디렉터리(`/data/raw-objects`, content-addressed 경로) + 일별 체크섬 manifest로 시작하고, S3 호환(MinIO)은 용량·내구성 요구 관측 후 도입 (Baseline §23 "초기 운영 단순" 원칙). **원본 없이 파싱 결과만 저장하는 기존 방식은 Wave 1 이후 금지.**

## 5. knowledge / market / analytics / content / personalization

- knowledge: Baseline §6.2(document/chunk/claim/event) + §6.3(relation/relation_evidence) DDL **원안 채택**. `VECTOR(1536)`은 예시이므로 임베딩 모델 확정 후 차원·버전을 `ops.model_registry`에서 관리 (Baseline §6.4 註)
- market: 기존 `market_ts.ohlcv` 유지 + 추가 테이블

```sql
CREATE TABLE market.corporate_action (
    action_id       BIGSERIAL PRIMARY KEY,
    security_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    action_type     TEXT NOT NULL,          -- dividend|split|merge|delist|rights|spinoff
    announced_at    TIMESTAMPTZ,
    effective_date  DATE NOT NULL,
    ratio           NUMERIC, amount NUMERIC, currency TEXT,
    source_document_id BIGINT,
    available_at    TIMESTAMPTZ NOT NULL,
    UNIQUE (security_entity_id, action_type, effective_date)
);

CREATE TABLE market.trading_calendar (
    exchange_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    session_date    DATE NOT NULL,
    session_type    TEXT NOT NULL,          -- full|half|closed
    open_at         TIMESTAMPTZ, close_at TIMESTAMPTZ,
    PRIMARY KEY (exchange_entity_id, session_date)
);

CREATE TABLE market.financial_fact (        -- filing 단위 재무 (기존 JSON 요약 대체)
    fact_id         BIGSERIAL PRIMARY KEY,
    issuer_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    concept         TEXT NOT NULL,           -- 표준화 concept (예: Revenues)
    value           NUMERIC NOT NULL,
    unit            TEXT NOT NULL, currency TEXT,
    period_start    DATE, period_end DATE NOT NULL,
    fiscal_year     INTEGER NOT NULL CHECK (fiscal_year > 1900),
    fiscal_period   TEXT NOT NULL,           -- FY|Q1..Q4|H1|H2
    filing_ref      TEXT NOT NULL,           -- accession no / 접수번호
    filed_at        TIMESTAMPTZ,
    available_at    TIMESTAMPTZ NOT NULL,
    amends_fact_id  BIGINT REFERENCES market.financial_fact(fact_id),
    source_document_id BIGINT,
    UNIQUE (issuer_entity_id, concept, period_end, fiscal_period, filing_ref)
);

CREATE TABLE market.macro_vintage (
    series_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
    observation_date DATE NOT NULL,
    vintage_date    DATE NOT NULL,           -- 이 값이 알려진 시점
    value           NUMERIC NOT NULL,
    release_name    TEXT,
    available_at    TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (series_entity_id, observation_date, vintage_date)
);
```

- analytics: Baseline §6.4(asset_feature_snapshot / impact_path) 원안 채택. 기존 forecast 3원장은 이동 없이 논리 귀속 + 뷰 노출
- content: Baseline §6.5 원안 채택 (definition/run/report/report_evidence + draft→published 상태 머신). 기존 `analysis_run_revision`의 cutoff/watermark 개념을 report_run으로 승계하고 `model_version/prompt_version/pipeline_version` 컬럼을 필수화
- personalization: Baseline §6.6 원안 채택. 매입가·수량은 애플리케이션 레벨 암호화 또는 노출도(비중)만 전달

## 6. serving 읽기 모델 (Baseline §15.1 + Wave 0 선행분)

| 뷰/테이블 | 도입 Wave | 원천 |
|---|---|---|
| `serving.security_universe_v1` | 0 | core.entity(임시: public.entities) + listing |
| `serving.latest_price_v1` | 0 | market_ts.ohlcv 최신 bar + 스냅샷 fallback |
| `serving.price_series_v1` | 0 | market_ts.ohlcv (기간·간격 파라미터) |
| `serving.latest_global_report` | 2 | content.report 발행 포인터 |
| `serving.latest_asset_snapshot` | 3 | 자산 Content Pack |
| `serving.latest_theme_snapshot` | 3 | 테마 Content Pack |
| `serving.asset_event_timeline` | 3 | knowledge.event |
| `serving.evidence_card` | 2 | report_evidence + document |
| `serving.graph_path_view` | 3 | analytics.impact_path |
| `serving.user_daily_feed` | 4 | personalization.user_feed_item |

규칙: 발행 트랜잭션의 마지막 단계에서만 최신 포인터 교체 (Baseline §11.7). 웹 요청 중 그래프 탐색·벡터 검색·LLM 호출 금지 (Baseline §15.4).

## 7. 이관 절차 (테이블별 5단계 표준)

모든 transitional → canonical 이관은 다음 절차를 따른다. **각 단계는 별도 변경·별도 승인.**

1. **Additive 생성**: canonical 테이블 생성, 기존 것 무변경
2. **Backfill + dual-write**: 백필 스크립트(멱등) 실행, 수집기는 양쪽 기록
3. **Shadow read**: read-model이 canonical을 읽되 기존 값과 diff 로깅 (골든 diff 방식 재사용)
4. **Cutover**: parity 확인 후 read 전환, 기존 테이블 write freeze
5. **Archive**: 30일 관찰 후 기존 테이블 read-only 보존 (drop은 별도 승인)

병행 금지사항: PG major upgrade와 이 이관을 같은 변경으로 묶지 않는다. PG18 전환은 별도 프로그램(기존 NO-GO 판정 유지: fresh backup + isolated restore + parity 실연 전 불승인).

## 8. 데이터 품질 기본값 (Baseline §16 발췌 적용)

- Raw: 원본 해시·URI 없으면 저장 실패로 처리 (파싱 실패도 원본은 보존)
- Silver: 스키마·단위 검증 실패는 quarantine (`processing_status='quarantined'`), 삭제 금지
- Gold: source 없는 수치의 `available` 노출 금지 (기존 규칙 유지), 피처 워터마크·버전 필수
- 결측은 `data_unavailable`로 표현, 추정치 대체 금지 (Baseline §10.2)
