# Findings — 2026-08-06: 미귀속 사건과 스냅샷 상태

3단계(문서만)의 결과. 코드 변경은 E4 주석 한 줄과 E6 문서 추가뿐이고, 나머지는
전부 관측 기록이다. **여기 적은 수치는 모두 이 날 프로덕션에서 직접 읽었다.**

계획(`starry-sleeping-dijkstra`)의 A3 는 규모를 과소 산정했고, A4 는 결함이 아니었다.
둘 다 아래에 근거와 함께 적는다.

---

## A4 철회 — 파이프라인 순서는 어긋나 있지 않았다

계획에 *"`run-event-entity-resolution`(:74)이 `run-world-event-sync`(:81)보다 먼저
돌아서 이번 실행이 만든 사건은 다음 실행에야 FK 귀속된다"* 고 적었다. **틀렸다.**

사건은 `run-knowledge-extraction`(:41, 드레인 루프 포함)이 만들고 그건 FK 해소보다
앞이다. `run-world-event-sync` 는 사건 유입구가 아니라 `knowledge.event` 를 세계
평면으로 **투영**하는 잡이다. 그리고 :72 주석이 현재 순서의 이유를 이미 적어 뒀다 —
*"event participants are derived from target_entity_id, so resolving after projecting
would leave them empty."*

**옳은 것을 고치지 않았다.** 순서는 그대로 두고 그 자리(:74 와 :81 사이)를 귀속 잡
자리로 썼다(`cbfe134`).

---

## A3 — 미귀속의 실제 규모는 855 가 아니라 1,478 이고, 원인이 둘이다

계획은 "SEC 계열 855건" 만 재수집 문제로 세웠다. 전수를 읽으니 **문서가 없는 사건은
1,478** 이고, 가장 큰 덩어리인 `policy_event` 623 은 재수집 문제가 **아니다.**

```
미귀속 총 2,539  (2026-08-06 01:2x, cbfe134 적용 후)

문서 없음 1,478   provenance = legacy_no_document, source_document_id = 0건
  sec_8k          424 ┐ 회사 모양 피드 855 — 재수집 문제
  insider_trade   431 ┘
  policy_event    623   주제 모양 피드 — 붙일 노드가 없는 문제

문서 있음 1,061   provenance 없음, 전건 source_document_id 보유
  earnings 273 · product_launch 191 · regulation 149 · ma_deal 99
  macro_shock 89 · capex_increase 88 · legal_action 71 · ipo_listing 62
  supply_disruption 21 · 그 외 18
```

세 수가 닫힌다: 1,478 + 1,061 = 2,539.

### 855 — 회사 모양 피드, 회사를 담은 적이 없다

레거시 사슬을 끝까지 읽었다.

```
knowledge.event.metadata.legacy_signal_id
  → public.market_signals.id            사건마다 개별 신호 (431 · 424 전부 distinct)
  → public.entities.id                  그런데 신호 전부가 하나를 가리킨다
      MACRO:us_insider_buys      entity_type=macro   431건
      MACRO:us_corporate_events  entity_type=macro   424건
```

이전에는 `target_entity_id = 855`(`core.entity` 의 `us_corporate_events`, 타입
**Metric**)를 달고 있었고, **migration-064 가 2026-08-04 에 그 라벨을 떼면서**
`declined_reason: feed_label_target` 을 기록했다. 그 판단이 옳다 — `us_corporate_events`
라는 Metric 은 서로 다른 424건의 8-K 필링의 주체가 될 수 없다.

**해소기의 `declinedFeedLabel: 0` 은 "거부한 것이 없다" 가 아니다.** 855건 전부가 이미
그 사유를 메타데이터에 갖고 있고, `DECLINED_SQL` 이 `declined_reason IS DISTINCT FROM
'feed_label_target'` 으로 중복 기록을 막는다. 요약의 0 은 "새로 거부할 것이 없다" 다.
이 구분을 적어 두지 않으면 다음에 읽는 사람이 0을 "문제 없음" 으로 읽는다.

붙이려면 **SEC EDGAR 에서 8-K·Form 4 를 CIK 와 함께 다시 받아야 한다.** 다시 읽을
문서가 없으므로(`legacy_no_document`) 코드로는 못 풀고, 새 수집 작업이다. 이 계획에서
하지 않는다.

### 623 — 주제 모양 피드, 재수집으로는 안 풀린다

`policy_event` 의 사슬은 성격이 다르다.

```
MACRO:gl_major_event         288
MACRO:crypto_regulation      241
MACRO:tariffs                 33
MACRO:narrative_ai_capex      32
MACRO:narrative_semiconductor 29    합 623, 전건 feed_label_target 로 거부됨
```

**관세 사건의 주체는 관세다.** 회사를 다시 받아 와도 붙을 회사가 없는 사건이 다수다.
피드 라벨 자체가 이미 정답에 가깝고, 문제는 붙일 **노드**가 없는 것이다.

마이그레이션 068 은 `topic:*` 엔티티를 **FRED 일간 시리즈가 있는 주제에만** 만들었다.
`trade`·`market` 은 시리즈가 없어 노드가 없고, 그것이 주제 귀속 잡이 오늘 보고한
`topicHasNoSeriesSkipped: 78` 과 **같은 사실**이다. 잡이 실패한 것이 아니라, 붙일
대상이 존재하지 않는다.

### E5 를 여기 붙인다 — `topic:*` 타입 결정을 다시 여는 조건

`topic:*` 이 `entity_type='Metric'` 인 것은 미룬 결정이다(주제는 의미상 지표가 아니고,
`Theme` 을 피한 이유는 격리 93%). **다시 열리는 조건이 위 623건이다.**

시리즈 없는 주제에도 노드를 줄 것인가가 질문이다. 주면 623건이 주체를 얻지만, 그
노드는 `MEASURED_BY` 로 이을 시리즈가 없어 **경로가 이어지지 않는 막다른 노드**가
된다. 사건에 주체를 주는 것과 영향 경로를 만드는 것은 다른 목적이고, 어느 쪽을
살 것인지는 결정 사항이다. **답이 오기 전에 만들지 않는다.**

### 문서 있는 1,061 — 관측만 남긴다

텍스트 귀속 잡은 `summary_text` 만 읽고 `source_document_id` 는 읽지 않는다. 이 1,061건은
문서를 갖고 있으므로 요약문보다 많은 신호가 문서 안에 있을 수 있다. **얼마나 있는지
재지 않았고, 재기 전에 만들지 않는다.** 수치만 남긴다.

---

## E7 (새로 발견) — `sealed` 스냅샷이 항상 두 개다

3단계 중 E6 을 재려고 스냅샷을 읽다가 나왔다. 계획에 없던 항목이다.

```
22–26  superseded
27     sealed   ← 발행된 팩이 0개인데 sealed 로 남아 있다
28     sealed   ← 현재 (팩 626 전건 published)
```

### 원인 — 정리 시점이 한 실행씩 밀린다

스냅샷 하나에 팩 종류가 둘이고, 항상 같은 순서로 발행된다.

```
entity_relation_graph  12:10:15   run-v2-graph-publish        supersedeOrphanSnapshots: true
impact_brief           12:10:39   run-v2-analytics-publish    supersedeOrphanSnapshots: false
```

고아 스냅샷 정리는 **첫 번째** 발행자 안에서 돌고, 그 조건은 *"그 스냅샷에 published
팩이 없다"* 다. 12:10:15 시점에 스냅샷 27 은 아직 `impact_brief` 를 published 로 갖고
있으므로 조건을 만족하지 못한다. 24초 뒤 두 번째 발행자가 그 팩을 superseded 로
바꾸지만, 플래그가 false 라 정리를 다시 돌리지 않는다.

그래서 **직전 스냅샷은 항상 `sealed` 로 남고, 그 다음 실행에서야 정리된다.** 22–26 이
superseded 인 것이 이 설명과 맞다 — 각각 다음다음 실행에서 정리됐다. 누적이 아니라
고정된 한 칸 지연이고, `sealed` 는 언제나 정확히 둘이다.

### 등급 — 잠재이지 활성이 아니다

`sealed` 를 읽는 소비자를 전수로 확인했다. 리터럴 두 형태만 보고 끝내면 놓칠 수 있어
`status IN (...)` · `status <> 'superseded'` · `sealed_at IS NOT NULL` 과 마이그레이션의
SQL·뷰까지 훑었다.

| 소비자 | 선택 방식 |
| --- | --- |
| `relations/entity-relation-adapter.ts:43` | `ORDER BY as_of DESC, known_at DESC, graph_snapshot_id DESC LIMIT 1` |
| `themes/read-model.ts:37` | 같은 정렬 + `as_of/known_at <= $3` PIT 조건, `LIMIT 1` |
| `analytics/run-v2-analytics-publish.ts:147` | `ORDER BY graph_snapshot_id DESC LIMIT 1` |
| migration 025 의 PL/pgSQL | 특정 스냅샷의 상태를 **검사**한다. 개수와 무관 |

셋 다 결정적으로 최신 하나를 고르므로 **27 은 아무도 읽지 않는다.** 서빙은 옳다.

### 고치지 않은 이유

수정은 한 줄 수준이다(정리를 마지막 종류 발행 뒤로 옮기거나, 두 발행자 밖에서 한 번
돌린다). **닫는 비용이 문제다** — "이제 sealed 가 정확히 하나" 를 관측으로 닫으려면
발행 사이클 하나를 지켜봐야 하고, 그건 63배 핫패스 변경을 다음 07:45 발화에 맡기는
일이다(커밋만으로 라이브). 3단계는 문서 단계이고, 이건 자기 관측을 가진 별도 항목이다.

남은 일 목록에 넣는다. 지금 고칠 항목이 아니라는 판단이지, 결함이 아니라는 판단이
아니다.

---

## E4 — `SAME_ETF_BASKET` 앵커 8 의 재검토 조건

`etfBasketConfidence` 의 앵커(바스켓 8종목 → 0.800)는 "우리가 가진 가장 촘촘한
바스켓" 을 근거로 고정했다. 더 촘촘한 바스켓이 들어오면 그 근거가 낡는다. 값이
0.8 로 포화하므로 깨지지는 않지만, **바스켓 최소 크기가 8 미만으로 내려가면 앵커를
다시 정해야 한다.** 그 조건을 코드 주석에 적었다(`builders/etf-overlap.ts`).

---

## E6 — 재실행 흔적: 08-05 는 스냅샷 10개였다

계획에 "오늘 스냅샷 7개" 라고 적었는데 **실제는 10개(id 19–28)** 다. 내 7은
`as_of >= '2026-08-05'` 를 UTC 로 걸러 KST 이른 아침 실행 3건이 빠진 수였다.

접미사는 스냅샷 행에 없다. `builder_version` 은 `v2-publish:f2ec673:2026-08-05:f1` 로
10건 전부 동일하고 metadata 키도 `release_commit,writer` 뿐이다. **`ops.pipeline_run_claim`
의 `natural_run_key` 에 `#접미사` 로 기록된다.** 자세한 사례는
`docs/operations/pipeline-rerun.md` 에 적었다.

---

## 다시 재지 말 것

| 확인 | 값 |
| --- | --- |
| 미귀속 | 2,539 / 4,245 (cbfe134 적용 후, 2,546 에서 7 감소) |
| 문서 없음 / 있음 | 1,478 / 1,061 |
| 회사 모양 피드 | `MACRO:us_corporate_events` 424 · `MACRO:us_insider_buys` 431 |
| 주제 모양 피드 | 5종 623건, 최대 `MACRO:gl_major_event` 288 |
| 064 가 뗀 라벨 | `core.entity` 855 = `us_corporate_events`, 타입 Metric |
| `declinedFeedLabel: 0` | "새로 거부할 것이 없다". 855건 전부 이미 기록됨 |
| `sealed` 스냅샷 | 항상 2개(현재 + 직전). 소비자 전원 `LIMIT 1` |
| 08-05 스냅샷 | 10개(id 19–28), 클레임 10건과 일치 |
| 슬롯 접미사 위치 | `ops.pipeline_run_claim.natural_run_key` 의 `#접미사` |

`market_signals.entity_id` 는 `public.entities.id` 를 가리킨다 — `core.entity` 에 붙이면
우연히 맞는 id 의 다른 이름이 나온다(그 착오로 중간에 잘못 정정했다가 되돌렸다).

---

## C4 정정 — 「검증 기준이 정의된 적 없다」 는 틀렸다

계획의 D 절이 `claim` verified 0 을 **「답이 와야 하는 것」** 으로 분류하며
*"검증 기준이 저장소에 정의된 적이 없다"* 고 적었다. **정의돼 있다.**

```
ops.verification_policy (2026-07-19 부터)
  claim  corroborated   min_distinct_documents 1 · require_chunk_quote true
  claim  verified       min_distinct_documents 2 · require_chunk_quote true
  event  도 같은 형태로 두 줄
```

claim 325건은 **전부** 문서 1건 · 증거 1행 · 인용 있음이다. 즉 인용 요건은 충족이고
문서 2건 요건에서 정확히 멈춘다. corroborated 325 / verified 0 은 기준 부재의 결과가
아니라 **기준이 작동한 결과**다.

### 두 번째 문서도 없지 않다 — 병합이 없다

같은 주장(주체 + 술어 + 객체)이 서로 다른 문서 2건 이상에 등장하는 그룹이 **10개**다.

```
101 PARTNERS_WITH 엔비디아      claim 3 · 문서 3 · 0일
242 COMPETES_WITH Nvidia        claim 4 · 문서 3 · 10일
 47 PRODUCES 반도체             claim 2 · 문서 2 · 0일
 73 PRODUCES 순이익 3280억원     claim 2 · 문서 2 · 0일
114 INVESTS_IN 취약계층          claim 2 · 문서 2 · 0일
242 ANNOUNCED earnings          claim 2 · 문서 2 · 0일
211 GUIDES 2026 forecasts       claim 2 · 문서 2 · 1일
 73 ANNOUNCED 파업              claim 2 · 문서 2 · 5일
 76 PARTNERS_WITH OpenAI        claim 3 · 문서 2 · 7일
243 ANNOUNCED Earnings          claim 3 · 문서 2 · 9일
```

10그룹 중 6개가 **같은 날**이고 나머지도 1~10일 안이다. 몇 달 떨어진 별개 발표가
우연히 같은 키를 갖는 경우가 아니라, 여러 출처가 같은 사건을 말한 것이다.

추출이 문서마다 **새 claim 행**을 만들고, 같은 주장을 기존 claim 의 두 번째 증거로
붙이지 않는다. `run-claim-corroboration` 은 상태 전이만 하고 병합은 하지 않는다.
**없는 것은 기준이 아니라 단계다.**

이 모양은 오늘 밤 두 번 더 나왔다 — 귀속 잡이 파이프라인에 없던 것,
`absenceSemantics` 를 읽는 코드가 없던 것. 세 번 다 "기능이 없다" 가 아니라
"기능은 있는데 아무도 부르지 않는다" 였다.

### 병합만으로는 그래프가 안 열린다

```
객체가 엔티티로 풀린 claim    0 / 325
객체가 자유 텍스트            325 / 325     {"text": "엔비디아"} 형태
술어 12종   ANNOUNCED 87 · PRODUCES 68 · GUIDES 39 · COMPETES_WITH 32 …
```

병합이 10건을 verified 로 만들어도, 024 게이트가 그 증거로 만들 수 있는 관계는
**주체는 엔티티인데 객체는 문자열**이다. 관계 원장은 양쪽 엔티티 id 를 요구한다.

그래서 C4 는 한 단계가 아니라 둘이고, 둘 다 측정된 작업이다.

```
1. claim 병합        같은 주장을 한 행으로 모아 증거를 쌓는다 → verified 10건
2. 객체 이름 해소     {"text":"엔비디아"} → 엔티티 id       → 그래야 관계가 된다
```

2번은 `resolveCustomerMentions` 가 푸는 문제와 같은 종류다 — 카탈로그와 규칙이 이미 있다.

**계획에서 옮긴다**: C4 는 「답이 와야 하는 것」(D 절)이 아니라 「측정된 두 단계 작업」이다.
