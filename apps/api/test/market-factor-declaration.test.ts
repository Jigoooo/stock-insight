import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  MACRO_COMOVEMENT_MODEL_CONFIG,
  MARKET_FACTOR_SOURCE,
} from '../src/relations/macro-comovement-model.ts';

/**
 * The factor the model DECLARES and the factor it USES must be the same thing.
 *
 * MACRO_COMOVEMENT edges cite MACRO_COMOVEMENT_MODEL_CONFIG as their evidence —
 * "a correlation without the configuration that produced it cannot be re-run, and
 * one that cannot be re-run cannot be contradicted". Before 2026-08-07 the config
 * recorded THAT a market factor was subtracted and how it was transformed, but not
 * WHICH one. Under that shape the KR factor could have been swapped and every
 * Korean edge would have gone on citing a config that no longer described it.
 *
 * So the sources are now named, passed to the SQL as parameters, and pinned here.
 */
const PUBLISHER = new URL('../src/analytics/run-v2-graph-publish.ts', import.meta.url);

describe('market factor declaration', () => {
  it('names a factor for every market the model controls for', () => {
    assert.deepEqual(Object.keys(MARKET_FACTOR_SOURCE).sort(), ['KR', 'US']);
    for (const [market, source] of Object.entries(MARKET_FACTOR_SOURCE)) {
      assert.ok(source.trim().length > 0, `${market} factor must name a source`);
    }
  });

  it('carries the declaration into the config the edges cite as evidence', () => {
    assert.equal(
      MACRO_COMOVEMENT_MODEL_CONFIG.marketFactorByMarket,
      MARKET_FACTOR_SOURCE,
      'the config must expose the same object, not a copy that can drift',
    );
  });

  it('takes the factor from parameters rather than hardcoding it in the SQL', async () => {
    const source = await readFile(PUBLISHER, 'utf8');
    const sql = source.slice(
      source.indexOf('const MARKET_FACTOR_SQL'),
      source.indexOf('const MARKET_FACTOR_SQL') + 2_000,
    );
    // A literal series key or ticker inside the SQL is how the two drift apart:
    // the config would keep claiming one factor while the query used another.
    assert.doesNotMatch(sql, /ecos:802Y001/, 'KR factor must arrive as a parameter');
    assert.doesNotMatch(sql, /'\^GSPC'/, 'US factor must arrive as a parameter');
    assert.match(sql, /vintage\.series_key = \$3/);
    assert.match(sql, /bar\.symbol = \$4/);
    assert.match(
      source,
      /MARKET_FACTOR_SOURCE\.KR,\s*MARKET_FACTOR_SOURCE\.US,/,
      'the call site must pass the declared sources',
    );
  });

  it('reads the KR factor point-in-time, like every other vintage', async () => {
    const source = await readFile(PUBLISHER, 'utf8');
    const sql = source.slice(
      source.indexOf('const MARKET_FACTOR_SQL'),
      source.indexOf('const MARKET_FACTOR_SQL') + 2_000,
    );
    // Taking the newest KOSPI value outright would use a revision that did not
    // exist at the time and make the model look prescient — the same rule the
    // series windows follow.
    assert.match(sql, /vintage\.available_at <= \$1/);
    assert.match(sql, /vintage\.vintage_date DESC/);
  });
});
