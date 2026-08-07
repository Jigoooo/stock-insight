# 02. Canonical Kernel Contract

**Owner:** Core Truth Platform  
**Depends on:** `00-architecture-constitution.md`  
**Produces:** Temporal Query Kernel, Information Set, Derivation DAG, Evidence Independence, Semantic Snapshot, Invariants  
**Consumed by:** 모든 downstream 분석 및 제품

## 1. Analysis Information Set

모든 report/forecast/recommendation/backtest는 `analysis_information_set_id`를 가진다.

필수 필드:

```text
mode = EX_ANTE | LIVE | EX_POST | RETROSPECTIVE
valid_cutoff
source_available_cutoff
system_known_cutoff
market_observation_cutoff
outcome_embargo_until
allowed_information_classes[]
market_calendar
timezone
semantic_snapshot_id
```

`REQ-KERN-001` ex-ante derivation이 cutoff 이후 market outcome/후속 해설을 참조하면 hard fail.  
`REQ-KERN-002` retrospective result는 과거 recommendation record를 overwrite하지 않는다.

## 2. Temporal Query Kernel

business logic은 임의 PIT SQL을 만들지 않는다.

표준 연산:

```text
PIT_SELECT
PIT_JOIN
PIT_UNIVERSE
PIT_PRICE
PIT_EXPECTATION
PIT_ENTITY_STATE
PIT_RELATION
```

query context에 valid/known/revision policy/market calendar/corporate-action basis/semantic snapshot을 전달한다.

`REQ-KERN-010` selected revision IDs와 query trace를 run manifest에 저장한다.

## 3. Immutable Source / Revision

- raw bytes/API response를 content-addressed object로 보존.
- `source_revision`은 append-only.
- fetch header, parser version, content hash, rights contract를 연결.
- source가 history를 제공하지 않으면 우리가 snapshot한 시점부터만 PIT 가능.

PIT quality:

```text
PIT_A_NATIVE_VINTAGE
PIT_B_VERSIONED_ARTIFACT
PIT_C_OUR_ARCHIVE
PIT_D_LATEST_ONLY
PIT_E_UNKNOWN
```

`REQ-KERN-020` PIT_D/E 데이터는 과거 ex-ante 평가의 핵심 입력으로 소급 사용하지 않는다.

## 4. Assertion / Numeric Fact

Assertion은 polarity/modality/attribution/condition/status/source span을 가진다.

Numeric fact는 concept/unit/currency/scale/period/dimensions/restatement/source cell/XBRL locator/known_at을 가진다.

`REQ-KERN-030` “계약했다 / 계약하지 않았다 / 검토 중 / 보도됐으나 부인”을 같은 assertion으로 처리하지 않는다.  
`REQ-KERN-031` LLM이 계산한 숫자를 직접 발행하지 않고 executable calculation/program과 input facts를 저장한다.

## 5. Evidence Independence

Evidence dependency type:

```text
DERIVED_FROM / QUOTES / SYNDICATED / SAME_PRIMARY_SOURCE /
CALCULATED_FROM / TRANSLATED_FROM / AGGREGATES
```

신뢰도는 `raw evidence count`가 아니라 `effective independent primary roots`를 사용한다.

## 6. Derivation DAG

한 사용자-visible atomic statement는 정확히 하나의 `derivation_id`를 가진다. Derivation은 복수 typed inputs와 계산 step을 가질 수 있다.

예:

```text
assertion A + assertion B → normalized contract
numeric fact D / total revenue → exposure 21%
event + exposure → scenario range
→ atomic report statement
```

`REQ-KERN-040` derivation DAG는 acyclic이고 모든 input이 semantic type 규칙을 통과해야 한다.

## 7. Metric Definition & Comparability

같은 KPI 이름이라도 정의가 다르면 비교 금지.

Registry가 가져야 할 것:

- canonical metric concept.
- issuer/source definition.
- numerator/denominator.
- period basis.
- inclusion/exclusion.
- GAAP/non-GAAP.
- unit/currency/scale.
- comparability group/version.
- definition drift/supersession.

Comparability state:

```text
COMPARABLE
NORMALIZABLE
PARTIALLY_COMPARABLE
NOT_COMPARABLE
UNKNOWN
```

## 8. Economic Invariants

품질점수가 아니라 hard/soft constraint로 다룬다.

예:

- assets = liabilities + equity.
- cash roll-forward.
- share-count / dilution roll-forward.
- token supply = prior + mint/emission - burn.
- ETF holdings/NAV consistency.
- security corporate-action continuity.
- cross-instrument mapping consistency.

`REQ-KERN-050` hard invariant 실패 artifact는 quarantine/safety downgrade한다.

## 9. Semantic Snapshot

snapshot은 최소 다음 version을 고정한다.

```text
ontology_revision
metric_definition_revision
entity_resolution_revision
model/prompt/feature versions
source contract revisions
market calendar/corporate-action basis
```

semantic change가 발생하면 dependency index로 영향을 받은 artifact만 invalidation/recompute한다. 전체 backfill을 기본값으로 하지 않는다.

## 10. Human Adjudication

사람의 수동 수정도 append-only decision/reason/reviewer/evidence로 남긴다. Human review는 truth history를 지우는 bypass가 아니다.
