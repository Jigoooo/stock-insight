# Stock Insight UI 시스템 진행 원장

이 파일은 UI 공용화·목업·차트 작업의 장기 상태를 기록하는 단일 기준점이다.
새 세션은 구현 전에 이 파일을 먼저 읽고 `현재 활성 묶음`에서 재개한다.

## 현재 포인터

- 프로그램 상태: 실행 중
- 현재 활성 묶음: `6A Charts End-to-End`
- 다음 묶음: `6A Evidence Band TradingView 디테일 시각 확인`
- 마지막 갱신: 2026-08-05
- 실행 방식: 도메인 묶음별 end-to-end

## 상태값

- `대기`: 아직 시작하지 않음
- `목업`: UI Lab 비교 작성 중
- `승인`: 사용자 디자인 승인 완료
- `공용화`: `shared/ui` 구현 중 또는 완료
- `제품 적용`: 실제 제품 사용처 연결 중 또는 완료
- `검증 완료`: 브라우저·자동 검증·리뷰까지 통과
- `보류`: 외부 상태 또는 사용자 결정이 필요함

## 전체 현황

| 묶음 | 내용                                | 현재 상태 | 다음 행동                             |
| ---- | ----------------------------------- | --------- | ------------------------------------- |
| 1A   | RadioGroup + Slider                 | 검증 완료 | 제품 사용처 없음 확인; 1B로 진행      |
| 1B   | Calendar + DatePicker + RangePicker | 검증 완료 | 제품 사용처 없음 확인; 1C로 진행      |
| 1C   | FileUpload + Dropzone               | 검증 완료 | 제품 사용처 없음 확인; 1D로 진행      |
| 1D   | OTP                                 | 검증 완료 | 제품 사용처 없음 확인; 1E로 진행      |
| 1E   | ButtonGroup + SplitButton           | 검증 완료 | 2A 인증·관리자 폼 감사                |
| 2A   | 인증·관리자 폼 수렴                 | 검증 완료 | 2B 워크스페이스 검색·선택 감사        |
| 2B   | 워크스페이스 검색·선택 수렴         | 검증 완료 | 2C와 통합 검증                        |
| 2C   | 워크스페이스 데이터·오버레이 수렴   | 검증 완료 | 2D와 통합 검증                        |
| 2D   | 미사용 공용 컴포넌트 검증           | 검증 완료 | 3A 목업 비교                          |
| 3A   | Route Tabs + Sliding Tabs           | 검증 완료 | 3B Side Tab + Side List 목업 비교     |
| 3B   | Side Tab + Side List                | 검증 완료 | 3C Breadcrumb + Pagination 목업 비교  |
| 3C   | Breadcrumb + Pagination             | 검증 완료 | 3D Stepper + CommandPalette 목업 비교 |
| 3D   | Stepper + CommandPalette            | 검증 완료 | 4A Menu & Overlay 목업 비교           |
| 4A   | Menu & Overlay                      | 검증 완료 | 5A Identity & Content 목업 비교       |
| 5A   | Identity & Content                  | 검증 완료 | 5B Data & Feedback 목업 비교          |
| 5B   | Data & Feedback                     | 검증 완료 | 6A Charts End-to-End 진행             |
| 6A   | Charts End-to-End                   | 승인      | Evidence Band 디테일 시각 확인        |

## 완료 기록

### 2026-08-02 — 입력·액션 목업 승인

- RadioGroup: hairline, inset, rail
- Slider: hairline, inset, rail
- Calendar: compact, soft-inset, ledger
- DatePicker/RangePicker: hairline, inset, rail
- FileUpload/Dropzone: hairline, inset; rail 제외
- OTP: hairline, inset, rail
- ButtonGroup: hairline, inset; rail 제외
- SplitButton: solid, tonal, twin

### 2026-08-02 — FileUpload 목업 상호작용 완료

- single/multiple, 반복 선택 append, 실제 drop, 확장자·10MB 검증
- 파일 추가 stagger, 홀짝 좌우 exit, 위쪽 reflow, 삭제 focus handoff
- desktop compact, 390px 44px hit area, reduced-motion
- UI Lab과 E2E 검증 완료

### 2026-08-02 — 1A RadioGroup + Slider 검증 완료

- 공개 API·보정 커밋: `77514ba`, `69cc64e`, `f270d68`, `acdd57b`, `bb074f1`, `d9d6ad3`, `8731a5e`
- UI Lab 이식·브라우저 계약: `408e09d`
- 모바일 Slider 44px touch-target 후속 완료: `fix(ui): 모바일 슬라이더 터치 영역 보강`
- 계약 검증: 선택 입력 관련 Node 5개 파일, fixture typecheck, web typecheck·lint·build
- 브라우저 매트릭스: desktop 9건 + mobile 9건 = 총 18건; hairline·inset·rail, 키보드, 390px 44px hit area, overflow, forced-colors, reduced-motion 포함
- 제품 사용처 감사: UI Lab 외 `pages`, `widgets`, `features`, `entities`에 RadioGroup·Slider 또는 raw radio/range 사용처 없음. 가짜 제품 기능은 추가하지 않음.

### 2026-08-02 — 1B Calendar + DatePicker + RangePicker 검증 완료

- 공용 API·UI Lab 이식 커밋: `ed4c042`
- 후속 레이아웃 보정 커밋: `442e5d9` — 헤더 화살표 수평 정렬, embedded 팝오버 surface, range 중간 테두리 제거
- `@daypicker/react@10.0.1` 기반 Calendar·RangeCalendar와 DatePicker·RangePicker 공개 API 구현
- 승인 variant 보존: Calendar `compact|soft-inset|ledger`, DatePicker/RangePicker `hairline|inset|rail`
- 전역 focus 규칙의 우선순위를 낮춰 공용 컴포넌트가 focus·invalid·pending 상태를 단독 소유
- 계약 검증: 관련 Node 6개 파일 27건, fixture typecheck, web typecheck·lint·build, `git diff --check`
- 브라우저 매트릭스: 날짜·선택·파일 입력 desktop/mobile 총 40건; 키보드, 390px hit area·overflow, focus 복귀, 범위 선택, reduced-motion 포함
- Codex 인앱 브라우저에서 세 variant 렌더링, 팝오버 의미 구조, 2026-08-14 선택 반영 확인
- 제품 사용처 감사: UI Lab 외 `pages`, `widgets`, `features`, `entities`에 날짜 입력 사용처 없음. 가짜 제품 기능은 추가하지 않음.

### 2026-08-02 — 1C FileUpload + Dropzone 검증 완료

- 공용 API·UI Lab 이식 커밋: `a067385`
- 공용 UI 토큰·검증 경계 보정 커밋: `25e8efe`
- `FileUpload`과 `Dropzone` 공개 API 구현: controlled/uncontrolled 목록, `single|multiple`, `hairline|inset`, disabled·invalid·pending·drag 상태
- CSV·XLSX·PDF와 10MB 기본 검증, 반복 선택 append, single 교체, rejection callback, native `File` 보존
- Motion 목록 계약 보존: 추가 stagger, 홀짝 좌우 exit, `popLayout` 위쪽 reflow, reduced-motion opacity 피드백
- focus 계약: 중간 삭제 시 인접 삭제 버튼, 마지막 삭제 exit 후 파일 선택 버튼으로 이동
- UI Lab의 페이지 소유 드롭·검증·목록 모션과 상태 CSS를 공용 컴포넌트로 교체
- 계약 검증: web Node 584건, FileUpload Playwright desktop/mobile 12건, fixture typecheck, 전체 format·lint·typecheck·build, `git diff --check`
- Codex 인앱 브라우저 단일 탭에서 A/B 대기·다중 선택·삭제 후 focus와 목록 재배치를 확인
- 제품 사용처 감사: UI Lab 외 `pages`, `widgets`, `features`, `entities`에 파일 입력 사용처 없음. 가짜 제품 기능은 추가하지 않음.

### 2026-08-02 — 1D OTP 검증 완료

- 공용 API·UI Lab 이식 커밋: `2f2d32f`
- 공용 `OTP` 공개 API와 UI Lab 이식: `hairline|inset|rail`, controlled/uncontrolled, 1~12자리 길이, form name, disabled·invalid·pending·required 상태
- 숫자 정규화, `one-time-code` autocomplete, 붙여넣기 분배, 자동 포커스 전진, Backspace·Delete·방향키·Home·End 이동 구현
- C Rail은 focus ring 없이 밑줄만 강조하고 A/B는 공용 컴포넌트가 단일 focus owner로 은은한 피드백을 소유
- 의미 구조를 `fieldset`으로 제공하고 light/dark 보조 문구 대비, 390px 44px 셀, reduced-motion, Axe 자동 접근성을 검증
- 계약 검증: web Node 584건, OTP Playwright desktop/mobile 11건 통과·desktop 전용 mobile 계약 1건 skip, fixture typecheck, 전체 format·lint·typecheck·build, `git diff --check`
- Codex 인앱 브라우저 단일 탭에서 A/B/C 렌더링과 C Rail의 `box-shadow: none`, `outline: none` 계산 스타일 확인
- 제품 사용처 감사: signup의 enrollment code는 최대 256자의 opaque 값이라 고정 숫자 OTP로 교체하지 않음. 그 외 OTP 사용처가 없어 가짜 제품 기능은 추가하지 않음.

### 2026-08-02 — 1E ButtonGroup + SplitButton 검증 완료

- 공용 API·UI Lab·제품 적용 커밋: `0ec183b`
- 공용 `ButtonGroup` 공개 API 구현: `hairline|inset`, 가로·세로 방향, 의미 있는 group label, 자식 버튼의 선택 상태를 강제하지 않는 액션 컨테이너 계약
- 공용 `SplitButton` 공개 API 구현: `solid|tonal|twin`, controlled/uncontrolled menu, primary·alternative action, pending·disabled 상태
- Radix DropdownMenu 기반 non-modal menu, `대체 액션` 접근 가능한 이름, Escape 후 trigger focus 복귀, 390px 44px target, reduced-motion 무변형 계약 검증
- UI Lab은 승인된 ButtonGroup A/B와 SplitButton A/B/C를 공용 컴포넌트로 교체하고 페이지 소유 menu·motion·상태 CSS를 제거
- 관계 그래프 카메라 컨트롤을 `ButtonGroup variant="inset"`과 공용 `IconButton`으로 교체. SplitButton은 실제 제품 사용처가 없어 가짜 기능을 추가하지 않음.
- Animate UI upstream Button 원본은 무변경으로 보존하고 canonical Button adapter에서 정의되지 않은 Motion props의 DOM 전달만 차단
- 계약 검증: web Node 590건, 액션 그룹 Playwright desktop/mobile 11건 통과·desktop 전용 mobile 계약 1건 skip, 전체 format·lint·typecheck·build, `git diff --check`
- Codex 인앱 브라우저 단일 탭에서 세 SplitButton variant, 기본·대체 액션, menu focus 복귀와 React console warning 0건을 확인
- 결합면·첫 모션 후속 보정: `efc65e0` — ButtonGroup·SplitButton A/B의 외곽 surface 소유권을 wrapper로 단일화하고, 내부 segment의 독립 press 이동과 UI Lab 이중 배경을 제거
- ButtonGroup inset lip 후속 보정: `875bf3f` — 3px 안쪽 padding을 제거해 A/B 높이와 결합 구조를 통일하고 B에는 단일 저채도 fill만 유지
- ButtonGroup 너비·press 후속 보정: `d88db83` — reusable `fullWidth` API로 가용 너비와 균등 segment 분할을 지원하고 A/B 모두 위치 이동 없는 pressed fill·inset shadow를 제공
- SplitButton chevron은 명시적 `rotate(0deg)`에서 시작해 첫 열림과 닫힘이 같은 transition을 사용하며, menu 진입은 170ms·퇴장은 80ms로 조정
- 후속 회귀 검증: Playwright desktop/mobile 18건 통과·pointer/mobile 전용 계약 2건 skip, full-width·균등 분할·pressed surface·첫 열림·Axe·reduced-motion 포함

### 2026-08-03 — 2A 인증·관리자 폼 수렴 검증 완료

- 공용화·제품 적용 커밋: `8ef4b4d`
- 인증과 관리자 초대 폼의 idle·pending·error·success를 공용 `InlineFeedbackRegion`과 `PresenceRegion`으로 수렴하고, 관리자 발급·취소 작업의 pending 범위를 개별 액션으로 한정
- 420ms 미만의 빠른 로그인 실패에도 기본 pending 모션이 읽히도록 실패 경로에만 최소 표시 시간을 적용하고 성공 리다이렉트에는 지연을 추가하지 않음
- 인증 없는 `__dev-preview?surface=admin-invitations`에서 실제 관리자 폼을 로컬 fixture와 안전한 action으로 검증하도록 구성
- 공용 Select·Combobox 팝업을 `document.body` 포털과 fixed 배치로 전환해 카드 overflow를 벗어나며, viewport flip·clamp와 스크롤 재배치를 지원
- MotionButton의 내부 visual wrapper가 옵션 전체 grid를 차지하도록 보정해 선택 체크 아이콘을 옵션 오른쪽 10px 위치에 고정
- 계약 검증: 전체 `pnpm test`, web Node 599건, dev remote 7건, dev live 53건, 인증 Playwright 40건 통과·자격 증명 필요 4건 skip, Select 브라우저 게이트 통과
- 최종 게이트: `format:check`, `lint`, `typecheck`, `build`, `git diff --check`; Codex 인앱 브라우저에서 포털 호스트·부모 overflow 탈출·체크 위치·선택 반영을 확인

### 2026-08-03 — 2A~2D 제품 UI 수렴 완료

- 2A의 인증·관리자 폼 공용화를 기준선으로 유지하고, 2B 검색·선택과 2C 데이터·오버레이의 실제 제품 사용처가 `shared/ui` 공개 API를 사용함을 재확인
- 종목 목록·상세 영역에 중복되어 있던 페이지 CSS를 삭제하고 실제 렌더링 모듈이 레이아웃·focus·pending·모바일 상태를 단독 소유하도록 정리
- 데스크톱 로그아웃을 아이콘 버튼으로 축소하고 모바일 버튼은 내용 너비만 사용하도록 보정
- 워크스페이스의 중복 eyebrow, 영문 쇼케이스 라벨, 반복 설명과 읽기 전용 안내를 줄이고 제품 문구를 한국어 중심으로 통일
- RadioGroup·Slider·DatePicker·FileUpload·OTP·SplitButton 등 제품 사용처가 없는 공용 API는 가짜 기능에 연결하지 않고 UI Lab 계약으로 보존
- 사용자 요청에 따라 전체 E2E·빌드 대신 관련 Node 계약, lint·typecheck·diff 검사와 핵심 화면 인앱 브라우저 확인으로 묶음을 종료

### 2026-08-03 — 3A Route Tabs + Sliding Tabs 목업 비교 준비

- Route Tabs: A Hairline, B Quiet Surface, C Ledger
- Sliding Tabs: A Soft Inset, B Flush Segment, C Sliding Underline
- 3A 상태는 사용자 비교·선택 전까지 `목업`으로 유지
- 검증: web typecheck, web format check, navigation tabs 계약 테스트 7건, `git diff --check`
- Codex 인앱 브라우저: Route 직접 진입 query·`aria-current`, Sliding URL 유지·`aria-selected`, 390px 여섯 variant 44px target·nowrap·가로 overflow 없음 확인

### 2026-08-03 — 3A Route Tabs + Sliding Tabs 승인·공용화 완료

- 사용자 승인: Route Tabs는 A Hairline·B Quiet Surface, Sliding Tabs는 A Soft Inset·C Sliding Underline 유지
- 제외: Route C Ledger, Sliding B Flush Segment
- 공용 `RouteTabs`·`RouteTab` 공개 API 추가: `hairline|quiet-surface`, `fullWidth`, 링크·`aria-current="page"` 의미 보존
- 공용 `Tabs` variant를 `soft-inset|sliding-underline`로 수렴하고 `fullWidth` API와 Motion highlight를 공용 소유권으로 이동
- UI Lab의 페이지별 selected·focus·indicator CSS를 제거하고 선택된 네 variant를 공용 컴포넌트로 교체
- 제품 적용: 오늘 화면의 인사이트 분류 탭을 `sliding-underline`과 공용 Motion highlight로 교체; Route Tabs는 현재 적합한 제품 사용처가 없어 가짜 연결을 만들지 않음
- 검증: 공개 props fixture typecheck, 관련 Node 계약 15건, web typecheck, `git diff --check`
- Codex 인앱 브라우저: desktop Route·Sliding 선택, URL 의미 분리, 승인된 variant 4종만 렌더링, 390px 전체 44px target·nowrap·가로 overflow 없음 확인

### 2026-08-03 — 3B Side Tab + Side List 목업 기준 확정

- 의미 계약: Side Tab은 같은 화면 내부의 패널 전환, Side List는 실제 경로 이동 링크로 구분
- Side Tab은 `tablist`·`tab`·`tabpanel` 상태와 키보드 이동을 유지하며 URL을 바꾸지 않음
- Side List는 실제 `href`와 `aria-current="page"`를 제공하고 modified click 기본 동작을 보존
- 두 기능군은 UI Lab에서 각각 세 가지 시각 방향으로 비교한 뒤 승인된 variant만 공용화

### 2026-08-03 — 3B Side Tab + Side List 사용자 승인

- Side Tab: A Hairline Rail, B Soft Inset, C Framed Stack 모두 유지
- Side List: A Quiet Rows, B Soft Surface, C Compact Rail 모두 유지
- 여섯 시안은 상황별 public variant로 공용화하며 Side Tab과 Side List의 의미 계약은 섞지 않음

### 2026-08-03 — 3B Side Tab + Side List 검증 완료

- 공용화 커밋: `08c9899`, 비활성 링크·감소 모션 보정: `5cc9a56`
- 공용 `SideTabs`는 `hairline-rail|soft-inset|framed-stack`, 공용 `SideList`는 `quiet-rows|soft-surface|compact-rail` variant를 공개 API로 제공
- UI Lab은 승인된 A/B/C 여섯 시안을 공용 컴포넌트로 교체하고 페이지 소유 선택·focus·indicator 모션을 제거
- 제품 적용: 워크스페이스 확장형 내비게이션은 `quiet-rows`, 모바일은 `soft-surface`, 축소형은 `compact-rail`을 사용하며 TanStack Link·preload·pending·count·Tooltip 계약을 유지
- Side Tab은 같은 화면 내부의 수직 패널 전환이 필요한 실제 제품 사용처가 없어 가짜 기능에 연결하지 않고 UI Lab 계약으로 보존
- Codex 인앱 브라우저 단일 탭에서 Side Tab 클릭·키보드 전환, Side List SPA 경로·선택 indicator, 실제 워크스페이스 확장 210px·축소 68px·선택 상태·가로 overflow 0을 확인
- 검증: 공개 props fixture, web typecheck, 관련 Node 34건, design hard 17건, Playwright desktop/mobile 10건, 소유 파일 lint·format, `git diff --check`

### 2026-08-03 — 3C Breadcrumb + Pagination 사용자 승인

- Breadcrumb: A Hairline Trail, B Soft Current, C Compact Ledger 모두 유지
- Pagination: A Hairline Pages, B Soft Inset Track, C Compact Ledger 모두 유지
- Pagination mode 경계는 `pages|compact|cursor`로 유지하며 cursor에 존재하지 않는 전체 페이지 수를 만들지 않음
- Codex 인앱 브라우저 A/B/C 비교 후 여섯 시안 모두 사용자 승인 완료
- 다음 행동: 승인 variant를 `shared/ui` 공개 API로 공용화하고 실제 제품 사용처를 감사
- 제품 Breadcrumb 감사: 현재 화면에는 보이는 계층 경로를 소유하는 사용처가 없어 `no suitable product breadcrumb use yet`으로 기록하며 가짜 제품 Breadcrumb를 추가하지 않음

### 2026-08-03 — 3C Breadcrumb + Pagination 공용화·제품 감사

- 공용 `Breadcrumb`와 `Pagination`은 승인된 `hairline|soft-inset|ledger` variant와 semantic anatomy를 공개함
- UI Lab A/B/C는 공용 API를 사용하며 query를 변경하지 않는 로컬 상태로 세 시안을 동기화하고 Select 생략 페이지 이동과 38px compact option 계약을 유지함
- Today·Radar·History의 기존 opaque cursor footer는 공용 `CursorPagination` composition으로 교체하며 handler·label·loading·error·disabled·retry·test id를 보존하고 숫자 전체 페이지 수를 만들지 않음
- 제품 Breadcrumb는 보이는 계층 경로 소유자가 없어 `no suitable product breadcrumb use yet`으로 감사 완료했으며 가짜 hierarchy를 추가하지 않음

### 2026-08-03 — 3C Breadcrumb + Pagination 검증 완료

- 공용 API 커밋: `82e76a3`, disabled `asChild` 보정: `8fa6a91`, UI Lab·제품 적용: `ca52ba7`, 통합 계약 보정: `5e9efc7`
- 공용 API와 제품 적용은 두 차례 독립 리뷰에서 spec·quality 모두 승인됨
- Node 계약 8건, web typecheck, 소유 파일 lint·format, `git diff --check`, focused desktop Playwright 3건 통과
- Codex 인앱 브라우저 6110 단일 탭에서 38px Select option, 8페이지 A/B/C 동기화, URL 고정, 1페이지 이전 버튼의 native disabled·`aria-disabled`·`tabIndex=-1`을 확인
- 3C 카탈로그는 `완료` 탭으로 이동하고 다음 활성 묶음을 3D Stepper + CommandPalette로 전환

### 2026-08-03 — UI Lab 진행 상태와 완료 카탈로그 정리

- 상단을 `완료 | 목업 진행 중 | 예정` 세 상태로 나눠 현재 3C 비교와 확정 컴포넌트를 분리
- 완료 탭은 Input·Textarea, Button, Select·Combobox, Checkbox·Switch·ToggleGroup, Accordion·Card·Table, Dialog·AlertDialog·Toast와 1A~1E·3A·3B 카탈로그를 실제 상호작용 가능한 상태로 유지
- Accordion은 좌우 14px inset을 공통 적용하고, 기본 `editorial`은 무-hover single 예시, `surface-hover`는 multiple 예시로 분리
- Dialog·AlertDialog overlay는 100ms에 퇴장하고 즉시 pointer interaction을 해제하며 footer의 구분선과 별도 배경을 제거
- Dialog·AlertDialog 콘텐츠 퇴장은 80ms로 제한해 Portal과 Radix scroll lock을 120ms 안에 함께 해제
- 읽기 전용 Dialog는 X 하나만 제공하고, Form·Decision Dialog는 실제 footer 액션을 유지하며, AlertDialog는 X 없이 취소·확인 액션을 명시
- UI Lab의 Side List는 사용자 비교가 끊기지 않도록 URL 이동 없이 선택 indicator와 콘텐츠만 전환; 공용 `SideList`와 실제 제품의 링크 계약은 유지
- 3C Breadcrumb·Pagination도 UI Lab query를 변경하지 않고 로컬 선택 상태만 전환
- Breadcrumb B는 separator와 현재 surface 사이 7px 간격을 확보하고, Pagination ellipsis는 공용 Select와 재사용 가능한 `popupMinWidth`를 이용해 생략 구간의 페이지를 바로 고르는 interaction으로 전환
- 공용 Select option의 Motion visual `min-height` 상속을 끊어 `compact`의 선언 높이와 실제 높이를 38px로 일치
- Codex 인앱 브라우저 6110 단일 탭에서 완료 카탈로그 전체 노출, Side List URL 고정, Dialog overlay opacity 0, Accordion single/multiple과 좌우 여백 확인
- 후속 검증: Dialog 종료 120ms 후 Portal·overlay·scroll lock 0, ellipsis에서 8페이지 선택 시 URL 고정·세 시안 상태 동기화, Breadcrumb B 간격 확인

### 2026-08-03 — 3D Stepper + CommandPalette 목업 구현

- Stepper A Hairline Flow, B Soft Track, C Ledger Steps는 하나의 로컬 단계 상태를 공유하며 URL을 변경하지 않음
- CommandPalette A Compact Command, B Split Context, C Quick Actions는 공용 Dialog·Input·Button으로 구성하고 새 패키지를 추가하지 않음
- `Cmd/Ctrl+K`, 검색, ArrowUp·ArrowDown, Enter, Escape, 빈 결과와 로컬 실행 결과를 지원함
- B는 데스크톱 split preview와 모바일 단일 열을 제공하고 C는 최근 항목·빠른 액션 밀도로 압축함
- 사용자 시각 피드백에 따라 Stepper A의 현재 단계를 가로 막대 대신 작은 채움 점으로 정리하고, 점이 hairline을 따라 spring으로 이동하도록 보완함. CommandPalette 검색 포커스는 좌우 inset·10px radius·1px 내부 링으로 낮춤
- 사용자 시각 승인: Stepper A/B/C와 CommandPalette A/B/C를 모두 유지하기로 확정함
- 승인된 여섯 시안을 `shared/ui/stepper`와 `shared/ui/command-palette` 공개 API로 공용화하고 UI Lab도 해당 공개 컴포넌트를 직접 사용하도록 전환함
- 실제 제품의 pages·widgets·features·entities 사용처를 감사했으나 현재 적합한 Stepper·CommandPalette 사용처가 없어 제품 기능을 추가하지 않음
- 검증: Stepper·CommandPalette Node 계약 2건, public props fixture, web typecheck, Oxfmt·Oxlint, 전용 Playwright 13건과 Axe 집중 검사 통과
- Codex 인앱 브라우저 6110 단일 탭에서 공용 Stepper A/B/C 루트와 현재 단계 3개, CommandPalette A 포커스·검색·실행, B preview, C compact groups, Escape 종료와 URL 고정을 확인함
- 같은 탭에서 Stepper A 채움 점의 단계 구분·이동 애니메이션과 CommandPalette의 둥근 1px 포커스 링을 시각 재확인함
- 다음 행동은 통합된 4A Menu & Overlay A/B/C 목업 비교를 시작하는 것임

### 2026-08-04 — 남은 UI 묶음 재편과 4A 설계 승인

- 목업 단위를 과도하게 세분화하지 않도록 남은 예정 항목을 `Menu & Overlay`, `Identity & Content`, `Data & Feedback`, `Charts End-to-End` 네 묶음으로 통합함
- UI Lab `예정` 탭의 카드도 같은 네 묶음으로 축소하기로 확정함
- 4A는 DropdownMenu·ContextMenu·Popover·Drawer·Sheet·BottomSheet를 하나의 통합 디자인 언어 A/B/C로 비교함
- DropdownMenu와 ContextMenu는 동일한 리서치 액션을 공유하고, 메뉴형 checkbox·radio·submenu는 목업 범위에서 제외함
- 목업은 URL과 실제 데이터를 변경하지 않고 UI Lab 로컬 결과만 표시함
- 검증은 소스 계약 1~2건, 핵심 상호작용 1건, 모바일·감소 모션·Axe 통합 1건과 변경 범위 정적 검사로 제한함
- 다음 행동은 승인된 4A 설계 문서를 검토한 뒤 구현 계획을 작성하는 것임

### 2026-08-04 — 4A Menu & Overlay 목업 구현

- A Hairline, B Soft Surface, C Compact Ledger를 DropdownMenu·ContextMenu·Popover·Drawer·Sheet·BottomSheet 여섯 표면에 같은 디자인 언어로 적용함
- DropdownMenu와 ContextMenu는 일반 액션·아이콘·단축키·구분선·비활성 상태를 포함한 동일 리서치 액션 배열을 공유함
- Drawer는 왼쪽, Sheet는 오른쪽, BottomSheet는 아래쪽에서 열리며 같은 선택 근거 내용을 표시함
- 완료된 Stepper·CommandPalette 카탈로그는 `완료` 탭으로 이동하고 `예정` 카드는 네 통합 묶음으로 축소함
- 메뉴 실행은 UI Lab 로컬 `aria-live` 결과만 갱신하며 기존 URL과 제품 데이터는 변경하지 않음
- 검증: Menu & Overlay Node 모델 계약 2건, web typecheck, 변경 파일 Oxfmt·Oxlint, 전용 Playwright 2건과 Axe 집중 검사 통과
- Codex 인앱 브라우저 6110에서 A/B/C 여섯 표면 렌더링, DropdownMenu A 실행 결과와 URL 고정을 확인하고 사용자 시각 승인 대기 상태로 전환함
- 사용자 피드백에 따라 A Hairline의 메뉴·Popover·trigger 라운드를 키우고, C Compact Ledger의 과도한 직각 표현과 BottomSheet 좌우 비대칭을 보정함
- 공용 Sheet 종료를 Dialog 계열과 같은 계약으로 맞춰 overlay·content가 닫힘 즉시 포인터를 놓고 각각 100ms·80ms 안에 퇴장하도록 변경함
- 회귀 계약은 닫힘 20ms 뒤 overlay `pointer-events: none`, 120ms 뒤 Portal·스크롤 잠금 제거, 390px BottomSheet 좌우 여백 대칭을 직접 검증함
- 사용자는 여섯 표면 모두 A Hairline과 B Soft Surface를 채택하고 C Compact Ledger를 제외함
- DropdownMenu·ContextMenu·Popover는 A/B variant를 제공하는 `shared/ui/menu-overlay` 공개 API로 공용화하고 UI Lab도 해당 공개 API를 사용하도록 전환함
- Drawer·Sheet·BottomSheet는 기존 공용 Sheet에 A/B variant를 추가해 같은 디자인 언어와 빠른 종료 계약을 공유함
- 실제 제품에서는 모바일 워크스페이스 내비게이션 Sheet에 B Soft Surface를 적용함
- DropdownMenu·ContextMenu·Popover에는 현재 적합한 일반 제품 사용처가 없어 가짜 기능을 추가하지 않았으며, 특화된 SplitButton·DatePicker 계열의 내부 Radix 사용도 억지로 교체하지 않음
- 승인된 Menu & Overlay 카탈로그는 UI Lab `완료` 탭으로 이동하고 예정 카드에서 5A Identity & Content를 `다음`으로 표시함
- 공용화 검증: Menu & Overlay 모델·워크스페이스 오버레이 Node 계약 9건, public props fixture, web typecheck, 변경 파일 Oxfmt·Oxlint, 전용 Playwright 2건 통과
- Codex 인앱 브라우저 6110에서 완료 탭에 A/B 두 카드만 남고 C가 제거된 상태와 B Sheet의 실제 열림을 확인함
- 다음 행동은 5A Identity & Content 통합 목업 비교를 시작하는 것임

### 2026-08-04 — 5A Identity & Content 목업 설계 승인

- Avatar, Badge, Status, List, Timeline, Carousel을 하나의 공통 디자인 언어로 묶지 않고 컴포넌트별 독립 A/B/C로 비교함
- UI Lab 내부 상단 수평 탭으로 여섯 컴포넌트를 나누고 선택한 컴포넌트의 A/B/C만 표시함
- List, Timeline, Carousel은 동일한 데모 데이터와 현재 선택 상태를 세 시안이 공유함
- 390px 수평 탭 스크롤, 44px 터치 영역, 키보드, 감소 모션, Axe 계약을 목업 단계부터 포함함
- 완료된 Menu & Overlay는 `예정` 카드에서 제거하고 Identity & Content, Data & Feedback, Charts End-to-End 세 카드만 남김
- 검증은 Node 2건, Playwright 2건, web typecheck와 변경 파일 정적 검사로 제한하며 전체 테스트·빌드는 실행하지 않음
- 설계 문서: `docs/superpowers/specs/2026-08-04-identity-content-mockups-design.md`
- 구현 계획: `docs/superpowers/plans/2026-08-04-identity-content-mockups.md`

### 2026-08-04 — 5A Identity & Content 목업 구현

- UI Lab `목업 진행 중` 탭에 Avatar, Badge, Status, List, Timeline, Carousel 여섯 수평 탭을 추가하고 각 컴포넌트의 독립 A/B/C 시안을 구현함
- List, Timeline, Carousel은 세 시안이 같은 현재 선택 상태를 공유하며 탭을 옮겨도 선택이 유지됨
- 사용자 피드백에 따라 List는 선택 행·마커 안착, Timeline은 현재 행·포인트 연결, Carousel은 이전·다음 카드가 잠시 겹치며 탐색 방향으로 포개지는 스택 전환을 추가하고 감소 모션에서는 즉시 전환하도록 유지함
- `예정` 카드는 완료된 Menu & Overlay를 제거하고 Identity & Content, Data & Feedback, Charts End-to-End 세 묶음만 표시함
- `완료` 탭의 Button 데모는 하나의 `새로고침` 액션이 `불러오는 중`에서 `새로고침 완료`로 전환되고 다시 실행되는 반복 상태를 제공함
- 개발 모드 effect 재실행이 클릭 핸들러에서 만든 타이머를 취소하던 문제를 확인하고, pending 상태를 구독하는 effect가 타이머의 생성과 정리를 함께 소유하도록 보정함
- 390px 수평 탭 스크롤, 44px 터치 영역, 키보드 탭 전환, 감소 모션, Axe 접근성을 전용 Playwright 계약에 포함함
- Node 모델 계약 3건, 전용 Playwright 2건, web typecheck와 변경 파일 정적 검사를 사용하며 전체 테스트·빌드는 실행하지 않음
- Codex 인앱 브라우저 6110에서 여섯 컴포넌트 탭, List·Timeline 공유 선택과 Carousel 방향 전환 모션, 반복 새로고침 상태 전환을 확인함
- 다음 행동은 여섯 컴포넌트 각각 유지할 A/B/C 시안을 한 번에 사용자에게 확인하는 것임

### 2026-08-04 — 5A Identity & Content 승인·공용화 완료

- 사용자 승인: Avatar, Badge, Status, List, Timeline, Carousel의 A/B/C를 모두 유지함
- `shared/ui/identity-content` 공개 API로 여섯 컴포넌트와 각 variant를 공용화하고, UI Lab의 페이지 소유 렌더링·선택 모션·Carousel 스택 전환을 공개 컴포넌트로 교체함
- List·Timeline·Carousel은 controlled `value`와 `onValueChange`를 통해 동일한 선택 상태를 공유하며, Carousel은 방향에 따라 이전·다음 카드가 겹치는 전환과 감소 모션 즉시 전환을 공용 계약으로 소유함
- 실제 제품 적용: 관리자 가입 코드 화면의 Owner/Admin 역할과 초대 상태를 `IdentityBadge`의 `soft-fill|dot-label` variant로 교체함
- 제품 사용처 감사: Avatar, StatusIndicator, ContentList, ContentTimeline, Carousel은 현재 적합한 사용처가 없어 가짜 제품 기능을 추가하지 않음. 기존 workspace Timeline과 종목 상세 StatusBadge는 의미가 달라 유지함
- UI Lab 카탈로그는 `완료` 탭으로 이동하고 현재 묶음을 5B Data & Feedback으로 전환했으며, `예정` 카드는 Data & Feedback과 Charts End-to-End 두 개만 남김
- 검증: Identity & Content 모델 Node 1건, Menu & Overlay 회귀 Node 1건, public props fixture, web typecheck, 관리자 초대 관련 Node 계약, 변경 파일 Oxfmt·Oxlint, 전용 Playwright 2건과 Axe 집중 검사
- Codex 인앱 브라우저 6110에서 여섯 컴포넌트별 A/B/C 공개 루트, List·Timeline의 선택 상태 3개 동기화, Carousel 전환 중 카드 2개 겹침과 종료 후 1개 복귀를 확인함
- 다음 행동은 5B Data & Feedback 통합 A/B/C 목업 비교를 시작하는 것임

### 2026-08-04 — 5B Data & Feedback 목업 설계 승인

- Table 확장, DataGrid, Progress, Spinner, Skeleton, Empty, Error, Loading을 각각 수평 탭으로 나누고 컴포넌트별 독립 A/B/C를 비교함
- Table은 정렬·선택·행 펼침, DataGrid는 정렬·선택·셀 편집·열 리사이즈·1,000행 실제 가상 스크롤을 세 시안 모두 제공함
- DataGrid A/B/C는 데이터, 정렬, 선택, 편집 결과, 열 너비를 공유하며 URL과 실제 제품 데이터는 변경하지 않음
- 새 table·virtualization 패키지 없이 UI Lab 경계의 고정 행 높이 virtualizer를 사용함
- Progress와 Loading은 완료 후 다시 실행 가능하며 Spinner·Skeleton 모션은 감소 모션에서 정적 상태로 대체함
- 목업 단계에서는 기존 Table·Skeleton·Feedback 공개 API와 제품 사용처를 변경하지 않음
- 검증은 Node 2건, Playwright 2건, web typecheck와 변경 파일 정적 검사로 제한하며 전체 테스트·빌드는 실행하지 않음
- 설계 문서: `docs/superpowers/specs/2026-08-04-data-feedback-mockups-design.md`
- 다음 행동은 승인된 설계의 구현 계획을 작성하는 것임

### 2026-08-04 — 5B Data & Feedback 목업 구현

- UI Lab `목업 진행 중` 탭에 Table, DataGrid, Progress, Spinner, Skeleton, Empty, Error, Loading 여덟 수평 탭을 추가하고 각 컴포넌트의 독립 A/B/C 시안을 구현함
- Table은 A Expandable Rows, B Sticky Surface, C Compact Ledger가 정렬·복수 선택·연결 근거 펼침 상태를 공유함
- DataGrid는 A Precision Grid, B Soft Sheet, C Dense Matrix가 결정적 로컬 1,000행, 정렬, 선택, `note|status` 셀 편집, 포인터·키보드 열 리사이즈를 공유함
- DataGrid virtualizer는 고정 44px 행, 320px 뷰포트, overscan 6을 사용하며 새 런타임 의존성 없이 실제 보이는 범위만 마운트함
- DataGrid 키보드 계약은 Arrow, Home, End, Enter, F2, Escape를 포함하고 열 separator는 ArrowLeft·ArrowRight로 8px씩 너비를 조절함
- Progress A Hairline Progress·B Soft Meter·C Segmented Track과 Loading A Skeleton First·B Progress Panel·C Staged Ledger는 완료 후 다시 실행하는 순환 상태를 공유함
- Spinner A Orbit·B Three Dot·C Signal Sweep, Skeleton A Quiet Blocks·B Shimmer Surface·C Ledger Rows, Empty A Quiet Empty·B Guided Empty·C Inline Empty, Error A Quiet Alert·B Recovery Panel·C Inline Critical을 각각 독립 비교로 추가함
- Error는 카탈로그 단일 assertive 영역만 소유하고 Progress·Loading·Empty 액션은 polite 결과를 공유하며, 감소 모션에서 진행·스피너·시머·로딩 애니메이션을 정지함
- 자동 검증: Data & Feedback Node 모델 계약 2건, 전용 Playwright 2건(공유 Table·DataGrid 상호작용, 390px·감소 모션·Axe), web typecheck, 변경 파일 Oxfmt·Oxlint, `git diff --check` 통과
- Codex 인앱 브라우저 6110에서 여덟 탭·선택된 탭의 세 카드, Table 공유 펼침·선택, DataGrid 공유 정렬·편집·선택·열 너비, 각 grid `aria-rowcount=1001`·마운트 행 15개, Loading의 `pending → complete` 2회 반복과 URL 고정을 확인함
- 목업 단계에서 `shared/ui` 공개 API와 제품 사용처는 변경하지 않았으며, 다음 행동은 여덟 컴포넌트의 A/B/C 사용자 시각 승인임

### 2026-08-04 — 5B Data & Feedback 1차 시각 피드백 반영

- 상단 컴포넌트 탭의 트리거와 하단 선택선을 같은 고정 폭 안에서 중앙 정렬하고, 좁은 화면에서도 동일한 기준을 유지함
- Table 정렬 시 실제 행 위치가 이동하는 spring 모션과 연결 근거 행의 높이·투명도 전환을 추가하고, 기존 공용 `TableSelectionSummary`를 연결해 복수 선택 상태와 선택 해제를 세 시안에 함께 표시함
- DataGrid는 가상 스크롤 정렬로 가시 행 집합이 교체되는 경우에도 짧은 교차 진입 모션을 제공하며, A는 정밀 격자·B는 수직선 없는 소프트 시트·C는 고정 식별 열만 강하게 구분하는 밀집 매트릭스로 열선과 헤더 대비를 분리함
- Empty·Error·Loading은 세 시안 모두 카드 중앙축에 맞추고, Loading은 Skeleton First·Progress Panel·Staged Ledger의 시각 구조를 실제로 다르게 표현함
- Codex 인앱 브라우저 6110에서 탭 선택선 중심, Table 정렬 transform·근거 펼침·선택 요약 3개, DataGrid 정렬 진입 transform·A/B/C 열선 차이, Empty·Loading 중앙 정렬과 브라우저 오류 0건을 확인함
- 전용 Playwright 2건과 web typecheck를 통과했으며, 사용자 시각 승인 전이므로 `shared/ui` 공개 API와 제품 사용처는 변경하지 않음

### 2026-08-05 — 5B Data & Feedback 2차 시각 피드백 반영

- Table의 종목·기업·점수·상태와 DataGrid의 여섯 데이터 열 헤더에 미정렬·오름차순·내림차순 화살표를 표시하고, 헤더 전체 클릭으로 세 상태를 순환함
- AG Grid의 기본 헤더·행 애니메이션·테마 경계 구조를 참고하되 의존성은 추가하지 않고, 본문은 수평 행선 중심으로 단순화하며 열 구분은 헤더 리사이저와 C의 고정 종목 열 경계에만 유지함
- Skeleton은 A Block Pulse, B Surface Sweep, C Row Scan으로 모두 움직임을 제공하고 B의 이동 광택 대비를 높여 표면 이동이 명확히 보이도록 조정함
- 5B 탭의 자동 높이 overflow 래퍼를 제거하고 카드 묶음 하단에 24px 여백을 포함해 세로 배치에서 마지막 C 카드가 전환 중 잘리지 않도록 수정함
- Codex 인앱 브라우저 6110에서 헤더 화살표, B 스윕 강조, 세 Skeleton 모션 실행 상태와 C 하단 24px·overflow visible을 확인함
- 사용자 시각 승인 전이므로 목업 경계만 변경했고 `shared/ui` 공개 API와 제품 사용처는 변경하지 않음

### 2026-08-05 — 5B 부분 승인 및 DataGrid·Skeleton 재비교

- 사용자 승인에 따라 Table, Progress, Spinner, Empty, Error, Loading은 각 A/B/C 세 시안을 모두 유지 대상으로 확정함
- DataGrid와 Skeleton은 이번 승인에서 제외하고 목업 비교를 계속하며, 아직 `shared/ui` 공개 API와 제품 사용처로 공용화하지 않음
- DataGrid는 AG Grid·shadcn Data Table·React Spectrum TableView의 헤더 패턴을 참고해 빈 선택 헤더를 전체 선택 체크박스로 바꾸고, 정렬 라벨 바로 옆 6px 위치에 상태 화살표를 배치하며 활성 정렬 헤더만 낮은 강조 면을 사용하도록 정리함
- DataGrid A는 드러난 리사이저와 정밀한 단일 외곽선, B는 필요할 때만 리사이저가 나타나는 소프트 시트, C는 고정 종목 열 경계와 높은 헤더 대비를 유지해 같은 동작 안에서 밀도를 구분함
- Skeleton은 A의 다섯 블록 크기·순서·간격을 세 시안에 동일하게 고정하고 A Block Pulse, B Surface Sweep, C Staggered Blocks로 내부 블록 모션만 다르게 구성함
- Motion Skeleton의 실제 콘텐츠와 같은 골격 유지 원칙과 transform·opacity 중심 모션을 반영하고, 감소 모션에서는 블록 및 sweep 애니메이션을 정지함
- Codex 인앱 브라우저 6110에서 DataGrid 세 시안의 점수 오름차순 공유, 모든 정렬 라벨·아이콘 6px 간격, 전체 선택 3개 동기화와 Skeleton 동일 블록 치수·세 모션 실행 상태를 직접 확인함
- 전용 Playwright 2건에서 DataGrid 헤더 선택·정렬 간격과 Skeleton 동일 골격·서로 다른 모션 계약을 통과함

### 2026-08-05 — Skeleton 최종 승인 및 DataGrid 고정 영역 보정

- 사용자 승인에 따라 Skeleton의 A Block Pulse, B Surface Sweep, C Staggered Blocks를 모두 유지 대상으로 확정함
- A Block Pulse는 이동량을 키우지 않고 블록 명도 대비를 높이며 2.2초 주기로 늦춰, 더 잘 보이면서도 잔잔한 호흡으로 조정함
- DataGrid C Dense Matrix는 선택 체크박스 열과 종목 열을 좌측 고정 영역으로 함께 묶고, 고정 종목 열의 좌우에 1px 수직 경계를 표시해 스크롤 영역과의 관계를 분명히 함
- DataGrid는 사용자 최종 확정 전까지 목업 비교 상태를 유지하며 `shared/ui` 공개 API와 제품 사용처로 공용화하지 않음

### 2026-08-05 — DataGrid 가상 스크롤·경계·편집 보정

- 빠르게 하단으로 이동한 뒤 즉시 상단으로 복귀하면 가상 범위는 1행부터 정상 계산되지만, 가상 행의 `layout="position"` FLIP가 이전 하단 위치를 기준으로 수천 px transform을 적용해 상단이 비어 보이는 원인을 확인함
- 가상 행 자체의 layout·exit 모션을 제거하고 정렬 키가 바뀔 때만 내부 가시 창에 160ms opacity·6px 전환을 적용해, 스크롤은 즉시 배치하면서 정렬 피드백은 유지함
- C의 체크박스 열과 종목 열은 하나의 좌측 고정 그룹으로 유지하되 두 열 사이 경계는 제거하고, 비고정 열과 맞닿는 종목 열 오른쪽에만 강한 고정 경계를 표시함
- 고정 경계와 별개로 `수직선` 옵션을 추가해 A/B/C 세 시안의 일반 데이터 열에 낮은 opacity의 수직선을 함께 켜고 끌 수 있게 함. 일반 수직선은 약한 색, C의 고정 경계는 강한 색으로 구분함
- 종목·기업·점수·상태·메모·출처 셀을 더블클릭 또는 Enter/F2로 편집할 수 있게 확장하고, 점수는 0~100 숫자, 상태는 기존 선택 목록, 나머지는 텍스트 입력을 사용함
- Codex 인앱 브라우저에서 43,000px 하단 이동 후 16ms 내 상단 복귀 시 첫 행 top gap 44px·transform none, 세 시안 수직선 동기화, C 고정 그룹과 경계 색 차이, 종목 `TEST01`·점수 `88`의 세 시안 공유 편집을 확인함
- 전용 Playwright 3건과 모델 테스트 2건, web typecheck를 통과했으며 DataGrid는 사용자 최종 확정 전까지 목업 상태를 유지함

### 2026-08-05 — DataGrid 최종 시각 승인

- C Dense Matrix의 좌측 고정 그룹에서 체크박스 열과 종목 열이 같은 본문·헤더 표면 색을 사용하도록 통합해 두 열이 하나의 고정 영역으로 보이게 함
- 사용자 승인에 따라 DataGrid의 A Precision Grid, B Soft Sheet, C Dense Matrix를 모두 유지 대상으로 확정함
- 이 승인으로 5B Data & Feedback의 Table, DataGrid, Progress, Spinner, Skeleton, Empty, Error, Loading은 각 A/B/C 시안의 시각 선택을 모두 완료함
- 아직 목업 승인 단계만 완료했으며, `shared/ui` 공개 API 공용화와 제품 사용처 감사는 다음 단계로 남김

### 2026-08-05 — 5B Data & Feedback 공용화·제품 감사·검증 완료

- Table은 `expandable-rows`, `sticky-surface`, `compact-ledger` variant를 공개 API로 유지하고, 정렬·선택·행 확장 계약을 UI Lab과 공유함
- DataGrid는 `precision-grid`, `soft-sheet`, `dense-matrix` variant와 정렬·선택·열 크기·수직선·셀 편집·고정 높이 가상화 계약을 `shared/ui/data-grid` 공개 API로 공용화함
- Progress, Spinner, Skeleton, EmptyState, ErrorState, LoadingState의 승인된 A/B/C 표현과 감소 모션 계약을 `shared/ui/feedback` 공개 API로 공용화함
- UI Lab의 Data & Feedback을 `완료` 탭으로 이동하고 `목업 진행 중`에는 다음 묶음인 Charts End-to-End만 남김
- 제품 감사 결과 Stock Detail 진행률을 공용 Progress로, WorkspaceState 로딩 골격을 공용 Skeleton으로 연결함. 기존 Workspace Table과 ErrorState 사용은 유지하고, 읽기 전용 제품에 맞지 않는 편집형 DataGrid 및 별도 Spinner·LoadingState 사용처는 억지로 추가하지 않음
- Codex 인앱 브라우저 6110에서 공용 DataGrid 세 variant, 각 14개 가상 행, C의 체크박스·종목 고정 그룹 본문 및 헤더 표면 색 통합을 확인함
- 좁은 자동 검증으로 Data & Feedback 모델·공개 API 계약, 전용 Playwright의 Table·DataGrid 상호작용·빠른 상단 복귀·390px·감소 모션·Axe, web typecheck와 변경 파일 Oxfmt·Oxlint 및 `git diff --check`를 수행함
- 다음 활성 묶음은 6A Charts End-to-End이며, 차트 기반·시각 비교·공용화·제품 연결을 한 묶음으로 진행함

### 2026-08-05 — 6A Charts End-to-End 목업 구현·검증

- 결정론적 180개 OHLCV 일봉 fixture와 `1M|3M|6M|1Y` 구간, 세 근거 사건, 두 조건 구간, `ready|loading|stale|partial|empty|error|unavailable` 상태를 UI Lab 전용 모델로 고정함
- Bklit 기반 Market Tape A Quiet Trace·B Layered Range·C Signal Ledger와 Evidence Band A Band Ledger·B Event Pulse·C Evidence Split을 구현하고, 역할 내부 세 시안이 기간·브러시·근거 선택·조건 구간 표시를 공유하도록 연결함
- TradingView Lightweight Charts는 `shared/ui/chart/internal`의 동적 로딩 어댑터로 격리하고 Candle Ledger A Clean Candle·B Dual Pane·C Market Ledger의 OHLCV readout, 가격·거래량 pane, 크로스헤어, resize·cleanup 계약을 구현함
- 상단 수평 탭은 선택 역할의 세 차트만 마운트하며, 공통 기간·상태·통화·조건 구간 제어와 네이티브 데이터 표를 제공함. 목업 승인 전에는 공개 `shared/ui` 차트 API나 제품 사용처를 변경하지 않음
- Playwright 검증 중 Evidence SVG hit-area가 근거 목록 클릭을 가로막는 overflow와 중첩된 상위 Tabs 스타일이 390px 역할 선택선을 44px 면으로 키우는 문제를 발견해 각각 차트 열 경계와 2px indicator 소유 범위로 보정함
- 자동 검증: 차트 모델·upstream 경계 Node 5건, web typecheck, 변경 파일 Oxfmt·Oxlint, 전용 Playwright 3건에서 Market 브러시 동기화, Evidence 선택·밴드 공유, Candle 3개 마운트·390px·감소 모션·Axe를 통과함
- Codex 인앱 브라우저 6110에서 역할별 카드 3개만 렌더링, 데스크톱 툴바 열 간격, Evidence 9개 근거·6개 밴드, Candle renderer 3개, 390px page/catalog overflow 0과 2px 선택선을 직접 확인함
- 구현 커밋: `019008c`, `8afe12c`, `da4fffd`, `68cdd3c`, `d6c9508`, `1989004`, `503d0a5`, `d5ae435`, `5461273`
- 다음 행동은 Market Tape·Evidence Band·Candle Ledger 각각 유지할 A/B/C 시안을 한 번에 사용자에게 확인하는 것임

### 2026-08-05 — 6A 역할별 시각 승인·Evidence Band 개선 방향 확정

- Market Tape A Quiet Trace·B Layered Range·C Signal Ledger는 A/B/C를 모두 유지하기로 사용자 승인함
- Candle Ledger A Clean Candle·B Dual Pane·C Market Ledger는 A/B/C를 모두 유지하기로 사용자 승인함
- Evidence Band는 기존 세 시안의 chart 내부 의미 계층이 비슷하고 pattern·label·근거 목록이 분리돼 보이는 문제를 확인함
- Evidence Band A는 조건 구간 중심 Range Ledger, B는 사건 시점 중심 Event Pulse, C는 차트·근거 원장을 연결하는 Linked Evidence로 역할을 명확히 나누는 개선 방향을 사용자 승인함
- 기존 Bklit 경계를 유지하고 새 차트·애니메이션 의존성은 추가하지 않으며, 개선 목업의 사용자 시각 승인 전에는 공개 `shared/ui/chart` API나 제품 사용처를 변경하지 않음
- 다음 행동은 승인된 Evidence Band 개선 설계에 따라 A/B/C 목업을 수정하고 6110 UI Lab에서 시각 비교하는 것임

### 2026-08-05 — 6A Evidence Band 개선 목업 구현·검증

- A는 낮은 opacity의 solid 조건 구간과 세 행 compact ledger를 결합한 Range Ledger, B는 사건 marker·vertical guide와 근거 카드를 우선한 Event Pulse, C는 선택 요약·rail과 차트·원장을 연결한 Linked Evidence로 의미 계층을 분리함
- 분리된 dashed label chip 행과 넓은 pattern fill을 제거하고 plot 내부 compact legend, solid ReferenceArea, 가격선 우선순위와 선택 marker 계층을 적용함
- 900px 이하에서는 A/B 520px, 선택 요약이 있는 C 600px 고정 viewport로 적층해 세 근거 행이 모두 보이도록 했고, 390px에서 각 행 44px 이상과 catalog 가로 overflow 0을 유지함
- Vite SSR이 `@visx/*` alpha 패키지를 Node에 직접 넘겨 확장자 없는 ESM import에서 실패하던 6110 개발 서버 문제를 `ssr.noExternal` 범위 번들링으로 보정함
- 자동 검증은 Evidence Band source contract·chart model Node 4건, web typecheck, 변경 파일 Oxfmt·Oxlint, 전용 Playwright 3건에서 역할 copy·선택 동기화·band 제거·마지막 행 containment·390px·감소 모션·Axe를 통과함
- Codex 인앱 브라우저 6110에서 A의 세 ledger 행과 brush, B의 세 사건 카드와 marker guide, C의 선택 요약·rail, 1280px 65/35 split, 390px 단일 열과 `scrollWidth === clientWidth`를 직접 확인함
- 구현 커밋: `99bf6d2`, `8ed2eee`, `9f3b1f2`, `3daa47e`, `a69db95`
- 다음 행동은 개선된 Evidence Band A/B/C의 사용자 시각 승인이며, 승인 전에는 공개 `shared/ui/chart` API나 제품 사용처를 변경하지 않음

### 2026-08-05 — 6A Evidence Band TradingView 전환

- 사용자가 Bklit 기반 Evidence Band A/B/C의 차트 외부 범례와 별도 SVG annotation이 어색하다고 판단해 해당 개선안을 시각 승인 전에 폐기함
- Evidence Band의 가격 경로를 TradingView Lightweight Charts `AreaSeries`, 사건을 native series marker, 시간+가격 조건 구간을 series primitive로 전환해 한 chart pane 좌표계에서 렌더링함
- 차트 내부 HTML 범례를 제거하고 조건 구간의 면·경계·라벨을 primitive canvas가 직접 그리도록 변경함. 근거 목록은 키보드 접근과 상세 문맥을 위해 차트 외부 제어면으로 유지함
- A Range Ledger·B Event Pulse·C Linked Evidence의 공유 선택·기간·조건 구간 토글과 서로 다른 정보 배치는 유지함
- 검증은 Evidence Band·upstream·chart model Node 7건, web typecheck, 변경 파일 Oxfmt·Oxlint, Evidence 전용 Playwright 1건에서 canvas 3개·marker·primitive 상태·선택 동기화·390px·Axe를 통과함
- 1280px와 390px 실제 캡처에서 native 가격축·시간축·marker와 canvas 조건 구간이 동일 좌표계에 정렬되고 수평 overflow가 없음을 확인함
- 다음 행동은 TradingView로 전환된 Evidence Band A/B/C 사용자 시각 승인임. 승인 전에는 공개 `shared/ui/chart` API나 제품 사용처를 변경하지 않음

### 2026-08-05 — 6A Evidence Band A/B/C 전체 채택·디테일 보강

- 사용자가 TradingView 기반 Evidence Band A Range Ledger·B Event Pulse·C Linked Evidence를 모두 유지하기로 확정함
- 조건 구간 primitive 라벨에 실제 하한–상한 가격을 추가하고, 선택 근거에는 TradingView native price line·가격축 라벨·고정 crosshair를 연결해 사건 시점과 가격을 차트 안에서 직접 읽도록 보강함
- 기간 이동 뒤 crosshair가 이전 좌표에 남지 않도록 visible range 갱신 다음 frame에 원본 bar timestamp로 crosshair를 배치함
- 선택 marker의 중복 설명은 제거해 조건 구간 라벨과 겹치지 않게 하고, 상세 제목은 native price line과 외부 근거 원장이 담당하도록 정리함
- 검증은 Evidence Band·upstream Node 5건, web typecheck, Evidence 전용 Playwright 1건을 통과했고 1280px 실제 캡처에서 선택 시점 2026-02-15와 가격선 142.14가 같은 좌표에 정렬됨을 확인함
- 다음 행동은 보강된 디테일의 실제 화면 확인이며, 이후 승인된 A/B/C를 공개 `shared/ui/chart` API로 승격하고 제품 사용처를 감사함

### 2026-08-05 — Evidence Band 확대·이동 떨림 수정

- TradingView의 visible range 변경이 React 공용 상태를 거쳐 원본 차트의 `setVisibleRange`로 즉시 되돌아오고, 같은 render effect가 marker·price line·band까지 재생성해 내부 pan/zoom과 외부 동기화가 서로 경쟁하던 것이 떨림의 원인이었음
- 차트 인스턴스별 range echo guard를 추가해 원본 차트의 동일 range echo만 한 번 건너뛰고, 나머지 A/B/C 차트에는 외부 range를 계속 적용함
- bars·bands, range, evidence marker 갱신 효과를 분리해 pan/zoom 중 marker·price line·band를 재생성하지 않도록 변경함
- 회귀 계약은 source chart local echo 제외와 sibling range 허용을 검증하는 Node 1건을 추가했으며, 관련 Node 6건·web typecheck·Evidence Playwright 1건을 통과함
- 실제 wheel 확대와 좌우 drag 후 80ms 간격 canvas 4개 frame hash가 모두 동일해 이동 종료 뒤 잔여 떨림이 없음을 확인함

### 2026-08-05 — Evidence Band 인앱 브라우저 직접 조작 후속 보정

- 사용자가 여전히 미세한 떨림을 확인해 Codex 인앱 브라우저의 현재 30 bars 상태에서 A 차트에 연속 wheel 확대·축소와 긴 좌우 왕복 drag를 직접 수행함
- 첫 수정은 이동 종료 뒤 잔여 떨림은 제거했지만, sibling 차트의 `setVisibleRange`가 한 frame보다 늦게 같은 이벤트를 방출하면 시간 기반 suppression이 먼저 풀리고, 연속 range 이벤트가 React 상태를 매번 갱신하는 조작 중 경로가 남아 있었음
- local·external range를 각각 값으로 추적하는 coordinator를 도입해 source local echo와 delayed sibling programmatic echo를 모두 차단함
- 연속 pan/zoom range는 72ms trailing emitter가 마지막 값 하나만 React에 전달해 원본 TradingView 조작과 sibling 동기화가 같은 frame에서 경쟁하지 않도록 변경함
- 인앱 브라우저 직접 재검증에서 연속 확대·축소·왕복 이동 뒤 A/B/C가 모두 `33 bars`로 수렴했고 console warning·error 0건, 32ms 간격 6개 viewport frame hash가 모두 동일함을 확인함
- 회귀 테스트는 delayed sibling echo 차단과 연속 range 마지막 값 병합을 추가해 관련 Node 8건을 통과함

### 2026-08-07 — 내 종목 브리핑 경험 구현·자동 검증

- 승인된 holdings-first 방향에 따라 기존 종목 표와 12축 상세를 `브리핑 요약 → 우선 확인 보유 종목 최대 3개 → 전체 보유 종목 → 변동 관심 종목` 구조와 공용 상세 인스펙터로 교체하고 실제 Stocks 제품 화면에 연결함
- 결정론적 dev preview에 `surface=stocks`와 `scenario=default|no-holdings|empty|detail-error`를 추가했으며, 인증 loader나 live API 없이 보유 종목·관심 종목·상세 성공/실패 상태를 재현함
- Today Evidence와 Stocks 상세가 서로 다른 session-storage key를 사용하고, 초기 hydration 전 종목 클릭을 비활성화해 사용자 입력이 유실되지 않도록 고정함. 768–807px modal 경계는 초기 자동 검증 뒤 review에서 subpixel 안정성 보강 대상으로 다시 열림
- 종목 상세 문구는 `보유 논지 복기` 등 정보 제공 표현만 사용하고, 관련 뉴스는 유효한 HTTPS 출처 링크를 유지함
- 최종 자동 검증: Stocks Playwright desktop/mobile 22건 통과·조건부 8건 skip, Today 회귀 22건 통과·조건부 10건 skip, focused Node 38건, web Node 684건, 전체 10개 테스트 task, format·lint·typecheck·build를 통과함. dark mode·reduced motion·Axe·선택 일관성·overlay close-only·resize/session memory·drawer/modal 무요청 전환·빈 상태·상세 오류 상태를 포함함
- `pnpm verify:release`는 lint·typecheck·fixture typecheck·전체 테스트·hard design gate까지 통과한 뒤, 현재 셸에 `P6_REHEARSAL_ADMIN_DATABASE_URL`이 없어 `test:p6:db`에서 `ERR_INVALID_URL` (`input: ''`)로 중단됨. 그 뒤의 `test:xg:db`·build·browser/production visual gate는 이 실행에서 시작되지 않음
- `graphify update .` 완료: 10,637 nodes, 18,093 edges, 744 communities. 기존 graphify 버전 차이·선택 SQL parser 부재 경고는 유지됨
- Codex 인앱 브라우저 확인: `/__dev-preview?surface=stocks`를 1440×1000과 390×844에서 확인함. desktop drawer 요약값은 약 124px 유효 폭과 한 줄 높이를 유지했고, 넓은 modal 전환·390px 하단 modal·모바일 전환 버튼 미노출을 확인함. `no-holdings`는 `0개 / — / — / —`와 관심종목 우선 배치를 확인함
- 구현·검증 커밋: Task 3–5 `f723d94`, `ead0364`, `d94abd9`, Task 6 `2d87732`, review 보정 `f60b8c9`, 최소 폭 회귀 `93c98cb`

### 2026-08-07 — 내 종목 브리핑 review 보정 1차

- 520px drawer의 종목 요약 카드가 공용 `PropertyList`의 `92px + 나머지` 내부 열을 상속해 값 열이 0px에 가까워지던 원인을 확인하고, drawer presentation에서만 각 카드 내부를 한 열로 적층함. modal의 넓은 3카드 배치와 mobile 적층은 유지함
- `no-holdings` fixture가 보유 수만 0으로 바꾸고 연결 뉴스 8건·리스크 3건·분석 시각을 남기던 모순을 제거해, 세 미지원 집계를 각각 `—`와 접근 가능한 unavailable label로 표시함
- 768–807px modal은 quick motion이 안정된 두 animation frame 뒤 geometry를 측정하고 CSS 폭을 `100vw - 52px`로 보정해 양쪽 26px 설계 여유를 확보함. 경계 회귀 20회 반복에서 20/20 통과함
- fresh 자동 검증: Stocks Playwright desktop/mobile 22건 통과·조건부 8건 skip, Today 회귀 22건 통과·조건부 10건 skip, focused Node 38건, 전체 10개 테스트 task, format·lint·typecheck·build 통과
- review 2차에서는 drawer 요약 회귀를 실제 separator와 session storage 경로로 확장해 기본 520px와 최소 420px 모두에서 inspector 폭, 각 값의 유효 폭, 가격·변화율 1줄과 분석 기준 최대 2줄을 검증함. 첫 실행부터 현재 구현이 계약을 만족했고 12회 반복 12/12, fresh Stocks desktop/mobile 22건 통과·조건부 8건 skip을 기록해 production 코드는 변경하지 않음
- Codex 인앱 브라우저 재확인: 1440×1000 drawer에서 가격·변화율·분석 기준이 모두 한 줄로 표시되고 `dd` 유효 폭이 약 124px임을 확인함. 390×844 하단 modal에서 동일 값이 한 줄로 유지되고 desktop 전환 버튼이 노출되지 않음을 확인했으며, `no-holdings`의 정직한 집계와 관심종목 우선 순서도 직접 확인함

### 2026-08-07 — 내 종목 브리핑 최종 전체 review 보정 완료

- 종목 상세 요약에 `종목 상태`, `연결 뉴스`, `근거 수준`을 추가했다. 보유·관심 플래그는 독립적으로 표시해 두 상태가 함께인 종목을 `보유종목 · 관심종목`으로 보존한다.
- 근거 수준은 페이지 로컬 optional union (`high|medium|low`)으로만 추가했다. 결정론적 preview의 보유 상세는 `높음`, 관심 상세는 `중간`으로 고정했고, 실제 상세 loader는 수준을 추론하지 않아 `명시적 데이터 없음`을 표시한다. 추가 request나 refetch는 없다.
- Today 상세는 viewport에 관계없이 열기 버튼을 캡처하고 닫힌 후 연결된 원본 카드로 포커스를 되돌린다. Stocks의 기존 opener 계약과 공용 Dialog 프레임은 변경하지 않았다.
- TDD RED는 preview 근거 수준 `undefined`, 상세 메타 미노출, 모바일 Today 닫기 후 opener `inactive`를 각각 재현했고, focused Node 20건과 포커스/상세 문맥 browser 계약이 GREEN으로 전환됨을 확인했다.
- Today·Stocks desktop/mobile 표준 4-worker 통합 재검증은 47건 통과·17건 viewport 조건 skip·0건 실패다. 이전 병렬 실행에서 session-width 재열기 1건이 일회성으로 실패했지만 workers=1 격리 재실행과 표준 4-worker fresh 재실행에서 모두 통과해 재현되지 않았다.
- fresh 전체 gate는 format 1,313개 파일, lint 0 errors(7개 기존 warning), typecheck 11/11 tasks, test 10/10 tasks(web 687/687), build 7/7 tasks를 통과했다. 이 보정은 DB·migration·API server·공개 contract·의존성을 변경하지 않아 기존 P6 환경 gate는 반복하지 않았다.

### 2026-08-07 — Today 모바일 opener 정확성 최종 보정

- 이전 보정은 `document.activeElement`를 모바일에서도 저장했지만, Chromium pointer click이 먼저 버튼에 포커스를 두는 경로에만 의존했다. touch·AT·programmatic activation에서는 실제 열기 버튼을 보장하지 못했다.
- Today의 headline, curated row, feed row, connection row가 모두 click event의 `currentTarget` 버튼을 typed callback으로 `ResearchWorkspacePage`에 전달하고, 페이지는 그 명시적 opener만 저장하도록 Stocks 계약과 맞춰다.
- RED browser 계약은 원 버튼을 먼저 focus하지 않고 `HTMLElement.click()`으로 활성화한 뒤 모바일 상세를 닫았을 때 opener가 `inactive`인 문제를 재현했다. 보정 후 동일 계약이 desktop/mobile 2/2 통과했다.
- 표준 4-worker Today·Stocks desktop/mobile 통합은 47건 통과·17건 viewport 조건 skip·0건 실패로 overlay, Escape, 선택 유지, Stocks opener 비회귀를 함께 확인했다.

### 2026-08-07 — 내 종목 브리핑 사용자 최종 승인

- 사용자는 현재 프리뷰의 정보 구조와 상세 흐름을 `내 종목` 탭 확정안으로 승인했다. 추가 정보를 카드에 더 나열하지 않고 현재 밀도를 유지한다.
- 실제 연결 뉴스·리스크·우선순위 집계는 진행 중인 백엔드 데이터 보강 이후 배치 read model 단계에서 다룬다. `마지막 분석 이후 변화`와 리스크 상태 같은 시간축 정보도 같은 단계로 유보한다.
- 모바일 상세는 공용 Dialog의 명시적 `bottom-sheet` presentation을 사용해 아래에서 열리고, 종목 행은 공용 Button 내부 wrapper 전체 너비와 Today 계열의 둥근 선택 surface를 유지한다.
- 다음 개편 대상은 기본 메뉴 순서의 `시장 연결` 탭으로 확정한다.

### 2026-08-08 — 시장 연결 경험 구현·검증 완료

- 승인 설계는 `docs/superpowers/specs/2026-08-07-market-connections-redesign-design.md`, 실행 계획은 `docs/superpowers/plans/2026-08-07-market-connections-redesign.md`이며, 요약 → 우선 변화 최대 3개 → 개인화 변화 → 더 넓은 시장 변화 → 보조 탐색 4종 → 공용 상세 인스펙터 순서를 실제 제품과 결정론적 preview에 고정함
- `shared/ui`에는 새 공개 API나 의존성을 추가하지 않고 기존 Button, ToggleGroup, Panel, DataTable, Dialog 상세 프레임만 채택했다. Market Connections의 카드·탐색·fixture·presentation 스타일은 제품 로컬 경계에 유지함
- TDD RED는 격리 서버 환경을 바로 전달하지 못한 첫 404를 분리한 뒤 6건 통과·5건 조건 skip·11건 실패로 fixture 탐색 데이터 누락, timeline 정확 선택 누락, empty의 보조 탐색 노출, dark contrast 4건과 locator/hydration/pointer-width 테스트 문제를 재현했다. 제품 결함은 fixture와 의미 구조·빈 상태·색 대비에서 좁게 수정하고 테스트 결함은 제품 계약을 숨기지 않는 selector/안정화로 정리함
- 최종 preview 회귀는 Market Connections·Today·Stocks desktop/mobile 65건 통과·23건 viewport 조건 skip·0건 실패, focused Node 79건 통과·0건 실패다. live Radar E2E는 기존 동일 모드 수 가정을 제거하고 `시장 보조 탐색 선택` 의미 구조·payload·pagination 계약을 유지했으며, 인증 환경 변수가 없어 실제 live candidate 실행은 보류함
- Codex 인앱 브라우저에서 1440×960 desktop은 우선 카드 3개·drawer overlay·overflow 0, 1240×900은 카드 단일 열 적층·overflow 0, 390×844는 아래에서 여는 bottom-sheet·overflow 0을 확인했다. light/dark와 reduced-motion을 확인하고, dark contrast 결함을 보정함
- scenario 직접 확인은 `default`의 정확 선택·상세, `no-personalized`의 개인화 미제조·더 넓은 변화 우선, `empty`의 단일 정직한 빈 상태·보조 탐색 미노출, `partial`의 기본 story 보존·국소 관계/geo/history 실패, `detail-error`의 선택 보존·retry 노출을 모두 만족함
- fresh 전체 gate는 format 1,327개 파일, lint 0 errors(기존 warning 6개), typecheck 11/11 tasks, 전체 test 통과, build 7/7 tasks를 통과함. `pnpm verify:release`도 lint·typecheck·P6 fixture typecheck·전체 test·hard design gate 17건까지 통과함
- `pnpm verify:release`의 첫 미실행 환경 gate는 `pnpm test:p6:db`이며, 현재 셸에 `P6_REHEARSAL_ADMIN_DATABASE_URL`이 없어 `node scripts/run-p6-db-rehearsal.mjs`가 `ERR_INVALID_URL` (`input: ''`)로 종료됐다. 이후 `test:xg:db`, build, authenticated/production browser gate는 이 실행에서 시작되지 않았고 통과로 기록하지 않음
- `graphify update .` 완료: 10,585 nodes, 18,192 edges, 715 communities. 기존 skill/package 버전 차이와 SQL parser 미설치 경고는 유지됐으며 `graphify-out/`은 ignore 상태로 staging에서 제외함
- 이번 묶음은 DB, migration, API server, 공개 contract, route path, navigation section id를 변경하지 않았고, live adapter의 원시 Radar 행을 preview의 grouped story로 추론하지 않음

### 2026-08-08 — 시장 연결 경험 review 보정 1차

- 결정론적 preview의 6개 story마다 `AI 설비투자`, `광고·커머스`, `금리·환율·원자재`, `전력 인프라`, `유가·운임 원가`, `달러 유동성` signal type과 긍정·중립 polarity를 명시했다. 공개 contract는 bounded string을 그대로 유지하며 fixture 표시 라벨만 보강함
- factor·propagation·timeline 등 item 기반 component watermark는 실제 렌더링하는 visible item 수에서 계산해 default `6건`, `no-personalized` `2건`을 표시한다. Geo watermark의 feature 기반 row count는 유지함
- TDD RED는 default watermark `0건`과 단일 `price_spike` flattening을 직접 재현했다. 이미 shared frame이 충족하던 760px clamp, wrapping, selected-key 동기화는 각각 최대 clamp 축소, `break-all`, timeline key 전달 제거 mutation으로 새 E2E가 실제 회귀를 잡는지 확인한 뒤 즉시 원복함
- drawer는 keyboard와 pointer 모두 760px를 넘겨 입력해도 실제 폭·`aria-valuenow`가 760에 고정되고, 각 경로의 close/reopen 뒤 session 값 `760`이 유지됨을 검증했다. shared frame production 코드는 변경하지 않음
- 420px drawer는 summary title, why-now paragraph, 영향 경로 list item, metadata definition, HTTPS source link 전체에서 `break-all` 부재와 개별·body·inspector overflow 1px 이하를 검증함
- priority card에서 선택한 exact key가 timeline에 반영되고 timeline에서 연 상세가 같은 제목·요약을 유지하며 priority card도 계속 선택 상태임을 양방향으로 검증함
- fresh Market Connections desktop/mobile은 19건 통과·5건 viewport 조건 skip·0건 실패, Today·Stocks 포함 비례 회귀는 67건 통과·23건 조건 skip·0건 실패임
- focused Node 79건, format 1,327개 파일, lint 0 errors(기존 warning 6개), typecheck 11/11 tasks, `git diff --check`를 통과했고 `graphify update .`는 10,589 nodes·18,196 edges·713 communities로 갱신됨

### 2026-08-08 — 시장 연결 경험 최종 review 정합성 보정

- live Radar 상세 제목을 `종목명 · 신호 유형`으로 보강하고, 정상 조회된 0건 component watermark의 `empty`를 missing/unavailable과 분리해 `현재 표시할 변화 없음`으로 표시함
- 상세의 `연결된 내 보유·관심 종목`은 holding 또는 watched인 entity만 표시한다. no-personalized 시장 전반 story는 개인 종목 섹션을 생략하고, 넓은 modal의 근거 기반 `연관 기업`에만 시장 entity를 유지함
- preview 직접 연결 집계는 holding/watchlist scope에서 계산해 `3`으로 고정했고, no-personalized story entity는 holding/watchlist flag가 모두 false임을 Node와 E2E로 검증함
- 승인 문구를 상대 강도 `강함`, scope `시장 전반 변화`로 맞췄으며, component E2E fixture에는 digest와 snapshot id를 갖춘 유효한 empty GeoSnapshot과 전용 TypeScript gate를 추가함
- TDD RED는 focused Node `36건 중 8건 실패`, fixture typecheck의 필수 `geoSnapshot` 누락, desktop no-personalized 상세의 개인 종목 heading 1개 노출을 각각 재현함. locator 중복 1건은 `연관 기업` 영역으로 좁혀 제품 의미 구조를 유지함
- fresh GREEN은 focused Task 6 Node `79/79`, Market Connections desktop/mobile `19건 통과·5건 viewport 조건 skip·0건 실패`, fixture typecheck, root typecheck `11/11`, format `1,328`개, lint `0 errors`(기존 warning 6), `git diff --check` 통과임. shared frame·Today·Stocks 구현은 변경하지 않아 별도 비례 회귀는 생략함
- 최종 재검토에서 component fixture의 Geo contract 런타임 경로가 TypeScript에만 연결되고 Vite에는 누락된 사실을 실제 `Failed to resolve import`로 재현했다. fixture Vite에 정확한 contract source alias를 추가한 뒤 `e2e/market-connections-view.spec.ts` desktop 3건이 모두 통과해 stale completion·retry·opener 회귀가 실제 렌더링 경로에서 다시 검증됨
- `graphify update .` 완료: 10,623 nodes·18,234 edges·711 communities. DB, migration, API server, 공개 contract, dependency, route는 변경하지 않았고 기존 disposable DB/auth 환경 제약은 재분류하지 않음

### 2026-08-08 — 판단 복기 경험 자동 검증 완료·브라우저 확인 대기

- 승인된 `판단 복기` 설계와 Task 1–3 제품 적용을 실제 History dev preview에서 검증했다. 고정 순서, 모든 기록 종류의 정확 선택, programmatic activation 후 opener 복귀, layout-shift 없는 drawer, overlay·Escape close-only, 무요청 modal 전환, 독립 width memory, 1240px 적층, 390px bottom sheet, 여섯 시나리오, localized partial failure, detail retry, HTTPS link, 금지 문구, dark mode, reduced motion, Axe, wrapping·overflow를 포함한다.
- Playwright server 환경이 `VITE_ENABLE_DEV_PREVIEW`를 자식 Vite에 전달하지 않아 격리 포트 preview가 404가 되던 harness 결함을 RED 14/14로 재현했다. dev 전용 allowlist와 Playwright serverEnv에만 플래그를 전달하고 production child에는 계속 차단했다.
- dark selected History 카드의 11px metadata가 3.98:1로 Axe 대비 기준을 충족하지 못해, 선택 상태에서만 보조 텍스트 색으로 보정했다. 최종 History desktop/mobile은 22건 통과·6건 viewport 조건 skip·0건 실패다.
- Today·Stocks·Market Connections 공용 inspector 비례 회귀는 fresh 67건 통과·23건 조건 skip·0건 실패다. focused Node는 launcher 9건과 History/shared 37건이 모두 통과했다.
- 전체 gate는 format 1,356개 파일, lint 0 errors(기존 warning 6), typecheck 11/11 tasks, test 10/10 tasks(web 733/733), build 7/7 tasks를 통과했다. `verify:release`는 P6 fixture typecheck·전체 test·hard design 17/17까지 통과한 뒤 `P6_REHEARSAL_ADMIN_DATABASE_URL` 부재로 `test:p6:db`에서 `ERR_INVALID_URL` (`input: ''`)로 중단됐다. 이후 XG DB·build·production browser gate는 시작되지 않았다.
- `graphify update .` 완료: 9,493 nodes·17,306 edges·637 communities. 기존 graphify skill/package 버전 차이와 SQL parser 미설치 경고는 유지됐으며 ignored graph output은 staging에서 제외한다.
- Codex controller 인앱 브라우저의 desktop·390px 직접 확인은 아직 `대기`다. 자동 검증 완료를 브라우저 직접 확인 완료로 기록하지 않는다.

## 실행 환경 메모

- `pnpm dev:live:check`: AGE live 구성 정상
- 기대 포트: web `6100`, API `6200`, Cloudflare DB listener `55432`
- 2026-08-02 재확인: `https://insight-db.jigooo.com/`은 Cloudflare Access 로그인으로 정상 응답한다.
- `pnpm dev` 라이브 스택은 web `6100`, API `6200`, DB listener `55432`에서 기동 확인했다.

## 갱신 규칙

1. 묶음을 시작할 때 `현재 활성 묶음`과 해당 행 상태를 갱신한다.
2. 사용자 승인 직후 상태를 `승인`으로 바꾼다.
3. 공용 API 커밋 후 `공용화`, 제품 연결 후 `제품 적용`으로 바꾼다.
4. 브라우저·자동 검증·리뷰가 끝난 뒤에만 `검증 완료`로 바꾼다.
5. 묶음 완료 기록에는 커밋, 테스트 수, 남은 공백을 남긴다.
6. 다음 세션을 위한 Codex 메모리는 이 파일 경로와 현재 포인터만 요약한다.
