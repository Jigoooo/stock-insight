import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const globalStylesUrl = new URL('../public/styles/index.css', import.meta.url);
const rootRouteUrl = new URL('../src/routes/__root.tsx', import.meta.url);

describe('whole-product UX constitution', () => {
  it('keeps adaptive preferences and keyboard focus in the style foundation', async () => {
    const [globalStyles, rootRoute] = await Promise.all([
      readFile(globalStylesUrl, 'utf8'),
      readFile(rootRouteUrl, 'utf8'),
    ]);

    assert.doesNotMatch(globalStyles, /@import\s/);
    assert.match(globalStyles, /color-scheme:\s*light dark/);
    assert.match(globalStyles, /:focus-visible/);
    assert.match(globalStyles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    assert.match(globalStyles, /animation-iteration-count:\s*1\s*!important/);
    assert.match(rootRoute, /name:\s*'color-scheme',\s*content:\s*'light dark'/);
    assert.match(rootRoute, /href:\s*activeDesignProfile\.cssHref/);
  });
});
