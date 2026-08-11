import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COMMON_ASSET_VIEW_BLOCK_KEYS,
  planCommonAssetView,
  relationSignalTier,
  type AssetSourceFacts,
} from '../src/serving/common-asset-view-plan.ts';
import { loadAssetSourceFacts, type QueryClient } from '../src/serving/common-asset-view-store.ts';
import {
  censusOf,
  parseCommonAssetViewArgs,
  releaseDigestOf,
} from '../src/serving/run-common-asset-view.ts';

/** An asset with nothing behind it, so each test can add exactly the one source it is about. */
function bareFacts(overrides: Partial<AssetSourceFacts> = {}): AssetSourceFacts {
  return {
    subjectEntityId: 42,
    asOfDate: '2026-08-10',
    identity: null,
    economicClaim: null,
    taxonomy: [],
    playbook: null,
    numericFacts: [],
    recentEvents: [],
    actionAdviceExcludedEvents: 0,
    surprises: [],
    expectations: [],
    relations: [],
    impactSummaries: [],
    valuations: [],
    marketConfirmation: null,
    scenarios: [],
    forwardAssertions: [],
    coverage: [],
    derivationIds: [],
    truncation: {},
    releaseId: 'common-asset-view:2026-08-10',
    semanticSnapshotId: 'snapshot-1',
    ...overrides,
  };
}

const blockOf = (facts: AssetSourceFacts, key: string) =>
  planCommonAssetView(facts).blocks.find((block) => block.blockKey === key);

describe('common asset view packet shape', () => {
  it('always carries twelve blocks in canonical order', () => {
    const plan = planCommonAssetView(bareFacts());
    assert.equal(plan.blocks.length, 12);
    assert.deepEqual(
      plan.blocks.map((block) => block.blockKey),
      [...COMMON_ASSET_VIEW_BLOCK_KEYS],
    );
    assert.deepEqual(
      plan.blocks.map((block) => block.blockNo),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    );
  });

  it('carries every block even when an asset has no data at all', () => {
    // IA §4: depth is placement, not deletion. A packet that dropped its empty
    // blocks would make "missing" and "empty" the same word for the reader.
    const plan = planCommonAssetView(bareFacts());
    assert.equal(plan.blocks.filter((block) => block.blockState !== 'available').length, 12);
  });

  it('never reports a state without a reason', () => {
    for (const block of planCommonAssetView(bareFacts()).blocks) {
      assert.ok(block.stateReason.trim().length > 0, `${block.blockKey} has no state reason`);
    }
  });

  it('keys the packet by subject and date so a rebuild replaces rather than duplicates', () => {
    assert.equal(planCommonAssetView(bareFacts()).viewKey, '42@2026-08-10');
  });
});

describe('the four empty blocks are empty for different reasons', () => {
  // The whole point of the state vocabulary. If these ever collapse to one value,
  // K7 inherits "four blocks are empty" instead of four separate pieces of work.
  it('calls a producer that emitted nothing not_produced', () => {
    assert.equal(blockOf(bareFacts(), 'valuation_market_implied')?.blockState, 'not_produced');
  });

  it('calls a block with no contract-eligible source no_eligible_source', () => {
    const block = blockOf(bareFacts(), 'multi_horizon_thesis');
    assert.equal(block?.blockState, 'no_eligible_source');
    // Naming REQ-REC-001 in the reason is what stops someone "fixing" this by
    // joining personalization.thesis_revision, which is the one table that has data.
    assert.match(block?.stateReason ?? '', /REQ-REC-001/);
  });

  it('calls a source whose rows all failed verification unverified_only', () => {
    const block = blockOf(
      bareFacts({
        forwardAssertions: [
          {
            assertionKey: 'a1',
            predicateKey: 'GUIDES',
            modality: 'forecast',
            verificationState: 'extracted',
          },
        ],
      }),
      'catalysts_risks_counter_evidence',
    );
    assert.equal(block?.blockState, 'unverified_only');
  });

  it('promotes that same block to available once anything is verified', () => {
    const block = blockOf(
      bareFacts({
        forwardAssertions: [
          {
            assertionKey: 'a1',
            predicateKey: 'GUIDES',
            modality: 'forecast',
            verificationState: 'verified',
          },
        ],
      }),
      'catalysts_risks_counter_evidence',
    );
    assert.equal(block?.blockState, 'available');
  });

  it('never marks a block available while it holds no evidence', () => {
    // Mirrors the CHECK in migration 099. A row the database would reject must not
    // be plannable, or the failure surfaces as a crash at 05:20 instead of a test.
    for (const block of planCommonAssetView(bareFacts()).blocks) {
      if (block.blockState === 'available') assert.ok(block.evidenceCount > 0, block.blockKey);
      if (block.blockState === 'not_produced' || block.blockState === 'no_eligible_source') {
        assert.equal(block.evidenceCount, 0, block.blockKey);
      }
    }
  });
});

describe('the valuation block carries a band, and a band is not a target price', () => {
  const band = {
    valuationRevisionId: 12,
    methodKey: 'own_history_pbr_band',
    lowerEstimate: 0.8,
    upperEstimate: 1.4,
    estimateUnit: 'ratio',
    horizon: 'trailing_annual_history',
  };

  it('projects the numbers a reader needs, not just the row id', () => {
    // 이 블록이 `available` 인데 payload 가 id 뿐이던 것이 블록 7 의 원래 결함이다.
    // "밴드가 있다" 와 "밴드" 는 다르다.
    const block = blockOf(bareFacts({ valuations: [band] }), 'valuation_market_implied');
    assert.equal(block?.blockState, 'available');
    const payload = block?.payload as { valuations: Record<string, unknown>[] };
    assert.deepEqual(payload.valuations[0], band);
  });

  it('always ships the unit next to the two numbers', () => {
    // 단위 없는 0.8–1.4 는 통화 금액으로도 읽힌다. 그 순간 이 블록은 CLAUDE.md 가
    // 이름으로 금지한 목표주가 구간과 구별되지 않는다.
    const block = blockOf(bareFacts({ valuations: [band] }), 'valuation_market_implied');
    const payload = block?.payload as { valuations: { estimateUnit?: unknown }[] };
    for (const valuation of payload.valuations) {
      assert.equal(typeof valuation.estimateUnit, 'string');
      assert.ok(String(valuation.estimateUnit).length > 0);
    }
  });

  it('orders by method so the payload digest does not move with insert order', () => {
    const ascending = blockOf(
      bareFacts({
        valuations: [band, { ...band, valuationRevisionId: 3, methodKey: 'own_history_per_band' }],
      }),
      'valuation_market_implied',
    );
    const descending = blockOf(
      bareFacts({
        valuations: [{ ...band, valuationRevisionId: 3, methodKey: 'own_history_per_band' }, band],
      }),
      'valuation_market_implied',
    );
    assert.equal(ascending?.payloadDigest, descending?.payloadDigest);
  });
});

describe('relation signal tiers keep proximity out of the exposure slot', () => {
  it('treats disclosure-backed supply relations as economic', () => {
    assert.equal(relationSignalTier('SUPPLIES'), 'economic');
    assert.equal(relationSignalTier('CUSTOMER_OF'), 'economic');
  });

  it('treats ETF co-membership, common ownership and text similarity as weak', () => {
    // 75% of the accepted graph. REQ-PROD-030 exists because these read as
    // "related companies" to anyone who does not know how they were derived.
    assert.equal(relationSignalTier('SAME_ETF_BASKET'), 'weak');
    assert.equal(relationSignalTier('COMMON_OWNER'), 'weak');
    assert.equal(relationSignalTier('PRODUCT_SIMILARITY'), 'weak');
  });

  it('never lets news co-mention count as anything but weak', () => {
    assert.equal(relationSignalTier('NEWS_COMENTION'), 'weak');
  });

  it('calls a predicate with no policy row unpoliced rather than guessing', () => {
    // These are exactly canonical/01 §5's strong Discovery reasons. A tier of
    // 'economic' here would let the screen show a candidate as established.
    //
    // 2026-08-11 정정 — 여기 있던 "정책 행이 없으므로 승인 리비전에 절대 도달할 수
    // 없다" 는 거짓이고, 통과하는 단언의 근거로 쓰이고 있었다. 라이브 실측:
    // 술어 24종 중 정책 등재 12종, 정책 행 없는 12종 중 `ISSUED_BY` 가
    // 254 간선 · 254 subject 를 `accepted` 로 갖는다. 정책 행의 부재가 막는 것은
    // 승인이 아니라 **등급 상승**이다.
    for (const predicate of ['PEER_OF', 'SUPPLY_CHAIN', 'SAME_THEME', 'EXPOSES', 'AFFECTS']) {
      assert.equal(relationSignalTier(predicate), 'unpoliced', predicate);
    }
    // 승인된 unpoliced 술어가 실제로 존재한다는 것을 단언으로 못박는다.
    // 이것이 `acceptedUnpolicedCount` 분기가 죽은 코드가 아닌 이유다.
    assert.equal(relationSignalTier('ISSUED_BY'), 'unpoliced');
  });
});

describe('exposure block', () => {
  // 기본 상대는 자산(Stock)이다. 자산 아닌 상대를 보려면 `objectEntityType` 을 넘긴다 —
  // 라이브에서 그 자리에 실제로 오는 값은 Industry(CLASSIFIED_AS)·Metric(MEASURED_BY) 이다.
  const relation = (over: Partial<AssetSourceFacts['relations'][number]>) => ({
    predicate: 'SUPPLIES',
    relationKind: 'structural',
    revisionStatus: 'accepted',
    objectEntityId: 7,
    objectEntityType: 'Stock',
    confidence: 0.9,
    evidenceCount: 2,
    ...over,
  });

  it('reaches available on an accepted economic relation', () => {
    const block = blockOf(bareFacts({ relations: [relation({})] }), 'exposure_impact');
    assert.equal(block?.blockState, 'available');
    assert.equal(block?.payload.exposureTier, 'accepted_economic');
  });

  it('reaches available on an accepted same-industry relation too', () => {
    // SAME_INDUSTRY 는 relation-policy 에서 hierarchy → relationSignalTier 'structural'.
    // 옛 판정은 'economic' 만 물어서 승인된 동종 간선을 가진 종목을 available 에서
    // 막았다. canonical/01 §5 는 competitor/peer 를 Discovery 이유의 첫 항목으로 둔다.
    const block = blockOf(
      bareFacts({ relations: [relation({ predicate: 'SAME_INDUSTRY' })] }),
      'exposure_impact',
    );
    assert.equal(block?.blockState, 'available');
    assert.equal(block?.payload.exposureTier, 'accepted_structural');
    assert.equal(block?.payload.acceptedStructuralCount, 1);
    // 099 의 CHECK (block_state <> 'available' OR evidence_count > 0) 은 새 경로에서도 성립해야 한다.
    assert.ok((block?.evidenceCount ?? 0) > 0);
  });

  it('refuses to call a taxonomy-only subject available', () => {
    // CLASSIFIED_AS 도 hierarchy 라 signalTier 는 'structural' 이지만 그 객체는 자산이
    // 아니라 Industry 분류 노드다. 2026-08-11 라이브에서 블록6 available 193 subject 중
    // **119 가 이 상태**였다 — 노출 근거가 하나도 없는데 available 로 영속화돼 있었다.
    // 정본 01 §5 의 이유 7종 어디에도 "산업 분류 노드에 속한다" 는 없다.
    const block = blockOf(
      bareFacts({
        relations: [relation({ predicate: 'CLASSIFIED_AS', objectEntityType: 'Industry' })],
      }),
      'exposure_impact',
    );
    assert.equal(block?.payload.exposureTier, 'accepted_non_asset_only');
    assert.equal(block?.blockState, 'partial');
    assert.equal(block?.payload.acceptedStructuralCount, 0);
    assert.equal(block?.payload.acceptedStructuralNonAssetCount, 1);
    // 간선은 목록에서 빠지지 않는다. 바뀌는 것은 승격 여부뿐이다(099 원칙).
    assert.ok(block);
    assert.equal((block.payload.relations as unknown[]).length, 1);
  });

  it('separates a real peer from a taxonomy link inside the same signal tier', () => {
    // 같은 subject 가 둘 다 가진 경우. 자산을 지목하는 쪽만 승격을 지탱하고,
    // 분류 링크는 세어져서 사유 문자열에 단서로 남는다 — 부기에 구멍을 내지 않는다.
    const block = blockOf(
      bareFacts({
        relations: [
          relation({ predicate: 'SAME_INDUSTRY' }),
          relation({
            predicate: 'CLASSIFIED_AS',
            objectEntityId: 11,
            objectEntityType: 'Industry',
          }),
        ],
      }),
      'exposure_impact',
    );
    assert.equal(block?.payload.exposureTier, 'accepted_structural');
    assert.equal(block?.blockState, 'available');
    assert.equal(block?.payload.acceptedStructuralCount, 1);
    assert.equal(block?.payload.acceptedStructuralNonAssetCount, 1);
    assert.match(block?.stateReason ?? '', /non-asset nodes/);
  });

  it('treats an unknown object entity type as not-an-asset (fail-closed)', () => {
    // 쿼리가 LEFT JOIN 이라 상대를 못 찾으면 행은 남고 유형만 null 로 온다.
    // 모르는 것을 자산으로 봐주면 이번에 고친 것과 같은 종류의 거짓이 다시 생긴다.
    const block = blockOf(
      bareFacts({
        relations: [relation({ predicate: 'SAME_INDUSTRY', objectEntityType: null })],
      }),
      'exposure_impact',
    );
    assert.equal(block?.payload.exposureTier, 'accepted_non_asset_only');
    assert.equal(block?.payload.acceptedStructuralCount, 0);
  });

  it('keeps the accepted counts adding up to the accepted set', () => {
    // 좁히기가 만들 수 있었던 부기 구멍을 못박는다:
    // accepted = economic + structural(asset) + structural(non-asset) + weak + unpoliced.
    const block = blockOf(
      bareFacts({
        relations: [
          relation({ predicate: 'SUPPLIES' }),
          relation({ predicate: 'SAME_INDUSTRY', objectEntityId: 8 }),
          relation({ predicate: 'CLASSIFIED_AS', objectEntityId: 9, objectEntityType: 'Industry' }),
          relation({ predicate: 'SAME_ETF_BASKET', objectEntityId: 10 }),
          relation({ predicate: 'ISSUED_BY', objectEntityId: 11, objectEntityType: 'Company' }),
          relation({
            predicate: 'PEER_OF',
            objectEntityId: 12,
            revisionStatus: 'quarantined_unverified',
          }),
        ],
      }),
      'exposure_impact',
    );
    assert.ok(block);
    const p = block.payload as Record<string, number>;
    const accepted = (block.payload.relations as { revisionStatus: string }[]).filter(
      (r) => r.revisionStatus === 'accepted',
    ).length;
    assert.equal(accepted, 5);
    assert.equal(
      p.acceptedEconomicCount +
        p.acceptedStructuralCount +
        p.acceptedStructuralNonAssetCount +
        p.acceptedWeakCount +
        p.acceptedUnpolicedCount,
      accepted,
    );
    assert.equal(p.quarantinedCount, 1);
  });

  it('does not demote an accepted relation because a quarantined one sits beside it', () => {
    // 이번 변경의 동기. 옛 판정은 목록 전체에 `.some(status !== 'accepted')` 를 걸어서
    // 격리 후보 1건만 있어도 승인 간선을 가진 종목을 unverified_only 로 내렸다.
    const block = blockOf(
      bareFacts({
        relations: [
          relation({ predicate: 'SAME_INDUSTRY' }),
          relation({
            predicate: 'PEER_OF',
            objectEntityId: 9,
            revisionStatus: 'quarantined_unverified',
          }),
        ],
      }),
      'exposure_impact',
    );
    assert.equal(block?.blockState, 'available');
    assert.equal(block?.payload.exposureTier, 'accepted_structural');
    assert.equal(block?.payload.quarantinedCount, 1);
  });

  it('refuses to call a quarantined candidate an exposure', () => {
    const block = blockOf(
      bareFacts({
        relations: [relation({ predicate: 'PEER_OF', revisionStatus: 'quarantined_unverified' })],
      }),
      'exposure_impact',
    );
    assert.equal(block?.blockState, 'unverified_only');
    assert.equal(block?.payload.exposureTier, 'unverified_only');
    assert.equal(block?.payload.quarantinedCount, 1);
  });

  it('refuses to call ETF co-membership an exposure', () => {
    const block = blockOf(
      bareFacts({ relations: [relation({ predicate: 'SAME_ETF_BASKET' })] }),
      'exposure_impact',
    );
    assert.equal(block?.blockState, 'partial');
    assert.equal(block?.payload.exposureTier, 'accepted_weak_only');
    assert.equal(block?.payload.acceptedWeakCount, 1);
  });

  it('does not claim nothing was accepted while an unpoliced predicate is accepted', () => {
    // ISSUED_BY 는 정책 행이 없어 tier 'unpoliced' 인데 라이브 297개 view 중 254개가
    // 이 술어의 승인 간선을 갖는다. "승인된 리비전이 없다" 는 그들에게 거짓이다.
    const block = blockOf(
      bareFacts({
        relations: [
          relation({ predicate: 'ISSUED_BY' }),
          relation({
            predicate: 'SAME_THEME',
            objectEntityId: 9,
            revisionStatus: 'quarantined_unverified',
          }),
        ],
      }),
      'exposure_impact',
    );
    assert.equal(block?.blockState, 'unverified_only');
    assert.equal(block?.payload.acceptedUnpolicedCount, 1);
    assert.match(block?.stateReason ?? '', /no policy row/);
  });

  it('calls an accepted-but-unpoliced-only subject unpoliced rather than unverified', () => {
    const block = blockOf(
      bareFacts({ relations: [relation({ predicate: 'ISSUED_BY' })] }),
      'exposure_impact',
    );
    assert.equal(block?.payload.exposureTier, 'unpoliced_only');
    assert.equal(block?.blockState, 'partial');
    assert.equal(block?.payload.quarantinedCount, 0);
  });

  it('labels impact summaries with no relation row rather than blaming weak associations', () => {
    const block = blockOf(
      bareFacts({ impactSummaries: [{ impactKey: 'KR:005930', horizon: null, sign: null }] }),
      'exposure_impact',
    );
    assert.equal(block?.payload.exposureTier, 'no_relation_row');
    assert.equal(block?.blockState, 'partial');
    assert.doesNotMatch(block?.stateReason ?? '', /weak association/);
  });

  it('carries quarantined relations rather than dropping them', () => {
    // The packet labels; the consumer filters. Dropping here would leave a reader
    // unable to tell "no relation" from "no accepted relation" — opposite facts.
    const block = blockOf(
      bareFacts({
        relations: [relation({ predicate: 'PEER_OF', revisionStatus: 'quarantined_unverified' })],
      }),
      'exposure_impact',
    );
    const relations = block?.payload.relations as { revisionStatus: string }[];
    assert.equal(relations.length, 1);
    assert.equal(relations[0]?.revisionStatus, 'quarantined_unverified');
  });
});

describe('comparable facts keep REQ-PROD-021 vocabulary for KPI comparability', () => {
  const metric = (over: Partial<AssetSourceFacts['numericFacts'][number]>) => ({
    metricKey: 'ifrs:Revenue',
    comparabilityGroupKey: 'group-a',
    unit: 'KRW',
    peerCount: 9,
    observationCount: 4,
    ...over,
  });

  it('labels a metric with no comparability group NOT_COMPARABLE', () => {
    const block = blockOf(
      bareFacts({ numericFacts: [metric({ comparabilityGroupKey: null })] }),
      'comparable_financial_facts',
    );
    const metrics = block?.payload.metrics as { comparability: string }[];
    assert.equal(metrics[0]?.comparability, 'NOT_COMPARABLE');
  });

  it('labels a thin peer group INSUFFICIENT_COVERAGE rather than ranking it', () => {
    const block = blockOf(
      bareFacts({ numericFacts: [metric({ peerCount: 1 })] }),
      'comparable_financial_facts',
    );
    const metrics = block?.payload.metrics as { comparability: string }[];
    assert.equal(metrics[0]?.comparability, 'INSUFFICIENT_COVERAGE');
    // The block is still `partial`, not `INSUFFICIENT_COVERAGE`: block state and KPI
    // comparability answer different questions and must not share a word.
    assert.equal(block?.blockState, 'partial');
  });

  it('keeps un-rankable metrics in the payload instead of omitting them', () => {
    const block = blockOf(
      bareFacts({ numericFacts: [metric({}), metric({ metricKey: 'x', peerCount: 0 })] }),
      'comparable_financial_facts',
    );
    assert.ok(block);
    assert.equal((block.payload.metrics as unknown[]).length, 2);
    assert.equal(block.payload.comparableCount, 1);
  });
});

describe('capped lists say they were capped', () => {
  it('puts the cap and the true total in the payload of the block it capped', () => {
    // The store comment promised this and the code did not do it. A cap that reports
    // nothing reads as completeness: 40 metrics looks like all of them.
    const block = blockOf(
      bareFacts({
        numericFacts: [
          {
            metricKey: 'ifrs:Revenue',
            comparabilityGroupKey: 'g',
            unit: 'KRW',
            peerCount: 9,
            observationCount: 1,
          },
        ],
        truncation: { numericFacts: { kept: 40, total: 213 } },
      }),
      'comparable_financial_facts',
    );
    assert.deepEqual(block?.payload.truncated, { field: 'numericFacts', kept: 40, total: 213 });
  });

  it('says nothing when nothing was capped', () => {
    const block = blockOf(
      bareFacts({
        numericFacts: [
          {
            metricKey: 'ifrs:Revenue',
            comparabilityGroupKey: 'g',
            unit: 'KRW',
            peerCount: 9,
            observationCount: 1,
          },
        ],
      }),
      'comparable_financial_facts',
    );
    assert.equal(block?.payload.truncated, undefined);
  });

  it('moves the digest, because a capped packet is not the same packet', () => {
    // A non-empty list, because an empty one cannot be capped: the store records a
    // truncation only when it actually dropped rows, so `relations: []` carrying a
    // cap note is a state the loader can never produce.
    const relations = [
      {
        predicate: 'SUPPLIES',
        relationKind: 'structural',
        revisionStatus: 'accepted',
        objectEntityId: 7,
        confidence: 0.9,
        evidenceCount: 2,
      },
    ];
    const uncapped = bareFacts({ relations });
    const capped = bareFacts({
      relations,
      truncation: { relations: { kept: 60, total: 900 } },
    });
    assert.notEqual(
      planCommonAssetView(uncapped).packetDigest,
      planCommonAssetView(capped).packetDigest,
    );
  });
});

describe('the product boundary is enforced in the builder, not in the reader', () => {
  const advice = { eventKey: 'e1', knownAt: '2026-08-10T00:00:00.000Z', title: null };

  it('names the exclusion in the payload instead of silently shrinking the list', () => {
    // 조용히 뺀 사건은 "없었다" 로 읽힌다. `truncated` 와 같은 규칙으로 이유를 남긴다.
    const block = blockOf(
      bareFacts({ recentEvents: [advice], actionAdviceExcludedEvents: 3 }),
      'recent_events_surprise',
    );
    assert.equal(block?.payload.actionAdviceExcludedEvents, 3);
  });

  it('says nothing when nothing was excluded', () => {
    // 297개 패킷 전부에 `: 0` 을 실으면 이유 없이 블록4 digest 가 전부 움직인다.
    const block = blockOf(bareFacts({ recentEvents: [advice] }), 'recent_events_surprise');
    assert.equal(block?.payload.actionAdviceExcludedEvents, undefined);
  });

  it('does not claim the subject has no event when every event was excluded', () => {
    // `not_produced` 의 사유는 "knowledge.event has no event" 이고, 사건이
    // 있었는데 전부 걸린 경우에 그것은 거짓말이다.
    const block = blockOf(
      bareFacts({ recentEvents: [], actionAdviceExcludedEvents: 2 }),
      'recent_events_surprise',
    );
    assert.equal(block?.blockState, 'no_eligible_source');
    assert.match(block?.stateReason ?? '', /all 2 events/);
    assert.equal(block?.payload.actionAdviceExcludedEvents, 2);
  });

  it('still reports a subject with no events at all as not_produced', () => {
    const block = blockOf(bareFacts(), 'recent_events_surprise');
    assert.equal(block?.blockState, 'not_produced');
    assert.match(block?.stateReason ?? '', /has no event/);
  });

  it('moves the digest, because an excluded packet is not the same packet', () => {
    assert.notEqual(
      planCommonAssetView(bareFacts({ recentEvents: [advice] })).packetDigest,
      planCommonAssetView(bareFacts({ recentEvents: [advice], actionAdviceExcludedEvents: 1 }))
        .packetDigest,
    );
  });
});

describe('the store drops advice headlines before it caps the list', () => {
  /** 로더가 부르는 15개 쿼리 중 정체성과 사건만 채우고 나머지는 빈 결과로 둔다. */
  function clientWith(events: { event_key: string; summary_text: string }[]): QueryClient {
    return {
      query: async (text: string) => {
        if (text.includes('core.security_master master')) {
          return {
            rows: [
              {
                entity_id: '1',
                security_key: 'KR:000000',
                primary_ticker: '000000',
                canonical_name: '테스트',
              },
            ],
          };
        }
        if (text.includes('FROM knowledge.event event')) {
          return {
            rows: events.map((event, index) => ({
              entity_id: '1',
              event_key: event.event_key,
              summary_text: event.summary_text,
              known_at: `2026-08-01T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
            })),
          };
        }
        return { rows: [] };
      },
    } as unknown as QueryClient;
  }

  const load = (events: { event_key: string; summary_text: string }[]) =>
    loadAssetSourceFacts(clientWith(events), {
      entityIds: [1],
      asOfDate: '2026-08-11',
      releaseId: 'test',
      semanticSnapshotId: 'test',
    });

  it('keeps reported market activity and drops the recommendation headline', async () => {
    // 두 제목 모두 라이브 `knowledge.event` 의 실제 꼴이다.
    const facts = (
      await load([
        { event_key: 'a', summary_text: '서울보증보험 iM증권 목표가 56000 Buy' },
        { event_key: 'b', summary_text: '삼성전기 임원 순매수 14,851,645주' },
      ])
    ).get(1);
    assert.deepEqual(
      facts?.recentEvents.map((event) => event.eventKey),
      ['b'],
    );
    assert.equal(facts?.actionAdviceExcludedEvents, 1);
  });

  it('counts the true total of eligible events, not of all events', async () => {
    // 자른 뒤에 거르면 `truncation.recentEvents.total` 이 서빙되지 않는 사건까지
    // 세고, 그러면 "확인된 사건 N건 중 최근 M건" 이 없는 총계를 말한다.
    const advice = Array.from({ length: 30 }, (_, index) => ({
      event_key: `advice-${index}`,
      summary_text: `종목 증권사 목표가 ${index}000 Buy`,
    }));
    const plain = Array.from({ length: 25 }, (_, index) => ({
      event_key: `plain-${index}`,
      summary_text: `분기 실적 발표 ${index}`,
    }));
    const facts = (await load([...advice, ...plain])).get(1);
    assert.equal(facts?.recentEvents.length, 20);
    assert.equal(facts?.actionAdviceExcludedEvents, 30);
    assert.deepEqual(facts?.truncation.recentEvents, { kept: 20, total: 25 });
  });
});

describe('packet digest', () => {
  it('is stable for the same inputs', () => {
    assert.equal(
      planCommonAssetView(bareFacts()).packetDigest,
      planCommonAssetView(bareFacts()).packetDigest,
    );
  });

  it('does not depend on the order sources came back in', () => {
    const a = bareFacts({
      taxonomy: [
        { nodeKey: 'b', label: 'B', taxonomyReleaseId: 'r1' },
        { nodeKey: 'a', label: 'A', taxonomyReleaseId: 'r1' },
      ],
    });
    const b = bareFacts({
      taxonomy: [
        { nodeKey: 'a', label: 'A', taxonomyReleaseId: 'r1' },
        { nodeKey: 'b', label: 'B', taxonomyReleaseId: 'r1' },
      ],
    });
    assert.equal(planCommonAssetView(a).packetDigest, planCommonAssetView(b).packetDigest);
  });

  it('does not move when only the release changes', () => {
    // Caught on live data: three consecutive builds of unchanged sources produced
    // three different digests for all 297 assets, because block 12 carried the
    // release id and the release id is new every run. A digest that always moves
    // cannot answer "did anything actually change", which is the only thing it is
    // for. The release lives on the row, not in the packet.
    const first = bareFacts({ releaseId: 'common-asset-view:2026-08-10:1' });
    const second = bareFacts({ releaseId: 'common-asset-view:2026-08-10:2' });
    assert.equal(planCommonAssetView(first).packetDigest, planCommonAssetView(second).packetDigest);
  });

  it('still moves when the snapshot the packet was read under changes', () => {
    // The snapshot is not the release. Two packets read under different semantic
    // snapshots describe different worlds and must not compare equal.
    const a = bareFacts({ semanticSnapshotId: 'snapshot-1' });
    const b = bareFacts({ semanticSnapshotId: 'snapshot-2' });
    assert.notEqual(planCommonAssetView(a).packetDigest, planCommonAssetView(b).packetDigest);
  });

  it('moves when a block state changes even if its payload did not', () => {
    const extracted = bareFacts({
      forwardAssertions: [
        {
          assertionKey: 'a',
          predicateKey: 'GUIDES',
          modality: 'forecast',
          verificationState: 'extracted',
        },
      ],
    });
    const verified = bareFacts({
      forwardAssertions: [
        {
          assertionKey: 'a',
          predicateKey: 'GUIDES',
          modality: 'forecast',
          verificationState: 'verified',
        },
      ],
    });
    assert.notEqual(
      planCommonAssetView(extracted).packetDigest,
      planCommonAssetView(verified).packetDigest,
    );
  });
});

describe('REQ-REC-001 anti-shortcut', () => {
  it('has no field through which private portfolio data could enter', () => {
    // canonical/10 §2: changing a private portfolio must not change the common
    // asset view. The structural half of that gate is that AssetSourceFacts has no
    // holding, lot, position or user field at all — there is nothing to vary.
    const keys = Object.keys(bareFacts());
    for (const forbidden of ['portfolio', 'holding', 'lot', 'position', 'user', 'thesis']) {
      assert.ok(
        !keys.some((key) => key.toLowerCase().includes(forbidden)),
        `AssetSourceFacts must not carry a ${forbidden} field`,
      );
    }
  });

  it('produces the same digest for two callers whose portfolios differ', () => {
    // The behavioural half. Two builds of the same asset from the same public
    // sources must agree byte for byte no matter who is asking, because nothing
    // about the asker reaches this function.
    const facts = bareFacts({
      identity: { entityKey: 'KR:005930', displayName: 'X', tickers: ['005930'] },
    });
    assert.equal(
      planCommonAssetView(facts).packetDigest,
      planCommonAssetView({ ...facts }).packetDigest,
    );
  });
});

describe('release identity', () => {
  it('produces a release id the manifest CHECK accepts', () => {
    // A rerun mints a new revision that supersedes the last, which is what the
    // append-only manifest is for. Reusing one id per day collides on the primary
    // key and takes the pipeline stage down on the second run of any day.
    assert.match('common-asset-view:2026-08-10:2', /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  });

  it('digests the release over its packets, not over their order', () => {
    const one = planCommonAssetView(bareFacts({ subjectEntityId: 1 }));
    const two = planCommonAssetView(bareFacts({ subjectEntityId: 2 }));
    assert.equal(releaseDigestOf([one, two]), releaseDigestOf([two, one]));
  });

  it('moves the release digest when any packet in it moves', () => {
    const one = planCommonAssetView(bareFacts({ subjectEntityId: 1 }));
    const changed = planCommonAssetView(
      bareFacts({
        subjectEntityId: 1,
        valuations: [
          {
            valuationRevisionId: 5,
            methodKey: 'own_history_pbr_band',
            lowerEstimate: 0.8,
            upperEstimate: 1.4,
            estimateUnit: 'ratio',
            horizon: 'trailing_annual_history',
          },
        ],
      }),
    );
    assert.notEqual(releaseDigestOf([one]), releaseDigestOf([changed]));
  });
});

describe('census', () => {
  it('counts every block of every asset exactly once', () => {
    const census = censusOf([planCommonAssetView(bareFacts()), planCommonAssetView(bareFacts())]);
    assert.equal(Object.keys(census).length, 12);
    for (const [key, states] of Object.entries(census)) {
      const total = Object.values(states).reduce((sum, count) => sum + count, 0);
      assert.equal(total, 2, key);
    }
  });
});

describe('arguments', () => {
  it('defaults to a dry run on today', () => {
    const args = parseCommonAssetViewArgs([], '2026-08-10');
    assert.equal(args.mode, 'dry-run');
    assert.equal(args.asOfDate, '2026-08-10');
  });

  it('rejects an as-of that is not a real calendar date', () => {
    assert.throws(
      () => parseCommonAssetViewArgs(['--as-of', '2026-02-30'], '2026-08-10'),
      /YYYY-MM-DD/,
    );
    assert.throws(
      () => parseCommonAssetViewArgs(['--as-of', 'yesterday'], '2026-08-10'),
      /YYYY-MM-DD/,
    );
  });

  it('rejects a nonsense limit', () => {
    assert.throws(() => parseCommonAssetViewArgs(['--limit', '0'], '2026-08-10'), /positive/);
  });

  it('refuses an unknown flag rather than ignoring it', () => {
    assert.throws(() => parseCommonAssetViewArgs(['--applyy'], '2026-08-10'), /unknown argument/);
  });
});
