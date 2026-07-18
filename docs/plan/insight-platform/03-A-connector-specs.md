# 03-A — 수집 심화: 소스별 Source Contract 명세와 커넥터 모듈 설계

> 상위 문서: `03-ingestion-source-contracts.md`
> 성격: 커넥터 구현자가 소스당 1개 contract JSON + 1개 모듈로 바로 작성 가능한 명세.
> 주의: 외부 소스 rate limit·약관 수치는 도입 시점에 공식 문서로 재확인 (이번 세션 웹 검색 백엔드 장애).

---

## 1. 커넥터 모듈 표준 구조

기존 `apps/api/src/ingest/*` 관례를 승계해 소스당 1모듈:

```text
apps/api/src/ingest/
  connectors/
    {provider}/
      contract.ts        -- SourceContract 상수 (DB 등록과 동일 내용, 코드에서 검증)
      fetch.ts           -- Fetch + Persist Raw + Register (부작용: raw_object, fetch_run)
      normalize.ts       -- 순수 함수: raw → normalized records (테스트 대상)
      apply.ts           -- Deduplicate + upsert + watermark publish (트랜잭션)
    shared/
      symbol-normalize.ts  -- .KS/.KQ 등 심볼 정규화 단일 모듈 (산재 금지)
      contract-runtime.ts  -- required_fields/범위/레코드 수 급변 검사 실행기
      raw-store.ts         -- content-addressed 저장 + manifest
      watermark.ts         -- ingestion.source_watermark + ops.dataset_watermark upsert
```

계약 실행기(contract-runtime) 동작:

1. `required_fields` 누락률 > 임계 → run status='partial' + gap 기록
2. 레코드 수가 `expected_records` 범위 밖 → quality 이벤트 (drift)
3. `monotonic_keys` 역행 → 해당 레코드 quarantine
4. 실패해도 raw_object는 이미 저장됨 (Persist Raw 선행 원칙)

## 2. 소스별 Contract 명세 (도입 순서별)

### 2.1 rss-news (가동 중 → Wave 2 확장)

```json
{
  "provider_key": "rss:*(피드별 27종)",
  "tier": 2,
  "schedule": {"cadence": "*/30m", "max_lag_hours": 2},
  "fetch": {"per_feed": 8, "max_total": 80, "timeout_sec": 12},
  "required_fields": ["title", "url", "published_at|collected_at"],
  "expected_records": {"min": 10, "max": 120},
  "revision_policy": "content_hash_new_version",
  "license": {"status": "review_required", "note": "본문 수집 전 매체별 ToS 검토. 기본은 제목+링크+허용 snippet"},
  "wave2_extension": {
    "body_fetch": "링크 원문 fetch → raw_object 저장, 본문 노출은 라이선스 허용 시만. 불허 매체는 summary 필드(피드 제공분)만",
    "entity_linking": "document_entity 파이프라인 투입",
    "translation": "본문/summary 확보 후 summary_ko 재가동 (기존 Gemini 파이프라인 재사용)"
  }
}
```

### 2.2 yfinance-ohlcv (가동 중 → Tier 2 강등 유지)

```json
{
  "provider_key": "yfinance",
  "tier": 2,
  "schedule": {"cadence": "daily 00:50 KST", "max_lag_hours": 26},
  "universe": "core universe 전 종목 (현행 UNIVERSE_SQL → Wave1 후 core.listing)",
  "required_fields": ["symbol","ts","open","high","low","close","volume"],
  "expected_records": {"min": 200, "max": 2000, "note": "period=7d 일상분"},
  "idempotency": "(exchange,symbol,timeframe,ts) upsert (현행 유지)",
  "cross_check": "KR: pykrx 종가 대조(일 1회 표본 20종목), US: SEC/공식 대체 소스 확보 전까지 단일",
  "promotion_rule": "canonical bar 승격 금지. adjusted 가격은 corporate_action 결합 자체 계산"
}
```

### 2.3 opendart (가동 중 → filing-fact 재설계, Wave 2)

```json
{
  "provider_key": "opendart",
  "tier": 1,
  "schedule": {"cadence": "daily 00:45 KST + 공시 폴링 30m(도입 검토)", "max_lag_hours": 26},
  "endpoints": {
    "corp_code": "고유번호 zip — core.entity_identifier(DART_CORP_CODE) 백필",
    "fnltt_singl_acnt_all": "단일회사 전체 재무제표 (연간+분기) → financial_fact",
    "list": "공시 목록 → knowledge.event 후보 (report_nm 분류)",
    "note": "정정공시는 접수번호 체인으로 amends_fact_id 연결"
  },
  "required_fields": ["corp_code","rcept_no","bsns_year","reprt_code","account_id","thstrm_amount"],
  "rate_limit": {"per_day": "API 키 한도 — 재확인", "batch": "watchlist 우선, 전 종목 주간 순환"},
  "license": {"status": "conditional", "redistribution": "derived_only(현행 정책 유지)"}
}
```

concept 매핑: `market.financial_concept.dart_account_ids`에 표준계정ID(예: `ifrs-full_Revenue`) 등록. 미매핑 계정은 raw 보존 + 매핑 큐.

### 2.4 sec-edgar (가동 중 → 확장, Wave 2)

```json
{
  "provider_key": "sec-edgar",
  "tier": 1,
  "schedule": {"cadence": "daily 01:15 KST", "max_lag_hours": 26},
  "endpoints": {
    "submissions/CIK.json": "filing 목록 + acceptance → event + filing_ref",
    "companyfacts/CIK.json": "us-gaap fact 전체 → financial_fact (분기 포함, 현행 연간 요약 대체)",
    "13f(Wave3)": "기관 보유 → ownership"
  },
  "required_fields": ["cik","accn","form","filed","fy","fp","tag","val","uom"],
  "rate_limit": {"rps": "SEC fair-access 정책 준수(공식 문서 재확인)", "user_agent": "연락처 포함 필수"},
  "failure_policy": "403/차단 시 캐시 fallback fail-closed (현행 유지) + 백오프",
  "pit": "available_at = filed acceptance datetime (현행 요약과 달리 실제 접수시각 사용)"
}
```

### 2.5 krx-corporate-action (신설, Wave 2 — KR 최우선 신규)

```json
{
  "provider_key": "krx",
  "tier": 1,
  "purpose": ["corporate_action(배당/분할/병합/상폐)", "trading_calendar", "KOSPI/KOSDAQ 구분 정본", "지수 구성(Wave3)"],
  "candidates": "KRX 정보데이터시스템(data.krx.co.kr) 공개 API/CSV — 약관·재배포 조건 검토 후 확정. 대안: pykrx(Tier2, 교차검증용)",
  "required_fields": ["isu_cd","event_type","effective_date","ratio|amount"],
  "license": {"status": "review_required", "gate": "약관 확인 전 운영 적재 금지"}
}
```

### 2.6 fred-alfred (기존 fred 확장, Wave 3)

```json
{
  "provider_key": "fred",
  "tier": 1,
  "endpoints": {
    "series/observations(realtime_start/end)": "ALFRED vintage → macro_vintage",
    "releases/dates": "release calendar → 발표 일정"
  },
  "series_core_set": ["금리(FEDFUNDS,DGS2,DGS10)","물가(CPIAUCSL,PCEPI)","고용(PAYEMS,UNRATE,ICSA)","소비/생산(RSAFS,INDPRO)","심리(UMCSENT)","유동성(WALCL,RRPONTSYD)"],
  "pit": "vintage_date=realtime_start, 근사 금지",
  "note": "기존 fred 수집분(16건)은 vintage_quality='approx_collected'로 병존"
}
```

### 2.7 bok-ecos (가동 중 1,100건 → vintage 보강, Wave 3)

- 현행 유지 + `release_date` 확보 경로 조사(ECOS 통계공표일정 API). 불가 시 KR macro는 `approx_collected` 유지하고 백테스트 제외 플래그.

### 2.8 finra-short-volume / cftc-cot (신설, Wave 3)

```json
{
  "finra": {"tier": 2, "cadence": "daily", "fields": ["date","symbol","short_volume","total_volume","market"],
             "invariant": "short_interest로 해석 금지 — 데이터 정의 라벨 저장, venue coverage 명시"},
  "cftc":  {"tier": 1, "cadence": "weekly(금)", "fields": ["report_date","market","open_interest","positions_by_trader_class"],
             "use": "파생 포지셔닝 feature"}
}
```

### 2.9 sec-13f-nport (신설, Wave 3)

- 분기 지연(45일) → relation `valid_from=period_end, available_at=filed_at` 필수 (현재 보유로 단정 금지)
- 기존 `institutional_holdings` 250건(6/29 정지)은 legacy 이관 후 이 파이프라인이 대체

### 2.10 coingecko + onchain (기가동 + 확장, Wave 3+)

- coingecko: 현행 shadow 등급 유지, 시세·메타. 파생(펀딩·OI)은 거래소 공식 API 검토 후
- onchain(TVL/수수료/활성주소): DefiLlama 등 후보 — 약관 검토 후. venue/체인 ID·finality 지연 명시 (Baseline §14.3)

### 2.11 kr-flow (KR 수급 재구조화, Wave 3)

- 현행 flow_pressure_signals(KR 전용) 원천 확인 → KRX 투자자별 매매동향 공식 경로로 재수집
- US 수급 공백은 finra(2.8)로 부분 대체 — "US 기관/외국인 수급" 동등물은 없음을 데이터 정의로 명시

## 3. 스케줄 맵 (KST, ready 게이트 도입 전 잠정)

```text
00:30  rss (30분 주기 상시)
00:45  opendart (KR 마감 후)
00:50  yfinance ohlcv (US 마감 05:00 EST=19:00 KST 아님 — US 마감 후인 06:10 KST 별도 슬롯 신설 검토)
01:15  sec-edgar
06:10  us-ohlcv 보강 슬롯 (US 정규장 마감 반영)
07:00  krx corporate action / calendar (도입 후)
metric: 각 슬롯 종료 시 watermark publish → 발행 ready 게이트가 소비
```

주의: 현행 00:50 yfinance는 US 당일 마감분을 다음날에야 반영 — Wave 0-4 워터마크에 이 지연을 명시하고, Wave 2에서 06:10 슬롯 분리.

## 4. 백필 계획 (역사 데이터)

| 대상 | 범위 | 방법 |
|---|---|---|
| OHLCV | 현행 1y → 5y (universe 전 종목) | yfinance period=5y 1회 백필 + corporate action 확보 후 adjusted 재계산 |
| 재무 | KR/US 5개년 연간 + 8분기 | opendart/sec companyfacts 백필 러너 |
| corporate action | 상장 이후 전체 (최소 5y) | KRX/SEC 소스 확정 후 |
| macro vintage | 코어 시리즈 10y | ALFRED realtime 범위 백필 |
| 13F | 최근 4분기 | Wave 3 |

백필 러너도 §1 모듈 규격 + `--apply` 게이트 + migration_runs 기록.

## 5. 수집 품질 계측 (dataset_watermark 연동)

각 커넥터 apply 말미에 표준 5지표 기록 (fetch_run.summary):

```json
{"records_fetched": 0, "records_new": 0, "records_revised": 0, "quarantined": 0, "gap_ranges": []}
```

드리프트 알림 조건: `records_fetched`가 expected 범위 밖 2회 연속, quarantine 비율 > 5%, watermark 지연 > allowed_lag. 알림 채널: Discord (운영 메시지 규칙).
