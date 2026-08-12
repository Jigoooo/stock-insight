/**
 * 테마 화면은 아직 없다. 이 라우트는 옛 링크를 위한 리다이렉트다.
 *
 * 정본 01 §2 섹션 3 은 테마를 **7상태**(강세·초기형성·과열·약화·위험 등)로
 * 요구한다. 왜 아직 못 만드는지 2026-08-13 실측으로 좁혔다 — 배선 공백이
 * 아니라 상류 공백이다:
 *
 *   analytics.theme              138행, `maturity` 가 **전부 `emerging`**
 *                                (마이그레이션 013 의 DEFAULT 그대로. CHECK 도 없다)
 *   analytics.theme_membership   396행, `tier` 가 **전부 `adjacent`**
 *                                (핵심 구성원으로 분류된 종목이 하나도 없다)
 *   테마를 대상으로 한 knowledge.event   **0건**
 *   테마 데이터 최신                     2026-07-18 (일회성 덤프, 이후 갱신 없음)
 *
 * 7상태는 테마별 **시간에 따른 신호**를 요구하는데 그 신호가 존재하지 않는다.
 * 지금 분류기를 얹으면 전부 `emerging`·`adjacent` 인 축퇴된 입력 위에 다섯
 * 갈래를 만드는 것이고, 그것은 관측이 아니라 발명이다.
 *
 * 그러므로 순서는 (1) 테마 멤버십을 tier 별로 실제 분류하는 생산자,
 * (2) 테마 단위 관측 시계열, (3) 그 위의 성숙도 분류기 다. 화면은 마지막이다.
 */
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/workspace/themes')({
  beforeLoad: () => {
    throw redirect({ to: '/workspace/radar', replace: true });
  },
});
