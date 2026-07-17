import assert from 'node:assert/strict';
import test from 'node:test';

import { parseOhlcvBar } from '../src/ingest/ohlcv.ts';

const valid = {
  exchange: 'KOSPI',
  symbol: '005930',
  timeframe: '1D',
  ts: '2026-07-17T00:00:00.000Z',
  open: 80_000,
  high: 82_000,
  low: 79_500,
  close: 81_500,
  volumeBase: 12_000_000,
  volumeQuote: null,
  domain: 'stock',
  sourceId: 'yfinance',
  market: 'KR',
  yfSymbol: '005930.KS',
};

test('accepts a finite OHLCV bar with market invariants', () => {
  assert.deepEqual(parseOhlcvBar(valid), valid);
});

test('rejects impossible or non-positive prices, negative volume, and non-stock rows', () => {
  assert.equal(parseOhlcvBar({ ...valid, high: 79_000 }), undefined);
  assert.equal(parseOhlcvBar({ ...valid, open: -1, high: -1, low: -1, close: -1 }), undefined);
  assert.equal(parseOhlcvBar({ ...valid, open: 0, low: 0 }), undefined);
  assert.equal(parseOhlcvBar({ ...valid, volumeBase: -1 }), undefined);
  assert.equal(parseOhlcvBar({ ...valid, domain: 'crypto' }), undefined);
});

test('rejects invalid timestamps and non-finite prices', () => {
  assert.equal(parseOhlcvBar({ ...valid, ts: 'not-a-date' }), undefined);
  assert.equal(parseOhlcvBar({ ...valid, close: Number.NaN }), undefined);
});
