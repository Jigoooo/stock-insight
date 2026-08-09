import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const routeUrl = new URL('../src/routes/index.tsx', import.meta.url);
const researchFacadeUrl = new URL('../src/server/research-workspace.ts', import.meta.url);

describe('workspace route and legacy SSR self-HTTP boundary', () => {
  it('redirects the root to v3 without loading the legacy dashboard', async () => {
    const [route, researchFacade] = await Promise.all([
      readFile(routeUrl, 'utf8'),
      readFile(researchFacadeUrl, 'utf8'),
    ]);

    assert.match(route, /throw redirect/);
    assert.match(route, /to:\s*'\/workspace'/);
    assert.doesNotMatch(route, /DashboardPage|loadWorkspaceBootstrap|LoginScreen/);
    assert.match(researchFacade, /brainRequest/);
    assert.doesNotMatch(researchFacade, /withReadSnapshot|queryRows/);
    assert.doesNotMatch(researchFacade, /Promise\.all\(/);

    for (const url of [
      new URL('../src/pages/dashboard/model/load-workspace-bootstrap.ts', import.meta.url),
      new URL('../src/pages/dashboard/model/resolve-dashboard-bootstrap.ts', import.meta.url),
      new URL('../src/server/workspace-bootstrap.ts', import.meta.url),
    ]) {
      await assert.rejects(access(url), { code: 'ENOENT' });
    }
  });
});
