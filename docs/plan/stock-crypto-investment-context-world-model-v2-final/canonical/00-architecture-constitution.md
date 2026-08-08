# 00. Architecture Constitution

**Owner:** Architecture Council / Core Platform  
**Depends on:** 없음  
**Produces:** 전 문서에 적용되는 의미·시간·증거·안전 규칙  
**Consumed by:** 모든 서비스, DB migration, 분석 pipeline, UI, 평가

## 1. 제품 헌법

제품의 정체성은 뉴스 수집기, 단순 그래프, 자동 매매 봇, 단일 가격예측 모델이 아니다.

> **일반 투자자부터 전문가까지 주식·코인 투자 판단에 필요한 사실, 기대, 경제적 맥락, 반대근거와 불확실성을 한곳에서 이해·탐색하고, 설명 가능한 투자 후보와 개인화 의사결정 지원으로 연결하는 Evidence-Grounded Investment Context Platform.**

`REQ-ARCH-001` 모든 사용자 노출 분석은 원문·데이터·계산·모델·시점으로 역추적 가능해야 한다.  
`REQ-ARCH-002` Graph는 내부 표현 및 탐색 수단이며 제품의 truth 그 자체가 아니다.  
`REQ-ARCH-003` 자동 주문·자동 리밸런싱은 V2 canonical 범위가 아니다.  
`REQ-ARCH-004` LLM은 truth 승인자나 trade-action 결정자가 될 수 없다.

## 2. 12 Canonical Object Families

새 family를 임의로 추가하지 않는다.

1. **Source & Evidence** — raw artifact, source revision, span/cell, evidence dependency, rights.
2. **Identity & Economic Claim** — entity, legal entity, company, security, token, claim rights, identifiers.
3. **Metric & Observation** — numeric fact, metric definition, comparability, market/on-chain observation.
4. **Event & World State** — event, participant, contract, policy, facility/state transition, schedule.
5. **Relation & Exposure** — structural relation, economic exposure, supply/customer/product/geography dependency.
6. **Expectation & Hypothesis** — consensus/guidance/implied expectation, competing hypothesis, surprise.
7. **Analysis / Estimate / Scenario** — statistical estimate, causal estimate, valuation, forecast, scenario.
8. **Theme / Narrative / Regime** — theme constitution, membership, attention, lifecycle, market regime.
9. **Outcome / Evaluation / Calibration** — realized outcome, counterfactual evaluation, calibration, source/model utility.
10. **Opportunity / Recommendation / Decision** — common asset view, opportunity set, candidate/rejection, private action.
11. **Definition / Policy / Provenance** — ontology, metric definition, model/config/prompt/protocol registry, semantic snapshot.
12. **Operations / Release / Safety** — DAG, SLO, release manifest, safety state, audit, backup/restore.

`REQ-ARCH-010` 12 family는 논리 분류이며 12개의 신규 PostgreSQL schema를 뜻하지 않는다.  
`REQ-ARCH-011` 기존 append-only relation ledger를 복제한 병렬 truth store를 만들지 않는다.  
`REQ-ARCH-012` 새 객체는 기존 family로 표현 불가능하다는 golden fixture가 있어야 추가 가능하다.

## 3. Semantic Type Flow

허용되는 기본 방향:

```text
SOURCE/EVIDENCE
  → ASSERTION/FACT/EVENT/WORLD_STATE
  → RELATION/EXPOSURE
  → ESTIMATE/VALUATION
  → FORECAST/SCENARIO/THESIS
  → COMMON_ASSET_VIEW
  → OPPORTUNITY/RECOMMENDATION
  → PERSONALIZED_DECISION
  → OUTCOME/EVALUATION
```

금지:

```text
Recommendation → Fact evidence
Forecast → historical Fact overwrite
Market reaction after cutoff → ex-ante evidence
User portfolio/action → common market truth
Candidate ML edge → accepted structural relation
Narrative popularity → economic materiality fact
```

`REQ-SEM-001` semantic dependency graph는 cycle-free여야 한다.  
`REQ-SEM-002` 하위 truth class가 상위 추론 결과에 의해 수정되어서는 안 된다.  
`REQ-SEM-003` 사용자 private state는 공통 graph/RAG/training truth로 역류할 수 없다.

## 4. Truth Classes

| class | 의미 | 예 |
|---|---|---|
| SOURCE | 확보한 원문/원시 데이터 | SEC filing bytes |
| ASSERTION | 원문이 주장한 최소 단위 | 회사가 가이던스를 상향했다고 발표 |
| FACT | 정규화·검증된 현실 상태 | FY2026 매출 10B |
| EVENT | 시간에 따라 발생/진행/취소되는 사건 | 규제 시행 |
| RELATION | 지속적 현실 관계 | supplier/customer |
| EXPOSURE | 경제적 민감도/노출 | 중국 매출 28% |
| STATISTICAL_ESTIMATE | 관찰적 추정 | event CAR |
| CAUSAL_ESTIMATE | 식별 가정하의 효과 | DiD effect |
| FORECAST | 미래 분포 | 3개월 EPS distribution |
| HYPOTHESIS | 경제적 설명 가설 | 규제→출하감소→매출감소 |
| NARRATIVE | 시장 참가자의 관심/해석 | AI power bottleneck |
| RECOMMENDATION | 공통 투자 후보 판단 | WATCH candidate |
| PERSONAL_DECISION | 사용자 제약을 반영한 action | REDUCE |

`REQ-SEM-010` truth class는 UI에서 시각적으로 구분해야 한다.

## 5. 시간 헌법

최소 시간축:

- `valid/event time`: 현실에서 성립한 시각.
- `published_at`: source가 발표한 시각.
- `available_at`: 시스템이 합법적으로 접근 가능해진 시각.
- `known_at`: 시스템이 수집·검증하여 알게 된 시각.
- 필요 시 `vintage/revision time`, 시장 session, block height/finality.

`REQ-PIT-001` ex-ante 분석에는 cutoff 이후 artifact를 사용할 수 없다.  
`REQ-PIT-002` backtest는 당시 존재했던 universe, corporate action, delisting, first-release/vintage를 사용한다.  
`REQ-PIT-003` `now()`를 business cutoff로 직접 사용하는 구현은 금지한다.  
`REQ-PIT-004` 모든 중요한 조회는 Temporal Query Kernel을 사용한다.

## 6. Evidence 헌법

`REQ-EVD-001` accepted fact/relation은 자격을 갖춘 evidence가 있어야 한다.  
`REQ-EVD-002` 기사 수가 아니라 independent primary root 수를 신뢰도에 사용한다.  
`REQ-EVD-003` 번역문은 증거 정본이 아니며 원문 anchor를 보존한다.  
`REQ-EVD-004` 숫자는 원표/XBRL/cell/program inputs까지 재실행 가능해야 한다.  
`REQ-EVD-005` 반대근거 검색 여부와 coverage를 보존한다.

## 7. Uncertainty 헌법

증거 신뢰도, 경제적 크기, 시장 반영도, 모델 불확실성, 데이터 coverage는 하나의 confidence로 합치지 않는다.

`REQ-UNC-001` 정보 부족·calibration 실패·모델 충돌·stale 상태는 `INSUFFICIENT_DATA` 또는 제한 모드로 내려가야 한다.  
`REQ-UNC-002` 불확실성을 숨기기 위해 LLM이 자연어 확신을 높일 수 없다.

## 8. Release & Safety 헌법

전역 제품 상태:

```text
NORMAL → CAUTION → INFORMATION_ONLY → HALTED
```

`REQ-SAFE-001` pipeline exit code 성공은 제품 의미 상태의 건강함을 뜻하지 않는다.  
`REQ-SAFE-002` semantic SLO/coverage/freshness/invariant 실패는 safety state를 낮출 수 있다.  
`REQ-SAFE-003` 추천은 safety state가 허용하는 경우에만 발행한다.  
`REQ-REL-001` 동일 사용자 surface의 공통 view/impact/theme/recommendation은 호환되는 semantic snapshot/release manifest를 사용해야 한다.

## 9. Architecture Freeze Rule

새 conceptual feature는 다음 중 하나로만 처리한다.

```text
existing family field
existing contract extension
Domain Adapter
Source Contract
Analysis Protocol
Golden Fixture
```

새 family/major semantic class/API major는 실제 구현 fixture가 표현 불가능함을 증명하고 Architecture RFC를 통과해야 한다.
