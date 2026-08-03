# 5A Identity & Content 목업 설계

## 배경

Stock Insight UI 시스템의 5A 묶음은 정체성과 콘텐츠 표현을 다룬다. 한 가지 디자인
언어를 여섯 컴포넌트에 반복하지 않고, 컴포넌트별 역할에 맞는 A/B/C 시안을 독립적으로
비교한다. 목업은 UI Lab 안에서만 동작하며 사용자 승인 전에는 공용 API나 제품 사용처를
변경하지 않는다.

## 범위

- Avatar
- Badge
- Status
- List
- Timeline
- Carousel

완료된 Menu & Overlay는 UI Lab `예정` 카드에서 제거한다. 예정 목록은
Identity & Content, Data & Feedback, Charts End-to-End 세 묶음만 표시한다.

## 화면 구조

`목업 진행 중` 탭에 5A 카탈로그를 배치한다. 카탈로그 상단에는 Avatar, Badge, Status,
List, Timeline, Carousel 순서의 수평 탭을 둔다. 선택한 컴포넌트의 A/B/C 카드만 렌더링해
비교 범위를 한 번에 하나로 제한한다.

390px 화면에서는 수평 탭을 한 줄 가로 스크롤로 유지하고 각 탭의 터치 영역을 최소
44px로 보장한다. 탭 전환과 목업 상호작용은 현재 UI Lab URL과 제품 데이터를 변경하지
않는다.

## 컴포넌트별 시안

| 컴포넌트 | A                                 | B                                          | C                                           |
| -------- | --------------------------------- | ------------------------------------------ | ------------------------------------------- |
| Avatar   | Monogram Ring — 얇은 원과 이니셜  | Soft Portrait — 낮은 배경의 인물·기업 표식 | Identity Pair — 아바타와 이름·보조정보 결합 |
| Badge    | Hairline Tag — 가벼운 외곽선      | Soft Fill — 낮은 상태색 면                 | Dot Label — 상태점과 텍스트                 |
| Status   | Inline Signal — 문장 안 상태 표시 | Status Block — 제목·설명·시각을 묶은 면    | Key/Value Status — 원장형 상태 행           |
| List     | Quiet Rows — 얇은 구분선          | Soft Cards — 연결된 낮은 카드              | Ledger List — 압축된 행과 보조값            |
| Timeline | Hairline Rail — 선과 현재점       | Event Cards — 사건별 작은 면               | Compact Ledger — 시각·출처 중심 행          |
| Carousel | Edge Arrows — 좌우 탐색 중심      | Snap Cards — 카드 스냅과 점 표시           | Filmstrip — 축소 미리보기와 현재 항목       |

시안 이름과 구조는 컴포넌트마다 독립적이다. A/B/C 문자는 비교 순서일 뿐 전역적으로
같은 밀도나 표면을 뜻하지 않는다.

## 데이터와 상호작용

각 컴포넌트 탭의 A/B/C는 동일한 로컬 데모 데이터를 사용한다. List, Timeline,
Carousel은 현재 선택 항목을 공유해 한 시안에서 선택하면 나머지 두 시안도 같은 항목을
표시한다. 이 계약으로 정보 구조와 시각 표현만 비교할 수 있게 한다.

- Avatar는 외부 이미지 요청 없이 이니셜과 로컬 아이콘을 사용한다.
- Badge와 Status는 사용 가능, 수집 중, 오래됨처럼 제품에서 사용하는 사실 기반 상태만
  표현한다.
- List는 선택 가능한 리서치 항목과 비활성 항목을 함께 보여준다.
- Timeline은 사건 시각, 제목, 출처를 같은 데이터로 표시한다.
- Carousel은 이전·다음 버튼과 직접 선택 수단을 제공하며 처음과 끝 상태를 명확히 한다.
- 키보드와 포인터 상호작용은 같은 로컬 상태 갱신 경로를 사용한다.

## 구현 경계

- `identity-content-model.ts`가 탭, 시안, 데모 데이터와 선택 상태 계약을 소유한다.
- `identity-content-catalog.tsx`가 수평 탭과 선택한 컴포넌트의 A/B/C를 조합한다.
- 전용 CSS Module이 컴포넌트별 시각 차이, 모바일, 감소 모션을 담당한다.
- 기존 공용 Tabs, Badge, Timeline은 재사용하되 목업 단계에서는 공개 API를 변경하지
  않는다.
- Avatar, List, Carousel은 UI Lab 로컬 목업으로만 구현한다.
- 승인 후에만 유지할 variant를 shared/ui로 공용화하고 실제 제품 사용처를 감사한다.
- 적합한 제품 사용처가 없으면 가짜 기능을 추가하지 않는다.

## 접근성과 예외 처리

- 수평 탭은 tablist, tab, tabpanel 의미와 키보드 이동을 유지한다.
- List와 Timeline의 현재 항목은 텍스트 및 ARIA 상태로 함께 전달한다.
- Carousel은 이전·다음 버튼 이름, 현재 위치, 처음·끝의 disabled 상태를 제공한다.
- 모든 조작 버튼은 390px에서도 최소 44px 터치 영역을 유지한다.
- `prefers-reduced-motion`에서는 이동과 전환을 즉시 완료한다.
- Avatar 표식이 없으면 이니셜로 대체하고, 알 수 없는 상태는 긍정적으로 추정하지 않고
  중립 표현을 사용한다.
- 데모는 네트워크나 외부 이미지에 의존하지 않으므로 로딩·통신 오류 상태를 만들지
  않는다.

## 검증 범위

목업 단계 검증은 다음으로 제한한다.

1. Node 계약 2건: 여섯 탭 순서와 각 A/B/C 구성, 예정 카드 세 개와 Menu & Overlay 제거
2. Playwright 2건: 탭 전환·공유 선택 상태·URL 고정, 390px·감소 모션·Axe 통합
3. web typecheck
4. 변경 파일 Oxfmt·Oxlint
5. Codex 인앱 브라우저에서 실제 A/B/C 시각 비교

전체 테스트와 전체 빌드는 목업 승인 단계에서 실행하지 않는다.

## 제외 범위

- 사용자 승인 전 shared/ui 공개 API 변경
- 사용자 승인 전 실제 제품 사용처 연결
- 외부 Avatar 이미지 업로드·편집
- 자동 재생 Carousel
- 드래그 라이브러리나 새 애니메이션 runtime 추가
- 실제 API 호출과 URL 이동
- 5B Data & Feedback에 속한 Progress, Spinner, Skeleton, Empty, Error, Loading

## 승인 기준

- UI Lab에서 여섯 컴포넌트를 수평 탭으로 각각 선택할 수 있다.
- 각 탭은 독립적으로 설계된 A/B/C 세 시안을 보여준다.
- List, Timeline, Carousel의 A/B/C가 동일한 선택 상태를 공유한다.
- 예정 카드에는 완료된 Menu & Overlay가 나타나지 않는다.
- 모바일, 키보드, 감소 모션, 접근성 계약을 만족한다.
- 사용자 승인 전에는 목업 외 제품 동작과 공용 API가 바뀌지 않는다.
