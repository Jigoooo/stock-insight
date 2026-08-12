/**
 * Common Asset View 패킷 → 화면 모델. **payload 를 읽는 유일한 자리다.**
 *
 * 왜 한 파일인가. 라이브 패킷(2026-08-11, 297종목)의 payload 필드는 거의 전부
 * 내부 식별자다:
 *
 * ```
 * 블록 1  entityKey "legacy-security:47" · economicClaim.statement "null"(문자열!)
 * 블록 2  nodeKey "264" · playbookKey "semiconductor" · assignedAt Date.toString()
 * 블록 3  metricKey "dart:AcquisitionOfTreasuryShares"
 * 블록 4  eventKey "extract-v2:7730:capex_increase:삼성전자"
 * 블록 5  expectationRevisionId 13
 * 블록 6  objectEntityId 1199 (상대 이름 없음)
 * 블록 10 assertionKey "claim:182" · predicateKey "PRODUCES"
 * 블록 11 datasetKey "dart-financial-fact:00126380:2022:11011"
 * 블록 12 semanticSnapshotId "k4.semantic.2026...."
 * ```
 *
 * 이걸 그대로 그리면 UX 헌법 7번(raw UUID·내부 enum·source key 노출 금지)에
 * 걸려 릴리스가 막힌다. 열두 개 컴포넌트가 각자 기억하기를 바라는 대신 **여기
 * 하나만 통과하게** 만든다. `.tsx` 는 `block.payload` 에 손대지 않는다.
 *
 * ## 어휘를 섞지 않는다
 *
 * 마이그레이션 099 헤더가 세 문단에 걸쳐 적은 대로, `blockState` 5값과
 * `REQ-PROD-021` 의 `NOT_COMPARABLE`/`INSUFFICIENT_COVERAGE` 는 서로소다.
 * 이 파일도 두 어휘를 각각 `AssetBlockState`(계약 재수출)와
 * `MetricComparability` 로 따로 들고, 한 스위치에서 처리하지 않는다.
 *
 * ## 열린 문자열에는 assertNever 를 쓰지 않는다
 *
 * `blockState` 만 계약이 좁힌 enum 이다. `signalTier` · `revisionStatus` ·
 * `direction` · `modality` · 커버리지 `state` 는 payload 가 `unknown` 으로
 * 실어 오는 **열린 문자열**이라, 새 값이 오면 크래시가 아니라 정직한 기본
 * 문구로 떨어져야 한다. 여기서 assertNever 를 쓰면 파이프라인이 값을 하나
 * 늘리는 순간 종목 상세가 통째로 죽는다.
 */

import { playbookDisplayName } from '@/features/industry-primer';
import {
  commonAssetViewBlockKeys,
  type CommonAssetViewBlock,
  type CommonAssetViewBlockKey,
  type CommonAssetViewPacket,
} from '@stock-insight/contracts/common-asset-view';

export type AssetBlockKey = CommonAssetViewBlockKey;

/** payload 안의 임의 값. 좁히기 전에는 아무것도 믿지 않는다. */
type Unknown = unknown;

function asRecord(value: Unknown): Record<string, Unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, Unknown>)
    : {};
}

function asArray(value: Unknown): Unknown[] {
  return Array.isArray(value) ? value : [];
}

function asFiniteNumber(value: Unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asCount(value: Unknown): number {
  const parsed = asFiniteNumber(value);
  return parsed !== null && parsed >= 0 ? Math.trunc(parsed) : 0;
}

/**
 * 사람에게 보여도 되는 문자열만 통과시킨다.
 *
 * `"null"` 을 특별히 막는 이유: 블록 1 의 `economicClaim.statement` 는 라이브에서
 * **문자열 `"null"`** 이다(삼성전자 실측). `if (statement)` 는 통과하므로, 가장
 * 잘 덮인 종목의 investable claim 자리에 "null" 이라는 낱말이 그려진다.
 *
 * `internalKeyPattern` 은 `legacy-security:47` · `claim:182` ·
 * `extract-v2:7730:...` · `dart-financial-fact:00126380:...` 같은 **콜론으로
 * 이어 붙인 내부 키**를 걸러낸다. 사람이 쓴 문장에는 이 모양이 거의 없고,
 * 있더라도 막아서 잃는 것보다 새어 나가서 잃는 것이 크다.
 */
const internalKeyPattern = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*:\S/i;
const nullishText = new Set(['null', 'undefined', 'nan', 'none', '[object object]']);

/**
 * `SCREAMING_SNAKE` 열거값. 콜론이 없어 `internalKeyPattern` 을 비켜가고 `null` 도
 * 아니라 `nullishText` 도 비켜간다 — 두 가드 사이로 정확히 빠져나가는 모양이다.
 *
 * 라이브 반증(2026-08-12): 블록1 의 `economicClaim.statement` 가 297종목 중 2종목에서
 * 문자열 `FUND_UNIT` 이다(`US:XLE`·`US:XLK`, 둘 다 섹터 ETF). 두 종목은 컨트롤러의
 * 404 조건(`data === null` 또는 availability `missing`/`unsupported`)에 걸리지 않아
 * **200 으로 도착하고**, `company_profiles` 행이 없어 한 줄 설명이 비므로 그 화면에서
 * 사람 말로 된 문장은 `FUND_UNIT` 하나뿐이 된다. UX 헌법 7번은 릴리스를 막는다.
 *
 * **밑줄을 요구하는 것이 이 패턴의 전부다.** 밑줄 없는 대문자 토큰을 막으면
 * `NAVER`·`HPSP`·`ASML`·`SK`·`GS`·`NHN` 같은 진짜 이름 24건이 함께 사라진다 —
 * 라이브 `displayName` 에 실재하는 값들이다. 열거값을 이름과 가르는 것은 대문자가
 * 아니라 밑줄이다.
 */
const screamingEnumPattern = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

export function displayText(value: Unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (nullishText.has(trimmed.toLowerCase())) return null;
  if (internalKeyPattern.test(trimmed)) return null;
  if (screamingEnumPattern.test(trimmed)) return null;
  return trimmed;
}

/**
 * ISO 로 파싱되는 시각만 통과시킨다.
 *
 * 블록 2 의 `assignedAt` 은 `"Sun Aug 09 2026 09:56:57 GMT+0900 (Korean Standard
 * Time)"` — JS `Date.toString()` 출력이다. 그대로 그리면 영어 타임존 문자열이
 * 화면에 남으므로 파싱해서 ISO 로 바꾸고, 파싱이 안 되면 버린다.
 */
export function isoInstant(value: Unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** `KR:005930` 형태의 자산 키를 시장 + 티커로 가른다. 원본 키는 돌려주지 않는다. */
export function splitAssetKey(value: Unknown): { market: string; ticker: string } | null {
  if (typeof value !== 'string') return null;
  const match = /^([A-Z]{2,6}):([A-Za-z0-9.-]{1,12})$/.exec(value.trim());
  if (!match?.[1] || !match[2]) return null;
  return { market: match[1], ticker: match[2] };
}

// ── 블록 색인 ────────────────────────────────────────────────────────────────

export type AssetBlockIndex = Readonly<Record<AssetBlockKey, CommonAssetViewBlock>>;

/**
 * 12블록을 키로 색인한다. 계약이 `.length(12)` 를 강제하므로 여기서 결손은
 * 일어날 수 없지만, 타입이 그것을 모르므로 없는 블록은 던진다 — 11블록짜리
 * 패킷은 작은 패킷이 아니라 읽을 수 없는 패킷이다(계약 헤더).
 */
export function indexBlocks(packet: CommonAssetViewPacket): AssetBlockIndex {
  const byKey = new Map(packet.blocks.map((block) => [block.blockKey, block]));
  const entries = commonAssetViewBlockKeys.map((key) => {
    const block = byKey.get(key);
    if (!block) throw new Error('공통 자산 패킷에 블록이 빠져 있습니다');
    return [key, block] as const;
  });
  return Object.fromEntries(entries) as AssetBlockIndex;
}

// ── 블록 1 · 정체성과 경제 주장 ──────────────────────────────────────────────

export type IdentityView = {
  displayName: string | null;
  tickers: string[];
  /** 경제 주장 문장. 라이브에서 문자열 `"null"` 인 종목이 있어 걸러진다. */
  claimStatement: string | null;
  /** 주장 행 자체는 있는가. 문장이 없어도 주장은 존재할 수 있다. */
  hasClaim: boolean;
};

export function readIdentity(block: CommonAssetViewBlock): IdentityView {
  const payload = asRecord(block.payload);
  const claim = asRecord(payload.economicClaim);
  return {
    displayName: displayText(payload.displayName),
    tickers: asArray(payload.tickers)
      .map((ticker) => (typeof ticker === 'string' ? ticker.trim() : ''))
      .filter((ticker) => ticker.length > 0 && ticker.length <= 12),
    claimStatement: displayText(claim.statement),
    hasClaim: Object.keys(claim).length > 0,
  };
}

// ── 블록 2 · 산업과 테마 맥락 ────────────────────────────────────────────────

/**
 * 플레이북 키는 내부 enum 이라 그대로 그릴 수 없다. 아는 것만 옮기고 모르는
 * 것은 **이름 없이 존재만** 말한다 — 모르는 키를 영어 그대로 흘리는 것보다
 * "배정되어 있으나 이름을 아직 옮기지 못했다" 가 정직하다.
 *
 * 이름 표는 `features/industry-primer` 가 소유한다. 2026-08-11 이전에는 여기에
 * 사본이 있었고, 그 사본의 9개 키 중 라이브에 실제로 나타나는 것은 둘뿐이었다
 * (`semiconductor` · `bank`). 나머지 일곱은 없는 산업이었고, 반대로 라이브의
 * `crypto` · `life_science` · `utility` · `refining` · `resources` 는 표에 없어
 * 배정 69건 중 46건이 이름 없이 떨어지고 있었다. 표를 한 곳으로 모으면서
 * 실측에 맞췄다.
 */

export type SectorContextView = {
  taxonomyLabels: string[];
  /**
   * 배정된 플레이북 키 **원문**. 내부 enum 이라 절대 렌더하지 않는다 — 모델
   * 사이로만 흐르고, 화면에 나가는 것은 `playbookLabel` 뿐이다.
   */
  playbookKey: string | null;
  /** 배정된 플레이북의 한국어 이름. 표에 없는 키는 `null`. */
  playbookLabel: string | null;
  hasPlaybook: boolean;
  assignedAt: string | null;
};

export function readSectorContext(block: CommonAssetViewBlock): SectorContextView {
  const payload = asRecord(block.payload);
  const playbook = asRecord(payload.playbook);
  const playbookKey = typeof playbook.playbookKey === 'string' ? playbook.playbookKey.trim() : '';
  return {
    taxonomyLabels: asArray(payload.taxonomy)
      .map((node) => displayText(asRecord(node).label))
      .filter((label): label is string => label !== null),
    playbookKey: playbookKey.length > 0 ? playbookKey : null,
    playbookLabel: playbookKey.length > 0 ? playbookDisplayName(playbookKey) : null,
    hasPlaybook: playbookKey.length > 0,
    assignedAt: isoInstant(playbook.assignedAt),
  };
}

// ── 블록 3 · 비교 가능한 재무 사실 ───────────────────────────────────────────

/**
 * `REQ-PROD-021` 의 세 값. **`blockState` 와 절대 같은 스위치에 두지 않는다.**
 * 알 수 없는 값은 `unknown` 으로 떨어뜨린다 — payload 는 계약이 좁힌 enum 이
 * 아니다.
 */
export const METRIC_COMPARABILITIES = [
  'COMPARABLE',
  'NOT_COMPARABLE',
  'INSUFFICIENT_COVERAGE',
  'unknown',
] as const;
export type MetricComparability = (typeof METRIC_COMPARABILITIES)[number];

function toComparability(value: Unknown): MetricComparability {
  return value === 'COMPARABLE' || value === 'NOT_COMPARABLE' || value === 'INSUFFICIENT_COVERAGE'
    ? value
    : 'unknown';
}

export type PeerComparisonView = {
  /** 순위를 매기는 데 필요한 최소 동종 수. 라이브에서 3. */
  minimumPeersForRank: number;
  observedMetricCount: number;
  /** 패킷에 실린 지표 수. 상한이 걸려 있으면 전체 수와 다르다. */
  keptMetricCount: number;
  totalMetricCount: number;
  counts: Record<MetricComparability, number>;
  /** 비교 가능한 지표들의 동종 수 범위. 없으면 `null`. */
  peerCountRange: { min: number; max: number } | null;
  /**
   * **차원별 순위는 payload 에 없다.** `REQ-PROD-020` 이 요구하는 rank 와 지표
   * 정의(`governance.entity_playbook_current_v1.key_indicators`)는 이 읽기
   * 경로에 도달하지 않는다. 화면은 이 값을 근거로 부재를 이름 붙여 그린다.
   */
  rankAvailable: false;
  /** 지표 이름을 한국어로 옮길 표가 아직 없다는 사실. */
  namedMetricCount: 0;
};

export function readPeerComparison(block: CommonAssetViewBlock): PeerComparisonView {
  const payload = asRecord(block.payload);
  const metrics = asArray(payload.metrics).map(asRecord);
  const truncated = asRecord(payload.truncated);
  const counts: Record<MetricComparability, number> = {
    COMPARABLE: 0,
    NOT_COMPARABLE: 0,
    INSUFFICIENT_COVERAGE: 0,
    unknown: 0,
  };
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const metric of metrics) {
    const verdict = toComparability(metric.comparability);
    counts[verdict] += 1;
    if (verdict !== 'COMPARABLE') continue;
    const peers = asCount(metric.peerCount);
    min = Math.min(min, peers);
    max = Math.max(max, peers);
  }
  const keptMetricCount = metrics.length;
  const totalMetricCount = asCount(truncated.total) || keptMetricCount;
  return {
    minimumPeersForRank: asCount(payload.minimumPeersForRank) || 3,
    observedMetricCount: keptMetricCount,
    keptMetricCount,
    totalMetricCount,
    counts,
    peerCountRange: counts.COMPARABLE > 0 ? { min, max } : null,
    rankAvailable: false,
    namedMetricCount: 0,
  };
}

// ── 블록 4 · 최근 사건과 기대 서프라이즈 ─────────────────────────────────────

export type AssetEventView = {
  /** 목록 key 로만 쓰는 안정 식별자. 화면에는 나가지 않는다. */
  id: string;
  title: string;
  knownAt: string | null;
};

export type RecentEventsView = {
  events: AssetEventView[];
  keptEventCount: number;
  /**
   * 잘림 상한(`truncated.total`)이 말하는 총계. **제품 경계에 걸려 빠진 사건은
   * 여기 들어 있지 않다** — 빌더가 `withTruncation` 에 넘기는 목록이 이미
   * 걸러진 목록이기 때문이다(`common-asset-view-store.ts` 의 `capped(
   * eligibleEventRows, …)`). 관측된 총계는 이 값 + `excludedEventCount` 다.
   */
  totalEventCount: number;
  /**
   * 정보 제공 범위를 벗어나 빌더가 제외한 사건 수(`actionAdviceExcludedEvents`).
   *
   * 이 값을 화면이 읽지 않던 동안, 제외를 안은 30개 블록 중 27개가
   * "N건 전부가 실렸습니다" 를 그렸다(한화오션 1/7, LG유플러스 2/7,
   * 삼성전기 15/8, BGF리테일 1/6). 세어서 남긴 수를 아무도 읽지 않으면
   * 그것은 이유 있는 부재가 아니라 거짓 완결 주장이다.
   */
  excludedEventCount: number;
  surpriseCount: number;
  /** 서프라이즈 크기의 절대값 최대치. 방향은 payload 에 없다. */
  largestSurpriseMagnitude: number | null;
};

export function readRecentEvents(block: CommonAssetViewBlock): RecentEventsView {
  const payload = asRecord(block.payload);
  const rawEvents = asArray(payload.events).map(asRecord);
  const truncated = asRecord(payload.truncated);
  const events: AssetEventView[] = [];
  const seen = new Set<string>();
  for (const [index, event] of rawEvents.entries()) {
    const title = displayText(event.title);
    if (title === null) continue;
    const knownAt = isoInstant(event.knownAt);
    // 라이브 payload 는 같은 사건을 그대로 두 번 싣는다(삼성전자 실측:
    // "삼성전자 역대급 이익" 이 같은 knownAt 으로 2회). 화면에서 같은 줄을 두 번
    // 그리는 대신 제목+시각으로 접는다.
    //
    // 2026-08-12 정정 — 여기 "세는 수는 접기 전 원본을 쓴다" 고 적혀 있었고 그게
    // 틀렸다. PayPal(220@2026-08-11) 실측: payload 9건 · 중복 제거 후 8건 ·
    // truncated 없음 → 화면이 **8줄짜리 목록 위에 "9건 전부가 실렸습니다"** 를
    // 그렸다. 접힌 1건은 사라졌는데 문장은 전부라고 말한다. MAJOR-1 에서 걷어낸
    // 것과 같은 종류의 거짓 완결 주장이다.
    //
    // 세는 수를 접은 뒤로 옮기면 폴백도 함께 옮겨야 한다. `totalEventCount` 가
    // `truncated.total || rawEvents.length` 였는데, kept 만 8로 낮추면 total 이 9로
    // 남아 truncated 가 참으로 뒤집히고 "전체 9건 중 최근 8건" — 일어나지 않은
    // 잘림을 주장한다. 둘 다 접은 뒤 수를 본다.
    const fingerprint = `${title}@${knownAt ?? ''}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    events.push({ id: `${index}`, title, knownAt });
  }
  const magnitudes = asArray(payload.surprises)
    .map((surprise) => asFiniteNumber(asRecord(surprise).magnitude))
    .filter((magnitude): magnitude is number => magnitude !== null)
    .map(Math.abs);
  return {
    events,
    keptEventCount: events.length,
    totalEventCount: asCount(truncated.total) || events.length,
    excludedEventCount: asCount(payload.actionAdviceExcludedEvents),
    surpriseCount: asArray(payload.surprises).length,
    largestSurpriseMagnitude: magnitudes.length > 0 ? Math.max(...magnitudes) : null,
  };
}

// ── 블록 5 · 기대와 선반영 ───────────────────────────────────────────────────

export type ExpectationView = { revisionCount: number };

export function readExpectation(block: CommonAssetViewBlock): ExpectationView {
  return { revisionCount: asArray(asRecord(block.payload).expectations).length };
}

// ── 블록 6 · 노출과 영향 경로 ────────────────────────────────────────────────

/**
 * 상대 자산의 **이름이 payload 에 없다**. 실린 것은 `objectEntityId` 뿐이라
 * "관련 기업" 목록을 이 블록에서 만들 방법이 없다. 그래서 화면 모델은 이름
 * 대신 **집계**만 든다 — 그리고 그 제약이 `REQ-PROD-030`(유사도를 관련 기업으로
 * 쓰지 말 것)을 구조적으로 지켜 준다.
 */
export type ExposureView = {
  acceptedEconomicCount: number;
  /** 상대가 거래 가능한 자산인 승인 구조 관계. */
  acceptedStructuralCount: number;
  /** 상대가 분류 노드·지표라 지목하는 종목이 없는 승인 구조 관계. */
  acceptedStructuralNonAssetCount: number;
  acceptedWeakCount: number;
  acceptedUnpolicedCount: number;
  quarantinedCount: number;
  relationCount: number;
  keptRelationCount: number;
  totalRelationCount: number;
  /** 영향 경로가 지목한 자산. 이름은 없고 시장·티커만 있다. */
  impactTargets: Array<{ market: string; ticker: string }>;
  impactPathCount: number;
  /** 상대 이름이 패킷에 없다는 사실 — 화면이 갭으로 이름 붙여 그린다. */
  counterpartyNamesAvailable: false;
};

export function readExposure(block: CommonAssetViewBlock): ExposureView {
  const payload = asRecord(block.payload);
  const relations = asArray(payload.relations);
  const truncated = asRecord(payload.truncated);
  const impacts = asArray(payload.impactSummaries).map(asRecord);
  return {
    acceptedEconomicCount: asCount(payload.acceptedEconomicCount),
    acceptedStructuralCount: asCount(payload.acceptedStructuralCount),
    acceptedStructuralNonAssetCount: asCount(payload.acceptedStructuralNonAssetCount),
    acceptedWeakCount: asCount(payload.acceptedWeakCount),
    acceptedUnpolicedCount: asCount(payload.acceptedUnpolicedCount),
    quarantinedCount: asCount(payload.quarantinedCount),
    relationCount: relations.length,
    keptRelationCount: relations.length,
    totalRelationCount: asCount(truncated.total) || relations.length,
    impactTargets: impacts
      .map((impact) => splitAssetKey(impact.impactKey))
      .filter((target): target is { market: string; ticker: string } => target !== null),
    impactPathCount: impacts.length,
    counterpartyNamesAvailable: false,
  };
}

// ── 블록 7 · 밸류에이션과 반영된 기대 ────────────────────────────────────────

/**
 * 이 블록에는 리더가 **없었다**. 파일이 블록 5 → 6 → 8 로 건너뛰었고, 그 사이
 * 화면은 `<AssetSection ... />` 를 자식 없이 그렸다. 블록 7 이 297종목 전부
 * `not_produced` 이던 동안에는 그래도 정직했다 — 고지가 부재를 말했으니까.
 *
 * 생산자가 착지하면서 그 전제가 깨졌다. 2026-08-12 실측으로 52종목이
 * `available` 이고, 그 52종목에서 화면은 "확인됨" 배지 아래 **빈 몸통**을
 * 그린다. 패킷은 밴드를 싣고 있는데 읽는 코드가 없어서다. 부재를 이유와 함께
 * 그리는 것이 이 화면이 하는 일인데, 있는 것을 없는 것처럼 그리는 것은 그
 * 반대다.
 *
 * 라이브 전수(2026-08-12, `analytics.valuation_estimate_revision`):
 *   own_history_pbr_band / ratio / trailing_annual_history   247행
 *   own_history_per_band / ratio / trailing_annual_history   177행
 * 아래 세 표는 그 전수이고, 표에 없는 값이 오면 **이름 없이 그리지 않는다**
 * (UX 헌법 7번). 새 방법이 생기면 표에 한 줄을 더하는 것이 배선이다.
 */
const valuationMethodLabels: Record<string, string> = {
  own_history_pbr_band: '주가순자산배수(PBR)',
  own_history_per_band: '주가수익배수(PER)',
};

const valuationHorizonLabels: Record<string, string> = {
  trailing_annual_history: '지난 연간 재무 이력',
};

/**
 * 단위는 선택 항목이 아니다. 생산자
 * (`common-asset-view-plan.ts`)가 같은 문장을 먼저 남겼다 — 비율 밴드와 통화
 * 밴드가 같은 두 숫자로 보이는 순간 이 블록은 가격 구간과 구별되지 않는다.
 * 그래서 모르는 단위에서는 숫자를 **아예 내지 않고** 그 사실을 센다.
 */
const valuationUnitFormatters: Record<string, (value: number) => string> = {
  ratio: (value) => `${value.toFixed(2)}배`,
};

export type ValuationBandView = {
  methodLabel: string;
  horizonLabel: string | null;
  /** 단위를 모르면 `null`. 화면은 숫자 대신 그 사실을 적는다. */
  rangeText: string | null;
};

export type ValuationView = {
  bands: ValuationBandView[];
  /** 이름 붙은 방법이 아니라 화면에 올리지 않은 밴드 수. */
  unnamedMethodCount: number;
  /** 단위를 몰라 숫자를 내지 못한 밴드 수. */
  unitlessCount: number;
};

export function readValuation(block: CommonAssetViewBlock): ValuationView {
  const rows = asArray(asRecord(block.payload).valuations).map(asRecord);
  const bands: ValuationBandView[] = [];
  let unnamedMethodCount = 0;
  let unitlessCount = 0;

  for (const row of rows) {
    const methodKey = typeof row.methodKey === 'string' ? row.methodKey.trim() : '';
    const methodLabel = valuationMethodLabels[methodKey];
    if (methodLabel === undefined) {
      // 원문 키를 대신 그리면 `own_history_pbr_band` 가 화면에 뜬다.
      unnamedMethodCount += 1;
      continue;
    }
    const unit = typeof row.estimateUnit === 'string' ? row.estimateUnit.trim() : '';
    const format = valuationUnitFormatters[unit];
    const lower = asFiniteNumber(row.lowerEstimate);
    const upper = asFiniteNumber(row.upperEstimate);
    const rangeText =
      format !== undefined && lower !== null && upper !== null
        ? `${format(lower)} ~ ${format(upper)}`
        : null;
    if (rangeText === null) unitlessCount += 1;
    const horizon = typeof row.horizon === 'string' ? row.horizon.trim() : '';
    bands.push({
      methodLabel,
      horizonLabel: valuationHorizonLabels[horizon] ?? null,
      rangeText,
    });
  }

  return { bands, unnamedMethodCount, unitlessCount };
}

// ── 블록 8 · 시장 반응 ───────────────────────────────────────────────────────

const marketDirectionLabels: Record<string, string> = {
  confirmed: '가격이 사건 방향과 같게 움직였습니다',
  partial: '가격 움직임이 사건 방향과 일부만 맞았습니다',
  not_confirmed: '가격 움직임이 사건 방향을 확인해 주지 않았습니다',
};

export type MarketReactionView = {
  /** 사람이 읽는 문장. 모르는 값이면 `null`. */
  directionLabel: string | null;
  hasDirection: boolean;
  strength: number | null;
  asOf: string | null;
};

export function readMarketReaction(block: CommonAssetViewBlock): MarketReactionView {
  const payload = asRecord(block.payload);
  const direction = typeof payload.direction === 'string' ? payload.direction.trim() : '';
  return {
    directionLabel: marketDirectionLabels[direction] ?? null,
    hasDirection: direction.length > 0,
    strength: asFiniteNumber(payload.strength),
    asOf: isoInstant(payload.asOf),
  };
}

// ── 블록 9 · 기간별 논지와 반대 논지 ─────────────────────────────────────────

/**
 * 세 갈래는 **가격 시나리오가 아니다.** 정본 05 §7 이 요구하는 것은 "한 종목의
 * 원인을 하나로 고정하지 않는" 경쟁 해석이고, 생산자가 만드는 것도 자기 이력
 * 배수 구간이라는 **준거틀이 아직 유효한가**를 두고 갈리는 세 읽기다.
 *
 * 그래서 라벨에 오름·내림이 없다. `bull`/`bear` 는 040 스키마의 어휘일 뿐이고
 * 그대로 화면에 나가면 제품 경계(CLAUDE.md)가 금지한 방향 주장이 된다.
 */
const thesisBranchLabels: Record<string, string> = {
  bull: '이력 구간이 더는 맞지 않는다는 해석',
  base: '지금 확정되는 것만 말하는 해석',
  bear: '이력 구간이 아직 맞는다는 해석',
};

export type ThesisBranchView = {
  label: string;
  narrative: string | null;
  /** 무엇이 이 해석을 반증하는가. 정본 §7 이 서술과 함께 저장하라고 한 것. */
  invalidationCondition: string | null;
};

export type ThesisView = {
  title: string | null;
  branches: ThesisBranchView[];
  /** 이름을 옮기지 못한 갈래 수. 원문 enum 을 그리는 대신 센다. */
  unnamedBranchCount: number;
  /** 반증 조건 없이 온 갈래 수. 040 상 0이어야 하고, 아니면 결함이다. */
  branchesWithoutInvalidation: number;
};

export function readThesis(block: CommonAssetViewBlock): ThesisView {
  const payload = asRecord(block.payload);
  const rows = asArray(payload.scenarios).map(asRecord);
  const branches: ThesisBranchView[] = [];
  let unnamedBranchCount = 0;
  for (const row of rows) {
    const kind = typeof row.branchKind === 'string' ? row.branchKind.trim() : '';
    const label = thesisBranchLabels[kind];
    if (label === undefined) {
      unnamedBranchCount += 1;
      continue;
    }
    branches.push({
      label,
      narrative: displayText(row.narrative),
      invalidationCondition: displayText(row.invalidationCondition),
    });
  }
  return {
    title: displayText(rows[0]?.title),
    branches,
    unnamedBranchCount,
    branchesWithoutInvalidation: asCount(payload.branchesWithoutInvalidation),
  };
}

// ── 블록 10 · 촉매·리스크·반대 근거 ──────────────────────────────────────────

const modalityLabels: Record<string, string> = {
  forecast: '앞을 내다본 전망',
  alleged: '확인되지 않은 주장',
  observed: '관측된 사실',
  planned: '예고된 계획',
};

export type CatalystRiskView = {
  totalCount: number;
  verifiedCount: number;
  unverifiedCount: number;
  /** 종류별 개수. 이름을 아는 것만 담고 나머지는 `otherCount` 로 센다. */
  byModality: Array<{ label: string; count: number }>;
  otherCount: number;
};

export function readCatalystRisks(block: CommonAssetViewBlock): CatalystRiskView {
  const payload = asRecord(block.payload);
  const assertions = asArray(payload.assertions).map(asRecord);
  const buckets = new Map<string, number>();
  let otherCount = 0;
  for (const assertion of assertions) {
    const modality = typeof assertion.modality === 'string' ? assertion.modality.trim() : '';
    const label = modalityLabels[modality];
    if (label === undefined) {
      otherCount += 1;
      continue;
    }
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  const verifiedCount = asCount(payload.verifiedCount);
  return {
    totalCount: assertions.length,
    verifiedCount,
    unverifiedCount: Math.max(assertions.length - verifiedCount, 0),
    byModality: [...buckets].map(([label, count]) => ({ label, count })),
    otherCount,
  };
}

// ── 블록 11 · 커버리지와 신선도 ──────────────────────────────────────────────

const coverageStateLabels: Record<string, string> = {
  complete: '수집 완료',
  not_applicable: '해당 없음',
  not_collected: '아직 수집되지 않음',
  source_unavailable: '출처에 닿지 못함',
};

export type CoverageView = {
  healthyCount: number;
  observationCount: number;
  byState: Array<{ label: string; count: number }>;
  otherCount: number;
  latestObservedAt: string | null;
};

export function readCoverage(block: CommonAssetViewBlock): CoverageView {
  const payload = asRecord(block.payload);
  const observations = asArray(payload.observations).map(asRecord);
  const buckets = new Map<string, number>();
  let otherCount = 0;
  let latest: string | null = null;
  for (const observation of observations) {
    const state = typeof observation.state === 'string' ? observation.state.trim() : '';
    const label = coverageStateLabels[state];
    if (label === undefined) otherCount += 1;
    else buckets.set(label, (buckets.get(label) ?? 0) + 1);
    const observedAt = isoInstant(observation.observedAt);
    if (observedAt !== null && (latest === null || observedAt > latest)) latest = observedAt;
  }
  return {
    healthyCount: asCount(payload.healthyCount),
    observationCount: observations.length,
    byState: [...buckets].map(([label, count]) => ({ label, count })),
    otherCount,
    latestObservedAt: latest,
  };
}

// ── 블록 12 · 도출과 릴리스 대장 ─────────────────────────────────────────────

/**
 * **릴리스는 이 블록의 payload 에 없다.** 생산자
 * (`common-asset-view-plan.ts`)가 대문자로 못박아 둔 결정이고 이유도 적혀 있다 —
 * 릴리스 id 는 한 빌드의 모든 패킷에서 같아서 특정 자산에 대한 정보가 0인데,
 * digest 에 넣었더니 소스가 그대로인 세 번의 빌드가 297종목 전부에 대해 서로
 * 다른 패킷 digest 를 만들었다. 항상 움직이는 digest 는 "뭔가 실제로 바뀌었나"
 * 에 답할 수 없고, 그 질문이 digest 의 존재 이유다.
 *
 * 그래서 여기서 `payload.releaseId` 를 찾던 판정은 **구조적으로 항상 거짓**이었고,
 * 화면은 297패킷 전부에 대해 "릴리스: 없습니다" 를 그렸다. 릴리스는 패킷 행에
 * 실려서 이미 오고 있다(`common-asset-view-read-model.ts` 가 `releaseId` 로
 * 싣고 계약이 `z.string().min(1)` 로 강제한다). 부재가 아니라 **거짓 부재**라,
 * 정직한 빈칸을 그리는 이 화면에서 가장 나쁜 종류의 오류였다.
 */
export type DerivationView = {
  derivationCount: number;
  hasSemanticSnapshot: boolean;
};

export function readDerivation(block: CommonAssetViewBlock): DerivationView {
  const payload = asRecord(block.payload);
  return {
    derivationCount: asArray(payload.derivationIds).length,
    hasSemanticSnapshot: typeof payload.semanticSnapshotId === 'string',
  };
}
