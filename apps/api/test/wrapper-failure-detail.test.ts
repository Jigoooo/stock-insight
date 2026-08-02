import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The analytics pipeline failed three times a night and every audit row said the
// same thing: `wrapper_failed`. Nothing more. The wrappers do install an ERR trap
// that captures $BASH_COMMAND, but every call they guard has the shape
// `pipeline_foo ... || exit $?`, and bash does not run the ERR trap for a command
// on the left of `||`. So the trap fired on none of the failures that actually
// happened.
//
// These tests are behavioural on purpose. A source-text assertion would not have
// caught the original bug — the trap was present and looked correct — and the one
// nearby test that does pattern-match a migration's source is exactly how a
// separate serving-view regression went unnoticed for two weeks.

const commonPath = new URL('../scripts/pipeline_common.sh', import.meta.url).pathname;
const wrapperNames = [
  'run_analytics_pipeline.sh',
  'run_knowledge_pipeline.sh',
  'run_market_enrichment.sh',
  'run_ohlcv_daily.sh',
];

/**
 * Runs a guarded `pipeline_* || exit $?` failure under the same trap wiring the
 * wrappers use, and reports what each source of failure detail produced.
 *
 * `pipeline_acquire_lock` is the probe because it fails on an unusable runtime
 * directory alone — no database, no network, no clock.
 */
function runGuardedFailure(): { errTrap: string; step: string } {
  const script = `
    set -euo pipefail
    source ${JSON.stringify(commonPath)}
    PIPELINE_FAILED_COMMAND=""
    trap 'PIPELINE_FAILED_COMMAND=$BASH_COMMAND' ERR
    trap 'printf "%s\\n%s\\n" "$PIPELINE_FAILED_COMMAND" "$PIPELINE_CURRENT_STEP"' EXIT
    pipeline_acquire_lock analytics || exit $?
  `;
  const result = spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: { ...process.env, XDG_RUNTIME_DIR: '/nonexistent-stock-insight-test' },
  });
  const [errTrap = '', step = ''] = result.stdout.split('\n');
  return { errTrap, step };
}

test('a guarded pipeline failure still names the step that died', () => {
  const { errTrap, step } = runGuardedFailure();

  // The load-bearing assertion: the wrapper can say WHICH step failed.
  assert.equal(step, 'lock:analytics');

  // And the reason the fallback above cannot be deleted: the ERR trap really does
  // come back empty here. If a future change makes this non-empty the fallback is
  // merely redundant, not wrong — but as long as it is empty, removing
  // PIPELINE_CURRENT_STEP returns the audit row to a bare `wrapper_failed`.
  assert.equal(
    errTrap,
    '',
    'ERR trap is suppressed by `||` — this is why the step fallback exists',
  );
});

test('pipeline_finish_wrapper_attempt falls back to the in-flight step', async () => {
  const source = await readFile(commonPath, 'utf8');
  // Ordering matters: an explicitly reported failing command must win over the
  // coarser step label, so the fallback only applies when $3 is absent.
  assert.match(
    source,
    /if \[\[ -z "\$failed_command" \]\]; then\s*\n\s*failed_command="\$\{PIPELINE_CURRENT_STEP:-\}"/,
  );
});

test('every function the wrappers guard with `|| exit $?` announces its step', async () => {
  const source = await readFile(commonPath, 'utf8');

  const guarded = new Set<string>();
  for (const name of wrapperNames) {
    const wrapper = await readFile(new URL(`../scripts/${name}`, import.meta.url).pathname, 'utf8');
    for (const match of wrapper.matchAll(/^(pipeline_[a-z_]+)\b[^\n]*\|\| exit \$\?/gm)) {
      guarded.add(match[1]!);
    }
    // `VAR=$(pipeline_foo) || exit $?` is the same suppression in assignment form.
    for (const match of wrapper.matchAll(/\$\((pipeline_[a-z_]+)[^)]*\)\s*\|\| exit \$\?/g)) {
      guarded.add(match[1]!);
    }
  }

  assert.ok(guarded.size > 0, 'expected to find guarded pipeline calls in the wrappers');

  // The reporter is the one function that must NOT announce a step. It runs from
  // the EXIT trap and reads PIPELINE_CURRENT_STEP to name the failure; if it set
  // the variable on entry it would overwrite the very step it is about to report,
  // and every failure would be attributed to the reporter itself.
  const reporter = 'pipeline_finish_wrapper_attempt';
  const reporterBody = source.match(new RegExp(`^${reporter}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'));
  assert.ok(reporterBody);
  assert.doesNotMatch(
    reporterBody[0],
    /pipeline_begin_step /,
    `${reporter} reads PIPELINE_CURRENT_STEP to report the failure — setting it here would clobber the step being reported`,
  );
  guarded.delete(reporter);

  for (const fn of guarded) {
    const body = source.match(new RegExp(`^${fn}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'));
    assert.ok(body, `${fn} is called by a wrapper but not defined in pipeline_common.sh`);
    assert.match(
      body[0],
      /pipeline_begin_step /,
      `${fn} is guarded with \`|| exit $?\`, so its failure never reaches the ERR trap — it must call pipeline_begin_step or the audit row loses the step name`,
    );
  }
});
