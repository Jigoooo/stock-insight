import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// A wrapper writes 'running' at start and rewrites it via its EXIT trap. When the
// process is killed without running that trap the row stays 'running' with
// finished_at NULL, counting as neither success nor failure. Two rows sat that way
// for 8 and 7 days before anything looked.

const reconciler = readFileSync(
  new URL('../src/ops/run-pipeline-run-reconcile.ts', import.meta.url).pathname,
  'utf8',
);
const newsWrapper = readFileSync(
  new URL('../scripts/run_news_pipeline.sh', import.meta.url).pathname,
  'utf8',
);
const alertUnit = readFileSync(
  new URL('../../../ops/systemd/user/stock-insight-pipeline-alert@.service', import.meta.url)
    .pathname,
  'utf8',
);

test('a cut-off run is recorded as killed, not as a failure', () => {
  // 'failed' would put a defect where there may not have been one, and would be
  // indistinguishable from a wrapper that ran its trap and reported honestly.
  assert.match(reconciler, /SET status = 'killed'/);
  assert.doesNotMatch(reconciler, /SET status = 'failed'/);
  assert.match(reconciler, /no completion recorded within/);
});

test('only rows past the largest unit timeout are touched', () => {
  // The longest run ever recorded is 6m30s, but a unit may legitimately run up to
  // its TimeoutStartSec — 90 minutes for market-enrichment. Closing a live run's
  // row would make the audit trail lie in the other direction.
  assert.match(reconciler, /DEFAULT_STALE_AFTER_HOURS = 2/);
  assert.match(reconciler, /value < 2/);
  assert.match(reconciler, /largest unit timeout is 90 minutes/);
});

test('the sweep is periodic rather than an OnFailure handler', () => {
  // sync_daily_to_postgres is a cron entry, so no OnFailure= can reach it; an
  // OnFailure= handler also gets the unit name rather than the wrapper attempt id.
  assert.match(newsWrapper, /run-pipeline-run-reconcile\.ts --apply/);
  assert.match(reconciler, /not systemd OnFailure=/);
});

test('the audit row uses columns that exist', () => {
  // public.migration_runs has (run_id, job_name, status, started_at, finished_at,
  // summary) and no `details`. A wrong column list throws after COMMIT, which
  // leaves the work done but the script exiting non-zero — and under `set -e` that
  // aborts the whole wrapper.
  assert.match(
    reconciler,
    /INSERT INTO public\.migration_runs \(run_id, job_name, status, started_at, finished_at, summary\)/,
  );
  assert.doesNotMatch(reconciler, /details\)/);
});

test('a quiet sweep leaves no audit row', () => {
  // This runs every 30 minutes; a row per sweep would bury the signal it exists for.
  assert.match(reconciler, /if \(\(closed\.rowCount \?\? 0\) > 0\) \{/);
});

test('the alert carries its own journal tag', () => {
  // research-app-logical-backup-alert@ tags its lines `research-app-logical-backup`.
  // Reusing it would file pipeline failures under a backup tag, where grepping the
  // tag — the only thing that makes a journald-only alert usable — would miss them.
  assert.match(alertUnit, /systemd-cat -t stock-insight-pipeline -p err/);
  assert.match(alertUnit, /PIPELINE_FAILURE unit=%i/);
});
