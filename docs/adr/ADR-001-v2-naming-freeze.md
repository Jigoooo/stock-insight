# ADR-001 — V2 명칭·계약 동결 (Naming & Contract Freeze)

- 상태: **Accepted** (2026-07-20)
- 근거 문서: `docs/plan/stock-insight-v2-enhancement-plan.md` §0.1, `docs/plan/v2-enhancement-roadmap/v2-enhancement-master-roadmap.md` §0
- 적용 대상: 이 저장소의 모든 코드·마이그레이션·API·문서 작업 (사람·LLM·자동 에이전트 동일)

## 결정

아래 10개 계약은 변경 제안이 아니라 **상위 호환성 계약**이다. 위반하는 구현은 리뷰 통과 여부와 무관하게 무효다.

| # | 계약 |
|---|---|
| C1 | 제품·API 계약은 계속 **V2**다. 새 메이저 버전 명칭, 새 메이저 API namespace, 병렬 제품 계약을 생성하지 않는다. |
| C2 | 기존 **L0~L8 및 X1~X4** 레이어 번호를 유지한다. 고도화 기능은 기존 레이어의 하위 모듈 또는 교차 plane(Geo/Personalization)으로 추가한다. |
| C3 | `impact_path_v2`, `graph-read-model-v2`, V2 content pack, 기존 Graph API의 의미를 임의로 rename하거나 duplicate하지 않는다. |
| C4 | 새 기능은 **additive migration → nullable-to-required 단계 전환 → shadow write/read → feature flag → backfill → parity gate** 순서로 적용한다. |
| C5 | `builder_version`, `model_version`, `prompt_version`, `feature_version`, `ontology_revision`, `contract_revision`은 API major version과 무관하다. |
| C6 | 내부 revision 숫자가 증가해도 API 경로나 제품 명칭을 자동 변경하지 않는다. |
| C7 | 기존 endpoint 확장은 backward-compatible optional field부터 시작하고, 새 endpoint도 기존 `/api/...` 아래 의미 기반 경로로 추가한다. |
| C8 | 기존 V2 데이터의 migration 없이 별도 진실 원장을 병렬 생성하지 않는다. 정본은 계속 PostgreSQL `research_app`이다. |
| C9 | 개인화 결과는 공통 원장에 쓰지 않고 `personalization.*` projection/decision 영역에만 저장한다. |
| C10 | 지도 좌표·화면 배치·클러스터 좌표는 presentation/geo projection이며, 관계 원장의 진실을 수정하지 않는다. |

## 진실 등급 사슬

모든 데이터는 이 사슬 위에서만 흐르며, **하위 계층이 상위 계층으로 역류해 사실을 수정할 수 없다**.

```text
source_revision
  → assertion / numeric_fact / event_mention / location_mention
  → event / contract / relation_instance / geo_binding
  → exposure / mechanism_hypothesis
  → statistical_estimate / causal_estimate
  → forecast / scenario
  → report_statement / common_asset_view
  → personalized_decision_packet
```

## 용어 정정 (호환 유지)

- 표준 표기는 `NEWS_MENTION`이되, 기존 DB predicate `NEWS_COMENTION`은 migration 호환을 위해 내부 alias로 유지한다 (rename migration 금지 — C3).
- API 시간 파라미터는 `validAt` + `knownAt` + `informationSet`으로 분리하며, `asOf`는 편의 alias로만 유지한다.
- "정확한 재실행 결정론"은 LLM byte-level 동일성이 아니라 **stored output replay** (입력·프롬프트·스키마·모델·출력 해시 원장 고정)를 뜻한다.

## 결과

- 이 ADR 이후의 모든 PR/커밋은 위 계약 위반 여부를 리뷰 항목에 포함한다.
- 위반이 필요한 경우 이 ADR 자체를 개정(새 ADR)한 뒤에만 진행한다.
