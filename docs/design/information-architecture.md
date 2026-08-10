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
"인사이트 분류"가 이미 부분적으로 하고 있는 일이다. **별도 화면을 새로 만들지, `today`
안의 한 섹션으로 둘지가 열린 결정**이고, 어느 쪽이든 위 상태 7개와 정보 7항목은
도달 가능해야 한다.

이 결정은 K6 에 영향을 주지 않는다. theme 은 정본 06 §2 의 12블록에 들어있지 않고
별도 원장(`theme constitution`, `membership`)에서 온다.

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

## 8. 열린 결정

- **Theme 표면**: 별도 화면인가, `today` 의 섹션인가. 어느 쪽이든 상태 7개와 정보
  7항목은 도달 가능해야 한다.
- **깊이 모드의 노출 방식**: 전역 토글인가, 화면별 펼치기인가. `REQ-PROD-002` 는
  모드가 존재할 것을 요구하지 UI 형태를 규정하지 않는다.
- **Discovery 의 이유 7종**(정본 01 §5: competitor/peer, supplier/customer, substitute,
  same theme, common factor, event beneficiary, ETF/ownership 약한 신호): 현재 `radar` 는
  "시장 변화" 중심이라 이유 분류가 없다. 어느 깊이에 넣을지 미정.

## 9. 이 문서가 지켜지는지 확인하는 법

§4 의 배치표가 **K6 빌더의 계약 테스트**가 되어야 한다. "화면 X 는 블록 Y 를 요구한다"
가 테스트로 바뀌지 않으면 이 표는 장식이다. K6 착수 시 이 문서의 표를 그대로
`common-asset-view` 테스트의 기대값으로 옮긴다.

UI 쪽은 `docs/design/ux-constitution.md` 의 하드 불변식이 이미 잡는다 — 특히
**상태 진실성**("loading / error / empty / ready / stale 을 구분한다. API 오류를 empty 로
위장하지 않는다")이 §5 의 coverage 표현과 직접 맞물린다. 정보가 없는 것과 조용한 것을
구분하라는 요구가 이 문서의 §1 규칙과 같은 말이다.
