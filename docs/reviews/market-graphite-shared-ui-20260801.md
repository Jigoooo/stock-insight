# Market Graphite shared UI release review — 2026-08-01

## 결과

확정된 인증·버튼·입력·선택·데이터 표시·상태 control·overlay·Toast 디자인을 FSD `shared/ui` 공개 경계로 연결했다. 인증과 워크스페이스 제품 화면은 canonical 경로만 사용하며 legacy `shared/ui/primitives`는 제거됐다.

## 구현 범위

- Controls: Button, IconButton, Input, InputGroup, Field, Select, Combobox, Switch, Checkbox, ToggleGroup, Textarea.
- Composition: Accordion, Card, native Table, Tabs, SearchField, workspace feedback/state.
- Overlay and feedback: Dialog, AlertDialog, Sheet, Tooltip, Sonner custom Toast.
- Source boundary: 실제 사용 중인 Animate UI Button/Slot/Accordion/Tabs/effect만 유지하고 license notice를 보존했다.
- Accessibility repair: forced-colors의 Input은 장식 halo 없이 2px `Highlight` outline을 control 자체에 표시한다.
- Test isolation: Dialog, Toast, crypto, Select, lazy-focus fixture의 Vite cache를 fixture/process별로 분리했다.

## 검증 근거

| Gate | 결과 |
| --- | --- |
| `pnpm format:check` | 936 files pass |
| `pnpm lint` | pass, semantic `role="group"` 경고 3개만 유지 |
| `pnpm typecheck` | 11 tasks pass |
| `pnpm test` | web 534/534 포함 pass |
| `pnpm test:design:hard` | 17/17 pass |
| `pnpm build` | 7/7 pass |
| `pnpm test:design:browser:production` | desktop/mobile 10/10 pass |
| `pnpm test:auth:visual:production` | light/dark, desktop/mobile, reduced-motion 10/10 pass |
| `pnpm test:select-controls:browser` | pass |
| `pnpm test:workspace:visual:production` | public login pending-to-error 4/4 pass, authenticated 116 skip |
| forced-colors focused gate | desktop/mobile 2/2 pass |
| credential-free impacted E2E | 42 pass, 4 credential-only skip |

전체 `pnpm test:e2e`를 고유 포트의 새 서버에서 실행했을 때 비인증 범위 58개는 통과했다. `crypto-workspace`와 `research-workspace-v3`의 12개는 `STOCK_INSIGHT_E2E_USERNAME/PASSWORD` 또는 storage state가 없어 suite의 명시적 guard에서 중단됐다. 기능 실패로 분류하지 않았지만 인증 행렬을 통과한 것으로도 기록하지 않는다.

## 브라우저 불변식

- login 390px와 desktop에서 수평 overflow 0, control/submit 높이 42px.
- placeholder 12.5px, input text 14px의 승인된 위계 유지.
- normal focus는 halo 중첩 없이 한 control surface가 소유하고, forced-colors는 2px native outline을 사용.
- reduced-motion 인증 캡처와 motion safety gate 통과.
- Dialog focus trap/Escape/alert dismissal과 custom Toast progress identity/retry/swipe를 desktop/mobile에서 통과.

## 남은 디자인 라운드

Chart/graph, carousel, bottom sheet, drawer, top navigation toggle, side tab/list는 UX Constitution과 이 공용 컴포넌트 경계를 유지한 채 브라우저 mockup으로 먼저 비교한다. 첫 순서는 chart/graph이며 Bklit 계열의 전문적인 정보 밀도를 참고하되 제품의 read-only research 언어를 유지한다.
