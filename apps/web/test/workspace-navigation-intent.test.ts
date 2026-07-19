import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createWorkspaceNavigationIntentState,
  reduceWorkspaceNavigationIntent,
} from '../src/pages/research-workspace/model/workspace-navigation-intent.ts';

describe('workspace navigation intent', () => {
  it('marks only the target pending while authoritative section and lane remain external', () => {
    const initial = createWorkspaceNavigationIntentState();
    const section = reduceWorkspaceNavigationIntent(initial, {
      kind: 'section',
      sequence: 1,
      type: 'request',
      value: 'radar',
    });
    const lane = reduceWorkspaceNavigationIntent(section, {
      kind: 'lane',
      sequence: 2,
      type: 'request',
      value: 'explore',
    });

    assert.deepEqual(section, {
      pendingLane: null,
      pendingSection: 'radar',
      sequence: 1,
    });
    assert.deepEqual(lane, {
      pendingLane: 'explore',
      pendingSection: null,
      sequence: 2,
    });
    assert.equal('authoritativeSection' in lane, false);
    assert.equal('authoritativeLane' in lane, false);
  });

  it('lets only the latest rapid intent clear pending state', () => {
    const first = reduceWorkspaceNavigationIntent(createWorkspaceNavigationIntentState(), {
      kind: 'section',
      sequence: 1,
      type: 'request',
      value: 'radar',
    });
    const second = reduceWorkspaceNavigationIntent(first, {
      kind: 'section',
      sequence: 2,
      type: 'request',
      value: 'themes',
    });
    const third = reduceWorkspaceNavigationIntent(second, {
      kind: 'section',
      sequence: 3,
      type: 'request',
      value: 'status',
    });

    assert.equal(reduceWorkspaceNavigationIntent(third, { sequence: 1, type: 'settle' }), third);
    assert.equal(reduceWorkspaceNavigationIntent(third, { sequence: 2, type: 'settle' }), third);
    assert.deepEqual(
      reduceWorkspaceNavigationIntent(third, { sequence: 3, type: 'settle' }),
      createWorkspaceNavigationIntentState(3),
    );
  });

  it('clears the latest failed intent without inventing an authoritative commit', () => {
    const pending = reduceWorkspaceNavigationIntent(createWorkspaceNavigationIntentState(), {
      kind: 'lane',
      sequence: 4,
      type: 'request',
      value: 'for_you',
    });

    assert.deepEqual(
      reduceWorkspaceNavigationIntent(pending, {
        sequence: 4,
        type: 'settle',
      }),
      createWorkspaceNavigationIntentState(4),
    );
  });
});
