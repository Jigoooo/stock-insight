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

  // REQ-SRC-001: "there is none" and "we have not worked it out" are different
  // answers. analytics.impact_exposure_revision is empty on purpose, so this is
  // the path every real user hits today.
  it('reports not_computed when the snapshot is sealed but the exposure ledger is empty', async () => {
    const queries: string[] = [];
    const executor: PersonalizationImpactQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(query: string) => {
        queries.push(query);
        // First query joins the empty exposure ledger and yields nothing; the
        // follow-up asks only whether a sealed snapshot exists.
        if (queries.length === 1) return [] as unknown as TRow[];
        return [
          { portfolio_snapshot_id: '22222222-2222-4222-8222-222222222222' },
        ] as unknown as TRow[];
      },
    };

    const result = await getPersonalizationPortfolioImpact(executor, {
      userScope,
      eventId: null,
      scenarioId: null,
      horizon: null,
      knownAt,
    });

    assert.ok(result, 'a sealed snapshot must not be reported as not-found');
    assert.equal(result.availability, 'not_computed');
    assert.equal(result.portfolioSnapshotId, '22222222-2222-4222-8222-222222222222');
    assert.deepEqual(result.affectedPositions, []);
    assert.equal(result.aggregateImpact, 0);
    assert.equal(queries.length, 2, 'the fallback lookup runs only when the first query is empty');
    // The fallback must not re-join the exposure ledger, or it would be empty too.
    assert.doesNotMatch(queries[1] ?? '', /impact_exposure_revision/);
  });

  it('does not run the fallback lookup when impact rows exist', async () => {
    let calls = 0;
    const executor: PersonalizationImpactQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>() => {
        calls += 1;
        return [
          {
            portfolio_snapshot_id: '11111111-1111-4111-8111-111111111111',
            entity_key: 'US:NVDA',
            portfolio_weight: '0.10000000',
            sign: 'positive',
            economic_magnitude: '0.20000000',
            impact_exposure_revision_id: '78',
            evidence_locator: { source_uri: 'source:filing:2' },
          },
        ] as unknown as TRow[];
      },
    };
    const result = await getPersonalizationPortfolioImpact(executor, {
      userScope,
      eventId: null,
      scenarioId: null,
      horizon: null,
      knownAt,
    });
    assert.equal(result?.availability, 'available');
    assert.equal(calls, 1);
  });
});
