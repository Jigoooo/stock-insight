# 5B Data & Feedback 목업 설계

## 배경

Stock Insight UI 시스템의 5B 묶음은 데이터 밀도가 높은 표와 데이터가 준비되지 않았을 때의
피드백을 다룬다. Table 확장, DataGrid, Progress, Spinner, Skeleton, Empty, Error,
Loading을 하나의 디자인 언어로 묶지 않고 컴포넌트별 독립 A/B/C로 비교한다. 목업은 UI Lab
안에서만 동작하며 사용자 시각 승인 전에는 기존 `shared/ui` 공개 API나 제품 사용처를
변경하지 않는다.

## 확정한 접근

다음 세 접근을 비교했다.

1. 여덟 컴포넌트를 각각 수평 탭으로 분리하고 모든 A/B/C에 실제 상호작용을 제공한다.
2. 묶음 전체에 동일한 A/B/C 디자인 언어를 반복한다.
3. DataGrid 한 시안에만 전체 기능을 넣고 나머지는 정적 시각 시안으로 제한한다.

사용자는 첫 번째 접근을 승인했다. 앞선 5A와 같은 독립 비교 구조를 유지하면서 DataGrid의
정렬·선택뿐 아니라 셀 편집, 열 리사이즈, 실제 가상 스크롤까지 목업 범위에 포함한다.

## 범위

- Table 확장
- DataGrid
- Progress
- Spinner
- Skeleton
- Empty
- Error
- Loading

UI Lab `목업 진행 중` 탭에 5B 카탈로그를 배치한다. 상단 수평 탭은 위 순서를 유지하고,
선택한 컴포넌트의 A/B/C 세 카드만 렌더링한다. 390px 화면에서는 탭을 한 줄 가로 스크롤로
유지하고 각 탭의 터치 영역을 최소 44px로 보장한다.

## 컴포넌트별 시안

| 컴포넌트 | A                                   | B                                      | C                                       |
| -------- | ----------------------------------- | -------------------------------------- | --------------------------------------- |
| Table    | Expandable Rows — 행 아래 근거 펼침 | Sticky Surface — 고정 헤더와 낮은 표면 | Compact Ledger — 압축된 원장과 요약값   |
| DataGrid | Precision Grid — 선과 리사이저 중심 | Soft Sheet — 선택·편집 면 강조         | Dense Matrix — 숫자 정렬과 고정 식별 열 |
| Progress | Hairline Progress — 얇은 진행선     | Soft Meter — 낮은 배경의 진행 면       | Segmented Track — 구간별 진행 표시      |
| Spinner  | Orbit — 단일 궤도                   | Three Dot — 순차 점 신호               | Signal Sweep — 짧은 스캔 신호           |
| Skeleton | Quiet Blocks — 정적인 구조 블록     | Shimmer Surface — 제한된 표면 이동     | Ledger Rows — 표 행 구조 미리보기       |
| Empty    | Quiet Empty — 최소 안내             | Guided Empty — 다음 행동을 포함한 면   | Inline Empty — 데이터 영역 안 한 줄     |
| Error    | Quiet Alert — 절제된 오류 안내      | Recovery Panel — 복구 행동 중심        | Inline Critical — 행 안의 위험 상태     |
| Loading  | Skeleton First — 구조를 먼저 표시   | Progress Panel — 설명과 진행률 결합    | Staged Ledger — 단계별 수집 상태        |

A/B/C 문자는 비교 순서일 뿐 컴포넌트 사이에서 같은 표면, 밀도, 모션을 의미하지 않는다.

## Table 확장 계약

Table 목업은 기존 native table 의미를 유지한다. 세 시안은 같은 로컬 행, 정렬 기준, 선택 행,
펼친 행을 공유한다.

- 열 머리글로 오름차순, 내림차순, 원래 순서를 순환한다.
- 행 선택은 기존 체크박스 의미와 키보드 접근성을 유지한다.
- 행 펼침은 선택과 별개이며 연결 근거와 기준 시각을 `colspan` 상세 행에 표시한다.
- B는 스크롤 컨테이너 안에서 헤더를 고정한다.
- C는 숫자와 상태를 압축해도 390px에서 가로 스크롤 컨테이너 안에 가둔다.
- 정렬과 행 펼침은 URL이나 실제 제품 데이터를 변경하지 않는다.

## DataGrid 기능 계약

DataGrid는 표 표시가 아니라 편집 가능한 응용 프로그램형 그리드다. 세 시안은 같은 1,000개
결정론적 로컬 행과 정렬, 선택, 편집 결과, 열 너비를 공유한다. 서버 요청이나 무작위 값은
사용하지 않는다.

### 정렬과 선택

- 열 머리글은 오름차순, 내림차순, 원래 순서를 순환하고 `aria-sort`로 상태를 전달한다.
- 행 선택은 체크박스와 행의 현재 상태를 함께 제공한다.
- 선택된 행 수는 그리드 밖의 단일 요약 영역에서 알린다.

### 셀 이동과 편집

- 그리드는 `role="grid"`, 행과 셀은 대응하는 ARIA grid 의미를 사용한다.
- 방향키는 현재 셀을 이동하고 Home, End는 같은 행의 처음과 끝으로 이동한다.
- Enter 또는 F2, 더블 클릭으로 편집을 시작한다.
- Enter는 저장, Escape는 취소, blur는 현재 값을 저장한다.
- 편집 가능한 열은 관심도 메모와 확인 상태처럼 로컬 텍스트·선택 값으로 제한한다.
- 활성 셀과 편집 셀을 색상만으로 구분하지 않고 focus와 텍스트 상태를 함께 제공한다.

### 열 리사이즈

- 머리글 경계의 separator를 포인터로 드래그해 열 너비를 조절한다.
- separator는 키보드 focus를 받고 ArrowLeft, ArrowRight로 정해진 단위만큼 조절한다.
- 최소·최대 너비를 두어 열이 사라지거나 전체 레이아웃을 무한히 늘리지 않게 한다.
- 조정한 너비는 세 A/B/C 시안에 동일하게 반영한다.

### 가상 스크롤

- 새 패키지 없이 고정 44px 행 높이, 320px viewport, overscan 6의 작은 전용 virtualizer를
  UI Lab 목업 경계에 구현한다.
- 1,000개 행 전체 높이를 spacer로 유지하되 DOM에는 현재 viewport와 overscan 행만 둔다.
- `aria-rowcount`는 전체 행 수를, 각 가상 행의 `aria-rowindex`는 실제 위치를 전달한다.
- 정렬 후에도 전체 1,000개 행을 다시 정렬한 결과를 가상화하며, 편집과 선택은 행 ID로
  유지한다.
- 세 시안은 동일한 44px 조작 높이를 사용하고 시각적 밀도만 내부 여백과 구분선으로 다르게
  표현한다.

## Progress·Spinner·Skeleton 계약

- Progress 세 시안은 같은 결정적 진행률을 공유하고 0, 36, 68, 100 상태를 반복 실행할 수
  있다. 값과 현재 단계를 텍스트로도 표시한다.
- Spinner는 완료량을 알 수 없는 짧은 대기만 표현하며, 자체로 장시간 로딩을 대신하지 않는다.
- Skeleton은 최종 콘텐츠의 구조를 보존하고 레이아웃 이동을 만들지 않는다.
- Shimmer와 Spinner는 한 화면에서 필요한 시안만 움직이며 500ms를 넘는 과도한 전환을
  추가하지 않는다.
- `prefers-reduced-motion`에서는 회전, 점 이동, shimmer를 정지하고 정적인 대체 상태를
  표시한다.

## Empty·Error·Loading 계약

세 상태군은 같은 로컬 결과와 재실행 가능한 액션을 공유한다.

- Empty는 데이터가 없다는 사실, 현재 필터나 수집 상태, 가능한 다음 행동을 구분한다.
- Error는 단일 `role="alert"` 소유자와 오류 문구, 다시 시도 행동을 제공한다.
- Loading은 300ms 지연 후에만 표시하고 `불러오는 중 → 완료`를 반복 실행할 수 있다.
- 다시 시도와 불러오기 액션은 UI Lab 로컬 상태만 갱신하고 실제 네트워크를 호출하지 않는다.
- 성공 후에는 결과 문구를 polite live region으로 알리고 버튼을 다시 실행 가능한 상태로
  돌린다.

## 구현 경계

- `data-feedback-model.ts`가 탭, variant, 1,000개 결정론적 행, 정렬·편집 helper를 소유한다.
- `data-feedback-catalog.tsx`가 수평 탭과 선택한 컴포넌트의 A/B/C를 조합한다.
- DataGrid 상호작용은 전용 목업 컴포넌트로 분리해 카탈로그 레이아웃과 상태 로직을 섞지
  않는다.
- 전용 CSS Module이 시각 차이, sticky header, 가상 행 배치, 모바일, 감소 모션을 담당한다.
- 기존 Table, Skeleton, Feedback, WorkspaceState 구현은 감사 대상으로만 읽고 목업 승인
  전에는 공개 API를 변경하지 않는다.
- 승인 후 유지할 variant만 공용화한다. 여러 variant를 모두 승인할 수 있으며 하나만 남는다고
  가정하지 않는다.
- 실제 제품 사용처 감사에서 적합한 사용처가 없으면 가짜 기능을 추가하지 않는다.

## 접근성과 모바일

- 상단 수평 탭은 tablist, tab, tabpanel 의미와 키보드 이동을 유지한다.
- Table은 native table 의미, DataGrid는 ARIA grid 의미를 각각 유지하고 서로 섞지 않는다.
- 정렬, 선택, 편집, resize는 포인터와 키보드 경로를 모두 제공한다.
- 모든 직접 조작 대상은 390px 화면에서도 최소 44px 높이 또는 동등한 hit area를 제공한다.
- 넓은 Table과 DataGrid는 내부 가로 스크롤을 사용하고 페이지 전체의 가로 overflow를 만들지
  않는다.
- Error는 assertive, 진행·완료는 polite announcement를 사용하며 중복 live region을 만들지
  않는다.
- 정보 상태는 색상만으로 전달하지 않고 아이콘, 문구, ARIA 상태를 함께 사용한다.

## 검증 범위

목업 단계 검증은 사용자 요청에 따라 좁게 유지한다.

1. Node 계약 2건: 여덟 탭과 각 A/B/C, 1,000개 행 생성·정렬·편집 helper
2. Playwright 2건: Table 펼침과 DataGrid 정렬·선택·편집·resize·가상화, 그리고 390px·감소
   모션·Axe 통합
3. web typecheck
4. 변경 파일 Oxfmt·Oxlint와 `git diff --check`
5. Codex 인앱 브라우저에서 여덟 컴포넌트 A/B/C와 핵심 상호작용 시각 확인

전체 테스트와 전체 빌드는 목업 승인 단계에서 실행하지 않는다.

## 제외 범위

- 사용자 승인 전 `shared/ui` 공개 API 변경
- 사용자 승인 전 실제 제품 사용처 연결
- 실제 API 호출, 서버 저장, URL 이동
- 셀 수식, 행 추가·삭제, clipboard paste, undo history
- 열 순서 drag-and-drop, 열 pinning 설정 UI, 다단 정렬과 필터 builder
- 동적 행 높이 virtualizer와 새 table·virtualization 의존성
- 6A Charts End-to-End에 속한 chart renderer와 시계열 상호작용

## 승인 기준

- UI Lab에서 여덟 컴포넌트를 수평 탭으로 각각 선택할 수 있다.
- 각 탭은 독립적으로 설계된 A/B/C 세 시안을 보여준다.
- Table A/B/C가 같은 정렬, 선택, 펼친 행을 공유한다.
- DataGrid A/B/C가 같은 1,000개 행, 정렬, 선택, 편집 결과, 열 너비를 공유한다.
- DataGrid의 포인터·키보드 편집과 resize, 실제 가상 스크롤이 동작한다.
- Progress와 Loading은 완료 후 다시 실행할 수 있다.
- Empty와 Error는 사실 기반 문구와 복구 행동을 제공한다.
- 모바일, 키보드, 감소 모션, 접근성 계약을 만족한다.
- 사용자 승인 전에는 목업 외 제품 동작과 공용 API가 바뀌지 않는다.
