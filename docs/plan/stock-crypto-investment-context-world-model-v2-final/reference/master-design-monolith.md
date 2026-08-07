# Stock/Crypto Insight V2 — Investment Context World Model Master Design

> 상태: **단일 파일 설계 정본 후보 / 5차 Source Expansion · Intelligence Coverage Architecture 반영**  
> 작성 기준일: **2026-08-07 KST**  
> 설계 revision: **Fifth-Pass Source Expansion — 데이터 획득·coverage·rights·PIT·crawl/API 포트폴리오 보강**  
> 제품/API 계약: **V2 유지** — 새 메이저 버전을 만들지 않고 additive enhancement로 확장  
> 목적: 현재 분산된 아키텍처·고도화·as-built 문서와 신규 제품 요구를 하나의 구현 가능한 설계로 통합한 뒤, 검증 후 도메인별 문서로 분리한다.  
> 핵심 정체성: **Evidence-Grounded Investment Context Platform / Market World Model**
> **정본 우선순위**: 동일 주제의 계약이 여러 검토 차수에 반복될 경우 **4차 Red-Team(§172~)의 안전·의미 계약과 5차 Source Expansion(§229~)의 데이터 획득 계약이 우선**한다. 앞선 2·3차 “최종” 절은 설계 진화 근거를 보존한 historical review이며 구현 정본은 가장 최신 계약을 따른다.

---

## 0. Executive Summary

이 제품의 정체성은 뉴스 수집기, 종목 관계 그래프, 자동 매매 봇, 단순 주가 예측기가 아니다.

> **일반 투자자부터 전문가까지, 주식·코인 투자 판단에 필요한 정보와 맥락을 한곳에서 이해하고 탐색할 수 있게 만드는 시장 인텔리전스 플랫폼**

사용자는 모든 원문을 직접 찾아다닐 필요가 없어야 한다. 이미 다른 곳에서 볼 수 있는 뉴스·공시·가격·재무·거시·온체인 데이터도 다음 가치를 제공하면 제품 자산이 된다.

1. 같은 사건의 수십 개 기사를 하나의 canonical event로 합친다.
2. 사실, 주장, 기대, 추정, 전망을 구분한다.
3. 사건이 어떤 경제적 경로로 기업·산업·토큰에 전달되는지 설명한다.
4. 시장이 이미 무엇을 기대하고 있었는지와 실제 결과의 차이를 보여준다.
5. 시장이 실제로 얼마나 반응했는지 확인한다.
6. 현재 강한 테마, 새로 형성되는 테마, 과열·약화되는 테마를 구분한다.
7. 특정 종목을 전혀 모르는 사용자도 업계 구조, 경쟁사, 상대적 위치, 최근 사건을 빠르게 이해할 수 있게 한다.
8. 관심·보유 종목과 관련된 자산을 “왜 관련 있는지”와 함께 발견하게 한다.
9. 사용자가 명시적으로 종목을 찾을 때 일반적인 투자 후보를 설명 가능하게 제안한다.
10. 보유자에게는 공통 종목 평가와 별도로 포트폴리오 맥락의 행동 판단을 제공한다.
11. 과거 시스템 판단과 실제 결과를 계속 연결해 어떤 모델·경로가 잘 맞았는지 학습한다.
12. 모든 화면 문장과 숫자가 원문·데이터·계산·모델 버전으로 역추적 가능하다.

최종 표준 사고 사슬은 다음과 같다.

```text
Source / Observation
 → Assertion / Comparable Numeric Fact
 → Event / World State
 → Expectation / Competing Hypothesis
 → Surprise / Information Gain
 → Exposure
 → Business Driver / Unit Economics
 → Transmission Mechanism
 → Financial / Economic Value-Capture Bridge
 → Valuation / Market-Implied State
 → Market Reaction / Positioning / Microstructure
 → Scenario / Forecast / Multi-Horizon Thesis
 → Outcome
 → Calibration / Source Utility / Model Reliability
 → Common Asset + Investable Claim View
 → Opportunity Set / Candidate + Rejection
 → Discovery / Curation / Research Query
 → Personalized Portfolio Action

Cross-cutting invariants:
 Information-Set / PIT Kernel · Evidence Independence · Economic Invariants
 Semantic Type System · Actionability Clock · Rights/Policy Gate
 Release Consistency · Safe-Mode / Fault Containment

Parallel:
 ↘ Reverse Discovery: unexplained market move → evidence search → candidate event/hypothesis
 ↺ Reflexive Loop: market price/financing/attention → real decisions → new world state
```

**Graph는 제품 그 자체가 아니라 이 사슬을 연결하고 탐색하는 내부 표현 방식 중 하나다.**

---

# Part I. Product North Star

## 1. 제품이 해결해야 하는 사용자 문제

### 1.1 정보가 흩어져 있다

투자자는 보통 다음을 따로 찾아야 한다.

- 뉴스
- 기업 공시와 IR
- 재무제표
- 가격·거래량·수급
- 금리·환율·원자재
- 애널리스트 기대와 가이던스
- 산업·공급망 자료
- 정책·규제
- 코인의 온체인·토크노믹스·거버넌스
- 관련 기업·경쟁사
- 예정 이벤트

제품은 이들을 한곳에 복사해 놓는 수준을 넘어 **동일 사건·동일 기업·동일 테마라는 문맥으로 결합**해야 한다.

### 1.2 정보는 많지만 “왜 중요한가”가 없다

기사 한 편이 좋은지 나쁜지는 절대적인 문구만으로 결정되지 않는다.

예:

```text
실적 15조 원
```

보다 중요한 것은:

```text
시장 기대 12조 원
회사 기존 가이던스 13조 원
실제 15조 원
→ 기대 대비 +3조 원 surprise
→ 어느 사업부가 만들었는가
→ 일회성인가 지속 가능한가
→ 시장은 발표 전 얼마나 선반영했는가
```

이다.

### 1.3 연결은 보이지만 경제적 중요도가 없다

`A와 B가 같은 ETF에 들어 있다`는 관계와 `A 매출의 35%가 B의 주문에 의존한다`는 관계는 같은 edge 강도로 취급하면 안 된다.

그래서 시스템은 항상 다음을 분리한다.

- 관계 존재 여부
- 관계 근거 품질
- 경제적 materiality
- 전달 방향
- 시차
- 대체 가능성
- 이미 가격에 반영되었는지
- 불확실성

### 1.4 초보자와 전문가가 같은 데이터를 다른 깊이로 보고 싶다

데이터 모델을 단순하게 만들지 않는다. **표현 계층만 다르게 한다.**

| 모드 | 기본 출력 |
|---|---|
| 30초 요약 | 무슨 일 / 왜 중요 / 수혜·피해 후보 / 다음 체크포인트 |
| 일반 투자자 | 영향 경로 / 실적 노출 / 시장 반응 / 시나리오 / 위험 |
| 고급 투자자 | segment·valuation·factor·historical analog·estimate revision |
| 연구 모드 | source span·derivation DAG·방법론·CI·coverage·diagnostics |

---

## 2. 제품의 핵심 질문

플랫폼은 최소한 다음 질문에 답할 수 있어야 한다.

### Market Questions

1. 오늘 시장에서 중요한 변화는 무엇인가?
2. 왜 시장이 움직였는가?
3. 현재 어떤 테마가 강한가?
4. 어떤 테마가 새로 형성되고 있는가?
5. 어떤 테마는 강하지만 이미 과열되어 있는가?
6. 어떤 테마가 약해지거나 깨지고 있는가?
7. 앞으로 중요한 일정과 촉매는 무엇인가?
8. 현재 시장은 무엇을 가격에 반영하고 있는가?

### Asset Questions

1. 이 회사는 무엇을 하는 회사인가?
2. 돈을 어디서 버는가?
3. 이 분야의 대표 기업은 누구인가?
4. 이 회사는 그중 어느 위치인가?
5. 경쟁우위와 약점은 무엇인가?
6. 어떤 고객·공급사·국가·상품·팩터에 노출되어 있는가?
7. 최근 무슨 일이 있었는가?
8. 지금의 호재·악재는 새로운가, 이미 반영됐는가?
9. 과거 비슷한 사건에서 어떤 일이 있었는가?
10. 앞으로 어떤 조건을 확인해야 하는가?

### Discovery Questions

1. 지금 볼 만한 종목은 무엇인가?
2. 특정 테마에서 대표 종목과 후발 종목은 무엇인가?
3. 특정 종목과 관련된 다른 종목은 무엇이며 왜 관련 있는가?
4. 테마와 상관없이 펀더멘털·가격·이벤트 조합이 흥미로운 종목은 무엇인가?
5. 내 관심 분야와 연결되지만 아직 보지 않은 종목은 무엇인가?

### Personalized Questions

1. 이 종목 자체는 어떻게 보이는가?
2. 내 포트폴리오에서는 왜 다른 판단이 나오는가?
3. 추가매수·보유·축소·정리·관망 중 무엇이 합리적인가?
4. 내 포트폴리오의 숨겨진 중복 노출은 무엇인가?
5. 어떤 사건이 내 자산 전체에 동시에 영향을 줄 수 있는가?

---

## 3. 명확한 비범위

초기 V2는 다음을 하지 않는다.

- 자동 주문 실행
- 사용자 돈으로 online RL exploration
- 근거 없는 확정적 목표주가
- LLM self-confidence를 투자 확률로 표시
- 뉴스 sentiment 하나로 추천 결정
- 가격 상관만으로 인과관계 승격
- embedding similarity만으로 공급망·경쟁 관계 확정
- 하나의 opaque score로 모든 투자 판단 축약
- 모든 종목·모든 테마에서 동일한 수준의 coverage가 있는 척하기

---

# Part II. Product Surfaces

## 4. Market Home — “오늘 무엇을 봐야 하는가”

홈은 뉴스 피드가 아니라 **시장 상황판**이어야 한다.

권장 블록:

1. **What Changed** — 지난 기준시점 이후 실제로 변한 것
2. **Why Markets Moved** — 주요 event → factor → asset reaction
3. **Expectation & Surprise** — 예상보다 달랐던 지표·실적·정책
4. **Strong Now** — 현재 강세가 확인된 테마
5. **Emerging** — 새롭게 형성되는 테마
6. **Strong but Crowded** — 강하지만 기대 반영/과열 위험이 높은 테마
7. **Weakening / At Risk** — 추세·펀더멘털·내러티브가 약화되는 테마
8. **Theme-Independent Opportunities** — 테마 밖의 자산 후보
9. **Event Radar** — 중요한 신규 사건
10. **Upcoming Catalysts** — 실적, 정책, 매크로, 언락, 제품 발표 등 예정 이벤트
11. **Cross-Asset State** — 금리·달러·원자재·변동성·크레딧·유동성
12. **Unexplained Moves** — 가격·거래량·옵션·온체인 이상이 먼저 포착됐지만 원인이 아직 해소되지 않은 움직임
13. **Thesis Changes** — 주요 종목·테마의 bull/base/bear thesis가 새 근거로 강화·약화된 변화
14. **For You** — 관심/보유와 관련된 변화

각 카드에는 최소 다음이 있어야 한다.

```text
현재 상태
왜 중요한가
근거
영향 대상
반대 근거
불확실성
이미 반영됐는가
다음 확인 이벤트
데이터 기준시점
```

---

## 5. Asset Deep Dive — “아예 모르는 종목을 클릭해도 이해된다”

종목 상세는 데이터 탭의 모음이 아니라 **해당 기업을 이해하는 학습·분석 페이지**다.

### 5.1 Above the Fold

- 회사 한 줄 설명
- 상장 증권과 거래소
- 시가총액 / 주요 가격 상태
- 업계/peer group
- 해당 분야 대표 기업
- 이 기업의 상대적 위치
- 현재 주요 테마
- 현재 가장 중요한 긍정·부정 요인
- 다음 예정 촉매
- 공식 홈페이지 / IR / 공시 페이지

### 5.2 “무슨 회사인가?”

- 사업 설명
- 주요 제품·서비스
- 돈을 버는 구조
- segment별 매출·이익
- 국가별 매출·생산·자산
- 핵심 고객/공급망
- 주요 시설
- 경영진 및 법인 구조

### 5.3 “이 분야에서 어느 정도인가?”

**한 줄짜리 절대 순위로 거짓 단순화하지 않는다.**

예:

```text
HBM 관련 Peer Group 12개사

매출 규모        3 / 12
최근 3Y 성장률   2 / 12
영업이익률       5 / 12
R&D 강도         1 / 12
6M 상대강도      4 / 12
밸류에이션       9 / 12  (높을수록 비쌈)
테마 직접노출     Core

종합 Research Position: 3 / 12
- 공개된 합성 규칙과 차원별 기여를 제공
```

“업계 1등”은 역할별로 구분한다.

- revenue leader
- market-share leader
- growth leader
- margin leader
- technology/product leader
- cost leader
- distribution/installed-base leader
- capital-efficiency leader

### 5.4 “최근 무슨 일이 있었나?”

- canonical event timeline
- 최근 실적/가이던스
- 계약·수주·M&A
- 규제·소송
- 공급망 변화
- 제품 출시/리콜
- analyst expectation revisions
- 가격/수급 반응

기사 20개를 보여주는 대신 사건 1개 아래에 **새로 추가된 정보의 차이**를 보여준다.

### 5.5 “어디에 노출돼 있나?”

- 고객
- 공급사
- 제품
- 원재료
- 국가
- FX
- 금리
- commodity
- regulation
- theme
- index / ETF / flows
- crypto infrastructure dependency

### 5.6 “앞으로 무엇을 봐야 하나?”

- bull/base/bear scenarios
- upcoming catalyst
- invalidation trigger
- consensus expectation
- uncertainty
- priced-in state

### 5.7 “비슷하거나 더 나은 대안은?”

- 직접 경쟁사
- 같은 테마 핵심주
- upstream/downstream
- 대체 수혜주
- 같은 factor exposure지만 더 싼/성장률 높은 peer
- risk hedge candidate

모든 추천에는 `reason_codes`가 있어야 한다.

### 5.8 “이 산업을 어떻게 봐야 하나?” — Industry Primer

사용자가 해당 분야를 전혀 몰라도 종목을 이해할 수 있도록 **종목보다 한 단계 위의 산업 학습 객체**를 제공한다.

- value chain과 돈이 흐르는 구조
- 누가 고객이고 누가 supplier인가
- 산업의 핵심 KPI와 단위경제성
- 수요를 결정하는 선행지표
- 공급 제약과 증설 lead time
- 가격결정 구조와 commodity/contract 비중
- 산업 특유의 회계·valuation 방식
- 일반적인 bull/bear cycle
- 대표 기업과 각자의 역할
- 초보자가 자주 오해하는 지점

예를 들어 은행의 NIM/CET1/NPL, SaaS의 ARR/NRR, 반도체의 ASP·재고·가동률·capex, 광산의 AISC, 보험의 combined ratio, 코인 프로토콜의 fee/revenue/TVL/emission은 서로 같은 일반 KPI 집합으로 분석해서는 안 된다.

### 5.9 “이 회사의 숫자가 왜 움직이나?” — Business Driver View

재무 숫자를 단순 시계열로 보여주지 않고 회사별 business driver와 연결한다.

```text
End Demand
 → Volume / Users / Units
 → Price / ASP / Take Rate
 → Revenue
 → Variable Cost / Input Cost
 → Gross Margin
 → Fixed Cost / Operating Leverage
 → Operating Profit
 → Working Capital / CAPEX
 → FCF
 → Balance Sheet
 → Valuation
```

산업별로 실제 equation과 driver가 다르므로 versioned sector playbook과 company-specific override를 둔다.

### 5.10 “지금 가격은 무엇을 전제로 하나?” — Valuation & Implied Expectations

- 현재 valuation multiples와 peer/historical distribution
- 적절한 sector-specific valuation methods
- reverse DCF / reverse earnings bridge로 현재 가격이 암묵적으로 요구하는 성장·마진·수익률
- 시장 consensus와 price-implied expectation 차이
- bull/base/bear valuation range
- valuation sensitivity와 핵심 assumption

사용자에게 하나의 목표주가를 확정값으로 보여주기보다 **어떤 가정에서 어떤 가치 범위가 나오는지**를 보여준다.

### 5.11 “현재 투자 논리는 무엇이고 무엇이 깨뜨리나?” — Thesis View

- bull thesis
- base thesis
- bear thesis
- 각 thesis의 전제
- supporting evidence / counter-evidence
- 아직 확인되지 않은 핵심 unknown
- catalyst
- falsification / invalidation condition
- 최근 사건이 어느 thesis를 강화·약화했는지
- historical outcome과 calibration


---

## 6. Theme Explorer

Theme은 정적 태그가 아니라 **시간에 따라 형성·강화·과열·약화되는 시장 객체**다.

사용자에게 최소 네 목록을 제공한다.

1. **Strong Now** — 현재 강세 확인
2. **Emerging / Forming** — 아직 초기지만 관심·기초·가격 확인이 늘고 있음
3. **Forward Watch** — 예정 촉매와 구조적 변화로 향후 강화 가능성이 있으나 현재는 미확정
4. **Weakening / Risk** — 가격·breadth·펀더멘털·내러티브가 약화하거나 기대가 과도함

추가 상태:

```text
dormant
forming
emerging
accelerating
broadening
mainstream
crowded
mature
weakening
breaking
recovering
```

Theme 화면:

- 한 줄 설명
- 왜 생긴 테마인가
- 시작/변곡 이벤트
- 현재 lifecycle
- 핵심 driver
- 대표 종목
- 직접 수혜 / 간접 수혜 / 인프라 / 대체재 / 피해주
- breadth
- price strength
- volume/flow
- earnings revision
- fundamental confirmation
- narrative acceleration
- valuation/crowding
- expectation gap
- upcoming catalysts
- risk / counter-evidence
- historical analog

---

## 7. General Discovery / Recommendation

사용자가 보유하지 않은 종목도 추천할 수 있다. 그러나 이것은 개인 포트폴리오 action과 분리한다.

### 7.1 3단계 분리

```text
1. Common Asset Opportunity
   모든 사용자에게 같은 공통 종목 평가

2. Discovery / Curation
   왜 이 사용자 화면에 이 종목을 노출했는가

3. Personalized Portfolio Action
   실제 보유·제약에 적용한 ADD/HOLD/REDUCE/EXIT
```

### 7.2 Common Asset Opportunity 축

단일 점수 대신 다음 축을 유지한다.

- Business Quality
- Growth / Earnings Quality
- Estimate Revision Momentum
- Valuation / Margin of Safety
- Catalyst Quality
- Theme / Structural Tailwind
- Price / Flow Confirmation
- Expectation Gap
- Priced-In / Crowding
- Balance Sheet / Liquidity Risk
- Event Risk
- Data Coverage
- Forecast Uncertainty

필요하면 사용자용 정렬 점수는 만들 수 있지만 **축별 원값과 정책 버전을 반드시 저장**한다.

### 7.3 후보 생성기

후보는 여러 엔진에서 독립적으로 생성한다.

```text
Theme Leaders
Theme Emerging Beneficiaries
Event Beneficiaries
Earnings Revision Leaders
Quality + Valuation Candidates
Price/Flow Breakout Candidates
Peer Relative Mispricing
Macro/Factor Beneficiaries
Supply-Chain Substitution Beneficiaries
Post-Event Recovery Candidates
Under-followed but High-Coverage Candidates
```

후보 생성기는 recommendation을 확정하지 않는다.

### 7.4 Reranker

- liquidity minimum
- coverage minimum
- uncertainty cap
- duplicate theme cap
- sector diversity
- country diversity
- market-cap diversity
- novelty
- user interest relevance
- repeated exposure penalty
- recent recommendation fatigue

한 화면이 반도체 종목만 20개로 채워지는 것을 막는다.

---

## 8. Related Asset Curation

“관련 종목”은 하나의 벡터 유사도 결과가 아니다.

### Relation Reasons

- `DIRECT_COMPETITOR`
- `SAME_PRODUCT_MARKET`
- `SUPPLIER`
- `CUSTOMER`
- `SHARED_CUSTOMER`
- `SUBSTITUTE_SUPPLIER`
- `VALUE_CHAIN_UPSTREAM`
- `VALUE_CHAIN_DOWNSTREAM`
- `SAME_THEME_CORE`
- `SAME_THEME_INDIRECT`
- `SAME_FACTOR_EXPOSURE`
- `OPPOSITE_FACTOR_EXPOSURE`
- `COMMON_ETF`
- `COMMON_OWNER`
- `HISTORICAL_COMOVEMENT`
- `EVENT_COBENEFICIARY`
- `EVENT_OPPOSITE_IMPACT`
- `USER_INTEREST_NEIGHBOR`

### 출력 예

```text
SK하이닉스를 보는 사용자가 함께 볼 만한 종목

1. Micron — DIRECT_COMPETITOR / HBM·DRAM
2. 한미반도체 — VALUE_CHAIN_UPSTREAM / HBM 장비
3. Nvidia — SHARED_DEMAND_DRIVER / AI accelerator 수요
4. 삼성전자 — DIRECT_COMPETITOR + SAME_THEME_CORE
5. 데이터센터 전력 기업 X — INDIRECT_THEME / AI infrastructure
```

`COMMON_ETF` 같은 약한 관계만으로 상단을 채우지 않는다.

---

## 9. News / Event Intelligence

뉴스의 기본 단위는 article이 아니라 **event/story cluster**다.

### 9.1 Canonical Event Page

```text
Canonical Event
├─ current verified state
├─ event timeline
├─ primary source
├─ independent reporting
├─ company response
├─ revisions/corrections
├─ affected entities
├─ expectation before event
├─ actual/surprise
├─ market reaction
├─ impact paths
└─ next expected update
```

### 9.2 기사별로 보여줄 것

“이 기사에만 새롭게 있는 정보”를 추출한다.

- new fact
- new quote
- new number
- correction
- contradiction
- added context
- speculation

기사 재배포 수를 independent confirmation 수로 쓰지 않는다.

---

# Part III. Truth & World Model

## 10. Truth Class 분리

이 시스템의 핵심 원칙:

> 원문에 있는 것은 assertion이고, 현실 세계에서 정규화한 것은 fact/event/relation이며, 경제적 의미는 exposure/mechanism이고, 데이터로 추정한 것은 estimate이며, 미래는 forecast/scenario다.

물리적 truth class:

| 객체 | 의미 |
|---|---|
| source_revision | 보유 원문 버전 |
| assertion | 원문 최소 주장 |
| numeric_fact | 단위·기간·차원의 수치 |
| event | 발생·진행·취소되는 사건 |
| relation_instance | 지속적인 현실 관계 |
| expectation | 사건 전 시장/기관/회사 기대 |
| surprise | actual과 expectation의 차이 |
| exposure | shock/factor 경제 노출 |
| mechanism_hypothesis | 전달 메커니즘 |
| statistical_estimate | 관찰적 추정 |
| causal_estimate | 식별 가정이 있는 인과 추정 |
| forecast | 미래 분포 |
| scenario | 조건부 미래 상태 |
| market_reaction | 실제 가격·수급 반응 |
| narrative_state | 시장 참가자의 관심/해석 상태 |
| outcome_observation | 과거 판단 후 실제 결과 |
| report_statement | 사용자에게 노출되는 원자 문장 |

상위 분석 객체는 하위 사실을 수정하지 않는다.

---

## 11. Logical Graphs — 하나의 Hairball을 만들지 않는다

물리 DB가 하나여도 논리적으로 다음 그래프를 분리한다.

### G1. Identity / World Graph

```text
Company
LegalEntity
Stock
ShareClass
ETF
Fund
Product
Technology
Facility
Country
Person
Government
Regulator
Commodity
Token
Protocol
Blockchain
...
```

### G2. Event / State Graph

```text
Earnings
Guidance
Contract
M&A
Regulation
Sanction
Tariff
ProductLaunch
Recall
Strike
NaturalDisaster
Hack
Unlock
Governance
...
```

### G3. Exposure / Transmission Graph

```text
Revenue Exposure
Cost Exposure
Production Exposure
Supply Exposure
Customer Concentration
FX Sensitivity
Rate Sensitivity
Commodity Sensitivity
Regulatory Exposure
```

### G4. Expectation / Pricing Graph

```text
Consensus
Guidance
Market-Implied Expectation
Estimate Revision
Option/Futures-Implied State
Priced-In Estimate
```

### G5. Market Reaction / Flow Graph

```text
Abnormal Return
Volume Shock
ETF Flow
Short Positioning
Funding/Basis
Analyst Revision
Volatility/Skew
```

### G6. Narrative / Attention Graph

```text
Narrative
Theme
Driver
Attention Shift
Narrative Lifecycle
Contradicting Narrative
```

Personalization은 위 그래프와 분리된 private plane이다.

---

## 12. Entity / Identity Ontology

### 12.1 기업·법인

- LegalEntity
- Company
- Parent
- Subsidiary
- Branch
- SPV
- JointVenture
- Government
- Ministry
- Regulator
- CentralBank
- Court
- Legislature
- Fund
- Bank
- Broker
- Exchange

### 12.2 금융상품

- Security
- Stock
- ShareClass
- ADR/GDR
- Bond
- ETF
- Index
- Future
- Option
- Currency
- YieldCurvePoint
- CreditSpread

### 12.3 실물·산업

- Product
- ProductFamily
- Material
- Component
- Equipment
- Service
- Technology
- Patent
- Standard
- Facility
- Factory
- Mine
- Port
- DataCenter
- PowerPlant
- Route
- Industry
- ValueChainStage
- HSCode
- ControlClass

### 12.4 제도·사건

- Law
- Bill
- Regulation
- SanctionProgram
- Tariff
- Subsidy
- Tax
- Contract
- Tender
- License
- Permit
- Litigation
- Investigation

### 12.5 코인

- Blockchain
- L2
- Protocol
- SmartContract
- Token
- Stablecoin
- Bridge
- Oracle
- Validator
- Exchange
- Custodian
- WalletCluster

외부 표준 FIBO는 내부 ontology의 정답으로 복사하지 않고 **용어·관계 mapping reference**로 사용한다.

---

## 13. Source, Provenance, Rights

기존 append-only source revision 구조를 유지한다.

```text
fetch
 → raw bytes hash
 → immutable object
 → source_revision
 → parsed artifact(s)
 → assertions/facts/events
```

각 source contract:

```text
source_id
source_type
publisher
rights_policy
redisplay_policy
retention_policy
robots_policy
rate_limit_policy
expected_latency
coverage_scope
quality_tier
independence_group
license_expiry
```

### Source Tier

- Tier 1: 규제기관, 거래소, 기업 IR, 체인 원장
- Tier 2: 신뢰도 높은 뉴스·데이터 벤더
- Tier 3: 리서치·산업 보고서
- Tier 4: 커뮤니티·소셜 — candidate/attention 중심

---

## 14. Assertion / Numeric Fact

### 14.1 Assertion

```text
assertion_id
source_revision_id
subject
predicate
object/literal
polarity
modality
attribution
quotation_scope
condition
exception
valid_time
published_at
available_at
known_at
source_span_locator
parser_version
verification_state
```

필수 검증:

- negation
- uncertainty/modality
- attribution
- quotation
- condition/exception
- tense/status
- correction/retraction
- numerical consistency

### 14.2 Numeric Fact

```text
fact_id
entity_id
concept_id
value
unit
currency
scale
period_start/end
instant_at
fiscal_period
dimensions
restatement_group
xbrl/table cell locator
source_revision_id
known_at
```

숫자는 LLM이 직접 계산해 발행하지 않는다.

XBRL의 concept/unit/period/dimension 구조를 최대한 보존한다.

---

## 15. Event & Reified Relationship

중요한 현실 객체는 단순 binary edge보다 event/contract로 승격한다.

### Event

```text
event_id
event_type
status
announced_at
occurred_at
effective_at
ended_at
known_from
primary_derivation_id
```

### Event Participant

```text
event_id
entity_id
role
directness
scope
evidence_id
```

### Contract Example

```text
Contract
├─ supplier legal entity
├─ customer legal entity
├─ product
├─ amount / currency
├─ start/end
├─ minimum volume
├─ termination condition
├─ geography
├─ current status
└─ evidence
```

직접 edge는 read/query projection으로 파생한다.

---

## 16. Relation Ledger

현재의 강한 append-only relation ledger는 유지한다.

관계는 다음과 구분한다.

- structural factual relation
- ownership
- classification
- hierarchy
- exposure link
- statistical association
- causal hypothesis

**statistical/causal/forecast 결과를 factual relation과 같은 accepted class로 저장하지 않는다.**

relation acceptance는 계속:

```text
revision accepted
+ predicate approved
+ qualifying evidence exists
```

를 요구한다.

---

## 17. Coverage Ledger

`없음`과 `모름`을 구분한다.

```text
entity / fact-family / period / source-contract
expected artifacts
observed artifacts
state:
  complete
  partial
  not_collected
  source_unavailable
  not_applicable
```

UI 표현:

- 확인된 관계 없음
- 수집 완료 후 발견되지 않음
- 일부만 확인됨
- 아직 조사하지 않음
- 소스 접근 불가

---

## 18. Conflict / Supersession

사실 충돌은 덮어쓰지 않는다.

```text
conflict_set
├─ assertion A
├─ assertion B
├─ assertion C
├─ contradicts
├─ supersedes
├─ corrects
├─ narrows
└─ resolution state
```

---

## 19. Four-Time / PIT Model

최소 네 시간:

- valid/event time
- published_at
- available_at
- known_at

거시:

- reference period
- release time
- vintage/revision time

API 내부는 `asOf` 하나에 의존하지 않는다.

```text
validAt
knownAt
informationSet = first_release | latest_revision
marketCalendar
```

모든 backtest, theme state, recommendation은 당시 universe와 당시 알려진 데이터만 사용한다.

---

# Part IV. New Capital-Market-Specific Objects

## 20. Expectation Ledger — 신규 핵심

현재 설계에서 가장 중요한 추가 객체 중 하나다.

절대값보다 **기대 대비 변화**가 시장에 더 중요한 경우가 많다.

### 20.1 기대 종류

- analyst consensus
- individual analyst estimate
- company guidance
- management target
- economist consensus
- market-implied expectation
- futures implied
- options implied
- prediction-market-like probability, 사용 시 source/rights 별도
- internal model expectation

### 20.2 데이터 모델

```text
expectation_snapshot
  expectation_id
  target_entity/event/metric
  expectation_type
  expected_value / distribution
  unit
  horizon / target_period
  source_group
  contributor_count
  dispersion
  as_of
  available_at
  known_at
  methodology
  derivation_id
```

```text
expectation_revision
  expectation_id
  revision_at
  previous_value
  new_value
  reason/event link
```

### 20.3 Surprise

```text
surprise_observation
  event_id
  expectation_id
  actual_fact_id
  raw_surprise
  standardized_surprise
  historical_percentile
  direction
  derivation_id
```

예:

```text
CPI actual 3.2%
consensus 2.8%
prior expectation dispersion 2.6~3.1%
→ +0.4pp surprise
→ historical surprise percentile
→ rates repricing
→ equity factor reaction
```

---

## 21. Priced-In State — 신규 핵심

“호재인가?”와 “새로운 호재인가?”를 구분한다.

`priced_in`은 사실이 아니라 **estimate**다.

### 입력 축

- pre-event price move
- valuation percentile
- earnings revisions
- option-implied distribution
- futures/basis
- positioning/flows
- short interest
- narrative maturity
- search/news attention
- peer-relative move

### 출력

```text
priced_in_estimate
  target
  driver/event/theme
  horizon
  degree = low / moderate / high / unknown
  component_scores
  uncertainty
  method_version
  as_of
  derivation_id
```

UI 예:

```text
Fundamental Effect      Positive
Surprise                Positive
Price Confirmation      Strong
Priced-In Risk          High
Crowding                High

→ 기업에는 좋은 사건이지만 신규 투자정보로서의 신선도는 낮을 수 있음
```

---

## 22. Peer Group & Relative Position — 신규 핵심

“이 분야에서 누가 1등이고 이 회사는 몇 등인가?”를 정확하게 지원한다.

### 22.1 Peer Group 종류

- industry peer
- product-market peer
- geographic peer
- business-model peer
- theme peer
- value-chain stage peer
- crypto protocol category peer

### 22.2 데이터 모델

```text
peer_group
peer_group_revision
peer_membership_revision
peer_metric_definition
peer_metric_snapshot
relative_rank_snapshot
competitive_position_snapshot
```

### 22.3 Rank 원칙

- 최소 표본 크기 표시
- coverage 표시
- data timestamp 표시
- metric direction 표시
- percentile와 rank 모두 제공 가능
- composite rank는 공식 공개된 weight policy 필요
- coverage 부족 시 overall rank 생성 금지

### 22.4 Competitive Position

- market share
- product breadth
- unit economics
- gross/operating margin
- growth
- ROIC
- R&D intensity
- patents/standards
- customer concentration
- installed base
- distribution reach
- supply security
- capacity
- brand/network effect

이 중 추정치는 `estimate`로 분리한다.

---

## 23. Entity Resource Registry — 신규 핵심

종목 페이지에서 공식 홈페이지와 신뢰 가능한 외부 리소스를 제공한다.

```text
entity_resource_revision
  entity_id
  resource_type
  canonical_url
  domain
  verification_state
  verification_method
  source_revision_id
  discovered_at
  verified_at
  valid_from/to
  language
  region
```

### Resource Types

주식:

- official_homepage
- investor_relations
- official_newsroom
- SEC/DART issuer page
- exchange profile
- annual report
- sustainability report
- product page

코인:

- official_site
- docs
- whitepaper
- governance
- verified GitHub
- block explorer
- audit report
- official contract address registry

### 보안

- 자동 링크는 verified state가 있어야 한다.
- 리다이렉트/도메인 변경을 주기적으로 재검증한다.
- 사용자 생성 링크와 공식 링크를 섞지 않는다.
- 악성/피싱 가능성이 있는 코인 링크는 별도 위험 등급을 둔다.

---

## 24. Narrative / Theme World Model — 신규 강화

Theme과 narrative를 Truth Graph와 분리한다.

### Theme Definition

```text
theme_definition_revision
  theme_id
  canonical_name
  thesis
  scope
  parent_theme
  lifecycle_policy
  evidence threshold
  ontology revision
```

### Membership

```text
theme_membership_revision
  theme_id
  entity_id
  role = core / enabler / supplier / beneficiary / indirect / hedge / victim
  semantic_fit
  economic_exposure
  evidence
  valid/known time
```

### Theme Drivers

```text
theme_driver
  theme_id
  event/factor/narrative
  driver_type
  sign
  materiality
  horizon
```

### Theme State Snapshot

```text
theme_state_snapshot
  theme_id
  as_of
  lifecycle_state
  current_strength
  breadth
  relative_strength
  volume_flow
  earnings_revision
  fundamental_confirmation
  narrative_acceleration
  novelty
  source_diversity
  expectation_gap
  priced_in
  crowding
  valuation_risk
  regime_fit
  uncertainty
  model_version
```

### Forward Theme Outlook

현재 강도와 미래 전망을 분리한다.

```text
theme_outlook
  horizon
  continuation_probability
  acceleration_probability
  breakdown_probability
  catalyst_set
  risk_set
  scenario_set
  calibration_state
```

“앞으로 강할 테마”는 `forecast/estimate`이며 fact처럼 표시하지 않는다.

---

## 25. Outcome & Calibration Ledger — 신규 핵심

월드모델이 시간이 지나며 실제로 더 나아지려면 **과거 판단의 정답 확인 구조**가 필요하다.

### 25.1 Outcome Observation

```text
outcome_observation
  source_object_type
  source_object_id
  target_entity
  horizon
  metric
  realized_value
  benchmark_value
  observed_at
  data_vintage
  derivation_id
```

예:

```text
impact hypothesis created T0
 → +1d abnormal return
 → +5d CAR
 → +20d CAR
 → next-quarter revenue
 → next-quarter margin
 → guidance revision
 → analyst EPS revision
```

### 25.2 Evaluation

```text
impact_evaluation
  impact_path_id
  horizon
  expected_sign
  realized_sign
  predicted_interval
  realized_value
  calibration_error
  path_type
  regime
  coverage_state
```

### 25.3 학습 가능한 것

- 어떤 predicate가 유용했나
- 어떤 typed path가 실제 outcome과 연결됐나
- 어떤 event type은 어느 horizon에서 유효했나
- 어느 sector/regime에서 모델이 틀렸나
- 어느 theme lifecycle 신호가 선행성이 있었나
- 어떤 recommendation generator가 baseline보다 나았나

accepted truth를 자동 수정하지 않고 **분석 모델의 weight·policy 개선에 사용**한다.

---

# Part V. Impact & Analytics

## 26. Standard Impact Chain

```text
Event / State Change
 → Primitive Shock
 → Transmission Channel
 → Entity Exposure
 → Financial Statement Impact
 → Valuation / Credit / Flow Impact
 → Market Outcome
```

### Transmission Channels

- demand/revenue
- input cost
- production/capacity
- logistics
- FX
- rate/credit
- regulatory/legal
- tax/subsidy
- sanctions/tariff/trade
- competition/substitution
- technology/patent/standard
- ownership/governance
- flow/positioning
- attention/sentiment
- physical/climate
- cyber/operational
- accounting/one-off

---

## 27. Exposure Model

```text
exposure_id
entity_id
factor_or_shock
channel
sign
sensitivity
unit
horizon
lag_distribution
regime_condition
threshold
substitutability
input_specificity
materiality
valid/known time
estimation_method
uncertainty
```

`confidence=0.8` 하나로 뭉개지 않는다.

분리 축:

- evidence confidence
- relation strength
- economic materiality
- transmission probability
- direction / nonlinearity
- lag
- priced-in
- estimation uncertainty

---

## 28. Supply / Production Network

기업 공급망은 단순 `SUPPLIES` edge보다 다음 구조를 지향한다.

```text
Supplier LegalEntity
 → Facility
 → Component
 → Customer Product
 → Customer Segment
 → Revenue / Margin
 → Stock
```

중요 modifier:

- share of supply
- customer concentration
- supplier concentration
- inventory days
- lead time
- capacity utilization
- substitute supplier count
- switching cost
- input specificity
- geography concentration
- transport route dependency

### 산업→기업 하향 배분

```text
OECD ICIO / national IO shock
 → industry exposure
 → company segment/product/geography
 → supplier/customer detail
 → facility detail
```

산업-level estimate와 기업-level fact를 동일한 품질로 취급하지 않는다.

---

## 29. Analytics Method Router

질문별로 다른 방법을 사용한다.

| 질문 | 방법 | 저장 class |
|---|---|---|
| 사건 직후 반응 | Event Study | statistical_estimate |
| 여러 horizon 동적 반응 | Local Projections | statistical/dynamic estimate |
| 정책 처리군 효과 | DiD / Synthetic Control | causal_estimate |
| 고차원 confounder | DML | causal_estimate |
| 시계열 관계 후보 | PCMCI+ 계열 | causal_hypothesis candidate |
| 생산망 전파 | IO/Leontief + firm graph | mechanism estimate |
| 유사/숨은 관계 후보 | PathSim / NBFNet / HGT / TGN | candidate_score |
| 확률 전망 | probabilistic model + conformal | forecast |
| 시장 상태 | HMM / change point / regime model | market_state estimate |

모델 출력의 라벨을 method class에 맞춘다.

---

## 30. Market Regime Model

Theme과 recommendation은 시장 regime에 조건부여야 한다.

독립 축:

- growth
- inflation
- liquidity
- monetary policy
- credit
- FX/USD
- commodity
- volatility
- risk appetite

```text
market_regime_snapshot
  as_of
  regime_dimensions
  posterior probabilities
  change_point_probability
  feature vintage
  method/model
  uncertainty
```

“risk-on/off” 한 단어로 모든 상태를 압축하지 않는다.

---

## 31. Historical Analog Engine

사용자에게 “과거 비슷한 사건”을 보여준다.

### Retrieval dimensions

- event type
- affected product
- geography/jurisdiction
- exposure shape
- market regime
- expectation surprise
- narrative state
- valuation/crowding

### 결과

- 당시 사건
- 당시 상황이 왜 비슷한가
- 무엇이 다른가
- +1d/+5d/+20d 반응
- 실적 반영 시점
- analog quality

Stock/event memory는 **문서 유사도보다 구조화 event sequence**를 우선 사용한다.

---

## 32. Forecast & Scenario

Forecast는 point target이 아니라 분포를 우선한다.

```text
forecast
  target
  as_of
  horizon
  distribution / quantiles
  model
  features
  regime
  calibration
  coverage
```

### Scenario

```text
base
bull
bear
policy_delayed
policy_exempted
supply_recovers
recession
liquidity_shock
...
```

각 branch에:

- precondition
- probability/weight, 보정되지 않았으면 ordinal
- impact range
- evidence
- invalidation

---

# Part VI. Theme Intelligence

## 33. Theme Strength Model

현재 테마 강도를 다음 축으로 계산한다.

### Market Confirmation

- relative return
- breadth
- volume participation
- liquidity
- new highs / dispersion
- ETF/fund flow, 사용 가능 시

### Fundamental Confirmation

- earnings revisions
- guidance changes
- revenue/order/backlog growth
- CAPEX
- product adoption
- utilization

### Narrative Dynamics

- deduplicated event count
- source diversity
- novel entity expansion
- narrative acceleration
- semantic drift
- contradiction rate

### Forward Catalysts

- policy schedule
- product launches
- earnings calendar
- contract ramp
- capacity opening
- macro event

### Risk / Crowding

- valuation percentile
- price extension
- options/volatility
- positioning
- low breadth despite index strength
- narrative saturation
- expectation already elevated

### Regime Fit

- rates
- inflation
- USD
- commodity
- liquidity
- credit

---

## 34. Theme Detection

Theme source는 하나가 아니다.

1. existing curated themes
2. thematic ETFs
3. industry/product ontology
4. news/event clusters
5. earnings/IR recurring concepts
6. semantic community changes
7. returns/flow co-movement — confirmation, not truth

`THEME`류 연구처럼 semantic representation과 temporal market dynamics를 결합하는 방식은 **candidate/theme membership ranking**에 활용할 수 있다.

새 theme는 자동 생성 후 바로 공식 taxonomy가 되지 않는다.

```text
candidate theme
 → minimum entity breadth
 → source diversity
 → stable definition
 → economic linkage
 → human/ontology review threshold
 → published theme
```

---

# Part VII. Recommendation & Curation Architecture

## 35. Common Asset View

모든 사용자에게 공통인 종목 분석 결과.

```text
common_asset_view
  entity
  as_of
  horizon
  business_quality
  growth
  profitability
  balance_sheet
  valuation
  revisions
  catalyst
  theme_state
  factor_exposure
  event_impact
  market_confirmation
  priced_in
  risks
  forecast_distribution
  scenarios
  unknowns
  coverage
  derivation
```

LLM은 이 객체를 바꾸지 않고 설명만 한다.

---

## 36. Asset Opportunity Snapshot

공통 discovery를 위한 별도 객체.

```text
asset_opportunity_snapshot
  asset_id
  as_of
  horizon
  generator_reasons[]
  axis_scores
  opportunity_state
  risk_state
  novelty
  liquidity_state
  coverage_state
  uncertainty
  policy_version
  derivation_id
```

권장 opportunity_state:

- `HIGH_INTEREST`
- `INTERESTING`
- `WATCH`
- `NEUTRAL`
- `RISK_ELEVATED`
- `INSUFFICIENT_DATA`

개인화 action과 동일한 BUY/SELL 라벨을 사용하지 않는 것이 안전하다.

---

## 37. Curation Delivery

사용자에게 왜 노출했는지 저장한다.

```text
curation_delivery
  user_id nullable
  asset_id
  opportunity_snapshot_id
  surface
  reason_codes
  interest_context
  rank
  diversity_bucket
  delivered_at
```

사용자 행동은 truth에 역류하지 않는다.

### User Interest Signals

- watchlist
- holdings
- explicit follow
- search
- clicked entity
- viewed theme
- dismissed item

클릭/검색 기반 신호는 TTL과 opt-out을 지원한다.

---

## 38. Personalized Portfolio Action

기존 Personalization Plane 원칙 유지.

```text
portfolio snapshot
+ common asset view
+ user goals
+ constraints
+ risk
+ liquidity
+ taxes/cost
→ decision compiler / optimizer
→ decision packet
```

Actions:

- ADD
- HOLD
- REDUCE
- EXIT
- WATCH
- NO_ACTION
- INSUFFICIENT_DATA

Cost basis는 expected return 신호로 사용하지 않는다.

---

## 39. Recommendation Evaluation

추천의 성공을 클릭률만으로 평가하지 않는다.

### General Discovery

- PIT future return distribution by horizon
- downside / drawdown
- calibration
- hit rate vs random/market-cap baseline
- diversity
- novelty
- repeated exposure
- theme/sector concentration
- coverage
- recommendation stability

### Personalized

- net utility after transaction cost/tax
- CVaR / drawdown
- concentration improvement
- turnover
- action flip rate
- abstention precision
- goal/risk constraint satisfaction

### Product Utility

- time-to-insight
- source clicks saved
- duplicate-news reduction
- explanation comprehension
- citation trace success
- “why this asset” reason usefulness

---

# Part VIII. Geo Plane

## 40. Geo Roles

기존 Geo Plane 유지.

- source origin
- reported from
- mentioned place
- occurred at
- announced at
- issuer jurisdiction
- applies to
- targets
- affected area
- origin/destination/route
- facility location
- domicile
- listing market
- revenue exposure
- supply exposure

기사의 첫 국가를 사건 위치로 자동 확정하지 않는다.

---

## 41. Spatial Impact

```text
Disaster polygon
 → facility intersection
 → capacity exposure
 → product/component
 → supplier/customer
 → revenue/margin
 → security
```

```text
Sanction jurisdiction
 → target entity/product
 → trade/finance exposure
 → sales/payment feasibility
 → cashflow/working capital
 → valuation
```

PostGIS를 정본, H3/MVT를 projection으로 유지한다.

---

# Part IX. Crypto-Specific World Model

## 42. 코인을 주식 ontology에 억지로 넣지 않는다

공통 기반:

- identity
- source/provenance
- event
- expectation
- scenario
- outcome
- report/serving

코인 전용:

- chain
- protocol
- smart contract
- token
- validator
- oracle
- bridge
- exchange
- custodian
- wallet cluster

---

## 43. Crypto Graphs

### Dependency Graph

```text
Protocol → DEPLOYED_ON → Chain
Protocol → DEPENDS_ON → Oracle
Protocol → USES → Bridge
Token → TOKEN_OF → Protocol
Stablecoin → BACKED_BY → Reserve Asset
```

### Tokenomics

- circulating supply
- FDV
- unlock calendar
- emission
- staking
- burn
- treasury
- governance

### Risk

- smart contract exploit
- bridge exploit
- oracle failure
- depeg
- exchange/custody failure
- liquidation cascade
- validator concentration
- chain congestion/outage
- governance attack

### Market Confirmation

- spot/futures basis
- funding
- OI
- liquidations
- exchange net flows
- stablecoin supply
- TVL
- fees
- active addresses, 품질 주의

---

## 44. Crypto Resource Registry

공식 홈페이지 외:

- docs
- verified contract address
- explorer
- GitHub
- governance forum
- audit
- treasury dashboards

contract upgrade와 token migration을 bitemporal identity로 관리한다.

---

# Part X. Data Acquisition Strategy

## 45. Data Source Families

| 영역 | 우선 데이터 |
|---|---|
| 기업 | DART/SEC/거래소/IR/XBRL, earnings call transcript, guidance history, insider/capital-allocation disclosures |
| 재무 | statement facts, segment, guidance, backlog, CAPEX |
| 가격 | OHLCV, corporate actions, benchmark |
| 수급 | ETF holdings, ownership, short, securities lending, fund flow, options/derivatives where licensed |
| 시장구조 | bid/ask, depth, order flow, auction/halts, venue quality, funding/basis, open interest |
| 거시 | FRED/ALFRED, ECOS, 중앙은행·통계기관 |
| 기대 | consensus/guidance/implied expectations, 라이선스 분리 |
| 정책 | 법령·규제기관·제재·관세·정부조달 |
| 산업 | OECD ICIO, HS/ECCN, 무역, 특허·표준 |
| 실물 | 시설·항만·광산·발전·데이터센터 |
| 재난 | 지진·화재·기상·재난 geometry |
| 뉴스 | primary announcements + reputable news + discovery feeds |
| 코인 | chain RPC/indexer, protocol APIs, governance, token schedule |

SEC의 company submissions/XBRL API, FRED real-time/vintage 기능, GLEIF Level 2 parent relationship, OECD ICIO 같은 공식 데이터는 canonical identity·numeric fact·PIT·production network의 기반으로 활용할 수 있다.

---

## 46. Source Independence

동일 통신사 기사가 여러 매체에 재배포된 경우 독립 근거로 세지 않는다.

저장:

```text
canonical story cluster
syndicated_from
publisher ownership group
quoted primary source
near_duplicate_hash
independent_source_group
```

---

# Part XI. Storage & Compute

## 47. PostgreSQL은 정본이지 모든 byte의 저장소가 아니다

권장 역할:

| 데이터 | 저장 |
|---|---|
| entity/assertion/event/relation/provenance metadata | PostgreSQL |
| raw bytes | replicated content-addressed object store |
| parsed artifacts | object store + PG manifest |
| 시계열 | TimescaleDB 또는 columnar projection |
| backtest intermediate | Parquet + DuckDB/Polars, 필요 시 ClickHouse |
| vector index | 재생성 가능 derived index |
| graph online projection | PG 우선, 병목 시 별도 engine |
| cache | Redis/CDN 등 |

---

## 48. Table Explosion 방지 규칙 — 구현 관점 신규 보강

현재 시스템은 이미 물리 테이블 수가 매우 크다. 새로운 개념을 추가한다고 **개념마다 새 테이블을 무한히 만들면 안 된다.**

### 원칙

1. 논리 객체 ≠ 항상 물리 테이블.
2. 안정적인 공통 필드가 있으면 typed generic ledger를 우선한다.
3. 무결성·조회량·join 의미가 뚜렷한 핵심 객체만 dedicated table로 승격한다.
4. source별로 동일 schema 테이블을 복제하지 않는다.
5. event type별 테이블을 만들지 않는다.
6. JSONB는 optional/experimental payload에 사용하고 핵심 filtering semantics는 컬럼화한다.
7. 고카디널리티 revision/outcome/event는 time partition을 고려한다.
8. derived projection은 삭제·재생성 가능성을 명시한다.
9. canonical truth와 serving projection을 같은 retention 정책으로 두지 않는다.

### 우선 dedicated table 후보

- assertion
- numeric_fact
- event
- event_participant
- relation ledger
- expectation
- surprise
- exposure
- theme state
- outcome/evaluation
- derivation

나머지는 typed child/JSON payload로 시작 후 hot query가 확인되면 승격한다.

---

## 49. Derivation DAG

한 사용자 문장에 여러 근거·계산이 필요하다.

```text
report item → one derivation_id

derivation
  step1 source assertions → normalized contract
  step2 numeric facts → exposure ratio
  step3 event + exposure → scenario impact
  step4 market data → reaction confirmation
  output → atomic statement
```

W3C PROV-O의 Entity–Activity–Agent/derivation 개념을 참고하되 PostgreSQL 내부 도메인 모델로 구현한다.

---

# Part XII. Orchestration & Reliability

## 50. 현재 가장 큰 운영 리스크: 조용한 실패

현재 as-built에서 실제 장애가 사람의 우연한 확인으로 발견된 이력이 있으므로, 분석 모델 고도화보다 운영 신뢰성을 선행한다.

### 반드시 추가

- dependency-aware DAG
- durable stage state
- retry policy
- fencing/lease
- backfill namespace
- output watermark
- expected row/coverage delta SLO
- heartbeat
- notification
- stale serving guard

`systemd time ordering`만으로 선행 의존성을 표현하지 않는다.

---

## 51. Silent Failure Detection

job exit code 0만으로 건강하다고 판단하지 않는다.

각 stage에:

```text
expected input watermark
expected output family
expected minimum/maximum delta
acceptance ratio range
coverage delta
latency SLO
last successful semantic output
```

예:

- 뉴스 job 성공했지만 0건 증가
- event extraction 성공했지만 claim count 정지
- serving view가 구조적으로 0행
- parser가 전부 skip해 정상 200 no-data 반환

모두 alert 대상이 되어야 한다.

---

## 52. Publication Consistency — 신규 보강

현재 서로 다른 content pack kind가 서로 다른 snapshot을 잠깐 서빙할 수 있는 문제를 해결한다.

### Release Manifest

```text
serving.release_manifest
  release_id
  market_data_snapshot
  knowledge_snapshot
  graph_snapshot
  theme_snapshot
  expectation_snapshot
  recommendation_snapshot
  report_set
  built_at
  fresh_until
  status
  digest
```

사용자 요청은 가능한 한 하나의 `release_id`를 기준으로 읽는다.

새 release가 완성되기 전에는 이전 release를 유지한다.

### Component Freshness

전체 report freshness 하나 대신:

- price freshness
- news/event freshness
- fundamentals freshness
- expectation freshness
- theme freshness
- graph freshness
- recommendation freshness

를 노출한다.

---

## 53. Outbox / Eventing

선언만 있고 writer가 없는 edge를 없앤다.

- producer contract inventory
- actual writer reachability audit
- consumer delivery SLO
- idempotency
- dead letter
- replay range

고처리량·다수 독립 소비자·긴 replay 요구가 생기기 전에는 PG outbox를 사용할 수 있지만 Kafka와 동일한 보증으로 설명하지 않는다.

---

# Part XIII. Serving Architecture

## 54. L6 재정의

L6를 “Content Pack 하나”로 정의하지 않는다.

> **L6 = Versioned Serving Projections**

포함:

- content pack
- asset view
- theme view
- event brief
- peer ranking
- opportunity snapshot
- geo projection
- personalized packet

각 projection은 derivation과 release manifest에 결속한다.

---

## 55. API Families

### Market

```text
GET /api/market/overview
GET /api/market/events
GET /api/market/catalysts
GET /api/market/regimes
```

### Themes

```text
GET /api/themes
GET /api/themes/:id
GET /api/themes/:id/members
GET /api/themes/:id/timeline
GET /api/themes/:id/outlook
```

### Assets

```text
GET /api/assets/:key/overview
GET /api/assets/:key/peers
GET /api/assets/:key/ranks
GET /api/assets/:key/events
GET /api/assets/:key/exposures
GET /api/assets/:key/scenarios
GET /api/assets/:key/related
GET /api/assets/:key/resources
```

### Discovery

```text
GET /api/discovery/opportunities
GET /api/discovery/related/:key
GET /api/discovery/theme/:themeId
```

### Evidence

```text
GET /api/derivations/:id
GET /api/events/:id/sources
```

### Personalization

기존 V2 경로 유지 및 additive 확장.

---

# Part XIV. Retrieval, LLM, Graph ML

## 56. Retrieval Router

```text
Intent Router
├─ factual → entity + assertion + source
├─ numeric → numeric facts + executable calculation
├─ event → event graph + chronology
├─ relation → typed path
├─ theme → theme state + drivers + members
├─ recommendation → opportunity snapshots + evidence
├─ impact → exposure + estimates + scenario
├─ contradiction → conflict set
└─ personalized → common view + private packet
```

---

## 57. LLM 역할

### 허용

- extraction candidate
- entity candidate
- event coreference candidate
- theme naming/description candidate
- source summarization
- report wording
- counter-evidence search planning
- explanation level adaptation

### 금지

- accepted relation 직접 생성
- 숫자 암산 후 발행
- causal label 직접 결정
- BUY/SELL action 발명
- official URL을 근거 없이 생성
- model self-confidence를 probability로 표시

---

## 58. Graph ML

PathSim/NBFNet/HGT/TGN 등은 다음 용도에 제한한다.

- related candidate discovery
- missing link candidate
- theme member candidate
- anomaly
- retrieval ranking

출력은 `candidate_score`에만 저장한다.

최근 금융 KG 연구에서도 이벤트·정형 재무문서를 결합한 구조가 강조되고 있지만, 모델 기반 link prediction을 현실 사실로 직접 승격하는 정책은 사용하지 않는다.

---

## 59. Narrative / Event Memory Research Track

실험 후보:

- event sequence memory
- historical analog retrieval
- narrative change-point detection
- semantic + temporal theme representation
- market narrative lifecycle model

이 모델들은 **정보 정리·candidate discovery·forecast feature**로 사용하고 Truth Graph를 수정하지 않는다.

---

# Part XV. Security, Privacy, Rights, Compliance

## 60. User Privacy

- portfolio/profile RLS
- encryption
- private model context 최소화
- user-specific data는 common graph/RAG에서 제외
- user behavior TTL / delete lifecycle
- cross-user negative tests

---

## 61. Recommendation Compliance Plane

이 제품은 향후 일반·개인화 추천을 제공할 수 있으므로, 아키텍처에서 다음을 분리한다.

```text
Editorial / Discovery
Common Asset Analysis
Personalized Decision Support
Order Execution
```

Order Execution은 V2 비범위다.

상용 출시 전 jurisdiction별 투자자문·적합성·설명의무·기록보존·마케팅 표현 규제를 별도 legal gate로 검토한다.

규제 때문에 데이터 모델을 뒤엎지 않도록 모든 추천에:

- input snapshot
- policy version
- explanation
- evidence
- uncertainty
- user constraint
- delivery time

을 저장한다.

---

## 62. External Link Safety

공식 링크도 시간이 지나며 도메인이 바뀔 수 있다.

- resource registry verification
- HTTPS
- redirect chain 검사
- domain ownership evidence
- crypto phishing denylist/allowlist layer
- user generated links separate

---

# Part XVI. Evaluation & Machine Gates

## 63. Truth Gates

- unsupported accepted fact = 0
- polarity/modality 미확정 accepted = 0
- source span 없는 assertion = 0
- future information leakage = 0
- correction 이후 stale current projection = 0
- duplicate syndicated sources를 independent로 계산 = 0

---

## 64. Expectation Gates

- expectation source/time 미확정 = 0
- actual 이후 생성된 expectation을 surprise baseline으로 사용 = 0
- analyst/company/internal expectation 혼합 without type = 0
- dispersion/source count 누락 상태에서 consensus 확정 표현 = 0

---

## 65. Theme Gates

- current strength와 forward outlook 혼합 = 0
- theme member에 semantic/economic reason 둘 다 없음 = 0
- article count만으로 theme strength 확정 = 0
- candidate theme를 official theme처럼 노출 = 0
- lifecycle churn threshold 초과 시 publish hold

---

## 66. Recommendation Gates

- coverage 임계 미달인데 HIGH_INTEREST = 0
- 단일 opaque score만 저장 = 0
- reason code 없는 recommendation = 0
- liquidity/risk policy 위반 = 0
- same theme/sector diversity cap 위반 = 0
- personalized private input이 common opportunity에 혼입 = 0
- future outcome leakage in backtest = 0

---

## 67. Peer Rank Gates

- peer group membership 근거 없음 = 0
- 다른 회계기간 값을 같은 rank snapshot에서 무표기 혼합 = 0
- 전체 coverage 부족인데 absolute “업계 1위” 표현 = 0
- composite rank weight/version 누락 = 0

---

## 68. Outcome / Calibration Gates

- forecast인데 평가 horizon 미등록 = 0
- forecast result가 outcome과 연결 불가능 = 0
- model performance를 latest-vintage로 소급 평가 = 0
- cherry-picked backtest only = 0

---

## 69. Operational Gates

- expected schedule heartbeat 없음 = fail
- semantic output watermark stale = fail/degraded
- stage success but output delta abnormal = alert
- unreferenced serving view/materialized view 감사를 포함
- release manifest component inconsistency = publish 금지
- restore drill 실패 상태 = publish policy에 따라 fail/degraded

---

# Part XVII. Implementation-Focused Risk Review

## 70. 구현하면서 높은 확률로 만날 문제

### 70.1 Theme 정의가 흔들린다

“AI”, “AI 인프라”, “데이터센터”, “전력”, “원전”이 서로 겹친다.

대응:

- theme hierarchy
- overlapping membership 허용
- role 분리
- definition revision
- parent/child/related themes

### 70.2 Peer Group이 정답 하나가 아니다

한 기업은 반도체 회사이면서 HBM 회사이고 AI 인프라 수혜주일 수 있다.

대응:

- multi-peer membership
- 페이지 context에 따라 primary peer group 선택
- 사용자가 peer group 변경 가능

### 70.3 “업계 순위” 데이터가 부족하다

비상장 경쟁사나 market share 데이터가 없을 수 있다.

대응:

- coverage 표시
- 공개 데이터 차원만 rank
- 추정 market share는 estimate
- overall rank abstention

### 70.4 Recommendation은 쉽게 과최적화된다

테마·모멘텀·value를 섞어 과거에 잘 맞는 weight를 만들기 쉽다.

대응:

- walk-forward
- PIT universe
- transaction cost
- selection bias control
- simple baselines
- outcome ledger

### 70.5 Priced-In은 측정하기 어렵다

단일 true value가 없다.

대응:

- estimate class
- component decomposition
- model disagreement
- no binary truth

### 70.6 이벤트 중첩

실적일에 정책 뉴스까지 나오면 Event Study attribution이 어렵다.

대응:

- overlapping event flags
- exclusion/sensitivity runs
- multi-event attribution state

### 70.7 Company Resource URL이 틀릴 수 있다

브랜드 사이트와 법인 IR이 다르고 피싱 사이트가 섞일 수 있다.

대응:

- official filing cross-reference
- domain verification
- resource revision

### 70.8 뉴스가 너무 빠르다

공식 원천이 늦게 나온다.

대응:

```text
provisional event
 → independent corroboration
 → official confirmation
 → final factual state
```

### 70.9 테마 lifecycle이 하루마다 뒤집힌다

대응:

- hysteresis
- minimum state duration
- change-point confirmation
- current strength vs outlook 분리

### 70.10 새 종목 Cold Start

대응:

- identity + industry/product/theme content-based
- peer prior
- no fake historical model confidence

### 70.11 코인 identity가 바뀐다

- token migration
- contract upgrade
- chain fork
- ticker collision

대응: address/chain namespace + revision.

### 70.12 사용자 관심을 따라가다 echo chamber가 된다

대응:

- novelty quota
- diversification
- counter-theme exposure
- explicit “왜 보여주는지”

---

## 71. Schema Evolution Rule

새 기능 추가는:

```text
ADR/RFC
 → additive schema
 → shadow write
 → backfill
 → parity checks
 → shadow read
 → feature flag
 → release manifest
 → old projection retirement
```

기존 V2 API major version은 변경하지 않는다.

---

# Part XVIII. Updated V2 Roadmap

## 72. P0 — Reliability & Current Contract Closure

현재 우선:

- silent failure alerts
- output watermark/SLO
- workflow dependency 강화
- replay digest 검증
- V1 fallback 제거 검증
- restore drill
- outbox writer parity
- view/materialized-view reachability audit
- release manifest 도입 준비

**완료 조건:** 데이터가 멈추면 자동으로 알아챌 수 있다.

---

## 73. P1 — Truth Infrastructure + Expectation + Identity Enrichment

기존 P1에 추가:

- assertion
- numeric fact
- event n-ary
- contract/regulation
- conflict
- coverage
- 4-time model
- story lineage
- probabilistic entity resolution
- geo
- **expectation ledger**
- **surprise observation**
- **peer group/rank foundation**
- **entity resource registry**
- PIT security master

**완료 조건:** 한 회사 페이지에서 공식 정체성, 회사 설명, peer, 공식 링크, 숫자, 이벤트, 기대/actual까지 모두 provenance가 있다.

---

## 74. P2 — Exposure + Theme + Outcome Intelligence

- shock/channel/exposure
- production network
- priced-in estimate
- market regime
- Event Study / LP / DiD templates
- scenario
- theme lifecycle
- theme membership roles
- theme state/outlook
- historical analog
- **outcome/calibration ledger**
- GraphRAG router

**완료 조건:** 사건 하나에서 영향을 받는 종목, 이유, sign, lag, 시장 반응, 기대 반영, 실제 후속 결과 평가가 연결된다.

---

## 75. P3 — Market Intelligence Product

- Market Home
- Event Radar
- Strong/Emerging/Weakening Theme surfaces
- Asset Deep Dive
- Peer rankings
- Related assets
- resource links
- Event timeline
- map/globe
- value chain
- novice/expert rendering modes
- **Common Asset Opportunity**
- **general discovery recommendation**

**완료 조건:** 해당 분야를 모르는 사용자가 임의 종목을 클릭해 대표기업·상대위치·사업·최근 사건·테마·관련 종목·위험까지 이해한다.

---

## 76. P4 — Personalized Decision Support

기존 Personalization Plane.

- interest graph
- holdings/watchlist curation
- common view와 private action 분리
- rule/constraints
- optimizer
- tax/cost
- hysteresis/no-trade
- personalized event impact

**완료 조건:** 같은 종목이 사용자 맥락에 따라 다른 action을 내면서도 공통 사실은 동일하다.

---

## 77. P5 — Experimental ML Shadow

- HGT/TGN/NBFNet
- causal discovery
- event memory
- narrative emergence models
- semantic-temporal theme retrieval
- adaptive conformal
- contextual bandit for content ranking
- decision-focused learning sandbox

accepted truth와 order execution 권한 없음.

---

## 78. P6 — Crypto Vertical

- crypto identity
- on-chain event
- tokenomics
- dependency
- protocol risk
- unlock/governance
- depeg/liquidation
- crypto theme
- crypto recommendation opportunity
- crypto outcome/calibration

주식 predicate를 억지로 재사용하지 않는다.

---

# Part XIX. Vertical Acceptance Scenarios

## 79. Scenario A — 반도체 수출통제

```text
Official regulation
 → assertion
 → event + jurisdiction + product class
 → expectation before announcement
 → surprise vs expected policy severity
 → exportability shock
 → company segment exposure
 → revenue/order/margin impact
 → market reaction
 → priced-in estimate
 → scenario
 → related stocks
 → theme impact
 → later outcome/calibration
```

검증:

- 직접 피해주
- upstream 피해주
- 대체 수혜주
- 각 path reason
- historical analog
- user portfolio action

---

## 80. Scenario B — “AI 전력 인프라” 테마가 새로 강해진다

```text
AI capex events
 → data-center capacity demand
 → electricity demand narrative
 → utility/grid/equipment events
 → theme candidate
 → member roles
 → price breadth + earnings revisions
 → lifecycle emerging → accelerating
 → leaders / enablers / indirect beneficiaries
 → crowding/priced-in
 → forward catalysts
```

사용자 화면:

- 왜 이 테마가 생겼는지
- 현재 강도
- 아직 초반인지 이미 crowded인지
- 대표 종목
- 상대적으로 덜 오른 관련 종목
- 깨지는 조건

---

## 81. Scenario C — 사용자가 모르는 종목 클릭

사용자: “이 회사가 뭐 하는 곳인지 전혀 모름.”

페이지는 30초 안에 다음을 보여준다.

```text
무슨 회사인가
주요 제품
어디서 돈 버나
분야 대표기업
분야별 순위
이 회사 강점/약점
현재 테마
최근 핵심 이벤트 5개
다음 촉매
공식 홈페이지/IR
관련 종목과 이유
위험
```

Deep Dive에는 원문과 분석 근거가 추가된다.

---

## 82. Scenario D — 일반 추천

사용자: “지금 볼 만한 종목은?”

```text
candidate generators
 → opportunity snapshots
 → risk/coverage filters
 → diversity reranker
 → list
```

각 결과:

```text
왜 지금 후보인지
어떤 horizon인지
무엇이 이미 반영됐는지
핵심 catalyst
핵심 risk
대안 peer
data freshness
```

---

## 83. Scenario E — 개인 보유 종목

```text
Common Asset View
 + Portfolio Snapshot
 + User Risk/Goal
 + Cost/Tax
 → Decision Packet
```

종목 전망이 좋아도 과도한 집중이면 `REDUCE`가 가능하고, 전망이 애매해도 거래비용이 크면 `HOLD`가 가능하다.

---

# Part XX. Do Not Do

## 84. 금지 목록

1. 새 V3 API를 별도 생성
2. 그래프 선 개수를 품질 지표로 사용
3. COMMON_OWNER/COMMON_ETF 같은 약한 edge를 impact 상단에 지배적으로 노출
4. 모든 관계를 하나의 confidence score로 축약
5. 모든 theme를 영구 taxonomy로 자동 승격
6. 테마 기사 수 = 테마 강도로 사용
7. 현재 강세 = 미래 강세로 표현
8. 좋은 기업 = 좋은 주식으로 표현
9. 좋은 뉴스 = 매수로 표현
10. consensus 데이터의 시점을 무시
11. 실제 결과를 latest revised 데이터로만 평가
12. 전체 산업 순위를 coverage 없이 단정
13. vector similarity만으로 related stock 설명
14. 추천 이유 없이 ticker만 나열
15. user click을 truth signal로 사용
16. personalized data를 common model에 혼입
17. LLM이 official link를 추측
18. LLM이 숫자를 계산해 발행
19. 모든 derived artifact 영구 보존
20. 물리 테이블을 개념 수만큼 증가
21. systemd 시각 순서만으로 DAG 보장
22. job exit 0만으로 pipeline healthy 판정
23. 서로 다른 serving snapshot을 한 페이지에서 무표기 혼합
24. 법적/제품 리스크 검토 없이 personalized recommendation을 order execution으로 연결

---

# Part XXI. Success Metrics

## 85. 플랫폼 성공 지표

### Data/Truth

- source coverage
- fact precision
- event dedup precision
- entity resolution precision/abstention
- provenance completeness
- PIT leakage = 0

### Insight

- analyst-labeled path relevance
- event→asset top-K usefulness
- theme lifecycle stability
- historical analog relevance
- priced-in calibration

### Discovery

- recommendation incremental value vs baseline
- diversity
- novelty
- coverage
- downside-adjusted outcome

### Product

- 사용자가 여러 외부 사이트를 방문하지 않아도 핵심 맥락을 얻는 비율
- event cluster당 duplicate article reduction
- source trace success
- beginner comprehension
- expert drill-down completion
- related asset reason usefulness

### Reliability

- semantic pipeline freshness
- silent outage detection latency
- stale serving incidents
- replay success
- restore success

---

# Part XXII. References / Research Anchors

이 문서는 특정 논문 하나를 그대로 구현하지 않는다. 아래 자료는 방법 선택의 연구·표준 anchor다.

### Provenance / Ontology / Identity

- W3C, **PROV-O: The PROV Ontology** — provenance/derivation 표준 참고.
- EDM Council, **Financial Industry Business Ontology (FIBO)** — 금융 개념 mapping 참고.
- GLEIF, **LEI Level 2 Relationship Data** — legal-entity parent/relationship 보강.
- XBRL International, **XBRL 2.1 / Dimensions** — financial facts의 unit, period, dimensions 구조.

### Official Data Infrastructure

- U.S. SEC, **EDGAR APIs / Company Facts** — submissions 및 XBRL data.
- Federal Reserve Bank of St. Louis, **FRED Real-Time Period / Vintage Dates** — PIT macro data.
- OECD, **Inter-Country Input-Output (ICIO) Tables** — 글로벌 production/trade flow.

### Financial KG / Event / Recommendation Research

- **Agentic Construction and Evaluation of Financial Knowledge Graphs**, arXiv:2508.17906 — SEC 10-K 기반 schema-guided KG construction.
- **FinKario: Event-Enhanced Automated Construction of Financial Knowledge Graph**, arXiv:2508.00961 — event-enhanced financial KG/RAG.
- **THEME: Enhancing Thematic Investing with Semantic Stock Representations and Temporal Dynamics**, arXiv:2508.16936 — semantic theme representation + temporal market dynamics.
- **StockMem: An Event-Reflection Memory Framework for Stock Prediction**, arXiv:2512.02720 — structured event sequence memory / historical event retrieval 연구 참고.
- **Parallel and Multi-Stage Knowledge Graph Retrieval for Behaviorally Aligned Financial Asset Recommendations**, arXiv:2511.11583 — market/user KG를 분리한 recommendation retrieval 참고.
- **Can News Predict the Market? Limits of Zero-Shot Financial NLP and the Role of Explainable AI**, arXiv:2606.12210 — zero-shot news signal의 한계와 uncertainty/explainability 중요성 참고.
- **Modeling the Evolutionary Modes of Financial Markets**, arXiv:2602.11918 — narrative evolution을 시장 동학으로 보는 연구 트랙 참고.
- **A Statistical Framework for Detecting Emergent Narratives**, arXiv:2602.20939 — narrative emergence/change detection 연구 참고.

- **Point-in-Time Financial RAG with Frozen LLMs and Market-Feedback Adaptive Retrieval**, arXiv:2605.31201 — evidence utility를 event type·horizon·market context별로 학습하는 source-memory 연구 참고.
- **TRACE: Temporal Rule-Anchored Chain-of-Evidence on Knowledge Graphs for Interpretable Stock Movement Prediction**, arXiv:2603.12500 — temporally valid typed path와 explicit evidence chain 연구 참고.
- **Towards Better Evolution Modeling for Temporal Knowledge Graphs**, arXiv:2602.08353 — co-occurrence shortcut, knowledge obsolescence, temporal benchmark 편향 경고.
- **Deep FinResearch Bench**, arXiv:2604.21006 — 전문 투자 리서치의 qualitative rigor·quantitative forecasting/valuation·claim verifiability 평가 축 참고.
- **FrontierFinance**, arXiv:2604.05912 — 3-statement/DCF/lender 등 장기 금융모델의 구조적 일관성과 expert-rubric 평가 참고.
- **When Summaries Distort Decisions: Information Fidelity in LLM-Compressed Financial Analysis**, arXiv:2606.29251 — 요약이 의사결정 관련 증거를 선택적으로 소실할 수 있다는 fidelity gate 연구 참고.
- **Reflexivity as Prompt**, arXiv:2606.00061 — 가격과 펀더멘털의 양방향 feedback을 별도 모델링해야 하는 연구 트랙 참고.
- **Detecting Unusual Trading Patterns on Cryptocurrency Exchanges by Means of Complexity Measures**, arXiv:2607.13916 — 거래소별 시장데이터 이상/인위적 거래 가능성에 대한 venue-quality 탐지 참고.
- **Can LLM-based Financial Investing Strategies Outperform the Market in Long Run?**, KDD 2026 / arXiv:2505.07078 — 긴 기간·넓은 universe·regime-aware 평가와 survivorship/look-ahead/data-snooping 통제 참고.

### Method Families

- Event Study
- Local Projections
- Difference-in-Differences
- Synthetic Control
- Double/Debiased Machine Learning
- Input-Output / Leontief production network
- Bayesian/Markov regime models and online change-point detection
- Conformal prediction / sequential calibration
- PathSim / NBFNet / HGT / TGN — candidate ranking only

---

# Part XXIII. Forward Catalyst & Company Context Extensions

## 86. Catalyst Calendar — 미래지향 제품에 필요한 1급 객체

현재 사건이 발생한 뒤 분석하는 것만으로는 “앞으로 강할 테마/종목”을 충분히 만들 수 없다. **이미 일정이 알려진 미래 사건**을 별도 객체로 관리한다.

### Scheduled Catalyst Types

주식:

- earnings release
- earnings call
- shareholder meeting
- dividend/ex-date
- index rebalance
- lock-up expiry
- product launch
- regulatory decision
- court ruling/hearing
- clinical/regulatory milestone
- factory opening/ramp
- contract start/end
- conference/investor day
- macro release
- central-bank meeting
- election/policy deadline

코인:

- token unlock
- emission change
- governance vote
- protocol upgrade
- hard fork
- incentive expiry
- vesting milestone
- bridge migration
- exchange listing/delisting

### 데이터 모델

```text
scheduled_catalyst
  catalyst_id
  catalyst_type
  subject_entity_id
  related_event_id nullable
  scheduled_start
  scheduled_end
  timezone
  market_session_mapping
  status = scheduled / expected / delayed / cancelled / completed
  importance_prior
  source_revision_id
  known_at
```

### Catalyst Expectation

```text
catalyst_expectation
  catalyst_id
  expected_metric/event_outcome
  expectation_snapshot_id
  scenario_set_id
  uncertainty
```

### 제품 사용

- “다음 주 중요한 이벤트”
- 종목 페이지 “다음 확인 시점”
- Theme Forward Watch
- recommendation catalyst score
- portfolio valid_until/invalidation

**예정됨**과 **실제로 발생함**을 분리한다. 예정 event가 취소되거나 연기되면 새 revision/state transition으로 처리한다.

---

## 87. Company / Protocol Profile Snapshot

사용자 경험을 위해 canonical truth를 매 요청마다 조합하지 않는다.

```text
entity_profile_snapshot
  entity_id
  release_id
  short_description
  business_model_summary
  products[]
  segments[]
  geographies[]
  key_customers_summary
  key_suppliers_summary
  peer_group_ids[]
  leader_positions[]
  current_theme_ids[]
  latest_event_ids[]
  next_catalyst_ids[]
  resource_ids[]
  coverage_state
  derivation_id
```

`short_description`은 LLM이 자유롭게 기업을 정의하는 것이 아니라 factual inputs에서 생성하고 derivation에 결속한다.

### 초보자 설명 모드

```text
이 회사는 무엇을 파나?
누가 사나?
왜 필요한가?
어떻게 돈을 버나?
경쟁사는 누구인가?
최근 왜 주목받나?
```

### 전문가 모드

동일 snapshot을 기반으로 segment, unit economics, estimates, exposure, valuation, scenarios를 추가한다.

---

## 88. Asset Comparison Engine

Deep Dive에서 “이 회사가 몇 등인가”만으로 끝내지 않고 **대안 선택**을 지원한다.

```text
GET /api/compare/assets?keys=A,B,C&peerGroup=...
```

표준 비교 축:

- business mix
- revenue/growth
- margin/ROIC
- balance sheet
- valuation
- analyst revisions
- price relative strength
- catalyst
- theme exposure
- risk
- geography
- customer/supplier concentration
- priced-in/crowding
- coverage

비교할 수 없는 지표는 임의로 보간하지 않고 `not_comparable`로 둔다.

---

# Part XXIV. As-Built → Target Compatibility & Migration Map

## 89. 기본 원칙: 현재 강한 원장은 갈아엎지 않는다

현재 구현에서 가치가 큰 구조는 유지한다.

```text
knowledge.relation_identity
knowledge.relation_revision
knowledge.relation_evidence_ledger
analytics.graph_snapshot
analytics.impact_path_v2
serving.content_pack
ops pipeline provenance/fencing
```

새 설계는 병렬 정본을 새로 만드는 것이 아니라 **기존 정본에 의미 객체를 additive하게 확장**한다.

---

## 90. 현재 객체별 전환 방향

### 90.1 `knowledge.relation_*`

유지:

- structural edge ledger
- accepted/evidence gates
- revision history

추가:

- assertion/event/contract가 relation의 upstream source가 됨
- exposure/estimate/forecast는 relation factual class 밖으로 이동
- relation projection에는 `origin_derivation_id`를 결속

### 90.2 기존 Claim/Event

기존 데이터는 즉시 삭제하지 않는다.

```text
legacy claim/event
 → backfill classifier
 → assertion/event/numeric_fact 후보
 → parity audit
 → new producers shadow write
 → read model switchover
 → legacy read retire
```

### 90.3 `core.entity`

유지.

추가:

- peer group은 core entity를 복제하지 않고 별도 analytical grouping
- resource registry는 entity_id FK
- theme membership도 entity_id FK

### 90.4 `core.listing`

현재 알려진 `known_at` 부재 문제를 해결한다.

- listing identity 자체와 listing state revision을 분리하거나
- bitemporal revision child를 추가한다.

거래소·티커·상장상태의 과거 정정이 in-place update에 의존하지 않게 한다.

### 90.5 `analytics.impact_path_v2`

이름과 API 의미는 유지한다.

path step 확장:

```text
relation edge
shock
channel
exposure
financial impact
estimate
```

모든 step을 relation edge FK 하나로 강제하지 말고 **typed derivation step**을 허용한다. 단, 기존 relation step은 backward-compatible하게 유지한다.

### 90.6 `serving.content_pack`

유지하되 L6 전체와 동일시하지 않는다.

- entity relation graph / impact brief에서 계속 사용 가능
- theme/profile/opportunity/rank는 별도 versioned projection 허용
- 모두 `release_manifest`에 묶는다.

### 90.7 `serving.*` direct read models

현재 실제 구현처럼 content pack을 우회하는 read model도 합법적인 L6 projection으로 공식화한다.

모든 read model은:

- source snapshot IDs
- release_id
- fresh_until/component watermark
- derivation/model version

을 제공한다.

### 90.8 Pipeline tracking 이원화

현재:

- `ops.pipeline_run_claim`
- `public.migration_runs` wrapper

가 공존한다.

장기적으로 공통 `ops.stage_attempt/run_manifest` projection에서 조회할 수 있게 통합 관측 모델을 둔다. 기존 이력은 보존한다.

### 90.9 Outbox

현재 실제 writer가 있는 event와 선언만 있는 event를 구분한다.

- producer registry가 선언된 producer의 actual writer를 audit
- writer 없는 relation/content event는 구현하거나 registry에서 provisional로 내린다.

### 90.10 Serving Pack Atomicity

현재 pack kind 사이 non-atomic publication은 `release_manifest`로 해결한다.

```text
build all required projections
 → verify
 → seal release manifest
 → atomically swap latest release pointer
```

---

## 91. 신규 객체의 Shadow Migration 순서

### Expectation

```text
new tables
 → historical backfill where legal/available
 → shadow ingest
 → surprise calculation
 → UI hidden diagnostics
 → product surface
```

### Theme

```text
existing Theme entities/community
 → theme_definition revision
 → role-aware memberships
 → state snapshots
 → lifecycle shadow labels
 → analyst/manual audit
 → public theme pages
```

### Peer Rank

```text
peer candidate sets
 → membership audit
 → rank snapshots
 → coverage gate
 → hidden comparison UI
 → public ranks
```

### Opportunity Recommendation

```text
candidate generators
 → shadow asset_opportunity_snapshot
 → PIT outcome tracking
 → baseline comparison
 → internal surface
 → general discovery
 → personalized curation
```

### Outcome Ledger

가능한 한 빨리 시작한다. 과거 recommendation/impact가 충분히 쌓인 뒤 만드는 것이 아니라 **예측/판단 객체가 생기는 순간 평가 대상 horizon을 등록**해야 미래 정답을 잃지 않는다.

---

## 92. 물리 Migration 안전 규칙

- 기존 applied migration 수정 금지
- additive migration 우선
- NOT NULL은 backfill 후 단계적으로
- enum/check 변경은 ontology RFC와 동기화
- backfill run은 production latest pointer와 분리
- 모든 backfill은 `known_at`을 임의로 과거로 소급하지 않는다
- derived historical reconstruction은 `reconstructed=true`와 정보집합 품질을 명시
- release parity가 확인되기 전 old read 제거 금지

---

# Part XXV. Second-Pass Adversarial Architecture Review

이 Part는 기존 설계를 단순 확장한 목록이 아니다. 다음 세 사고법으로 **기존 설계의 암묵적 가정을 공격**한 결과다.

- **연역**: 투자 판단에 필요한 최소 충분 조건에서 역산한다.
- **귀납**: 실제 금융 분석과 시스템 실패에서 반복되는 패턴을 일반화한다.
- **유추**: 검색엔진, 의료 진단, 신용평가, 과학적 가설검정, 추천시스템, 소프트웨어 SRE가 해결한 문제를 자본시장에 이식한다.

핵심 발견은 다음과 같다.

1. `event → asset`만으로는 부족하고 **asset/business model 자체의 경제 방정식**이 필요하다.
2. 시장 움직임의 원인은 하나가 아니므로 **경쟁 가설과 설명되지 않은 움직임**을 보존해야 한다.
3. 사건을 먼저 발견하는 흐름뿐 아니라 **시장 이상을 먼저 보고 원인을 찾는 역방향 discovery**가 필요하다.
4. 시장은 외생적 세계를 수동 반영하지 않는다. **가격·자금조달·attention이 다시 실물 의사결정을 바꾸는 feedback loop**가 있다.
5. 모든 source가 모든 질문에 똑같이 유용하지 않으므로 **event type × horizon × task별 source utility**가 필요하다.
6. 사용자의 시간은 희소자원이므로 “더 많은 정보”가 아니라 **추가 정보량(information gain)과 attention budget**을 최적화해야 한다.
7. 추천은 절대평가가 아니라 **대안집합과 benchmark 안의 상대 선택 문제**다.
8. 전문가 수준 분석에는 sector-specific KPI, accounting, valuation, capital allocation 방법론이 구조화되어 있어야 한다.
9. 여러 impact path가 같은 원인을 공유하면 단순 합산 시 영향이 중복 계산된다.
10. 리포트를 짧게 만드는 과정 자체가 투자 결론을 왜곡할 수 있으므로 **compression fidelity**를 측정해야 한다.

---

## 93. Sector Intelligence & Analyst Playbook Registry

현재 ontology는 “무엇이 무엇과 연결되는가”에는 강하지만, **“이 산업을 분석할 때 무엇을 봐야 하는가”라는 전문 방법론 지식**이 없다.

이를 versioned methodology object로 만든다.

```text
sector_playbook_revision
  playbook_id
  industry/theme/category
  business_model_types[]
  key_kpis[]
  leading_indicators[]
  lagging_indicators[]
  unit_economic_formulas[]
  accounting_specifics[]
  valuation_methods[]
  common_risks[]
  common_catalysts[]
  causal_templates[]
  common_misconceptions[]
  data_requirements[]
  source_priority_policy
  ontology_revision
  valid_from / valid_to / known_from
```

예:

```text
Bank
  KPI: NIM, CET1, NPL, deposit beta, loan growth
  Driver: rates → deposit/funding cost → NIM → credit cost → ROE
  Valuation: P/B × sustainable ROE / cost of equity

Semiconductor Memory
  KPI: bit growth, ASP, inventory days, utilization, capex, node mix
  Driver: end demand → inventory → supply discipline → ASP → margin

SaaS
  KPI: ARR, NRR, CAC payback, gross margin, FCF margin
  Driver: seats/usage × price → ARR → retention → sales efficiency

Crypto Protocol
  KPI: fees, protocol revenue, TVL quality, active users, emission, treasury
  Driver: activity → fees → tokenholder capture → dilution/security budget
```

### 강제 원칙

- LLM이 종목마다 즉흥적으로 KPI 목록을 발명하지 않는다.
- common asset view는 해당 playbook coverage를 선언한다.
- sector playbook은 fact가 아니라 **분석 방법론 계약**이며 ontology RFC와 별도 revision을 가진다.
- 한 회사가 여러 business model을 가지면 segment별 playbook을 조합한다.

---

## 94. Company Economic Model — Business Driver / Unit Economics Graph

현재 `Exposure → Financial Impact` 사이가 여전히 추상적이다. 실제 분석에서는 **회사가 돈을 버는 방정식**이 필요하다.

```text
business_driver_model
  entity/segment
  driver_model_version
  revenue_equations
  cost_equations
  working_capital_equations
  capex/capacity equations
  financing equations
  accounting bridge
  source/estimate bindings
```

예:

```text
Revenue = UnitVolume × ASP
UnitVolume = EndDemand × MarketShare × CapacityAvailability
GrossProfit = Revenue - VariableInputCost - ManufacturingCost
OperatingProfit = GrossProfit - R&D - SG&A
FCF = EBIT(1-tax) + D&A - CAPEX - ΔNWC
```

### 왜 필요한가

`원유 상승 → 항공사 부정` 같은 edge보다 다음 설명이 훨씬 강하다.

```text
Jet Fuel +15%
 → unhedged fuel cost exposure 62%
 → fuel expense +X~Y
 → ticket repricing lag 1~2 quarters
 → operating margin -a~b pp
 → FCF sensitivity
```

### 모델 유형

- 직접 공시 기반 equation
- 산업 template + company override
- 통계 추정 sensitivity
- scenario assumption

각 입력은 `fact / estimate / assumption`을 구분한다.

---

## 95. Financial Statement Bridge & Sector KPI Ontology

`numeric_fact`만으로는 전문 분석이 부족하다. 숫자의 **경제적 역할**을 구조화한다.

```text
metric_concept
  canonical definition
  accounting standard
  numerator/denominator
  sign convention
  stock/flow type
  period semantics
  sector applicability
```

```text
financial_driver_bridge
  driver
  statement_line/concept
  relationship_type
  formula/program
  lag
  sensitivity
  evidence/assumption
```

반드시 지원:

- segment → consolidated bridge
- organic vs acquisition growth
- recurring vs one-off
- reported vs adjusted/non-GAAP
- currency translation vs transaction effect
- stock-based compensation
- working-capital normalization
- restatement
- share-count dilution

---

## 96. Valuation & Implied Expectation Engine

추천·“이 종목 어때?”에 valuation이 보조 숫자 수준이면 부족하다.

### 96.1 Valuation Method Registry

```text
valuation_method
  DCF
  dividend/residual income
  EV/EBITDA
  P/E
  P/B-ROE
  FCF yield
  sum-of-the-parts
  NAV/FFO
  commodity reserve/NAV
  crypto fee/revenue/value-capture
```

method applicability는 sector playbook에 결속한다.

### 96.2 Valuation Snapshot

```text
valuation_snapshot
  asset
  as_of
  method
  base_value_range
  assumptions
  scenario_id
  peer_set
  market_price
  implied_up/downside_range
  sensitivity_matrix
  derivation_id
```

### 96.3 Reverse Valuation / Market-Implied Fundamentals

현재 가격에서 역산한다.

```text
price
 → implied revenue CAGR
 → implied terminal margin
 → implied ROIC
 → implied duration
```

이를 consensus expectation과 비교해 **“좋은 회사냐”와 “현재 가격이 얼마나 좋은 미래를 이미 요구하느냐”**를 분리한다.

목표주가 하나보다 assumption surface와 valuation range를 우선한다.

---

## 97. Common Investment Thesis & Competing Hypothesis Ledger

시장 해석은 과학적 가설검정에 가깝다. 하나의 narrative를 곧바로 정답으로 만들지 않는다.

```text
investment_thesis_revision
  thesis_id
  subject = asset/theme/macro question
  thesis_type = bull/base/bear/alternative
  horizon
  premises[]
  predicted_observations[]
  supporting_derivations[]
  counter_evidence[]
  unknowns[]
  catalysts[]
  invalidation_conditions[]
  status
  posterior/ordinal belief
  known_at
```

예:

```text
Question: AI data-center 전력주 상승의 핵심 원인은?

H1: 구조적 전력 수요 증가
H2: 금리 하락에 따른 duration rerating
H3: 단기 theme/speculative flow
H4: 특정 정부 정책/보조금
```

새 데이터는 “정답 narrative에 추가”되는 게 아니라 각 hypothesis의 지지/반박 정도를 업데이트한다.

### 사용자 출력

- 현재 가장 잘 지지되는 설명
- 경쟁 설명 2~3개
- 무엇을 알면 둘을 구분할 수 있는가
- 어떤 사실이 현재 설명을 뒤집는가

---

## 98. Market-Move Attribution & Unexplained Move Ledger

“왜 시장이 움직였는가?”를 단일 cause로 확정하지 않는다.

```text
market_move_episode
  asset/theme/index
  start/end
  abnormal_return
  volume/flow anomaly
  volatility change
  cross-asset context
```

```text
move_attribution_hypothesis
  episode_id
  candidate_event/driver
  mechanism
  timing_fit
  cross_section_fit
  evidence_fit
  prior_pricing_state
  competing_explanations
  attribution_state = likely / plausible / weak / unresolved
```

**원인이 확인되지 않으면 `UNEXPLAINED`가 정상 상태**다.

이는 그럴듯한 사후 narrative를 생성하는 것보다 훨씬 중요하다.

---

## 99. Reverse Discovery / Anomaly-to-Evidence Pipeline

기존 흐름:

```text
Source/Event → Impact → Asset
```

추가 흐름:

```text
Market/On-chain Anomaly
 → residualize common factors
 → classify anomaly type
 → search scheduled/known events
 → search fresh disclosures/news/on-chain events
 → inspect linked entities/supply chain/venue
 → create candidate event/hypothesis
 → evidence acquisition
 → resolved explanation OR unresolved anomaly
```

### Trigger 예

주식:

- idiosyncratic abnormal return
- unusual volume / auction imbalance
- short/borrow change
- options IV/skew/open-interest jump
- peer divergence
- estimate revision without headline

코인:

- exchange inflow/outflow
- whale/treasury movement
- funding/basis dislocation
- liquidation cascade
- stablecoin mint/burn/depeg
- bridge/oracle anomaly
- venue-specific suspicious trading pattern

이 레이어는 사용자에게 **“갑자기 움직인 종목과 아직 설명되지 않은 이유”**를 제공한다.

---

## 100. Information Gain / Novelty as a First-Class Object

기사의 길이·조회수·언급량보다 **기존 knowledge state를 얼마나 바꿨는가**가 중요하다.

```text
information_delta
  object/event/theme
  before_state_digest
  after_state_digest
  new_facts
  revised_facts
  new_uncertainty_reduction
  contradiction_added
  expectation_shift
  thesis_shift
  economic_materiality
  novelty_score
```

### 구분

- `NEW_EVENT`
- `NEW_DETAIL`
- `CONFIRMATION`
- `CORRECTION`
- `CONTRADICTION`
- `EXPECTATION_SHIFT`
- `NO_MATERIAL_CHANGE`

동일 사건 기사 30개가 있어도 실제 information gain이 없으면 홈을 차지하지 않는다.

---

## 101. User Attention Budget & Editorial Set Optimization

제품의 목표는 모든 것을 노출하는 게 아니라 **한정된 사용자 attention으로 최대 시장 이해를 제공하는 것**이다.

각 surface는 단순 top-score ranking 대신 set-level objective를 사용한다.

```text
EditorialUtility(Set) =
  relevance
+ economic_materiality
+ information_gain
+ evidence_quality
+ coverage_of_distinct_drivers
+ diversity
+ user_relevance
- duplication
- stale_narrative
- attention_cost
- overconcentration
```

submodular/set-cover 방식처럼 **한 카드씩 독립적으로 고르는 것이 아니라 전체 화면의 중복을 고려**한다.

사용자별 `already_seen_state`를 두어 같은 사건을 새 기사처럼 반복 노출하지 않는다.

---

## 102. Active Research / Evidence Gap Planner

현재 Evidence Acquisition은 이미 알려진 URL/근거를 확보하는 성격이 강하다. 전문가 수준으로 가려면 **무엇을 아직 모르는지 스스로 작업 큐로 만드는 층**이 필요하다.

```text
research_question
  subject
  question_type
  why_material
  required_to_resolve_thesis/event/exposure
  priority
  due_by
```

```text
evidence_gap
  expected_fact_family
  current_coverage
  missing_dimension
  possible_sources[]
  resolution_state
```

```text
acquisition_task
  query/source plan
  source-rights constraint
  budget
  attempt history
  artifact results
  final disposition
```

예:

```text
"A사의 중국 매출 비중이 실제로 얼마인가?"
 → 최신 사업보고서 segment 없음
 → IR transcript 검색
 → 자회사/지역 자료 탐색
 → customs/trade estimate candidate
 → 직접 값 없음
 → interval estimate + coverage=partial
```

LLM/agent는 **research planner**일 수 있지만 fact 승인자는 아니다.

---

## 103. Data Acquisition Portfolio — 무엇을 수집할지도 투자 문제다

소스를 무한히 늘리지 않는다.

```text
SourceAcquisitionValue =
  expected_information_gain
× affected_user/product_coverage
× economic_materiality
× uniqueness
× expected_reliability
÷ (license_cost + engineering_cost + latency + legal_risk)
```

수집 우선순위는 다음에서 자동 제안할 수 있다.

- 반복적으로 발생하는 evidence gap
- 추천/테마에서 높은 영향인데 coverage가 낮은 factor
- 많은 사용자가 보는 종목의 핵심 unknown
- outcome이 나쁜 모델의 missing data family
- 경쟁 서비스 대비 정보 공백

즉 “API가 있으니까 수집”하지 않는다.

---

## 104. Dynamic Source Reliability & Source Utility Memory

`source_quality=0.8` 같은 정적 점수 하나는 부족하다.

서로 다른 두 개를 분리한다.

### Factual Reliability

- correction/retraction history
- numeric agreement with primary source
- attribution accuracy
- timestamp quality
- independence
- topic-specific accuracy

### Analytical Utility

- event type
- task type
- sector
- horizon
- market regime
- outcome feedback

```text
source_utility_snapshot
  source_family
  task/event_type
  horizon
  regime
  empirical_usefulness
  sample_size
  posterior_uncertainty
  last_updated
```

시장 outcome feedback는 **factual truth score를 수정하지 않는다.** “주가 예측에 유용했다”와 “사실이 정확하다”는 다른 질문이다.

---

## 105. Knowledge Decay / Half-Life Policy

모든 지식은 같은 속도로 낡지 않는다.

```text
knowledge_freshness_policy
  object_type
  predicate/fact_family
  expected_half_life
  hard_expiry
  refresh_trigger
  event_invalidation_rules
```

예:

- 법인 설립국: 매우 느림
- CEO: 사건 발생 시 즉시 invalidate
- supplier 관계: 중간
- valuation multiple: 매일
- price/flow: 분/초
- theme state: 시간/일
- consensus estimate: 수정 발생 시 즉시
- protocol TVL: 분/시간

`fresh_until` 하나를 모든 객체에 동일한 의미로 사용하지 않는다.

---

## 106. Market-Implied State & Positioning Plane

Expectation/Priced-In을 더 정교하게 만들기 위해 **시장 가격 자체가 말하는 기대와 포지셔닝**을 별도 projection으로 둔다.

```text
market_implied_state
  asset/factor/event
  horizon
  implied_volatility
  skew/term_structure
  risk_neutral_distribution_ref
  futures/basis
  funding
  borrow/short
  ETF/fund flow
  dealer/positioning proxy where legally available
  liquidity
  as_of
```

### 주의

- option-implied distribution은 physical probability가 아니라 risk premium을 포함한 시장가격 기반 분포다.
- 옵션·파생 데이터가 없는 종목은 “없음”을 coverage로 명시한다.
- implied state는 truth나 forecast와 물리 분리한다.

---

## 107. Market Microstructure & Tradability State

좋은 아이디어도 거래할 수 없으면 일반 추천 품질이 떨어진다.

```text
tradability_snapshot
  spread
  depth
  ADV
  turnover
  gap risk
  halt history
  borrow availability
  venue fragmentation
  expected slippage by order size
  liquidity regime
```

General Discovery도 최소 liquidity gate를 넘겨야 하며, 저유동성 자산은 별도 라벨과 더 높은 uncertainty를 요구한다.

코인은 exchange별 price/volume을 무조건 합치지 않고 venue quality와 suspicious activity 상태를 함께 둔다.

---

## 108. Reflexivity / Endogenous Feedback Graph

기존 impact chain은 외생 사건이 시장에 미치는 영향을 설명한다. 하지만 자본시장은 되먹임이 있다.

```text
Fundamental Improvement
 → Price Rise
 → Lower Cost of Capital / Easier Financing
 → Equity Issuance / Debt Refinance
 → CAPEX / M&A / Hiring
 → Capacity / Growth
 → New Fundamental State
```

반대도 가능하다.

```text
Price Collapse
 → financing constraint
 → dilution / covenant stress
 → capex cuts
 → supplier/customer distress
 → weaker fundamentals
```

테마에서도:

```text
Theme Attention
 → Fund Flow
 → Valuation Expansion
 → IPO / issuance / new entrants
 → Industry CAPEX
 → Future Supply Increase
 → Margin Compression
 → Theme Breakdown
```

코인:

```text
Token Price ↑
 → treasury/security budget ↑
 → incentive/APY ↑
 → liquidity/users ↑
 → fees ↑
```

또는 반대로 emission/dilution이 feedback을 악화할 수 있다.

`reflexive_edge`는 일반 causal fact가 아니라 mechanism/scenario class로 관리한다.

---

## 109. Capital Cycle & Claim-Supply Model

주식과 코인에 공통되는 중요한 질문은 **경제적 가치뿐 아니라 그 가치에 대한 claim 공급이 얼마나 늘어나는가**다.

주식:

- shares outstanding
- buyback
- SBC
- secondary offering
- convertibles
- warrants
- M&A consideration

코인:

- circulating supply
- FDV
- emission
- unlock
- treasury release
- staking rewards
- burn

```text
claim_supply_snapshot
  asset
  current_supply
  expected_supply_path
  scheduled_changes
  conditional_changes
  holder/concentration
  dilution_rate
  buyback/burn rate
```

“사업은 성장하지만 주당/토큰당 가치가 희석되는가?”를 직접 분석한다.

---

## 110. Management, Governance & Capital Allocation Track Record

기업 분석에서 숫자만큼 중요한 반복 패턴이다.

별도의 불투명한 “CEO 점수”를 만들지 않고 **관찰 가능한 track record**를 저장한다.

```text
management_track_record
  guidance issued vs realized
  capital allocation actions
  buyback timing
  dilution/SBC
  M&A announcement vs outcome
  ROIC on acquired/invested capital
  leverage policy
  disclosure/correction history
  governance events
```

### 가능한 출력

- guidance accuracy distribution
- capital allocation consistency
- M&A value creation history
- dilution discipline
- disclosure reliability

사람의 성격이나 주관적 평판이 아니라 사건과 결과에 결속한다.

---

## 111. Accounting Quality & Financial Forensics Layer

성장률이 높아도 회계 품질이 약할 수 있다.

```text
accounting_quality_snapshot
  accrual quality
  cash conversion
  receivable/inventory anomaly
  capitalization policy
  one-off dependence
  related-party exposure
  auditor/change events
  restatement history
  non-GAAP reconciliation quality
  balance-sheet stress
```

통계적 forensic score는 `risk signal`이며 fraud fact가 아니다.

산업별 회계 차이를 sector playbook과 결합한다.

---

## 112. Impact Graph Aggregation — Path Double Counting 방지

`impact_path_v2`는 설명에는 좋지만 **여러 path를 합산할 때 같은 underlying shock를 여러 번 셀 수 있다.**

예:

```text
AI demand → HBM → Company A
AI demand → Data Center → GPU → HBM → Company A
```

두 경로가 독립적 영향인 것처럼 더해지면 안 된다.

추가 객체:

```text
impact_factor_graph
  primitive shocks
  shared latent drivers
  transmission functions
  conditional dependencies
  interaction terms
  saturation/substitution
```

### aggregation 원칙

- path는 explanation unit
- factor graph / scenario DAG는 calculation unit
- common ancestor shock dedup
- correlated exposure covariance 반영
- substitution/capacity constraints
- nonlinear thresholds
- offsetting positive/negative channels

최종 영향은 `sum(path_score)`로 만들지 않는다.

---

## 113. Multi-Horizon Thesis Surface

“좋다/나쁘다” 하나가 아니라 시간축으로 다른 판단을 허용한다.

```text
horizon_surface
  intraday
  1-5d
  1-4w
  quarter
  1y+
```

예:

```text
Short-term:  positive — earnings surprise + squeeze
Medium-term: neutral  — valuation already high
Long-term:   positive — structural demand and capacity advantage
```

Theme, common asset view, recommendation, personalized action 모두 horizon을 필수 key로 갖는다.

---

## 114. Model Council, Disagreement & Out-of-Domain Detection

한 모델의 확신을 신뢰하지 않는다.

```text
analysis_view
  method/model
  question
  estimate/distribution
  assumptions
  diagnostics
```

```text
model_disagreement_snapshot
  question
  direction agreement
  distribution overlap
  assumption conflicts
  data-source conflicts
  regime/OOD flags
```

### OOD/abstention 예

- 이전 학습/검증에 없던 event type
- 구조적 break 직후
- 거래소/시장구조 변경
- 핵심 source coverage 붕괴
- 모델 간 sign conflict

이때 추천 엔진은 “평균내서 확신”하지 않고 uncertainty/abstention을 높인다.

---

## 115. Information Fidelity Gate — 요약이 결론을 바꾸지 않는가

한곳에서 모든 정보를 보여주려면 강한 압축이 필요하다. 하지만 요약은 중립적이지 않다.

각 주요 source/event/asset report에 대해 다음을 검사한다.

```text
source evidence
 → long evidence pack
 → compressed brief
```

### fidelity checks

- 핵심 positive evidence 보존
- 핵심 negative/counter evidence 보존
- 숫자 및 qualifier 보존
- uncertainty/condition 보존
- source attribution 보존
- decision-relevant premise 보존
- compression 전후 thesis direction 변화 감지

특히 30초 요약은 “더 짧은 전문가 리포트”가 아니라 별도 product contract로 평가한다.

---

## 116. Progressive Disclosure & Learning Graph

사용자가 어떤 분야를 모른다는 것은 단순 UI 문제이기도 하지만 **맥락 선행조건 문제**다.

```text
concept
 → prerequisite concept
 → plain-language explanation
 → professional definition
 → example
 → linked company/theme/KPI
```

Asset Deep Dive에서 `HBM`, `NIM`, `TVL`, `duration`, `basis`를 클릭하면 즉시 해당 개념과 왜 중요한지 볼 수 있게 한다.

사용자가 선택하는 `beginner / standard / research` 표현 모드는 **분석 결과를 바꾸지 않고 설명 깊이만 바꾼다.**

---

## 117. Natural-Language Screener / Thesis-to-Query Compiler

향후 사용자가 다음처럼 탐색할 수 있어야 한다.

```text
"AI 인프라인데 중국 매출이 낮고 부채가 적은 종목"
"실적 추정치가 올라가는데 주가는 아직 덜 오른 한국 종목"
"ETH 생태계인데 토큰 언락 위험이 낮고 수수료가 늘어나는 프로젝트"
```

LLM이 종목을 직접 발명하지 않고 구조화 query로 변환한다.

```text
Natural Language
 → intent + constraints
 → canonical metric/entity/theme predicates
 → PIT-valid screener query
 → candidate universe
 → opportunity/relevance reranker
 → explanation
```

query compiler는:

- 사용된 조건을 사용자에게 표시
- 지원하지 않는 조건은 숨기지 않고 `unavailable` 표시
- coverage가 다른 종목을 동일선상에서 무리하게 순위화하지 않음
- query execution trace 저장

---

## 118. Recommendation = Relative Choice over an Opportunity Set

“이 종목이 좋은가?”는 절대적 질문처럼 보여도 실제로는 **다른 선택과 비교하는 문제**다.

Common Asset Opportunity에 다음을 추가한다.

```text
opportunity_set_id
benchmark_asset/index
horizon
cash/risk-free alternative
peer alternatives
same-theme alternatives
cross-theme alternatives
expected excess-return distribution
risk/liquidity/capacity constraints
```

### 강제 원칙

- `HIGH_INTEREST`는 절대점수가 아니라 지정 opportunity set 안의 상대적 매력도를 설명한다.
- “아무것도 하지 않음 / 현금 / broad index”를 항상 baseline 후보로 둔다.
- 추천 엔진의 성과는 단순 미래수익률뿐 아니라 **baseline 대비 incremental value**로 평가한다.
- 사용자의 관심과 무관한 general discovery에서도 liquidity·coverage·horizon을 명시한다.

---

## 119. Coverage & Popularity Bias Correction

데이터가 많은 대형주가 recommendation과 graph에서 항상 더 좋아 보이는 문제가 생긴다.

측정:

- source count by asset
- article count
- filing depth
- analyst coverage
- graph degree
- metric completeness

ranking에 `coverage advantage`와 `media attention bias`를 분리 저장하고 필요 시 정규화한다.

“근거가 많음”과 “좋은 종목”을 혼동하지 않는다.

Under-followed 후보는 coverage가 낮아서가 아니라 **필수 fact coverage는 충분하지만 attention이 낮은 경우**만 허용한다.

---

## 120. Crypto Venue Integrity & Manipulation-Risk Plane

코인은 동일 자산도 거래소별 데이터 품질이 다르므로 `price`를 하나의 무조건적 truth로 합치면 안 된다.

```text
venue_quality_snapshot
  exchange
  pair
  timestamp_quality
  volume consistency
  trade-size distribution
  orderbook integrity
  cross-venue divergence
  withdrawal/deposit state
  outage history
  anomaly indicators
  reliability_state
```

추가 risk candidate:

- wash-trading-like pattern
- fake liquidity
- oracle manipulation
- low-float squeeze
- concentrated holder transfer
- admin-key/upgrade risk
- bridge dependency
- stablecoin collateral quality

이들은 의심 신호이지 범죄/조작 fact로 자동 승격하지 않는다.

---

## 121. Adversarial Evaluation & Anti-Shortcut Tests

모델이 실제 시간·경제 구조를 배우지 않고 **동시출현/유명도/티커 기억** 같은 shortcut으로 좋은 점수를 받을 수 있다.

필수 테스트:

### Blind Identity Test

- 회사명을 익명화하고 재무·사건·관계만 제공
- 브랜드 prior 없이 같은 결론을 내리는가

### Temporal Shuffle / Leakage Test

- 미래 문서·revision이 조금이라도 들어가면 gate 실패
- event time을 shuffle했을 때 성능이 유지되면 temporal model을 의심

### Graph Shortcut Test

- degree/코멘션만으로 baseline을 만들고 고급 graph model이 실제 incremental value를 내는지 확인
- relation type masking / path ablation

### Narrative Bias Test

- 같은 숫자를 긍정/부정 문체로 바꿔도 구조화 판단이 유지되는가

### Popularity Bias Test

- 유명 대형주와 덜 알려진 종목에 동일 evidence packet을 익명 제공

### Counter-Evidence Omission Test

- 핵심 반대 근거를 빼면 결과가 얼마나 변하는지 기록

### Compression Fidelity Test

- full evidence vs 30초 요약에서 action/thesis direction이 불필요하게 flip하지 않는가

### Long-Horizon / Broad-Universe Test

- 짧은 bull period나 생존종목만으로 성능을 주장하지 않는다.

---

## 122. Research Quality Benchmark for the Product Itself

제품의 분석 품질을 단일 “정확도”로 평가하지 않는다.

### Research dimensions

1. factual accuracy
2. numeric/program execution accuracy
3. claim verifiability
4. analytical completeness
5. sector-method appropriateness
6. valuation consistency
7. counter-evidence coverage
8. time/PIT validity
9. uncertainty calibration
10. consistency under repeated run
11. information fidelity after compression
12. recommendation incremental value

전문가 gold report를 그대로 모방하는 것이 목표가 아니라 **전문가 수준의 검증 가능한 분석 절차**를 가진다.

---

## 123. 2차 검토에서 발견한 구현상 위험

### 123.1 Business Driver Model의 무한 커스텀화

모든 회사를 별도 equation으로 만들면 유지보수가 불가능하다.

대응:

```text
sector template
 → business-model subtype
 → segment override
 → company override
```

재사용 가능한 formula/component registry로 만든다.

### 123.2 Thesis가 Narrative와 중복될 위험

- narrative = 시장 참여자가 이야기하는 것
- thesis = 시스템이 검증 대상으로 유지하는 투자 가설

물리 분리한다.

### 123.3 Source Utility가 자기충족적으로 왜곡될 위험

“그 소스를 보고 산 사람이 많아 주가가 움직인 것”과 “그 소스가 정보를 잘 제공한 것”을 구분하기 어렵다.

따라서 source utility는 recommendation truth가 아니라 retrieval prior이며, factual reliability와 분리한다.

### 123.4 Reverse Discovery의 사후합리화

가격이 움직였다고 아무 사건이나 붙이면 narrative bias가 커진다.

`UNEXPLAINED`를 정상적인 최종 상태로 허용한다.

### 123.5 Valuation의 거짓 정밀도

DCF는 입력 가정에 매우 민감하다. 하나의 target price보다 range/sensitivity와 assumption provenance를 강제한다.

### 123.6 추천의 데이터 snooping

generator 30개를 만들면 우연히 잘 맞는 generator가 반드시 생긴다.

모든 generator를 registry에 사전 등록하고 holdout/walk-forward/selection-bias gate를 적용한다.

### 123.7 Attention Optimization이 선정성을 키울 위험

CTR을 목적함수에 직접 넣으면 공포·급등 뉴스가 우세해진다.

`economic_materiality + information_gain + diversity`가 상위 목적이고 클릭은 제한된 보조 신호다.

### 123.8 산업 playbook이 낡을 위험

산업 구조도 변한다. playbook 역시 `valid/known time + revision + outcome evaluation`을 가진다.

### 123.9 Reflexivity 모델이 모든 버블을 설명하는 만능서사가 될 위험

feedback edge는 observation이 아니라 mechanism hypothesis로 관리하고 정량 가능한 중간 단계가 없으면 확정 표시하지 않는다.

### 123.10 Microstructure 데이터 비용과 라이선스

모든 종목에 options/LOB를 강제하지 않는다. coverage tier를 두고 고급 market-implied 기능은 데이터가 있는 자산만 제공한다.

---

# Part XXVI. Revised Priority & Roadmap

## 124. S0 — 추천/전문 분석 전에 반드시 필요한 것

1. assertion/event/numeric fact/coverage/PIT — 기존 P1
2. sector playbook + KPI ontology
3. business driver / financial statement bridge
4. expectation/surprise
5. exposure/transmission
6. common thesis + competing hypothesis
7. valuation/reverse-implied expectation
8. outcome/calibration
9. impact aggregation double-counting 방지
10. opportunity-set / benchmark semantics

**이 중 2~9가 없이 “이 종목 추천”을 먼저 열면 LLM이 빈 공간을 자연어로 메우게 된다.**

## 125. S1 — 제품 차별화를 크게 만드는 것

1. reverse discovery / unexplained moves
2. information gain / story delta
3. active evidence-gap research
4. theme lifecycle + horizon surface
5. source utility memory
6. market-implied / positioning
7. management/capital-allocation track record
8. accounting quality
9. claim supply / dilution
10. progressive industry primer

## 126. S2 — 데이터가 쌓이면 강력해지는 것

1. reflexivity / capital-cycle feedback
2. model council / OOD
3. natural-language screener compiler
4. attention set optimization
5. adaptive retrieval source memory
6. richer options/microstructure
7. crypto venue-integrity models

## 127. S3 — Shadow Research Only

- HGT/TGN/NBFNet link/path candidate
- causal discovery candidate
- remote sensing facility state
- learned impact propagation
- bandit content ranking
- decision-focused learning / offline RL

accepted truth와 직접 매매 action 권한은 주지 않는다.

---

## 128. Updated Phase Mapping

### P0 — Reliability

기존 P0 유지 + semantic output SLO + pipeline alert + release manifest.

### P1 — Truth + Domain Intelligence

기존 P1에 추가:

- sector playbook/KPI ontology
- industry primer
- source reliability dimensions
- knowledge decay policy
- common thesis skeleton

### P2 — Economic & Valuation Intelligence

기존 P2에 추가:

- business driver graph
- financial statement bridge
- valuation method registry / reverse valuation
- impact factor graph aggregation
- multi-horizon thesis surface
- outcome/calibration

### P2.5 — Market Discovery Intelligence

- unexplained move episodes
- reverse evidence search
- market-implied state
- information gain
- source utility memory
- accounting/management/capital-cycle features

### P3 — Product Surfaces

- market home with unexplained move radar
- industry primer + concept learning
- thesis view
- valuation assumption view
- natural-language screener beta
- attention-budget editorial selection

### P4 — Personalized Decision Support

기존 common view/private action 경계 유지. Opportunity Set과 cash/index alternative를 명시한다.

### P5 — Experimental ML

anti-shortcut benchmark 통과 후에만 shadow 모델을 추가한다.

### P6 — Crypto

기존 crypto ontology에 venue integrity, claim supply, reflexive tokenomics를 추가한다.

---

# Part XXVII. Revised Acceptance Scenarios

## 129. Scenario F — 원인을 모르는 급등

상황:

```text
Company X +11%
volume 4.2×
peer sector +0.6%
공식 공시 없음
```

완료 조건:

1. `market_move_episode` 생성
2. market/sector/factor residual 계산
3. scheduled catalyst 검사
4. recent filing/news/IR 검색
5. supply-chain/customer events 검색
6. options/short/flow가 있으면 확인
7. 후보 explanation 0~N 생성
8. 근거가 약하면 `UNEXPLAINED` 유지
9. 새 evidence 도착 시 attribution revision
10. 처음부터 존재했던 것처럼 과거 explanation을 덮어쓰지 않음

## 130. Scenario G — 사용자가 처음 보는 은행주

페이지는 단순 회사 설명 대신:

```text
은행이 돈 버는 방식
 → 예대마진/NIM
 → deposit beta
 → credit cost
 → CET1
 → ROE
 → P/B valuation
```

을 먼저 알려주고 해당 회사의 값·peer percentile·최근 변화·금리 scenario를 연결한다.

완료 조건:

- sector playbook 적용
- KPI 정의 hover/설명
- peer universe PIT 정확
- valuation 방법 적합
- 최근 event/thesis change
- 초보/전문가 모드가 같은 underlying facts 사용

## 131. Scenario H — 실적은 좋은데 주가가 하락

시스템은 `positive earnings = positive stock`으로 설명하지 않는다.

검사:

- consensus / whisper / guidance expectation
- segment mix
- forward guidance
- price-implied expectation
- options positioning
- pre-event run-up
- valuation
- management commentary

가능한 결과:

```text
Headline result: beat
Forward expectation: miss
Pre-priced state: high
Valuation: stretched
→ actual은 좋았지만 시장의 forward bar에는 못 미침
```

## 132. Scenario I — 같은 테마 두 종목 중 무엇을 볼까

비교:

- economic exposure
- business quality
- growth/estimate revision
- valuation/reverse assumptions
- balance sheet
- liquidity
- claim dilution
- catalyst
- theme role
- priced-in/crowding
- uncertainty

결과는 “A 83점, B 77점” 하나가 아니라 **어떤 조건에서는 A, 어떤 조건에서는 B인지**를 보여준다.

---

# Part XXVIII. 2차 당시 Architectural Judgment — Historical Rationale

## 133. 지금 시스템에서 반드시 유지해야 하는 것

- append-only source/relation ledger
- evidence gate
- PIT discipline
- Company/Stock identity separation
- sealed snapshot/digest
- model config provenance
- fact vs estimate vs forecast 분리
- fail-closed serving
- private personalization isolation

## 134. 2차 검토 후 가장 중요한 보강 순위

1. **Sector Playbook / KPI Ontology**
2. **Business Driver / Financial Statement Bridge**
3. **Expectation / Surprise / Market-Implied State**
4. **Common Thesis / Competing Hypotheses**
5. **Economic Exposure / Transmission**
6. **Valuation / Reverse-Implied Expectations**
7. **Outcome / Calibration**
8. **Impact Aggregation / Double-Counting Control**
9. **Reverse Discovery / Unexplained Move Radar**
10. **Theme Lifecycle / Narrative Dynamics**
11. **Information Gain / Attention Budget**
12. **Active Research / Evidence Gap Planner**
13. **Dynamic Source Reliability & Utility**
14. **Management / Accounting / Capital Allocation Quality**
15. **Claim Supply / Dilution**
16. **Reflexivity / Capital Cycle**
17. **Peer / Relative Position**
18. **Opportunity Set / General Discovery Recommendation**
19. **Entity Resource / Official Link Registry**
20. **Serving Release Consistency / Silent Failure Detection**

## 135. 2차 당시 제품 사고 사슬 — Historical

```text
World Truth
  ↓
Event / State Change
  ↓
Expectation + Competing Hypotheses
  ↓
Information Gain / Surprise
  ↓
Exposure
  ↓
Business Driver / Unit Economics
  ↓
Financial Statement Bridge
  ↓
Valuation / Market-Implied Expectations
  ↓
Positioning / Market Reaction
  ↓
Scenario / Multi-Horizon Thesis
  ↓
Outcome / Calibration
  ↓
Common Asset View
  ↓
Opportunity Set / Discovery / Curation
  ↓
Personalized Action

Parallel:
Market anomaly → Reverse Discovery → Evidence Gap → Event/Hypothesis
Market price/flow → Reflexive real-world feedback → New World State
```

## 136. 2차 당시 제품 정의 — Historical

> **Stock/Crypto Insight V2는 뉴스와 시세를 모아 AI가 의견을 붙이는 서비스가 아니라, 현실의 사건·기업의 사업모델·시장 기대·경제적 전달경로·가격에 이미 반영된 상태·경쟁 투자 가설·실제 결과를 시간에 따라 연결하고 스스로 검증하는 Evidence-Grounded Investment Context World Model이다.**

사용자는 이 월드모델 위에서:

- 오늘 시장에서 실제로 바뀐 것
- 왜 움직였는지와 아직 이유를 모르는 움직임
- 강한/형성/과열/약화 테마
- 처음 보는 산업을 이해하는 법
- 특정 기업이 어떻게 돈을 버리고 무엇이 숫자를 움직이는지
- 업계에서 어느 위치인지
- 현재 가격이 어떤 미래를 이미 요구하는지
- bull/bear thesis와 무엇이 그 판단을 깨뜨리는지
- 함께 볼 종목과 더 나은 대안
- 일반적인 투자 후보
- 자신의 포트폴리오에 적용한 행동 지원

을 같은 truth base에서 깊이만 달리해 볼 수 있다.

---

# Part XXIX. Later Split Plan

단일 설계 검증 후 다음과 같이 분할한다.

```text
00-product-north-star.md
01-system-overview.md
02-truth-provenance-pit.md
03-entity-world-ontology.md
04-sector-playbook-kpi-ontology.md
05-event-expectation-surprise.md
06-business-driver-financial-bridge.md
07-exposure-impact-causal.md
08-valuation-market-implied.md
09-thesis-hypothesis-outcome.md
10-theme-narrative-regime.md
11-market-reaction-reverse-discovery.md
12-asset-opportunity-recommendation.md
13-peer-ranking-company-deep-dive.md
14-industry-primer-learning.md
15-news-event-information-gain.md
16-active-research-source-utility.md
17-geo-plane.md
18-personalization-plane.md
19-crypto-world-model.md
20-data-sources-rights.md
21-storage-serving.md
22-orchestration-reliability.md
23-evaluation-adversarial-gates.md
24-roadmap.md
25-acceptance-scenarios.md
```

분할 시 **이 단일 문서가 의미 정본**이며, 동일 객체를 문서마다 서로 다르게 재정의하지 않는다.


---

# Part XXX. 3차 수직 관통 파괴 테스트 — Domain Reality Check

## 137. 목적과 테스트 방법

2차 검토까지는 제품과 분석의 빠진 축을 넓게 찾았다. 3차 검토는 반대로 **서로 구조가 완전히 다른 자산을 실제로 구현한다고 가정하여 한 줄로 끝까지 관통**한다.

테스트 대상은 다음 다섯 유형이다.

1. **복합 반도체/AI 플랫폼 기업** — 제품 세대, 공급제약, 고객, 제품 믹스와 기대가 동시에 움직이는 산업
2. **은행/금융기관** — 손익계산서보다 대차대조표, 만기, 조달, 규제자본이 중요한 산업
3. **임상단계 바이오텍** — 현재 매출보다 확률적 미래 사건, 임상근거, 규제와 현금 runway가 중요한 산업
4. **원자재 생산기업** — 회사가 아니라 광산·유전·프로젝트 같은 물리 자산 단위 경제성이 중요한 산업
5. **ETH형 스마트컨트랙트 네트워크/토큰** — 회사·주식과 다른 소유권, block state, protocol/token value capture, composability가 중요한 자산

각 시나리오에서 다음 관통을 강제한다.

```text
source/raw
 → identity
 → metric semantics
 → factual state/event
 → expectation/surprise
 → economic driver
 → exposure/transmission
 → valuation/value capture
 → thesis/scenario
 → market reaction/priced-in
 → peer/theme/related assets
 → recommendation opportunity set
 → personalized action
 → UI statement
 → outcome/calibration
```

테스트 중 하나라도 다음 질문에 답하지 못하면 설계 공백으로 간주한다.

- 어떤 객체에 저장되는가?
- 어떤 시간축을 가지는가?
- source/derivation을 재현할 수 있는가?
- 회사가 아니라 실제 투자 가능한 security/token에 어떻게 귀착되는가?
- 같은 이름의 숫자가 정말 비교 가능한가?
- 사용자에게 보이는 문장은 fact/estimate/forecast 중 무엇인가?
- 나중에 실제 결과가 나왔을 때 맞았는지 평가할 수 있는가?

---

## 138. Scenario J — 복합 반도체/AI 플랫폼 기업

### 138.1 사용자가 원하는 화면

사용자가 해당 산업을 전혀 모르는 상태에서 종목을 누르면 최소 다음 흐름이 보여야 한다.

```text
이 회사는 무엇을 파는가
 → 제품 세대/플랫폼은 무엇인가
 → 어느 고객/산업이 수요를 만든다
 → 누가 생산하고 어떤 부품이 병목인가
 → 현재 공급능력과 backlog는 어떤가
 → 다음 제품 세대와 출시 일정
 → 시장은 어느 성장률/마진을 이미 기대하는가
 → 경쟁사는 누구이고 제품/경제성 기준 어디쯤인가
 → 최근 사건이 어떤 driver를 바꿨는가
 → 같은 테마에서 더 직접/저평가/안전한 대안은 무엇인가
```

### 138.2 기존 모델만으로 손실되는 것

`Company → PRODUCES → Product`와 `SUPPLIES`만으로는 아래를 담지 못한다.

- 제품 **generation/version**과 successor 관계
- 개발 발표, 샘플링, 양산, 단종의 lifecycle
- customer의 **design win / qualification / adoption** 상태
- 공급계약과 별개의 wafer/capacity reservation 또는 commitment
- 제품별 ASP, unit volume, gross margin mix
- foundry/package/memory/networking처럼 한 제품의 multi-layer dependency
- backlog의 취소 가능성, lead time, prepayment 등 **backlog quality**
- 고객 집중도와 end-market 수요를 동시에 넣을 때 발생하는 double counting

### 138.3 추가 객체

```text
world.product_generation
  product_generation_id
  product_family_id
  generation_name
  architecture/process/package attributes
  announced_at
  sampling_at
  production_at
  end_of_life_at
  predecessor/successor
  valid/known time

world.commercial_commitment
  commitment_id
  commitment_type = DESIGN_WIN / QUALIFICATION / CAPACITY_RESERVATION /
                    MIN_PURCHASE / PREPAYMENT / BACKLOG / FRAME_AGREEMENT
  supplier_entity
  customer_entity
  product_generation
  quantity/value/range
  cancellability
  start/end
  confidence/evidence

world.capacity_state
  facility/product/process
  capacity_unit
  nameplate/effective/utilized
  yield
  lead_time
  constrained_by[]
  as_of/known_at
```

직접 탐색용 projection은 여전히 간단한 edge로 제공한다.

```text
A --SUPPLIES--> B
A --PRODUCT_GENERATION--> G
G --QUALIFIED_BY--> B
G --MANUFACTURED_AT--> Facility
```

정본은 reified object다.

### 138.4 분석 보강

반도체 영향은 단순 path 합이 아니라 다음 순서로 계산한다.

```text
End demand
 → customer deployment/adoption
 → unit demand
 → product mix
 → capacity/yield constraint
 → realized shipment
 → ASP
 → revenue
 → gross margin
 → operating leverage
```

`demand shock`와 `capacity shock`를 같은 exposure로 취급하지 않는다.

### 138.5 발견된 공통 설계 요구

**Product Lifecycle & Commercial Commitment Layer**가 필요하다. 이 레이어는 반도체뿐 아니라 자동차 플랫폼 채택, SaaS enterprise contract, 항공기 backlog, 배터리 공급계약에도 재사용할 수 있다.

---

## 139. Scenario K — 은행/금융기관

### 139.1 범용 기업모델이 깨지는 이유

은행은 `Revenue = Volume × ASP`보다 **대차대조표의 stock과 maturity/repricing 구조**가 핵심이다.

```text
Policy Rate
 → asset repricing
 → liability/deposit repricing
 → NIM

Macro deterioration
 → borrower quality
 → delinquency/default
 → provision/credit cost
 → capital

deposit outflow
 → liquidity need
 → funding mix
 → funding cost / asset sale
 → capital & earnings
```

일반 제조업용 `supplier/customer/product` 그래프만으로는 이 구조가 표현되지 않는다.

### 139.2 추가 객체

```text
finance.balance_sheet_position
  institution
  position_type = LOAN / DEPOSIT / SECURITIES / WHOLESALE_FUNDING /
                  DERIVATIVE / CASH / COMMITMENT
  product/category
  carrying_value
  currency
  rate_type = fixed/floating
  maturity_bucket
  repricing_bucket
  duration
  secured/collateral_type
  counterparty_class
  as_of/known_at

finance.regulatory_capital_snapshot
  CET1 / total capital / RWA / leverage measure
  buffers
  distribution constraints
  source definition revision

finance.liquidity_state
  liquid assets
  uninsured/operational deposit mix
  wholesale funding dependence
  maturity ladder
  available collateral
  stress assumptions

finance.credit_exposure
  borrower/sector/geo/collateral
  exposure amount
  risk grade
  delinquency/default state
  provision/coverage
```

실제 규제 지표 명칭과 공식 계산식은 jurisdiction/source definition revision에 묶고, 제품은 특정 규제 체계가 없는 경우 일반화된 경제 개념으로 읽는다.

### 139.3 추가 그래프

**Financial Contagion / Funding Graph**가 별도로 필요하다.

```text
Bank
 → depositor/funding source
 → collateral
 → counterparty
 → clearing/payment network
 → securities portfolio
 → sovereign/sector credit exposure
```

이 그래프의 edge는 공급망과 같은 의미로 취급하지 않는다.

### 139.4 valuation과 peer

은행 peer rank에는 같은 `P/E` 비교보다 다음을 조합해야 한다.

- sustainable ROE
- book-value quality
- funding franchise
- credit cost
- capital excess/deficit
- growth
- P/B 또는 residual-income 계열 valuation assumptions

따라서 `sector playbook`은 KPI 목록뿐 아니라 **balance-sheet state model type**까지 지정해야 한다.

### 139.5 발견된 공통 설계 요구

**State Stock / Maturity Ladder Engine**이 필요하다. 금융뿐 아니라 보험 liability, 부채 만기, 토큰 unlock schedule, commodity hedge book에도 재사용할 수 있다.

---

## 140. Scenario L — 임상단계 바이오텍

### 140.1 현재 월드모델이 가장 크게 깨지는 유형

매출이 거의 없거나 현재 이익이 의미 없는 회사에서는 전통적인 business driver/valuation chain이 동작하지 않는다.

가치의 핵심은 다음이다.

```text
Biological hypothesis
 → therapeutic asset
 → indication
 → trial design
 → endpoint/result
 → regulatory milestone
 → probability of technical/regulatory success
 → launch timing
 → addressable patient/economics
 → royalty/milestone economics
 → cash runway/dilution
 → risk-adjusted value
```

### 140.2 Clinical Evidence Object Family

임상시험 결과를 기사 문장 몇 개의 `assertion`으로만 저장해서는 안 된다.

```text
life_science.therapeutic_asset
  molecule/device/platform
  target/mechanism
  modality
  sponsor/license owner
  indication memberships

life_science.clinical_study
  study registry identifiers
  phase/design
  indication
  population
  arms
  enrollment
  primary/secondary endpoints
  randomization/blinding/control
  start/status/completion
  protocol revisions
  source provenance

life_science.study_endpoint_result
  study
  endpoint
  analysis_population
  effect estimate
  uncertainty interval
  p/statistical measure if applicable
  event counts
  safety/adverse-event dimensions
  subgroup qualifier
  data cutoff
  source locator

life_science.regulatory_milestone
  authority/jurisdiction
  asset/indication
  milestone_type
  scheduled/actual date
  status
  conditions
```

### 140.3 Evidence hierarchy

다음은 서로 같은 강도의 근거가 아니다.

```text
trial registry/protocol
regulator document
peer-reviewed publication
conference abstract/presentation
company press release
management commentary
media report
```

그러나 단순 `source_quality` 숫자로 합치지 않고 `evidence_role × study state × source type`으로 해석한다.

### 140.4 바이오 valuation

전통 DCF 외에 확률 경로가 필요하다.

```text
program scenario tree
  preclinical
  phase 1
  phase 2
  phase 3
  filing
  approval
  commercialization
```

각 단계는 probability가 아니라 **source/model/version이 있는 conditional probability assumption**을 가진다.

```text
risk_adjusted_value
 = Σ scenario_probability × scenario_cashflow_value
```

하나의 `success_probability=0.63`을 truth처럼 저장하지 않는다.

### 140.5 현금과 희석

바이오 추천에서 사업성만큼 중요한 것은:

- cash runway
- burn rate
- financing window
- authorized/issued shares
- option/warrant/convertible overhang
- partnership milestone inflow

이다.

따라서 `Claim Supply Model`과 `Capital Structure Graph`가 valuation/recommendation 앞단에 있어야 한다.

### 140.6 발견된 공통 설계 요구

1. **Study / Experiment Evidence Model** — 과학·임상·기술 benchmark 등 구조화 실험 근거
2. **Milestone / Stage-Gated Scenario Engine** — 바이오뿐 아니라 광산개발, 신규공장, 규제승인에도 재사용
3. **Cash Runway / Financing Dependency**를 common asset view의 필수 risk로 승격

---

## 141. Scenario M — 원자재 생산기업

### 141.1 회사 단위 분석만 하면 틀리는 이유

광산·유전·발전소 등 자산집약 산업에서는 회사 전체보다 개별 asset의 경제성이 먼저다.

```text
Commodity price
 → asset-specific realized price
 → grade / recovery / production volume
 → unit operating cost
 → sustaining capex
 → tax/royalty
 → asset FCF
 → ownership economic interest
 → corporate NAV / balance-sheet
```

### 141.2 Physical Economic Asset Model

기존 `Facility`를 단순 위치 객체로만 쓰지 않는다.

```text
world.economic_asset
  asset_type = MINE / FIELD / POWER_PLANT / DATA_CENTER / FACTORY / PORT / ...
  operator
  legal owner(s)
  economic interest(s)
  geography
  lifecycle_stage
  capacity
  start/closure dates
  permits
  commodity/product outputs
  derivation

resource.reserve_resource_revision
  economic_asset
  commodity/material
  classification/source standard
  quantity
  grade/quality
  recovery assumption
  cutoff/economic assumptions
  measurement date
  source revision

resource.operating_state
  production
  realized price
  unit cost
  sustaining/growth capex
  downtime
  inventory
  guidance range
  as_of/known_at

resource.hedge_position
  commodity/currency
  instrument type
  quantity/notional
  strike/range
  maturity
  accounting/economic treatment
```

### 141.3 Economic interest와 legal ownership 분리

한 프로젝트에서:

- 법적 지분
- operator 권한
- royalty
- stream/offtake
- JV economic interest

가 다를 수 있다.

`OWNS` 하나로 표현하면 valuation이 틀린다.

따라서 다음 공통 객체를 추가한다.

```text
world.economic_interest
  holder
  underlying entity/asset/cashflow
  interest_type = EQUITY / ROYALTY / STREAM / OFFTAKE /
                  PROFIT_SHARE / REVENUE_SHARE / SECURITY_CLAIM
  percentage/formula
  priority/seniority
  start/end
  evidence
```

이 객체는 자원기업뿐 아니라 JV, 펀드, structured finance, crypto protocol fee sharing에도 재사용한다.

### 141.4 commodity scenario

spot 하나가 아니라 horizon별 curve/hedge/FX를 분리해야 한다.

```text
spot state
forward curve
realized price formula
hedge book
FX
transport differential
quality differential
```

### 141.5 발견된 공통 설계 요구

- Company economic model을 **segment/asset economic model**로 일반화
- legal ownership과 economic claim 분리
- physical asset lifecycle/milestone
- resource/reserve fact에는 measurement basis와 economic assumptions 필수

---

## 142. Scenario N — ETH형 스마트컨트랙트 네트워크와 토큰

### 142.1 가장 먼저 분리할 것

```text
Blockchain Network ≠ Protocol ≠ Smart Contract ≠ Token ≠ Token Holder Claim
```

네트워크 활동이 증가했다고 토큰 가치가 같은 비율로 증가하지 않는다.

```text
network usage
 → fees
 → validator/sequencer economics
 → burn/treasury/protocol capture
 → issuance/dilution
 → security budget
 → tokenholder economic capture
```

`protocol revenue`와 `tokenholder value capture`를 같은 metric으로 두지 않는다.

### 142.2 On-chain provenance는 문서 provenance와 다르다

블록체인 데이터는 처음 관측됐다고 즉시 영구 사실로 고정하면 안 되는 경우가 있다. canonical chain과 finality를 표현해야 한다.

```text
crypto.onchain_observation
  chain_id
  block_height
  block_hash
  tx_hash/log_index
  observed_at
  canonicality_state = provisional/finalized/orphaned
  finality_at
  decoder/schema version
  raw payload hash
```

체인 재조직 또는 indexing correction이 발생하면 원본을 삭제하지 않고 **canonicality revision**으로 처리한다.

```text
crypto.canonical_chain_revision
  chain
  affected_height_range
  previous hashes
  canonical hashes
  detected_at
  reason
```

### 142.3 Contract Version / Upgrade Graph

proxy, implementation upgrade, migration 등으로 주소 하나가 영구한 프로그램 의미를 보장하지 않는다.

```text
crypto.contract_deployment_revision
  contract identity
  chain/address
  bytecode/code hash
  implementation/proxy relationship
  deployed_at block
  retired/replaced_at
  audit bindings
```

### 142.4 Protocol Economic Flow

```text
crypto.protocol_economic_flow
  payer/source
  protocol/module
  flow_type = USER_FEE / GAS / PRIORITY_FEE / MEV /
              SEQUENCER_REVENUE / BURN / TREASURY / VALIDATOR_REWARD /
              TOKEN_INCENTIVE
  amount/unit
  recipient/burn destination
  period
  value-capture relevance
```

### 142.5 Token Supply State

```text
crypto.token_supply_state
  total/issued/circulating/locked/staked/burned
  scheduled unlock/emission
  holder concentration buckets
  staking withdrawal constraints
  as_of block + wall-clock known time
```

`total supply`, `circulating`, `economically liquid`을 하나의 숫자로 축약하지 않는다.

### 142.6 DeFi composability와 contagion

ETH 같은 자산은 여러 프로토콜에서 동시에 collateral이 될 수 있다.

```text
ETH
 → staking derivative
 → lending collateral
 → stablecoin debt
 → LP position
 → leveraged loop
```

단순 path 합산은 동일 underlying collateral을 여러 번 세게 된다. 기존 Impact Double Counting 규칙을 crypto collateral DAG에도 적용한다.

필요 객체:

```text
crypto.collateral_exposure
crypto.protocol_dependency
crypto.bridge_dependency
crypto.oracle_dependency
crypto.liquidation_exposure
```

### 142.7 시간축

코인에는 wall-clock 외에도:

- block height
- epoch/slot 등의 chain-native index
- finalized time
- exchange market time

이 존재한다.

PIT API는 chain data를 읽을 때 `knownAt`뿐 아니라 필요한 경우 `finalizedThrough` 또는 canonical chain snapshot을 함께 고정한다.

### 142.8 발견된 공통 설계 요구

- immutable document source와 **eventually-final on-chain source를 같은 source lifecycle로 취급하면 안 됨**
- `value capture`를 경제적 claim 모델로 분리
- code/deployment version도 provenance의 일부
- recursive collateral/derivative exposure용 underlying DAG 필요

---

# Part XXXI. 3차 테스트로 발견한 공통 구조 공백

## 143. Metric Definition & Comparability Registry — 추천/랭킹 전에 필수

현재 `metric_concept`만으로는 같은 이름의 숫자를 서로 직접 비교해도 되는지 보장하기 어렵다.

예:

```text
ARR
active user
protocol revenue
NIM
free cash flow
reserve
backlog
```

은 회사·소스마다 scope와 계산 정의가 달라질 수 있다.

### 143.1 데이터 모델

```text
metric_definition_revision
  metric_definition_id
  canonical_concept_id
  reporting_entity/source
  display_name
  formal_definition
  calculation_program
  numerator/denominator concepts
  inclusion/exclusion rules
  scope/dimensions
  unit/basis
  accounting/statistical standard
  source locator
  valid_from/valid_to/known_from
```

`numeric_fact`는 `metric_concept`만이 아니라 가능한 경우 `metric_definition_revision`을 참조한다.

### 143.2 Comparability Assessment

```text
metric_comparability
  observation_a / definition_a
  observation_b / definition_b
  state = EXACT / NORMALIZABLE / APPROXIMATE / NOT_COMPARABLE / UNKNOWN
  normalization_program
  reasons[]
  method_version
```

Peer rank는 `EXACT` 또는 정책상 허용된 `NORMALIZABLE`만 기본 사용한다.

`APPROXIMATE`는 별도 badge와 uncertainty를 표시하고, `NOT_COMPARABLE`은 순위에서 제외한다.

### 143.3 왜 중요한가

이 레이어가 없으면 시스템은 숫자를 많이 모을수록 더 자신 있게 잘못 비교하게 된다.

---

## 144. Capital Structure & Economic Claim Graph

사용자가 투자하는 것은 회사 자체가 아니라 특정 **경제적 claim**이다.

```text
Company
 ├─ common stock
 ├─ preferred
 ├─ ADR/DR
 ├─ convertible
 ├─ bond
 └─ option/warrant
```

코인에서도:

```text
Protocol / Network
 └─ Token
      └─ tokenholder가 실제로 어떤 economic capture를 갖는가
```

를 분리해야 한다.

```text
finance.economic_claim
  claim_id
  underlying_entity
  instrument/security/token entity
  claim_type
  seniority
  voting/governance rights
  cashflow/dividend/fee rights
  conversion/exercise terms
  maturity
  collateral
  dilution relation
  jurisdiction
  valid/known time
```

Recommendation은 `Company View`와 `Investable Claim View`를 분리한다.

좋은 회사라도 특정 security의 가격·seniority·희석조건 때문에 투자 매력이 다를 수 있다.

---

## 145. Generic State Snapshot + Schedule / Maturity Model

은행, debt, unlock, backlog, clinical milestones, 광산개발에서 반복되는 패턴은 **현재 stock 상태 + 미래 schedule**다.

```text
state_snapshot
  subject
  state_family
  dimensions
  quantities
  as_of
  known_at
  definition_version
```

```text
scheduled_state_transition
  subject
  transition_type
  expected_window
  probability/status
  dependencies
  amount/range
  source/assumption
```

이를 도메인 detail table이 확장한다.

이 공통 계약 덕분에:

- debt maturity
- token unlock
- clinical readout
- factory ramp
- mine commissioning
- contract expiry

를 같은 calendar/alert 시스템에서 탐색하면서도 의미는 domain ontology로 구분할 수 있다.

---

## 146. Domain Adapter Architecture — 범용 모델과 도메인 특수성을 동시에 유지

이번 테스트에서 범용 테이블 하나로 모든 산업을 표현하려 하면 JSONB가 거대한 의미 쓰레기통이 되고, 반대로 산업마다 전체 스키마를 새로 만들면 table explosion이 발생한다.

권장 구조:

```text
Canonical kernel
  entity
  source/assertion/numeric fact
  event/relation
  expectation
  derivation
  exposure
  scenario/outcome
  economic claim
  metric definition

Domain modules
  semiconductor.*
  finance.*
  life_science.*
  resource.*
  crypto.*

Serving projections
  common_asset_view
  sector/deep-dive packets
```

### 146.1 Domain module 규칙

도메인 테이블은 다음 조건 중 하나일 때만 만든다.

1. 범용 객체로 표현하면 중요한 제약/상태가 손실됨
2. 해당 구조가 분석 계산의 직접 입력임
3. 명확한 lifecycle/state machine이 있음
4. 두 개 이상의 source family에서 반복 사용됨

단순 UI convenience라면 serving projection으로만 둔다.

### 146.2 Plugin-like contract

각 sector/domain module은 다음 contract를 제공한다.

```text
identity extensions
metric definitions
state/event schemas
business-driver template
valuation methods
required source families
quality gates
peer rules
recommendation feature contract
UI blocks
```

이 구조를 **Domain Intelligence Adapter**라고 부른다.

---

## 147. “이 종목 어때?”를 위한 Typed Research Query Plane

초기 baseline의 “자유형 채팅 RAG 없음” 원칙은 유지할 가치가 있지만, 제품 목표상 사용자가 자연어로:

- “이 종목 어때?”
- “A랑 B 뭐가 나아?”
- “요즘 AI 전력 관련해서 볼 만한 종목?”
- “왜 오늘 갑자기 올랐어?”
- “이 종목이랑 같이 봐야 하는 종목?”

을 묻게 될 가능성이 높다.

이를 **범용 LLM 채팅**으로 구현하지 않고 typed research interface로 만든다.

### 147.1 Query intents

```text
ASSET_REVIEW
ASSET_COMPARE
RELATED_ASSETS
DISCOVER_ASSETS
THEME_REVIEW
THEME_DISCOVERY
WHY_MOVE
SCENARIO_IMPACT
SCREEN
PORTFOLIO_IMPACT
EVIDENCE_LOOKUP
```

### 147.2 Query compiler

```text
natural language
 → entity/theme/time/horizon resolution
 → typed intent
 → constraints
 → required data contracts
 → retrieval/analysis plan
 → evidence/serving packets
 → structured response
```

LLM이 할 수 있는 것은 intent/constraint 후보 해석과 자연어 표현이다. 종목 후보·숫자·action은 구조화된 engine이 생성한다.

### 147.3 Research Session

```text
research_session
  user/session scope
  query history
  resolved entities
  current intent
  selected horizon
  evidence packet ids
  analysis snapshot ids
  unanswered gaps
  response derivations
```

follow-up의 “그럼 B는?” 같은 문맥을 지원하지만, session state가 common truth에 역류하지 않는다.

### 147.4 Fast vs Deep mode

```text
FAST
  sealed/precomputed projections only
  strict latency budget

DEEP
  bounded typed traversal
  permitted fresh-source acquisition
  evidence gap planner
  explicit progress/result state
```

두 모드 모두 결과의 `informationSet/knownAt`을 명확히 한다.

---

## 148. Recommendation Candidate & Rejection Ledger

지금 설계는 최종 opportunity snapshot은 강하지만, **왜 어떤 종목은 후보에서 탈락했는가**도 보존해야 한다.

```text
recommendation_generation_run
  universe snapshot
  intent
  horizon
  benchmark/opportunity set
  generator versions
  filters
  ranking policy

recommendation_candidate
  asset/security
  generator/reason
  raw features
  rank components
  eligibility
  exclusion reasons[]
  selected boolean
  diversity bucket
  uncertainty
```

### 목적

1. “왜 이 종목을 추천했나?”뿐 아니라 “왜 더 유명한 B는 빠졌나?”를 설명
2. backtest selection bias 감사
3. 인기 종목만 반복 추천되는 coverage/popularity bias 탐지
4. 필터 하나가 전체 추천을 조용히 비우는 silent failure 탐지
5. outcome 평가에서 **선택된 종목만 평가하는 편향** 방지

### 사용자 노출

일반 UI에는 모든 rejected candidate를 보여줄 필요가 없다. 다만 비교 화면에서 의미 있는 대안은:

```text
선택 A
대안 B — valuation 부담으로 제외
대안 C — 데이터 coverage 부족
대안 D — 동일 테마지만 직접 경제노출이 약함
```

정도로 설명할 수 있다.

---

## 149. Peer Ranking의 “순위 불가” 상태

사용자가 “이 분야 몇 등?”을 원하더라도 모든 산업을 숫자 한 줄로 줄이면 안 된다.

Peer rank 결과에는:

```text
rankable
metric/composite definition
peer universe
coverage
comparability ratio
rank/percentile
uncertainty
reason_if_not_rankable
```

를 둔다.

다음은 정상 결과다.

```text
기술력 종합 3위  ← 금지: 검증 가능한 정의가 없으면 계산하지 않음

매출 2위
영업마진 5위
제품 A 출하량 1~2위 추정
임상 성공 가능성: 직접 순위 불가
```

**NOT_RANKABLE**은 결손이 아니라 정확한 답이다.

---

## 150. Definition Drift / Segment Drift Ledger

기업이 segment 이름이나 KPI 정의를 바꾸면 단순 시계열이 가짜 성장/감소를 만들 수 있다.

```text
reporting_dimension_revision
  entity
  dimension_type = SEGMENT / PRODUCT_LINE / GEO / KPI_DEFINITION
  old/new membership
  mapping state
  effective period
  source
```

```text
comparability_bridge
  before definition
  after definition
  bridge_type = exact restatement / company-provided bridge /
                model-estimated / unavailable
  formula
  uncertainty
```

장기 trend와 peer rank는 definition drift를 통과하지 않은 값을 자동 연결하지 않는다.

---

## 151. Cross-Asset Contagion & Underlying Exposure DAG

은행과 코인을 관통해보면 단순 relation graph 외에 **경제적 underlying을 공유하는 포지션 그래프**가 필요하다.

예:

```text
Sovereign bond
 → Bank securities portfolio
 → Bank capital

ETH
 → liquid staking token
 → lending collateral
 → stablecoin debt
 → LP
```

같은 underlying이 여러 wrapper를 거치면 gross exposure와 net economic exposure가 다르다.

```text
underlying_exposure_node
  underlying economic risk factor
  wrapper/instrument
  gross amount
  delta/economic sensitivity
  netting group
  collateral/haircut
  liquidation/margin condition
```

이 DAG는:

- 금융기관 contagion
- derivatives
- ETF/fund look-through
- structured product
- crypto collateral loop

에 공통 사용한다.

---

## 152. Expectation Source Availability & Licensing Fallback

Expectation Ledger는 제품 가치가 매우 크지만 실제 구현에서 **consensus/estimate 데이터 라이선스**가 가장 먼저 막힐 수 있다.

따라서 expectation type마다 source tier를 둔다.

```text
Tier A: licensed consensus / estimate history
Tier B: public company guidance / official forecast
Tier C: market-implied observable
Tier D: system model expectation
Tier E: media/analyst quoted expectation with restricted reuse
```

`consensus`가 없다고 D tier 모델을 consensus라고 부르면 안 된다.

UI도:

```text
시장 컨센서스
회사 가이던스
옵션/가격 암묵기대
시스템 추정
```

을 분리한다.

추천/실적 surprise 계산은 어떤 expectation basis를 사용했는지 항상 노출한다.

---

## 153. Research Coverage Contract per Asset/Domain

“회사 페이지가 존재한다”와 “충분히 분석됐다”를 분리한다.

```text
asset_research_coverage
  asset/entity
  domain adapter
  identity coverage
  financial/KPI coverage
  expectation coverage
  event coverage
  exposure coverage
  valuation coverage
  peer coverage
  source freshness
  recommendation eligibility
  missing critical fields[]
```

예:

```text
FULL_ANALYSIS
PARTIAL_ANALYSIS
BASIC_PROFILE_ONLY
MARKET_DATA_ONLY
UNSUPPORTED_DOMAIN
```

사용자는 모든 종목에서 같은 깊이를 기대하지 않게 되고, recommendation engine은 `BASIC_PROFILE_ONLY` 종목을 확정 추천에서 제외하거나 별도 exploration 후보로 표시할 수 있다.

---

# Part XXXII. 구현 관점 3차 위험 분석

## 154. S0 신규 위험 — 데이터는 있는데 서로 비교할 수 없음

가장 위험한 실패는 missing data가 아니라 **semantically incompatible data를 정상 데이터로 비교하는 것**이다.

release gate:

```text
peer rank input with unknown metric definition = 0
composite rank with NOT_COMPARABLE member = 0
trend crossing unbridged definition revision = 0
```

---

## 155. S0 신규 위험 — Company 분석과 Investable Claim 분석 혼동

Company thesis가 좋아도:

- 희석이 매우 크거나
- 특정 preferred/convertible 조건이 불리하거나
- token value capture가 약하거나
- ADR/underlying 구조가 다르면

투자 claim의 매력은 다르다.

모든 recommendation output은:

```text
underlying_entity_view_id
investable_claim_view_id
market_price_snapshot_id
```

를 결속한다.

---

## 156. S0 신규 위험 — 도메인별 중요한 상태를 JSONB에 숨김

임상 endpoint, bank maturity, token finality, mine reserve 같은 핵심 구조가 `metadata` JSONB에만 들어가면:

- gate를 만들기 어렵고
- query/compare가 불안정하며
- migration 없이 필드 의미가 drift한다.

핵심 계산·게이트 입력이면 typed table/column으로 승격한다.

---

## 157. S1 신규 위험 — 추천 universe coverage가 불균형

데이터가 풍부한 대형주만 항상 추천되는 문제가 생긴다.

Recommendation Candidate Ledger에서:

- source coverage
- market-cap/liquidity bucket
- country/sector coverage
- domain adapter maturity

를 별도 feature로 기록하고, **데이터가 많다는 이유가 투자점수로 직접 가산되지 않게 한다.**

coverage는 confidence/eligibility에 영향을 주되 expected return 신호와 분리한다.

---

## 158. S1 신규 위험 — Domain Adapter 버전 불일치

같은 날짜에:

- 반도체 playbook v4
- valuation adapter v2
- peer definition v7

이 섞이면 설명은 가능해도 재현성이 깨질 수 있다.

`common_asset_view`에 **analysis_contract_manifest**를 결속한다.

```text
analysis_contract_manifest
  domain_adapter_revision
  metric_definition_set
  playbook_revision
  valuation_policy_revision
  peer_policy_revision
  recommendation_feature_contract_revision
```

---

## 159. S1 신규 위험 — Deep Query가 product truth를 우회

사용자 deep research 요청에서 live fetch가 성공했다고 바로 답변하면 기존 source contract/evidence gate를 우회한다.

Deep mode도 반드시:

```text
fetch
 → source revision
 → rights/evidence gate
 → typed extraction
 → provisional research packet
```

을 거친다.

단 시간이 오래 걸리는 분석은 제품상 별도 job 상태를 가질 수 있으나, `provisional`을 `published common truth`와 혼동하지 않는다.

---

## 160. S1 신규 위험 — 과도한 domain schema explosion

도메인별 세부 객체를 추가하다가 1,000개 이상의 테이블이 더 늘어날 수 있다.

규칙:

- 공통 kernel을 먼저 확장
- 반복 가능한 structured subobject는 `type + revision` 패턴 사용
- 도메인 전용 테이블은 계산/gate가 필요한 경우에만
- serving/display용 denormalization은 materialized view/projection
- `metadata`는 보조/실험 필드, 핵심 의미 계약으로 사용 금지

---

# Part XXXIII. 3차 반영 우선순위

## 161. 새 S0 — 추천을 열기 전에 추가로 완료할 것

기존 S0에 아래를 추가한다.

1. Metric Definition & Comparability Registry
2. Capital Structure & Economic Claim Graph
3. Domain Adapter contract
4. Asset Research Coverage Contract
5. Reporting Dimension/Definition Drift bridge
6. Recommendation Candidate & Rejection Ledger
7. Query Intent Compiler의 typed contract — 사용자 자연어 질문 기능을 열 경우

특히 **1과 2가 없으면 Peer Rank와 “이 종목 어때?”가 정교해질수록 오히려 잘못된 확신을 만들 위험이 있다.**

---

## 162. Domain별 선행 구현 순서

모든 도메인을 동시에 깊게 구현하지 않는다.

### 162.1 주식 첫 vertical

```text
반도체/AI infrastructure
 → 기존 supplier/product/event 데이터와 가장 잘 연결
 → product lifecycle + commercial commitment 추가
 → expectation/business driver/valuation/recommendation까지 관통
```

### 162.2 두 번째 vertical

```text
은행
 → 범용 모델이 balance-sheet business를 처리할 수 있는지 검증
 → maturity/liquidity/capital/contagion 추가
```

### 162.3 세 번째 vertical

```text
바이오
 → 확률적 milestone + structured evidence + financing risk 검증
```

### 162.4 네 번째 vertical

```text
원자재
 → physical asset/NAV/economic interest/commodity sensitivity 검증
```

### 162.5 코인

```text
ETH형 network/token
 → finality/contract version/value capture/composability 검증
```

각 vertical은 **한 종목/자산이 전체 chain을 통과하기 전 universe 확대 금지**를 권고한다.

---

## 163. Updated Phase Mapping — 3차

### P0 Reliability

기존 유지.

추가:

- semantic output SLO
- view reachability
- research query/deep-mode audit hooks

### P1 Truth + Semantics

추가:

- metric definition/comparability
- economic claim/capital structure
- state/schedule common contract
- definition/segment drift
- asset research coverage

### P1.5 Domain Adapter Foundation

신설 논리 단계이며 API major는 바꾸지 않는다.

- adapter registry/manifest
- sector-specific state/event extension contract
- semiconductor adapter first
- bank adapter second
- life-science/resource adapters shadow schema

### P2 Economic Intelligence

추가:

- product lifecycle/commercial commitment
- financial balance-sheet/maturity engine
- asset-level economic model/economic interests
- claim-level valuation

### P2.5 Discovery / Recommendation

추가:

- recommendation candidate/rejection ledger
- opportunity-set audit
- query intent compiler
- research session
- WHY_MOVE reverse discovery integration

### P3 Product

추가:

- analysis depth/coverage badge
- NOT_RANKABLE UI
- company view vs security/token claim view
- source definition hover for nonstandard KPI
- fast/deep research surface

### P6 Crypto

추가:

- onchain observation finality
- canonical chain revision
- contract deployment/code revision
- token supply state
- protocol economic flow/value capture
- underlying/collateral exposure DAG

---

# Part XXXIV. 3차 Acceptance Scenarios

## 164. Scenario J Acceptance — 반도체

통과 조건:

- 회사→segment→product family→generation→customer/adoption 관계가 PIT 재현됨
- 수요 shock과 capacity shock가 별도 mechanism으로 계산됨
- product generation 전환 시 과거 KPI가 잘못 합쳐지지 않음
- 시장 기대 vs actual vs forward guidance가 분리됨
- 추천 대안에 competitor뿐 아니라 supplier/foundry/memory 등 다른 value-chain role도 reason과 함께 포함됨

---

## 165. Scenario K Acceptance — 은행

통과 조건:

- 금리 shock가 asset/liability repricing lag를 통해 NIM으로 연결됨
- credit shock와 rate shock를 같은 exposure로 합치지 않음
- capital/liquidity 부족이 earnings보다 우선하는 risk로 표현 가능
- bank holding company와 operating bank identity가 혼동되지 않음
- peer rank metric definitions가 비교 가능함

---

## 166. Scenario L Acceptance — 바이오

통과 조건:

- trial protocol/endpoint/result가 기사 요약과 독립된 structured evidence로 존재
- 회사 press release만으로 성공 확률 fact가 생성되지 않음
- clinical/regulatory milestone이 Catalyst Calendar와 연결됨
- rNPV assumptions와 cash runway/dilution이 동시에 common view에 들어감
- conflicting trial interpretation을 competing hypothesis로 보존

---

## 167. Scenario M Acceptance — 원자재

통과 조건:

- asset별 reserve/production/cost/ownership/royalty가 분리됨
- company NAV는 asset-level derivation을 재생 가능
- spot/forward/hedge/FX가 구분됨
- legal ownership과 economic interest가 분리됨
- mine/project stage 변경이 valuation과 catalyst에 연결됨

---

## 168. Scenario N Acceptance — ETH형 자산

통과 조건:

- network/protocol/contract/token/value-claim identity가 분리됨
- on-chain fact에 block provenance와 canonicality/finality가 존재
- contract upgrade 후 동일 주소/프로토콜 의미 drift를 추적 가능
- protocol activity 증가와 tokenholder value capture가 별도 계산됨
- recursive collateral exposure가 double-counting 없이 net/gross로 계산됨
- centralized exchange market data와 on-chain truth의 freshness/quality가 별도 표시됨

---

# Part XXXV. 3차 당시 판단 — Historical Rationale

## 169. 이번 테스트로 바뀐 핵심 결론

2차까지는 **“Investment Context World Model에 어떤 지능이 필요한가”**를 설계했다면, 3차에서는 **“그 지능이 산업별 현실을 견딜 수 있는가”**를 검증했다.

가장 큰 변경점은 세 가지다.

### 169.1 범용 ontology만으로는 부족하지만 산업별 별도 시스템도 답이 아니다

정답은:

```text
stable canonical kernel
 + versioned domain intelligence adapters
 + common serving/recommendation contracts
```

이다.

### 169.2 숫자 자체보다 숫자의 정의가 먼저다

Peer rank, theme strength, recommendation이 강력해질수록 `Metric Definition & Comparability`가 truth infrastructure에 가까운 중요도를 가진다.

### 169.3 분석 대상은 Company가 아니라 Economic Claim까지 내려가야 한다

최종 사고 사슬을 다음처럼 수정한다.

```text
World / Domain State
  ↓
Entity + Economic Asset + Economic Claim
  ↓
Metric Definition / Comparable Facts
  ↓
Event / Expected Transition
  ↓
Expectation / Surprise / Competing Hypotheses
  ↓
Exposure / Business or Domain-Specific Driver
  ↓
Financial / Economic Value Capture
  ↓
Claim-Level Valuation / Market-Implied State
  ↓
Market Reaction / Positioning / Liquidity
  ↓
Multi-Horizon Thesis / Scenario
  ↓
Outcome / Calibration
  ↓
Common Asset + Investable Claim View
  ↓
Opportunity Set / Candidate & Rejection Ledger
  ↓
Discovery / Recommendation / Research Query
  ↓
Personalized Action
```

---

## 170. 구현 시작 전 S0 Checklist — 3차 당시 기준

```text
[ ] assertion/event/numeric fact/coverage/PIT
[ ] metric definition + comparability
[ ] entity/security/token/economic claim separation
[ ] sector/domain adapter contract
[ ] sector playbook/KPI ontology
[ ] business/domain driver model
[ ] expectation/surprise
[ ] exposure/transmission
[ ] valuation/value-capture model
[ ] common/competing thesis
[ ] outcome/calibration
[ ] asset research coverage state
[ ] recommendation opportunity-set semantics
[ ] candidate + rejection ledger
[ ] definition/segment drift bridge
[ ] silent failure semantic SLO
```

위가 갖춰지기 전에는 recommendation을 **research preview/shadow** 이상으로 열지 않는 것이 안전하다.

---

## 171. 3차 이후 권장 다음 작업

이제 상상력을 더 확장하는 것보다 **실제 구현 명세로 좁히는 편이 수익이 커지는 시점**이다.

다음 단계는 하나의 vertical을 선택해 다음 문서 세트를 만드는 것이다.

```text
A. Canonical Schema Contract
B. Semiconductor Domain Adapter v1
C. One-Asset Vertical Acceptance Fixture
D. Common Asset View JSON Contract
E. Recommendation Candidate/Opportunity Contract
F. Machine Gates & Golden Fixtures
G. Migration Plan from current as-built
```

첫 vertical은 **반도체/AI infrastructure**를 권장한다. 현재 시스템에 이미 company/stock/product/supplier/event/market 데이터가 있고, 공급망·제품·정책·테마·기대·valuation·추천을 한 번에 검증할 수 있어 새 아키텍처의 가장 좋은 stress test다.

---


# Part XXXVI. 4차 Architecture Red-Team — Destructive Validation

## 172. 목적: 이제 설계를 옳다고 가정하지 않는다

앞선 세 번의 검토는 빠진 기능과 산업별 현실을 찾아 **설계를 확장**하는 성격이 강했다. 이번 검토는 반대다.

> **현재 Master Design 전체가 틀렸거나 과설계되었을 수 있다고 가정하고, 반례·데이터 누수·거짓 인과·운영 장애·추천 실패·사용자 오해를 의도적으로 주입한다.**

검토 방법은 네 축을 동시에 사용한다.

### 172.1 연역적 공격

제품 목표가 참이라면 반드시 성립해야 하는 조건에서 역으로 설계를 검사한다.

```text
목표: 사용자가 신뢰 가능한 투자 맥락을 얻는다
  ↓
필요조건:
  당시 알 수 있던 정보만 사용
  숫자가 서로 비교 가능
  설명 근거가 독립적
  추천 시점에 실제 행동 가능
  결과가 사후 정보로 오염되지 않음
  모르는 것은 모른다고 표현
  실제 투자 가능한 claim까지 귀착
  시스템 자신의 추천 때문에 시장이 왜곡될 수 있음을 통제
```

이 중 하나라도 구조적으로 보장되지 않으면 모델 성능과 무관하게 실패다.

### 172.2 귀납적 공격

실제 자본시장에서 반복적으로 발생하는 실패 패턴을 입력한다.

- 실적 발표 후 숫자는 좋은데 주가 하락
- 공시 정정과 재무 restatement
- 분할·합병·분사·권리락·증자
- 저유동성 급등과 short squeeze
- 기사 없는 급등/급락
- 회사가 갑자기 KPI 공개를 중단
- 여러 언론이 같은 원천을 복제
- 테마가 오른 뒤 과거 구성종목을 다시 정의하는 hindsight
- 여러 모델이 같은 데이터와 같은 구조를 공유하면서 모두 같은 결론
- 코인 거래소 장애·가짜 유동성·디페그·체인 reorg

반복적으로 깨지는 곳은 개별 예외가 아니라 구조 결함으로 취급한다.

### 172.3 유추 공격

다른 분야가 오래전부터 해결해 온 문제를 가져온다.

| 분야 | 가져올 원리 | 본 시스템 적용 |
|---|---|---|
| 회계 | stock-flow reconciliation | 주식수·현금·토큰공급·NAV roll-forward 검증 |
| 과학 | preregistration·multiple testing | causal/forecast 분석 protocol 고정 |
| 의료 | differential diagnosis·triage | competing hypothesis + safe-mode/abstention |
| 항공 | independent sensors·fault containment | evidence independence + blast-radius 제한 |
| 컴파일러 | type system·IR validation | Fact→Estimate→Forecast의 역류 차단 |
| 분산시스템 | snapshot consistency·invalidation | semantic snapshot + release manifest |
| 검색엔진 | ranking bias·coverage | popularity/coverage 보정 + why-not explanation |
| 제어공학 | feedback·stability | reflexivity + recommendation self-impact |
| 신용평가 | watch/outlook/migration | thesis state transition + outcome monitoring |

### 172.4 판정 라벨

이번 검토의 모든 기존 설계는 다음 중 하나로 판정한다.

```text
KEEP    그대로 유지
MODIFY  의미는 맞지만 계약을 강화
MERGE   독립 객체가 과도해 다른 family로 통합
DELETE  잘못된 추상화 또는 제품 가치보다 위험이 큼
DEFER   필요하지만 현재 제품 단계에서 canonical로 만들지 않음
```

---

## 173. Red-Team 요약 판정

| 심각도 | 발견 | 판정 |
|---|---|---|
| S0 | ex-ante 분석에 ex-post 시장반응/후속기사가 섞일 수 있음 | MODIFY |
| S0 | PIT 규칙이 많지만 모든 query가 동일 규칙을 강제받는 단일 kernel이 약함 | MODIFY |
| S0 | 독립 기사 수와 독립 **정보 원천** 수가 다를 수 있음 | MODIFY |
| S0 | Model Council의 모델들이 같은 입력·코드계보를 공유하면 가짜 합의가 됨 | MODIFY |
| S0 | 숫자가 개별적으로 맞아도 회계·stock-flow 정합성이 깨질 수 있음 | ADD/MODIFY |
| S0 | `known_at`과 실제 거래 가능한 `actionable_at`은 다름 | ADD |
| S0 | 분사·합병·권리·배당으로 economic claim continuity가 끊길 수 있음 | ADD |
| S0 | semantic definition 변경 시 이미 생성된 derived 결과를 자동 invalidate하는 계약이 약함 | MODIFY |
| S0 | 추천된 종목만 사후 평가하면 recommendation selection bias가 생김 | MODIFY |
| S0 | Theme가 과거 수익률을 보고 구성되면 미래예측처럼 보이는 hindsight가 됨 | MODIFY |
| S0 | 극단 변동·데이터 장애 때 추천을 계속 내보낼 global safety state가 없음 | ADD |
| S1 | KPI 미공개가 `missing`인지 공개정책 변화인지 구분이 약함 | ADD |
| S1 | 낮은 유동성에서 제품 추천 자체가 시장 영향을 만들 수 있음 | ADD |
| S1 | source rights가 파생 요약/숫자/차트까지 어떻게 전달되는지 세밀하지 않음 | MODIFY |
| S1 | 사람의 정정·예외 승인이 append-only provenance로 남는 표준 객체가 약함 | ADD |
| S1 | ADR/ETF/NAV/선물/현물/스테이블코인 등 cross-instrument 일관성 검사가 약함 | ADD |
| S1 | 모든 것을 하나의 종합 rank로 만들 유혹이 여전히 존재 | MODIFY |
| S1 | coordinated misinformation/data poisoning을 source quality만으로 막기 어려움 | ADD |
| S1 | 파이프라인 실패가 전체 제품을 같이 죽이는 blast-radius 정책이 충분히 명시되지 않음 | MODIFY |
| S2 | 개념별 ledger/snapshot/state 증가가 구현 복잡도를 폭발시킴 | MERGE |

---

# Part XXXVII. S0 구조 결함과 수정 계약

## 174. Ex-Ante / Ex-Post Contamination Firewall

### 문제

금융 분석에서 가장 위험한 누수 중 하나는 **사후에 알게 된 시장반응을 사전 판단의 근거로 사용하는 것**이다.

예:

```text
08:00 실적 발표
08:03 시스템 수집
09:00 장 시작
09:15 주가 -8%
10:00 기사: "가이던스 실망으로 하락"
```

09:15 이후 만들어진 retrospective report에는 시장반응을 포함할 수 있다. 그러나 `08:10에 이 종목을 어떻게 봤어야 했나?`를 평가할 때 09:15 가격이나 10:00 해설 기사는 절대 들어가면 안 된다.

현재 `known_at`만으로는 **어떤 분석 목적에서 어느 downstream outcome을 embargo해야 하는지**가 충분히 표현되지 않는다.

### 신규 canonical context

```text
analysis_information_set
  information_set_id
  analysis_mode = EX_ANTE / LIVE / EX_POST / RETROSPECTIVE
  valid_cutoff
  source_available_cutoff
  system_known_cutoff
  market_observation_cutoff
  outcome_embargo_until
  allowed_information_classes[]
  market_calendar
  timezone
  semantic_snapshot_id
  created_at
```

### 강제 규칙

- `EX_ANTE` forecast/recommendation은 `market_observation_cutoff` 이후 가격·flow·후속기사 사용 금지.
- `EX_POST` explanation은 후속 evidence를 사용할 수 있지만 **사전 forecast accuracy 평가 입력에는 재사용 금지**.
- report statement는 `analysis_information_set_id`를 반드시 가진다.
- backtest label/outcome은 evidence retrieval namespace에서 물리적으로 분리한다.
- retrospective 수정은 과거 recommendation을 덮어쓰지 않고 새 분석 run으로 생성한다.

### Machine gate

```text
forecast/recommendation input contains outcome timestamp > information_set cutoff = 0
ex-ante derivation references ex-post-only artifact = 0
```

---

## 175. Temporal Query Kernel — PIT를 개발자 규율에서 시스템 규율로

### 문제

PIT 필드가 아무리 많아도 각 SQL/worker가 `valid_at`, `known_at`, vintage, market session을 제각각 구현하면 결국 누수가 생긴다.

### 수정

모든 truth/feature/expectation 조회는 공통 **Temporal Query Kernel**을 통과한다.

```text
temporal_query_context
  valid_at
  known_at
  available_at_policy
  information_set
  market_calendar
  revision_policy = first_release / as_known_then / latest
  corporate_action_basis
  semantic_snapshot_id
```

지원 형태:

```text
PIT_SELECT(entity, fact_family, context)
PIT_JOIN(left, right, temporal_relation, context)
PIT_UNIVERSE(market, context)
PIT_PRICE(asset, price_basis, context)
PIT_EXPECTATION(target, basis, context)
```

### 금지

- product/report/backtest 코드에서 임의 `ORDER BY published_at DESC LIMIT 1`
- `now()`를 business semantic cutoff로 직접 사용
- 최신 ontology/metric definition을 과거 report에 자동 적용

Temporal Query Kernel의 query plan과 selected revision ID를 execution trace에 저장한다.

---

## 176. Evidence Independence Graph — 기사 독립성과 정보 독립성은 다르다

### 문제

Reuters 기사와 여러 매체의 재배포를 story lineage로 묶어도 다음 문제가 남는다.

```text
회사 보도자료
 → Reuters
 → Bloomberg가 Reuters 내용 인용
 → 분석가 note가 회사 보도자료와 Reuters를 함께 인용
 → 다른 기사들이 analyst note 인용
```

publisher는 다르지만 **실질적인 정보 root는 회사 발표 하나**일 수 있다.

### 신규 객체

```text
evidence_dependency
  child_evidence_id
  parent_evidence_id
  dependency_type = DERIVED_FROM / QUOTES / SYNDICATED / SAME_PRIMARY_SOURCE /
                    CALCULATED_FROM / TRANSLATED_FROM / AGGREGATES
  confidence
  derivation_id
```

```text
evidence_independence_snapshot
  claim/event
  evidence_count_raw
  primary_root_count
  effective_independent_count
  dominant_root_share
  diversity_by_source_type
  diversity_by_jurisdiction
```

### 원칙

`corroboration_count=7`보다 `independent_primary_roots=2`가 더 중요하다.

근거 신뢰도 계산은 raw source count가 아니라 dependency-adjusted effective evidence를 사용한다.

---

## 177. Model Genealogy — Model Council의 가짜 합의를 막는다

### 문제

세 모델이 같은 price feature, 같은 training window, 같은 embedding, 같은 upstream forecast를 사용하면 세 번의 독립적 의견이 아니다.

### 신규 registry

```text
model_genealogy
  model_id/version
  parent_model_ids[]
  training_dataset_ids[]
  feature_set_ids[]
  retrieval_policy_id
  upstream_estimate_ids[]
  code_family
  objective_family
```

```text
model_council_snapshot
  question
  raw_vote_count
  effective_independent_model_count
  shared_input_ratio
  shared_lineage_ratio
  disagreement
  OOD_state
```

### 원칙

- 동일 lineage 모델 5개가 같은 방향이라고 confidence를 5배 높이지 않는다.
- ensemble diversity는 모델명 개수가 아니라 **오류 구조와 input lineage의 독립성**으로 평가한다.
- uncertainty가 낮아지는 조건은 독립적인 정보·방법이 실제로 합의할 때다.

---

## 178. Economic Invariants & Stock-Flow Consistency Engine

### 유추

회계와 물리학은 개별 측정값뿐 아니라 **보존 법칙**으로 오류를 잡는다.

현재 numeric fact 하나하나가 source와 맞아도 서로 합치면 경제적으로 불가능한 상태가 생길 수 있다.

### canonical constraint family

```text
economic_invariant_definition
  invariant_id
  domain
  formula/program
  input_concepts[]
  tolerance_policy
  applicable_entity_types[]
  version
```

```text
economic_invariant_result
  invariant_id
  entity/asset
  information_set_id
  input_fact_ids[]
  expected_relation
  residual
  tolerance
  status = PASS / WARN / FAIL / NOT_TESTABLE
  derivation_id
```

### 예시

#### 기업

```text
Assets = Liabilities + Equity
Beginning Cash + CFO + CFI + CFF + FX/Other = Ending Cash
Beginning Shares + Issuance + SBC + Conversion - Buyback = Ending Shares
```

#### ETF

```text
Holdings Value + Cash - Liabilities ≈ NAV
NAV / Shares ≈ NAV per Share
```

#### 코인

```text
Beginning Supply + Mint/Emission - Burn ± Canonical Adjustments = Ending Supply
```

#### 스테이블코인

```text
Reported Circulating Claims ↔ Reserve / Attestation Basis
```

#### 은행

balance-sheet roll-forward와 regulatory capital reconciliation을 별도 invariant family로 둔다.

### 효과

이 계층은 예측 모델이 아니라 **데이터 오염·단위 오류·누락·잘못된 corporate action mapping을 조기에 잡는 truth QA**다.

---

## 179. Actionability Clock — 알게 된 시각과 행동 가능한 시각은 다르다

### 문제

`known_at=16:03`이어도:

- 거래소가 이미 닫힘
- 종목 거래정지
- 상한/하한가
- 코인 거래소 입출금 중단
- 옵션 장 마감
- 주문 최소 단위/유동성 부족

이면 해당 시점 recommendation은 현실적으로 같은 조건에서 실행할 수 없다.

### 신규 시간축

```text
actionability_state
  asset
  information_set_id
  known_at
  user_visible_at
  market_session
  first_actionable_at
  venue_state
  halt_state
  order_restrictions
  liquidity_state
  estimated_execution_delay
  price_observation_basis
```

### backtest 강제

```text
signal_time
 → publication_latency
 → first_actionable_time
 → executable_price_policy
 → estimated slippage
 → realized outcome
```

`known_at`의 바로 다음 price bar를 임의로 체결가격으로 사용하지 않는다.

---

## 180. Economic Continuity & Corporate-Action Bridge

### 문제

Company/Stock 분리만으로는 다음을 충분히 해결하지 못한다.

- spin-off
- split / reverse split
- rights offering
- merger consideration
- stock-for-stock acquisition
- cash + stock mixed consideration
- ticker reuse
- ADR ratio change
- special dividend
- liquidation distribution

과거 주가·EPS·시총·보유수익률·peer rank를 이어 붙일 때 **법적 entity continuity와 경제적 claim continuity가 다르다.**

### 신규 객체

```text
corporate_action_event
  action_type
  effective_at
  record/ex_date/pay_date
  predecessor_claims[]
  successor_claims[]
  entitlement_formula
  cash_component
  share/component ratios
  source_revision
```

```text
economic_continuity_bridge
  predecessor_economic_claim
  successor_economic_claim
  continuity_type = SAME_CLAIM_ADJUSTED / PARTIAL_SUCCESSOR / SPINOFF /
                    MERGED_INTO / TERMINATED / NEW_CLAIM
  value_allocation_method
  adjustment_factor
  valid/known time
```

### 가격 시계열 basis registry

```text
RAW_CLOSE
SPLIT_ADJUSTED
TOTAL_RETURN
CORPORATE_ACTION_RECONSTRUCTED
```

모든 backtest와 chart는 어떤 basis인지 명시한다.

---

## 181. Semantic Snapshot & Dependency Invalidation

### 문제

과거 data row는 그대로인데 다음이 바뀌면 해석이 바뀐다.

- metric definition
- peer group
- industry taxonomy
- sector playbook
- ontology predicate
- valuation method
- theme constitution
- rights/display policy

기존 derived pack을 그대로 서빙하면 **데이터는 fresh지만 의미는 stale**할 수 있다.

### semantic snapshot

```text
semantic_snapshot
  ontology_revision
  metric_definition_revision_set
  comparability_policy_revision
  domain_adapter_versions
  sector_playbook_versions
  peer_group_policy_versions
  theme_constitution_versions
  valuation_method_versions
  rights_policy_revision
  query_kernel_version
  digest
```

### dependency index

```text
derived_artifact_dependency
  artifact_id
  dependency_type
  dependency_id/version
  invalidation_policy
```

definition 변경 시 dependency graph를 따라 선택적 recompute한다.

### Machine gate

```text
servable artifact semantic_snapshot incompatible with active serving contract = 0
```

---

## 182. Recommendation Counterfactual Ledger — 선택한 종목만 평가하지 않는다

### 문제

추천된 종목의 성과만 추적하면 실패한 후보를 애초에 추천하지 않았다는 사실 때문에 성능이 좋아 보인다.

### 수정

모든 opportunity run에서 **노출·선택·탈락 전체 후보**를 고정한다.

```text
recommendation_run
  information_set_id
  universe_snapshot_id
  opportunity_set_id
  generator_registry_snapshot
  policy_version
```

```text
recommendation_candidate_evaluation
  run_id
  asset
  rank_before_policy
  final_decision = SELECTED / REJECTED / ABSTAINED / NOT_ELIGIBLE
  rejection_codes[]
  score_components
  coverage_state
  actionability_state_id
```

```text
counterfactual_outcome
  run_id
  candidate_asset
  horizon
  executable_return
  benchmark_return
  risk/cost adjusted outcome
  label_available_at
```

### 평가

- selected vs rejected regret
- opportunity cost
- calibration by score bucket
- coverage-conditioned performance
- universe turnover
- recommendation stability

`왜 A를 추천했나`와 함께 **`왜 B를 제외했으며 그 판단이 나중에 옳았나`**를 학습한다.

---

## 183. Theme Constitution & Hindsight Firewall

### 문제

테마가 오른 뒤 승자들을 모아 “이 테마는 강했다”고 하면 거의 언제나 그럴듯해진다.

다음 순환을 금지한다.

```text
미래 수익률 좋음
 → 사후 theme membership 추가
 → 그 구성종목으로 theme return 계산
 → theme model 정확했다고 주장
```

### theme constitution

```text
theme_definition_revision
  theme
  semantic thesis
  eligible entity/claim types
  required economic relation types
  prohibited weak relation-only basis
  membership_policy
  benchmark_policy
  valid_from
  known_from
```

```text
theme_membership_revision
  theme
  entity/asset
  role = CORE / ENABLER / BENEFICIARY / SUPPLIER / SUBSTITUTE / SPECULATIVE
  evidence/derivation
  valid/known time
  membership_confidence
```

### evaluation freeze

- theme strength at T는 **T에 알려진 membership만** 사용.
- newly discovered historical relation을 과거 membership에 소급하여 backtest 금지.
- `price momentum`은 theme state의 입력일 수 있지만 membership truth의 유일 근거가 될 수 없다.
- theme discovery model과 theme performance evaluator는 분리한다.

---

## 184. Global Product Safety State — 추천을 멈출 수 있어야 한다

### 유추

의료 triage와 항공 시스템처럼 데이터가 불안정한데도 정상 모드로 계속 동작하는 것이 가장 위험하다.

```text
product_safety_state
  scope = GLOBAL / MARKET / ASSET / DOMAIN
  state = NORMAL / CAUTION / INFORMATION_ONLY / HALTED
  reason_codes[]
  triggered_at
  valid_until
  evidence
```

### trigger 예

- 핵심 market data stale
- exchange outage/거래중단
- source contract 대규모 실패
- PIT integrity failure
- semantic snapshot mismatch
- model calibration 붕괴
- extreme volatility/OOD
- corporate action mapping unresolved
- security incident/data poisoning 의심

### 동작

`INFORMATION_ONLY`에서는 뉴스·사실·리스크는 보여주되 directional opportunity/recommendation을 비활성화한다.

**서비스 가용성과 추천 가용성은 같은 SLO가 아니다.**

---

# Part XXXVIII. S1 보강 — 실전에서 신뢰를 무너뜨리는 구멍

## 185. Disclosure Regime & Informative Missingness

### 문제

`KPI가 없다`와 `예전에는 공개했는데 이번부터 안 공개한다`는 다른 정보다.

```text
disclosure_expectation
  entity
  metric/fact family
  expected cadence
  expected document/section
  historical reporting pattern
```

```text
disclosure_gap_episode
  entity
  metric/fact family
  expected_at
  observed_state = NOT_REPORTED / DELAYED / FORMAT_CHANGED / DEFINITION_CHANGED /
                   SOURCE_FAILURE / NOT_APPLICABLE
  materiality
  resolution
```

### 원칙

- missingness 자체를 자동 악재로 해석하지 않는다.
- 반복 공개 KPI의 중단은 `information_event` candidate가 될 수 있다.
- parser failure와 issuer non-disclosure를 반드시 분리한다.

---

## 186. Rights Transformation Graph — 원문 권리와 파생물 권리는 다를 수 있다

### 문제

source contract에 저장/사용 권한이 있어도:

- 원문 excerpt 표시 가능 여부
- 전체 표 재배포 가능 여부
- 숫자 파생값 표시 가능 여부
- 모델 학습 가능 여부
- 캐시 기간
- 사용자별 export 가능 여부

는 서로 다를 수 있다.

```text
rights_capability
  source_contract
  action = STORE_RAW / PARSE / EMBED / TRAIN / DERIVE_METRIC /
           DISPLAY_EXCERPT / DISPLAY_FACT / REDISTRIBUTE / EXPORT
  scope
  retention
  attribution_requirement
  geography/user_class restrictions
```

```text
artifact_rights_derivation
  artifact_id
  input_rights[]
  transformation_type
  effective_rights
  policy_version
```

### gate

사용자 UI에 나가는 모든 artifact는 `effective_rights`가 display를 허용해야 한다.

---

## 187. Human Adjudication Ledger — 사람이 고쳐도 역사가 남아야 한다

완전 자동화를 목표로 해도 다음 상황은 사람 검토가 필요할 수 있다.

- 신규 ontology predicate
- entity merge/split
- disputed corporate action
- high-impact conflicting official sources
- data poisoning 의심
- 법적/권리 분쟁

사람이 DB를 직접 UPDATE하지 않는다.

```text
human_adjudication_revision
  object_type/object_id
  previous_state
  decision
  reason_code
  reviewer_role
  evidence_ids[]
  known_at
  supersedes_adjudication_id
```

수동 판단도 **새 provenance event**다.

---

## 188. Recommendation Audience Capacity & Self-Impact Gate

### 문제

사용자 수가 커지면 저유동성 종목/토큰에서 **추천 자체가 가격·거래량에 영향을 줄 수 있다.**

이는 개인 주문 자동화가 없어도 발생 가능하다.

```text
recommendation_capacity_state
  asset
  ADV/depth/free_float
  estimated audience
  expected participation range
  slippage sensitivity
  concentration/holder structure
  self_impact_risk
  max_distribution_scope
```

### 정책

- 고 self-impact 자산은 broad push recommendation 제한.
- low-float/low-liquidity 자산은 discovery와 personalized view의 노출 정책을 분리.
- recommendation performance 평가에서 **발행 후 자신의 audience impact** 가능성을 별도 flag.
- 사용자 수 증가에 따라 capacity 정책을 재보정.

---

## 189. Cross-Instrument Consistency / No-Arbitrage Observation Plane

같은 경제적 가치가 여러 claim/venue에 표현될 수 있다.

예:

- ADR ↔ local share × FX × ratio
- ETF price ↔ NAV
- future ↔ spot + carry
- perpetual ↔ spot + funding/basis
- stablecoin ↔ reference asset
- share class ↔ 동일 issuer의 다른 권리

```text
cross_instrument_relation
  instrument_a
  instrument_b
  economic_mapping
  conversion_ratio
  carry/dividend/borrow assumptions
  valid/known time
```

```text
pricing_consistency_observation
  relation_id
  theoretical/reference spread
  observed spread
  transaction-cost band
  stale/venue flags
  status = CONSISTENT / DISLOCATED / NOT_COMPARABLE / DATA_ISSUE
```

이 계층의 목적은 무위험 차익거래를 약속하는 것이 아니라:

1. price data 오류 탐지
2. priced-in state 보조
3. claim-level 상대가치 설명
4. cross-venue/peg anomaly 발견

이다.

---

## 190. Multi-Objective Ranking — 종합점수의 거짓 정밀도 줄이기

Peer/Opportunity ranking에서 모든 축을 가중합하면 가중치 선택이 숨은 투자철학이 된다.

기본 출력은 다음처럼 한다.

```text
Growth          top 15%
Quality         top 30%
Valuation       top 55%
Balance Sheet   top 20%
Momentum        top 10%
Crowding        high-risk
Coverage        sufficient
```

추가로:

- Pareto frontier
- dominated / non-dominated alternatives
- 사용자 선택 weight에 따른 sensitivity
- rank interval / tie group

를 계산할 수 있다.

종합 rank는 **공개된 policy**가 있을 때만 파생한다.

---

## 191. Semantic Derivation Type System & Cycle Gate

### 문제

그래프 자체에는 cycle이 존재해도 된다. 그러나 **증거 derivation**이 순환하면 안 된다.

금지 예:

```text
Recommendation A
 → Narrative "A is strong"
 → Theme strength
 → Recommendation A score 상승
```

또는:

```text
Forecast
 → generated report statement
 → extraction pipeline이 그 report를 source처럼 읽음
 → same forecast의 evidence로 재유입
```

### semantic layers

```text
L0 SOURCE
L1 ASSERTION / OBSERVATION
L2 NORMALIZED FACT / EVENT / RELATION
L3 EXPOSURE / MECHANISM
L4 STATISTICAL / CAUSAL ESTIMATE
L5 FORECAST / SCENARIO / THESIS
L6 COMMON VIEW / RECOMMENDATION
L7 PERSONALIZED DECISION
L8 OUTCOME / EVALUATION
```

### 강제 규칙

- 일반 derivation은 낮은 층 → 높은 층 방향.
- `OUTCOME`은 calibration에는 들어가지만 과거 `FORECAST` revision을 수정하지 않는다.
- `RECOMMENDATION`은 truth/exposure의 source가 될 수 없다.
- 사용자 private L7은 common L0~L6으로 역류 금지.
- 자체 생성 report/content를 외부 source처럼 재수집하면 `internal_derived` lineage를 강제하고 primary evidence count에서 제외.
- derivation DAG cycle = 0.

---

## 192. Analysis Protocol Registry — 연구자 자유도와 p-hacking 방지

### 문제

Event Study/DiD/DML/LP 방법을 많이 지원할수록 사건마다 가장 예쁘게 나오는 설정을 고르는 문제가 생긴다.

```text
analysis_protocol
  question_family
  estimand
  eligibility criteria
  treatment/shock definition
  control construction
  estimation window
  event window/horizon
  benchmark/factors
  exclusion rules
  diagnostics
  multiple-testing policy
  allowed sensitivity variants
  preregistered_at
  version
```

실제 분석 run은 protocol을 참조한다.

설정을 여러 개 탐색했다면:

- 모든 variant 기록
- primary specification 사전 정의
- robustness/multiverse 결과 함께 저장
- best p-value만 발행 금지

---

## 193. Information Attack / Data-Poisoning Episode

### 문제

금융정보 시스템은 일반 RAG보다 **경제적 동기를 가진 거짓정보 공격** 가능성이 크다.

예:

- 가짜 보도자료
- 해킹된 공식 계정
- coordinated rumor
- synthetic article farm
- fake volume / wash-like activity
- on-chain sybil activity
- manipulated oracle

```text
information_integrity_episode
  affected_claim/event/asset
  attack_candidate_type
  source_cluster
  propagation graph
  first_seen
  official confirmation state
  market impact
  resolution
```

### 원칙

- source tier가 높아도 계정 compromise 가능성을 0으로 가정하지 않는다.
- 고영향 단일 출처 사건은 provisional → independent confirmation ladder.
- 동일 문구 폭증은 evidence diversity가 아니라 coordination signal일 수 있다.
- information attack detector 자체는 candidate이며 명예훼손/범죄 fact를 자동 생성하지 않는다.

---

## 194. Fault-Containment & Graceful-Degradation Matrix

### 문제

한 source/domain/feature 실패가 전체 report/recommendation을 중단시키는 것이 항상 안전한 것은 아니다. 반대로 fail-open도 위험하다.

각 dependency마다 실패 정책을 선언한다.

```text
dependency_failure_policy
  component
  criticality = HARD / SOFT / OPTIONAL
  affected_products[]
  fallback_mode
  max_staleness
  safety_state_on_failure
  retry/backfill policy
```

예:

```text
price feed unavailable        → recommendation INFORMATION_ONLY, filing/news는 계속
options feed unavailable      → priced-in advanced block unavailable, asset page 유지
entity identity conflict      → 해당 asset common view fail-closed
one theme model failure       → theme forecast 숨김, factual theme membership 유지
portfolio snapshot stale      → personalized action fail-closed, common view 유지
```

**제품 전체 availability보다 의미 단위의 정확한 degradation이 중요하다.**

---

# Part XXXIX. 파괴용 Acceptance Scenarios

## 195. Scenario O — 장마감 후 실적, 사후 기사 누수

```text
16:05 company filing
16:06 system known
16:10 common asset ex-ante view 생성
18:00 after-hours/대체시장 반응
19:00 analyst/news interpretation
```

통과 조건:

- 16:10 view에 18:00/19:00 artifact가 0개.
- 다음날 retrospective explanation은 18:00/19:00을 사용할 수 있음.
- 두 결과가 같은 `event_id`를 공유하더라도 다른 `information_set_id`를 가짐.
- backtest 체결가격은 실제 첫 actionable venue/session 정책을 사용.

---

## 196. Scenario P — Spin-Off + Special Dividend + Ticker Change

상황:

```text
Parent A
 → division B spin-off
 → A holder receives B shares
 → A special dividend
 → A ticker changes
```

통과 조건:

- Company identity와 Economic Claim continuity가 분리됨.
- 과거 차트가 단순 ticker join으로 이어지지 않음.
- total-return 계산에 B 배분과 special dividend가 반영됨.
- peer rank history가 당시 economic claim 기준으로 재현됨.
- recommendation outcome이 corporate action을 손실/수익으로 오인하지 않음.

---

## 197. Scenario Q — 반복 공개 KPI가 갑자기 사라짐

```text
지난 12분기: paid users 공개
이번 분기: 해당 KPI 없음
```

통과 조건:

- parser failure인지 issuer omission인지 구분.
- `0`으로 채우지 않음.
- definition change / reporting policy change 후보 생성.
- thesis에 중요하면 evidence-gap research가 활성화.
- 공개 중단 자체를 자동 악재 fact로 승격하지 않음.

---

## 198. Scenario R — Meme / Short Squeeze, 펀더멘털 설명 불가

```text
price +80%
volume 12×
short/borrow stress
fundamental event 없음
social attention 폭증
```

통과 조건:

- Reverse Discovery가 `UNEXPLAINED_FUNDAMENTALLY`를 허용.
- microstructure/positioning explanation과 business thesis를 분리.
- 상승을 이유로 company fundamental score가 자동 개선되지 않음.
- opportunity engine이 liquidity/crowding/self-impact risk를 반영.
- 이후 가격 급락이 발생해도 이전에 없던 “원인”을 과거에 소급 삽입하지 않음.

---

## 199. Scenario S — 사후에 만들어진 테마

1년 후 과거 승자 10개를 골라 `AI Power Theme`를 만든다고 가정한다.

통과 조건:

- theme `known_from` 이전 기간에는 해당 membership으로 성과 계산 불가.
- historical backfill은 설명/연구용과 ex-ante backtest용을 구분.
- membership 근거가 단순 과거 price winner이면 CORE accepted 금지.
- theme strength evaluator와 membership constructor의 price feature 공유량을 기록.

---

## 200. Scenario T — 가짜 뉴스가 여러 매체에 복제

```text
fake primary post
 → 20 article replicas
 → social repost
 → one analyst mentions rumor
```

통과 조건:

- raw evidence count 20+이어도 effective primary roots ≈ 1.
- 공식 확인 전 high-impact event는 provisional.
- `independent_source_count`가 article count와 같지 않음.
- report는 rumor/provisional을 fact 문체로 바꾸지 않음.
- 정정 후 supersession과 당시 시장반응은 모두 보존.

---

## 201. Scenario U — 저유동성 소형주가 모델 1위

```text
Opportunity score: 매우 높음
ADV: 작음
free float: 낮음
spread: 큼
coverage: 최소 통과
```

통과 조건:

- Common Asset View는 존재 가능.
- broad discovery push는 capacity policy로 제한 가능.
- rank 하나로 liquidity risk를 숨기지 않음.
- recommendation outcome은 realistic slippage/actionability로 평가.
- 사용자 규모 증가 시 distribution policy가 달라질 수 있음.

---

## 202. Scenario V — Model Council 5개가 모두 같은 결론

실제로는 5개 모델 모두 동일 upstream factor forecast와 같은 retrieval pack을 사용한다.

통과 조건:

- raw model count 5, effective independent count는 5보다 낮음.
- shared input/genealogy가 UI uncertainty에 반영.
- 단순 majority vote로 confidence가 과대상승하지 않음.

---

## 203. Scenario W — Stablecoin Depeg + 거래소 장애 + 체인 상태 불확실

통과 조건:

- on-chain finalized state, exchange quote, oracle price를 하나의 `price truth`로 합치지 않음.
- venue outage를 freshness/quality에 반영.
- peg consistency observation과 reserve evidence를 분리.
- 체인 reorg 가능 구간은 provisional canonicality 유지.
- recommendation safety state가 필요 시 INFORMATION_ONLY로 하향.

---

## 204. Scenario X — 경제적으로 같은 claim의 가격이 다름

ADR/local share 또는 ETF/NAV가 큰 폭으로 벌어진다고 가정한다.

통과 조건:

- FX·ratio·dividend·세금·거래시간·유동성을 정규화하기 전 arbitrage로 부르지 않음.
- stale market/closed session 여부를 먼저 검사.
- 설명 가능한 dislocation과 data error를 분리.
- 같은 issuer라는 이유만으로 동일 expected-return forecast를 복사하지 않음.

---

# Part XL. 기존 설계에 대한 KEEP / MODIFY / MERGE / DELETE / DEFER 판정

## 205. KEEP — 현재 설계의 핵심 자산

다음은 공격 후에도 유지한다.

1. append-only source/relation/revision 원장
2. evidence gate와 candidate/accepted 분리
3. Company / Security / Token / Economic Claim 분리
4. Metric Definition & Comparability
5. Event / Expectation / Surprise 분리
6. Exposure / Transmission / Business Driver
7. sector/domain adapter
8. Valuation / Reverse-Implied Expectations
9. Competing Hypothesis / Multi-Horizon Thesis
10. Outcome / Calibration
11. Theme lifecycle와 Narrative 분리
12. Reverse Discovery / UNEXPLAINED
13. Opportunity Set + Candidate/Rejection
14. Common Asset View와 Personalized Action 분리
15. coverage/abstention
16. sealed release / provenance / model registry

---

## 206. MODIFY — 의미는 맞지만 강제 계약을 높인다

| 기존 | 수정 |
|---|---|
| PIT 필드 | Temporal Query Kernel로 강제 |
| evidence diversity | Evidence Dependency Graph 기반 effective independence |
| Model Council | Model Genealogy로 독립성 보정 |
| numeric fact | Economic Invariant QA 추가 |
| known_at | actionability clock 추가 |
| theme lifecycle | constitution + ex-ante membership freeze |
| recommendation outcome | selected+rejected 전체 counterfactual outcome |
| source rights | derived artifact까지 rights transformation |
| serving freshness | semantic snapshot compatibility 포함 |
| system availability | product safety state와 분리 |
| microstructure | audience capacity/self-impact까지 확장 |
| derivation DAG | semantic layer type checker + cycle gate |
| causal method registry | preregistered analysis protocol + multiverse 기록 |

---

## 207. MERGE — Architecture Inflation 억제

### 문제

Master Design에 새로운 개념이 계속 생기면서 이름만 다른 `ledger/snapshot/state/registry`가 늘었다.

### canonical object family 12종으로 논리 압축

```text
F1 Source & Evidence
F2 Identity & Economic Claim
F3 Metric & Observation
F4 Event & World State
F5 Relation & Exposure
F6 Expectation & Hypothesis
F7 Analysis / Estimate / Scenario
F8 Theme / Narrative / Regime
F9 Outcome / Evaluation / Calibration
F10 Opportunity / Recommendation / Decision
F11 Definition / Policy / Provenance
F12 Operations / Release / Safety
```

새 개념은 먼저 이 family 중 어디에 속하는지 결정한다.

### 명명 규칙

- `Ledger`: append-only canonical historical record
- `Revision`: 동일 logical object의 시간/지식 revision
- `Snapshot`: 특정 information set으로 계산한 immutable view
- `Estimate`: 방법·가정에 결속된 분석값
- `Projection`: serving/query 최적화 파생물
- `Registry`: versioned definition/policy/method catalog
- `Episode`: 시간적으로 묶인 사건/이상 상태
- `Packet/View`: 사용자 서빙용 구조화 묶음

**이 정의에 맞지 않는 새 `*_ledger`, `*_snapshot` 이름은 생성하지 않는다.**

---

## 208. DELETE / 금지 강화

다음 추상화/행동은 canonical 설계에서 제거 또는 명시적으로 금지한다.

1. 모든 자산을 하나의 opaque opportunity score로 순위화
2. 기사 수/graph degree를 evidence strength로 직접 사용
3. model count를 independent model count로 간주
4. latest semantic definition으로 과거 분석 재해석
5. known_at 직후 bar를 자동 체결가격으로 간주
6. theme membership을 미래 수익률을 보고 소급 구성해 검증에 사용
7. 자체 생성 report를 외부 독립근거처럼 재수집
8. all-path score 합산으로 impact magnitude 계산
9. missing KPI를 0 또는 neutral로 자동 대체
10. source display 권리를 derived content에도 자동 상속
11. low-liquidity recommendation을 사용자 규모와 무관하게 broad push
12. statistical significance가 가장 좋은 분석 specification만 선택
13. fail-open 추천 — 핵심 integrity gate 실패 시 이전 recommendation을 최신처럼 유지

---

## 209. DEFER — 지금 canonical 구현에서 밀어낼 것

가치가 없다는 뜻이 아니라 **기반 의미체계가 안정된 뒤 shadow에서 검증**한다.

- universal real-time full-depth order book for all assets
- 모든 산업의 custom valuation engine 동시 구현
- HGT/TGN/NBFNet 기반 recommendation 직접 사용
- causal discovery의 product-facing causal label
- remote sensing을 accepted facility state로 자동 승격
- contextual bandit/RL로 투자 action 선택
- 사용자 행동을 이용한 online exploration
- 복잡 파생/옵션/구조화상품의 full payoff engine
- 초대규모 graph DB 이전

---

# Part XLI. Red-Team 이후 새 Canonical Contracts

## 210. Semantic Type System

모든 artifact는 다음 `truth_class` 중 하나를 가진다.

```text
SOURCE
ASSERTION
OBSERVATION
NORMALIZED_FACT
WORLD_STATE
RELATION
EXPOSURE
MECHANISM_HYPOTHESIS
STATISTICAL_ESTIMATE
CAUSAL_ESTIMATE
EXPECTATION
FORECAST
SCENARIO
THESIS
MARKET_REACTION
COMMON_VIEW
RECOMMENDATION
PERSONAL_DECISION
OUTCOME
EVALUATION
```

### 최소 dependency rule

```text
SOURCE → ASSERTION/OBSERVATION
ASSERTION/OBSERVATION → FACT/EVENT/RELATION
FACT/EVENT/RELATION → EXPOSURE/MECHANISM
FACT + EXPOSURE + METHOD → ESTIMATE
ESTIMATE + EXPECTATION + SCENARIO → FORECAST/THESIS
THESIS + MARKET STATE → COMMON_VIEW
COMMON_VIEW + OPPORTUNITY SET → RECOMMENDATION
COMMON_VIEW + PRIVATE PORTFOLIO → PERSONAL_DECISION
REALIZED DATA → OUTCOME → EVALUATION/CALIBRATION
```

`OUTCOME/EVALUATION`이 과거 forecast truth를 수정하지 않는다.

---

## 211. Investment Analysis Intermediate Representation — 구현자용 공통 IR

도메인 adapter와 UI가 직접 서로 의존하지 않도록 중간 표현을 둔다.

```text
InvestmentContextIR
  information_set
  semantic_snapshot
  investable_claim
  coverage

  facts[]
  events[]
  expectations[]
  surprises[]
  hypotheses[]
  exposures[]
  domain_drivers[]
  valuation_views[]
  market_state[]
  scenarios[]
  thesis_surface[]
  counter_evidence[]
  unknowns[]
  actionability
  rights
  derivation_root
```

### 목적

- semiconductor adapter가 UI payload를 직접 만들지 않음
- crypto adapter와 equity adapter가 같은 report/common-view compiler를 공유
- beginner/research UI는 동일 IR을 다른 깊이로 렌더링
- recommendation은 raw DB 테이블이 아니라 검증된 IR/Common View를 입력으로 사용

IR은 canonical truth가 아니라 **sealed derived artifact**다.

---

## 212. Common Asset View V2 내부 계약 강화

```text
common_asset_view
  asset/economic_claim
  information_set_id
  semantic_snapshot_id
  domain_adapter_version
  research_coverage_state
  product_safety_state
  actionability_state

  what_it_is
  how_it_makes_money_or_captures_value
  peer_position
  recent_changes
  expectations_and_surprises
  thesis_surface
  valuation_and_implied_assumptions
  catalysts
  risks_and_counter_thesis
  priced_in_and_market_state
  related_assets
  theme_roles
  unknowns
  official_resources

  cannot_conclude[]
  derivation_root
  valid_until
```

`cannot_conclude`를 first-class field로 둔다. **무엇을 모르는지**가 분석의 일부다.

---

## 213. Recommendation Safety Contract

추천 출력 조건:

```text
truth integrity pass
AND PIT/information-set pass
AND semantic snapshot compatible
AND coverage >= policy minimum
AND valuation/expected-return basis available OR explicit non-valuation strategy
AND uncertainty/calibration acceptable
AND actionability acceptable
AND liquidity/capacity acceptable
AND product safety state allows recommendation
AND rights/policy allows display
```

하나라도 실패하면:

```text
FULL_RECOMMENDATION
 → RESEARCH_CANDIDATE
 → INFORMATION_ONLY
 → UNAVAILABLE
```

중 하나로 downgrade한다.

---

## 214. Recommendation 평가의 정본 지표

정확도 하나를 쓰지 않는다.

### 데이터/분석

- factual precision
- PIT leakage
- comparability failure
- invariant violation
- derivation replay
- semantic snapshot mismatch

### 추천

- selected vs rejected regret
- executable excess return
- downside/tail outcome
- turnover/cost
- calibration/risk-coverage
- abstention quality
- stability
- capacity-adjusted performance
- theme/coverage/popularity stratified performance

### 제품

- 사용자가 원문까지 역추적 가능한 비율
- 30초 summary fidelity
- duplicate information reduction
- important unknown surfacing
- explanation usefulness
- recommendation reason comprehension

---

# Part XLII. 새 파괴 테스트용 Golden Fixtures

## 215. Golden Fixture Family

최소 다음 fixture를 repository에서 고정한다.

```text
GF-01 after-hours earnings / ex-ante firewall
GF-02 filing correction / restatement
GF-03 spin-off + dividend + ticker transition
GF-04 KPI disclosure omission
GF-05 low-float short squeeze
GF-06 theme hindsight construction
GF-07 syndicated misinformation
GF-08 correlated model council
GF-09 stablecoin depeg + exchange outage + reorg
GF-10 ADR/local or ETF/NAV dislocation
GF-11 source-rights restriction
GF-12 portfolio stale snapshot
GF-13 ontology/metric-definition change invalidation
GF-14 candidate/rejected recommendation counterfactual outcome
GF-15 pipeline partial failure / product graceful degradation
```

각 fixture는:

```text
raw input
expected accepted truth
expected rejected/candidate state
information set
expected common view fields
expected unavailable fields
expected recommendation safety level
expected machine-gate results
```

을 포함한다.

---

## 216. Property-Based / Metamorphic Tests

단일 예제뿐 아니라 변형해도 지켜져야 하는 성질을 테스트한다.

### Temporal invariance

미래 artifact를 추가해도 과거 `information_set_id` 결과 digest가 바뀌면 실패.

### Identity rename invariance

회사/티커 이름만 바뀌고 경제 상태가 같으면 구조화 분석 방향이 불필요하게 변하면 실패.

### Narrative paraphrase invariance

같은 evidence를 긍정/부정 문체로 바꿔도 normalized fact와 numeric result는 동일.

### Evidence duplication invariance

같은 primary root를 20번 복제해도 evidence strength가 비례 증가하면 실패.

### Unit conversion invariance

KRW million ↔ KRW billion 변환 후 경제 결과가 동일하지 않으면 실패.

### Corporate-action invariance

split 전후 economic value가 동일한 상황에서 단순 가격하락을 손실/악재로 인식하면 실패.

### Portfolio isolation

사용자 A의 portfolio를 변경해도 사용자 B와 common asset view digest가 바뀌면 실패.

---

# Part XLIII. Red-Team 연구 Anchor와 해석

## 217. 최근 연구에서 가져온 경고

이번 Red-Team은 특정 논문 하나를 설계 정답으로 사용하지 않는다. 다만 다음 연구는 현재 architecture gate가 왜 필요한지를 지지하는 **경고용 anchor**로 사용한다.

- **Fin-RATE (arXiv:2602.07294)**: 단일 문서보다 longitudinal/cross-entity 금융 분석에서 time/entity mismatch와 comparison hallucination이 크게 어려워짐. 따라서 Metric Comparability, Temporal Query Kernel, Entity/Claim identity를 별도 gate로 둔다.
- **FinTradeBench (arXiv:2603.19225)**: textual fundamentals retrieval만 좋아져도 trading-signal/time-series reasoning 문제가 자동 해결되지 않음. 따라서 LLM retrieval과 quantitative market-state engine을 분리한다.
- **Towards Better Evolution Modeling for Temporal Knowledge Graphs (arXiv:2602.08353)**: temporal benchmark에서도 단순 co-occurrence shortcut이 강하게 작동할 수 있음을 보여준다. Graph ML은 anti-shortcut baseline을 반드시 통과해야 한다.
- **FinAbstain (arXiv:2607.24875)**: 금융 의사결정에서 point answer보다 calibration·risk-coverage·abstention을 함께 평가하는 방향을 참고한다. 본 설계의 `INSUFFICIENT_DATA`와 Product Safety State를 강화하는 근거다.

이 연구들은 제품 성능 보증이 아니라 **검증 항목을 설계하는 참고자료**다.

---

# Part XLIV. 4차 Red-Team 이후 최종 구조 축약

## 218. 과설계 방지를 위한 최종 12 Family

앞으로 새 기능을 추가할 때 먼저 아래 12 family 안에서 해결 가능한지 검토한다.

```text
1. Source & Evidence
2. Identity & Economic Claim
3. Metric & Observation
4. Event & World State
5. Relation & Exposure
6. Expectation & Hypothesis
7. Analysis / Estimate / Scenario
8. Theme / Narrative / Regime
9. Outcome / Evaluation / Calibration
10. Opportunity / Recommendation / Decision
11. Definition / Policy / Provenance
12. Operations / Release / Safety
```

13번째 canonical family를 만들려면 architecture RFC가 필요하다.

---

## 219. 최종 Canonical 사고 사슬 — 4차 기준

```text
RAW WORLD / MARKET OBSERVATION
        ↓
SOURCE REVISION + RIGHTS
        ↓
ASSERTION / OBSERVATION
        ↓
COMPARABLE FACT / EVENT / WORLD STATE
        ↓
EXPECTATION + COMPETING HYPOTHESIS
        ↓
SURPRISE / INFORMATION GAIN
        ↓
EXPOSURE + DOMAIN DRIVER + TRANSMISSION
        ↓
FINANCIAL / ECONOMIC VALUE-CAPTURE BRIDGE
        ↓
VALUATION + MARKET-IMPLIED STATE
        ↓
MARKET REACTION / POSITIONING / MICROSTRUCTURE
        ↓
SCENARIO + MULTI-HORIZON THESIS
        ↓
COMMON ASSET + INVESTABLE CLAIM VIEW
        ↓
OPPORTUNITY SET
        ↓
CANDIDATE / REJECTION / ABSTENTION
        ↓
DISCOVERY / CURATION / RESEARCH QUERY
        ↓
PERSONALIZED DECISION SUPPORT

AFTER REALIZATION:
OUTCOME → EVALUATION → CALIBRATION

CROSS-CUTTING HARD CONSTRAINTS:
Information-Set Firewall
Temporal Query Kernel
Evidence / Model Independence
Economic Invariants
Semantic Type System
Semantic Snapshot / Invalidation
Actionability Clock
Rights / Jurisdiction Policy
Product Safety State
Release Consistency / Fault Containment
```

---

## 220. 4차 기준 구현 시작 전 S0 Checklist

```text
[ ] canonical 12-family naming contract
[ ] semantic truth_class/type-system
[ ] information_set context + ex-ante/ex-post firewall
[ ] Temporal Query Kernel
[ ] evidence dependency/effective independence
[ ] model genealogy/effective ensemble independence
[ ] assertion/event/numeric fact/coverage
[ ] Metric Definition + Comparability
[ ] Economic Invariant QA
[ ] Entity/Security/Token/Economic Claim separation
[ ] Corporate Action + Economic Continuity Bridge
[ ] semantic snapshot + dependency invalidation
[ ] sector/domain adapter contract
[ ] sector playbook/KPI ontology
[ ] business/domain driver model
[ ] expectation/surprise
[ ] exposure/transmission
[ ] valuation/value-capture model
[ ] competing thesis + analysis protocol
[ ] outcome/calibration
[ ] Theme Constitution + ex-ante membership freeze
[ ] actionability clock / executable-price policy
[ ] research coverage state
[ ] opportunity-set semantics
[ ] candidate + rejection + counterfactual outcome
[ ] recommendation safety contract
[ ] product safety state / graceful degradation
[ ] rights transformation
[ ] semantic silent-failure SLO
```

위 S0가 완성되기 전에는 directional recommendation을 **research preview / shadow** 이상으로 승격하지 않는다.

---

## 221. 4차 Red-Team 최종 판단

이번 파괴 테스트에서 기존 설계를 완전히 폐기해야 할 결함은 발견되지 않았다. 대신 더 위험한 문제가 확인되었다.

> **설계의 개별 아이디어는 대체로 타당하지만, 서로 결합될 때 시간·의미·독립성·실행가능성 경계가 약하면 매우 그럴듯한 잘못된 투자 설명을 만들 수 있다.**

따라서 이제 핵심 경쟁력은 객체를 더 많이 추가하는 것이 아니다.

1. 당시의 정보 집합을 정확히 봉인하고,
2. 서로 독립적이지 않은 evidence/model을 독립적인 것처럼 세지 않고,
3. 숫자 사이 경제적 보존 법칙을 검증하고,
4. 회사가 아니라 실제 투자 claim과 corporate-action continuity까지 추적하고,
5. 추천 시점의 실제 actionability와 capacity를 반영하고,
6. 추천하지 않은 대안까지 사후 평가하며,
7. 의미 정의가 바뀌면 파생 결과를 정확히 무효화하고,
8. 불확실하거나 시스템 상태가 나쁘면 과감히 recommendation을 멈추는 것

이 되어야 한다.

즉 V2의 최종 정체성은 다음으로 압축한다.

> **Evidence-Grounded Investment Context World Model + Decision-Grade Information-Set & Safety Kernel**

World Model이 시장을 넓게 이해하게 하고, **Information-Set & Safety Kernel이 그 이해가 투자 판단으로 넘어갈 때 생기는 시간 누수·거짓 확신·실행 불가능성·자기영향을 통제한다.**

---

## 222. 이제 다음 작업 — 구현 명세로 좁힌다

이제 추가 상상력만으로 canonical object를 늘리는 단계는 중단한다.

다음 작업은 **Semiconductor/AI Infrastructure vertical 하나**를 실제 구현 명세 수준으로 내려가며, 위 Red-Team invariant를 모두 통과시키는 것이다.

```text
A. Canonical Schema Contract
   - 12 family mapping
   - truth_class
   - Temporal Query Kernel
   - semantic snapshot

B. Semiconductor Domain Adapter v1
   - product generation
   - design win / qualification
   - capacity / backlog
   - customer/segment exposure
   - comparable KPI

C. Golden Asset Fixture
   - source → facts → expectation → driver → valuation → common view

D. Recommendation Fixture
   - opportunity set
   - selected/rejected/abstained
   - actionability/capacity
   - counterfactual outcomes

E. Machine Gates
   - PIT leakage
   - evidence independence
   - invariants
   - semantic cycle
   - theme hindsight
   - rights
   - safety state

F. Migration Mapping
   - current as-built tables → canonical family
   - keep/merge/deprecate
   - shadow-write/read
   - backfill and parity
```

**이 vertical이 통과한 뒤에만 다른 산업 adapter로 복제한다.**



# Part XLV. 현재 As-Built와 4차 설계의 충돌 테스트

## 223. 목적

Red-Team 설계가 논리적으로 좋아도 현재 구현 위에 얹을 수 없다면 실패다. 따라서 2026-08-07 as-built 구조와 새 계약을 직접 충돌시킨다.

### 현재 구현에서 유지 가능한 기반

```text
현재 source_revision/raw provenance
현재 core.entity / identifier
현재 append-only relation identity/revision/evidence
현재 sealed graph snapshot/digest
현재 content pack/derivation 일부
현재 PIT macro vintage
현재 model/config provenance 일부
현재 read API / BFF 경계
```

이들은 갈아엎지 않는다.

### 현재 구현과 새 계약이 충돌하는 곳

| 현재 상태 | 4차 요구 | 판정 |
|---|---|---|
| 관계 원장이 강함 | Fact/Estimate/Forecast semantic type system | overlay 필요 |
| PIT가 relation/macro별로 개별 구현 | 전 도메인 Temporal Query Kernel | 공통 query contract 필요 |
| article/source evidence는 존재 | dependency-adjusted independent evidence | lineage 확장 필요 |
| 모델 config provenance 일부 | model genealogy/effective independence | registry 확장 필요 |
| numeric facts가 흩어짐 | invariant QA + comparability | P1/P1.5에서 우선 구축 |
| `core.listing` 등 일부 PIT 축 부족 경험 | information-set query | base truth time schema 보강 선행 |
| pack kind가 별도 시점으로 발행 가능 | release/semantic consistency | release manifest 필요 |
| systemd+wrapper 중심 | safety state / semantic SLO | control overlay 우선 |
| outbox writer가 source revision 중심 | semantic invalidation/recompute events | producer 확대 필요 |
| 약한 association 관계가 path에서 큼 | decision-grade economic exposure | 추천 입력에서 분리 |
| current graph projection budget 존재 | 새 typed IR | 기존 projection을 버리지 않고 IR compiler 상위 배치 |

---

## 224. 가장 위험한 구현 오해 8개

### 224.1 `12 Family = 12개 새 schema`가 아니다

12 Family는 **의미 분류 체계**다. 현재 물리 schema를 다시 12개로 재편하는 migration을 먼저 하지 않는다.

```text
Logical Family
  → existing table reuse
  → additive columns / typed child
  → new canonical table only if invariant requires
  → derived projection
```

### 224.2 기존 relation ledger를 새 world model로 복제하지 않는다

`relation_v3`, `world_relation_new` 같은 병렬 truth store를 만들지 않는다.

기존 append-only ledger가 구조 관계의 정본이고, 새 event/exposure/estimate는 **다른 truth class를 추가**하는 것이다.

### 224.3 모든 기존 edge를 새 추천 후보로 쓰지 않는다

현재 association-heavy graph는 exploration에는 사용할 수 있지만 recommendation eligibility에는 별도 predicate/economic-materiality policy가 필요하다.

```text
Graph discovery candidate
 ≠ Economic exposure
 ≠ Recommendation evidence
```

### 224.4 Temporal Query Kernel을 ORM helper 한 파일로 축소하면 안 된다

커널은:

- DB view/function 또는 검증된 query builder
- market calendar
- information set
- semantic snapshot
- query trace

를 함께 보장해야 한다.

### 224.5 Economic Invariant는 analytics score가 아니다

invariant failure를 `quality_score -= 0.1`로 흡수하지 않는다.

핵심 accounting/claim-supply invariant FAIL은 해당 artifact를 quarantine 또는 safety downgrade한다.

### 224.6 Recommendation Engine을 먼저 만들어 기존 빈칸을 LLM이 메우게 하지 않는다

최소 한 vertical에서:

```text
Comparable Fact
+ Expectation
+ Economic Exposure
+ Business Driver
+ Valuation Basis
+ Outcome Label Contract
```

이 실제 데이터로 채워지기 전에는 recommendation은 fixture/shadow만 허용한다.

### 224.7 모든 semantic change에 전체 backfill을 돌리지 않는다

`derived_artifact_dependency`로 영향 범위를 계산한다.

예:

```text
은행 NIM definition change
 → banking comparable metrics
 → relevant peer ranks
 → banking common views
 → banking opportunity runs
```

반도체/코인 전체를 다시 만들 필요가 없다.

### 224.8 Product Safety State는 배치 성공여부가 아니다

pipeline completed여도:

- price stale
- coverage collapse
- semantic mismatch
- calibration fail

이면 recommendation은 내려가야 한다.

운영 success와 decision safety를 별도로 계산한다.

---

## 225. As-Built 위 최소 Overlay 순서

전체 재작성 없이 다음 순서로 얹는다.

### Overlay A — Semantic Kernel

```text
truth_class registry
semantic_snapshot
analysis_information_set
derived_artifact_dependency
```

기존 row를 당장 이동하지 않고 mapping view를 만든다.

### Overlay B — Temporal Kernel

```text
PIT_SELECT / PIT_JOIN contracts
market calendar/session
first-release/latest policy
query trace
```

새 코드부터 raw temporal SQL 금지 → 이후 기존 reader를 순차 이전.

### Overlay C — Evidence/Model Independence

```text
evidence_dependency
independence snapshot
model_genealogy
```

기존 evidence ledger를 입력으로 사용한다.

### Overlay D — Comparable Economic Facts

첫 semiconductor vertical에서만:

```text
metric definition
comparability assessment
business driver
expectation
exposure
```

전 산업 동시 구현 금지.

### Overlay E — Truth QA

```text
economic invariant definitions/results
corporate-action continuity
semantic machine gates
```

### Overlay F — Serving Safety

```text
release manifest
product safety state
actionability state
component-level availability
```

### Overlay G — Recommendation Shadow

```text
opportunity run
candidate/rejection
counterfactual outcome
no user-facing directional output
```

이 단계에서 golden fixture와 walk-forward를 먼저 축적한다.

---

## 226. Go / No-Go Gate — 사용자 추천 기능을 열기 위한 최소 조건

### GO 조건

한 domain vertical에서 다음이 실제 데이터로 반복 재현되어야 한다.

```text
1. PIT/information-set leak 0
2. comparable fact coverage policy 통과
3. evidence effective-independence 계산 가능
4. economic invariant critical FAIL 0
5. expectation basis 명시
6. exposure/business-driver derivation 존재
7. claim-level valuation 또는 명시적 non-valuation strategy
8. recommendation selected/rejected 모두 outcome 평가
9. actionable execution policy로 backtest
10. safety downgrade/abstention fixture 통과
11. semantic definition 변경 후 selective invalidation 성공
12. corporate action fixture에서 economic return continuity 성공
```

### NO-GO 조건

다음 중 하나라도 있으면 user-facing directional recommendation을 연다 해도 `research candidate`를 넘지 않는다.

- legacy association edge가 추천 이유의 핵심
- raw source count를 독립 증거 수로 사용
- future market reaction이 ex-ante view에 혼입
- selected candidate만 outcome 평가
- missing KPI가 0/neutral로 채워짐
- low-liquidity candidate에 capacity policy 없음
- model ensemble genealogy 미확인
- semantic snapshot mismatch 상태에서 최신 content로 서빙
- pipeline healthy와 recommendation safe를 같은 boolean으로 사용

---

# Part XLVI. 4차 파괴 검증 후 실제 다음 산출물

## 227. 이제 만들어야 할 문서/명세

다음 작업은 더 큰 Master Design이 아니라 **구현 가능한 좁은 계약**이다.

### 227.1 `canonical-kernel-contract.md`

포함:

- 12 Family mapping
- truth_class
- semantic type dependency rules
- information_set
- Temporal Query Kernel
- semantic snapshot/invalidation
- evidence independence
- economic invariant interface
- product safety state

### 227.2 `semiconductor-domain-adapter-v1.md`

포함:

- entity/product generation
- HBM/GPU/foundry 등 product hierarchy 예시
- capacity/design win/qualification/backlog
- KPI definitions/comparability
- exposure/business driver
- valuation method applicability

### 227.3 `vertical-golden-fixture.md`

하나의 실제와 유사한 synthetic case를 source bytes부터 common view까지 완주한다.

**실제 기업명을 쓰지 않는 synthetic fixture를 먼저 사용**해 모델이 브랜드 prior로 통과하는 것을 막는다.

### 227.4 `recommendation-shadow-contract.md`

포함:

- universe snapshot
- opportunity set
- candidate/rejection/abstain
- actionability
- capacity
- outcome labels
- selected vs rejected regret

### 227.5 `migration-from-as-built.md`

현재 테이블마다:

```text
KEEP
MAP
EXTEND
DEPRECATE
DERIVED_ONLY
UNUSED/REMOVE-LATER
```

를 판정한다.

---

## 228. 4차 작업 종료 기준

이 Master Design은 이제 **아이디어 백로그가 아니라 설계 constitution**으로 취급한다.

앞으로 새로운 아이디어가 생기면 바로 canonical table을 추가하지 않는다.

```text
새 아이디어
 → 어느 사용자 질문을 해결하는가
 → 기존 12 Family로 표현 가능한가
 → current vertical fixture에서 실제 필요한가
 → 없으면 어떤 실패가 발생하는가
 → gold/red-team fixture로 증명 가능한가
 → architecture RFC
```

를 통과해야 한다.

즉 다음 단계부터는 **설계를 더 크게 만드는 능력보다, 작은 구현에서 이 계약이 실제로 살아남는지 증명하는 능력**이 중요하다.

---

# Part XLVII. 5차 Source Expansion — Data Acquisition & Intelligence Coverage Architecture

## 229. 목적 — 좋은 추론 엔진보다 먼저 좋은 정보집합을 만든다

4차까지의 설계는 **가져온 정보를 어떻게 사실·사건·노출·전망·추천으로 바꿀 것인가**에 집중했다.
이 절은 반대편 질문을 정본화한다.

> **세상에 존재하는 투자 관련 정보 중 무엇을, 어디서, 어떤 속도로, 어떤 권리로, 어느 깊이까지 가져와야 하는가?**

이 제품에서 데이터 획득은 단순 ETL이 아니다. 추천·테마·영향 분석의 상한을 결정하는 **Intelligence Coverage Plane**이다.

핵심 명제:

1. source 수가 많다고 정보량이 많은 것이 아니다.
2. 같은 통신사 원문을 복제한 기사 100개는 독립 정보 100개가 아니다.
3. 공식 API 하나가 뉴스 50개보다 더 높은 경제적 가치를 가질 수 있다.
4. `무료`와 `상업적 재표시 가능`은 다르다.
5. 현재 값만 주는 API와 과거 information set을 복원할 수 있는 소스는 다른 등급이다.
6. source별로 정확도뿐 아니라 **어떤 객체를 얼마나 완전하게 만들 수 있는지**를 측정해야 한다.
7. source를 추가할 때마다 새 테이블을 만들지 않는다. 기존 12 canonical family에 투영한다.
8. 수집 실패는 단순 ops failure가 아니라 `coverage`의 변화이며 사용자 결과에도 반영된다.
9. LLM은 source discovery·crawl planning·schema mapping을 도울 수 있지만 source rights와 truth 승인을 결정하지 않는다.
10. Master Design은 source catalog의 모든 vendor 세부사항을 영구 고정하지 않는다. **Source Contract와 평가 규칙을 고정하고 실제 endpoint/가격/약관은 onboarding 시 재검증**한다.

---

## 230. Data Acquisition Plane의 논리 구조

```text
Source Discovery
  → Source Qualification
  → Rights / License Gate
  → Source Contract
  → Connector / Crawler / RPC Adapter
  → Raw Immutable Capture
  → Source Revision / Observation
  → Parsing / Normalization
  → Entity & Metric Resolution
  → Coverage Ledger
  → Canonical Object Families
  → Derived Analytics / Recommendation

Parallel control:
  Source SLO
  Source Independence Graph
  PIT Reconstructability
  Schema Drift Detector
  Cost / Quota Budget
  Legal / Redisplay Policy
  Fallback / Redundancy
```

이 Plane은 기존 L0/L1을 대체하지 않는다. **L0/L1을 어떤 소스로 얼마나 채울지 결정하는 control plane**이다.

---

## 231. Source Authority Class — 출처의 종류를 먼저 분리한다

모든 source에 다음 중 하나를 부여한다.

| class | 의미 | 예 | canonical truth 자격 |
|---|---|---|---|
| `PRIMARY_REGULATORY` | 법적·규제·공시 정본 | SEC, DART, Federal Register | 강함 |
| `PRIMARY_MARKET_INFRA` | 거래소·청산·SRO·원장 | KRX, FINRA, OCC, chain node | 해당 데이터에 강함 |
| `PRIMARY_CORPORATE` | 기업이 직접 발행 | IR, newsroom, product docs | 회사 주장/공식 발표에 강함 |
| `PRIMARY_GOV_STATS` | 통계기관·중앙은행·정부 | FRED/BLS/BEA/ECOS/KOSIS | 해당 통계에 강함 |
| `STRUCTURED_PUBLIC` | 공식 공개 구조 데이터 | GLEIF, UN Comtrade, USAspending | 범위에 따라 강함 |
| `LICENSED_PROFESSIONAL` | 전문 상용 데이터 | consensus, detailed options | 계약 범위 내 강함 |
| `REPUTABLE_SECONDARY` | 신뢰도 높은 보도/리서치 | 통신사·전문매체 | event discovery/corroboration |
| `DISCOVERY_AGGREGATOR` | 빠른 탐지·coverage 확장 | news/event aggregator | candidate 전용 기본 |
| `ALTERNATIVE_SIGNAL` | 간접 실물/관심 신호 | jobs, web traffic, satellite | estimate/candidate 기본 |
| `USER_SUPPLIED` | 사용자가 제공 | thesis, document | private/context 범위 |
| `INTERNAL_DERIVED` | 우리 시스템 산출물 | report, forecast | primary evidence 금지 |

**authority class는 source_quality 하나로 환원하지 않는다.** 예를 들어 회사 IR은 자기 회사 가이던스의 직접 근거지만 경쟁사 시장점유율 주장에는 이해상충이 존재할 수 있다.

---

## 232. Source Contract V2 — 모든 API·크롤러가 가져야 할 계약

```text
source_contract
  source_id
  canonical_name
  source_family
  authority_class
  jurisdiction
  official_owner

  access_mode[]
    API | BULK | RSS | ATOM | SITEMAP | HTML_CRAWL | FILE | RPC | WEBSOCKET | EMAIL_ALERT

  endpoint_registry
  schema_version
  authentication_type
  quota_policy
  retry_policy
  crawl_policy
  robots_policy

  coverage
    entity_types[]
    markets[]
    countries[]
    object_families[]
    metric_families[]
    event_types[]

  temporal_contract
    published_time_semantics
    available_time_semantics
    revision_support
    historical_depth
    expected_cadence
    max_acceptable_staleness
    pit_reconstructability_class

  rights_contract
    fetch_allowed
    raw_store_allowed
    derived_analysis_allowed
    excerpt_redisplay_allowed
    fulltext_redisplay_allowed
    commercial_use_allowed
    attribution_required
    retention_limit
    user_export_allowed
    license_document_hash
    reviewed_at
    expires_or_review_at

  quality_contract
    primary_key_definition
    entity_link_hints
    expected_count_model
    nullability_profile
    source_independence_group
    known_failure_modes[]

  economics
    fixed_cost
    marginal_cost
    engineering_cost_class
    legal_risk_class
    replacement_difficulty

  fallback_source_ids[]
  owner
  status
```

**endpoint URL이나 API key만 등록한 connector는 Source Contract 완료가 아니다.**

---

## 233. PIT Reconstructability Class — 과거를 재현할 수 있는 정도

Source마다 다음 등급을 저장한다.

| PIT class | 의미 | 예 | backtest/causal 사용 |
|---|---|---|---|
| `PIT_A_NATIVE_VINTAGE` | source 자체가 revision/vintage를 제공 | FRED/ALFRED 유형 | 가장 강함 |
| `PIT_B_VERSIONED_ARTIFACT` | 원문·공시·법령 버전이 보존 | SEC/DART/법령 revision | 강함 |
| `PIT_C_OUR_ARCHIVE` | source는 current만 제공, 우리가 당시 snapshot부터 보존 | 회사 웹페이지·일부 API | archive 이후 가능 |
| `PIT_D_LATEST_ONLY` | 과거 revision 복원 어려움 | 일부 aggregation API | 과거 평가 제한 |
| `PIT_E_UNKNOWN` | time semantics 불명확 | 비공식 scraped data | recommendation training 금지 기본 |

규칙:

```text
historical backtest / causal estimation
  → PIT_A/B 우선
  → PIT_C는 우리 archive가 시작된 이후만
  → PIT_D/E를 과거 시점의 사실처럼 소급 사용 금지
```

Eurostat처럼 API가 최신 dataset만 제공하고 과거 버전을 보존하지 않는 서비스도 있으므로, **공식 source라고 자동으로 PIT_A가 아니다.**

---

## 234. Source Acquisition Value — 무엇부터 붙일지 계산한다

기존 §103의 개념을 다음처럼 확장한다.

```text
AcquisitionValue = f(
  incremental_information_gain,
  economic_materiality,
  product_surface_coverage,
  source_independence,
  authority,
  timeliness,
  historical_depth,
  pit_reconstructability,
  entity_linkability,
  metric_definitional_quality,
  expected_fill_of_known_gaps,
  user_demand
)

AcquisitionCost = f(
  license_cost,
  engineering_cost,
  normalization_cost,
  rate_limit_cost,
  storage_cost,
  parsing_fragility,
  legal_or_redisplay_risk,
  vendor_lock_in,
  operational_blast_radius
)
```

점수는 투자 expected return처럼 정밀한 숫자일 필요가 없다. 목적은 **“API가 있으니까 붙인다”는 의사결정을 막는 것**이다.

### Kill Gate

다음 중 하나면 높은 정보가치라도 자동 도입하지 않는다.

- commercial use 또는 derived use 권리가 불명확
- user-facing redisplay 요구와 license가 충돌
- entity identity를 안정적으로 연결할 방법 없음
- timestamp semantics가 불명확하고 PIT 목적에 사용하려 함
- source 자체가 생성형/합성 데이터인데 primary로 오인 가능
- source outage가 전체 pipeline을 멈추도록만 구현 가능

---

# Part XLVIII. Source Portfolio — 현재보다 실제로 늘릴 데이터

## 235. 우선순위 정의

```text
S0  지금 설계의 핵심 가치에 직접 필요. 가능한 한 먼저 연결/강화
S1  높은 증분 가치. S0 vertical 안정화 후 적극 도입
S2  특정 domain/theme에서 매우 유용. demand-driven
S3  실험/고비용/rights 복잡. shadow 또는 research only
X   기본적으로 수집하지 않거나 evidence로 사용 금지
```

우선순위는 source의 “유명함”이 아니라 **현재 제품의 정보 공백을 얼마나 줄이는지**로 조정한다.

---

## 236. S0 — 기업·증권·공시 Truth Backbone

### 236.1 미국 — SEC EDGAR

권장 범위:

- Submissions by company
- Company Facts / XBRL
- 10-K / 10-Q / 8-K
- 13D / 13G
- 13F
- Forms 3/4/5
- S-1 / S-3 / 424B 등 issuance
- DEF 14A
- merger/proxy 관련 문서
- full-text filing archive

생성 객체:

```text
Identity / Economic Claim
Assertion
Numeric Fact
Corporate Action
Ownership
Insider Activity
Capital Allocation
Event
Expectation input(company guidance)
```

SEC는 submissions와 XBRL 추출 데이터를 REST API로 제공하고 EDGAR filing 전체 검색/다운로드를 지원한다. API만 쓰지 말고 **filing 원문도 immutable capture**한다.

Official references:
- https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- https://data.sec.gov/

Priority: **S0 KEEP/EXPAND**

---

### 236.2 한국 — OpenDART + KRX/KIND + 금융위원회 공공데이터

OpenDART:

- 공시원문 XML
- 재무제표
- 주요사항보고
- 지분공시
- 증권신고
- 기업 주요정보

KRX Data Marketplace / KIND:

- 상장/시장 상태
- 시장·파생·공매도 정보
- 거래소 공시·IR 자료
- corporate action validation

금융위원회 공공데이터에서 특히 가치가 큰 것:

- 기업기본정보 — 계열사·종속기업·기준일 조회
- 공시정보 — 주요 경영/투자판단 사항
- 주식발행정보 — 발행주식·상장폐지·보호예수·발행사유
- 금융회사 기본/공시/경영지표 — bank/insurance adapter 강화
- 금융투자협회 종합통계 — 자금/시장 구조 보조
- 한국예탁결제원 계열 데이터가 공개되는 경우 economic claim/corporate action 보강

중요:

> 금융위 데이터는 원천기관 연계 후 제공되어 **실시간이 아니며 일부 서비스는 영업일 지연**이 있다. 따라서 `available_at`은 실제 API 관측 시각과 source 기준일을 분리한다.

Official references:
- https://opendart.fss.or.kr/
- https://data.krx.co.kr/
- https://www.data.go.kr/data/15043184/openapi.do
- https://www.data.go.kr/data/15059649/openapi.do
- https://www.data.go.kr/data/15043423/openapi.do

Priority: **S0 EXPAND**

---

## 237. S0 — Company Official Web Intelligence Crawler

현재 설계에서 가장 비용 대비 가치가 큰 신규 축 중 하나다.

### 237.1 목적

API가 없는 정보까지 회사 공식 사이트에서 구조적으로 가져온다.

```text
Corporate Website
├─ Investor Relations
│  ├─ earnings release
│  ├─ presentation
│  ├─ annual/interim report
│  ├─ guidance
│  ├─ transcript/webcast where permitted
│  └─ calendar
├─ Newsroom / press release
├─ Product / service pages
├─ pricing
├─ technology / documentation
├─ facility / location
├─ management / governance
├─ careers
├─ security/advisory
└─ sustainability / regulatory documents
```

### 237.2 Crawl Discovery

순서:

```text
official_domain
 → robots.txt
 → sitemap / sitemap index
 → RSS/Atom/JSON feeds
 → known IR paths
 → internal link graph
 → language/region variants
 → resource classification
```

Robots Exclusion Protocol은 RFC 9309를 따르고, sitemap은 URL discovery 보조로 사용한다.

### 237.3 Fetch 정책

- conditional request: `ETag`, `If-None-Match`, `Last-Modified`
- raw response body + headers + TLS/fetch metadata 보존
- HTML/PDF/XLSX/CSV/JSON/ZIP 별 parser 분리
- JS rendering은 static fetch가 실패할 때만
- PDF가 바뀌면 파일 hash뿐 아니라 page/table 구조 diff
- redirect chain 보존
- canonical URL과 discovered URL 분리
- locale path를 같은 문서로 임의 merge하지 않음

### 237.4 Change Intelligence

페이지 변경은 곧바로 Event가 아니다.

```text
raw revision
 → DOM/section diff
 → semantic diff
 → change candidate
 → materiality classifier
 → assertion/event candidate
 → evidence gate
```

관찰할 변화 예:

- guidance 숫자 변경
- product generation 추가/삭제
- pricing 변경
- 임원/이사회 변경
- facility 추가/삭제
- 파트너/고객 reference 변경
- 지원 국가 변경
- 반복 공개 KPI 삭제
- careers skill/geography 변화
- security notice

### 237.5 Informative Missingness 결합

```text
매분기 공개하던 KPI
 → 이번 revision에서 사라짐
 → missingness_event candidate
 → 원인 불명
 → analyst/IR explanation 탐색
```

“없는 값”을 0으로 바꾸지 않는다.

### 237.6 Careers / Jobs의 위치

채용 공고는 다음 정도로만 사용한다.

- 지역별 확장 후보
- 기술 stack/제품 투자 방향 후보
- sales/engineering 조직 확대 후보
- facility ramp candidate

**채용 증가 = 매출 증가**로 승격 금지.

Priority: **S0 신규**

---

## 238. S0 — Expectation / Consensus Data Strategy

이 플랫폼에서 가장 쉽게 가짜 정밀도를 만들 수 있는 곳이다.

### 238.1 반드시 구분

```text
Company Guidance
Sell-side Consensus
Individual Analyst Estimate
Market-Implied Expectation
Our Model Forecast
Survey Expectation
```

서로 다른 source family다.

### 238.2 무료 데이터로 할 수 있는 것

- 회사 공식 guidance
- 경제지표의 공개 survey가 합법적으로 확보되는 범위
- 옵션/선물로부터 implied state
- 역사적 actual + 자체 forecast

하지만 **기업 EPS/revenue/industry KPI consensus를 LLM이 기사에서 모아서 product-grade consensus처럼 만들지 않는다.**

### 238.3 상용 데이터 후보

현재 시장에서 API 형태로 다음 계열이 존재한다.

- FactSet Estimates API
- LSEG / I/B/E/S Estimates API
- S&P Capital IQ Estimates / Visible Alpha 계열

이 소스군은 높은 비용이 들더라도 다음 기능의 품질 상한을 크게 올릴 수 있다.

- earnings surprise
- revision breadth/magnitude
- dispersion
- forward industry KPI
- peer expectation comparison
- priced-in vs consensus

### 238.4 도입 원칙

**유료 source ROI 실험을 먼저 한다.**

```text
30~100개 핵심 종목 shadow sample
 → consensus history 확보
 → 기존 guidance/model-only 대비
 → surprise explanation quality
 → ranking incremental value
 → user surface usefulness
 → license/redisplay cost
 → GO/NO-GO
```

컨센서스는 **S0 구매 검토 대상**이지만 계약 전 canonical dependency로 강제하지 않는다.

Official/vendor references verified 2026-08-07:
- https://developer.factset.com/api-catalog/factset-estimates-api
- https://developers.lseg.com/en/api-catalog/refinitiv-data-platform/estimates-API
- https://www.spglobal.com/market-intelligence/en/solutions/capital-iq-estimates

Priority: **S0 decision / licensed**

---

## 239. S0 — Macro / Rates / Release Vintage

### 미국

- FRED / ALFRED — real-time/vintage 핵심
- BLS — CPI, employment, wage 등
- BEA — GDP, income, industry, trade/services
- U.S. Treasury Fiscal Data — auctions, debt, cash operations
- Treasury daily rates / yield curves

### 한국

- ECOS
- KOSIS
- 정부/부처 통계 원천

### 글로벌

- IMF SDMX API
- World Bank API
- Eurostat
- ECB Data Portal API
- 주요 중앙은행 공식 통계

### 원칙

거시 source는 `observation_date`만 저장하지 않는다.

```text
reference_period
release_at
available_at
known_at
vintage/revision
source_timezone
market_session_mapping
```

FRED는 vintage date를 제공하므로 PIT_A이며, 최신 버전만 노출하는 source는 우리가 처음 수집한 이후에만 PIT_C로 취급한다.

Official references:
- https://fred.stlouisfed.org/docs/api/fred/
- https://www.bls.gov/developers/home.htm
- https://apps.bea.gov/api/signup/
- https://fiscaldata.treasury.gov/api-documentation/
- https://ecos.bok.or.kr/
- https://kosis.kr/openapi/
- https://data.imf.org/en/Resource-Pages/IMF-API
- https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access
- https://data.ecb.europa.eu/help/api/overview

Priority: **S0 EXPAND**

---

## 240. S0 — Regulation / Law / Sanctions / Trade Controls

뉴스보다 규정 원문을 먼저 잡아야 하는 영역이다.

### 미국

- Federal Register API
- Regulations.gov API
- OFAC Sanctions List Service
- BIS EAR / Consolidated Screening List / enforcement actions

### 한국

- 국가법령정보센터 Open API
- 금융위·금감원·산업부·공정위 등 공식 발표/고시

### EU

- EUR-Lex webservice
- EU sanctions consolidated resources

### 생성 객체

```text
Law / Regulation / Rule
Proposal / Notice
Effective Date
Jurisdiction
Target Product / ECCN / Entity
Sanction / Delisting / License Requirement
Exception / Exemption
Enforcement Action
```

### 중요 구현

법률 문서는 다음 lifecycle을 반드시 분리한다.

```text
proposed
comment_period
final_rule
published
effective
stayed
amended
repealed
```

FederalRegister.gov API 데이터는 편리한 정규화 source지만 해당 사이트 자체가 공식 Federal Register PDF의 법적 효력을 대체한다고 가정하지 않는다. **법률적으로 중요한 문장은 official edition locator까지 보존**한다.

Official references:
- https://www.federalregister.gov/developers/documentation/api/v1
- https://open.gsa.gov/api/regulationsgov/
- https://ofac.treasury.gov/sanctions-list-service
- https://www.bis.gov/
- https://open.law.go.kr/LSO/openApi/guideList.do
- https://eur-lex.europa.eu/content/help/data-reuse/webservice.html

Priority: **S0 신규/확장**

---

## 241. S0/S1 — Legal Entity / Ownership / Corporate Hierarchy

### GLEIF

사용:

- LEI identity
- legal name/address
- direct accounting consolidating parent
- ultimate accounting consolidating parent
- reporting exception

GLEIF Level 2는 `who owns whom` 관계를 제공하므로 글로벌 entity resolution과 parent/subsidiary 후보에 매우 유용하다.

주의:

- accounting consolidation parent이지 모든 economic control을 완전히 표현하지 않는다.
- parent가 LEI가 없거나 exception인 경우를 `no_parent`로 해석 금지.
- corporate family는 SEC/DART/company disclosure와 교차 검증.

Official reference:
- https://www.gleif.org/en/lei-data/gleif-api

Priority: **S0 identity enrichment**

---

## 242. S0/S1 — Supply Chain / Trade / Production Network

### 242.1 UN Comtrade

목적:

```text
Country × Partner × HS Product × Time
 → trade flow
 → product/geography dependence
 → sector/company exposure candidate
```

기업 supplier relation의 대체재가 아니라 **산업·국가 구조 prior**다.

### 242.2 OECD ICIO / TiVA

OECD ICIO는 국가·산업간 생산, 소비, 투자, 중간재와 국제 무역흐름을 구조화한다.
2025 edition은 80개 경제권과 rest-of-world를 포함하며 1995~2022 구간을 제공하고, 2026년에 revision이 있었다.

사용:

- indirect shock propagation
- country/industry dependency
- Leontief-style exposure
- direct supplier 데이터가 없는 기업의 prior

### 242.3 Customs / National Trade

필요 시 국가별 세관/무역 API를 별도 connector로 추가한다.
한국은 관세청/공공데이터에서 품목·국가별 무역 통계를 조사하고, 미국은 Census/USITC 계열을 검토한다.

### 242.4 기업 수준 공급망

공식 공시의 customer/supplier + 계약 + 시설 + 제품을 우선한다.
유료 bill-of-lading/supply-chain vendor는 **S2 ROI 검증**으로 둔다.

Official references:
- https://comtradeapi.un.org/
- https://www.oecd.org/en/data/datasets/inter-country-input-output-tables.html

Priority: **S0 industry network / S2 firm-level commercial**

---

## 243. S1 — Government Procurement / Contract Demand

정부 계약은 방산·AI·클라우드·인프라·의료·우주 산업에서 직접 demand signal이 된다.

### 미국

- USAspending API — awards/recipient/agency/geography
- SAM.gov Opportunities API — 현재 입찰·기회
- SAM.gov Contract Awards / Subaward APIs — entitlement에 따라

표준 경로:

```text
Agency
 → Program / Opportunity
 → Award / Contract
 → Legal Entity
 → Product / Service / Geography
 → Backlog / Revenue Exposure
 → Company / Security
```

중요:

- opportunity는 매출 사실이 아니다.
- award ceiling과 실제 obligated amount를 구분.
- prime과 subcontractor를 구분.
- award modification과 cancellation을 revision으로 처리.

Official references:
- https://api.usaspending.gov/
- https://open.gsa.gov/api/get-opportunities-public-api/

Priority: **S1**, 방산/정부 IT adapter에서는 **S0 domain source**

---

## 244. S1 — Market Microstructure / Positioning / Derivatives

현물 OHLCV만으로는 `priced-in`, crowding, liquidity risk를 설명하기 어렵다.

### 미국 equities

FINRA:

- Short Sale Volume
- Short Interest
- OTC/ATS transparency
- Reg SHO / threshold data where applicable

FINRA Developer API는 OTC market 등 여러 dataset에 programmatic access를 제공한다.

주의:

- short sale volume ≠ short interest.
- ATS volume 증가 ≠ bullish/bearish direction.
- FINRA 일부 데이터의 이용조건은 상업용 제품에서 별도 확인.

### Options

무료/공식 기초:

- OCC volume/open interest/series data
- Cboe 공개 historical volume

상용 고해상도:

- Cboe DataShop/OPRA-derived trades, EOD IV/Greeks 등

필요 객체:

```text
option_surface_snapshot
implied_volatility
skew
term_structure
expected_move
open_interest
volume
liquidity
```

**Options flow를 방향성 매수/매도로 단순 추정하지 않는다.** trade classification이 없는 aggregation에서 dealer/customer direction을 발명하지 않는다.

### Futures / Commodities

- CFTC Commitments of Traders
- exchange futures curves when licensed/available

COT는 weekly이고 report date와 release date가 다르므로 Actionability Clock을 적용한다.

Official references:
- https://developer.finra.org/docs
- https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data
- https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/open-interest
- https://www.cboe.com/us/options/market_statistics/historical_data/
- https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm

Priority: **S1**, recommendation/priced-in이 핵심 화면이 되면 일부는 S0로 승격

---

## 245. S1 — Credit / Funding / Capital Structure Signals

주식만 분석해도 회사의 credit state는 중요하다.

권장 source family:

- bond issuance disclosures
- FINRA fixed-income/TRACE data 사용 가능 범위
- CDS/credit spread commercial source
- commercial paper / short-term funding official datasets
- Treasury/risk-free curve
- bank funding/regulatory statistics

한국에서는 금융위원회 단기금융증권 발행정보 등 공개 API를 활용할 수 있다.

생성:

```text
refinancing_wall
maturity_profile
funding_cost
credit_spread
liquidity_risk
convertible_dilution
capital_structure_event
```

Priority: **S1**

---

## 246. S1 — Domain Adapter Source Packs

범용 source를 늘리는 것보다 산업별 S0 source를 정하는 것이 더 중요하다.

### 246.1 Life Science / Bio

- ClinicalTrials.gov API
- openFDA: FAERS, labels, recalls, Drugs@FDA, shortages 등
- FDA/EMA regulatory announcements
- patents

```text
Study
 → Phase
 → Enrollment
 → Primary/Secondary Endpoint
 → Completion
 → Result
 → Safety Signal
 → Regulatory Milestone
 → Probability / rNPV
```

FAERS는 신고 데이터이므로 `event count = incidence`로 해석 금지.

Official references:
- https://clinicaltrials.gov/data-api/api
- https://open.fda.gov/apis/drug/

Priority: **S1 global / S0 bio adapter**

### 246.2 Energy / Utilities

- EIA Open Data
- grid/ISO/RTO public data where available
- nuclear outage data
- refinery/storage/production
- gas pipelines/storage
- commodity curves
- weather

EIA는 electricity, petroleum, natural gas 등 방대한 공식 API/bulk data를 제공한다.

Official reference:
- https://www.eia.gov/opendata/

Priority: **S1 / S0 energy adapter**

### 246.3 Technology / Software / Crypto Infrastructure

공식 organization/repository가 확인된 경우:

- GitHub releases/commits/tags
- GitHub Security Advisories
- official docs revision
- package registry downloads where terms allow
- cloud/service status pages

GitHub activity는 **software delivery evidence**이지 revenue fact가 아니다.

Official references:
- https://docs.github.com/en/rest
- https://docs.github.com/en/rest/security-advisories

Priority: **S1 domain enrichment**

### 246.4 Patents / IP

USPTO Open Data Portal:

- patent/application data
- assignee/inventor/classification
- maintenance events

2026년 PatentsView가 USPTO Open Data Portal로 이전했고, 2026-06-18부터 ODP search/download에 계정 sign-in 요구가 도입되었으므로 connector는 legacy PatentsView endpoint에 고정하지 않는다.

Official references:
- https://data.uspto.gov/
- https://data.uspto.gov/support/transition-guide/patentsview

Priority: **S1/S2** — semiconductor/pharma에서 우선

---

## 247. S1/S2 — Geo / Physical World / Disaster Intelligence

현재 Geo Plane을 실제 경제적 충격으로 연결하기 위한 source다.

### 공식/공개 후보

- USGS earthquake feeds/API
- NASA FIRMS active fire API
- NOAA NCEI weather/climate API
- 국가 기상·재난기관
- port/airport/facility official datasets
- energy facility datasets

표준 경로:

```text
Physical Event Geometry
 → Facility Intersection
 → Capacity / Route Exposure
 → Product / Supplier / Customer
 → Financial Impact
```

NASA FIRMS는 near-real-time active fire를 제공하며 글로벌 데이터는 위성 관측 후 수시간 내 이용 가능하다. 이 데이터는 **화재 존재 후보**이지 특정 회사의 생산중단 사실 그 자체는 아니다.

Official references:
- https://earthquake.usgs.gov/fdsnws/event/1/
- https://firms.modaps.eosdis.nasa.gov/api/
- https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation

Priority: **S1 disaster/energy/mining, S2 general**

---

## 248. S0/S1 — Crypto Source Stack은 Aggregator보다 Raw Truth를 아래에 둔다

### 248.1 3층 구조

```text
Layer C — Aggregated analytics/vendor
  Coin Metrics / CoinGecko / protocol analytics

Layer B — Protocol / Exchange official APIs
  exchange REST/WebSocket
  protocol subgraph/API
  governance API/forum
  official token schedule

Layer A — Chain Canonical Data
  full/archive node RPC
  blocks / transactions / logs / state / consensus finality
```

**Layer C가 Layer A를 대체하지 않는다.**

### 248.2 Ethereum

Ethereum client JSON-RPC은 state/history를 조회하고 `safe`, `finalized` block tag를 지원한다. consensus client의 Beacon API도 별도로 존재한다.

저장:

```text
chain_id
block_height
block_hash
parent_hash
observed_at
canonicality_state
finality_state
transaction/log provenance
contract_code_hash
```

Official reference:
- https://ethereum.org/developers/docs/apis/json-rpc/

### 248.3 Solana/기타 chain

chain adapter는 `block/slot`, commitment/finality, skipped block, program/account model을 체인별 의미로 유지한다. EVM schema에 강제로 맞추지 않는다.

### 248.4 Cross-check / convenience

- Coin Metrics — network/market data, 일부 community API
- CoinGecko — broad asset/exchange/DEX discovery

이들은 identity/discovery/normalization에 유용하지만 high-stakes on-chain fact는 가능한 경우 raw chain으로 재검증한다.

References:
- https://docs.coinmetrics.io/api/v4/
- https://docs.coingecko.com/

Priority: **S0 major-chain raw truth + S1 vendor cross-check**

---

## 249. S1 — News / Event Discovery Portfolio

뉴스는 truth source 하나가 아니라 **발견·시간선·교차검증 층**이다.

권장 포트폴리오:

```text
Official announcement / filing
        ↑
licensed/reputable wire
        ↑
publisher RSS / specialist media
        ↑
event/news aggregator
        ↑
social/community discovery
```

### 원칙

- wire의 syndicated copies는 source independence 1개로 계산
- headline만으로 assertion 승격 금지
- 수정기사/정정기사 revision 추적
- timestamp는 first published / updated / fetched를 분리
- paywall 우회 금지
- fulltext redisplay 권리 없는 source는 원문 보관/표시 정책 분리
- aggregator는 `canonical_event discovery`에 유용하지만 공식 확인 가능 사건은 primary source를 적극 회수

### Media ingestion

공식 earnings webcast, policy press conference, conference presentation이 허용되는 경우:

```text
audio/video artifact
 → timestamped ASR
 → speaker diarization
 → slide/frame alignment
 → assertion candidate
 → original timestamp anchor
```

ASR transcript는 **파생물**이며 원본 media timecode가 evidence anchor다.

Priority: **S1 확대**, licensed wire는 budget-dependent S0 후보

---

## 250. S2 — Alternative Data는 “먼저 많이”가 아니라 “질문이 있을 때” 붙인다

후보:

- company careers/jobs
- web/app traffic
- app store rank/review metadata
- e-commerce price/availability
- package downloads/developer adoption
- shipping/AIS
- satellite imagery/night lights/parking/activity
- electricity consumption
- card transaction aggregates
- search trends
- social attention

### 사용 조건

```text
AlternativeSignal
  source_methodology
  sampling_frame
  coverage_bias
  revision_policy
  historical_stability
  geographic_coverage
  survivorship
  representativeness
  known_breaks
```

**매출의 proxy인지, 사용량의 proxy인지, 관심의 proxy인지 구분한다.**

예:

```text
website visits ↑
≠ revenue ↑

job postings ↑
≠ headcount actually ↑

satellite activity ↓
≠ factory shutdown confirmed
```

Priority: **S2/S3**

---

# Part XLIX. Intelligence Coverage Model

## 251. Coverage는 문서 수가 아니라 “질문을 답할 수 있는 정도”다

기존 `coverage_ledger`를 source portfolio 차원으로 확장한다.

```text
coverage_dimension
  entity_id / universe_id
  domain
  object_family
  metric_family / event_family
  horizon
  geography
  expected_source_bundle
  observed_source_bundle
  independent_source_count
  primary_source_present
  pit_quality
  freshness_state
  comparability_state
  rights_state
  completeness_state
  last_evaluated_at
```

사용자에게 다음을 구분한다.

```text
KNOWN_PRESENT       확인된 정보가 있다
KNOWN_ABSENT        충분히 조사했으나 확인되지 않는다
PARTIAL_COVERAGE    일부 source만 있다
NOT_COLLECTED       아직 수집 대상이 아니다
SOURCE_UNAVAILABLE  원천 장애/권리 문제
NOT_APPLICABLE      해당 기업/산업에는 적용되지 않는다
```

---

## 252. Source Coverage Matrix — 객체별 최소 source bundle

기호:

```text
P = primary/canonical source 우선
E = enrichment / corroboration
C = candidate/discovery
O = optional
```

| 정보 객체 | Filing/Regulator | Company IR/Web | Market Infra | Govt Stats | Trade/Physical | Licensed Pro | News | Chain |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| identity/security | P | E | P | O | O | E | C | P |
| financial fact | P | P |  |  |  | E | C |  |
| guidance | P/E | P |  |  |  | E | C |  |
| consensus expectation |  | E |  |  |  | P | C |  |
| corporate action | P | E | P |  |  | E | C | P/E |
| regulation/sanction | P |  |  | P |  | E | C |  |
| supply-chain exposure | E | P/E |  |  | P | E | C | E |
| market reaction |  |  | P |  |  | E |  | P |
| positioning |  |  | P |  |  | P/E |  | P/E |
| physical disruption |  | E |  | P | P | E | C |  |
| theme/narrative |  | E | E | E | E | E | P/C | E |
| protocol/token state |  | P | P |  |  | E | C | P |

이 matrix는 source를 늘리기 위한 checklist가 아니라 **“이 결론을 내리려면 어떤 독립 정보층이 필요한가”**를 나타낸다.

---

## 253. Coverage-Aware Recommendation Gate

추천은 다음을 통과해야 한다.

```text
minimum_identity_coverage
minimum_financial_or_economic_state
minimum_market_state
minimum_event/news coverage
minimum_expectation coverage (claim에 필요할 때)
minimum_counter_evidence_search
minimum_PIT_quality
minimum_rights_state
```

예:

```text
회사 fundamentals는 강하지만 consensus source 없음
 → "실적 대비 시장 기대"를 확정 표현 금지
 → guidance/model-based expectation만 표시

소형주 news/IR coverage가 낮음
 → opportunity score는 있어도 BROAD_RECOMMENDATION 금지
 → RESEARCH_CANDIDATE / PARTIAL_COVERAGE
```

---

## 254. Information Gain Budget — 홈 화면을 source volume으로 채우지 않는다

수집량이 늘수록 사용자 피드가 더 좋아지는 것은 아니다.

```text
Raw Source Volume
 → Event Dedup
 → Assertion Merge/Conflict
 → Information Gain
 → Economic Materiality
 → User Novelty
 → Surface Budget
```

같은 사건에 기사 50개가 추가돼도 새로운 사실이 없으면 `information_gain≈0`이다.

### 신규 source의 제품 성공 기준

```text
+ unique event discovery
+ earlier detection
+ better numeric coverage
+ better exposure estimate
+ expectation coverage
+ contradiction discovery
+ historical reconstruction
+ recommendation calibration
```

`document_count 증가`는 성공지표가 아니다.

---

# Part L. Crawler / Connector Implementation Contract

## 255. Connector는 공통 상태기계를 사용한다

```text
DISCOVERED
 → QUALIFYING
 → RIGHTS_REVIEW
 → APPROVED
 → BACKFILLING
 → ACTIVE
 → DEGRADED
 → SUSPENDED
 → RETIRED
```

### Source lifecycle event

다음도 append-only로 기록한다.

- endpoint 변경
- auth 방식 변경
- schema change
- rate-limit 변경
- terms/license 변경
- provider migration
- dataset discontinued
- revision correction

USPTO PatentsView→ODP 같은 migration은 이런 lifecycle이 없으면 connector가 조용히 낡는다.

---

## 256. Schema Drift Detector

API가 HTTP 200을 반환해도 데이터가 깨질 수 있다.

검사:

```text
field set hash
field type distribution
null rate
record count
key uniqueness
categorical vocabulary
unit/currency distribution
timestamp lag
revision rate
entity match rate
```

예:

```text
API success = true
records = 10,000
하지만 symbol field null 95%
```

이면 source는 `DEGRADED`다.

---

## 257. Incremental Fetch Contract

가능하면 source별로 다음 순서를 선호한다.

1. webhook/push/feed
2. delta API / updated-since
3. ETag/Last-Modified
4. sitemap lastmod
5. monotonic ID/cursor
6. bounded polling
7. full re-crawl

full re-crawl은 마지막 수단이다.

---

## 258. Raw Capture Envelope

모든 획득은 공통 envelope를 생성한다.

```text
raw_capture
  source_contract_id
  request_fingerprint
  requested_at
  response_started_at
  completed_at
  http/status/provider_code
  headers_digest
  content_type
  content_length
  raw_object_hash
  raw_object_uri
  canonical_url_or_endpoint
  observed_provider_timestamp
  rate_limit_state
  parser_hint
  rights_snapshot_id
  fetcher_version
```

RPC의 경우 HTTP URL 대신 chain/node identity와 block/slot context를 추가한다.

---

## 259. Web Crawl Security

외부 페이지 크롤러는 보안 경계다.

필수:

- SSRF protection
- private/link-local IP 차단
- redirect마다 destination 재검증
- DNS rebinding 방어
- MIME sniffing 제한
- 최대 파일 크기
- archive bomb 방어
- PDF/office parser sandbox
- script 실행 기본 금지
- headless browser 별도 격리
- malware scan
- outbound allow/policy
- credentials per source
- untrusted webpage instruction을 agent/tool instruction으로 해석 금지

현재 Security Plane과 같은 gate를 사용한다.

---

## 260. Rights & Redisplay Matrix

매우 중요한 분리:

```text
Can Fetch
Can Store Raw
Can Extract Facts
Can Train/Evaluate
Can Show Short Excerpt
Can Show Full Text
Can Export to User
Can Commercially Redistribute
```

이 여덟 개는 각각 다를 수 있다.

예:

- 공공 API라도 attribution 조건 존재 가능
- FINRA 일부 데이터는 non-commercial free와 commercial use 조건이 다를 수 있음
- KRX market data는 외부제공/정보사업자 정책을 별도로 확인해야 함
- 상용 consensus는 derived display와 raw export 권리가 다를 수 있음
- 회사 웹페이지를 crawl할 수 있어도 전문 전체문을 제품에서 재배포할 권리가 자동 발생하지 않음

따라서 `rights_state`는 source가 아니라 **artifact/field/product-surface까지 상속 가능한 policy**로 설계한다.

---

## 261. Source Independence Graph

Source를 늘릴수록 이 그래프가 중요해진다.

```text
source A Reuters original
source B portal syndication of Reuters
source C blog quoting portal B
company press release quoted by Reuters
```

실제 독립 evidence root는 경우에 따라 1~2개다.

저장:

```text
source_lineage_edge
  child_source_or_artifact
  parent_source_or_artifact
  relation
    syndicated_from
    quotes
    republishes
    derived_from
    mirrors
    same_press_release
    same_dataset
  confidence
  derivation
```

`independent_source_count`는 이 lineage를 collapse한 뒤 계산한다.

---

## 262. Source Redundancy는 Independence와 반대 개념이 아니다

운영 redundancy와 evidence independence를 구분한다.

```text
SEC API + SEC filing HTML
  운영 경로는 둘
  evidence root는 SEC 하나

FRED series + source agency BLS
  데이터 lineage는 연결되어 있을 수 있음
  "독립 거시 근거 2개"로 자동 계산 금지
```

Fallback이 있어도 corroboration count가 늘지 않을 수 있다.

---

# Part LI. Paid Data Procurement Architecture

## 263. 어떤 데이터에는 돈을 쓰는 것이 합리적이다

“무료 데이터만으로 만들기”는 제품 목표가 아니다.

돈을 쓸 가치가 상대적으로 큰 source군:

1. company/industry consensus estimates
2. detailed options/derivatives data
3. high-quality realtime news/wire with redistribution contract
4. firm-level supply-chain / shipment data
5. credit/CDS data
6. standardized global fundamentals/segment/KPI cross-check
7. high-quality alternative data with stable methodology

### 구매 판단

```text
IncrementalProductValue
  - free baseline 대비 정보 증분
  - recommendation quality
  - time saved to user
  - coverage expansion
  - earlier detection
  - analyst workflow replacement

vs

TotalVendorCost
  - license
  - entitlement
  - redistribution
  - API volume
  - engineering
  - audit/compliance
  - lock-in
```

---

## 264. Vendor Trial은 Shadow Source로 시작한다

```text
LICENSED_SHADOW
 → limited universe
 → no user redisplay unless entitled
 → parallel features
 → incremental evaluation
 → legal/rights confirmation
 → product gate
```

비싼 source를 붙이고 나서 “좋아 보인다”로 끝내지 않는다.

### 평가

- unique facts/event discovery rate
- timestamp lead/lag
- match rate vs official
- consensus coverage
- false precision rate
- recommendation rank delta
- selected-vs-rejected regret delta
- user engagement가 아니라 decision-information gain
- cost per useful unique artifact

---

# Part LII. Source Rollout Roadmap

## 265. P0 — 현재 source inventory부터 측정한다

구현 시작 전에 실제 현재 connector/cron/source_contract를 전수 추출한다.

```text
source_id
connector
production caller
schedule
last_success
records/day
object families produced
accepted evidence produced
coverage contribution
PIT class
rights status
cost
```

**문서에 있다고 현재 source로 계산하지 않는다. 실제 production caller가 있어야 한다.**

완료 조건:

- active source 100%가 production caller를 가짐
- active source 100%가 Source Contract V2 mapping
- rights unknown source가 user-facing accepted evidence를 생성하지 않음
- PIT class 미지정 0

---

## 266. P1 — 무료/공식 S0 확장

순서 추천:

1. Company Official Web Intelligence Crawler
2. 금융위원회 기업기본/공시/주식발행 API
3. GLEIF
4. Federal Register + Regulations.gov + 국가법령 Open API
5. OFAC/BIS
6. KOSIS 확대 + BLS/BEA/Treasury + IMF/ECB/Eurostat 필요한 series
7. UN Comtrade + OECD ICIO
8. FINRA OTC/short/short interest 보강
9. USAspending/SAM.gov
10. crypto raw-chain canonical adapter 강화

이 단계는 **상용 vendor 없이도 현재 월드모델의 구조적 coverage를 크게 높일 수 있다.**

---

## 267. P2 — Domain S0 확장

제품에서 실제로 깊게 지원할 sector부터 선택한다.

```text
Semiconductor
  → patents + export controls + trade + product/IR crawl

Bank/Financial
  → 금융회사 공시/경영지표 + rates + funding/credit

Bio
  → ClinicalTrials + openFDA + patent/regulatory

Energy/Resources
  → EIA + weather/disaster + facility/trade

Crypto
  → raw chain + exchange + governance + code/security
```

Domain Adapter가 없는 sector의 source를 무작정 추가하지 않는다.

---

## 268. P3 — Expectation / Options Commercial Trial

최우선 유료 실험 후보:

### Trial A — Consensus

비교:

```text
guidance + our model
vs
commercial consensus
```

평가:

- earnings surprise 설명
- estimate revision theme
- cross-sectional recommendation
- industry ranking

### Trial B — Options

무료 OCC/Cboe summary와 상용 detailed option surface를 비교한다.

평가:

- priced-in
- expected move
- tail risk
- crowding/liquidity

증분 가치가 확인되지 않으면 구매하지 않는다.

---

## 269. P4 — Alternative Data는 Evidence Gap Driven으로만

예:

```text
반도체 capacity 가동률 coverage 부족
 → satellite/power/facility alt-data trial

SaaS customer adoption coverage 부족
 → web/app/developer usage trial

shipping disruption coverage 부족
 → AIS/vendor trial
```

source부터 사고 문제를 나중에 찾지 않는다.

---

# Part LIII. Source Quality Gates

## 270. Source Onboarding Gate

새 source는 다음을 모두 만족해야 `ACTIVE`가 된다.

- [ ] owner 명확
- [ ] official/vendor identity 확인
- [ ] Source Contract V2 작성
- [ ] rights review
- [ ] PIT class
- [ ] source independence group
- [ ] historical backfill policy
- [ ] schema fixture
- [ ] null/type/primary-key contract
- [ ] entity resolution fixture
- [ ] timestamp fixture
- [ ] retry/idempotency
- [ ] rate-limit behavior
- [ ] raw capture
- [ ] parser sandbox where needed
- [ ] coverage contribution 정의
- [ ] monitoring/SLO
- [ ] fallback/degradation behavior
- [ ] user-facing attribution policy

---

## 271. Machine Gates 추가

### Acquisition gates

```text
active source without rights_snapshot = 0
active source without PIT class = 0
active source without production caller = 0
raw artifact without content hash = 0
accepted fact from RIGHTS_DENIED artifact = 0
commercial surface using NON_COMMERCIAL_ONLY field = 0
```

### Temporal gates

```text
source published_at > known_at = impossible unless explicit corrected semantics
latest-only data used as historical vintage = 0
COT report date used as release/actionable time = 0
company page current revision backfilled into past snapshot = 0
```

### Independence gates

```text
syndicated copies counted as independent = 0
aggregator + original dataset counted as independent without lineage check = 0
internal report cited as external evidence = 0
```

### Crawl gates

```text
robots/contract disallow but crawler fetches = 0
private network redirect reached = 0
oversized/archive bomb parsed = 0
untrusted webpage instruction executed by agent = 0
```

### Coverage gates

```text
KNOWN_ABSENT without completed source bundle = 0
FULL_ANALYSIS asset with required family coverage missing = 0
recommendation requiring consensus when expectation coverage=none = 0
```

---

## 272. Source SLO는 `job success`보다 의미 있는 결과를 본다

예:

```text
SEC collector success = true
하지만 new filings 0 for 12h during market day
 → semantic anomaly

IR crawler success = true
하지만 monitored company 40% sitemap 404
 → coverage degradation

FINRA API 200
하지만 record timestamp stale 4 days
 → freshness breach
```

Source SLO:

- expected arrival count interval
- latest source timestamp lag
- parse success
- entity link rate
- accepted output yield
- revision detection
- duplicate rate
- coverage delta

---

# Part LIV. Source Expansion Red-Team

## 273. 실패 시나리오 A — 뉴스 source를 20개 추가했는데 아무것도 좋아지지 않음

원인:

- 동일 wire syndication
- headline duplication
- independent source 증가 없음

판정:

`document_count`가 아니라 `unique assertion/event/information_gain`로 source ROI를 평가한다.

---

## 274. 실패 시나리오 B — 유료 consensus를 붙였는데 history가 current snapshot으로 덮임

결과:

- backtest에서 revision leakage
- 당시 consensus가 아닌 최신 수정 consensus 사용

대응:

- vendor가 historical vintages/revisions를 제공하는지 계약 전 확인
- 없으면 ingestion 시점부터 PIT_C
- historical recommendation evaluation에 소급 사용 금지

---

## 275. 실패 시나리오 C — 회사 홈페이지 크롤러가 페이지 변경을 호재로 오인

예:

- careers 페이지 100개 공고 추가
- 실제 원인은 ATS 시스템 migration/중복

대응:

```text
web change
 → observation
 → semantic candidate
 → cross-source/context
 → event/exposure
```

직접 fact→forecast jump 금지.

---

## 276. 실패 시나리오 D — 정부계약 ceiling을 매출로 계산

대응:

- solicitation
- award ceiling
- obligated amount
- modification
- realized revenue

모두 다른 object/metric concept.

---

## 277. 실패 시나리오 E — FAERS 신고건수 급증을 약물 부작용률 증가로 단정

FAERS에는 reporting bias와 denominator 부재가 있다.

대응:

- raw report count는 signal
- incidence/causality fact로 승격 금지
- label/regulatory/clinical evidence와 별도 결합

---

## 278. 실패 시나리오 F — raw chain과 aggregator 수치가 다름

대응:

```text
Raw chain derivation
Vendor A definition
Vendor B definition
```

을 각각 `Metric Definition`에 결속한다.

예: TVL 정의가 다르면 평균내지 않는다.

---

## 279. 실패 시나리오 G — API 약관이 바뀌었는데 계속 재표시

대응:

- rights document hash
- review date
- periodic terms monitor
- material terms change → source `RIGHTS_REVIEW`
- affected user surface fail-closed/limited

---

## 280. 실패 시나리오 H — source outage 때문에 분석 전체가 중단

대응:

Source family별 degradation policy:

```text
company filings unavailable
 → new fact promotion stop
 → old current state + STALE flag

options vendor unavailable
 → priced-in component unavailable
 → company truth/report remains live

news feed unavailable
 → discovery degraded
 → official filing/event pipeline remains live
```

Fault Containment 원칙을 Source Plane에 적용한다.

---

# Part LV. Master Design Freeze Decision

## 281. 5차 이후 설계 충분성 평가

### Architecture Constitution

**충분함.**

이미 다음 축이 정본화되어 있다.

- provenance/PIT
- fact/event/world state
- economic exposure/transmission
- expectation/surprise
- valuation/priced-in
- theme/narrative
- recommendation/personalization
- outcome/calibration
- semantic/safety kernel
- domain adapters
- source acquisition/coverage

### 남은 문제

이제 큰 conceptual section을 계속 추가하는 것은 오히려 architecture inflation 위험이 높다.

앞으로의 발견은 원칙적으로 다음 중 하나로 처리한다.

```text
existing canonical family field
existing contract extension
Domain Adapter
Source Contract
Analysis Protocol
Golden Fixture
```

새 `Part`나 새 canonical family는 **현재 구현 fixture에서 실제로 표현 불가능한 반례가 발견될 때만** 추가한다.

---

## 282. 5차 이후 Source 우선순위 최종 요약

### 즉시 높은 가치 — 무료/공식 중심

```text
1. Company Official Web Intelligence Crawler
2. 금융위원회 기업기본/공시/주식발행
3. GLEIF Level 1/2
4. Federal Register / Regulations.gov / 국가법령
5. OFAC / BIS / EU law where coverage needed
6. FRED/ALFRED + BLS/BEA/Treasury + ECOS/KOSIS 확장
7. UN Comtrade / OECD ICIO
8. FINRA OTC/short/short interest
9. USAspending / SAM.gov
10. Domain pack: ClinicalTrials/openFDA/EIA/USPTO
11. major crypto raw-chain canonical ingestion
```

### 돈을 쓸 가치가 클 가능성이 높은 것

```text
1. Analyst consensus / industry KPI estimates
2. Detailed options IV/Greeks/trade data
3. Licensed realtime news/wire
4. Firm-level supply-chain/shipment
5. Credit/CDS
```

### 나중에 evidence-gap 기반

```text
satellite
AIS
web/app traffic
card spending
search/social
job aggregators
other alternative data
```

---

## 283. 이제 Master Design에 더 넣지 말고 분리할 Source 문서

Master Design은 여기서 source strategy의 constitution만 보존한다.

다음 구현 산출물은 별도 파일로 분리한다.

### `source-catalog-v1.md`

실제 source 전수 inventory:

```text
source
endpoint
access
quota
rights
PIT class
coverage
cadence
cost
current status
connector owner
```

### `company-web-crawler-contract.md`

- robots/sitemap/RSS
- fetch/cache/diff
- PDF/IR/media
- security
- rights
- fixtures

### `source-rights-matrix.md`

user-facing redisplay와 internal analytics 권리를 분리한다.

### `source-coverage-matrix.md`

universe × domain × object family × required source bundle.

### `paid-data-trial-plan.md`

consensus/options/news/supply-chain vendor trial을 ROI로 판단한다.

이후 Source Catalog는 **운영 문서**이므로 Master Design보다 더 자주 업데이트할 수 있다.

---

## 284. 5차 Source Expansion 종료 판정

이 패스로 다음 질문에 답할 수 있게 되었다.

> “더 많은 API와 크롤링을 붙일 것인가?”

답:

> **그렇다. 다만 source 수를 늘리는 것이 아니라, 현재 월드모델이 답하지 못하는 중요한 질문의 coverage를 높이는 source만 우선순위에 따라 추가한다.**

그리고 다음 질문:

> “정보가 많아지면 자동으로 분석 품질이 좋아지는가?”

답:

> **아니다. Source Independence, PIT, Metric Definition, Rights, Coverage, Information Gain을 통과한 정보만 분석 능력의 실질적인 증가로 계산한다.**

따라서 이제 Master Design의 conceptual expansion은 기본적으로 동결하고,
**Source Catalog + Canonical Kernel Contract + 첫 Semiconductor Vertical 구현 명세**로 내려가는 것이 정본 다음 단계다.

---

# Part LVI. 5차 검증에 사용한 2026-08-07 Source Anchors

이 목록은 vendor lock-in 계약이 아니라 **2026-08-07에 실제 이용 가능성이 확인된 source family의 anchor**다. 실제 구현 시 약관·가격·quota·endpoint를 다시 확인한다.

## 미국/글로벌 공시·시장

- SEC EDGAR APIs — https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- SEC data APIs — https://data.sec.gov/
- FINRA Developer Center — https://developer.finra.org/docs
- FINRA Short Sale Volume — https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data
- OCC Open Interest — https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/open-interest
- Cboe Historical Options — https://www.cboe.com/us/options/market_statistics/historical_data/
- CFTC COT — https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm

## 한국

- OpenDART — https://opendart.fss.or.kr/
- KRX Data Marketplace — https://data.krx.co.kr/
- 금융위원회 기업기본정보 — https://www.data.go.kr/data/15043184/openapi.do
- 금융위원회 공시정보 — https://www.data.go.kr/data/15059649/openapi.do
- 금융위원회 주식발행정보 — https://www.data.go.kr/data/15043423/openapi.do
- KOSIS — https://kosis.kr/
- ECOS — https://ecos.bok.or.kr/

## 법·정책·제재

- Federal Register API — https://www.federalregister.gov/developers/documentation/api/v1
- Regulations.gov API — https://open.gsa.gov/api/regulationsgov/
- OFAC Sanctions List Service — https://ofac.treasury.gov/sanctions-list-service
- BIS — https://www.bis.gov/
- 국가법령정보 공동활용 — https://open.law.go.kr/LSO/openApi/guideList.do
- EUR-Lex Webservice — https://eur-lex.europa.eu/content/help/data-reuse/webservice.html

## 거시

- FRED/ALFRED — https://fred.stlouisfed.org/docs/api/fred/
- BLS API — https://www.bls.gov/developers/home.htm
- BEA API — https://apps.bea.gov/api/signup/
- U.S. Fiscal Data API — https://fiscaldata.treasury.gov/api-documentation/
- IMF API — https://data.imf.org/en/Resource-Pages/IMF-API
- ECB Data Portal API — https://data.ecb.europa.eu/help/api/overview
- Eurostat API — https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access
- World Bank API — https://api.worldbank.org/

## 법인·무역·정부수요

- GLEIF API — https://www.gleif.org/en/lei-data/gleif-api
- UN Comtrade — https://comtradeapi.un.org/
- OECD ICIO — https://www.oecd.org/en/data/datasets/inter-country-input-output-tables.html
- USAspending API — https://api.usaspending.gov/
- SAM.gov Opportunities API — https://open.gsa.gov/api/get-opportunities-public-api/

## Domain/Physical

- ClinicalTrials.gov API — https://clinicaltrials.gov/data-api/api
- openFDA — https://open.fda.gov/apis/drug/
- EIA Open Data — https://www.eia.gov/opendata/
- USPTO Open Data Portal — https://data.uspto.gov/
- USGS Earthquake API — https://earthquake.usgs.gov/fdsnws/event/1/
- NASA FIRMS — https://firms.modaps.eosdis.nasa.gov/api/
- NOAA NCEI — https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation

## Crypto/Software

- Ethereum JSON-RPC — https://ethereum.org/developers/docs/apis/json-rpc/
- Solana RPC docs — https://solana.com/docs/rpc
- Coin Metrics API — https://docs.coinmetrics.io/api/v4/
- CoinGecko API — https://docs.coingecko.com/
- GitHub REST API — https://docs.github.com/en/rest

## Commercial expectation anchors

- FactSet Estimates API — https://developer.factset.com/api-catalog/factset-estimates-api
- LSEG Estimates API — https://developers.lseg.com/en/api-catalog/refinitiv-data-platform/estimates-API
- S&P Capital IQ Estimates — https://www.spglobal.com/market-intelligence/en/solutions/capital-iq-estimates

---

