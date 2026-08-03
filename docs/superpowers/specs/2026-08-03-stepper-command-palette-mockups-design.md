# 3D Stepper + CommandPalette 목업 설계

## 디자인 해석

전문 투자 리서치 SaaS의 공용 컴포넌트 카탈로그로 읽는다. 현재 Market Graphite와 OpenHuman 계열의 차분하고 촉각적인 언어를 유지하며 `DESIGN_VARIANCE 4`, `MOTION_INTENSITY 4`, `VISUAL_DENSITY 6`을 기준으로 한다.

`design-taste-frontend`는 대시보드 아키텍처가 아니라 과한 카드, 장식용 glow, AI식 문구를 걸러내는 보조 기준으로만 사용한다. 실제 구조와 접근성은 현재 저장소의 shared UI, Radix 의미 구조, Motion 경계를 따른다.

## 범위

- 인증이 필요 없는 `__ui-lab`의 `목업 진행 중` 탭에 3D 비교 카탈로그를 추가한다.
- Stepper와 CommandPalette 각각 A/B/C 세 시안을 실제 상호작용 가능한 상태로 제공한다.
- 이번 단계에서는 시안을 `shared/ui`로 승격하지 않는다.
- 제품 경로 이동, 데이터 요청, 새 의존성은 추가하지 않는다.
- `cmdk` 도입 여부는 사용자 시안 승인 뒤 공용화 계획에서 결정한다.

## Stepper 비교안

모든 Stepper는 같은 네 단계를 공유한다: `소스 확인`, `근거 연결`, `영향 경로`, `검토 완료`. 한 시안에서 단계를 선택하면 세 시안이 함께 갱신되고 URL은 바뀌지 않는다.

### A Hairline Flow

- 얇은 수평 기준선과 짧은 현재 표시만 사용한다.
- 현재 단계는 `aria-current="step"`과 선명한 텍스트로 표현한다.
- 완료 단계는 작은 체크 아이콘, 예정 단계는 낮은 대비의 번호를 사용한다.
- 기본 Stepper variant 후보로 삼는다.

### B Soft Track

- 낮은 배경 면 안에서 현재 선택 면이 단계 사이를 이동한다.
- 이동 면은 Motion `layoutId`를 사용하되 transform과 opacity만 애니메이션한다.
- 폼, 설정, 짧은 wizard에 적합한 방향이다.

### C Ledger Steps

- 세로형 압축 목록으로 단계명, 상태, 한 줄 보조 설명을 함께 표시한다.
- 좁은 사이드 패널과 검토 이력에 적합하다.
- 완료, 현재, 예정 상태를 텍스트와 보더로 구분하고 장식용 상태 점은 사용하지 않는다.

## CommandPalette 비교안

모든 CommandPalette는 `Cmd/Ctrl+K` 열기, 검색, ArrowUp/ArrowDown, Enter 실행, Escape 닫기, 빈 결과를 지원한다. 실행은 UI Lab 내부 상태만 갱신하고 실제 경로를 이동하지 않는다.

### A Compact Command

- 중앙 모달 안의 단일 열 검색과 그룹형 결과다.
- 결과 이름, 짧은 설명, 선택 항목 단축키만 표시한다.
- 가장 범용적인 기본 variant 후보로 삼는다.

### B Split Context

- 왼쪽 결과 목록과 오른쪽 맥락 미리보기를 나눈다.
- 데스크톱에서는 선택 결과의 설명과 사용 맥락을 보여주고, 모바일에서는 미리보기를 결과 아래로 접는다.
- 복잡한 리서치 명령과 데이터 이동에 적합하다.

### C Quick Actions

- 작은 실행 면에 최근 항목과 빠른 액션을 우선 표시한다.
- 결과 설명을 줄이고 키보드 탐색 밀도를 높인다.
- 좁은 화면과 단순 실행 명령에 적합하다.

## 상호작용과 모션

- Stepper는 semantic `ol`과 `li`를 사용하며 상호작용 가능한 단계만 `button`으로 렌더링한다.
- CommandPalette 검색 입력은 `role="combobox"`, 결과는 `role="listbox"`, 항목은 `role="option"`을 사용한다.
- Palette 진입은 기존 Dialog의 짧은 fade와 이동을 재사용한다.
- Stepper와 선택 결과의 이동 피드백은 낮은 spring과 `layoutId`만 사용한다.
- `prefers-reduced-motion`에서는 진입 transform과 이동 indicator animation을 제거하고 상태 변화는 즉시 반영한다.

## 검증

- Stepper A/B/C 동기화, `aria-current="step"`, URL 고정을 검증한다.
- CommandPalette trigger와 `Cmd/Ctrl+K`, focus, 검색, 방향키, Enter, Escape, 빈 결과를 검증한다.
- B 미리보기와 C 압축 레이아웃을 확인한다.
- 1440px와 390px에서 overflow와 44px 핵심 클릭 영역을 확인한다.
- Axe와 reduced motion을 focused Playwright로 확인한다.

## 승인 기준

- A/B/C의 차이가 색상만이 아니라 정보 구조와 밀도로 구분되어야 한다.
- 실제 제품 이동이나 가짜 데이터 요청 없이 모든 상호작용을 확인할 수 있어야 한다.
- 큰 마케팅 문구, badge 남발, glow, gradient text, 불필요한 설명 카드는 사용하지 않는다.
