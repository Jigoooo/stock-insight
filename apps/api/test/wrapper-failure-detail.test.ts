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

  // The reporter is special: it READS PIPELINE_CURRENT_STEP to name the failure,
  // so it must not set it before that read or it would blame itself for every
  // failure. It may set it afterwards — when the reporter is itself what failed,
  // naming the previous stage is a misattribution. A real run recorded
  // `db-assertion:analytics` when that assertion had passed and the completion
  // UPDATE was what died, which is what this ordering check prevents.
  const reporter = 'pipeline_finish_wrapper_attempt';
  const reporterBody = source.match(new RegExp(`^${reporter}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'));
  assert.ok(reporterBody);
  const readsFallback = reporterBody[0].indexOf('failed_command="${PIPELINE_CURRENT_STEP:-}"');
  assert.ok(readsFallback >= 0, `${reporter} must fall back to the in-flight step`);
  for (const match of reporterBody[0].matchAll(/PIPELINE_CURRENT_STEP=/g)) {
    assert.ok(
      match.index! > readsFallback,
      `${reporter} assigns PIPELINE_CURRENT_STEP before reading it — the step being reported would be clobbered`,
    );
  }
  // And it must name itself when its own update is what failed.
  assert.match(reporterBody[0], /PIPELINE_CURRENT_STEP="wrapper-finish:/);
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
