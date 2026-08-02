import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readUiLabSource = async (path: string) =>
  readFile(new URL(`../src/pages/ui-lab/ui/${path}`, import.meta.url), 'utf8');

function sourceBlock(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `Missing source block start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source block end: ${end}`);

  return source.slice(startIndex, endIndex + end.length);
}

function arrayDeclaration(source: string, name: string) {
  const declaration = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\](?: as const)?;`));

  assert.ok(declaration, `Missing array declaration: ${name}`);

  return declaration[0];
}

describe('UI Lab navigation tabs catalog', () => {
  it('connects the navigation comparison catalog to the UI Lab', async () => {
    const page = await readUiLabSource('ui-lab-page.tsx');

    assert.match(page, /import \{ NavigationTabsCatalog \} from '\.\/navigation-tabs-catalog'/);
    assert.match(page, /<NavigationTabsCatalog \/>/);
  });

  it('keeps route navigation semantics separate from sliding tab state', async () => {
    const catalog = await readUiLabSource('navigation-tabs-catalog.tsx');
    const routeSection = sourceBlock(catalog, '<nav aria-label="경로 탭 비교">', '</nav>');
    const slidingSection = sourceBlock(
      catalog,
      '<Tabs value={activeView} onValueChange={setActiveView}>',
      '</Tabs>',
    );

    assert.match(catalog, /from '@\/shared\/ui\/tabs'/);
    assert.match(routeSection, /<nav aria-label="경로 탭 비교">/);
    assert.match(
      routeSection,
      /(?:<a[\s\S]*href=\{item\.href\}|<Link[\s\S]*(?:href|to)=\{item\.href\})/,
    );
    assert.match(routeSection, /aria-current=\{activeRoute === item\.id \? 'page' : undefined\}/);
    assert.match(slidingSection, /<Tabs value=\{activeView\} onValueChange=\{setActiveView\}>/);
    assert.match(slidingSection, /<TabsHighlight/);
    assert.match(slidingSection, /<TabsTrigger[\s\S]*value=\{item\.id\}/);
    assert.doesNotMatch(
      slidingSection,
      /\bhref=|<Link\b|\bnavigate\(|window\.location|history\.(?:pushState|replaceState)/,
    );
  });

  it('scopes all six visual variants to the correct navigation behavior', async () => {
    const catalog = await readUiLabSource('navigation-tabs-catalog.tsx');
    const routeVariants = arrayDeclaration(catalog, 'routeVariants');
    const slidingVariants = arrayDeclaration(catalog, 'slidingVariants');

    for (const variant of ['hairline', 'quiet-surface', 'ledger']) {
      assert.match(routeVariants, new RegExp(`id: '${variant}'`));
      assert.doesNotMatch(slidingVariants, new RegExp(`id: '${variant}'`));
    }

    for (const variant of ['soft-inset', 'flush-segment', 'sliding-underline']) {
      assert.match(slidingVariants, new RegExp(`id: '${variant}'`));
      assert.doesNotMatch(routeVariants, new RegExp(`id: '${variant}'`));
    }

    assert.match(catalog, /routeVariants\.map\(\(variant\) =>[\s\S]*?data-variant=\{variant\.id\}/);
    assert.match(
      catalog,
      /slidingVariants\.map\(\(variant\) =>[\s\S]*?data-variant=\{variant\.id\}/,
    );
  });

  it('preserves the narrow-screen overflow contract', async () => {
    const css = await readUiLabSource('navigation-tabs-catalog.module.css');
    const mobileCss = css.slice(css.indexOf('@media (max-width: 520px)'));

    assert.match(css, /@media \(max-width: 520px\)/);
    assert.match(mobileCss, /overflow-x: auto/);
    assert.match(mobileCss, /(?:flex-wrap|white-space): nowrap/);
    assert.match(mobileCss, /min-height: 44px/);
  });
});
