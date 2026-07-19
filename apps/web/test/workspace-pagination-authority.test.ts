import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { resolveWorkspaceAuthoritativeOverride } from '../src/pages/research-workspace/model/workspace-authoritative-override.ts';

const pageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);

describe('workspace authoritative pagination overrides', () => {
  it('accepts an override only for the exact loader payload that created it', () => {
    const first = { items: ['initial'] };
    const refreshed = { items: ['fresh'] };
    const override = { base: first, value: { items: ['initial', 'appended'] } };

    assert.deepEqual(resolveWorkspaceAuthoritativeOverride(first, override), override.value);
    assert.equal(resolveWorkspaceAuthoritativeOverride(refreshed, override), null);
  });

  it('keys Today, Radar, and History local pagination to their authoritative payloads', async () => {
    const page = await readFile(pageUrl, 'utf8');

    assert.match(page, /resolveWorkspaceAuthoritativeOverride\(data\.today, feedPagination\)/);
    assert.match(page, /resolveWorkspaceAuthoritativeOverride\(data\.radar, radarPagination\)/);
    assert.match(page, /resolveWorkspaceAuthoritativeOverride\(data\.history, historyPagination\)/);
    assert.doesNotMatch(page, /radarPage \?\? data\.radar|historyPage \?\? data\.history/);
  });
});
