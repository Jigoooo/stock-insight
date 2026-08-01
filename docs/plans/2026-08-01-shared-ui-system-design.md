# Stock Insight Shared UI System Design

- 상태: 승인된 디자인 결정 통합본
- 작성일: 2026-08-01
- 대상: `apps/web`
- 상위 계약: `docs/design/ux-constitution.md`
- 현재 구현 기준: `master` at `c607a71`

## 1. 목적

Stock Insight의 인증 화면과 리서치 워크스페이스를 하나의 공용 UI 시스템으로 통합한다. OpenHuman에서 가져온 절제된 레이아웃 감각과 조밀한 반응성을 유지하면서, 금융 리서치 제품에 필요한 정보 밀도와 전문성을 확보한다.

이번 설계의 핵심은 특정 화면을 예쁘게 만드는 것이 아니라 다음 계약을 세우는 것이다.

1. Button, Input, Select, Card 같은 값은 한 곳에서만 정의한다.
2. 페이지와 위젯은 공용 컴포넌트를 조립하며 내부 border, focus, motion을 다시 정의하지 않는다.
3. Animate UI, Radix, Sonner는 공개 디자인 언어가 아니라 접근성·상호작용을 제공하는 내부 구현 기반이다.
4. light/dark, reduced motion, keyboard semantics와 인증·데이터 계약을 시각 변경과 분리해 보존한다.
5. 전체 전환은 컴포넌트 기반과 화면 기반 단계로 나누되, 최종 결과는 모든 화면이 같은 공용 계층을 사용해야 한다.

## 2. 범위와 비범위

### 범위

- 로그인·회원가입 인증 shell
- 리서치 워크스페이스 shell, navigation, topbar, tabs와 content surface
- Button, Input, Field, Select, Combobox, Accordion, Card, Table
- Switch, Toggle Group, Checkbox, Textarea
- Dialog, AlertDialog, Toast
- loading, error, empty, pending, selected, disabled 상태
- 전역 semantic token과 light/dark 자동 테마
- Motion 기반 interaction과 reduced-motion 계약
- FSD `shared/ui` 공개 API 및 마이그레이션 경계

### 비범위

- 인증 API, validation, enrollment code, redirect 계약 변경
- 투자 데이터·리서치 API·Zod schema 변경
- 매수·매도 조언 기능 추가
- 차트 시각화 재설계. `bklit.com`은 후속 차트 단계의 레퍼런스로만 보존한다.
- runtime theme picker
- SaaS UI, Chakra, Base UI 등의 Provider 추가
- 외부 디자인 사이트의 시각 코드를 무분별하게 혼합

## 3. 디자인 기준과 출처 역할

| 출처 | 역할 | 적용 범위 |
| --- | --- | --- |
| OpenHuman | 구성과 분위기 | 인증 shell, 여백, 카드 비례, 절제된 배경 |
| Animate UI | 인터랙션 구현 | Button과 Motion 패턴, registry 기반 소스 |
| shadcn | 입력 계층 구조 | Field, Label, Input, InputGroup 조합 |
| Radix UI | headless semantics | Select, Accordion, Checkbox, Toggle Group, Dialog |
| Sonner | Toast transport | viewport, queue, stack, swipe, dismiss |
| SaaS UI | 구조 참고만 | 컴포넌트 anatomy와 상태 구분 |
| 기타 제공 레퍼런스 | 비교·비평 | 시각 후보 검토에만 사용, 구현 소스가 아님 |

Aceternity, Animata, Shadcn Space, SmoothUI, ReactBits, Uiverse, 21st.dev, GetDesign, Watermelon, Cult UI, Skiper UI, Magic UI, Kokonut UI는 특정 효과를 비교하는 참고 자료로만 사용한다. 구현마다 서로 다른 라이브러리 문법을 섞지 않는다.

## 4. 전역 profile: Market Graphite

기존 `calm-market` profile의 애매한 파란색 중심 palette를 중립 graphite 기반 profile로 교체한다. 배경과 control은 무채색·저채도 olive를 사용하고, 색은 상태 전달에만 제한한다.

### Dark semantic 방향

| Role | 기준값 |
| --- | --- |
| canvas | `#11120F` |
| surface | `#171815` |
| surface-raised | `#1C1D19` |
| surface-inset | `#151613` |
| border | `#353830` |
| border-strong | `#606459` |
| text-primary | `#EFEFEA` |
| text-secondary | `#B8BBB2` |
| text-tertiary | `#7D8177` |
| control-primary | `#D0D2CB` |
| on-primary | `#20211D` |

### Light semantic 방향

| Role | 기준값 |
| --- | --- |
| canvas | `#F2F1EC` |
| surface | `#FBFAF5` |
| surface-raised | `#FFFFFF` |
| surface-inset | `#EAE9E2` |
| border | `#D2D0C7` |
| border-strong | `#96988F` |
| text-primary | `#20211D` |
| text-secondary | `#53564F` |
| text-tertiary | `#777A72` |
| control-primary | `#252620` |
| on-primary | `#F3F3EE` |

### 상태색

- positive: 밝은 황록 계열. 성공·완료에만 사용한다.
- signal: 옅은 황토 계열. 주의·후속 행동에 사용한다.
- risk: 코랄 계열. 오류·위험 행동에만 사용한다.
- info 전용 파란색은 만들지 않는다. 정보 상태는 중립색과 아이콘·문구로 구분한다.

### Profile 규칙

- OS light/dark를 자동 추종한다.
- 수동 theme toggle은 제공하지 않는다.
- gradient text, 장식용 badge, 과도한 glow를 사용하지 않는다.
- grid, glow, market texture는 macro background에서만 낮은 대비로 허용한다.
- 상태색은 작은 dot, icon, border처럼 의미가 있는 영역에만 사용한다.

## 5. 타이포그래피와 밀도

- 제품 워드마크: `Stock Insight`.
- 큰 마케팅 headline, eyebrow, chip 조합을 인증 화면에 두지 않는다.
- auth와 workspace는 같은 type family를 사용하되 밀도만 다르게 한다.
- 일반 본문: `13–14px`, line-height `1.55–1.7`.
- control text: `12–13px`를 기본으로 하며 placeholder가 label보다 커 보이지 않게 한다.
- table body는 기존보다 한 단계 키우고 숫자는 tabular-nums를 사용한다.
- Toast title/body/action은 각각 약 `12px / 10.5px / 8.5–9px`의 상대 위계를 유지한다.

## 6. Motion 계약

### 공통

- JavaScript animation은 `motion` 경계를 사용한다.
- border, color, background의 짧은 transition과 spinner keyframe은 CSS로 유지한다.
- root에 `MotionConfig reducedMotion="user"`를 적용한다.
- reduced motion에서는 이동·scale·infinite decorative motion을 제거하고 opacity 또는 즉시 상태 전환만 남긴다.
- 컴포넌트 motion은 상태를 설명해야 하며 장식만을 위한 반복 animation을 금지한다.

### Interaction

- 기본 Button은 hover/tap scale을 사용하지 않는다.
- press는 `translateY(1px)`와 낮은 inset shadow로 표현한다.
- loading 중 pointer cursor를 사용하지 않고 `cursor: default`를 사용한다.
- loading은 버튼 폭을 바꾸지 않고 spinner와 label을 내부에서 교체한다.
- Input focus는 control shell 한 곳이 소유한다. label을 다시 눌러도 이미 focus된 input의 animation이 재시작되지 않는다.
- Select option 선택은 즉시 반영하고 `145–190ms` 내 정상적으로 닫는다.
- Accordion auto-height는 약 `220ms`, opacity와 최대 `4px` 이동만 사용한다.
- Dialog는 우측 `x: 72px → 0`, opacity, 약 `310ms`의 낮은 bounce spring을 사용한다.
- Toast의 outer stack·swipe는 Sonner가 담당하고 내부 상태 전환은 local component가 담당한다.

## 7. 인증 화면

### Shell

- 로그인과 회원가입은 같은 auth shell을 사용한다.
- desktop 기준 중앙 정렬, 약 `420px` card, `16px` radius, 얇은 border와 낮은 shadow를 사용한다.
- 상단에 별도 아이콘 없이 `Stock Insight` 텍스트 워드마크를 사용한다.
- 배경은 절제된 금융 chart grid와 저채도 market glow를 사용한다.
- 큰 마케팅 문구, eyebrow, chip, gradient text, 장식 badge를 두지 않는다.
- 로그인 제목과 안내 문구는 짧고 기능적으로 작성한다.

### 기능 보존

- 로그인 성공·실패·pending, 비밀번호 표시와 redirect를 유지한다.
- 회원가입 validation, availability 네 상태, enrollment code 흐름을 유지한다.
- 오류 영역은 Presence 기반으로 자연스럽게 진입·퇴장하며 레이아웃이 깜박이지 않게 한다.
- 로그인과 회원가입은 공용 Field, Input, Button을 직접 조합하고 페이지 CSS로 focus ring을 다시 정의하지 않는다.

## 8. 워크스페이스 shell과 surface

승인된 A+B 조합을 유지한다.

- desktop은 확장·축소 가능한 navigation rail과 bounded topbar를 유지한다.
- mobile은 동일한 navigation을 Sheet로 제공한다.
- content는 반복되는 floating card pile보다 editorial section, ledger row, bounded panel을 우선한다.
- route-level tab은 후속으로 보존한 hairline navigation 스타일을 사용한다.
- 동일 화면의 display mode처럼 서로 배타적인 짧은 선택에는 Inset Rail Toggle Group을 사용한다.
- shell은 navigation, search slot, contextual action, overlay를 조립하며 각 control의 내부 스타일을 소유하지 않는다.
- 배경은 neutral graphite를 유지하고 금융 전문성은 정보 밀도, grid, typography, provenance와 상태 문구로 만든다.

## 9. 공용 컴포넌트 계약

### 9.1 Button

- 역할: `primary`, `secondary`, `outline`, `ghost`, `danger`, `icon`.
- Primary는 승인된 C+D 조합을 사용한다.
- press는 scale 없이 1px 이동과 inset shadow를 사용한다.
- loading 시 width가 고정되고 spinner와 label만 전환된다.
- pending·disabled는 재실행되지 않으며 cursor는 `default`다.
- secondary 역할은 다음처럼 구분한다.
  - outline: 일반적인 취소·보조 행동
  - soft: 낮은 강조도의 도구 행동
  - ghost: chrome과 toolbar의 조용한 행동
- 인증 submit은 primary를 사용한다.

### 9.2 Field, Input, InputGroup

- BC 조합을 전역 기본으로 사용한다.
- label은 native `htmlFor`/`id` 연결을 유지한다.
- InputGroup shell만 hover, focus, invalid border를 소유한다.
- 내부 `input`과 addon button은 별도의 outline이나 ring을 만들지 않는다.
- focus는 단일 반투명 neutral ring이며 blue ring을 사용하지 않는다.
- auth, general, search density를 제공한다.
- placeholder는 본문보다 한 단계 작거나 같은 크기이며 낮은 대비를 사용한다.
- 이미 focus된 input에서 label을 클릭해도 keyframe이나 Motion focus animation을 재실행하지 않는다.

### 9.3 Select와 Combobox

- A+C 조합을 사용한다.
- trigger 기본 높이는 약 `40px`.
- compact option은 `38px`, descriptive option은 약 `51px`.
- option 사이에 `2px` 간격을 두어 hover와 selected background가 붙어 보이지 않게 한다.
- selected indicator는 option 내부에서 scale/opacity로 나타난다.
- 선택은 즉시 적용하고 정상적인 짧은 exit 후 닫힌다.
- keyboard: Arrow, Home/End, Enter/Space, Escape, typeahead를 지원한다.
- Combobox는 검색 input과 option list를 조합하되 Select의 option visual contract를 재사용한다.

### 9.4 Accordion

- `Editorial Lines`: 일반 콘텐츠의 기본.
- `Research Ledger`: metadata와 근거가 많은 영역.
- `Index Rail`: 순서가 중요한 영역.
- 독립 card pile 방식은 사용하지 않는다.
- trigger 전체가 target이며 chevron과 내용의 motion timing을 맞춘다.

### 9.5 Card와 Surface

- `Panel Frame`: bounded panel과 inspector.
- `Quiet Surface`: 낮은 계층의 묶음.
- `Editorial Section`: 기본적으로 borderless인 문서형 섹션.
- `Selectable Card`: 사용자 선택이 필요한 interactive card에만 사용한다.
- 모든 데이터를 card로 감싸지 않는다. list/table/feed는 flat row와 section을 우선한다.

### 9.6 Table

- 실제 `<table>` semantics를 유지한다. flex table로 교체하지 않는다.
- `surface="framed" | "plain"`을 제공한다.
- plain은 외부 border, radius, background를 제거하고 header·row separator만 유지한다.
- A Compact Grid, B Research Ledger, C Selectable Table, D mobile stacked representation을 역할별로 제공한다.
- sort 시 row가 새 위치로 이동하는 motion을 제공하고 header line flash를 만들지 않는다.
- single·multiple selection을 지원한다.
- row 전체 click으로 선택하며 명시적인 radio/checkbox가 focus owner다.
- multiple mode는 같은 row를 다시 눌러 선택 해제할 수 있다.
- multiple selection 결과와 batch action은 table 외부 summary/action card에 표시한다.

### 9.7 Switch, Checkbox, Toggle Group

- Switch는 `Quiet Neutral`과 `Tactile Inset` 두 variant를 유지한다.
- Checkbox는 A, B, C 세 variant를 목적에 따라 유지한다.
- Toggle Group은 연결된 B Inset Rail을 기본으로 사용한다.
- Toggle Group은 press animation 없이 selection background만 slide한다.
- route-level tab으로 사용할 hairline C variant는 tabs 작업에서 사용하며 일반 toggle API에 혼합하지 않는다.

### 9.8 Textarea

- `Plain`: 일반 form 기본.
- `Research Composer`: 긴 리서치 메모와 상태 footer.
- `Editorial Note`: 문서형 짧은 기록.
- Dialog 안에서도 동일한 component를 사용하며 Dialog CSS가 border/focus를 덮지 않는다.

### 9.9 Dialog와 AlertDialog

- Dialog는 하나의 shell primitive이고 Modal은 size/behavior preset이다.
- AlertDialog는 별도 semantics를 사용한다.
- content composition: Form, Detail Viewer, Decision, Alert.
- Form은 공용 Input, Select, Textarea, Checkbox를 조합한다.
- Decision은 Inset Rail, Selectable Card, Checkbox를 조합한다.
- Detail은 Card, Accordion, Table을 조합한다.
- Alert는 본문과 danger/cancel action만 사용한다.
- close button은 `32×32px`, 상시 보이는 square hairline border, `7px` radius를 사용한다.
- footer action은 높이 `36px`, 기본 최소 폭 `92px`, primary/danger 최소 폭 `104px`를 사용한다.
- Form, Detail, Decision은 X, Escape, outside interaction의 표준 Dialog 규칙을 따른다.
- Alert는 X와 outside dismiss를 제공하지 않고 explicit cancel/danger만 사용한다.

### 9.10 Toast

- Sonner `toast.custom()`과 `unstyled: true`를 사용한다.
- Sonner는 viewport, queue, stack, swipe, dismiss만 소유한다.
- local AppToast가 JSX, icon, copy, action, timer, internal state transition을 소유한다.
- vertical tone rail을 제거하고 밝은 상태색 `2px` outer border를 사용한다.
- dark background에서 한눈에 보이도록 일반 surface보다 밝은 toast surface와 강한 text contrast를 사용한다.

역할:

1. `Quiet Status`: 짧은 저장·완료, 약 3초, 닫기 없음.
2. `Action Ledger`: title, description, 단일 action, 명시적 X.
3. `Progress Morph`: 크기를 유지하며 loading → success/error 전환.
4. `Critical Persistent`: 자동 dismiss 없음, retry/detail과 명시적 X.

정렬 계약:

- icon은 전용 column에서 수직 중앙 정렬한다.
- X는 별도 column을 소유하며 action과 겹치지 않는다.
- B action은 하단 우측 끝선에 정렬한다.
- C의 loading과 check icon은 같은 `18×18px` box 중앙에 위치한다.
- D action text는 toast title/body보다 작고 덜 굵게 표현한다.

## 10. FSD 목표 구조

`shared`는 비즈니스 무지 상태를 유지한다. `primitives`, `components`, `hooks`, `types` 같은 essence 기반 공개 폴더를 만들지 않고 컴포넌트 목적별 폴더를 사용한다.

```text
apps/web/src/shared/ui/
├── accordion/
│   ├── accordion.tsx
│   ├── accordion.module.css
│   └── index.ts
├── button/
│   ├── button.tsx
│   ├── button.module.css
│   └── index.ts
├── card/
├── checkbox/
├── combobox/
├── dialog/
├── field/
├── input/
├── scroll-area/
├── select/
├── switch/
├── table/
├── tabs/
├── textarea/
├── toast/
├── toggle-group/
├── motion/
├── workspace/
└── index.ts
```

### Public API

- 화면과 feature는 `@/shared/ui/button`, `@/shared/ui/input`처럼 component public API를 사용한다.
- component folder 내부에서는 상대 import를 사용한다.
- `animate-ui`와 Radix primitive 내부 경로는 page, widget, feature에 노출하지 않는다.
- `workspace`는 도메인 용어를 포함하지 않는 layout composition만 유지한다. Stock, portfolio, theme 같은 개념이 들어가면 page/widget/entity로 이동한다.
- root `@/shared/ui` barrel은 안정적인 core export만 제공하고, 무거운 overlay·toast는 component path를 사용해 lazy boundary를 보존한다.

### Source ownership

- Animate UI registry에서 직접 가져온 파일은 upstream URL, revision, registry item과 license notice를 유지한다.
- Tailwind utility와 CVA가 원본 계약인 파일은 그 구조를 유지하되 public API는 component folder에서 노출한다.
- 페이지 CSS Modules는 layout, spacing, composition만 소유한다.
- component state CSS는 해당 component folder에서만 정의한다.

## 11. 현재 구조에서의 수렴 방향

현재는 같은 역할이 다음 경로에 흩어져 있다.

- `shared/ui/button.tsx`
- `shared/ui/animate-ui/components/buttons/button.tsx`
- `shared/ui/primitives/button.tsx`
- `shared/ui/input.tsx`, `input-group.tsx`, `field.tsx`
- `shared/ui/primitives/form.tsx`
- `shared/ui/primitives/select-box.tsx`, `combobox.tsx`

최종 상태에서는 역할별 public component가 하나만 남아야 한다. 마이그레이션 중에는 compatibility re-export를 허용하지만 새 호출부가 legacy path를 추가하는 것은 금지한다.

수렴 순서:

1. theme token과 motion contract를 먼저 확정한다.
2. Button, Field/Input을 canonical path로 이동한다.
3. Select/Combobox, state controls, Textarea를 이동한다.
4. Card, Table, Accordion, Tabs를 이동한다.
5. Dialog와 Toast를 이동한다.
6. auth → shell → workspace page 순으로 호출부를 바꾼다.
7. legacy re-export와 사용되지 않는 halo/controller를 제거한다.

## 12. 접근성과 상태 계약

- 모든 interactive target은 최소 `24×24px`를 충족한다.
- mobile primary action은 가능하면 `44px` 높이를 사용한다.
- `focus-visible`만 keyboard ring을 표시하고 pointer click에서 불필요한 ring을 만들지 않는다.
- label의 native focus behavior를 제거하지 않는다.
- Dialog focus trap, opener restore, Escape semantics를 유지한다.
- Table, Select, Combobox, Accordion은 native/Radix semantics를 유지한다.
- loading, error, empty, ready, stale를 다른 상태로 표현한다.
- `aria-live`는 Toast와 실제 비동기 상태 변경에만 제한한다.
- forced colors와 prefers-contrast에서 border와 focus owner가 사라지지 않아야 한다.

## 13. 테스트 계약

### Component

- Button loading width, cursor, disabled motion
- Input single focus ring, label focus, already-focused no-retrigger
- Select keyboard, option gap, selected state, close timing
- Accordion keyboard와 auto-height
- Table sort, single/multiple row selection, plain surface
- Switch/Checkbox/Toggle keyboard와 controlled/uncontrolled state
- Dialog focus trap, close policy, reduced motion
- Sonner custom Toast stack, swipe, timers, progress morph, retry morph

### Screen

- 로그인 성공·실패·pending·password visibility
- 회원가입 validation·availability 네 상태·enrollment
- desktop `1440px`, mobile `390px`, light/dark
- workspace navigation expanded/compact/mobile
- overlay, append reveal, relation crossfade
- no horizontal overflow, focus order, Axe smoke

### Final gate

1. `pnpm format:check`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm test:design:hard`
6. `pnpm build`
7. `pnpm test:e2e`
8. `git diff --check`
9. `graphify update .`

## 14. 구현 단계의 완료 기준

- 모든 제품 화면이 canonical shared component path를 사용한다.
- page/widget CSS에 Input focus, Button press, Select option, Dialog action state 재정의가 없다.
- `shared/ui/primitives`와 중복 root component는 compatibility layer를 거쳐 제거된다.
- Animate UI internal import를 page/widget/feature가 직접 사용하지 않는다.
- Sonner는 transport로 유지되고 Toast JSX와 상태 전환은 AppToast가 소유한다.
- blue 기반 active profile token이 제거되고 light/dark neutral profile이 적용된다.
- 인증과 workspace 기능 계약에 회귀가 없다.
- 브라우저 computed style에서 double focus ring, action overlap, icon misalignment가 없다.

## 15. 승인된 결정 요약

- OpenHuman은 layout·분위기 기준이다.
- Animate UI는 interaction 구현 기준이다.
- shadcn은 Field/Input 구조 기준이다.
- Radix는 복합 control semantics 기준이다.
- Sonner는 Toast transport 기준이다.
- provider 기반 SaaS UI/Chakra는 추가하지 않는다.
- neutral graphite palette를 사용하고 상태색을 제외한 애매한 파란색을 제거한다.
- 공용 컴포넌트는 FSD `shared/ui/<purpose>` 경로에서 공개한다.
- 인증과 workspace는 같은 공용 컴포넌트를 사용하며 화면별 CSS override를 금지한다.
