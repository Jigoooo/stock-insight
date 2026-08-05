export type ChartRoleId = 'market-tape' | 'evidence-band' | 'candle-ledger';
export type ChartRange = '1M' | '3M' | '6M' | '1Y';
export type MarketTapeVariantId = 'quiet-trace' | 'layered-range' | 'signal-ledger';
export type EvidenceBandVariantId = 'band-ledger' | 'event-pulse' | 'evidence-split';
export type CandleLedgerVariantId = 'clean-candle' | 'dual-pane' | 'market-ledger';
export type ChartVariantId = MarketTapeVariantId | EvidenceBandVariantId | CandleLedgerVariantId;
export type ChartPreviewState =
  | 'ready'
  | 'loading'
  | 'stale'
  | 'partial'
  | 'empty'
  | 'error'
  | 'unavailable';

export type ChartBar = {
  date: Date;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type ChartRangeSelection = {
  start: Date;
  end: Date;
};

export type EvidenceRecord = {
  id: string;
  barIndex: number;
  tone: 'positive' | 'neutral' | 'risk';
  title: string;
  sourceCount: number;
};

export type ReferenceBand = {
  id: string;
  startIndex: number;
  endIndex: number;
  low: number;
  high: number;
  label: string;
};

export type ChartFixture = {
  entityKey: string;
  ticker: string;
  market: 'KR' | 'US';
  currency: 'KRW' | 'USD';
  asOf: string;
  bars: readonly ChartBar[];
  evidence: readonly EvidenceRecord[];
  bands: readonly ReferenceBand[];
};

export type ChartRole = {
  id: ChartRoleId;
  label: string;
  description: string;
};

export type ChartVariant = {
  id: ChartVariantId;
  label: string;
  description: string;
};

export const rangeBarCounts: Record<ChartRange, number> = {
  '1M': 22,
  '3M': 66,
  '6M': 126,
  '1Y': 180,
};

export const chartRoles: readonly ChartRole[] = [
  {
    id: 'market-tape',
    label: 'Market Tape',
    description: '기간 흐름과 선택 구간을 빠르게 읽는 가격 테이프',
  },
  {
    id: 'evidence-band',
    label: 'Evidence Band',
    description: '가격 경로 위에 조건 구간과 근거 사건을 연결하는 차트',
  },
  {
    id: 'candle-ledger',
    label: 'Candle Ledger',
    description: 'OHLCV와 거래량을 교차 탐색하는 캔들 원장',
  },
];

export const chartVariants: Record<ChartRoleId, readonly ChartVariant[]> = {
  'market-tape': [
    {
      id: 'quiet-trace',
      label: 'A · Quiet Trace',
      description: '얇은 종가선과 최소 정보로 흐름을 남깁니다.',
    },
    {
      id: 'layered-range',
      label: 'B · Layered Range',
      description: '면과 선택 구간을 층으로 분리해 범위를 읽습니다.',
    },
    {
      id: 'signal-ledger',
      label: 'C · Signal Ledger',
      description: '숫자 원장과 축을 압축해 밀도 있게 비교합니다.',
    },
  ],
  'evidence-band': [
    {
      id: 'band-ledger',
      label: 'A · Band Ledger',
      description: '패턴 구간을 먼저 읽고 근거를 아래에서 확인합니다.',
    },
    {
      id: 'event-pulse',
      label: 'B · Event Pulse',
      description: '사건 마커와 선택 축을 중심으로 탐색합니다.',
    },
    {
      id: 'evidence-split',
      label: 'C · Evidence Split',
      description: '차트와 근거 원장을 나란히 연결합니다.',
    },
  ],
  'candle-ledger': [
    {
      id: 'clean-candle',
      label: 'A · Clean Candle',
      description: '가격 pane과 낮은 거래량 strip만 남깁니다.',
    },
    {
      id: 'dual-pane',
      label: 'B · Dual Pane',
      description: '가격과 거래량을 고정 비율 pane으로 분리합니다.',
    },
    {
      id: 'market-ledger',
      label: 'C · Market Ledger',
      description: 'OHLCV 원장과 촘촘한 시장 grid를 결합합니다.',
    },
  ],
};

export const chartPreviewStates: readonly ChartPreviewState[] = [
  'ready',
  'loading',
  'stale',
  'partial',
  'empty',
  'error',
  'unavailable',
];

export function sliceBarsByRange(bars: readonly ChartBar[], range: ChartRange): ChartBar[] {
  return bars.slice(-rangeBarCounts[range]);
}

export function filterBarsBySelection(
  bars: readonly ChartBar[],
  selection: ChartRangeSelection | null,
): ChartBar[] {
  if (!selection) return [...bars];
  const start = Math.min(selection.start.getTime(), selection.end.getTime());
  const end = Math.max(selection.start.getTime(), selection.end.getTime());
  return bars.filter(({ date }) => {
    const time = date.getTime();
    return time >= start && time <= end;
  });
}

export function clampRangeSelection(
  selection: ChartRangeSelection | null,
  bars: readonly ChartBar[],
): ChartRangeSelection | null {
  const first = bars[0]?.date;
  const last = bars.at(-1)?.date;
  if (!(selection && first && last)) return null;
  const requestedStart = Math.min(selection.start.getTime(), selection.end.getTime());
  const requestedEnd = Math.max(selection.start.getTime(), selection.end.getTime());
  return {
    start: new Date(Math.max(first.getTime(), Math.min(requestedStart, last.getTime()))),
    end: new Date(Math.min(last.getTime(), Math.max(requestedEnd, first.getTime()))),
  };
}

export function findEvidenceVisibleDomain(
  evidence: EvidenceRecord,
  bars: readonly ChartBar[],
  visibleBarCount: number,
): ChartRangeSelection {
  const safeCount = Math.max(1, Math.min(visibleBarCount, bars.length));
  const centerIndex = Math.max(0, Math.min(evidence.barIndex, bars.length - 1));
  const before = Math.floor((safeCount - 1) / 2);
  const startIndex = Math.max(0, Math.min(centerIndex - before, bars.length - safeCount));
  const endIndex = startIndex + safeCount - 1;
  return {
    start: new Date(bars[startIndex]!.date),
    end: new Date(bars[endIndex]!.date),
  };
}

export function validateChartBars(bars: readonly ChartBar[]): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  let previousTime = Number.NEGATIVE_INFINITY;

  bars.forEach((bar, index) => {
    const time = bar.date.getTime();
    const values = [bar.open, bar.high, bar.low, bar.close];
    if (!Number.isFinite(time) || values.some((value) => !Number.isFinite(value))) {
      issues.push(`bar:${index}:non-finite`);
    }
    if (time <= previousTime) issues.push(`bar:${index}:timestamp-order`);
    if (bar.low > Math.min(bar.open, bar.close)) issues.push(`bar:${index}:low-body`);
    if (bar.high < Math.max(bar.open, bar.close)) issues.push(`bar:${index}:high-body`);
    if (bar.low > bar.high) issues.push(`bar:${index}:range`);
    if (bar.volume !== null && (!Number.isFinite(bar.volume) || bar.volume < 0)) {
      issues.push(`bar:${index}:volume`);
    }
    previousTime = time;
  });

  return { valid: issues.length === 0, issues };
}
