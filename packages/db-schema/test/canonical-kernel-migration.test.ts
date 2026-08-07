import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { semanticSnapshotMigrationSql } from '../src/migrations/078_semantic_snapshot.ts';
import { analysisInformationSetMigrationSql } from '../src/migrations/079_analysis_information_set.ts';
import { sourcePitQualityMigrationSql } from '../src/migrations/080_source_pit_quality.ts';

const MIGRATIONS = [
  ['078_semantic_snapshot', semanticSnapshotMigrationSql],
  ['079_analysis_information_set', analysisInformationSetMigrationSql],
  ['080_source_pit_quality', sourcePitQualityMigrationSql],
] as const;

// Same list migration 031's test uses. These migrations must be purely additive:
// the schema ledger has no `down`, so anything destructive is unrecoverable.
const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
  /\bdrop\s+column\b/i,
];

const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('K1 canonical kernel migrations — registration', () => {
  it('registers 078, 079 and 080 in dependency order', () => {
    const positions = MIGRATIONS.map(([id]) => {
      const at = indexSource.indexOf(`id: '${id}'`);
      assert.notEqual(at, -1, `${id} is not registered`);
      return at;
    });
    // 079 references 078's table by foreign key, so it must run after it.
    assert.ok(positions[0]! < positions[1]!, '078 must be registered before 079');
    assert.ok(positions[1]! < positions[2]!, '079 must be registered before 080');
  });

  it('exports every migration sql from the package index', () => {
    for (const name of [
      'semanticSnapshotMigrationSql',
      'analysisInformationSetMigrationSql',
      'sourcePitQualityMigrationSql',
    ]) {
      assert.match(indexSource, new RegExp(`\\b${name}\\b`), `${name} is not exported`);
    }
  });
});

describe('K1 canonical kernel migrations — additive only', () => {
  for (const [id, sql] of MIGRATIONS) {
    it(`${id} contains no destructive statement`, () => {
      for (const token of destructiveTokens) {
        assert.doesNotMatch(sql, token, `${id} matches ${token}`);
      }
    });

    it(`${id} creates tables with IF NOT EXISTS so a re-run is a no-op`, () => {
      const creates = sql.match(/CREATE TABLE(?! IF NOT EXISTS)/gi);
      assert.equal(creates, null, `${id} has a CREATE TABLE without IF NOT EXISTS`);
    });
  }
});

describe('078 semantic snapshot', () => {
  it('is append-only apart from the seal/supersede state machine', () => {
    assert.match(
      semanticSnapshotMigrationSql,
      /BEFORE DELETE OR UPDATE ON governance\.semantic_snapshot/,
    );
    assert.match(semanticSnapshotMigrationSql, /append-only \(delete rejected/);
    // Pinned versions must be immutable even while the state column moves.
    assert.match(semanticSnapshotMigrationSql, /pinned versions are immutable/);
    assert.match(semanticSnapshotMigrationSql, /illegal transition/);
  });

  it('keeps unpinned dimensions nullable rather than defaulting to a revision', () => {
    // A dimension that does not exist yet must read as "not pinned", not as 0 —
    // canonical/03 §7 draws the same none/unknown distinction.
    assert.doesNotMatch(semanticSnapshotMigrationSql, /ontology_revision_id\s+BIGINT NOT NULL/);
    assert.doesNotMatch(semanticSnapshotMigrationSql, /metric_definition_revision\s+TEXT NOT NULL/);
  });

  it('cannot supersede itself', () => {
    assert.match(
      semanticSnapshotMigrationSql,
      /supersedes_semantic_snapshot_id <> semantic_snapshot_id/,
    );
  });
});

describe('079 analysis information set — leak constraints in the database', () => {
  // These mirror packages/contracts/src/analysis-information-set.ts. Both layers
  // enforce them because a row can be produced by SQL that never saw the contract.
  it('rejects EX_ANTE/LIVE admitting post-cutoff market observation (REQ-KERN-001)', () => {
    assert.match(
      analysisInformationSetMigrationSql,
      /analysis_information_set_no_market_leak[\s\S]*market_observation_cutoff <= valid_cutoff/,
    );
  });

  it('rejects an impossible collection order', () => {
    assert.match(
      analysisInformationSetMigrationSql,
      /analysis_information_set_collection_order[\s\S]*system_known_cutoff >= source_available_cutoff/,
    );
  });

  it('rejects EX_ANTE reading knowledge acquired after the cutoff (REQ-PIT-001)', () => {
    assert.match(
      analysisInformationSetMigrationSql,
      /analysis_information_set_no_hindsight[\s\S]*system_known_cutoff <= valid_cutoff/,
    );
  });

  it('rejects an embargo that has already lifted (REQ-KERN-002)', () => {
    assert.match(
      analysisInformationSetMigrationSql,
      /analysis_information_set_embargo_effective[\s\S]*outcome_embargo_until >= valid_cutoff/,
    );
  });

  it('gives the cutoffs no default, so now() cannot become a cutoff (REQ-PIT-003)', () => {
    for (const column of [
      'valid_cutoff',
      'source_available_cutoff',
      'system_known_cutoff',
      'market_observation_cutoff',
    ]) {
      assert.match(
        analysisInformationSetMigrationSql,
        new RegExp(`${column}\\s+TIMESTAMPTZ NOT NULL,`),
        `${column} must be NOT NULL with no default`,
      );
      assert.doesNotMatch(
        analysisInformationSetMigrationSql,
        new RegExp(`${column}\\s+TIMESTAMPTZ NOT NULL DEFAULT`),
        `${column} must not default to now()`,
      );
    }
  });

  it('is append-only with no state machine at all', () => {
    assert.match(analysisInformationSetMigrationSql, /append-only \(update rejected/);
  });

  it('pins a semantic snapshot', () => {
    assert.match(
      analysisInformationSetMigrationSql,
      /semantic_snapshot_id TEXT NOT NULL\s*\n\s*REFERENCES governance\.semantic_snapshot/,
    );
  });
});

describe('080 source PIT quality — REQ-KERN-020', () => {
  it('admits exactly the five canonical classes', () => {
    for (const cls of [
      'PIT_A_NATIVE_VINTAGE',
      'PIT_B_VERSIONED_ARTIFACT',
      'PIT_C_OUR_ARCHIVE',
      'PIT_D_LATEST_ONLY',
      'PIT_E_UNKNOWN',
    ]) {
      assert.match(sourcePitQualityMigrationSql, new RegExp(`'${cls}'`));
    }
  });

  it('requires a non-empty rationale for every grade', () => {
    // A grade without a checkable reason is the over-claim this table prevents.
    assert.match(
      sourcePitQualityMigrationSql,
      /rationale TEXT NOT NULL CHECK \(length\(btrim\(rationale\)\) > 0\)/,
    );
  });

  it('defaults ungraded sources to PIT_E rather than guessing high', () => {
    assert.match(sourcePitQualityMigrationSql, /ELSE 'PIT_E_UNKNOWN'/);
  });

  it('derives rows from ingestion.source instead of hardcoding ids', () => {
    assert.match(sourcePitQualityMigrationSql, /FROM ingestion\.source source/);
    assert.match(sourcePitQualityMigrationSql, /WHERE NOT EXISTS/);
  });

  it('does not touch the immutable source_contract_revision table', () => {
    // The contract revision carries an immutability trigger and a content_hash
    // over the contract it states; grading it retroactively would falsify both.
    assert.doesNotMatch(
      sourcePitQualityMigrationSql,
      /ALTER TABLE ingestion\.source_contract_revision/,
    );
    assert.doesNotMatch(sourcePitQualityMigrationSql, /UPDATE ingestion\.source_contract_revision/);
  });

  it('scopes archive_pit_from to PIT_C only', () => {
    assert.match(
      sourcePitQualityMigrationSql,
      /archive_pit_from IS NULL OR pit_quality_class = 'PIT_C_OUR_ARCHIVE'/,
    );
  });
});

describe('K1 migrations — boot digest safety', () => {
  // apps/api-server/src/db/live-database-guard.ts pins what each app role can
  // reach, and every array in its probe is has_table_privilege-filtered. Granting
  // to an app role moves the pin and crashloops the brain on next boot unless it
  // is re-pinned in the same change — which is exactly how migration 059 took the
  // brain down on 2026-08-03. These migrations grant to pipeline roles only.
  for (const [id, sql] of MIGRATIONS) {
    it(`${id} grants nothing to the app roles`, () => {
      // Strip `--` comments first. The migration prose names these roles to
      // explain why they are excluded, and matching that would fail the check
      // for saying the right thing.
      const executable = sql
        .split('\n')
        .map((line) => line.replace(/--.*$/, ''))
        .join('\n');

      for (const role of [
        'stock_insight_app_reader',
        'stock_insight_app_writer',
        'stock_insight_reader',
        'stock_insight_writer',
      ]) {
        assert.doesNotMatch(executable, new RegExp(`\\b${role}\\b`), `${id} grants to ${role}`);
      }
    });
  }
});
