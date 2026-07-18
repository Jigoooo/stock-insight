import {
  priceSeriesRangeSchema,
  priceSeriesResponseSchema,
  type PriceBar,
  type PriceSeries,
  type PriceSeriesRange,
  type PriceSeriesResponse,
  type ResponseMeta,
} from '@stock-insight/contracts';

export type PriceSeriesDatabaseRow = {
  ts: string | Date;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume_base: number | string | null;
};

export type PriceSeriesRowQueryExecutor = (
  sql: string,
  params: readonly unknown[],
) => Promise<PriceSeriesDatabaseRow[]>;

const RANGE_DAYS: Record<PriceSeriesRange, number> = {
  '1M': 31,
  '3M': 93,
  '6M': 186,
  '1Y': 366,
};

// Canonical OHLCV read: symbol matching mirrors serving.latest_price_v1 normalization.
const PRICE_SERIES_SQL = `
SELECT ts, open, high, low, close, volume_base
FROM market_ts.ohlcv
WHERE domain = 'stock'
  AND timeframe = '1D'
  AND regexp_replace(upper(symbol), '\\.(KS|KQ)$', '') = $1::text
  AND CASE WHEN exchange IN ('KOSPI', 'KOSDAQ') THEN 'KR' ELSE 'US' END = $2::text
  AND ts >= now() - make_interval(days => $3::int)
ORDER BY ts ASC
LIMIT 400
`;

function parseEntityKey(
  entityKey: string,
): { market: 'KR' | 'US'; ticker: string; entityKey: string } | null {
  const match = /^(KR|US):([A-Za-z0-9.-]{1,12})$/.exec(entityKey.trim());
  if (!match) return null;
  const market = match[1] as 'KR' | 'US';
  const rawTicker = match[2]!.toUpperCase();
  const ticker = market === 'KR' ? rawTicker.replace(/\.(KS|KQ)$/i, '') : rawTicker;
  return { market, ticker, entityKey: `${market}:${ticker}` };
}

function toFinite(value: number | string): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapBar(row: PriceSeriesDatabaseRow): PriceBar | null {
  const ts = row.ts instanceof Date ? row.ts : new Date(row.ts);
  if (Number.isNaN(ts.getTime())) return null;
  const open = toFinite(row.open);
  const high = toFinite(row.high);
  const low = toFinite(row.low);
  const close = toFinite(row.close);
  if (open === null || high === null || low === null || close === null) return null;
  const volume = row.volume_base === null ? null : toFinite(row.volume_base);
  return { ts: ts.toISOString(), open, high, low, close, volume };
}

export type PriceSeriesReadModel = {
  getPriceSeries: (
    entityKey: string,
    range: PriceSeriesRange,
  ) => PriceSeries | null | Promise<PriceSeries | null>;
};

export function createFallbackPriceSeriesReadModel(): PriceSeriesReadModel {
  return {
    getPriceSeries() {
      return null;
    },
  };
}

export function createPostgresPriceSeriesReadModel(
  executor: PriceSeriesRowQueryExecutor,
): PriceSeriesReadModel {
  return {
    async getPriceSeries(entityKey, range) {
      const parsed = parseEntityKey(entityKey);
      if (!parsed) return null;
      const rows = await executor(PRICE_SERIES_SQL, [
        parsed.ticker,
        parsed.market,
        RANGE_DAYS[range],
      ]);
      const bars = rows.flatMap((row) => {
        const bar = mapBar(row);
        return bar ? [bar] : [];
      });
      if (bars.length === 0) return null;
      return {
        entityKey: parsed.entityKey,
        market: parsed.market,
        ticker: parsed.ticker,
        currency: parsed.market === 'KR' ? 'KRW' : 'USD',
        timeframe: '1D',
        range,
        asOf: bars.at(-1)?.ts ?? null,
        bars,
      };
    },
  };
}

export type GetPriceSeriesOptions = {
  now?: Date;
  range?: string;
  readModel?: PriceSeriesReadModel;
};

export async function getPriceSeries(
  entityKey: string,
  options: GetPriceSeriesOptions = {},
): Promise<PriceSeriesResponse> {
  const readModel = options.readModel ?? createFallbackPriceSeriesReadModel();
  const generatedAt = (options.now ?? new Date()).toISOString();
  const rangeResult = priceSeriesRangeSchema.safeParse(options.range ?? '3M');
  const range = rangeResult.success ? rangeResult.data : '3M';

  let data: PriceSeries | null;
  try {
    data = await readModel.getPriceSeries(entityKey, range);
  } catch {
    return priceSeriesResponseSchema.parse({
      data: null,
      availability: 'error',
      error: {
        code: 'PRICE_SERIES_READ_FAILED',
        message: '가격 시계열 데이터를 읽는 중 오류가 발생했습니다.',
        detail: entityKey,
      },
      meta: { source: 'fallback', generatedAt },
    });
  }

  const meta: ResponseMeta = {
    source: data ? 'database' : 'fallback',
    generatedAt,
  };
  return priceSeriesResponseSchema.parse({
    data,
    availability: data ? 'available' : 'missing',
    error: data
      ? null
      : {
          code: 'PRICE_SERIES_NOT_FOUND',
          message: '아직 수집된 가격 시계열이 없습니다.',
          detail: entityKey,
        },
    meta,
  });
}
