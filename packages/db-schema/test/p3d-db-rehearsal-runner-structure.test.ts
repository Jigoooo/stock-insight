import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const runnerPath = new URL('../../../apps/api/scripts/run-p3d-db-rehearsal.mjs', import.meta.url);
const source = existsSync(runnerPath) ? readFileSync(runnerPath, 'utf8') : '';

describe('P3-D disposable DB rehearsal runner', () => {
  it('exists and fences every disposable database name', () => {
    assert.equal(existsSync(runnerPath), true);
    assert.match(source, /stock_insight_p3d_rehearsal_/);
    assert.match(source, /assertDisposableDatabaseName/);
    assert.match(source, /STOCK_INSIGHT_ALLOW_DOCKER_BRIDGE_REHEARSAL === '1'/);
  });

  it('rejects connection URLs whose query parameters can override the inspected host or port', () => {
    const result = spawnSync(process.execPath, [fileURLToPath(runnerPath)], {
      encoding: 'utf8',
      env: {
        ...process.env,
        STOCK_INSIGHT_ALLOW_DOCKER_BRIDGE_REHEARSAL: '0',
        STOCK_INSIGHT_REHEARSAL_SOURCE_DATABASE_URL:
          'postgresql://postgres:dummy@127.0.0.1:5432/research_app',
        STOCK_INSIGHT_TEST_ADMIN_DATABASE_URL:
          'postgresql://postgres:dummy@127.0.0.1:5432/postgres?host=127.0.0.1&port=1',
      },
      timeout: 30_000,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /query parameters or fragments/i);
  });

  it('applies the exact 031→042 candidate bundle twice on a migration-030 snapshot', () => {
    const expectedCandidateIds = [
      '031_truth_kernel',
      '032_world_event_temporal_lineage',
      '033_entity_resolution_ontology',
      '034_geo_foundation',
      '035_geo_exposure_pit_universe',
      '036_truth_geo_serving',
      '037_impact_exposure_ledger',
      '038_production_network',
      '039_methodology_registry',
      '040_scenario_spatial_impact',
      '041_precompute_cache_ledger',
      '042_geo_entity_identity_immutability',
    ];
    const expectedBlockStart = source.indexOf('const EXPECTED_CANDIDATE_MIGRATION_IDS');
    const expectedBlockEnd = source.indexOf('];', expectedBlockStart);
    const expectedBlock = source.slice(expectedBlockStart, expectedBlockEnd);
    assert.deepEqual(
      [...expectedBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]),
      expectedCandidateIds,
    );
    assert.match(
      source,
      /candidateMigrationIds\.length !== EXPECTED_CANDIDATE_MIGRATION_IDS\.length/,
    );
    assert.match(source, /candidateMigrationIds\.some/);
    assert.match(source, /pg_dump/);
    assert.match(source, /pg_restore/);
    assert.match(source, /--exclude-table-data=_timescaledb_catalog\.bgw_job/);
    assert.match(source, /timescaledb_pre_restore/);
    assert.match(source, /timescaledb_post_restore/);
    assert.match(source, /readSourceTimescaleVersion/);
    assert.match(source, /timescaledb VERSION '\$\{timescaleVersion\}'/);
    assert.match(source, /restoreProductionShapedSnapshot/);
    assert.match(source, /additiveAppMigrations/);
    assert.match(source, /031_truth_kernel/);
    assert.match(source, /042_geo_entity_identity_immutability/);
    assert.match(source, /public\.app_invitations/);
    assert.match(source, /knowledge\.assertion/);
    assert.match(source, /for \(const round of \[1, 2\]\)/);
    assert.match(source, /for \(const migration of candidateMigrationBundle\)/);
  });

  it('requires the migration-030 baseline to exclude every 031→041 surface', () => {
    const expectedRelations = [
      'knowledge.assertion',
      'world.event',
      'knowledge.resolution_policy',
      'geo.entity',
      'geo.entity_exposure_revision',
      'serving.v_truth_assertion_pit_v1',
      'analytics.impact_shock',
      'analytics.io_industry_linkage',
      'analytics.methodology_template',
      'analytics.scenario_set',
      'analytics.precompute_policy',
    ];
    const blockStart = source.indexOf('const CANDIDATE_BASELINE_ABSENCE_RELATIONS');
    const blockEnd = source.indexOf('];', blockStart);
    const block = source.slice(blockStart, blockEnd);
    assert.deepEqual(
      [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]),
      expectedRelations,
    );
    assert.match(source, /unnest\(\$1::text\[\]\).*relation_name/s);
    assert.match(source, /to_regclass\(relation_name\) IS NOT NULL/);
  });

  it('proves insert acceptance plus UPDATE and DELETE rejection before rollback', () => {
    assert.match(source, /SAVEPOINT \$\{savepoint\}/);
    assert.match(source, /client,\s*'update_probe'/);
    assert.match(source, /client,\s*'delete_probe'/);
    assert.match(source, /error\.code !== '55000'/);
    assert.match(source, /INSERT INTO geo\.entity/);
    assert.match(source, /ROLLBACK/);
  });

  it('always terminates connections and drops only the fenced disposable database', () => {
    assert.match(source, /pg_terminate_backend/);
    assert.match(source, /DROP DATABASE/);
    assert.match(source, /finally/);
  });
});
