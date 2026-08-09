import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildK4SemanticSnapshotPlan,
  executeK4SemanticSnapshotJob,
  parseK4SemanticSnapshotArgs,
  type K4SemanticSnapshotQueryClient,
} from '../src/analytics/k4-semantic-snapshot.ts';

const cutoff = '2026-08-02T14:59:59.999Z';
const basis = {
  ontology: [{ ontology_revision_id: 1, known_from: '2026-07-01T00:00:00.000Z' }],
  metricDefinitions: [{ metric_definition_id: 2, known_at: '2026-07-02T00:00:00.000Z' }],
  identities: [{ security_issuer_identity_id: 3, known_from: '2026-07-03T00:00:00.000Z' }],
  playbooks: [{ sector_playbook_id: 4, known_at: '2026-07-04T00:00:00.000Z' }],
  drivers: [{ business_driver_id: 5, created_at: '2026-07-05T00:00:00.000Z' }],
  rules: [{ business_driver_measurement_rule_id: 6, known_at: '2026-07-06T00:00:00.000Z' }],
  assignments: [{ playbook_assignment_id: 7, known_at: '2026-07-07T00:00:00.000Z' }],
  sourcePitQuality: [{ source_pit_quality_id: 8, known_at: '2026-07-08T00:00:00.000Z' }],
};

class FakeClient implements K4SemanticSnapshotQueryClient {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];

  async query(sql: string, params: readonly unknown[] = []) {
    this.calls.push({ sql, params });
    if (sql.includes('k4_semantic_basis')) return { rows: [{ snapshot_payload: basis }] };
    if (sql.includes('k4_insert_semantic_snapshot')) return { rows: [] };
    if (sql.includes('k4_verify_semantic_snapshot')) {
      const plan = buildK4SemanticSnapshotPlan(cutoff, basis, 'historical_reconstruction');
      return {
        rows: [
          {
            semantic_snapshot_id: plan.semanticSnapshotId,
            ontology_revision_id: plan.ontologyRevisionId,
            metric_definition_revision: plan.metricDefinitionRevision,
            entity_resolution_revision: plan.entityResolutionRevision,
            model_version: plan.modelVersion,
            prompt_version: plan.promptVersion,
            feature_version: plan.featureVersion,
            source_contract_revision_digest: plan.sourceContractRevisionDigest,
            market_calendar: plan.marketCalendar,
            corporate_action_basis: plan.corporateActionBasis,
            snapshot_state: 'sealed',
            construction_mode: plan.constructionMode,
            knowledge_cutoff: cutoff,
            notes: plan.notes,
          },
        ],
      };
    }
    return { rows: [] };
  }
}

describe('K4 semantic snapshot CLI', () => {
  it('builds the seven historical KST cutoffs without backdating creation time', () => {
    const args = parseK4SemanticSnapshotArgs(['--from', '2026-08-02', '--to', '2026-08-08']);
    assert.equal(args.mode, 'dry-run');
    assert.equal(args.constructionMode, 'historical_reconstruction');
    assert.equal(args.cutoffs.length, 7);
    assert.equal(args.cutoffs[0], cutoff);
  });

  it('requires a canonical cutoff for a live observed snapshot', () => {
    const args = parseK4SemanticSnapshotArgs(['--live', '--cutoff', cutoff, '--apply']);
    assert.deepEqual(args, {
      mode: 'apply',
      constructionMode: 'live_observed',
      cutoffs: [cutoff],
    });
    assert.throws(() => parseK4SemanticSnapshotArgs(['--live', '--cutoff', '2026-08-02']), /ISO/);
  });
});

describe('K4 semantic snapshot planning', () => {
  it('is deterministic across object key order and records reconstruction provenance', () => {
    const first = buildK4SemanticSnapshotPlan(cutoff, basis, 'historical_reconstruction');
    const second = buildK4SemanticSnapshotPlan(
      cutoff,
      Object.fromEntries(Object.entries(basis).reverse()),
      'historical_reconstruction',
    );

    assert.deepEqual(first, second);
    assert.match(first.semanticSnapshotId, /^k4\.semantic\.20260802\.[a-f0-9]{32}$/);
    assert.equal(first.ontologyRevisionId, 1);
    assert.equal(first.knowledgeCutoff, cutoff);
    assert.equal(JSON.parse(first.notes).basis_cutoff, cutoff);
    assert.equal('createdAt' in first, false);
  });

  it('does not claim a singular ontology revision when the cutoff contains several', () => {
    const plan = buildK4SemanticSnapshotPlan(
      cutoff,
      { ...basis, ontology: [...basis.ontology, { ontology_revision_id: 2 }] },
      'historical_reconstruction',
    );
    assert.equal(plan.ontologyRevisionId, null);
    assert.match(JSON.parse(plan.notes).ontology_digest, /^[a-f0-9]{64}$/);
  });
});

describe('K4 semantic snapshot execution', () => {
  it('keeps dry-run read only', async () => {
    const client = new FakeClient();
    const [summary] = await executeK4SemanticSnapshotJob({
      client,
      args: { mode: 'dry-run', constructionMode: 'historical_reconstruction', cutoffs: [cutoff] },
    });
    assert.equal(summary?.persistence, null);
    assert.equal(client.calls.length, 1);
    assert.match(client.calls[0]!.sql, /k4_semantic_basis/);
  });

  it('rolls rehearsal back and commits apply under an exact cutoff lock', async () => {
    const rehearsal = new FakeClient();
    await executeK4SemanticSnapshotJob({
      client: rehearsal,
      args: { mode: 'rehearse', constructionMode: 'historical_reconstruction', cutoffs: [cutoff] },
    });
    assert.equal(rehearsal.calls.at(-1)?.sql, 'ROLLBACK');
    assert.match(rehearsal.calls[3]!.sql, /k4_insert_semantic_snapshot/);

    const apply = new FakeClient();
    await executeK4SemanticSnapshotJob({
      client: apply,
      args: { mode: 'apply', constructionMode: 'historical_reconstruction', cutoffs: [cutoff] },
    });
    assert.equal(apply.calls.at(-1)?.sql, 'COMMIT');
    assert.deepEqual(apply.calls[2]?.params, [`k4-semantic-snapshot:${cutoff}`]);
  });
});
