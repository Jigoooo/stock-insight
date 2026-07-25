import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const apiRoot = new URL('..', import.meta.url).pathname;
const scripts = ['run_news_pipeline.sh', 'run_company_fundamentals.sh', 'run_ohlcv_daily.sh'];

function read(relative: string): string {
  return readFileSync(join(apiRoot, relative), 'utf8');
}

test('pipeline wrappers use the private user runtime directory and report lock contention', () => {
  for (const script of scripts) {
    const body = read(`scripts/${script}`);
    assert.doesNotMatch(body, /LOCK=\/tmp\//);
    assert.match(body, /pipeline_acquire_lock/);
    assert.match(body, /exit \$\?/);
  }

  const common = read('scripts/pipeline_common.sh');
  assert.match(common, /XDG_RUNTIME_DIR/);
  assert.match(common, /install -d -m 700/);
  assert.match(common, /chmod 600/);
  assert.match(common, /return 75/);
  assert.doesNotMatch(common, /--head|--location/);
  assert.match(common, /--connect-timeout 3 --max-time 5/);
});

test('network checks and quality readbacks fail closed', () => {
  for (const script of scripts) {
    const body = read(`scripts/${script}`);
    assert.match(body, /pipeline_wait_for_network/);
    assert.match(body, /pipeline_require_db_assertion/);
  }
  const fundamentals = read('scripts/run_company_fundamentals.sh');
  assert.match(fundamentals, /STOCK_INSIGHT_ROOT/);
  assert.match(fundamentals, /endsWith\('_cache_fallback'\)/);
  assert.doesNotMatch(fundamentals, /RC=75/);
  assert.match(fundamentals, /fresh cache fallback was applied; quality gate passed/);
  const secRunner = read('src/backfill/run-sec-edgar.ts');
  assert.match(secRunner, /stock-insight research contact@jigooo\.com/);
  assert.match(secRunner, /assertSecMomentumFallbackReady/);
  assert.match(secRunner, /createSecFetcher/);
  assert.match(secRunner, /cacheRunId/);
  assert.match(secRunner, /runId/);
  assert.doesNotMatch(secRunner, /function createSecFetcher/);
  const secFetcher = read('src/backfill/sec-edgar-fetcher.ts');
  assert.match(secFetcher, /new SecEdgarHttpError\(response\.status, url\)/);
  assert.match(secFetcher, /isSecEdgarAccessBlocked\(error\)/);
  assert.doesNotMatch(secFetcher, /HTTP 403.*test\(/);
});

test('versioned systemd units avoid a missing user network target and retry fundamentals', () => {
  for (const name of ['news', 'fundamentals', 'ohlcv']) {
    const service = read(`systemd/stock-insight-${name}.service`);
    assert.doesNotMatch(service, /network-online\.target/);
  }
  const fundamentals = read('systemd/stock-insight-fundamentals.service');
  assert.match(fundamentals, /Restart=on-failure/);
  assert.match(fundamentals, /RestartSec=15min/);
  assert.match(fundamentals, /StartLimitBurst=4/);
});
