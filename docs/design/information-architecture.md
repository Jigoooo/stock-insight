# 정보구조 — 정본 표면을 재설계된 화면에 어떻게 담는가

> 이 문서는 **무엇을 어느 화면 어느 깊이에 보여줄지**를 확정한다.
> 실제 배선은 K6(`serving.common_asset_view`)와 K7(Product Surface)에서 완성된다.
> **먼저 쓰는 이유**: 아래 §4 의 블록 배치표가 K6 빌더가 무엇을 담아야 하는지를 정한다.
> 이 표 없이 K6 를 만들면 화면이 안 쓰는 블록을 만들거나, 쓸 블록을 빠뜨린다.

## 1. 무엇이 충돌했고 어떻게 화해하는가

UI 는 사용자 중심으로 다시 짜였다 — 쓸데없는 정보를 걷어내고, 숨김 화면과 죽은 조합을
지우고, 중복 화면을 합쳤다(`90bde6c`, `bd4475e`, `55ad73e`, `484661e`).

정본 01 은 반대로 **필수 목록**을 규정한다. Market Home 필수 7섹션, Asset Deep Dive
above-the-fold 10항목 + 하위 섹션 11개, Theme 상태 7개와 필수 정보 7항목. 그리고
`status: FROZEN` 이다.

**화해 장치는 정본 자신이 갖고 있다.**

> `REQ-PROD-002` 초보/표준/연구 모드는 분석 결과가 아니라 **설명 깊이만** 바꾼다.

그래서 이 문서의 규칙은 하나다.

**정본이 요구하는 정보는 전부 도달 가능해야 하고, 재설계는 그것을 지우는 대신 깊이를
배정한다.** 기본 화면이 조용한 것과 정보가 없는 것은 다르다. 전자는 `REQ-PROD-002` 가
허용하고 후자는 `REQ-PROD-003`(처음 보는 종목도 5분 안에 파악)과 `REQ-PROD-021`
(비교 불가 KPI 를 명시)을 어긴다.

### 깊이 세 단계

| 깊이 | 뜻 | 기본값 |
| --- | --- | --- |
| `essential` | 아무 설정 없이 첫 화면에 보인다 | 초보·표준 공통 |
| `standard` | 한 번의 펼치기·탭 이동으로 닿는다 | 표준 이상 |
| `research` | research drawer / 상세 패널에서 닿는다 | 연구 모드 |

`research` 는 **숨김이 아니라 배치**다. 도달 경로가 없으면 그건 삭제이고 정본 위반이다.

## 2. 정본 표면 6개 → 현재 화면

| 정본 01 표면 | 현재 화면 | 상태 |
| --- | --- | --- |
| Market Home | `today` — 오늘의 투자 브리핑 · 주요 시장 지표 · 핵심 카드 뉴스 · 관심종목 큐레이터 뉴스 · 인사이트 분류 | **있음** |
| Asset Deep Dive | `stocks` (목록) → `entities/stock/ui/stock-detail` (상세) | **있음, 얕음** |
| Theme | 없음 — `themes` 라우트가 `radar` 로 리다이렉트 | **빠짐** |
| Discovery / Curation | `radar`(market-connections) — 내 종목에 영향을 줄 시장 변화 | **부분** |
| Research | 없음 — `research` 라우트가 `history` 로 리다이렉트 | **합쳐짐** |
| Personalization | `history`(판단 복기·진행 중 판단·자동 시장 관찰) + `stocks`(보유·관심) | **둘로 쪼개짐** |
| — | `status` — 데이터 신뢰도 · 기능별 신뢰도 · 부족한 정보 · 이용 시 주의점 | 정본에 없는 화면. §5 참조 |

**빠진 것은 Theme 하나뿐이다.** Research 와 Personalization 은 없는 게 아니라 다른
이름의 화면으로 합쳐졌고, 그건 `REQ-PROD-002` 가 막지 않는다 — 정본은 표면의 *계약*을
규정하지 화면 개수를 규정하지 않는다.

## 3. Theme — 유일하게 새로 필요한 표면

정본 01 §4 는 사용자에게 보여줄 상태 7개
(`FORMING / EMERGING / ACCELERATING / MAINSTREAM / CROWDED / WEAKENING / BREAKING`)와
필수 정보 7항목을 규정한다. 지금은 표면 자체가 없다.

재설계 원칙과 충돌하지 않는다 — theme 은 "쓸데없는 정보"가 아니라 `today` 의
"인사이트 분류"가 이미 부분적으로 하고 있는 일이다.

**결정: K7 에서 생산자까지 만든 뒤 별도 화면으로 낸다.**

배치보다 생산자가 먼저인 이유는 **생산자가 없기 때문**이다. 2026-08-10 실측:

| 확인 | 값 |
| --- | --- |
| `analytics.theme` | 138행, `created_at` 전부 **2026-07-18** |
| `analytics.theme_membership` | 396행, `valid_from` 전부 2026-07-18 |
| `maturity` | `emerging` 138 / 138 — 정본 7상태 중 1개 |
| `tier` | `adjacent` 396 / 396 — 대표·핵심·간접 중 1개 |
| 쓰는 코드 | **없음.** migration 013 과 reachability audit 에만 등장 |

`maturity` 는 계산된 적이 없다. `013_graph_analytics_foundation.ts` 의
`DEFAULT 'emerging'` 이 그대로 남은 것이고, **7상태 분류기도 tier 분류기도 존재하지 않는다.**
일회성 덤프를 화면에 그리면 23일 묵은 단일 상태 138개가 나온다.

살아 있는 것은 `theme.definition` 과 `theme_membership.rationale_relation_ids`(멤버십 근거)
둘뿐이다. K7 이 만들 것은 7상태 분류기와 tier 분류기이고, 정본이 "가격/실적/수급/attention
confirmation 을 분리" 하라고 요구하므로 confirmation 축 4개를 각각 도출해야 한다.

이 결정은 K6 에 영향을 주지 않는다. theme 은 정본 06 §2 의 12블록에 들어있지 않고
별도 원장(`theme constitution`, `membership`)에서 온다. **다만 §4 의 Discovery 이유
분류와는 커플링돼 있다** — theme 생산자 산출물이 `SAME_THEME` 후보를 낳고, 그게 정본 01 §5
이유 7종 중 한 칸이다.

## 4. 정본 06 §2 의 12블록 → 화면 × 깊이

**이 표가 K6 빌더의 계약이다.** `serving.common_asset_view` 는 아래 12블록을 전부 담고,
화면이 깊이에 따라 골라 쓴다. 빌더가 블록을 빠뜨리면 그 화면은 정본을 만족할 수 없다.

| # | 블록 (정본 06 §2) | 주 화면 | 깊이 | 대응 정본 01 §3 항목 |
| --- | --- | --- | --- | --- |
| 1 | identity/economic claim | stock-detail | `essential` | 1·2 (한 줄 설명, investable claim/ticker) |
| 2 | business/sector context | stock-detail | `essential` | 3 (sector/theme/value-chain 위치) |
| 3 | comparable financial/economic facts | stock-detail | `standard` | 6 (business drivers/KPI) |
| 4 | recent events and surprise | stock-detail · today | `essential` | 5 (최근 event와 expectation surprise) |
| 5 | expectation/priced-in | stock-detail | `standard` | 7 (valuation·market-implied) |
| 6 | exposure/impact | radar · stock-detail | `essential` | 하위 섹션 exposure/impact paths |
| 7 | valuation/market-implied state | stock-detail | `standard` | 7 |
| 8 | market reaction/tradability | stock-detail | `standard` | 하위 섹션 market reaction/positioning |
| 9 | multi-horizon thesis/scenario | stock-detail | `standard` | 8 (thesis·counter-thesis) |
| 10 | catalysts/risks/counter-evidence | stock-detail · today | `essential` | 9 (catalyst/risk/invalidation) |
| 11 | coverage/freshness/uncertainty | stock-detail(요약) · status(전체) | `essential`(배지) / `research`(상세) | 10 |
| 12 | derivation/release manifest IDs | research drawer | `research` | 하위 섹션 provenance/derivation research drawer |

**peer-relative position (§3 항목 4)** 은 12블록에 직접 대응하는 것이 없다. 블록 3
(comparable financial facts)에서 파생하되 `REQ-PROD-020`(차원별 rank + 정의·coverage)과
`REQ-PROD-021`(비교 불가는 `NOT_COMPARABLE`/`INSUFFICIENT_COVERAGE` 표시)을 지켜야 한다.
**K6 빌더는 비교 가능 여부와 coverage 를 블록 3 에 함께 실어야 한다** — 그것 없이는
화면이 `REQ-PROD-021` 을 만족할 수 없다.

### 블록 6 에 실어야 할 것 — Discovery 이유와 신호 강도

Discovery 이유 노출 자체는 K7 이지만(§9 결정 3) **서빙 계약은 K6 에서 넓혀야 한다.**
안 그러면 K7 이 서빙을 다시 손대게 되고, 배선을 두 번 한다.

`serving.relation_current_v1` 은 지금 `ISSUED_BY` 254행뿐이고 이유 분류 전체가
`knowledge.*` 에만 있다. K6 빌더가 블록 6 에 실을 것:

| 항목 | 왜 필요한가 |
| --- | --- |
| `predicate` | 정본 01 §5 의 이유 분류가 여기서 나온다 |
| `relation_kind` | `structural` / `statistical` 구분. `REQ-PROD-030` 의 근거 |
| `confidence` · `evidence_count` | 근거 강도 |
| **`revision_status`** | **승인/격리 구분.** 안 실으면 화면이 격리된 후보를 사실처럼 그린다 |
| 신호 강도 | `RELATION_BUILDER_POLICIES` 의 `relationClass`·`promotionEligible` 에서 파생. 강한 경제적 이유와 약한 연관(ETF·공통보유)을 가른다 |

`revision_status` 는 **필터가 아니라 라벨**이다. K6 는 격리 행을 빼지 않고 표시해서 내보내고,
소비자가 강한 이유 자리에 그리지 않는다. 두 단언을 하나로 합치면 서로를 깨뜨린다 — §10 참조.

## 5. coverage 를 어디에 둘 것인가 — `484661e` 의 재해석

`484661e`(keep coverage details internal)가 `status-view` 에서 196줄을 지웠지만
그 화면은 여전히 **데이터 신뢰도 · 기능별 신뢰도 · 부족한 정보 · 이용 시 주의점**을
갖고 있다. 지워진 것은 상세이지 coverage 자체가 아니다. 이미 깊이 모델에 가깝다.

정본이 요구하는 것과의 차이는 **위치**다. 정본 01 §3 은 coverage 를 **종목별
above-the-fold** 에 둔다. 지금은 전역 화면 하나에만 있다.

**결론:** 둘 다 둔다.
- 종목 상세에 `essential` 깊이의 **coverage 배지**(예: 관측 신선도, 비교 가능 여부).
  숫자 한두 개면 충분하고 이게 §3 항목 10 을 만족한다.
- 전역 `status` 화면은 그대로 유지한다. 정본에 없는 화면이지만 `REQ-SAFE-001`
  ("exit code 성공이 의미 상태의 건강함을 뜻하지 않는다")의 사용자 대면 표현이라
  정본과 충돌하지 않는다.
- 삭제된 196줄에 해당하는 상세는 `research` 깊이로 되살린다.

## 6. truth class 14종 — `REQ-SEM-010` 이 닫히는 자리

데이터도 렌더 스펙도 이미 있고 잇는 코드만 없다.

- 데이터: `serving.content_pack_item_truth_v1` (3,531,425행)
- 스펙: `packages/contracts/src/truth-visual-language.ts` — `TRUTH_CLASS_RENDER_SPECS`,
  `renderSpecForTruthClass()`, 14종. **소비자 0명**

**어디서 구분하는가**: 사용자가 "이건 사실인가 추정인가"를 물을 수 있는 모든 자리.
구체적으로 블록 4(events)·6(exposure)·9(thesis)·10(catalysts) 의 각 항목.
`essential` 깊이에서는 배지 하나로, `research` 깊이에서 클래스 이름과 근거까지.

`renderSpecForTruthClass()` 의 `privateScope` 플래그가 `REQ-REC-001`(common asset view 에
private 데이터 금지)을 지키므로, 그 플래그를 무시하고 렌더하면 안 된다.

## 7. K6 빌더가 이 문서에서 받아가는 것

1. §4 의 12블록을 **전부** 담는다. 화면이 지금 안 쓰는 블록도 담는다 — 깊이 배정이지
   삭제가 아니기 때문이다.
2. 블록 3 에 **비교 가능 여부와 coverage** 를 함께 싣는다(`REQ-PROD-020/021`).
3. 블록 11 을 종목별로 싣는다. 전역 status 화면과 별개다.
4. 각 항목에 **truth class** 를 실어 블록 4·6·9·10 이 시각 구분을 할 수 있게 한다.
5. 블록 12 에 derivation/release manifest ID 를 실어 research drawer 가 역추적할 수 있게
   한다(`REQ-ARCH-001`).
6. `personalization.*` 을 조인하지 않는다(`REQ-REC-001`). 개인 데이터는 화면에서
   합성하고 common asset view 에는 넣지 않는다.
7. 블록 6 에 **relation 의 `predicate`·`relation_kind`·`confidence`·`evidence_count`·
   `revision_status` 와 신호 강도**를 싣는다(§4). 노출은 K7 이지만 서빙 계약은 여기서
   넓혀야 배선을 두 번 하지 않는다.

## 8. K7 으로 넘긴 것 — 결정된 배선과 생산자

화면 구성은 여기서 정하고 K7 이 받아간다. 8-1~8-3 은 배선이고, **8-4 는 배선이 아니라
생산자 개발**이다 — §9 의 결정 1·3 이 K7 범위를 넓혔다.

### 8-1. Market Home 시장 지표 — 있는 데이터로 교체

`sampleMarketIndicators`(KOSPI·NASDAQ·금)는 `dataState: 'sample'` 과
`basisLabel: '화면 구성 확인용 예시'` 로 정직하게 표시된 **레이아웃 스캐폴드**다.
테스트도 그 정직함을 단언한다. 오류가 아니라 실데이터 대기 상태다.

실제로 있는 거시 계열은 **금리와 고용**이다 — `fred:DGS2`·`DGS10`(미 국채 2·10년),
`fred:PAYEMS`·`UNRATE`·`ICSA`(고용), `ecos:*`(한은 금리). K7 에서 이쪽으로 교체한다.

**FX 와 원자재는 수집 자체가 없다.** 정본 01 §2 는 "금리·FX·원자재·정책" 을 필수로
요구하므로 **수집기 신규 개발**이 필요하다. K7 배선이 아니라 별도 기능이다.

### 8-2. 뉴스 썸네일 — og:image 핫링크

RSS 수집이 지금 가져오는 필드는 여섯 개뿐이다(`governance.source_shape_revision` 실측):

```
items[].kind · region · source · title · url · when
```

이미지가 없다. 기사 URL 은 있으므로 K7 에서 **기사별 fetch 로 `og:image` URL 을 추출**해
`source_revision.payload_metadata` 에 보관한다.

**이미지 자체는 저장하지 않는다 — 핫링크만 한다.** 뉴스 소스 13개가 전부
`redistribution: internal_only` · `license_status: review_required` 이고, 이미지를 받아
서빙하는 것은 복제·재배포라 `run-source-contract-audit.ts` 가 실패시키는 부류다
(지금은 `enforcement: shadow` 라 기록만 하지만 승격되면 막힌다). URL 만 보관하면
계약 안에 있다. 저장하려면 코드가 아니라 언론사별 이용약관 검토가 선행돼야 한다.

핫링크의 대가는 받아들인다 — 사용자 IP 가 언론사에 노출되고, 원본이 바뀌거나
referer 차단이면 안 뜬다. **그래서 이미지 없는 카드 상태가 반드시 필요하고**, 그것을
지금 만들어 뒀다(§8-3).

### 8-3. 지금 처리한 것 — 가짜 썸네일 제거

`headlineThumbnailUrl` 이 엔티티 키로 번들 이미지 3장을 돌려쓰고 있었다.
`KR:005930` 이면 메모리 사진, `MACRO` 면 국채 사진. 기사와 무관한 그림이 기사의
그림처럼 붙어 있었고 라벨도 없었다. 함수·이미지 3장·CSS·카드 높이를 정리했다.

e2e 는 단언을 뒤집었다. 이전 테스트 이름은 `shows a real thumbnail on every headline
card` 였는데 real 인 적이 없었다. 지금은 **"기사 출처가 아닌 이미지를 붙이지 않는다"**
를 단언하므로, K7 이 og:image 핫링크를 붙여도 그대로 통과하고 번들 이미지로 되돌아가면
실패한다.

### 8-4. §9 결정에서 K7 으로 넘어온 생산자 작업

§9 의 결정 1·3 은 배선이 아니라 **생산자 개발**을 K7 에 추가한다. 기존 K7 항목(정본 표면
배선, p4.v1→v2, release manifest 통일, 10종목 하드코딩 제거)과 별개다.

**(a) Theme 생산자** — 7상태 분류기(`FORMING`~`BREAKING`) + tier 분류기(대표/핵심/간접).
정본 01 §4 가 "가격/실적/수급/attention confirmation 을 분리" 하라고 요구하므로
confirmation 축 4개를 각각 도출해야 한다. **`SAME_THEME` 정책행은 여기 속한다** —
`minSourceRevisions` 와 `absenceSemantics` 가 이 생산자가 무엇을 근거로 내놓는지에
달려 있어서 (b) 배치에 섞으면 근거 정의가 없는 빌더에 정책행을 쓰게 된다.

**(b) relation 정책행 + 생산자** — `apps/api/src/relations/relation-policy.ts` 의
`RELATION_BUILDER_POLICIES` 에 `PEER_OF`·`SAME_INDUSTRY`·`EXPOSES`·`AFFECTS`·
`ACCELERATES`·`DECELERATES` 행 추가, 그리고 각각의 후보 생산자.

`absenceSemantics` 는 load-bearing 이다 — `relation-retraction.ts` 가 읽어 retraction
가능 여부를 정하고 `absence-semantics-contract.test.ts` 가 둘을 묶는다. 공시 기반은
`unknown_not_disclosed`(미공시 공급관계는 부재가 아니라 미상), 매 실행 전체 쌍을
평가하는 빌더만 `closed_world`. 정책 파일 헤더의 경고 그대로다: 이 필드는 몇 달간
의도만 서술했고 코드는 양방향으로 반대로 흘렀다.

**(c) supplier/customer 커버리지 확대** — `run-dart-supply-disclosure.ts` 는 이미 승인
관계를 만들고 있지만 20행이다. DART `document.xml` 예산이 ~120 req/day 이고 대상이
188 issuer × 2 req 이라 하루에 안 끝난다. 커서 기반 다일 수집이므로 **시간이 해결한다** —
신규 개발이 아니라 운영 항목이다.

**(d) 깊이 모드 전역 토글** — 클라이언트 저장. 마이그레이션·GRANT·디지털 핀 갱신 없음.

## 9. 닫힌 결정 (2026-08-10)

이 세 건은 원래 "어느 화면·어느 깊이에 둘 것인가" 로 적혀 있었다. 결정 전에 각 전제를
DB 로 실측했고 **셋 다 전제가 틀렸다** — 둘은 배치 질문이 아니라 **생산자가 없는 데이터**에
대한 질문이었다. 배치부터 정했으면 만들 수 없는 답이 나왔을 것이다.

### 결정 1 — Theme: K7 에서 생산자 개발 후 별도 화면

근거와 실측은 §3. 요약하면 7상태 분류기도 tier 분류기도 존재하지 않고, 지금 데이터는
2026-07-18 일회성 덤프다.

### 결정 2 — 깊이 모드: 전역 토글 + 클라이언트 저장

배치는 이미 제약으로 닫혀 있었다. §7 #1(K6 는 12블록을 깊이와 무관하게 전부 적재)과
`REQ-REC-001`(common asset view 에 `personalization.*` 조인 금지)이 함께 걸리면,
**깊이는 깊이-불변 패킷 위의 렌더 타임 선택**이다. 결정이 아니라 제약이다.

열려 있던 것은 노출 형태와 저장 위치뿐이었다. 전역 토글로 하되 **선호는 클라이언트에
저장한다.** `personalization.user_profile` 에는 해당 컬럼이 없어서(`locale`·`timezone`·
`risk_preference`·`preferred_markets`·`preferred_horizons`·`personalization_opt_in`)
서버 저장을 택하면 신규 마이그레이션 + `stock_insight_app_reader` GRANT +
`EXPECTED_CATALOG_DIGESTS`(`apps/api-server/src/db/live-database-guard.ts`) 갱신이
한 묶음이 된다. 2026-08-03 마이그레이션 059 가 마지막 항목을 빠뜨려 브레인이
crashloop 했다. 기기 간 동기화를 포기하는 대신 그 경로 전체를 피한다.

### 결정 3 — Discovery: 강한 이유 생산자를 되살린 뒤 노출

**"동결" 이 아니라 "미승인" 이다.** `revision_status` 를 보기 전에는 stale 로 읽었는데,
실제로는 정본 01 §5 의 강한 경제적 이유가 **전부 `quarantined_unverified`** 다.

| revision_status | 내용 |
| --- | --- |
| `accepted` | `SAME_ETF_BASKET` 29,271 · `PRODUCT_SIMILARITY` 10,445 · `COMMON_OWNER` 1,391 · `MACRO_COMOVEMENT` 226 · **`SUPPLIES` 10 · `CUSTOMER_OF` 10** |
| `quarantined_unverified` | `AFFECTS` 616 · `SAME_INDUSTRY` 418 · `SAME_THEME` 410 · `PEER_OF` 174 · `SUPPLY_CHAIN` 169 · `EXPOSES` 107 · `ACCELERATES`+`DECELERATES` 21 |

**승인된 인과 관계는 20행이 전부다.** 나머지 41,333 은 ETF·공통보유·텍스트유사도 —
정본이 "약한 신호로 별도 표시" 하라는 그 부류다. `run-dart-supply-disclosure.ts` 헤더가
이 상태를 이미 적어뒀다: "`AFFECTS`, `SUPPLY_CHAIN` and `EXPOSES` all stand at zero
accepted revisions because nothing legitimate ever fed them."

막고 있는 것은 B6 정책 게이트다. `apps/api/src/relations/relation-policy.ts` 의
`RELATION_BUILDER_POLICIES` 에 정책행이 있는 predicate 는 11개뿐이고,
`PEER_OF`·`SAME_INDUSTRY`·`SAME_THEME`·`SUPPLY_CHAIN`·`EXPOSES`·`AFFECTS`·
`ACCELERATES`·`DECELERATES` 는 **정책행이 아예 없다** → fail-closed → 영원히 미승인.

2026-07-19 시딩 행은 `policyReasons` 가 비어 있어 정책 도입(2026-08-05) 이전 경로로
**보인다** — 확인된 이력이 아니라 추정이다. 어느 쪽이든 결론은 같다. 이 행들은 정책이
요구하는 DISTINCT `ingestion.source_revision` 근거가 없으므로 승격 대상이 아니고
**재도출**이 필요하다.

**정본 §5 이유 7종 → 필요한 작업**

| 정본 이유 | predicate | 정책행 | 생산자 | 작업 |
| --- | --- | --- | --- | --- |
| supplier/customer | `SUPPLIES`·`CUSTOMER_OF` | ✅ | ✅ | 커버리지 확대만 (§8-4) |
| common factor (통계) | `MACRO_COMOVEMENT` | ✅ | ✅ | 없음 |
| ETF/ownership 약한 신호 | `SAME_ETF_BASKET`·`COMMON_OWNER`·`HELD_BY`·`OWNS` | ✅ | ✅ | 없음 |
| competitor/peer | `PEER_OF`·`SAME_INDUSTRY` | ❌ | ❌ | 정책행 + 생산자 신규 |
| same theme | `SAME_THEME` | ❌ | ❌ | **결정 1 에 종속** |
| common factor (구조) | `EXPOSES`·`AFFECTS` | ❌ | ❌ | 정책행 + 생산자 |
| event beneficiary/victim | `ACCELERATES`·`DECELERATES` | ❌ | ❌ | 정책행 + 생산자 |
| **substitute/complement** | — | — | — | **데이터 소스 없음 → 미노출 확정** |

`PRODUCT_SIMILARITY` 2,921건을 substitute 로 쓸 수 없다. `relation_kind: statistical`,
`methodology: tnic-reference` — 텍스트 유사도이고, `REQ-PROD-030`(embedding proximity 만으로
"관련 기업" 또는 economic exposure 라고 표현 금지)이 정확히 이걸 막는다. 화면에 빈 칸을
만들지 않고 **정본 갭으로 기록한다.**

## 10. 이 문서가 지켜지는지 확인하는 법

§4 의 배치표가 **K6 빌더의 계약 테스트**가 되어야 한다. "화면 X 는 블록 Y 를 요구한다"
가 테스트로 바뀌지 않으면 이 표는 장식이다. K6 착수 시 이 문서의 표를 그대로
`common-asset-view` 테스트의 기대값으로 옮긴다.

**격리된 relation 이 화면에 새지 않는지** — §9 결정 3 이 만든 가장 중요한 회귀다.
**두 개의 별개 단언이고, 하나로 합치면 서로를 깨뜨린다.**

1. **패킷 완전성(K6 빌더)**: common asset view 는 relation 항목마다 `revision_status` 를
   **싣는다.** 격리 행을 빼는 게 아니라 표시해서 내보낸다 — 안 실으면 소비자가 구분할
   방법이 없다.
2. **렌더 게이트(소비자)**: `revision_status <> 'accepted'` 인 relation 을 **강한 경제적
   이유로 그리면 실패.** 약한 신호(ETF·공통보유·텍스트유사도)를 강한 이유 자리에 그려도
   실패. `REQ-PROD-030` 이 이 단언의 근거다.

1 을 2 로 오해해 빌더 단언으로 구현하면, §4 가 넓히라고 한 그 투영이 자기 게이트에 걸린다.

전체 그림 재확인은 쿼리 하나면 된다:

```sql
select i.predicate, r.revision_status, count(*)
from knowledge.relation_revision r join knowledge.relation_identity i using(relation_identity_id)
group by 1,2 order by 1,2;
```

UI 쪽은 `docs/design/ux-constitution.md` 의 하드 불변식이 이미 잡는다 — 특히
**상태 진실성**("loading / error / empty / ready / stale 을 구분한다. API 오류를 empty 로
위장하지 않는다")이 §5 의 coverage 표현과 직접 맞물린다. 정보가 없는 것과 조용한 것을
구분하라는 요구가 이 문서의 §1 규칙과 같은 말이다.
