/**
 * 깊이 배정표 — **표 하나**.
 *
 * 표류 방지는 분기가 아니라 데이터로 한다. 뷰 컴포넌트는 모드를 읽지 않고,
 * `(surface, key)` 로 이 표를 조회해 `DepthGate` 에 깊이를 넘긴다.
 *
 * 출처:
 * - CAV 블록 12개: `docs/design/information-architecture.md` §4 배치표를 그대로 전사.
 *   키 목록의 정본은 `@stock-insight/contracts/common-asset-view` 의
 *   `commonAssetViewBlockKeys` 이고, 여기서 **그대로 재수출**한다.
 *
 *   2026-08-11 이전에는 여기 사본이 있었고 계약 테스트가 `apps/api` 의 리터럴을
 *   긁어 비교했다. 사유는 "프런트는 `apps/api` 를 import 할 수 없어서" 였는데,
 *   CAV 읽기 경로가 어휘를 계약 패키지로 옮기면서 그 사유가 사라졌다. 프런트는
 *   계약을 import 할 수 있으므로 사본을 둘 이유가 없고, 동기화를 강제하는 테스트도
 *   필요 없다 — 어긋날 두 벌이 애초에 없는 편이 어긋남을 잡는 테스트보다 낫다.
 * - Deep dive 섹션 12행은 **없앴다**(2026-08-13). 그 키로 조회하는 코드가 없었고,
 *   정본 01 §3 의 하위 섹션은 `pages/asset-deep-dive` 의 11탭이 CAV 블록 위에서
 *   덮는다. 사본을 두던 이유(FSD 상 `shared` 가 `pages` 를 import 할 수 없다)도
 *   함께 사라졌다 — 맞출 두 벌이 없으면 동기화 테스트도 필요 없다.
 *
 * 각 행의 `source` 는 그 깊이가 어디서 나왔는지를 적는다. 문서가 못 박지 않아
 * 이 표가 **판단한** 행은 `source` 가 "판단:" 으로 시작한다.
 */

import type { DepthLevel } from './depth-mode';

import {
  commonAssetViewBlockKeys,
  type CommonAssetViewBlockKey,
} from '@stock-insight/contracts/common-asset-view';

/** 계약이 정본이다. 여기는 배정표가 쓰는 이름으로 재수출만 한다. */
export const COMMON_ASSET_VIEW_BLOCK_KEYS = commonAssetViewBlockKeys;

export type { CommonAssetViewBlockKey };

/** IA §4 "주 화면" 열의 값들. */
export const DEPTH_SURFACES = [
  'today',
  'stock-detail',
  'radar',
  'status',
  'research-drawer',
] as const;
export type DepthSurface = (typeof DEPTH_SURFACES)[number];

export type DepthAssignmentKey = CommonAssetViewBlockKey;

export type DepthAssignment = {
  /** 이 항목이 놓이는 화면. 첫 원소가 주 화면. */
  surfaces: readonly DepthSurface[];
  /** 요약/배지 수준의 깊이. */
  depth: DepthLevel;
  /**
   * 같은 항목의 **상세가 다른 화면에 따로 배정된** 경우에만 있다.
   *
   * IA §4 행 11 원문: 주 화면 `stock-detail(요약) · status(전체)`,
   * 깊이 `essential`(배지) / `research`(상세). 즉 배지와 상세는 **한 화면 안의
   * 두 슬롯이 아니라 두 화면**이다 — 배지는 종목 상세가, 전체는 전역 status
   * 화면이 진다. IA §5 가 그 상세의 정체까지 지목한다: "삭제된 196줄에 해당하는
   * 상세는 `research` 깊이로 되살린다"(`484661e` 가 status-view 에서 지운 196줄).
   *
   * 이 주석은 한동안 "호출부가 배지를 그릴지 상세를 그릴지에 따라 골라 넘긴다"
   * 고 적어, IA 가 배정한 적 없는 **한 화면 안의 슬롯 축**을 발명했다. 그 축을
   * 믿고 찾으면 `AssetSection` 에 슬롯이 하나뿐이라 "필드가 안 쓰인다"는 결론이
   * 나오고, 실제 결함(두 번째 화면이 지어지지 않았다)은 보이지 않는다.
   */
  detailDepth?: DepthLevel;
  /** 어느 문서 줄에서 나왔는가. "판단:" 이면 문서가 못 박지 않은 행. */
  source: string;
};

/**
 * CAV 12블록 — IA §4 배치표 전사. 깊이 열을 그대로 옮겼다.
 */
const CAV_BLOCK_ASSIGNMENTS: Record<CommonAssetViewBlockKey, DepthAssignment> = {
  identity_economic_claim: {
    surfaces: ['stock-detail'],
    depth: 'essential',
    source: 'IA §4 블록 1 · 정본 01 §3 항목 1·2 (한 줄 설명, investable claim/ticker)',
  },
  business_sector_context: {
    surfaces: ['stock-detail'],
    depth: 'essential',
    source: 'IA §4 블록 2 · 정본 01 §3 항목 3 (sector/theme/value-chain 위치)',
  },
  comparable_financial_facts: {
    surfaces: ['stock-detail'],
    depth: 'standard',
    source: 'IA §4 블록 3 · 정본 01 §3 항목 6 (business drivers/KPI)',
  },
  recent_events_surprise: {
    surfaces: ['stock-detail', 'today'],
    depth: 'essential',
    source: 'IA §4 블록 4 · 정본 01 §3 항목 5 (최근 event와 expectation surprise)',
  },
  expectation_priced_in: {
    surfaces: ['stock-detail'],
    depth: 'standard',
    source: 'IA §4 블록 5 · 정본 01 §3 항목 7 (valuation·market-implied)',
  },
  exposure_impact: {
    surfaces: ['radar', 'stock-detail'],
    depth: 'essential',
    source: 'IA §4 블록 6 · 하위 섹션 exposure/impact paths',
  },
  valuation_market_implied: {
    surfaces: ['stock-detail'],
    depth: 'standard',
    source: 'IA §4 블록 7 · 정본 01 §3 항목 7',
  },
  market_reaction_tradability: {
    surfaces: ['stock-detail'],
    depth: 'standard',
    source: 'IA §4 블록 8 · 하위 섹션 market reaction/positioning',
  },
  multi_horizon_thesis: {
    surfaces: ['stock-detail'],
    depth: 'standard',
    source: 'IA §4 블록 9 · 정본 01 §3 항목 8 (thesis·counter-thesis)',
  },
  catalysts_risks_counter_evidence: {
    surfaces: ['stock-detail', 'today'],
    depth: 'essential',
    source: 'IA §4 블록 10 · 정본 01 §3 항목 9 (catalyst/risk/invalidation)',
  },
  coverage_freshness_uncertainty: {
    surfaces: ['stock-detail', 'status'],
    depth: 'essential',
    detailDepth: 'research',
    source: 'IA §4 블록 11 · essential(배지) / research(상세) · IA §5 "둘 다 둔다"',
  },
  derivation_release_manifest: {
    surfaces: ['research-drawer'],
    depth: 'research',
    source: 'IA §4 블록 12 · 하위 섹션 provenance/derivation research drawer',
  },
};

/**
 * Deep dive 섹션 12개. IA §4 는 화면 단위 섹션을 열거하지 않으므로, 각 섹션이
 * 투영하는 블록과 정본 01 §3 상의 위치(above-the-fold vs 하위 섹션 vs research
 * drawer)로 깊이를 정한다.
 */

/**
 * 표 하나. CAV 블록 12행, 키마다 정확히 한 행.
 *
 * **24행에서 12행이 됐다.** 뒤의 12행은 `stock-deep-dive.ts` 의 deep dive 섹션
 * ID 사본이었는데, 그 키로 조회하는 코드가 없었다 — `assignmentFor()` 의 유일한
 * 호출부(`asset-section.tsx`)가 받는 인자는 CAV 블록 키다. 정본 01 §3 의 하위
 * 섹션은 `pages/asset-deep-dive` 의 11탭이 CAV 블록 위에서 덮고 있고, 그 화면의
 * `asset-tabs.ts` 가 "표에 행을 더하지 않는 것이 배정을 어기는 게 아니라 배정을
 * 그대로 쓰는 것" 이라고 관계를 적어뒀다.
 *
 * 선언만 있고 이행이 없는 행은 배정이 아니라 **약속**이다. 그것을 표에 두면
 * 다음 사람이 "깊이가 배정돼 있다" 를 "깊이가 지켜진다" 로 읽는다.
 */
export const DEPTH_ASSIGNMENTS: Readonly<Record<DepthAssignmentKey, DepthAssignment>> = {
  ...CAV_BLOCK_ASSIGNMENTS,
};

export function assignmentFor(key: DepthAssignmentKey): DepthAssignment {
  return DEPTH_ASSIGNMENTS[key];
}

/**
 * 상세가 **다른 화면에** 따로 배정된 행에서만 부른다.
 *
 * 폴백이 없다. `assignment.detailDepth ?? assignment.depth` 는 표가 처음으로
 * 하중을 받는 자리에서 표를 무력화한다 — 배정이 없는 키로 부르면 조용히 요약
 * 깊이로 떨어져, 상세 화면을 짓지 않은 것과 지은 것이 코드에서 구별되지 않는다.
 * 던지는 편이 그 구별을 남긴다.
 */
export function detailDepthFor(key: DepthAssignmentKey): DepthLevel {
  const level = DEPTH_ASSIGNMENTS[key].detailDepth;
  if (level === undefined) {
    throw new Error(`${key}: 상세 깊이가 배정되지 않았습니다 (IA §4 의 해당 행을 확인하세요)`);
  }
  return level;
}
