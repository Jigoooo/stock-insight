import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

// The workspace was split so that each tab is its own route
// (routes/_authenticated/workspace/<view>.tsx) instead of one route keyed on a
// ?view= search param. The guarantees below are unchanged — cache-keyed loads,
// abort handling, stale-payload fallback, intent-only prefetch — but they now
// live in the shared loader helper plus the per-view route files, so that is
// where this test looks.
const loaderUrl = new URL(
  '../src/pages/research-workspace/model/workspace-route-loader.ts',
  import.meta.url,
);
const layoutUrl = new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url);
const indexUrl = new URL('../src/routes/_authenticated/workspace/index.tsx', import.meta.url);
const todayRouteUrl = new URL('../src/routes/_authenticated/workspace/today.tsx', import.meta.url);
const viewRouteUrl = new URL(
  '../src/pages/research-workspace/ui/workspace-view-route.tsx',
  import.meta.url,
);
const pageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);

const VIEWS = [
  'today',
  'radar',
  'stocks',
  'crypto',
  'themes',
  'research',
  'history',
  'status',
] as const;

describe('workspace active-view route loader', () => {
  it('gives every tab its own route file', async () => {
    const sources = await Promise.all(
      VIEWS.map((view) =>
        readFile(
          new URL(`../src/routes/_authenticated/workspace/${view}.tsx`, import.meta.url),
          'utf8',
        ),
      ),
    );
    for (const [index, source] of sources.entries()) {
      const view = VIEWS[index];
      assert.match(source, new RegExp(`createFileRoute\\('/_authenticated/workspace/${view}'\\)`));
      assert.match(source, new RegExp(`loadWorkspaceView\\('${view}'`));
    }
  });

  it('keys loader work by view and authenticated scope', async () => {
    const source = await readFile(loaderUrl, 'utf8');

    assert.match(source, /cache\.load\(/);
    assert.match(source, /workspaceCacheKey\(userId, view, lane, options\.cursor\)/);
    assert.match(source, /signal/);
    assert.doesNotMatch(source, /loadResearchWorkspaceInitial/);
  });

  // The whole point of the split: only the lane-scoped feed may re-run its
  // loader when a search param changes. If a non-today route grew loaderDeps it
  // would re-fetch on every lane/cursor change, which is the regression this
  // work removed.
  it('scopes loaderDeps to the lane-scoped feed only', async () => {
    const today = await readFile(todayRouteUrl, 'utf8');
    assert.match(today, /loaderDeps:\s*\(\{\s*search\s*\}\)\s*=>/);
    assert.match(today, /lane:\s*search\.lane\s*\?\?\s*'must_know'/);
    assert.match(today, /cursor:\s*search\.cursor/);

    for (const view of VIEWS.filter((item) => item !== 'today')) {
      const source = await readFile(
        new URL(`../src/routes/_authenticated/workspace/${view}.tsx`, import.meta.url),
        'utf8',
      );
      assert.doesNotMatch(source, /loaderDeps/, `${view} must not re-load on search changes`);
    }
  });

  it('routes /workspace to the default tab instead of rendering a view', async () => {
    const source = await readFile(indexUrl, 'utf8');
    assert.match(source, /redirect\(\{\s*to:\s*'\/workspace\/today'/);
  });

  it('keeps the shared shell in the layout route', async () => {
    const source = await readFile(layoutUrl, 'utf8');
    assert.match(source, /<Outlet \/>/);
    assert.match(source, /validateSearch:\s*validateWorkspaceSearch/);
    assert.match(source, /data-testid="workspace-route-error"/);
  });

  it('renders the payload that committed with the route loader', async () => {
    const [viewRoute, page] = await Promise.all([
      readFile(viewRouteUrl, 'utf8'),
      readFile(pageUrl, 'utf8'),
    ]);

    assert.match(viewRoute, /loaderData:\s*WorkspaceRouteLoaderResult/);
    assert.match(viewRoute, /data=\{loaderData\.data\}/);
    assert.match(page, /data:\s*ResearchWorkspaceViewPayload/);
    for (const view of VIEWS) {
      assert.match(page, new RegExp(`section === '${view}' && data\\.view === '${view}'`));
    }
  });

  it('prefetches only explicit nav hover or focus intent through the bounded cache', async () => {
    const [viewRoute, page] = await Promise.all([
      readFile(viewRouteUrl, 'utf8'),
      readFile(pageUrl, 'utf8'),
    ]);

    assert.match(viewRoute, /workspaceViewCache\.prefetch\(/);
    assert.match(viewRoute, /priority:\s*'intent'/);
    assert.doesNotMatch(viewRoute, /sections\.(?:map|forEach)[\s\S]{0,300}prefetch/);
    assert.match(page, /onPrefetchSection\?: \(section: SectionId\) => void/);
    assert.match(page, /onPointerEnter=\{\(\) => onPrefetchSection\?\.\(id\)\}/);
    assert.match(page, /onFocus=\{\(\) => onPrefetchSection\?\.\(id\)\}/);
  });

  it('keeps the persistent shell on active-slice transition failure', async () => {
    const [loader, today, page] = await Promise.all([
      readFile(loaderUrl, 'utf8'),
      readFile(todayRouteUrl, 'utf8'),
      readFile(pageUrl, 'utf8'),
    ]);

    assert.match(loader, /cache\.beginActiveLoad\(\)/);
    assert.match(loader, /cache\.commitActive\(data, activeLoadToken\)/);
    assert.match(loader, /signal\.aborted/);
    assert.match(loader, /cache\.getActive\(\)/);
    assert.match(loader, /viewLoadError/);
    assert.match(today, /pendingMs:\s*Number\.POSITIVE_INFINITY/);
    assert.doesNotMatch(today, /pendingComponent:\s*WorkspaceRoutePending/);
    assert.match(page, /viewLoadError\?:\s*SectionId/);
    assert.match(page, /data-testid="workspace-view-load-error"/);
  });

  // A redirect thrown inside a loader is control flow. If it were caught by the
  // stale-payload fallback the user would silently stay on a dead route.
  it('never swallows a redirect into the stale-payload fallback', async () => {
    const source = await readFile(loaderUrl, 'utf8');
    assert.match(source, /if \(isRedirect\(error\)\) throw error;/);
  });
});
