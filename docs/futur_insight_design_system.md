# Futur Insight Design Governance

이 문서는 더 이상 하나의 시각 스타일을 제품 전체에 강제하는 단일 원장이 아니다.

## 강제되는 사용자 경험 헌법

- `docs/design/ux-constitution.md`
- 접근성, keyboard semantics, target size, responsive safety, motion safety, 상태 진실성, 사용자 언어, semantic interface, 보안 경계를 정의한다.
- 위반은 배포를 차단한다.

## 현재 활성 디자인 profile

- `docs/design/profiles/calm-market.md`
- 현재 production의 palette, typography, material, composition, density, motion recipe를 기록한다.
- 특정 미감은 배포 헌법이 아니다. Constitution을 지키는 다른 profile로 교체할 수 있다.

## 코드 계층

1. Foundation: reset, focus, reduced-motion, responsive safety.
2. Semantic contract: component가 소비하는 안정적인 역할 이름.
3. Active profile: semantic 역할의 값과 시각 recipe.
4. Components: profile 값을 사용하되 안전 불변식을 유지.

## 테스트 계층

- `design:hard`: Constitution 위반을 차단한다.
- `design:audit`: 색상·radius·shadow·gradient·motion 분포를 비교 자료로 보고하며 미감을 판정하지 않는다.
- 제품 IA·데이터·인증 계약은 각 domain test가 소유한다.

## 변경 원칙

- 새로운 디자인을 시도할 때 기존 profile의 색·radius·layout을 복제할 필요가 없다.
- source regex로 특정 CSS 구현을 강제하지 않는다.
- 실제 접근성·overflow·focus·motion은 browser computed behavior로 검증한다.
- runtime profile picker는 별도 제품 요구가 생기기 전까지 만들지 않는다.

## Migration history

- 2026-07-17: Apple/Emil 기반 `Calm Market Lens` 전체 재설계 완료.
- 2026-07-17: 단일 디자인 원장을 UX Constitution + active profile 구조로 분리.