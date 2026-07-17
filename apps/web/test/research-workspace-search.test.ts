import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateWorkspaceSearch } from '../src/pages/research-workspace/model/workspace-search.ts';

describe('research workspace URL state', () => {
  it('accepts only supported views, lanes, and bounded record keys', () => {
    assert.deepEqual(
      validateWorkspaceSearch({
        view: 'themes',
        lane: 'for_you',
        record: 'record:2026-07-16:alpha',
        cursor: 'opaque-cursor',
      }),
      {
        view: 'themes',
        lane: 'for_you',
        record: 'record:2026-07-16:alpha',
        cursor: 'opaque-cursor',
      },
    );
  });

  it('drops unknown, non-string, blank, and oversized values', () => {
    assert.deepEqual(
      validateWorkspaceSearch({
        view: 'admin',
        lane: ['must_know'],
        record: 'x'.repeat(321),
        cursor: 'x'.repeat(1_025),
        userId: 'spoofed-user',
      }),
      {},
    );
    assert.deepEqual(validateWorkspaceSearch({ record: '   ' }), {});
  });
});
