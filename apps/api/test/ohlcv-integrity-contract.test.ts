import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runnerUrl = new URL('../src/ingest/run-ohlcv.ts', import.meta.url);
const collectorUrl = new URL('../scripts/fetch_ohlcv.py', import.meta.url);
const corporateRunnerUrl = new URL('../src/ingest/run-corporate-actions.ts', import.meta.url);
const corporateCollectorUrl = new URL('../scripts/fetch_corporate_actions.py', import.meta.url);
const wrapperUrl = new URL('../scripts/run_ohlcv_daily.sh', import.meta.url);
const pythonProjectUrl = new URL('../python-runtime/pyproject.toml', import.meta.url);
const pythonLockUrl = new URL('../python-runtime/uv.lock', import.meta.url);
const provisionUrl = new URL(
  '../../../ops/scripts/provision-stock-insight-python.sh',
  import.meta.url,
);

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

test('collectors use one app-owned locked Python runtime instead of the Hermes Agent venv', async () => {
  const [runner, corporateRunner, collector, corporateCollector, project, lock, provision] =
    await Promise.all([
      readFile(runnerUrl, 'utf8'),
      readFile(corporateRunnerUrl, 'utf8'),
      readFile(collectorUrl, 'utf8'),
      readFile(corporateCollectorUrl, 'utf8'),
      readFile(pythonProjectUrl, 'utf8'),
      readFile(pythonLockUrl, 'utf8'),
      readFile(provisionUrl, 'utf8'),
    ]);

  for (const source of [runner, corporateRunner]) {
    assert.match(source, /\.local\/share\/stock-insight\/python\/bin\/python3/);
    assert.doesNotMatch(source, /hermes-agent\/venv/);
  }
  for (const source of [collector, corporateCollector]) {
    assert.match(source, /^#!\/usr\/bin\/env python3/);
    assert.doesNotMatch(source, /hermes-agent\/venv/);
  }
  assert.match(project, /pandas/);
  assert.match(project, /yfinance/);
  assert.match(lock, /name = "pandas"/);
  assert.match(lock, /name = "yfinance"/);
  assert.match(provision, /UV_PROJECT_ENVIRONMENT/);
  assert.match(provision, /uv sync --frozen/);
});
