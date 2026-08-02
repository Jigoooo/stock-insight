import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readUiLabSource = async (path: string) =>
  readFile(new URL(`../src/pages/ui-lab/ui/${path}`, import.meta.url), 'utf8');

describe('UI Lab navigation tabs catalog', () => {
  it('connects the navigation comparison catalog to the UI Lab', async () => {
    const page = await readUiLabSource('ui-lab-page.tsx');

    assert.match(page, /import \{ NavigationTabsCatalog \} from '\.\/navigation-tabs-catalog'/);
    assert.match(page, /<NavigationTabsCatalog \/>/);
  });

  it('keeps route navigation semantics separate from sliding tab state', async () => {
    const catalog = await readUiLabSource('navigation-tabs-catalog.tsx');

    assert.match(catalog, /from '@\/shared\/ui\/tabs'/);
    assert.match(catalog, /aria-label="경로 탭 비교"/);
    assert.match(catalog, /aria-current=\{activeRoute === item\.id \? 'page' : undefined\}/);
    assert.match(catalog, /<TabsHighlight/);
  });

  it('preserves the narrow-screen overflow contract', async () => {
    const css = await readUiLabSource('navigation-tabs-catalog.module.css');

    assert.match(css, /@media \(max-width: 520px\)/);
  });
});
