# 11. Delivery, Launch Slice, Migration, Cost & Freeze

**Owner:** Architecture + Delivery  
**Depends on:** 모든 canonical docs  
**Produces:** 구현 순서, launch scope, migration strategy, cost/capacity budget, freeze policy

## 1. 구현 Dependency Order

```text
A. Canonical Kernel
  Temporal Query + Information Set + Semantic Type + Derivation

B. Truth Foundation
  Source Revision + Entity/Economic Claim + Comparable Numeric Fact + Event

C. Semiconductor Domain Adapter v1
  Product/Generation/Capacity/Customer/KPI definitions + business driver

D. Market Intelligence Minimum
  Expectation/Surprise + Exposure + Valuation + Outcome

E. Common Asset View
  deterministic structured packet + provenance

F. Recommendation Shadow
  opportunity set + candidate/rejection + coverage gate

G. Product Surface
  Asset Deep Dive + Market Home + Theme/News integration

H. Limited Recommendation
  calibration/capacity/safety gate 통과 후

I. Personalization
  common view와 분리된 private decision support
```

## 2. Launch Slice — MUST

첫 vertical에서 반드시 구현:

- source contracts for SEC/DART/IR/market/macro + company web crawler minimal.
- raw/source revision + PIT quality.
- company/security/economic claim identity.
- comparable numeric fact + definition registry.
- event/assertion/conflict.
- expectation/guidance; consensus는 available하면 shadow.
- semiconductor product/segment/capacity/customer exposure.
- business-driver financial bridge.
- event→shock→exposure→financial impact path.
- basic valuation + market-implied state.
- common asset view.
- asset deep dive.
- outcome ledger.
- semantic/release/safety gates.

## 3. SHADOW

제품에 직접 의사결정을 노출하기 전에 병렬 계산:

- general recommendation ranking.
- paid consensus vendor.
- options deep data.
- causal estimates beyond event study/basic panel.
- theme forward outlook.
- source/model utility learning.

## 4. DEFER

초기 제품 가치가 증명되기 전 canonical implementation을 미룬다.

- HGT/TGN/NBFNet production dependency.
- causal discovery를 제품 causal truth로 사용.
- contextual bandit beyond content ranking.
- offline RL / decision-focused trading policy.
- satellite/remote sensing as general pipeline.
- full 3D globe/Cesium heavy visualization.
- complex multi-period portfolio optimizer.
- 모든 chain의 self-hosted archive node.
- 모든 가능한 4+ hop path/precompute.

## 5. Migration Strategy

기존 as-built의 강한 기반을 유지한다.

KEEP:

- source_revision/raw provenance.
- core.entity/identifiers.
- append-only relation ledger/evidence gates.
- sealed graph snapshots/digests.
- existing content pack/derivation primitives.
- PIT macro vintage.
- read API/BFF DB separation.

ADDITIVE:

- truth class/type metadata.
- information-set/temporal query kernel.
- metric definition/comparability.
- event/world-state/reified contracts.
- exposure/expectation/outcome objects.
- semantic snapshot/release manifest/safety state.

전환 순서:

```text
additive schema
→ shadow write
→ backfill scoped fixtures
→ parity/invariant gate
→ shadow read
→ product read switch
→ old projection retire
```

병렬 `relation_v3` 같은 새 truth store를 만들지 않는다.

## 6. Cost / Capacity Budgets — Initial Defaults

숫자는 초기 구현 guardrail이며 실측 후 변경 가능하다.

### Universe
- 첫 vertical deep universe: **50~100 assets**.
- 전체 market profile은 얕은 basic coverage 허용, deep analysis는 trigger/priority 기반.

### Graph
- UI 기본: 1~3 hop.
- offline: typed meta-path + explicit cost budget; 단순 unrestricted shortest path 금지.
- event affected-assets: top-K + diversity bucket.

### Content/Derivation
- 한 atomic statement는 한 derivation.
- evidence pack은 relevance/diversity budget을 두고 raw document 전체 무제한 투입 금지.
- content pack은 기존 상한/프로젝션 예산을 측정 기반으로 유지하고 silent truncation 금지.

### LLM
- deterministic structured extraction/summary 중심.
- retry budget 제한.
- low-information duplicate documents에 반복 LLM 호출 금지.
- common validated content를 사용자별로 재생성하지 않는다.

### Backfill
- time/entity/source scoped batches.
- latest production pointer와 분리.
- semantic change의 dependency impact 범위만 재계산.

### Storage
- canonical truth 장기 보존.
- 재생성 가능한 derived artifact는 retention/partition/archive 정책 적용.

`REQ-COST-001` 신규 기능은 expected daily compute/storage/cardinality estimate 없이 production gate를 통과하지 못한다.

## 7. Definition of Done — Architecture Freeze

Conceptual architecture는 다음을 만족하면 frozen 상태를 유지한다.

- canonical family 12개로 vertical fixture 표현 가능.
- PIT/information-set leak 0.
- unsupported accepted truth 0.
- core numeric calculation replay 100%.
- recommendation input이 association-only graph에 의존하지 않음.
- selected/rejected recommendation counterfactual 평가 가능.
- source coverage/rights 상태 노출 가능.
- release manifest/safety degradation 작동.
- first semiconductor golden fixture가 source→view→outcome까지 통과.

이후 변경은 “더 좋아 보인다”가 아니라 **실제 구현 반례**를 요구한다.
