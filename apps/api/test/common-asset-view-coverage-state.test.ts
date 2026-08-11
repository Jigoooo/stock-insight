import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COMMON_ASSET_VIEW_BLOCK_KEYS,
  deriveCoverageState,
  type CommonAssetViewBlockKey,
  type CommonAssetViewBlockState,
} from '../src/serving/common-asset-view-plan.ts';

import {
  commonAssetViewBlockKeys,
  commonAssetViewCoverageStates,
} from '@stock-insight/contracts/common-asset-view';

/**
 * 열두 블록을 전부 `not_produced` 로 깔고, 인자로 준 것만 상태를 바꾼다. 게이트에
 * 들어가지 않는 블록이 결과를 흔들지 않는다는 것까지 같이 재기 위해서다.
 */
function blocks(
  overrides: Partial<Record<CommonAssetViewBlockKey, CommonAssetViewBlockState>> = {},
): { blockKey: CommonAssetViewBlockKey; blockState: CommonAssetViewBlockState }[] {
  return COMMON_ASSET_VIEW_BLOCK_KEYS.map((blockKey) => ({
    blockKey,
    blockState: overrides[blockKey] ?? 'not_produced',
  }));
}

const covered = {
  identity_economic_claim: 'available',
  comparable_financial_facts: 'available',
  market_reaction_tradability: 'available',
  coverage_freshness_uncertainty: 'available',
} as const;

describe('common asset view coverage state', () => {
  // 블록 어휘의 출처가 둘로 갈라지는 순간 계약과 빌더는 각자 초록인 채로 서로 다른
  // 목록을 들게 된다. 재수출이 실제로 같은 배열인지 여기서 못 박는다.
  it('keeps the builder and the contract on one block vocabulary', () => {
    assert.deepEqual([...COMMON_ASSET_VIEW_BLOCK_KEYS], [...commonAssetViewBlockKeys]);
  });

  it('floors to INSUFFICIENT_DATA when identity is not available', () => {
    assert.equal(deriveCoverageState(blocks()), 'INSUFFICIENT_DATA');
    // 나머지가 전부 서 있어도 정체성이 없으면 누구에 대한 사실인지 말할 수 없다.
    assert.equal(
      deriveCoverageState(blocks({ ...covered, identity_economic_claim: 'partial' })),
      'INSUFFICIENT_DATA',
    );
  });

  // PIT 품질을 증언할 관측이 아예 없는 경우. 실측 2026-08-11 기준 115종목이 여기
  // 해당하므로, 이 분기가 조용히 사라지면 115종목이 실제보다 높은 등급을 받는다.
  it('caps at INFORMATION_ONLY when no coverage observation exists', () => {
    assert.equal(
      deriveCoverageState(blocks({ ...covered, coverage_freshness_uncertainty: 'not_produced' })),
      'INFORMATION_ONLY',
    );
  });

  it('separates one missing core gate from both', () => {
    assert.equal(
      deriveCoverageState(blocks({ ...covered, comparable_financial_facts: 'partial' })),
      'PARTIAL_COVERAGE',
    );
    assert.equal(
      deriveCoverageState(
        blocks({
          identity_economic_claim: 'available',
          coverage_freshness_uncertainty: 'available',
        }),
      ),
      'INFORMATION_ONLY',
    );
  });

  // 반증 탐색이 `unverified_only` 인 채로 조사 대상이라 부르면, 검증되지 않은 주장
  // 위에 조사를 세우는 것이다. 삼성전자(KR:005930)가 정확히 이 모양이다 — 실측상
  // 블록 1·2·3·4·5·8 available, 블록 10 unverified_only, 블록 11 partial.
  it('holds an asset with unverified counter-evidence at WATCH', () => {
    assert.equal(
      deriveCoverageState(
        blocks({
          ...covered,
          coverage_freshness_uncertainty: 'partial',
          business_sector_context: 'available',
          recent_events_surprise: 'available',
          expectation_priced_in: 'available',
          catalysts_risks_counter_evidence: 'unverified_only',
        }),
      ),
      'WATCH',
    );
  });

  it('reaches RESEARCH_CANDIDATE only when all six gates hold', () => {
    assert.equal(
      deriveCoverageState(
        blocks({
          ...covered,
          recent_events_surprise: 'available',
          catalysts_risks_counter_evidence: 'available',
        }),
      ),
      'RESEARCH_CANDIDATE',
    );
  });

  // `coverageState` 는 계약 required 8개에 들어 있어 `null` 이 될 수 없다. 전역이
  // 아니면 어떤 조합에서 undefined 가 새어 나가고, 그것은 파싱 실패로만 발견된다.
  it('is total across every single-block perturbation', () => {
    const states: CommonAssetViewBlockState[] = [
      'available',
      'partial',
      'unverified_only',
      'not_produced',
      'no_eligible_source',
    ];
    for (const blockKey of COMMON_ASSET_VIEW_BLOCK_KEYS) {
      for (const blockState of states) {
        const result = deriveCoverageState(blocks({ ...covered, [blockKey]: blockState }));
        assert.ok(
          (commonAssetViewCoverageStates as readonly string[]).includes(result),
          `${blockKey}=${blockState} produced ${result}`,
        );
      }
    }
  });
});
