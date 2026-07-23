import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getPersonalizationPortfolioImpact,
  type PersonalizationImpactQueryExecutor,
} from '../src/personalization/impact-read-model.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;
const knownAt = new Date('2026-07-23T00:30:00.000Z');

describe('P4-C portfolio impact read model', () => {
  it('weights sealed PIT economic magnitude by the authenticated portfolio snapshot', async () => {
    let sql = '';
    let parameters: readonly unknown[] = [];
    const executor: PersonalizationImpactQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(
        query: string,
        queryParameters: readonly unknown[] = [],
      ) => {
        sql = query;
        parameters = queryParameters;
        return [
          {
            portfolio_snapshot_id: '11111111-1111-4111-8111-111111111111',
            entity_key: 'US:NVDA',
            portfolio_weight: '0.10000000',
            sign: 'negative',
            economic_magnitude: '0.40000000',
            impact_exposure_revision_id: '77',
            evidence_locator: { source_uri: 'source:filing:1' },
          },
        ] as unknown as TRow[];
      },
    };
    const result = await getPersonalizationPortfolioImpact(executor, {
      userScope,
      eventId: 'event:nvda:1',
      scenarioId: 'scenario:base',
      horizon: 'short',
      knownAt,
    });
    assert.ok(result);
    assert.equal(result.aggregateImpact, -0.04);
    assert.equal(result.affectedPositions[0]?.impactScore, -0.4);
    assert.deepEqual(result.affectedPositions[0]?.evidenceRefs, ['source:filing:1']);
    assert.match(sql, /snapshot\.user_id = \$1::uuid/);
    assert.match(sql, /exposure\.exposure_state = 'sealed'/);
    assert.match(sql, /exposure\.known_at <= \$5::timestamptz/);
    assert.match(sql, /NOT EXISTS[\s\S]*successor\.supersedes_impact_exposure_revision_id/);
    assert.deepEqual(parameters, [
      userScope.userId,
      'event:nvda:1',
      'scenario:base',
      'short',
      knownAt.toISOString(),
    ]);
  });

  it('returns null when the user has no sealed snapshot', async () => {
    const executor: PersonalizationImpactQueryExecutor = { queryRows: async () => [] };
    assert.equal(
      await getPersonalizationPortfolioImpact(executor, {
        userScope,
        eventId: null,
        scenarioId: null,
        horizon: null,
        knownAt,
      }),
      null,
    );
  });
});
