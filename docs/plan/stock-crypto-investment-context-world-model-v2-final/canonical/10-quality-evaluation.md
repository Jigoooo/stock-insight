# 10. Evaluation, Adversarial Gates & Golden Fixtures

**Owner:** Quality / Model Risk / Architecture  
**Depends on:** 모든 canonical contracts  
**Produces:** release gates, gold sets, destructive scenarios, calibration evidence

## 1. Layered Evaluation

### Acquisition
- success/latency/gap/schema drift.
- expected vs observed artifacts.
- independent information gain.

### Entity Resolution
- precision/recall/abstention.
- brand/legal entity/parent/share-class errors.

### Assertion/Event
- span/polarity/modality/attribution.
- time/status.
- numeric/unit/period accuracy.

### Evidence/Derivation
- entailment precision.
- contradiction recall.
- independent root counting.
- calculation replay.

### Graph/Exposure
- analyst precision@K/nDCG.
- typed path relevance.
- superhub contamination.
- economic materiality.

### Analytics
- event overlap.
- placebo/pre-trend/balance.
- CI/interval coverage.
- regime stability.
- forecast calibration/log loss/pinball/coverage.

### Recommendation
- PIT walk-forward.
- selected and rejected candidates.
- simple baselines.
- transaction/liquidity/capacity.
- abstention precision.
- coverage/popularity bias.

## 2. Anti-Shortcut Tests

- company/asset names masked.
- time shuffled → 성능이 부당하게 유지되면 실패.
- duplicated evidence → confidence 불변.
- unit conversion → normalized output 불변.
- ticker rename → economic conclusion 불변.
- corporate-action adjusted equivalent → return/evaluation consistency.
- paraphrased narrative → fact result 불변.
- private portfolio swap → common asset view 불변.

## 3. Golden Fixture Families

최소 destructive fixtures:

1. after-hours earnings + later articles — ex-post leakage 차단.
2. spin-off + special dividend + ticker change.
3. regularly disclosed KPI disappears.
4. meme/short squeeze with weak fundamentals.
5. hindsight-created theme.
6. fake/poisoned news syndicated across outlets.
7. illiquid micro-cap ranks #1.
8. model council with shared genealogy.
9. stablecoin depeg + exchange outage + uncertain chain state.
10. economically equivalent claims diverge in price.
11. company website DOM migration mistaken for event.
12. paid consensus history overwritten by latest snapshot.
13. government contract ceiling mistaken for revenue.
14. FAERS report count mistaken for incidence.
15. raw-chain vs aggregator metric definition conflict.
16. source outage causing partial degradation only.

## 4. KEEP / MODIFY / MERGE / DELETE / DEFER

Implementation review는 모든 새 개념에 다음 라벨을 사용한다.

- KEEP: current contract 유지.
- MODIFY: invariant 강화.
- MERGE: 기존 family로 통합.
- DELETE: false abstraction/low value.
- DEFER: product proof 이후.

## 5. Human Audit

완전 자동화를 목표로 해도 stratified random audit, high-risk predicate/event audit, analyst disagreement 기록, false-positive active-learning queue는 유지한다.
