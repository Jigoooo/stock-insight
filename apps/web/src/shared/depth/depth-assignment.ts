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
 * - Deep dive 섹션 12개: 정본은 `@/pages/research-workspace/model/stock-deep-dive`
 *   의 `DEEP_DIVE_SECTION_IDS`. `shared` 는 `pages` 를 import 할 수 없으므로(FSD)
 *   여기서도 사본을 두고 계약 테스트가 동기화를 강제한다. IA §4 의 "대응 정본 01
 *   §3 항목" 열이 조인 키다 — above-the-fold 항목이면 `essential`, 하위 섹션이면
 *   `standard`, research drawer 면 `research`.
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

/**
 * `@/pages/research-workspace/model/stock-deep-dive` 의 `DEEP_DIVE_SECTION_IDS`
 * 사본. 계약 테스트가 동기화를 강제한다.
 */
export const DEEP_DIVE_SECTION_IDS = [
  'identity',
  'performance',
  'direct_relations',
  'secondary_exposure',
  'factor_exposure',
  'active_events',
  'historical_analog',
  'scenario',
  'counter_evidence',
  'derivation',
  'holding_judgment',
  'invalidation',
] as const;

export type DeepDiveSectionId = (typeof DEEP_DIVE_SECTION_IDS)[number];

/** IA §4 "주 화면" 열의 값들. */
export const DEPTH_SURFACES = [
  'today',
  'stock-detail',
  'radar',
  'status',
  'research-drawer',
] as const;
export type DepthSurface = (typeof DEPTH_SURFACES)[number];

export type DepthAssignmentKey = CommonAssetViewBlockKey | DeepDiveSectionId;

export type DepthAssignment = {
  /** 이 항목이 놓이는 화면. 첫 원소가 주 화면. */
  surfaces: readonly DepthSurface[];
  /** 요약/배지 수준의 깊이. */
  depth: DepthLevel;
  /**
   * 같은 항목의 **상세**가 따로 배정된 경우에만 있다(IA §4 블록 11:
   * `essential`(배지) / `research`(상세)). 호출부가 배지를 그릴지 상세를 그릴지에
   * 따라 `depth` 또는 `detailDepth` 를 골라 `DepthGate` 에 넘긴다 — 게이트는
   * 이 구분을 모른다.
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
const DEEP_DIVE_SECTION_ASSIGNMENTS: Record<DeepDiveSectionId, DepthAssignment> = {
  identity: {
    surfaces: ['stock-detail'],
    depth: 'essential',
    source: 'IA §4 블록 1 → 정본 01 §3 항목 1·2 (above-the-fold)',
  },
  performance: {
    surfaces: ['stock-detail'],
    depth: 'standard',
    source: 'IA §4 블록 3 → 정본 01 §3 항목 6',
  },
  direct_relations: {
    surfaces: ['stock-detail'],
    depth: 'essential',
    source: 'IA §4 블록 6 (exposure/impact, essential)',
  },
  secondary_exposure: {
    surfaces: ['stock-detail'],
    depth: 'standard',
    source:
      '판단: 블록 6 이지만 정본 01 §3 상 above-the-fold 가 아니라 하위 섹션(exposure/impact paths)이라 2차 경로는 한 번 펼쳐 닿게 둔다',
  },
  factor_exposure: {
    surfaces: ['stock-detail'],
    depth: 'research',
    source:
      '판단: 요인 노출은 정본 01 §3 의 10항목·11 하위 섹션 어디에도 이름이 없다. 파생 분석이라 research 로 둔다',
  },
  active_events: {
    surfaces: ['stock-detail', 'today'],
    depth: 'essential',
    source: 'IA §4 블록 4 → 정본 01 §3 항목 5 (above-the-fold)',
  },
  historical_analog: {
    surfaces: ['stock-detail'],
    depth: 'research',
    source: '판단: 과거 유사 사례는 정본 01 §3 항목에 없고 근거 추적 성격이라 research 로 둔다',
  },
  scenario: {
    surfaces: ['stock-detail'],
    depth: 'standard',
    source: 'IA §4 블록 9 → 정본 01 §3 항목 8 (thesis·counter-thesis)',
  },
  counter_evidence: {
    surfaces: ['stock-detail'],
    depth: 'standard',
    source:
      '판단: 블록 10 이름에 counter-evidence 가 있지만 정본 01 §3 의 essential 항목 9 는 catalyst/risk/invalidation 이고 counter-thesis 는 항목 8(=블록 9, standard)이다. 항목 8 을 따른다',
  },
  derivation: {
    surfaces: ['research-drawer'],
    depth: 'research',
    source: 'IA §4 블록 12 · 하위 섹션 provenance/derivation research drawer',
  },
  holding_judgment: {
    surfaces: ['stock-detail'],
    depth: 'essential',
    source:
      '판단: 보유 여부는 화면에서 합성하는 개인 데이터(REQ-REC-001 로 패킷에 없다). 사용자가 자기 보유를 확인하는 데 펼치기를 요구할 이유가 없어 essential',
  },
  invalidation: {
    surfaces: ['stock-detail'],
    depth: 'essential',
    source: 'IA §4 블록 10 → 정본 01 §3 항목 9 (catalyst/risk/invalidation, above-the-fold)',
  },
};

/** 표 하나. CAV 블록 12 + deep dive 섹션 12 = 24행, 키마다 정확히 한 행. */
export const DEPTH_ASSIGNMENTS: Readonly<Record<DepthAssignmentKey, DepthAssignment>> = {
  ...CAV_BLOCK_ASSIGNMENTS,
  ...DEEP_DIVE_SECTION_ASSIGNMENTS,
};

export function assignmentFor(key: DepthAssignmentKey): DepthAssignment {
  return DEPTH_ASSIGNMENTS[key];
}

/** 어떤 화면이 어떤 항목을 담는지 — 테스트와 화면 조립이 같은 표를 쓴다. */
export function assignmentKeysForSurface(surface: DepthSurface): readonly DepthAssignmentKey[] {
  return (Object.keys(DEPTH_ASSIGNMENTS) as DepthAssignmentKey[]).filter((key) =>
    DEPTH_ASSIGNMENTS[key].surfaces.includes(surface),
  );
}
