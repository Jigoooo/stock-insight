import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { additiveAppMigrations } from '../src/index.ts';
import { pipelineWrapperHealthMigrationSql } from '../src/migrations/095_pipeline_wrapper_health.ts';

describe('095 pipeline wrapper health', () => {
  it('is registered after the K4 semantic snapshot reconstruction', () => {
    const index = additiveAppMigrations.findIndex(({ id }) => id === '095_pipeline_wrapper_health');
    assert.notEqual(index, -1);
    assert.equal(additiveAppMigrations[index - 1]?.id, '094_k4_semantic_snapshot_reconstruction');
  });

  it('lives in governance, not the shared ops schema', () => {
    assert.match(
      pipelineWrapperHealthMigrationSql,
      /CREATE OR REPLACE VIEW governance\.pipeline_wrapper_health_v1/,
    );
    assert.doesNotMatch(pipelineWrapperHealthMigrationSql, /CREATE OR REPLACE VIEW ops\./);
  });

  it('counts only settled attempts, so a run in flight is not a failure', () => {
    assert.match(pipelineWrapperHealthMigrationSql, /status <> 'running'/);
  });

  it('reports every settled attempt as failed when nothing has ever succeeded', () => {
    // COALESCE to the attempt count rather than NULL: "no success on record" is
    // the worst state this view can describe, not a missing measurement.
    assert.match(
      pipelineWrapperHealthMigrationSql,
      /COALESCE\(first_success\.recency - 1, latest\.recency\) AS consecutive_failures/,
    );
  });

  it('grants read to pipeline roles only, so the boot digest does not move', () => {
    assert.match(
      pipelineWrapperHealthMigrationSql,
      /REVOKE ALL ON governance\.pipeline_wrapper_health_v1 FROM PUBLIC/,
    );
    assert.match(
      pipelineWrapperHealthMigrationSql,
      /GRANT SELECT ON governance\.pipeline_wrapper_health_v1\s+TO si_readapi, si_knowledge, si_analytics, si_publisher/,
    );
    // stock_insight_app_reader would move EXPECTED_CATALOG_DIGESTS for both the
    // reader and the writer that inherits it, and migration 059 crashlooped the
    // brain that way on 2026-08-03. The header explains that in prose, so the
    // assertion has to be about GRANT statements rather than about the string.
    // Anchored to line start so the `-- GRANTS:` header comment is not mistaken
    // for a statement.
    const grants = pipelineWrapperHealthMigrationSql.match(/^GRANT[\s\S]*?;/gm) ?? [];
    assert.ok(grants.length > 0);
    for (const grant of grants) {
      assert.doesNotMatch(grant, /stock_insight_app_(reader|writer)/);
    }
  });

  it('names the two wrappers it cannot see', () => {
    // news and fundamentals run on timers but never call
    // pipeline_start_wrapper_attempt, so they leave no audit row. A view whose
    // name promises the fleet must say which part of the fleet is missing.
    assert.match(
      pipelineWrapperHealthMigrationSql,
      /COMMENT ON VIEW governance\.pipeline_wrapper_health_v1/,
    );
    assert.match(pipelineWrapperHealthMigrationSql, /news and fundamentals/);
  });

  it('adds nothing destructive', () => {
    for (const token of [/DROP TABLE/i, /DROP SCHEMA/i, /TRUNCATE/i, /DELETE FROM/i]) {
      assert.doesNotMatch(pipelineWrapperHealthMigrationSql, token);
    }
  });
});
