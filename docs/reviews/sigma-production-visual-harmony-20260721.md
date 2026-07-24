# Sigma production visual harmony receipt — 2026-07-21

- 검증 시각: `2026-07-21T00:32:56+09:00`
- production artifact: `apps/web/.output/server/index.mjs`
- artifact SHA-256: `a94cf2c5671966e51d7c069383dee639a1750c8f96feb4da5c732eb468722fb1`
- 실행 gate: `pnpm test:sigma:browser:production`
- 결과: desktop/mobile 8/8 PASS
- 적용 CSP: `deploy/stock-edge/security-headers.conf` (`worker-src blob:`)

## 렌더 증거

| 화면 | 파일 | bytes | SHA-256 |
|---|---|---:|---|
| Desktop 1440×960 | `docs/reviews/assets/sigma-production-desktop-20260721.png` | 35,880 | `1ee8797475090add43b16a6db11fdc9587b26f7920a7e79b2ea3860c177f3137` |
| Pixel 7 390×844 | `docs/reviews/assets/sigma-production-mobile-20260721.png` | 203,622 | `aee46b2b2e13d71a3cdf2d85f51fe1cd55ff368f1248ee1235f346a99b628fe5` |

## 조화 판정

- 지배 지도: root node가 1차, graph cluster가 2차, 검색·camera controls가 3차로 읽힘.
- 액센트 예산: navy accent는 root/active control에 국한되며 중립 node·edge와 경쟁하지 않음.
- 정렬 spine: 검색창과 3개 controls의 상단·높이 축이 정렬되고, 320/390px bounding-box 비중첩을 E2E로 확인.
- squint test: root와 graph cluster가 즉시 식별되고 주변 controls·node list는 보조 위계를 유지.
- computed color: graph frame와 Sigma canvas 모두 `rgb(255, 255, 255)`.
- 판정: BLOCKER 0 / HIGH 0 / MEDIUM 0.

## 한계

Windows native 125%·150% 렌더는 이 receipt에서 직접 실행하지 않았습니다. 본 증거는 production Chromium desktop 및 Pixel 7 emulation 범위입니다.
