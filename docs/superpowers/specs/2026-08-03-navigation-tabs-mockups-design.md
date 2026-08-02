# 3A Route Tabs + Sliding Tabs 목업 설계

## 목표

실제 경로를 이동하는 탭과 같은 화면 안에서 표시 상태만 바꾸는 탭을 구분해 비교한다. 제품 화면에는 아직 연결하지 않고 `__ui-lab`에서 각 유형의 세 가지 프로덕션 가능한 시안을 선택할 수 있게 한다.

## 범위

- Route Tabs 3안
  - `hairline`: 전체 하단선과 이동하는 2px 선택선
  - `quiet-surface`: 선택 링크만 낮은 면과 얇은 테두리로 강조
  - `ledger`: 높은 밀도와 분명한 선택선을 가진 금융 데이터형 탭
- Sliding Tabs 3안
  - `soft-inset`: 낮은 레일 안에서 선택 면이 이동
  - `flush-segment`: 붙어 있는 세그먼트 안에서 선택 배경이 이동
  - `sliding-underline`: 배경 없이 선택 밑줄만 이동

## 의미와 상호작용

- Route Tabs는 `nav`와 링크를 사용하고 선택 항목에 `aria-current="page"`를 제공한다.
- UI Lab에서는 페이지 이탈 없이 URL의 목업 전용 query만 갱신해 실제 경로 탭의 의미를 확인한다.
- Sliding Tabs는 기존 Radix 기반 `Tabs`를 사용하며 같은 화면의 내용 전환만 담당한다.
- 방향키, Home, End, focus-visible, disabled 상태를 지원한다.
- 선택 전환은 Motion highlight로 구현하며 scale 애니메이션은 사용하지 않는다.
- `prefers-reduced-motion`에서는 위치 이동을 즉시 전환하고 색상·테두리 상태는 유지한다.

## 반응형

- 390px에서 탭을 여러 줄로 접지 않고 가로 스크롤한다.
- 탭 높이는 최소 40px, 모바일 상호작용 영역은 최소 44px로 유지한다.
- 선택 항목은 긴 한글 라벨과 숫자 배지가 있어도 잘리지 않게 한다.

## 구현 경계

- UI Lab은 비교 데이터와 현재 선택 상태만 소유한다.
- 시각 variant는 목업 전용 스타일에서 먼저 검증한다.
- 승인 전에는 `shared/ui` 공개 API를 늘리거나 제품 화면을 변경하지 않는다.
- 새 패키지와 UI Provider를 추가하지 않는다.

## 검증

- Route Tabs의 URL 상태, `aria-current`, Enter 활성화를 확인한다.
- Sliding Tabs의 방향키 이동, 선택 내용 전환, moving highlight를 확인한다.
- 데스크톱과 390px에서 overflow, focus, reduced-motion을 확인한다.
- 이 목업 단계에서는 관련 계약 테스트와 웹 typecheck만 실행하며 전체 E2E와 production build는 생략한다.
