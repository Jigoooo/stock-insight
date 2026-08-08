# 07. Personalization, Geo, News & Crypto Product Planes

**Owner:** Product Planes  
**Depends on:** World/Market/Recommendation contracts  
**Produces:** private decision packets, geo projections, event/news packs, crypto-specific projections

## 1. Personalization Plane

공통 view와 개인 action을 물리 분리한다.

Private inputs:

- portfolio snapshot.
- position lots.
- user investment profile.
- horizon/risk/constraints.
- cash/liquidity needs.
- optional position thesis.

Actions:

```text
ADD / HOLD / REDUCE / EXIT / WATCH / NO_ACTION / INSUFFICIENT_DATA
```

원칙:

- cost basis는 미래 expected return signal로 사용하지 않는다.
- transaction/tax/turnover/liquidity를 decision에 포함.
- no-trade zone/hysteresis/cooldown/materiality gate.
- LLM은 structured action을 설명만 하며 수정하지 않는다.
- private data는 common graph/RAG/model truth로 역류하지 않는다.

초기 구현은 rule + constraints + transparent risk로 시작하고 convex optimizer/Black-Litterman/CVaR는 충분한 validation 후 단계 도입한다. RL/offline policy는 DEFER/experimental.

## 2. Geo Plane

PostGIS geometry가 정본이고 H3/MVT는 projection이다.

- event location role 분리.
- company geo exposure는 revenue/asset/production/supply/customer/employee/capex/financing/regulatory를 구분.
- distance만으로 economic impact를 만들지 않는다.
- map marker는 exactness/uncertainty를 표현.
- event coreference로 중복 marker 방지.

## 3. News/Event Information Gain

기사 자체보다 canonical event와 **새로운 정보**를 중심으로 보여준다.

```text
first report
official confirmation
new numeric detail
exception/condition
company response
correction/contradiction
market reaction
estimate revision
```

source duplication은 effective independent roots로 조정한다.

## 4. Active Research / Evidence Gap

시스템은 중요한 unknown을 research task로 생성할 수 있다.

예:

- 핵심 국가 매출 비중 미확인.
- supplier concentration 불명.
- KPI 정의 drift.
- catalyst outcome 미확인.

Research priority는 expected information gain × decision materiality × source availability로 잡고, LLM은 조사 계획을 만들 수 있으나 truth 승인권은 없다.

## 5. Crypto Plane

Crypto는 공통 identity/provenance/kernel을 사용하지만 별도 domain semantics를 갖는다.

Raw truth stack:

```text
RPC/archive node / block / tx / logs
→ canonicality(finalized/provisional/orphaned)
→ protocol decoder
→ protocol world state
→ token economic claim/value capture
→ market/on-chain analytics
```

필수:

- protocol/token separation.
- smart-contract version/upgrade.
- emission/unlock/burn/supply.
- bridge/oracle/custody/exchange dependency.
- collateral/liquidation contagion.
- finality/reorg-aware PIT.
- aggregator metric definition 비교.

Raw chain과 vendor 수치가 다르면 평균내지 않고 정의·derivation을 분리한다.
