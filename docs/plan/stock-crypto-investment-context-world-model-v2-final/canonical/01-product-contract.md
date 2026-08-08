# 01. Product & User Surface Contract

**Owner:** Product Intelligence  
**Depends on:** `00-architecture-constitution.md`  
**Produces:** Market Home, Asset Deep Dive, Theme, Discovery, Research, Personalization 표면 계약  
**Consumed by:** Read API, report/content compiler, web/mobile UI

## 1. 사용자 문제

플랫폼은 사용자가 뉴스·공시·IR·재무·시세·거시·온체인·산업·정책·관련 종목을 따로 찾는 비용을 줄인다. 단순 집계보다 **동일 사건과 경제적 맥락으로 결합**하는 것이 핵심이다.

`REQ-PROD-001` 동일 사건의 재배포 기사들은 하나의 canonical event/timeline으로 묶는다.  
`REQ-PROD-002` 초보/표준/연구 모드는 분석 결과가 아니라 설명 깊이만 바꾼다.  
`REQ-PROD-003` 사용자가 처음 보는 종목도 5분 이내에 “무엇을 하는 회사/프로토콜인지, 업계 위치, 핵심 KPI, 최근 사건, 리스크, 대안”을 파악할 수 있어야 한다.

## 2. Market Home

필수 섹션:

- 오늘 시장을 움직인 canonical events.
- 금리·FX·원자재·정책 등 macro/factor state.
- 강세/초기형성/과열/약화/위험 theme.
- 새로운 information gain이 큰 사건.
- unexplained move radar.
- 예정 catalyst/calendar.
- 공통 opportunity 후보와 **왜 지금 볼 가치가 있는지**.

`REQ-PROD-010` 홈 화면은 기사량·mention 수가 아니라 information gain과 economic materiality로 배치한다.  
`REQ-PROD-011` 동일 root 정보의 반복 노출을 제한한다.

## 3. Asset Deep Dive

Above the fold:

1. 회사/프로토콜 한 줄 설명.
2. investable claim과 ticker/token.
3. sector/theme/value-chain 위치.
4. peer-relative position.
5. 최근 핵심 event와 expectation surprise.
6. 핵심 business drivers/KPI.
7. valuation와 market-implied expectations.
8. current thesis와 counter-thesis.
9. catalyst/risk/invalidation.
10. coverage/freshness/uncertainty.

하위 탭/섹션:

- 회사·법인·증권·토큰 정체성.
- 제품/segment/geography/customer/supplier.
- 재무 bridge와 unit economics.
- peer 비교와 rankable/not-rankable 상태.
- event timeline.
- theme/narrative/regime.
- exposure/impact paths.
- market reaction/positioning.
- valuation/scenario.
- source/resource links: 공식 홈페이지, IR, SEC/DART, docs, explorer 등.
- provenance/derivation research drawer.

`REQ-PROD-020` “업계 몇 등”은 단일 임의 점수가 아니라 차원별 rank와 정의·coverage를 보여준다.  
`REQ-PROD-021` 비교 불가능한 KPI는 `NOT_COMPARABLE/INSUFFICIENT_COVERAGE`로 표시한다.

## 4. Theme Surface

사용자에게 보여줄 상태:

```text
FORMING / EMERGING / ACCELERATING / MAINSTREAM / CROWDED / WEAKENING / BREAKING
```

필수 정보:

- theme definition/constitution과 변경 이력.
- drivers와 catalysts.
- 대표/핵심/간접 members와 membership 이유.
- 가격/실적/수급/attention confirmation을 분리.
- crowdedness/valuation/risk.
- forward outlook와 invalidation.
- hindsight-safe historical membership.

## 5. Discovery / Curation

관련 종목은 이유를 반드시 가진다.

- competitor/peer.
- supplier/customer/value-chain.
- substitute/complement.
- same theme.
- common factor exposure.
- event beneficiary/victim.
- ETF/ownership association은 약한 신호로 별도 표시.

`REQ-PROD-030` embedding proximity만으로 “관련 기업” 또는 economic exposure라고 표현하지 않는다.

## 6. Typed Research Query

자연어 질문은 최소 다음 intent로 컴파일한다.

```text
ASSET_REVIEW
COMPARE
DISCOVER
WHY_MOVE
THEME_REVIEW
SCREEN
EVENT_IMPACT
PORTFOLIO_IMPACT
```

LLM은 자유롭게 종목을 찍는 대신 structured query plan을 만들고 월드모델에서 검증된 결과를 조립한다.

## 7. Product Success Metrics

- source/evidence support rate.
- unknown/coverage honesty.
- event dedupe quality.
- asset deep-dive usefulness.
- recommendation counterfactual value.
- theme membership stability/forward validity.
- source-to-insight latency.
- stale/silent-failure detection.
- user research time saved.
