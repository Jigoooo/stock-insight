import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const routerUrl = new URL('../src/router.tsx', import.meta.url);
const rootUrl = new URL('../src/pages/root/ui/root.tsx', import.meta.url);
const authenticatedUrl = new URL('../src/routes/_authenticated.tsx', import.meta.url);
const pageUrl = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.tsx',
  import.meta.url,
);
const presenterUrl = new URL(
  '../src/pages/research-workspace/ui/workspace-presenters.ts',
  import.meta.url,
);
const liveBannerCssUrl = new URL(
  '../src/shared/ui/live-data-environment/live-data-environment.module.css',
  import.meta.url,
);

describe('route feedback and development ergonomics', () => {
  it('shows initial and in-place navigation feedback and owns auth failures', async () => {
    const [router, root, authenticated] = await Promise.all([
      readFile(routerUrl, 'utf8'),
      readFile(rootUrl, 'utf8'),
      readFile(authenticatedUrl, 'utf8'),
    ]);

    assert.match(router, /defaultPendingComponent:\s*RoutePendingScreen/);
    assert.match(root, /<RouteProgress \/>/);
    assert.match(authenticated, /ssr:\s*false/);
    assert.match(authenticated, /staleTime:\s*Number\.POSITIVE_INFINITY/);
    assert.match(authenticated, /errorComponent:\s*AuthenticatedRouteError/);
  });

  it('keeps non-component formatter exports out of the Fast Refresh page module', async () => {
    const [page, presenter] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(presenterUrl, 'utf8'),
    ]);

    assert.doesNotMatch(page, /export function analysisStatusLabel/);
    assert.match(presenter, /export function analysisStatusLabel/);
  });

  it('uses particle-safe copy for a failed workspace tab', async () => {
    const page = await readFile(pageUrl, 'utf8');
    assert.match(page, /화면을\s*불러오지 못했습니다/);
    assert.doesNotMatch(page, /\}\s*을\s*\n?\s*불러오지 못했습니다/);
  });

  it('keeps the live-data badge away from bottom content', async () => {
    const css = await readFile(liveBannerCssUrl, 'utf8');
    assert.match(css, /top:\s*calc\(max\([^;]+\)\s*\+\s*4rem\)/);
    assert.doesNotMatch(css, /bottom:\s*max\(/);
  });
});
