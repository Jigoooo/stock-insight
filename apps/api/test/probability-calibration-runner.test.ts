import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/analytics/run-probability-calibration.ts', import.meta.url),
  'utf8',
);

test('probability refresh uses one fixed PIT cutoff and segment-level daily upsert', () => {
  assert.equal((source.match(/outcome\.target_hit IS NOT NULL/g) ?? []).length, 2);
  assert.equal((source.match(/outcome\.known_at <= \$1::timestamptz/g) ?? []).length, 2);
  assert.match(source, /OUTCOMES_SQL, \[startedAt\.toISOString\(\)\]/);
  assert.match(source, /REFRESH_LABEL_CALIBRATION_SQL, \[\s*startedAt\.toISOString\(\)/);
  assert.doesNotMatch(source, /known_at <= clock_timestamp\(\)|computed_at::date = current_date/);

  assert.match(source, /ON CONFLICT \([\s\S]*computed_at AT TIME ZONE 'UTC'/);
  assert.match(source, /WHERE method = 'label_hit_rate_v2/);
  assert.match(
    source,
    /analytics\.calibration_profile\.computed_at <= EXCLUDED\.computed_at/,
  );
  assert.match(source, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
});
