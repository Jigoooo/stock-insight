import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createWorkspaceViewState,
  reduceWorkspaceViewState,
} from '../src/pages/research-workspace/ui/workspace-view-transition-state.ts';

describe('workspace view transition state', () => {
  it('retains the previous authoritative layer when a new view becomes ready', () => {
    const today = createWorkspaceViewState('today', 'today-content');
    const radar = reduceWorkspaceViewState(today, {
      layer: { content: 'radar-content', key: 'radar' },
      type: 'sync',
    });

    assert.deepEqual(radar, {
      active: { content: 'radar-content', key: 'radar' },
      exiting: { content: 'today-content', key: 'today' },
    });
  });

  it('lets only the latest rapid intent finish the transition', () => {
    const today = createWorkspaceViewState('today', 'today-content');
    const radar = reduceWorkspaceViewState(today, {
      layer: { content: 'radar-content', key: 'radar' },
      type: 'sync',
    });
    const status = reduceWorkspaceViewState(radar, {
      layer: { content: 'status-content', key: 'status' },
      type: 'sync',
    });
    const staleFinish = reduceWorkspaceViewState(status, {
      activeKey: 'radar',
      type: 'finish',
    });
    const latestFinish = reduceWorkspaceViewState(staleFinish, {
      activeKey: 'status',
      type: 'finish',
    });

    assert.deepEqual(staleFinish, {
      active: { content: 'status-content', key: 'status' },
      exiting: { content: 'radar-content', key: 'radar' },
    });
    assert.deepEqual(latestFinish, {
      active: { content: 'status-content', key: 'status' },
      exiting: null,
    });
  });

  it('updates same-view data without creating a decorative transition', () => {
    const initial = createWorkspaceViewState('today', 'old-content');
    const refreshed = reduceWorkspaceViewState(initial, {
      layer: { content: 'fresh-content', key: 'today' },
      type: 'sync',
    });

    assert.deepEqual(refreshed, {
      active: { content: 'fresh-content', key: 'today' },
      exiting: null,
    });
  });
});
