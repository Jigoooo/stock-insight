// K6 — the pure half of the common asset view builder.
//
// Given everything the store could find about one asset, decide what each of
// canonical/06 §2's twelve blocks says and what state it is in. No I/O, no clock:
// the packet digest has to be reproducible from the same inputs, or REQ-REL-001's
// "compatible release" check compares two numbers that were never comparable.
//
// The states are defined in migration 099. The short version, because it is the
// thing most easily got wrong here:
//
//   not_produced       a producer exists and emitted nothing → repair the producer
//   no_eligible_source no source this contract may read     → build a new producer
//   unverified_only    a source exists, nothing passed verification → build the
//                      verification path
//
// These are not synonyms for "empty". Four blocks are empty today for three
// different reasons with three different owners, and flattening them would hide
// that from whoever picks up K7.

import { findRelationBuilderPolicy } from '../relations/relation-policy.ts';
import { canonicalDigest } from '../shared/canonical-json.ts';

import {
  commonAssetViewBlockKeys,
  type CommonAssetViewBlockKey,
  type CommonAssetViewBlockState,
  type CommonAssetViewCoverageState,
} from '@stock-insight/contracts/common-asset-view';

/**
 * 블록 어휘의 단일 출처는 계약이다. 여기에 12개 문자열을 한 벌 더 적어 두면 계약과
 * 빌더가 서로 다른 목록을 들고도 각자 초록이 되는 날이 오고, 그때 깨지는 것은
 * 타입이 아니라 파싱이다. 재수출은 기존 호출자(store · runner · test)의 import
 * 경로를 그대로 두기 위한 것이다.
 */
export const COMMON_ASSET_VIEW_BLOCK_KEYS = commonAssetViewBlockKeys;

export type { CommonAssetViewBlockKey, CommonAssetViewBlockState };

export type CommonAssetViewBlock = {
  blockNo: number;
  blockKey: CommonAssetViewBlockKey;
  blockState: CommonAssetViewBlockState;
  stateReason: string;
  payload: Record<string, unknown>;
  payloadDigest: string;
  evidenceCount: number;
};

export type CommonAssetViewPlan = {
  viewKey: string;
  subjectEntityId: number;
  asOfDate: string;
  blocks: CommonAssetViewBlock[];
  packetDigest: string;
};

/**
 * A relation as the graph actually stores it. `revisionStatus` and `predicate` are
 * both load-bearing: the strong economic predicates all sit at
 * `quarantined_unverified` with no policy row, so a projection that dropped either
 * column would render a quarantined candidate as an established fact.
 */
export type RelationFact = {
  predicate: string;
  relationKind: string;
  revisionStatus: string;
  objectEntityId: number;
  /**
   * 상대 노드의 `core.entity.entity_type`. 관계가 **자산을 가리키는지** 판정하는
   * 유일한 근거다(아래 `isTradableAssetEntityType`).
   *
   * `null` 은 조인이 상대를 못 찾은 경우다 — 쿼리가 LEFT JOIN 이라 행은 사라지지
   * 않고 유형만 비어 온다. 비면 자산이 아닌 것으로 본다(fail-closed).
   */
  objectEntityType: string | null;
  confidence: number | null;
  evidenceCount: number;
};

/**
 * 거래 가능한 자산의 `core.entity.entity_type`.
 *
 * 2026-08-11 라이브 실측 분포(`core.entity`): Company 356 · Stock 356 · Metric 334 ·
 * LegalEntity 169 · Theme 138 · Industry 112 · Token 24 · ETF 18 · Exchange 3.
 * `Security` 라는 유형은 **존재하지 않는다** — 추측으로 넣지 않았다.
 *
 * Company·LegalEntity 를 넣지 않은 이유: 그것은 발행 주체이지 거래되는 자산이 아니다.
 * Industry·Theme·Metric 은 분류·지표 노드라 애초에 종목이 아니다.
 *
 * Token·ETF 는 오늘 구조 술어의 상대로 **나타나지 않는다**. 실측상 구조
 * (identity·hierarchy) 술어의 상대 유형은 Industry(CLASSIFIED_AS) · Metric(MEASURED_BY) ·
 * Stock(SAME_INDUSTRY) 셋뿐이므로 이 상수를 `{Stock}` 으로 두든 셋으로 두든 오늘
 * 출력은 동일하다. 그래도 셋을 적는 이유는 켜질 자리가 눈에 보이기 때문이다 —
 * `PEER_OF` 가 Token 을 상대로 104 간선 · 13 subject 를 갖고 있고(전부 격리, 정책 행
 * 없음), 정책 행을 얻는 순간 그것은 진짜 peer 다. 그때 이 목록에 Token 이 없으면
 * 진짜 peer 를 자산 아님으로 떨어뜨리는 반대 방향의 거짓이 된다.
 */
export const TRADABLE_ASSET_ENTITY_TYPES = ['Stock', 'Token', 'ETF'] as const;

/**
 * "상대가 거래 가능한 자산인가" — 술어 이름이 아니라 **구조적 성질**로 묻는다.
 *
 * 술어 allowlist 를 여기 두면 tier 를 정책 표에서 유도하기로 한 결정과 부딪히지만,
 * 객체 유형은 그 결정과 부딪히지 않는다. 정본 01 §5 가 관련 **종목**을 말하므로
 * "상대가 자산이어야 한다" 는 정책 표가 아니라 정본에서 직접 나온다.
 */
export function isTradableAssetEntityType(entityType: string | null): boolean {
  if (entityType === null) return false;
  return (TRADABLE_ASSET_ENTITY_TYPES as readonly string[]).includes(entityType);
}

export type NumericFactSummary = {
  metricKey: string;
  comparabilityGroupKey: string | null;
  unit: string | null;
  peerCount: number;
  observationCount: number;
};

export type AssetSourceFacts = {
  subjectEntityId: number;
  asOfDate: string;
  identity: {
    entityKey: string;
    displayName: string;
    tickers: string[];
  } | null;
  economicClaim: { claimKey: string; statement: string } | null;
  taxonomy: { nodeKey: string; label: string; taxonomyReleaseId: string }[];
  playbook: { playbookKey: string; assignedAt: string } | null;
  numericFacts: NumericFactSummary[];
  recentEvents: { eventKey: string; knownAt: string; title: string | null }[];
  surprises: { surpriseRevisionId: number; magnitude: number | null }[];
  expectations: { expectationRevisionId: number; metricKey: string }[];
  relations: RelationFact[];
  impactSummaries: { impactKey: string; horizon: string | null; sign: string | null }[];
  valuations: { valuationRevisionId: number }[];
  marketConfirmation: { asOf: string; direction: string | null; strength: number | null } | null;
  scenarios: { scenarioSetId: number }[];
  forwardAssertions: {
    assertionKey: string;
    predicateKey: string;
    modality: string;
    verificationState: string;
  }[];
  coverage: { datasetKey: string; state: string; observedAt: string }[];
  /**
   * Lists the store capped, keyed by the field it capped. Travels into the affected
   * block's payload so a reader sees "40 of 213" rather than a tidy 40 that looks
   * like everything. A silent cap reads as completeness to the next person.
   */
  truncation: Record<string, { kept: number; total: number }>;
  derivationIds: string[];
  releaseId: string;
  semanticSnapshotId: string;
};

/**
 * How much economic weight a relation may be shown with.
 *
 * `REQ-PROD-030` forbids presenting proximity as economic exposure, and the live
 * graph makes that concrete: 75% of accepted relations are ETF co-membership,
 * common ownership or text similarity. Deriving the tier from the policy table
 * rather than a list here means a new predicate cannot quietly arrive as "strong".
 */
export type RelationSignalTier = 'economic' | 'structural' | 'weak' | 'unpoliced';

export function relationSignalTier(predicate: string): RelationSignalTier {
  const policy = findRelationBuilderPolicy(predicate);
  // 정책 행이 없으면 이 파일은 등급을 짐작하지 않고 `unpoliced` 로 둔다.
  //
  // 2026-08-11 정정 — 여기 있던 "정책 행이 없으면 빌더가 승인 리비전을 만들 수
  // 없다(fail-closed)" 와 "여덟 개 술어가 이 위치에 있다" 는 **둘 다 라이브가
  // 반증한다.** 실측: `knowledge.relation_identity` 의 술어 24종 중 정책 등재는
  // 12종이고, 정책 행 없는 12종 가운데 `ISSUED_BY` 가 254 간선 · 254 subject 를
  // `accepted` 로 갖는다. 즉 정책 행이 없어도 승인은 일어난다.
  //
  // 이 문장이 중요한 이유: 아래 `planExposure` 의 `acceptedUnpolicedCount` ·
  // `unpolicedNote` 분기는 정확히 그 승인 건을 세라고 있는 것이다. 옛 주석을
  // 그대로 두면 다음 사람이 그 분기를 도달 불가능한 죽은 코드로 읽고 지운다.
  //
  // 여전히 참인 것은 등급뿐이다 — 정책 행이 없으면 노출을 지탱할 근거가 없으므로
  // 승인되었더라도 `economic`/`structural` 로 올리지 않는다.
  if (!policy) return 'unpoliced';
  if (!policy.promotionEligible) return 'weak';
  switch (policy.relationClass) {
    case 'causal':
    case 'exposure':
      return 'economic';
    case 'identity':
    case 'hierarchy':
      return 'structural';
    default:
      return 'weak';
  }
}

/** Adds the cap note to a payload, and nothing at all when the list was not capped. */
function withTruncation(
  payload: Record<string, unknown>,
  facts: AssetSourceFacts,
  field: string,
): Record<string, unknown> {
  const cap = facts.truncation[field];
  return cap ? { ...payload, truncated: { field, ...cap } } : payload;
}

function block(
  blockNo: number,
  blockKey: CommonAssetViewBlockKey,
  blockState: CommonAssetViewBlockState,
  stateReason: string,
  payload: Record<string, unknown>,
  evidenceCount: number,
): CommonAssetViewBlock {
  return {
    blockNo,
    blockKey,
    blockState,
    stateReason,
    payload,
    payloadDigest: canonicalDigest(payload),
    evidenceCount,
  };
}

function planIdentity(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { identity, economicClaim } = facts;
  if (!identity) {
    return block(
      1,
      'identity_economic_claim',
      'not_produced',
      'core.entity carries no identity row for this subject',
      {},
      0,
    );
  }
  const payload = {
    entityKey: identity.entityKey,
    displayName: identity.displayName,
    tickers: [...identity.tickers].sort(),
    economicClaim: economicClaim ?? null,
  };
  return economicClaim
    ? block(
        1,
        'identity_economic_claim',
        'available',
        'identity and economic claim both resolved',
        payload,
        2,
      )
    : block(
        1,
        'identity_economic_claim',
        'partial',
        'identity resolved, core.economic_claim has no row for this subject',
        payload,
        1,
      );
}

function planBusinessContext(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { taxonomy, playbook } = facts;
  if (taxonomy.length === 0) {
    return block(
      2,
      'business_sector_context',
      'not_produced',
      'core.entity_taxonomy_membership has no row for this subject',
      {},
      0,
    );
  }
  const payload = {
    taxonomy: [...taxonomy].sort((a, b) => a.nodeKey.localeCompare(b.nodeKey)),
    playbook: playbook ?? null,
  };
  return playbook
    ? block(
        2,
        'business_sector_context',
        'available',
        'sector taxonomy and playbook both assigned',
        payload,
        taxonomy.length + 1,
      )
    : block(
        2,
        'business_sector_context',
        'partial',
        'sector taxonomy resolved, no governance.playbook_assignment for this subject',
        payload,
        taxonomy.length,
      );
}

/**
 * Block 3 carries comparability, not just numbers. REQ-PROD-020 wants a rank per
 * dimension with its definition and coverage; REQ-PROD-021 wants the un-rankable
 * ones labelled rather than omitted. Omitting them is what makes a screen look
 * complete while being silently partial, so the label travels in the payload.
 *
 * This is the one place NOT_COMPARABLE / INSUFFICIENT_COVERAGE belong — they are
 * about a KPI's comparability, which is the question REQ-PROD-021 actually asks.
 * The block-level state above answers a different question and uses its own words.
 */
const MINIMUM_PEERS_FOR_RANK = 3;

function planComparableFacts(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { numericFacts } = facts;
  if (numericFacts.length === 0) {
    return block(
      3,
      'comparable_financial_facts',
      'not_produced',
      'world.numeric_fact has no observation for this subject',
      {},
      0,
    );
  }
  const metrics = [...numericFacts]
    .sort((a, b) => a.metricKey.localeCompare(b.metricKey))
    .map((fact) => ({
      metricKey: fact.metricKey,
      unit: fact.unit,
      comparabilityGroupKey: fact.comparabilityGroupKey,
      observationCount: fact.observationCount,
      peerCount: fact.peerCount,
      comparability: !fact.comparabilityGroupKey
        ? 'NOT_COMPARABLE'
        : fact.peerCount < MINIMUM_PEERS_FOR_RANK
          ? 'INSUFFICIENT_COVERAGE'
          : 'COMPARABLE',
    }));
  const comparable = metrics.filter((metric) => metric.comparability === 'COMPARABLE');
  const payload = withTruncation(
    { metrics, comparableCount: comparable.length, minimumPeersForRank: MINIMUM_PEERS_FOR_RANK },
    facts,
    'numericFacts',
  );
  return comparable.length > 0
    ? block(
        3,
        'comparable_financial_facts',
        'available',
        `${comparable.length} of ${metrics.length} metrics rank against peers`,
        payload,
        metrics.length,
      )
    : block(
        3,
        'comparable_financial_facts',
        'partial',
        `${metrics.length} metrics observed, none reaches ${MINIMUM_PEERS_FOR_RANK} peers in its comparability group`,
        payload,
        metrics.length,
      );
}

function planRecentEvents(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { recentEvents, surprises } = facts;
  if (recentEvents.length === 0) {
    return block(
      4,
      'recent_events_surprise',
      'not_produced',
      'knowledge.event has no event for this subject',
      {},
      0,
    );
  }
  const payload = withTruncation(
    {
      events: [...recentEvents].sort((a, b) => b.knownAt.localeCompare(a.knownAt)),
      surprises: [...surprises].sort((a, b) => a.surpriseRevisionId - b.surpriseRevisionId),
    },
    facts,
    'recentEvents',
  );
  return surprises.length > 0
    ? block(
        4,
        'recent_events_surprise',
        'available',
        'events and expectation surprise both present',
        payload,
        recentEvents.length + surprises.length,
      )
    : block(
        4,
        'recent_events_surprise',
        'partial',
        'events present, analytics.surprise_revision has no row for this subject',
        payload,
        recentEvents.length,
      );
}

function planExpectation(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { expectations } = facts;
  if (expectations.length === 0) {
    return block(
      5,
      'expectation_priced_in',
      'not_produced',
      'analytics.expectation_revision has no row for this subject; k4-market-intelligence-writer is its producer',
      {},
      0,
    );
  }
  const payload = {
    expectations: [...expectations].sort(
      (a, b) => a.expectationRevisionId - b.expectationRevisionId,
    ),
  };
  return block(
    5,
    'expectation_priced_in',
    'available',
    'expectation revisions resolved',
    payload,
    expectations.length,
  );
}

/**
 * 노출 등급 — 승인된 관계 집합이 블록 6 에 실릴 수 있는 무게.
 *
 * 마이그레이션 099 의 CHECK 가 block_state 를 5값으로 고정하므로 구분은 payload 에 산다.
 * `accepted_non_asset_only`·`unverified_only`·`unpoliced_only`·`no_relation_row` 는 넷 다
 * "노출이라 부를 것이 없다" 지만 고쳐야 할 곳이 서로 다르다 — 관계의 상대 유형,
 * 검증 경로, 정책 행, 관계 생산자.
 */
export type ExposureTier =
  | 'accepted_economic'
  | 'accepted_structural'
  | 'accepted_weak_only'
  | 'accepted_non_asset_only'
  | 'unverified_only'
  | 'unpoliced_only'
  | 'no_relation_row';

/**
 * Block 6 is where IA §4's relation contract lands. Every relation travels with the
 * four columns a reader needs to not lie about it — predicate, kind, revision
 * status, signal tier — and the block never filters quarantined rows out. Filtering
 * would leave the consumer unable to tell "no relation" from "no accepted relation",
 * which are opposite facts about the graph.
 *
 * 2026-08-11 정정 — 이 함수가 오래 들고 있던 두 개의 거짓.
 *
 * 1. 옛 사유 문자열은 "the strong predicates hold no policy row and cannot be accepted"
 *    라고 했다. 거짓이다. `SUPPLIES`·`CUSTOMER_OF` 는 relation-policy 에서
 *    `relationClass: 'exposure'`, `promotionEligible: true` 이고 각각 승인된 간선 10개를
 *    갖는다(2026-08-11 실측). 정책 행이 없는 것은 `PEER_OF`·`SUPPLY_CHAIN` 쪽이다.
 * 2. 옛 판정은 승인 여부를 보기 전에 `signalTier === 'economic'` 만 물었고, 그 다음
 *    `.some(status !== 'accepted')` 로 목록 전체를 훑었다. 그래서 (a) 승인된 동종
 *    (`SAME_INDUSTRY`, hierarchy → structural) 간선을 가진 종목이 available 에 닿지
 *    못했고, (b) 격리 후보가 단 1건만 섞여도 승인 간선을 가진 종목이 강등됐다.
 *
 * 그래서 여기서는 **먼저 승인/격리로 분할한 뒤 승인 집합만으로** 등급을 정한다.
 *
 * unpoliced 를 따로 세는 이유: 정책 행이 없는 술어도 승인될 수 있다. 라이브에서
 * `ISSUED_BY` 가 정확히 그렇고(view 297개 중 254개가 보유), 그것을 무시하면
 * "승인된 리비전이 없다" 나 "약한 연관만 승인됨" 이 그 종목들에 대해 거짓이 된다 —
 * 위에서 고친 것과 같은 종류의 거짓이다. 사유 문자열은 정책 등재된 술어로 범위를
 * 명시하고, unpoliced 승인 건수를 따로 덧붙인다.
 *
 * 2026-08-11 두 번째 정정 — `accepted_structural` 의 승격 조건을 좁혔다.
 *
 * 이 자리에는 "구분은 `payload.relations[].predicate` 에 있으니 소비자가 가른다,
 * 술어 목록을 여기 두면 tier 를 정책 표에서 유도한다는 결정과 부딪힌다" 는 주석이
 * 있었다. 부딪힌다는 우려는 타당했지만 결론이 틀렸다.
 *
 * 실측이 규모를 보여줬다. 블록 6 의 available 193 subject 중 **119 가
 * `CLASSIFIED_AS` 뿐**이었고, 그 상대는 `core.entity.entity_type = 'Industry'` —
 * 자산이 아니라 산업 분류 노드다. 정본 01 §5 의 이유 7종(competitor/peer ·
 * supplier/customer · substitute/complement · same theme · common factor ·
 * event beneficiary · ETF/ownership 약신호) 어디에도 "산업 분류 노드에 속한다" 는
 * 없다. 297개의 40%가 노출 근거 없이 available 로 영속화돼 있었다.
 *
 * 왜 소비자에게 미루지 않기로 했는가. `revision_status` 를 라벨로 실어 보내고
 * 소비자가 거르게 한 IA 의 결정과 이것은 성격이 다르다 — `revision_status` 는
 * **관계마다 붙는 라벨**이고 `block_state` 는 **블록 전체에 대한 요약 주장**이다.
 * 분류 링크뿐인 종목은 노출/영향으로 보여줄 것이 없는데 "available(쓸 수 있는 내용이
 * 있다)" 이라고 말하면 상태값 자체가 거짓이다. 099 가 5상태 어휘를 따로 만든 이유가
 * 그 상태의 정직함이다. 라벨은 소비자에게 미룰 수 있어도 요약 주장은 미룰 수 없다.
 *
 * 왜 술어 이름이 아니라 객체 유형으로 갈랐는가. 술어 allowlist 를 여기 두면 tier 를
 * 정책 표에서 유도한다는 결정과 정말로 부딪힌다 — 새 술어가 목록에 없다는 이유로
 * 조용히 강등된다. `objectEntityType` 은 그 문제가 없다. "상대가 거래 가능한
 * 자산인가" 는 정책이 아니라 그래프의 구조적 성질이고, 정본 §5 가 관련 **종목**을
 * 말하므로 그 요구는 정본에서 직접 나온다. 새 술어가 자산을 가리키면 목록을 고치지
 * 않아도 자동으로 승격된다.
 *
 * `CLASSIFIED_AS` 간선은 `relations[]` 에서 **빼지 않는다.** 라벨된 채 그대로 실려
 * 나간다 — 블록 2(business/sector context)의 맥락으로는 유효하고, 099 가 격리 행을
 * 빼지 않고 표시해서 내보내기로 한 원칙과 같다. 바뀐 것은 **승격 여부뿐이다.**
 *
 * 좁히기가 만드는 새 거짓을 같이 막았다. 강등된 119 subject 는 아래 등급으로
 * 떨어지는데, 그 등급들의 옛 사유 문자열("정책 등재 술어 중 승인된 것이 없다",
 * "정책 행을 가진 승인 관계가 없다")은 `CLASSIFIED_AS` 가 정책 등재이고 승인된
 * 술어이므로 그들에 대해 **새로 거짓이 된다.** 그래서 (a) `nonAssetStructuralNote`
 * 를 붙이고 (b) 자산 아닌 구조 관계만 승인된 경우를 위한 `accepted_non_asset_only`
 * 등급을 따로 두었다. 5건 고치고 3건 만들지 않기 위한 부분이다.
 */
function planExposure(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { relations, impactSummaries } = facts;
  const described = [...relations]
    .sort((a, b) => a.predicate.localeCompare(b.predicate) || a.objectEntityId - b.objectEntityId)
    .map((relation) => ({
      predicate: relation.predicate,
      relationKind: relation.relationKind,
      revisionStatus: relation.revisionStatus,
      objectEntityId: relation.objectEntityId,
      objectEntityType: relation.objectEntityType,
      objectIsAsset: isTradableAssetEntityType(relation.objectEntityType),
      confidence: relation.confidence,
      evidenceCount: relation.evidenceCount,
      signalTier: relationSignalTier(relation.predicate),
    }));
  // 분할이 먼저다. 격리 건수는 승인 집합의 등급을 낮추지 않는다.
  const accepted = described.filter((relation) => relation.revisionStatus === 'accepted');
  const quarantinedCount = described.length - accepted.length;
  const countOf = (tier: RelationSignalTier) =>
    accepted.filter((relation) => relation.signalTier === tier).length;
  const acceptedEconomicCount = countOf('economic');
  const acceptedWeakCount = countOf('weak');
  const acceptedUnpolicedCount = countOf('unpoliced');
  // 구조 관계는 **상대가 자산인 것만** 노출을 지탱한다. 둘로 나눠서 세는 이유는
  // 부기 구멍을 남기지 않기 위해서다 — 나누지 않고 좁히기만 하면 `CLASSIFIED_AS` ·
  // `MEASURED_BY` 승인 간선이 네 카운트 어디에도 안 들어가고
  // `accepted.length = economic + structural + weak + unpoliced` 가 조용히 깨진다.
  const acceptedStructural = accepted.filter((relation) => relation.signalTier === 'structural');
  const acceptedStructuralCount = acceptedStructural.filter((r) => r.objectIsAsset).length;
  const acceptedStructuralNonAssetCount = acceptedStructural.length - acceptedStructuralCount;
  // 정책 행이 없는 승인 간선은 노출을 지탱하지 못하므로 등급을 올리지 못한다. 다만
  // 존재는 하므로 "승인된 것이 없다" 고 말하는 문자열에는 반드시 단서가 붙어야 한다.
  const unpolicedNote =
    acceptedUnpolicedCount > 0
      ? `; ${acceptedUnpolicedCount} accepted relations carry no policy row and cannot bear exposure`
      : '';
  // 같은 이유의 두 번째 단서. 좁히기 때문에 강등된 종목에 대해 아래 등급들의
  // 사유 문자열이 새로 거짓이 되는 것을 막는다.
  const nonAssetStructuralNote =
    acceptedStructuralNonAssetCount > 0
      ? `; ${acceptedStructuralNonAssetCount} accepted structural relations point at non-asset nodes (taxonomy, metric) and name no related asset`
      : '';

  const evidence = described.length + impactSummaries.length;
  if (evidence === 0) {
    return block(
      6,
      'exposure_impact',
      'not_produced',
      'no relation and no impact summary for this subject',
      {},
      0,
    );
  }

  const tier: ExposureTier =
    described.length === 0
      ? 'no_relation_row'
      : acceptedEconomicCount > 0
        ? 'accepted_economic'
        : acceptedStructuralCount > 0
          ? 'accepted_structural'
          : acceptedWeakCount > 0
            ? 'accepted_weak_only'
            : // 자산 아닌 구조 관계는 약한 연관보다 **아래**다. 약한 연관(ETF 공동
              // 편입·공동 보유·유사도)은 적어도 다른 종목을 지목하지만, 분류 노드
              // 링크는 지목하는 종목이 하나도 없다.
              acceptedStructuralNonAssetCount > 0
              ? 'accepted_non_asset_only'
              : quarantinedCount > 0
                ? 'unverified_only'
                : 'unpoliced_only';

  const payload = withTruncation(
    {
      relations: described,
      impactSummaries: [...impactSummaries].sort((a, b) => a.impactKey.localeCompare(b.impactKey)),
      exposureTier: tier,
      acceptedEconomicCount,
      acceptedStructuralCount,
      acceptedStructuralNonAssetCount,
      acceptedWeakCount,
      acceptedUnpolicedCount,
      quarantinedCount,
    },
    facts,
    'relations',
  );

  switch (tier) {
    case 'accepted_economic':
      return block(
        6,
        'exposure_impact',
        'available',
        `${acceptedEconomicCount} accepted economic relations (SUPPLIES/CUSTOMER_OF)`,
        payload,
        evidence,
      );
    case 'accepted_structural':
      // canonical/01 §5 는 competitor/peer 를 Discovery 이유 7종의 첫 항목으로 둔다.
      // 이제 이 등급에 들어오는 것은 상대가 자산인 구조 관계뿐이라 "related asset"
      // 이라고 말해도 거짓이 아니다. 그래도 peer 라고 단정하지는 않는다 — 어떤
      // 술어가 그것을 지탱했는지는 payload.relations[].predicate 가 그대로 들고 있다.
      return block(
        6,
        'exposure_impact',
        'available',
        `${acceptedStructuralCount} accepted structural relations name a tradable asset${nonAssetStructuralNote}${unpolicedNote}`,
        payload,
        evidence,
      );
    case 'accepted_weak_only':
      // 이것을 available 로 보고하는 것이 화면이 ETF 공동 편입을 노출 경로라고
      // 부르게 되는 경로다.
      return block(
        6,
        'exposure_impact',
        'partial',
        `among policed predicates only weak association relations (ETF, common ownership, similarity) are accepted${nonAssetStructuralNote}${unpolicedNote}`,
        payload,
        evidence,
      );
    case 'accepted_non_asset_only':
      // 좁히기로 강등된 자리. `CLASSIFIED_AS` 만 승인된 종목이 여기 온다 —
      // 승인된 관계는 있고 정책 행도 있지만 지목하는 종목이 하나도 없다.
      return block(
        6,
        'exposure_impact',
        'partial',
        `${acceptedStructuralNonAssetCount} accepted structural relations exist but every one points at a non-asset node (taxonomy, metric), so none names a related asset${unpolicedNote}`,
        payload,
        evidence,
      );
    case 'unverified_only':
      return block(
        6,
        'exposure_impact',
        'unverified_only',
        // `nonAssetStructuralNote` 를 여기 붙이지 않는 이유: 사다리에서
        // `accepted_non_asset_only` 가 이 등급보다 위에 있으므로 여기 닿았다는 것은
        // 자산 아닌 구조 승인이 0 이라는 뜻이다. 항상 빈 문자열이 될 단서는 달지 않는다.
        `${quarantinedCount} relations exist and no policed predicate reached an accepted revision${unpolicedNote}`,
        payload,
        evidence,
      );
    case 'unpoliced_only':
      return block(
        6,
        'exposure_impact',
        'partial',
        `${acceptedUnpolicedCount} accepted relations exist but none carries a policy row, so none can bear exposure`,
        payload,
        evidence,
      );
    case 'no_relation_row':
      return block(
        6,
        'exposure_impact',
        'partial',
        'impact summaries exist but knowledge.relation_identity holds no row for this subject',
        payload,
        evidence,
      );
  }
}

function planValuation(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { valuations } = facts;
  if (valuations.length === 0) {
    return block(
      7,
      'valuation_market_implied',
      'not_produced',
      'analytics.valuation_estimate_revision is empty; k4-market-intelligence-writer is its producer and has emitted nothing',
      {},
      0,
    );
  }
  const payload = {
    valuations: [...valuations].sort((a, b) => a.valuationRevisionId - b.valuationRevisionId),
  };
  return block(
    7,
    'valuation_market_implied',
    'available',
    'valuation revisions resolved',
    payload,
    valuations.length,
  );
}

function planMarketReaction(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { marketConfirmation } = facts;
  if (!marketConfirmation) {
    return block(
      8,
      'market_reaction_tradability',
      'not_produced',
      'serving.market_confirmation_v1 has no row for this subject',
      {},
      0,
    );
  }
  return block(
    8,
    'market_reaction_tradability',
    'available',
    'market confirmation resolved',
    { ...marketConfirmation },
    1,
  );
}

/**
 * The one block that cannot be fixed by running a producer harder.
 * `analytics.scenario_set` / `scenario_branch` are empty, and the only populated
 * thesis table in the database is `personalization.thesis_revision`, which
 * REQ-REC-001 forbids this view from reading at all. So the fix is a new,
 * contract-eligible producer — not a rerun.
 */
function planThesis(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { scenarios } = facts;
  if (scenarios.length === 0) {
    return block(
      9,
      'multi_horizon_thesis',
      'no_eligible_source',
      'analytics.scenario_set is empty and personalization.thesis_revision is barred by REQ-REC-001',
      {},
      0,
    );
  }
  const payload = { scenarios: [...scenarios].sort((a, b) => a.scenarioSetId - b.scenarioSetId) };
  return block(
    9,
    'multi_horizon_thesis',
    'available',
    'scenario sets resolved',
    payload,
    scenarios.length,
  );
}

function planCatalysts(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { forwardAssertions } = facts;
  if (forwardAssertions.length === 0) {
    return block(
      10,
      'catalysts_risks_counter_evidence',
      'not_produced',
      'knowledge.assertion carries no forward-looking or contested claim for this subject',
      {},
      0,
    );
  }
  const described = [...forwardAssertions].sort((a, b) =>
    a.assertionKey.localeCompare(b.assertionKey),
  );
  const verified = described.filter((assertion) => assertion.verificationState === 'verified');
  const payload = withTruncation(
    { assertions: described, verifiedCount: verified.length },
    facts,
    'forwardAssertions',
  );
  return verified.length > 0
    ? block(
        10,
        'catalysts_risks_counter_evidence',
        'available',
        `${verified.length} verified forward-looking claims`,
        payload,
        described.length,
      )
    : block(
        10,
        'catalysts_risks_counter_evidence',
        'unverified_only',
        `${described.length} forward-looking claims, all still at verification_state 'extracted'`,
        payload,
        described.length,
      );
}

function planCoverage(facts: AssetSourceFacts): CommonAssetViewBlock {
  const { coverage } = facts;
  if (coverage.length === 0) {
    return block(
      11,
      'coverage_freshness_uncertainty',
      'not_produced',
      'governance.coverage_ledger has no observation covering this subject',
      {},
      0,
    );
  }
  const observations = [...coverage].sort((a, b) => a.datasetKey.localeCompare(b.datasetKey));
  const healthy = observations.filter((observation) => observation.state === 'ok');
  const payload = { observations, healthyCount: healthy.length };
  return healthy.length === observations.length
    ? block(
        11,
        'coverage_freshness_uncertainty',
        'available',
        'every covering dataset reports ok',
        payload,
        observations.length,
      )
    : block(
        11,
        'coverage_freshness_uncertainty',
        'partial',
        `${observations.length - healthy.length} of ${observations.length} covering datasets are not ok`,
        payload,
        observations.length,
      );
}

/**
 * Block 12 is what makes the other eleven auditable: the derivation ids behind them
 * and the snapshot they were read under (REQ-ARCH-001, REQ-REL-001).
 *
 * THE RELEASE ID IS DELIBERATELY NOT IN HERE. It lives on the row, in
 * serving.common_asset_view.release_id, and it is identical for every packet in a
 * build — zero information about any particular asset. Carrying it in the digested
 * payload made every rebuild look like a content change: three consecutive builds of
 * unchanged sources produced three different packet digests for all 297 assets, and
 * this block was the only one that moved. A digest that always moves cannot answer
 * "did anything actually change", which is the only question it is for.
 */
function planDerivation(facts: AssetSourceFacts): CommonAssetViewBlock {
  const payload = {
    semanticSnapshotId: facts.semanticSnapshotId,
    derivationIds: [...facts.derivationIds].sort(),
  };
  return facts.derivationIds.length > 0
    ? block(
        12,
        'derivation_release_manifest',
        'available',
        'snapshot and derivation ids resolved; the release is on the row',
        payload,
        facts.derivationIds.length,
      )
    : block(
        12,
        'derivation_release_manifest',
        'partial',
        'snapshot resolved, no derivation id was recorded for this subject',
        payload,
        1,
      );
}

export function planCommonAssetView(facts: AssetSourceFacts): CommonAssetViewPlan {
  const blocks = [
    planIdentity(facts),
    planBusinessContext(facts),
    planComparableFacts(facts),
    planRecentEvents(facts),
    planExpectation(facts),
    planExposure(facts),
    planValuation(facts),
    planMarketReaction(facts),
    planThesis(facts),
    planCatalysts(facts),
    planCoverage(facts),
    planDerivation(facts),
  ];

  // Twelve, in canonical/06 §2 order, always. A packet that quietly shipped eleven
  // would make "which block is missing" a question the reader cannot answer.
  if (blocks.length !== COMMON_ASSET_VIEW_BLOCK_KEYS.length) {
    throw new Error(
      `common asset view must carry ${COMMON_ASSET_VIEW_BLOCK_KEYS.length} blocks, planned ${blocks.length}`,
    );
  }
  for (const [index, expected] of COMMON_ASSET_VIEW_BLOCK_KEYS.entries()) {
    const actual = blocks[index];
    if (actual?.blockKey !== expected || actual.blockNo !== index + 1) {
      throw new Error(
        `common asset view block ${index + 1} must be ${expected}, planned ${actual?.blockKey}`,
      );
    }
  }

  return {
    viewKey: `${facts.subjectEntityId}@${facts.asOfDate}`,
    subjectEntityId: facts.subjectEntityId,
    asOfDate: facts.asOfDate,
    blocks,
    // Over the block digests rather than the payloads, so a payload that changes
    // shape without changing content cannot move the packet digest by accident, and
    // a state change without a payload change still moves it.
    packetDigest: canonicalDigest(
      blocks.map((entry) => [entry.blockKey, entry.blockState, entry.payloadDigest]),
    ),
  };
}

/**
 * 정본 06 §6 의 coverage-aware gate. 12블록 구성에서 다섯 단어 중 하나를 고른다.
 *
 * 왜 읽기 모델이 아니라 이 파일인가. 이것은 I/O 도 시계도 없는 순수 파생이고, 같은
 * 블록 조합은 언제 계산해도 같은 단어를 낸다. 순수 판정을 순수 파일에 두면 DB 없이
 * 테스트할 수 있고, 나중에 빌더가 이것을 컬럼에 기록하기로 하면 호출자만 늘리면 된다.
 *
 * **오늘 그 기록자는 없다.** 이 함수의 호출자는 읽기 모델과 테스트뿐이고,
 * `serving.common_asset_view` 에 coverage_state 컬럼이 없으며 `packet_digest` 가
 * 이 값을 덮지 않는다. 그러므로 파일 위치와 무관하게 **요청마다 재계산되고, 이 판정이
 * 언제 바뀌었는지 물을 수 있는 자리도 아직 없다.** 계약 required 필드가 297종목을
 * 세 등급으로 가르면서(실측 WATCH 145 · INFORMATION_ONLY 118 · PARTIAL_COVERAGE 34)
 * 스냅샷도 revision 도 없이 이 파일의 편집만으로 조용히 바뀔 수 있다는 뜻이다.
 * 빌더가 이 값을 쓰게 되는 변경에서 digest 대상으로 들어와야 한다.
 *
 * ## 게이트 블록
 *
 * §6 의 필수 minimum 을 12블록에 대응시킨다:
 *
 * | §6 minimum | 블록 |
 * | --- | --- |
 * | identity/economic claim | 1 `identity_economic_claim` |
 * | financial/economic state | 3 `comparable_financial_facts` |
 * | market state | 8 `market_reaction_tradability` |
 * | material event/news coverage | 4 `recent_events_surprise` |
 * | counter-evidence search | 10 `catalysts_risks_counter_evidence` |
 * | PIT quality | 11 `coverage_freshness_uncertainty` |
 *
 * 두 항목은 게이트에 넣지 않았고, 넣지 않은 이유가 넣는 것보다 중요하다.
 *
 * **expectation coverage (블록 5)** — §6 이 "expectation coverage가 필요한
 * claim이면" 이라고 조건부로 쓴다. 패킷만 보고 이 자산의 claim 이 expectation 을
 * 필요로 하는지 판정할 수단이 없으므로, 하드 게이트로 만들면 필요하지 않은
 * 자산까지 함께 강등된다. 없는 근거로 내리는 강등은 정직한 강등이 아니다.
 *
 * **rights state** — 12블록 중 어디에도 대응 블록이 없다. 모델링되지 않은
 * 게이트이며, 여기서 통과시키는 것이 아니라 **아직 재지 않는다**. 권리 상태를
 * 나르는 블록이 생기면 이 목록에 들어와야 한다.
 *
 * ## 사다리
 *
 * 다섯 단어는 강한 쪽에서 약한 쪽 순서다. 어떤 블록 조합이든 정확히 하나로
 * 떨어지고, 바닥은 `INSUFFICIENT_DATA` 다 — `coverageState` 는 계약 required 8개에
 * 들어 있어 `null` 이 될 수 없으므로 전역(total)이어야 한다.
 */
export function deriveCoverageState(
  blocks: readonly Pick<CommonAssetViewBlock, 'blockKey' | 'blockState'>[],
): CommonAssetViewCoverageState {
  const stateOf = (key: CommonAssetViewBlockKey): CommonAssetViewBlockState | null =>
    blocks.find((entry) => entry.blockKey === key)?.blockState ?? null;
  const holds = (key: CommonAssetViewBlockKey): boolean => stateOf(key) === 'available';

  // 정체성이 없으면 나머지 열한 블록은 누구에 대한 사실인지 말할 수 없다.
  // `REQ-UNC-001` 의 바닥.
  if (!holds('identity_economic_claim')) return 'INSUFFICIENT_DATA';

  // PIT 품질을 증언할 관측 자체가 없는 경우. 강등이 아니라 상한이다 — 패킷은
  // 여전히 정보를 주지만, 그 위에서 어떤 것도 등급 매겨질 수 없다. 실측
  // 2026-08-11 기준 115종목이 여기 해당한다.
  if (stateOf('coverage_freshness_uncertainty') === 'not_produced') return 'INFORMATION_ONLY';

  const core = holds('comparable_financial_facts') && holds('market_reaction_tradability');
  if (!core) {
    // 정체성은 있는데 재무·시장 상태 중 하나라도 비면 부분 커버리지.
    return holds('comparable_financial_facts') || holds('market_reaction_tradability')
      ? 'PARTIAL_COVERAGE'
      : 'INFORMATION_ONLY';
  }

  const contextual = holds('recent_events_surprise') && holds('catalysts_risks_counter_evidence');
  // 여섯 게이트가 모두 서야 조사 대상이다. 반증 탐색(블록 10)이 `unverified_only`
  // 인 채로 조사 대상이라 부르면, 검증되지 않은 주장 위에 조사를 세우는 것이다.
  return contextual ? 'RESEARCH_CANDIDATE' : 'WATCH';
}
