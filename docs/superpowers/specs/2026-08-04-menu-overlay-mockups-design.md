# Menu & Overlay 통합 목업 설계

## 목적

남은 UI 롤아웃을 과도하게 세분화하지 않고, DropdownMenu·ContextMenu·Popover·Drawer·Sheet·BottomSheet를 하나의 4A 묶음에서 비교한다. 목업 단계는 시각과 핵심 상호작용 판단에 집중하고 전체 회귀나 확장형 메뉴 계약은 공용화 단계까지 미룬다.

## 로드맵 재편

남은 예정 항목은 다음 네 묶음으로 운영한다.

1. Menu & Overlay
2. Identity & Content
3. Data & Feedback
4. Charts End-to-End

UI Lab `예정` 탭의 기존 여섯 카드도 이 네 카드로 축소한다. 현재 `목업 진행 중` 탭에는 Menu & Overlay를 배치하고, 완료된 Stepper·CommandPalette는 `완료` 탭으로 이동한다.

## 비교 구조

Menu & Overlay는 컴포넌트마다 독립적인 3안을 만들지 않는다. 여섯 컴포넌트에 동일한 디자인 언어를 적용해 세 방향만 비교한다.

### A · Hairline

- 얇은 경계와 최소 표면
- 메뉴 항목과 패널 콘텐츠의 위계를 여백과 한 줄 구분으로 표현
- 가볍고 조용한 리서치 도구에 적합

### B · Soft Surface

- 낮은 배경 면과 그룹 단위 강조
- 트리거와 열린 면의 연결감을 부드러운 inset으로 표현
- 메뉴와 패널의 소속 관계가 가장 쉽게 보임

### C · Compact Ledger

- 조밀한 행, 단축키, 보조 정보를 정렬한 검토형 구조
- 좁은 화면과 고밀도 리서치 흐름을 우선
- 장식보다 정보 정렬과 빠른 스캔에 집중

## 카탈로그 구성

`/__ui-lab`의 `목업 진행 중` 탭에 두 영역을 둔다.

1. 메뉴 영역: DropdownMenu, ContextMenu, Popover
2. 패널 영역: Drawer, Sheet, BottomSheet

각 영역은 A/B/C를 같은 순서로 배치한다. 세 variant는 동일한 샘플 데이터와 로컬 실행 결과를 공유한다. URL과 실제 제품 데이터는 변경하지 않는다.

## 상호작용 계약

- DropdownMenu는 버튼 클릭으로 연다.
- ContextMenu는 우클릭과 `Shift+F10`으로 연다.
- Popover, Drawer, Sheet, BottomSheet는 명시적인 버튼으로 연다.
- Escape와 외부 클릭으로 닫고 가능한 경우 원래 트리거로 포커스를 돌려준다.
- DropdownMenu와 ContextMenu는 동일한 리서치 액션을 공유한다.
- 메뉴 항목은 일반 액션, 아이콘, 단축키, 구분선, disabled 상태만 포함한다.
- 독립형 Checkbox와 RadioGroup은 이미 공용화되어 있으므로 메뉴형 checkbox·radio는 추가하지 않는다.
- submenu도 목업 범위에서 제외한다.
- disabled 항목은 실행 결과를 만들지 않는다.

## 구현 경계

- 사용자 시각 승인 전에는 `pages/ui-lab` 내부 목업으로 유지한다.
- 기존 `radix-ui`, 공용 Button, 기존 Dialog·Sheet·motion 경계를 재사용한다.
- 새 패키지와 새 overlay provider를 추가하지 않는다.
- 승인 이후에만 유지할 variant를 `shared/ui` 공개 API로 승격한다.
- 실제 제품 사용처가 없으면 가짜 기능을 추가하지 않는다.

## 접근성·반응형

- 메뉴와 패널은 올바른 역할과 키보드 탐색을 제공한다.
- 390px에서 가로 overflow가 없어야 한다.
- 터치 가능한 트리거와 메뉴 행은 최소 44px을 유지한다.
- `prefers-reduced-motion`에서는 이동·확장 애니메이션을 제거하거나 즉시 전환한다.
- 포커스 표시를 열린 면과 항목 중 한 곳에서 명확하게 소유한다.

## 경량 검증

목업 단계에서는 다음만 수행한다.

- 소스 계약 1~2건
- DropdownMenu·ContextMenu·Popover·패널 열기와 닫기를 묶은 Playwright 핵심 상호작용 1건
- 390px overflow·44px 터치 영역·reduced-motion·Axe를 묶은 Playwright 1건
- Web typecheck
- 변경 파일 Oxfmt·Oxlint
- `git diff --check`

전체 테스트와 전체 빌드는 공용화·제품 사용처 감사까지 끝나는 묶음 종료 시점에 수행한다.

## 제외 범위

- 메뉴형 checkbox·radio
- submenu
- 실제 라우트 이동이나 서버 변경
- 새 메뉴·오버레이 의존성
- 목업 단계의 전체 저장소 회귀 테스트
