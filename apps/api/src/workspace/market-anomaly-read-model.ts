import {
  ANOMALY_SIGMA_THRESHOLD,
  MINIMUM_MARKET_SAMPLE,
} from '../analytics/market-anomaly-plan.ts';

import type {
  MarketAnomalyItem,
  MarketAnomalyScan,
} from '@stock-insight/contracts/research-workspace';

/**
 * 정본 01 §2 다섯 번째 섹션 — 설명되지 않는 움직임.
 *
 * `analytics.market_anomaly_revision` 은 **인과를 저장하지 않는다.** 각 행이
 * 말하는 것은 어디를 뒤졌고 거기서 무엇이 나왔는가이고, 이 모듈은 그것을
 * 화면 문장으로 옮기면서 같은 규율을 지킨다: **"때문에" 를 쓰지 않는다.**
 * 모든 문안은 "같은 시기에 확인된" 계열이다(REQ-MKT-001).
 *
 * 그리고 원시 어휘를 통과시키지 않는다. `explanation_state` 도 채널 키도
 * SELECT 하지 않는다 — 뽑지 않으면 실수로도 흘릴 수 없다(UX 헌법 7번).
 */

export type MarketAnomalyRowQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

/**
 * **`= current_date` 는 구조적으로 0행이다.**
 *
 * `observation_date` 는 생산자가 `serving.latest_price_v1.price_as_of`,
 * 즉 **완료된 마지막 봉의 날짜**로 잡는다. 잡은 그 다음 날 아침에 돌므로
 * 독자의 `current_date` 와는 애초에 하루 이상 어긋난다. 이 저장소는 같은
 * 모양(`feed_date = current_date`)에 이미 한 번 물렸다.
 *
 * 전역 `max(observation_date)` 도 안 된다. 한국장 마감과 미국장 마감 사이
 * 시간대에는 한 시장이 하루 앞서므로, 전역 최댓값을 쓰면 **뒤처진 시장의 행이
 * 통째로 사라진다.** 생산자가 "시장 전체 한 날짜로 뭉뚱그리지 않는다" 고
 * 정해 둔 것을 읽기 층에서 되살리는 꼴이다. 시장은 `anomaly_key` 가 이미
 * 담고 있어서(`market-anomaly:US:CRIS:2026-08-11`) 별도 조인도 필요 없다.
 *
 * 신선도 하한(예: N일보다 오래된 것은 버린다)도 넣지 않는다. 하한은 0행을
 * 만들고, 0행은 이 표에서 "움직임이 없었다" 로 읽힌다. 뒤처짐은 버리는 것이
 * 아니라 `availability: 'stale'` 로 **말하는** 것이다.
 */
const ANOMALY_SQL = `
WITH visible AS (
  SELECT anomaly.*, split_part(anomaly.anomaly_key, ':', 2) AS market
    FROM serving.market_anomaly_current_v1 anomaly
   -- 미래 시각 행 차단이다. PIT 재현이 아니다 — 뷰가 키마다 최신 리비전으로
   -- 이미 접은 뒤라, 이 조건은 옛 리비전을 되살리는 게 아니라 그 키를 통째로
   -- 사라지게 만든다. 진짜 PIT 재현은 원장을 직접 읽어야 하고, 제품 읽기 롤은
   -- 그 표에 접근할 수 없다.
   WHERE anomaly.as_of_at <= $1::timestamptz
), latest AS (
  SELECT market, max(observation_date) AS observation_date
    FROM visible GROUP BY market
), reference_bar AS (
  -- 신선도의 기준. 관측일과 **같은 시계**(완료된 마지막 봉)에서 온다.
  -- 벽시계와 대조하면 주말마다 stale 이 된다.
  SELECT market, max(price_as_of)::date AS bar_date
    FROM serving.latest_price_v1 GROUP BY market
)
SELECT count(*) OVER ()                  AS scope_total,
       visible.market,
       split_part(visible.anomaly_key, ':', 3) AS ticker,
       visible.anomaly_key,
       visible.observation_date,
       reference_bar.bar_date            AS reference_bar_date,
       visible.move_return,
       visible.move_sigma,
       visible.known_event_count,
       visible.peer_comove_count,
       visible.peer_priced_count,
       visible.market_sample_count,
       visible.matched_channel_count,
       visible.searched_channels,
       visible.unsearched_channels,
       entity.canonical_name
  FROM visible
  JOIN latest
    ON latest.market = visible.market
   AND latest.observation_date = visible.observation_date
  LEFT JOIN reference_bar ON reference_bar.market = visible.market
  LEFT JOIN core.entity entity ON entity.entity_id = visible.subject_entity_id
 ORDER BY visible.move_sigma DESC, visible.anomaly_key
 LIMIT $2
`;

type AnomalyRow = {
  scope_total: string | number;
  market: string;
  ticker: string;
  anomaly_key: string;
  observation_date: string | Date;
  reference_bar_date: string | Date | null;
  move_return: string | number;
  move_sigma: string | number;
  known_event_count: number;
  peer_comove_count: number;
  peer_priced_count: number;
  market_sample_count: number | null;
  matched_channel_count: number;
  searched_channels: string[];
  unsearched_channels: string[];
  canonical_name: string | null;
};

/**
 * `date` 컬럼은 pg 가 로컬 시간대 `Date` 로 준다. `toISOString()` 을 쓰면 KST
 * 자정이 전날 15:00Z 가 되어 관측일이 하루 밀리고, 그 하루가 신선도 판정을
 * 뒤집는다. `macro-read-model.ts` 가 실측으로 같은 것에 물렸다.
 */
function toDay(value: string | Date): string {
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MARKET_LABELS: Record<string, string> = { KR: '국내', US: '미국' };

/**
 * 확인된 채널이 무엇인지 뷰가 직접 주지 않아 세 값에서 되짚는다.
 *
 * 시장 요인만 뺄셈으로 구하는 이유: 그 판정은 `MARKET_SHARE_THRESHOLD` 라는
 * 상수를 쓰는데, 읽기 층에서 그 계산을 다시 구현하면 상수가 갈리는 순간
 * **화면이 원장과 다른 말을 한다.** 원장이 센 개수에서 나머지를 빼는 편이
 * 두 곳이 어긋날 수 없다.
 */
function matchedChannels(row: AnomalyRow): {
  knownEvent: boolean;
  peerComove: boolean;
  marketFactor: boolean;
} {
  const knownEvent = row.known_event_count > 0;
  const peerComove = row.peer_comove_count > 0;
  const marketFactor = row.matched_channel_count - (knownEvent ? 1 : 0) - (peerComove ? 1 : 0) > 0;
  return { knownEvent, peerComove, marketFactor };
}

/**
 * 채널별 문장. 채널 이름은 화면에 한 번도 나오지 않고 문장이 그 자리를 대신한다.
 * 어느 문장에도 인과가 없다 — 확인됨조차 "같은 시기에" 이지 "때문에" 가 아니다.
 */
const CHECKED_COPY: Record<string, { matched: string; unmatched: string }> = {
  known_event: {
    matched: '같은 기간에 기록된 사건이 있습니다',
    unmatched: '같은 기간에 기록된 사건이 없습니다',
  },
  peer_comove: {
    matched: '같은 업종 종목도 같은 날 같은 방향으로 움직였습니다',
    unmatched: '같은 업종 종목에서는 같은 방향 움직임이 확인되지 않았습니다',
  },
  market_factor: {
    matched: '그날 시장 전체가 같은 방향으로 움직였습니다',
    unmatched: '그날 시장 전체 움직임과는 방향·폭이 맞지 않았습니다',
  },
};

/**
 * **셋을 한 문구로 뭉치면 안 된다.**
 *
 * 같은 "뒤지지 않음" 문구를 쓰면, 분류기가 아예 없는 채널이 "곧 할 것" 으로
 * 읽혀 REQ-SRC-001 위반을 한 층 아래에서 반복한다. `theme_exposure` 는
 * "해당 없음" 도 아니다 — 기준이 없어 **묻지 않은** 것이다.
 */
function uncheckedCopy(channel: string, row: AnomalyRow): string | null {
  if (channel === 'theme_exposure') {
    return '테마 분류 기준이 아직 없어 이 채널은 확인하지 않습니다';
  }
  if (channel === 'peer_comove') {
    return row.peer_priced_count === 0
      ? '그날 가격이 확인된 같은 업종 종목이 없어 확인하지 못했습니다'
      : '같은 업종 비교를 수행하지 못했습니다';
  }
  if (channel === 'market_factor') {
    return `그날 시장 표본이 ${MINIMUM_MARKET_SAMPLE}종목에 못 미쳐 확인하지 못했습니다`;
  }
  // 원장에 새 채널이 생겼는데 여기 문안이 없는 경우. 원시 키를 흘리지 않고
  // 조용히 빠뜨리지도 않는다 — 세는 자리는 아래 `items` 길이가 아니라 이 문장이다.
  return '확인 범위를 표시하지 못한 항목이 있습니다';
}

/** `canonical_name` 이 종목코드 그대로인 행이 있다. 코드를 이름 자리에 찍지 않는다. */
function displayName(row: AnomalyRow): string {
  const name = row.canonical_name?.trim();
  if (!name || name === row.ticker) return `종목코드 ${row.ticker} (이름 미수집)`;
  return name;
}

function describeItem(row: AnomalyRow): MarketAnomalyItem {
  const matched = matchedChannels(row);
  const searched = row.searched_channels ?? [];
  const unsearched = row.unsearched_channels ?? [];
  const matchedByChannel: Record<string, boolean> = {
    known_event: matched.knownEvent,
    peer_comove: matched.peerComove,
    market_factor: matched.marketFactor,
  };

  const checked = searched.flatMap((channel) => {
    const copy = CHECKED_COPY[channel];
    if (!copy) return [];
    return [matchedByChannel[channel] ? copy.matched : copy.unmatched];
  });
  const unchecked = unsearched.flatMap((channel) => {
    const copy = uncheckedCopy(channel, row);
    return copy === null ? [] : [copy];
  });

  const searchedCount = searched.length;
  const matchedCount = Number(row.matched_channel_count);
  // 하중을 받는 것은 "확인된 동시 발생 없음" 이다. **"설명할 수 없는 움직임"
  // 으로 읽히면 안 된다** — 실제 뜻은 "우리가 뒤진 범위에서 같은 시기에
  // 확인된 것이 없다" 이고, 그 범위 자체가 넷 중 둘일 수 있다.
  const stateLabel =
    matchedCount === 0
      ? '확인된 동시 발생 없음'
      : matchedCount < searchedCount
        ? '일부 채널에서 확인됨'
        : '뒤진 채널 전부에서 확인됨';
  const stateDetail =
    matchedCount === 0
      ? `뒤진 ${searchedCount}개 채널에서 같은 시기에 확인된 것이 없습니다.`
      : matchedCount < searchedCount
        ? `뒤진 ${searchedCount}개 채널 중 ${matchedCount}개에서 같은 시기에 확인된 것이 있습니다.`
        : `뒤진 ${searchedCount}개 채널 모두에서 같은 시기에 확인된 것이 있습니다.`;

  const movePct = Number(row.move_return) * 100;
  const sigma = Number(row.move_sigma);

  return {
    key: row.anomaly_key,
    name: displayName(row),
    marketLabel: MARKET_LABELS[row.market] ?? row.market,
    moveLabel: `${movePct >= 0 ? '+' : ''}${movePct.toFixed(1)}%`,
    direction: movePct >= 0 ? 'up' : 'down',
    magnitudeLabel: `일간 변동성의 ${sigma.toFixed(1)}배`,
    stateLabel,
    stateDetail,
    checked,
    unchecked,
  };
}

const EMPTY_BASIS = '이 계산이 아직 수행되지 않았습니다.';

export async function getMarketAnomalyScan(
  executor: MarketAnomalyRowQueryExecutor,
  options: { now: Date; limit?: number },
): Promise<MarketAnomalyScan> {
  const rows = await executor.queryRows<AnomalyRow>(ANOMALY_SQL, [
    options.now.toISOString(),
    options.limit ?? 8,
  ]);
  if (rows.length === 0) {
    // **0행은 "움직임이 없었다" 가 아니다.** 이 원장은 적중한 행만 저장하므로
    // "돌았고 이상치가 없었다" 는 행이 존재하지 않는다. 그 둘을 구별하지 못하면
    // 화면이 시장에 대해 거짓을 말하게 된다.
    return {
      availability: 'missing',
      observedOn: null,
      items: [],
      scopeTotal: 0,
      basisLabel: EMPTY_BASIS,
    };
  }

  const items = rows.map(describeItem);
  const observedOn = toDay(rows[0]!.observation_date);
  const barDate = rows[0]!.reference_bar_date;
  const referenceBar = barDate === null ? null : toDay(barDate);

  // 봉일을 못 구했으면 stale 로 단정하지 않는다 — 모르는 것을 안다고 말하는
  // 일이다. 대조하지 못했다는 사실 자체를 문장으로 남긴다.
  const availability =
    referenceBar === null ? 'available' : observedOn === referenceBar ? 'available' : 'stale';
  const basisLabel =
    referenceBar === null
      ? `${observedOn} 관측 · 최신 거래일과 대조하지 못했습니다.`
      : availability === 'available'
        ? `${observedOn} 관측 · 최신 거래일 기준입니다.`
        : `${observedOn} 관측 · 최신 거래일(${referenceBar})보다 뒤처져 있습니다.`;

  return {
    availability,
    observedOn,
    items,
    scopeTotal: Number(rows[0]!.scope_total),
    basisLabel: `${basisLabel} 종목 자신의 일간 변동성 ${ANOMALY_SIGMA_THRESHOLD}배를 넘은 움직임만 실었습니다.`,
  };
}
