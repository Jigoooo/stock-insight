import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import pg from 'pg';

import { temporalRelationLedgerMigrationSql } from '../../../packages/db-schema/src/migrations/023_temporal_relation_ledger.ts';

const databaseUrl = process.env.STOCK_INSIGHT_TEMPORAL_MIGRATION_TEST_DB_URL;
const skipReason = databaseUrl ? false : 'STOCK_INSIGHT_TEMPORAL_MIGRATION_TEST_DB_URL is required';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

describe('B5 temporal relation migration fresh-baseline contract', () => {
  it('derives accepted validity and knowledge intervals from one qualifying evidence row', () => {
    assert.match(
      temporalRelationLedgerMigrationSql,
      /LEFT JOIN LATERAL \([\s\S]*?FROM knowledge\.relation_evidence_ledger evidence[\s\S]*?LEFT JOIN core\.security_issuer_identity mapping/i,
    );
    assert.match(
      temporalRelationLedgerMigrationSql,
      /greatest\([\s\S]*?relation\.valid_from[\s\S]*?ontology\.effective_from[\s\S]*?evidence\.valid_from[\s\S]*?mapping\.valid_from/i,
    );
    assert.match(
      temporalRelationLedgerMigrationSql,
      /greatest\([\s\S]*?relation\.recorded_from[\s\S]*?ontology\.known_from[\s\S]*?evidence\.recorded_at[\s\S]*?mapping\.known_from/i,
    );
    assert.match(
      temporalRelationLedgerMigrationSql,
      /relation\.valid_to IS NULL OR relation\.valid_to>timing\.required_valid_from/i,
    );
    assert.match(
      temporalRelationLedgerMigrationSql,
      /evidence\.valid_to IS NULL OR evidence\.valid_to>timing\.required_valid_from/i,
    );
    assert.match(
      temporalRelationLedgerMigrationSql,
      /WHEN relation\.valid_to IS NULL THEN evidence\.valid_to[\s\S]*?WHEN evidence\.valid_to IS NULL THEN relation\.valid_to[\s\S]*?least\(relation\.valid_to,evidence\.valid_to\)/i,
    );
    assert.match(
      temporalRelationLedgerMigrationSql,
      /evidence\.valid_to IS NULL[\s\S]*?OR \(NEW\.valid_to IS NOT NULL AND NEW\.valid_to<=evidence\.valid_to\)/i,
    );
    assert.doesNotMatch(temporalRelationLedgerMigrationSql, /min\(evidence\.recorded_at\)/i);
  });

  it('quarantines non-overlapping baseline evidence and skips non-overlapping upgrades', () => {
    assert.match(
      temporalRelationLedgerMigrationSql,
      /CASE WHEN qualification\.required_valid_from IS NOT NULL[\s\S]*?THEN 'accepted' ELSE 'quarantined_unverified' END/i,
    );
    assert.match(
      temporalRelationLedgerMigrationSql,
      /JOIN LATERAL \([\s\S]*?WHEN latest\.valid_to IS NULL THEN evidence\.valid_to[\s\S]*?least\(latest\.valid_to,evidence\.valid_to\)[\s\S]*?\) qualification ON true/i,
    );
  });

  it(
    'quarantines disjoint evidence, clips partial overlap, and reapplies without timestamp drift',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const selected = await client.query(`
          SELECT relation.relation_id,relation.valid_from,relation.recorded_from,
                 identity.relation_identity_id,
                 mapping.security_issuer_identity_id,mapping.identity_match_key,mapping.mapping_basis,
                 source_contract.source_contract_revision_id,
                 greatest(relation.valid_from,ontology.effective_from,mapping.valid_from)
                   AS acceptance_anchor
          FROM knowledge.relation relation
          JOIN knowledge.relation_identity identity
            ON identity.subject_entity_id=relation.subject_entity_id
           AND identity.predicate=relation.predicate
           AND identity.object_entity_id=relation.object_entity_id
          JOIN core.security_issuer_identity mapping
            ON mapping.security_entity_id=identity.subject_entity_id
           AND mapping.issuer_entity_id=identity.object_entity_id
          JOIN knowledge.predicate_ontology_revision ontology
            ON ontology.predicate='ISSUED_BY' AND ontology.revision_no=2
          CROSS JOIN LATERAL (
            SELECT min(source_contract_revision_id) AS source_contract_revision_id
            FROM ingestion.source_contract_revision
          ) source_contract
          WHERE identity.predicate='ISSUED_BY'
            AND relation.valid_from IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM serving.content_pack_item item
              JOIN knowledge.relation_revision revision
                ON revision.relation_revision_id=item.relation_revision_id
              WHERE revision.relation_identity_id=identity.relation_identity_id
            )
          ORDER BY relation.relation_id
          LIMIT 2
        `);
        assert.equal(selected.rows.length, 2);

        await client.query(
          'ALTER TABLE knowledge.relation_revision DISABLE TRIGGER relation_revision_immutable',
        );
        await client.query(
          'ALTER TABLE knowledge.relation_evidence_ledger DISABLE TRIGGER relation_evidence_immutable',
        );
        await client.query('ALTER TABLE analytics.graph_snapshot_edge DISABLE TRIGGER USER');
        const scenarios = [
          {
            fixture: selected.rows[0]!,
            relationEndDays: 1,
            evidenceStartDays: 2,
            evidenceEndDays: null,
            expectedStatus: 'quarantined_unverified',
          },
          {
            fixture: selected.rows[1]!,
            relationEndDays: 4,
            evidenceStartDays: 1,
            evidenceEndDays: 2,
            expectedStatus: 'accepted',
          },
        ];
        const expectations: Array<{
          identityId: string;
          status: string;
          validFrom: Date;
          validTo: Date;
        }> = [];

        for (const scenario of scenarios) {
          const { fixture } = scenario;
          await client.query(
            `DELETE FROM analytics.graph_snapshot_edge
             WHERE relation_revision_id IN (
               SELECT relation_revision_id FROM knowledge.relation_revision
               WHERE relation_identity_id=$1
             )`,
            [fixture.relation_identity_id],
          );
          await client.query(
            'DELETE FROM knowledge.relation_revision WHERE relation_identity_id=$1',
            [fixture.relation_identity_id],
          );
          await client.query(
            'DELETE FROM knowledge.relation_evidence_ledger WHERE relation_identity_id=$1',
            [fixture.relation_identity_id],
          );
          const relation = await client.query(
            `UPDATE knowledge.relation
             SET valid_to=$2::timestamptz+make_interval(days=>$3::int)
             WHERE relation_id=$1
             RETURNING valid_from,valid_to,recorded_from,
               encode(sha256(convert_to(
                 relation_id::text||'|'||relation_kind||'|'||confidence::text||'|'||coalesce(metadata::text,'{}'),
                 'UTF8'
               )),'hex') AS payload_hash`,
            [fixture.relation_id, fixture.acceptance_anchor, scenario.relationEndDays],
          );
          const relationRow = relation.rows[0]!;

          await client.query(
            `INSERT INTO knowledge.relation_evidence_ledger(
               relation_identity_id,evidence_kind,source_contract_revision_id,
               evidence_text,evidence_hash,relation_payload_hash,source_weight,recorded_at,metadata
             ) VALUES ($1,'source_contract',$2,'early nonqualifying fixture',$3,$4,1,$5,
                       '{"fixture":"t3-adversarial"}')`,
            [
              fixture.relation_identity_id,
              fixture.source_contract_revision_id,
              sha(`t3-nonqualifying-${fixture.relation_identity_id}`),
              relationRow.payload_hash,
              relationRow.recorded_from,
            ],
          );
          const evidence = await client.query(
            `INSERT INTO knowledge.relation_evidence_ledger(
               relation_identity_id,evidence_kind,security_issuer_identity_id,
               evidence_text,evidence_hash,relation_payload_hash,source_weight,
               valid_from,valid_to,recorded_at,metadata
             ) VALUES (
               $1,'identity_mapping',$2,$3,$4,$5,1,
               $6::timestamptz+make_interval(days=>$7::int),
               CASE WHEN $8::int IS NULL THEN NULL
                    ELSE $6::timestamptz+make_interval(days=>$8::int) END,
               clock_timestamp(),'{"fixture":"t3-adversarial"}'
             ) RETURNING valid_from,valid_to`,
            [
              fixture.relation_identity_id,
              fixture.security_issuer_identity_id,
              `${fixture.mapping_basis}:${fixture.identity_match_key}`,
              sha(
                `identity_mapping|${fixture.security_issuer_identity_id}|${fixture.identity_match_key}`,
              ),
              relationRow.payload_hash,
              fixture.acceptance_anchor,
              scenario.evidenceStartDays,
              scenario.evidenceEndDays,
            ],
          );
          expectations.push({
            identityId: fixture.relation_identity_id,
            status: scenario.expectedStatus,
            validFrom: new Date(
              scenario.expectedStatus === 'accepted'
                ? evidence.rows[0]!.valid_from
                : relationRow.valid_from,
            ),
            validTo: new Date(
              scenario.expectedStatus === 'accepted'
                ? evidence.rows[0]!.valid_to
                : relationRow.valid_to,
            ),
          });
        }

        await client.query(temporalRelationLedgerMigrationSql);
        const firstRows = new Map<string, Record<string, unknown>>();
        for (const expected of expectations) {
          const first = await client.query(
            `SELECT revision_status,valid_from,valid_to,known_from
             FROM knowledge.relation_revision
             WHERE relation_identity_id=$1`,
            [expected.identityId],
          );
          assert.equal(first.rows.length, 1);
          assert.equal(first.rows[0]!.revision_status, expected.status);
          assert.equal(
            new Date(first.rows[0]!.valid_from).toISOString(),
            expected.validFrom.toISOString(),
          );
          assert.equal(
            new Date(first.rows[0]!.valid_to).toISOString(),
            expected.validTo.toISOString(),
          );
          firstRows.set(expected.identityId, first.rows[0]!);
        }

        await client.query(temporalRelationLedgerMigrationSql);
        for (const expected of expectations) {
          const first = firstRows.get(expected.identityId)!;
          const second = await client.query(
            `SELECT revision_status,valid_from,valid_to,known_from
             FROM knowledge.relation_revision
             WHERE relation_identity_id=$1`,
            [expected.identityId],
          );
          assert.equal(second.rows.length, 1);
          assert.equal(second.rows[0]!.revision_status, first.revision_status);
          for (const column of ['valid_from', 'valid_to', 'known_from'] as const) {
            assert.equal(
              new Date(second.rows[0]![column]).toISOString(),
              new Date(first[column] as string | Date).toISOString(),
            );
          }
        }
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
        await pool.end();
      }
    },
  );
});
