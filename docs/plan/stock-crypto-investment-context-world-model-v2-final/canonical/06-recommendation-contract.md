# 06. Opportunity, Recommendation & Decision Contract

**Owner:** Recommendation Platform  
**Depends on:** `05-market-intelligence.md`, coverage/safety kernel  
**Produces:** common asset view, opportunity set, discovery, candidate/rejection, recommendation shadow/product  
**Consumed by:** Market Home, Asset Deep Dive, Personalization

## 1. 세 단계 분리

```text
Common Asset View
→ Discovery / Curation / Opportunity Recommendation
→ Personalized Portfolio Action
```

공통 asset view는 모든 사용자에게 같은 사실·시장 분석을 사용한다. Personal action만 user-private 제약을 사용한다.

## 2. Common Asset View

필수 블록:

- identity/economic claim.
- business/sector context.
- comparable financial/economic facts.
- recent events and surprise.
- expectation/priced-in.
- exposure/impact.
- valuation/market-implied state.
- market reaction/tradability.
- multi-horizon thesis/scenario.
- catalysts/risks/counter-evidence.
- coverage/freshness/uncertainty.
- derivation/release manifest IDs.

`REQ-REC-001` Common Asset View는 private user data를 포함하지 않는다.

## 3. Opportunity Set

추천은 절대평가가 아니라 **대안집합에서의 상대 선택**이다.

대안집합은 필요 시:

- same peer/theme.
- related value chain.
- sector/index benchmark.
- cash/risk-free proxy.
- other high-conviction opportunities.

을 포함한다.

## 4. Candidate Generation

candidate source:

- event→affected asset.
- theme/sector strength.
- valuation dislocation.
- expectation surprise.
- improving fundamentals/estimate revisions.
- reverse discovery.
- related asset curation.
- user research query/screener.

candidate가 recommendation eligible이라는 뜻은 아니다.

## 5. Multi-objective Ranking

단일 `score=87.3`를 최종 진실처럼 사용하지 않는다.

최소 축:

- evidence quality/coverage.
- economic materiality.
- expected upside/downside distribution.
- valuation/margin-of-safety.
- catalyst timing.
- market confirmation.
- crowding/priced-in.
- liquidity/tradability.
- uncertainty/model agreement.
- diversification/relevance (개인화 이전 공통 범위에서는 market-level only).

필요한 경우 transparent policy로 aggregate하되 component를 모두 보존한다.

## 6. Coverage-Aware Gate

필수 minimum:

- identity/economic claim.
- financial/economic state.
- market state.
- material event/news coverage.
- expectation coverage가 필요한 claim이면 expectation source.
- counter-evidence search.
- PIT quality.
- rights state.

미달 시 `RESEARCH_CANDIDATE / WATCH / PARTIAL_COVERAGE / INFORMATION_ONLY / INSUFFICIENT_DATA`로 내린다.

## 7. Candidate & Rejection Ledger

모든 run에서 선택/탈락 후보를 고정한다.

```text
candidate
features/inputs as-of
eligibility
rank components
selected/rejected
rejection reasons
exposure state
subsequent outcomes
```

`REQ-REC-020` 추천된 후보만 평가하는 것을 금지한다.

## 8. Audience Capacity / Self-Impact

저유동성, low-float, micro-cap, 얕은 crypto pool은 broad recommendation capacity를 제한한다.

추천 시스템의 사용자 규모가 시장 impact를 만들 수 있는 경우:

- broad push 제한.
- visibility tier 감소.
- slippage/market-impact buffer.
- research-only mode.

## 9. Recommendation Safety

추천 활성 조건:

- product safety state NORMAL/허용된 CAUTION.
- minimum coverage.
- data freshness.
- calibration and baseline gate.
- economic exposure path가 association-only가 아님.
- no material unresolved invariant failure.
- rights/redisplay policy 충족.

NO-GO:

- graph similarity/common-owner/ETF만으로 추천.
- LLM이 빈 데이터 필드를 서술로 보충.
- ex-post information leakage.
- uncalibrated `BUY probability` 단일 숫자.
- market manipulation/poisoning suspicion unresolved.

## 10. Typed Research Query

질문은 structured plan으로 컴파일하고, result envelope는 evidence + uncertainty + coverage를 포함한다. Deep mode도 canonical truth와 Temporal Kernel을 우회할 수 없다.
