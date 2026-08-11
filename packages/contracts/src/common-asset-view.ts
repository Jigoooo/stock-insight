import { z } from 'zod';

/**
 * Common Asset View — 읽기 표면 계약 (canonical/06 §2, `serving.common_asset_view`).
 *
 * 하나의 자산에 대한 12블록 패킷을 **그대로** 실어 나른다. 블록을 합치거나, 비어
 * 있는 블록을 채워 넣거나, 상태를 뭉개지 않는다. 12블록이 다 찬 패킷은 오늘
 * 존재하지 않으며 그것이 정상이다 — 297종목 실측(2026-08-11)에서 블록 7은 297종목
 * 전부 `not_produced`, 블록 9는 297종목 전부 `no_eligible_source` 다.
 *
 * ## `blockState` 는 `REQ-PROD-021` 의 어휘가 아니다
 *
 * 마이그레이션 099 헤더가 세 문단에 걸쳐 적은 판단을 그대로 인용한다:
 *
 * > WHY block_state IS NOT REQ-PROD-021'S VOCABULARY. REQ-PROD-021 defines
 * > NOT_COMPARABLE / INSUFFICIENT_COVERAGE for one narrow question: whether a KPI
 * > can be ranked against peers. A block that has no producer is a different fact
 * > about a different subject, and borrowing that vocabulary would make
 * > INSUFFICIENT_COVERAGE mean two things — which is to say, nothing.
 *
 * > The distinction is load-bearing. Collapsing these into one "no data" marker
 * > would make the four empty blocks look like one problem with one fix; they are
 * > four problems with four different owners.
 *
 * 그래서 이 파일의 `commonAssetViewBlockState` 는 `NOT_COMPARABLE` /
 * `INSUFFICIENT_COVERAGE` 와 **의도적으로 서로소**다. 렌더러가 두 어휘를 한
 * 스위치에서 처리하려 든다면 그것은 이 계약을 어기는 것이다.
 *
 * 다섯 상태는 각각 다른 고칠 거리를 지목한다:
 *
 * | 상태 | 뜻 | 고칠 것 |
 * | --- | --- | --- |
 * | `available` | 파생됐고 내용이 있다 | — |
 * | `partial` | 파생됐지만 그 블록 자신의 커버리지 기준 미달 | 소스 보강 |
 * | `unverified_only` | 소스는 있고 검증을 통과한 것이 없다 | 검증 경로 구축 |
 * | `not_produced` | 생산자는 있는데 아무것도 내놓지 않았다 | 생산자 수리 |
 * | `no_eligible_source` | 이 계약이 읽어도 되는 소스가 없다 | 준수하는 생산자 신설 |
 *
 * `not_produced` 와 `no_eligible_source` 를 같은 것으로 읽으면 안 된다. 전자는
 * 생산자를 더 돌리면 되고, 후자는 더 돌려도 고쳐지지 않는다.
 *
 * ## `contracts/common-asset-view.schema.json` required 8개 매핑
 *
 * 정본 계약 스키마가 요구하는 8개 필드가 이 패킷의 어디서 오는지, 그리고 **채울 수
 * 없는 것은 채울 수 없다고** 적는다.
 *
 * | required | 이 계약에서 | 출처 | 오늘의 실제 값 |
 * | --- | --- | --- | --- |
 * | `assetViewId` | `assetViewId` | `serving.common_asset_view.view_key` (`{entityId}@{asOfDate}`) | 항상 채워짐 |
 * | `economicClaimId` | `economicClaimId` | 블록 1 payload 의 `economicClaim.claimKey` | `core.economic_claim` 행이 없으면 `null` |
 * | `informationSetId` | `informationSetId` | **채울 수 없다** — 아래 참조 | 항상 `null` |
 * | `semanticSnapshotId` | `semanticSnapshotId` | `serving.common_asset_view.semantic_snapshot_id` | 항상 채워짐 |
 * | `coverageState` | `coverageState` | 블록 조합에서 파생 (`deriveCoverageState`, 정본 06 §6) | 항상 채워짐 |
 * | `thesis` | 블록 9 `multi_horizon_thesis` 의 payload | `analytics.scenario_set/_branch` | 297종목 전부 `no_eligible_source`. 배열이 아니라 **블록**으로 실린다 |
 * | `risks` | 블록 10 `catalysts_risks_counter_evidence` 의 payload | `knowledge.assertion` | 267 `not_produced` · 30 `unverified_only` |
 * | `derivationIds` | 블록 12 `derivation_release_manifest` 의 payload | `knowledge.derivation` | **항상 빈 배열** — 아래 참조 |
 *
 * `thesis` / `risks` / `catalysts` / `valuation` / `pricedIn` 를 패킷 최상위로
 * 끌어올리지 않은 것은 의도다. 끌어올리면 같은 사실이 블록과 최상위 두 곳에 살게
 * 되고, 둘이 어긋날 때 어느 쪽이 진실인지 계약이 답하지 못한다. 블록이 유일한
 * 표현이고, 최상위는 패킷 정체성(id · 스냅샷 · 커버리지)만 든다.
 *
 * ### `informationSetId` — 채울 수 없다 (`REQ-SRC-001` 을 우리 산출물에 적용)
 *
 * `serving.common_asset_view` 에 컬럼이 없다. 마이그레이션 118이 nullable 컬럼을
 * 추가하지만 **그 컬럼에는 아직 기록자가 없다** — `common-asset-view-store.ts` 는
 * `releaseId` 와 `semanticSnapshotId` 만 해석하고 information set 은 해석하지
 * 않는다. 기존 행(2026-08-11 기준 2,673행)의 백필도 불가능하다: append-only 트리거가
 * UPDATE 를 거부한다. 그러므로 이 필드는 지금 모든 패킷에서 `null` 이고, 그것을
 * `null` 로 보고하는 것이 유일하게 정직한 처리다. 없는 것을 있는 것처럼 만들지
 * 않는다.
 *
 * ### `derivationIds` — 빈 배열은 충족이 아니다
 *
 * `common-asset-view-store.ts` 가 `derivationIds: []` 를 하드코딩한다. 이유는
 * 파일에 적혀 있다: `knowledge.derivation` 은 3.5M행이고 자산별 조인이 잡 전체를
 * 지배한다. 결과로 블록 12는 **297종목 전부 영구 `partial`** 이다(실측).
 *
 * 이 계약은 그 빈 배열을 `derivationIds` requirement 의 충족으로 통과시키지
 * 않는다. 블록 12의 `blockState` 가 `partial` 인 한 감사 사슬은 닫히지 않았고,
 * 그것이 `blockState` 를 패킷에 그대로 싣는 이유다. `z.array(z.string())` 은
 * `[]` 를 기꺼이 받아들이므로, 충족 여부는 타입이 아니라 상태가 말한다.
 *
 * ## `REQ-REC-001`
 *
 * 이 패킷은 private user data 를 담지 않는다. 그 게이트는 이 파일의 문장이 아니라
 * 읽기 모델의 시그니처가 진다 — CAV 읽기 경로는 `userScope` 를 인자로 받지
 * 않는다. 닿을 수 없는 인자가 주석보다 강한 게이트다.
 */

/** canonical/06 §2 의 12블록. 순서가 곧 `blockNo` 다. */
export const commonAssetViewBlockKeys = [
  'identity_economic_claim',
  'business_sector_context',
  'comparable_financial_facts',
  'recent_events_surprise',
  'expectation_priced_in',
  'exposure_impact',
  'valuation_market_implied',
  'market_reaction_tradability',
  'multi_horizon_thesis',
  'catalysts_risks_counter_evidence',
  'coverage_freshness_uncertainty',
  'derivation_release_manifest',
] as const;

export const commonAssetViewBlockKeySchema = z.enum(commonAssetViewBlockKeys);
export type CommonAssetViewBlockKey = z.infer<typeof commonAssetViewBlockKeySchema>;

/** 마이그레이션 099 의 `block_state` CHECK 와 값·순서가 같다. */
export const commonAssetViewBlockStates = [
  'available',
  'partial',
  'unverified_only',
  'not_produced',
  'no_eligible_source',
] as const;

export const commonAssetViewBlockStateSchema = z.enum(commonAssetViewBlockStates);
export type CommonAssetViewBlockState = z.infer<typeof commonAssetViewBlockStateSchema>;

/**
 * 정본 06 §6 의 다섯 단어, 그 순서 그대로. 강한 쪽에서 약한 쪽으로 읽는다.
 *
 * 이 다섯은 `blockState` 와 **다른 축**이다. `blockState` 는 블록 하나가 무엇을
 * 들고 있는지 말하고, `coverageState` 는 패킷 전체를 어디까지 쓸 수 있는지
 * 말한다. 파생 규칙은 `deriveCoverageState`(순수 함수)에 있고, 이 계약은 어휘만
 * 고정한다.
 */
export const commonAssetViewCoverageStates = [
  'RESEARCH_CANDIDATE',
  'WATCH',
  'PARTIAL_COVERAGE',
  'INFORMATION_ONLY',
  'INSUFFICIENT_DATA',
] as const;

export const commonAssetViewCoverageStateSchema = z.enum(commonAssetViewCoverageStates);
export type CommonAssetViewCoverageState = z.infer<typeof commonAssetViewCoverageStateSchema>;

export const commonAssetViewBlockSchema = z.object({
  blockNo: z.number().int().min(1).max(12),
  blockKey: commonAssetViewBlockKeySchema,
  blockState: commonAssetViewBlockStateSchema,
  /**
   * 왜 이 상태인지, 빌더 자신의 말로. 이유 없는 상태는 다음 읽는 사람에게
   * 마이그레이션 099 헤더의 census 를 다시 유도하라고 시키는 것과 같다.
   */
  stateReason: z.string().min(1),
  /**
   * payload 가 몇 개의 하위 레코드 위에 서 있는지. `available` + 0 은 DB CHECK 가
   * 거부하는 모순이다.
   */
  evidenceCount: z.number().int().nonnegative(),
  /**
   * 블록마다 내부 모양이 다르므로 계약이 강제할 수 있는 것은 "객체"까지다.
   * 억지로 union 을 세우면 새 블록 필드가 조용히 탈락한다.
   */
  payload: z.record(z.string(), z.unknown()),
});

export type CommonAssetViewBlock = z.infer<typeof commonAssetViewBlockSchema>;

/**
 * 12개 고정. 읽기 모델이 패킷을 조립하기 **전에** 블록을 먼저 통과시키는 용도다 —
 * `coverageState` 파생과 `economicClaimId` 추출이 둘 다 블록을 입력으로 받으므로,
 * 그 전에 문자열이 어휘로 좁혀져 있어야 캐스트 없이 타입이 흐른다.
 */
export const commonAssetViewBlocksSchema = z
  .array(commonAssetViewBlockSchema)
  .length(commonAssetViewBlockKeys.length);

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const commonAssetViewPacketSchema = z.object({
  entityKey: z.string().min(1),
  /** `serving.common_asset_view.view_key` — `{subjectEntityId}@{asOfDate}`. */
  assetViewId: z.string().min(1),
  revisionNo: z.number().int().positive(),
  /** 블록 1 의 `economicClaim.claimKey`. 경제 주장이 없으면 `null`. */
  economicClaimId: z.string().min(1).nullable(),
  /** 오늘 항상 `null`. 위 헤더의 `REQ-SRC-001` 항목 참조. */
  informationSetId: z.string().min(1).nullable(),
  semanticSnapshotId: z.string().min(1),
  /**
   * `REQ-REL-001`: 패킷이 자기가 속한 릴리스를 이름으로 든다. 같은 화면의 impact
   * 나 theme 패널과 섞일 때 각자 latest 를 따로 해석하는 대신 서로 맞는지 확인할
   * 수 있게.
   */
  releaseId: z.string().min(1),
  packetDigest: sha256HexSchema,
  /**
   * 이 패킷이 관측한 날짜. **신선도 게이트를 이 계약은 걸지 않는다** — 어제 날짜의
   * 진짜 패킷을 `stale` 로 가려 버리면 있는 것을 없는 것처럼 만든다. 날짜를 그대로
   * 실어 보내고 판단은 렌더러가 한다.
   */
  asOfDate: isoDateSchema,
  coverageState: commonAssetViewCoverageStateSchema,
  /** 12개, 언제나. 11개짜리 패킷은 작은 패킷이 아니라 읽을 수 없는 패킷이다. */
  blocks: z.array(commonAssetViewBlockSchema).length(commonAssetViewBlockKeys.length),
});

export type CommonAssetViewPacket = z.infer<typeof commonAssetViewPacketSchema>;

/**
 * 두 상태뿐이다. `stale` 이 없는 이유는 `asOfDate` 주석에 적었고, `error` 가 없는
 * 이유는 실패가 예외로 나가서 composer 의 `partialFailures` 로 잡히기 때문이다.
 * `missing` 은 실패가 아니라 정직한 부재다 — 이 종목의 패킷이 아직 지어지지 않은
 * 것이며, 그것을 부분 실패로 보고하면 정상을 사고로 읽게 된다.
 */
export const commonAssetViewAvailabilitySchema = z.enum(['available', 'missing']);
export type CommonAssetViewAvailability = z.infer<typeof commonAssetViewAvailabilitySchema>;

export const commonAssetViewResponseSchema = z.object({
  packet: commonAssetViewPacketSchema.nullable(),
  availability: commonAssetViewAvailabilitySchema,
});

export type CommonAssetViewResponse = z.infer<typeof commonAssetViewResponseSchema>;
