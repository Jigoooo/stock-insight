import pg, { type PoolClient } from 'pg';

import {
  PLAYBOOK_SCOPES,
  assignPlaybooks,
  type PlaybookAssignmentRow,
  type TaxonomyMember,
} from './playbook-assignment.ts';

/**
 * Assigns every sector playbook to the companies it governs, so an analysis of one of
 * them has a revision to cite (REQ-DOM-001).
 *
 * Idempotent by open assignment: a company already governed is left alone, and a
 * company that has left the universe keeps its closed history rather than being
 * deleted.
 *
 * One pass over the taxonomy, all playbooks. The first version ran for 'semiconductor'
 * alone with the key as a module constant, which made a second sector a copy of the
 * file rather than a row in a table.
 */

const JOB_NAME = 'stock-insight-playbook-assignment';

/**
 * Migration 088 made the issuer Company the canonical assignment subject and added a
 * guard that rejects a Stock subject outright. Taxonomy membership is recorded against
 * the security, so each member is resolved through the exact temporal
 * `core.security_issuer_identity` row the guard also checks. A security with no issuer
 * identity yet resolves to NULL here and is reported rather than assigned.
 */
const MEMBERS_SQL = `
SELECT m.entity_id, e.canonical_name, internal.identifier_value AS entity_key,
       tn.taxonomy_node_id, tr.taxonomy_system, tn.code,
       identity.issuer_entity_id, identity.security_issuer_identity_id
  FROM core.entity_taxonomy_membership m
  JOIN core.taxonomy_node tn ON tn.taxonomy_node_id = m.taxonomy_node_id
  JOIN core.taxonomy_release tr ON tr.taxonomy_release_id = tn.taxonomy_release_id
  JOIN core.entity e ON e.entity_id = m.entity_id
  JOIN core.entity_identifier internal
    ON internal.entity_id = m.entity_id AND internal.identifier_type = 'INTERNAL_KEY'
  LEFT JOIN LATERAL (
    SELECT sii.security_issuer_identity_id, sii.issuer_entity_id
      FROM core.security_issuer_identity sii
     WHERE sii.security_entity_id = m.entity_id
       AND sii.valid_from <= $1::timestamptz
       AND sii.known_from <= $1::timestamptz
     ORDER BY sii.valid_from DESC, sii.security_issuer_identity_id DESC
     LIMIT 1
  ) identity ON true
UNION ALL
-- Tokens. They hold no taxonomy membership — core.entity_taxonomy_membership is built
-- for securities — so a query driven by that table cannot see Bitcoin at all. They come
-- in with a NULL node and are assigned by curation only, which is honest: there is no
-- industry code to reason from, and the crypto playbook says so.
SELECT e.entity_id, e.canonical_name, internal.identifier_value AS entity_key,
       NULL::bigint AS taxonomy_node_id, NULL::text AS taxonomy_system, ''::text AS code,
       e.entity_id AS issuer_entity_id, NULL::bigint AS security_issuer_identity_id
  FROM core.entity e
  JOIN core.entity_identifier internal
    ON internal.entity_id = e.entity_id AND internal.identifier_type = 'INTERNAL_KEY'
 WHERE e.entity_type = 'Token'
 ORDER BY 1
`;

const PLAYBOOK_SQL = `
SELECT sector_playbook_id, revision_no
  FROM governance.sector_playbook
 WHERE playbook_key = $1 AND playbook_state = 'active' AND effective_to IS NULL
 ORDER BY revision_no DESC LIMIT 1
`;

const EXISTING_SQL = `
SELECT playbook.playbook_key, assignment.entity_id
  FROM governance.playbook_assignment assignment
  JOIN governance.sector_playbook playbook
    ON playbook.sector_playbook_id = assignment.sector_playbook_id
 WHERE assignment.valid_to IS NULL
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
    // Every playbook this repository knows about, resolved to its active revision. A
    // scope with no active playbook row is a bug in the migration series, not a
    // condition to skip past quietly.
    const activeByKey = new Map<string, { sectorPlaybookId: number; revisionNo: number }>();
    for (const scope of PLAYBOOK_SCOPES) {
      const playbook = await client.query<{ sector_playbook_id: string; revision_no: number }>(
        PLAYBOOK_SQL,
        [scope.playbookKey],
      );
      const active = playbook.rows[0];
      if (!active) throw new Error(`no active playbook for ${scope.playbookKey}`);
      activeByKey.set(scope.playbookKey, {
        sectorPlaybookId: Number(active.sector_playbook_id),
        revisionNo: active.revision_no,
      });
    }

    const [members, existing] = await Promise.all([
      client.query<{
        entity_id: string;
        canonical_name: string;
        entity_key: string;
        taxonomy_node_id: string;
        taxonomy_system: string;
        code: string;
        issuer_entity_id: string | null;
        security_issuer_identity_id: string | null;
      }>(MEMBERS_SQL, [validFrom]),
      client.query<{ playbook_key: string; entity_id: string }>(EXISTING_SQL),
    ]);

    const readings: TaxonomyMember[] = members.rows.map((row) => ({
      entityId: Number(row.entity_id),
      entityKey: row.entity_key,
      entityName: row.canonical_name,
      taxonomyNodeId: Number(row.taxonomy_node_id),
      taxonomySystem: row.taxonomy_system,
      code: row.code,
      issuerEntityId: row.issuer_entity_id == null ? null : Number(row.issuer_entity_id),
      securityIssuerIdentityId:
        row.security_issuer_identity_id == null ? null : Number(row.security_issuer_identity_id),
    }));

    const decided = assignPlaybooks(readings);
    const alreadyGoverned = new Set(
      existing.rows.map((row) => `${row.playbook_key}:${row.entity_id}`),
    );
    // A security whose issuer identity has not been minted yet cannot be assigned
    // without inventing the subject, so it is counted and named instead of written.
    const withoutIssuer = decided.assignments.filter((row) => row.issuerEntityId == null);
    const resolved = decided.assignments.filter((row) => row.issuerEntityId != null);
    // Several securities can share one issuer; the issuer is assigned once per playbook.
    const byIssuer = new Map<string, PlaybookAssignmentRow>();
    for (const row of resolved) {
      const key = `${row.playbookKey}:${row.issuerEntityId!}`;
      if (!byIssuer.has(key)) byIssuer.set(key, row);
    }
    const toWrite: PlaybookAssignmentRow[] = [...byIssuer.entries()]
      .filter(([key]) => !alreadyGoverned.has(key))
      .map(([, row]) => row);

    const perPlaybook = Object.fromEntries(
      PLAYBOOK_SCOPES.map((scope) => [
        `${scope.playbookKey}@${activeByKey.get(scope.playbookKey)!.revisionNo}`,
        {
          governed: decided.assignments.filter((row) => row.playbookKey === scope.playbookKey)
            .length,
          byTaxonomy: decided.assignments.filter(
            (row) => row.playbookKey === scope.playbookKey && row.assignmentBasis === 'taxonomy',
          ).length,
          curated: decided.assignments
            .filter(
              (row) => row.playbookKey === scope.playbookKey && row.assignmentBasis === 'curated',
            )
            .map((row) => row.entityName),
          toWrite: toWrite.filter((row) => row.playbookKey === scope.playbookKey).length,
        },
      ]),
    );

    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : rehearse ? 'rehearse' : 'dry-run',
      taxonomyMemberships: readings.length,
      playbooks: perPlaybook,
      alreadyGoverned: alreadyGoverned.size,
      issuersResolved: byIssuer.size,
      withoutIssuerIdentity: withoutIssuer.map((row) => `${row.playbookKey}: ${row.entityName}`),
      toWrite: toWrite.length,
      // Companies one node away that were looked at and not assigned. Reported so
      // the decision is visible rather than inferable from an absence.
      nearMisses: decided.nearMisses.map(
        (miss) => `${miss.playbookKey} — ${miss.entityName} (${miss.code}): ${miss.reason}`,
      ),
      staleCurations: decided.unmatchedCurations.map(
        (entry) => `${entry.playbookKey}: ${entry.entityKey}`,
      ),
    };

    if (!apply && !rehearse) {
      console.log(JSON.stringify({ ...summary, hint: 'rerun with --apply' }, null, 2));
      return;
    }
    if (decided.unmatchedCurations.length > 0) {
      throw new Error(
        `a curated assignment names a company that is not in the universe: ${summary.staleCurations.join(', ')}`,
      );
    }

    await client.query('BEGIN');
    try {
      let written = 0;
      for (const row of toWrite) {
        const result = await client.query(INSERT_SQL, [
          activeByKey.get(row.playbookKey)!.sectorPlaybookId,
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
