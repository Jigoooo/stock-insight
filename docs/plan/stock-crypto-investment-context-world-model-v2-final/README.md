# Stock/Crypto Insight V2 — Final Canonical Architecture Package

> Status: **ARCHITECTURE FROZEN / IMPLEMENTATION CANONICAL**  
> Freeze date: **2026-08-07**  
> Product/API major contract: **V2 유지**

## 정본 규칙

1. `canonical/`과 `contracts/`만 **구현 정본**이다.
2. `reference/`는 이전 Master, 분할본, 연구 근거, 변경 이유를 보존하는 **비정본 감사 자료**다.
3. 과거의 `Baseline → 2차 → 3차 → 4차 → 5차` precedence 규칙은 **폐기**한다. 구현자는 precedence를 계산하지 않는다.
4. 동일 의미를 둘 이상의 canonical 문서가 소유하지 않는다. `canonical/00-architecture-constitution.md`의 ownership map이 최종 소유권이다.
5. `MUST / MUST NOT / SHOULD / MAY`는 규범적 의미로 사용한다.
6. 핵심 요구사항은 `REQ-*` ID로 식별하고 `contracts/requirement-index.json`에서 코드·테스트·migration에 연결한다.
7. 새로운 canonical object family, truth class, 또는 제품 major contract는 Architecture RFC 없이는 추가하지 않는다.

## 구현 읽기 순서

`00 Architecture Constitution → 01 Product → 02 Kernel → 03 World Model → 04 Domain Intelligence → 05 Market Intelligence → 06 Recommendation → 07 Product Planes → 08 Data Acquisition → 09 Platform → 10 Quality → 11 Delivery/Launch`

## 이번 Freeze에서 바뀐 점

- 단계별 역사 서술을 구현 정본에서 제거했다.
- 12 canonical object family와 semantic type flow를 하나의 constitution으로 고정했다.
- 문서마다 `Owner / Depends on / Produces / Consumed by` 계약을 둔다.
- PIT, information-set, evidence independence, release consistency, safety state를 공통 kernel로 고정했다.
- 핵심 구조를 JSON Schema/JSON rule로 기계 판정 가능하게 만들었다.
- 첫 출시 범위와 shadow/defer 범위를 강제로 나눴다.
- 비용·capacity·backfill budget과 architecture freeze rule을 추가했다.
- 과거 상세 설계는 `reference/`에 그대로 보존한다.

## 완료의 의미

이 패키지는 **무엇을 만들 것인가에 대한 conceptual architecture를 동결**한다. 이후 변경은 실제 vertical fixture, 코드, DB migration, API contract에서 표현 불가능한 반례가 발견된 경우에만 canonical 문서를 수정한다.
