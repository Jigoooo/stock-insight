import type { K4InformationSetInput } from './k4-market-intelligence-plan.ts';

/**
 * 블록 7 — 밸류에이션 밴드.
 *
 * # 무엇을 내놓고 무엇을 내놓지 않는가
 *
 * 이 생산자는 **배수(multiple)의 밴드**만 만든다. 주당 가격 범위는 만들지 않는다.
 * `analytics.valuation_estimate_revision` 이 점추정 컬럼 없이 `lower_estimate` ·
 * `upper_estimate` 만 갖는 것은 정본 05 §6 의 false precision 금지를 스키마로 굳힌
 * 것이고, 여기서 한 걸음 더 간다: **단위가 `ratio` 다.** 통화 단위의 주당 밴드는
 * 아무리 문구를 고쳐 써도 화면에서 목표주가 구간으로 읽힌다. 배수 밴드는
 * "이 종목은 자기 이력에서 장부가의 0.8~1.4배로 거래돼 왔다" 는 **관측 서술**이고,
 * 그것이 CLAUDE.md 의 제품 경계가 허용하는 문장이다.
 *
 * 같은 이유로 `metadata` 에 밴드×현재 BVPS 같은 **함의 가격은 절대 싣지 않는다.**
 * 그것을 실으면 단위를 비율로 고른 이유가 통째로 무너진다. 독자가 현재 위치를
 * 가늠할 재료로는 **현재 배수**만 싣는다.
 *
 * # 밴드는 평균±σ 가 아니라 자기 이력의 p25–p75 다
 *
 * 평균은 중심을 주장하고, 중심은 목표로 읽힌다. 백분위는 중심을 주장하지 않고
 * "관측의 절반이 이 사이에 있었다" 만 말한다. 그래서 이건 문구 선택이 아니라
 * 계산 방식의 선택이다.
 *
 * # 최소 표본
 *
 * 관측 5개(연 1개씩, 즉 5개 회계연도) 미만이면 **아무것도 내놓지 않는다.**
 * prior model 의 `≥3 관측` 규칙과 같은 모양이다 — 표본이 얕은 밴드는 넓은 밴드가
 * 아니라 **밴드가 아닌 것**이다. 실제 표본 수는 `metadata.observation_count` 로
 * 항상 함께 나간다: 관측 5개짜리 밴드와 12개짜리 밴드는 구별돼야 한다.
 */

/**
 * v1 → v2 는 **분할조정 정정**이다. v1 은 소급조정된 종가를 미조정 주식수와 곱했다.
 * 두 세대가 원장에 함께 남으므로 이 문자열이 어느 쪽인지 가르는 유일한 표식이다.
 */
export const K4_VALUATION_BAND_VERSION = 'k4.valuation-band.v2';

/** 5개 회계연도. 이보다 얕으면 밴드를 만들지 않는다. */
export const K4_VALUATION_BAND_MINIMUM_OBSERVATIONS = 5;

export const K4_VALUATION_BAND_LOWER_PERCENTILE = 0.25;
export const K4_VALUATION_BAND_UPPER_PERCENTILE = 0.75;

/**
 * 관측일 종가를 찾을 때 뒤로 볼 수 있는 최대 일수.
 *
 * 회계 기말(12/31 등)은 거의 항상 휴장일이므로 그날 종가는 없다. 10 영업일이 아니라
 * 10 **역일**이며, 앞으로는 한 칸도 보지 않는다 — 기말 이후의 가격을 쓰면 그 관측이
 * 미래를 본다.
 */
export const K4_VALUATION_BAND_PRICE_LOOKBACK_DAYS = 10;

/** prior model 과 같은 PIT 등급 게이트. 재구성 불가한 출처는 밴드에 들어가지 않는다. */
const ACCEPTED_PIT_CLASSES = new Set([
  'PIT_A_NATIVE_VINTAGE',
  'PIT_B_VERSIONED_ARTIFACT',
  'PIT_C_OUR_ARCHIVE',
]);

export type K4ValuationMultipleKey = 'price_to_book' | 'price_to_earnings';

export type K4ValuationConceptRole = 'shares' | 'book' | 'earnings';

export type K4ValuationConcept = {
  role: K4ValuationConceptRole;
  conceptNamespace: string;
  conceptKey: string;
};

/**
 * 읽을 개념. 이름 매칭이나 정규식이 아니라 **명시 목록**인 이유: 새 개념이 조용히
 * 시계열에 섞여 들어오면 밴드의 분모가 해마다 다른 것을 재게 되고, 그 오염은
 * 결과값만 보고는 절대 안 보인다.
 *
 * 목록 안의 순서는 동점일 때의 우선순위일 뿐이다. 실제 선택은 아래
 * `chooseConcept` 가 **관측 연도 수가 가장 많은 개념 하나**로 정하고, 그 개념
 * 하나만으로 시계열 전체를 만든다.
 */
export const K4_VALUATION_CONCEPTS: readonly K4ValuationConcept[] = [
  { role: 'shares', conceptNamespace: 'dei', conceptKey: 'EntityCommonStockSharesOutstanding' },
  { role: 'shares', conceptNamespace: 'us-gaap', conceptKey: 'CommonStockSharesOutstanding' },
  {
    role: 'shares',
    conceptNamespace: 'us-gaap',
    conceptKey: 'WeightedAverageNumberOfSharesOutstandingBasic',
  },
  {
    role: 'shares',
    conceptNamespace: 'us-gaap',
    conceptKey: 'WeightedAverageNumberOfDilutedSharesOutstanding',
  },
  { role: 'book', conceptNamespace: 'us-gaap', conceptKey: 'StockholdersEquity' },
  { role: 'book', conceptNamespace: 'ifrs-full', conceptKey: 'Equity' },
  {
    role: 'earnings',
    conceptNamespace: 'ifrs-full',
    conceptKey: 'ProfitLossAttributableToOwnersOfParent',
  },
  { role: 'earnings', conceptNamespace: 'us-gaap', conceptKey: 'NetIncomeLoss' },
  { role: 'earnings', conceptNamespace: 'ifrs-full', conceptKey: 'ProfitLoss' },
];

export const K4_VALUATION_CONCEPT_KEYS: readonly string[] = [
  ...new Set(K4_VALUATION_CONCEPTS.map((concept) => concept.conceptKey)),
];

const MULTIPLE_OF_ROLE: Record<'book' | 'earnings', K4ValuationMultipleKey> = {
  book: 'price_to_book',
  earnings: 'price_to_earnings',
};

export const K4_VALUATION_METHOD_KEYS: Record<K4ValuationMultipleKey, string> = {
  price_to_book: 'own_history_pbr_band',
  price_to_earnings: 'own_history_per_band',
};

/**
 * `horizon` 은 NOT NULL 이고 DB 는 길이만 본다. 예보 지평이 아니라 **표본 창**을
 * 이름으로 말한다 — 이 밴드는 앞을 보지 않는다는 것이 이 컬럼이 전달할 수 있는
 * 가장 중요한 사실이기 때문이다.
 */
export const K4_VALUATION_BAND_HORIZON = 'trailing_annual_history';

export const K4_VALUATION_BAND_ESTIMATE_UNIT = 'ratio';

export type K4ValuationBandFact = {
  numericFactId: number;
  entityId: number;
  conceptNamespace: string;
  conceptKey: string;
  /** `value * 10^scale_power` 를 이미 적용한 값. */
  value: number;
  unit: string;
  currency: string | null;
  /** `coalesce(instant_at::date, period_end)`. 개념마다 시간 컬럼이 다르다. */
  observationDate: string;
  /** duration 팩트만 채워진다. instant 는 `null`. */
  periodDays: number | null;
  hasDimensionMember: boolean;
  pitClass: string;
  availableAt: string;
  knownAt: string;
};

export type K4ValuationBandSecurity = {
  securityEntityId: number;
  issuerEntityId: number | null;
  market: string;
  ticker: string;
  /** 상장 통화. 팩트 통화와 다르면 배수에서 통화가 약분되지 않는다. */
  currency: string | null;
  playbookKey: string | null;
  /** 플레이북이 선언한 밸류에이션 방법 키. 이 생산자가 구현한 것은 하나도 없다. */
  declaredValuationMethods: readonly string[];
};

export type K4ValuationBandPrice = {
  securityEntityId: number;
  /** 요청한 관측일. 세션일과 다를 수 있다(기말이 휴장일인 경우). */
  observationDate: string;
  sessionDate: string;
  close: number;
};

/**
 * `market.corporate_action` 의 `action_type='split'` 한 행. `ratio` 는 new/old 다
 * (10:1 액면분할 = 10, 1:20 병합 = 0.05).
 */
export type K4ValuationSplit = {
  securityEntityId: number;
  /** 권리락일. 이 날짜의 바는 **이미 분할 후** 가격이다(실측: NVDA 2024-06-10). */
  effectiveDate: string;
  ratio: number;
};

export type K4ValuationBandObservation = {
  fiscalYear: number;
  observationDate: string;
  /** 분모(장부가 또는 이익)의 주당 값. 통화 단위. */
  perShareValue: number;
  currency: string;
  sharesNumericFactId: number;
  denominatorNumericFactId: number;
  /** 주식수 관측일. 분모 관측일과 다를 수 있다(dei 표지 주식수는 제출일 기준). */
  sharesObservationDate: string;
  /** 보고 주식수에 곱해 오늘 기준으로 옮기는 누적 분할계수. 분할이 없으면 1. */
  splitAdjustmentFactor: number;
};

/** (증권 × 배수) 하나의 시계열. 가격이 붙기 전 단계다. */
export type K4ValuationBandSeries = {
  securityEntityId: number;
  issuerEntityId: number;
  multipleKey: K4ValuationMultipleKey;
  sharesConcept: K4ValuationConcept;
  denominatorConcept: K4ValuationConcept;
  observations: K4ValuationBandObservation[];
  /** 왜 관측이 줄었는지. 조용한 감소는 "원래 없었다" 로 읽힌다. */
  drops: {
    nonPositiveShares: number;
    nonPositiveDenominator: number;
    currencyMismatch: number;
    ambiguousValue: number;
  };
};

export type K4ValuationBandPlan = {
  valuationEstimateKey: string;
  derivationKey: string;
  securityEntityId: number;
  multipleKey: K4ValuationMultipleKey;
  methodKey: string;
  lowerEstimate: number;
  upperEstimate: number;
  estimateUnit: string;
  horizon: string;
  asOfAt: string;
  observationCount: number;
  numericFactInputs: { numericFactId: number; role: string }[];
  parameters: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type K4ValuationBandSkipReason =
  | 'no_issuer'
  | 'no_listing_currency'
  | 'no_eligible_concept'
  | 'insufficient_observations';

export type K4ValuationBandSkip = {
  securityEntityId: number;
  multipleKey: K4ValuationMultipleKey | null;
  reason: K4ValuationBandSkipReason;
  observationCount: number;
};

export type K4ValuationBandPlanResult = {
  plans: K4ValuationBandPlan[];
  skips: K4ValuationBandSkip[];
};

function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`${label} must be a parseable timestamp`);
  return parsed;
}

/**
 * R type 7 / numpy 기본과 같은 선형보간 백분위.
 *
 * 보간을 쓰는 이유는 정밀해서가 아니라 **결정적**이어서다. "가장 가까운 관측"
 * 방식은 표본 하나가 들어오고 나갈 때 밴드가 계단처럼 튄다.
 */
export function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) throw new Error('percentile requires at least one observation');
  if (fraction < 0 || fraction > 1) throw new Error('percentile fraction must be within [0,1]');
  const rank = (sorted.length - 1) * fraction;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const low = sorted[lower]!;
  if (lower === upper) return low;
  return low + (rank - lower) * (sorted[upper]! - low);
}

/** `annual` 은 330~400일 duration. 그 밖의 duration(분기·반기·누적)은 연간이 아니다. */
function factShape(fact: K4ValuationBandFact): 'instant' | 'annual' | 'other' {
  if (fact.periodDays === null) return 'instant';
  return fact.periodDays >= 330 && fact.periodDays <= 400 ? 'annual' : 'other';
}

function isEligibleFact(fact: K4ValuationBandFact, informationSet: K4InformationSetInput): boolean {
  return (
    ACCEPTED_PIT_CLASSES.has(fact.pitClass) &&
    // 차원 멤버는 총계가 아니다. 라이브 실측(2026-08-12): 삼성전자 2025-12-31 의
    // `ifrs-full:Equity` 는 자본총계 436조 옆에 자본금 8,975억 · 이익잉여금 402조 같은
    // 구성요소 행을 함께 갖는다. 걸러내지 않으면 PBR 이 500배로 나오고도 모든 CHECK 를
    // 통과한다.
    !fact.hasDimensionMember &&
    factShape(fact) !== 'other' &&
    timestamp(fact.availableAt, 'fact.availableAt') <=
      timestamp(informationSet.sourceAvailableCutoff, 'sourceAvailableCutoff') &&
    timestamp(fact.knownAt, 'fact.knownAt') <=
      timestamp(informationSet.systemKnownCutoff, 'systemKnownCutoff')
  );
}

function fiscalYearOf(observationDate: string): number {
  const year = Number(observationDate.slice(0, 4));
  if (!Number.isInteger(year)) throw new Error(`unparseable observation date ${observationDate}`);
  return year;
}

type YearPick = { fact: K4ValuationBandFact; ambiguous: boolean };

/**
 * 한 개념의 연도별 관측 하나.
 *
 * 같은 (주체, 개념, 관측일) 에 **서로 다른 값**이 남아 있으면 그 관측은 버린다.
 * 라이브 실측(2026-08-12): 차원 필터 뒤에도 12,298 쌍 중 415 쌍(3.4%)이 그렇다.
 * 어느 쪽이 맞는지 이 코드는 알 수 없고, 골라 쓰면 그 추측이 밴드에 영구히 박힌다.
 */
function pickByYear(facts: readonly K4ValuationBandFact[]): Map<number, YearPick> {
  const byDate = new Map<string, K4ValuationBandFact[]>();
  for (const fact of facts) {
    const bucket = byDate.get(fact.observationDate);
    if (bucket) bucket.push(fact);
    else byDate.set(fact.observationDate, [fact]);
  }
  const byYear = new Map<number, YearPick>();
  for (const [observationDate, bucket] of [...byDate.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const year = fiscalYearOf(observationDate);
    const ambiguous = new Set(bucket.map((fact) => fact.value)).size > 1;
    // 연도 안에서는 가장 늦은 관측일이 이긴다. 같은 날짜의 동일 값 중복은
    // numeric_fact_id 로 결정적으로 고른다.
    const chosen = [...bucket].sort((a, b) => a.numericFactId - b.numericFactId)[0]!;
    const existing = byYear.get(year);
    if (!existing || existing.fact.observationDate <= observationDate) {
      byYear.set(year, { fact: chosen, ambiguous });
    }
  }
  return byYear;
}

/**
 * 역할마다 개념 **하나**를 고른다 — 관측 연도가 가장 많은 것, 동점이면
 * `K4_VALUATION_CONCEPTS` 의 순서.
 *
 * 연도마다 다른 개념을 쓰면 배수 시계열의 분모가 해마다 다른 것을 재게 된다.
 * 밴드는 그 오염을 평균 내서 감춘다.
 */
function chooseConcept(
  factsByConcept: Map<string, { concept: K4ValuationConcept; byYear: Map<number, YearPick> }>,
  role: K4ValuationConceptRole,
): { concept: K4ValuationConcept; byYear: Map<number, YearPick> } | null {
  let best: { concept: K4ValuationConcept; byYear: Map<number, YearPick> } | null = null;
  for (const concept of K4_VALUATION_CONCEPTS) {
    if (concept.role !== role) continue;
    const entry = factsByConcept.get(`${concept.conceptNamespace}:${concept.conceptKey}`);
    if (!entry || entry.byYear.size === 0) continue;
    if (!best || entry.byYear.size > best.byYear.size) best = entry;
  }
  return best;
}

export type K4ValuationBandInput = {
  informationSet: K4InformationSetInput;
  securities: readonly K4ValuationBandSecurity[];
  facts: readonly K4ValuationBandFact[];
  splits?: readonly K4ValuationSplit[];
};

/**
 * 관측일의 보고 주식수를 **오늘 기준**으로 옮기는 누적 분할계수.
 *
 * # 왜 필요한가
 *
 * `market_ts.ohlcv.close` 는 소급 분할조정된 값이다. 실측(2026-08-12):
 * `adj_close` 는 305,906 행 전부 NULL 이고, NVDA 2021-12-31 `close` 는 29.41 —
 * 실제 종가 294.11 을 2024-06-10 의 10:1 분할로 나눈 값이다. TSLA 2021-12-31 은
 * 352.26 = 1056.78 / 3(2022-08-25). 분할일 전후로 계열이 끊기지 않는 것도 확인했다.
 *
 * 그 가격을 **그 시점 보고 주식수**와 곱하면 시가총액이 분할계수만큼 틀린다.
 * 정방향 분할은 과소, 역방향(주식병합)은 과대로 나오는데, 과소 쪽은 "그럴듯한 범위"
 * 에 착지하므로 결과값만 봐서는 보이지 않는다.
 *
 * # 항등식
 *
 * 조정 종가의 정의상 `P_adj(s) × S_today = P_actual(s) × S(s)` 이므로,
 * 보고 주식수를 `S_today = S(t) × ∏{ratio : 권리락일 > t}` 로 옮기면
 * `조정종가 × 조정주식수` 가 그 시점의 실제 시가총액이 된다.
 *
 * 경계는 **초과**다: 권리락일 당일 바는 이미 분할 후 가격이므로 그 분할은 곱하지
 * 않는다.
 *
 * # 고칠 수 없는 한 가지
 *
 * 주식수 팩트의 관측일(dei 표지 주식수는 제출일)과 분모 팩트의 기말이 분할을 사이에
 * 두고 갈릴 수 있다. 자본·이익은 분할로 움직이지 않으므로 항등식 자체는 성립하지만,
 * 그 경우 주당값이 며칠어치 어긋난다. 이 생산자는 그것을 보정하지 않는다.
 */
export function k4SplitAdjustmentFactor(
  splits: readonly K4ValuationSplit[],
  observationDate: string,
): number {
  let factor = 1;
  for (const split of splits) {
    if (split.effectiveDate > observationDate) factor *= split.ratio;
  }
  return factor;
}

/**
 * 가격이 붙기 전의 시계열을 만든다. 관측일 목록이 나와야 가격을 조회할 수 있으므로
 * 계획은 두 단계다: 시계열 → 가격 조회 → 밴드.
 */
export function buildK4ValuationSeries(input: K4ValuationBandInput): {
  series: K4ValuationBandSeries[];
  skips: K4ValuationBandSkip[];
} {
  const eligible = input.facts.filter((fact) => isEligibleFact(fact, input.informationSet));
  const factsByIssuer = new Map<number, K4ValuationBandFact[]>();
  for (const fact of eligible) {
    const bucket = factsByIssuer.get(fact.entityId);
    if (bucket) bucket.push(fact);
    else factsByIssuer.set(fact.entityId, [fact]);
  }

  // 분할은 **증권** 단위로 기록되고 팩트는 **발행사** 단위로 기록된다. 두 축을
  // 섞지 않도록 여기서 증권으로 묶는다.
  const splitsBySecurity = new Map<number, K4ValuationSplit[]>();
  for (const split of input.splits ?? []) {
    if (!(split.ratio > 0)) continue;
    const bucket = splitsBySecurity.get(split.securityEntityId);
    if (bucket) bucket.push(split);
    else splitsBySecurity.set(split.securityEntityId, [split]);
  }

  const series: K4ValuationBandSeries[] = [];
  const skips: K4ValuationBandSkip[] = [];
  for (const security of [...input.securities].sort(
    (a, b) => a.securityEntityId - b.securityEntityId,
  )) {
    if (security.issuerEntityId === null) {
      skips.push({
        securityEntityId: security.securityEntityId,
        multipleKey: null,
        reason: 'no_issuer',
        observationCount: 0,
      });
      continue;
    }
    if (!security.currency) {
      skips.push({
        securityEntityId: security.securityEntityId,
        multipleKey: null,
        reason: 'no_listing_currency',
        observationCount: 0,
      });
      continue;
    }
    const issuerFacts = factsByIssuer.get(security.issuerEntityId) ?? [];
    const factsByConcept = new Map<
      string,
      { concept: K4ValuationConcept; byYear: Map<number, YearPick> }
    >();
    for (const concept of K4_VALUATION_CONCEPTS) {
      const conceptKey = `${concept.conceptNamespace}:${concept.conceptKey}`;
      const matching = issuerFacts.filter(
        (fact) =>
          fact.conceptNamespace === concept.conceptNamespace &&
          fact.conceptKey === concept.conceptKey,
      );
      if (matching.length > 0)
        factsByConcept.set(conceptKey, { concept, byYear: pickByYear(matching) });
    }

    const shares = chooseConcept(factsByConcept, 'shares');
    if (!shares) {
      skips.push({
        securityEntityId: security.securityEntityId,
        multipleKey: null,
        reason: 'no_eligible_concept',
        observationCount: 0,
      });
      continue;
    }

    for (const role of ['book', 'earnings'] as const) {
      const multipleKey = MULTIPLE_OF_ROLE[role];
      const denominator = chooseConcept(factsByConcept, role);
      if (!denominator) {
        skips.push({
          securityEntityId: security.securityEntityId,
          multipleKey,
          reason: 'no_eligible_concept',
          observationCount: 0,
        });
        continue;
      }
      const observations: K4ValuationBandObservation[] = [];
      const drops = {
        nonPositiveShares: 0,
        nonPositiveDenominator: 0,
        currencyMismatch: 0,
        ambiguousValue: 0,
      };
      for (const [fiscalYear, denominatorPick] of [...denominator.byYear.entries()].sort(
        (a, b) => a[0] - b[0],
      )) {
        const sharePick = shares.byYear.get(fiscalYear);
        if (!sharePick) continue;
        if (denominatorPick.ambiguous || sharePick.ambiguous) {
          drops.ambiguousValue += 1;
          continue;
        }
        if (!(sharePick.fact.value > 0)) {
          drops.nonPositiveShares += 1;
          continue;
        }
        // 음수 또는 0인 장부가·이익 위의 배수는 산술적으로는 멀쩡하고 경제적으로는
        // 무의미하다. p25–p75 는 그 무의미를 조용히 받아들이므로 여기서 끊는다.
        if (!(denominatorPick.fact.value > 0)) {
          drops.nonPositiveDenominator += 1;
          continue;
        }
        // 통화가 약분돼야 배수가 배수다. 팩트 통화와 상장 통화가 다르면 이 관측은
        // 환율을 곱한 값이 되는데, 이 생산자는 환율을 읽지 않는다.
        if (denominatorPick.fact.currency !== security.currency) {
          drops.currencyMismatch += 1;
          continue;
        }
        // 주식수를 조정 종가와 같은 기준으로 옮긴다. 계수는 **주식수 팩트의**
        // 관측일로 잡는다 — 오늘 기준으로 옮겨야 하는 것이 그 주식수이기 때문이다.
        const splitAdjustmentFactor = k4SplitAdjustmentFactor(
          splitsBySecurity.get(security.securityEntityId) ?? [],
          sharePick.fact.observationDate,
        );
        const adjustedShares = sharePick.fact.value * splitAdjustmentFactor;
        if (!(adjustedShares > 0)) {
          drops.nonPositiveShares += 1;
          continue;
        }
        observations.push({
          fiscalYear,
          observationDate: denominatorPick.fact.observationDate,
          perShareValue: denominatorPick.fact.value / adjustedShares,
          currency: security.currency,
          sharesNumericFactId: sharePick.fact.numericFactId,
          denominatorNumericFactId: denominatorPick.fact.numericFactId,
          sharesObservationDate: sharePick.fact.observationDate,
          splitAdjustmentFactor,
        });
      }
      series.push({
        securityEntityId: security.securityEntityId,
        issuerEntityId: security.issuerEntityId,
        multipleKey,
        sharesConcept: shares.concept,
        denominatorConcept: denominator.concept,
        observations,
        drops,
      });
    }
  }
  return { series, skips };
}

/** 가격을 조회해야 할 (증권, 관측일) 쌍. 중복 없이, 결정적 순서로. */
export function k4ValuationPriceRequests(
  series: readonly K4ValuationBandSeries[],
): { securityEntityId: number; observationDate: string }[] {
  const seen = new Set<string>();
  const requests: { securityEntityId: number; observationDate: string }[] = [];
  for (const entry of series) {
    for (const observation of entry.observations) {
      const key = `${entry.securityEntityId}\u0000${observation.observationDate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      requests.push({
        securityEntityId: entry.securityEntityId,
        observationDate: observation.observationDate,
      });
    }
  }
  return requests.sort(
    (a, b) =>
      a.securityEntityId - b.securityEntityId || a.observationDate.localeCompare(b.observationDate),
  );
}

export type K4ValuationCurrentPrice = {
  securityEntityId: number;
  sessionDate: string;
  close: number;
};

export function planK4ValuationBands(input: {
  informationSet: K4InformationSetInput;
  securities: readonly K4ValuationBandSecurity[];
  series: readonly K4ValuationBandSeries[];
  prices: readonly K4ValuationBandPrice[];
  currentPrices: readonly K4ValuationCurrentPrice[];
}): K4ValuationBandPlanResult {
  const securityById = new Map(
    input.securities.map((security) => [security.securityEntityId, security]),
  );
  const priceByKey = new Map(
    input.prices.map((price) => [`${price.securityEntityId}\u0000${price.observationDate}`, price]),
  );
  const currentBySecurity = new Map(
    input.currentPrices.map((price) => [price.securityEntityId, price]),
  );

  const plans: K4ValuationBandPlan[] = [];
  const skips: K4ValuationBandSkip[] = [];
  for (const entry of input.series) {
    const security = securityById.get(entry.securityEntityId);
    if (!security) continue;
    const priced: {
      observation: K4ValuationBandObservation;
      multiple: number;
      sessionDate: string;
      close: number;
    }[] = [];
    let missingPrice = 0;
    for (const observation of entry.observations) {
      const price = priceByKey.get(`${entry.securityEntityId}\u0000${observation.observationDate}`);
      if (!price || !(price.close > 0)) {
        missingPrice += 1;
        continue;
      }
      priced.push({
        observation,
        multiple: price.close / observation.perShareValue,
        sessionDate: price.sessionDate,
        close: price.close,
      });
    }
    if (priced.length < K4_VALUATION_BAND_MINIMUM_OBSERVATIONS) {
      skips.push({
        securityEntityId: entry.securityEntityId,
        multipleKey: entry.multipleKey,
        reason: 'insufficient_observations',
        observationCount: priced.length,
      });
      continue;
    }
    const sorted = priced.map((row) => row.multiple).sort((a, b) => a - b);
    const lowerEstimate = percentile(sorted, K4_VALUATION_BAND_LOWER_PERCENTILE);
    const upperEstimate = percentile(sorted, K4_VALUATION_BAND_UPPER_PERCENTILE);
    const methodKey = K4_VALUATION_METHOD_KEYS[entry.multipleKey];
    const years = priced.map((row) => row.observation.fiscalYear).sort((a, b) => a - b);
    const current = currentBySecurity.get(entry.securityEntityId);
    const latest = priced[priced.length - 1]!;
    // **현재 배수만** 싣는다. 밴드×현재 주당장부가 같은 함의 가격은 싣지 않는다 —
    // 그것을 실으면 단위를 `ratio` 로 고른 이유가 무너진다.
    const currentMultiple =
      current && current.close > 0 ? current.close / latest.observation.perShareValue : null;

    plans.push({
      valuationEstimateKey: `k4:valuation:${input.informationSet.informationSetId}:${entry.securityEntityId}:${methodKey}`,
      derivationKey: `k4:valuation-band:${input.informationSet.informationSetId}:${entry.securityEntityId}:${methodKey}`,
      securityEntityId: entry.securityEntityId,
      multipleKey: entry.multipleKey,
      methodKey,
      lowerEstimate,
      upperEstimate,
      estimateUnit: K4_VALUATION_BAND_ESTIMATE_UNIT,
      horizon: K4_VALUATION_BAND_HORIZON,
      asOfAt: input.informationSet.validCutoff,
      observationCount: priced.length,
      numericFactInputs: [
        ...priced.map((row) => ({
          numericFactId: row.observation.denominatorNumericFactId,
          role: `${entry.multipleKey}:denominator:${row.observation.fiscalYear}`,
        })),
        ...priced.map((row) => ({
          numericFactId: row.observation.sharesNumericFactId,
          role: `${entry.multipleKey}:shares:${row.observation.fiscalYear}`,
        })),
      ],
      parameters: {
        band_method: 'own_history_percentile',
        lower_percentile: K4_VALUATION_BAND_LOWER_PERCENTILE,
        upper_percentile: K4_VALUATION_BAND_UPPER_PERCENTILE,
        minimum_observations: K4_VALUATION_BAND_MINIMUM_OBSERVATIONS,
        price_lookback_days: K4_VALUATION_BAND_PRICE_LOOKBACK_DAYS,
        producer_version: K4_VALUATION_BAND_VERSION,
        // 주식수 기준. 조정 종가와 짝지으려면 보고 주식수를 오늘 기준으로 옮겨야
        // 한다. 이 문자열이 없는 계보는 v1 의 미조정 주식수 계보다.
        share_basis: 'split_adjusted_to_price_basis',
        price_sessions: priced.map((row) => ({
          fiscal_year: row.observation.fiscalYear,
          observation_date: row.observation.observationDate,
          session_date: row.sessionDate,
          shares_observation_date: row.observation.sharesObservationDate,
          split_adjustment_factor: row.observation.splitAdjustmentFactor,
        })),
      },
      metadata: {
        // 밴드가 무엇인지 — 문구가 아니라 계산 방식으로.
        band_method: 'own_history_percentile_p25_p75',
        multiple: entry.multipleKey,
        estimate_is_multiple_not_price: true,
        observation_count: priced.length,
        sample_window: { from_fiscal_year: years[0]!, to_fiscal_year: years[years.length - 1]! },
        observation_fiscal_years: years,
        shares_concept: `${entry.sharesConcept.conceptNamespace}:${entry.sharesConcept.conceptKey}`,
        denominator_concept: `${entry.denominatorConcept.conceptNamespace}:${entry.denominatorConcept.conceptKey}`,
        currency_of_inputs: latest.observation.currency,
        producer_version: K4_VALUATION_BAND_VERSION,
        // 분할조정이 실제로 무엇을 움직였는지. 0 이면 이 종목은 관측창 안에서
        // 분할이 없었고 v1 값과 같아야 한다 — 그것이 정정의 검증 지점이다.
        split_adjusted_observation_count: priced.filter(
          (row) => row.observation.splitAdjustmentFactor !== 1,
        ).length,
        current_multiple: currentMultiple,
        current_price_session_date: current?.sessionDate ?? null,
        dropped_observations: { ...entry.drops, missingPrice },
        // 플레이북이 선언한 방법 중 이 생산자가 구현한 것은 하나도 없다. 그 사실을
        // 감추지 않고 payload 에 실어서, "밴드가 있다" 가 "플레이북대로 평가했다" 로
        // 읽히지 않게 한다.
        playbook_key: security.playbookKey,
        playbook_declared_valuation_methods: [...security.declaredValuationMethods],
        implements_playbook_method: false,
      },
    });
  }
  plans.sort(
    (a, b) => a.securityEntityId - b.securityEntityId || a.methodKey.localeCompare(b.methodKey),
  );
  return { plans, skips };
}
