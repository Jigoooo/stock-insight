import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const rootUrl = new URL('../src/routes/__root.tsx', import.meta.url);
const routerUrl = new URL('../src/router.tsx', import.meta.url);
const zodJitlessUrl = new URL('../src/zod-jitless.ts', import.meta.url);
const authRouteUrl = new URL('../src/routes/_authenticated.tsx', import.meta.url);
const workspaceRouteUrl = new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url);
const pageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);

describe('workspace router-owned session cache', () => {
  it('disables Zod JIT so the client never probes unsafe eval under edge CSP', async () => {
    const [router, bootstrap] = await Promise.all([
      readFile(routerUrl, 'utf8'),
      readFile(zodJitlessUrl, 'utf8'),
    ]);

    assert.match(router, /^import '\.\/zod-jitless';/);
    assert.doesNotMatch(router, /from 'zod'/);
    assert.match(bootstrap, /z\.config\(\{\s*jitless:\s*true\s*\}\)/);
  });

  it('creates one cache per router instance instead of a module-global user cache', async () => {
    const [root, router] = await Promise.all([
      readFile(rootUrl, 'utf8'),
      readFile(routerUrl, 'utf8'),
    ]);

    assert.match(root, /createRootRouteWithContext<StockInsightRouterContext>\(\)/);
    assert.match(router, /export type StockInsightRouterContext/);
    assert.match(router, /export function getRouter\(\)[\s\S]*?new WorkspaceViewCache/);
    assert.match(router, /context:\s*\{\s*workspaceViewCache/);
    assert.doesNotMatch(router, /const\s+workspaceViewCache\s*=\s*new WorkspaceViewCache/);
  });

  it('scopes cache after authenticated session resolution', async () => {
    const source = await readFile(authRouteUrl, 'utf8');

    assert.match(source, /beforeLoad:\s*async\s*\(\{\s*context,\s*location\s*\}\)/);
    assert.match(source, /context\.workspaceViewCache\.setScopeVersion\(session\.user\.id\)/);
    assert.match(source, /return \{ session \}/);
  });

  it('clears browser-held user data after successful logout', async () => {
    const [route, page] = await Promise.all([
      readFile(workspaceRouteUrl, 'utf8'),
      readFile(pageUrl, 'utf8'),
    ]);

    assert.match(page, /onLogout\?: \(\) => Promise<boolean>/);
    assert.doesNotMatch(page, /await logout\(\)/);
    assert.match(route, /workspaceViewCache\.clear\(\)/);
    assert.match(route, /onLogout=\{async \(\) =>/);
  });
});
