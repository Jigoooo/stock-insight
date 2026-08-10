import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getPersonalizationPortfolioImpactV2,
  type PersonalizationImpactV2QueryExecutor,
} from '../src/personalization/impact-v2-read-model.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;
const knownAt = new Date('2026-08-09T00:00:00.000Z');
const snapshotId = '11111111-1111-4111-8111-111111111111';
const scoreKinds = [
  'evidence_confidence',
  'relation_strength',
  'materiality',
  'transmission',
  'direction',
  'lag',
  'market_reflection',
  'model_uncertainty',
];

function coverageRows() {
  return Array.from({ length: 10 }, (_, index) => ({
    portfolio_snapshot_id: snapshotId,
    entity_key: `KR:${String(index + 1).padStart(6, '0')}`,
    portfolio_weight: index === 0 ? '0.1' : null,
    evaluation_count: '1',
    accepted_evaluation_count: index === 0 ? '1' : '0',
    reason_codes: index === 0 ? [] : ['no_recent_observation'],
    reason_details: index === 0 ? [] : ['no cutoff-valid observation'],
  }));
}

function exposureRow(id: number, unit: string) {
  return {
    portfolio_snapshot_id: snapshotId,
    impact_exposure_revision_id: String(id),
    impact_evaluation_revision_id: String(id + 100),
    entity_key: 'KR:000001',
    portfolio_weight: '0.1',
    sign: 'negative',
    horizon: 'short',
    channel_class: 'operational_capacity',
    economic_magnitude: '12',
    economic_magnitude_unit: unit,
    materiality: '0.2',
    uncertainty: '0.2',
    epistemic_confidence: '0.8',
    security_issuer_identity_id: '11',
    sector_playbook_id: '12',
    business_driver_id: '13',
    business_driver_measurement_rule_id: '14',
    information_set_id: 'k4:2026-08-08',
    valid_cutoff: '2026-08-08T14:59:59.999Z',
    source_available_cutoff: '2026-08-08T14:59:59.999Z',
    system_known_cutoff: '2026-08-08T14:59:59.999Z',
    market_observation_cutoff: '2026-08-08T14:59:59.999Z',
    semantic_snapshot_id: 'snapshot-1',
    derivation_id: '15',
    event_revision_id: '16',
    score_components: scoreKinds.map((kind) => ({ kind, value: 0.5, rationale: kind })),
    evidence_refs: [
      {
        numericFactId: '21',
        sourceRevisionId: '31',
        sourcePitQualityId: '41',
        pitQualityClass: 'PIT_C_OUR_ARCHIVE',
        inputRole: 'current',
      },
      {
        numericFactId: '22',
        sourceRevisionId: '32',
        sourcePitQualityId: '42',
        pitQualityClass: 'PIT_C_OUR_ARCHIVE',
        inputRole: 'comparison',
      },
    ],
    path_step_refs: [{ impactPathStepId: '51', citationRole: 'economic_basis' }],
  };
}

function executor(
  overrides: { exposures?: Record<string, unknown>[]; coverage?: Record<string, unknown>[] } = {},
) {
  const calls: Array<{ sql: string; parameters: readonly unknown[] }> = [];
  const queryExecutor: PersonalizationImpactV2QueryExecutor = {
    queryRows: async <TRow extends Record<string, unknown>>(
      sql: string,
      parameters: readonly unknown[] = [],
    ) => {
      calls.push({ sql, parameters });
      if (sql.includes('k4_selected_snapshot')) {
        return [{ portfolio_snapshot_id: snapshotId }] as unknown as TRow[];
      }
      if (sql.includes('k4_portfolio_impact_exposure_v2')) {
        return (overrides.exposures ?? [exposureRow(1, 'USD'), exposureRow(2, 'shares')]) as TRow[];
      }
      if (sql.includes('k4_portfolio_impact_coverage_v2')) {
        return (overrides.coverage ?? coverageRows()) as unknown as TRow[];
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  return { calls, queryExecutor };
}

describe('p4.v2 portfolio impact read model', () => {
  it('groups only equal horizon, channel, and unit while keeping user scope on every query', async () => {
    const fixture = executor();
    const result = await getPersonalizationPortfolioImpactV2(fixture.queryExecutor, {
      userScope,
      eventId: null,
      scenarioId: null,
      horizon: null,
      knownAt,
    });
    assert.ok(result);
    assert.equal(result.schemaVersion, 'p4.v2');
    assert.equal('aggregateImpact' in result, false);
    assert.deepEqual(
      result.groups.map((group) => group.economicMagnitude.unit),
      ['USD', 'shares'],
    );
    assert.equal(result.coverage.length, 10);
    assert.equal(fixture.calls.length, 3);
    for (const call of fixture.calls) assert.equal(call.parameters[0], userScope.userId);
    const sql = fixture.calls.map((call) => call.sql).join('\n');
    assert.match(sql, /analytics\.k4_portfolio_impact_coverage_v2/);
    assert.match(sql, /analytics\.k4_portfolio_impact_exposure_v2/);
    assert.match(sql, /analytics\.k4_portfolio_impact_path_step_v2/);
    assert.match(sql, /analytics\.k4_portfolio_impact_score_component_v2/);
    assert.match(sql, /analytics\.k4_portfolio_impact_evidence_v2/);
    assert.doesNotMatch(sql, /(?:FROM|JOIN) analytics\.impact_evaluation_revision/);
    assert.doesNotMatch(sql, /(?:FROM|JOIN) analytics\.impact_score_component/);
    assert.doesNotMatch(sql, /(?:FROM|JOIN) governance\.source_pit_quality/);
    const exposureSql = fixture.calls.find((call) =>
      call.sql.includes('/* k4_portfolio_impact_exposure_v2 */'),
    )?.sql;
    assert.ok(exposureSql);
    assert.match(
      exposureSql,
      /positions AS[\s\S]*sum\(lot\.portfolio_weight\)[\s\S]*JOIN positions/,
    );
    assert.match(
      exposureSql,
      /evaluation_created_at <= \$3[\s\S]*information_set_created_at <= \$3/,
    );
    assert.match(sql, /successor\.revision_no > coverage\.revision_no/);
  });

  it('returns null without a user-owned sealed snapshot', async () => {
    let calls = 0;
    const queryExecutor: PersonalizationImpactV2QueryExecutor = {
      queryRows: async () => {
        calls += 1;
        return [];
      },
    };
    assert.equal(
      await getPersonalizationPortfolioImpactV2(queryExecutor, {
        userScope,
        eventId: null,
        scenarioId: null,
        horizon: null,
        knownAt,
      }),
      null,
    );
    assert.equal(calls, 1);
  });

  it('fails closed on an incomplete score decomposition', async () => {
    const malformed = exposureRow(1, 'USD');
    malformed.score_components.pop();
    await assert.rejects(
      getPersonalizationPortfolioImpactV2(executor({ exposures: [malformed] }).queryExecutor, {
        userScope,
        eventId: null,
        scenarioId: null,
        horizon: null,
        knownAt,
      }),
      /score|component/i,
    );
  });

  it('serves a coverage set of any size, because the size is not its to police', async () => {
    // This path used to demand exactly ten rows, which is what made growing the K4
    // cohort a 500 rather than a longer answer. There is no honest count to compare
    // against here: the coverage query already returns every security evaluated under
    // one information set, so the rows ARE the evaluated set. "The whole requested
    // universe was evaluated" is checked in the K4 store, where the request lives.
    for (const size of [1, 3, 10]) {
      const response = await getPersonalizationPortfolioImpactV2(
        executor({ coverage: coverageRows().slice(0, size) }).queryExecutor,
        { userScope, eventId: null, scenarioId: null, horizon: null, knownAt },
      );
      assert.equal(response.coverage.length, size);
    }
  });

  it('still refuses coverage that crossed snapshot identity', async () => {
    // The check that remains, and the one with a real comparand: every coverage row
    // must belong to the snapshot the response names.
    const crossed = coverageRows();
    const first = crossed[0];
    if (first) first.portfolio_snapshot_id = '22222222-2222-4222-8222-222222222222';
    await assert.rejects(
      getPersonalizationPortfolioImpactV2(executor({ coverage: crossed }).queryExecutor, {
        userScope,
        eventId: null,
        scenarioId: null,
        horizon: null,
        knownAt,
      }),
      /snapshot identity/i,
    );
  });
});
