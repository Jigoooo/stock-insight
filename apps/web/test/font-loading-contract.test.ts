import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const rootUrl = new URL('../src/routes/__root.tsx', import.meta.url);
const workspaceRouteUrl = new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url);
const systemFontCssUrl = new URL('../public/styles/font.css', import.meta.url);
const wantedFontCssUrl = new URL('../public/styles/wanted-font.css', import.meta.url);

describe('route-scoped font loading contract', () => {
  it('keeps public auth on a system stack without preloading the full Korean font', async () => {
    const [root, systemFontCss] = await Promise.all([
      readFile(rootUrl, 'utf8'),
      readFile(systemFontCssUrl, 'utf8'),
    ]);

    assert.doesNotMatch(root, /WantedSansVariable\.woff2/);
    assert.match(root, /href:\s*'\/styles\/font\.css'/);
    assert.doesNotMatch(systemFontCss, /@font-face|Wanted Sans/);
    assert.match(systemFontCss, /-apple-system/);
    assert.match(systemFontCss, /Noto Sans KR/);
  });

  it('loads Wanted Sans only from the authenticated workspace route', async () => {
    const [workspaceRoute, wantedFontCss] = await Promise.all([
      readFile(workspaceRouteUrl, 'utf8'),
      readFile(wantedFontCssUrl, 'utf8'),
    ]);

    assert.match(workspaceRoute, /href:\s*'\/fonts\/WantedSansVariable\.woff2'/);
    assert.match(workspaceRoute, /href:\s*'\/styles\/wanted-font\.css'/);
    assert.match(wantedFontCss, /@font-face/);
    assert.match(wantedFontCss, /font-display:\s*optional/);
    assert.match(wantedFontCss, /font-family:\s*'Wanted Sans'/);
  });
});
