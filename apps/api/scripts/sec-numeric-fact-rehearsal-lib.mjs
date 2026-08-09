import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { readRawObjectVerified, writeRawObject } from '../src/ingest/raw-object-store.ts';

export function parseLastJson(output) {
  const start = output.lastIndexOf('\n{');
  return JSON.parse(output.slice(start < 0 ? output.indexOf('{') : start + 1));
}

export function runSecCli(apiRoot, databaseUrl, rawRoot, ...args) {
  return parseLastJson(
    execFileSync(
      process.execPath,
      ['src/backfill/run-sec-numeric-fact.ts', '--cik', '0000009999', '--limit', '1', ...args],
      {
        cwd: apiRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl, RAW_OBJECT_ROOT: rawRoot },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ),
  );
}

export function assertEvidence(value, label) {
  assert.equal(value, true, label);
  return true;
}

function nyCalendarDate(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function companyFacts({ filed, accession, revenue, includeAssets = false }) {
  const claimYear = Number(filed.slice(0, 4)) - 1;
  const entry = (value, extra = {}) => ({
    end: `${claimYear}-12-31`,
    val: value,
    accn: accession,
    fy: claimYear,
    fp: 'FY',
    form: accession.endsWith('3') ? '10-K/A' : '10-K',
    filed,
    ...extra,
  });
  return {
    cik: 9999,
    entityName: 'Disposable SEC Rehearsal Company',
    facts: {
      'us-gaap': {
        Revenue: {
          label: 'Revenue',
          description: 'Revenue for the period.',
          units: { USD: [entry(revenue, { start: `${claimYear}-01-01` })] },
        },
        ...(includeAssets
          ? {
              Assets: {
                label: 'Assets',
                description: 'Assets at period end.',
                units: { USD: [entry(500)] },
              },
            }
          : {}),
      },
    },
  };
}

async function appendRawRevision(client, fixture) {
  const ref = await writeRawObject({
    providerKey: 'sec-edgar',
    content: JSON.stringify(fixture.payload),
    extension: 'json',
    fetchedAt: fixture.availableAt,
    root: fixture.rawRoot,
  });
  await readRawObjectVerified(ref);
  const fetch = await client.query(
    `INSERT INTO ingestion.fetch_run
       (source_id, run_id, idempotency_key, started_at, finished_at, status,
        records_read, records_written, records_skipped, summary)
     VALUES ($1,$2,$3,$4,$5,'success',1,1,0,'{}') RETURNING fetch_run_id`,
    [
      fixture.sourceId,
      `sec-rehearsal-${fixture.revisionNo}`,
      `sec-rehearsal-${fixture.revisionNo}-${ref.contentHash}`,
      fixture.availableAt,
      fixture.ingestedAt,
    ],
  );
  const raw = await client.query(
    `INSERT INTO ingestion.raw_object
       (fetch_run_id, source_id, source_document_id, content_hash, object_uri, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING raw_object_id`,
    [
      fetch.rows[0].fetch_run_id,
      fixture.sourceId,
      `CIK0000009999-r${fixture.revisionNo}`,
      ref.contentHash,
      ref.objectUri,
      fixture.availableAt,
    ],
  );
  const revision = await client.query(
    `INSERT INTO ingestion.source_revision
       (source_record_identity_id, revision_no, available_at, ingested_at, content_hash,
        raw_object_id, source_contract_revision_id, supersedes_source_revision_id, payload_metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'{}') RETURNING source_revision_id, content_hash`,
    [
      fixture.identityId,
      fixture.revisionNo,
      fixture.availableAt,
      fixture.ingestedAt,
      ref.contentHash,
      raw.rows[0].raw_object_id,
      fixture.contractId,
      fixture.supersedesId,
    ],
  );
  return {
    sourceRevisionId: Number(revision.rows[0].source_revision_id),
    contentHash: String(revision.rows[0].content_hash),
    objectUri: ref.objectUri,
  };
}

export async function countCanonicalRows(client, sourceId) {
  const result = await client.query(
    `SELECT count(DISTINCT fact.numeric_fact_id)::int AS facts,
            count(DISTINCT definition.metric_definition_id)::int AS definitions
       FROM ingestion.source source
       LEFT JOIN ingestion.source_record_identity identity ON identity.source_id=source.source_id
       LEFT JOIN ingestion.source_revision revision
         ON revision.source_record_identity_id=identity.source_record_identity_id
       LEFT JOIN world.numeric_fact fact ON fact.source_revision_id=revision.source_revision_id
       LEFT JOIN governance.metric_definition definition ON definition.source_id=source.source_id
      WHERE source.source_id=$1`,
    [sourceId],
  );
  return result.rows[0];
}

const INSERT_FACT_SQL = `INSERT INTO world.numeric_fact (
  fact_key, revision_no, entity_id, concept_namespace, concept_key, value, unit, currency,
  scale_power, period_start, period_end, instant_at, fiscal_year, fiscal_quarter,
  dimensions_json, restatement_group_key, original_cell_or_xbrl_locator,
  source_revision_id, available_at, known_at, supersedes_numeric_fact_id, metadata
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
RETURNING *`;

async function insertNumericFact(client, predecessor, changes) {
  const row = { ...predecessor, ...changes };
  const result = await client.query(INSERT_FACT_SQL, [
    row.fact_key,
    row.revision_no,
    row.entity_id,
    row.concept_namespace,
    row.concept_key,
    row.value,
    row.unit,
    row.currency,
    row.scale_power,
    row.period_start,
    row.period_end,
    row.instant_at,
    row.fiscal_year,
    row.fiscal_quarter,
    row.dimensions_json,
    row.restatement_group_key,
    row.original_cell_or_xbrl_locator,
    row.source_revision_id,
    row.available_at,
    row.known_at,
    row.supersedes_numeric_fact_id,
    row.metadata,
  ]);
  return result.rows[0];
}

export async function expectRevisionRejected(client, predecessor, changes, label) {
  await client.query('BEGIN');
  let rejected;
  try {
    await insertNumericFact(client, predecessor, changes);
    rejected = false;
  } catch {
    rejected = true;
  } finally {
    await client.query('ROLLBACK');
  }
  return assertEvidence(rejected, label);
}

export async function observeProviderLock(pool) {
  const first = await pool.connect();
  const second = await pool.connect();
  try {
    await first.query('BEGIN');
    await second.query('BEGIN');
    await first.query("SELECT pg_advisory_xact_lock(hashtextextended('sec-edgar:numeric-fact',0))");
    const blocked = await second.query(
      "SELECT pg_try_advisory_xact_lock(hashtextextended('sec-edgar:numeric-fact',0)) AS acquired",
    );
    assert.equal(blocked.rows[0].acquired, false);
    await first.query('COMMIT');
    const acquired = await second.query(
      "SELECT pg_try_advisory_xact_lock(hashtextextended('sec-edgar:numeric-fact',0)) AS acquired",
    );
    return assertEvidence(acquired.rows[0].acquired === true, 'provider advisory lock');
  } finally {
    await first.query('ROLLBACK').catch(() => undefined);
    await second.query('ROLLBACK').catch(() => undefined);
    first.release();
    second.release();
  }
}

function plusMillis(value, millis) {
  return new Date(new Date(value).getTime() + millis);
}

export async function runC2Rehearsal({ pool, databaseUrl, rawRoot, apiRoot }) {
  const client = await pool.connect();
  try {
    const current = await client.query('SELECT current_database() AS name');
    assert.match(current.rows[0].name, /^stock_insight_sec_rehearsal_/);
    const sourceResult = await client.query(
      `SELECT source.source_id, source.created_at, contract.source_contract_revision_id
         FROM ingestion.source source
         JOIN ingestion.source_contract_revision contract ON contract.source_id=source.source_id
        WHERE source.provider_key='sec-edgar' ORDER BY contract.revision_no DESC LIMIT 1`,
    );
    assert.equal(sourceResult.rowCount, 1);
    const source = sourceResult.rows[0];
    const sourceId = Number(source.source_id);
    await client.query(
      `INSERT INTO ingestion.source_contract
         (source_id, version, schedule_policy, required_fields, quality_policy, revision_policy)
       VALUES ($1,1,'{}','[]','{}','{"mode":"append_revision"}')
       ON CONFLICT (source_id,version) DO NOTHING`,
      [sourceId],
    );
    const entity = await client.query(
      `INSERT INTO core.entity (entity_type,canonical_name,country_code,metadata)
       VALUES ('Company','Disposable SEC Rehearsal Company','US','{}') RETURNING entity_id`,
    );
    await client.query(
      `INSERT INTO core.entity_identifier (entity_id,identifier_type,identifier_value)
       VALUES ($1,'CIK','0000009999')`,
      [entity.rows[0].entity_id],
    );
    const identity = await client.query(
      `INSERT INTO ingestion.source_record_identity
         (source_id,provider_record_key,first_observed_at)
       VALUES ($1,'CIK0000009999',$2) RETURNING source_record_identity_id`,
      [sourceId, source.created_at],
    );
    const base = new Date(source.created_at);
    const filed = nyCalendarDate(base);
    const common = {
      sourceId,
      contractId: Number(source.source_contract_revision_id),
      identityId: Number(identity.rows[0].source_record_identity_id),
      rawRoot,
    };
    const firstRaw = await appendRawRevision(client, {
      ...common,
      revisionNo: 1,
      availableAt: plusMillis(base, 1_000),
      ingestedAt: plusMillis(base, 2_000),
      supersedesId: null,
      payload: companyFacts({
        filed,
        accession: '0000009999-26-000001',
        revenue: 100,
        includeAssets: true,
      }),
    });
    const secondRaw = await appendRawRevision(client, {
      ...common,
      revisionNo: 2,
      availableAt: plusMillis(base, 3_000),
      ingestedAt: plusMillis(base, 4_000),
      supersedesId: firstRaw.sourceRevisionId,
      payload: companyFacts({ filed, accession: '0000009999-26-000002', revenue: 100 }),
    });
    const registeredHashes = await client.query(
      `SELECT revision.content_hash AS revision_hash, raw.content_hash AS raw_hash
         FROM ingestion.source_revision revision JOIN ingestion.raw_object raw USING(raw_object_id)
        WHERE revision.source_revision_id=ANY($1::bigint[])`,
      [[firstRaw.sourceRevisionId, secondRaw.sourceRevisionId]],
    );
    const sourceRevisionContentHashVerified = assertEvidence(
      registeredHashes.rowCount === 2 &&
        registeredHashes.rows.every((row) => row.revision_hash === row.raw_hash),
      'source revision/raw object content hashes',
    );

    const empty = await countCanonicalRows(client, sourceId);
    const dry = runSecCli(
      apiRoot,
      databaseUrl,
      rawRoot,
      '--since-year',
      String(Number(filed.slice(0, 4)) - 2),
    );
    const afterDry = await countCanonicalRows(client, sourceId);
    const dryRunReadOnly = assertEvidence(
      dry.mode === 'dry-run' &&
        dry.factsToWrite === 2 &&
        empty.facts === 0 &&
        afterDry.facts === 0 &&
        afterDry.definitions === 0,
      'dry-run is read only',
    );
    const rehearse = runSecCli(
      apiRoot,
      databaseUrl,
      rawRoot,
      '--since-year',
      String(Number(filed.slice(0, 4)) - 2),
      '--rehearse',
    );
    const afterRehearse = await countCanonicalRows(client, sourceId);
    const rehearsalRolledBack = assertEvidence(
      rehearse.mode === 'rehearse' &&
        rehearse.factsRolledBack === 2 &&
        rehearse.definitionsRolledBack === 2 &&
        afterRehearse.facts === 0 &&
        afterRehearse.definitions === 0,
      'rehearsal writes rolled back',
    );
    const applied = runSecCli(
      apiRoot,
      databaseUrl,
      rawRoot,
      '--since-year',
      String(Number(filed.slice(0, 4)) - 2),
      '--apply',
    );
    const afterApply = await countCanonicalRows(client, sourceId);
    const firstApplyCommitted = assertEvidence(
      applied.factsWritten === 2 && afterApply.facts === 2 && afterApply.definitions === 2,
      'first apply committed',
    );
    const multipleGroupsWritten = assertEvidence(
      applied.factsWritten === 2,
      'multiple groups written',
    );
    const unchangedComparativeSuppressed = assertEvidence(
      applied.skips.some((skip) => skip.reason.includes('unchanged comparative repetition')),
      'unchanged comparative suppressed',
    );
    const secondApply = runSecCli(
      apiRoot,
      databaseUrl,
      rawRoot,
      '--since-year',
      String(Number(filed.slice(0, 4)) - 2),
      '--apply',
    );
    const afterSecond = await countCanonicalRows(client, sourceId);
    const secondApplyIdempotent = assertEvidence(
      secondApply.factsWritten === 0 && afterSecond.facts === 2 && afterSecond.definitions === 2,
      'second apply is idempotent',
    );

    const thirdRaw = await appendRawRevision(client, {
      ...common,
      revisionNo: 3,
      availableAt: plusMillis(base, 5_000),
      ingestedAt: plusMillis(base, 6_000),
      supersedesId: secondRaw.sourceRevisionId,
      payload: companyFacts({ filed, accession: '0000009999-26-000003', revenue: 120 }),
    });
    const amendment = runSecCli(
      apiRoot,
      databaseUrl,
      rawRoot,
      '--since-year',
      String(Number(filed.slice(0, 4)) - 2),
      '--apply',
    );
    const changedAmendmentRevised = assertEvidence(
      amendment.factsWritten === 1 && amendment.restatements === 1,
      'changed amendment revised',
    );
    const facts = await client.query(
      `SELECT fact.*, revision.ingested_at AS source_ingested_at,
              revision.content_hash AS source_content_hash, definition.source_id AS definition_source_id
         FROM world.numeric_fact fact
         JOIN ingestion.source_revision revision USING(source_revision_id)
         JOIN governance.metric_definition definition
           ON definition.definition_key=fact.metadata->>'metricDefinitionKey' AND definition.revision_no=1
        WHERE fact.entity_id=$1 ORDER BY fact.concept_key,fact.revision_no`,
      [entity.rows[0].entity_id],
    );
    const revenue = facts.rows.filter((fact) => fact.concept_key === 'Revenue');
    assert.equal(revenue.length, 2);
    const exactNMinusOneSupersedes = assertEvidence(
      revenue[0].fact_key !== revenue[1].fact_key &&
        revenue[0].restatement_group_key === revenue[1].restatement_group_key &&
        String(revenue[1].supersedes_numeric_fact_id) === String(revenue[0].numeric_fact_id),
      'exact N-1 supersedes',
    );
    const locatorLineageVerified = assertEvidence(
      facts.rows.every(
        (fact) =>
          fact.metadata.sourceRevisionContentHash === fact.source_content_hash &&
          typeof fact.metadata.sourceAvailableAt === 'string' &&
          fact.original_cell_or_xbrl_locator.provider === 'sec-edgar',
      ),
      'locator lineage',
    );
    const pitAxesVerified = assertEvidence(
      facts.rows.every(
        (fact) =>
          new Date(fact.known_at).getTime() === new Date(fact.source_ingested_at).getTime() &&
          new Date(fact.available_at) <= new Date(fact.known_at),
      ),
      'PIT axes',
    );
    const definitionBindingVerified = assertEvidence(
      facts.rows.every(
        (fact) =>
          fact.metadata.metricDefinitionKey && Number(fact.definition_source_id) === sourceId,
      ),
      'definition binding',
    );

    const revenueOne = revenue[0];
    const revenueTwo = revenue[1];
    const wrongGroupRejected = await expectRevisionRejected(
      client,
      revenueOne,
      {
        fact_key: 'probe:wrong-group',
        revision_no: 2,
        restatement_group_key: 'probe:wrong-group',
        supersedes_numeric_fact_id: revenueOne.numeric_fact_id,
      },
      'wrong group',
    );
    const wrongRevisionRejected = await expectRevisionRejected(
      client,
      revenueOne,
      {
        fact_key: 'probe:wrong-revision',
        revision_no: 3,
        supersedes_numeric_fact_id: revenueOne.numeric_fact_id,
      },
      'wrong revision',
    );
    const claimStructureRejected = await expectRevisionRejected(
      client,
      revenueTwo,
      {
        fact_key: 'probe:claim',
        revision_no: 3,
        concept_key: 'ChangedRevenue',
        supersedes_numeric_fact_id: revenueTwo.numeric_fact_id,
      },
      'claim structure',
    );
    const fiscalDriftRejected = await expectRevisionRejected(
      client,
      revenueTwo,
      {
        fact_key: 'probe:fiscal',
        revision_no: 3,
        fiscal_year: 2099,
        supersedes_numeric_fact_id: revenueTwo.numeric_fact_id,
      },
      'fiscal drift',
    );
    const definitionDriftRejected = await expectRevisionRejected(
      client,
      revenueTwo,
      {
        fact_key: 'probe:definition',
        revision_no: 3,
        supersedes_numeric_fact_id: revenueTwo.numeric_fact_id,
        metadata: {
          ...revenueTwo.metadata,
          metricDefinitionKey: `${revenueTwo.metadata.metricDefinitionKey}:drift`,
        },
      },
      'definition drift',
    );

    const dartOne = await insertNumericFact(client, revenueTwo, {
      fact_key: 'dart:rehearsal:cell:a',
      revision_no: 1,
      restatement_group_key: 'dart:rehearsal:claim',
      value: '700',
      available_at: plusMillis(revenueTwo.available_at, 10_000),
      known_at: plusMillis(revenueTwo.known_at, 20_000),
      supersedes_numeric_fact_id: null,
    });
    const dartTwo = await insertNumericFact(client, dartOne, {
      fact_key: 'dart:rehearsal:cell:b',
      revision_no: 2,
      value: '701',
      available_at: plusMillis(dartOne.available_at, 10_000),
      known_at: plusMillis(dartOne.known_at, 20_000),
      supersedes_numeric_fact_id: dartOne.numeric_fact_id,
    });
    const dartDistinctFactKeyAccepted = assertEvidence(
      dartOne.fact_key !== dartTwo.fact_key &&
        String(dartTwo.supersedes_numeric_fact_id) === String(dartOne.numeric_fact_id),
      'DART-shaped distinct fact keys accepted',
    );
    const backwardKnownAtRejected = await expectRevisionRejected(
      client,
      dartTwo,
      {
        fact_key: 'probe:known',
        revision_no: 3,
        known_at: plusMillis(dartTwo.known_at, -1),
        supersedes_numeric_fact_id: dartTwo.numeric_fact_id,
      },
      'backward knownAt',
    );
    const backwardAvailableAtRejected = await expectRevisionRejected(
      client,
      dartTwo,
      {
        fact_key: 'probe:available',
        revision_no: 3,
        available_at: plusMillis(dartTwo.available_at, -1),
        supersedes_numeric_fact_id: dartTwo.numeric_fact_id,
      },
      'backward availableAt',
    );
    let appendOnlyRejected;
    try {
      await client.query('UPDATE world.numeric_fact SET value=value WHERE numeric_fact_id=$1', [
        dartOne.numeric_fact_id,
      ]);
      appendOnlyRejected = false;
    } catch {
      appendOnlyRejected = true;
    }
    const appendOnlyMutationRejected = assertEvidence(appendOnlyRejected, 'append-only mutation');
    const providerAdvisoryLockObserved = await observeProviderLock(pool);
    void thirdRaw;
    return {
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
  } finally {
    client.release();
  }
}
