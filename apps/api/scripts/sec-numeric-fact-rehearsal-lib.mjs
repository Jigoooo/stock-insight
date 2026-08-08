import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { truthKernelMigrationSql } from '../../../packages/db-schema/src/migrations/031_truth_kernel.ts';
import { metricDefinitionRegistryMigrationSql } from '../../../packages/db-schema/src/migrations/084_metric_definition_registry.ts';
import { numericFactRevisionGuardMigrationSql } from '../../../packages/db-schema/src/migrations/090_numeric_fact_revision_guard.ts';
import { writeRawObject } from '../src/ingest/raw-object-store.ts';

import { additiveAppMigrations } from '@stock-insight/db-schema';
const apiRoot = fileURLToPath(new URL('..', import.meta.url));
const REQUIRED_MIGRATIONS = [
  '031_truth_kernel',
  '084_metric_definition_registry',
  '090_numeric_fact_revision_guard',
];
const ROLE_NAMES = ['si_knowledge', 'si_analytics', 'si_publisher', 'si_readapi'];
const CIK = '0000009999';

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function createTableStatement(sql, qualifiedName) {
  const opening = `CREATE TABLE IF NOT EXISTS ${qualifiedName} (`;
  const start = sql.indexOf(opening);
  if (start === -1) throw new Error(`${qualifiedName} not found in migration`);
  const end = sql.indexOf('\n);', start);
  if (end === -1) throw new Error(`${qualifiedName} has no terminator`);
  return `${sql.slice(start, end)}\n);`;
}

async function ensureRoles(admin, createdRoles) {
  const existing = await admin.query('SELECT rolname FROM pg_roles WHERE rolname = ANY($1)', [
    ROLE_NAMES,
  ]);
  const found = new Set(existing.rows.map((row) => row.rolname));
  for (const role of ROLE_NAMES) {
    if (found.has(role)) continue;
    await admin.query(`CREATE ROLE ${quoteIdentifier(role)} NOLOGIN NOSUPERUSER NOCREATEDB`);
    createdRoles.push(role);
  }
}

export async function cleanupRehearsalRoles(admin, createdRoles) {
  for (const role of [...createdRoles].reverse()) {
    await admin.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);
  }
}

const BASE_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS ingestion;
CREATE SCHEMA IF NOT EXISTS market;
CREATE SCHEMA IF NOT EXISTS world;
CREATE SCHEMA IF NOT EXISTS knowledge;
CREATE SCHEMA IF NOT EXISTS governance;

CREATE TABLE core.entity (
  entity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  country_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE core.entity_identifier (
  identifier_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
  identifier_type TEXT NOT NULL,
  identifier_value TEXT NOT NULL,
  namespace TEXT NOT NULL DEFAULT '',
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  UNIQUE(identifier_type, identifier_value, namespace)
);
CREATE TABLE ingestion.source (
  source_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_key TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,
  tier SMALLINT NOT NULL,
  license_status TEXT NOT NULL,
  redistribution TEXT NOT NULL,
  enforcement TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ingestion.source_record_identity (
  source_record_identity_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES ingestion.source(source_id),
  provider_record_key TEXT NOT NULL,
  first_observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_id, provider_record_key)
);
CREATE TABLE ingestion.raw_object (
  raw_object_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES ingestion.source(source_id),
  content_hash TEXT NOT NULL,
  object_uri TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  UNIQUE(source_id, content_hash)
);
CREATE TABLE ingestion.source_revision (
  source_revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_record_identity_id BIGINT NOT NULL REFERENCES ingestion.source_record_identity(source_record_identity_id),
  revision_no INTEGER NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL,
  raw_object_id BIGINT NOT NULL REFERENCES ingestion.raw_object(raw_object_id),
  payload_metadata JSONB NOT NULL DEFAULT '{}',
  UNIQUE(source_record_identity_id, revision_no)
);
CREATE TABLE market.financial_concept (
  concept TEXT PRIMARY KEY,
  us_gaap_tags TEXT[] NOT NULL DEFAULT '{}',
  unit_class TEXT NOT NULL
);
CREATE TABLE market.financial_fact (
  issuer_entity_id BIGINT NOT NULL,
  concept TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  currency TEXT,
  period_start DATE,
  period_end DATE NOT NULL,
  fiscal_period TEXT,
  filing_ref TEXT NOT NULL,
  source_provider TEXT NOT NULL
);
${createTableStatement(truthKernelMigrationSql, 'world.numeric_fact')}

CREATE OR REPLACE FUNCTION knowledge.guard_truth_revision_chain()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior_key TEXT; prior_revision INTEGER;
BEGIN
  IF NEW.revision_no > 1 THEN
    SELECT fact_key, revision_no INTO prior_key, prior_revision
      FROM world.numeric_fact WHERE numeric_fact_id = NEW.supersedes_numeric_fact_id;
    IF prior_key IS DISTINCT FROM NEW.fact_key OR prior_revision IS DISTINCT FROM NEW.revision_no - 1 THEN
      RAISE EXCEPTION 'numeric-fact supersession must reference previous revision of same key';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER numeric_fact_revision_guard BEFORE INSERT ON world.numeric_fact
FOR EACH ROW EXECUTE FUNCTION knowledge.guard_truth_revision_chain();

CREATE OR REPLACE FUNCTION knowledge.reject_truth_kernel_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = '55000';
END $$;
CREATE TRIGGER numeric_fact_immutable BEFORE UPDATE OR DELETE ON world.numeric_fact
FOR EACH ROW EXECUTE FUNCTION knowledge.reject_truth_kernel_mutation();
`;

export async function prepareRehearsalDatabase(admin, target, createdRoles) {
  const registryIds = additiveAppMigrations.map(({ id }) => id);
  for (const id of REQUIRED_MIGRATIONS) assert.ok(registryIds.includes(id), `${id} absent`);
  assert.ok(
    registryIds.indexOf('084_metric_definition_registry') <
      registryIds.indexOf('090_numeric_fact_revision_guard'),
  );
  await ensureRoles(admin, createdRoles);
  await target.query(BASE_SCHEMA_SQL);
  await target.query(metricDefinitionRegistryMigrationSql);
  await target.query(numericFactRevisionGuardMigrationSql);
  await target.query(metricDefinitionRegistryMigrationSql);
  await target.query(numericFactRevisionGuardMigrationSql);
  const trigger = await target.query(
    `SELECT count(*)::int AS n FROM pg_trigger
      WHERE tgname='numeric_fact_revision_guard' AND NOT tgisinternal`,
  );
  const migrationReapplyVerified = trigger.rows[0].n === 1;
  assert.equal(migrationReapplyVerified, true);
  return { migrationReapplyVerified };
}

function payload(entriesByConcept) {
  return {
    cik: Number(CIK),
    entityName: 'SEC Rehearsal Company',
    facts: {
      'us-gaap': Object.fromEntries(
        Object.entries(entriesByConcept).map(([concept, entries]) => [
          concept,
          { label: concept, description: `${concept} rehearsal`, units: { USD: entries } },
        ]),
      ),
    },
  };
}

const inventoryOriginal = {
  val: 100,
  accn: '0000009999-25-000001',
  filed: '2025-02-15',
  end: '2024-12-31',
  form: '10-K',
  fy: 2024,
  fp: 'FY',
};
const ppeOriginal = {
  val: 500,
  accn: '0000009999-25-000001',
  filed: '2025-02-15',
  end: '2024-12-31',
  form: '10-K',
  fy: 2024,
  fp: 'FY',
};
const PAYLOAD_ONE = payload({
  InventoryNet: [inventoryOriginal],
  PropertyPlantAndEquipmentNet: [ppeOriginal],
});
const PAYLOAD_TWO = payload({
  InventoryNet: [
    inventoryOriginal,
    {
      ...inventoryOriginal,
      accn: '0000009999-25-000002',
      filed: '2025-05-01',
      form: '10-Q',
      fy: 2025,
      fp: 'Q1',
    },
    {
      ...inventoryOriginal,
      val: 120,
      accn: '0000009999-25-000003',
      filed: '2025-06-01',
      form: '10-K/A',
    },
  ],
  PropertyPlantAndEquipmentNet: [ppeOriginal],
});

async function insertRawRevision(pool, rawRoot, body, timing) {
  const ref = await writeRawObject({
    providerKey: 'sec-edgar',
    content: JSON.stringify(body),
    extension: 'json',
    fetchedAt: new Date(timing.sourceAvailableAt),
    root: rawRoot,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const source = await client.query(
      `SELECT source_id FROM ingestion.source WHERE provider_key='sec-edgar'`,
    );
    const sourceId = Number(source.rows[0].source_id);
    const identity = await client.query(
      `INSERT INTO ingestion.source_record_identity
        (source_id, provider_record_key, first_observed_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (source_id, provider_record_key) DO UPDATE
         SET provider_record_key=EXCLUDED.provider_record_key
       RETURNING source_record_identity_id`,
      [sourceId, `CIK${CIK}`, timing.sourceAvailableAt],
    );
    const raw = await client.query(
      `INSERT INTO ingestion.raw_object (source_id, content_hash, object_uri, fetched_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (source_id, content_hash) DO UPDATE SET object_uri=EXCLUDED.object_uri
       RETURNING raw_object_id`,
      [sourceId, ref.contentHash, ref.objectUri, timing.sourceAvailableAt],
    );
    const previous = await client.query(
      `SELECT source_revision_id, revision_no FROM ingestion.source_revision
       WHERE source_record_identity_id=$1 ORDER BY revision_no DESC LIMIT 1`,
      [identity.rows[0].source_record_identity_id],
    );
    const revisionNo = Number(previous.rows[0]?.revision_no ?? 0) + 1;
    const revision = await client.query(
      `INSERT INTO ingestion.source_revision
        (source_record_identity_id, revision_no, available_at, ingested_at,
         content_hash, raw_object_id, payload_metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       RETURNING source_revision_id`,
      [
        identity.rows[0].source_record_identity_id,
        revisionNo,
        timing.sourceAvailableAt,
        timing.ingestedAt,
        ref.contentHash,
        raw.rows[0].raw_object_id,
        JSON.stringify({ object_uri: ref.objectUri }),
      ],
    );
    await client.query('COMMIT');
    return {
      contentHash: ref.contentHash,
      sourceRevisionId: Number(revision.rows[0].source_revision_id),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function runSecCli(databaseUrl, mode) {
  const args = [
    'src/backfill/run-sec-numeric-fact.ts',
    '--limit',
    '1',
    '--cik',
    CIK,
    '--since-year',
    '2020',
  ];
  if (mode !== 'dry-run') args.push(`--${mode}`);
  const output = execFileSync(process.execPath, args, {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output.slice(output.indexOf('{')));
}

async function countCanonicalRows(pool) {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM world.numeric_fact WHERE fact_key LIKE 'sec:%') AS facts,
      (SELECT count(*)::int FROM governance.metric_definition) AS definitions
  `);
  return result.rows[0];
}

async function insertProbeFact(client, row) {
  const result = await client.query(
    `INSERT INTO world.numeric_fact (
       fact_key, revision_no, entity_id, concept_namespace, concept_key,
       value, unit, currency, scale_power, period_start, period_end, instant_at,
       fiscal_year, fiscal_quarter, dimensions_json, restatement_group_key,
       original_cell_or_xbrl_locator, source_revision_id, available_at, known_at,
       supersedes_numeric_fact_id, metadata
     ) VALUES (
       $1,$2,1,'us-gaap',$3,$4,'currency','USD',0,NULL,NULL,
       '2024-12-31T23:59:59.999Z',$5,$6,'{}'::jsonb,$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb
     ) RETURNING numeric_fact_id`,
    [
      row.factKey,
      row.revisionNo,
      row.conceptKey ?? 'InventoryNet',
      row.value ?? 1,
      row.fiscalYear ?? 2024,
      row.fiscalQuarter ?? 4,
      row.groupKey,
      JSON.stringify({ provider: 'rehearsal', cell: row.factKey }),
      row.sourceRevisionId,
      row.availableAt,
      row.knownAt,
      row.supersedesId ?? null,
      JSON.stringify({ metricDefinitionKey: row.definitionKey ?? 'probe.inventory' }),
    ],
  );
  return Number(result.rows[0].numeric_fact_id);
}

export async function expectRevisionRejected(pool, label, overrides) {
  const client = await pool.connect();
  let rejected = false;
  try {
    await client.query('BEGIN');
    const source = await client.query(
      'SELECT min(source_revision_id)::bigint AS id FROM ingestion.source_revision',
    );
    const sourceRevisionId = Number(source.rows[0].id);
    const groupKey = `probe:${label}`;
    const baseId = await insertProbeFact(client, {
      factKey: `${groupKey}:1`,
      revisionNo: 1,
      groupKey,
      sourceRevisionId,
      availableAt: '2025-02-15T23:59:59Z',
      knownAt: '2026-08-08T12:00:00Z',
    });
    await insertProbeFact(client, {
      factKey: `${groupKey}:2`,
      revisionNo: 2,
      groupKey,
      sourceRevisionId,
      availableAt: '2025-03-01T23:59:59Z',
      knownAt: '2026-08-09T12:00:00Z',
      supersedesId: baseId,
      ...overrides,
    });
  } catch (error) {
    if (error?.code === 'P0001') rejected = true;
    else throw error;
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
  return rejected;
}

async function appendOnlyRejected(pool) {
  try {
    await pool.query(`UPDATE world.numeric_fact SET value=value WHERE fact_key LIKE 'sec:%'`);
  } catch (error) {
    if (error?.code === '55000') return true;
    throw error;
  }
  return false;
}

async function insertDartDistinctRevision(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const source = await client.query(
      'SELECT min(source_revision_id)::bigint AS id FROM ingestion.source_revision',
    );
    const sourceRevisionId = Number(source.rows[0].id);
    const first = await insertProbeFact(client, {
      factKey: 'dart:receipt-1:BS:Assets',
      revisionNo: 1,
      groupKey: 'dart:issuer:Assets:2024-12-31',
      sourceRevisionId,
      availableAt: '2025-03-01T23:59:59Z',
      knownAt: '2026-08-08T12:00:00Z',
      definitionKey: 'dart.ifrs-full.assets.instant.krw',
    });
    await insertProbeFact(client, {
      factKey: 'dart:receipt-2:BS:Assets',
      revisionNo: 2,
      groupKey: 'dart:issuer:Assets:2024-12-31',
      sourceRevisionId,
      availableAt: '2025-03-02T23:59:59Z',
      knownAt: '2026-08-09T12:00:00Z',
      supersedesId: first,
      definitionKey: 'dart.ifrs-full.assets.instant.krw',
    });
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function observeProviderLock(pool) {
  const first = await pool.connect();
  const second = await pool.connect();
  try {
    await first.query('BEGIN');
    await second.query('BEGIN');
    await first.query(`SELECT pg_advisory_xact_lock(hashtextextended('sec-edgar:numeric-fact',0))`);
    const blocked = await second.query(
      `SELECT pg_try_advisory_xact_lock(hashtextextended('sec-edgar:numeric-fact',0)) AS locked`,
    );
    await first.query('ROLLBACK');
    const acquired = await second.query(
      `SELECT pg_try_advisory_xact_lock(hashtextextended('sec-edgar:numeric-fact',0)) AS locked`,
    );
    await second.query('ROLLBACK');
    return blocked.rows[0].locked === false && acquired.rows[0].locked === true;
  } finally {
    await first.query('ROLLBACK').catch(() => undefined);
    await second.query('ROLLBACK').catch(() => undefined);
    first.release();
    second.release();
  }
}

function assertEvidence(evidence) {
  for (const [name, value] of Object.entries(evidence)) {
    assert.equal(value, true, `${name} was not proven`);
  }
}

export async function seedAndExercise(pool, databaseUrl, rawRoot) {
  const current = await pool.query('SELECT current_database() AS name');
  assert.match(current.rows[0].name, /^stock_insight_sec_rehearsal_/);
  await pool.query(
    `INSERT INTO ingestion.source
      (provider_key, source_type, tier, license_status, redistribution, enforcement, created_at)
     VALUES ('sec-edgar','api',1,'conditional','derived_only','warn','2026-01-01T00:00:00Z')`,
  );
  await pool.query(
    `INSERT INTO core.entity
      (entity_type, canonical_name, status, country_code)
     VALUES ('Company','SEC Rehearsal Company','active','US')`,
  );
  await pool.query(
    `INSERT INTO core.entity_identifier
      (entity_id, identifier_type, identifier_value)
     VALUES (1,'CIK',$1)`,
    [CIK],
  );

  await insertRawRevision(pool, rawRoot, PAYLOAD_ONE, {
    sourceAvailableAt: '2026-08-08T11:59:00Z',
    ingestedAt: '2026-08-08T12:00:00Z',
  });
  const before = await countCanonicalRows(pool);
  const dry = runSecCli(databaseUrl, 'dry-run');
  const afterDry = await countCanonicalRows(pool);
  const dryRunReadOnly =
    dry.mode === 'dry-run' &&
    before.facts === afterDry.facts &&
    before.definitions === afterDry.definitions;

  const rehearsed = runSecCli(databaseUrl, 'rehearse');
  const afterRehearse = await countCanonicalRows(pool);
  const rehearsalRolledBack =
    rehearsed.factsRolledBack === 2 &&
    rehearsed.definitionsRolledBack === 2 &&
    afterRehearse.facts === 0 &&
    afterRehearse.definitions === 0;

  const first = runSecCli(databaseUrl, 'apply');
  const afterFirst = await countCanonicalRows(pool);
  const firstApplyCommitted =
    first.factsWritten === 2 && afterFirst.facts === 2 && afterFirst.definitions === 2;
  const second = runSecCli(databaseUrl, 'apply');
  const afterSecond = await countCanonicalRows(pool);
  const secondApplyIdempotent =
    second.factsWritten === 0 &&
    afterSecond.facts === afterFirst.facts &&
    afterSecond.definitions === afterFirst.definitions;

  await insertRawRevision(pool, rawRoot, PAYLOAD_TWO, {
    sourceAvailableAt: '2026-08-09T11:59:00Z',
    ingestedAt: '2026-08-09T12:00:00Z',
  });
  const amendment = runSecCli(databaseUrl, 'apply');
  const inventory = await pool.query(
    `SELECT fact.numeric_fact_id, fact.fact_key, fact.revision_no, fact.value::text,
            fact.supersedes_numeric_fact_id, previous.revision_no AS previous_revision,
            fact.restatement_group_key = previous.restatement_group_key AS same_group
       FROM world.numeric_fact fact
       LEFT JOIN world.numeric_fact previous
         ON previous.numeric_fact_id=fact.supersedes_numeric_fact_id
      WHERE fact.concept_key='InventoryNet'
      ORDER BY fact.revision_no`,
  );
  const unchangedComparativeSuppressed = amendment.skips.some(
    (skip) => skip.reason === 'unchanged comparative repetition' && skip.count >= 1,
  );
  const changedAmendmentRevised =
    amendment.factsWritten === 1 &&
    inventory.rows.length === 2 &&
    inventory.rows[1].revision_no === 2 &&
    inventory.rows[1].value === '120';
  const exactNMinusOneSupersedes =
    inventory.rows[1].previous_revision === 1 && inventory.rows[1].same_group === true;

  const lineage = await pool.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (
             WHERE revision.content_hash=raw.content_hash
               AND fact.known_at=revision.ingested_at
               AND fact.available_at<=fact.known_at
               AND (fact.metadata->>'sourceAvailableAt')::timestamptz=revision.available_at
               AND fact.metadata->>'sourceRevisionContentHash'=revision.content_hash
               AND fact.original_cell_or_xbrl_locator->>'accession' IS NOT NULL
               AND fact.original_cell_or_xbrl_locator->>'tag'=fact.concept_key
           )::int AS valid
      FROM world.numeric_fact fact
      JOIN ingestion.source_revision revision USING(source_revision_id)
      JOIN ingestion.raw_object raw USING(raw_object_id)
     WHERE fact.fact_key LIKE 'sec:%'
  `);
  const sourceRevisionContentHashVerified =
    lineage.rows[0].total > 0 && lineage.rows[0].valid === lineage.rows[0].total;
  const locatorLineageVerified = sourceRevisionContentHashVerified;
  const pitAxesVerified = sourceRevisionContentHashVerified;

  const binding = await pool.query(`
    SELECT count(*)::int AS total,
           count(definition.metric_definition_id)::int AS bound,
           count(*) FILTER (WHERE definition.source_id=source.source_id)::int AS correct_source
      FROM world.numeric_fact fact
      JOIN ingestion.source_revision revision USING(source_revision_id)
      JOIN ingestion.source_record_identity identity USING(source_record_identity_id)
      JOIN ingestion.source source USING(source_id)
      LEFT JOIN governance.metric_definition definition
        ON definition.definition_key=fact.metadata->>'metricDefinitionKey'
       AND definition.revision_no=1
     WHERE fact.fact_key LIKE 'sec:%'
  `);
  const definitionBindingVerified =
    binding.rows[0].total === binding.rows[0].bound &&
    binding.rows[0].total === binding.rows[0].correct_source;
  const groups = await pool.query(
    `SELECT count(DISTINCT restatement_group_key)::int AS n
       FROM world.numeric_fact WHERE fact_key LIKE 'sec:%'`,
  );
  const multipleGroupsWritten = groups.rows[0].n >= 2;

  const sourceRevisionId = Number(
    (await pool.query('SELECT min(source_revision_id) AS id FROM ingestion.source_revision'))
      .rows[0].id,
  );
  const wrongGroupRejected = await expectRevisionRejected(pool, 'wrong-group', {
    groupKey: 'probe:different-group',
  });
  const wrongRevisionRejected = await expectRevisionRejected(pool, 'wrong-revision', {
    revisionNo: 3,
  });
  const claimStructureRejected = await expectRevisionRejected(pool, 'wrong-concept', {
    conceptKey: 'Assets',
  });
  const fiscalDriftRejected = await expectRevisionRejected(pool, 'wrong-fiscal', {
    fiscalQuarter: 3,
  });
  const definitionDriftRejected = await expectRevisionRejected(pool, 'wrong-definition', {
    definitionKey: 'probe.other',
  });
  const backwardKnownAtRejected = await expectRevisionRejected(pool, 'backward-known', {
    knownAt: '2026-08-07T12:00:00Z',
  });
  const backwardAvailableAtRejected = await expectRevisionRejected(pool, 'backward-available', {
    availableAt: '2025-01-01T23:59:59Z',
  });
  void sourceRevisionId;
  const appendOnlyMutationRejected = await appendOnlyRejected(pool);
  const dartDistinctFactKeyAccepted = await insertDartDistinctRevision(pool);
  const providerAdvisoryLockObserved = await observeProviderLock(pool);

  const evidence = {
    sourceRevisionContentHashVerified,
    dryRunReadOnly,
    rehearsalRolledBack,
    firstApplyCommitted,
    secondApplyIdempotent,
    unchangedComparativeSuppressed,
    changedAmendmentRevised,
    exactNMinusOneSupersedes,
    locatorLineageVerified,
    pitAxesVerified,
    definitionBindingVerified,
    multipleGroupsWritten,
    wrongGroupRejected,
    wrongRevisionRejected,
    claimStructureRejected,
    fiscalDriftRejected,
    definitionDriftRejected,
    backwardKnownAtRejected,
    backwardAvailableAtRejected,
    appendOnlyMutationRejected,
    dartDistinctFactKeyAccepted,
    providerAdvisoryLockObserved,
  };
  assertEvidence(evidence);
  return evidence;
}
