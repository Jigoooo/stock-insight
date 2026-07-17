import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const routeUrl = new URL('../src/routes/index.tsx', import.meta.url);
const serverFnUrl = new URL(
  '../src/pages/dashboard/model/load-workspace-bootstrap.ts',
  import.meta.url,
);
const facadeUrl = new URL('../src/server/workspace-bootstrap.ts', import.meta.url);
const researchFacadeUrl = new URL('../src/server/research-workspace.ts', import.meta.url);

describe('workspace route and legacy SSR self-HTTP boundary', () => {
  it('redirects the root to v3 without loading the legacy dashboard', async () => {
    const [route, serverFn, facade, researchFacade] = await Promise.all([
      readFile(routeUrl, 'utf8'),
      readFile(serverFnUrl, 'utf8'),
      readFile(facadeUrl, 'utf8'),
      readFile(researchFacadeUrl, 'utf8'),
    ]);

    assert.match(route, /throw redirect/);
    assert.match(route, /to:\s*'\/workspace'/);
    assert.doesNotMatch(route, /DashboardPage|loadWorkspaceBootstrap|LoginScreen/);
    assert.match(serverFn, /createServerFn/);
    assert.match(serverFn, /loadWorkspaceBootstrapDirect/);
    assert.doesNotMatch(serverFn, /fetch\s*\(/);
    assert.match(facade, /createReadOnlyDatabaseClient/);
    assert.match(facade, /requireUserScope/);
    assert.doesNotMatch(facade, /fetch\s*\(|buildRequestOrigin|\/api\//);
    assert.match(researchFacade, /withReadSnapshot/);
    assert.doesNotMatch(researchFacade, /Promise\.all\(/);
  });
});
