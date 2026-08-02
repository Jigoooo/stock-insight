# Stock Insight UI 시스템 진행 원장

이 파일은 UI 공용화·목업·차트 작업의 장기 상태를 기록하는 단일 기준점이다.
새 세션은 구현 전에 이 파일을 먼저 읽고 `현재 활성 묶음`에서 재개한다.

## 현재 포인터

- 프로그램 상태: 실행 중
- 현재 활성 묶음: 없음 — `1C 파일 입력` 검증 완료
- 다음 묶음: `1D 짧은 보안 입력 — OTP`
- 마지막 갱신: 2026-08-02
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
| 1D   | OTP                                 | 승인      | 1C 완료 후 공용화                |
| 1E   | ButtonGroup + SplitButton           | 승인      | 1D 완료 후 공용화                |
| 2A   | 인증·관리자 폼 수렴                 | 대기      | 1단계 공용화 이후 감사           |
| 2B   | 워크스페이스 검색·선택 수렴         | 대기      | 2A 완료 후 감사                  |
| 2C   | 워크스페이스 데이터·오버레이 수렴   | 대기      | 2B 완료 후 감사                  |
| 2D   | 미사용 공용 컴포넌트 검증           | 대기      | 2C 완료 후 판단                  |
| 3A   | Route Tabs + Sliding Tabs           | 대기      | UI Lab 3안 비교                  |
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
