import type { TruthBinding } from './truth-binding-state';

import {
  renderSpecForTruthClass,
  type TruthClass,
  type TruthClassRenderSpec,
} from '@stock-insight/contracts/truth-visual-language';

/**
 * 공통 화면에 그려도 되는지 판정하는 문지기 — `REQ-REC-001` / `REQ-SEM-003`.
 *
 * `renderSpecForTruthClass()` 와 **같은 fail-closed 스타일**이다: 애매하면
 * 흐리게 그리는 것이 아니라 던진다. 개인 범위 진술이 공통 자산 화면에 새면
 * 남의 포트폴리오가 공유 화면에 뜨는 것과 같은 사고이고, 조용히 흐려진
 * 렌더는 그 사고를 사고로 보이지 않게 만든다.
 */
export function assertRenderableInCommonView(truthClass: TruthClass): TruthClassRenderSpec {
  // parse 가 먼저다. 알 수 없는 클래스는 privateScope 검사에 닿기 전에 던진다.
  const spec = renderSpecForTruthClass(truthClass);
  if (spec.privateScope) {
    throw new Error(`개인 범위 진술은 공통 화면에 렌더할 수 없습니다 (REQ-REC-001): ${truthClass}`);
  }
  return spec;
}

/** 화면에서 실제로 쓰는 선 모양. `none` 은 "주장이 아니라 선을 긋지 않는다". */
export type TruthRule = TruthClassRenderSpec['lineStyle'] | 'none';

/**
 * 색이 아니라 **선 모양**이 구분자다. `TruthClassRenderSpec` 에는 색 필드가
 * 아예 없고(계약이 이미 무지개를 거부한다), WCAG 1.4.1 · UX 헌법 1번도 색
 * 하나에 의미를 싣는 것을 금지한다. 칩의 한국어 라벨이 1차 구분이고 선 모양은
 * 그것을 되풀이하는 중복 단서다.
 */
export function truthRuleFor(binding: TruthBinding): TruthRule {
  if (binding.state !== 'bound') return 'none';
  return assertRenderableInCommonView(binding.truthClass).lineStyle;
}

/**
 * FORECAST 는 점이 아니라 범위로 그려야 한다(`distribution: true`).
 * 지금 085 는 FORECAST 에 아무것도 바인딩하지 않아 **화면에 도달하지 않는다** —
 * 이 함수는 그 규칙을 배선에 남겨두되 지금은 항상 false 를 돌려준다.
 * 도달하는 순간 점으로 그리는 사고를 막으라고 있는 자리다.
 */
export function requiresDistributionRendering(binding: TruthBinding): boolean {
  return binding.state === 'bound'
    ? assertRenderableInCommonView(binding.truthClass).distribution
    : false;
}

/** 인과는 스타일이 아니라 **명시적 라벨**로만 주장한다(§21.3). */
export function requiresCausalLabel(binding: TruthBinding): boolean {
  return binding.state === 'bound'
    ? assertRenderableInCommonView(binding.truthClass).requiresCausalLabel
    : false;
}
