import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

import { identityTaxonomyMigrationSql } from '../../../packages/db-schema/src/migrations/021_identity_taxonomy.ts';

const databaseUrl = process.env.STOCK_INSIGHT_IDENTITY_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_IDENTITY_TEST_DB_URL is required';

describe('B3 SIC/KSIC taxonomy contract', () => {
  it('has one honest taxonomy membership per Stock: 119 source-reported, remainder explicit UNCLASSIFIED', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const result = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM core.entity WHERE entity_type='Stock') AS stocks,
          (SELECT count(*)::int FROM core.entity_taxonomy_membership) AS memberships,
          (SELECT count(*)::int FROM core.entity_taxonomy_membership WHERE classification_status='source_reported') AS source_reported,
          (SELECT count(*)::int FROM core.entity_taxonomy_membership WHERE classification_status='unclassified') AS unclassified,
          (SELECT count(*)::int FROM core.entity_taxonomy_membership membership
           JOIN core.taxonomy_node node ON node.taxonomy_node_id=membership.taxonomy_node_id
           WHERE membership.classification_status='unclassified' AND node.code<>'UNCLASSIFIED') AS false_unclassified,
          (SELECT count(*)::int FROM core.entity_taxonomy_membership membership
           JOIN core.taxonomy_node node ON node.taxonomy_node_id=membership.taxonomy_node_id
           JOIN core.taxonomy_release release ON release.taxonomy_release_id=node.taxonomy_release_id
           WHERE membership.classification_status='source_reported'
             AND NOT EXISTS (
               SELECT 1 FROM public.entities legacy
               JOIN core.entity_identifier identifier ON identifier.identifier_value=legacy.entity_key AND identifier.identifier_type='INTERNAL_KEY'
               WHERE identifier.entity_id=membership.entity_id
                 AND legacy.industry_code_system=release.taxonomy_system
                 AND legacy.industry_code=node.code
             )) AS fabricated_codes
      `);
      assert.equal(result.rows[0]!.memberships, result.rows[0]!.stocks);
      assert.equal(result.rows[0]!.source_reported, 119);
      assert.equal(result.rows[0]!.unclassified, result.rows[0]!.stocks - 119);
      assert.equal(result.rows[0]!.false_unclassified, 0);
      assert.equal(result.rows[0]!.fabricated_codes, 0);
    } finally {
      await pool.end();
    }
  });

  it('keeps imported releases provisional and crosswalk empty until evidence is approved', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const result = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM core.taxonomy_release WHERE policy_status='provisional_review_required') AS provisional,
          (SELECT count(*)::int FROM core.taxonomy_release) AS releases,
          (SELECT count(*)::int FROM core.taxonomy_crosswalk) AS crosswalks
      `);
      assert.equal(result.rows[0]!.releases, 2);
      assert.equal(result.rows[0]!.provisional, 2);
      assert.equal(result.rows[0]!.crosswalks, 0);
    } finally {
      await pool.end();
    }
  });

  it('reapply stays safe when the legacy source changes after the frozen baseline', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query(`
        SELECT membership.entity_id,legacy.entity_key,release.taxonomy_system,
               (SELECT code FROM core.taxonomy_node candidate
                WHERE candidate.taxonomy_release_id=release.taxonomy_release_id
                  AND candidate.node_status='source_reported' LIMIT 1) AS replacement_code
        FROM core.entity_taxonomy_membership membership
        JOIN core.taxonomy_node node USING(taxonomy_node_id)
        JOIN core.taxonomy_release release USING(taxonomy_release_id)
        JOIN core.entity_identifier identifier
          ON identifier.entity_id=membership.entity_id AND identifier.identifier_type='INTERNAL_KEY'
        JOIN public.entities legacy ON legacy.entity_key=identifier.identifier_value
        WHERE membership.classification_status='unclassified'
        LIMIT 1
      `);
      const row = selected.rows[0]!;
      await client.query(`
        UPDATE public.entities SET industry_code_system=$2,industry_code=$3
        WHERE entity_key=$1
      `, [row.entity_key, row.taxonomy_system, row.replacement_code]);
      await client.query(identityTaxonomyMigrationSql);
      const memberships = await client.query(
        'SELECT count(*)::int AS n FROM core.entity_taxonomy_membership WHERE entity_id=$1',
        [row.entity_id],
      );
      assert.equal(memberships.rows[0]!.n, 1);
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});
