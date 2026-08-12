/**
 * Market Home 의 거시 상태 — 정본 01 §2 가 요구하는 **금리·FX·원자재·정책** 네 축.
 *
 * 화면은 이 자리에 `sampleMarketIndicators`(KOSPI·NASDAQ·금) 를 그리고 있었다.
 * 그 값들은 우리가 수집하지 않는 것이고, 정본이 요구한 축도 아니다. 대신 실제로
 * 수집되고 있는 것이 정본 네 축과 정확히 겹친다 — `market.macro_vintage` 21계열
 * 77,248관측, `analytics.macro_series_topic` 이 그중 20계열에 topic 과 한국어
 * 이름까지 붙여 뒀고, `stock_insight_app_reader` 에 SELECT 도 이미 열려 있다.
 * 만들 것은 수집기가 아니라 배선이었다.
 *
 * ## 표시 행을 코드가 고정한다
 *
 * 레지스트리 20행을 그대로 그리지 않는다. 화면 한 자리에 20행을 쏟으면 읽는
 * 사람이 무엇을 먼저 봐야 하는지 알 수 없고, 레지스트리에 행이 하나 늘 때마다
 * 화면 구성이 말없이 바뀐다. 정본이 네 축을 요구했으므로 **축을 덮는 최소 집합**을
 * 코드가 고른다.
 *
 * ## 신선도를 단일 임계로 재지 않는다
 *
 * 계열마다 발표 주기가 다르다. 실측(2026-08-12): FX·미국채는 5일 전, ECOS 는
 * 6일 전, WTI 는 9일 전이 최신이다. 하나의 "N일 지나면 stale" 규칙을 쓰면 발표
 * 주기가 긴 계열이 영원히 stale 로 보이거나, 짧은 계열의 지연을 놓친다.
 *
 * 특히 **기준금리는 stale 판정을 하지 않는다.** 금통위가 열리기 전까지 직전 결정이
 * 유효한 값이고, "3개월 전 값이라 오래됐다" 는 서술은 사실이 아니다. cadence 를
 * 행마다 들고 그에 맞게 판정한다.
 */

export type MarketIndicator = {
  key: string;
  label: string;
  /** 사람이 읽는 값. 단위까지 포함한 완성형 문자열. */
  value: string;
  /** 직전 관측 대비 변화. 계산할 수 없으면 `null`. */
  changeLabel: string | null;
  direction: 'up' | 'down' | 'flat' | null;
  availability: 'available' | 'stale' | 'missing';
  observedOn: string | null;
  /** 무엇을 근거로 이 값을 말하는가. 자격이 있으면 함께 적는다. */
  basisLabel: string;
};

type Cadence = 'business_daily' | 'monthly' | 'policy_meeting';

type IndicatorSpec = {
  key: string;
  seriesKey: string;
  /** 소수 자리와 단위. 계열마다 다르고, 단위 없는 숫자는 읽을 수 없다. */
  format: (value: number) => string;
  cadence: Cadence;
};

/**
 * 정본 §2 네 축 × 최소 집합. 라벨은 `analytics.macro_series_topic.display_name` 에서
 * 오므로 여기서 다시 적지 않는다 — 같은 계열을 두 곳에서 다르게 부르지 않는다.
 */
const INDICATOR_SPECS: readonly IndicatorSpec[] = [
  {
    key: 'us-10y',
    seriesKey: 'fred:DGS10',
    format: (value) => `${value.toFixed(2)}%`,
    cadence: 'business_daily',
  },
  {
    key: 'kr-10y',
    seriesKey: 'ecos:817Y002:010210000',
    format: (value) => `${value.toFixed(3)}%`,
    cadence: 'business_daily',
  },
  {
    key: 'usd-krw',
    seriesKey: 'fred:DEXKOUS',
    format: (value) => `${value.toFixed(2)}원`,
    cadence: 'business_daily',
  },
  {
    key: 'wti',
    seriesKey: 'fred:DCOILWTICO',
    format: (value) => `$${value.toFixed(2)}`,
    cadence: 'business_daily',
  },
  {
    key: 'natural-gas',
    seriesKey: 'fred:DHHNGSP',
    format: (value) => `$${value.toFixed(2)}`,
    cadence: 'business_daily',
  },
  {
    key: 'kr-policy-rate',
    seriesKey: 'ecos:722Y001:0101000',
    format: (value) => `${value.toFixed(2)}%`,
    cadence: 'policy_meeting',
  },
];

/**
 * 계열마다 최신 두 관측을 가져온다. 둘째가 변화 계산에 쓰인다.
 *
 * `vintage_date <= $1` 이 PIT 다. 오늘 아는 값으로 어제 화면을 다시 그리면 그
 * 화면이 무엇을 보고 있었는지 재현할 수 없다.
 */
const MACRO_SQL = `
  SELECT topic.series_key,
         topic.display_name,
         observation.observation_date,
         observation.value,
         observation.vintage_quality,
         observation.rn
    FROM analytics.macro_series_topic topic
    JOIN LATERAL (
      SELECT vintage.observation_date, vintage.value, vintage.vintage_quality,
             row_number() OVER (ORDER BY vintage.observation_date DESC, vintage.vintage_date DESC) AS rn
        FROM market.macro_vintage vintage
       WHERE vintage.series_key = topic.series_key
         AND vintage.vintage_date <= $1::date
       ORDER BY vintage.observation_date DESC, vintage.vintage_date DESC
       LIMIT 2
    ) observation ON true
   WHERE topic.active
     AND topic.series_key = ANY($2::text[])
`;

type MacroRow = {
  series_key: string;
  display_name: string;
  observation_date: string | Date;
  value: string | number;
  vintage_quality: string;
  rn: string | number;
};

export type MacroRowQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

/**
 * `date` 컬럼은 pg 가 **로컬 시간대 Date** 로 준다. 여기에 `toISOString()` 을 쓰면
 * KST 자정이 전날 15:00Z 가 되어 관측일이 하루 뒤로 밀린다. 실측으로 잡았다 —
 * 값은 08-07 것인데 날짜가 08-06 으로 나왔고, 그 하루가 신선도 판정까지
 * stale 로 뒤집었다. 날짜는 시각이 아니므로 시간대를 태우지 않는다.
 */
function toDay(value: string | Date): string {
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 발표 주기별 신선도.
 *
 * `policy_meeting` 은 판정하지 않는다 — 기준금리는 다음 회의까지 유효한 값이고,
 * 오래됐다고 적는 것은 사실이 아니다.
 */
function freshnessFor(cadence: Cadence, observedOn: string, asOf: Date): 'available' | 'stale' {
  if (cadence === 'policy_meeting') return 'available';
  // 관측일과 기준일 **둘 다 날짜로** 비교한다. 한쪽만 시각이면 시간대가 하루를 만든다.
  const asOfDay = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime();
  const [year = 0, month = 1, day = 1] = observedOn.split('-').map(Number);
  const observedDay = new Date(year, month - 1, day).getTime();
  const days = Math.round((asOfDay - observedDay) / 86_400_000);
  const allowed = cadence === 'business_daily' ? 5 : 45;
  return days <= allowed ? 'available' : 'stale';
}

const qualityLabels: Record<string, string> = {
  realtime: '발표 시점 그대로 기록된 값',
  approx_collected: '수집 시점 기준으로 기록된 값이라 발표 시각과 다를 수 있음',
};

export async function getMarketIndicators(
  executor: MacroRowQueryExecutor,
  options: { now?: Date } = {},
): Promise<MarketIndicator[]> {
  const now = options.now ?? new Date();
  const rows = await executor.queryRows<MacroRow>(MACRO_SQL, [
    now.toISOString().slice(0, 10),
    INDICATOR_SPECS.map((spec) => spec.seriesKey),
  ]);

  const bySeries = new Map<string, MacroRow[]>();
  for (const row of rows) {
    bySeries.set(row.series_key, [...(bySeries.get(row.series_key) ?? []), row]);
  }

  return INDICATOR_SPECS.map((spec) => {
    const observations = (bySeries.get(spec.seriesKey) ?? []).sort(
      (left, right) => Number(left.rn) - Number(right.rn),
    );
    const latest = observations[0];
    if (!latest) {
      // 레지스트리에는 있는데 관측이 없다. 값을 지어내는 대신 그 사실을 적는다.
      return {
        key: spec.key,
        label: spec.seriesKey,
        value: '—',
        changeLabel: null,
        direction: null,
        availability: 'missing' as const,
        observedOn: null,
        basisLabel: '이 지표의 관측이 아직 수집되지 않았습니다.',
      };
    }

    const observedOn = toDay(latest.observation_date);
    const current = Number(latest.value);
    const previous = observations[1] ? Number(observations[1].value) : null;
    const delta = previous === null || !Number.isFinite(previous) ? null : current - previous;

    return {
      key: spec.key,
      label: latest.display_name,
      value: Number.isFinite(current) ? spec.format(current) : '—',
      // 변화는 **직전 관측 대비**다. 하루 전이 아닐 수 있으므로 기간을 주장하지 않는다.
      changeLabel:
        delta === null ? null : `${delta > 0 ? '+' : ''}${spec.format(delta).replace('$', '')}`,
      direction: delta === null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
      availability: freshnessFor(spec.cadence, observedOn, now),
      observedOn,
      basisLabel:
        spec.cadence === 'policy_meeting'
          ? `${observedOn} 결정, 다음 회의까지 유효`
          : `${observedOn} 관측 · ${qualityLabels[latest.vintage_quality] ?? latest.vintage_quality}`,
    };
  });
}
