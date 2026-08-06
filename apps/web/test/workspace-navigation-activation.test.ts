import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('workspace navigation activation', () => {
  it('records pending intent only for an unmodified primary click', async () => {
    const activationModule =
      await import('../src/widgets/workspace-shell/model/workspace-navigation-activation.ts').catch(
        () => null,
      );

    assert.ok(activationModule, 'workspace navigation activation module should exist');

    const isPlainActivation = activationModule.isPlainWorkspaceNavigationActivation;
    const base = {
      altKey: false,
      button: 0,
      ctrlKey: false,
      defaultPrevented: false,
      metaKey: false,
      shiftKey: false,
    };

    assert.equal(isPlainActivation(base), true);
    for (const modified of [
      { ...base, altKey: true },
      { ...base, button: 1 },
      { ...base, ctrlKey: true },
      { ...base, defaultPrevented: true },
      { ...base, metaKey: true },
      { ...base, shiftKey: true },
    ]) {
      assert.equal(isPlainActivation(modified), false);
    }
  });
});
