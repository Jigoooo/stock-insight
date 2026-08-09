import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  executeMigration,
  migrationChecksum,
  planMigrations,
} from '../src/ops/run-schema-migrations.ts';

import { additiveAppMigrations } from '@stock-insight/db-schema';

const runnerUrl = new URL('../src/ops/run-schema-migrations.ts', import.meta.url);

const migration = (
  id: string,
  sql: string,
  executionMode: 'transactional' | 'non_transactional' = 'transactional',
) => ({ id, description: id, executionMode, tables: [], sql }) as never;

test('plans unapplied migrations in registry order and skips recorded ones', () => {
  const migrations = [migration('001_a', 'SELECT 1'), migration('002_b', 'SELECT 2')];
  const ledger = [
    {
      migration_id: '001_a',
      checksum: migrationChecksum(migrations[0]!),
      baselined: false,
      source: 'db-schema',
    },
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
    {
      migration_id: '001_a',
      checksum: migrationChecksum(applied),
      baselined: false,
      source: 'db-schema',
    },
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
  assert.equal(
    additiveAppMigrations.every(
      ({ executionMode }) =>
        executionMode === 'transactional' || executionMode === 'non_transactional',
    ),
    true,
  );
});

test('transactional migrations execute SQL and checksum ledger in one transaction', async () => {
  const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
  await executeMigration(
    { query: async (sql: string, params?: readonly unknown[]) => calls.push({ sql, params }) },
    migration('001_a', 'CREATE TABLE example(id int)'),
    { action: 'apply', checksum: 'checksum', id: '001_a' },
  );

  assert.deepEqual(
    calls.map(({ sql }) => sql.trim().split(/\s+/).slice(0, 2).join(' ')),
    ['BEGIN', 'CREATE TABLE', 'INSERT INTO', 'COMMIT'],
  );
});

test('non-transactional migrations execute concurrent DDL outside the ledger transaction', async () => {
  const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
  await executeMigration(
    { query: async (sql: string, params?: readonly unknown[]) => calls.push({ sql, params }) },
    migration(
      '090_index',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS example_idx ON example(id)',
      'non_transactional',
    ),
    { action: 'apply', checksum: 'checksum', id: '090_index' },
  );

  assert.equal(calls[0]?.sql, 'CREATE INDEX CONCURRENTLY IF NOT EXISTS example_idx ON example(id)');
  assert.equal(calls[1]?.sql, 'BEGIN');
  assert.match(calls[2]?.sql ?? '', /INSERT INTO public\.schema_migration/);
  assert.equal(calls[3]?.sql, 'COMMIT');
});

test('non-transactional mode refuses SQL other than idempotent concurrent index creation', async () => {
  await assert.rejects(
    () =>
      executeMigration(
        { query: async () => undefined },
        migration('090_bad', 'ALTER TABLE example ADD COLUMN value int', 'non_transactional'),
        { action: 'apply', checksum: 'checksum', id: '090_bad' },
      ),
    /CREATE INDEX CONCURRENTLY IF NOT EXISTS/,
  );
});

test('the runner refuses --baseline without --apply and holds an advisory lock', async () => {
  const source = await readFile(runnerUrl, 'utf8');

  // --baseline writes ledger rows, so it is a mutation like any other.
  assert.match(source, /--baseline records ledger rows and therefore requires --apply/);
  // Two concurrent runners would both see an empty ledger and both apply.
  assert.match(source, /pg_advisory_lock/);
  assert.match(source, /pg_advisory_unlock/);
  // Drift must stop the run before anything is written.
  assert.match(source, /schema migration drift/);
  // public.migration_runs is a pipeline job log; the schema ledger is separate.
  assert.match(source, /CREATE TABLE IF NOT EXISTS public\.schema_migration/);
});

test('ignores ledger rows recorded from another migration series', () => {
  // ops/db/migrations/222_* belongs to the legacy research app's series
  // (…220, 221, 222). It is recorded so it is not invisible, but it must never
  // be mistaken for one of ours — an id collision across series would otherwise
  // silently mark our migration as applied.
  const migrations = [migration('222_publication_record_revision', 'SELECT 1')];
  const foreign = [
    {
      migration_id: '222_publication_record_revision',
      checksum: 'whatever-the-file-hashed-to',
      baselined: true,
      source: 'ops/db/migrations',
    },
  ];

  const { plan, drift } = planMigrations(migrations, foreign, { baseline: false });

  assert.deepEqual(drift, [], 'a foreign-series row must not register as drift');
  assert.equal(plan[0]?.action, 'apply', 'our series must still be planned');
});
