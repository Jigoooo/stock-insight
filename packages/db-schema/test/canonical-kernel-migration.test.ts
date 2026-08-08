import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { semanticSnapshotMigrationSql } from '../src/migrations/078_semantic_snapshot.ts';
import { analysisInformationSetMigrationSql } from '../src/migrations/079_analysis_information_set.ts';
import { sourcePitQualityMigrationSql } from '../src/migrations/080_source_pit_quality.ts';
import { releaseManifestMigrationSql } from '../src/migrations/081_release_manifest.ts';
import { safetyStateMigrationSql } from '../src/migrations/082_safety_state.ts';
import { sloLedgerMigrationSql } from '../src/migrations/083_slo_ledger.ts';
import { metricDefinitionRegistryMigrationSql } from '../src/migrations/084_metric_definition_registry.ts';
import { truthClassBindingMigrationSql } from '../src/migrations/085_truth_class_binding.ts';
import { economicClaimMigrationSql } from '../src/migrations/086_economic_claim.ts';
import { sectorPlaybookMigrationSql } from '../src/migrations/087_sector_playbook.ts';

const MIGRATIONS = [
  ['078_semantic_snapshot', semanticSnapshotMigrationSql],
  ['079_analysis_information_set', analysisInformationSetMigrationSql],
  ['080_source_pit_quality', sourcePitQualityMigrationSql],
  ['081_release_manifest', releaseManifestMigrationSql],
  ['082_safety_state', safetyStateMigrationSql],
  ['083_slo_ledger', sloLedgerMigrationSql],
  ['084_metric_definition_registry', metricDefinitionRegistryMigrationSql],
  ['085_truth_class_binding', truthClassBindingMigrationSql],
  ['086_economic_claim', economicClaimMigrationSql],
  ['087_sector_playbook', sectorPlaybookMigrationSql],
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
  it('registers 078 through 084 in dependency order', () => {
    const positions = MIGRATIONS.map(([id]) => {
      const at = indexSource.indexOf(`id: '${id}'`);
      assert.notEqual(at, -1, `${id} is not registered`);
      return at;
    });
    // Each references the previous by foreign key: 079 -> 078's snapshot,
    // 081 -> 078's snapshot, 082 -> 081's release, 083 stands alone but follows.
    for (let index = 1; index < positions.length; index += 1) {
      assert.ok(
        positions[index - 1]! < positions[index]!,
        `${MIGRATIONS[index - 1]![0]} must be registered before ${MIGRATIONS[index]![0]}`,
      );
    }
  });

  it('exports every migration sql from the package index', () => {
    for (const name of [
      'semanticSnapshotMigrationSql',
      'analysisInformationSetMigrationSql',
      'sourcePitQualityMigrationSql',
      'releaseManifestMigrationSql',
      'safetyStateMigrationSql',
      'sloLedgerMigrationSql',
      'metricDefinitionRegistryMigrationSql',
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
  // brain down on 2026-08-03.
  //
  // One migration in this series does need to widen that reach, so the rule is
  // not "never" but "only deliberately, and only as far as stated here". A
  // migration that grants to an app role without an entry fails, and an entry
  // that grants more than it declared fails too.
  const APP_ROLE_GRANTS = new Map<string, { relation: string; why: string }>([
    [
      '085_truth_class_binding',
      {
        relation: 'serving.content_pack_item_truth_v1',
        why:
          'REQ-SEM-010 asks for a visible distinction between truth classes, which is a ' +
          'rendering requirement: the reader the product serves from has to be able to see ' +
          'the resolved class. Only the view is granted — the binding table stays behind the ' +
          'pipeline roles — and the boot digest must be re-pinned in the same landing.',
      },
    ],
  ]);

  const APP_ROLES = [
    'stock_insight_app_reader',
    'stock_insight_app_writer',
    'stock_insight_reader',
    'stock_insight_writer',
  ];

  // Strip `--` comments first. The migration prose names these roles to explain
  // why they are excluded, and matching that would fail the check for saying the
  // right thing.
  const executableOf = (sql: string): string =>
    sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');

  for (const [id, sql] of MIGRATIONS) {
    const declared = APP_ROLE_GRANTS.get(id);
    if (!declared) {
      it(`${id} grants nothing to the app roles`, () => {
        const executable = executableOf(sql);
        for (const role of APP_ROLES) {
          assert.doesNotMatch(executable, new RegExp(`\\b${role}\\b`), `${id} grants to ${role}`);
        }
      });
      continue;
    }

    it(`${id} widens app-role reach only as far as it declared`, () => {
      const executable = executableOf(sql);

      // The writer roles are never a rendering requirement.
      for (const role of ['stock_insight_app_writer', 'stock_insight_writer']) {
        assert.doesNotMatch(executable, new RegExp(`\\b${role}\\b`), `${id} grants to ${role}`);
      }

      const grants = [...executable.matchAll(/GRANT\s+([\s\S]*?);/g)]
        .map((match) => match[1] ?? '')
        .filter((grant) => APP_ROLES.some((role) => grant.includes(role)));

      assert.equal(grants.length, 1, `${id} should widen app-role reach exactly once`);
      assert.ok(
        grants[0]?.includes(declared.relation),
        `${id} grants an app role something other than ${declared.relation}`,
      );
      assert.doesNotMatch(grants[0] ?? '', /\b(INSERT|UPDATE|DELETE|ALL)\b/);
      assert.ok(declared.why.length > 80, 'a widening needs a stated reason');
    });
  }
});

describe('081 release manifest — REQ-REL-001', () => {
  it('keeps safety_state as a recorded fact, not a pointer that follows the present', () => {
    // A manifest built under CAUTION must keep saying CAUTION after recovery, or
    // the audit trail rewrites itself.
    assert.match(releaseManifestMigrationSql, /safety_state TEXT NOT NULL/);
    assert.doesNotMatch(
      releaseManifestMigrationSql,
      /safety_state[\s\S]{0,80}REFERENCES governance\.safety_state/,
    );
  });

  it('allows one component per kind per release', () => {
    // Two rows for one kind makes "which snapshot is this release serving" —
    // the question the manifest exists to answer — ambiguous.
    assert.match(releaseManifestMigrationSql, /UNIQUE \(release_id, kind\)/);
  });

  it('refuses a component added to a release that is no longer building', () => {
    assert.match(releaseManifestMigrationSql, /cannot be added to a % release/);
  });

  it('freezes component_count once the release leaves building', () => {
    assert.match(releaseManifestMigrationSql, /component_count is frozen once built/);
  });

  it('publishes a current-release view so surfaces resolve one pointer', () => {
    assert.match(
      releaseManifestMigrationSql,
      /CREATE OR REPLACE VIEW governance\.release_current_v1/,
    );
  });
});

describe('082 safety state — REQ-SAFE-001/002/003', () => {
  it('models the four canonical states in severity order', () => {
    for (const state of ['NORMAL', 'CAUTION', 'INFORMATION_ONLY', 'HALTED']) {
      assert.match(safetyStateMigrationSql, new RegExp(`'${state}'`));
    }
    assert.match(safetyStateMigrationSql, /safety_state_severity/);
  });

  it('requires a reason for every transition', () => {
    // A downgrade with no stated cause cannot be distinguished from a mistake,
    // and nobody can tell later whether the condition cleared.
    assert.match(
      safetyStateMigrationSql,
      /reason TEXT NOT NULL CHECK \(length\(btrim\(reason\)\) > 0\)/,
    );
  });

  it('names the four REQ-SAFE-002 trigger kinds', () => {
    for (const kind of ['slo', 'coverage', 'freshness', 'invariant']) {
      assert.match(safetyStateMigrationSql, new RegExp(`'${kind}'`));
    }
  });

  it('leaves CAUTION recommendation_allowed as NULL rather than picking a side', () => {
    // contracts/safety-state.json marks it policy-dependent. Defaulting it to
    // true is how a degraded product keeps recommending (REQ-SAFE-003).
    assert.match(safetyStateMigrationSql, /WHEN 'CAUTION' THEN NULL/);
  });

  it('seeds an explicit NORMAL so an empty view is not read as a state', () => {
    assert.match(safetyStateMigrationSql, /INSERT INTO governance\.safety_state_transition/);
    assert.match(safetyStateMigrationSql, /WHERE NOT EXISTS/);
  });

  it('is fully append-only', () => {
    assert.match(safetyStateMigrationSql, /record a new transition instead/);
  });
});

describe('083 SLO ledger — the input REQ-SAFE-002 consumes', () => {
  it('stores the threshold and comparison each observation was judged under', () => {
    // A revised threshold must not rewrite a past verdict — the same rule
    // REQ-KERN-002 applies to retrospective results.
    assert.match(sloLedgerMigrationSql, /threshold_at_observation/);
    assert.match(sloLedgerMigrationSql, /comparison_at_observation/);
  });

  it('forces the recorded verdict to follow from the recorded numbers', () => {
    assert.match(sloLedgerMigrationSql, /slo_observation_verdict_matches/);
  });

  it('requires consecutive breaches before a state move', () => {
    // One noisy sample must not walk the product into INFORMATION_ONLY.
    assert.match(sloLedgerMigrationSql, /breach_consecutive_required INTEGER NOT NULL DEFAULT 2/);
  });

  it('seeds every definition as report-only', () => {
    // A threshold with no observed baseline cannot be trusted to move the
    // product's state.
    assert.doesNotMatch(sloLedgerMigrationSql, /'CAUTION', 'migration-083'/);
    assert.match(sloLedgerMigrationSql, /NULL, 'migration-083'/);
  });

  it('measures the wrapper-run gap that lock contention leaves invisible', () => {
    // pipeline_acquire_lock exits 75 before any audit row is written, so a
    // skipped run leaves neither success nor failure (as-built §11 ①).
    assert.match(sloLedgerMigrationSql, /ops\.pipeline\.expected_runs/);
  });

  it('carries its schema-choice rationale, and the correction to it', () => {
    // 083 says governance.slo_* is a deliberate deviation and cites canonical/09 §5
    // as naming ops.slo_*. The citation is wrong: the freeze names no schema for
    // SLO anywhere, and ops.slo_* comes from the superseded e2e-layers.md X4.
    // The SQL cannot be corrected in place — run-schema-migrations checksums
    // migration.sql and 083 is applied — so the correction lives in the registry
    // description, and this test pins both halves so neither drifts away alone.
    assert.match(sloLedgerMigrationSql, /DELIBERATE DEVIATION FROM THE FREEZE/);
    assert.match(sloLedgerMigrationSql, /database-ownership/);

    const registry = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    assert.match(registry, /CORRECTION 2026-08-08/);
    assert.match(registry, /the freeze names no schema for SLO anywhere/i);
  });
});

describe('084 metric definition registry — REQ-PROD-020 / REQ-PROD-021', () => {
  it('refuses NORMALIZABLE without a stated method', () => {
    // Without a rule it reads as "comparable, just do the conversion" to every
    // caller, and nobody can execute it.
    assert.match(
      metricDefinitionRegistryMigrationSql,
      /metric_comparability_normalizable_has_rule[\s\S]*normalization_rule/,
    );
  });

  it('refuses PARTIALLY_COMPARABLE without a stated scope', () => {
    // Otherwise it is UNKNOWN with a friendlier name, and the friendlier name is
    // what gets it rendered as a comparison.
    assert.match(
      metricDefinitionRegistryMigrationSql,
      /metric_comparability_partial_has_scope[\s\S]*partial_scope/,
    );
  });

  it('refuses a non-GAAP definition that states no adjustment', () => {
    assert.match(
      metricDefinitionRegistryMigrationSql,
      /metric_definition_non_gaap_states_adjustment/,
    );
  });

  it('refuses COMPARABLE across comparability groups, by trigger', () => {
    assert.match(
      metricDefinitionRegistryMigrationSql,
      /COMPARABLE across different comparability groups/,
    );
  });

  it('requires both sides of a ratio to be named', () => {
    assert.match(metricDefinitionRegistryMigrationSql, /metric_definition_ratio_has_both_sides/);
  });

  it('models definition drift as a revision with a supersession link', () => {
    // canonical/04 §6: a YoY spanning a definition change must be detectable.
    assert.match(metricDefinitionRegistryMigrationSql, /supersedes_metric_definition_id/);
    assert.match(metricDefinitionRegistryMigrationSql, /effective_from TIMESTAMPTZ NOT NULL/);
    assert.match(metricDefinitionRegistryMigrationSql, /content is immutable; add a revision/);
  });

  it('resolves an unknown pair to UNKNOWN, never to COMPARABLE', () => {
    // The default is the requirement: a caller that cannot establish comparability
    // must render "not established", not a comparison.
    assert.match(
      metricDefinitionRegistryMigrationSql,
      /metric_comparability_state[\s\S]*'UNKNOWN'\n\s*\);/,
    );
  });

  it('does not mirror NORMALIZABLE when falling back to the reverse direction', () => {
    // "B converts to A" does not make A convertible to B.
    assert.match(
      metricDefinitionRegistryMigrationSql,
      /comparability_state IN \('COMPARABLE', 'NOT_COMPARABLE', 'UNKNOWN'\)/,
    );
  });

  it('keys definitions to world.numeric_fact so a fact can name its definition', () => {
    assert.match(metricDefinitionRegistryMigrationSql, /concept_namespace TEXT NOT NULL/);
    assert.match(metricDefinitionRegistryMigrationSql, /concept_key\s+TEXT NOT NULL/);
  });
});

describe('085 truth class binding — REQ-SEM-010', () => {
  const sql = truthClassBindingMigrationSql;

  it('accepts only the fourteen classes the freeze names', () => {
    // contracts/truth-classes.json is the machine list. The prose table in
    // canonical/00 §4 shows thirteen — it omits OUTCOME, which §3's chain and the
    // contract both carry — so the contract is what a CHECK follows.
    const classes = [
      'SOURCE',
      'ASSERTION',
      'FACT',
      'EVENT',
      'RELATION',
      'EXPOSURE',
      'STATISTICAL_ESTIMATE',
      'CAUSAL_ESTIMATE',
      'FORECAST',
      'HYPOTHESIS',
      'NARRATIVE',
      'RECOMMENDATION',
      'PERSONAL_DECISION',
      'OUTCOME',
    ];
    const check = /truth_class IN \(([\s\S]*?)\)/.exec(sql)?.[1] ?? '';
    for (const truthClass of classes) {
      assert.ok(check.includes(`'${truthClass}'`), `${truthClass} is not accepted`);
    }
    assert.equal((check.match(/'/g) ?? []).length / 2, classes.length, 'accepts an extra class');
  });

  it('binds an impact path to HYPOTHESIS rather than to EXPOSURE', () => {
    // All 248,236 impact_path_v2 rows are rule_derived with direction unknown, and
    // run-portfolio-snapshot.ts:18 refuses to promote them into exposure because
    // that would mean inventing sign, materiality and magnitude. Binding them to
    // EXPOSURE would make in the UI the claim the pipeline declines to make.
    const row = /'impact_path'[\s\S]*?'migration-085'/.exec(sql)?.[0] ?? '';
    assert.ok(row.includes("'HYPOTHESIS'"));
    assert.ok(!row.includes("'EXPOSURE'"));
    assert.match(row, /direction=unknown/);
  });

  it('refuses to invent a class for an object that has none', () => {
    // A model config is provenance of an inference and an identity mapping says
    // which record is which. Defaulting either to SOURCE would tell a reader that
    // a model config is evidence somebody filed.
    for (const kind of ['model_config', 'identity_mapping']) {
      const row = new RegExp(`'${kind}'[\\s\\S]*?'migration-085'`).exec(sql)?.[0] ?? '';
      assert.ok(row.includes('not_a_truth_object'), `${kind} is bound to a class`);
      assert.ok(row.includes('NULL'), `${kind} carries a class it should not`);
    }
  });

  it('makes the state and the class agree, so neither can drift', () => {
    assert.match(sql, /binding_state = 'bound' AND truth_class IS NOT NULL/);
    assert.match(sql, /binding_state <> 'bound' AND truth_class IS NULL/);
  });

  it('every binding states what it was read from', () => {
    const bases = [...sql.matchAll(/'migration-085'/g)];
    assert.equal(bases.length, 5, 'five bindings are seeded');
    assert.match(sql, /basis TEXT NOT NULL CHECK \(length\(btrim\(basis\)\) > 0\)/);
  });

  it('leaves an unbound kind null instead of defaulting it', () => {
    // A reader can render "unclassified" honestly; it cannot un-see a wrong badge.
    assert.match(sql, /LEFT JOIN governance\.truth_class_binding/);
    assert.doesNotMatch(sql, /coalesce\(binding\.truth_class/);
  });

  it('addresses a null subkind as a value, not as unknown', () => {
    // Three of the five bindings have no subkind, and a plain UNIQUE would let
    // them all be inserted again.
    assert.match(sql, /UNIQUE NULLS NOT DISTINCT/);
    assert.match(sql, /IS NOT DISTINCT FROM/);
  });
});

describe('086 economic claim — canonical/03 §2', () => {
  const sql = economicClaimMigrationSql;

  it('never lets a claim default to common equity', () => {
    // All 297 securities are entity_type='Stock' today, including an ETF. A
    // default here would reinstate exactly the assumption the table removes.
    assert.doesNotMatch(sql, /DEFAULT\s+'COMMON_EQUITY'/);
    assert.match(sql, /claim_type_state TEXT NOT NULL DEFAULT 'undetermined'/);
  });

  it('makes the state and the claim type agree', () => {
    assert.match(sql, /claim_type_state = 'determined' AND claim_type IS NOT NULL/);
    assert.match(sql, /claim_type_state = 'undetermined' AND claim_type IS NULL/);
  });

  it('stops an undetermined claim from stating rights it cannot know', () => {
    // A row saying "we do not know what this is" while also saying how it votes
    // would have the second statement read as the first being a formality.
    const guard =
      /economic_claim_undetermined_states_nothing CHECK \(([\s\S]*?)\n    \)/.exec(sql)?.[1] ?? '';
    for (const column of [
      'voting_rights',
      'dividend_rights',
      'cash_flow_rights',
      'conversion_terms',
      'redemption_terms',
      'dilution_mechanics',
      'seniority_rank',
    ]) {
      assert.ok(guard.includes(`${column} IS NULL`), `${column} escapes the guard`);
    }
  });

  it('requires every row to say what it was determined from', () => {
    // Otherwise a later reader cannot tell a gap in the data from a gap in the
    // effort.
    assert.match(
      sql,
      /determination_basis TEXT NOT NULL CHECK \(length\(btrim\(determination_basis\)\) > 0\)/,
    );
  });

  it('covers the claim kinds canonical/03 §2 separates', () => {
    // "보통주·우선주·ADR·전환증권·토큰은 회사 전망을 공유해도 claim-level valuation이 다를 수 있다."
    for (const kind of [
      'COMMON_EQUITY',
      'PREFERRED_EQUITY',
      'DEPOSITARY_RECEIPT',
      'CONVERTIBLE',
      'TOKEN',
      'FUND_UNIT',
    ]) {
      assert.ok(sql.includes(`'${kind}'`), `${kind} has no place`);
    }
  });

  it('states its own coverage rather than leaving it to be counted', () => {
    assert.match(sql, /CREATE OR REPLACE VIEW core\.economic_claim_coverage_v1/);
    assert.match(sql, /FILTER \(WHERE claim_type_state = 'determined'\)/);
  });
});

describe('087 sector playbook — REQ-DOM-001', () => {
  const sql = sectorPlaybookMigrationSql;

  it('requires all eight adapter interfaces canonical/04 §2 names', () => {
    // An adapter missing one is the case the requirement exists to prevent: the
    // model fills the gap and nothing records that it did.
    for (const iface of [
      'identity_extensions',
      'metric_concepts',
      'world_state_event_types',
      'business_driver_transforms',
      'valuation_methods',
      'peer_dimensions',
      'acceptance_fixtures',
      'source_pack',
    ]) {
      assert.ok(
        new RegExp(`adapter_interfaces \\?& ARRAY\\[[\\s\\S]*'${iface}'`).test(sql),
        `${iface} is not enforced`,
      );
    }
  });

  it('refuses a playbook that names nothing to look at', () => {
    assert.match(sql, /jsonb_array_length\(key_indicators\) > 0/);
    assert.match(sql, /jsonb_array_length\(financial_bridge\) > 0/);
  });

  it('lets an assignment disagree with the industry code, in writing', () => {
    // Samsung Electronics is KSIC 264; assignment by code alone would drop it.
    assert.match(sql, /assignment_basis IN \('taxonomy', 'curated'\)/);
    assert.match(sql, /rationale TEXT NOT NULL CHECK \(length\(btrim\(rationale\)\) > 0\)/);
    assert.match(sql, /assignment_basis <> 'taxonomy' OR taxonomy_node_id IS NOT NULL/);
  });

  it('gives every driver the seven properties canonical/04 §3 lists', () => {
    for (const column of [
      'source_requirement',
      'horizon',
      'sensitivity_note',
      'lag_note',
      'regime_note',
      'uncertainty_note',
    ]) {
      assert.ok(new RegExp(`${column} TEXT NOT NULL`).test(sql), `${column} may be left empty`);
    }
  });

  it('refuses a bridge that names a target without a direction', () => {
    // An exposure that cannot state a sign is exactly what
    // run-portfolio-snapshot.ts:18 refuses to invent, so the definition must
    // carry the sign or K4 will have to guess it.
    assert.match(sql, /affects_stage IS NOT NULL AND affects_direction IS NOT NULL/);
    assert.match(sql, /affects_stage IS NULL OR affects_stage <> chain_stage/);
  });

  it('seeds a semiconductor revision 1 covering every canonical/04 §5 minimum', () => {
    for (const key of [
      'product_generation_node',
      'design_win_qualification',
      'capacity_wafer_fab_hbm',
      'customer_product_concentration',
      'backlog_commitment_quality',
      'technology_transition_substitution',
    ]) {
      assert.ok(sql.includes(key), `${key} is missing from the playbook`);
    }
  });

  it('covers the whole chain of canonical/04 §3 with its drivers', () => {
    // Demand × Price × Mix → Revenue − Cost → Margin − Capital → FCF. A chain
    // with a hole is a bridge an analysis has to jump.
    for (const stage of [
      'demand',
      'price',
      'mix',
      'variable_cost',
      'fixed_cost',
      'working_capital',
      'capex',
    ]) {
      assert.ok(new RegExp(`'${stage}',`).test(sql), `no driver sits at ${stage}`);
    }
  });

  it('states what has to be examined and never what to conclude', () => {
    // A playbook that carried a view would be the invention REQ-DOM-001 forbids,
    // wearing a revision number.
    for (const verdict of ['undervalued', 'overvalued', 'buy', 'sell', 'attractive']) {
      assert.doesNotMatch(
        sql,
        new RegExp(`\\b${verdict}\\b`, 'i'),
        `playbook states a view: ${verdict}`,
      );
    }
  });
});
