# Stock Insight UI 시스템 진행 원장

이 파일은 UI 공용화·목업·차트 작업의 장기 상태를 기록하는 단일 기준점이다.
새 세션은 구현 전에 이 파일을 먼저 읽고 `현재 활성 묶음`에서 재개한다.

## 현재 포인터

- 프로그램 상태: 실행 중
- 현재 활성 묶음: 없음
- 다음 묶음: `3B Side Tab + Side List 목업 비교`
- 마지막 갱신: 2026-08-03
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

| 묶음 | 내용                                | 현재 상태 | 다음 행동                        |
| ---- | ----------------------------------- | --------- | -------------------------------- |
| 1A   | RadioGroup + Slider                 | 검증 완료 | 제품 사용처 없음 확인; 1B로 진행 |
| 1B   | Calendar + DatePicker + RangePicker | 검증 완료 | 제품 사용처 없음 확인; 1C로 진행 |
| 1C   | FileUpload + Dropzone               | 검증 완료 | 제품 사용처 없음 확인; 1D로 진행 |
| 1D   | OTP                                 | 검증 완료 | 제품 사용처 없음 확인; 1E로 진행 |
| 1E   | ButtonGroup + SplitButton           | 검증 완료 | 2A 인증·관리자 폼 감사           |
| 2A   | 인증·관리자 폼 수렴                 | 검증 완료 | 2B 워크스페이스 검색·선택 감사   |
| 2B   | 워크스페이스 검색·선택 수렴         | 검증 완료 | 2C와 통합 검증                   |
| 2C   | 워크스페이스 데이터·오버레이 수렴   | 검증 완료 | 2D와 통합 검증                   |
| 2D   | 미사용 공용 컴포넌트 검증           | 검증 완료 | 3A 목업 비교                     |
| 3A   | Route Tabs + Sliding Tabs           | 검증 완료 | 3B Side Tab + Side List 목업 비교 |
| 3B   | Side Tab + Side List                | 대기      | UI Lab 3안 비교                  |
| 3C   | Breadcrumb + Pagination             | 대기      | UI Lab 3안 비교                  |
| 3D   | Stepper + CommandPalette            | 대기      | UI Lab 3안 비교                  |
| 4A   | DropdownMenu + ContextMenu          | 대기      | UI Lab 3안 비교                  |
| 4B   | Popover                             | 대기      | UI Lab 3안 비교                  |
| 4C   | Drawer + Sheet + BottomSheet        | 대기      | UI Lab 3안 비교                  |
| 5A   | Avatar + Badge + Status             | 대기      | UI Lab 3안 비교                  |
| 5B   | List + Timeline + Carousel          | 대기      | UI Lab 3안 비교                  |
| 5C   | Table + DataGrid 확장               | 대기      | UI Lab 3안 비교                  |
| 5D   | Progress + Spinner                  | 대기      | UI Lab 3안 비교                  |
| 5E   | Skeleton + Empty + Error + Loading  | 대기      | UI Lab 3안 비교                  |
| 6A   | Chart core + ChartFrame             | 대기      | renderer-neutral 계약 구현       |
| 6B   | Market Tape                         | 대기      | Bklit Area + Brush 구현          |
| 6C   | Evidence Band                       | 대기      | ComposedChart + marker 구현      |
| 6D   | Candle Ledger                       | 대기      | Lightweight Charts 구현          |
| 6E   | 차트 갤러리·제품 연결               | 대기      | A/B/C 비교 후 Deep Dive 연결     |

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
