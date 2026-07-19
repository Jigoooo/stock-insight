import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const uiRoot = new URL('../src/pages/research-workspace/ui/', import.meta.url);
const read = (path: string) => readFile(new URL(path, uiRoot), 'utf8');

const viewFiles = [
  ['TodayView', 'views/today-view.tsx'],
  ['RadarView', 'views/radar-view.tsx'],
  ['StocksView', 'views/stocks-view.tsx'],
  ['ThemesView', 'views/themes-view.tsx'],
  ['MyResearchView', 'views/my-research-view.tsx'],
  ['HistoryView', 'views/history-view.tsx'],
  ['StatusView', 'views/status-view.tsx'],
] as const;

describe('workspace shell and keyed view-region contract', () => {
  it('extracts every workspace view from the orchestration page', async () => {
    const [page, ...views] = await Promise.all([
      read('research-workspace-page.tsx'),
      ...viewFiles.map(([, path]) => read(path)),
    ]);

    for (const [index, [component, path]] of viewFiles.entries()) {
      assert.match(views[index], new RegExp(`export function ${component}`), path);
      assert.match(page, new RegExp(`from './${path.replace(/\.tsx$/, '')}'`), path);
      assert.doesNotMatch(page, new RegExp(`function ${component}\\(`), path);
    }
  });

  it('keeps shell chrome outside the keyed view subtree', async () => {
    const [page, shell] = await Promise.all([
      read('research-workspace-page.tsx'),
      read('research-workspace-shell.tsx'),
    ]);

    assert.match(page, /ResearchWorkspaceShell/);
    assert.match(page, /WorkspaceViewRegion/);
    assert.match(shell, /data-workspace-shell/);
    assert.match(shell, /children/);
  });

  it('retains and neutralizes the previous view until the scoped transition completes', async () => {
    const region = await read('workspace-view-region.tsx');

    assert.match(region, /useGSAP/);
    assert.match(region, /contextSafe/);
    assert.match(region, /killTweensOf/);
    assert.match(region, /clearProps/);
    assert.match(region, /aria-hidden/);
    assert.match(region, /inert/);
    assert.match(region, /key=\{layers\.exiting\.key\}/);
    assert.match(region, /key=\{layers\.active\.key\}/);
    assert.match(region, /data-workspace-view-heading/);
    assert.match(region, /focus\(/);
    assert.match(region, /duration:\s*0\.2[0-4]/);
    assert.doesNotMatch(region, /stagger\s*:/);
  });

  it('uses an instant semantic swap when reduced motion is active', async () => {
    const region = await read('workspace-view-region.tsx');

    assert.match(region, /useMotionPreferences/);
    assert.match(region, /reducedMotion/);
    assert.match(region, /duration:\s*0/);
  });

  it('does not let mobile-menu cleanup steal focus from the committed view heading', async () => {
    const page = await read('research-workspace-page.tsx');

    assert.match(page, /const activeFocus = document\.activeElement/);
    assert.match(page, /container\.contains\(activeFocus\)/);
    assert.match(page, /activeFocus === document\.body/);
  });
});
