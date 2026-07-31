import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createRetryablePromiseCache,
  isWorkspaceFocusStillOwned,
  resolveWorkspaceViewFocus,
  retryWorkspaceView,
} from '../src/pages/research-workspace/model/workspace-lazy-recovery.ts';

describe('workspace lazy runtime recovery', () => {
  it('waits for the matching lazy view readiness signal and consumes it once', () => {
    const deferred = resolveWorkspaceViewFocus('today', 'radar', 'today');
    assert.deepEqual(deferred, { focusedViewKey: 'today', shouldFocus: false });

    const ready = resolveWorkspaceViewFocus(deferred.focusedViewKey, 'radar', 'radar');
    assert.deepEqual(ready, { focusedViewKey: 'radar', shouldFocus: true });

    assert.deepEqual(resolveWorkspaceViewFocus(ready.focusedViewKey, 'radar', 'radar'), {
      focusedViewKey: 'radar',
      shouldFocus: false,
    });
  });

  it('does not steal focus from a newer external target', () => {
    const navigationOwner = {};
    const externalFocus = {};

    assert.equal(
      isWorkspaceFocusStillOwned({
        activeFocus: externalFocus,
        currentContainsActiveFocus: false,
        focusOwner: navigationOwner,
        focusOwnerConnected: true,
        isBodyFocused: false,
      }),
      false,
    );
    assert.equal(
      isWorkspaceFocusStillOwned({
        activeFocus: navigationOwner,
        currentContainsActiveFocus: false,
        focusOwner: navigationOwner,
        focusOwnerConnected: true,
        isBodyFocused: false,
      }),
      true,
    );
  });

  it('increments only the failed view retry key', () => {
    const previous = { radar: 2, today: 0 };

    assert.deepEqual(retryWorkspaceView(previous, 'today'), { radar: 2, today: 1 });
    assert.deepEqual(previous, { radar: 2, today: 0 });
  });

  it('deduplicates success but clears a rejected API promise for the next attempt', async () => {
    let attempts = 0;
    const getValue = createRetryablePromiseCache(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('chunk unavailable');
      return { client: 'ready' };
    });

    await assert.rejects(getValue(), /chunk unavailable/);
    const firstRetry = getValue();
    const concurrentRetry = getValue();
    assert.equal(firstRetry, concurrentRetry);
    assert.deepEqual(await firstRetry, { client: 'ready' });
    assert.deepEqual(await getValue(), { client: 'ready' });
    assert.equal(attempts, 2);
  });
});
