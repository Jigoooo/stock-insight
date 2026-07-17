import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runnerUrl = new URL('../src/ingest/run-ohlcv.ts', import.meta.url);
const collectorUrl = new URL('../scripts/fetch_ohlcv.py', import.meta.url);
const wrapperUrl = new URL('../scripts/run_ohlcv_daily.sh', import.meta.url);

test('OHLCV universe binds KR rows to an authoritative DART board', async () => {
  const runner = await readFile(runnerUrl, 'utf8');
  assert.match(runner, /corporationClass/);
  assert.match(runner, /= 'Y' THEN 'KOSPI'/);
  assert.match(runner, /= 'K' THEN 'KOSDAQ'/);
  assert.match(runner, /AS exchange/);
});

test('yfinance collector preserves universe exchange instead of deriving it from the winning suffix', async () => {
  const collector = await readFile(collectorUrl, 'utf8');
  assert.match(collector, /exchange=str\(row\["exchange"\]\)/);
  assert.doesNotMatch(collector, /exchange = "KOSPI" if yf_symbol/);
});

test('daily readback rejects non-positive prices end to end', async () => {
  const wrapper = await readFile(wrapperUrl, 'utf8');
  assert.match(wrapper, /least\(open, high, low, close\) <= 0/i);
  assert.match(wrapper, /public\.company_profiles/i);
  assert.match(wrapper, /corporationClass/);
  assert.match(wrapper, /IS DISTINCT FROM/i);
});
