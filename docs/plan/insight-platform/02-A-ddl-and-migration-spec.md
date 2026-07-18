# 02-A — 데이터 아키텍처 심화: 전체 DDL·인덱스·권한·이관 스크립트 규격

> 상위 문서: `02-data-architecture-migration.md`
> 성격: 마이그레이션 파일로 옮겨 적을 수 있는 수준의 DDL 명세. 적용은 Wave별 승인 후.
> 규약: 모든 시간 TIMESTAMPTZ, 모든 테이블 `created_at DEFAULT now()`, soft-supersession(삭제 금지).

---

## 1. 마이그레이션 파일 구성

```text
packages/db-schema/src/migrations/
  1xx_serving_wave0.ts        -- Wave 0: serving 스키마 + 뷰 + watermark 확장
  2xx_core_wave1.ts           -- core.entity/identifier/alias/listing + 백필
  2xx_ingestion_wave1.ts      -- ingestion.source/contract/fetch_run/raw_object
  3xx_knowledge_wave2.ts      -- knowledge.document/chunk/claim/event/document_entity
  3xx_content_wave2.ts        -- content.report_definition/run/report/evidence
  4xx_knowledge_graph_wave3.ts-- knowledge.relation/relation_evidence + 이관
  4xx_market_wave2_3.ts       -- market.corporate_action/calendar/financial_fact/macro_vintage
  4xx_analytics_wave3.ts      -- analytics.feature_snapshot/impact_path/theme
  5xx_personalization_wave4.ts
  5xx_ops_wave1plus.ts        -- model_registry/run 컨텍스트 확장
```

기존 migration runner(`packages/db-schema`) 체계 유지. 각 파일은 additive 전용 — DROP/RENAME은 별도 파일 + 별도 승인.

## 2. Wave 0 DDL (1xx_serving_wave0)

```sql
CREATE SCHEMA IF NOT EXISTS serving;

-- 진단행 격리 (원본 무변경)
CREATE VIEW serving.market_snapshots_clean_v1 AS
SELECT * FROM stock.market_snapshots
WHERE snapshot_type NOT IN ('api_key_status','env') AND symbol IS NOT NULL;

-- 종목 universe (Wave 1 전 임시: public.entities 기반)
CREATE VIEW serving.security_universe_v1 AS
SELECT e.entity_key, e.market, e.symbol AS ticker,
       coalesce(nullif(e.name,''), e.symbol) AS name,
       p.availability AS profile_availability,
       (p.profile_json->>'corporationClass') AS kr_corp_class
FROM public.entities e
LEFT JOIN public.company_profiles p ON p.entity_key = e.entity_key
WHERE e.entity_type='ticker' AND e.market IN ('KR','US');

-- 최신가: ohlcv 1D 우선, US intraday snapshot fallback
CREATE VIEW serving.latest_price_v1 AS
WITH latest_bar AS (
  SELECT DISTINCT ON (norm_symbol)
         regexp_replace(symbol,'\.(KS|KQ)$','') AS norm_symbol,
         exchange, ts, close,
         lead(close) OVER (PARTITION BY regexp_replace(symbol,'\.(KS|KQ)$','')
                           ORDER BY ts DESC) AS prev_close
  FROM market_ts.ohlcv
  WHERE domain='stock' AND timeframe='1D'
  ORDER BY norm_symbol, ts DESC
)
SELECT norm_symbol, exchange, ts AS price_as_of, close AS latest_price,
       CASE WHEN prev_close>0 THEN round(((close-prev_close)/prev_close*100)::numeric,2) END AS change_pct
FROM latest_bar;
-- 구현 노트: window+DISTINCT ON 조합은 실측 플랜 확인 후 lateral 2-bar 방식과 택일

-- watermark 확장 (additive 컬럼)
ALTER TABLE ops.dataset_watermark
  ADD COLUMN IF NOT EXISTS allowed_lag_hours INTEGER,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;
```

인덱스 점검(있으면 skip): `market_ts.ohlcv (symbol, timeframe, ts DESC)` — hypertable 기본 인덱스와 중복 여부 `\di+` 확인 후 생성.

## 3. Wave 1 DDL — core

Baseline §6.1 3테이블 + listing(02 §3) 채택. 추가 세부:

```sql
CREATE TABLE core.entity (
    entity_id       BIGSERIAL PRIMARY KEY,
    entity_type     TEXT NOT NULL CHECK (entity_type IN (
      'Company','LegalEntity','Stock','ETF','Token','Protocol','Blockchain','Exchange',
      'Product','Technology','Industry','Theme','Country','Person','Fund','Wallet',
      'Commodity','Metric','Regulation','RiskFactor')),
    canonical_name  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','provisional','merged','retired')),
    country_code    TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON core.entity (entity_type, status);
CREATE INDEX ON core.entity USING gin (to_tsvector('simple', canonical_name));

-- entity_identifier / entity_alias: Baseline DDL 원안 + 인덱스
CREATE INDEX ON core.entity_identifier (entity_id);
CREATE INDEX ON core.entity_alias (alias_text);

-- merged 처리: status='merged' 시 metadata.merged_into=entity_id, identifier는 승계 이동
```

identifier_type CHECK: `('CIK','DART_CORP_CODE','ISIN','MIC','LOCAL_TICKER','LEI','CHAIN_CONTRACT','COINGECKO_ID','FRED_SERIES','ECOS_SERIES','INDUSTRY_CODE','INTERNAL_KEY')` — 신규 타입은 마이그레이션으로만 추가.

## 4. Wave 1 DDL — ingestion (02 §4 채택 + 보강)

02 문서의 source/source_contract/fetch_run/raw_object 4테이블에 추가:

```sql
-- 소스별 워터마크 큐 (dataset_watermark의 소스 측 대응물)
CREATE TABLE ingestion.source_watermark (
    source_id     BIGINT NOT NULL REFERENCES ingestion.source(source_id),
    dataset_name  TEXT NOT NULL,
    watermark_at  TIMESTAMPTZ NOT NULL,
    gap_ranges    JSONB NOT NULL DEFAULT '[]',   -- [{from,to,reason}]
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_id, dataset_name)
);
```

raw_object 저장소 레이아웃 (로컬 우선):

```text
/data/raw-objects/{source_key}/{yyyy}/{mm}/{content_hash[:2]}/{content_hash}.{ext}
+ /data/raw-objects/_manifest/{yyyy-mm-dd}.jsonl  (일별 해시 목록 — 무결성 점검용)
```

## 5. Wave 2 DDL — knowledge 문서·주장·사건

Baseline §6.2 원안 + 보강 2테이블:

```sql
-- 문서-엔티티 링크 (Baseline에 없는 명시 테이블)
CREATE TABLE knowledge.document_entity (
    document_id   BIGINT NOT NULL REFERENCES knowledge.document(document_id),
    entity_id     BIGINT NOT NULL REFERENCES core.entity(entity_id),
    link_method   TEXT NOT NULL,      -- symbol_exact|alias|context_scored|manual
    confidence    REAL NOT NULL,
    span          JSONB,              -- {chunk_id, start, end}
    PRIMARY KEY (document_id, entity_id)
);

-- claim 근거 위치 (§8 요구 "Claim·Event 원문 위치 존재")
CREATE TABLE knowledge.claim_evidence (
    claim_id      BIGINT NOT NULL REFERENCES knowledge.claim(claim_id),
    document_id   BIGINT NOT NULL REFERENCES knowledge.document(document_id),
    chunk_id      BIGINT REFERENCES knowledge.document_chunk(chunk_id),
    quote         TEXT,
    PRIMARY KEY (claim_id, document_id)
);
```

document_chunk.embedding: `VECTOR(dim)` — dim은 `ops.model_registry`의 활성 임베딩 모델 등록 후 마이그레이션에 주입 (하드코딩 금지). 후보: 1536(OpenAI small) 또는 3072→halfvec. 인덱스: HNSW (`vector_cosine_ops`), 벡터 검색 전 메타 필터(market/language/observed_at) 컬럼 인덱스 병행.

claim 인덱스: `(subject_entity_id, predicate, observed_at DESC)`, `(claim_type, verification_status)`.
event 인덱스: `(target_entity_id, occurred_at DESC)`, `(event_type, announced_at DESC)`.

## 6. Wave 2~3 DDL — market

02 §5의 corporate_action/trading_calendar/financial_fact/macro_vintage 채택. 보강:

```sql
-- ohlcv additive 확장
ALTER TABLE market_ts.ohlcv
  ADD COLUMN IF NOT EXISTS adj_close NUMERIC,
  ADD COLUMN IF NOT EXISTS adjustment_version TEXT,
  ADD COLUMN IF NOT EXISTS instrument_id BIGINT;   -- core.listing FK는 검증 후 제약 추가

-- financial concept 표준 사전
CREATE TABLE market.financial_concept (
    concept       TEXT PRIMARY KEY,          -- Revenues, OperatingIncome, NetIncome, ...
    label_ko      TEXT NOT NULL,
    statement     TEXT NOT NULL,             -- IS|BS|CF|ratio
    dart_account_ids TEXT[],                 -- OpenDART 계정ID 매핑
    us_gaap_tags  TEXT[],                    -- us-gaap 태그 매핑
    unit_class    TEXT NOT NULL              -- currency|shares|pure
);
```

financial_fact 인덱스: `(issuer_entity_id, concept, period_end DESC)`, `(filing_ref)`.
macro_vintage 인덱스: PK로 충분 + `(series_entity_id, vintage_date)`.

## 7. Wave 3 DDL — knowledge.relation / analytics

Baseline §6.3(relation/relation_evidence), §6.4(feature_snapshot/impact_path) 원안. 보강:

```sql
-- relation 조회 핵심 인덱스 (Baseline §20.3)
CREATE INDEX ON knowledge.relation (subject_entity_id, predicate, valid_from, valid_to)
  WHERE recorded_to IS NULL AND status='active';
CREATE INDEX ON knowledge.relation (object_entity_id, predicate)
  WHERE recorded_to IS NULL AND status='active';

-- 테마 객체 (Baseline §12.5)
CREATE TABLE analytics.theme (
    theme_id      BIGSERIAL PRIMARY KEY,
    theme_key     TEXT NOT NULL UNIQUE,
    title         TEXT NOT NULL,
    definition    JSONB NOT NULL,            -- 포함/제외 기준, 붕괴 조건
    maturity      TEXT NOT NULL DEFAULT 'emerging',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE analytics.theme_membership (
    theme_id      BIGINT NOT NULL REFERENCES analytics.theme(theme_id),
    entity_id     BIGINT NOT NULL REFERENCES core.entity(entity_id),
    tier          TEXT NOT NULL CHECK (tier IN ('core','adjacent','speculative')),
    rationale_relation_ids BIGINT[],
    valid_from    TIMESTAMPTZ NOT NULL,
    valid_to      TIMESTAMPTZ,
    PRIMARY KEY (theme_id, entity_id, valid_from)
);
```

forecast 원장 3종: 물리 이동 없음. `analytics.v_forecast_*` 뷰로 노출 + issuance에 `feature_snapshot_id BIGINT` additive 추가.

## 8. Wave 2+ DDL — content / ops 레지스트리

Baseline §6.5 원안 + 상태 머신 강제:

```sql
ALTER TABLE content.report ADD CONSTRAINT report_status_chk
  CHECK (status IN ('draft','validating','approved','published','superseded','quarantined'));

-- 최신 포인터 (원자 교체 대상)
CREATE TABLE serving.latest_report_pointer (
    report_type   TEXT NOT NULL,
    scope_key     TEXT NOT NULL DEFAULT 'global',  -- market/asset/theme 키
    report_id     BIGINT NOT NULL REFERENCES content.report(report_id),
    switched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (report_type, scope_key)
);

-- 모델·프롬프트 레지스트리 (Baseline §17.1/§21.3)
CREATE TABLE ops.model_registry (
    model_id      TEXT PRIMARY KEY,           -- 'gemini-3.1-flash-lite@2026-07'
    role          TEXT NOT NULL,              -- extraction|translation|generation|embedding|nli
    dimension     INTEGER,                    -- embedding 전용
    config        JSONB NOT NULL DEFAULT '{}',
    status        TEXT NOT NULL DEFAULT 'active',
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ops.prompt_registry (
    prompt_id     TEXT NOT NULL,
    version       INTEGER NOT NULL,
    role          TEXT NOT NULL,
    template_hash TEXT NOT NULL,
    template_uri  TEXT NOT NULL,              -- 객체 저장소
    eval_result   JSONB,                      -- 골든셋 점수
    status        TEXT NOT NULL DEFAULT 'candidate',
    PRIMARY KEY (prompt_id, version)
);
```

## 9. DB 권한 분리 (Baseline §19.1 → 실제 role)

```sql
-- Wave 1에서 생성, 비밀번호는 비밀 저장소
CREATE ROLE si_collector  LOGIN;  -- ingestion RW, knowledge.document W, 나머지 R 금지
CREATE ROLE si_knowledge  LOGIN;  -- knowledge/core RW, personalization 접근 금지
CREATE ROLE si_analytics  LOGIN;  -- analytics RW, market R, knowledge R
CREATE ROLE si_publisher  LOGIN;  -- content RW, serving W(포인터), 나머지 R
CREATE ROLE si_personal   LOGIN;  -- personalization RW, content R, 원시 포트폴리오 컬럼 제한(뷰 경유)
CREATE ROLE si_readapi    LOGIN;  -- serving R + content R(published만, RLS 또는 뷰)
CREATE ROLE si_admin      LOGIN;  -- 재처리·검수, 감사 로그 필수
```

현행 단일 `research_app` 계정 → 단계 전환: Wave 1에서 role 생성 + 신규 워커부터 적용, 기존 프로세스는 Wave 3까지 병행 허용.

## 10. 이관 스크립트 규격

모든 이관 스크립트(`apps/api/src/backfill/` 관례 승계)는 다음을 강제:

1. `--dry-run` 기본, `--apply` 명시 시만 쓰기 (기존 backfill 관례)
2. 멱등: 결정적 매핑키 + ON CONFLICT
3. `public.migration_runs` 기록 (rows read/written/skipped + summary JSON)
4. 트랜잭션: `statement_timeout 180s`, `lock_timeout 5s` (기존 관례)
5. 검증 쿼리(01-A V1~V8) 동봉 — 스크립트 말미에 자동 실행, 실패 시 exit≠0
6. 배치 500행 단위 (기존 BATCH_INSERT_SIZE 관례)

## 11. 파티셔닝·용량 계획

| 테이블 | 예상 증가 | 파티셔닝 판단 |
|---|---|---|
| market_ts.ohlcv | 253심볼×일1행 (+분봉 도입 시 급증) | hypertable 유지. 분봉 도입 시 chunk interval 재검토 |
| knowledge.document/chunk | 일 ~250문서, 본문 수집 시 chunk 수천 | 초기 단일. 100만 chunk 도달 시 월 파티션 검토 |
| knowledge.claim/event | 일 수백 | 단일 시작 |
| knowledge.relation | 수만 (bitemporal 누적) | recorded_to NULL 부분 인덱스로 current 뷰 성능 확보 |
| content.report(payload JSONB) | 일 수십 | 발행본 위주 유지, 생성 로그는 객체 저장소 (Baseline §20.3) |

현행 DB 1.36GB (surge chunk 지배적) — 신규 계층 연 증가량 수 GB 수준 전망. 디스크·백업 창 재계산은 Wave 1 착수 시.
