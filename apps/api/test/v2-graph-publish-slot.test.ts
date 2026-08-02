import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// A pipeline run claims one slot per KST day, so a second publish in one day is
// impossible by design. That is right for accidental double-runs, but it left no
// supported way to re-run after a code fix — the only option was deleting the
// claim row by hand, against the very table that prevents concurrent
// double-publishing, with no record that it happened.

const runner = new URL('../src/analytics/run-v2-graph-publish.ts', import.meta.url).pathname;
const source = readFileSync(runner, 'utf8');
const pipeline = readFileSync(
  new URL('../scripts/run_analytics_pipeline.sh', import.meta.url),
  'utf8',
);

function runWithArgs(args: readonly string[]): { status: number | null; stderr: string } {
  // No DATABASE_URL: argument validation must happen before anything opens a
  // connection, so a bad suffix fails fast instead of mid-publish.
  const result = spawnSync('node', [runner, ...args], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' },
    timeout: 30_000,
  });
  return { status: result.status, stderr: `${result.stderr}${result.stdout}` };
}

test('the suffix becomes part of the claim key rather than bypassing the claim', () => {
  // The guard must stay intact: a re-run takes a DIFFERENT slot, it does not
  // reclaim or delete an existing one.
  assert.match(source, /const naturalRunKey = `v2-graph-publish:\$\{slot\}\$\{SLOT_SUFFIX\}`/);
  assert.doesNotMatch(source, /DELETE FROM ops\.pipeline_run_claim/);
  assert.doesNotMatch(source, /--force/);
});

test('a malformed suffix is rejected before any database work', () => {
  for (const bad of ['UPPER', 'has space', 'semi;colon', "quote'", 'a'.repeat(33)]) {
    const { status, stderr } = runWithArgs(['--apply', '--slot-suffix', bad]);
    assert.notEqual(status, 0, `suffix ${JSON.stringify(bad)} should be rejected`);
    assert.match(
      stderr,
      /slot-suffix/,
      `suffix ${JSON.stringify(bad)} failed for the wrong reason`,
    );
  }
});

test('--slot-suffix without a value is rejected', () => {
  const missing = runWithArgs(['--slot-suffix']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /--slot-suffix requires a value/);

  const swallowedFlag = runWithArgs(['--slot-suffix', '--apply']);
  assert.notEqual(swallowedFlag.status, 0);
  assert.match(swallowedFlag.stderr, /--slot-suffix requires a value/);
});

test('the pipeline readback accepts a suffixed run', () => {
  // Exact equality here would make a supported re-run fail its own output
  // assertion — the failure mode that makes a feature look broken when it worked.
  assert.match(pipeline, /natural_run_key LIKE 'v2-graph-publish:'/);
  assert.doesNotMatch(pipeline, /natural_run_key = 'v2-graph-publish:'/);
});
