import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runnerSource = readFileSync(
  new URL('../src/personalization/run-feed-build.ts', import.meta.url),
  'utf8',
);
const readModelSource = readFileSync(
  new URL('../src/product/read-model.ts', import.meta.url),
  'utf8',
);

test('feed date follows each user profile timezone instead of UTC', () => {
  assert.match(
    runnerSource,
    /\(now\(\) AT TIME ZONE profile\.timezone\)::date::text AS feed_date/,
  );
  assert.match(runnerSource, /user\.feed_date/);
  assert.doesNotMatch(runnerSource, /toISOString\(\)\.slice\(0, 10\)/);
  assert.match(
    readModelSource,
    /JOIN personalization\.user_profile profile ON profile\.user_id = feed\.user_id/,
  );
  assert.match(
    readModelSource,
    /\(now\(\) AT TIME ZONE profile\.timezone\)::date/,
  );
  assert.doesNotMatch(readModelSource, /coalesce\(\$2::date, current_date\)/);
});
