# Stock Insight — 실측 설계 문서 (as-built, 2026-08-07)

## 이 문서의 자리

레포에는 이미 아키텍처 문서가 둘 있다. 이 문서는 셋째가 아니라 **빠져 있던 축**이다.

| 문서 | 답하는 질문 | 시점 |
| --- | --- | --- |
| `docs/architecture/stock-crypto-insight-platform-architecture.md` | 무엇을 지을 것인가 (Phase 0~5 기준선) | 계획 |
| `docs/architecture/stock-insight-e2e-layers.md` | 다 지어지면 어떤 모양인가 (L0~L8 정본) | **목표** |
| **이 문서** | **지금 실제로 어떻게 지어져 있는가** | **2026-08-07 실측** |

`e2e-layers.md` 는 스스로를 이렇게 규정한다 — *"승인된 complete-v2 로드맵이 모두 구현 완료된
시점을 가정한 목표 아키텍처 정본"*. 그것은 **여전히 정본이다.** 목표가 바뀌면 그 문서를 고쳐라.
이 문서는 목표를 정하지 않는다. 잰 것만 적는다.

> **계층별로 설계 대 구현을 한 표에서 보려면 [`README.md`](./README.md) 의 구현 대조표**를 봐라.
> 목표 문서가 현재형으로 서술한 것 중 **셋(L6·X1·X4)은 지어지지 않았다** — 그 표가 근거와 함께
> 낱낱이 갈라놓았다.

**이 문서의 모든 수치에는 2026-08-07 이라는 측정일이 붙는다.** 파일명에도 날짜가 있다.
날짜 없는 문서는 조용히 낡는다 — 그 실패의 실물이 이 레포에 둘 있고, §12 에 적어뒀다.

### 읽는 법

**§3 이 이 시스템의 중심 설계다.** 시간이 없으면 §3 과 §11 만 읽어라.

| | 절 | 한 줄 |
| --- | --- | --- |
| 1 | 배포체와 경계 | 셋으로 나뉜 이유 · 공유 DB 라는 사실 |
| 2 | 실체 층 | 모든 것이 `core.entity` 정수 id 에 붙는다 |
| **3** | **원장** | **추가 전용 · 세 겹 게이트 · 증거가 자물쇠라는 실측** |
| 4 | PIT 규율 | vintage 가 두 종류인 이유 |
| 5 | 투영과 두 예산 | 팩과 경로는 독립이다 (실측 증명) |
| 6 | 모델 설정 | 설정이 증거의 일부다 |
| 7 | 서빙 경로 | 팩은 "유일한 형태"가 아니다 · 026 가드 전량 |
| 8 | 인증과 경계 | HMAC 이 무엇에 묶이는가 · 무엇에 안 묶이는가 |
| 9 | 오케스트레이션 | fencing · 프로버넌스 · 입력 게이트는 둘뿐 |
| 10 | 탐지기 층 | 가장 특이한 설계 · 그 구멍 셋 |
| **11** | **실패하는 방식** | **큰 실패 vs 조용한 실패 여덟** |
| 12 | 짓지 않은 것 | 근거와 함께 · 발견한 드리프트 9건 |
| A·B | 부록 | 측정 전량 · 이 문서를 유지하는 법 |

---

## 1. 배포체와 경계

세 배포체. 이미지 다이제스트로 고정된다.

```
apps/web            TanStack Start BFF. 라우팅·SSR·세션 쿠키를 소유한다
  │                 DB 자격증명을 갖지 않는다
  │ STOCK_INSIGHT_BRAIN_URL · 요청마다 HMAC internal context 서명
  ▼
apps/api-server     NestJS/Fastify "brain". 모든 SQL 경로를 소유한다
  │                 internal context 를 검증하고 트랜잭션마다 호출자 범위를 묶는다
  ▼
apps/api            brain 의 read model + 수집·백필·분석 잡
                    요청 경로가 아니라 ops/systemd/user/*.timer 가 돌린다

deploy/stock-edge   nginx 인그레스. Cloudflare 터널은 별도 레포 소유
```

경계가 왜 이 모양인가: **웹이 DB 를 못 만지면 웹의 버그가 데이터를 못 망친다.** 그리고
읽기 경로와 쓰기 경로가 다른 프로세스에 살면, 타이머가 잡을 돌리다 죽어도 사용자 요청은 산다.

`apps/api` 가 별개인 이유는 더 실질적이다 — **타이머가 워킹 트리를 직접 실행한다.**
`ops/systemd/user/stock-insight-analytics.service:12` 의 `WorkingDirectory` 가 체크아웃 경로
그 자체다. 즉 **이 레포에서 파일을 고치는 것이 곧 배포다.** 빌드도 이미지 푸시도 끼지 않는다.
이것은 사고가 아니라 현재의 운영 형태이고, 작업 규율의 근거다.

### 공유 데이터베이스라는 사실

`research_app` PostgreSQL 은 우리 것이 아니다. **네 프로젝트가 함께 쓴다**
(stock-insight, research-app-db, research-common, crypto-research).

```
2026-08-07 측정
  전체 표          1,171
  public 스키마       103   ← 대부분 남의 것. 레거시 공용 구역
  우리 스키마      1,068   core · knowledge · analytics · serving · market · market_ts · news · ops
```

경계는 스키마다. 그런데 **완전하지 않다** — 우리 파이프라인 감사 흔적이 공유 표에 산다:

```
public.migration_runs   전체 4,973행
  stock-insight-*        4,868
  남의 잡                  105   sync_daily_to_postgres 99 외
```

이건 알려진 부채이고 `docs/architecture/operations/database-ownership.md` 에 기록돼 있다. 여기 적는 이유는
*"우리 스키마만 보면 된다"* 는 오해를 막기 위해서다.

---

## 2. 실체 층 — core

모든 것이 `core.entity` 의 정수 id 에 붙는다. 문자열 티커가 아니다.

```
core.entity 1,448 (2026-08-07)
  Metric 334 · Company 325 · Stock 325 · LegalEntity 169 · Theme 138
  Industry 112 · Token 24 · ETF 18 · Exchange 3
```

Company 와 Stock 이 정확히 325로 같은 것은 우연이 아니다 — 회사와 상장 주식을 **분리된 실체**로
두고 `ISSUED_BY` 로 잇는다(254 엣지). 한 회사가 복수 상장을 갖는 날 스키마를 안 고쳐도 된다.

식별자는 별도 표에서 다대일로 붙는다:

```
core.entity_identifier 2,080
  INTERNAL_KEY 1,428 · LOCAL_TICKER 325 · DART_CORP_CODE 182
  CIK 123 · FRED_SERIES 15 · ECOS_SERIES 5 · MIC 2
```

`identifier_type` 은 CHECK 로 12개 값에 갇혀 있다. **CUSIP 은 그 안에 없다** — 13F 전체 유니버스
확장이 별도 프로젝트인 이유가 이 한 줄이다.

`ECOS_SERIES` 5건은 2026-08-07 에 처음 생겼다(마이그레이션 076). 한국 거시가 그래프에 닿는
경로가 그날 열렸다는 뜻이다.

---

## 3. 원장 — 이 시스템의 중심 설계

관계는 표에 쓰이지 않는다. **추가 전용 원장에 리비전으로 쌓인다.**

```
knowledge.relation_identity    (subject, predicate, object) 로 유일 — 관계의 이름
knowledge.relation_revision    그 관계에 대한 시점별 주장 — 몇 번이고 쌓인다
knowledge.relation_evidence_ledger  각 리비전이 무엇에 근거하는가
```

### 불변조건 — 트리거가 강제한다

```sql
-- relation_identity, relation_revision 양쪽에 걸려 있다
TRIGGER relation_identity_immutable BEFORE DELETE OR UPDATE
  EXECUTE FUNCTION knowledge.reject_relation_ledger_mutation()
```

**과거를 지울 수 없다.** 결과로 따라오는 것들:

- 철회는 삭제가 아니라 **새 리비전**이다. `revision_status` 를 바꾼 리비전이 하나 더 쌓인다
- 같은 SQL 을 다시 돌려도 **중복 엣지가 안 생긴다.** identity 가 `(subject,predicate,object)`
  유니크라서, 재실행은 insert 가 아니라 리비전 추가(replay)다
- **모델을 바꾼 전후를 비교할 수 있다.** §6 의 시장 팩터 교체가 정당했음을 증명한 방법이
  정확히 이것이다 — 옛 리비전이 남아 있어서 전후 상관값을 나란히 잴 수 있었다

`relation_identity` 에는 자기참조 금지 CHECK 도 있다. 예외는 `CORROBORATES`·`DIVERGENCE` 둘뿐
— 같은 실체에 대한 두 주장이 서로를 보강/반박할 수 있어야 하기 때문이다.

### 세 겹 수용 게이트

엣지가 서빙에 닿으려면 **세 관문을 모두** 통과해야 한다 (`RELATION_PIT_SQL`):

```
1. 저장된 revision_status = 'accepted'
2. 서술어의 policy_status = 'approved'        (knowledge.predicate_ontology_revision)
3. 자격을 갖춘 증거가 EXISTS                   (minSourceRevisions 이상)
```

**이 셋이 독립이라는 것이 설계의 핵심이고, 실측이 그것을 증명한다:**

```
2026-08-07 측정 — 서술어별 관계 수 · 증거 보유 · 수용 결과

COMMON_OWNER   1,922 관계   증거 있음 1,391 → accepted 1,391
                            증거 없음   531 → 격리      531
OWNS              64 관계   증거 있음     0 → accepted     0     ← 서술어는 approved 다
HELD_BY          250 관계   증거 250/250  → accepted   250
```

**OWNS 를 보라.** 서술어가 `approved` 인데 수용된 엣지가 **0** 이다. 승인은 자물쇠가 아니다.
증거가 자물쇠다. 그리고 COMMON_OWNER 에서 증거 보유 수(1,391)와 수용 수(1,391)가, 증거 부재
수(531)와 격리 수(531)가 **정확히 일치한다.** 세 번째 관문이 실제로 무는 관문이라는 것을
이보다 깨끗하게 보여주는 방법은 없다.

이것이 2026-08-07 격리 원인 조사의 결론이기도 하다: 격리된 서술어 16종을 전부 승인해도
**열리는 엣지는 0** 이다. 그것들은 마이그레이션 023 레거시 임포트이고 증거가 아예 없다.
**격리는 부채가 아니라 게이트가 작동 중이라는 뜻이다.**

### 원장 전경 (2026-08-07)

```
서술어 24종 · 증거 원장 64,699행

수용 있음 (10종)
  SAME_ETF_BASKET 2,501 · PRODUCT_SIMILARITY 2,479 · COMMON_OWNER 1,391
  ISSUED_BY 254 · HELD_BY 250 · CLASSIFIED_AS 119 · MACRO_COMOVEMENT 25
  MEASURED_BY 20 · SUPPLIES 10 · CUSTOMER_OF 10

전량 격리 (14종)
  AFFECTS 616 · SAME_INDUSTRY 418 · SAME_THEME 410 · PEER_OF 174
  SUPPLY_CHAIN 169 · ROLLS_UP 129 · EXPOSES 107 · NEWS_COMENTION 68
  OWNS 64 · STAGE 38 · ACCELERATES 11 · DECELERATES 10 · DIVERGENCE 9 · CORROBORATES 1
```

서술어 온톨로지도 리비전 관리된다. 현재 **승인 11종 / 잠정 13종**이고, `relation_class` 는
CHECK 로 7종에 갇힌다(identity·causal·hierarchy·association·ownership·exposure·stage).
`causal` 3종(AFFECTS·ACCELERATES·DECELERATES)이 전부 잠정인 것은 의도다 — 인과 주장은
가장 비싼 주장이다.

---

## 4. PIT 규율 — 두 가지 vintage

시점 정확성(point-in-time)은 *"그날 우리가 알 수 있었던 것만 쓴다"* 는 규칙이다.
`available_at <= cutoff` 로 거르고, 남은 것 중 가장 큰 `vintage_date` 를 쓴다.

그런데 **출처가 두 종류다**, 그래서 vintage 도 두 종류다.

```
realtime          출처가 개정 이력을 준다 (FRED). 실제 vintage 축이 있다
approx_collected  출처에 개정 축이 없다 (ECOS). vintage_date = observation_date 로 둔다
```

두 번째가 왜 그런가는 `run-ecos-vintage.ts` 헤더 주석에 남아 있고, 여기 옮길 가치가 있다:
**수집일을 vintage 로 쓰면 매일 밤 전체 이력이 새 vintage 로 다시 들어간다.** 15,661행이
매일 복제된다는 뜻이다. 그래서 관측일을 vintage 로 삼고, 대신 `vintage_quality` 컬럼에
*"이것은 근사다"* 를 명시한다. 개정 탐지는 별도로 한다 — 저장된 값과 새로 받은 값을 비교해서
달라진 것만 새 행으로 넣는다.

```
market.macro_vintage 77,234행 (2026-08-07)
```

**한 축이 없다는 사실을 데이터로 표현하는 것**이 이 설계의 요점이다. 없는 축을 있는 척하지 않고,
컬럼 하나로 "이 값의 vintage 는 근사"라고 적어둔다. 하류가 그것을 알고 쓸 수 있다.

---

## 5. 투영과 **두 개의 독립된 예산**

수용된 엣지가 사용자에게 닿는 길은 **둘**이고, 서로 다른 예산을 쓴다. 이 분리를 모르면
한쪽만 고치고 고쳤다고 착각한다 — 실제로 2026-08-07 에 그렇게 프로덕션을 깼다.

```
팩 경로     relation-graph-projector-v2 를 읽는다
            받는 서술어는 셋뿐 — SAME_ETF_BASKET · PRODUCT_SIMILARITY · COMMON_OWNER
            예산 PROJECTION_ITEM_BUDGET = floor(CONTENT_PACK_MAX_ITEMS × 0.9) = 460

경로 경로   analytics.graph_snapshot_edge 를 읽는다. 서술어 제한 없음
            예산 MAX_PATHS_PER_EVENT = 20 + 술어 라운드로빈
```

### 독립이라는 것의 실측 증명

```
2026-08-07 · 임팩트 경로 스텝의 서술어 분포

SAME_ETF_BASKET     112,555   → 팩에도 기여
PRODUCT_SIMILARITY  108,383   → 팩에도 기여
COMMON_OWNER          2,584   → 팩에도 기여
─────────────────────────────
CLASSIFIED_AS        23,384   → 팩 기여 0
MACRO_COMOVEMENT      5,849   → 팩 기여 0
HELD_BY               3,204   → 팩 기여 0
MEASURED_BY           2,895   → 팩 기여 0
```

**경로에 쓰인 7종 중 4종(35,332 스텝)이 팩에는 한 항목도 안 만든다.** 그러므로
팩 쪽 지표가 멀쩡한 것은 경로 쪽이 멀쩡하다는 증거가 아니다. 역도 같다.

### 팩 예산이 이 모양인 이유

`content-pack-publisher.ts` 는 상한을 넘는 팩을 **자르지 않고 거부한다.** 주석이 그 이유를
적어뒀다 — *"조용히 짧은 팩을 발행하는 것은 계보가 조용히 버려진 주장을 서빙하는 것"*.
거부가 옳다면 **자르는 결정은 투영에서 내려야 한다.** 그래서 예산이 투영에 있다.

0.9 배인 이유도 측정에 있다: 투영이 예산을 쓸 때 쓰는 엣지별 합은 **과대계상**이고
(id 는 하류에서 dedup 된다), depth1 이 따로 뽑힌다. 여유가 필요하다.

선택은 라운드로빈이다 — 술어 조합별 버킷을 만들고 돌아가며 뽑는다.
`impact-path-builder.ts:206-263` 이 같은 문제를 먼저 풀었고 그 패턴을 이식했다. 그쪽 주석이
문제를 잘 적어뒀다: UAL 사건 하나가 SAME_ETF_BASKET 68개(신뢰도 0.800)와
MACRO_COMOVEMENT 2개(0.391)를 갖고 있으면, 점수순 상위 20은 **전부** "같은 ETF"가 되고
*나머지 19가 설명하지 못하는 것을 설명하는* 거시 엣지는 영원히 안 뽑힌다.

**중요: 라운드로빈은 신뢰도를 건드리지 않는다.** 신뢰도는 측정값으로 남고 선택만
다양성을 본다. 근거보다 높이 승격되는 것이 없다.

### 실측 — 예산이 물려 있다

```
2026-08-07 · 최근 발행 팩 612개
  중앙값 259 · p95 457 · 최대 460

최대 460 = floor(512 × 0.9) 정확히 예산값
```

상한 512에 닿는 팩은 없다. 그리고 **512는 DB 제약이 아니다** — 마이그레이션 026 의
`guard_content_pack_write` 는 `item_no` 1..N 연속성과 다이제스트 일치만 강제하고
**개수 상한은 없다.** 512는 `content-pack-publisher.ts:40` 의 앱 상수다.
(이 사실을 나는 한 번 틀리게 적었다가 실측으로 정정했다. §12)

### 스냅샷은 봉인된다

```
graph_snapshot 37 · status=sealed · edges 7,059 · entities 691
builder_version  v2-publish:f2ec673:2026-08-07:f1
snapshot_digest  f2f1baef…
```

`builder_version` 에 **커밋 해시·날짜·슬롯**이 박힌다. 어떤 코드가 이 스냅샷을 만들었는지
스냅샷 자신이 안다. 재현 가능성이 메타데이터가 아니라 키의 일부다.

---

## 6. 모델 설정이 증거의 일부다

상관 엣지 하나가 만들어질 때, **그 값을 만든 설정이 함께 인용된다.** `builders/macro-comovement.ts`
주석이 규칙을 명시한다 — *"a correlation without the configuration that produced it cannot be re-run"*.

그래서 `MACRO_COMOVEMENT_MODEL_CONFIG` 는 단순 상수가 아니라 증거로 인용되는 레코드다.
2026-08-07 에 한국 시장 팩터를 바꿀 때 **SQL 만 바꾸면 안 되는** 이유가 이것이었다:
config 에 "어떤 KR 팩터를 썼는가"를 식별하는 필드가 아예 없었다. 그대로 SQL 만 바꿨다면
KR 엣지가 *자기가 쓰지 않은 팩터를 기술하는 config* 를 증거로 인용하게 된다.
그래서 `marketFactorByMarket` 필드를 먼저 만들고 그다음에 SQL 을 바꿨다.

교체 자체는 **거래가 아니라 정정**이었다. 이전 KR 시장 팩터는 *통제 대상인 바로 그 종목들의
평균*이었다. 자기 자신을 통제한 셈이다. KOSPI(ECOS `802Y001/0001000`)로 바꾼 뒤:

```
2026-08-07 · 종목-시장 상관 전후 (원장의 옛 리비전과 비교)
  7종목 중 6종목 하락 · 상승 0
  서울보증보험  0.545 → 0.212
  047050        0.541 → 0.313
  사라진 엣지 3개는 부풀려져서 생겼던 것
```

**엣지가 줄어든 것이 개선이다.** 이 판단이 가능했던 유일한 이유는 원장이 옛 리비전을
보존하기 때문이다(§3).

KOSPI 는 **팩터로만** 쓰고 `analytics.macro_series_topic` 에는 넣지 않는다. 넣으면 상관 대상
시리즈가 되어 KR 종목과 자기상관을 만든다. 역할 분리가 코드에 명시돼 있고
`market-factor-declaration.test.ts` 가 지킨다.

---

## 7. 서빙 경로

### 팩은 "유일한 형태"가 아니다 — 두 표면에서만 유일하다

이 오해를 먼저 깨야 한다. 팩을 거치는 표면은 **둘**이다.

```
entity_relation_graph   web/routes/api/entities/$entityKey/relations.ts:71
                        → api-server/read/research-workspace.controller.ts:163
                        → relations/entity-relation-adapter.ts:184
                        → relations/graph-read-model-v2.ts:78  getServableContentPack

impact_brief            api-server/read/product.controller.ts:50
                        → product/read-model.ts:324  같은 getServableContentPack
```

나머지 화면은 팩을 우회해 `serving.*` 뷰를 직접 읽는다 — 피처 스냅샷·시장 확인·예측
스코어카드·종목 유니버스·최신가·워터마크 등 **11개 지점**. 크립토는 아예 다른 스키마
(`crypto_serving.*`)를 읽는다.

다만 우회가 완전한 우회는 아니다. `serving.impact_summary_v2` 는 **뷰 내부에서 팩을 조인한다**
(마이그레이션 059). 059 주석이 이유를 적었다 — *"제품이 실제로 서빙하는 것에 맞춰 범위를
잡았다. 그래야 확인(confirmation)과 impact brief 가 어느 스냅샷이 라이브인지를 두고
불일치할 수 없다."*

### latest 는 포인터가 아니라 읽기 시점 계산이다

팩에는 latest 포인터 표가 없다. 읽을 때마다 계산한다:

```sql
WHERE pack_kind=$1 AND entity_id=$2 AND servable = true
ORDER BY built_at DESC LIMIT 1
```

`servable` 은 뷰의 계산식이다 — `status='published' AND snapshot.status='sealed' AND fresh_until > now()`.
**세 조건이 동시에 참이어야 서빙된다.**

흥미로운 대조: 이 레포는 포인터 패턴을 **갖고 있으면서 팩에는 안 썼다.**
`serving.latest_report_pointer` 는 실제 표이고 `ON CONFLICT DO UPDATE` 로 스왑된다.
팩은 계산, 리포트는 포인터 — 의도적으로 다르다.

### 교체(supersede)는 kind 안에서만 원자적이다

```sql
UPDATE serving.content_pack SET status='superseded'
 WHERE pack_kind=$1 AND status='published' AND graph_snapshot_id <> $2
```

`pack_kind` 와 `graph_snapshot_id` **둘 다** 조건인 이유가 주석에 있다 — kind 만으로 걸면
*방금 이 런이 발행한 팩*을 죽이고, kind 를 빼면 *다른 퍼블리셔의 팩*을 죽인다.
그래서 `packKind` 가 모듈 상수가 아니라 필수 파라미터다.

**kind 사이는 원자적이 아니다.** 두 퍼블리셔가 래퍼의 별개 스테이지다. 두 COMMIT 사이
구간에서 `entity_relation_graph` 는 스냅샷 N 을, `impact_brief` 는 아직 N−1 을 서빙한다.

```
2026-08-07 측정
  entity_relation_graph  published 317 · superseded 9,920
  impact_brief           published 295 · superseded 6,553
  v_relation_graph_freshness  servable 612 / total 17,085
```

### 026 가드가 실제로 강제하는 것

`guard_content_pack_write` 는 상태 기계를 DB 안에 박아 넣는다:

```
INSERT      status 는 반드시 'building', published_at 은 NULL,
            그리고 대상 스냅샷이 'sealed' 여야 한다 (FOR SHARE 로 잠그고 읽는다)
DELETE      전면 금지 — append-only
UPDATE      status·published_at 외 전 필드 불변
            (pack_kind·entity_id·graph_snapshot_id·builder_version·pack_digest·
             item_count·built_at·fresh_until·metadata)

building → published  네 겹 검사
  ① published_at 필수
  ② 스냅샷이 여전히 sealed
  ③ item_no 가 1..item_count 로 조밀 + 개수 일치
  ④ 서버가 다이제스트를 재계산해서 대조 (JSONB 를 키 정렬 COLLATE "C" 정규화 후 sha256)

building → failed · published → superseded  만 추가 허용. 그 외 전이는 예외
```

**개수 상한은 없다.** ③은 연속성이지 상한이 아니다. §5 에 적은 대로 512는 앱 상수다.

**정정: item 가드는 026 이 아니라 031 이 소유한다.** `guard_content_pack_item_write` 는
마이그레이션 031(truth kernel)이 `CREATE OR REPLACE` 로 교체했고, 라이브 함수 본문이
031 버전이다. 031 이 추가한 조건이 하나 있다 — **모든 팩 항목은 `sealed` derivation 을
정확히 하나 가져야 한다.** 026 의 "앵커가 같은 스냅샷에 속할 것"(4가지 앵커 타입별 분기)은
그대로 보존됐다.

### 읽히지 않는 뷰 7개 — 그리고 감사가 이것을 못 잡는다

`serving` 스키마는 뷰 18 + 기본 표 4다. 앱 SQL 리더를 실제로 세어보면:

```
읽히는 뷰 11 · 읽는 코드가 없는 뷰 7
  impact_summary_v1 · latest_split_factor_v1 · relation_current_v1
  v_geo_entity_exposure_v1 · v_pit_universe_current_v1
  v_truth_assertion_pit_v1 · v_world_event_current_v1
```

**`run-table-reachability-audit` 은 `pg_tables` 만 스캔한다. 뷰는 감사 대상이 아니다.**
그래서 이 7개는 어떤 게이지에도 안 잡힌다. §10 의 탐지기 층에 실재하는 구멍이다.

---

## 8. 인증과 경계 강제

### HMAC internal context — 무엇에 묶이는가

BFF 는 요청마다 토큰을 서명해 `x-internal-user-context` 헤더로 보낸다.

```
MAC = HMAC-SHA256(secret,
        도메인상수 ‖ subject ‖ \0 ‖ iat ‖ \0 ‖ exp ‖ \0 ‖ METHOD ‖ \0 ‖ path)
와이어  <subject>.<iat>.<exp>.<mac>
```

필드마다 NUL 구분자가 들어간다 — 연접 모호성 방지다. **MAC 도메인이 둘로 갈려 있다**
(`internal-user-context:v1` / `internal-anon-context:v1`). 익명 토큰을 같은 method+path 의
사용자 토큰으로 재사용할 수 없다.

가드는 **글로벌**이다. 화이트리스트는 `/health` 와 `/v1/meta` 둘뿐이고 나머지 전 라우트가
유효한 서명을 요구한다. 시계 오차 허용치는 **0** — `now < iat` 이면 거부한다.

### 재생 방어는 부분적이다 — 정확히 적어야 한다

```
방어됨    다른 경로·메서드로의 전용 (path·method 가 MAC 에 들어감)
          만료 후 사용
          익명 ↔ 사용자 교차 위조

방어 안 됨  유효창 안에서 동일 method+path 재사용 — nonce/jti 가 없다
           쿼리 파라미터 치환 — 쿼리스트링은 서명 대상이 아니다
```

두 번째는 코드가 의도적으로 그렇게 했고 저장소 자신의 테스트가 그것을 명시한다
(*"accepts a query string without breaking path binding"*). 발급은 60초, 검증자는 **300초까지
수용**한다 — 시크릿을 가진 다른 발급자는 5분짜리 토큰을 만들 수 있다.

주석의 *"a captured header cannot be replayed against another route or after it expires"* 는
정확히 참이지만 **일반적 의미의 재생 방어가 아니다.** 이 구분을 흐리면 안 된다.

### 웹이 DB 를 못 만진다 — 테스트가 강제한다, 린트는 아니다

강제 지점은 `apps/web/test/no-database-coupling.test.ts` 하나다. 헤더가 목적을 밝힌다 —
*"이 테스트가 깨지면 분리가 퇴행한 것이고, apps/web 을 배포하면 프론트엔드를 돌리는
호스트에 DB 자격증명을 실어 보내게 된다."*

여섯 단언: `@stock-insight/api` 임포트 금지 · `pg` 임포트 금지 · package.json 의존성 금지 ·
`DATABASE_*_URL` 문자열 금지 · **서명 함수 사용을 `server/brain-client.ts` 한 파일로 제한** ·
`pages`/`features` 에서 internal-context 임포트 금지.

실측으로 위반 0건이다. 배포 쪽도 별도로 잠근다 — prod compose 의 app 서비스에 DSN 도
research 네트워크도 없다.

**그런데 강제에 구멍이 있다:**

```
탐색 범위가 apps/web/src 뿐    apps/web/test·vite/nitro 설정은 검사 안 함
정규식이 작은따옴표 정확 매칭   큰따옴표·서브패스·동적 임포트는 통과
tsconfig 별칭이 살아 있다      "@stock-insight/api": ["../api/src/index.ts"]
린트 규칙 없음                 .oxlintrc.json 에 no-restricted-imports 계열 0건
```

즉 이 불변조건은 **정규식 하나에 걸려 있다.** 지금 지켜지고 있다는 것과 지키게 되어 있다는
것은 다르다.

### 부팅 시 DB 정체성 검증 — 이 층에서 가장 촘촘한 가드

api-server 는 `listen` **이전에** 접속 롤을 검증하고, 실패하면 프로세스가 죽는다.

```
DSN 강제     reader DSN 은 default_transaction_read_only=on 을 반드시 실어야 한다
             writer DSN 은 startup options 를 실을 수 없다
             (적대적 -c search_path=... 가 카탈로그 헬퍼를 가릴 수 있으므로)

정체성       DB 가 지정 클러스터의 research_app 인가 (system_identifier 대조)
             롤이 정확히 stock_insight_app_reader / _app_writer 인가
             session_user 까지 같은가 — SET ROLE 위장 차단
             슈퍼유저·BYPASSRLS·CREATEROLE·CREATEDB 아님

다이제스트   도달 가능 롤 · 관계 권한 · 컬럼 권한 · 시퀀스 · 스키마
             RLS 계약 · SECURITY DEFINER 함수 본문   ← 7종을 해시로 핀 고정
```

**RLS 정책과 SECURITY DEFINER 함수 본문까지 해시로 고정한다.** 누가 DB 에서 정책을 바꾸면
다음 부팅이 거부된다. 테스트가 단일 필드 변이를 전수로 거부하는지까지 확인한다.

단, **조건부다** — `liveDatabaseExpected` 도 아니고 write URL 도 없으면 검증 전체가 no-op 다.

### 읽기 트랜잭션

```
BEGIN READ ONLY  (또는 REPEATABLE READ READ ONLY)
  set_config('stock_insight.user_id', $1, true)   ← true = 트랜잭션 로컬
  statement_timeout 10s · lock_timeout 1s
  ... 쿼리 ...
ROLLBACK                                           ← 항상 롤백으로 끝난다
```

스코프는 **요청에서만** 온다. 주석이 명시한다 — *"ambient/server-owned fallback user id 는
없다."* 스코프드 클라이언트는 정규 UUID 없이는 만들어지지 않는다.

빈 문자열이 들어가도 fail-open 이 아니다: RLS 술어가 `nullif(current_setting(...), '')::uuid`
라서 빈 값은 NULL 이 되고 0행으로 닫힌다.

> 이름 주의: **`unscopedRowQuery` 는 이름과 달리 스코프가 걸린다.** 공유 시장 데이터 읽기도
> 호출자의 검증된 스코프 아래에서 돈다. 오해를 막는 것이 주석뿐이다.

### 가입은 SECURITY DEFINER 함수 하나가 원자적으로 처리한다

`public.consume_invitation_and_create_account` (마이그레이션 030). 보장하는 것:

```
advisory lock + FOR UPDATE   used_count 검사-증가가 동시성 안전
5행 원자 생성                 identity_map · users · bootstrap_state · local_accounts · consumptions
password_record 형식 강제      ^scrypt\$v=1\$N=16384\$r=8\$p=1\$…$  ← KDF 파라미터를 DB 가 본다
username 충돌 시 초대 미소진   unique_violation 을 잡아 'username_taken' 반환, 블록 롤백
PUBLIC 에서 EXECUTE 회수       writer 롤에만 부여
```

**scrypt 파라미터를 DB 가 정규식으로 검증한다**는 점이 특이하다. 약한 KDF 로 만든 레코드는
애플리케이션이 아무리 실수해도 저장되지 않는다.

> **한 가지는 주석이 주장하는 만큼 봉인돼 있지 않다.** 로그인 조회는 RLS 정책
> `current_setting('stock_insight.login_lookup') = 'on'` 으로 열린다. 마이그레이션 030 주석은
> *"PUBLIC 에서 회수된 그 함수들만 커밋되는 트랜잭션에서 이 플래그를 세울 수 있으므로,
> 어떤 평범한 쿼리 경로도 사용자를 가로질러 읽을 수 없다"* 고 주장한다.
>
> **측정된 것**: 이 GUC 설정 권한을 제한하는 GRANT/REVOKE 가 전 마이그레이션에 없다.
> **측정되지 않은 것**: reader 롤이 실제로 이것을 직접 `SET` 할 수 있는지는 확인하지 않았다.
> 즉 이 불변조건은 현재 **"모든 읽기 SQL 이 파라미터화돼 있고 이 GUC 를 안 건드린다"는
> 코드 규율에 의존**하며, DB 권한으로 봉인된 것으로 보이지는 않는다.
> §8 의 웹 경계(정규식 하나)·§12 의 `STOCK_INSIGHT_USER_ID` 와 같은 부류다.

scrypt 프리미티브는 brain 이 단독 소유한다(N=16384, r=8, p=1). 계정이 없어도 더미 레코드로
**항상 한 번의 scrypt 비용을 지불**한다 — 응답 시간으로 username 을 열거할 수 없게.

세션 쿠키는 `__Host-` 접두 + HttpOnly + Secure + SameSite=Strict + Path=/ 이고,
발급과 폐기가 같은 상수를 공유해서 두 경로가 어긋날 수 없다.

세션 서명키는 credential fingerprint 에서 유도된다. 지문 재료에 `password_record` 가 들어가서
**비밀번호가 바뀌면 기존 세션이 전부 검증 실패**한다. TTL 캐시가 아니라 in-flight 중복제거만
있으므로 반영에 지연이 없다.

> **다만 비밀번호 회전 경로가 코드에 없다.** `password_record` 를 바꾸는 엔드포인트도
> 서비스 함수도 SQL 도 저장소 전체에 없다. 무효화 성질은 유도식상 참이지만 **제품 표면에서
> 도달 불가능**하다. CLAUDE.md 의 "rotating a password invalidates previously issued sessions"
> 는 현시점 as-built 와 어긋난다. (§12)

---

## 9. 오케스트레이션

### `pipeline_common.sh` — 왜 이렇게 생겼는가

파일 상단이 설계 이유를 적어뒀고, 그것이 이 층의 성격을 규정한다:

> 래퍼의 모든 가드 호출이 `pipeline_foo ... || exit $?` 모양이다. **bash 는 `||` 왼쪽 명령에
> 대해 ERR 트랩을 돌리지 않는다** — 명세된 동작이지 버그가 아니다. 그래서 래퍼의 `trap ... ERR`
> 은 실제로 일어나는 실패에서 절대 발화하지 않는다. (`set -E` 는 도움이 안 된다. 그건 트랩이
> 함수 *안에서* 발화하는지를 정할 뿐 `||` 가 억제하는 것과 무관하다. 양쪽 다 검증했다.)

결론이 `PIPELINE_CURRENT_STEP` 전역이다. 모든 함수가 진입점에서 자기 이름을 적어두고,
실패 시 그 이름이 감사 행에 박힌다.

각 함수가 보장하는 것:

```
pipeline_acquire_lock          호스트 단위 flock. 경합 시 75로 조용히 종료
                               DB 레벨 보장 아님 — 다른 호스트는 못 막는다

pipeline_start_wrapper_attempt 시도 행 + 능력 토큰
                               openssl rand 로 토큰을 만들고 sha256 해시만 DB 에 남긴다
                               code_commit · config_hash · source_tree_hash 를 함께 못박는다

pipeline_record_stage_success  스테이지는 성공 시에만 행을 남긴다
                               → 실패한 스테이지는 자기 행이 없다 (아래 조용한 실패)

pipeline_require_db_assertion  SQL 이 정확히 '1' 을 반환해야 통과
                               워커의 종료 코드가 아니라 DB 에 실제 남은 상태를 본다

pipeline_resolve_provenance    ROOT 가 git 최상위와 일치하는가
                               스크립트가 추적 대상인가 (git ls-files --error-unmatch)
                               source_tree_hash = 추적된 전 파일의 sha256 체인
```

### 워킹 트리가 바뀌면 그 실행은 completed 로 닫히지 못한다

완료 UPDATE 의 WHERE 절이 **시작 시 기록한 commit·config·source_tree·repo_root·wrapper_script
가 지금 것과 전부 같을 것**을 요구한다. 다르면 0행 매칭이고 주석이 그것을 설명한다:

> 완료 UPDATE 가 아무 행도 못 맞췄을 때 도달한다. 보통 원인은 프로버넌스 가드다 —
> 시작 시 기록한 소스 트리 해시가 더 이상 일치하지 않는다. 즉 **파이프라인이 도는 동안
> 워킹 트리가 바뀌었다.**

§1 에 적은 "파일 편집이 곧 배포"가 여기서 안전장치를 만난다. 실행 중 편집은 그 실행을
성공으로 닫지 못하게 한다.

### fencing token

```
ops.claim_pipeline_run  SECURITY DEFINER
  pg_advisory_xact_lock(hashtextextended(natural_run_key))   키 단위 직렬화
  SELECT ... FOR UPDATE
  없음                       → INSERT, token=1
  claim_status='completed'   → claimed=false 즉시 반환   ← 같은 키 재실행 차단
  failed/expired/리스 만료    → takeover, token += 1
  그 외 (활성 claim)          → claimed=false
```

갱신·완료 UPDATE 가 `claimed_by AND fencing_token AND status='claimed' AND lease > now()` 를
모두 요구한다. 리스가 만료돼 토큰이 오른 뒤 늦게 돌아온 옛 소유자는 0행 → `false`.
호출측이 이를 치명으로 처리하고 **COMMIT 이전에** throw 하므로 트랜잭션 전체가 롤백된다.

같은 날 재실행: `natural_run_key` 가 `v2-graph-publish:<날짜><접미사>` 다. 접미사 없이 두 번
돌리면 `completed` 분기에 걸려 no-op. 의도적 재실행은 `STOCK_INSIGHT_SLOT_SUFFIX` 로 새 키를
만든다. readback 도 이에 맞춰 **접두 매칭**을 쓴다 — 정확히 일치를 요구하면 지원되는 재실행이
자기 readback 에서 실패하기 때문이다.

### outbox — 선언과 구현이 갈라진 곳

```
2026-08-07 측정
  ops.outbox_event    4,751   전부 producer='raw-object-store'
                              전부 event_type='source.revision.appended'
  ops.outbox_delivery 4,746
  ops.dead_letter         0
```

**실제 프로덕션 writer 는 DB 트리거 하나뿐이다.** `ingestion.source_revision` INSERT 마다
발화하는 트리거가 유일하게 이벤트를 넣는다. TypeScript `insertOutboxEvent` 는 계약이 잘
적혀 있지만 **프로덕션 호출자가 0개**다 — 호출자가 전부 테스트다.

그리고 `pipeline-registry.ts` 가 선언한 두 엣지(`relation_ledger → outbox_event`,
`content_pack → outbox_event`)는 **라이터가 없다.** 레지스트리 헤더가 스스로를
*"미래의 Dagster(혹은 어떤 오케스트레이터)가 읽을 단일 진실 원천"* 이라 규정하므로,
선언과 구현의 괴리다.

배달은 목적지 하나(`consumer_inbox:selective-recompute`)로 간다. 헤더가 범위를 명시한다 —
*"Kafka 대체재가 아니다. 긴 보존 재생 / 다수 독립 소비자 / 고처리량이 필요하면 로그 브로커가
필요하다"*. 최대 8회 시도, 백오프 30s→1920s, 소진 시 `dead` + `ops.dead_letter` 기록이
**상태 전환과 같은 트랜잭션**에서 일어난다. `dead_letter` 는 UPDATE/DELETE 거부 트리거로 불변.

잔여물이 있으면 잡이 죽는다 — 미배달 > 0 이거나 미해결 dead > 0 이면 throw.

### 타이머 6개와 입력 게이트 2개

```
ohlcv              07:10 KST 일간      게이트 없음 (네트워크 프로브만)
news               30분마다             게이트 없음
knowledge          2시간마다 :45        knowledge-input  ← rss-ingest 가 2시간 내 completed
market-enrichment  05:20 KST 일간      게이트 없음
analytics          07:45 KST 일간      analytics-input   ← 아래
fundamentals       일요일 03:30 KST     게이트 없음
```

전부 `Persistent=true`.

**선행 래퍼에 의존하는 진짜 입력 게이트는 둘뿐이다.** 나머지의 `pipeline_require_db_assertion`
은 자기 출력을 검증하는 사후 readback 이고, 선행 조건은 네트워크 프로브뿐이다.
**나머지 결합은 시각 결합**이다 — 07:10 이 07:45 보다 먼저라는 것 외에 강제가 없다.

`analytics-input` 이 요구하는 것:

```
각 래퍼의 최신 시도가 completed 이고
  ohlcv-wrapper              36시간 내
  knowledge-wrapper           4시간 내
  market-enrichment-wrapper  36시간 내
```

`DISTINCT ON (job_name) ... ORDER BY started_at DESC` 이므로 **최신 시도만** 본다.
과거에 성공한 적 있음으로는 통과하지 못한다.

> as-built 특이사항: **`stock-insight-knowledge.timer` 만 타임존 지정이 없다.**
> 나머지 다섯은 `Asia/Seoul` 을 명시한다. analytics 의 4시간 창 대비 위상이 호스트 TZ 에
> 의존한다.

### 스테이지 순서는 사고의 결과다

`run_analytics_pipeline.sh` 주석:

> 2026-08-03 에 뉴스 헤드라인 하나가 run-report-publish 의 action-advice 게이트에 걸렸는데,
> 리포트 발행이 파일 앞쪽에 있었기 때문에 `set -e` 가 파이프라인 전체를 같이 죽였다 —
> **제품이 서빙하는 모든 임팩트 경로를 포함해서. 거부된 리포트 블록 하나가 그래프를 멈춘 것이다.**

그래서 지금 v2 publish 가 report publish 보다 **앞에** 있다. 순서는 취향이 아니라 사고 기록이다.

---

## 10. 탐지기 층 — 이 시스템에서 가장 특이한 설계

대부분의 시스템은 기능을 짓고 테스트를 붙인다. 이 시스템은 **"선언됐지만 아무도 안 쓰는 것"을
찾아내는 층**을 따로 갖고 있다. 잡이 배선 안 된 것, 표가 안 읽히는 것, 출처에 계약이 없는 것을
자동으로 찾는다. 이유는 명확하다 — **이 시스템의 지배적 실패 모드가 조용한 실패**이기 때문이다.

### 정합성·패리티 테스트 15종 (`apps/api/test/`)

```
job-wiring-inventory          잡이 선언됐는데 어느 파이프라인도 안 부르는가
analytics-pipeline-order      단계 순서가 스크립트와 어긋나는가
source-contract-integrity     활성 출처에 계약이 없는가
identity-issuer-integrity     발행 실체와 식별자가 어긋나는가
relation-ledger-integrity     원장 불변조건
impact-path-step-integrity    경로 스텝이 실재 엣지를 가리키는가
macro-series-list-parity      계열 목록이 수집기·모델·DB 셋에서 같은가
market-factor-declaration     팩터가 선언됐고 상관 대상과 겹치지 않는가
claim-quote-binding-parity    인용문 검증과 결합 규칙이 같은 문자열을 보는가
news-pit-integrity            뉴스가 PIT 를 지키는가
ohlcv-integrity-contract      가격 계약
knowledge-chunk-integrity     청크 무결성
event-attribution-wiring      사건 귀속 배선
event-topic-attribution       사건-주제 귀속
internal-source-attribution   내부 출처 귀속
```

### 감사 잡 3종 (`apps/api/src/ops/`) — 매일 돈다

테스트가 아니라 **잡**인 이유: 커버리지 단언을 테스트에 두면 DB 없는 환경에서 조용히 skip 된다.
그래서 밖으로 꺼내 파이프라인에 붙였고, 위반 시 종료 코드 0 이 아니다.

```
2026-08-07 실행 결과

run-table-reachability-audit
  소유 표 163 · 안 읽히는 표 33 (그중 31개는 비어 있음) · 승인된 예외 8
  행이 있는데 안 읽히는 표 2개(analytics.precompute_policy 3행, geo.crosswalk 3행)

run-source-contract-audit
  활성 출처 39 · 계약 39 · 미커버 0 · 승인 37 · 잠정 2 · 과도기 면제 6
  면제 6개는 전부 internal-*-snapshot (내부 스냅샷)

run-schema-migrations
  마이그레이션 77개. 체크섬은 실행할 SQL 원문에 대한 sha256
```

체크섬의 존재 이유가 주석에 있다 — *"적용된 뒤에 마이그레이션이 편집되는 것,
원장만으로는 볼 수 없는 유일한 실패. id 는 여전히 일치할 테니까."*
**이미 적용된 마이그레이션을 고치면 드리프트로 거부된다.** 새 마이그레이션을 써야 한다.

### 검증 스크립트 7종 (`ops/scripts/`)

```
verify-table-ownership · verify-systemd-units · verify-production-compose
verify-release-image-bundle · verify-edge-brain-routing
verify-research-app-restore · verify-research-app-pgbackrest-restore
```

복원 검증이 둘인 것에 주목할 만하다 — 백업이 있다는 것과 복원된다는 것은 다른 주장이다.

### 이 층 자체의 구멍 셋

탐지기 층을 설계로 소개했으니 **어디까지만 탐지하는지도 같이 적어야** 한다.

```
① 뷰를 스캔하지 않는다
   run-table-reachability-audit 은 pg_tables 만 읽는다
   → §7 의 안 읽히는 뷰 7개는 어떤 게이지에도 안 잡힌다

② reachability 는 실패시키지 않는다 — 게이지다
   파이프라인 주석: "지어졌는데 안 쓰이는 것은 지켜볼 백로그이지
   호출할 에러가 아니다" (소스 계약 감사는 반대로 실행을 실패시킨다)

③ 웹 경계는 정규식 하나에 걸려 있다
   apps/web/src 만 순회 · 작은따옴표 정확 매칭 · 린트 규칙 없음 (§8)
```

②의 비대칭에는 근거가 있고 주석이 적어뒀다 — *"안 읽히는 표는 백로그지만, ADR-002 근거
없는 승인된 계약은 **허가받지 않은 증거를 찍어내는 출처**다."*

### 규모

```
2026-08-07 · apps/api
  테스트 907 · 통과 862 · 실패 0 · skip 45 · 스위트 154
```

---

## 11. 실패가 드러나는 방식

**설계 문서가 실제로 유용해지는 지점이 여기다.** 이 시스템은 두 종류로 실패하고,
둘은 전혀 다르게 다뤄야 한다.

### 큰 실패 — 즉시 멈춘다

의도적으로 만든 가드들이 여기 속한다. 2026-08-07 에 두 번 발화했고 **둘 다 옳은 발화**였다:

```
predicate HELD_BY reaches impact paths but has no product wording
predicate COMMON_OWNER reaches impact paths but has no product wording
```

사용자에게 보일 엣지인데 사람이 읽을 문구가 없다 → 파이프라인 정지. 문구를 계약 enum·서버
맵·웹 레이블 셋에 넣고서야 통과했다. `job-wiring-inventory` 도 같은 날 배선 안 된 수집기를
잡았다. **이 실패들은 좋은 실패다.** 크게 터지고 원인을 스스로 말한다.

팩 발행의 거부도 같은 부류다 — 상한 초과 시 자르지 않고 `pack US:AAPL exceeds lineage item
cap: 672` 로 죽는다.

### 조용한 실패 — 이것이 진짜 위험이다

정본 사례가 2026-08-07 지식 파이프라인 중단이다.

```
증상   knowledge.claim 이 id 348 에서 멈춤. 그런데 에러는 349·350 을 지칭
원인   검증은 앞 40자를 대소문자 구분해서 봤고
       결합은 인용문 전체를 대소문자 무시하고 요구했다 — 같은 문자열을 다르게 본 것
발견   알림이 아니라 측정. "왜 claim 이 안 늘지" 를 물어본 사람이 찾았다
       중단 시각 01:46, 발견 02:09 이후
```

**알림은 이것을 못 잡는다.** 잡은 성공으로 끝났다. 행이 안 늘었을 뿐이다.
지금은 `claim-quote-binding-parity.test.ts` 가 두 규칙이 같은 문자열을 보도록 강제한다.

```
2026-08-07 현재 복구됨 — knowledge.claim max_id 361 / 356행 (348에서 재개)
```

### 조용한 실패의 목록 — 실측으로 확인된 것

같은 부류가 이 시스템에 **여덟 군데** 있다. 순서는 위험한 순이다.

**① 락 경합은 감사 행 자체를 안 남긴다.** `pipeline_acquire_lock` 이 75로 종료하는데,
시도 행을 만드는 `pipeline_start_wrapper_attempt` 는 **락 획득 이후에** 호출된다. 그래서
경합으로 건너뛴 실행은 `migration_runs` 에 아무 행도 없다 — 실패도 성공도 아닌 무(無)다.
모든 타이머가 `Persistent=true` 라서 놓친 실행이 부팅 시 몰려 같은 락으로 들어갈 수 있다.
**이 층에서 가장 조용한 실패다.**

**② 뷰가 구조적으로 비는데 제품이 0을 측정값으로 읽는다.** `impact_summary_v1` 은
2026-07-19부터 **설계상 0행**이었다. 게이트가 모든 경로 엣지를 `relation_current_v1` 로
해소하라 요구하는데 그 뷰는 `ISSUED_BY` 만 노출하고, v1 경로 생산자는 그 서술어를 안 낸다.
마이그레이션 059 주석이 결과를 적었다 — *"소비자가 함께 옮겨지지 않아서, 제품은 빈 표를
계속 LEFT JOIN 하며 **0을 측정값인 양 읽었다**."* 아무것도 실패하지 않았다.

**③ 어댑터가 조용히 건너뛴다.** 팩 항목의 페이로드가 zod 검증에 실패하거나, 루트 키·깊이가
안 맞거나, 신선도가 `available` 이 아니면 **다음 항목으로 넘어간다.** 전부 건너뛰면
`v2_no_data` 봉투가 만들어져 사용자에게는 *"확인된 관계가 없습니다"* 로 보인다.
에러가 아니라 정상 200 응답이다.

**④ 인용문 결합 불일치** — 바로 위에 서술한 지식 파이프라인 중단. 지금은 패리티 테스트가 막는다.

**⑤ 행 수는 정상인데 범위·모양이 틀린 경우.** 삽입 수가 멀쩡한 것은 옳음의 증거가 아니다.

**⑥ 드라이런이 건강해 보이는 경우.** ownership 드라이런은 "후보 1,641 · 격리 0" 을 보고했고
그 직후 실제 적용이 팩 상한으로 죽었다. 드라이런이 만든 투영에는 **그 런의 후보가 없었다.**

**⑦ 재실행이 no-op 인데 성공으로 보인다.** 슬롯 접미사 없이 같은 날 다시 돌리면 claim 이
`already_completed` 로 로그 한 줄 남기고 exit 0. 재실행했다고 믿은 사람에게는 성공이다.

**⑧ 주석이 낡는다.** `product.controller.ts` 주석은 `impact_summary_v1` 을 읽는다고 말하지만
코드는 `impact_summary_v2` 를 읽는다(059 이후). **as-built 문서를 주석 기반으로 쓰면
그대로 전파된다** — 이 문서가 코드와 DB 를 직접 잰 이유다.

### 두 mechanism 이 공존한다는 사실

파이프라인 실행 추적이 **한 가지가 아니다**:

```
ops.pipeline_run_claim 을 쓰는 것       analytics.l5_producers_v2
  (fencing token · natural_run_key)     serving.entity_relation_graph_v2

public.migration_runs 의 wrapper 행     ohlcv · knowledge · market-enrichment
```

`run_analytics_pipeline.sh` 의 `analytics-input` 단언이 후자를 읽는다 — 세 wrapper 잡이
36시간 내 `completed` 인지 확인하고 아니면 분석을 시작하지 않는다. **파이프라인 간 입력
게이트가 공유 표를 통해 걸려 있다.**

---

## 12. 짓지 않은 것 — 근거와 함께

*빠진 것을 TODO 가 아니라 **설계 상태**로 적는다. 게이트가 물고 있는 것은 결함이 아니다.*

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 격리 서술어 14종 | **의도된 상태** | 전부 마이그레이션 023 레거시 임포트, 증거 0. 승인해도 열리는 엣지 0 (실측) |
| 사건→테마 분류기 | **만들지 않는다** | 미귀속 576건 중 종목에 닿는 것 7건(1.2%). 근거 396엣지 100% 격리·증거 0. `theme_membership` 읽는 코드 0줄 |
| 법안 엔티티화 | **보류** | `legislative_action` 538건 중 유니버스 기업을 지명하는 것 **0건** |
| CUSIP / 13F 전체 확장 | **별도 프로젝트** | `identifier_type` CHECK 에 CUSIP 없음 + crosswalk 필요 |
| `public.entities` 이관 | **단위가 파일이 아니다** | 막는 조건 11개 중 9개가 같은 레거시 id 다리 하나. 쉬운 8개를 옮겨도 의존은 안 줄고 8파일이 바뀐다 |
| 안 읽히는 표 33개 | **탐지 중** | 31개는 비어 있음. 승인된 예외 8. 감사가 매일 재확인 |

COMMON_OWNER 는 켜져 있다. 단 **약한 신호라는 점이 측정돼 있다** — 13F 42종목 중 대형
인덱스 펀드 4곳이 모두 보유하는 것이 39개다. 즉 대부분의 쌍이 *"이 인덱스 펀드 넷이 X 와 Y 를
둘 다 갖고 있다"* 이고 미국 대형주 거의 전부에 참이다. `SHIPPED_OWNERSHIP_PREDICATES` 한 줄로
되돌릴 수 있다.

### 이 문서를 쓰며 발견한 드리프트 (고치지 않음 — 문서 작업이므로)

날짜 없는 문서가 어떻게 낡는지의 실물이다. **하나도 고치지 않았다** — 아래 참조.

| 위치 | 적힌 것 | 실측 |
| --- | --- | --- |
| `CLAUDE.md` | "db-schema (54 additive migrations)" | **77** |
| `CLAUDE.md` | "rotating a password invalidates previously issued sessions" | 유도식상 참이나 **회전 경로가 코드에 없다** (§8) |
| `CLAUDE.md` | 파이프라인 서술 | 타이머 6개 중 `fundamentals` 누락 |
| `e2e-layers.md` 부록 A | "L5 분석 · path/community/measurement **0건**" (2026-07-20) | impact_path **55,402** · graph_snapshot_edge **175,028** |
| `product.controller.ts` 주석 | "reads serving.impact_summary_v1" | 코드는 **v2** 를 읽는다 (059 이후) |
| `content-pack-publisher.ts` (이미 정정됨) | 과거 주석 "026 의 항목 상한과 일치" | **거짓이었다.** 512는 마이그레이션 전체에 0회 |
| `pipeline-registry.ts` | outbox 엣지 2개 선언 | **라이터 없음** (§9) |
| `outbox-store.ts` | `insertOutboxEvent` 계약 | **프로덕션 호출자 0개** — 전부 테스트 |
| `read-context.ts` 주석 | "ambient fallback user id 는 없다" | 데이터 라우트에 한해 참. pre-auth 경로엔 `STOCK_INSIGHT_USER_ID` 가 살아 있다 |

마지막 줄이 흥미롭다: `STOCK_INSIGHT_USER_ID` 는 **어떤 배포 파일에도 설정돼 있지 않아**
현재는 undefined 이고, 따라서 GUC 가 아예 안 세워져 RLS 가 0행으로 닫힌다. 위험은 잠재적이다
— 누가 그 변수를 설정하면 pre-auth 읽기가 고정 사용자 스코프로 돈다. 막는 코드는 없다.

> **왜 고치지 않았는가.** 이 세션의 요청은 설계 문서 작성이다. 타이머가 워킹 트리를
> 실행하므로 이 레포의 편집은 곧 배포이고(§1), 문서 요청에 코드·설정 변경을 끼워 넣지 않는다.
> 목록으로 남겨 다음 작업의 입력이 되게 한다.

---

## 부록 A — 2026-08-07 측정 전량

한 곳에 모아둔다. 이 문서의 다른 모든 수치는 여기서 왔다.

```
실체        core.entity 1,448 · core.entity_identifier 2,080
문서        knowledge.document 7,611 · knowledge.claim 356 (max_id 361)
원장        relation_evidence_ledger 64,699 · 서술어 24종 (승인 11 / 잠정 13)
            수용 있음 10종 / 전량 격리 14종
그래프      graph_snapshot_edge 175,028 · impact_path 55,402 · 스냅샷 37 (sealed)
            경로 스텝 서술어 7종 중 4종(35,332 스텝)은 팩 기여 0
서빙        content_pack 17,085 · content_pack_item 3,283,491
            servable 612 / 17,085 · 중앙값 259 · p95 457 · 최대 460 (예산 460)
            entity_relation_graph published 317 · impact_brief published 295
            serving 뷰 18 + 기본 표 4 · 읽는 코드 없는 뷰 7
시계열      market_ts.ohlcv 2,664,192 · market.macro_vintage 77,234
큐          outbox_event 4,751 · outbox_delivery 4,746 · dead_letter 0
            실제 writer 는 DB 트리거 1개 (producer 전량 raw-object-store)
스키마      표 1,171 (우리 1,068 / public 103) · 마이그레이션 77
테스트      907 (통과 862 · 실패 0 · skip 45) · 스위트 154
감사        소유 표 163 / 안 읽힘 33 (빈 표 31) / 예외 8   ※ 뷰는 스캔 안 함
            활성 출처 39 / 미커버 0 / 승인 37 / 잠정 2 / 면제 6
타이머      6 · 선행 래퍼 입력 게이트는 2개(knowledge · analytics)뿐, 나머지는 시각 결합
```

측정 방법은 재현 가능하다 — 전부 `docker exec research-app-postgres psql` 읽기 전용 조회와
`npx tsx apps/api/src/ops/run-*-audit.ts` 드라이런, 그리고 코드 직접 확인이다.
**주석을 근거로 삼은 항목은 없다** — §11 ⑧이 그 이유다.

---

## 부록 B — 이 문서를 유지하는 법

이 문서는 **재작성 대상이지 수정 대상이 아니다.** 수치가 낡으면 새 날짜로 새 파일을 만들고
이 파일은 그대로 둬라. 그래야 "2026-08-07 에는 이랬다"가 계속 참으로 남는다.

목표가 바뀌었을 때 고칠 문서는 `stock-insight-e2e-layers.md` 다. 이 문서가 아니다.

재측정에 쓸 조회는 본문 각 절에 인라인으로 들어 있다. 감사 두 개는 그대로 돌리면 된다:

```bash
export DATABASE_URL="$(grep -m1 '^DB_URL=' apps/api/scripts/run_analytics_pipeline.sh | cut -d= -f2-)"
npx tsx apps/api/src/ops/run-table-reachability-audit.ts
npx tsx apps/api/src/ops/run-source-contract-audit.ts
```
