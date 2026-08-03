# Breadcrumb + Pagination 목업 설계

- 상태: 사용자 방향 승인 완료
- 승인일: 2026-08-03
- 묶음: `3C 위치·페이지 탐색`
- 진행 원장: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`

## 목표

인증이 필요 없는 `__ui-lab` 한 화면에서 Breadcrumb와 Pagination의 프로덕션 가능한 A/B/C 시안을 비교한다. 의미 구조는 검증된 웹 내비게이션 관례를 따르고, 시각은 현재 Market Graphite 토큰과 절제된 Motion 언어를 유지한다.

이번 단계는 비교 목업까지만 다룬다. 사용자 승인 전에는 `shared/ui` 공개 API를 만들거나 실제 제품 화면을 교체하지 않는다.

## 핵심 결정

- Breadcrumb는 현재 위치의 계층을 나타내며 마지막 항목은 링크가 아닌 현재 페이지다.
- Pagination은 시각 `variant`와 데이터 탐색 `mode`를 분리한다.
- `variant`: `hairline | soft-inset | ledger`
- `mode`: `pages | compact | cursor`
- A/B/C 시안은 시각 방향을 비교하고, mode는 동일한 시각 방향 안에서 제품 데이터 형태에 맞게 선택한다.
- 숫자 페이지를 알 수 없는 cursor API에 임의 페이지 번호를 만들지 않는다.
- UI Lab 비교에서는 Breadcrumb·Pagination 선택이 URL을 바꾸지 않고 로컬 상태만 갱신한다.
- 실제 `href`, modified click, route search 계약은 목업 승인 후 공용 API와 제품 사용처를 정할 때 별도로 확정한다.
- UI Lab은 제품 loader나 인증 경계를 호출하지 않는다.

## Breadcrumb 시안

### A — Hairline Trail

- 배경 surface 없이 텍스트와 작은 chevron만 사용한다.
- 이전 경로는 저채도 링크, 현재 페이지는 높은 대비와 medium weight로 구분한다.
- hover는 밑줄과 전경색 변화만 사용하고 위치 이동이나 scale은 넣지 않는다.
- 고밀도 헤더와 데이터 상세 상단에 적합하다.

### B — Soft Current

- 전체 경로를 감싸는 카드나 pill은 만들지 않는다.
- 현재 페이지 항목에만 낮은 채도의 rounded rectangle 배경을 적용한다.
- 이전 경로는 평면 링크로 유지해 현재 위치의 위계만 한눈에 보이게 한다.
- 일반 SaaS 상세 화면과 설정 화면에 적합하다.

### C — Compact Ledger

- 긴 경로에서 중간 항목을 ellipsis로 축약한다.
- 구분선은 chevron 대신 작은 slash 또는 짧은 선을 사용해 데이터 경로처럼 보이게 한다.
- 현재 항목은 배경 없이 짧은 하단선과 숫자·코드 친화적인 정렬로 표시한다.
- 좁은 패널과 금융 데이터 drill-down에 적합하다.

## Pagination 시안

### A — Hairline Pages

- 이전·다음과 숫자 페이지를 분리된 평면 버튼으로 배치한다.
- 현재 페이지는 1px border와 약간 둥근 사각형으로 표시한다.
- hover와 press는 색상·inset shadow만 사용하고 크기 변화는 넣지 않는다.
- `pages` mode의 기본 후보로 사용한다.

### B — Soft Inset Track

- 하나의 낮은 트랙 안에 숫자 페이지를 배치한다.
- 현재 페이지의 저채도 선택 surface가 같은 트랙 안에서 Motion layout transition으로 이동한다.
- 첫 렌더에서 indicator가 날아오지 않으며, reduced-motion에서는 즉시 위치가 바뀐다.
- 반복 탐색이 많은 목록과 대시보드에 적합하다.

### C — Compact Ledger

- 중앙에 `03 / 12` 또는 `3페이지` 같은 짧은 상태를 두고 양쪽에 이전·다음 버튼을 배치한다.
- cursor mode에서는 총 페이지를 만들지 않고 `이전 기록`·`다음 기록` 또는 `더 보기` 상태만 노출한다.
- loading은 버튼 안의 spinner와 텍스트 전환으로 표현하고 마우스 cursor는 `default`로 둔다.
- 모바일·좁은 카드·cursor 기반 피드에 적합하다.

## 목업 데이터와 상호작용

- Breadcrumb fixture: `워크스페이스 / 종목 / NVDA / 근거 기록`
- A/B는 전체 경로, C는 `워크스페이스 / … / NVDA / 근거 기록` 축약 상태를 기본으로 보여준다.
- Breadcrumb 항목을 누르면 세 시안의 현재 위치가 로컬 상태로 함께 바뀌며 URL은 유지된다.
- Pagination fixture는 12페이지 중 3페이지를 기본값으로 사용한다.
- 숫자·이전·다음 선택이 즉시 동기화되며 disabled 경계는 1페이지와 12페이지에서 확인한다.
- 생략된 페이지의 ellipsis는 공용 Select 기반 page picker이며, 작은 trigger와 독립적인 popup 최소 폭을 사용해 누락 구간의 페이지를 바로 선택하고 URL 이동 없이 세 시안을 동기화한다.
- C에는 cursor loading과 마지막 페이지 상태를 별도 토글 없이 인라인 예시로 함께 보여준다.

## 향후 공용 API 경계

목업 승인 후 다음 public API를 별도 계획에서 확정한다.

- `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis`
- `Pagination`, `PaginationList`, `PaginationItem`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `PaginationEllipsis`, `PaginationStatus`
- controlled page/cursor 값과 disabled·pending 상태
- TanStack Link를 합성할 수 있는 `asChild` 또는 명시적 child 계약

시각 variant는 의미 구조를 바꾸지 않는다. `mode`만 페이지 번호의 존재 여부와 상태 문구를 결정한다.

## 제품 적용 기준

- Pagination은 승인·공용화 후 Today, Radar, History의 cursor 기반 `더 보기` 사용처를 감사한다.
- 기존 API 요청, cursor 권위, append 동작, 오류 복구 문구는 바꾸지 않는다.
- Breadcrumb는 현재 제품에 명확한 중첩 route hierarchy가 없어 가짜 경로를 만들지 않는다. 적합한 실제 사용처가 생기기 전까지 UI Lab에만 유지한다.

## 접근성·모션

- 두 컴포넌트 모두 `<nav>`와 구체적인 `aria-label`을 제공한다.
- Breadcrumb는 ordered list를 사용하고 현재 페이지에 `aria-current="page"`를 적용한다.
- Pagination 현재 항목도 `aria-current="page"`를 사용하고 disabled 항목은 선택을 변경하지 않는다.
- 모든 interactive target은 390px에서 최소 44px hit area를 확보한다.
- focus-visible은 공용 Market Graphite ring 하나만 소유한다.
- Motion은 선택 indicator와 짧은 상태 전환에만 사용한다. Breadcrumb 자체와 전체 목록을 이동시키지 않는다.
- `prefers-reduced-motion`에서는 transform·layout 보간을 제거하고 필요한 색상·opacity 피드백만 유지한다.

## 검증

- UI Lab source 계약 테스트로 A/B/C 여섯 시안과 의미 구조를 고정한다.
- desktop/mobile Playwright에서 URL 고정, 현재 상태, disabled 경계, ellipsis page picker, 숫자 이동, cursor loading을 확인한다.
- 390px target 크기와 가로 overflow를 확인한다.
- keyboard focus order, Enter 활성화, Axe 접근성을 확인한다.
- 변경 파일 lint·format, web typecheck, `git diff --check`를 실행한다.
- 시각 검토는 Codex 인앱 브라우저의 기존 단일 탭에서 수행한다.

## 제외 범위

- 이번 목업 단계에서 `shared/ui` 공개 컴포넌트를 만들지 않는다.
- 제품 cursor API나 URL 계약을 바꾸지 않는다.
- 임의 숫자를 직접 입력하는 jump-to-page와 page-size selector는 3C 기본 범위에 넣지 않는다. 표시된 ellipsis 구간의 제한된 page picker만 제공한다.
- 새 UI Provider나 별도 animation runtime을 추가하지 않는다.
