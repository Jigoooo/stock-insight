# Calm Market Lens — Active Design Profile

- 상태: 현재 production 기본 profile
- profile id: `calm-market`
- 상위 계약: `docs/design/ux-constitution.md`
- 의미: 이 문서는 현재 미감의 snapshot이며 배포 헌법이 아니다. 다른 profile은 상위 UX Constitution만 지키면 이 값을 자유롭게 교체할 수 있다.

## Implementation contract

- profile은 `apps/web/src/shared/theme/design-profile-contract.ts`의 `requiredSemanticTokens`를 base `:root`에 정의한다.
- active profile 선택은 같은 파일의 `activeDesignProfile` 한 곳에서 `id`, `cssHref`, light/dark `themeColors`를 함께 바꾼다.
- 기존 component alias는 `apps/web/public/styles/index.css`가 semantic token으로 연결한다. profile이 alias를 복제하지 않는다.
- accent background를 쓰는 control은 `--color-on-accent`를 소비한다. profile은 light/dark 모두에서 이 조합을 WCAG AA로 유지한다.
- 새 profile은 `design-profile-contract.test.ts`에서 completeness와 전체 component variable resolution을 통과해야 한다.
- release 전 `pnpm verify:release`로 static gate, build, desktop/mobile active·alternative profile browser gate를 실행한다.

## Reference basis

- Apple HIG / Apple Design: hierarchy, legibility, adaptive layout, material as structure.
- Emil Kowalski: responsive press feedback와 restrained motion.
- Linear: dense work-tool shell과 restrained functional accent.
- OpenBB: 금융 데이터의 table·ledger 밀도와 provenance 가시성.

## Design thesis

1. **Calm Market Lens:** 시장 신호와 근거를 차분하고 선명하게 읽게 한다.
2. **Material encodes hierarchy:** auth, topbar, inspector 같은 macro surface만 elevated/material로 처리한다.
3. **One product, two densities:** auth는 여유 있게, workspace는 조밀하게 표현한다.
4. **Truthful research UI:** 근거 수준·기준 시각·한계를 평문으로 표시한다.

## Palette

| Role | Light | Dark |
|---|---|---|
| canvas | `#F3F6FA` | `#070C14` |
| surface | `#FFFFFF` | `#0E1724` |
| surface-subtle | `#EAF0F7` | `#162233` |
| chrome | `#0B1628` | `#07101E` |
| text-primary | `#142033` | `#F2F6FC` |
| text-secondary | `#53637A` | `#AAB8CA` |
| accent | `#356FAF` | `#7FB0EB` |
| positive | `#2E8065` | `#72D1AD` |
| warning | `#9B672B` | `#E0B46E` |
| risk | `#B44B50` | `#FF999E` |

## Geometry and typography

- radius: control `10px`, compact surface `12px`, panel `16px`, auth macro `24–28px`.
- spacing: `4, 8, 12, 16, 24, 32, 48, 64`.
- font: Wanted Sans Variable, system sans fallback.
- body: `13–14px / 1.55–1.7`; restrained Korean heading tracking.

## Material and composition

- auth desktop는 product context와 credential workflow의 split-screen 구성.
- sidebar는 dark chrome, topbar와 inspector는 bounded translucent material.
- feed와 table은 반복 card pile보다 flat row·ledger를 우선한다.
- themes는 bounded ledger와 relation surface를 함께 보여준다.
- mobile은 동일한 정보 구조를 stack으로 재배치한다.
- backdrop material은 opaque fallback을 제공하며 dialog scrim에는 blur를 사용하지 않는다.

## Motion profile

- press `120ms`, control `160–180ms`, panel `240–280ms`.
- main ease: `cubic-bezier(0.23, 1, 0.32, 1)`.
- current press recipe: button `scale(0.97)`, icon action `scale(0.94)`.
- hover는 `(hover: hover) and (pointer: fine)`에서만 시각 효과를 준다.
- reduced-motion에서는 위치 이동을 제거한다.

## Current screen recipes

- Auth: desktop split-screen, mobile stack.
- Shell: dark sidebar, sticky translucent topbar.
- Today/feed: compact macro surface와 flat rows.
- Themes/relation: scrollable theme ledger와 sticky relation inspector.
- Inspector: desktop side surface, mobile bounded drawer.

이 recipe들은 `calm-market`의 선택이다. 다른 profile은 UX Constitution을 지키는 범위에서 gradient, 다른 radius, 다른 composition, 다른 motion implementation을 사용할 수 있다.
