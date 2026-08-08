import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildSecCanonicalPlan,
  executeSecNumericFactJob,
  loadSecRawRevisions,
  parseSecNumericFactArgs,
  type SecRawRevisionInput,
} from '../src/backfill/sec-numeric-fact-runner.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('SEC numeric-fact CLI', () => {
  it('defaults to bounded read-only dry-run selection', () => {
    assert.deepEqual(parseSecNumericFactArgs([]), {
      mode: 'dry-run',
      limit: 200,
      cik: null,
      sinceYear: 2020,
    });
  });

  it('parses exact normalized CIK, issuer limit, year, and rehearsal', () => {
    assert.deepEqual(
      parseSecNumericFactArgs([
        '--rehearse',
        '--limit',
        '3',
        '--cik',
        '320193',
        '--since-year',
        '2022',
      ]),
      { mode: 'rehearse', limit: 3, cik: '0000320193', sinceYear: 2022 },
    );
  });

  it('rejects conflicting modes and invalid or duplicate selection options', () => {
    assert.throws(() => parseSecNumericFactArgs(['--apply', '--rehearse']), /mutually exclusive/);
    assert.throws(() => parseSecNumericFactArgs(['--limit', '0']), /positive integer/);
    assert.throws(() => parseSecNumericFactArgs(['--cik', '0']), /valid CIK/);
    assert.throws(() => parseSecNumericFactArgs(['--cik', '1', '--cik', '2']), /once/);
    assert.throws(() => parseSecNumericFactArgs(['--since-year', '1700']), /since-year/);
  });

  it('rejects unknown arguments instead of silently changing selection', () => {
    assert.throws(() => parseSecNumericFactArgs(['--offset', '2']), /unknown argument/);
  });
});

function companyfacts(value = 100) {
  return {
    cik: 320193,
    entityName: 'Apple Inc.',
    facts: {
      'us-gaap': {
        Revenue: {
          units: {
            USD: [
              {
                start: '2024-10-01',
                end: '2024-12-31',
                val: value,
                accn: '0000320193-25-000008',
                fy: 2025,
                fp: 'Q1',
                form: '10-Q',
                filed: '2025-01-31',
              },
            ],
          },
        },
      },
    },
  };
}

function raw(overrides: Partial<SecRawRevisionInput> = {}): SecRawRevisionInput {
  return {
    sourceId: 7,
    sourceRevisionId: 10,
    ingestedAt: '2025-02-01T02:03:04.000Z',
    contentHash: 'a'.repeat(64),
    providerRecordKey: 'CIK0000320193',
    canonicalCik: '0000320193',
    entityId: 41,
    payload: companyfacts(),
    ...overrides,
  };
}

describe('SEC verified raw revision loading', () => {
  it('queries only sec-edgar identity/raw lineage and verifies the registered bytes', async () => {
    const queries: Array<{ sql: string; params?: readonly unknown[] }> = [];
    const db = {
      async query(sql: string, params?: readonly unknown[]) {
        queries.push({ sql, params });
        return {
          rows: [
            {
              source_id: 7,
              source_revision_id: 10,
              ingested_at: raw().ingestedAt,
              content_hash: 'a'.repeat(64),
              object_uri: 'file:///raw/apple.json',
              provider_record_key: 'CIK0000320193',
              canonical_ciks: ['0000320193'],
              company_entity_ids: ['41'],
            },
          ],
        };
      },
    };
    const reads: unknown[] = [];
    const loaded = await loadSecRawRevisions(db, { limit: 3, cik: '0000320193' }, async (ref) => {
      reads.push(ref);
      return Buffer.from(JSON.stringify(companyfacts()));
    });

    assert.deepEqual(reads, [{ objectUri: 'file:///raw/apple.json', contentHash: 'a'.repeat(64) }]);
    assert.equal(loaded.revisions.length, 1);
    assert.deepEqual(queries[0]!.params, ['sec-edgar', 3, '0000320193']);
    assert.match(queries[0]!.sql, /source_record_identity/);
    assert.match(queries[0]!.sql, /source_revision/);
    assert.doesNotMatch(queries[0]!.sql, /market\.financial_fact/);
  });

  it('fails closed and counts tamper, provider-key mismatch, missing and ambiguous Company CIK', async () => {
    const rows = [
      {
        source_id: 7,
        source_revision_id: 1,
        ingested_at: raw().ingestedAt,
        content_hash: 'a'.repeat(64),
        object_uri: 'file:///tampered',
        provider_record_key: 'CIK0000320193',
        canonical_ciks: ['0000320193'],
        company_entity_ids: ['41'],
      },
      {
        source_id: 7,
        source_revision_id: 2,
        ingested_at: raw().ingestedAt,
        content_hash: 'b'.repeat(64),
        object_uri: 'file:///bad-key',
        provider_record_key: 'CIK0000789019',
        canonical_ciks: ['0000320193'],
        company_entity_ids: ['41'],
      },
      {
        source_id: 7,
        source_revision_id: 3,
        ingested_at: raw().ingestedAt,
        content_hash: 'c'.repeat(64),
        object_uri: 'file:///missing',
        provider_record_key: 'CIK0000320193',
        canonical_ciks: [],
        company_entity_ids: [],
      },
      {
        source_id: 7,
        source_revision_id: 4,
        ingested_at: raw().ingestedAt,
        content_hash: 'd'.repeat(64),
        object_uri: 'file:///ambiguous',
        provider_record_key: 'CIK0000320193',
        canonical_ciks: ['0000320193'],
        company_entity_ids: ['41', '42'],
      },
    ];
    const db = {
      async query() {
        return { rows };
      },
    };
    const loaded = await loadSecRawRevisions(db, { limit: 5, cik: null }, async ({ objectUri }) => {
      if (objectUri.endsWith('tampered')) throw new Error('raw object hash mismatch');
      return Buffer.from(JSON.stringify(companyfacts()));
    });
    assert.equal(loaded.revisions.length, 0);
    assert.ok(loaded.skips.some((skip) => /hash mismatch/.test(skip.reason)));
    assert.ok(loaded.skips.some((skip) => /provider record CIK/.test(skip.reason)));
    assert.ok(loaded.skips.some((skip) => /missing Company CIK/.test(skip.reason)));
    assert.ok(loaded.skips.some((skip) => /ambiguous Company CIK/.test(skip.reason)));
  });
});

describe('SEC canonical plan and execution', () => {
  it('has an order-stable digest and keeps the earliest revision that contains an exact entry', () => {
    const later = raw({
      sourceRevisionId: 9,
      ingestedAt: '2025-02-02T00:00:00.000Z',
      contentHash: 'b'.repeat(64),
    });
    const first = raw();
    const forward = buildSecCanonicalPlan([later, first], { limit: 2, cik: null, sinceYear: 2020 });
    const backward = buildSecCanonicalPlan([first, later], {
      limit: 2,
      cik: null,
      sinceYear: 2020,
    });
    assert.equal(forward.digest, backward.digest);
    assert.equal(forward.facts.length, 1);
    assert.equal(forward.facts[0]?.sourceRevisionId, 10);
    assert.equal(forward.facts[0]?.knownAt, first.ingestedAt);
  });

  it('dry-run performs no transaction or insert SQL and keeps parity diagnostic', async () => {
    const queries: string[] = [];
    const db = {
      async query(sql: string) {
        queries.push(sql);
        if (sql.includes('source_record_identity'))
          return {
            rows: [
              {
                source_id: 7,
                source_revision_id: 10,
                ingested_at: raw().ingestedAt,
                content_hash: 'a'.repeat(64),
                object_uri: 'file:///raw',
                provider_record_key: 'CIK0000320193',
                canonical_ciks: ['0000320193'],
                company_entity_ids: ['41'],
              },
            ],
          };
        return { rows: [] };
      },
    };
    const summary = await executeSecNumericFactJob({
      client: db,
      args: parseSecNumericFactArgs([]),
      readRawObject: async () => Buffer.from(JSON.stringify(companyfacts())),
    });
    assert.equal(summary.mode, 'dry-run');
    assert.equal(summary.factsPlanned, 1);
    assert.equal(summary.factsToWrite, 1);
    assert.equal(
      queries.some((sql) => /BEGIN|INSERT|COMMIT|ROLLBACK/.test(sql)),
      false,
    );
    assert.equal(summary.parity.comparable, 0);
  });

  it('apply and rehearsal acquire the provider lock before exact writes and terminate correctly', async () => {
    for (const mode of ['apply', 'rehearse'] as const) {
      const queries: Array<{ sql: string; params?: readonly unknown[] }> = [];
      const db = {
        async query(sql: string, params?: readonly unknown[]) {
          queries.push({ sql, params });
          if (sql.includes('source_record_identity'))
            return {
              rows: [
                {
                  source_id: 7,
                  source_revision_id: 10,
                  ingested_at: raw().ingestedAt,
                  content_hash: 'a'.repeat(64),
                  object_uri: 'file:///raw',
                  provider_record_key: 'CIK0000320193',
                  canonical_ciks: ['0000320193'],
                  company_entity_ids: ['41'],
                },
              ],
            };
          if (sql.includes('SELECT definition_key')) return { rows: [] };
          if (sql.includes('INSERT INTO governance.metric_definition'))
            return {
              rows: [
                {
                  definition_key: params?.[0],
                  revision_no: 1,
                  concept_namespace: params?.[2],
                  concept_key: params?.[3],
                  canonical_concept: params?.[4],
                  display_name: params?.[5],
                  definition_scope: params?.[6],
                  issuer_entity_id: params?.[7],
                  source_id: params?.[8],
                  period_basis: params?.[9],
                  accounting_basis: params?.[10],
                  unit: params?.[11],
                  currency: params?.[12],
                  comparability_group_key: params?.[13],
                  comparability_group_version: params?.[14],
                  effective_from: new Date(String(params?.[15])),
                },
              ],
            };
          if (sql.includes('INSERT INTO world.numeric_fact'))
            return { rows: [{ numeric_fact_id: '501' }] };
          return { rows: [] };
        },
      };
      const summary = await executeSecNumericFactJob({
        client: db,
        args: parseSecNumericFactArgs([mode === 'apply' ? '--apply' : '--rehearse']),
        readRawObject: async () => Buffer.from(JSON.stringify(companyfacts())),
      });
      const begin = queries.findIndex((query) => query.sql === 'BEGIN');
      const lock = queries.findIndex((query) => query.sql.includes('pg_advisory_xact_lock'));
      const definitionInsert = queries.findIndex((query) =>
        query.sql.includes('INSERT INTO governance.metric_definition'),
      );
      const factInsert = queries.findIndex((query) =>
        query.sql.includes('INSERT INTO world.numeric_fact'),
      );
      assert.ok(
        begin >= 0 && lock > begin && definitionInsert > lock && factInsert > definitionInsert,
      );
      assert.equal(queries.at(-1)!.sql, mode === 'apply' ? 'COMMIT' : 'ROLLBACK');
      assert.equal(mode === 'apply' ? summary.factsWritten : summary.factsRolledBack, 1);
    }
  });

  it('an identical second plan produces zero writes from scoped existing state', async () => {
    const input = raw();
    const planned = buildSecCanonicalPlan([input], {
      limit: 1,
      cik: input.canonicalCik,
      sinceYear: 2020,
    }).facts[0]!;
    const existingRow = {
      fact_key: planned.factKey,
      restatement_group_key: planned.restatementGroupKey,
      revision_no: 1,
      numeric_fact_id: '600',
      entity_id: String(planned.entityId),
      concept_namespace: planned.conceptNamespace,
      concept_key: planned.conceptKey,
      value: String(planned.value),
      unit: planned.unit,
      currency: planned.currency,
      scale_power: planned.scalePower,
      period_start: planned.periodStart,
      period_end: planned.periodEnd,
      instant_at: planned.instantAt,
      fiscal_year: planned.fiscalYear,
      fiscal_quarter: planned.fiscalQuarter,
      dimensions_json: planned.dimensionsJson,
      source_revision_id: String(planned.sourceRevisionId),
      available_at: planned.availableAt,
      known_at: planned.knownAt,
      original_cell_or_xbrl_locator: planned.locator,
      metadata: { ...planned.metadata, metricDefinitionKey: planned.definitionKey },
    };
    const db = {
      async query(sql: string) {
        if (sql.includes('source_record_identity'))
          return {
            rows: [
              {
                source_id: 7,
                source_revision_id: 10,
                ingested_at: input.ingestedAt,
                content_hash: input.contentHash,
                object_uri: 'file:///raw',
                provider_record_key: input.providerRecordKey,
                canonical_ciks: [input.canonicalCik],
                company_entity_ids: [String(input.entityId)],
              },
            ],
          };
        if (sql.includes('FROM world.numeric_fact')) return { rows: [existingRow] };
        return { rows: [] };
      },
    };
    const summary = await executeSecNumericFactJob({
      client: db,
      args: parseSecNumericFactArgs(['--limit', '1', '--cik', input.canonicalCik]),
      readRawObject: async () => Buffer.from(JSON.stringify(input.payload)),
    });
    assert.equal(summary.factsPlanned, 1);
    assert.equal(summary.factsToWrite, 0);
    assert.ok(summary.skips.some((skip) => skip.reason === 'already recorded'));
  });
});

describe('SEC package and recurring-job wiring', () => {
  it('provides dry-run/rehearse/apply scripts and runs canonicalization immediately after collection', async () => {
    const packageJson = JSON.parse(await readFile(`${ROOT}/apps/api/package.json`, 'utf8')) as {
      scripts: Record<string, string>;
    };
    assert.equal(
      packageJson.scripts['backfill:sec-numeric-fact:dry-run'],
      'node src/backfill/run-sec-numeric-fact.ts',
    );
    assert.equal(
      packageJson.scripts['backfill:sec-numeric-fact:rehearse'],
      'node src/backfill/run-sec-numeric-fact.ts --rehearse',
    );
    assert.equal(
      packageJson.scripts['backfill:sec-numeric-fact:apply'],
      'node src/backfill/run-sec-numeric-fact.ts --apply',
    );

    const pipeline = await readFile(`${ROOT}/apps/api/scripts/run_market_enrichment.sh`, 'utf8');
    const collector = pipeline.indexOf(
      'apps/api/src/ingest/run-sec-financial-facts.ts --since-year 2020 --limit 200 --apply',
    );
    const canonical = pipeline.indexOf(
      'apps/api/src/backfill/run-sec-numeric-fact.ts --since-year 2020 --limit 200 --apply',
    );
    assert.ok(collector >= 0);
    assert.equal(canonical > collector, true);
    assert.equal(pipeline.slice(collector, canonical).includes('run-finra-short-volume'), false);

    const cli = await readFile(`${ROOT}/apps/api/src/backfill/run-sec-numeric-fact.ts`, 'utf8');
    assert.doesNotMatch(cli, /client\.query\('ROLLBACK'\)/);
  });
});
