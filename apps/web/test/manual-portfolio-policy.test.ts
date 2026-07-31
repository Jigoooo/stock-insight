import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  areManualPortfolioMutationsEnabled,
  areRemoteBrainMutationsDisabled,
  resolveManualPortfolioMutationPolicy,
  routeManualPortfolioMutation,
} from '../src/server/mutation-policy.ts';

test('remote brain mutations are disabled only by an explicit read-only flag', () => {
  assert.equal(areRemoteBrainMutationsDisabled({}), false);
  assert.equal(areRemoteBrainMutationsDisabled({ STOCK_INSIGHT_REMOTE_READ_ONLY: 'false' }), false);
  assert.equal(areRemoteBrainMutationsDisabled({ STOCK_INSIGHT_REMOTE_READ_ONLY: 'true' }), true);
});

test('manual portfolio mutations are enabled only by an explicit true flag', () => {
  assert.equal(areManualPortfolioMutationsEnabled({}), false);
  assert.equal(
    areManualPortfolioMutationsEnabled({ STOCK_INSIGHT_MUTATIONS_ENABLED: 'false' }),
    false,
  );
  assert.equal(
    areManualPortfolioMutationsEnabled({ STOCK_INSIGHT_MUTATIONS_ENABLED: 'TRUE' }),
    false,
  );
  assert.equal(
    areManualPortfolioMutationsEnabled({ STOCK_INSIGHT_MUTATIONS_ENABLED: 'true' }),
    true,
  );
});

test('manual portfolio mutation policy exposes a fail-closed HTTP contract', () => {
  assert.deepEqual(resolveManualPortfolioMutationPolicy({}), {
    enabled: false,
    status: 503,
    errorCode: 'MANUAL_PORTFOLIO_MUTATIONS_DISABLED',
  });
  assert.deepEqual(
    resolveManualPortfolioMutationPolicy({ STOCK_INSIGHT_MUTATIONS_ENABLED: 'true' }),
    {
      enabled: true,
    },
  );
});

test('disabled mutation policy never evaluates the database-backed branch', async () => {
  let databaseBranchCalls = 0;
  const policy = resolveManualPortfolioMutationPolicy({});

  const result = await routeManualPortfolioMutation(policy, {
    disabled: () => 'disabled',
    enabled: async () => {
      databaseBranchCalls += 1;
      return 'enabled';
    },
  });

  assert.equal(result, 'disabled');
  assert.equal(databaseBranchCalls, 0);
});

test('enabled mutation policy evaluates the database-backed branch exactly once', async () => {
  let databaseBranchCalls = 0;
  const policy = resolveManualPortfolioMutationPolicy({
    STOCK_INSIGHT_MUTATIONS_ENABLED: 'true',
  });

  const result = await routeManualPortfolioMutation(policy, {
    disabled: () => 'disabled',
    enabled: async () => {
      databaseBranchCalls += 1;
      return 'enabled';
    },
  });

  assert.equal(result, 'enabled');
  assert.equal(databaseBranchCalls, 1);
});
