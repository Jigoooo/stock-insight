import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { migrationChecksum, planMigrations } from '../src/ops/run-schema-migrations.ts';

import { additiveAppMigrations } from '@stock-insight/db-schema';

const runnerUrl = new URL('../src/ops/run-schema-migrations.ts', import.meta.url);

const migration = (id: string, sql: string) => ({ id, description: id, tables: [], sql }) as never;

test('plans unapplied migrations in registry order and skips recorded ones', () => {
  const migrations = [migration('001_a', 'SELECT 1'), migration('002_b', 'SELECT 2')];
  const ledger = [
    { migration_id: '001_a', checksum: migrationChecksum(migrations[0]!), baselined: false },
  ];

  const { plan, drift } = planMigrations(migrations, ledger, { baseline: false });

  assert.deepEqual(
    plan.map((entry) => [entry.id, entry.action]),
    [
      ['001_a', 'skip'],
      ['002_b', 'apply'],
    ],
  );
  assert.deepEqual(drift, []);
});

test('baseline records without executing so an existing database can adopt the ledger', () => {
  // Production already had all 54 applied and no ledger. Replaying them would be
  // wrong; the runner must be able to record history it did not perform.
  const migrations = [migration('001_a', 'SELECT 1')];
  const { plan } = planMigrations(migrations, [], { baseline: true });
  assert.deepEqual(plan, [
    { id: '001_a', action: 'baseline', checksum: migrationChecksum(migrations[0]!) },
  ]);
});

test('detects a migration edited after it was applied', () => {
  // The one failure a ledger keyed on id alone cannot see: the id still matches
  // while the SQL the database ran no longer exists in the repository.
  const applied = migration('001_a', 'SELECT 1');
  const edited = migration('001_a', 'SELECT 1 -- reworded');
  const ledger = [
    { migration_id: '001_a', checksum: migrationChecksum(applied), baselined: false },
  ];

  const { drift } = planMigrations([edited], ledger, { baseline: false });

  assert.equal(drift.length, 1);
  assert.equal(drift[0]?.id, '001_a');
  assert.notEqual(drift[0]?.recorded, drift[0]?.current);
});

test('checksums cover the SQL, not the description', () => {
  const base = migration('001_a', 'SELECT 1');
  const renamed = { ...base, description: 'different wording' } as typeof base;
  assert.equal(migrationChecksum(base), migrationChecksum(renamed));
});

test('every registry id is unique and ordered', () => {
  const ids = additiveAppMigrations.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate migration id');
  assert.deepEqual(ids, [...ids].sort(), 'registry is not in id order');
});

test('the runner refuses --baseline without --apply and holds an advisory lock', async () => {
  const source = await readFile(runnerUrl, 'utf8');

  // --baseline writes ledger rows, so it is a mutation like any other.
  assert.match(source, /--baseline records ledger rows and therefore requires --apply/);
  // Two concurrent runners would both see an empty ledger and both apply.
  assert.match(source, /pg_advisory_xact_lock/);
  // Drift must stop the run before anything is written.
  assert.match(source, /schema migration drift/);
  // public.migration_runs is a pipeline job log; the schema ledger is separate.
  assert.match(source, /CREATE TABLE IF NOT EXISTS public\.schema_migration/);
});
