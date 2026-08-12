/**
 * 설명되지 않는 움직임 레이더 — 판정 규칙.
 *
 * 정본 05 §9 의 절차를 그대로 따르되, **인과를 만들지 않는다**(REQ-MKT-001).
 * 이 모듈이 내는 것은 "무엇이 이 움직임을 일으켰나" 가 아니라 **"어디를 뒤졌고
 * 거기서 무엇이 나왔나"** 다.
 *
 * ## 채널을 시점에 묶는다
 *
 * 처음 설계는 두 번째 채널을 `serving.impact_summary_v2` 의 노출 경로 수로
 * 잡으려 했다. 실측으로 XOM 은 70개, XLE 는 56개를 갖는다. 그 수로 설명을 매기면
 * 화면이 "70개 경로가 오늘의 4.3% 상승을 설명합니다" 라고 말하게 되는데,
 * 그 경로들은 오늘과 아무 상관이 없다 — 노출 경로는 "관련 충격이 오면 이렇게
 * 반응한다" 이지 "오늘 이렇게 움직인 이유" 가 아니다. 정적인 수를 시점 설명으로
 * 쓰는 것이 REQ-MKT-001 이 이름으로 막는 형태다. 그래서 전부 버렸다.
 *
 * ## 시장 요인은 표본을 먼저 본다
 *
 * 한 종목만 관측된 날의 평균은 시장이 아니다. 표본이 얇으면 이 채널은
 * "못 찾음" 이 아니라 **못 뒤진 채널**로 기록된다. 얇은 표본을 시장으로 취급하면
 * 데이터가 적은 날일수록 설명이 잘 되는 뒤집힌 결과가 나온다.
 */

/** 정본 §9 가 요구하는 탐색 채널 중 이 저장소가 시점에 묶어 뒤질 수 있는 것. */
export type AnomalyChannel = 'known_event' | 'peer_comove' | 'market_factor';

/**
 * theme exposure 는 §9 가 요구하지만 뒤지지 않는다. `analytics.theme` 은
 * 2026-07-18 일회성 덤프이고 `theme_membership` 의 tier 가 전부 `adjacent` 다 —
 * 분류기가 없으므로 나오는 답에 뜻이 없고, 뜻 없는 답을 채널로 세면
 * `UNEXPLAINED` 가 `EXPLAINED` 로 바뀐다.
 */
export const PERMANENTLY_UNSEARCHED_CHANNELS = ['theme_exposure'] as const;

/** 종목 자신의 일간 변동성 배수. 시장 전체 고정 퍼센트를 쓰지 않는 이유는 주석 참조. */
export const ANOMALY_SIGMA_THRESHOLD = 2;

/**
 * 시장 평균을 시장으로 인정하는 최소 표본. 마이그레이션 120 이 `sample_count` 를
 * 내는 이유가 여기서 처음 쓰인다.
 */
export const MINIMUM_MARKET_SAMPLE = 30;

/**
 * 시장 요인이 걸리는 조건: 방향이 같고, **시장 움직임만으로 이 종목 움직임의
 * 절반 이상이 설명되는** 크기. 방향만 보면 시장이 0.01% 움직인 날에도 걸린다.
 */
export const MARKET_SHARE_THRESHOLD = 0.5;

export type AnomalyCandidate = {
  subjectEntityId: number;
  market: string;
  ticker: string;
  observationDate: string;
  /** 일간 수익률. 부호를 지우지 않는다 — 이웃·시장과 방향을 맞춰야 한다. */
  return1d: number;
  /** 연율화 변동성(`vol_20d`). 일간으로 되돌리는 것은 이 모듈의 일이다. */
  annualisedVol: number;
  volumeZ: number | null;
  knownEventCount: number;
  peerPricedCount: number;
  peerSameDirectionCount: number;
  /** 그날 시장 평균 등락률(%). 관측이 없으면 null. */
  marketMovePct: number | null;
  marketSampleCount: number | null;
};

export type PlannedAnomaly = {
  anomalyKey: string;
  subjectEntityId: number;
  observationDate: string;
  moveReturn: number;
  moveSigma: number;
  volumeZ: number | null;
  knownEventCount: number;
  peerComoveCount: number;
  peerPricedCount: number;
  marketMovePct: number | null;
  marketSampleCount: number | null;
  matchedChannelCount: number;
  searchedChannels: AnomalyChannel[];
  unsearchedChannels: string[];
  explanationState: 'EXPLAINED' | 'PARTIAL' | 'UNEXPLAINED';
};

const TRADING_DAYS_PER_YEAR = 252;

export function dailySigma(annualisedVol: number): number {
  return annualisedVol / Math.sqrt(TRADING_DAYS_PER_YEAR);
}

export function planAnomaly(candidate: AnomalyCandidate): PlannedAnomaly | null {
  const sigmaUnit = dailySigma(candidate.annualisedVol);
  if (!Number.isFinite(sigmaUnit) || sigmaUnit <= 0) return null;
  const moveSigma = Math.abs(candidate.return1d) / sigmaUnit;
  if (!Number.isFinite(moveSigma) || moveSigma < ANOMALY_SIGMA_THRESHOLD) return null;

  const searched: AnomalyChannel[] = ['known_event', 'peer_comove'];
  const unsearched: string[] = [...PERMANENTLY_UNSEARCHED_CHANNELS];

  // 이 종목에 붙은 사건이 하나라도 있으면 그 채널은 무언가를 돌려준 것이다.
  // 그 사건이 이 움직임의 원인이라는 주장은 여기서도 아래에서도 하지 않는다.
  const knownEventMatched = candidate.knownEventCount > 0;

  // 이웃이 하나도 가격을 갖지 않은 날은 "이웃이 안 움직였다" 가 아니라
  // "볼 수 없었다" 다. 그때는 채널을 못 뒤진 것으로 옮긴다 — 그러지 않으면
  // 이웃이 없는 종목일수록 자동으로 더 설명되지 않는 것처럼 보인다.
  const peerSearchable = candidate.peerPricedCount > 0;
  if (!peerSearchable) {
    searched.splice(searched.indexOf('peer_comove'), 1);
    unsearched.push('peer_comove');
  }
  const peerMatched = peerSearchable && candidate.peerSameDirectionCount > 0;

  const marketSearchable =
    candidate.marketMovePct !== null &&
    candidate.marketSampleCount !== null &&
    candidate.marketSampleCount >= MINIMUM_MARKET_SAMPLE;
  if (marketSearchable) searched.push('market_factor');
  else unsearched.push('market_factor');

  const movePct = candidate.return1d * 100;
  const marketMatched =
    marketSearchable &&
    candidate.marketMovePct !== null &&
    Math.sign(candidate.marketMovePct) === Math.sign(movePct) &&
    Math.abs(candidate.marketMovePct) >= MARKET_SHARE_THRESHOLD * Math.abs(movePct);

  const matchedChannelCount = [knownEventMatched, peerMatched, marketMatched].filter(
    Boolean,
  ).length;

  return {
    anomalyKey: `market-anomaly:${candidate.market}:${candidate.ticker}:${candidate.observationDate}`,
    subjectEntityId: candidate.subjectEntityId,
    observationDate: candidate.observationDate,
    moveReturn: candidate.return1d,
    moveSigma,
    volumeZ: candidate.volumeZ,
    knownEventCount: candidate.knownEventCount,
    peerComoveCount: candidate.peerSameDirectionCount,
    peerPricedCount: candidate.peerPricedCount,
    marketMovePct: candidate.marketMovePct,
    marketSampleCount: candidate.marketSampleCount,
    matchedChannelCount,
    searchedChannels: searched,
    unsearchedChannels: unsearched,
    // 상태는 **찾은 채널 수**만으로 정해진다. 세기나 확신이 아니다 —
    // 마이그레이션 121 의 CHECK 가 같은 규칙을 DB 쪽에서 한 번 더 잡는다.
    explanationState:
      matchedChannelCount === 0
        ? 'UNEXPLAINED'
        : matchedChannelCount === 1
          ? 'PARTIAL'
          : 'EXPLAINED',
  };
}
