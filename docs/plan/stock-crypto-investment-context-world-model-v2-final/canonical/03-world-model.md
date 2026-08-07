# 03. Identity, World-State & Economic Claim Model

**Owner:** World Model  
**Depends on:** `02-canonical-kernel.md`  
**Produces:** entity/event/relation/economic-claim/world-state  
**Consumed by:** domain intelligence, exposure, theme, recommendation

## 1. Identity

주요 entity class:

- Company, LegalEntity, Subsidiary, JV, Government, Regulator, Person.
- Stock/Security/ShareClass/ADR/Bond/ETF/Index/Future/Option.
- Product/ProductFamily/Technology/Material/Component/Service.
- Facility/Factory/Mine/Port/Route/PowerPlant/DataCenter.
- Industry/ValueChainStage/Theme/Geography/Jurisdiction.
- Blockchain/L2/Protocol/SmartContract/Token/Stablecoin/Bridge/Oracle/Validator/Exchange/WalletCluster.

`REQ-ID-001` Company와 tradable Security는 다른 entity다.  
`REQ-ID-002` identifier는 namespace와 valid interval을 가진다.  
`REQ-ID-003` ticker reuse, rename, merger, spin-off를 identity merge로 오인하지 않는다.

## 2. Economic Claim

투자 판단의 최종 대상은 회사가 아니라 **경제적 권리**다.

Economic claim은 최소 다음을 표현한다.

- claim holder.
- issuer/underlying economic entity.
- seniority/right type.
- voting/dividend/cash-flow rights.
- conversion/redemption/optionality.
- dilution/emission mechanics.
- listing/venue/currency.
- effective dates.

보통주·우선주·ADR·전환증권·토큰은 회사 전망을 공유해도 claim-level valuation이 다를 수 있다.

## 3. Event & Reified World State

중요 사건/관계는 binary edge 하나가 아니라 reified object로 저장한다.

예: Contract

```text
Contract
  parties + roles
  product/service
  amount/currency/ceiling/obligated amount
  valid/effective dates
  conditions/termination
  geography
  materiality
  status
  evidence
```

예: Regulation

```text
issuer/regulator
legal status
announced/effective/stayed/repealed dates
target product/entity/geography
jurisdiction
exceptions/exemptions
```

Event state는 rumored/proposed/announced/enacted/effective/stayed/repealed/completed/cancelled 등을 domain ontology로 관리한다.

## 4. Structural Relation Ledger

기존 append-only `relation_identity/revision/evidence`를 구조 관계 정본으로 유지한다.

- accepted relation은 predicate policy + revision state + eligible evidence를 모두 통과.
- association/similarity/ETF/common-owner와 economic exposure를 구분.
- candidate graph ML edge는 accepted relation으로 자동 승격하지 않는다.

`REQ-WORLD-010` recommendation eligibility는 관계 존재 여부가 아니라 economic materiality/exposure policy를 별도로 통과해야 한다.

## 5. Geographic Roles

하나의 위치 필드로 축약하지 않는다.

```text
source origin
reported from
mentioned place
occurred at
announced at
issuer jurisdiction
applies to
targets
affected area
origin/destination/route
facility location
entity domicile
listing market
revenue/supply exposure
```

정확하지 않은 위치는 polygon/bbox/uncertainty로 표현하고 forced geocode를 금지한다.

## 6. Corporate Action & Continuity

경제적 claim의 연속성을 별도 bridge로 관리한다.

- split/reverse split.
- spin-off.
- merger/exchange ratio.
- special dividend.
- rights offering.
- ticker/venue/ADR ratio change.
- delisting/relisting.

가격·수익률 series는 adjustment basis를 명시한다.

## 7. Coverage Ledger

`없음`과 `모름`을 구분한다.

```text
COMPLETE
PARTIAL
NOT_COLLECTED
SOURCE_UNAVAILABLE
NOT_APPLICABLE
UNKNOWN
```

UI/API는 관계 없음 응답에도 coverage state를 반환한다.
