import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const configUrl = new URL('../../../playwright.config.ts', import.meta.url);
const fixtureUrl = new URL('../../api/src/testing/e2e-fixtures.ts', import.meta.url);
const setupUrl = new URL('../../../e2e/global-setup.ts', import.meta.url);

describe('authenticated E2E fixture lifecycle', () => {
  it('uses a fenced, fixture-owned user without copying or deleting private user data', async () => {
    const [config, fixture, setup] = await Promise.all([
      readFile(configUrl, 'utf8'),
      readFile(fixtureUrl, 'utf8'),
      readFile(setupUrl, 'utf8'),
    ]);

    assert.match(config, /globalSetup:\s*'\.\/e2e\/global-setup\.ts'/);
    assert.doesNotMatch(config, /globalTeardown/);
    assert.match(setup, /acquireAuthenticatedE2eFixtureLease/);
    assert.match(setup, /PLAYWRIGHT_STORAGE_STATE is required for authenticated E2E/);
    assert.match(setup, /return async \(\) =>/);
    assert.match(setup, /releaseAuthenticatedE2eFixtureLease/);

    assert.match(fixture, /STOCK_INSIGHT_E2E_USER_ID/);
    assert.match(fixture, /PLAYWRIGHT_FIXTURE_DATABASE_URL/);
    assert.doesNotMatch(fixture, /process\.env\.DATABASE_WRITE_URL/);
    assert.match(fixture, /pg_try_advisory_lock/);
    assert.match(fixture, /pg_advisory_unlock/);
    assert.match(fixture, /set_config\('stock_insight\.user_id', \$1, true\)/);
    assert.match(fixture, /fixture user ownership mismatch/);
    assert.match(fixture, /non-fixture data/);
    assert.doesNotMatch(fixture, /source_user/i);
    assert.doesNotMatch(fixture, /JOIN\s+public\.user_feed_index\s+feed/i);
    assert.doesNotMatch(
      fixture,
      /DELETE FROM public\.user_feed_index WHERE user_id = \$1::uuid(?!\s+AND reason LIKE)/,
    );
    assert.match(fixture, /reason LIKE \$2/);
    assert.match(fixture, /history\.entry_key LIKE \$2/);
    assert.match(fixture, /projection_status IN \('available', 'stale'\)/);
    assert.match(fixture, /ORDER BY CASE projection_status WHEN 'available' THEN 0 ELSE 1 END/);
    assert.match(fixture, /if \(feed\.rowCount === 0\) throw/);
    assert.match(fixture, /if \(history\.rowCount !== 43\)/);
  });
});
