export type OhlcvBar = {
  exchange: string;
  symbol: string;
  timeframe: '1D';
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeBase: number | null;
  volumeQuote: number | null;
  domain: 'stock';
  sourceId: 'yfinance';
  market: 'KR' | 'US';
  yfSymbol: string;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseOhlcvBar(value: unknown): OhlcvBar | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Partial<OhlcvBar>;
  if (
    !row.exchange ||
    !row.symbol ||
    row.timeframe !== '1D' ||
    !row.ts ||
    !finite(row.open) ||
    !finite(row.high) ||
    !finite(row.low) ||
    !finite(row.close) ||
    row.domain !== 'stock' ||
    row.sourceId !== 'yfinance' ||
    (row.market !== 'KR' && row.market !== 'US') ||
    !row.yfSymbol
  ) {
    return undefined;
  }
  if (!Number.isFinite(Date.parse(row.ts))) return undefined;
  if (Math.min(row.open, row.high, row.low, row.close) <= 0) return undefined;
  if (row.high < Math.max(row.open, row.low, row.close)) return undefined;
  if (row.low > Math.min(row.open, row.high, row.close)) return undefined;
  if (row.volumeBase !== null && (!finite(row.volumeBase) || row.volumeBase < 0)) return undefined;
  if (row.volumeQuote !== null && (!finite(row.volumeQuote) || row.volumeQuote < 0))
    return undefined;
  return row as OhlcvBar;
}
