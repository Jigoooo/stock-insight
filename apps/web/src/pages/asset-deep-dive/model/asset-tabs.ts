/**
 * Asset Deep Dive 의 하위 탭 — 정본 01 §3 "하위 탭/섹션" 11개.
 *
 * ## 탭은 경로 세그먼트다
 *
 * `?tab=` 이 아니라 `/workspace/assets/{key}/{tab}` 이다. 그래야
 * `shared/ui/route-tabs` 의 `RouteTab` 이 진짜 `<a href>` 로 동작하고,
 * 키보드 · 가운데클릭 · 새 탭으로 열기 · 공유가 전부 공짜로 따라온다.
 * `?tab=` 이면 그 넷을 전부 우리가 다시 구현해야 한다.
 *
 * ## 깊이 배정 키를 새로 만들지 않는다
 *
 * `depth-assignment.ts` 의 표는 CAV 블록 12 + deep dive 섹션 12 = 24행이고,
 * `depth-mode-contract.test.ts` 가 **집합 동일성**을 단언한다:
 *
 * ```
 * assert.deepEqual([...tableKeys].sort(), [...expected].sort())
 * ```
 *
 * 그래서 새 키를 더하려면 `stock-deep-dive.ts` 의 `DEEP_DIVE_SECTION_IDS`
 * (다른 모듈의 계약, 자기 테스트를 가진)까지 건드려야 한다. 그럴 필요가 없다 —
 * 이 화면의 모든 탭은 CAV 블록 위에 서 있으므로, 각 탭이 **이미 표에 있는
 * 블록 키**로 깊이를 조회한다. 표에 행을 더하지 않는 것이 배정을 어기는 게
 * 아니라, 배정을 그대로 쓰는 것이다.
 */

import type { AssetBlockKey } from './asset-packet';

export const ASSET_TAB_IDS = [
  'identity',
  'business',
  'financials',
  'peers',
  'events',
  'themes',
  'exposure',
  'market',
  'valuation',
  'sources',
  'provenance',
] as const;

export type AssetTabId = (typeof ASSET_TAB_IDS)[number];

export type AssetTabDefinition = {
  id: AssetTabId;
  /** 탭 스트립에 나가는 짧은 이름. */
  label: string;
  /** 탭 본문 제목. */
  title: string;
  /** 이 탭이 서 있는 CAV 블록들. 첫 원소가 깊이 배정을 준다. */
  blockKeys: readonly [AssetBlockKey, ...AssetBlockKey[]];
  /** 정본 01 §3 하위 섹션 원문 — 어느 요구를 채우는지 화면에 적는다. */
  canonicalSection: string;
};

export const ASSET_TABS: readonly AssetTabDefinition[] = [
  {
    id: 'identity',
    label: '정체성',
    title: '회사·법인·증권 정체성',
    blockKeys: ['identity_economic_claim'],
    canonicalSection: '회사·법인·증권·토큰 정체성',
  },
  {
    id: 'business',
    label: '사업 구성',
    title: '제품·부문·지역·고객·공급자',
    blockKeys: ['business_sector_context', 'exposure_impact'],
    canonicalSection: '제품/segment/geography/customer/supplier',
  },
  {
    id: 'financials',
    label: '재무 구조',
    title: '재무 bridge 와 단위 경제',
    blockKeys: ['comparable_financial_facts'],
    canonicalSection: '재무 bridge와 unit economics',
  },
  {
    id: 'peers',
    label: '동종 비교',
    title: '동종 비교와 순위 가능 여부',
    blockKeys: ['comparable_financial_facts'],
    canonicalSection: 'peer 비교와 rankable/not-rankable 상태',
  },
  {
    id: 'events',
    label: '사건',
    title: '사건 타임라인',
    blockKeys: ['recent_events_surprise'],
    canonicalSection: 'event timeline',
  },
  {
    id: 'themes',
    label: '테마·국면',
    title: '테마·내러티브·국면',
    blockKeys: ['business_sector_context'],
    canonicalSection: 'theme/narrative/regime',
  },
  {
    id: 'exposure',
    label: '노출 경로',
    title: '노출과 영향 경로',
    blockKeys: ['exposure_impact'],
    canonicalSection: 'exposure/impact paths',
  },
  {
    id: 'market',
    label: '시장 반응',
    title: '시장 반응과 포지셔닝',
    blockKeys: ['market_reaction_tradability'],
    canonicalSection: 'market reaction/positioning',
  },
  {
    id: 'valuation',
    label: '밸류에이션',
    title: '밸류에이션과 시나리오',
    blockKeys: ['valuation_market_implied', 'expectation_priced_in', 'multi_horizon_thesis'],
    canonicalSection: 'valuation/scenario',
  },
  {
    id: 'sources',
    label: '출처',
    title: '출처와 자료 연결',
    blockKeys: ['coverage_freshness_uncertainty'],
    canonicalSection: 'source/resource links: 공식 홈페이지, IR, SEC/DART, docs, explorer 등',
  },
  {
    id: 'provenance',
    label: '도출 근거',
    title: '도출 과정과 릴리스 대장',
    blockKeys: ['derivation_release_manifest'],
    canonicalSection: 'provenance/derivation research drawer',
  },
];

export function isAssetTabId(value: string): value is AssetTabId {
  return (ASSET_TAB_IDS as readonly string[]).includes(value);
}

export function assetTabFor(id: AssetTabId): AssetTabDefinition {
  const tab = ASSET_TABS.find((candidate) => candidate.id === id);
  if (!tab) throw new Error('알 수 없는 종목 상세 탭입니다');
  return tab;
}
