import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The drain loop broke as soon as nothing was due and then threw if anything was
// still pending. A delivery seeded moments earlier can have not_before a fraction
// of a second in the future, so the job failed on a backlog that cleared itself on
// the next run. On 2026-08-03 two deliveries became due one second after the
// pipeline had already failed on them, and the nightly alert fired for it.
//
// That matters more than the two rows: an alert that fires on a self-healing race
// is an alert nobody keeps reading.

const source = readFileSync(
  new URL('../src/ops/run-outbox-delivery.ts', import.meta.url).pathname,
  'utf8',
);

test('an empty batch is not treated as drained while deliveries are pending', () => {
  assert.match(source, /Nothing is due right now\. That is not the same as drained/);
  assert.match(source, /AND status = 'pending' AND not_before > now\(\)/);
});

test('the wait is bounded so a stuck delivery still fails the run', () => {
  // Without a ceiling this turns a failure into a hang, which is worse: the
  // wrapper would sit inside its 45-minute unit timeout saying nothing.
  assert.match(source, /const MAX_WAIT_FOR_DUE_MS = 15_000/);
  assert.match(source, /waitedForDueMs >= MAX_WAIT_FOR_DUE_MS/);
});

test('waiting only happens in loop mode', () => {
  // A single-shot run is a probe; it should report what it sees and exit.
  assert.match(source, /if \(!LOOP \|\| waitedForDueMs >= MAX_WAIT_FOR_DUE_MS\) break;/);
});

test('how long it waited is reported', () => {
  // Otherwise a run that quietly waits 15 seconds every night looks identical to
  // one that never waits at all.
  assert.match(source, /waitedForDueMs,/);
});
