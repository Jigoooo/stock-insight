# 04. Domain Intelligence, KPI & Business Driver Contract

**Owner:** Domain Intelligence  
**Depends on:** `02-canonical-kernel.md`, `03-world-model.md`  
**Produces:** sector playbook, domain adapter, business-driver graph, financial bridge  
**Consumed by:** valuation, thesis, recommendation, deep dive

## 1. Sector Playbook

모든 산업을 동일 KPI로 분석하지 않는다. Playbook은 versioned 정의다.

Playbook 내용:

- 핵심 value chain.
- 경제적 unit of analysis.
- 핵심 KPI/leading/lagging indicators.
- 재무 bridge.
- common catalysts/risks.
- valuation methods.
- peer dimensions.
- source coverage requirements.

`REQ-DOM-001` LLM이 매 실행마다 “이 업종에서 무엇이 중요한가”를 새로 발명하지 않는다.

## 2. Domain Adapter Contract

Adapter는 canonical family를 확장하되 별도 truth universe를 만들지 않는다.

필수 interface:

```text
identity extensions
metric concepts + comparability
world-state/event types
business-driver transforms
valuation methods
peer dimensions
acceptance fixtures
source pack
```

## 3. Company Economic Model

일반 관계가 아니라 **회사가 돈을 버는 방정식**을 모델링한다.

```text
Demand/Volume
× Price/ASP
× Mix
→ Revenue
- Variable/Input Cost
- Fixed Cost
→ Margin/EBIT
- Working Capital/CAPEX/Tax/Interest
→ FCF / Capital / Claim Value
```

각 driver는 source/definition/horizon/sensitivity/lag/regime/uncertainty를 가진다.

## 4. Financial Statement Bridge

Event/driver가 재무 항목으로 어떻게 연결되는지 typed bridge를 둔다.

예:

```text
commodity price ↑ → input cost ↑ → gross margin ↓
FX ↑ → transaction/translation exposure → revenue/margin/OCI
regulation → allowed volume ↓ → revenue/backlog/inventory
rate ↑ → funding cost/repricing → NIM/capital/credit
```

## 5. Domain-specific minimums

### Semiconductor / AI Infrastructure

- product generation/node/interface.
- design win / qualification.
- capacity/wafer/fab/HBM constraints.
- customer/product concentration.
- backlog/commitment quality.
- technology transition/competitive substitution.

### Banks / Financials

- asset/liability repricing and maturity.
- deposit beta/mix.
- NIM definition.
- credit quality/provisions.
- liquidity/regulatory capital.
- duration/funding/contagion.

### Life Science / Bio

- trial/study/phase/cohort.
- endpoint/design/statistical plan.
- result/adverse event.
- regulatory milestone.
- cash runway/dilution.
- probability-of-success and rNPV as estimate, not fact.

### Resources / Energy

- mine/field/project-level asset.
- reserves/resources/grade/recovery.
- production/cost curve/capex.
- commodity hedge.
- legal ownership vs economic interest.
- NAV/SOTP.

### Crypto

- protocol vs token value capture.
- contract upgrade/version.
- token supply/emission/unlock/burn.
- fee/revenue distribution.
- collateral/bridge/oracle dependency.
- chain finality/reorg/canonicality.

## 6. Definition Drift

segment/KPI definition changes는 별도 revision으로 저장한다. 과거와 정의가 달라졌는데 단순 YoY growth를 계산하는 것을 금지한다.
