// Rehearses migrations 078–094 plus the migration-037 exposure surface that
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

import { k4MarketIntelligenceRunReceiptMigrationSql } from '../../../packages/db-schema/src/migrations/091_k4_market_intelligence_run_receipt.ts';
import { p4V2ServingMigrationSql } from '../../../packages/db-schema/src/migrations/092_p4_v2_serving.ts';
import { k4RunReceiptPrivilegeHardeningMigrationSql } from '../../../packages/db-schema/src/migrations/093_k4_run_receipt_privilege_hardening.ts';
import { k4SemanticSnapshotReconstructionMigrationSql } from '../../../packages/db-schema/src/migrations/094_k4_semantic_snapshot_reconstruction.ts';
import { planK4MarketIntelligence } from '../src/analytics/k4-market-intelligence-plan.ts';
import { executeK4MarketIntelligenceJob } from '../src/analytics/k4-market-intelligence-runner.ts';
import { persistK4MarketIntelligencePlan } from '../src/analytics/k4-market-intelligence-writer.ts';
import { getPersonalizationPortfolioImpactV2 } from '../src/personalization/impact-v2-read-model.ts';
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
      derivation_key TEXT NOT NULL UNIQUE,
      derivation_kind TEXT NOT NULL,
      method TEXT NOT NULL,
      method_version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'building',
      step_count INTEGER NOT NULL DEFAULT 0,
      input_count INTEGER NOT NULL DEFAULT 0,
      derivation_digest TEXT,
      created_by TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      sealed_at TIMESTAMPTZ
    );
    INSERT INTO knowledge.derivation (
      derivation_key, derivation_kind, method, method_version, status,
      step_count, input_count, derivation_digest, created_by, sealed_at
    )
    SELECT 'rehearsal-seed-' || seed::text, 'calculation', 'fixture', 'v1',
           'sealed', 1, CASE WHEN seed = 2 THEN 0 ELSE 2 END,
           repeat(seed::text, 64), 'rehearsal', TIMESTAMPTZ '2026-05-01Z'
      FROM generate_series(1, 7) seed;

    CREATE SCHEMA world;
    CREATE TABLE world.event (
      event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      event_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      subject_scope TEXT NOT NULL DEFAULT 'single_entity',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE world.event_revision (
      event_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES world.event(event_id),
      revision_no INTEGER NOT NULL,
      lifecycle_state TEXT NOT NULL,
      summary_text TEXT,
      magnitude NUMERIC,
      magnitude_unit TEXT,
      surprise_score REAL,
      story_id BIGINT,
      source_revision_id BIGINT,
      extraction_run_id TEXT,
      published_at TIMESTAMPTZ,
      available_at TIMESTAMPTZ NOT NULL,
      known_at TIMESTAMPTZ NOT NULL,
      valid_from TIMESTAMPTZ,
      valid_until TIMESTAMPTZ,
      supersedes_event_revision_id BIGINT REFERENCES world.event_revision(event_revision_id),
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (event_id, revision_no)
    );
    CREATE TABLE world.event_participant (
      event_participant_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      event_revision_id BIGINT NOT NULL REFERENCES world.event_revision(event_revision_id),
      entity_id BIGINT,
      participant_role TEXT NOT NULL,
      location_role TEXT,
      role_detail JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO world.event (event_key, event_type, subject_scope)
    VALUES ('rehearsal-existing-event', 'fixture', 'single_entity');
    INSERT INTO world.event_revision (
      event_id, revision_no, lifecycle_state, available_at, known_at
    ) VALUES (
      1, 1, 'confirmed', TIMESTAMPTZ '2026-05-01Z', TIMESTAMPTZ '2026-05-01Z'
    );

    CREATE SCHEMA analytics;
    CREATE TABLE analytics.impact_path_step (
      impact_path_step_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      to_entity_id BIGINT NOT NULL
    );

    CREATE TABLE analytics.scenario_set (
      scenario_set_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      impact_shock_id BIGINT,
      known_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE analytics.scenario_branch (
      scenario_set_id BIGINT NOT NULL REFERENCES analytics.scenario_set(scenario_set_id),
      branch_state TEXT NOT NULL,
      branch_key TEXT NOT NULL
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
      ('Stock', 'Identityless Rehearsal Security'),
      ('Stock', 'Coverage Security 7'),
      ('Stock', 'Coverage Security 8'),
      ('Stock', 'Coverage Security 9'),
      ('Stock', 'Coverage Security 10'),
      ('Stock', 'Coverage Security 11'),
      ('Stock', 'Coverage Security 12'),
      ('Stock', 'Coverage Security 13');
    CREATE TABLE core.entity_identifier (
      entity_identifier_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
      identifier_type TEXT NOT NULL,
      identifier_value TEXT NOT NULL,
      valid_from TIMESTAMPTZ,
      valid_to TIMESTAMPTZ
    );
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

    CREATE SCHEMA personalization;
    CREATE TABLE personalization.portfolio_snapshot (
      portfolio_snapshot_id UUID PRIMARY KEY,
      user_id UUID NOT NULL,
      snapshot_as_of TIMESTAMPTZ NOT NULL,
      source_known_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE personalization.portfolio_lot_snapshot (
      portfolio_snapshot_id UUID NOT NULL,
      user_id UUID NOT NULL,
      security_entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
      portfolio_weight NUMERIC NOT NULL
    );
    CREATE TABLE personalization.portfolio_snapshot_seal (
      portfolio_snapshot_id UUID NOT NULL,
      user_id UUID NOT NULL,
      sealed_at TIMESTAMPTZ NOT NULL
    );

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
      derivation_id BIGINT NOT NULL REFERENCES knowledge.derivation(derivation_id),
      step_no INTEGER NOT NULL,
      activity_type TEXT NOT NULL,
      activity_version TEXT NOT NULL,
      output_type TEXT NOT NULL,
      output_locator JSONB NOT NULL,
      parameters JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (derivation_id, step_no)
    );
    CREATE TABLE knowledge.derivation_input (
      derivation_input_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      derivation_step_id BIGINT NOT NULL REFERENCES knowledge.derivation_step(derivation_step_id),
      input_no INTEGER NOT NULL,
      input_kind TEXT NOT NULL,
      numeric_fact_id BIGINT REFERENCES world.numeric_fact(numeric_fact_id),
      source_derivation_step_id BIGINT REFERENCES knowledge.derivation_step(derivation_step_id),
      input_role TEXT NOT NULL DEFAULT 'evidence',
      input_digest TEXT,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (derivation_step_id, input_no),
      CHECK (num_nonnulls(numeric_fact_id, source_derivation_step_id) = 1)
    );
    INSERT INTO knowledge.derivation_step (
      derivation_id, step_no, activity_type, activity_version,
      output_type, output_locator, parameters
    )
    SELECT seed, 1, 'calculation', 'v1', 'fixture', '{}'::jsonb, '{}'::jsonb
      FROM generate_series(1, 7) seed;
    INSERT INTO knowledge.derivation_input (
      derivation_step_id, input_no, input_kind, numeric_fact_id, input_role
    )
    SELECT fixture.derivation_id,
           row_number() OVER (PARTITION BY fixture.derivation_id ORDER BY fact.numeric_fact_id),
           'numeric_fact', fact.numeric_fact_id, 'evidence'
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

  await target.query(`
    CREATE OR REPLACE FUNCTION knowledge.compute_derivation_digest(p_derivation_id BIGINT)
    RETURNS TEXT LANGUAGE sql STABLE AS $$
      SELECT encode(sha256(convert_to(
        coalesce((SELECT derivation.derivation_key FROM knowledge.derivation derivation
                   WHERE derivation.derivation_id=p_derivation_id), '') || E'\\n' ||
        coalesce((SELECT string_agg(
          concat_ws(':', step.step_no, input.input_no, input.input_kind,
                    coalesce(input.numeric_fact_id::text, input.source_derivation_step_id::text)),
          E'\\n' ORDER BY step.step_no, input.input_no)
          FROM knowledge.derivation_step step
          JOIN knowledge.derivation_input input USING (derivation_step_id)
         WHERE step.derivation_id=p_derivation_id), ''), 'UTF8')), 'hex')
    $$;

    CREATE OR REPLACE FUNCTION knowledge.guard_rehearsal_derivation_write()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE actual_steps INTEGER; actual_inputs INTEGER; actual_digest TEXT;
    BEGIN
      IF TG_OP='INSERT' THEN
        IF NEW.status <> 'building' OR NEW.step_count <> 0 OR NEW.input_count <> 0
           OR NEW.derivation_digest IS NOT NULL OR NEW.sealed_at IS NOT NULL THEN
          RAISE EXCEPTION 'derivation must start building';
        END IF;
        RETURN NEW;
      END IF;
      IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'knowledge.derivation is append-only' USING ERRCODE='55000';
      END IF;
      IF OLD.status='building' AND NEW.status='sealed' THEN
        SELECT count(*)::int INTO actual_steps FROM knowledge.derivation_step
         WHERE derivation_id=OLD.derivation_id;
        SELECT count(*)::int INTO actual_inputs
          FROM knowledge.derivation_input input
          JOIN knowledge.derivation_step step USING (derivation_step_id)
         WHERE step.derivation_id=OLD.derivation_id;
        actual_digest := knowledge.compute_derivation_digest(OLD.derivation_id);
        IF NEW.step_count <> actual_steps OR NEW.input_count <> actual_inputs
           OR NEW.derivation_digest IS DISTINCT FROM actual_digest OR NEW.sealed_at IS NULL THEN
          RAISE EXCEPTION 'derivation seal mismatch';
        END IF;
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'invalid derivation transition';
    END $$;
    CREATE TRIGGER derivation_write_guard
      BEFORE INSERT OR UPDATE OR DELETE ON knowledge.derivation
      FOR EACH ROW EXECUTE FUNCTION knowledge.guard_rehearsal_derivation_write();

    CREATE OR REPLACE FUNCTION knowledge.guard_rehearsal_derivation_child_write()
    RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE parent_status TEXT;
    BEGIN
      IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'derivation child is append-only' USING ERRCODE='55000';
      END IF;
      SELECT derivation.status INTO parent_status
        FROM knowledge.derivation derivation
        JOIN knowledge.derivation_step step
          ON step.derivation_id=derivation.derivation_id
       WHERE step.derivation_step_id=CASE WHEN TG_TABLE_NAME='derivation_step'
         THEN NEW.derivation_step_id ELSE NEW.derivation_step_id END;
      IF TG_TABLE_NAME='derivation_step' THEN
        SELECT status INTO parent_status FROM knowledge.derivation
         WHERE derivation_id=NEW.derivation_id;
      END IF;
      IF parent_status IS DISTINCT FROM 'building' THEN
        RAISE EXCEPTION 'derivation child parent is not building';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER derivation_step_write_guard
      BEFORE INSERT OR UPDATE OR DELETE ON knowledge.derivation_step
      FOR EACH ROW EXECUTE FUNCTION knowledge.guard_rehearsal_derivation_child_write();
    CREATE TRIGGER derivation_input_write_guard
      BEFORE INSERT OR UPDATE OR DELETE ON knowledge.derivation_input
      FOR EACH ROW EXECUTE FUNCTION knowledge.guard_rehearsal_derivation_child_write();

    CREATE OR REPLACE FUNCTION world.reject_rehearsal_event_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP='INSERT' THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'world event ledger is append-only' USING ERRCODE='55000';
    END $$;
    CREATE TRIGGER event_revision_write_guard
      BEFORE INSERT OR UPDATE OR DELETE ON world.event_revision
      FOR EACH ROW EXECUTE FUNCTION world.reject_rehearsal_event_mutation();
    CREATE TRIGGER event_participant_write_guard
      BEFORE UPDATE OR DELETE ON world.event_participant
      FOR EACH ROW EXECUTE FUNCTION world.reject_rehearsal_event_mutation();
  `);
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
  await target.query(`
    GRANT USAGE ON SCHEMA core, ingestion, world, knowledge, analytics TO si_analytics;
    GRANT SELECT ON core.entity, core.security_issuer_identity,
      ingestion.source, ingestion.source_record_identity, ingestion.source_revision,
      world.numeric_fact TO si_analytics;
    GRANT SELECT, INSERT, UPDATE ON knowledge.derivation TO si_analytics;
    GRANT SELECT, INSERT ON knowledge.derivation_step, knowledge.derivation_input TO si_analytics;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA knowledge TO si_analytics;
    GRANT SELECT ON analytics.impact_path_step TO si_analytics;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA world TO si_analytics;
  `);

  MIGRATIONS.push(
    issuerPlaybookMeasurementRuleMigrationSql,
    k4MarketIntelligenceLedgerMigrationSql,
    k4MarketIntelligenceRunReceiptMigrationSql,
    p4V2ServingMigrationSql,
    k4RunReceiptPrivilegeHardeningMigrationSql,
    k4SemanticSnapshotReconstructionMigrationSql,
  );
  await target.query(issuerPlaybookMeasurementRuleMigrationSql);
  await target.query(k4MarketIntelligenceLedgerMigrationSql);
  await target.query(k4MarketIntelligenceRunReceiptMigrationSql);
  await target.query(p4V2ServingMigrationSql);
  await target.query(k4RunReceiptPrivilegeHardeningMigrationSql);
  await target.query(k4SemanticSnapshotReconstructionMigrationSql);
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

  // ── Task 3 deterministic writer and transaction orchestration ───────────────
  const writerCutoff = '2026-08-10T14:59:59.999Z';
  const writerInformationSetId = 'ais-k4-writer';
  await target.query(
    `INSERT INTO governance.analysis_information_set (
       information_set_id, mode, valid_cutoff, source_available_cutoff,
       system_known_cutoff, market_observation_cutoff,
       semantic_snapshot_id, created_by
     ) VALUES ($1, 'EX_ANTE', $2, $2, $2, $2, 'snap-1', 'rehearsal')`,
    [writerInformationSetId, writerCutoff],
  );

  const expectationDerivationId = (
    await target.query(
      `INSERT INTO knowledge.derivation (
         derivation_key, derivation_kind, method, method_version, created_by
       ) VALUES (
         'expectation:1:InventoryNet:2026-06-30', 'calculation',
         'rehearsal-prior-model', 'v1', 'rehearsal'
       ) RETURNING derivation_id`,
    )
  ).rows[0].derivation_id;
  const expectationStepId = (
    await target.query(
      `INSERT INTO knowledge.derivation_step (
         derivation_id, step_no, activity_type, activity_version,
         output_type, output_locator, parameters
       ) VALUES (
         $1, 1, 'calculation', 'v1', 'expectation_revision',
         '{"expectation_key":"prior-model:1:InventoryNet:2026-06-30"}'::jsonb,
         '{"method":"prior_model"}'::jsonb
       ) RETURNING derivation_step_id`,
      [expectationDerivationId],
    )
  ).rows[0].derivation_step_id;
  await target.query(
    `INSERT INTO knowledge.derivation_input (
       derivation_step_id, input_no, input_kind, numeric_fact_id, input_role
     ) VALUES ($1, 1, 'numeric_fact', $2, 'prior_observation')`,
    [expectationStepId, numericFacts.get('valid-comparison')],
  );
  const expectationDigest = (
    await target.query(`SELECT knowledge.compute_derivation_digest($1) AS digest`, [
      expectationDerivationId,
    ])
  ).rows[0].digest;
  await target.query(
    `UPDATE knowledge.derivation
        SET status='sealed', step_count=1, input_count=1,
            derivation_digest=$2, sealed_at=clock_timestamp()
      WHERE derivation_id=$1`,
    [expectationDerivationId, expectationDigest],
  );
  const expectationRevisionId = (
    await target.query(
      `INSERT INTO analytics.expectation_revision (
         expectation_key, revision_no, target_entity_id, expectation_kind,
         as_of_at, horizon, target_period_end, expected_value, expected_unit,
         dispersion, information_set_id, derivation_id, available_at, known_at
       ) VALUES (
         'prior-model:1:InventoryNet:2026-06-30', 1, 1, 'prior_model',
         TIMESTAMPTZ '2026-05-01Z', 'short', DATE '2026-06-30', 125, 'USD', 5,
         $1, $2, TIMESTAMPTZ '2026-05-01Z', TIMESTAMPTZ '2026-05-01Z'
       ) RETURNING expectation_revision_id`,
      [writerInformationSetId, expectationDerivationId],
    )
  ).rows[0].expectation_revision_id;

  const writerRuleRow = (
    await target.query(
      `SELECT driver.driver_key, driver.business_driver_id,
              rule.business_driver_measurement_rule_id, rule.rule_key,
              rule.comparison_method, rule.output_unit, rule.output_currency,
              rule.input_concept_selectors, rule.direction_policy,
              rule.materiality_policy, rule.minimum_history_observations,
              rule.allowed_pit_classes
         FROM governance.business_driver driver
         JOIN governance.business_driver_measurement_rule rule
           ON rule.business_driver_id=driver.business_driver_id
        WHERE rule.business_driver_measurement_rule_id=$1`,
      [measurement.business_driver_measurement_rule_id],
    )
  ).rows[0];
  const writerFacts = (
    await target.query(
      `SELECT numeric_fact_id, fact_key, value::text, instant_at,
              source_revision_id, available_at, known_at
         FROM world.numeric_fact
        WHERE fact_key IN ('valid-current','valid-comparison')
        ORDER BY fact_key`,
    )
  ).rows.map((fact) => ({
    numericFactId: Number(fact.numeric_fact_id),
    entityId: 1,
    conceptNamespace: 'us-gaap',
    conceptKey: 'InventoryNet',
    value: Number(fact.value),
    unit: 'currency',
    currency: 'USD',
    instantAt: new Date(fact.instant_at).toISOString(),
    periodStart: null,
    periodEnd: null,
    sourceRevisionId: Number(fact.source_revision_id),
    sourcePitQualityId: Number(pitC.source_pit_quality_id),
    pitClass: 'PIT_C_OUR_ARCHIVE',
    availableAt: new Date(fact.available_at).toISOString(),
    knownAt: new Date(fact.known_at).toISOString(),
    locator: { fact_key: fact.fact_key, accession: 'rehearsal-accession' },
  }));
  const writerInput = {
    informationSet: {
      informationSetId: writerInformationSetId,
      validCutoff: writerCutoff,
      sourceAvailableCutoff: writerCutoff,
      systemKnownCutoff: writerCutoff,
      marketObservationCutoff: writerCutoff,
      semanticSnapshotId: 'snap-1',
    },
    securities: [
      {
        securityEntityId: 2,
        issuerEntityId: 1,
        securityIssuerIdentityId: 1,
        sectorPlaybookId: Number(measurement.sector_playbook_id),
        valuationRange: {
          methodKey: 'inventory-adjusted-range',
          lowerEstimate: 90,
          upperEstimate: 110,
          estimateUnit: 'USD_per_share',
          horizon: 'short',
        },
      },
      {
        securityEntityId: 4,
        issuerEntityId: 5,
        securityIssuerIdentityId: 2,
        sectorPlaybookId: null,
      },
      ...[6, 7, 8, 9, 10, 11, 12, 13].map((securityEntityId) => ({
        securityEntityId,
        issuerEntityId: null,
        securityIssuerIdentityId: null,
        sectorPlaybookId: null,
      })),
    ],
    rules: [
      {
        securityEntityId: 2,
        issuerEntityId: 1,
        sectorPlaybookId: Number(measurement.sector_playbook_id),
        businessDriverId: Number(writerRuleRow.business_driver_id),
        businessDriverMeasurementRuleId: Number(writerRuleRow.business_driver_measurement_rule_id),
        driverKey: writerRuleRow.driver_key,
        ruleKey: writerRuleRow.rule_key,
        comparisonMethod: writerRuleRow.comparison_method,
        outputUnit: writerRuleRow.output_unit,
        outputCurrency: writerRuleRow.output_currency,
        inputConceptSelectors: writerRuleRow.input_concept_selectors.map((selector) => ({
          conceptNamespace: selector.concept_namespace,
          conceptKeys: selector.concept_keys,
        })),
        directionPolicy: writerRuleRow.direction_policy,
        materialityPolicy: writerRuleRow.materiality_policy,
        minimumHistoryObservations: Number(writerRuleRow.minimum_history_observations),
        allowedPitClasses: writerRuleRow.allowed_pit_classes,
        horizon: 'short',
        channelClass: 'operational_capacity',
        impactPathStepIds: [1],
      },
    ],
    facts: writerFacts,
    expectations: [
      {
        expectationRevisionId: Number(expectationRevisionId),
        expectationKey: 'prior-model:1:InventoryNet:2026-06-30',
        issuerEntityId: 1,
        conceptNamespace: 'us-gaap',
        conceptKey: 'InventoryNet',
        targetInstantAt: '2026-06-30T00:00:00.000Z',
        expectedValue: 125,
        expectedUnit: 'USD',
        dispersion: 5,
        availableAt: '2026-05-01T00:00:00.000Z',
        knownAt: '2026-05-01T00:00:00.000Z',
        derivationKey: 'expectation:1:InventoryNet:2026-06-30',
      },
    ],
  };
  const writerOutcomePlans = (planned) => {
    if (planned.exposures.length !== 1) {
      throw new Error(
        `writer rehearsal expected one exposure: ${JSON.stringify({ evaluations: planned.evaluations, facts: writerInput.facts, rules: writerInput.rules })}`,
      );
    }
    return [1, 5, 20].map((horizonSessions) => ({
      outcomeKey: `k4:outcome:${planned.exposures[0].exposureKey}:${horizonSessions}`,
      exposureKey: planned.exposures[0].exposureKey,
      horizonSessions,
      anchorSessionDate: '2026-07-31',
      outcomeState: 'pending',
      outcomeSessionDate: null,
      securityReturn: null,
      benchmarkReturn: null,
      abnormalReturn: null,
      marketDataKnownAt: null,
    }));
  };
  const runWriter = (mode) =>
    executeK4MarketIntelligenceJob({
      client: target,
      args: {
        mode,
        runKind: 'replay',
        from: '2026-08-10',
        to: '2026-08-10',
        kstCutoffTime: '23:59:59.999',
        securityLimit: 10,
      },
      loadInput: async () => writerInput,
      plan: planK4MarketIntelligence,
      loadOutcomes: async (_client, planned) => writerOutcomePlans(planned),
      persistPlan: async (client, planned, options) => {
        await client.query('SET LOCAL ROLE si_analytics');
        const writerPrivileges = (
          await target.query(
            `SELECT
         has_table_privilege('si_analytics', 'analytics.market_intelligence_run_receipt', 'SELECT') AS receipt_select,
         has_table_privilege('si_analytics', 'analytics.market_intelligence_run_receipt', 'INSERT') AS receipt_insert,
         has_table_privilege('si_analytics', 'world.event', 'INSERT') AS event_insert`,
          )
        ).rows[0];
        if (
          !writerPrivileges.receipt_select ||
          !writerPrivileges.receipt_insert ||
          !writerPrivileges.event_insert
        ) {
          throw new Error(`K4 writer grants missing: ${JSON.stringify(writerPrivileges)}`);
        }

        return persistK4MarketIntelligencePlan(client, planned, options);
      },
    });

  const rehearsedWriter = await runWriter('rehearse');
  const rehearseRows = (
    await target.query(
      `SELECT count(*)::int AS n FROM analytics.market_intelligence_run_receipt
        WHERE information_set_id=$1`,
      [writerInformationSetId],
    )
  ).rows[0].n;
  const appliedWriter = await runWriter('apply');
  const repeatedWriter = await runWriter('apply');
  const plannedWriter = planK4MarketIntelligence(writerInput);
  let mismatchedDigestRejected = false;
  try {
    await persistK4MarketIntelligencePlan(target, plannedWriter, {
      runKind: 'replay',
      cutoff: writerCutoff,
      requestDigest: appliedWriter[0].requestDigest,
      planDigest: 'c'.repeat(64),
      outcomes: writerOutcomePlans(plannedWriter),
    });
  } catch (error) {
    mismatchedDigestRejected = /digest/i.test(String(error?.message));
  }
  const writerCounts = (
    await target.query(
      `SELECT
         (SELECT count(*)::int FROM analytics.market_intelligence_run_receipt
           WHERE information_set_id=$1) AS receipts,
         (SELECT count(*)::int FROM analytics.impact_evaluation_revision
           WHERE information_set_id=$1) AS evaluations,
         (SELECT count(*)::int FROM analytics.accepted_impact_evaluation_v1
           WHERE information_set_id=$1) AS accepted,
         (SELECT count(*)::int FROM analytics.surprise_revision
           WHERE information_set_id=$1) AS surprises,
         (SELECT count(*)::int FROM analytics.valuation_estimate_revision
           WHERE information_set_id=$1) AS valuations,
         (SELECT count(*)::int FROM analytics.impact_outcome_revision outcome
           JOIN analytics.impact_evaluation_revision evaluation
             ON evaluation.impact_exposure_revision_id=outcome.impact_exposure_revision_id
          WHERE evaluation.information_set_id=$1 AND outcome.outcome_state='pending') AS outcomes,
         (SELECT count(*)::int FROM analytics.impact_score_component component
           JOIN analytics.impact_evaluation_revision evaluation
             ON evaluation.impact_exposure_revision_id=component.impact_exposure_revision_id
          WHERE evaluation.information_set_id=$1) AS scores,
         (SELECT count(*)::int FROM analytics.accepted_impact_evaluation_v1 evaluation
          WHERE evaluation.information_set_id=$1 AND NOT EXISTS (
            SELECT 1 FROM analytics.impact_path_step_exposure_citation citation
             WHERE citation.impact_exposure_revision_id=evaluation.impact_exposure_revision_id
          )) AS uncited`,
      [writerInformationSetId],
    )
  ).rows[0];
  const writerRehearsal = {
    rehearsalRolledBack: rehearseRows === 0 && rehearsedWriter[0].persistence?.idempotent === false,
    applyWroteExactCoverage: writerCounts.evaluations === 10 && writerCounts.accepted === 1,
    auxiliaryLedgersWritten: writerCounts.surprises === 1 && writerCounts.valuations === 1,
    pendingOutcomesHonest: writerCounts.outcomes === 3,
    eightScoreComponentsWritten: writerCounts.scores === 8,
    acceptedPathAlwaysCited: writerCounts.uncited === 0,
    receiptWrittenLastAndOnce: writerCounts.receipts === 1,
    exactRerunIsIdempotent:
      appliedWriter[0].persistence?.idempotent === false &&
      repeatedWriter[0].persistence?.idempotent === true &&
      repeatedWriter[0].planDigest === appliedWriter[0].planDigest &&
      repeatedWriter[0].persistence.acceptedEvaluationCount === 1 &&
      repeatedWriter[0].persistence.rejectedEvaluationCount === 9 &&
      repeatedWriter[0].persistence.sealedExposureCount === 1 &&
      repeatedWriter[0].persistence.surpriseCount === 1 &&
      repeatedWriter[0].persistence.valuationCount === 1 &&
      repeatedWriter[0].persistence.outcomeCount === 3,
    mismatchedDigestRejected,
  };

  const p4V2Counts = (
    await target.query(
      `SELECT
         (SELECT count(DISTINCT security_entity_id)::int
            FROM analytics.k4_portfolio_impact_coverage_v2
           WHERE information_set_id=$1) AS coverage,
         (SELECT count(*)::int
            FROM analytics.k4_portfolio_impact_exposure_v2
           WHERE information_set_id=$1) AS exposures,
         (SELECT count(*)::int
            FROM analytics.k4_portfolio_impact_path_step_v2 path
            JOIN analytics.k4_portfolio_impact_exposure_v2 exposure
              ON exposure.impact_exposure_revision_id=path.impact_exposure_revision_id
           WHERE exposure.information_set_id=$1) AS cited_paths,
         (SELECT count(*)::int
            FROM analytics.k4_portfolio_impact_score_component_v2 component
            JOIN analytics.k4_portfolio_impact_exposure_v2 exposure
              USING (impact_exposure_revision_id)
           WHERE exposure.information_set_id=$1) AS score_components,
         (SELECT count(*)::int
            FROM analytics.k4_portfolio_impact_evidence_v2 evidence
           WHERE evidence.impact_exposure_revision_id IS NOT NULL) AS evidence,
         has_table_privilege('si_readapi',
           'analytics.k4_portfolio_impact_coverage_v2', 'SELECT') AS coverage_visible,
         has_table_privilege('si_readapi',
           'analytics.k4_portfolio_impact_exposure_v2', 'SELECT') AS exposure_visible,
         has_table_privilege('si_readapi',
           'analytics.k4_portfolio_impact_score_component_v2', 'SELECT') AS score_visible,
         has_table_privilege('si_readapi',
           'analytics.k4_portfolio_impact_evidence_v2', 'SELECT') AS evidence_visible,
         has_table_privilege('si_readapi',
           'analytics.k4_portfolio_impact_path_step_v2', 'SELECT') AS path_visible,
         has_table_privilege('stock_insight_app_reader',
           'analytics.k4_portfolio_impact_coverage_v2', 'SELECT') AS app_coverage_visible,
         has_table_privilege('stock_insight_app_reader',
           'analytics.k4_portfolio_impact_exposure_v2', 'SELECT') AS app_exposure_visible,
         has_table_privilege('stock_insight_app_reader',
           'analytics.k4_portfolio_impact_score_component_v2', 'SELECT') AS app_score_visible,
         has_table_privilege('stock_insight_app_reader',
           'analytics.k4_portfolio_impact_evidence_v2', 'SELECT') AS app_evidence_visible,
         has_table_privilege('stock_insight_app_reader',
           'analytics.k4_portfolio_impact_path_step_v2', 'SELECT') AS app_path_visible,
         NOT EXISTS (
           SELECT 1
             FROM unnest(ARRAY[
               'analytics.impact_evaluation_revision',
               'analytics.impact_evaluation_evidence',
               'analytics.impact_exposure_revision',
               'analytics.impact_score_component',
               'analytics.impact_shock',
               'analytics.impact_channel',
               'analytics.impact_path_step',
               'analytics.expectation_revision',
               'analytics.surprise_revision',
               'analytics.valuation_estimate_revision',
               'analytics.impact_path_step_exposure_citation',
               'analytics.impact_outcome_revision',
               'analytics.accepted_impact_evaluation_v1',
               'analytics.accepted_impact_evaluation_evidence_v1',
               'analytics.market_intelligence_run_receipt'
             ]) raw_relation
            WHERE has_table_privilege(
              'stock_insight_app_reader', raw_relation, 'SELECT'
            )
         ) AS app_raw_hidden`,
      [writerInformationSetId],
    )
  ).rows[0];
  const p4V2 = {
    coverageHasExactlyTenSecurities: p4V2Counts.coverage === 10,
    onlyAcceptedSealedExposureServed: p4V2Counts.exposures === 1,
    noUncitedPathStepServed: p4V2Counts.cited_paths === 1,
    exactScoreAndEvidenceProjection: p4V2Counts.score_components === 8 && p4V2Counts.evidence === 2,
    filteredViewsReachReadapi:
      p4V2Counts.coverage_visible &&
      p4V2Counts.exposure_visible &&
      p4V2Counts.score_visible &&
      p4V2Counts.evidence_visible &&
      p4V2Counts.path_visible,
    filteredViewsReachRuntimeReader:
      p4V2Counts.app_coverage_visible &&
      p4V2Counts.app_exposure_visible &&
      p4V2Counts.app_score_visible &&
      p4V2Counts.app_evidence_visible &&
      p4V2Counts.app_path_visible,
    rawLedgersHiddenFromRuntimeReader: p4V2Counts.app_raw_hidden,
  };

  const acceptedSecurity = (
    await target.query(
      `SELECT security_entity_id
         FROM analytics.k4_portfolio_impact_exposure_v2
        WHERE information_set_id=$1`,
      [writerInformationSetId],
    )
  ).rows[0].security_entity_id;
  await target.query(
    `INSERT INTO core.entity_identifier
       (entity_id, identifier_type, identifier_value, valid_from)
     SELECT DISTINCT security_entity_id, 'INTERNAL_KEY',
            'KR:' || lpad(security_entity_id::text, 6, '0'), TIMESTAMPTZ '2025-01-01Z'
       FROM analytics.k4_portfolio_impact_coverage_v2
      WHERE information_set_id=$1`,
    [writerInformationSetId],
  );
  const rehearsalUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const rehearsalPortfolioId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await target.query(
    `INSERT INTO personalization.portfolio_snapshot
       (portfolio_snapshot_id, user_id, snapshot_as_of, source_known_at)
     VALUES ($1, $2, TIMESTAMPTZ '2026-08-08T14:00:00Z',
             TIMESTAMPTZ '2026-08-08T14:00:00Z')`,
    [rehearsalPortfolioId, rehearsalUserId],
  );
  await target.query(
    `INSERT INTO personalization.portfolio_lot_snapshot
       (portfolio_snapshot_id, user_id, security_entity_id, portfolio_weight)
     VALUES ($1, $2, $3, 0.04), ($1, $2, $3, 0.06)`,
    [rehearsalPortfolioId, rehearsalUserId, acceptedSecurity],
  );
  await target.query(
    `INSERT INTO personalization.portfolio_snapshot_seal
       (portfolio_snapshot_id, user_id, sealed_at)
     VALUES ($1, $2, TIMESTAMPTZ '2026-08-08T14:00:00Z')`,
    [rehearsalPortfolioId, rehearsalUserId],
  );
  const readKnownAt = new Date(
    (
      await target.query(
        `SELECT greatest(now() + interval '1 second',
                         $1::timestamptz + interval '1 second') AS known_at`,
        [writerCutoff],
      )
    ).rows[0].known_at,
  );
  const p4Executor = {
    queryRows: async (sql, parameters = []) => (await target.query(sql, [...parameters])).rows,
  };
  const p4Read = await getPersonalizationPortfolioImpactV2(p4Executor, {
    userScope: { userId: rehearsalUserId },
    eventId: null,
    scenarioId: null,
    horizon: null,
    knownAt: readKnownAt,
  });
  const futureBlindRead = await getPersonalizationPortfolioImpactV2(p4Executor, {
    userScope: { userId: rehearsalUserId },
    eventId: null,
    scenarioId: null,
    horizon: null,
    knownAt: new Date('2026-08-08T14:59:59.999Z'),
  });
  const servedExposures = p4Read?.groups.flatMap((group) => group.exposures) ?? [];
  p4V2.readModelExecutesAgainstPostgres =
    p4Read?.availability === 'available' && p4Read.coverage.length === 10;
  p4V2.multipleLotsAggregateOnce =
    servedExposures.length === 1 &&
    Math.abs((servedExposures[0]?.portfolioWeight ?? 0) - 0.1) < 1e-12;
  p4V2.futureCreatedEvaluationStaysHidden = futureBlindRead?.availability === 'not_computed';
  p4V2.referencesSafeEvidence =
    servedExposures[0]?.scoreComponents.length === 8 &&
    servedExposures[0]?.references.evidence.length === 2;

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
    historicalClockAccepted: false,
    backdatedCreationRejected: false,
    reconstructionClockImmutable: false,
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
  await target.query(`
    INSERT INTO governance.semantic_snapshot (
      semantic_snapshot_id, snapshot_state, created_at, sealed_at, created_by,
      construction_mode, knowledge_cutoff, reconstructed_at
    ) VALUES (
      'snap-history', 'sealed', statement_timestamp(), statement_timestamp(),
      'rehearsal', 'historical_reconstruction',
      TIMESTAMPTZ '2026-07-20T00:00:00Z', statement_timestamp()
    )
  `);
  snapshot.historicalClockAccepted =
    (
      await target.query(`
        SELECT created_at > knowledge_cutoff
               AND created_at = reconstructed_at AS honest_clock
          FROM governance.semantic_snapshot
         WHERE semantic_snapshot_id='snap-history'
      `)
    ).rows[0].honest_clock === true;
  snapshot.backdatedCreationRejected = await expectRejected(
    `INSERT INTO governance.semantic_snapshot (
       semantic_snapshot_id, snapshot_state, created_at, sealed_at, created_by,
       construction_mode, knowledge_cutoff, reconstructed_at
     ) VALUES (
       'snap-backdated', 'sealed', TIMESTAMPTZ '2026-07-20T00:00:00Z', now(),
       'rehearsal', 'historical_reconstruction',
       TIMESTAMPTZ '2026-07-20T00:00:00Z', now()
     )`,
  );
  snapshot.reconstructionClockImmutable = await expectRejected(
    `UPDATE governance.semantic_snapshot
        SET knowledge_cutoff=TIMESTAMPTZ '2026-07-21T00:00:00Z'
      WHERE semantic_snapshot_id='snap-history'`,
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
          WHERE n.nspname IN ('analytics', 'governance', 'serving')
            AND (
              n.nspname <> 'analytics'
              OR c.relname IN (
                'accepted_impact_evaluation_evidence_v1',
                'accepted_impact_evaluation_v1',
                'expectation_revision',
                'impact_channel',
                'impact_evaluation_evidence',
                'impact_evaluation_revision',
                'impact_exposure_revision',
                'impact_outcome_revision',
                'impact_path_step',
                'impact_path_step_exposure_citation',
                'impact_score_component',
                'impact_shock',
                'k4_portfolio_impact_coverage_v2',
                'k4_portfolio_impact_evidence_v2',
                'k4_portfolio_impact_exposure_v2',
                'k4_portfolio_impact_path_step_v2',
                'k4_portfolio_impact_score_component_v2',
                'surprise_revision',
                'valuation_estimate_revision'
              )
            )
            AND c.relkind IN ('r','v')
            AND r.rolname IN ('stock_insight_app_reader','stock_insight_app_writer')
       ) reachability
      GROUP BY role_name, relation
      ORDER BY role_name, relation`,
  );
  const appRoleReachable = reach.rows.filter((row) => row.reachable);

  // 085 deliberately widens the app reader by one relation, because
  // REQ-SEM-010 is a rendering requirement and the reader the product serves from
  // has to see the resolved class. 092 adds exactly five fail-closed K4 views and
  // revokes the historical analytics default grants on every raw K4 relation.
  // The gauge is not "nothing moved" but "only these projections are reachable";
  // the boot digest must be re-pinned in the same landing.
  //
  const DECLARED_APP_ROLE_REACH = [
    'stock_insight_app_reader:analytics.k4_portfolio_impact_coverage_v2',
    'stock_insight_app_reader:analytics.k4_portfolio_impact_evidence_v2',
    'stock_insight_app_reader:analytics.k4_portfolio_impact_exposure_v2',
    'stock_insight_app_reader:analytics.k4_portfolio_impact_path_step_v2',
    'stock_insight_app_reader:analytics.k4_portfolio_impact_score_component_v2',
    'stock_insight_app_reader:serving.content_pack_item_truth_v1',
  ];
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
    writerRehearsal,
    p4V2,
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
    writerRehearsal,
    p4V2,
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
