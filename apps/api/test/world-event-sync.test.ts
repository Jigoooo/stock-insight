import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parityFailure } from '../src/ingest/run-world-event-sync.ts';

// Migration 032 projected knowledge.event into world.event once and asserted
// parity at the end. That assertion passed the day it ran and has been false
// every day since: knowledge.event grew, world.event did not, and by 2026-08-03
// the plane was missing 923 events. Nothing noticed, because
// serving.v_world_event_current_v1 reports a 100% yield over whatever it has.

const runner = readFileSync(
  new URL('../src/ingest/run-world-event-sync.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL(
    '../../../packages/db-schema/src/migrations/032_world_event_temporal_lineage.ts',
    import.meta.url,
  ),
  'utf8',
);

test('parity holds only when both events and revisions match the legacy count', () => {
  assert.equal(parityFailure({ legacyEvents: 10, worldEvents: 10, worldRevisions: 10 }), null);

  // The exact drift this runner exists to end.
  assert.match(
    parityFailure({ legacyEvents: 3964, worldEvents: 3041, worldRevisions: 3041 }) ?? '',
    /legacy=3964 events=3041 revisions=3041/,
  );
  // An event row without its revision is just as broken as a missing event: the
  // serving view joins the two, so a half-projected event is invisible anyway.
  assert.notEqual(parityFailure({ legacyEvents: 10, worldEvents: 10, worldRevisions: 9 }), null);
  // More world events than legacy means something else wrote the plane.
  assert.notEqual(parityFailure({ legacyEvents: 10, worldEvents: 11, worldRevisions: 11 }), null);
});

test('the projection invents nothing the migration did not', () => {
  // Same conservative lifecycle: legacy events are unverified, so the weakest
  // world state is the only honest one. Promoting them here would manufacture
  // confirmation the data does not have.
  assert.match(runner, /'rumored'/);
  assert.doesNotMatch(runner, /'confirmed'|'effective'|'announced'/);

  // Same rule as the migration: a participant row only where a real target
  // entity already exists.
  assert.match(runner, /WHERE event\.target_entity_id IS NOT NULL/);
  assert.match(migration, /WHERE event\.target_entity_id IS NOT NULL/);

  // Same key derivation, or the projection would fork into a second id space.
  for (const source of [runner, migration]) {
    assert.match(source, /'legacy-event:'\|\|event\.event_id::text/);
  }
});

test('a projection that cannot reach parity refuses to commit', () => {
  // Committing a partial plane would restore the "100% yield over a frozen set"
  // illusion — the view would look healthy over whatever landed.
  assert.match(
    runner,
    /const failure = parityFailure\(after\);\s*\n\s*if \(failure\) throw new Error\(failure\)/,
  );
  assert.match(runner, /await client\.query\('ROLLBACK'\)/);
});

test('revision_no is fixed at 1 rather than versioning legacy rows', () => {
  // There is no revision rule for a legacy event that changes, so writing
  // revision 2 would assert a history this projection cannot justify.
  assert.match(
    runner,
    /event_id, revision_no, lifecycle_state[\s\S]*SELECT world_event\.event_id, 1, 'rumored'/,
  );
});
