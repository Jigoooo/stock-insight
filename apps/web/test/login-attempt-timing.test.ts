import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  holdLoginFailureFeedback,
  loginFailureMinimumPendingMs,
} from '../src/pages/auth/model/login-attempt-timing.ts';

describe('login failure feedback timing', () => {
  it('holds a fast failure long enough for the pending animation to read', async () => {
    const waits: number[] = [];

    await holdLoginFailureFeedback(100, {
      now: () => 250,
      wait: async (delayMs) => {
        waits.push(delayMs);
      },
    });

    assert.deepEqual(waits, [loginFailureMinimumPendingMs - 150]);
  });

  it('does not add latency after the minimum pending duration has elapsed', async () => {
    const waits: number[] = [];

    await holdLoginFailureFeedback(100, {
      now: () => 100 + loginFailureMinimumPendingMs + 1,
      wait: async (delayMs) => {
        waits.push(delayMs);
      },
    });

    assert.deepEqual(waits, []);
  });

  it('holds both rejected responses and thrown requests before rendering the error', async () => {
    const source = await readFile(
      new URL('../src/pages/auth/login-screen.tsx', import.meta.url),
      'utf8',
    );
    const rejected = source.slice(source.indexOf('if (!result.ok)'), source.indexOf('// A client'));
    const thrown = source.slice(
      source.indexOf('} catch {'),
      source.indexOf('\n    }', source.indexOf('} catch {')),
    );

    for (const branch of [rejected, thrown]) {
      const hold = branch.indexOf('await holdLoginFailureFeedback(startedAt)');
      const error = branch.indexOf('setError(invalidLoginMessage)');
      const idle = branch.indexOf('setPending(false)');
      assert.ok(hold >= 0 && hold < error && error < idle);
    }
  });
});
