import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

const databaseUrl = process.env.STOCK_INSIGHT_IDENTITY_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_IDENTITY_TEST_DB_URL is required';

describe('B3 security/issuer identity contract', () => {
  it('maps every Stock to exactly one Company and exposes one ISSUED_BY edge', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const result = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM core.entity WHERE entity_type='Stock') AS stocks,
          (SELECT count(*)::int FROM core.security_issuer_identity) AS mappings,
          (SELECT count(*)::int FROM core.entity stock
           WHERE stock.entity_type='Stock' AND NOT EXISTS (
             SELECT 1 FROM core.security_issuer_identity identity
             WHERE identity.security_entity_id=stock.entity_id
           )) AS unmapped,
          (SELECT count(*)::int FROM core.security_issuer_identity identity
           JOIN core.entity security ON security.entity_id=identity.security_entity_id
           JOIN core.entity issuer ON issuer.entity_id=identity.issuer_entity_id
           WHERE security.entity_type<>'Stock' OR issuer.entity_type<>'Company') AS bad_types,
          (SELECT count(*)::int FROM core.security_issuer_identity identity
           WHERE NOT EXISTS (
             SELECT 1 FROM knowledge.relation relation
             WHERE relation.subject_entity_id=identity.security_entity_id
               AND relation.object_entity_id=identity.issuer_entity_id
               AND relation.predicate='ISSUED_BY'
               AND relation.status='active'
           )) AS missing_edges
      `);
      assert.equal(result.rows[0]!.stocks, 254);
      assert.equal(result.rows[0]!.mappings, result.rows[0]!.stocks);
      assert.equal(result.rows[0]!.unmapped, 0);
      assert.equal(result.rows[0]!.bad_types, 0);
      assert.equal(result.rows[0]!.missing_edges, 0);
    } finally {
      await pool.end();
    }
  });

  it('identity is entity-ID based and immutable (ticker text is not part of the mapping key)', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      const columns = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='core' AND table_name='security_issuer_identity'`);
      assert.equal(columns.rows.some((row) => row.column_name.includes('ticker')), false);
      await client.query('BEGIN');
      await assert.rejects(
        () => client.query(`UPDATE core.security_issuer_identity SET mapping_basis='ticker_mutation' WHERE security_issuer_identity_id=(SELECT min(security_issuer_identity_id) FROM core.security_issuer_identity)`),
        /append-only/,
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
      await pool.end();
    }
  });
});
