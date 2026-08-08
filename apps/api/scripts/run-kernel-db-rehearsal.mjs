// Rehearses migrations 078–089 plus the migration-037 exposure surface that
// K4 strengthens, on a disposable database.
//
// Modelled on run-p6-db-rehearsal.mjs: create a throwaway database, stub only the
// foreign-key targets the migrations under test need, apply them, assert the
// behaviour the static test in packages/db-schema/test cannot reach — that the
// CHECK constraints actually reject a leaking row and the append-only triggers
// actually fire — then drop everything and confirm role state is restored.
//
// The most load-bearing assertion is the last one. These migrations grant to
// pipeline roles only, on the claim that apps/api-server/src/db/live-database-guard.ts
// filters every digest array by has_table_privilege(current_user, …), so tables
// the app roles cannot reach do not move their pinned digests and need no re-pin.
// Migration 059 crashlooped the brain on 2026-08-03 by getting this wrong, so the
// claim is checked rather than asserted.
//
// Usage:
//   KERNEL_REHEARSAL_ADMIN_DATABASE_URL=… node apps/api/scripts/run-kernel-db-rehearsal.mjs

import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { impactExposureLedgerMigrationSql } from '../../../packages/db-schema/src/migrations/037_impact_exposure_ledger.ts';

import { semanticSnapshotMigrationSql } from '../../../packages/db-schema/src/migrations/078_semantic_snapshot.ts';
import { analysisInformationSetMigrationSql } from '../../../packages/db-schema/src/migrations/079_analysis_information_set.ts';
import { sourcePitQualityMigrationSql } from '../../../packages/db-schema/src/migrations/080_source_pit_quality.ts';
import { releaseManifestMigrationSql } from '../../../packages/db-schema/src/migrations/081_release_manifest.ts';
import { safetyStateMigrationSql } from '../../../packages/db-schema/src/migrations/082_safety_state.ts';
import { sloLedgerMigrationSql } from '../../../packages/db-schema/src/migrations/083_slo_ledger.ts';
import { metricDefinitionRegistryMigrationSql } from '../../../packages/db-schema/src/migrations/084_metric_definition_registry.ts';
import { truthClassBindingMigrationSql } from '../../../packages/db-schema/src/migrations/085_truth_class_binding.ts';
import { economicClaimMigrationSql } from '../../../packages/db-schema/src/migrations/086_economic_claim.ts';
import { sectorPlaybookMigrationSql } from '../../../packages/db-schema/src/migrations/087_sector_playbook.ts';
import { issuerPlaybookMeasurementRuleMigrationSql } from '../../../packages/db-schema/src/migrations/088_issuer_playbook_measurement_rule.ts';
import { k4MarketIntelligenceLedgerMigrationSql } from '../../../packages/db-schema/src/migrations/089_k4_market_intelligence_ledger.ts';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const adminUrl = new URL(process.env.KERNEL_REHEARSAL_ADMIN_DATABASE_URL ?? '');
if (
  !['postgres:', 'postgresql:'].includes(adminUrl.protocol) ||
  adminUrl.search !== '' ||
  adminUrl.hash !== ''
) {
  throw new Error('Kernel rehearsal admin URL must be a query-free PostgreSQL URL');
}

const databaseName = `stock_insight_kernel_rehearsal_${randomBytes(5).toString('hex')}`;
if (!/^stock_insight_kernel_rehearsal_[a-f0-9]+$/.test(databaseName)) {
  throw new Error('unsafe db name');
}
const quotedDatabase = `"${databaseName}"`;
const targetUrl = new URL(adminUrl);
targetUrl.pathname = `/${databaseName}`;

const roleNames = [
  'si_knowledge',
  'si_analytics',
  'si_publisher',
  'si_readapi',
  'stock_insight_app_reader',
  'stock_insight_app_writer',
];

const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();

async function readRoleState() {
  const roles = await admin.query(
    `SELECT rolname, rolsuper, rolcreatedb, rolcanlogin, rolbypassrls
       FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`,
    [roleNames],
  );
  return roles.rows;
}

const roleStateBefore = await readRoleState();
const preExistingRoles = new Set(roleStateBefore.map((row) => row.rolname));

let target;
let result;
const cleanupErrors = [];
let primaryError;

/** Returns true when the statement was rejected with one of the expected codes. */
async function expectRejected(sql, expectedCodes = ['23514']) {
  try {
    await target.query(sql);
  } catch (error) {
    if (expectedCodes.includes(error?.code)) return true;
    // A trigger RAISE EXCEPTION surfaces as P0001; treat an explicit message
    // match as success so the assertion stays about behaviour, not error codes.
    if (error?.code === 'P0001' && expectedCodes.includes('P0001')) return true;
    throw error;
  }
  return false;
}

const VALID_SET = (id, overrides = {}) => {
  const columns = {
    information_set_id: `'${id}'`,
    mode: `'EX_ANTE'`,
    valid_cutoff: `'2026-07-21T00:00:00Z'`,
    source_available_cutoff: `'2026-07-21T00:00:00Z'`,
    system_known_cutoff: `'2026-07-21T00:00:00Z'`,
    market_observation_cutoff: `'2026-07-21T00:00:00Z'`,
    semantic_snapshot_id: `'snap-1'`,
    created_by: `'rehearsal'`,
    ...overrides,
  };
  const names = Object.keys(columns).join(', ');
  const values = Object.values(columns).join(', ');
  return `INSERT INTO governance.analysis_information_set (${names}) VALUES (${values})`;
};

try {
  await admin.query(`CREATE DATABASE ${quotedDatabase}`);
  target = new Client({ connectionString: targetUrl.toString() });
  await target.connect();

  const connected = await target.query('SELECT current_database() AS name');
  if (connected.rows[0]?.name !== databaseName) {
    throw new Error('Kernel rehearsal connected to an unexpected database');
  }

  // Stubs: only the foreign-key targets and the columns 080's grading reads.
  await target.query(`
    CREATE SCHEMA knowledge;
    CREATE TABLE knowledge.ontology_revision (ontology_revision_id BIGINT PRIMARY KEY);
    INSERT INTO knowledge.ontology_revision SELECT generate_series(1, 5);
    CREATE TABLE knowledge.derivation (
      derivation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      status TEXT NOT NULL
    );
    INSERT INTO knowledge.derivation (status)
    SELECT 'sealed' FROM generate_series(1, 7);

    CREATE SCHEMA world;
    CREATE TABLE world.event_revision (
      event_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
    );
    INSERT INTO world.event_revision DEFAULT VALUES;

    CREATE SCHEMA analytics;
    CREATE TABLE analytics.impact_path_step (
      impact_path_step_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      to_entity_id BIGINT NOT NULL
    );


    -- 084 references core.entity for issuer-scoped definitions.
    CREATE SCHEMA core;
    CREATE TABLE core.entity (
      entity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      entity_type TEXT NOT NULL,
      canonical_name TEXT NOT NULL
    );
    INSERT INTO core.entity (entity_type, canonical_name) VALUES
      ('Company', 'Rehearsal Co'),
      ('Stock', 'Rehearsal Security'),
      ('Company', 'Second Rehearsal Co'),
      ('Stock', 'Unassigned Rehearsal Security'),
      ('Company', 'Unassigned Rehearsal Issuer'),
      ('Stock', 'Identityless Rehearsal Security');
    CREATE TABLE core.security_issuer_identity (
      security_issuer_identity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      security_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
      issuer_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
      identity_match_key TEXT NOT NULL,
      mapping_basis TEXT NOT NULL,
      valid_from TIMESTAMPTZ NOT NULL,
      known_from TIMESTAMPTZ NOT NULL
    );
    INSERT INTO core.security_issuer_identity
      (security_entity_id, issuer_entity_id, identity_match_key, mapping_basis, valid_from, known_from)
    VALUES
      (2, 1, 'rehearsal', 'exact', TIMESTAMPTZ '2025-01-01Z', TIMESTAMPTZ '2025-01-01Z'),
      (4, 5, 'unassigned', 'exact', TIMESTAMPTZ '2025-01-01Z', TIMESTAMPTZ '2025-01-01Z');

    CREATE SCHEMA ingestion;
    CREATE TABLE ingestion.source (
      source_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      provider_key TEXT NOT NULL,
      source_type TEXT NOT NULL
    );
    CREATE TABLE ingestion.source_record_identity (
      source_record_identity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      source_id BIGINT NOT NULL REFERENCES ingestion.source(source_id)
    );
    CREATE TABLE ingestion.source_revision (
      source_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      source_record_identity_id BIGINT NOT NULL
        REFERENCES ingestion.source_record_identity(source_record_identity_id),
      ingested_at TIMESTAMPTZ NOT NULL
    );

    -- A slice of the live source inventory covering every grading branch.
    INSERT INTO ingestion.source (provider_key, source_type) VALUES
      ('fred', 'api'),
      ('sec-edgar', 'api'),
      ('opendart', 'api'),
      ('bok-ecos', 'api'),
      ('yfinance', 'api'),
      ('internal-etf-holdings-snapshot', 'internal'),
      ('rss:cnbc-markets', 'feed'),
      ('finra', 'api');

    INSERT INTO ingestion.source_record_identity (source_id)
      SELECT source_id FROM ingestion.source WHERE provider_key IN ('bok-ecos', 'yfinance');
    INSERT INTO ingestion.source_revision (source_record_identity_id, ingested_at)
      SELECT source_record_identity_id, TIMESTAMPTZ '2026-05-01T00:00:00Z'
        FROM ingestion.source_record_identity;

    CREATE TABLE world.numeric_fact (
      numeric_fact_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      fact_key TEXT NOT NULL,
      entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
      concept_namespace TEXT NOT NULL,
      concept_key TEXT NOT NULL,
      value NUMERIC NOT NULL,
      unit TEXT NOT NULL,
      currency TEXT,
      period_start DATE,
      period_end DATE,
      instant_at TIMESTAMPTZ,
      source_revision_id BIGINT NOT NULL REFERENCES ingestion.source_revision(source_revision_id),
      available_at TIMESTAMPTZ NOT NULL,
      known_at TIMESTAMPTZ NOT NULL
    );
    INSERT INTO world.numeric_fact
      (fact_key, entity_id, concept_namespace, concept_key, value, unit, currency,
       period_start, period_end, instant_at, source_revision_id, available_at, known_at)
    SELECT fixture.fact_key, fixture.entity_id, fixture.concept_namespace,
           fixture.concept_key, fixture.value, 'currency', 'USD', fixture.period_start,
           fixture.period_end, fixture.instant_at, revision.source_revision_id,
           TIMESTAMPTZ '2026-05-01Z', TIMESTAMPTZ '2026-05-01Z'
      FROM (VALUES
        ('valid-comparison', 1, 'us-gaap', 'InventoryNet', 100::numeric,
         NULL::date, NULL::date, TIMESTAMPTZ '2025-06-30Z'),
        ('valid-current', 1, 'us-gaap', 'InventoryNet', 120::numeric,
         NULL::date, NULL::date, TIMESTAMPTZ '2026-06-30Z'),
        ('valid-corroboration', 1, 'us-gaap', 'InventoryNet', 90::numeric,
         NULL::date, NULL::date, TIMESTAMPTZ '2024-06-30Z'),
        ('wrong-issuer-comparison', 3, 'us-gaap', 'InventoryNet', 100::numeric,
         NULL::date, NULL::date, TIMESTAMPTZ '2025-06-30Z'),
        ('wrong-issuer-current', 3, 'us-gaap', 'InventoryNet', 120::numeric,
         NULL::date, NULL::date, TIMESTAMPTZ '2026-06-30Z'),
        ('wrong-concept-comparison', 1, 'us-gaap', 'Revenue', 100::numeric,
         NULL::date, NULL::date, TIMESTAMPTZ '2025-06-30Z'),
        ('wrong-concept-current', 1, 'us-gaap', 'Revenue', 120::numeric,
         NULL::date, NULL::date, TIMESTAMPTZ '2026-06-30Z'),
        ('wrong-period-comparison', 1, 'us-gaap', 'InventoryNet', 100::numeric,
         NULL::date, NULL::date, TIMESTAMPTZ '2025-03-31Z'),
        ('wrong-period-current', 1, 'us-gaap', 'InventoryNet', 120::numeric,
         NULL::date, NULL::date, TIMESTAMPTZ '2026-06-30Z'),
        ('duration-comparison', 1, 'us-gaap', 'PaymentsToAcquirePropertyPlantAndEquipment',
         100::numeric, DATE '2024-01-01', DATE '2024-06-30', NULL::timestamptz),
        ('duration-current', 1, 'us-gaap', 'PaymentsToAcquirePropertyPlantAndEquipment',
         120::numeric, DATE '2025-01-01', DATE '2025-06-30', NULL::timestamptz),
        ('unassigned-comparison', 5, 'us-gaap', 'InventoryNet', 100::numeric,
         NULL::date, NULL::date, TIMESTAMPTZ '2025-06-30Z'),
        ('unassigned-current', 5, 'us-gaap', 'InventoryNet', 120::numeric,
         NULL::date, NULL::date, TIMESTAMPTZ '2026-06-30Z')
      ) fixture(
        fact_key, entity_id, concept_namespace, concept_key, value,
        period_start, period_end, instant_at
      )
      CROSS JOIN ingestion.source_revision revision
      JOIN ingestion.source_record_identity identity
        ON identity.source_record_identity_id = revision.source_record_identity_id
      JOIN ingestion.source source ON source.source_id = identity.source_id
     WHERE source.provider_key = 'bok-ecos';

    CREATE TABLE knowledge.derivation_step (
      derivation_step_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      derivation_id BIGINT NOT NULL REFERENCES knowledge.derivation(derivation_id)
    );
    CREATE TABLE knowledge.derivation_input (
      derivation_input_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      derivation_step_id BIGINT NOT NULL REFERENCES knowledge.derivation_step(derivation_step_id),
      input_kind TEXT NOT NULL,
      numeric_fact_id BIGINT REFERENCES world.numeric_fact(numeric_fact_id)
    );
    INSERT INTO knowledge.derivation_step (derivation_id)
    SELECT generate_series(1, 7);
    INSERT INTO knowledge.derivation_input (derivation_step_id, input_kind, numeric_fact_id)
    SELECT fixture.derivation_id, 'numeric_fact', fact.numeric_fact_id
      FROM (VALUES
        (1, 'valid-comparison'), (1, 'valid-current'),
        (3, 'wrong-issuer-comparison'), (3, 'wrong-issuer-current'),
        (4, 'wrong-concept-comparison'), (4, 'wrong-concept-current'),
        (5, 'wrong-period-comparison'), (5, 'wrong-period-current'),
        (6, 'unassigned-comparison'), (6, 'unassigned-current'),
        (7, 'duration-comparison'), (7, 'duration-current')
      ) fixture(derivation_id, fact_key)
      JOIN world.numeric_fact fact ON fact.fact_key = fixture.fact_key;

    INSERT INTO analytics.impact_path_step (to_entity_id) VALUES (2);

    DO $roles$
    DECLARE role_name TEXT;
    BEGIN
      FOREACH role_name IN ARRAY ARRAY[
        'si_knowledge','si_analytics','si_publisher','si_readapi',
        'stock_insight_app_reader','stock_insight_app_writer'
      ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format(
            'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
            role_name
          );
        END IF;
      END LOOP;
    END
    $roles$;
  `);

  // 085 projects over the serving item table and the evidence ledger it joins to.
  // Only the columns the view names — the point is that the view resolves, not
  // that these two tables are reproduced.
  await target.query(`
    CREATE SCHEMA serving;
    CREATE TABLE serving.content_pack_item (
      content_pack_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      content_pack_id BIGINT NOT NULL,
      item_no INTEGER NOT NULL,
      item_kind TEXT NOT NULL,
      relation_evidence_ledger_id BIGINT
    );
    CREATE TABLE knowledge.relation_evidence_ledger (
      relation_evidence_ledger_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      evidence_kind TEXT NOT NULL
    );
    INSERT INTO knowledge.relation_evidence_ledger (evidence_kind)
      VALUES ('source_revision'), ('model_config'), ('identity_mapping');
    -- 087 assigns playbooks against the taxonomy.
    CREATE TABLE core.taxonomy_node (
      taxonomy_node_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      code TEXT NOT NULL
    );
    INSERT INTO core.taxonomy_node (code) VALUES ('3674'), ('264');

    -- 086 hangs its claims off the security master.
    CREATE TABLE core.security_master (
      security_master_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      security_key TEXT NOT NULL
    );
    INSERT INTO core.security_master (security_key) VALUES ('rehearsal-security');

    INSERT INTO serving.content_pack_item
      (content_pack_id, item_no, item_kind, relation_evidence_ledger_id)
    VALUES (1, 1, 'relation', NULL),
           (1, 2, 'impact_path', NULL),
           (1, 3, 'evidence', 1),
           (1, 4, 'evidence', 2),
           (1, 5, 'evidence', 3),
           (1, 6, 'something_new', NULL);
  `);

  // ── apply the migrations under test, in dependency order ────────────────────
  const MIGRATIONS = [
    impactExposureLedgerMigrationSql,
    semanticSnapshotMigrationSql,
    analysisInformationSetMigrationSql,
    sourcePitQualityMigrationSql,
    releaseManifestMigrationSql,
    safetyStateMigrationSql,
    sloLedgerMigrationSql,
    metricDefinitionRegistryMigrationSql,
    truthClassBindingMigrationSql,
    economicClaimMigrationSql,
    sectorPlaybookMigrationSql,
  ];
  for (const sql of MIGRATIONS) await target.query(sql);

  // 087 historically allowed Stock assignments. One has an exact identity and
  // must migrate; the other has none and must make 088 fail closed.
  await target.query(`
    INSERT INTO governance.playbook_assignment (
      sector_playbook_id, entity_id, assignment_basis, taxonomy_node_id,
      rationale, valid_from, known_at, assigned_by
    )
    SELECT playbook.sector_playbook_id, legacy.entity_id, 'taxonomy', 1,
           legacy.rationale, TIMESTAMPTZ '2026-01-01Z',
           TIMESTAMPTZ '2026-01-01Z', 'rehearsal'
      FROM governance.sector_playbook playbook
      CROSS JOIN (VALUES
        (2, 'legacy security assignment'),
        (6, 'identityless legacy security assignment')
      ) legacy(entity_id, rationale)
     WHERE playbook.playbook_key = 'semiconductor' AND playbook.revision_no = 1;
  `);

  let unresolvedAssignmentMigrationRejected = false;
  await target.query('BEGIN');
  try {
    await target.query(issuerPlaybookMeasurementRuleMigrationSql);
    await target.query('ROLLBACK');
  } catch (error) {
    unresolvedAssignmentMigrationRejected = error?.code === 'P0001';
    await target.query('ROLLBACK');
  }
  await target.query(`
    DELETE FROM governance.playbook_assignment
     WHERE entity_id = 6
       AND valid_to IS NULL
  `);

  MIGRATIONS.push(
    issuerPlaybookMeasurementRuleMigrationSql,
    k4MarketIntelligenceLedgerMigrationSql,
  );
  await target.query(issuerPlaybookMeasurementRuleMigrationSql);
  await target.query(k4MarketIntelligenceLedgerMigrationSql);
  // Re-running must be a no-op — the schema ledger replays on any re-apply.
  for (const sql of MIGRATIONS) await target.query(sql);

  await target.query(
    `INSERT INTO governance.semantic_snapshot (semantic_snapshot_id, created_by)
     VALUES ('snap-1', 'rehearsal') ON CONFLICT DO NOTHING`,
  );

  // ── 086 economic claim ──────────────────────────────────────────────────────
  const claimInsert = async (columns, values) => {
    try {
      await target.query(`INSERT INTO core.economic_claim (${columns}) VALUES (${values})`);
      return true;
    } catch {
      return false;
    }
  };
  const CLAIM_BASE =
    "1, 'rehearsal basis', TIMESTAMPTZ '2020-01-01Z', TIMESTAMPTZ '2026-01-01Z', 'rehearsal'";
  const economicClaim = {
    // The default is the whole point: a row that says nothing must not say
    // 'common equity in the issuer'.
    defaultsToUndetermined:
      (await claimInsert(
        'security_master_id, determination_basis, valid_from, known_at, determined_by',
        CLAIM_BASE,
      )) &&
      (await target.query(`SELECT claim_type, claim_type_state FROM core.economic_claim LIMIT 1`))
        .rows[0].claim_type === null,
    determinedWithoutTypeRejected: !(await claimInsert(
      'security_master_id, claim_type_state, determination_basis, valid_from, known_at, determined_by',
      "1, 'determined', 'b', TIMESTAMPTZ '2021-01-01Z', TIMESTAMPTZ '2026-01-01Z', 'rehearsal'",
    )),
    // "We do not know what this is" and "this is how it votes" cannot share a row.
    undeterminedStatingRightsRejected: !(await claimInsert(
      'security_master_id, voting_rights, determination_basis, valid_from, known_at, determined_by',
      "1, '{\"votes\":1}'::jsonb, 'b', TIMESTAMPTZ '2022-01-01Z', TIMESTAMPTZ '2026-01-01Z', 'rehearsal'",
    )),
    determinedMayStateRights: await claimInsert(
      'security_master_id, claim_type, claim_type_state, voting_rights, determination_basis, valid_from, known_at, determined_by',
      "1, 'FUND_UNIT', 'determined', '{\"votes\":0}'::jsonb, 'b', TIMESTAMPTZ '2023-01-01Z', TIMESTAMPTZ '2026-01-01Z', 'rehearsal'",
    ),
    unknownClaimTypeRejected: !(await claimInsert(
      'security_master_id, claim_type, claim_type_state, determination_basis, valid_from, known_at, determined_by',
      "1, 'MYSTERY', 'determined', 'b', TIMESTAMPTZ '2024-01-01Z', TIMESTAMPTZ '2026-01-01Z', 'rehearsal'",
    )),
    intervalMustBeOrdered: !(await claimInsert(
      'security_master_id, determination_basis, valid_from, valid_to, known_at, determined_by',
      "1, 'b', TIMESTAMPTZ '2025-01-01Z', TIMESTAMPTZ '2024-01-01Z', TIMESTAMPTZ '2026-01-01Z', 'rehearsal'",
    )),
    coverageViewReports:
      (
        await target.query(
          'SELECT determined, undetermined, securities FROM core.economic_claim_coverage_v1',
        )
      ).rows[0].securities === '1',
  };

  // ── 087 sector playbook ─────────────────────────────────────────────────────
  const playbookInsert = async (columns, values, table = 'governance.playbook_assignment') => {
    try {
      await target.query(`INSERT INTO ${table} (${columns}) VALUES (${values})`);
      return true;
    } catch {
      return false;
    }
  };
  const playbookRow = (
    await target.query(
      `SELECT sector_playbook_id, jsonb_array_length(key_indicators) AS indicators
         FROM governance.sector_playbook WHERE playbook_key = 'semiconductor' AND revision_no = 1`,
    )
  ).rows[0];
  const drivers = await target.query(
    `SELECT chain_stage, affects_stage, affects_direction FROM governance.business_driver`,
  );
  const sectorPlaybook = {
    seedApplied: playbookRow !== undefined && Number(playbookRow.indicators) === 6,
    // canonical/04 §5 lists six minimums for this sector; the seed must cover the
    // whole chain of §3 rather than only the parts with easy data.
    driversCoverTheChain:
      new Set(drivers.rows.map((row) => row.chain_stage)).size >= 6 && drivers.rows.length === 8,
    everyBridgeHasADirection: drivers.rows.every(
      (row) => (row.affects_stage === null) === (row.affects_direction === null),
    ),
    // An adapter missing an interface is the gap the model fills silently.
    partialAdapterRejected: !(await playbookInsert(
      'playbook_key, revision_no, display_name, value_chain, unit_of_analysis, key_indicators, financial_bridge, catalysts_and_risks, valuation_methods, peer_dimensions, source_requirements, adapter_interfaces, effective_from, authored_by',
      `'partial', 1, 'Partial', '[]'::jsonb, 'u', '[1]'::jsonb, '[1]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"identity_extensions":[]}'::jsonb, now(), 'rehearsal'`,
      'governance.sector_playbook',
    )),
    emptyIndicatorsRejected: !(await playbookInsert(
      'playbook_key, revision_no, display_name, value_chain, unit_of_analysis, key_indicators, financial_bridge, catalysts_and_risks, valuation_methods, peer_dimensions, source_requirements, adapter_interfaces, effective_from, authored_by',
      `'empty', 1, 'Empty', '[]'::jsonb, 'u', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"identity_extensions":[],"metric_concepts":[],"world_state_event_types":[],"business_driver_transforms":[],"valuation_methods":[],"peer_dimensions":[],"acceptance_fixtures":[],"source_pack":[]}'::jsonb, now(), 'rehearsal'`,
      'governance.sector_playbook',
    )),
    // A revision above one has to name what it replaced (canonical/04 §6).
    orphanRevisionRejected: !(await playbookInsert(
      'playbook_key, revision_no, display_name, value_chain, unit_of_analysis, key_indicators, financial_bridge, catalysts_and_risks, valuation_methods, peer_dimensions, source_requirements, adapter_interfaces, effective_from, authored_by',
      `'semiconductor', 2, 'Rev2', '[]'::jsonb, 'u', '[1]'::jsonb, '[1]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{"identity_extensions":[],"metric_concepts":[],"world_state_event_types":[],"business_driver_transforms":[],"valuation_methods":[],"peer_dimensions":[],"acceptance_fixtures":[],"source_pack":[]}'::jsonb, now(), 'rehearsal'`,
      'governance.sector_playbook',
    )),
    taxonomyAssignmentMustNameANode: !(await playbookInsert(
      'sector_playbook_id, entity_id, assignment_basis, rationale, valid_from, assigned_by',
      `${playbookRow?.sector_playbook_id ?? 0}, 1, 'taxonomy', 'r', now(), 'rehearsal'`,
    )),
    curatedAssignmentMayDisagreeWithTheCode: await playbookInsert(
      'sector_playbook_id, entity_id, assignment_basis, rationale, valid_from, assigned_by',
      `${playbookRow?.sector_playbook_id ?? 0}, 3, 'curated', 'industry code is evidence, not proof', now(), 'rehearsal'`,
    ),
    currentViewResolves:
      (await target.query('SELECT count(*)::int AS n FROM governance.entity_playbook_current_v1'))
        .rows[0].n === 2,
  };

  // ── 088/089 K4 issuer rules and market-intelligence ledgers ────────────────
  await target.query(`
    INSERT INTO governance.analysis_information_set (
      information_set_id, mode, valid_cutoff, source_available_cutoff,
      system_known_cutoff, market_observation_cutoff,
      semantic_snapshot_id, created_by
    ) VALUES (
      'ais-k4', 'EX_ANTE', TIMESTAMPTZ '2026-08-10T12:00:00Z',
      TIMESTAMPTZ '2026-08-10T12:00:00Z', TIMESTAMPTZ '2026-08-10T12:00:00Z',
      TIMESTAMPTZ '2026-08-10T12:00:00Z', 'snap-1', 'rehearsal'
    );
    INSERT INTO analytics.impact_shock (
      shock_key, event_revision_id, shock_type, evidence_locator, available_at, known_at
    ) VALUES (
      'k4-rehearsal-shock', 1, 'filing_observation', '{}'::jsonb,
      TIMESTAMPTZ '2026-08-09T00:00:00Z', TIMESTAMPTZ '2026-08-09T00:00:00Z'
    );
  `);

  const measurement = (
    await target.query(`
      SELECT playbook.sector_playbook_id, driver.business_driver_id,
             rule.business_driver_measurement_rule_id
        FROM governance.sector_playbook playbook
        JOIN governance.business_driver driver
          ON driver.sector_playbook_id = playbook.sector_playbook_id
        JOIN governance.business_driver_measurement_rule rule
          ON rule.business_driver_id = driver.business_driver_id
       WHERE playbook.playbook_key = 'semiconductor'
         AND driver.driver_key = 'inventory_position'
         AND rule.rule_key = 'inventory_yoy'
    `)
  ).rows[0];
  const durationMeasurement = (
    await target.query(`
      SELECT driver.business_driver_id,
             rule.business_driver_measurement_rule_id
        FROM governance.sector_playbook playbook
        JOIN governance.business_driver driver
          ON driver.sector_playbook_id = playbook.sector_playbook_id
        JOIN governance.business_driver_measurement_rule rule
          ON rule.business_driver_id = driver.business_driver_id
       WHERE playbook.playbook_key = 'semiconductor'
         AND driver.driver_key = 'capex_cycle'
         AND rule.rule_key = 'capex_yoy'
    `)
  ).rows[0];

  const shockId = (
    await target.query(
      `SELECT impact_shock_id FROM analytics.impact_shock WHERE shock_key = 'k4-rehearsal-shock'`,
    )
  ).rows[0].impact_shock_id;
  const channelId = (
    await target.query(
      `SELECT impact_channel_id FROM analytics.impact_channel WHERE channel_class = 'final_demand'`,
    )
  ).rows[0].impact_channel_id;
  const pitC = (
    await target.query(`
      SELECT ledger.source_pit_quality_id, revision.source_revision_id
        FROM governance.source_pit_quality_current_v1 quality
        JOIN governance.source_pit_quality ledger
          ON ledger.source_id = quality.source_id
         AND ledger.revision_no = quality.revision_no
        JOIN ingestion.source source ON source.source_id = quality.source_id
        JOIN ingestion.source_record_identity identity ON identity.source_id = source.source_id
        JOIN ingestion.source_revision revision
          ON revision.source_record_identity_id = identity.source_record_identity_id
       WHERE source.provider_key = 'bok-ecos'
    `)
  ).rows[0];
  const pitD = (
    await target.query(`
      SELECT ledger.source_pit_quality_id, revision.source_revision_id
        FROM governance.source_pit_quality_current_v1 quality
        JOIN governance.source_pit_quality ledger
          ON ledger.source_id = quality.source_id
         AND ledger.revision_no = quality.revision_no
        JOIN ingestion.source source ON source.source_id = quality.source_id
        JOIN ingestion.source_record_identity identity ON identity.source_id = source.source_id
        JOIN ingestion.source_revision revision
          ON revision.source_record_identity_id = identity.source_record_identity_id
       WHERE source.provider_key = 'yfinance'
    `)
  ).rows[0];
  const pitCFuture = {
    source_revision_id: pitC.source_revision_id,
    ...(
      await target.query(
        `INSERT INTO governance.source_pit_quality (
           source_id, revision_no, pit_quality_class, rationale,
           archive_pit_from, known_at, created_by
         )
         SELECT source_id, 2, pit_quality_class, 'future-known rehearsal grade',
                archive_pit_from, TIMESTAMPTZ '2026-08-11Z', 'rehearsal'
           FROM governance.source_pit_quality
          WHERE source_pit_quality_id = $1
         RETURNING source_pit_quality_id`,
        [pitC.source_pit_quality_id],
      )
    ).rows[0],
  };

  const otherRuleId = (
    await target.query(
      `SELECT business_driver_measurement_rule_id
         FROM governance.business_driver_measurement_rule
        WHERE rule_key = 'net_ppe_yoy'`,
    )
  ).rows[0].business_driver_measurement_rule_id;
  const ruleRevisionInsert = (supersedesId, knownAt) =>
    target.query(
      `INSERT INTO governance.business_driver_measurement_rule (
         business_driver_id, rule_key, revision_no, input_concept_selectors,
         comparison_method, output_unit, output_currency, direction_policy, materiality_policy,
         minimum_history_observations, allowed_pit_classes,
         score_component_formula_inputs, effective_from, known_at,
         supersedes_business_driver_measurement_rule_id, authored_by, metadata
       )
       SELECT business_driver_id, rule_key, 2, input_concept_selectors,
              comparison_method, output_unit, output_currency, direction_policy, materiality_policy,
              minimum_history_observations, allowed_pit_classes,
              score_component_formula_inputs, TIMESTAMPTZ '2026-08-01Z', $2,
              $1, 'rehearsal', metadata
         FROM governance.business_driver_measurement_rule
        WHERE business_driver_measurement_rule_id = $3
       RETURNING business_driver_measurement_rule_id`,
      [supersedesId, knownAt, measurement.business_driver_measurement_rule_id],
    );

  let exactRuleRevisionChainRejected = false;
  await target.query('BEGIN');
  try {
    exactRuleRevisionChainRejected = await (async () => {
      try {
        await ruleRevisionInsert(otherRuleId, '2026-08-09T00:00:00Z');
        return false;
      } catch (error) {
        if (error?.code === 'P0001') return true;
        throw error;
      }
    })();
  } finally {
    await target.query('ROLLBACK');
  }
  const futureRuleId = (
    await ruleRevisionInsert(
      measurement.business_driver_measurement_rule_id,
      '2026-08-11T00:00:00Z',
    )
  ).rows[0].business_driver_measurement_rule_id;

  const baseEvaluationRevisionId = (
    await target.query(
      `INSERT INTO analytics.impact_evaluation_revision (
         evaluation_key, revision_no, security_entity_id, information_set_id,
         evaluation_disposition, reason_detail
       ) VALUES ('revision-chain-base', 1, 2, 'ais-k4', 'missing_identity', 'fixture')
       RETURNING impact_evaluation_revision_id`,
    )
  ).rows[0].impact_evaluation_revision_id;
  let exactLedgerRevisionChainRejected = false;
  await target.query('BEGIN');
  try {
    exactLedgerRevisionChainRejected = await expectRejected(
      `INSERT INTO analytics.impact_evaluation_revision (
         evaluation_key, revision_no, security_entity_id, information_set_id,
         evaluation_disposition, reason_detail, supersedes_impact_evaluation_revision_id
       ) VALUES ('different-revision-key', 2, 2, 'ais-k4', 'missing_identity',
                 'fixture', ${baseEvaluationRevisionId})`,
      ['P0001'],
    );
  } finally {
    await target.query('ROLLBACK');
  }
  const numericFacts = new Map(
    (await target.query(`SELECT fact_key, numeric_fact_id FROM world.numeric_fact`)).rows.map(
      (fact) => [fact.fact_key, fact.numeric_fact_id],
    ),
  );
  const pitDFact = (
    await target.query(
      `INSERT INTO world.numeric_fact
         (fact_key, entity_id, concept_namespace, concept_key, value, unit, currency,
          instant_at, source_revision_id, available_at, known_at)
       VALUES ('pit-d-current', 1, 'us-gaap', 'InventoryNet', 130, 'currency', 'USD',
               TIMESTAMPTZ '2026-06-30Z', $1,
               TIMESTAMPTZ '2026-05-01Z', TIMESTAMPTZ '2026-05-01Z')
       RETURNING numeric_fact_id`,
      [pitD.source_revision_id],
    )
  ).rows[0].numeric_fact_id;

  const insertExposure = async (key, { unit = 'USD', securityEntityId = 2 } = {}) => {
    const exposure = (
      await target.query(
        `INSERT INTO analytics.impact_exposure_revision (
           exposure_key, revision_no, impact_shock_id, impact_channel_id,
           entity_id, sign, economic_magnitude, economic_magnitude_unit,
           evidence_locator, available_at, known_at
         ) VALUES ($1, 1, $2, $3, $4, 'negative', 20, $5, '{}'::jsonb,
                   TIMESTAMPTZ '2026-08-09T00:00:00Z', TIMESTAMPTZ '2026-08-09T00:00:00Z')
         RETURNING impact_exposure_revision_id`,
        [key, shockId, channelId, securityEntityId, unit],
      )
    ).rows[0].impact_exposure_revision_id;
    await target.query(
      `INSERT INTO analytics.impact_score_component
         (impact_exposure_revision_id, component_kind, component_value)
       SELECT $1, component_kind, 0.5
         FROM unnest(ARRAY[
           'evidence_confidence','relation_strength','materiality','transmission',
           'direction','lag','market_reflection','model_uncertainty'
         ]) component_kind`,
      [exposure],
    );
    return exposure;
  };

  const insertAcceptedEvaluation = async (key, exposure, overrides = {}) => {
    const options = {
      securityEntityId: 2,
      issuerEntityId: 1,
      driverId: measurement.business_driver_id,
      identityId: 1,
      ruleId: measurement.business_driver_measurement_rule_id,
      informationSetId: 'ais-k4',
      derivationId: 1,
      unit: 'currency',
      currency: 'USD',
      ...overrides,
    };
    return (
      await target.query(
        `INSERT INTO analytics.impact_evaluation_revision (
           evaluation_key, revision_no, security_entity_id, issuer_entity_id,
           security_issuer_identity_id, sector_playbook_id, business_driver_id,
           business_driver_measurement_rule_id, information_set_id, derivation_id,
           evaluation_disposition, measurement_value, measurement_unit, measurement_currency,
           direction, materiality, impact_exposure_revision_id
         ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9,
                   'accepted', 20, $10, $11, 'negative', 0.2, $12)
         RETURNING impact_evaluation_revision_id`,
        [
          key,
          options.securityEntityId,
          options.issuerEntityId,
          options.identityId,
          measurement.sector_playbook_id,
          options.driverId,
          options.ruleId,
          options.informationSetId,
          options.derivationId,
          options.unit,
          options.currency,
          exposure,
        ],
      )
    ).rows[0].impact_evaluation_revision_id;
  };

  const addEvidence = (evaluationId, factId, source, role) =>
    target.query(
      `INSERT INTO analytics.impact_evaluation_evidence (
         impact_evaluation_revision_id, numeric_fact_id, source_revision_id,
         source_pit_quality_id, input_role
       ) VALUES ($1, $2, $3, $4, $5)`,
      [evaluationId, factId, source.source_revision_id, source.source_pit_quality_id, role],
    );

  const expectEvaluationBasisRejected = async ({
    key,
    comparisonFactKey,
    currentFactKey,
    source = pitC,
    exposureOptions = {},
    evaluationOverrides = {},
  }) => {
    let rejected = false;
    await target.query('BEGIN');
    try {
      const exposure = await insertExposure(key, exposureOptions);
      const evaluation = await insertAcceptedEvaluation(
        `${key}-evaluation`,
        exposure,
        evaluationOverrides,
      );
      await addEvidence(evaluation, numericFacts.get(comparisonFactKey), source, 'comparison');
      await addEvidence(evaluation, numericFacts.get(currentFactKey), source, 'current');
      rejected = await expectRejected(
        `UPDATE analytics.impact_exposure_revision
            SET exposure_state = 'sealed', sealed_at = now()
          WHERE impact_exposure_revision_id = ${exposure}`,
        ['P0001'],
      );
    } catch (error) {
      if (error?.code === 'P0001') rejected = true;
      else throw error;
    } finally {
      await target.query('ROLLBACK');
    }
    return rejected;
  };

  const unassignedIssuerRejected = await expectEvaluationBasisRejected({
    key: 'k4-unassigned-issuer',
    comparisonFactKey: 'unassigned-comparison',
    currentFactKey: 'unassigned-current',
    exposureOptions: { securityEntityId: 4 },
    evaluationOverrides: {
      securityEntityId: 4,
      issuerEntityId: 5,
      identityId: 2,
      derivationId: 6,
    },
  });
  const wrongIssuerRejected = await expectEvaluationBasisRejected({
    key: 'k4-wrong-issuer',
    comparisonFactKey: 'wrong-issuer-comparison',
    currentFactKey: 'wrong-issuer-current',
    evaluationOverrides: { derivationId: 3 },
  });
  const wrongConceptRejected = await expectEvaluationBasisRejected({
    key: 'k4-wrong-concept',
    comparisonFactKey: 'wrong-concept-comparison',
    currentFactKey: 'wrong-concept-current',
    evaluationOverrides: { derivationId: 4 },
  });
  const wrongPeriodRejected = await expectEvaluationBasisRejected({
    key: 'k4-wrong-period',
    comparisonFactKey: 'wrong-period-comparison',
    currentFactKey: 'wrong-period-current',
    evaluationOverrides: { derivationId: 5 },
  });
  const unrelatedDerivationRejected = await expectEvaluationBasisRejected({
    key: 'k4-unrelated-derivation',
    comparisonFactKey: 'valid-comparison',
    currentFactKey: 'valid-current',
    evaluationOverrides: { derivationId: 2 },
  });
  const futureKnownRuleRejected = await expectEvaluationBasisRejected({
    key: 'k4-future-known-rule',
    comparisonFactKey: 'valid-comparison',
    currentFactKey: 'valid-current',
    evaluationOverrides: { ruleId: futureRuleId },
  });
  const futureKnownQualityRejected = await expectEvaluationBasisRejected({
    key: 'k4-future-known-quality',
    comparisonFactKey: 'valid-comparison',
    currentFactKey: 'valid-current',
    source: pitCFuture,
  });
  let acceptedExposure;
  let acceptedEvaluation;
  let durationYearOverYearAccepted = false;
  await target.query('BEGIN');
  try {
    const exposure = await insertExposure('k4-duration-year-over-year');
    const evaluation = await insertAcceptedEvaluation(
      'k4-duration-year-over-year-evaluation',
      exposure,
      {
        driverId: durationMeasurement.business_driver_id,
        ruleId: durationMeasurement.business_driver_measurement_rule_id,
        derivationId: 7,
      },
    );
    await addEvidence(evaluation, numericFacts.get('duration-comparison'), pitC, 'comparison');
    await addEvidence(evaluation, numericFacts.get('duration-current'), pitC, 'current');
    await target.query(
      `UPDATE analytics.impact_exposure_revision
          SET exposure_state = 'sealed', sealed_at = now()
        WHERE impact_exposure_revision_id = $1`,
      [exposure],
    );
    durationYearOverYearAccepted = true;
  } catch (error) {
    if (error?.code !== 'P0001') throw error;
  } finally {
    await target.query('ROLLBACK');
  }

  await target.query('BEGIN');
  try {
    acceptedExposure = await insertExposure('k4-accepted');
    acceptedEvaluation = await insertAcceptedEvaluation('k4-accepted-evaluation', acceptedExposure);
    await addEvidence(acceptedEvaluation, numericFacts.get('valid-comparison'), pitC, 'comparison');
    await addEvidence(acceptedEvaluation, numericFacts.get('valid-current'), pitC, 'current');
    await target.query(
      `UPDATE analytics.impact_exposure_revision
          SET exposure_state = 'sealed', sealed_at = now()
        WHERE impact_exposure_revision_id = $1`,
      [acceptedExposure],
    );
    await target.query('COMMIT');
  } catch (error) {
    await target.query('ROLLBACK');
    throw error;
  }

  const sealedEvidenceAppendRejected = await expectRejected(
    `INSERT INTO analytics.impact_evaluation_evidence (
       impact_evaluation_revision_id, numeric_fact_id, source_revision_id,
       source_pit_quality_id, input_role
     ) VALUES (${acceptedEvaluation}, ${numericFacts.get('valid-corroboration')},
               ${pitC.source_revision_id}, ${pitC.source_pit_quality_id}, 'corroboration')`,
    ['P0001'],
  );

  const missingEvaluationExposure = await insertExposure('k4-missing-evaluation');
  const citationRejected = await expectRejected(
    `UPDATE analytics.impact_exposure_revision SET exposure_state = 'sealed', sealed_at = now()
      WHERE impact_exposure_revision_id = ${missingEvaluationExposure}`,
    ['P0001'],
  );

  let unitRejected = false;
  await target.query('BEGIN');
  try {
    const exposure = await insertExposure('k4-unit-mismatch', { unit: 'KRW' });
    const evaluation = await insertAcceptedEvaluation('k4-unit-mismatch-evaluation', exposure, {
      currency: 'KRW',
    });
    await addEvidence(evaluation, numericFacts.get('valid-comparison'), pitC, 'comparison');
    await addEvidence(evaluation, numericFacts.get('valid-current'), pitC, 'current');
    unitRejected = await expectRejected(
      `UPDATE analytics.impact_exposure_revision SET exposure_state = 'sealed', sealed_at = now()
        WHERE impact_exposure_revision_id = ${exposure}`,
      ['P0001'],
    );
  } finally {
    await target.query('ROLLBACK');
  }

  let pitDERejected = false;
  await target.query('BEGIN');
  try {
    const exposure = await insertExposure('k4-pit-d');
    const evaluation = await insertAcceptedEvaluation('k4-pit-d-evaluation', exposure);
    pitDERejected = await expectRejected(
      `INSERT INTO analytics.impact_evaluation_evidence (
         impact_evaluation_revision_id, numeric_fact_id, source_revision_id,
         source_pit_quality_id, input_role
       ) VALUES (${evaluation}, ${pitDFact}, ${pitD.source_revision_id},
                 ${pitD.source_pit_quality_id}, 'current')`,
      ['P0001'],
    );
  } finally {
    await target.query('ROLLBACK');
  }

  await target.query(
    `INSERT INTO analytics.impact_path_step_exposure_citation
       (impact_path_step_id, impact_exposure_revision_id)
     VALUES (1, $1)`,
    [acceptedExposure],
  );
  const appendOnlyRejected = await expectRejected(
    `UPDATE analytics.impact_evaluation_revision SET reason_detail = 'rewrite'
      WHERE impact_evaluation_revision_id = ${acceptedEvaluation}`,
    ['55000'],
  );
  const rejectedCannotReferenceExposure = await expectRejected(
    `INSERT INTO analytics.impact_evaluation_revision (
       evaluation_key, revision_no, security_entity_id, information_set_id,
       evaluation_disposition, reason_detail, impact_exposure_revision_id
     ) VALUES ('bad-rejection-shape', 1, 2, 'ais-k4', 'missing_identity',
               'identity absent', ${acceptedExposure})`,
  );
  const servingPrivileges = (
    await target.query(`
      SELECT
        has_table_privilege('si_readapi', 'analytics.impact_evaluation_revision', 'SELECT')
          AS raw_evaluation_visible,
        has_table_privilege('si_readapi', 'analytics.impact_evaluation_evidence', 'SELECT')
          AS raw_evidence_visible,
        CASE WHEN to_regclass('analytics.accepted_impact_evaluation_v1') IS NULL THEN false
             ELSE has_table_privilege(
               'si_readapi', 'analytics.accepted_impact_evaluation_v1', 'SELECT'
             ) END AS accepted_view_visible,
        CASE WHEN to_regclass('analytics.accepted_impact_evaluation_evidence_v1') IS NULL THEN false
             ELSE has_table_privilege(
               'si_readapi', 'analytics.accepted_impact_evaluation_evidence_v1', 'SELECT'
             ) END AS evidence_view_visible
    `)
  ).rows[0];

  const k4 = {
    unresolvedAssignmentMigrationRejected,
    exactRuleRevisionChainRejected,
    exactLedgerRevisionChainRejected,
    securityAssignmentClosed:
      (
        await target.query(`SELECT count(*)::int AS n FROM governance.playbook_assignment
                            WHERE entity_id = 2 AND valid_to IS NOT NULL`)
      ).rows[0].n === 1,
    issuerSuccessorCreated:
      (
        await target.query(`SELECT count(*)::int AS n FROM governance.playbook_assignment
                            WHERE entity_id = 1 AND valid_to IS NULL
                              AND security_issuer_identity_id = 1`)
      ).rows[0].n === 1,
    threeExecutableRuleKeys:
      (
        await target.query(`SELECT count(DISTINCT rule_key)::int AS n
                             FROM governance.business_driver_measurement_rule`)
      ).rows[0].n === 3,
    v2ResolvesSecurityRules:
      (
        await target.query(`SELECT count(DISTINCT rule_key)::int AS n
                             FROM governance.security_playbook_measurement_rule_current_v2
                            WHERE security_entity_id = 2`)
      ).rows[0].n === 3,
    acceptedEvaluationSealsAtomically:
      (
        await target.query(
          `SELECT exposure_state FROM analytics.impact_exposure_revision
                            WHERE impact_exposure_revision_id = $1`,
          [acceptedExposure],
        )
      ).rows[0].exposure_state === 'sealed',
    unassignedIssuerRejected,
    wrongIssuerRejected,
    wrongConceptRejected,
    wrongPeriodRejected,
    unrelatedDerivationRejected,
    futureKnownRuleRejected,
    futureKnownQualityRejected,
    sealedEvidenceAppendRejected,
    rawDiagnosticsHidden:
      servingPrivileges.raw_evaluation_visible === false &&
      servingPrivileges.raw_evidence_visible === false,
    acceptedServingViewsVisible:
      servingPrivileges.accepted_view_visible === true &&
      servingPrivileges.evidence_view_visible === true,
    citationRejected,
    unitRejected,
    pitDERejected,
    appendOnlyRejected,
    rejectedCannotReferenceExposure,
    pathStepCitationAccepted:
      (
        await target.query(`SELECT count(*)::int AS n
                             FROM analytics.impact_path_step_exposure_citation`)
      ).rows[0].n === 1,
    durationYearOverYearAccepted,
  };

  // ── 085 truth class binding ─────────────────────────────────────────────────
  const resolved = Object.fromEntries(
    (
      await target.query(
        `SELECT item_kind, item_subkind, truth_class, truth_binding_state
           FROM serving.content_pack_item_truth_v1 ORDER BY content_pack_item_id`,
      )
    ).rows.map((row) => [
      row.item_subkind ? `${row.item_kind}:${row.item_subkind}` : row.item_kind,
      `${row.truth_class ?? 'null'}/${row.truth_binding_state}`,
    ]),
  );
  const truthClass = {
    relationIsRelation: resolved.relation === 'RELATION/bound',
    // Not EXPOSURE: rule-derived, direction unknown, no magnitude established.
    impactPathIsHypothesis: resolved.impact_path === 'HYPOTHESIS/bound',
    sourceEvidenceIsSource: resolved['evidence:source_revision'] === 'SOURCE/bound',
    modelConfigIsNotATruthObject: resolved['evidence:model_config'] === 'null/not_a_truth_object',
    identityMappingIsNotATruthObject:
      resolved['evidence:identity_mapping'] === 'null/not_a_truth_object',
    // An unbound kind must stay unclassified rather than take a default.
    unknownKindStaysUndecided: resolved.something_new === 'null/undecided',
    seedIsIdempotent:
      (await target.query('SELECT count(*)::int AS n FROM governance.truth_class_binding')).rows[0]
        .n === 5,
    stateAndClassCannotDisagree: await (async () => {
      try {
        await target.query(
          `INSERT INTO governance.truth_class_binding
             (object_domain, object_kind, truth_class, binding_state, basis, declared_by)
           VALUES ('t', 'k', 'FACT', 'not_a_truth_object', 'b', 'rehearsal')`,
        );
        return false;
      } catch {
        return true;
      }
    })(),
    appReaderSeesTheViewOnly:
      (
        await target.query(
          `SELECT has_table_privilege('stock_insight_app_reader',
                    'serving.content_pack_item_truth_v1', 'SELECT') AS view_ok,
                  has_table_privilege('stock_insight_app_reader',
                    'governance.truth_class_binding', 'SELECT') AS table_ok`,
        )
      ).rows[0].view_ok === true &&
      (
        await target.query(
          `SELECT has_table_privilege('stock_insight_app_reader',
                    'governance.truth_class_binding', 'SELECT') AS table_ok`,
        )
      ).rows[0].table_ok === false,
  };

  // ── 078 semantic snapshot ───────────────────────────────────────────────────
  const snapshot = {
    sealTransitionAllowed: false,
    reopenRejected: false,
    pinnedVersionImmutable: false,
    deleteRejected: false,
  };
  await target.query(
    `UPDATE governance.semantic_snapshot
        SET snapshot_state = 'sealed', sealed_at = now()
      WHERE semantic_snapshot_id = 'snap-1'`,
  );
  snapshot.sealTransitionAllowed = true;
  snapshot.reopenRejected = await expectRejected(
    `UPDATE governance.semantic_snapshot SET snapshot_state = 'open'
      WHERE semantic_snapshot_id = 'snap-1'`,
    ['P0001'],
  );
  snapshot.pinnedVersionImmutable = await expectRejected(
    `UPDATE governance.semantic_snapshot SET model_version = 'tampered'
      WHERE semantic_snapshot_id = 'snap-1'`,
    ['P0001'],
  );
  snapshot.deleteRejected = await expectRejected(
    `DELETE FROM governance.semantic_snapshot WHERE semantic_snapshot_id = 'snap-1'`,
    ['P0001'],
  );

  // ── 079 analysis information set ────────────────────────────────────────────
  await target.query(VALID_SET('is-ok'));
  const informationSet = {
    validRowAccepted: true,
    marketLeakRejected: await expectRejected(
      VALID_SET('is-leak', { market_observation_cutoff: `'2026-07-22T00:00:00Z'` }),
    ),
    liveMarketLeakRejected: await expectRejected(
      VALID_SET('is-live-leak', {
        mode: `'LIVE'`,
        market_observation_cutoff: `'2026-07-22T00:00:00Z'`,
      }),
    ),
    hindsightRejected: await expectRejected(
      VALID_SET('is-hindsight', {
        source_available_cutoff: `'2026-07-22T00:00:00Z'`,
        system_known_cutoff: `'2026-07-22T00:00:00Z'`,
      }),
    ),
    collectionOrderRejected: await expectRejected(
      VALID_SET('is-order', {
        mode: `'EX_POST'`,
        source_available_cutoff: `'2026-07-22T00:00:00Z'`,
        system_known_cutoff: `'2026-07-21T00:00:00Z'`,
        market_observation_cutoff: `'2026-07-22T00:00:00Z'`,
      }),
    ),
    expiredEmbargoRejected: await expectRejected(
      VALID_SET('is-embargo', { outcome_embargo_until: `'2026-07-20T00:00:00Z'` }),
    ),
    duplicateClassesRejected: await expectRejected(
      VALID_SET('is-dupe', { allowed_information_classes: `ARRAY['FACT','FACT']` }),
    ),
    exPostMaySeeOutcome: false,
    updateRejected: await expectRejected(
      `UPDATE governance.analysis_information_set SET mode = 'EX_POST'
        WHERE information_set_id = 'is-ok'`,
      ['P0001'],
    ),
    deleteRejected: await expectRejected(
      `DELETE FROM governance.analysis_information_set WHERE information_set_id = 'is-ok'`,
      ['P0001'],
    ),
  };
  // EX_POST is allowed to look past the decision point — that is its purpose.
  await target.query(
    VALID_SET('is-expost', {
      mode: `'EX_POST'`,
      system_known_cutoff: `'2026-07-22T00:00:00Z'`,
      market_observation_cutoff: `'2026-07-22T00:00:00Z'`,
    }),
  );
  informationSet.exPostMaySeeOutcome = true;

  // ── 080 source PIT quality ──────────────────────────────────────────────────
  const grades = await target.query(
    `SELECT provider_key, pit_quality_class, archive_pit_from IS NOT NULL AS has_archive_from
       FROM governance.source_pit_quality_current_v1 ORDER BY provider_key`,
  );
  const gradeByProvider = Object.fromEntries(
    grades.rows.map((row) => [row.provider_key, row.pit_quality_class]),
  );
  const pitQuality = {
    gradedEverySource: grades.rows.length === 8,
    grades: gradeByProvider,
    expectedGrades:
      gradeByProvider.fred === 'PIT_A_NATIVE_VINTAGE' &&
      gradeByProvider['sec-edgar'] === 'PIT_B_VERSIONED_ARTIFACT' &&
      gradeByProvider.opendart === 'PIT_B_VERSIONED_ARTIFACT' &&
      gradeByProvider['bok-ecos'] === 'PIT_C_OUR_ARCHIVE' &&
      gradeByProvider['internal-etf-holdings-snapshot'] === 'PIT_C_OUR_ARCHIVE' &&
      gradeByProvider.yfinance === 'PIT_D_LATEST_ONLY' &&
      gradeByProvider['rss:cnbc-markets'] === 'PIT_E_UNKNOWN' &&
      gradeByProvider.finra === 'PIT_E_UNKNOWN',
    // bok-ecos is the one PIT_C row with a source_revision behind it, so it is
    // the only one whose archive start can be derived.
    archiveFromOnlyForPitC:
      grades.rows.find((row) => row.provider_key === 'bok-ecos')?.has_archive_from === true &&
      grades.rows.every(
        (row) => row.pit_quality_class === 'PIT_C_OUR_ARCHIVE' || row.has_archive_from === false,
      ),
    updateRejected: await expectRejected(
      `UPDATE governance.source_pit_quality SET pit_quality_class = 'PIT_A_NATIVE_VINTAGE'
        WHERE revision_no = 1`,
      ['P0001'],
    ),
    // Re-running the migration must not double-insert.
    noDuplicateOnReapply: true,
  };
  await target.query(sourcePitQualityMigrationSql);
  const afterReapply = await target.query(
    'SELECT count(*)::int AS n FROM governance.source_pit_quality',
  );
  // Eight seeded sources plus the deliberate future-known K4 quality revision.
  pitQuality.noDuplicateOnReapply = afterReapply.rows[0]?.n === 9;

  // ── 081 release manifest ────────────────────────────────────────────────────
  await target.query(
    `INSERT INTO governance.release_manifest
       (release_id, semantic_snapshot_id, built_at, safety_state, created_by)
     VALUES ('rel-1', 'snap-1', '2026-07-21T00:00:00Z', 'NORMAL', 'rehearsal')`,
  );
  await target.query(
    `INSERT INTO governance.release_component (release_id, kind, snapshot_id, digest, fresh_until)
     VALUES ('rel-1', 'impact_brief', 'snap-1', repeat('a', 64), '2026-07-30T00:00:00Z')`,
  );
  const release = {
    duplicateKindRejected: await expectRejected(
      `INSERT INTO governance.release_component (release_id, kind, snapshot_id, digest, fresh_until)
       VALUES ('rel-1', 'impact_brief', 'snap-1', repeat('b', 64), '2026-07-30T00:00:00Z')`,
      ['23505'],
    ),
    badDigestRejected: await expectRejected(
      `INSERT INTO governance.release_component (release_id, kind, snapshot_id, digest, fresh_until)
       VALUES ('rel-1', 'other', 'snap-1', 'not-a-digest', '2026-07-30T00:00:00Z')`,
    ),
    publishedWithoutTimestampRejected: await expectRejected(
      `UPDATE governance.release_manifest SET release_state = 'published' WHERE release_id = 'rel-1'`,
    ),
    publishAllowed: false,
    componentAfterPublishRejected: false,
    componentCountFrozen: false,
    illegalTransitionRejected: false,
    currentViewResolves: false,
    deleteRejected: false,
  };
  await target.query(
    `UPDATE governance.release_manifest
        SET release_state = 'published', published_at = now(), component_count = 1
      WHERE release_id = 'rel-1'`,
  );
  release.publishAllowed = true;
  release.componentAfterPublishRejected = await expectRejected(
    `INSERT INTO governance.release_component (release_id, kind, snapshot_id, digest, fresh_until)
     VALUES ('rel-1', 'entity_relation_graph', 'snap-1', repeat('c', 64), '2026-07-30T00:00:00Z')`,
    ['P0001'],
  );
  release.componentCountFrozen = await expectRejected(
    `UPDATE governance.release_manifest SET component_count = 9 WHERE release_id = 'rel-1'`,
    ['P0001'],
  );
  release.illegalTransitionRejected = await expectRejected(
    `UPDATE governance.release_manifest SET release_state = 'building' WHERE release_id = 'rel-1'`,
    ['P0001'],
  );
  release.deleteRejected = await expectRejected(
    `DELETE FROM governance.release_manifest WHERE release_id = 'rel-1'`,
    ['P0001'],
  );
  const currentRelease = await target.query(
    `SELECT kind, release_id, safety_state FROM governance.release_current_v1`,
  );
  release.currentViewResolves =
    currentRelease.rows.length === 1 && currentRelease.rows[0].release_id === 'rel-1';

  // ── 082 safety state ────────────────────────────────────────────────────────
  const seeded = await target.query(
    `SELECT safety_state, recommendation_allowed FROM governance.safety_state_current_v1
      WHERE scope = 'global'`,
  );
  const safety = {
    seededNormal: seeded.rows[0]?.safety_state === 'NORMAL',
    normalAllowsRecommendation: seeded.rows[0]?.recommendation_allowed === true,
    reasonRequired: await expectRejected(
      `INSERT INTO governance.safety_state_transition
         (from_state, to_state, trigger_kind, reason, decided_by)
       VALUES ('NORMAL', 'CAUTION', 'slo', '   ', 'rehearsal')`,
    ),
    sameStateTransitionRejected: await expectRejected(
      `INSERT INTO governance.safety_state_transition
         (from_state, to_state, trigger_kind, reason, decided_by)
       VALUES ('NORMAL', 'NORMAL', 'manual', 'noop', 'rehearsal')`,
    ),
    cautionLeavesRecommendationUndecided: false,
    severityOrdered: false,
    updateRejected: await expectRejected(
      `UPDATE governance.safety_state_transition SET to_state = 'HALTED' WHERE scope = 'global'`,
      ['P0001'],
    ),
  };
  await target.query(
    `INSERT INTO governance.safety_state_transition
       (from_state, to_state, trigger_kind, reason, evidence_ref, decided_by)
     VALUES ('NORMAL', 'CAUTION', 'slo', 'knowledge.claim.growth breached twice',
             'knowledge.claim.growth', 'rehearsal')`,
  );
  const afterCaution = await target.query(
    `SELECT safety_state, recommendation_allowed, severity
       FROM governance.safety_state_current_v1 WHERE scope = 'global'`,
  );
  safety.cautionLeavesRecommendationUndecided =
    afterCaution.rows[0]?.safety_state === 'CAUTION' &&
    afterCaution.rows[0]?.recommendation_allowed === null;
  const severities = await target.query(
    `SELECT governance.safety_state_severity('NORMAL') AS n,
            governance.safety_state_severity('HALTED') AS h`,
  );
  safety.severityOrdered = severities.rows[0]?.n === 0 && severities.rows[0]?.h === 3;

  // ── 083 SLO ledger ──────────────────────────────────────────────────────────
  const definitions = await target.query(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE breach_safety_state IS NULL)::int AS report_only
       FROM governance.slo_definition`,
  );
  const slo = {
    seededDefinitions: definitions.rows[0]?.n === 8,
    allReportOnly: definitions.rows[0]?.report_only === 8,
    lyingVerdictRejected: await expectRejected(
      `INSERT INTO governance.slo_observation
         (slo_key, observed_value, threshold_at_observation, comparison_at_observation,
          breached, window_start, window_end, observed_by)
       VALUES ('knowledge.claim.growth', 0, 1, 'at_least', false,
               '2026-07-20T00:00:00Z', '2026-07-21T00:00:00Z', 'rehearsal')`,
    ),
    invertedWindowRejected: await expectRejected(
      `INSERT INTO governance.slo_observation
         (slo_key, observed_value, threshold_at_observation, comparison_at_observation,
          breached, window_start, window_end, observed_by)
       VALUES ('knowledge.claim.growth', 5, 1, 'at_least', false,
               '2026-07-21T00:00:00Z', '2026-07-20T00:00:00Z', 'rehearsal')`,
    ),
    consecutiveBreachesCounted: false,
    updateRejected: false,
  };
  for (const [value, breached, day] of [
    [5, false, '22'],
    [0, true, '23'],
    [0, true, '24'],
  ]) {
    await target.query(
      `INSERT INTO governance.slo_observation
         (slo_key, observed_value, threshold_at_observation, comparison_at_observation,
          breached, window_start, window_end, observed_at, observed_by)
       VALUES ('knowledge.claim.growth', $1, 1, 'at_least', $2,
               '2026-07-${'$'}{day}T00:00:00Z'::timestamptz - interval '1 day',
               '2026-07-${'$'}{day}T00:00:00Z', '2026-07-${'$'}{day}T00:00:00Z', 'rehearsal')`.replaceAll(
        '${day}',
        day,
      ),
      [value, breached],
    );
  }
  const sloCurrent = await target.query(
    `SELECT consecutive_breaches, breached FROM governance.slo_current_v1
      WHERE slo_key = 'knowledge.claim.growth'`,
  );
  slo.consecutiveBreachesCounted =
    Number(sloCurrent.rows[0]?.consecutive_breaches) === 2 && sloCurrent.rows[0]?.breached === true;
  slo.updateRejected = await expectRejected(
    `UPDATE governance.slo_observation SET breached = false WHERE slo_key = 'knowledge.claim.growth'`,
    ['P0001'],
  );

  // ── 084 metric definition registry ──────────────────────────────────────────
  const defn = (key, overrides = {}) => {
    const columns = {
      definition_key: `'${key}'`,
      revision_no: '1',
      concept_namespace: `'ifrs-full'`,
      concept_key: `'Revenue'`,
      canonical_concept: `'revenue'`,
      display_name: `'Revenue'`,
      definition_scope: `'canonical'`,
      period_basis: `'duration_quarter'`,
      accounting_basis: `'ifrs'`,
      unit: `'currency'`,
      currency: `'KRW'`,
      comparability_group_key: `'revenue.quarter'`,
      comparability_group_version: '1',
      effective_from: `'2026-01-01T00:00:00Z'`,
      created_by: `'rehearsal'`,
      ...overrides,
    };
    return `INSERT INTO governance.metric_definition (${Object.keys(columns).join(', ')})
            VALUES (${Object.values(columns).join(', ')}) RETURNING metric_definition_id`;
  };

  const defA = (await target.query(defn('rev.ifrs'))).rows[0].metric_definition_id;
  const defB = (
    await target.query(
      defn('rev.gaap', {
        concept_namespace: `'us-gaap'`,
        accounting_basis: `'gaap'`,
        currency: `'USD'`,
      }),
    )
  ).rows[0].metric_definition_id;
  const defC = (
    await target.query(
      defn('rev.adj', {
        concept_namespace: `'issuer'`,
        accounting_basis: `'non_gaap'`,
        exclusions: `ARRAY['one-off rebate']`,
        comparability_group_key: `'revenue.adjusted'`,
      }),
    )
  ).rows[0].metric_definition_id;

  const metric = {
    sameGroupFallsBackToComparable: false,
    differentGroupFallsBackToUnknown: false,
    comparableAcrossGroupsRejected: await expectRejected(
      `INSERT INTO governance.metric_comparability
         (from_metric_definition_id, to_metric_definition_id, comparability_state, rationale, assessed_by)
       VALUES (${defA}, ${defC}, 'COMPARABLE', 'wrong', 'rehearsal')`,
      ['P0001'],
    ),
    normalizableWithoutRuleRejected: await expectRejected(
      `INSERT INTO governance.metric_comparability
         (from_metric_definition_id, to_metric_definition_id, comparability_state, rationale, assessed_by)
       VALUES (${defC}, ${defA}, 'NORMALIZABLE', 'no rule given', 'rehearsal')`,
    ),
    partialWithoutScopeRejected: await expectRejected(
      `INSERT INTO governance.metric_comparability
         (from_metric_definition_id, to_metric_definition_id, comparability_state, rationale, assessed_by)
       VALUES (${defC}, ${defB}, 'PARTIALLY_COMPARABLE', 'no scope given', 'rehearsal')`,
    ),
    nonGaapWithoutAdjustmentRejected: await expectRejected(
      defn('rev.bad', { concept_namespace: `'issuer'`, accounting_basis: `'non_gaap'` }),
    ),
    ratioWithoutBothSidesRejected: await expectRejected(
      defn('margin.bad', { unit: `'ratio'`, currency: 'NULL' }),
    ),
    currencyScopeEnforced: await expectRejected(defn('rev.nocur', { currency: 'NULL' })),
    selfComparabilityRejected: await expectRejected(
      `INSERT INTO governance.metric_comparability
         (from_metric_definition_id, to_metric_definition_id, comparability_state, rationale, assessed_by)
       VALUES (${defA}, ${defA}, 'COMPARABLE', 'self', 'rehearsal')`,
    ),
    normalizableNotMirrored: false,
    definitionContentImmutable: await expectRejected(
      `UPDATE governance.metric_definition SET unit = 'ratio' WHERE metric_definition_id = ${defA}`,
      ['P0001'],
    ),
    definitionStateMayMove: false,
    deleteRejected: await expectRejected(
      `DELETE FROM governance.metric_definition WHERE metric_definition_id = ${defA}`,
      ['P0001'],
    ),
  };

  // Same group and version, no explicit assessment -> COMPARABLE.
  metric.sameGroupFallsBackToComparable =
    (await target.query(`SELECT governance.metric_comparability_state(${defA}, ${defB}) AS s`))
      .rows[0].s === 'COMPARABLE';
  // Different group, no assessment -> UNKNOWN. Never COMPARABLE.
  metric.differentGroupFallsBackToUnknown =
    (await target.query(`SELECT governance.metric_comparability_state(${defA}, ${defC}) AS s`))
      .rows[0].s === 'UNKNOWN';

  // One-way normalization: C converts to A, and asking A -> C must not inherit it.
  await target.query(
    `INSERT INTO governance.metric_comparability
       (from_metric_definition_id, to_metric_definition_id, comparability_state, rationale,
        normalization_rule, assessed_by)
     VALUES (${defC}, ${defA}, 'NORMALIZABLE', 'add back the disclosed rebate',
             'value + rebate_disclosed', 'rehearsal')`,
  );
  const forward = (
    await target.query(`SELECT governance.metric_comparability_state(${defC}, ${defA}) AS s`)
  ).rows[0].s;
  const reverse = (
    await target.query(`SELECT governance.metric_comparability_state(${defA}, ${defC}) AS s`)
  ).rows[0].s;
  metric.normalizableNotMirrored = forward === 'NORMALIZABLE' && reverse === 'UNKNOWN';

  await target.query(
    `UPDATE governance.metric_definition SET definition_state = 'superseded'
      WHERE metric_definition_id = ${defB}`,
  );
  metric.definitionStateMayMove = true;

  // ── boot-digest safety: the app roles must not reach any new table ──────────
  const reach = await target.query(
    `SELECT role_name, relation, bool_or(reachable) AS reachable
       FROM (
         SELECT r.rolname AS role_name,
                n.nspname || '.' || c.relname AS relation,
                has_table_privilege(r.rolname, c.oid, p.name) AS reachable
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('REFERENCES'),('TRIGGER')) p(name)
          CROSS JOIN pg_roles r
          WHERE n.nspname IN ('governance', 'serving')
            AND c.relkind IN ('r','v')
            AND r.rolname IN ('stock_insight_app_reader','stock_insight_app_writer')
       ) reachability
      GROUP BY role_name, relation
      ORDER BY role_name, relation`,
  );
  const appRoleReachable = reach.rows.filter((row) => row.reachable);

  // 085 deliberately widens the app reader by exactly one relation, because
  // REQ-SEM-010 is a rendering requirement and the reader the product serves from
  // has to see the resolved class. The gauge is not "nothing moved" but "only this
  // moved" — and either way the boot digest must be re-pinned in the same landing.
  //
  // The probe covers serving as well as governance for the same reason: a check
  // that only looks where nothing changed reports success by looking away.
  const DECLARED_APP_ROLE_REACH = ['stock_insight_app_reader:serving.content_pack_item_truth_v1'];
  const observedAppRoleReach = appRoleReachable
    .map((row) => `${row.role_name}:${row.relation}`)
    .sort();

  result = {
    database: databaseName,
    reapplyIsIdempotent: true,
    snapshot,
    informationSet,
    pitQuality,
    release,
    safety,
    slo,
    metric,
    truthClass,
    economicClaim,
    sectorPlaybook,
    k4,
    digestSafety: {
      relationsChecked: reach.rows.length,
      appRoleReachableRelations: observedAppRoleReach,
      declaredAppRoleReach: DECLARED_APP_ROLE_REACH,
      appRoleReachIsExactlyWhatWasDeclared:
        JSON.stringify(observedAppRoleReach) ===
        JSON.stringify([...DECLARED_APP_ROLE_REACH].sort()),
      bootDigestMustBeRepinned: observedAppRoleReach.length > 0,
    },
  };

  const failures = [];
  for (const [group, checks] of Object.entries({
    snapshot,
    informationSet,
    release,
    safety,
    slo,
    metric,
    truthClass,
    economicClaim,
    sectorPlaybook,
    k4,
  })) {
    for (const [name, value] of Object.entries(checks)) {
      if (value !== true) failures.push(`${group}.${name}`);
    }
  }
  for (const name of [
    'gradedEverySource',
    'expectedGrades',
    'archiveFromOnlyForPitC',
    'updateRejected',
    'noDuplicateOnReapply',
  ]) {
    if (pitQuality[name] !== true) failures.push(`pitQuality.${name}`);
  }
  if (!result.digestSafety.appRoleReachIsExactlyWhatWasDeclared) {
    failures.push('digestSafety.appRoleReachIsExactlyWhatWasDeclared');
  }
  if (failures.length > 0) {
    throw new Error(`Kernel rehearsal assertions failed: ${failures.join(', ')}`);
  }
} catch (error) {
  primaryError = error;
} finally {
  if (target) {
    try {
      await target.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${quotedDatabase} WITH (FORCE)`);
  } catch (error) {
    cleanupErrors.push(error);
  }
  for (const roleName of roleNames) {
    if (preExistingRoles.has(roleName)) continue;
    try {
      await admin.query(`DROP ROLE IF EXISTS "${roleName}"`);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    const roleStateAfter = await readRoleState();
    const restored = JSON.stringify(roleStateAfter) === JSON.stringify(roleStateBefore);
    if (result) result.roleStateRestored = restored;
    if (!restored) cleanupErrors.push(new Error('rehearsal role state was not restored'));
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await admin.end();
  } catch (error) {
    cleanupErrors.push(error);
  }
}

const failures = primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors;
if (failures.length > 0) throw new AggregateError(failures, 'Kernel rehearsal or cleanup failed');
if (!result) throw new Error('Kernel rehearsal produced no result');
console.log(JSON.stringify(result, null, 2));
