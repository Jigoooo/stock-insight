import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const pageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);
// Path updated by the workspace route split: the shared route body moved from
// routes/_authenticated/workspace.tsx (one route, ?view= param) to
// pages/research-workspace/ui/workspace-view-route.tsx, which every per-tab
// route now renders. The assertions below are unchanged.
const routeUrl = new URL(
  '../src/pages/research-workspace/ui/workspace-view-route.tsx',
  import.meta.url,
);
const todayUrl = new URL(
  '../src/pages/research-workspace/ui/views/today-view.tsx',
  import.meta.url,
);
const cssUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.module.css',
  import.meta.url,
);
const navigationUrl = new URL(
  '../src/widgets/workspace-shell/ui/workspace-navigation.tsx',
  import.meta.url,
);
const shellCssUrl = new URL(
  '../src/widgets/workspace-shell/ui/workspace-shell.module.css',
  import.meta.url,
);

describe('workspace authoritative navigation transition', () => {
  it('returns the router navigation promise and schedules controlled work as a transition', async () => {
    const [page, route] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(routeUrl, 'utf8'),
    ]);

    assert.match(page, /onUrlStateChange\?: \(next:[\s\S]*?\) => Promise<void>/);
    assert.match(page, /useTransition\(\)/);
    assert.match(page, /startNavigationTransition\(\(\) =>/);
    assert.match(page, /if \(!onUrlStateChange\) \{[\s\S]*?setLocalSection\(next\)/);
    assert.match(page, /if \(!onUrlStateChange\) \{[\s\S]*?setLocalLane\(next\)/);
    // The handler awaits the router promise instead of firing and forgetting it,
    // so the caller's transition still settles on the real navigation.
    assert.doesNotMatch(route, /onUrlStateChange=\{\(next\) =>\s*void navigate/);
    assert.match(route, /onUrlStateChange=\{async \(next\) => \{[\s\S]*?await navigate\(/);
  });

  it('keeps authoritative ARIA on committed values and marks only the latest target pending', async () => {
    const [page, navigation, today] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(navigationUrl, 'utf8'),
      readFile(todayUrl, 'utf8'),
    ]);

    assert.match(page, /useReducer\(\s*reduceWorkspaceNavigationIntent/);
    assert.match(navigation, /pending === item\.id/);
    assert.match(navigation, /aria-current=\{activeSection === item\.id \? 'page' : undefined\}/);
    assert.match(page, /pendingLane=\{navigationIntent\.pendingLane/);
    assert.match(today, /pendingLane\?: ResearchFeedLaneId \| null/);
    assert.match(today, /data-pending=\{pendingLane === item\.lane \|\| undefined\}/);
    assert.match(today, /aria-selected=\{lane === item\.lane\}/);
    assert.match(today, /tabIndex=\{rovingLane === item\.lane \? 0 : -1\}/);
  });

  it('clears pending only from the current promise completion', async () => {
    const page = await readFile(pageUrl, 'utf8');

    assert.match(page, /const sequence = \+\+navigationSequenceRef\.current/);
    assert.match(page, /dispatchNavigationIntent\(\{[\s\S]*?type: 'request'/);
    assert.match(page, /dispatchNavigationIntent\(\{ sequence, type: 'settle' \}\)/);
    assert.match(page, /\.then\([\s\S]*?startNavigationTransition/);
    assert.match(page, /\.catch\([\s\S]*?type: 'settle'/);
  });

  it('keeps section state on links and moves only the lane indicator with transform', async () => {
    const [navigation, today, css, shellCss] = await Promise.all([
      readFile(navigationUrl, 'utf8'),
      readFile(todayUrl, 'utf8'),
      readFile(cssUrl, 'utf8'),
      readFile(shellCssUrl, 'utf8'),
    ]);

    assert.match(navigation, /className=\{styles\.navigationLink\}/);
    assert.match(shellCss, /\.navigationLink\[aria-current='page'\]/);
    assert.doesNotMatch(navigation, /navIndicator|activeSectionIndex/);
    assert.match(today, /className=\{styles\.laneIndicator\}/);
    assert.match(today, /activeLaneIndex \* 100/);
    assert.match(css, /\.laneIndicator[\s\S]*?transition:\s*transform/);
    assert.doesNotMatch(css, /laneIndicator[\s\S]{0,400}transition:[^;]*(?:left|top|width|height)/);
  });
});
