# K2 Truth Foundation — 착수 전 실측 조사 (2026-08-08)

> 계획 [`v2-final-implementation-plan-2026-08-07.md`](./v2-final-implementation-plan-2026-08-07.md)
> §K2 는 "유형 C — assertion·numeric_fact writer 를 새로 쓴다" 로 잡았다.
> 착수 전에 실제로 쓸 수 있는지 재 보니 **둘의 사정이 전혀 다르다.**
> 이 문서는 그 실측이다. 브랜치 `feat/k2-truth-foundation`.

---

## 결론 먼저

| 대상 | 판정 | 근거 |
| --- | --- | --- |
| `world.numeric_fact` writer | ✅ **구현 가능** | DART 1,178 · SEC 158 raw object 가 계보와 함께 보관돼 있다 |
| `governance.metric_definition` / `_comparability` | ✅ **구현 가능** | 신규 표. 의존 없음 |
| `core.economic_claim` | ✅ **구현 가능** | `core.security_master` 297행이 있다 |
| `knowledge.assertion` writer | ❌ **막혀 있다** | 계보 스택이 둘로 갈라져 있다 (아래) |

---

## assertion 이 막힌 이유 — 계보 스택 단절

`knowledge.assertion.source_revision_id` 는 `NOT NULL REFERENCES ingestion.source_revision`
이다(마이그레이션 031). 현재 claim 코퍼스는 이 조건을 **하나도** 만족할 수 없다.

### 체인 추적

```
knowledge.claim                362행   ✅ 전부 evidence 보유
  → knowledge.claim_evidence           ✅ 362/362 해소
  → knowledge.document_chunk           ✅ 362/362 해소
  → ingestion.source_revision          ❌ 0/362
```

끊긴 지점: **`document_chunk.source_revision_id` 가 9,041행 전부 NULL** 이다.
컬럼은 있고 채워진 적이 없다.

### 왜 채울 수 없나 — 대체 다리 전부 실패

```
document.content_hash    ↔ source_revision.content_hash        0건
document.source_document_id ↔ source_record_identity.provider_record_key  0건
```

키 모양이 아예 다르다:

```
document.raw_object_uri      'legacy:pg-source_documents/52'
document.source_document_id  '1684e501880d16c5d1d747e8840a3078'   (해시)
provider_record_key          'rss-news-2026-07-18T14:30:49.558Z'  (수집 키)
raw_object.object_uri        'file:///.../rss-news-bundle/2026/07/f8/f848….json'
```

### 원인

`knowledge.document` **7,746행 전부**가 `legacy:` 접두다. 비레거시 0건.
`apps/api/src/ingest/run-knowledge-document-sync.ts:69` 가
`'legacy:pg-source_documents/' || legacy.id` 로 쓰고, 원천은 **`public.source_documents`**
(12,912행) — `operations/database-ownership.md` 기준 **남의 프로젝트 표**다.

즉 이 시스템에는 계보 스택이 **둘** 있고 서로 닿지 않는다:

```
① 정본 계보 스택   ingestion.raw_object(4,400) → source_revision(4,766)
                   → source_record_identity
                   assertion·numeric_fact 가 요구하는 것

② 지식 작업 스택   public.source_documents(남의 표)
                   → knowledge.document(7,746, 전부 legacy:)
                   → document_chunk(9,041, source_revision_id 전부 NULL)
                   → claim(362)
                   claim 파이프라인이 실제로 도는 곳
```

그리고 ②는 **지금도 자란다** — 최근 24시간 신규 document 395건, 최신 08-08 00:46.

### 이것은 결함이 아니라 게이트다

`impact_exposure_revision` 이 비어 있던 것과 같은 부류다(계획 §2 ①). 031 은 assertion 이
검증 가능한 source revision 위에 서게 설계했고, 레거시 문서는 그 revision 이 없다.
없는 계보를 만들어 채우면 `REQ-EVD-001`(자격 있는 증거) 과 `REQ-EVD-004`(원표까지 재실행)
를 정면으로 어긴다 — 그리고 canonical/02 §3 은 그런 데이터의 이름을 이미 갖고 있다:
우리가 바이트를 갖고 있지 않으면 PIT 등급을 줄 수 없다.

**그러므로 `assertion.source_revision_id` 를 nullable 로 완화하는 것은 선택지가 아니다.**

### 올바른 해결 — K2 범위를 넘는다

②를 ①로 옮겨야 한다. 즉 `ingestion` 스택이 수집한 것(rss-news-bundle 769 raw object,
source_revision 4,766)이 `knowledge.document` 가 되게 하고, 레거시는 레거시로 남긴다.

이것은 "수집 층과 지식 층을 잇는다" 는 작업이고, canonical/11 §2 Launch Slice 가
*"raw/source revision + PIT quality"* 다음에 *"event/assertion/conflict"* 를 둔 이유이기도
하다. 한 단계로 다룰 일이 아니라 별도 슬라이스로 계획해야 한다.

---

## numeric_fact 가 가능한 이유

문서 스택과 **무관하다**. XBRL/재무 수치는 filing raw object 에서 직접 읽고, 그 raw object 는
계보를 갖는다.

```
ingestion.raw_object 출처별
  opendart                          1,178
  internal-etf-holdings-snapshot    1,209
  rss-news-bundle                     769
  internal-company-profile-snapshot   317
  internal-institutional-holdings     250
  internal-stock-price-window         170
  sec-edgar                           158
  internal-industry-classification     119
  fred                                 83
  finra                                36
  opendart-business-report-supply      18
  bok-ecos                             16
  internal-macro-*                     83
```

`world.numeric_fact` 가 요구하는 것과 대조:

| 필요 | 출처 |
| --- | --- |
| `source_revision_id` NOT NULL | ✅ opendart/sec-edgar raw object 에 revision 있음 |
| `original_cell_or_xbrl_locator` | ✅ XBRL fact 의 contextRef/unitRef, DART 의 계정 코드 |
| `concept_namespace` / `concept_key` | ✅ us-gaap / ifrs-full / dart 계정과목 |
| `period_start`/`_end`/`instant_at` | ✅ XBRL context |
| `unit`·`currency`·`scale_power` | ✅ XBRL unit + DART 단위 |
| `available_at`·`known_at` | ✅ source_revision |

`REQ-EVD-004`("숫자는 원표/XBRL/cell/program inputs 까지 재실행 가능")를 만족하는 경로가
실재한다.

> 참고: `public.company_financials` 도 존재하지만 남의 표이고 우리 계보에 묶여 있지 않다.
> numeric_fact 를 거기서 채우면 assertion 과 똑같은 함정에 빠진다.

---

## 재조정한 K2 범위

| # | 작업 | 상태 |
| --- | --- | --- |
| K2-a | `governance.metric_definition` + `metric_comparability` | 착수 가능 |
| K2-b | numeric_fact writer (opendart → `world.numeric_fact`) | 착수 가능. DART 1,178 이 가장 큰 코퍼스 |
| K2-c | `core.economic_claim` | 착수 가능 |
| K2-d | `core.security_corporate_action` 채우기 | 조사 필요 (원천 확인 안 함) |
| K2-e | truth_class 메타데이터 | 착수 가능 |
| **K2-f** | **assertion writer** | **차단.** 계보 스택 연결이 선행돼야 한다 — 별도 슬라이스 |

---

## 다음 세션이 알아야 할 것

- `document_chunk.source_revision_id` 는 컬럼만 있고 전부 NULL 이다. 이걸 채우려고
  하지 마라 — 채울 값이 존재하지 않는다
- `knowledge.document` 는 남의 표(`public.source_documents`)에서 동기화된다.
  `run-knowledge-document-sync.ts` 가 그 코드다
- numeric_fact 는 문서 스택을 **거치지 않는다**. opendart/sec-edgar raw object 를 직접 읽어라
- `public.company_financials` 를 쓰지 마라. 남의 표이고 계보가 없다
