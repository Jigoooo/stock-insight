import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getPersonalizationPortfolioImpact,
  type PersonalizationImpactQueryExecutor,
} from '../src/personalization/impact-read-model.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;
const knownAt = new Date('2026-07-23T00:30:00.000Z');

describe('P4-C portfolio impact v1 compatibility read model', () => {
  it('returns not_computed without reading or summing unit-aware exposures', async () => {
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
          { portfolio_snapshot_id: '11111111-1111-4111-8111-111111111111' },
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
    assert.equal(result.schemaVersion, 'p4.v1');
    assert.equal(result.availability, 'not_computed');
    assert.equal(result.aggregateImpact, 0);
    assert.deepEqual(result.affectedPositions, []);
    assert.match(sql, /snapshot\.user_id = \$1::uuid/);
    assert.doesNotMatch(sql, /impact_exposure_revision|economic_magnitude/);
    assert.deepEqual(parameters, [userScope.userId, knownAt.toISOString()]);
  });

  it('returns null when the authenticated user has no sealed snapshot', async () => {
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

  it('validates bounded filters before reading the database', async () => {
    let calls = 0;
    const executor: PersonalizationImpactQueryExecutor = {
      queryRows: async () => {
        calls += 1;
        return [];
      },
    };
    await assert.rejects(
      getPersonalizationPortfolioImpact(executor, {
        userScope,
        eventId: null,
        scenarioId: null,
        horizon: 'weekly',
        knownAt,
      }),
      /horizon is invalid/,
    );
    assert.equal(calls, 0);
  });
});
