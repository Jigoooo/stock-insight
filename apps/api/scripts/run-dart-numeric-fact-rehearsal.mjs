// Rehearses the DART numeric fact write path against a disposable database.
//
// dry-run proves what the rows would be but never executes the statements that
// carry them: the inserts are built by hand — placeholder arithmetic, column
// order, JSON casting, the revision levels — and none of that runs until a
// transaction opens. A CHECK violation there aborts the whole batch and names one
// row, which is why this exists.
//
// It creates a throwaway database, stubs exactly the tables the runner touches,
// applies 084, seeds a handful of *real* filings pointing at the real payload
// files on disk, runs the runner binary unchanged, asserts what landed, and drops
// the database.
//
// Usage (admin DSN is the live one with the database swapped for `postgres`):
//   DART_REHEARSAL_ADMIN_DATABASE_URL=… DATABASE_URL=… \
//     node apps/api/scripts/run-dart-numeric-fact-rehearsal.mjs

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import pg from 'pg';

import { truthKernelMigrationSql } from '../../../packages/db-schema/src/migrations/031_truth_kernel.ts';
import { metricDefinitionRegistryMigrationSql } from '../../../packages/db-schema/src/migrations/084_metric_definition_registry.ts';

const { Client } = pg;

const SEED_FILINGS = 6;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/**
 * Lifts one CREATE TABLE out of a migration rather than copying its DDL here.
 *
 * 031 creates the whole truth kernel and most of it has foreign keys this
 * rehearsal has no reason to satisfy. Taking the statement from the migration
 * keeps the rehearsal honest about the shape it is testing against: a column
 * added there shows up here without anyone remembering to mirror it.
 */
function createTableStatement(sql, qualifiedName) {
  const opening = `CREATE TABLE IF NOT EXISTS ${qualifiedName} (`;
  const start = sql.indexOf(opening);
  if (start === -1) throw new Error(`${qualifiedName} not found in the migration`);
  const end = sql.indexOf('\n);', start);
  if (end === -1) throw new Error(`${qualifiedName} has no terminator`);
  return `${sql.slice(start, end)}\n);`;
}

const adminUrl = new URL(requireEnv('DART_REHEARSAL_ADMIN_DATABASE_URL'));
const liveUrl = requireEnv('DATABASE_URL');
const databaseName = `stock_insight_dart_rehearsal_${randomBytes(6).toString('hex')}`;
const quoted = `"${databaseName}"`;

const targetUrl = new URL(adminUrl.toString());
targetUrl.pathname = `/${databaseName}`;

const admin = new Client({ connectionString: adminUrl.toString() });
const live = new Client({ connectionString: liveUrl });
await admin.connect();
await live.connect();

let target = null;
const checks = [];
function check(label, condition, detail = '') {
  checks.push({ label, ok: Boolean(condition), detail });
}

try {
  // ── seed inputs, read from live so the payloads and corp codes are real ──────
  const filings = (
    await live.query(
      `SELECT sr.source_revision_id, sr.ingested_at, ro.object_uri, ro.source_document_id
         FROM ingestion.source_revision sr
         JOIN ingestion.raw_object ro ON ro.raw_object_id = sr.raw_object_id
         JOIN ingestion.source s ON s.source_id = ro.source_id
        WHERE s.provider_key = 'opendart'
          AND ro.source_document_id NOT LIKE '00117212:2026:11012'
        ORDER BY sr.source_revision_id DESC
        LIMIT $1`,
      [SEED_FILINGS],
    )
  ).rows;
  const corpCodes = [...new Set(filings.map((row) => row.source_document_id.split(':')[0]))];
  const identities = (
    await live.query(
      `SELECT identifier_value, entity_id FROM core.entity_identifier
        WHERE identifier_type = 'DART_CORP_CODE' AND identifier_value = ANY($1)`,
      [corpCodes],
    )
  ).rows;
  const profiles = (
    await live.query(
      `SELECT ro.object_uri FROM ingestion.raw_object ro
         JOIN ingestion.source s ON s.source_id = ro.source_id
        WHERE s.provider_key = 'internal-company-profile-snapshot'`,
    )
  ).rows;

  check('live seed found filings', filings.length === SEED_FILINGS, `${filings.length}`);
  check('every seeded issuer resolves', identities.length === corpCodes.length);

  await admin.query(`CREATE DATABASE ${quoted}`);
  target = new Client({ connectionString: targetUrl.toString() });
  await target.connect();
  const connected = await target.query('SELECT current_database() AS name');
  if (connected.rows[0]?.name !== databaseName) {
    throw new Error('rehearsal connected to an unexpected database');
  }

  // ── the tables the runner reads and writes, and nothing else ─────────────────
  await target.query(`
    CREATE SCHEMA core;
    CREATE SCHEMA ingestion;
    CREATE SCHEMA world;
    CREATE SCHEMA governance;
    CREATE SCHEMA market;

    CREATE TABLE core.entity (
      entity_id BIGINT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      canonical_name TEXT NOT NULL
    );
    CREATE TABLE core.entity_identifier (
      entity_id BIGINT NOT NULL REFERENCES core.entity(entity_id),
      identifier_type TEXT NOT NULL,
      identifier_value TEXT NOT NULL
    );

    CREATE TABLE ingestion.source (
      source_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      provider_key TEXT NOT NULL
    );
    CREATE TABLE ingestion.raw_object (
      raw_object_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      source_id BIGINT NOT NULL REFERENCES ingestion.source(source_id),
      source_document_id TEXT,
      object_uri TEXT NOT NULL
    );
    CREATE TABLE ingestion.source_revision (
      source_revision_id BIGINT PRIMARY KEY,
      raw_object_id BIGINT NOT NULL REFERENCES ingestion.raw_object(raw_object_id),
      ingested_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE market.financial_concept (concept TEXT PRIMARY KEY, dart_account_ids TEXT[]);
    CREATE TABLE market.financial_fact (
      issuer_entity_id BIGINT, concept TEXT, period_end DATE,
      value NUMERIC, source_provider TEXT
    );

    ${createTableStatement(truthKernelMigrationSql, 'world.numeric_fact')}
  `);

  // 084 grants to pipeline roles that do not exist in a throwaway database.
  await target.query(`
    DO $roles$
    DECLARE role_name TEXT;
    BEGIN
      FOREACH role_name IN ARRAY ARRAY['si_knowledge','si_analytics','si_publisher','si_readapi']
      LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB', role_name);
        END IF;
      END LOOP;
    END
    $roles$;
  `);
  await target.query(metricDefinitionRegistryMigrationSql);
  check('084 applied to the rehearsal database', true);

  // ── seed ────────────────────────────────────────────────────────────────────
  for (const identity of identities) {
    await target.query(
      `INSERT INTO core.entity (entity_id, entity_type, canonical_name) VALUES ($1,'Company',$2)
       ON CONFLICT DO NOTHING`,
      [identity.entity_id, `issuer ${identity.identifier_value}`],
    );
    await target.query(`INSERT INTO core.entity_identifier VALUES ($1,'DART_CORP_CODE',$2)`, [
      identity.entity_id,
      identity.identifier_value,
    ]);
  }
  await target.query(
    `INSERT INTO ingestion.source (provider_key)
     VALUES ('opendart'), ('internal-company-profile-snapshot')`,
  );
  for (const profile of profiles) {
    await target.query(
      `INSERT INTO ingestion.raw_object (source_id, source_document_id, object_uri)
       SELECT source_id, NULL, $1 FROM ingestion.source
        WHERE provider_key = 'internal-company-profile-snapshot'`,
      [profile.object_uri],
    );
  }
  for (const filing of filings) {
    const { rows } = await target.query(
      `INSERT INTO ingestion.raw_object (source_id, source_document_id, object_uri)
       SELECT source_id, $1, $2 FROM ingestion.source WHERE provider_key = 'opendart'
       RETURNING raw_object_id`,
      [filing.source_document_id, filing.object_uri],
    );
    await target.query(
      `INSERT INTO ingestion.source_revision (source_revision_id, raw_object_id, ingested_at)
       VALUES ($1, $2, $3)`,
      [filing.source_revision_id, rows[0].raw_object_id, filing.ingested_at],
    );
  }

  // ── run the runner itself, unchanged ────────────────────────────────────────
  const output = execFileSync(
    process.execPath,
    ['apps/api/src/backfill/run-dart-numeric-fact.ts', '--apply'],
    {
      cwd: new URL('../../../', import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: targetUrl.toString() },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const summary = JSON.parse(output.slice(output.indexOf('{')));

  check('runner reported no schema violations', summary.schemaViolations.length === 0);
  check('runner wrote facts', summary.factsWritten > 0, `${summary.factsWritten}`);

  const facts = await target.query('SELECT count(*)::int AS n FROM world.numeric_fact');
  const definitions = await target.query(
    'SELECT count(*)::int AS n FROM governance.metric_definition',
  );
  check(
    'facts landed exactly as reported',
    facts.rows[0].n === summary.factsWritten,
    `${facts.rows[0].n} vs ${summary.factsWritten}`,
  );
  check('definitions landed', definitions.rows[0].n === summary.definitions);

  // The current view 084 ships is what a reader would actually select.
  const view = await target.query(
    'SELECT count(*)::int AS n FROM governance.metric_definition_current_v1',
  );
  check('the current view resolves', view.rows[0].n === definitions.rows[0].n);

  // Re-running must recognise its own work rather than revise it.
  const second = JSON.parse(
    (() => {
      const out = execFileSync(
        process.execPath,
        ['apps/api/src/backfill/run-dart-numeric-fact.ts', '--apply'],
        {
          cwd: new URL('../../../', import.meta.url).pathname,
          env: { ...process.env, DATABASE_URL: targetUrl.toString() },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      return out.slice(out.indexOf('{'));
    })(),
  );
  check('a second run writes nothing', second.factsWritten === 0, `${second.factsWritten}`);
  const afterSecond = await target.query('SELECT count(*)::int AS n FROM world.numeric_fact');
  check('and leaves the row count alone', afterSecond.rows[0].n === facts.rows[0].n);

  const badRevision = await target.query(`
    SELECT count(*)::int AS n FROM world.numeric_fact
     WHERE (revision_no = 1) <> (supersedes_numeric_fact_id IS NULL)
  `);
  check('every revision agrees with what it supersedes', badRevision.rows[0].n === 0);

  const badTime = await target.query(
    'SELECT count(*)::int AS n FROM world.numeric_fact WHERE known_at < available_at',
  );
  check('no fact is known before it was available', badTime.rows[0].n === 0);

  const availability = await target.query(`
    SELECT count(*)::int AS n FROM world.numeric_fact
     WHERE available_at >= known_at - INTERVAL '1 day'
  `);
  check(
    'availability is dated from the receipt, not the fetch',
    availability.rows[0].n < facts.rows[0].n,
    `${availability.rows[0].n} of ${facts.rows[0].n} within a day of the fetch`,
  );
} finally {
  if (target) await target.end();
  await live.end();
  await admin.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
  await admin.end();
}

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  console.log(
    `${entry.ok ? 'ok  ' : 'FAIL'}  ${entry.label}${entry.detail ? ` — ${entry.detail}` : ''}`,
  );
}
if (failed.length > 0) {
  console.error(`\n${failed.length} of ${checks.length} rehearsal checks failed`);
  process.exitCode = 1;
} else {
  console.log(`\nall ${checks.length} rehearsal checks passed`);
}
