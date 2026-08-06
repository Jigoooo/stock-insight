import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyWorkspaceViewFailure } from '../src/pages/research-workspace/model/workspace-view-failure.ts';

describe('workspace view failure classification', () => {
  it('separates timeouts, upstream service failures, and unknown errors', () => {
    const timeout = new Error('request timed out');
    timeout.name = 'AbortError';

    assert.equal(classifyWorkspaceViewFailure(timeout), 'timeout');
    assert.equal(classifyWorkspaceViewFailure({ status: 503 }), 'service');
    assert.equal(classifyWorkspaceViewFailure(new Error('unexpected')), 'unknown');
  });
});
