import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getWorkspaceViewBundleV2,
  parseWorkspaceViewBundleQuery,
} from '../src/workspace/view-bundle-v2.ts';

const executor = { queryRows: async () => [] };
const userScope = { kind: 'user' as const, userId: '11111111-1111-4111-8111-111111111111' };

describe('workspace view bundle V2', () => {
  it('rejects parameters that do not belong to the selected view', () => {
    assert.deepEqual(parseWorkspaceViewBundleQuery('today', { lane: 'must_know' }), {
      lane: 'must_know',
    });
    assert.deepEqual(parseWorkspaceViewBundleQuery('radar', { cursor: 'next' }), {
      cursor: 'next',
    });
    assert.throws(() => parseWorkspaceViewBundleQuery('stocks', { cursor: 'next' }));
    assert.throws(() => parseWorkspaceViewBundleQuery('history', { lane: 'explore' }));
    assert.throws(() => parseWorkspaceViewBundleQuery('today', { record: 'x'.repeat(321) }));
  });

  it('uses the same executor and user scope for shell and the active read model', async () => {
    const seen: Array<{ executor: unknown; scope: unknown; name: string }> = [];
    const shell = { radarScopeTotal: 7, watchlistCount: 2 };
    const stocks = {
      availability: 'available',
      data: [],
      error: null,
      meta: { source: 'database', generatedAt: '2026-08-09T00:00:00.000Z' },
    } as const;

    const result = await getWorkspaceViewBundleV2(executor, {
      userScope,
      view: 'stocks',
      dependencies: {
        shell: async (received, options) => {
          seen.push({ executor: received, scope: options.userScope, name: 'shell' });
          return shell;
        },
        stocks: async (received, options) => {
          seen.push({ executor: received, scope: options.userScope, name: 'stocks' });
          return stocks;
        },
      },
    });

    assert.deepEqual(result, { view: 'stocks', shell, stocks });
    assert.deepEqual(seen, [
      { executor, scope: userScope, name: 'shell' },
      { executor, scope: userScope, name: 'stocks' },
    ]);
  });
});
