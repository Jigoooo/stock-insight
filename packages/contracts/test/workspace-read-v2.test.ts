import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { workspaceReadViewSchema, workspaceShellSummarySchema } from '../src/workspace-read-v2.ts';

describe('workspace read V2 contracts', () => {
  it('accepts exactly the five canonical workspace views', () => {
    for (const view of ['today', 'stocks', 'radar', 'history', 'status']) {
      assert.equal(workspaceReadViewSchema.parse(view), view);
    }
    for (const view of ['crypto', 'themes', 'research', 'market-topic-news']) {
      assert.equal(workspaceReadViewSchema.safeParse(view).success, false);
    }
  });

  it('keeps shell counters bounded and non-negative', () => {
    assert.deepEqual(
      workspaceShellSummarySchema.parse({ radarScopeTotal: 12, watchlistCount: 3 }),
      { radarScopeTotal: 12, watchlistCount: 3 },
    );
    assert.equal(
      workspaceShellSummarySchema.safeParse({ radarScopeTotal: -1, watchlistCount: 3 }).success,
      false,
    );
  });
});
