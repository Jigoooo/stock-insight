# 1C FileUpload + Dropzone 공용화 실행 계획

## 목표

UI Lab에서 승인된 `hairline`·`inset` 파일 입력과 검증·추가·삭제 모션을
`shared/ui/file-upload` 공개 API로 승격한다. UI Lab은 데모 상태만 소유하고 파일 입력의
focus, drag, validation, selected, disabled, pending 상태는 공용 컴포넌트가 단독 소유한다.

## 고정 계약

- `FileUpload`은 controlled/uncontrolled 파일 목록과 `single|multiple` 모드를 제공한다.
- `Dropzone`은 파일 선택과 실제 drag/drop 입력을 하나의 계약으로 처리한다.
- 기본 허용 형식은 CSV, XLSX, PDF이며 기본 최대 크기는 10MB다.
- multiple은 반복 선택을 append하고 single은 새 선택으로 교체한다.
- 선택 행은 추가 stagger, 홀짝 좌우 exit, `popLayout` 위쪽 reflow를 유지한다.
- 마지막 파일 삭제 후 focus는 파일 선택 버튼으로, 중간 파일 삭제 후 focus는 인접 삭제 버튼으로 이동한다.
- reduced motion에서는 transform을 제거하고 opacity 상태 피드백만 유지한다.
- 모바일은 44px hit area, 데스크톱은 승인된 compact density를 유지한다.

## 작업 순서

1. 공개 props fixture와 파일 정규화 테스트를 먼저 추가해 실패를 확인한다.
2. `shared/ui/file-upload`에 상태 로직, `Dropzone`, `FileUpload`, CSS Module, public index를 구현한다.
3. UI Lab의 페이지 소유 파일 상태·드롭·애니메이션 구현을 공용 컴포넌트 사용으로 교체한다.
4. UI Lab CSS에서 파일 입력 상태 스타일을 제거하고 목업 제어 레이아웃만 남긴다.
5. 제품 코드에서 기존 파일 입력 사용처를 감사하고, 없으면 가짜 기능을 추가하지 않는다.
6. Codex 인앱 브라우저 단일 탭에서 desktop/mobile, single/multiple, drop, rejection, remove, focus를 확인한다.
7. 대상 Node 테스트, fixture typecheck, web typecheck·lint·build, Playwright, diff check, Graphify를 통과시킨다.
8. 진행 원장을 `1C 검증 완료`, 다음 묶음을 `1D OTP`로 갱신한다.
