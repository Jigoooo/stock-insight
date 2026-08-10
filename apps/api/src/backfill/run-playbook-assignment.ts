import pg, { type PoolClient } from 'pg';

import {
  assignSemiconductorPlaybook,
  type PlaybookAssignmentRow,
  type TaxonomyMember,
} from './playbook-assignment.ts';

/**
 * Assigns the semiconductor playbook to the companies it governs, so an analysis
 * of one of them has a revision to cite (REQ-DOM-001).
 *
 * Idempotent by open assignment: a company already governed is left alone, and a
 * company that has left the universe keeps its closed history rather than being
 * deleted.
 */

const JOB_NAME = 'stock-insight-playbook-assignment';
const PLAYBOOK_KEY = 'semiconductor';

/**
 * Migration 088 made the issuer Company the canonical assignment subject and added a
 * guard that rejects a Stock subject outright. Taxonomy membership is recorded against
 * the security, so each member is resolved through the exact temporal
 * `core.security_issuer_identity` row the guard also checks. A security with no issuer
 * identity yet resolves to NULL here and is reported rather than assigned.
 */
const MEMBERS_SQL = `
SELECT m.entity_id, e.canonical_name, tn.taxonomy_node_id, tr.taxonomy_system, tn.code,
       identity.issuer_entity_id, identity.security_issuer_identity_id
  FROM core.entity_taxonomy_membership m
  JOIN core.taxonomy_node tn ON tn.taxonomy_node_id = m.taxonomy_node_id
  JOIN core.taxonomy_release tr ON tr.taxonomy_release_id = tn.taxonomy_release_id
  JOIN core.entity e ON e.entity_id = m.entity_id
  LEFT JOIN LATERAL (
    SELECT sii.security_issuer_identity_id, sii.issuer_entity_id
      FROM core.security_issuer_identity sii
     WHERE sii.security_entity_id = m.entity_id
       AND sii.valid_from <= $1::timestamptz
       AND sii.known_from <= $1::timestamptz
     ORDER BY sii.valid_from DESC, sii.security_issuer_identity_id DESC
     LIMIT 1
  ) identity ON true
 ORDER BY m.entity_id
`;

const PLAYBOOK_SQL = `
SELECT sector_playbook_id, revision_no
  FROM governance.sector_playbook
 WHERE playbook_key = $1 AND playbook_state = 'active' AND effective_to IS NULL
 ORDER BY revision_no DESC LIMIT 1
`;

const EXISTING_SQL = `
SELECT entity_id FROM governance.playbook_assignment
 WHERE sector_playbook_id = $1 AND valid_to IS NULL
`;

const INSERT_SQL = `
INSERT INTO governance.playbook_assignment
  (sector_playbook_id, entity_id, assignment_basis, taxonomy_node_id, rationale,
   valid_from, assigned_by, security_issuer_identity_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (sector_playbook_id, entity_id, valid_from) DO NOTHING
`;

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for the playbook assignment');
  return url;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const rehearse = process.argv.includes('--rehearse');
  const validFrom = new Date().toISOString();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: getDatabaseUrl(), max: 1 });
  const client = await pool.connect();

  try {
    const playbook = await client.query<{ sector_playbook_id: string; revision_no: number }>(
      PLAYBOOK_SQL,
      [PLAYBOOK_KEY],
    );
    const active = playbook.rows[0];
    if (!active) throw new Error(`no active playbook for ${PLAYBOOK_KEY}`);

    const [members, existing] = await Promise.all([
      client.query<{
        entity_id: string;
        canonical_name: string;
        taxonomy_node_id: string;
        taxonomy_system: string;
        code: string;
        issuer_entity_id: string | null;
        security_issuer_identity_id: string | null;
      }>(MEMBERS_SQL, [validFrom]),
      client.query<{ entity_id: string }>(EXISTING_SQL, [active.sector_playbook_id]),
    ]);

    const readings: TaxonomyMember[] = members.rows.map((row) => ({
      entityId: Number(row.entity_id),
      entityName: row.canonical_name,
      taxonomyNodeId: Number(row.taxonomy_node_id),
      taxonomySystem: row.taxonomy_system,
      code: row.code,
      issuerEntityId: row.issuer_entity_id == null ? null : Number(row.issuer_entity_id),
      securityIssuerIdentityId:
        row.security_issuer_identity_id == null ? null : Number(row.security_issuer_identity_id),
    }));

    const decided = assignSemiconductorPlaybook(readings);
    const alreadyGoverned = new Set(existing.rows.map((row) => Number(row.entity_id)));
    // A security whose issuer identity has not been minted yet cannot be assigned
    // without inventing the subject, so it is counted and named instead of written.
    const withoutIssuer = decided.assignments.filter((row) => row.issuerEntityId == null);
    const resolved = decided.assignments.filter((row) => row.issuerEntityId != null);
    // Several securities can share one issuer; the issuer is assigned once.
    const byIssuer = new Map<number, PlaybookAssignmentRow>();
    for (const row of resolved) {
      if (!byIssuer.has(row.issuerEntityId!)) byIssuer.set(row.issuerEntityId!, row);
    }
    const toWrite: PlaybookAssignmentRow[] = [...byIssuer.values()].filter(
      (row) => !alreadyGoverned.has(row.issuerEntityId!),
    );

    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : rehearse ? 'rehearse' : 'dry-run',
      playbook: `${PLAYBOOK_KEY}@${active.revision_no}`,
      taxonomyMemberships: readings.length,
      governed: decided.assignments.length,
      byTaxonomy: decided.assignments.filter((row) => row.assignmentBasis === 'taxonomy').length,
      curated: decided.assignments
        .filter((row) => row.assignmentBasis === 'curated')
        .map((row) => row.entityName),
      alreadyGoverned: alreadyGoverned.size,
      issuersResolved: byIssuer.size,
      withoutIssuerIdentity: withoutIssuer.map((row) => row.entityName),
      toWrite: toWrite.length,
      // Companies one node away that were looked at and not assigned. Reported so
      // the decision is visible rather than inferable from an absence.
      nearMisses: decided.nearMisses.map(
        (miss) => `${miss.entityName} (${miss.code}): ${miss.reason}`,
      ),
      staleCurations: decided.unmatchedCurations,
    };

    if (!apply && !rehearse) {
      console.log(JSON.stringify({ ...summary, hint: 'rerun with --apply' }, null, 2));
      return;
    }
    if (decided.unmatchedCurations.length > 0) {
      throw new Error(
        `a curated assignment names a company that is not in the universe: ${decided.unmatchedCurations.join(', ')}`,
      );
    }

    await client.query('BEGIN');
    try {
      let written = 0;
      for (const row of toWrite) {
        const result = await client.query(INSERT_SQL, [
          active.sector_playbook_id,
          row.issuerEntityId,
          row.assignmentBasis,
          row.taxonomyNodeId,
          row.rationale,
          validFrom,
          JOB_NAME,
          row.securityIssuerIdentityId,
        ]);
        written += result.rowCount ?? 0;
      }
      await client.query(rehearse ? 'ROLLBACK' : 'COMMIT');
      console.log(
        JSON.stringify({ ...summary, [rehearse ? 'rolledBack' : 'written']: written }, null, 2),
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
