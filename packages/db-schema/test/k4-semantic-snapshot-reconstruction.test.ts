import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { additiveAppMigrations } from '../src/index.ts';
import { k4SemanticSnapshotReconstructionMigrationSql } from '../src/migrations/094_k4_semantic_snapshot_reconstruction.ts';

describe('094 K4 semantic snapshot reconstruction', () => {
  it('is registered after K4 receipt privilege hardening', () => {
    // Anchored on this migration's own position rather than the tail. A
    // tail-relative index asserts "nothing was ever added after me", which is a
    // claim this test has no business making — 095 broke both of these at once.
    const index = additiveAppMigrations.findIndex(
      ({ id }) => id === '094_k4_semantic_snapshot_reconstruction',
    );
    assert.notEqual(index, -1);
    assert.equal(additiveAppMigrations[index - 1]?.id, '093_k4_run_receipt_privilege_hardening');
  });

  it('separates honest creation time from a reconstructed knowledge cutoff', () => {
    assert.match(k4SemanticSnapshotReconstructionMigrationSql, /construction_mode TEXT/);
    assert.match(k4SemanticSnapshotReconstructionMigrationSql, /historical_reconstruction/);
    assert.match(k4SemanticSnapshotReconstructionMigrationSql, /knowledge_cutoff TIMESTAMPTZ/);
    assert.match(k4SemanticSnapshotReconstructionMigrationSql, /reconstructed_at TIMESTAMPTZ/);
    assert.match(
      k4SemanticSnapshotReconstructionMigrationSql,
      /knowledge_cutoff <= reconstructed_at/,
    );
    assert.doesNotMatch(
      k4SemanticSnapshotReconstructionMigrationSql,
      /UPDATE governance\.semantic_snapshot[\s\S]*created_at/,
    );
  });

  it('keeps both live and reconstructed time bases immutable', () => {
    assert.match(
      k4SemanticSnapshotReconstructionMigrationSql,
      /NEW\.construction_mode IS DISTINCT FROM OLD\.construction_mode/,
    );
    assert.match(
      k4SemanticSnapshotReconstructionMigrationSql,
      /NEW\.knowledge_cutoff IS DISTINCT FROM OLD\.knowledge_cutoff/,
    );
    assert.match(
      k4SemanticSnapshotReconstructionMigrationSql,
      /NEW\.reconstructed_at IS DISTINCT FROM OLD\.reconstructed_at/,
    );
  });

  it('indexes the exact time basis selected by K4', () => {
    assert.match(
      k4SemanticSnapshotReconstructionMigrationSql,
      /semantic_snapshot_knowledge_cutoff_idx/,
    );
  });
});
