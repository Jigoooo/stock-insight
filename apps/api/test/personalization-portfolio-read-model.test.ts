import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getPersonalizationPortfolioSnapshot,
  type PersonalizationQueryExecutor,
} from '../src/personalization/portfolio-read-model.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;
const snapshotId = '11111111-1111-4111-8111-111111111111';

describe('P4-C portfolio snapshot read model', () => {
  it('returns one sealed same-user snapshot without leaking the user id', async () => {
    let capturedSql = '';
    let capturedParameters: readonly unknown[] = [];
    const executor: PersonalizationQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(
        sql: string,
        parameters: readonly unknown[] = [],
      ) => {
        capturedSql = sql;
        capturedParameters = parameters;
        return [
          {
            portfolio_snapshot_id: snapshotId,
            snapshot_as_of: '2026-07-23T00:00:00.000Z',
            source_known_at: '2026-07-23T00:01:00.000Z',
            sealed_at: '2026-07-23T00:02:00.000Z',
            base_currency: 'USD',
            total_market_value: '100000.00000000',
            position_count: 1,
            snapshot_digest: 'a'.repeat(64),
            entity_key: 'US:NVDA',
            entity_name: 'NVIDIA',
            market: 'US',
            currency: 'USD',
            quantity: '10.0000000000',
            market_value: '10000.00000000',
            portfolio_weight: '0.10000000',
            cost_basis_total: '9000.00000000',
            acquired_at: null,
          },
        ] as unknown as TRow[];
      },
    };

    const result = await getPersonalizationPortfolioSnapshot(executor, {
      userScope,
      snapshotId,
    });
    assert.ok(result);
    assert.equal(result.portfolioSnapshotId, snapshotId);
    assert.equal(result.positions[0]?.entityKey, 'US:NVDA');
    assert.equal('userId' in result, false);
    assert.match(capturedSql, /JOIN personalization\.portfolio_snapshot_seal seal/);
    assert.match(capturedSql, /snapshot\.user_id = \$1::uuid/);
    assert.match(capturedSql, /lot\.user_id = selected\.user_id/);
    assert.deepEqual(capturedParameters, [userScope.userId, snapshotId]);
  });

  it('returns null for an empty user scope and rejects count or identity corruption', async () => {
    const empty: PersonalizationQueryExecutor = { queryRows: async () => [] };
    assert.equal(
      await getPersonalizationPortfolioSnapshot(empty, { userScope, snapshotId: null }),
      null,
    );

    const corrupt: PersonalizationQueryExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>() =>
        [
          {
            portfolio_snapshot_id: snapshotId,
            snapshot_as_of: '2026-07-23T00:00:00.000Z',
            source_known_at: '2026-07-23T00:01:00.000Z',
            sealed_at: '2026-07-23T00:02:00.000Z',
            base_currency: 'USD',
            total_market_value: '100000.00000000',
            position_count: 1,
            snapshot_digest: 'a'.repeat(64),
            entity_key: null,
            entity_name: 'NVIDIA',
            market: 'US',
            currency: 'USD',
            quantity: '10.0000000000',
            market_value: '10000.00000000',
            portfolio_weight: '0.10000000',
            cost_basis_total: null,
            acquired_at: null,
          },
        ] as unknown as TRow[],
    };
    await assert.rejects(
      getPersonalizationPortfolioSnapshot(corrupt, { userScope, snapshotId }),
      /identity/i,
    );
  });
});
