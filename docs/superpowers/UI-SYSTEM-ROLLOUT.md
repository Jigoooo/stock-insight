# Stock Insight UI 시스템 진행 원장

이 파일은 UI 공용화·목업·차트 작업의 장기 상태를 기록하는 단일 기준점이다.
새 세션은 구현 전에 이 파일을 먼저 읽고 `현재 활성 묶음`에서 재개한다.

## 현재 포인터

- 프로그램 상태: 준비 완료
- 현재 활성 묶음: 없음
- 다음 묶음: `1A 선택 입력 — RadioGroup + Slider`
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

| 묶음 | 내용 | 현재 상태 | 다음 행동 |
| --- | --- | --- | --- |
| 1A | RadioGroup + Slider | 승인 | 공용 API 설계·구현 |
| 1B | Calendar + DatePicker + RangePicker | 승인 | 1A 완료 후 공용화 |
| 1C | FileUpload + Dropzone | 승인 | 검증된 목업을 공용 API로 승격 |
| 1D | OTP | 승인 | 1C 완료 후 공용화 |
| 1E | ButtonGroup + SplitButton | 승인 | 1D 완료 후 공용화 |
| 2A | 인증·관리자 폼 수렴 | 대기 | 1단계 공용화 이후 감사 |
| 2B | 워크스페이스 검색·선택 수렴 | 대기 | 2A 완료 후 감사 |
| 2C | 워크스페이스 데이터·오버레이 수렴 | 대기 | 2B 완료 후 감사 |
| 2D | 미사용 공용 컴포넌트 검증 | 대기 | 2C 완료 후 판단 |
| 3A | Route Tabs + Sliding Tabs | 대기 | UI Lab 3안 비교 |
| 3B | Side Tab + Side List | 대기 | UI Lab 3안 비교 |
| 3C | Breadcrumb + Pagination | 대기 | UI Lab 3안 비교 |
| 3D | Stepper + CommandPalette | 대기 | UI Lab 3안 비교 |
| 4A | DropdownMenu + ContextMenu | 대기 | UI Lab 3안 비교 |
| 4B | Popover | 대기 | UI Lab 3안 비교 |
| 4C | Drawer + Sheet + BottomSheet | 대기 | UI Lab 3안 비교 |
| 5A | Avatar + Badge + Status | 대기 | UI Lab 3안 비교 |
| 5B | List + Timeline + Carousel | 대기 | UI Lab 3안 비교 |
| 5C | Table + DataGrid 확장 | 대기 | UI Lab 3안 비교 |
| 5D | Progress + Spinner | 대기 | UI Lab 3안 비교 |
| 5E | Skeleton + Empty + Error + Loading | 대기 | UI Lab 3안 비교 |
| 6A | Chart core + ChartFrame | 대기 | renderer-neutral 계약 구현 |
| 6B | Market Tape | 대기 | Bklit Area + Brush 구현 |
| 6C | Evidence Band | 대기 | ComposedChart + marker 구현 |
| 6D | Candle Ledger | 대기 | Lightweight Charts 구현 |
| 6E | 차트 갤러리·제품 연결 | 대기 | A/B/C 비교 후 Deep Dive 연결 |

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

## 실행 환경 메모

- `pnpm dev:live:check`: AGE live 구성 정상
- 기대 포트: web `6100`, API `6200`, Cloudflare DB listener `55432`
- 2026-08-02 확인: `https://insight-db.jigooo.com/`이 Cloudflare `Error 1033`
- 판정: 로컬 AGE 문제가 아니라 원격 Cloudflare Tunnel 연결이 복구되어야 `pnpm dev`가 기동 가능
- 실패한 launcher는 종료했으며 6100/6200/55432를 점유하지 않도록 한다.

## 갱신 규칙

1. 묶음을 시작할 때 `현재 활성 묶음`과 해당 행 상태를 갱신한다.
2. 사용자 승인 직후 상태를 `승인`으로 바꾼다.
3. 공용 API 커밋 후 `공용화`, 제품 연결 후 `제품 적용`으로 바꾼다.
4. 브라우저·자동 검증·리뷰가 끝난 뒤에만 `검증 완료`로 바꾼다.
5. 묶음 완료 기록에는 커밋, 테스트 수, 남은 공백을 남긴다.
6. 다음 세션을 위한 Codex 메모리는 이 파일 경로와 현재 포인터만 요약한다.
