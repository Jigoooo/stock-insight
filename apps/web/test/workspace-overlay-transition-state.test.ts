import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createWorkspaceOverlayState,
  reduceWorkspaceOverlayState,
} from '../src/pages/research-workspace/ui/workspace-overlay-transition-state.ts';

describe('workspace overlay transition state', () => {
  it('applies open semantics immediately before decorative motion settles', () => {
    const closed = createWorkspaceOverlayState(false);
    const opening = reduceWorkspaceOverlayState(closed, { open: true, type: 'request' });

    assert.deepEqual(opening, {
      desiredOpen: true,
      phase: 'opening',
      rendered: true,
      token: 1,
    });
    assert.deepEqual(reduceWorkspaceOverlayState(opening, { token: 1, type: 'finish' }), {
      desiredOpen: true,
      phase: 'open',
      rendered: true,
      token: 1,
    });
  });

  it('keeps the panel mounted and semantically closed until exit completes', () => {
    const open = createWorkspaceOverlayState(true);
    const closing = reduceWorkspaceOverlayState(open, { open: false, type: 'request' });

    assert.deepEqual(closing, {
      desiredOpen: false,
      phase: 'closing',
      rendered: true,
      token: 1,
    });
    assert.deepEqual(reduceWorkspaceOverlayState(closing, { token: 1, type: 'finish' }), {
      desiredOpen: false,
      phase: 'closed',
      rendered: false,
      token: 1,
    });
  });

  it('lets only the latest rapid intent finish', () => {
    const opening = reduceWorkspaceOverlayState(createWorkspaceOverlayState(false), {
      open: true,
      type: 'request',
    });
    const closing = reduceWorkspaceOverlayState(opening, { open: false, type: 'request' });
    const reopened = reduceWorkspaceOverlayState(closing, { open: true, type: 'request' });

    assert.equal(reopened.token, 3);
    assert.equal(reduceWorkspaceOverlayState(reopened, { token: 1, type: 'finish' }), reopened);
    assert.equal(reduceWorkspaceOverlayState(reopened, { token: 2, type: 'finish' }), reopened);
    assert.deepEqual(reduceWorkspaceOverlayState(reopened, { token: 3, type: 'finish' }), {
      desiredOpen: true,
      phase: 'open',
      rendered: true,
      token: 3,
    });
  });

  it('does not create duplicate transitions for an already settled intent', () => {
    const open = createWorkspaceOverlayState(true);
    assert.equal(reduceWorkspaceOverlayState(open, { open: true, type: 'request' }), open);

    const closed = createWorkspaceOverlayState(false);
    assert.equal(reduceWorkspaceOverlayState(closed, { open: false, type: 'request' }), closed);
  });
});
