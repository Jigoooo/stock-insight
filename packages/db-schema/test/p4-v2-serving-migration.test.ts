import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { additiveAppMigrations } from '../src/index.ts';
import { p4V2ServingMigrationSql } from '../src/migrations/092_p4_v2_serving.ts';

describe('092 p4.v2 fail-closed serving views', () => {
  it('is registered after the K4 receipt migration', () => {
    const servingIndex = additiveAppMigrations.findIndex(({ id }) => id === '092_p4_v2_serving');
    assert.notEqual(servingIndex, -1);
    assert.equal(
      additiveAppMigrations[servingIndex - 1]?.id,
      '091_k4_market_intelligence_run_receipt',
    );
  });

  it('exposes coverage but admits exposures only through accepted sealed evaluations', () => {
    assert.match(p4V2ServingMigrationSql, /k4_portfolio_impact_coverage_v2/);
    assert.match(p4V2ServingMigrationSql, /k4_portfolio_impact_exposure_v2/);
    assert.match(p4V2ServingMigrationSql, /accepted_impact_evaluation_v1/);
    assert.match(p4V2ServingMigrationSql, /exposure\.exposure_state = 'sealed'/);
    assert.match(p4V2ServingMigrationSql, /count\(DISTINCT component\.component_kind\) = 8/);
    assert.match(p4V2ServingMigrationSql, /accepted_impact_evaluation_evidence_v1/);
    assert.match(p4V2ServingMigrationSql, /evaluation\.created_at AS evaluation_created_at/);
    assert.match(
      p4V2ServingMigrationSql,
      /information_set\.created_at AS information_set_created_at/,
    );
    assert.match(p4V2ServingMigrationSql, /evaluation\.supersedes_impact_evaluation_revision_id/);
  });

  it('serves path steps only through the exposure citation bridge', () => {
    assert.match(p4V2ServingMigrationSql, /k4_portfolio_impact_path_step_v2/);
    assert.match(p4V2ServingMigrationSql, /impact_path_step_exposure_citation/);
    assert.match(p4V2ServingMigrationSql, /JOIN analytics\.k4_portfolio_impact_exposure_v2/);
  });

  it('projects score components and PIT evidence only through exposure-scoped safe views', () => {
    assert.match(p4V2ServingMigrationSql, /k4_portfolio_impact_score_component_v2/);
    assert.match(p4V2ServingMigrationSql, /k4_portfolio_impact_evidence_v2/);
    assert.match(
      p4V2ServingMigrationSql,
      /JOIN analytics\.k4_portfolio_impact_exposure_v2[\s\S]*PIT_C_OUR_ARCHIVE/,
    );
  });

  it('grants only the filtered views to readapi', () => {
    assert.match(
      p4V2ServingMigrationSql,
      /GRANT SELECT ON[\s\S]*k4_portfolio_impact_coverage_v2[\s\S]*k4_portfolio_impact_exposure_v2[\s\S]*k4_portfolio_impact_path_step_v2[\s\S]*TO si_readapi/,
    );
    assert.doesNotMatch(p4V2ServingMigrationSql, /GRANT (?:INSERT|UPDATE|DELETE)[\s\S]*si_readapi/);
  });

  it('revokes K4 raw ledgers from the runtime app reader and grants only safe projections', () => {
    assert.match(
      p4V2ServingMigrationSql,
      /REVOKE SELECT ON[\s\S]*impact_evaluation_revision[\s\S]*impact_evaluation_evidence[\s\S]*impact_exposure_revision[\s\S]*impact_score_component[\s\S]*FROM stock_insight_app_reader/,
    );
    assert.match(
      p4V2ServingMigrationSql,
      /GRANT SELECT ON[\s\S]*k4_portfolio_impact_coverage_v2[\s\S]*k4_portfolio_impact_exposure_v2[\s\S]*k4_portfolio_impact_score_component_v2[\s\S]*k4_portfolio_impact_evidence_v2[\s\S]*k4_portfolio_impact_path_step_v2[\s\S]*TO stock_insight_app_reader/,
    );
    const runtimeGrant = p4V2ServingMigrationSql.match(
      /GRANT USAGE ON SCHEMA analytics TO stock_insight_app_reader;\s*GRANT SELECT ON([\s\S]*?)TO stock_insight_app_reader/,
    );
    assert.ok(runtimeGrant);
    assert.doesNotMatch(
      runtimeGrant[1] ?? '',
      /(?:^|[.,\s])impact_evaluation_revision(?:$|[.,\s])/,
    );
  });

  it('executes the v2 read model against disposable PostgreSQL with PIT and multi-lot checks', () => {
    const rehearsal = readFileSync(
      new URL('../../../apps/api/scripts/run-kernel-db-rehearsal.mjs', import.meta.url),
      'utf8',
    );
    assert.match(rehearsal, /getPersonalizationPortfolioImpactV2/);
    assert.match(rehearsal, /readModelExecutesAgainstPostgres/);
    assert.match(rehearsal, /multipleLotsAggregateOnce/);
    assert.match(rehearsal, /futureCreatedEvaluationStaysHidden/);
  });
});
