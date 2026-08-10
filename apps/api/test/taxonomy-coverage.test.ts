import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

import { identityTaxonomyMigrationSql } from '../../../packages/db-schema/src/migrations/021_identity_taxonomy.ts';
import { taxonomyMembershipTemporalityMigrationSql } from '../../../packages/db-schema/src/migrations/102_taxonomy_membership_temporality.ts';

const databaseUrl = process.env.STOCK_INSIGHT_IDENTITY_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_IDENTITY_TEST_DB_URL is required';

describe('B3 SIC/KSIC taxonomy contract', () => {
  it(
    'has exactly one current taxonomy membership per Stock, none fabricated, none unmapped',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      try {
        const result = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM core.entity WHERE entity_type='Stock') AS stocks,
          (SELECT count(*)::int FROM core.entity_taxonomy_current_v1) AS current_memberships,
          (SELECT count(DISTINCT entity_id)::int FROM core.entity_taxonomy_current_v1) AS classified_entities,
          (SELECT count(*)::int FROM core.entity_taxonomy_current_v1 WHERE classification_status='unclassified' AND code<>'UNCLASSIFIED') AS false_unclassified,
          -- Every current source_reported code must trace to something that actually
          -- reported it. Two sources are legitimate now: the legacy import, and a DART
          -- company profile carried by an immutable ingestion revision. A membership
          -- naming neither is a code this system invented, which is the one failure
          -- this assertion exists for.
          (SELECT count(*)::int FROM core.entity_taxonomy_current_v1 membership
           WHERE membership.classification_status='source_reported'
             AND NOT EXISTS (
               SELECT 1 FROM public.entities legacy
               JOIN core.entity_identifier identifier ON identifier.identifier_value=legacy.entity_key AND identifier.identifier_type='INTERNAL_KEY'
               WHERE identifier.entity_id=membership.entity_id
                 AND legacy.industry_code_system=membership.taxonomy_system
                 AND legacy.industry_code=membership.code
             )
             AND NOT EXISTS (
               SELECT 1
                 FROM ingestion.source_revision revision
                 JOIN ingestion.source_record_identity record ON record.source_record_identity_id=revision.source_record_identity_id
                 JOIN core.entity_identifier identifier ON identifier.entity_id=membership.entity_id AND identifier.identifier_type='INTERNAL_KEY'
                 JOIN public.company_profiles profile ON profile.entity_key=identifier.identifier_value
                WHERE membership.source_reference = 'ingestion.source_revision:' || revision.source_revision_id
                  AND record.provider_record_key = 'profile:' || profile.entity_key
                  AND btrim(profile.profile_json->>'industryCode') = membership.code
             )) AS fabricated_codes,
          -- The property the DART backfill establishes, stated so it survives coverage
          -- growth: no stock sits at UNCLASSIFIED while a source reports a code for it.
          -- A pinned count would go stale the next time the profile snapshot widens;
          -- this does not.
          (SELECT count(*)::int FROM core.entity_taxonomy_current_v1 membership
           JOIN core.entity_identifier identifier ON identifier.entity_id=membership.entity_id AND identifier.identifier_type='INTERNAL_KEY'
           JOIN public.company_profiles profile ON profile.entity_key=identifier.identifier_value
           WHERE membership.code='UNCLASSIFIED'
             AND nullif(btrim(profile.profile_json->>'industryCode'),'') IS NOT NULL) AS unmapped_reported_codes
      `);
        // One current classification per stock. Superseded rows stay in the table with
        // a valid_to, so the count is over the current view rather than the ledger.
        assert.equal(result.rows[0]!.current_memberships, result.rows[0]!.stocks);
        assert.equal(result.rows[0]!.classified_entities, result.rows[0]!.stocks);
        assert.equal(result.rows[0]!.false_unclassified, 0);
        assert.equal(result.rows[0]!.fabricated_codes, 0);
        assert.equal(result.rows[0]!.unmapped_reported_codes, 0);
      } finally {
        await pool.end();
      }
    },
  );

  it(
    'keeps imported releases provisional and crosswalk empty until evidence is approved',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      try {
        const result = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM core.taxonomy_release WHERE policy_status='provisional_review_required') AS provisional,
          (SELECT count(*)::int FROM core.taxonomy_release) AS releases,
          (SELECT count(*)::int FROM core.taxonomy_crosswalk) AS crosswalks
      `);
        assert.equal(result.rows[0]!.releases, 3);
        assert.equal(result.rows[0]!.provisional, 3);
        assert.equal(result.rows[0]!.crosswalks, 0);
      } finally {
        await pool.end();
      }
    },
  );

  it(
    'reapply stays safe when the legacy source changes after the frozen baseline',
    { skip: skipReason },
    async () => {
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
          AND membership.valid_to IS NULL
        LIMIT 1
      `);
        const row = selected.rows[0]!;
        await client.query(
          `
        UPDATE public.entities SET industry_code_system=$2,industry_code=$3
        WHERE entity_key=$1
      `,
          [row.entity_key, row.taxonomy_system, row.replacement_code],
        );
        // 021 then 102, because that is how the schema is actually applied. 021 creates
        // uq_entity_taxonomy_system over every row and 102 replaces it with a partial
        // index over live rows only; replaying 021 alone would rebuild an index that
        // now contradicts the table's own history and fail on the first superseded row.
        await client.query(identityTaxonomyMigrationSql);
        await client.query(taxonomyMembershipTemporalityMigrationSql);
        // One CURRENT membership. Superseded rows stay in the table with a valid_to
        // since migration 102, so counting the whole ledger would now count history
        // as a collision.
        const memberships = await client.query(
          'SELECT count(*)::int AS n FROM core.entity_taxonomy_current_v1 WHERE entity_id=$1',
          [row.entity_id],
        );
        assert.equal(memberships.rows[0]!.n, 1);
        await client.query('ROLLBACK');
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
        await pool.end();
      }
    },
  );
});
