import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  getWorkspaceConcurrencyPolicy,
  isLatestWorkspaceIntent,
  shouldShowSettledEmpty,
  WORKSPACE_CONCURRENCY_POLICY,
} from '../src/pages/research-workspace/model/workspace-transition-policy.ts';

const workspacePageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);

describe('workspace concurrency policy', () => {
  it('locks every approved interaction to its urgency lane', () => {
    assert.deepEqual(WORKSPACE_CONCURRENCY_POLICY, {
      'search-input': {
        lane: 'urgent',
        pending: 'none',
        preservesAuthoritativeContent: false,
      },
      'search-results': {
        lane: 'deferred',
        pending: 'stale-results',
        preservesAuthoritativeContent: true,
      },
      'sidebar-navigation': {
        lane: 'transition',
        pending: 'target-intent',
        preservesAuthoritativeContent: true,
      },
      'lane-navigation': {
        lane: 'transition',
        pending: 'target-intent',
        preservesAuthoritativeContent: true,
      },
      'inspector-open': {
        lane: 'urgent',
        pending: 'none',
        preservesAuthoritativeContent: false,
      },
      'inspector-data': {
        lane: 'async',
        pending: 'explicit-loading',
        preservesAuthoritativeContent: true,
      },
      pagination: {
        lane: 'async',
        pending: 'explicit-loading',
        preservesAuthoritativeContent: true,
      },
      'switch-toggle': {
        lane: 'urgent',
        pending: 'none',
        preservesAuthoritativeContent: false,
      },
      'mobile-navigation': {
        lane: 'urgent',
        pending: 'none',
        preservesAuthoritativeContent: false,
      },
      'relation-data': {
        lane: 'async',
        pending: 'explicit-loading',
        preservesAuthoritativeContent: true,
      },
    });
  });

  it('never routes controlled search input through a transition', () => {
    assert.equal(getWorkspaceConcurrencyPolicy('search-input').lane, 'urgent');
    assert.notEqual(getWorkspaceConcurrencyPolicy('search-input').lane, 'transition');
    assert.equal(getWorkspaceConcurrencyPolicy('switch-toggle').lane, 'urgent');
    assert.equal(getWorkspaceConcurrencyPolicy('mobile-navigation').lane, 'urgent');
  });

  it('shows empty only after deferred results settle without loading or error', () => {
    const baseline = { resultCount: 0, isLoading: false, hasError: false };

    assert.equal(shouldShowSettledEmpty({ ...baseline, query: 'sam', deferredQuery: 'sa' }), false);
    assert.equal(
      shouldShowSettledEmpty({ ...baseline, query: 'sam', deferredQuery: 'sam', isLoading: true }),
      false,
    );
    assert.equal(
      shouldShowSettledEmpty({ ...baseline, query: 'sam', deferredQuery: 'sam', hasError: true }),
      false,
    );
    assert.equal(shouldShowSettledEmpty({ ...baseline, query: 'sam', deferredQuery: 'sam' }), true);
    assert.equal(
      shouldShowSettledEmpty({
        ...baseline,
        query: 'sam',
        deferredQuery: 'sam',
        resultCount: 1,
      }),
      false,
    );
  });

  it('lets only the latest asynchronous intent commit', () => {
    assert.equal(isLatestWorkspaceIntent(3, 3), true);
    assert.equal(isLatestWorkspaceIntent(3, 2), false);
    assert.equal(isLatestWorkspaceIntent('view:status:4', 'view:status:4'), true);
    assert.equal(isLatestWorkspaceIntent('view:status:4', 'view:radar:3'), false);
  });

  it('guards rapid theme relation requests and invalidates them when leaving the view', async () => {
    const page = await readFile(workspacePageUrl, 'utf8');

    assert.match(page, /themeRelationSequenceRef = useRef\(0\)/);
    assert.match(page, /const sequence = \+\+themeRelationSequenceRef\.current/);
    assert.match(
      page,
      /if \(!isLatestWorkspaceIntent\(themeRelationSequenceRef\.current, sequence\)\) return/,
    );
    assert.match(
      page,
      /if \(next !== 'themes'\) \{[\s\S]*?themeRelationSequenceRef\.current \+= 1[\s\S]*?setThemeRelation\(undefined\)/,
    );
  });
});
