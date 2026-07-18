# 01-A — 갭 매핑 심화: 필드 레벨 이관 매핑과 검증 쿼리

> 상위 문서: `01-current-vs-target-gap.md`
> 성격: 이관 스크립트 작성자가 바로 쓸 수 있는 컬럼 단위 매핑 + parity 검증 SQL. 전부 실측 컬럼 목록 기준 (2026-07-18).

---

## 1. core.entity ← public.entities

실측 컬럼: `id, entity_key, entity_type, symbol, market, name, aliases, currency, sector, industry, country, source_system, source_ref, raw_json, first_seen_at, updated_at, industry_code*5`

### 분해 매핑 (1 row → 최대 3 entity + 1 listing)

| 원본 | Company (신설) | Stock (승계) | listing (신설) |
|---|---|---|---|
| entity_key `KR:005930` | — | identifier(INTERNAL_KEY) | — |
| name | canonical_name | canonical_name(주식명) | — |
| symbol | — | — | local_ticker |
| market KR/US | country_code 추정입력 | — | exchange_entity_id (KRX/KOSDAQ 또는 미상장 US placeholder) |
| currency | — | — | currency (KR→KRW, US→USD 기본) |
| sector/industry (전부 null 실측) | metadata로 이월 (빈 값) | — | — |
| industry_code* (KR GICS류 존재 시) | identifier(INDUSTRY_CODE, namespace=industry_code_system) | — | — |
| aliases | entity_alias rows | 〃 | — |
| first_seen_at/updated_at | created_at/updated_at | 〃 | — |
| raw_json | metadata | — | — |

주의사항:

1. **KR 거래소 구분**: entities에 KOSPI/KOSDAQ 구분 없음 → `company_profiles.profile_json->>'corporationClass'` (Y=KOSPI, K=KOSDAQ)로 exchange 결정 (run-ohlcv.ts UNIVERSE_SQL과 동일 로직 재사용)
2. **US 거래소**: 현재 미보유 → listing.exchange를 `US_COMPOSITE` placeholder로 두고 SEC company facts의 exchanges 필드로 후속 백필
3. Company↔Stock 연결: `relation(ISSUED_BY)`이 아니라 core 계층에서는 `entity_identifier` + Stock.metadata.issuer_entity_id — 그래프와 분리
4. theme/macro 엔티티: entity_type 그대로 이월 (Theme, Metric)

### 검증 쿼리

```sql
-- V1: ticker 손실 0
SELECT (SELECT count(*) FROM public.entities WHERE entity_type='ticker' AND market IN ('KR','US'))
     = (SELECT count(*) FROM core.entity_identifier WHERE identifier_type='INTERNAL_KEY');
-- V2: listing 유일성 (KR 6자리 중복 0)
SELECT exchange_entity_id, local_ticker, count(*) FROM core.listing GROUP BY 1,2 HAVING count(*)>1;
-- V3: 왕복 재구성 — INTERNAL_KEY로 기존 entity_key 전부 복원 가능
```

## 2. knowledge.document ← public.source_documents (+revision)

실측 컬럼: `id, source_key, source_system, source_type, source_name, title, url, source_ref, published_at, collected_at, entity_key, entities, summary, raw_json, content_hash, created_at, provider_key, valid_at, known_at, revision_no, policy_decision, revision_fingerprint, title_ko, summary_ko, translated_at`

| 원본 | 목표 (knowledge.document) | 비고 |
|---|---|---|
| provider_key | source_id (ingestion.source FK 해소) | rss:* 사전 등록 필요 (W0-6) |
| source_key | source_document_id | 소스 내 고유키 |
| source_type | source_type | 그대로 |
| url | canonical_url | http(s) 검증 후 |
| title / title_ko | title / metadata.title_ko | 번역은 metadata 이월 후 Wave 2에서 translation 테이블 분리 검토 |
| published_at | published_at | TIMESTAMPTZ 그대로 |
| collected_at | observed_at | NOT NULL 충족 확인 |
| known_at / valid_at | metadata + available_at=known_at | PIT 시각 승계 |
| content_hash | content_hash | UNIQUE(source_id, content_hash) 충돌 시 revision 처리 |
| raw_json | **raw_object 생성 불가** — 원본 미보존 | `raw_object_uri='legacy:pg-raw_json'` 표기, 신규 수집부터 실제 URI |
| entity_key/entities | document↔entity 링크 테이블 (신설 knowledge.document_entity) | 현재 rss는 0건 |
| revision_no + revision_fingerprint | ops.source_document_revision과 함께 document_revision 계보로 통합 | 5,028 revision 보존 |
| policy_decision | metadata.policy_decision | 발행 필터에 사용 중이므로 유지 |

### 검증 쿼리

```sql
-- V4: 문서 수 보존 (2,826 ± quarantine 3)
-- V5: revision 계보: source_key별 revision_no 시퀀스 연속성
-- V6: content_hash 중복이 서로 다른 document로 이관되지 않았는지
SELECT source_id, content_hash, count(*) FROM knowledge.document GROUP BY 1,2 HAVING count(*)>1;
```

## 3. knowledge.claim/event ← public.market_signals (13,269)

실측 컬럼: `id, signal_key, entity_id, signal_type, domain, market, polarity, magnitude, summary_text, source_name, source_document_id(전부 NULL), raw_ref, occurred_at, collected_at, raw_json(유효 0)`

### 3분류 라우팅

| 분류 | 조건 | 목표 | 예상 규모 산정 방법 |
|---|---|---|---|
| A. 이벤트 승격 | signal_type이 사건형(news, disclosure, policy) AND 제목 정규화 매칭으로 document 복구 성공 | knowledge.event (verification='cross_check_pending') + document 링크 | 이관 스크립트 dry-run에서 산출 (rss 121건과의 매칭률 실측 필요 — 과거 매칭 0의 원인은 rss summary 부재였므로 제목 매칭은 별도 재시도) |
| B. 수치 신호 | signal_type이 지표형(flow, technical, momentum) AND magnitude 존재 | analytics 입력 (feature 원료) — knowledge 미이관 | signal_type 분포 쿼리로 확정 |
| C. 격리 | 문서 복구 실패 + 근거 없음 | `knowledge.claim(claim_type='derived_claim', verification_status='untrusted_legacy')` 또는 미이관 보존 | 잔여 전부 |

사전 분포 실측 쿼리 (이관 스크립트 첫 단계):

```sql
SELECT signal_type, domain, count(*), count(*) FILTER (WHERE magnitude IS NOT NULL)
FROM public.market_signals GROUP BY 1,2 ORDER BY 3 DESC;
```

규칙: **C 분류는 리포트·그래프 근거 수 집계에서 영구 제외.** UI radar는 B 분류를 계속 사용 가능 (수치 신호로서, '근거 문서'를 주장하지 않는 한).

## 4. knowledge.relation ← ops.temporal_graph_edge

실측 컬럼: `id, relation_key, revision, graph_edge_id, src_entity_id, dst_entity_id, edge_type, weight, inferred, approved, inference_kind, evidence_quality, valid_from, valid_to, known_at, content_hash, meta, recorded_at`

| 원본 | 목표 (knowledge.relation) |
|---|---|
| src/dst_entity_id | subject/object_entity_id (core.entity 재매핑 — entities.id → 신 entity_id 매핑테이블 경유) |
| edge_type | predicate (통제어휘 매핑표: SAME_INDUSTRY→MEMBER_OF_INDUSTRY 페어 분해 검토, NEWS_COMENTION→CO_MENTIONED_WITH, PEER_OF→COMPETES_WITH 후보, AFFECTS→(이벤트 그래프로 이동)) |
| inference_kind + inferred | relation_kind: `structural|extracted|rule_derived|statistical|llm_hypothesis` 매핑 |
| weight | confidence (0..1 클램프) |
| approved | status: approved→active, else pending |
| valid_from/to + known_at | valid_from/to + recorded_from=known_at |
| revision | supersession 체인: relation_key별 revision 시퀀스 → recorded_from/to 체인 재구성 |
| evidence_quality | source_quality 초기값 |

evidence: **기존 ops.graph_evidence 25,332건은 이관하지 않는다** (전량 source_key NULL, payload=edge 메타 복사 실측). relation_evidence는 Wave 2 이후 문서 span에서 신규 생성. 이관 직후 relation의 corroboration_count=0 상태를 UI가 '근거 재구축 중'으로 표기.

### 검증 쿼리

```sql
-- V7: current edge 3,318건의 최신 revision 보존
-- V8: bitemporal 체인 무결성 — relation_key별 recorded_to NULL이 정확히 1개
SELECT relation_key, count(*) FILTER (WHERE recorded_to IS NULL) c FROM knowledge.relation
GROUP BY 1 HAVING count(*) FILTER (WHERE recorded_to IS NULL) <> 1;
```

## 5. market.financial_fact ← public.company_financials (208)

실측 컬럼: `id, entity_key, fiscal_year, fiscal_period, metric_group, currency, metrics_json, source_refs_json, availability, reported_at, created_at, updated_at`

| 원본 | 목표 | 비고 |
|---|---|---|
| metrics_json (JSON 묶음, 행당 2~3지표) | concept당 1 row로 **분해** | dart_annual_facts→{Revenues, OperatingIncome...} 표준 concept 매핑표 필요 |
| metric_group='market_snapshot' (20행, 기술지표) | financial_fact 아님 → analytics feature로 재분류 | RSI·이동평균은 재무가 아님 |
| fiscal_year=0 (20건) | quarantine — 이관 제외 | W0-5b에서 선처리 |
| reported_at (KR 151행 NULL 실측) | filed_at NULL 허용 + available_at=collected 시점 | KR은 접수일 재수집(OpenDART 접수번호)로 후속 보강 |
| source_refs_json | source_document 링크 시도, 실패 시 metadata 보존 | |

정책: 기존 208행은 **seed·legacy 등급**. Wave 2의 filing-fact 재수집(분기 포함)이 canonical이 되고, legacy는 `record_origin='legacy_summary'`로 병존.

## 6. market.macro_series ← stock.macro_observations (10,251)

실측 컬럼: `id, observation_date, region, source, indicator_code, indicator_name, value, unit, frequency, release_date(전무), collected_at, raw_json`

| 원본 | 목표 |
|---|---|
| indicator_code + source | series entity (core.entity type=Metric) + identifier(FRED_SERIES/ECOS_SERIES) |
| observation_date/value/unit | macro_vintage(observation_date, vintage_date, value) — **초기 vintage_date=collected_at::date** (최선 근사, `vintage_quality='approx_collected'` 라벨) |
| release_date 전무 | Wave 3에서 release calendar 수집 후 실제 vintage 재적재. 근사 vintage와 병존, 분석은 실제 vintage 우선 |

불변식: 근사 vintage로 과거 look-ahead 평가를 하지 않는다 — 근사분은 `vintage_quality` 필터로 백테스트에서 제외 가능해야 함.

## 7. market_ts.ohlcv — 유지 + 확장 매핑

실측 컬럼: `exchange, symbol, timeframe, ts, open..close, volume_base, volume_quote(전부 NULL), domain, source_id, collected_at`

추가 컬럼(additive): `adj_close NUMERIC, adjustment_version TEXT, instrument_id BIGINT(core listing FK, 백필)`.
심볼 정규화: `(exchange, symbol)` → `core.listing` 매핑 테이블 생성 후 instrument_id 백필. 기존 PK(exchange,symbol,timeframe,ts) 유지 — 재파티셔닝 없음.

## 8. content/personalization 이관 필드 요약

- `ops.internal_web_publication_records` → `content.report`: record_key→content_hash 기반 report, analysis_run_id/revision→report_run FK, lifecycle_state active→published/expired→superseded
- `ops.analysis_run_record_source` → `content.report_evidence` (evidence_type='document', citation_order=소스 정렬)
- `public.user_watchlist/user_positions` → `personalization.user_asset_affinity` (affinity_type='watchlist'/'holding', weight=1.0/보유비중, valid_from=added_at/opened_at, soft-remove→valid_to)
- `public.user_feed_index` → dual-run 후 `personalization.user_feed_item` 대체 (01 §7)

## 9. 이관 순서와 정지 조건

```text
순서: core(1) → ingestion/document(2) → market(5,6,7) → knowledge claim/event/relation(3,4) → content/personalization(8)
```

정지 조건 (어느 단계든):

- 검증 쿼리 V1~V8 중 실패 → 해당 단계 롤백(신규 테이블 truncate) 후 원인 수정
- dual-write 기간 diff > 0.1% → cutover 보류
- 이관 스크립트는 전부 멱등 (ON CONFLICT + 결정적 매핑키), 재실행 안전
