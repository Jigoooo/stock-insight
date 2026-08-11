import type { K4InformationSetInput } from './k4-market-intelligence-plan.ts';
import {
  K4_SEMANTIC_SNAPSHOT_SQL,
  k4InformationSetId,
  type K4QueryClient,
} from './k4-market-intelligence-store.ts';
import {
  K4_VALUATION_BAND_PRICE_LOOKBACK_DAYS,
  K4_VALUATION_CONCEPT_KEYS,
  type K4ValuationBandFact,
  type K4ValuationBandPrice,
  type K4ValuationBandSecurity,
  type K4ValuationCurrentPrice,
  type K4ValuationSplit,
} from './k4-valuation-band.ts';

/**
 * 상장 종목과 그 발행사, 상장 통화, 그리고 플레이북이 **선언한** 밸류에이션 방법.
 *
 * `governance.entity_playbook_current_v1` 은 `stock_insight_app_reader` 에 GRANT 가
 * 없다. 이 잡은 파이프라인 롤(`research_app`)로 돌기 때문에 읽을 수 있고, 실측으로
 * 확인했다(2026-08-12: reader=false, research_app=true). GRANT 는 추가하지 않는다 —
 * 카탈로그 digest 재핀이 따라온다.
 *
 * 방법 목록은 **쓰이지 않고 기록만 된다.** 이 생산자는 `ev_sales_cycle_adjusted` 도
 * `dcf_with_cycle` 도 구현하지 않는다. metadata 에 함께 실어서 "밴드가 있다" 가
 * "플레이북대로 평가했다" 로 읽히지 않게 하는 것이 목적이다.
 */
const SECURITY_SQL = `
/* k4_valuation_band_securities */
SELECT security.security_entity_id,
       security.market,
       security.ticker,
       security.currency,
       identity.issuer_entity_id,
       playbook.playbook_key,
       playbook.valuation_methods
  FROM core.v_security_universe security
  LEFT JOIN LATERAL (
    SELECT candidate.issuer_entity_id
      FROM core.security_issuer_identity candidate
     WHERE candidate.security_entity_id=security.security_entity_id
       AND candidate.valid_from <= $1::timestamptz
       AND candidate.known_from <= $1::timestamptz
     ORDER BY candidate.known_from DESC, candidate.valid_from DESC,
              candidate.security_issuer_identity_id DESC
     LIMIT 1
  ) identity ON true
  LEFT JOIN governance.entity_playbook_current_v1 playbook
    ON playbook.entity_id=identity.issuer_entity_id
 ORDER BY security.security_entity_id
`;

/**
 * 팩트 읽기. `k4_numeric_facts` 와 같은 모양이다 — PIT 등급을 함께 실어 오고,
 * `available_at`/`known_at` 를 컷오프로 자른다.
 *
 * `supersedes_numeric_fact_id IS NULL` 로 자르지 **않는다.** 그 조건은 리비전 1을
 * 고르는 것이지 최신을 고르는 것이 아니다(블록 3 이 그 모양을 쓰지만 그건 다른
 * 주장이다). 여기서는 컷오프까지 알려진 것을 전부 실어 오고, 같은 관측일에 서로 다른
 * 값이 남으면 플래너가 그 관측을 통째로 버린다.
 *
 * 시간 컬럼이 개념마다 다르다는 것이 이 쿼리의 핵심이다. 주식수 개념들과
 * `StockholdersEquity` 는 `fiscal_year` 가 전부 0 이고 `period_end`/`instant_at` 에만
 * 값이 있다. `fiscal_year` 로 세면 0행이 나온다.
 */
const FACT_SQL = `
/* k4_valuation_band_facts */
SELECT fact.numeric_fact_id, fact.entity_id, fact.concept_namespace, fact.concept_key,
       (fact.value * power(10::numeric, fact.scale_power))::text AS value,
       fact.unit, fact.currency,
       coalesce((fact.instant_at AT TIME ZONE 'UTC')::date, fact.period_end)::text
         AS observation_date,
       CASE WHEN fact.instant_at IS NOT NULL OR fact.period_start IS NULL THEN NULL
            ELSE (fact.period_end - fact.period_start) END AS period_days,
       (fact.dimensions_json ? 'accountDetail') AS has_dimension_member,
       CASE WHEN quality.pit_quality_class='PIT_C_OUR_ARCHIVE'
                  AND quality.archive_pit_from > fact.known_at
            THEN 'PIT_E_UNKNOWN' ELSE quality.pit_quality_class END AS pit_quality_class,
       fact.available_at, fact.known_at
  FROM world.numeric_fact fact
  JOIN ingestion.source_revision revision
    ON revision.source_revision_id=fact.source_revision_id
  JOIN ingestion.source_record_identity source_identity
    ON source_identity.source_record_identity_id=revision.source_record_identity_id
  JOIN LATERAL (
    SELECT candidate.*
      FROM governance.source_pit_quality candidate
     WHERE candidate.source_id=source_identity.source_id
       AND candidate.known_at <= $1::timestamptz
     ORDER BY candidate.revision_no DESC
     LIMIT 1
  ) quality ON true
 WHERE fact.entity_id=ANY($2::bigint[])
   AND fact.concept_key=ANY($3::text[])
   AND fact.available_at <= $1::timestamptz
   AND fact.known_at <= $1::timestamptz
   AND coalesce((fact.instant_at AT TIME ZONE 'UTC')::date, fact.period_end) IS NOT NULL
 ORDER BY fact.entity_id, fact.concept_namespace, fact.concept_key,
          coalesce((fact.instant_at AT TIME ZONE 'UTC')::date, fact.period_end),
          fact.numeric_fact_id
`;

/**
 * 관측일마다의 종가.
 *
 * `timeframe='1D'` 는 **대문자**다. `'1d'` 는 0행을 반환한다(실측).
 *
 * `adj_close` 가 아니라 `close` 를 쓴다 — **`adj_close` 가 비어 있기 때문이다.**
 *
 * 2026-08-12 정정 — 여기 있던 "close 는 조정 안 된 종가이고 adj_close 를 쓰면 분할을
 * 두 번 반영한다" 는 **두 문장 다 라이브가 반증한다.** 실측: `market_ts.ohlcv`
 * (timeframe='1D') 305,906 행 중 `adj_close` 가 채워진 행은 **0** 이고, `close` 는
 * 이미 소급 분할조정돼 있다 — NVDA 2021-12-31 close 29.41 = 실제 종가 294.11 ÷ 10
 * (2024-06-10 분할), TSLA 352.26 = 1056.78 ÷ 3(2022-08-25). 2020년 이후 무분할인
 * AAPL 만 실제 종가와 일치한다.
 *
 * 그래서 짝지을 주식수는 "그 시점에 보고된 주식수" 가 **아니라** 그것을 오늘 기준으로
 * 옮긴 값이다. 그 변환은 아래 `SPLIT_SQL` 과 `k4SplitAdjustmentFactor` 가 한다.
 * 옛 주석을 그대로 두면 다음 사람이 그 보정을 "분할 이중반영" 으로 읽고 되돌린다.
 *
 * `collected_at <= cutoff` 는 K4 러너와 같은 게이트다. 라이브 실측(2026-08-12):
 * 1D 주식 바 300,858 행의 `collected_at` 이 2026-07-18 ~ 2026-08-10 에 몰려 있다.
 * 즉 2021년 바도 최근에 수집됐고, **컷오프를 과거로 잡은 재현 실행에서는 가격이
 * 통째로 사라진다.** 라이브 컷오프에서는 전부 통과한다. 이 비대칭은 수집 이력의
 * 사실이지 이 쿼리의 결함이 아니며, 감추면 재현 실행이 조용히 빈 밴드를 낸다.
 */
const PRICE_SQL = `
/* k4_valuation_band_prices */
SELECT request.security_entity_id, request.observation_date::text AS observation_date,
       bar.session_date::text AS session_date, bar.close::text AS close
  FROM unnest($2::bigint[], $3::date[])
         AS request(security_entity_id, observation_date)
  JOIN core.v_security_universe security
    ON security.security_entity_id=request.security_entity_id
  JOIN LATERAL (
    SELECT (candidate.ts AT TIME ZONE 'UTC')::date AS session_date, candidate.close
      FROM market_ts.ohlcv candidate
     WHERE candidate.domain='stock' AND candidate.timeframe='1D' AND candidate.close > 0
       AND candidate.collected_at <= $1::timestamptz
       AND security.ticker=regexp_replace(upper(candidate.symbol), '\\.(KS|KQ)$', '')
       AND security.market=CASE WHEN candidate.exchange IN ('KOSPI','KOSDAQ')
                                THEN 'KR' ELSE 'US' END
       AND (candidate.ts AT TIME ZONE 'UTC')::date <= request.observation_date
       AND (candidate.ts AT TIME ZONE 'UTC')::date
             >= request.observation_date - $4::integer
     ORDER BY candidate.ts DESC, candidate.collected_at DESC
     LIMIT 1
  ) bar ON true
 ORDER BY request.security_entity_id, request.observation_date
`;

/**
 * 분할 이력. `close` 가 소급조정돼 있으므로 보고 주식수를 같은 기준으로 옮기는 데
 * 쓴다. 라이브(2026-08-12): `action_type='split'` 541 행 / 182 종목 /
 * 1962-12-17 ~ 2026-08-05.
 *
 * `available_at <= cutoff` 는 가격의 `collected_at <= cutoff` 와 같은 게이트다.
 * 두 축이 어긋나면 아직 알려지지 않은 분할로 주식수만 옮기게 된다. 컷오프를 과거로
 * 잡은 재현 실행에서 가격과 분할이 함께 사라지는 비대칭도 그래서 같은 모양이다.
 *
 * `ratio > 0` 이 아닌 행은 계수가 될 수 없으므로 여기서 끊는다 — 곱하면 밴드가
 * 0 이나 음수로 무너지고 CHECK 는 그것을 통과시킨다.
 */
const SPLIT_SQL = `
/* k4_valuation_band_splits */
SELECT security_entity_id, effective_date::text AS effective_date, ratio::text AS ratio
  FROM market.corporate_action
 WHERE action_type='split'
   AND security_entity_id=ANY($2::bigint[])
   AND available_at <= $1::timestamptz
   AND ratio IS NOT NULL
   AND ratio > 0
 ORDER BY security_entity_id, effective_date, action_id
`;

/** 컷오프 시점의 최신 종가. 현재 배수를 metadata 에 싣기 위한 것뿐이다. */
const CURRENT_PRICE_SQL = `
/* k4_valuation_band_current_prices */
SELECT security.security_entity_id,
       bar.session_date::text AS session_date, bar.close::text AS close
  FROM core.v_security_universe security
  JOIN LATERAL (
    SELECT (candidate.ts AT TIME ZONE 'UTC')::date AS session_date, candidate.close
      FROM market_ts.ohlcv candidate
     WHERE candidate.domain='stock' AND candidate.timeframe='1D' AND candidate.close > 0
       AND candidate.collected_at <= $1::timestamptz
       AND security.ticker=regexp_replace(upper(candidate.symbol), '\\.(KS|KQ)$', '')
       AND security.market=CASE WHEN candidate.exchange IN ('KOSPI','KOSDAQ')
                                THEN 'KR' ELSE 'US' END
       AND (candidate.ts AT TIME ZONE 'UTC')::date <= $1::timestamptz::date
     ORDER BY candidate.ts DESC, candidate.collected_at DESC
     LIMIT 1
  ) bar ON true
 WHERE security.security_entity_id=ANY($2::bigint[])
 ORDER BY security.security_entity_id
`;

function declaredMethods(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      entry && typeof entry === 'object' && 'key' in entry
        ? String((entry as { key: unknown }).key)
        : null,
    )
    .filter((key): key is string => key !== null);
}

function iso(value: unknown): string {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.valueOf())) throw new Error('database returned an invalid timestamp');
  return parsed.toISOString();
}

export type K4ValuationBandSubjects = {
  informationSet: K4InformationSetInput;
  securities: K4ValuationBandSecurity[];
  facts: K4ValuationBandFact[];
  splits: K4ValuationSplit[];
};

export async function loadK4ValuationBandSubjects(
  client: K4QueryClient,
  options: { cutoff: string },
): Promise<K4ValuationBandSubjects> {
  const cutoff = new Date(options.cutoff);
  if (Number.isNaN(cutoff.valueOf()) || cutoff.toISOString() !== options.cutoff) {
    throw new Error('K4 valuation-band cutoff must be a canonical ISO timestamp');
  }
  const snapshot = await client.query(K4_SEMANTIC_SNAPSHOT_SQL, [options.cutoff]);
  const semanticSnapshotId = snapshot.rows[0]?.semantic_snapshot_id;
  if (typeof semanticSnapshotId !== 'string') {
    throw new Error('no sealed semantic snapshot existed by the K4 valuation-band cutoff');
  }
  const securityRows = await client.query(SECURITY_SQL, [options.cutoff]);
  const securities: K4ValuationBandSecurity[] = securityRows.rows.map((row) => ({
    securityEntityId: Number(row.security_entity_id),
    issuerEntityId: row.issuer_entity_id === null ? null : Number(row.issuer_entity_id),
    market: String(row.market),
    ticker: String(row.ticker),
    currency: row.currency === null ? null : String(row.currency),
    playbookKey: row.playbook_key === null ? null : String(row.playbook_key),
    declaredValuationMethods: declaredMethods(row.valuation_methods),
  }));
  const issuerIds = [
    ...new Set(
      securities
        .map((security) => security.issuerEntityId)
        .filter((issuerId): issuerId is number => issuerId !== null),
    ),
  ];
  const factRows = issuerIds.length
    ? await client.query(FACT_SQL, [options.cutoff, issuerIds, [...K4_VALUATION_CONCEPT_KEYS]])
    : { rows: [] };
  const securityIds = securities.map((security) => security.securityEntityId);
  const splitRows = securityIds.length
    ? await client.query(SPLIT_SQL, [options.cutoff, securityIds])
    : { rows: [] };
  return {
    informationSet: {
      informationSetId: k4InformationSetId(options.cutoff, semanticSnapshotId),
      validCutoff: options.cutoff,
      sourceAvailableCutoff: options.cutoff,
      systemKnownCutoff: options.cutoff,
      marketObservationCutoff: options.cutoff,
      semanticSnapshotId,
    },
    securities,
    facts: factRows.rows.map((row) => ({
      numericFactId: Number(row.numeric_fact_id),
      entityId: Number(row.entity_id),
      conceptNamespace: String(row.concept_namespace),
      conceptKey: String(row.concept_key),
      value: Number(row.value),
      unit: String(row.unit),
      currency: row.currency === null ? null : String(row.currency),
      observationDate: String(row.observation_date),
      periodDays: row.period_days === null ? null : Number(row.period_days),
      hasDimensionMember: row.has_dimension_member === true,
      pitClass: String(row.pit_quality_class),
      availableAt: iso(row.available_at),
      knownAt: iso(row.known_at),
    })),
    splits: splitRows.rows.map((row) => ({
      securityEntityId: Number(row.security_entity_id),
      effectiveDate: String(row.effective_date),
      ratio: Number(row.ratio),
    })),
  };
}

export async function loadK4ValuationBandPrices(
  client: K4QueryClient,
  options: {
    cutoff: string;
    requests: readonly { securityEntityId: number; observationDate: string }[];
  },
): Promise<K4ValuationBandPrice[]> {
  if (options.requests.length === 0) return [];
  const rows = await client.query(PRICE_SQL, [
    options.cutoff,
    options.requests.map((request) => request.securityEntityId),
    options.requests.map((request) => request.observationDate),
    K4_VALUATION_BAND_PRICE_LOOKBACK_DAYS,
  ]);
  return rows.rows.map((row) => ({
    securityEntityId: Number(row.security_entity_id),
    observationDate: String(row.observation_date),
    sessionDate: String(row.session_date),
    close: Number(row.close),
  }));
}

export async function loadK4ValuationBandCurrentPrices(
  client: K4QueryClient,
  options: { cutoff: string; securityEntityIds: readonly number[] },
): Promise<K4ValuationCurrentPrice[]> {
  if (options.securityEntityIds.length === 0) return [];
  const rows = await client.query(CURRENT_PRICE_SQL, [
    options.cutoff,
    [...options.securityEntityIds],
  ]);
  return rows.rows.map((row) => ({
    securityEntityId: Number(row.security_entity_id),
    sessionDate: String(row.session_date),
    close: Number(row.close),
  }));
}
