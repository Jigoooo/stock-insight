import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { precomputeCacheLedgerMigrationSql } from '../src/migrations/041_precompute_cache_ledger.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('P2-WE2 precompute cache ledger migration', () => {
  it('registers migration 041 and the precompute surfaces', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /precomputeCacheLedgerMigrationSql/);
    assert.match(indexSource, /id: '041_precompute_cache_ledger'/);
    for (const surface of [
      'precompute_policy',
      'precompute_cache_entry',
      'precompute_invalidation',
    ]) {
      assert.match(indexSource, new RegExp(`'${surface}'`));
    }
  });

  it('is purely additive and never rewrites history', () => {
    for (const token of destructiveTokens) {
      assert.doesNotMatch(precomputeCacheLedgerMigrationSql, token);
    }
  });

  it('defines the three-tier precompute strategy (§18.3)', () => {
    assert.match(
      precomputeCacheLedgerMigrationSql,
      /create table if not exists analytics\.precompute_policy\s*\(/i,
    );
    assert.match(
      precomputeCacheLedgerMigrationSql,
      /strategy\s+text\s+not null[\s\S]+always[\s\S]+conditional[\s\S]+on_demand/i,
    );
    assert.match(precomputeCacheLedgerMigrationSql, /P2-WE precompute policy seed/i);
  });

  it('requires a cache entry to carry all four version components in its key (§18.3)', () => {
    assert.match(
      precomputeCacheLedgerMigrationSql,
      /create table if not exists analytics\.precompute_cache_entry\s*\(/i,
    );
    // The four cache-key version components must be NOT NULL columns.
    assert.match(precomputeCacheLedgerMigrationSql, /snapshot_version\s+text\s+not null/i);
    assert.match(precomputeCacheLedgerMigrationSql, /query_version\s+text\s+not null/i);
    assert.match(precomputeCacheLedgerMigrationSql, /ontology_version\s+text\s+not null/i);
    assert.match(precomputeCacheLedgerMigrationSql, /model_version\s+text\s+not null/i);
    // The cache key itself is unique across the four components.
    assert.match(
      precomputeCacheLedgerMigrationSql,
      /unique\s*\(cache_namespace,\s*cache_key,\s*snapshot_version,\s*query_version,\s*ontology_version,\s*model_version\)/i,
    );
    // A guard forbids a cache entry whose key omits any version component.
    assert.match(
      precomputeCacheLedgerMigrationSql,
      /create or replace function analytics\.guard_precompute_cache_write/i,
    );
    assert.match(
      precomputeCacheLedgerMigrationSql,
      /cache entry requires all four version components/i,
    );
    assert.match(precomputeCacheLedgerMigrationSql, /is append-only/i);
  });

  it('models invalidation as an append-only ledger keyed by a version bump', () => {
    assert.match(
      precomputeCacheLedgerMigrationSql,
      /create table if not exists analytics\.precompute_invalidation\s*\(/i,
    );
    assert.match(
      precomputeCacheLedgerMigrationSql,
      /invalidation_reason\s+text\s+not null[\s\S]+snapshot_bump[\s\S]+ontology_bump[\s\S]+model_bump[\s\S]+manual/i,
    );
  });

  it('grants least-privilege with analytics USAGE and no delete', () => {
    assert.match(precomputeCacheLedgerMigrationSql, /grant usage on schema analytics/i);
    assert.match(precomputeCacheLedgerMigrationSql, /grant select, insert on/i);
    assert.match(precomputeCacheLedgerMigrationSql, /grant select on/i);
    assert.doesNotMatch(precomputeCacheLedgerMigrationSql, /grant\s+delete/i);
  });
});
