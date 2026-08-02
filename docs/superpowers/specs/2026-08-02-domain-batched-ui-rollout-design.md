# Stock Insight 도메인 배치형 UI 시스템 롤아웃 설계

- 상태: 사용자 승인 완료
- 승인일: 2026-08-02
- 기준 브랜치: `codex/shared-ui-catalog-charts`
- 진행 원장: `docs/superpowers/UI-SYSTEM-ROLLOUT.md`

## 목표

확정된 목업을 한 번에 전체 구현하지 않고, 관련 컴포넌트 1~3개를 도메인 묶음으로 처리한다.
각 묶음은 목업 승인부터 공용화, 실제 제품 적용, 브라우저 검증까지 독립적으로 완료되어야 한다.
대화나 세션이 바뀌어도 진행 원장의 현재 묶음과 상태를 읽어 중단 지점부터 재개한다.

## 고정 실행 방식

각 묶음은 다음 상태 순서를 따른다.

`대기 → 목업 작성 → 사용자 승인 → shared/ui 구현 → 제품 적용 → 브라우저 검증 → 자동 검증 완료`

- 동시에 활성화되는 묶음은 하나뿐이다.
- 사용자 승인 전에는 다음 묶음의 제품 코드를 구현하지 않는다.
- 새 목업은 인증이 필요 없는 `__ui-lab`의 같은 탭에서 비교한다.
- 목업 비교는 프로덕션에서 접근할 수 없어야 한다.
- 공용 구현은 `@/shared/ui/<purpose>` public API로만 노출한다.
- 제품 화면은 UI Lab 구현을 직접 import하지 않는다.
- 각 묶음 완료 시 진행 원장과 Codex 장기 메모리를 함께 갱신한다.
- 구현·검증 결과는 묶음 단위 커밋으로 분리한다.

## 1. 입력·액션 공용화

### 1A 선택 입력

- `RadioGroup`
- `Slider`
- 상태: 목업 승인 완료, 공용화 대기

### 1B 날짜 입력

- `Calendar`
- `DatePicker`
- `RangePicker`
- 상태: 목업 승인 완료, 공용화 대기

### 1C 파일 입력

- `FileUpload`
- `Dropzone`
- 상태: `hairline`·`inset` 목업과 상호작용 검증 완료, 공용화 대기

### 1D 짧은 보안 입력

- `OTP`
- 상태: 목업 승인 완료, 공용화 대기

### 1E 액션 조합

- `ButtonGroup`
- `SplitButton`
- 상태: 목업 승인 완료, 공용화 대기

## 2. 기존 제품 공용 컴포넌트 수렴

### 2A 인증·관리자 폼

- Input, Select, Checkbox, Textarea와 신규 날짜·파일 입력을 canonical public API로 수렴한다.
- validation, enrollment, redirect, 관리자 mutation 계약은 바꾸지 않는다.

### 2B 워크스페이스 검색·선택

- Combobox, RadioGroup, Slider, ToggleGroup 사용처를 공용 상태 계약으로 수렴한다.

### 2C 워크스페이스 데이터·오버레이

- Table, Card, Accordion, Dialog, Toast 사용처와 페이지별 상태 CSS를 감사한다.

### 2D 미사용 공용 컴포넌트 검증

- Switch, Checkbox, Textarea, AlertDialog가 기존 제품 요구사항에 실제로 필요한지 감사한다.
- 가짜 기능을 만들지 않는다. 사용처가 없으면 UI Lab fixture와 공용 API 검증까지만 유지한다.

## 3. 내비게이션

### 3A 상단 전환

- Route Tabs
- Sliding Tabs

### 3B 측면 탐색

- Side Tab
- Side List

### 3C 위치·페이지 탐색

- Breadcrumb
- Pagination

### 3D 단계·빠른 이동

- Stepper
- CommandPalette

## 4. 메뉴·오버레이

### 4A 메뉴

- DropdownMenu
- ContextMenu

### 4B 연결형 오버레이

- Popover

### 4C 측면·하단 패널

- Drawer
- Sheet
- BottomSheet

기존 Dialog/Sheet runtime을 재사용하며 별도 overlay provider를 추가하지 않는다.

## 5. 데이터·콘텐츠·피드백

### 5A 신원·상태

- Avatar
- Badge
- Status

### 5B 순서형 콘텐츠

- List
- Timeline
- Carousel

### 5C 고밀도 데이터

- Table 확장
- DataGrid

### 5D 진행 상태

- Progress
- Spinner

### 5E 대기·결과 상태

- Skeleton
- Empty
- Error
- Loading

이미 공용 구현이 있는 Timeline, Badge, Skeleton, Feedback state도 목업 variant와 public API를 이
단계에서 다시 정리한다.

## 6. 차트

### 6A 공용 기반

- renderer-neutral 시계열·캔들·거래량·marker 타입
- adapter와 formatter
- `ChartFrame`

### 6B Market Tape

- Bklit AreaChart
- ChartBrush
- crosshair와 tooltip

### 6C Evidence Band

- Bklit ComposedChart
- evidence marker와 근거 목록 양방향 연동

### 6D Candle Ledger

- TradingView Lightweight Charts
- candle, volume, zoom, pan, crosshair

### 6E 갤러리·제품 연결

- A/B/C 상호작용 비교 갤러리
- 선택 종목 Deep Dive 연결

## 묶음 완료 조건

각 묶음은 다음 조건을 모두 만족해야 완료다.

1. UI Lab 또는 기존 승인 기록에서 시각·상호작용 방향이 확정됐다.
2. 공용 컴포넌트가 controlled/uncontrolled, disabled, invalid, pending/open 계약을 필요한 범위에서 제공한다.
3. keyboard, focus-visible, reduced-motion과 390px 터치 계약을 검증한다.
4. 최소 하나의 실제 제품 사용처가 공용 API를 사용한다. 실제 사용처가 없는 항목은 그 사유를 원장에 기록한다.
5. 페이지 CSS가 공용 focus, selected, pressed, open 상태를 재정의하지 않는다.
6. Codex 인앱 브라우저의 단일 탭에서 1440px와 390px를 검토한다.
7. 대상 테스트, lint, typecheck, build, `git diff --check`, `graphify update .`를 실행한다.
8. 진행 원장의 현재 묶음과 다음 묶음을 갱신한다.

## 현재 시작점

- 현재 활성 묶음: 없음
- 다음 묶음: `1A 선택 입력 — RadioGroup + Slider`
- `1C FileUpload + Dropzone`은 목업 검증까지 선행 완료됐지만 순서상 1A부터 공용화를 시작한다.
- 2026-08-02 live 개발 진단은 로컬 AGE 구성 정상, 원격 `insight-db.jigooo.com` Cloudflare Tunnel
  `Error 1033`으로 실행 보류 상태다.
