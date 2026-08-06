import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createWorkspaceShellState,
  reduceWorkspaceShellState,
  resolveResponsiveNavigationMode,
} from '../src/widgets/workspace-shell/model/workspace-shell-state.ts';

describe('workspace shell state', () => {
  it('uses the approved responsive defaults', () => {
    assert.equal(resolveResponsiveNavigationMode(1440), 'expanded');
    assert.equal(resolveResponsiveNavigationMode(1240), 'expanded');
    assert.equal(resolveResponsiveNavigationMode(1239), 'compact');
    assert.equal(resolveResponsiveNavigationMode(768), 'compact');
    assert.equal(resolveResponsiveNavigationMode(767), 'mobile');
  });

  it('restores an explicit desktop override when a route remounts the shell', () => {
    const initial = createWorkspaceShellState(1440);
    const compact = reduceWorkspaceShellState(initial, { type: 'toggle-desktop-mode' });
    assert.equal(compact.mode, 'compact');
    assert.equal(compact.override, 'compact');

    assert.deepEqual(createWorkspaceShellState(1440, compact.override), {
      mode: 'compact',
      override: 'compact',
      mobileOpen: false,
    });

    assert.deepEqual(
      reduceWorkspaceShellState(createWorkspaceShellState(1170), {
        type: 'restore-desktop-mode',
        mode: 'expanded',
      }),
      {
        mode: 'expanded',
        override: 'expanded',
        mobileOpen: false,
      },
    );
  });

  it('closes the mobile sheet when a route is committed', () => {
    const opened = reduceWorkspaceShellState(createWorkspaceShellState(390), {
      type: 'set-mobile-open',
      open: true,
    });
    assert.equal(opened.mobileOpen, true);
    assert.equal(reduceWorkspaceShellState(opened, { type: 'route-committed' }).mobileOpen, false);
  });
});
