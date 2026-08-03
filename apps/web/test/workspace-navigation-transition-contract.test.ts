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
const navigationUrl = new URL(
  '../src/widgets/workspace-shell/ui/workspace-navigation.tsx',
  import.meta.url,
);
const shellCssUrl = new URL(
  '../src/widgets/workspace-shell/ui/workspace-shell.module.css',
  import.meta.url,
);
const tabsUrl = new URL('../src/shared/ui/animate-ui/primitives/radix/tabs.tsx', import.meta.url);

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
    const [page, navigation, today, tabs] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(navigationUrl, 'utf8'),
      readFile(todayUrl, 'utf8'),
      readFile(tabsUrl, 'utf8'),
    ]);

    assert.match(page, /useReducer\(\s*reduceWorkspaceNavigationIntent/);
    assert.match(navigation, /pending=\{pending === item\.id\}/);
    assert.match(navigation, /<SideList[\s\S]*?value=\{activeSection\}/);
    assert.match(page, /pendingLane=\{navigationIntent\.pendingLane/);
    assert.match(today, /pendingLane\?: ResearchFeedLaneId \| null/);
    assert.match(today, /data-pending=\{pendingLane === item\.lane \|\| undefined\}/);
    assert.match(today, /<Tabs[\s\S]*?value=\{lane\}[\s\S]*?variant="sliding-underline"/);
    assert.match(today, /<TabsHighlight>/);
    assert.match(today, /<TabsHighlightItem[\s\S]*?value=\{item\.lane\}/);
    assert.match(today, /activationMode="manual"/);
    assert.match(tabs, /<TabsPrimitive\.Root[\s\S]*?\{\.\.\.props\}/);
    assert.match(tabs, /<TabsPrimitive\.Trigger data-slot="tabs-trigger" \{\.\.\.props\}/);
    assert.doesNotMatch(today, /aria-selected=|tabIndex=|rovingLane|rovingIntent/);
  });

  it('clears pending only from the current promise completion', async () => {
    const page = await readFile(pageUrl, 'utf8');

    assert.match(page, /const sequence = \+\+navigationSequenceRef\.current/);
    assert.match(page, /dispatchNavigationIntent\(\{[\s\S]*?type: 'request'/);
    assert.match(page, /dispatchNavigationIntent\(\{ sequence, type: 'settle' \}\)/);
    assert.match(page, /\.then\([\s\S]*?startNavigationTransition/);
    assert.match(page, /\.catch\([\s\S]*?type: 'settle'/);
  });

  it('delegates route and lane selection visuals to shared navigation controls', async () => {
    const [navigation, today, shellCss] = await Promise.all([
      readFile(navigationUrl, 'utf8'),
      readFile(todayUrl, 'utf8'),
      readFile(shellCssUrl, 'utf8'),
    ]);

    assert.match(navigation, /<SideList/);
    assert.match(navigation, /expanded: 'quiet-rows'/);
    assert.match(navigation, /mobile: 'soft-surface'/);
    assert.match(navigation, /compact: 'compact-rail'/);
    assert.match(navigation, /<SideListItem/);
    assert.doesNotMatch(shellCss, /\.navigationLink\[aria-current='page'\]/);
    assert.doesNotMatch(shellCss, /\.navigationLink:focus-visible/);
    assert.doesNotMatch(shellCss, /\.navigationLink\[data-pending='true'\]/);
    assert.doesNotMatch(navigation, /navIndicator|activeSectionIndex/);
    assert.match(today, /variant="sliding-underline"/);
    assert.doesNotMatch(today, /laneIndicator/);
    assert.doesNotMatch(today, /activeLaneIndex|translate|transform/);
  });
});
