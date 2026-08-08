import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ensureMetricDefinitions,
  withNumericFactWriteTransaction,
} from '../src/backfill/numeric-fact-store.ts';
import { type MetricDefinitionRow } from '../src/backfill/numeric-fact-plan.ts';

function db(handler: (sql: string) => unknown = () => ({ rows: [] })) {
  const queries: Array<{ sql: string; params?: readonly unknown[] }> = [];
  return {
    queries,
    async query(sql: string, params?: readonly unknown[]) {
      queries.push({ sql, params });
      return handler(sql) as { rows: never[] };
    },
  };
}

function definition(): MetricDefinitionRow {
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
  };
}

describe('numeric-fact store transaction and definitions', () => {
  it('rolls back callback failures after acquiring the lock', async () => {
    const client = db();
    await assert.rejects(
      () =>
        withNumericFactWriteTransaction(
          client,
          { mode: 'apply', advisoryLockKey: 'sec' },
          async () => {
            throw new Error('write failed');
          },
        ),
      /write failed/,
    );
    assert.match(client.queries[1]!.sql, /pg_advisory_xact_lock/);
    assert.equal(client.queries.at(-1)!.sql, 'ROLLBACK');
    assert.equal(
      client.queries.some((query) => query.sql === 'COMMIT'),
      false,
    );
  });

  it('persists source_id and verifies a newly inserted regulator definition', async () => {
    const planned = definition();
    const client = db((sql) => {
      if (sql.includes('SELECT definition_key')) return { rows: [] };
      if (sql.includes('INSERT INTO governance.metric_definition'))
        return {
          rows: [
            {
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
            },
          ],
        };
      return { rows: [] };
    });
    assert.equal(await ensureMetricDefinitions(client, [planned], { createdBy: 'test' }), 1);
    const insert = client.queries.find((query) =>
      query.sql.includes('INSERT INTO governance.metric_definition'),
    )!;
    assert.match(insert.sql, /source_id/);
    assert.equal(insert.params?.[8], 7);
  });
});
