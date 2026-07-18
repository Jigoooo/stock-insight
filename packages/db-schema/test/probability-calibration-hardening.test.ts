import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../src/migrations/017_probability_calibration_hardening.ts', import.meta.url),
  'utf8',
);
const registry = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('probability hardening migration bounds source values and de-duplicates daily profiles', () => {
  for (const relation of ['stock.candidates', 'crypto.candidates', 'watchlist.predictions']) {
    assert.match(migration, new RegExp(`ALTER TABLE ${relation.replace('.', '\\.')}`));
  }
  assert.equal((migration.match(/predicted_probability BETWEEN 0 AND 1/g) ?? []).length, 3);
  assert.equal((migration.match(/NOT VALID/g) ?? []).length, 3);
  assert.equal((migration.match(/VALIDATE CONSTRAINT/g) ?? []).length, 3);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS uq_calibration_profile_v2_segment_utc_day/);
  assert.match(migration, /computed_at AT TIME ZONE 'UTC'/);
  assert.match(migration, /WHERE method = 'label_hit_rate_v2/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/);

  assert.match(registry, /id: '017_probability_calibration_hardening'/);
  assert.ok(
    registry.indexOf("id: '016_productionization_completion'") <
      registry.indexOf("id: '017_probability_calibration_hardening'"),
  );
});
