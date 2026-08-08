# 05. Market Intelligence: Expectation, Exposure, Valuation, Theme & Outcome

**Owner:** Analytics / Market Intelligence  
**Depends on:** `02`, `03`, `04`  
**Produces:** expectation/surprise, exposure/impact, valuation, thesis/theme/regime, market reaction, outcome/calibration  
**Consumed by:** common asset view, recommendation, reports

## 1. Expectation Ledger

기대는 최소 다음을 구분한다.

- analyst consensus.
- company guidance.
- market-implied expectation.
- prior model expectation.
- policy/futures expectation.
- scheduled catalyst expectation.

Expectation은 as-of/horizon/target/definition/distribution/dispersion/source/vintage를 가진다.

Surprise는 `Actual - Expected`뿐 아니라 historical percentile, dispersion, direction, materiality를 저장한다.

`REQ-EXP-001` actual이 좋아도 expectation 대비 나쁘면 positive fact와 negative surprise를 동시에 표현할 수 있어야 한다.

## 2. Priced-In State

priced-in은 단일 score가 아니다.

축:

- prior price move.
- analyst estimate revision.
- implied vol/skew/term structure.
- positioning/flows/short interest.
- valuation/multiple expansion.
- narrative maturity/crowding.

출력은 `LOW/MEDIUM/HIGH/AMBIGUOUS/UNAVAILABLE`와 evidence를 기본으로 한다.

## 3. Exposure & Transmission

표준 사슬:

```text
Event/State Change
→ Primitive Shock
→ Transmission Channel
→ Entity/Segment/Product/Geo Exposure
→ Business Driver
→ Financial Outcome
→ Valuation/Credit/Flow
→ Market Outcome
```

채널: demand/revenue, input cost, capacity, logistics, FX, rates/credit, regulation, tax/subsidy, sanctions/trade, competition/substitution, technology/IP, ownership, flow, attention, physical/climate, cyber/operations, accounting.

Exposure는 sign/sensitivity/unit/horizon/lag/regime/threshold/substitutability/materiality/uncertainty를 가진다.

`REQ-IMP-001` evidence confidence와 economic magnitude를 곱해 하나의 impact score로 축약하지 않는다.

## 4. Path Aggregation & Double Counting

Impact path는 설명 단위이고 effect calculation은 factor/scenario DAG 단위다. 동일 primitive shock를 공유하는 여러 path를 단순 합산하지 않는다.

## 5. Analysis Method Router

질문별 방법을 분리한다.

- event response → Event Study.
- dynamic horizon response → Local Projections.
- treated group policy → DiD / Synthetic Control.
- high-dimensional controls → DML.
- supply shock → production network / IO / Leontief + firm graph.
- hidden lag candidates → PCMCI+ candidate only.
- graph candidate ranking → PathSim/NBFNet/HGT/TGN candidate only.
- forecast → calibrated probabilistic model + conformal where valid.

모든 estimate는 analysis protocol/estimand/assumptions/sample/diagnostics/CI/version을 가진다.

## 6. Valuation & Market-Implied Fundamentals

method registry 예:

- DCF.
- SOTP/NAV.
- PE/EV-EBITDA/FCF yield.
- PB/ROE banking.
- rNPV biotech.
- commodity asset NAV.
- protocol/token value-capture model.

Reverse valuation은 현재 가격이 요구하는 growth/margin/ROE/cost-of-capital/adoption 등을 추정하되 false precision을 피하고 scenario/range로 표시한다.

## 7. Thesis / Competing Hypotheses

한 종목의 “원인”을 하나로 고정하지 않는다.

Thesis는 horizon별로:

```text
supporting facts/estimates
counter evidence
expected catalysts
invalidation conditions
valuation state
coverage/uncertainty
```

Competing hypothesis는 각 가설이 무엇을 설명하고 무엇을 반증할지 함께 저장한다.

## 8. Theme / Narrative / Regime

Theme definition과 historical membership은 versioned constitution으로 고정한다. 사후 상승 종목을 과거 구성으로 소급 삽입하지 않는다.

Theme strength는 다음 축을 분리한다.

- market confirmation.
- fundamental confirmation.
- narrative/attention dynamics.
- catalysts.
- crowding/valuation risk.
- regime fit.

## 9. Reverse Discovery

market move가 먼저인 경우:

```text
price/volume/options/on-chain anomaly
→ known event search
→ entity/theme/factor exposure search
→ competing hypotheses
→ EXPLAINED / PARTIAL / UNEXPLAINED
```

`REQ-MKT-001` 원인을 찾지 못한 움직임에 억지 causal story를 생성하지 않는다.

## 10. Reflexivity

시장 상태가 기업/프로토콜 행동을 다시 바꾸는 루프를 모델링할 수 있다.

```text
price ↑ → cost of capital ↓ → financing/CAPEX/M&A → future fundamentals
attention ↑ → token/stock liquidity/financing → ecosystem activity
```

Reflexivity는 hypothesis/estimate이며 만능 설명으로 승격하지 않는다.

## 11. Outcome & Calibration

과거 impact/forecast/recommendation을 실제 outcome에 연결한다.

- +1d/+5d/+20d abnormal return.
- next-quarter revenue/margin/EPS.
- estimate/guidance revisions.
- realized catalyst/result.
- recommendation selected/rejected candidates 모두 평가.

모델/경로/source utility는 PIT walk-forward 결과로 업데이트하되 truth를 수정하지 않는다.
