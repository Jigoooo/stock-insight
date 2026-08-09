import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { workspaceSections } from '../src/features/workspace-navigation/model/sections.ts';
import { validateWorkspaceSearch } from '../src/pages/research-workspace/model/workspace-search.ts';

const src = (path: string) => new URL(`../src/${path}`, import.meta.url);
const read = (path: string) => readFile(src(path), 'utf8');

const retiredViews = ['crypto', 'themes', 'market-topic-news'] as const;

describe('retired hidden workspace surfaces', () => {
  it('removes hidden surfaces from navigation, search, payload, cache and orchestration', async () => {
    assert.deepEqual(
      workspaceSections.map(({ id }) => id),
      ['today', 'stocks', 'radar', 'history', 'status'],
    );

    for (const view of retiredViews) {
      assert.deepEqual(validateWorkspaceSearch({ view }), {});
    }

    const boundaries = await Promise.all([
      read('pages/research-workspace/model/workspace-view-payload.ts'),
      read('pages/research-workspace/model/workspace-view-cache.ts'),
      read('pages/research-workspace/model/load-research-workspace.ts'),
      read('server/research-workspace-orchestrator.ts'),
      read('pages/research-workspace/ui/research-workspace-page.tsx'),
    ]);
    for (const source of boundaries) {
      for (const view of retiredViews) {
        assert.doesNotMatch(source, new RegExp(`['"]${view}['"]`));
      }
    }
  });

  it('keeps old URLs as loader-free replace redirects', async () => {
    const redirects = [
      ['routes/_authenticated/workspace/crypto.tsx', '/workspace/today'],
      ['routes/_authenticated/workspace/themes.tsx', '/workspace/radar'],
      ['routes/_authenticated/workspace/market-topic-news.tsx', '/workspace/today'],
    ] as const;

    for (const [path, destination] of redirects) {
      const source = await read(path);
      assert.match(source, /beforeLoad:\s*\(\)\s*=>/);
      assert.match(source, new RegExp(`to:\\s*['"]${destination}['"]`));
      assert.match(source, /replace:\s*true/);
      assert.doesNotMatch(source, /loader:|loadWorkspaceView|WorkspaceViewRoute/);
    }
  });

  it('deletes retired UI and the unused legacy dashboard bootstrap', async () => {
    const retiredFiles = [
      'pages/research-workspace/ui/views/crypto-workspace-view.tsx',
      'pages/research-workspace/ui/views/crypto-workspace-view.module.css',
      'pages/research-workspace/ui/views/themes-view.tsx',
      'pages/research-workspace/ui/views/market-topic-news-view.tsx',
      'pages/research-workspace/ui/views/market-topic-news-view.module.css',
      'pages/research-workspace/model/crypto-display.ts',
      'pages/dashboard/model/load-workspace-bootstrap.ts',
      'pages/dashboard/model/resolve-dashboard-bootstrap.ts',
      'server/workspace-bootstrap.ts',
    ];

    for (const path of retiredFiles) {
      await assert.rejects(access(src(path)), { code: 'ENOENT' });
    }
  });
});
