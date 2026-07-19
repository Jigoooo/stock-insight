import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const pageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);
const routeUrl = new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url);
const todayUrl = new URL(
  '../src/pages/research-workspace/ui/views/today-view.tsx',
  import.meta.url,
);
const cssUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.module.css',
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
    assert.doesNotMatch(route, /onUrlStateChange=\{\(next\) =>\s*void navigate/);
    assert.match(route, /onUrlStateChange=\{\(next\) =>\s*navigate/);
  });

  it('keeps authoritative ARIA on committed values and marks only the latest target pending', async () => {
    const [page, today] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(todayUrl, 'utf8'),
    ]);

    assert.match(page, /useReducer\(\s*reduceWorkspaceNavigationIntent/);
    assert.match(page, /pendingSection === id/);
    assert.match(page, /aria-current=\{section === id \? 'page' : undefined\}/);
    assert.match(page, /pendingLane=\{navigationIntent\.pendingLane/);
    assert.match(today, /pendingLane\?: ResearchFeedLaneId \| null/);
    assert.match(today, /data-pending=\{pendingLane === item\.lane \|\| undefined\}/);
    assert.match(today, /aria-selected=\{lane === item\.lane\}/);
    assert.match(today, /tabIndex=\{lane === item\.lane \? 0 : -1\}/);
  });

  it('clears pending only from the current promise completion', async () => {
    const page = await readFile(pageUrl, 'utf8');

    assert.match(page, /const sequence = \+\+navigationSequenceRef\.current/);
    assert.match(page, /dispatchNavigationIntent\(\{[\s\S]*?type: 'request'/);
    assert.match(page, /dispatchNavigationIntent\(\{ sequence, type: 'settle' \}\)/);
    assert.match(page, /\.then\([\s\S]*?startNavigationTransition/);
    assert.match(page, /\.catch\([\s\S]*?type: 'settle'/);
  });

  it('moves authoritative section and lane indicators with transform only', async () => {
    const [page, today, css] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(todayUrl, 'utf8'),
      readFile(cssUrl, 'utf8'),
    ]);

    assert.match(page, /className=\{styles\.navIndicator\}/);
    assert.match(page, /activeSectionIndex \* 48/);
    assert.match(today, /className=\{styles\.laneIndicator\}/);
    assert.match(today, /activeLaneIndex \* 100/);
    assert.match(css, /\.navIndicator[\s\S]*?transition:\s*transform/);
    assert.match(css, /\.laneIndicator[\s\S]*?transition:\s*transform/);
    assert.doesNotMatch(
      css,
      /(?:navIndicator|laneIndicator)[\s\S]{0,400}transition:[^;]*(?:left|top|width|height)/,
    );
  });
});
