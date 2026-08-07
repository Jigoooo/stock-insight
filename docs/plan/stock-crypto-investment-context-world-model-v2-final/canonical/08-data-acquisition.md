# 08. Data Acquisition, Source Coverage & Rights Contract

**Owner:** Data Acquisition  
**Depends on:** Kernel/World Model  
**Produces:** raw/source revisions, source contracts, coverage, source health, rights state  
**Consumed by:** 모든 truth/analytics pipeline

## 1. Source Contract

모든 API/feed/crawler/RPC/vendor는 최소 다음을 등록한다.

```text
source identity/family/authority
access mode: API/BULK/RSS/CRAWL/RPC/LICENSED_FEED
covered entities/markets/fact families
cadence/latency/historical depth
published/available/known semantics
revision/vintage support
PIT reconstructability class
independence/root lineage
rights/redisplay/storage/training policy
raw retention/parser/version
quota/rate limit/cost
fallback/redundancy
quality and semantic SLO
```

## 2. Source Authority

대략적인 우선순위:

1. regulator/exchange/government/chain raw truth.
2. company official IR/docs/newsroom.
3. reliable structured vendor.
4. reputable news/research.
5. community/social/alternative signal.

Authority가 높아도 question-specific usefulness는 별도다.

## 3. Source Value

도입 우선순위는 문서 수가 아니라 다음을 본다.

```text
Information Gain × Economic Relevance × Independence × Timeliness
× Historical Depth × PIT Reconstructability × Entity Resolution Quality
÷ (Cost × License Risk × Operational Complexity × Parsing Fragility)
```

## 4. Priority Source Portfolio

### S0 Truth Backbone

- SEC EDGAR submissions/XBRL/bulk.
- OpenDART/KRX/KIND/한국 금융 공공데이터.
- 기업 공식 IR/홈페이지 crawler.
- 시장 가격/corporate actions.
- FRED/ALFRED/ECOS 등 macro vintage.
- 법/규제/제재/수출통제 공식 source.
- GLEIF/법인 hierarchy.

### S0/S1 Economic Context

- UN Comtrade / national customs.
- OECD ICIO/TiVA.
- government procurement.
- options/futures/short/positioning.
- credit/funding/capital-structure data.

### Domain Packs

- ClinicalTrials/openFDA.
- EIA/energy/utility datasets.
- patents/IP.
- facilities/disasters/geospatial.
- crypto RPC/archive + protocol official + normalized aggregator.

### Paid Data Trial

돈을 쓸 가치가 큰 후보:

- analyst consensus/estimates/vintages.
- deep options/implied distributions.
- high-quality industry/supply-chain datasets.

Vendor는 shadow trial로 incremental information gain, PIT quality, recommendation/calibration improvement, rights와 비용을 평가한 후 도입한다.

## 5. Company Web Intelligence Crawler

우선 탐색:

- IR/earnings/presentation/guidance.
- annual reports.
- newsroom.
- product/pricing/docs/technology.
- facilities/partners/management.
- event calendar.
- careers는 candidate attention/expansion signal로 낮은 tier.

Revision snapshot + semantic diff로 변화 후보를 만들되, 페이지 변경이 곧 fact/event는 아니다.

보안:

- robots/terms contract.
- SSRF/private network 차단.
- domain allowlist/canonical redirects.
- size/content-type limits.
- parser sandbox.
- untrusted page content를 tool instruction으로 사용 금지.

## 6. Coverage Matrix

Asset/domain별로 질문을 답할 수 있는 정도를 측정한다.

예:

```text
identity COMPLETE
financial COMPLETE
product COMPLETE
geo revenue PARTIAL
supplier PARTIAL
customer NOT_COLLECTED
expectation AVAILABLE/UNAVAILABLE
options AVAILABLE/UNAVAILABLE
```

`REQ-SRC-001` “데이터 없음”과 “수집하지 않음”을 구분한다.

## 7. Rights Matrix

source별로 독립 필드:

```text
can_fetch
can_store_raw
can_extract_facts
can_train_or_evaluate
can_show_short_excerpt
can_show_full_text
can_export
can_commercially_redistribute
retention_policy
rights_document_hash/review date
```

권리 변경 감지 시 `RIGHTS_REVIEW`로 내려가며 관련 surface는 fail-closed/limited.

## 8. Connector Lifecycle & SLO

상태:

```text
DISCOVERED → REVIEW → ACTIVE → DEGRADED → PAUSED → RETIRED
                      ↘ RIGHTS_REVIEW / SCHEMA_REVIEW
```

SLO는 job success만 보지 않고 expected artifact count, semantic coverage, latency, parser/schema drift, new information rate를 측정한다.
