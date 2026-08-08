import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ensureMetricDefinitions,
  loadExistingNumericFactState,
  withNumericFactWriteTransaction,
  writeNumericFacts,
} from '../src/backfill/numeric-fact-store.ts';
import {
  numericFactSemanticFingerprint,
  type MetricDefinitionRow,
  type NumericFactRow,
} from '../src/backfill/numeric-fact-plan.ts';

type Query = { sql: string; params?: readonly unknown[] };

function client(
  handler: (sql: string, params?: readonly unknown[]) => unknown = () => ({ rows: [] }),
) {
  const queries: Query[] = [];
  return {
    queries,
    async query(sql: string, params?: readonly unknown[]) {
      queries.push({ sql, params });
      return handler(sql, params) as { rows: never[]; rowCount?: number };
    },
  };
}

function fact(overrides: Partial<NumericFactRow> = {}): NumericFactRow {
  return {
    factKey: 'sec:0000320193:accn:a',
    restatementGroupKey: 'sec:41:us-gaap:Revenue:g',
    entityId: 41,
    conceptNamespace: 'us-gaap',
    conceptKey: 'Revenue',
    value: 100,
    unit: 'currency',
    currency: 'USD',
    scalePower: 0,
    periodStart: '2024-10-01',
    periodEnd: '2024-12-31',
    instantAt: null,
    fiscalYear: null,
    fiscalQuarter: null,
    dimensionsJson: {},
    locator: { accession: 'accn' },
    sourceRevisionId: 10,
    availableAt: '2025-01-31T23:59:59.999Z',
    knownAt: '2025-02-01T00:00:00.000Z',
    metadata: {},
    definitionKey: 'sec.us-gaap.revenue.duration_quarter.usd',
    suppressUnchangedRevision: true,
    ...overrides,
  };
}

function definition(overrides: Partial<MetricDefinitionRow> = {}): MetricDefinitionRow {
  return {
    definitionKey: 'sec.us-gaap.revenue.duration_quarter.usd',
    conceptNamespace: 'us-gaap',
    conceptKey: 'Revenue',
    canonicalConcept: 'Revenue',
    displayName: 'Revenue',
    definitionScope: 'regulator',
    issuerEntityId: null,
    sourceId: 7,
    periodBasis: 'duration_quarter',
    accountingBasis: 'gaap',
    unit: 'currency',
    currency: 'USD',
    comparabilityGroupKey: 'sec-regulator:us-gaap:Revenue:duration_quarter:currency:USD',
    comparabilityGroupVersion: 1,
    effectiveFrom: '2025-01-31T23:59:59.999Z',
    ...overrides,
  };
}

describe('provider-neutral numeric-fact store', () => {
  it('locks before callback work and commits apply but rolls back rehearsal', async () => {
    for (const mode of ['apply', 'rehearse'] as const) {
      const db = client();
      await withNumericFactWriteTransaction(
        db,
        { mode, advisoryLockKey: 'sec-edgar:numeric-fact' },
        async () => {
          await db.query('SELECT work');
        },
      );
      assert.match(db.queries[0]!.sql, /^BEGIN/);
      assert.match(db.queries[1]!.sql, /pg_advisory_xact_lock/);
      assert.equal(db.queries[2]!.sql, 'SELECT work');
      assert.equal(db.queries.at(-1)!.sql, mode === 'apply' ? 'COMMIT' : 'ROLLBACK');
    }
  });

  it('scopes existing state and reconstructs the latest semantic fingerprint', async () => {
    const rowFact = fact();
    const db = client(() => ({
      rows: [
        {
          fact_key: rowFact.factKey,
          restatement_group_key: rowFact.restatementGroupKey,
          revision_no: 1,
          numeric_fact_id: '77',
          entity_id: '41',
          concept_namespace: 'us-gaap',
          concept_key: 'Revenue',
          value: '100',
          unit: 'currency',
          currency: 'USD',
          scale_power: 0,
          period_start: '2024-10-01',
          period_end: '2024-12-31',
          instant_at: null,
          fiscal_year: null,
          fiscal_quarter: null,
          dimensions_json: {},
          source_revision_id: '10',
          available_at: rowFact.availableAt,
          known_at: rowFact.knownAt,
          original_cell_or_xbrl_locator: rowFact.locator,
          metadata: { metricDefinitionKey: rowFact.definitionKey },
        },
      ],
    }));
    const state = await loadExistingNumericFactState(db, {
      entityIds: [41],
      factKeyPrefix: 'sec:%',
      sourceProvider: 'sec-edgar',
    });

    assert.match(db.queries[0]!.sql, /entity_id = ANY\(\$1::bigint\[\]\)/);
    assert.match(db.queries[0]!.sql, /fact_key LIKE \$2/);
    assert.match(db.queries[0]!.sql, /FROM world\.numeric_fact AS fact/);
    for (const field of ['revision_no', 'source_revision_id', 'available_at', 'metadata']) {
      assert.match(db.queries[0]!.sql, new RegExp(`fact\\.${field} AS ${field}`));
    }
    assert.match(db.queries[0]!.sql, /WHERE fact\.entity_id = ANY/);
    assert.match(db.queries[0]!.sql, /fact\.fact_key LIKE \$2/);
    assert.match(
      db.queries[0]!.sql,
      /ORDER BY fact\.restatement_group_key, fact\.revision_no, fact\.numeric_fact_id/,
    );
    assert.deepEqual(db.queries[0]!.params, [[41], 'sec:%', 'sec-edgar']);
    assert.equal(
      state.groups.get(rowFact.restatementGroupKey)?.latestSemanticFingerprint,
      numericFactSemanticFingerprint(rowFact),
    );
  });

  it('fails closed when an existing definition key has drifted', async () => {
    const db = client((sql) =>
      sql.includes('SELECT')
        ? {
            rows: [
              {
                definition_key: definition().definitionKey,
                revision_no: 1,
                concept_namespace: 'us-gaap',
                concept_key: 'Wrong',
                definition_scope: 'regulator',
                issuer_entity_id: null,
                source_id: 7,
                period_basis: 'duration_quarter',
                accounting_basis: 'gaap',
                unit: 'currency',
                currency: 'USD',
                comparability_group_key: definition().comparabilityGroupKey,
                comparability_group_version: 1,
              },
            ],
          }
        : { rows: [] },
    );
    await assert.rejects(
      () => ensureMetricDefinitions(db, [definition()], { createdBy: 'test' }),
      /definition drift/,
    );
    assert.equal(
      db.queries.some((query) => query.sql.includes('INSERT INTO governance.metric_definition')),
      false,
    );
  });

  it('verifies definition labels, canonical concept, and normalized effective timestamp', async () => {
    const planned = definition();
    const stored = {
      definition_key: planned.definitionKey,
      revision_no: 1,
      concept_namespace: planned.conceptNamespace,
      concept_key: planned.conceptKey,
      canonical_concept: planned.canonicalConcept,
      display_name: planned.displayName,
      definition_scope: planned.definitionScope,
      issuer_entity_id: null,
      source_id: planned.sourceId,
      period_basis: planned.periodBasis,
      accounting_basis: planned.accountingBasis,
      unit: planned.unit,
      currency: planned.currency,
      comparability_group_key: planned.comparabilityGroupKey,
      comparability_group_version: planned.comparabilityGroupVersion,
      effective_from: new Date(planned.effectiveFrom),
      numerator_description: null,
      denominator_description: null,
      inclusions: [],
      exclusions: [],
      scale_power: 0,
      supersedes_metric_definition_id: null,
      definition_state: 'active',
      effective_to: null,
      notes: null,
    };
    const matching = client(() => ({ rows: [stored] }));
    assert.equal(await ensureMetricDefinitions(matching, [planned], { createdBy: 'test' }), 0);

    for (const [field, value] of [
      ['canonical_concept', 'WrongCanonical'],
      ['display_name', 'Wrong display'],
      ['effective_from', new Date('2025-02-01T00:00:00.000Z')],
      ['notes', 'invented semantic note'],
    ] as const) {
      const drifted = client(() => ({ rows: [{ ...stored, [field]: value }] }));
      await assert.rejects(
        () => ensureMetricDefinitions(drifted, [planned], { createdBy: 'test' }),
        new RegExp(field),
      );
    }
  });

  it('resolves a same-batch exact predecessor and persists the definition key in metadata', async () => {
    let nextId = 101;
    const db = client((sql, params) =>
      sql.includes('INSERT INTO world.numeric_fact')
        ? { rows: [{ fact_key: params?.[0], numeric_fact_id: String(nextId++) }] }
        : { rows: [] },
    );
    const first = fact();
    const second = fact({ factKey: 'sec:0000320193:amend:b', value: 120, sourceRevisionId: 11 });
    const written = await writeNumericFacts(
      db,
      [
        {
          fact: first,
          revisionNo: 1,
          supersedesFactKey: null,
          supersedesNumericFactId: null,
        },
        {
          fact: second,
          revisionNo: 2,
          supersedesFactKey: first.factKey,
          supersedesNumericFactId: null,
        },
      ],
      new Map(),
    );
    assert.equal(written, 2);
    const inserts = db.queries.filter((query) =>
      query.sql.includes('INSERT INTO world.numeric_fact'),
    );
    assert.equal(inserts[1]!.params?.[20], 101);
    assert.equal(
      JSON.parse(String(inserts[1]!.params?.[21])).metricDefinitionKey,
      second.definitionKey,
    );
  });

  it('uses an exact existing predecessor id and refuses a missing definition key', async () => {
    const db = client((sql, params) =>
      sql.includes('INSERT INTO world.numeric_fact')
        ? { rows: [{ fact_key: params?.[0], numeric_fact_id: '90' }] }
        : { rows: [] },
    );
    const amended = fact({ factKey: 'sec:amended', value: 120 });
    await writeNumericFacts(
      db,
      [
        {
          fact: amended,
          revisionNo: 2,
          supersedesFactKey: 'sec:original',
          supersedesNumericFactId: 77,
        },
      ],
      new Map([
        [
          amended.restatementGroupKey,
          {
            maxRevision: 1,
            latestFactId: 77,
            latestFactKey: 'sec:original',
            factIdsByKey: new Map([['sec:original', 77]]),
          },
        ],
      ]),
    );
    const insert = db.queries.find((query) =>
      query.sql.includes('INSERT INTO world.numeric_fact'),
    )!;
    assert.equal(insert.params?.[20], 77);

    const missing = fact({ factKey: 'sec:missing-definition', definitionKey: '' });
    const before = db.queries.length;
    await assert.rejects(
      () =>
        writeNumericFacts(
          db,
          [
            {
              fact: missing,
              revisionNo: 1,
              supersedesFactKey: null,
              supersedesNumericFactId: null,
            },
          ],
          new Map(),
        ),
      /definition key/,
    );
    assert.equal(db.queries.length, before);
  });

  it('fails closed when an explicit predecessor key cannot be resolved', async () => {
    const db = client((sql) =>
      sql.includes('INSERT INTO world.numeric_fact')
        ? { rows: [{ numeric_fact_id: '91' }] }
        : { rows: [] },
    );
    const amended = fact({ factKey: 'sec:amended', value: 120 });
    await assert.rejects(
      () =>
        writeNumericFacts(
          db,
          [
            {
              fact: amended,
              revisionNo: 2,
              supersedesFactKey: 'sec:missing-exact-predecessor',
              supersedesNumericFactId: null,
            },
          ],
          new Map([
            [
              amended.restatementGroupKey,
              {
                maxRevision: 1,
                latestFactId: 77,
                latestFactKey: 'sec:other-predecessor',
                factIdsByKey: new Map([['sec:other-predecessor', 77]]),
              },
            ],
          ]),
        ),
      /no exact predecessor/,
    );
    assert.equal(
      db.queries.some((query) => query.sql.includes('INSERT INTO world.numeric_fact')),
      false,
    );
  });

  it('rejects an explicit predecessor id that disagrees with its exact fact key', async () => {
    const db = client((sql) =>
      sql.includes('INSERT INTO world.numeric_fact')
        ? { rows: [{ fact_key: 'sec:amended', numeric_fact_id: '91' }] }
        : { rows: [] },
    );
    const amended = fact({ factKey: 'sec:amended', value: 120 });
    await assert.rejects(
      () =>
        writeNumericFacts(
          db,
          [
            {
              fact: amended,
              revisionNo: 2,
              supersedesFactKey: 'sec:original',
              supersedesNumericFactId: 88,
            },
          ],
          new Map([
            [
              amended.restatementGroupKey,
              {
                maxRevision: 1,
                latestFactId: 77,
                latestFactKey: 'sec:original',
                factIdsByKey: new Map([['sec:original', 77]]),
              },
            ],
          ]),
        ),
      /predecessor id 88.*exact key.*77/,
    );
    assert.equal(
      db.queries.some((query) => query.sql.includes('INSERT INTO world.numeric_fact')),
      false,
    );
  });

  it('correlates reordered RETURNING rows by fact_key for exact same-batch predecessors', async () => {
    const firstA = fact({ factKey: 'sec:a:1', restatementGroupKey: 'sec:group:a' });
    const firstB = fact({ factKey: 'sec:b:1', restatementGroupKey: 'sec:group:b' });
    const secondA = fact({ factKey: 'sec:a:2', restatementGroupKey: 'sec:group:a', value: 101 });
    const secondB = fact({ factKey: 'sec:b:2', restatementGroupKey: 'sec:group:b', value: 102 });
    let insertNo = 0;
    const db = client((sql) => {
      if (!sql.includes('INSERT INTO world.numeric_fact')) return { rows: [] };
      insertNo += 1;
      return insertNo === 1
        ? {
            rows: [
              { fact_key: firstB.factKey, numeric_fact_id: '202' },
              { fact_key: firstA.factKey, numeric_fact_id: '101' },
            ],
          }
        : {
            rows: [
              { fact_key: secondA.factKey, numeric_fact_id: '303' },
              { fact_key: secondB.factKey, numeric_fact_id: '404' },
            ],
          };
    });
    await writeNumericFacts(
      db,
      [
        { fact: firstA, revisionNo: 1, supersedesFactKey: null, supersedesNumericFactId: null },
        { fact: firstB, revisionNo: 1, supersedesFactKey: null, supersedesNumericFactId: null },
        {
          fact: secondA,
          revisionNo: 2,
          supersedesFactKey: firstA.factKey,
          supersedesNumericFactId: null,
        },
        {
          fact: secondB,
          revisionNo: 2,
          supersedesFactKey: firstB.factKey,
          supersedesNumericFactId: null,
        },
      ],
      new Map(),
    );

    const inserts = db.queries.filter((query) =>
      query.sql.includes('INSERT INTO world.numeric_fact'),
    );
    assert.match(inserts[0]!.sql, /RETURNING fact_key,\s*numeric_fact_id/);
    assert.equal(inserts[1]!.params?.[20], 101);
    assert.equal(inserts[1]!.params?.[42], 202);
  });

  it('rejects missing, duplicate, and unexpected RETURNING fact keys', async () => {
    const first = fact({ factKey: 'sec:return:a', restatementGroupKey: 'sec:return:group:a' });
    const second = fact({ factKey: 'sec:return:b', restatementGroupKey: 'sec:return:group:b' });
    const cases = [
      { name: 'missing', rows: [{ numeric_fact_id: '1' }], pattern: /missing returned fact_key/ },
      {
        name: 'duplicate',
        rows: [
          { fact_key: first.factKey, numeric_fact_id: '1' },
          { fact_key: first.factKey, numeric_fact_id: '2' },
        ],
        pattern: /duplicate returned fact key/,
      },
      {
        name: 'unexpected',
        rows: [
          { fact_key: first.factKey, numeric_fact_id: '1' },
          { fact_key: 'sec:return:unexpected', numeric_fact_id: '2' },
        ],
        pattern: /unexpected returned fact key/,
      },
    ];
    for (const testCase of cases) {
      const db = client((sql) =>
        sql.includes('INSERT INTO world.numeric_fact') ? { rows: testCase.rows } : { rows: [] },
      );
      await assert.rejects(
        () =>
          writeNumericFacts(
            db,
            [
              {
                fact: first,
                revisionNo: 1,
                supersedesFactKey: null,
                supersedesNumericFactId: null,
              },
              ...(testCase.name === 'missing'
                ? []
                : [
                    {
                      fact: second,
                      revisionNo: 1,
                      supersedesFactKey: null,
                      supersedesNumericFactId: null,
                    },
                  ]),
            ],
            new Map(),
          ),
        testCase.pattern,
      );
    }
  });
});
