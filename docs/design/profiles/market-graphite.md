# Market Graphite — Active Design Profile

- 상태: 현재 production 기본 profile
- profile id: `market-graphite`
- 상위 계약: `docs/design/ux-constitution.md`
- 구현 계약: `apps/web/src/shared/theme/design-profile-contract.ts`
- 의미: 이 문서는 현재 미감의 snapshot이며 배포 헌법이 아니다. 다른 profile은 상위 UX Constitution을 지키는 범위에서 교체할 수 있다.

## Design thesis

Market Graphite는 전문적인 리서치 도구의 밀도와 OpenHuman 계열의 촉각적인 반응을 결합한다. 화면의 기반은 neutral graphite와 저채도 olive로 유지하고, positive, signal, risk 색상은 실제 상태 전달에만 사용한다.

## Foundation

- light canvas: `#f2f1ec`
- dark canvas: `#11120f`
- control과 surface는 neutral border, 낮은 shadow, 작은 radius 차이로 계층을 구분한다.
- focus는 파란색 glow 대신 한 명확한 neutral owner만 사용한다.
- 버튼 press는 scale이 아니라 `translateY(1px)`와 inset shadow를 사용한다.

## Density

- auth는 약 420px shell과 여유 있는 form rhythm을 사용한다.
- workspace는 editorial section, ledger row, native table을 중심으로 더 조밀하게 구성한다.
- 반복되는 장식 card와 의미 없는 gradient, badge, chip을 기본값으로 사용하지 않는다.

## Motion

- control transition은 `--duration-fast`, panel transition은 `--duration-base`를 사용한다.
- JavaScript animation은 local Motion boundary 안에서만 구현한다.
- `prefers-reduced-motion`에서는 transform 이동을 제거한다.

## Component ownership

- shared component가 border, focus, pressed, selected, pending, loading 상태를 소유한다.
- page와 widget은 배경, layout, spacing, product copy만 소유한다.
- 미확정된 navigation, chart, graph, drawer, bottom sheet 시각 규칙은 후속 디자인 라운드에서 이 문서에 추가한다.

## Shared UI baseline — 2026-08-01

- 공용 진입점은 `apps/web/src/shared/ui/<component>`이며 제품 layer에서 내부 파일이나 legacy `primitives` 경로를 직접 import하지 않는다.
- 확정 완료: Button, IconButton, Input, InputGroup, Field, Select, Combobox, Accordion, Card, Table, Switch, Checkbox, ToggleGroup, Textarea, Tabs, Dialog, AlertDialog, Sheet, Tooltip, Sonner custom Toast, feedback state, workspace shell.
- Animate UI 원본 경계는 Button, Slot, Accordion, Tabs와 실제로 쓰이는 effect에만 남긴다.
- auth input placeholder는 본문보다 작은 `12.5px`, control은 `42px`로 고정한다. forced-colors에서는 장식 halo 대신 control 자체의 2px outline을 사용한다.
- fixture Vite cache는 fixture/process별로 격리해 병렬 Playwright 실행 중 dependency 재최적화가 서로의 module graph를 끊지 않게 한다.
