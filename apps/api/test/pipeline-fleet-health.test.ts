import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const commonUrl = new URL('../scripts/pipeline_common.sh', import.meta.url);
const commonPath = fileURLToPath(commonUrl);

/**
 * The fleet-health line is printed by every wrapper on the way in. Six wrappers
 * call `pipeline_start_wrapper_attempt`, so a reporting call that could fail there
 * would turn a reporting gap into a fleet-wide outage — strictly worse than the
 * two-day blind spot it exists to close.
 *
 * These tests assert the property, not the wording: whatever goes wrong, the
 * function returns 0 and returns promptly.
 */
function runHook(dbUrl: string): { status: number; ms: number } {
  const script = `
set -euo pipefail
DB_URL=${JSON.stringify(dbUrl)}
source ${JSON.stringify(commonPath)}
pipeline_report_fleet_health
`;
  const startedAt = Date.now();
  let status = 0;
  try {
    execFileSync('bash', ['-c', script], { stdio: 'pipe', timeout: 60_000 });
  } catch (error) {
    status = (error as { status?: number }).status ?? 1;
  }
  return { status, ms: Date.now() - startedAt };
}

describe('pipeline fleet health hook', () => {
  it('survives an unusable database without failing the wrapper', () => {
    // `set -euo pipefail` is what every wrapper runs under, so a non-zero return
    // here would kill the run before it did any work.
    const empty = runHook('');
    assert.equal(empty.status, 0);
    assert.ok(empty.ms < 30_000, `hook took ${empty.ms}ms`);
  });

  it('bounds the whole attempt, connect included', async () => {
    const source = await readFile(commonUrl, 'utf8');
    // statement_timeout only starts once a session exists. Measured against an
    // unreachable host the bare call sat for two minutes on the TCP timeout, which
    // would have delayed every wrapper start by that much.
    assert.match(source, /PGCONNECT_TIMEOUT=\d+ timeout \d+ \\?\s*\n?\s*psql/);
    assert.match(source, /statement_timeout = '\d+s'/);
  });

  it('is called before the input gate and cannot report upward', async () => {
    const source = await readFile(commonUrl, 'utf8');
    assert.match(source, /pipeline_report_fleet_health \|\| true/);
    // Placement matters: pipeline_start_wrapper_attempt runs before
    // pipeline_require_db_assertion, so a wrapper blocked at its input gate still
    // prints the fleet's state on the way down.
    assert.ok(
      source.indexOf('pipeline_report_fleet_health || true') <
        source.indexOf('pipeline_start_wrapper_attempt() {') +
          source.slice(source.indexOf('pipeline_start_wrapper_attempt() {')).indexOf('\n}\n'),
    );
    // The function's own last statement, so a failing command inside it never
    // becomes the return value.
    assert.match(source, /\n  return 0\n\}/);
  });

  it('says nothing rather than something empty', async () => {
    const source = await readFile(commonUrl, 'utf8');
    // A wrapper log line claiming an empty fleet would read as "all wrappers gone"
    // when it actually means "the view is not there yet".
    assert.match(source, /if \[\[ -n "\$health" && "\$health" != "\[\]" \]\]/);
  });
});
