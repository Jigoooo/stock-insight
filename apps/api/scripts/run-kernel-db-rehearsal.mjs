// Rehearses migrations 078–084 (canonical kernel + release/safety/SLO + metric
// definition registry) on a disposable database.
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

import { semanticSnapshotMigrationSql } from '../../../packages/db-schema/src/migrations/078_semantic_snapshot.ts';
import { analysisInformationSetMigrationSql } from '../../../packages/db-schema/src/migrations/079_analysis_information_set.ts';
import { sourcePitQualityMigrationSql } from '../../../packages/db-schema/src/migrations/080_source_pit_quality.ts';
import { releaseManifestMigrationSql } from '../../../packages/db-schema/src/migrations/081_release_manifest.ts';
import { safetyStateMigrationSql } from '../../../packages/db-schema/src/migrations/082_safety_state.ts';
import { sloLedgerMigrationSql } from '../../../packages/db-schema/src/migrations/083_slo_ledger.ts';
import { metricDefinitionRegistryMigrationSql } from '../../../packages/db-schema/src/migrations/084_metric_definition_registry.ts';

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

    -- 084 references core.entity for issuer-scoped definitions.
    CREATE SCHEMA core;
    CREATE TABLE core.entity (
      entity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      entity_type TEXT NOT NULL,
      canonical_name TEXT NOT NULL
    );
    INSERT INTO core.entity (entity_type, canonical_name) VALUES ('Company', 'Rehearsal Co');

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
      SELECT source_id FROM ingestion.source WHERE provider_key = 'bok-ecos';
    INSERT INTO ingestion.source_revision (source_record_identity_id, ingested_at)
      SELECT source_record_identity_id, TIMESTAMPTZ '2026-05-01T00:00:00Z'
        FROM ingestion.source_record_identity;

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

  // ── apply the migrations under test, in dependency order ────────────────────
  const MIGRATIONS = [
    semanticSnapshotMigrationSql,
    analysisInformationSetMigrationSql,
    sourcePitQualityMigrationSql,
    releaseManifestMigrationSql,
    safetyStateMigrationSql,
    sloLedgerMigrationSql,
    metricDefinitionRegistryMigrationSql,
  ];
  for (const sql of MIGRATIONS) await target.query(sql);
  // Re-running must be a no-op — the schema ledger replays on any re-apply.
  for (const sql of MIGRATIONS) await target.query(sql);

  await target.query(
    `INSERT INTO governance.semantic_snapshot (semantic_snapshot_id, created_by)
     VALUES ('snap-1', 'rehearsal') ON CONFLICT DO NOTHING`,
  );

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
  pitQuality.noDuplicateOnReapply = afterReapply.rows[0]?.n === 8;

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
          WHERE n.nspname = 'governance'
            AND c.relkind IN ('r','v')
            AND r.rolname IN ('stock_insight_app_reader','stock_insight_app_writer')
       ) reachability
      GROUP BY role_name, relation
      ORDER BY role_name, relation`,
  );
  const appRoleReachable = reach.rows.filter((row) => row.reachable);

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
    digestSafety: {
      governanceRelationsChecked: reach.rows.length,
      appRoleReachableRelations: appRoleReachable.map((row) => `${row.role_name}:${row.relation}`),
      noAppRoleReach: appRoleReachable.length === 0,
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
  if (!result.digestSafety.noAppRoleReach) failures.push('digestSafety.noAppRoleReach');
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
