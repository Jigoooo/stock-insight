import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

/**
 * A1/A2 — a job nobody runs is a backfill, not infrastructure.
 *
 * Both attribution jobs were written and measured (2026-08-03 and 2026-08-05) and
 * neither appeared in any pipeline script. They ran once by hand, so every event
 * that arrived afterwards stayed unattributed: 2,546 of 4,245 on 2026-08-06, and
 * `loadRecentEvents` filters on `target_entity_id IS NOT NULL`, so those events
 * could not even begin an impact path.
 *
 * Nothing failed. The pipeline was green the whole time, because a stage that does
 * not exist cannot report a failure. That is what this file watches for.
 */

const PIPELINE = new URL('../scripts/run_knowledge_pipeline.sh', import.meta.url);

const ATTRIBUTION_JOBS = [
  'run-event-text-attribution.ts',
  'run-event-topic-attribution.ts',
] as const;

describe('event attribution is wired into the knowledge pipeline', () => {
  it('runs both attribution jobs with --apply', async () => {
    const script = await readFile(PIPELINE, 'utf8');
    for (const job of ATTRIBUTION_JOBS) {
      assert.match(
        script,
        new RegExp(`${job.replace('.', '\\.')} --apply`),
        `${job} must run in the pipeline — writing it is not the same as running it`,
      );
    }
  });

  it('records a stage row for each, so a failure names itself', async () => {
    const script = await readFile(PIPELINE, 'utf8');
    for (const stage of [
      'stock-insight-event-text-attribution-stage',
      'stock-insight-event-topic-attribution-stage',
    ]) {
      assert.match(script, new RegExp(`pipeline_record_stage_success ${stage}`), stage);
    }
  });

  it('places attribution after FK resolution and before the world projection', async () => {
    const script = await readFile(PIPELINE, 'utf8');
    const at = (needle: string): number => {
      const index = script.indexOf(needle);
      assert.notEqual(index, -1, `${needle} missing from the pipeline`);
      return index;
    };

    // After FK resolution: the identifier chain is the strongest evidence and
    // should claim an event before any text match is tried.
    const resolution = at('run-event-entity-resolution.ts --apply');
    // Before the projection: knowledge.event is projected into the world plane and
    // event participants are derived from target_entity_id, so attributing after
    // projecting would leave this run's participants empty until the next run.
    const projection = at('run-world-event-sync.ts --apply');
    const company = at('run-event-text-attribution.ts --apply');
    const topic = at('run-event-topic-attribution.ts --apply');

    assert.ok(resolution < company, 'FK resolution must run before text attribution');
    assert.ok(topic < projection, 'attribution must run before the world projection');

    // Company before topic. The queries already guarantee the priority — the topic
    // job only fills `IS NULL` and can never overwrite a company answer — but
    // running the better answer first means an event is not attributed twice in
    // one pass.
    assert.ok(company < topic, 'company attribution must run before topic attribution');
  });

  it('reports the unattributed backlog from one shared definition', async () => {
    // Two jobs counting for themselves would drift, and the two totals in a single
    // pipeline run would stop being comparable — which is the only property that
    // makes them worth reading together.
    for (const job of ATTRIBUTION_JOBS) {
      const source = await readFile(new URL(`../src/ingest/${job}`, import.meta.url), 'utf8');
      assert.match(
        source,
        /readUnattributedGauge/,
        `${job} must report the backlog from event-attribution-gauge.ts`,
      );
      assert.doesNotMatch(
        source,
        /count\(\*\)[^;]*target_entity_id IS NULL/s,
        `${job} must not count the backlog itself`,
      );
    }
  });

  it('writes an audit row on every apply run, not only when something moved', async () => {
    // `attached > 0` wrote a row exactly on the runs where the backlog moved and
    // stayed silent while it sat still, so the gauge could never be read as a
    // series. A run with a row and `attached: 0` is the observation that matters.
    for (const job of ATTRIBUTION_JOBS) {
      const source = await readFile(new URL(`../src/ingest/${job}`, import.meta.url), 'utf8');
      assert.doesNotMatch(
        source,
        /if \(APPLY && attached > 0\)/,
        `${job} must record the run even when it attached nothing`,
      );
    }
  });
});
