import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

import { cryptoIdentityFoundationMigrationSql } from '../../../packages/db-schema/src/migrations/046_crypto_identity_foundation.ts';
import { cryptoTruthFoundationMigrationSql } from '../../../packages/db-schema/src/migrations/047_crypto_truth_foundation.ts';
import { cryptoTokenomicsMigrationSql } from '../../../packages/db-schema/src/migrations/048_crypto_tokenomics.ts';
import { cryptoContagionImpactMigrationSql } from '../../../packages/db-schema/src/migrations/049_crypto_contagion_impact.ts';
import { cryptoCrossDomainGraphMigrationSql } from '../../../packages/db-schema/src/migrations/050_crypto_cross_domain_graph.ts';
import { cryptoServingViewsMigrationSql } from '../../../packages/db-schema/src/migrations/051_crypto_serving_views.ts';
import { getCryptoResearchWorkspace } from '../src/crypto/read-model.ts';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const adminUrl = new URL(process.env.P6_REHEARSAL_ADMIN_DATABASE_URL ?? '');
if (
  !['postgres:', 'postgresql:'].includes(adminUrl.protocol) ||
  adminUrl.search !== '' ||
  adminUrl.hash !== ''
) {
  throw new Error('P6 rehearsal admin URL must be a query-free PostgreSQL URL');
}
const databaseName = `stock_insight_p6_rehearsal_${randomBytes(5).toString('hex')}`;
if (!/^stock_insight_p6_rehearsal_[a-f0-9]+$/.test(databaseName)) throw new Error('unsafe db name');
const quotedDatabase = `"${databaseName}"`;
const targetUrl = new URL(adminUrl);
targetUrl.pathname = `/${databaseName}`;
const roleNames = ['si_knowledge', 'si_analytics', 'si_publisher', 'si_readapi'];
const migrations = [
  cryptoIdentityFoundationMigrationSql,
  cryptoTruthFoundationMigrationSql,
  cryptoTokenomicsMigrationSql,
  cryptoContagionImpactMigrationSql,
  cryptoCrossDomainGraphMigrationSql,
  cryptoServingViewsMigrationSql,
];

const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();

async function readRoleState() {
  const roles = await admin.query(
    `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
       FROM pg_roles
      WHERE rolname = ANY($1::text[])
      ORDER BY rolname`,
    [roleNames],
  );
  const memberships = await admin.query(
    `SELECT to_jsonb(membership) AS state
       FROM pg_auth_members membership
       JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
       JOIN pg_roles member_role ON member_role.oid = membership.member
      WHERE granted_role.rolname = ANY($1::text[])
         OR member_role.rolname = ANY($1::text[])
      ORDER BY membership.roleid, membership.member, membership.grantor`,
    [roleNames],
  );
  return { roles: roles.rows, memberships: memberships.rows };
}

const roleStateBefore = await readRoleState();
const existingRoles = new Set(roleStateBefore.roles.map((row) => row.rolname));
let target;
let result;
const cleanupErrors = [];
let primaryError;

async function expectCheckRejected(sql, parameters = [], expectedCodes = ['23514']) {
  try {
    await target.query(sql, parameters);
  } catch (error) {
    if (expectedCodes.includes(error?.code)) return true;
    throw error;
  }
  return false;
}

try {
  await admin.query(`CREATE DATABASE ${quotedDatabase}`);
  target = new Client({ connectionString: targetUrl.toString() });
  await target.connect();
  const connectedDatabase = await target.query('SELECT current_database() AS database_name');
  if (connectedDatabase.rows[0]?.database_name !== databaseName) {
    throw new Error('P6 rehearsal connected to an unexpected database');
  }
  await target.query(`
    CREATE SCHEMA ingestion;
    CREATE TABLE ingestion.source_revision (source_revision_id BIGINT PRIMARY KEY);
    INSERT INTO ingestion.source_revision SELECT generate_series(1, 40);

    CREATE SCHEMA core;
    CREATE TABLE core.entity (
      entity_id BIGINT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      canonical_name TEXT NOT NULL
    );
    CREATE TABLE core.entity_identifier (
      identifier_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
      identifier_type TEXT NOT NULL,
      identifier_value TEXT NOT NULL,
      valid_from TIMESTAMPTZ,
      valid_to TIMESTAMPTZ
    );

    CREATE SCHEMA geo;
    CREATE TABLE geo.entity (geo_entity_id BIGINT PRIMARY KEY);
    CREATE SCHEMA world;
    CREATE TABLE world.event_revision (event_revision_id BIGINT PRIMARY KEY);

    DO $roles$
    DECLARE role_name TEXT;
    BEGIN
      FOREACH role_name IN ARRAY ARRAY['si_knowledge','si_analytics','si_publisher','si_readapi'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', role_name);
        END IF;
      END LOOP;
    END
    $roles$;
  `);

  for (const sql of migrations) await target.query(sql);
  for (const sql of migrations) await target.query(sql);

  const tokenAccountAlternativeRejected = await expectCheckRejected(`
    INSERT INTO crypto_identity.entity
      (crypto_entity_id, entity_key, entity_kind, chain_id, account_address, asset_id)
    OVERRIDING SYSTEM VALUE
    VALUES (901, 'crypto:token:eip155:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      'token', 'eip155:1', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', NULL)
  `);
  const uppercaseAssetRejected = await expectCheckRejected(`
    INSERT INTO crypto_identity.entity
      (crypto_entity_id, entity_key, entity_kind, chain_id, asset_id)
    OVERRIDING SYSTEM VALUE
    VALUES (902, 'crypto:token:eip155:1/erc20:0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      'token', 'eip155:1', 'eip155:1/erc20:0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
  `);
  const mismatchedAssetChainRejected = await expectCheckRejected(`
    INSERT INTO crypto_identity.entity
      (crypto_entity_id, entity_key, entity_kind, chain_id, asset_id)
    OVERRIDING SYSTEM VALUE
    VALUES (903, 'crypto:token:eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      'token', 'eip155:10', 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
  `);
  const invalidAccountCharacterRejected = await expectCheckRejected(`
    INSERT INTO crypto_identity.entity
      (crypto_entity_id, entity_key, entity_kind, chain_id, account_address)
    OVERRIDING SYSTEM VALUE
    VALUES (904, 'crypto:oracle:solana:main:a!b', 'oracle', 'solana:main', 'a!b')
  `);

  await target.query(`
    INSERT INTO core.entity (entity_id, entity_type, canonical_name)
    VALUES (100, 'Company', 'Strategy');
    INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value, valid_from)
    VALUES (100, 'INTERNAL_KEY', 'COMPANY:US:MSTR', '2020-01-01T00:00:00Z');

    INSERT INTO crypto_identity.entity
      (crypto_entity_id, entity_key, entity_kind, chain_id, account_address, asset_id, canonical_slug)
    OVERRIDING SYSTEM VALUE
    VALUES
      (1, 'crypto:blockchain:bip122:000000000019d6689c085ae165831e93', 'blockchain',
       'bip122:000000000019d6689c085ae165831e93', NULL, NULL, NULL),
      (2, 'crypto:token:bip122:000000000019d6689c085ae165831e93/slip44:0', 'token',
       'bip122:000000000019d6689c085ae165831e93', NULL,
       'bip122:000000000019d6689c085ae165831e93/slip44:0', NULL);
    INSERT INTO crypto_identity.entity_revision
      (crypto_entity_revision_id, crypto_entity_id, revision_no, display_name, symbol,
       source_revision_id, identity_digest, available_at, known_at, valid_from, valid_until,
       supersedes_crypto_entity_revision_id)
    OVERRIDING SYSTEM VALUE
    VALUES
      (1, 1, 1, 'Bitcoin network', NULL, 1, repeat('1', 64),
       '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', '2009-01-03T00:00:00Z', NULL, NULL),
      (2, 2, 1, 'Bitcoin', 'BTC', 2, repeat('2', 64),
       '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', '2009-01-03T00:00:00Z',
       '2026-07-20T12:00:00Z', NULL),
      (3, 2, 2, 'Future Bitcoin', 'BTC', 2, repeat('3', 64),
       '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', '2026-07-24T00:00:00Z', NULL, 2),
      (4, 2, 3, 'Expired Bitcoin', 'BTC', 2, repeat('4', 64),
       '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', '2009-01-03T00:00:00Z',
       '2020-01-01T00:00:00Z', 3),
      (5, 2, 4, 'Bitcoin', 'BTC', 2, repeat('5', 64),
       '2026-07-22T00:00:00Z', '2026-07-22T00:00:00Z', NULL, NULL, 4);

    INSERT INTO crypto_truth.event
      (crypto_event_id, event_key, event_type, blockchain_entity_id)
    OVERRIDING SYSTEM VALUE
    VALUES
      (1, 'crypto:event:chain_halt:terminal', 'chain_halt', 1),
      (2, 'crypto:event:chain_halt:visible', 'chain_halt', 1),
      (3, 'crypto:event:chain_halt:future', 'chain_halt', 1);
    INSERT INTO crypto_truth.event_revision
      (crypto_event_revision_id, crypto_event_id, revision_no, lifecycle_state, summary_text,
       primary_reference_kind, primary_reference_value, finality_state, source_revision_id,
       evidence_digest, occurred_at, available_at, known_at, valid_from,
       supersedes_crypto_event_revision_id)
    OVERRIDING SYSTEM VALUE
    VALUES
      (1, 1, 1, 'confirmed', '철회 전 사건', 'source_digest', repeat('3', 64),
       'not_applicable', 3, repeat('3', 64), '2026-07-19T00:00:00Z',
       '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', '2026-07-19T00:00:00Z', NULL),
      (2, 1, 2, 'retracted', NULL, 'source_digest', repeat('4', 64),
       'not_applicable', 4, repeat('4', 64), '2026-07-19T00:00:00Z',
       '2026-07-21T00:00:00Z', '2026-07-21T00:00:00Z', '2026-07-19T00:00:00Z', 1),
      (3, 2, 1, 'confirmed', '확인된 체인 사건', 'source_digest', repeat('5', 64),
       'not_applicable', 3, repeat('5', 64), '2026-07-19T00:00:00Z',
       '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', '2026-07-19T00:00:00Z', NULL),
      (4, 3, 1, 'reported', '미래 유효 사건', 'source_digest', repeat('6', 64),
       'not_applicable', 4, repeat('4', 64), '2026-07-19T00:00:00Z',
       '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', '2026-07-24T00:00:00Z', NULL);

    INSERT INTO cross_domain.crypto_core_relation_revision
      (crypto_core_relation_revision_id, relation_key, revision_no, crypto_entity_id, core_entity_id,
       relation_kind, relation_state, economic_magnitude, economic_magnitude_unit,
       epistemic_confidence, reviewer_id, evidence_locator, evidence_digest, source_revision_id,
       available_at, known_at, valid_from, supersedes_crypto_core_relation_revision_id)
    OVERRIDING SYSTEM VALUE
    VALUES
      (1, 'cross:btc:mstr', 1, 2, 100, 'treasury_held_by_company', 'verified',
       214000, 'BTC', 0.99, 'reviewer:a', '{}', repeat('5', 64), 5,
       '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', NULL),
      (2, 'cross:btc:mstr', 2, 2, 100, 'treasury_held_by_company', 'rejected',
       214000, 'BTC', 0.99, 'reviewer:b', '{}', repeat('6', 64), 6,
       '2026-07-21T00:00:00Z', '2026-07-21T00:00:00Z', '2026-07-20T00:00:00Z', 1);
  `);
  const relationMagnitudePairRejected = await expectCheckRejected(`
    INSERT INTO cross_domain.crypto_core_relation_revision
      (relation_key, revision_no, crypto_entity_id, core_entity_id, relation_kind,
       relation_state, economic_magnitude, economic_magnitude_unit, evidence_locator,
       evidence_digest, source_revision_id, available_at, known_at)
    VALUES ('cross:invalid:magnitude', 1, 2, 100, 'treasury_held_by_company',
      'proposed', NULL, 'BTC', '{}', repeat('7', 64), 7,
      '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z')
  `);
  const relationIdentityDriftRejected = await expectCheckRejected(
    `INSERT INTO cross_domain.crypto_core_relation_revision
      (relation_key, revision_no, crypto_entity_id, core_entity_id, relation_kind,
       relation_state, economic_magnitude, economic_magnitude_unit, evidence_locator,
       evidence_digest, source_revision_id, available_at, known_at,
       supersedes_crypto_core_relation_revision_id)
     VALUES ('cross:btc:mstr', 3, 1, 100, 'treasury_held_by_company',
       'proposed', NULL, NULL, '{}', repeat('9', 64), 9,
       '2026-07-22T00:00:00Z', '2026-07-22T00:00:00Z', 2)`,
    [],
    ['P0001'],
  );

  const shockMagnitudePairRejected = await expectCheckRejected(`
    INSERT INTO crypto_analytics.risk_shock
      (shock_key, crypto_event_revision_id, shock_type, economic_magnitude,
       economic_magnitude_unit, evidence_locator, source_revision_id, available_at, known_at)
    VALUES ('shock:invalid:magnitude', 3, 'liquidity_withdrawal', NULL, 'ratio',
      '{}', 7, '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z')
  `);
  const shockNegativeMagnitudeRejected = await expectCheckRejected(`
    INSERT INTO crypto_analytics.risk_shock
      (shock_key, crypto_event_revision_id, shock_type, economic_magnitude,
       economic_magnitude_unit, evidence_locator, source_revision_id, available_at, known_at)
    VALUES ('shock:invalid:negative', 3, 'liquidity_withdrawal', -0.2, 'ratio',
      '{}', 7, '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z')
  `);

  const shock = await target.query(`
    INSERT INTO crypto_analytics.risk_shock
      (shock_key, crypto_event_revision_id, shock_type, economic_magnitude,
       economic_magnitude_unit, epistemic_confidence, evidence_locator, source_revision_id,
       available_at, known_at)
    VALUES ('shock:btc:liquidity', 3, 'liquidity_withdrawal', 0.2, 'ratio', 0.8,
      '{}', 7, '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z')
    RETURNING risk_shock_id
  `);
  const channel = await target.query(`
    SELECT transmission_channel_id
      FROM crypto_analytics.transmission_channel
     WHERE channel_class = 'exchange_venue'
  `);
  const riskMagnitudePairRejected = await expectCheckRejected(
    `INSERT INTO crypto_analytics.risk_exposure_revision
      (exposure_key, revision_no, risk_shock_id, transmission_channel_id, crypto_entity_id,
       sign, economic_magnitude, economic_magnitude_unit, evidence_locator,
       source_revision_id, available_at, known_at)
     VALUES ('risk:invalid:magnitude', 1, $1, $2, 2, 'negative', NULL, 'ratio', '{}', 8,
       '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z')`,
    [shock.rows[0].risk_shock_id, channel.rows[0].transmission_channel_id],
  );
  const riskNegativeMagnitudeRejected = await expectCheckRejected(
    `INSERT INTO crypto_analytics.risk_exposure_revision
      (exposure_key, revision_no, risk_shock_id, transmission_channel_id, crypto_entity_id,
       sign, economic_magnitude, economic_magnitude_unit, evidence_locator,
       source_revision_id, available_at, known_at)
     VALUES ('risk:invalid:negative', 1, $1, $2, 2, 'negative', -0.2, 'ratio', '{}', 8,
       '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z')`,
    [shock.rows[0].risk_shock_id, channel.rows[0].transmission_channel_id],
  );
  const firstExposure = await target.query(
    `INSERT INTO crypto_analytics.risk_exposure_revision
      (exposure_key, revision_no, risk_shock_id, transmission_channel_id, crypto_entity_id,
       sign, economic_magnitude, economic_magnitude_unit, epistemic_confidence,
       evidence_locator, source_revision_id, available_at, known_at, valid_from)
     VALUES ('risk:btc:terminal', 1, $1, $2, 2, 'negative', 0.2, 'ratio', 0.8,
       '{}', 8, '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z')
     RETURNING risk_exposure_revision_id`,
    [shock.rows[0].risk_shock_id, channel.rows[0].transmission_channel_id],
  );
  const firstExposureId = firstExposure.rows[0].risk_exposure_revision_id;
  for (const kind of [
    'evidence_confidence',
    'relation_strength',
    'materiality',
    'transmission',
    'direction',
    'lag',
    'market_reflection',
    'model_uncertainty',
  ]) {
    await target.query(
      `INSERT INTO crypto_analytics.risk_score_component
        (risk_exposure_revision_id, component_kind, component_value)
       VALUES ($1, $2, 0.8)`,
      [firstExposureId, kind],
    );
  }
  let createdAtMutationRejected = false;
  try {
    await target.query(
      `UPDATE crypto_analytics.risk_exposure_revision
          SET exposure_state='sealed', sealed_at='2026-07-20T01:00:00Z',
              created_at=created_at + interval '1 second'
        WHERE risk_exposure_revision_id=$1`,
      [firstExposureId],
    );
  } catch (error) {
    if (!String(error?.message).includes('immutable fields cannot change')) throw error;
    createdAtMutationRejected = true;
  }
  if (!createdAtMutationRejected) throw new Error('risk created_at mutation was not rejected');
  await target.query(
    `UPDATE crypto_analytics.risk_exposure_revision
        SET exposure_state='sealed', sealed_at='2026-07-20T01:00:00Z'
      WHERE risk_exposure_revision_id=$1`,
    [firstExposureId],
  );
  const terminalExposure = await target.query(
    `INSERT INTO crypto_analytics.risk_exposure_revision
      (exposure_key, revision_no, risk_shock_id, transmission_channel_id, crypto_entity_id,
       sign, economic_magnitude, economic_magnitude_unit, epistemic_confidence,
       evidence_locator, source_revision_id, available_at, known_at, valid_from,
       valid_until, supersedes_risk_exposure_revision_id)
     VALUES ('risk:btc:terminal', 2, $1, $2, 2, 'negative', 0.2, 'ratio', 0.8,
       '{}', 9, '2026-07-21T00:00:00Z', '2026-07-21T00:00:00Z',
       '2026-07-20T00:00:00Z', '2026-07-22T00:00:00Z', $3)
     RETURNING risk_exposure_revision_id`,
    [shock.rows[0].risk_shock_id, channel.rows[0].transmission_channel_id, firstExposureId],
  );
  await target.query(
    `UPDATE crypto_analytics.risk_exposure_revision
        SET exposure_state='retracted'
      WHERE risk_exposure_revision_id=$1`,
    [terminalExposure.rows[0].risk_exposure_revision_id],
  );
  const riskTerminalResurrectionRejected = await expectCheckRejected(
    `INSERT INTO crypto_analytics.risk_exposure_revision
      (exposure_key, revision_no, risk_shock_id, transmission_channel_id, crypto_entity_id,
       sign, economic_magnitude, economic_magnitude_unit, epistemic_confidence,
       evidence_locator, source_revision_id, available_at, known_at, valid_from,
       supersedes_risk_exposure_revision_id)
     VALUES ('risk:btc:terminal', 3, $1, $2, 2, 'negative', 0.2, 'ratio', 0.8,
       '{}', 10, '2026-07-22T00:00:00Z', '2026-07-22T00:00:00Z',
       '2026-07-20T00:00:00Z', $3)`,
    [
      shock.rows[0].risk_shock_id,
      channel.rows[0].transmission_channel_id,
      terminalExposure.rows[0].risk_exposure_revision_id,
    ],
    ['P0001'],
  );
  const backdatedRetractionRoot = await target.query(
    `INSERT INTO crypto_analytics.risk_exposure_revision
      (exposure_key, revision_no, risk_shock_id, transmission_channel_id, crypto_entity_id,
       sign, economic_magnitude, economic_magnitude_unit, epistemic_confidence,
       evidence_locator, source_revision_id, available_at, known_at, valid_from)
     VALUES ('risk:btc:backdated-retraction', 1, $1, $2, 2, 'negative', 0.1, 'ratio', 0.7,
       '{}', 11, '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z',
       '2026-07-20T00:00:00Z')
     RETURNING risk_exposure_revision_id`,
    [shock.rows[0].risk_shock_id, channel.rows[0].transmission_channel_id],
  );
  await target.query(
    `INSERT INTO crypto_analytics.risk_exposure_revision
      (exposure_key, revision_no, risk_shock_id, transmission_channel_id, crypto_entity_id,
       sign, economic_magnitude, economic_magnitude_unit, epistemic_confidence,
       evidence_locator, source_revision_id, available_at, known_at, valid_from,
       supersedes_risk_exposure_revision_id)
     VALUES ('risk:btc:backdated-retraction', 2, $1, $2, 2, 'negative', 0.1, 'ratio', 0.7,
       '{}', 12, '2026-07-21T00:00:00Z', '2026-07-21T00:00:00Z',
       '2026-07-20T00:00:00Z', $3)`,
    [
      shock.rows[0].risk_shock_id,
      channel.rows[0].transmission_channel_id,
      backdatedRetractionRoot.rows[0].risk_exposure_revision_id,
    ],
  );
  const riskBackdatedRetractionRejected = await expectCheckRejected(
    `UPDATE crypto_analytics.risk_exposure_revision
        SET exposure_state='retracted'
      WHERE risk_exposure_revision_id=$1`,
    [backdatedRetractionRoot.rows[0].risk_exposure_revision_id],
    ['P0001'],
  );
  const concurrentRetractionRoot = await target.query(
    `INSERT INTO crypto_analytics.risk_exposure_revision
      (exposure_key, revision_no, risk_shock_id, transmission_channel_id, crypto_entity_id,
       sign, economic_magnitude, economic_magnitude_unit, epistemic_confidence,
       evidence_locator, source_revision_id, available_at, known_at, valid_from)
     VALUES ('risk:btc:concurrent-retraction', 1, $1, $2, 2, 'negative', 0.1, 'ratio', 0.7,
       '{}', 13, '2026-07-20T00:00:00Z', '2026-07-20T00:00:00Z',
       '2026-07-20T00:00:00Z')
     RETURNING risk_exposure_revision_id`,
    [shock.rows[0].risk_shock_id, channel.rows[0].transmission_channel_id],
  );
  const retractClient = new Client({
    connectionString: targetUrl.toString(),
    application_name: 'p6_risk_retract_race',
  });
  const successorClient = new Client({
    connectionString: targetUrl.toString(),
    application_name: 'p6_risk_successor_race',
  });
  let riskConcurrentLockObserved = false;
  let riskConcurrentRetractionRejected = false;
  try {
    await retractClient.connect();
    await successorClient.connect();
    await retractClient.query('BEGIN');
    await successorClient.query('BEGIN');
    await retractClient.query(
      `UPDATE crypto_analytics.risk_exposure_revision
          SET exposure_state='retracted'
        WHERE risk_exposure_revision_id=$1`,
      [concurrentRetractionRoot.rows[0].risk_exposure_revision_id],
    );
    const successorOutcomePromise = successorClient
      .query(
        `INSERT INTO crypto_analytics.risk_exposure_revision
          (exposure_key, revision_no, risk_shock_id, transmission_channel_id, crypto_entity_id,
           sign, economic_magnitude, economic_magnitude_unit, epistemic_confidence,
           evidence_locator, source_revision_id, available_at, known_at, valid_from,
           supersedes_risk_exposure_revision_id)
         VALUES ('risk:btc:concurrent-retraction', 2, $1, $2, 2, 'negative', 0.1, 'ratio', 0.7,
           '{}', 14, '2026-07-21T00:00:00Z', '2026-07-21T00:00:00Z',
           '2026-07-20T00:00:00Z', $3)`,
        [
          shock.rows[0].risk_shock_id,
          channel.rows[0].transmission_channel_id,
          concurrentRetractionRoot.rows[0].risk_exposure_revision_id,
        ],
      )
      .then(() => ({ error: null }))
      .catch((error) => ({ error }));
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const waitState = await target.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_stat_activity
            WHERE datname=current_database()
              AND application_name='p6_risk_successor_race'
              AND wait_event_type='Lock'
         ) AS blocked`,
      );
      riskConcurrentLockObserved = waitState.rows[0]?.blocked === true;
      if (riskConcurrentLockObserved) break;
      await delay(10);
    }
    await retractClient.query('COMMIT');
    const successorOutcome = await successorOutcomePromise;
    riskConcurrentRetractionRejected = successorOutcome.error?.code === 'P0001';
  } finally {
    await retractClient.query('ROLLBACK').catch(() => undefined);
    await successorClient.query('ROLLBACK').catch(() => undefined);
    await retractClient.end().catch(() => undefined);
    await successorClient.end().catch(() => undefined);
  }
  await target.query(
    `INSERT INTO crypto_analytics.risk_exposure_revision
      (exposure_key, revision_no, risk_shock_id, transmission_channel_id, crypto_entity_id,
       sign, economic_magnitude, economic_magnitude_unit, epistemic_confidence,
       evidence_locator, source_revision_id, available_at, known_at, valid_from)
     VALUES ('risk:btc:building-null-confidence', 1, $1, $2, 2, 'ambiguous',
       NULL, NULL, NULL, '{}', 10, '2026-07-22T00:00:00Z', '2026-07-22T00:00:00Z',
       '2026-07-22T00:00:00Z')`,
    [shock.rows[0].risk_shock_id, channel.rows[0].transmission_channel_id],
  );

  const relationIdentity = await target.query(
    `SELECT crypto_name FROM crypto_serving.core_relation_revision
      WHERE relation_key='cross:btc:mstr' AND revision_no=1`,
  );
  const riskIdentity = await target.query(
    `SELECT crypto_name FROM crypto_serving.risk_exposure_revision
      WHERE exposure_key='risk:btc:terminal' AND revision_no=1`,
  );
  const terminalRelationIdentity = await target.query(
    `SELECT crypto_name FROM crypto_serving.core_relation_revision
      WHERE relation_key='cross:btc:mstr' AND revision_no=2`,
  );
  const terminalRiskIdentity = await target.query(
    `SELECT crypto_name FROM crypto_serving.risk_exposure_revision
      WHERE exposure_key='risk:btc:terminal' AND revision_no=2`,
  );
  const relationIdentityIsPIT = relationIdentity.rows[0]?.crypto_name === 'Bitcoin';
  const riskIdentityIsPIT = riskIdentity.rows[0]?.crypto_name === 'Bitcoin';
  const terminalRelationIdentityGapPreserved =
    terminalRelationIdentity.rows[0]?.crypto_name === null;
  const terminalRiskIdentityGapPreserved = terminalRiskIdentity.rows[0]?.crypto_name === null;

  const executor = {
    queryRows: async (sql, parameters = []) => (await target.query(sql, parameters)).rows,
  };
  const workspace = await getCryptoResearchWorkspace(executor, {
    knownAt: new Date('2026-07-23T00:00:00.000Z'),
    limit: 40,
  });
  const sourceRevisionIds = [
    ...workspace.entities.map((item) => item.sourceRevisionId),
    ...workspace.events.map((item) => item.sourceRevisionId),
    ...workspace.companyLinks.map((item) => item.sourceRevisionId),
    ...workspace.riskExposures.map((item) => item.sourceRevisionId),
  ];
  const sortedSourceRevisionIds = sourceRevisionIds.toSorted((left, right) => left - right);
  result = {
    ok:
      workspace.entities.length === 2 &&
      workspace.events.length === 1 &&
      workspace.events[0]?.eventKey === 'crypto:event:chain_halt:visible' &&
      workspace.companyLinks.length === 0 &&
      workspace.riskExposures.length === 1 &&
      workspace.riskExposures[0]?.exposureKey === 'risk:btc:building-null-confidence' &&
      workspace.riskExposures[0]?.lifecycleState === 'building' &&
      workspace.riskExposures[0]?.epistemicConfidence === null &&
      workspace.riskExposures[0]?.economicMagnitude === null &&
      workspace.riskExposures[0]?.economicMagnitudeUnit === null &&
      sortedSourceRevisionIds.join(',') === '1,2,3,10' &&
      tokenAccountAlternativeRejected &&
      uppercaseAssetRejected &&
      mismatchedAssetChainRejected &&
      invalidAccountCharacterRejected &&
      relationMagnitudePairRejected &&
      relationIdentityDriftRejected &&
      shockMagnitudePairRejected &&
      shockNegativeMagnitudeRejected &&
      riskMagnitudePairRejected &&
      riskNegativeMagnitudeRejected &&
      riskTerminalResurrectionRejected &&
      riskBackdatedRetractionRejected &&
      riskConcurrentRetractionRejected &&
      riskConcurrentLockObserved &&
      createdAtMutationRejected &&
      relationIdentityIsPIT &&
      riskIdentityIsPIT &&
      terminalRelationIdentityGapPreserved &&
      terminalRiskIdentityGapPreserved,
    replayed: true,
    connectedDatabaseVerified: true,
    roleStateRestored: false,
    stats: workspace.stats,
    sourceRevisionIds,
    sortedSourceRevisionIds,
    tokenAccountAlternativeRejected,
    uppercaseAssetRejected,
    mismatchedAssetChainRejected,
    invalidAccountCharacterRejected,
    relationMagnitudePairRejected,
    relationIdentityDriftRejected,
    shockMagnitudePairRejected,
    shockNegativeMagnitudeRejected,
    riskMagnitudePairRejected,
    riskNegativeMagnitudeRejected,
    riskTerminalResurrectionRejected,
    riskBackdatedRetractionRejected,
    riskConcurrentRetractionRejected,
    riskConcurrentLockObserved,
    futureEventHidden: !workspace.events.some((item) => item.eventKey.endsWith(':future')),
    retractedEventHidden: !workspace.events.some((item) => item.eventKey.endsWith(':terminal')),
    rejectedRelationHidden: workspace.companyLinks.length === 0,
    retractedRiskHidden: !workspace.riskExposures.some(
      (item) => item.exposureKey === 'risk:btc:terminal',
    ),
    buildingNullConfidencePreserved: workspace.riskExposures[0]?.epistemicConfidence === null,
    createdAtMutationRejected,
    relationIdentityIsPIT,
    riskIdentityIsPIT,
    terminalRelationIdentityGapPreserved,
    terminalRiskIdentityGapPreserved,
  };
  if (!result.ok) throw new Error(`P6 rehearsal invariant failed: ${JSON.stringify(result)}`);
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
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`,
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quotedDatabase}`);
  } catch (error) {
    cleanupErrors.push(error);
  }
  for (const roleName of roleNames.toReversed()) {
    if (existingRoles.has(roleName)) continue;
    try {
      await admin.query(`DROP ROLE IF EXISTS "${roleName}"`);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    const roleStateAfter = await readRoleState();
    const roleStateRestored = JSON.stringify(roleStateAfter) === JSON.stringify(roleStateBefore);
    if (result) result.roleStateRestored = roleStateRestored;
    if (!roleStateRestored) cleanupErrors.push(new Error('rehearsal role state was not restored'));
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
if (failures.length > 0) throw new AggregateError(failures, 'P6 rehearsal or cleanup failed');
if (!result) throw new Error('P6 rehearsal produced no result');
console.log(JSON.stringify(result));
