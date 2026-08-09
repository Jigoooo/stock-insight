import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { orchestrateResearchWorkspaceView } from '../src/server/research-workspace-orchestrator.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('research workspace request orchestration', () => {
  it('does not block the default Today view on a closed inspector detail', async () => {
    let recordCalls = 0;
    const result = await orchestrateResearchWorkspaceView(
      {
        loadShell: async () => ({ radarScopeTotal: 7, watchlistCount: 4 }),
        loadToday: async () => ({ defaultRecordKey: 'record-1' }),
        loadRecord: async () => {
          recordCalls += 1;
          return { recordKey: 'record-1' };
        },
      } as never,
      'user-1',
      { view: 'today' },
    );

    assert.equal(recordCalls, 0);
    assert.equal(result.view, 'today');
    if (result.view === 'today') assert.equal(result.defaultRecord, null);
  });

  it('loads a Today detail when an explicit record is requested', async () => {
    const result = await orchestrateResearchWorkspaceView(
      {
        loadShell: async () => ({ radarScopeTotal: 7, watchlistCount: 4 }),
        loadToday: async () => ({ defaultRecordKey: 'default-record' }),
        loadRecord: async (_userId: string, recordKey: string) => ({ recordKey }),
      } as never,
      'user-1',
      { record: 'requested-record', view: 'today' },
    );

    assert.equal(result.view, 'today');
    if (result.view === 'today') {
      assert.deepEqual(result.defaultRecord, { recordKey: 'requested-record' });
    }
  });

  it('starts the active stock slice and the combined shell summary together', async () => {
    const calls: string[] = [];
    const shell = deferred<{ radarScopeTotal: number; watchlistCount: number }>();
    const stocks = deferred<{ data: unknown[] }>();

    const resultPromise = orchestrateResearchWorkspaceView(
      {
        loadShell: () => {
          calls.push('shell');
          return shell.promise;
        },
        loadStocks: () => {
          calls.push('stocks');
          return stocks.promise;
        },
      } as never,
      'user-1',
      { view: 'stocks' },
    );

    await Promise.resolve();
    assert.deepEqual(calls, ['shell', 'stocks']);

    shell.resolve({ radarScopeTotal: 7, watchlistCount: 4 });
    stocks.resolve({ data: [] });

    const result = await resultPromise;
    assert.equal(result.view, 'stocks');
    assert.deepEqual(result.shell, { radarScopeTotal: 7, watchlistCount: 4 });
  });
});
