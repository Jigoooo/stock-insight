# Futur Insight UX Constitution

## 목적

이 문서는 디자인 취향이 아니라 모든 디자인 profile이 지켜야 하는 사용자 안전·의미 계약이다. 색상, radius, shadow, gradient, material, composition, density, icon, animation 구현은 이 문서의 강제 대상이 아니다.

## Hard invariants

1. **접근성:** 일반 본문과 핵심 control은 WCAG AA를 충족하고 keyboard 사용 시 `focus-visible`이 명확해야 한다.
2. **Keyboard semantics:** tab, arrow, Home/End, Escape, focus trap, opener restore 등 해당 APG 동작을 유지한다.
3. **Target size:** 실제 표시되는 action target은 WCAG 2.5.8 기준 `24×24` CSS px 이상이어야 한다. mobile primary 44px는 권장치이지 미감 강제 규칙이 아니다.
4. **Responsive safety:** `390px` viewport에서 비의도성 horizontal overflow가 없어야 한다. 닫힌 off-canvas와 overlay underlay는 `inert`/`aria-hidden`으로 상호작용에서 제외한다.
5. **Motion safety:** `reduced motion`에서 infinite·strobe·장시간 decorative movement가 남지 않아야 한다.
6. **상태 진실성:** `loading / error / empty / ready / stale`는 서로 구분하며 API 오류를 empty로 위장하지 않는다.
7. **사용자 언어:** raw UUID, 내부 enum, source key는 기본 UI에 그대로 노출하지 않는다. 근거·기준 시각·한계는 이해 가능한 문구로 표시한다.
8. **Semantic compatibility:** 모든 active profile은 light/dark 양쪽에서 required `semantic token interface`를 완전하게 제공해야 한다.
9. **보안 경계:** auth hydration, same-origin, secure session, CSP와 security header 같은 비시각 불변식은 profile 변경으로 약화할 수 없다.

## 배포 게이트

- hard invariant 위반은 test/build/release를 차단한다.
- 특정 색상, radius, shadow, gradient, layout, motion library 선택은 배포를 차단하지 않는다.
- 제품 IA와 데이터 계약은 domain test가 소유하며 design taste test와 분리한다.
- source regex보다 computed browser behavior와 Axe 결과를 우선한다.

## Profile 권한

profile은 다음을 자유롭게 정할 수 있다.

- palette와 accent 전략
- typography scale·tracking·density
- radius·border·shadow·gradient·glass/material
- auth/shell/workspace의 layout과 composition
- card·row·editorial·terminal 문법
- icon과 illustration 사용 방식
- animation 유무, easing, duration, CSS/WAAPI/GSAP 구현
- sticky·grid·breakpoint 구현

어떤 profile도 이 Constitution의 접근성·진실성·보안 경계를 덮어쓸 수 없다.
