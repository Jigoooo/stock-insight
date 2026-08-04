# Stock Insight UI 시스템 진행 원장

이 파일은 UI 공용화·목업·차트 작업의 장기 상태를 기록하는 단일 기준점이다.
새 세션은 구현 전에 이 파일을 먼저 읽고 `현재 활성 묶음`에서 재개한다.

## 현재 포인터

- 프로그램 상태: 실행 중
- 현재 활성 묶음: `5B Data & Feedback 목업 비교`
- 다음 묶음: `6A Charts End-to-End`
- 마지막 갱신: 2026-08-04
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
| 5B   | Data & Feedback                     | 목업      | UI Lab 통합 A/B/C 비교                |
| 6A   | Charts End-to-End                   | 대기      | 기반·차트·제품 연결 통합 진행         |

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
