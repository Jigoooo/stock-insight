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
 * Measured 2026-08-12 (later): 65 jobs, 56 wired, 9 exempt — run-scenario-thesis 가
 * 블록 9 의 생산자로 analytics 파이프라인에 붙었다. 이 테스트가 그것을 즉시
 * 잡았다: 생산자를 만들고 배선을 잊은 상태로 커밋하려던 참이었다.
 *
 * Measured 2026-08-12: 64 jobs, 55 wired, 9 exempt — run-k4-valuation-band joined the
 * analytics pipeline as block 7's producer. The exempt list did not move; the 44 → 64
 * drift between this line and the one above it is five days of jobs nobody re-counted,
 * which is exactly what re-measuring instead of editing in place is for.
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
  // A semantic snapshot asserts an exact PIT cutoff and whether the observation
  // is live or a historical reconstruction. A timer must not invent either.
  [
    'run-k4-semantic-snapshot.ts',
    'manual by design — PIT cutoff and reconstruction mode are operator decisions',
  ],
  // Written 2026-08-07, still run by hand. The two blockers recorded when it was
  // written are BOTH resolved: the first --apply was approved and ran (18,508 rows
  // across 6 series in market.macro_vintage at vintage_quality='approx_collected'),
  // and MACRO_SERIES_WINDOW_SQL now joins identifier_type IN ('FRED_SERIES',
  // 'ECOS_SERIES') so the collected series do reach the graph.
  // What is left is not a blocker but an undecided cadence: ECOS publishes on no
  // fixed schedule we have modelled, and nobody has picked one. Wiring it to a
  // timer without that decision would schedule re-collection at an arbitrary
  // interval, so it stays manual until the cadence is chosen.
  [
    'run-ecos-vintage.ts',
    'manual — collector works and reaches the graph; timer cadence undecided',
  ],
  // Migration 082 makes recovery a human decision on purpose: "a transition back
  // records who decided the condition had cleared", because an automatic recovery
  // would let a flapping SLO walk the product in and out of INFORMATION_ONLY
  // unattended. A timer here would be exactly that automation. The downgrade half
  // IS wired, in run_slo_observation.sh.
  [
    'run-safety-state-recovery.ts',
    'manual by design — 082 requires a named person to decide a recovery',
  ],
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
