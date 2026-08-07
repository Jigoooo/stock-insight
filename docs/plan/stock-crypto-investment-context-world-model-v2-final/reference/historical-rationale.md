# Historical Rationale & Superseded Split Notes

> Status: **REFERENCE / NON-CANONICAL**  
> Frozen from: `stock-crypto-investment-context-world-model-v2-master-design.md`  
> Master SHA-256: `2cb64899fc2e920f5d32c0bbb50e8b2d3aeee87862fd821194a9c586bc13458f`  
> Original sections: §133, §134, §135, §136, §169, §170, §171

> **Precedence rule:** 이 분할 패키지에서는 같은 주제가 충돌할 경우 이 문서의 `5차 → 4차 → 3차 → 2차 → Baseline` 순으로 앞의 계약이 우선한다. `reference/master-design-monolith.md`는 감사·rationale용이며 구현 정본이 아니다.

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


---

## Earlier Split Plan (historical)

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

