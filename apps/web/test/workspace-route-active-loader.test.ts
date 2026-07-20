import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const routeUrl = new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url);
const pageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);

describe('workspace active-view route loader', () => {
  it('keys loader work by active URL state and authenticated scope', async () => {
    const source = await readFile(routeUrl, 'utf8');

    assert.match(source, /loaderDeps:\s*\(\{\s*search\s*\}\)\s*=>/);
    assert.match(source, /view:\s*search\.view\s*\?\?\s*'today'/);
    assert.match(source, /lane:\s*search\.lane\s*\?\?\s*'must_know'/);
    assert.match(source, /cursor:\s*search\.cursor/);
    assert.match(source, /context\.workspaceViewCache\.load\(/);
    assert.match(source, /const canReuseActiveToday/);
    assert.match(source, /deps\.record === undefined/);
    assert.match(
      source,
      /active\.defaultRecord\?\.recordKey \?\? null\) === active\.today\.defaultRecordKey/,
    );
    assert.match(source, /const data = \{ \.\.\.active, lane: deps\.lane \}/);
    assert.match(
      source,
      /canReuseActiveToday[\s\S]+beginActiveLoad\(\)[\s\S]+commitActive\(data, activeLoadToken\)/,
    );
    assert.match(source, /loadedData\.view === 'today'/);
    assert.match(source, /\{\s*\.\.\.loadedData,\s*lane:\s*deps\.lane\s*\}/);
    assert.match(source, /workspaceCacheKey\(\s*context\.session\.user\.id/);
    assert.match(source, /signal:\s*abortController\.signal/);
    assert.doesNotMatch(source, /loadResearchWorkspaceInitial/);
  });

  it('renders and selects only the payload that committed with the route loader', async () => {
    const source = await readFile(pageUrl, 'utf8');

    assert.match(source, /data:\s*ResearchWorkspaceViewPayload/);
    assert.match(source, /const section = onUrlStateChange \? data\.view : localSection/);
    assert.match(source, /section === 'today' && data\.view === 'today'/);
    assert.match(source, /section === 'radar' && data\.view === 'radar'/);
    assert.match(source, /section === 'stocks' && data\.view === 'stocks'/);
    assert.match(source, /section === 'themes' && data\.view === 'themes'/);
    assert.match(source, /section === 'research' && data\.view === 'research'/);
    assert.match(source, /section === 'history' && data\.view === 'history'/);
    assert.match(source, /section === 'status' && data\.view === 'status'/);
  });

  it('prefetches only explicit nav hover or focus intent through the bounded cache', async () => {
    const [route, page] = await Promise.all([
      readFile(routeUrl, 'utf8'),
      readFile(pageUrl, 'utf8'),
    ]);

    assert.match(route, /workspaceViewCache\.prefetch\(/);
    assert.match(route, /priority:\s*'intent'/);
    assert.doesNotMatch(route, /sections\.(?:map|forEach)[\s\S]{0,300}prefetch/);
    assert.match(page, /onPrefetchSection\?: \(section: SectionId\) => void/);
    assert.match(page, /onPointerEnter=\{\(\) => onPrefetchSection\?\.\(id\)\}/);
    assert.match(page, /onFocus=\{\(\) => onPrefetchSection\?\.\(id\)\}/);
  });

  it('keeps the persistent shell on active-slice transition failure', async () => {
    const [route, page] = await Promise.all([
      readFile(routeUrl, 'utf8'),
      readFile(pageUrl, 'utf8'),
    ]);

    assert.match(route, /workspaceViewCache\.beginActiveLoad\(\)/);
    assert.match(route, /workspaceViewCache\.commitActive\(data, activeLoadToken\)/);
    assert.match(route, /abortController\.signal\.aborted/);
    assert.match(route, /workspaceViewCache\.getActive\(\)/);
    assert.match(route, /workspaceViewCache\.hydrateActive\(session\.user\.id, loaderData\.data\)/);
    assert.match(
      route,
      /if \(search\.record === undefined && search\.analysisRunId === undefined\)[\s\S]+hydrateActive/,
    );
    assert.match(route, /const canCommitActive = deps\.record === undefined/);
    assert.match(
      route,
      /if \(deps\.record !== undefined \|\| deps\.analysisRunId !== undefined\) throw error/,
    );
    assert.match(route, /viewLoadError/);
    assert.match(route, /pendingMs:\s*Number\.POSITIVE_INFINITY/);
    assert.doesNotMatch(route, /pendingComponent:\s*WorkspaceRoutePending/);
    assert.match(page, /viewLoadError\?:\s*SectionId/);
    assert.match(page, /data-testid="workspace-view-load-error"/);
  });
});
