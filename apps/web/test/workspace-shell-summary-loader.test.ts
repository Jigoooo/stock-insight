import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createWorkspaceShellSummaryLoader } from '../src/server/workspace-shell-summary-loader.ts';

describe('workspace shell summary loader', () => {
  it('coalesces concurrent reads and reuses the summary until its short TTL expires', async () => {
    let now = 1_000;
    let calls = 0;
    const load = createWorkspaceShellSummaryLoader(
      async () => {
        calls += 1;
        return { radarScopeTotal: 7, watchlistCount: 4 };
      },
      { now: () => now, ttlMs: 60_000 },
    );

    const [first, second] = await Promise.all([load('user-1'), load('user-1')]);
    assert.deepEqual(first, second);
    assert.equal(calls, 1);

    now += 59_999;
    await load('user-1');
    assert.equal(calls, 1);

    now += 1;
    await load('user-1');
    assert.equal(calls, 2);
  });

  it('does not retain a failed request', async () => {
    let calls = 0;
    const load = createWorkspaceShellSummaryLoader(async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary failure');
      return { radarScopeTotal: 7, watchlistCount: 4 };
    });

    await assert.rejects(load('user-1'), /temporary failure/);
    await load('user-1');
    assert.equal(calls, 2);
  });
});
