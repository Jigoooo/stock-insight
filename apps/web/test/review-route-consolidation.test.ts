import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { workspaceSections } from '../src/features/workspace-navigation/model/sections.ts';
import { validateWorkspaceSearch } from '../src/pages/research-workspace/model/workspace-search.ts';

const src = (path: string) => new URL(`../src/${path}`, import.meta.url);
const read = (path: string) => readFile(src(path), 'utf8');

describe('canonical judgment review route', () => {
  it('uses History as the only primary review destination', () => {
    assert.deepEqual(
      workspaceSections
        .filter(({ navigationGroup }) => navigationGroup === 'primary')
        .map(({ id }) => id),
      ['today', 'stocks', 'radar', 'history'],
    );
    const history = workspaceSections.find(({ id }) => id === 'history');
    assert.ok(history);
    assert.partialDeepStrictEqual(history, {
      href: '/workspace/history',
      label: '복기',
      navigationGroup: 'primary',
    });
    assert.equal(
      workspaceSections.some(({ id }) => id === 'research'),
      false,
    );
    assert.deepEqual(validateWorkspaceSearch({ view: 'research' }), {});
  });

  it('removes the retired research view from every internal workspace boundary', async () => {
    const boundaries = await Promise.all([
      read('pages/research-workspace/model/workspace-view-payload.ts'),
      read('pages/research-workspace/model/workspace-view-cache.ts'),
      read('pages/research-workspace/model/load-research-workspace.ts'),
      read('server/research-workspace-orchestrator.ts'),
      read('pages/research-workspace/ui/research-workspace-page.tsx'),
    ]);

    for (const source of boundaries) {
      assert.doesNotMatch(source, /(?:view|case|section)\s*(?::|===)?\s*['"]research['"]/);
    }
  });

  it('deletes the duplicate web-only research presentation', async () => {
    const retiredFiles = [
      'pages/research-workspace/ui/views/my-research-view.tsx',
      'pages/research-workspace/ui/views/personalization-workspace-panel.tsx',
      'pages/research-workspace/ui/views/decision-support-content.ts',
      'pages/research-workspace/ui/views/decision-support-presentation.ts',
      'pages/research-workspace/ui/personalization.module.css',
    ];

    for (const path of retiredFiles) {
      await assert.rejects(access(src(path)), { code: 'ENOENT' });
    }
  });
});
