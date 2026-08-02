import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  classifyIdentityState,
  normalizeCik,
  type IdentityState,
} from '../src/ingest/core-identity-sync-contract.ts';

const runnerUrl = new URL('../src/ingest/run-core-identity-sync.ts', import.meta.url);
const pipelineUrl = new URL('../scripts/run_analytics_pipeline.sh', import.meta.url);

test('core identity sync is additive, canonical-name gated, and transactionally audited', async () => {
  const runner = await readFile(runnerUrl, 'utf8');

  assert.match(runner, /LEFT JOIN public\.company_profiles/);
  assert.match(runner, /profile\.name/);
  // Rows that cannot be minted yet are still recognised and reported — they are
  // just no longer fatal. The audit row must name them and say why, so a stalled
  // ticker is visible in migration_runs instead of only in a crash.
  assert.match(runner, /deferredRows/);
  assert.match(runner, /deferredReason/);
  assert.match(runner, /deferred: \[\.\.\.deferred, \.\.\.notReady\]/);
  assert.doesNotMatch(runner, /throw new Error\(\s*`core identity sync blocked/);
  assert.match(runner, /BEGIN/);
  assert.match(runner, /pg_advisory_xact_lock/);
  assert.match(runner, /INSERT INTO core\.entity/);
  assert.match(runner, /'Stock'/);
  assert.match(runner, /'Company'/);
  assert.match(runner, /'INTERNAL_KEY'/);
  assert.match(runner, /'CIK'/);
  assert.match(runner, /INSERT INTO core\.listing/);
  assert.match(runner, /classifyIdentityState/);
  assert.match(runner, /listing_count/);
  assert.match(runner, /RETURNING security_entity_id/);
  assert.match(runner, /listing readback/);
  assert.match(runner, /post-write identity verification/);
  assert.match(runner, /INSERT INTO public\.migration_runs/);
  assert.match(runner, /COMMIT/);
  assert.match(runner, /ROLLBACK/);
  assert.doesNotMatch(runner, /DELETE FROM core\.|UPDATE core\./);
});

test('core identity sync rejects missing or synthetic SEC CIK values instead of padding them', async () => {
  const runner = await readFile(runnerUrl, 'utf8');

  assert.match(runner, /profile\.profile_json\s*->>\s*'cik'\s+AS cik/);
  assert.doesNotMatch(runner, /lpad\s*\(/);
  assert.doesNotMatch(runner, /replace\(\/\\D\/g/);
  assert.match(runner, /normalizeCik/);

  assert.equal(normalizeCik('0000320193'), '0000320193');
  for (const invalid of [
    null,
    '',
    '0000000000',
    '320193',
    '-000320193',
    ' 0000320193 ',
    'phone: 123-456-7890',
    '0000320193\n',
    '0000320193\r\n',
    '0000320193\u2028',
    '0000320193\u2029',
  ]) {
    assert.equal(normalizeCik(invalid), null);
  }
});

test('existing identity state is complete only when every current binding agrees', () => {
  const complete: IdentityState = {
    entityKey: 'US:FTNT',
    market: 'US',
    ticker: 'FTNT',
    expectedExchangeKey: 'EXCHANGE:US_COMPOSITE',
    cik: '0001262039',
    stockId: 10,
    stockType: 'Stock',
    listingCount: 1,
    listingOwner: 10,
    listingExchangeKey: 'EXCHANGE:US_COMPOSITE',
    tickerIdentifierCount: 1,
    tickerIdentifierOwner: 10,
    tickerIdentifierNamespace: 'EXCHANGE:US_COMPOSITE',
    companyId: 20,
    companyType: 'Company',
    cikOwner: 20,
    cikOwnerType: 'Company',
  };
  assert.equal(classifyIdentityState(complete), 'complete');
  assert.equal(
    classifyIdentityState({ ...complete, cikOwner: null, cikOwnerType: null }),
    'repairable',
  );
  assert.equal(
    classifyIdentityState({ ...complete, cik: null, cikOwner: null, cikOwnerType: null }),
    'complete',
  );
  assert.equal(
    classifyIdentityState({
      ...complete,
      entityKey: 'KR:000120',
      market: 'KR',
      cik: null,
      expectedExchangeKey: null,
      cikOwner: null,
      cikOwnerType: null,
      listingExchangeKey: 'EXCHANGE:KOSPI',
      tickerIdentifierNamespace: 'EXCHANGE:KOSPI',
    }),
    'complete',
  );
  for (const broken of [
    { ...complete, stockType: 'Company' },
    { ...complete, listingOwner: 99 },
    { ...complete, tickerIdentifierOwner: 99 },
    { ...complete, companyType: 'Stock' },
    { ...complete, cikOwner: 99 },
  ]) {
    assert.throws(() => classifyIdentityState(broken));
  }
  assert.equal(
    classifyIdentityState({
      ...complete,
      stockId: null,
      stockType: null,
      listingCount: 0,
      listingOwner: null,
      listingExchangeKey: null,
      tickerIdentifierCount: 0,
      tickerIdentifierOwner: null,
      tickerIdentifierNamespace: null,
      companyId: null,
      companyType: null,
      cikOwner: null,
      cikOwnerType: null,
    }),
    'missing',
  );
  assert.throws(() =>
    classifyIdentityState({ ...complete, stockId: null, stockType: null, listingOwner: 99 }),
  );
  // A brand-new US ticker without a CIK is deferred, not fatal. New tickers land
  // in public.entities as soon as news or price ingestion sees them, while their
  // CIK only arrives with the weekly fundamentals backfill — and some never
  // resolve (absent from SEC company_tickers.json). Failing here let one
  // unresolvable ticker kill the whole nightly analytics pipeline.
  const newUsWithoutCik = {
    ...complete,
    cik: null,
    stockId: null,
    stockType: null,
    listingCount: 0,
    listingOwner: null,
    listingExchangeKey: null,
    tickerIdentifierCount: 0,
    tickerIdentifierOwner: null,
    tickerIdentifierNamespace: null,
    companyId: null,
    companyType: null,
    cikOwner: null,
    cikOwnerType: null,
  };
  assert.equal(classifyIdentityState(newUsWithoutCik), 'deferred');
  // Same for a new identity whose authoritative exchange is not known yet.
  assert.equal(
    classifyIdentityState({
      ...newUsWithoutCik,
      entityKey: 'KR:000125',
      market: 'KR',
      expectedExchangeKey: null,
    }),
    'deferred',
  );
  // Readiness must never mask a contradiction: half-built state under a ticker we
  // believe is new still throws, even when the CIK is absent.
  assert.throws(() => classifyIdentityState({ ...newUsWithoutCik, listingCount: 1 }));
  assert.throws(() => classifyIdentityState({ ...newUsWithoutCik, tickerIdentifierOwner: 99 }));
});

test('analytics runs all nine stages in order with an adjacent receipt per command', async () => {
  const pipeline = await readFile(pipelineUrl, 'utf8');
  const lines = pipeline.split('\n').map((line) => line.trim());
  const expected = [
    ['run-core-identity-sync.ts', 'stock-insight-core-identity-sync-stage'],
    ['run-feature-snapshot.ts', 'stock-insight-feature-snapshot-stage'],
    ['run-graph-inference.ts', 'stock-insight-graph-inference-stage'],
    ['run-report-publish.ts', 'stock-insight-report-publish-stage'],
    ['run-feed-build.ts', 'stock-insight-feed-build-stage'],
    ['run-probability-calibration.ts', 'stock-insight-probability-calibration-stage'],
    ['run-v2-graph-publish.ts', 'stock-insight-v2-graph-publish-stage'],
    ['run-v2-analytics-publish.ts', 'stock-insight-v2-l5-publish-stage'],
    ['run-outbox-delivery.ts', 'stock-insight-outbox-delivery-stage'],
  ] as const;
  const stageLines = lines.filter((line) => /node apps\/api\/src\/.+\.ts/.test(line));
  assert.deepEqual(
    stageLines.map((line) => expected.find(([command]) => line.includes(command))?.[0]),
    expected.map(([command]) => command),
  );
  for (const [command, receipt] of expected) {
    const commandIndex = lines.findIndex((line) => line.includes(command));
    assert.ok(commandIndex >= 0);
    assert.match(
      lines[commandIndex + 1] ?? '',
      new RegExp(`^pipeline_record_stage_success ${receipt} `),
    );
  }
  assert.match(pipeline, /count\(DISTINCT job_name\)[\s\S]*?\) = 9/);
});
