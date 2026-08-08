import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

// PHASE 2 CONTRACT: switching lanes inside the today feed must not touch the
// server.
//
// The brain's /v1/workspace response always carries all three lanes — the
// contract pins `lanes` to exactly 3, and loadResearchWorkspace() does not even
// accept a lane argument, so the payload is byte-identical whichever lane is
// selected. Keying the loader (or the cache) on lane therefore bought nothing
// and cost a full round-trip on every click, which is what made an in-tab filter
// feel like a page reload.
//
// These assertions are structural on purpose: a runtime test would need a live
// brain, and the failure mode here is someone re-adding `lane` to loaderDeps
// during an unrelated change.
const read = (relative: string) => readFile(new URL(relative, import.meta.url), 'utf8');

const todayRouteUrl = '../src/routes/_authenticated/workspace/today.tsx';
const loaderUrl = '../src/pages/research-workspace/model/workspace-route-loader.ts';
const viewRouteUrl = '../src/pages/research-workspace/ui/workspace-view-route.tsx';
const serverUrl = '../src/server/research-workspace.ts';
const contractsUrl = '../../../packages/contracts/src/research-workspace.ts';

const VIEWS = ['today', 'radar', 'stocks', 'crypto', 'themes', 'history', 'status'] as const;

describe('lane switching is client-side only', () => {
  it('keeps lane out of every route loader dep', async () => {
    const today = await read(todayRouteUrl);
    // cursor genuinely pages the feed server-side, so it stays.
    assert.match(
      today,
      /loaderDeps:\s*\(\{\s*search\s*\}\)\s*=>\s*\(\{\s*cursor:\s*search\.cursor\s*\}\)/,
    );
    assert.doesNotMatch(today, /lane:\s*search\.lane/);

    for (const view of VIEWS.filter((item) => item !== 'today')) {
      const source = await read(`../src/routes/_authenticated/workspace/${view}.tsx`);
      assert.doesNotMatch(source, /loaderDeps/, `${view} must not re-load on any search change`);
    }
  });

  it('never lane-scopes a cache entry', async () => {
    const loader = await read(loaderUrl);
    // A lane-keyed cache would store three identical copies of the same payload
    // and make each lane switch look like a miss.
    assert.match(loader, /lane:\s*null/);
    assert.doesNotMatch(loader, /lane:\s*view === 'today'/);
    assert.doesNotMatch(loader, /lane\?:\s*ResearchFeedLaneId/);
  });

  it('does not send lane to the brain when prefetching or loading', async () => {
    const [loader, viewRoute] = await Promise.all([read(loaderUrl), read(viewRouteUrl)]);
    assert.doesNotMatch(loader, /\{\s*lane\s*\}/);
    assert.doesNotMatch(viewRoute, /search\.lane/);
    assert.match(viewRoute, /workspaceCacheKey\(session\.user\.id, view\)/);
  });

  // The two facts the whole optimisation rests on. If either changes, lane must
  // go back into the loader and this test should fail loudly rather than let the
  // UI silently serve the wrong lane's data.
  it('rests on the server returning all lanes regardless of selection', async () => {
    const [server, contracts] = await Promise.all([read(serverUrl), read(contractsUrl)]);
    assert.match(
      server,
      /export async function loadResearchWorkspace\(userId: string\) \{/,
      'loadResearchWorkspace must remain lane-agnostic',
    );
    assert.match(
      contracts,
      /lanes:\s*z\.array\(researchFeedLaneSchema\)\.length\(3\)/,
      'the today payload must keep carrying all three lanes',
    );
  });
});
