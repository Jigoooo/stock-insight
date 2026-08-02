# Stock Insight 입력·액션 공용 variant 설계

## 목표

UI Lab 첫 번째 배치에서 승인된 입력·액션 시안을 하나의 외형으로 축소하지 않고, 상황에 따라
선택할 수 있는 공용 variant로 제공한다. 제품 화면은 `@/shared/ui/<purpose>` 공개 API만
사용하며, UI Lab의 목업 구현을 직접 import하지 않는다.

컴포넌트의 행동과 접근성 계약은 하나로 유지하고 시각 variant만 교체한다. 다른 프로젝트로
옮길 때도 제품 문구나 리서치 도메인에 묶이지 않도록 값, 이벤트, 상태와 외형을 분리한다.

## 승인된 variant

| 컴포넌트                     | 승인 variant                      | 제외 variant |
| ---------------------------- | --------------------------------- | ------------ |
| `RadioGroup`                 | `hairline`, `inset`, `rail`       | 없음         |
| `Slider`                     | `hairline`, `inset`, `rail`       | 없음         |
| `Calendar`                   | `compact`, `soft-inset`, `ledger` | 없음         |
| `DatePicker` / `RangePicker` | `hairline`, `inset`, `rail`       | 없음         |
| `FileUpload` / `Dropzone`    | `hairline`, `inset`               | `rail`       |
| `OTP`                        | `hairline`, `inset`, `rail`       | 없음         |
| `ButtonGroup`                | `hairline`, `inset`               | `rail`       |
| `SplitButton`                | `solid`, `tonal`, `twin`          | 없음         |

UI Lab의 Calendar와 SplitButton A/B/C 내부 식별자는 기존 비교 그리드와 맞추기 위해 각각
`hairline`, `inset`, `rail`을 유지한다. 공용 제품 API에서 Calendar는 `compact`,
`soft-inset`, `ledger`, SplitButton은 `solid`, `tonal`, `twin`으로 노출한다. adapter 또는 내부
variant map이 두 이름을 연결하며 UI Lab 식별자를 제품 API에 노출하지 않는다.

## 컴포넌트 역할 경계

### ButtonGroup

- 서로 관련된 독립 액션을 하나의 시각적 묶음으로 배치한다.
- root는 `role="group"`과 접근 가능한 이름을 가진다.
- 선택 상태를 강제하지 않는다. 각 버튼은 자체 `pressed`, `disabled`, `pending` 상태를 가질 수
  있다.
- `hairline`은 선과 여백 중심, `inset`은 낮은 음영의 그룹 표면을 사용한다.
- 기존 C 레일형은 선택 상태처럼 보이고 좁은 패널 문법에 과도하게 묶이므로 공용 variant에서
  제외한다.

### ToggleGroup

- 동일한 화면의 표시 모드나 필터 값을 `single` 또는 `multiple`로 선택한다.
- 선택값과 `onValueChange`를 필수 계약으로 갖고 `aria-pressed` 또는 Radix 상태를 사용한다.
- 단일 선택에서는 기존 Motion layout indicator가 항목 사이를 슬라이드한다.
- ButtonGroup과 외형 일부를 공유할 수 있지만 상태 모델과 keyboard 계약은 합치지 않는다.

### SplitButton

- 왼쪽은 즉시 실행되는 기본 액션, 오른쪽은 같은 목적의 대체 액션 메뉴를 연다.
- 기본 액션과 menu trigger는 별도의 실제 `button`이다.
- trigger는 `aria-haspopup="menu"`, `aria-expanded`, 연결된 menu ID를 가진다.
- `solid`는 하나의 매트한 덩어리와 얇은 divider, `tonal`은 본체와 trigger의 톤 분리,
  `twin`은 같은 그룹 안의 둥근 두 버튼을 사용한다.
- 메뉴는 같은 공용 DropdownMenu 계층을 사용하고 SplitButton 안에 별도 overlay runtime을 만들지
  않는다.

### FileUpload / Dropzone

- `mode="single" | "multiple"`로 선택 계약을 분리한다. 단일 모드는 새 파일을 선택하거나 놓으면
  기존 파일을 교체하고, 다중 모드는 파일 목록에 추가한다.
- 대기, 허용 가능한 파일을 드래그 중인 상태, 파일 선택 완료 상태를 서로 다른 border style,
  표면, 아이콘과 안내 문구로 구분한다. drag 상태는 색만 바꾸지 않는다.
- 선택 완료 시 파일 수, 파일명, 크기, 준비 상태와 파일별 삭제 버튼을 노출한다. 마지막 파일을
  삭제하면 별도 빈 목록을 남기지 않고 대기 상태로 복귀한다.
- UI Lab의 `대기` / `드래그` / `선택` 전환기는 상태 비교용 개발 도구다. 공용 제품 API에는
  노출하지 않고 실제 drag event와 선택 파일 값으로 상태를 계산한다.
- `hairline`과 `inset`은 같은 상태·접근성 계약을 공유하고 표면 깊이만 다르게 표현한다.
- FileUpload 비교 화면은 승인된 `hairline`과 `inset`만 렌더링한다. 제외된 `rail` 카드를 비교
  이력 목적으로 계속 노출하지 않는다.

## 공용 API 원칙

각 컴포넌트는 외형을 `variant`로 노출하되 행동을 variant별로 분기하지 않는다.

```ts
type InputSurfaceVariant = 'hairline' | 'inset' | 'rail';

type CalendarVariant = 'compact' | 'soft-inset' | 'ledger';

type FileUploadVariant = 'hairline' | 'inset';
type FileUploadMode = 'single' | 'multiple';

type ButtonGroupVariant = 'hairline' | 'inset';

type SplitButtonVariant = 'solid' | 'tonal' | 'twin';
```

- 컴포넌트마다 허용되는 union만 공개해 제외된 조합을 타입 단계에서 막는다.
- `size`, `density`, `tone`, `disabled`, `invalid`, `pending`은 `variant`와 독립된 축이다.
- default variant는 실제 제품 적용 계획에서 사용 맥락별로 정한다. 공용 API가 모든 화면에 하나의
  기본 외형을 강요하지 않는다.
- cross-project 재사용 시 CSS Modules와 의미 토큰만 옮길 수 있도록 제품 route, API client,
  Stock Insight entity를 참조하지 않는다.
- 모션은 저장소의 `motion` 경계만 사용하고 reduced motion에서 transform과 layout tween을
  제거한다.

Calendar의 세 variant는 같은 날짜 상태와 keyboard 계약을 사용한다. `compact`는 30px 셀과
1px 간격의 채움형 선택, `soft-inset`은 32px 셀과 낮은 배경·inset border, `ledger`는 30×28px
셀과 작은 outline tile을 사용한다. 세 variant 모두 날짜 선택 모양은 원형이 아닌 둥근
사각형이다.

## FSD 배치

```text
apps/web/src/shared/ui/
├── radio-group/
├── slider/
├── calendar/
├── date-picker/
├── file-upload/
├── otp/
├── button-group/
├── toggle-group/
└── split-button/
```

- 각 폴더는 구현, CSS Module, public types, `index.ts`만 소유한다.
- DropdownMenu, Popover, Button처럼 이미 존재하는 하위 primitive는 public API로 조합한다.
- 페이지와 feature는 `@/shared/ui/<purpose>`만 import한다.
- 공용 UI가 안정화된 뒤 별도 패키지로 추출할 수 있지만, 이번 단계에서 모노레포 패키지를 먼저
  만들지는 않는다.

## 상태와 상호작용

- focus, hover, pressed, invalid, disabled, pending, open은 공용 컴포넌트가 단독 소유한다.
- 페이지 CSS는 border, ring, transform, selected background를 다시 정의하지 않는다.
- OTP `rail` variant는 칸을 둘러싼 focus halo를 만들지 않고 현재 칸의 하단선만 강화한다.
- FileUpload는 drag enter/leave/drop에 즉시 반응한다. 목록은 `AnimatePresence
mode="popLayout"`와 각 행의 `layout="position"`을 사용해 퇴장 행과 재정렬 행을 분리한다.
- 여러 파일이 추가되면 각 행은 `opacity: 0 → 1`, `y: 6 → 0`으로 나타나며 파일 순서에 따라
  28ms 간격으로 시작한다. 기본 enter duration은 160ms ease-out이다.
- 삭제되는 행은 삭제 직전 index를 기준으로 짝수 행은 왼쪽 `x: -18`, 홀수 행은 오른쪽
  `x: 18`로 번갈아 이동하며 `opacity: 1 → 0`, `scale: 1 → 0.985`를 140ms ease-in으로
  실행한다.
- 남은 행은 퇴장과 같은 렌더에서 위로 재정렬한다. 각 행은 새 index 기준 18ms의 차등 delay와
  bounce 없는 약 240ms layout spring을 사용해 먼저 있던 행부터 순서대로 자리를 메운다.
- 빠르게 연속 삭제해도 각 행의 고유 ID를 key로 유지하고 현재 진행 중인 layout animation을 새
  위치로 interrupt할 수 있어야 한다. index를 React key로 사용하지 않는다.
- reduced motion에서는 x, y, scale과 layout tween을 제거하고 100ms opacity 피드백만 유지한다.
- FileUpload의 파일 삭제는 서버 업로드 취소와 별개다. 서버 전송을 시작한 이후의 취소·재시도는
  상위 feature가 명시적인 상태와 callback으로 전달한다.
- Button과 SplitButton의 pending 상태는 cursor를 wait로 바꾸지 않고 내부 spinner와 문구만
  전환한다.
- overlay는 열릴 때 focus를 올바른 menu 또는 dialog로 보내고 닫힌 뒤 trigger로 복귀한다.
- SplitButton의 기본 액션이 pending이면 중복 실행은 막지만 menu 정책은 prop으로 명시한다.

## 접근성

- 모든 control은 keyboard로 조작 가능하고 390px에서 최소 44px touch target을 확보한다.
- variant는 색만으로 상태를 전달하지 않는다.
- RadioGroup, Slider, Calendar, OTP는 label과 상태 설명을 programmatic하게 연결한다.
- FileUpload는 native file input을 유지하고 drag-and-drop이 keyboard 파일 선택을 대체하지 않는다.
- FileUpload는 `multiple` 속성을 mode와 동기화하고, 선택 목록에 접근 가능한 이름을 부여하며,
  파일별 삭제 버튼은 파일명을 포함한 `aria-label`을 가진다. drag 안내는 `aria-live="polite"`로
  전달한다.
- DatePicker와 RangePicker는 날짜 입력값을 텍스트로 읽을 수 있고 calendar popup 없이도 값을
  확인할 수 있어야 한다.

## 테스트 전략

- variant union과 public export를 타입 fixture로 검증한다.
- 각 컴포넌트의 controlled/uncontrolled, disabled, invalid, pending 상태를 단위 테스트로 고정한다.
- ButtonGroup과 ToggleGroup의 서로 다른 선택 계약을 keyboard 테스트로 검증한다.
- FileUpload는 idle → drag-active → selected 전환, 단일 교체, 다중 추가, 파일별 삭제, 마지막
  삭제 후 idle 복귀, 허용되지 않은 파일 처리와 reduced motion을 검증한다. 다중 추가의 28ms
  enter stagger, 홀짝 좌우 퇴장, 18ms layout stagger, 연속 삭제 시 안정적인 ID와 최종 순서도
  회귀 테스트로 고정한다.
- SplitButton은 기본 액션, menu open/close, Escape, focus return, 세 variant를 검증한다.
- 1440px와 390px, light/dark, normal/reduced motion에서 UI Lab 시각 회귀를 확인한다.
- 제품 적용 시 페이지별 중복 focus ring과 상태 CSS가 남지 않았는지 computed style과 FSD boundary
  테스트로 검사한다.

## 범위 제외

- 이번 문서는 입력·액션 배치의 디자인과 공용 API만 고정한다.
- 실제 `shared/ui` 구현, 제품 화면 교체, 다른 프로젝트용 패키지 추출은 별도 구현 계획에서 다룬다.
- 다음 SaaS 배치인 내비게이션, 메뉴·오버레이, 데이터·피드백과 차트 구현은 이 문서의 범위가
  아니다.

## 구현 참고

- [Motion AnimatePresence](https://motion.dev/docs/react-animate-presence)
- [Motion layout animation](https://motion.dev/docs/react-layout-animations)
- [Animate UI accessibility](https://animate-ui.com/docs/accessibility)
