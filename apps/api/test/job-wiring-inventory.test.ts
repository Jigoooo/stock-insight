import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

/**
 * Every runnable job must have a caller, or an explicit reason not to.
 *
 * This replaces the per-job wiring assertions that were accumulating. The defect
 * it watches for happened twice in one night: run-event-text-attribution and
 * run-event-topic-attribution were written, measured, and left out of every
 * pipeline script, so their results were a one-off backfill and 2,546 events
 * stayed unattributed. Nothing failed — a stage that does not exist cannot report
 * a failure — and the same would have happened to run-dart-supply-disclosure.
 *
 * A test per job would not have caught either, because the missing test is always
 * the one nobody wrote. Counting the inventory catches the NEXT one.
 *
 * Measured 2026-08-06: 38 jobs, 32 wired, 6 exempt.
 * Measured 2026-08-07: 43 jobs, 36 wired, 7 exempt. The count is re-measured
 * rather than edited in place, because the drift between the two lines is itself
 * the thing worth seeing.
 * Measured 2026-08-07 (later): 44 jobs, 37 wired, 7 exempt — run-source-contract-audit
 * joined the analytics pipeline.
 */

const SRC = new URL('../src/', import.meta.url);
const SCRIPTS = new URL('../scripts/', import.meta.url);

/**
 * Jobs with no pipeline caller, each with the reason it needs none. An entry here
 * is a claim that has to stay true — the test fails if an exempt job turns out to
 * be wired after all, so the list cannot quietly rot into a dumping ground.
 */
const EXEMPT = new Map<string, string>([
  // Ran once on 2026-07-07 and never since — verified in public.migration_runs.
  // One-shot historical backfills, not scheduled work.
  ['run-phase4.ts', 'one-shot backfill, ran 2026-07-07'],
  ['run-phase10.ts', 'one-shot backfill, ran 2026-07-07'],
  ['run-phase11.ts', 'one-shot backfill, ran 2026-07-07'],
  ['run-phase12.ts', 'one-shot backfill, ran 2026-07-07'],
  ['run-phase35.ts', 'one-shot backfill, ran 2026-07-07'],
  // Applying a migration is a decision, not a timer. Deliberately manual.
  ['run-schema-migrations.ts', 'manual by design — applying migrations is a decision'],
  // Written 2026-08-07, deliberately not wired yet. Two things have to be decided
  // before a timer runs it, and both are recorded in
  // docs/plan/ecos-collector-2026-08-07.md: the first --apply is a production
  // write the user has not approved, and the collected series cannot reach the
  // graph at all until MACRO_SERIES_WINDOW_SQL stops joining on FRED_SERIES only.
  // Wiring it now would schedule a job whose output nothing reads — which is the
  // exact defect this file exists to catch, so it is not done quietly.
  ['run-ecos-vintage.ts', 'pending first --apply approval and the FRED_SERIES-only graph join'],
]);

async function collectJobs(dir: URL, found: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      await collectJobs(new URL(`${entry.name}/`, dir), found);
    } else if (entry.name.startsWith('run-') && entry.name.endsWith('.ts')) {
      found.push(entry.name);
    }
  }
  return found;
}

async function pipelineText(): Promise<string> {
  const names = (await readdir(SCRIPTS)).filter((name) => name.endsWith('.sh'));
  const bodies = await Promise.all(names.map((name) => readFile(new URL(name, SCRIPTS), 'utf8')));
  return bodies.join('\n');
}

describe('job wiring inventory', () => {
  it('every runnable job is either wired into a pipeline or explicitly exempt', async () => {
    const jobs = await collectJobs(SRC);
    const scripts = await pipelineText();
    const orphans = jobs.filter((name) => !scripts.includes(name) && !EXEMPT.has(name));

    assert.deepEqual(
      orphans,
      [],
      `these jobs have no pipeline caller. Wire them, or add them to EXEMPT with the reason:\n  ${orphans.join('\n  ')}`,
    );
  });

  it('every exemption is still needed', async () => {
    // An exemption that became wired is stale bookkeeping, and a stale exemption
    // list is how this test would stop meaning anything.
    const scripts = await pipelineText();
    const nowWired = [...EXEMPT.keys()].filter((name) => scripts.includes(name));

    assert.deepEqual(
      nowWired,
      [],
      `these are wired now — remove them from EXEMPT:\n  ${nowWired.join('\n  ')}`,
    );
  });

  it('every exemption names a job that still exists', async () => {
    // The other way an allowlist rots: the job is deleted and the entry outlives
    // it, silently widening what the test permits.
    const jobs = new Set(await collectJobs(SRC));
    const missing = [...EXEMPT.keys()].filter((name) => !jobs.has(name));

    assert.deepEqual(
      missing,
      [],
      `these jobs no longer exist — remove them from EXEMPT:\n  ${missing.join('\n  ')}`,
    );
  });

  it('every exemption carries a reason, not just a name', async () => {
    for (const [name, reason] of EXEMPT) {
      assert.ok(reason.trim().length >= 20, `${name} needs a real reason, got: "${reason}"`);
    }
  });
});
