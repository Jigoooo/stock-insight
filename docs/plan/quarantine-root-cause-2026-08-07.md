# 격리 엣지 3,312 — 원인 측정과 정정 (2026-08-07)

인수인계 문서 `handoff-2026-08-07.md` 의 §4 D · §6 · §8 은 격리 엣지를
**"계산이 끝나 원장에 있는데 온톨로지 승인 한 줄에 막혀 서빙에 못 간다"** 로 적었다.
그 세션은 스스로 "크기만 재고 원인은 안 쟀다" 고 남겼다. 이 문서가 원인을 잰 결과다.

## 결론

**온톨로지 16종을 전부 승인해도 해제되는 엣지는 0건이다.** 측정값이다.

```
격리 엣지                                     3,299
그중 온톨로지 승인만으로 해제되는 수              0
```

인수인계의 진단은 반증됐다. 격리는 미결 부채가 아니라 **B5 설계가 명세대로 작동하는 상태**다.
마이그레이션 `023_temporal_relation_ledger.ts:3` 이 그것을 한 줄로 적어놨다 —
*"Legacy relations with no evidence are preserved but quarantined."*

---

## 1. 먼저, 3,312 라는 수부터 틀렸다

```
시점 필터 없이 relation_revision 을 센 수      3,312   ← 이전 세션이 보고한 값
현재 유효한 격리 (known_from·valid_from·valid_to 적용)  3,299
차이 13 = 만료·대체된 옛 개정
```

`RELATION_PIT_SQL` 은 시점 필터를 걸고 읽는다. 서빙이 보는 수는 3,299 다.
13건은 이미 지나간 개정이라 승인하든 말든 서빙에 나타나지 않는다.

## 2. 차단막은 한 겹이 아니라 세 겹이다

`apps/api/src/knowledge/relation-ledger.ts` 의 `RELATION_PIT_SQL:262-325` 이 게이트다.

| 겹 | 조건 | 3,299건의 상태 |
| --- | --- | --- |
| 1 | 원장에 저장된 `revision_status='accepted'` | **전부 `quarantined_unverified`** |
| 2 | `ontology.policy_status='approved'` | 16종 중 13종 미승인 |
| 3 | 자격 있는 증거 EXISTS | **증거 행 0건** |

**겹 1이 가장 바깥이고, 이것만으로 이미 닫힌다.** `RELATION_PIT_SQL:324-325`:

```sql
WHEN revision.revision_status='accepted' THEN 'quarantined_unverified'
ELSE revision.revision_status END
```

승격 분기는 **저장된 상태가 이미 `accepted` 인 행에만** 발동한다. 3,299건은 저장 상태가
`quarantined_unverified` 라 `ELSE` 로 떨어진다. 온톨로지를 승인하고 증거를 완벽히 붙여도
**이 행들은 그대로 격리된다.** 해제하려면 `revision_status='accepted'` 인 **새 개정을 덧붙여야**
한다 — 마이그레이션 `023:443-485` 의 ISSUED_BY 재바인딩이 정확히 그 패턴이다.

### 겹 2가 게이트가 아니라는 직접 반례

마이그레이션 024 는 `COMMON_OWNER`·`OWNS`·`SAME_ETF_BASKET` 에 **승인된 개정판 2를 이미 심었다.**
그런데 그 엣지들은 여전히 격리돼 있다 — 개정판 1(미승인)을 가리킨 채로.

```
predicate         승인된 rev2 존재?   격리 엣지   엣지가 가리키는 rev
COMMON_OWNER            예             1,062            1
OWNS                    예                64            1
SAME_ETF_BASKET         예                13            1
```

승인은 이미 있는데 해제되지 않았다. **승인은 게이트가 아니다.**

### 겹 3 — 증거는 0건이다

```
격리 엣지 3,299건 중
  증거 원장에 행이 하나라도 있는 것        0
  payload_hash 가 일치하는 증거가 있는 것   0
```

증거 원장 전체는 51,968행이고 (source_revision 43,175 · model_config 8,539 ·
identity_mapping 254) 그중 **격리 엣지에 붙은 것은 하나도 없다.**

대조군이 이 구조를 확증한다: `identity_mapping` 증거 254건 ↔ accepted ISSUED_BY 254건. 정확히 일치.

## 3. "왜 16종이 미승인인가" — 아무도 심사를 기다리고 있지 않다

이것이 첫 질문이었다. 답은 **개별 판단이 내려진 적이 없다** 는 것이다.

마이그레이션 `023:220-229` 는 레거시 `knowledge.relation` 에 등장하는 **모든 서술어**를
개정판 1로 자동 생성하면서, 표의 기본값 `policy_status='provisional_review_required'` 와
고정 문구를 그대로 찍었다:

```
"Imported from active relation vocabulary; semantic approval pending."
```

실측: 격리된 16종은 전부 `revision_no=1`, 전부 같은 설명, 전부 `metadata->>'seeded_by'` 가 비어 있다.
승인된 것들은 `seeded_by`가 `migration-024`·`migration-066`·`migration-068` 로 찍혀 있다.

> **"semantic approval pending" 은 심사 대기열이 아니라 자동 생성된 상투구다.**
> 16종은 "심사에서 보류된 것" 이 아니라 **뒤이은 마이그레이션이 돌아오지 않은 것**이다.

그리고 `NEWS_COMENTION` 68건은 **의도된 격리**다. 마이그레이션 `024:52-54` 가 명시한다 —
*"NEWS_COMENTION is deliberately ABSENT: it is never promotable."* 부채로 세면 안 된다.

## 4. 격리 엣지의 정체 — 전량 남의 그래프의 일회성 스냅샷

```
격리 3,299건의 metadata->>'policy'      전부 'b5-v1'   (예외 0)
레거시 relation 의 metadata->>'backfill' 전부 'temporal-graph-v1'
```

빌더가 쓴 엣지 중 격리된 것은 **단 하나도 없다.** 전부 마이그레이션 023 의 레거시 임포트다.

출처를 끝까지 따라갔다. 포인터는 **깨끗하게 풀린다**:

```
knowledge.relation.metadata->>'legacy_graph_edge_id'
  → ops.temporal_graph_edge.graph_edge_id        3,312 / 3,312 조인 성공
  → ops.temporal_graph_edge_evidence             전건 증거 행 있음
  → ops.graph_evidence                           고유 83,788건
```

**그런데 그 끝에 인용할 것이 없다:**

```
evidence_type   derived_observation  81,708
                legacy_edge           2,080
source_document_id                    전건 NULL
source_key                            전건 NULL
```

문서도, 원천 키도, 불변 원천 개정도 없다. `legacy_edge` 2,080건은 자기 참조다.
그리고 `relation_evidence_kind_check_v2` (마이그레이션 024) 가 허용하는 종류는
`document·chunk·claim·source_contract·source_revision·model_config·identity_mapping` 뿐 —
**어느 것에도 맞지 않는다.**

추가 제약 두 개:

- `ops.*` 세 표는 전부 소유자 `postgres` = research-app-db 프로젝트 것이다 (337,005행).
  `docs/operations/database-ownership.md` 가 `ops.temporal_graph_edge_closure` 를 그쪽 소유로 명시한다.
- `apps/api/test/v2-runtime-no-legacy-graph.test.ts:14` 가 **v2 런타임의 레거시 그래프 읽기를 금지**한다.
  아키텍처가 의도적으로 떠나온 자리다.

> 새 증거 종류(`legacy_graph_edge`)를 들이는 것은 **"뒷받침 문서 없는 남의 파생 관측을 근거로 인정할 것인가"**
> 라는 설계 결정이다. B5 가 배제하려고 만들어진 바로 그것이다. 잡 하나로 처리할 일이 아니고,
> 이 세션은 사용자 확인 없이 하지 않았다.

---

## 5. 대신 찾은 진짜 미청구 항목 — ownership 빌더

빌더 8개의 프로덕션 배선을 전수 측정했다.

| 빌더 | 프로덕션 호출 |
| --- | --- |
| etf-overlap · macro-comovement · macro-topic · official-sector · product-similarity · supply-chain | `run-v2-graph-publish.ts` |
| **ownership** (OWNS · HELD_BY · COMMON_OWNER) | **없음 — 테스트 전용** |
| news-relation | 없음 (024 가 "승격 불가"로 설계 — 일관됨) |

`buildOwnershipCandidates` 는 구현 완료 · 온톨로지 승인 완료(024) ·
골든/결정성/슈퍼허브 안전성 테스트 보유 · **호출자 0개**다. `HELD_BY` 는 엣지가 **한 번도** 없었다.

**다만 배선 작업이 아니다.** 빌더가 관측마다 `sourceRevisionId` 를 요구한다
(`ownership.ts:27` · `builder-core.ts`의 `sourceRevisionEvidence`). 우리 수집층을 통과한
데이터만 쓸 수 있다는 뜻이고, 실측 결과 13F 보유 데이터가 없다:

```
sec-edgar   148 개정 — 전량 data.sec.gov/api/xbrl/companyfacts (재무 팩트, 13F 아님)
finra        35 개정 — 전량 cdn.finra.org/equity/regsho/daily
저장소 내 13F 수집기                     없음 (빌더와 테스트만 언급)
public.institutional_holdings   250행 / 6기관 / 76종목 / 소유자 postgres / source_revision 없음
```

→ **ownership 은 "13F 수집기 신규 작성" 이지 "배선" 이 아니다.** ECOS 보다 크다.

---

## 6. 순서 결론 — C(ECOS) 가 먼저다

인수인계 §8 은 *"2번(격리 엣지)을 1번(ECOS)보다 먼저 둘 수도 있다"* 고 유보했다.
**그 유보는 측정으로 해소됐다 — 격리 쪽 회수 가능량은 0이다.**

C 가 준비됐다는 근거는 인수인계가 적은 것보다 하나 더 있다:

```
bok-ecos    ingestion.source 에 이미 등록됨 (source_id 17, tier 1, conditional/derived_only/warn)
            source_revision 개정 수 = 0    ← 계약만 있고 한 번도 수집 안 됨
ECOS_SERIES identifier_type CHECK 에 있음 (008_core_ingestion_foundation.ts:32)
run-fred-vintage.ts:20  "KR(ECOS) vintage stays a later tranche"  ← 계획이 코드에 적혀 있다
fred        113 개정 — 같은 패턴이 작동한다는 증거
```

권장 순서:

```
1  C — ECOS 수집기        계약 등록됨·키 확인됨·본보기 있음. 막힘 0
2  13F 수집기 → ownership 빌더 배선    승인된 온톨로지와 테스트된 빌더가 이미 기다린다
3  격리 3,299             설계 결정 사항으로 재분류. 사용자 판단 전까지 착수 금지
```

---

## 7. 이 세션이 하지 않은 것과 이유

| 안 한 것 | 이유 |
| --- | --- |
| 온톨로지 16종 승인 | **해제되는 엣지가 0건**이라 무의미하다. 승인은 겹 2고 겹 1·3이 남는다 |
| 격리 엣지 재바인딩 개정 추가 | 증거가 0건이라 붙일 근거가 없다. 붙이면 근거 없는 승격이 된다 |
| `legacy_graph_edge` 증거 종류 신설 | 설계 결정 + 남의 스키마 읽기. **사용자 확인 필요** (§4) |
| 13F 수집기 | 범위 밖. 크기를 재서 §5 에 기록했다 |
| ECOS 수집기 | 프로덕션 DB 쓰기라 실행 전 사용자 확인이 필요하다 |

## 8. 부수 관측 — 고칠 것은 아니고 기록

`research-app-postgres` 컨테이너의 `/dev/shm` 이 도커 기본값 **64MB** 다. 큰 병렬 해시조인이
`could not resize shared memory segment ... No space left on device` 로 죽는다.
호스트 디스크는 950G 여유이므로 디스크 문제가 아니다. 조사 질의는
`SET max_parallel_workers_per_gather=0` 으로 우회했다.

이 컨테이너는 **네 프로젝트 공유**라 `shm_size` 변경은 이 저장소 단독으로 결정할 일이 아니다.
기록만 남긴다.

### 보고서의 미정의 CSS 클래스 `flow-w`

`docs/operations/data-ecosystem-artifact.html` 이 `class="row flow-w"` 를 **8회** 쓰는데
스타일시트에 `.flow-w` 정의가 **없다**(정의된 것은 `.row.flow-s`·`.row.block-s`·
`.row.dormant-s`, 207–209행). 해당 행들은 의미색 좌측 테두리 없이 렌더된다.

**이 세션 이전부터 있던 것이고 고치지 않았다.** 표시만의 문제이고, 과거 절의
렌더를 바꾸는 것은 이번 작업 범위가 아니다. 이번에 새로 넣은 표는 정의된
`block-s`·`dormant-s` 로 맞췄다. 다만 기존 정정표에 덧붙인 행 하나는 **형제 행들과
같아 보이도록 일부러 `flow-w` 로 뒀다** — 누락이 아니다.

## 9. 게이트

**미실행 — 코드 변경이 없다.** 이 세션의 변경은 마크다운 2개와 보고서 HTML 1개뿐이라
`pnpm typecheck`·`lint`·`test` 가 평가할 대상이 없다. 마지막 게이트 판독값은 인수인계
문서의 것(typecheck 11/11 · oxlint 0 · 894 tests / 848 pass / 0 fail)이고 **이 세션이
다시 재지 않았다.** 보고서는 태그 균형 검사만 돌렸다(불균형 0).

---

## 부록 — 재현 질의

```sql
-- 결론: 온톨로지만 풀면 해제되는 수
WITH latest AS (
  SELECT DISTINCT ON (i.relation_identity_id)
         i.relation_identity_id, r.revision_status, r.payload_hash
  FROM knowledge.relation_identity i
  JOIN knowledge.relation_revision r USING(relation_identity_id)
  WHERE r.known_from<=now() AND r.valid_from<=now()
    AND (r.valid_to IS NULL OR r.valid_to>now())
  ORDER BY i.relation_identity_id, r.revision_no DESC
)
SELECT count(*) FILTER (WHERE revision_status='quarantined_unverified') AS 격리,
       count(*) FILTER (WHERE revision_status='quarantined_unverified' AND EXISTS(
         SELECT 1 FROM knowledge.relation_evidence_ledger e
         WHERE e.relation_identity_id=latest.relation_identity_id
           AND e.relation_payload_hash=latest.payload_hash)) AS 온톨로지만_풀면_해제
FROM latest;
-- → 3299 | 0
```
