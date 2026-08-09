import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getWorkspaceViewBundleV2,
  parseWorkspaceViewBundleQuery,
} from '../src/workspace/view-bundle-v2.ts';

const queryCalls: string[] = [];
const executor = {
  queryRows: async (sql: string) => {
    queryCalls.push(sql);
    return [];
  },
};
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
    queryCalls.length = 0;
    const seen: Array<{ scope: unknown; name: string }> = [];
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
          await received.queryRows('shell query');
          seen.push({ scope: options.userScope, name: 'shell' });
          return shell;
        },
        stocks: async (received, options) => {
          await received.queryRows('stocks query');
          seen.push({ scope: options.userScope, name: 'stocks' });
          return stocks;
        },
      },
      reportQueryMetric: () => undefined,
    });

    assert.deepEqual(result, { view: 'stocks', shell, stocks });
    assert.deepEqual(seen, [
      { scope: userScope, name: 'shell' },
      { scope: userScope, name: 'stocks' },
    ]);
    assert.deepEqual(queryCalls, ['shell query', 'stocks query']);
  });

  it('builds all five view discriminants without reading an inactive surface', async () => {
    const calls: string[] = [];
    const common = {
      shell: async () => {
        calls.push('shell');
        return { radarScopeTotal: 0, watchlistCount: 0 };
      },
      today: async () => {
        calls.push('today');
        return { lanes: [] } as never;
      },
      stocks: async () => {
        calls.push('stocks');
        return { availability: 'collecting', data: [], error: null, meta: {} } as never;
      },
      radar: async () => {
        calls.push('radar');
        return { items: [] } as never;
      },
      geo: async () => {
        calls.push('geo');
        return { geojson: { features: [] } } as never;
      },
      history: async () => {
        calls.push('history');
        return { items: [] } as never;
      },
      status: async () => {
        calls.push('status');
        return { datasets: [] } as never;
      },
    };

    for (const [view, expected] of [
      ['today', ['shell', 'today']],
      ['stocks', ['shell', 'stocks']],
      ['radar', ['shell', 'radar', 'geo']],
      ['history', ['shell', 'history']],
      ['status', ['shell', 'status']],
    ] as const) {
      calls.length = 0;
      const result = await getWorkspaceViewBundleV2(executor, {
        dependencies: common,
        reportQueryMetric: () => undefined,
        userScope,
        view,
      });
      assert.equal(result.view, view);
      assert.deepEqual(calls, expected);
    }
  });
});
