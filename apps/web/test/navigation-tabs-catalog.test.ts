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

function balancedCssBlock(source: string, start: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing CSS block start: ${start}`);

  const openingBraceIndex = source.indexOf('{', startIndex + start.length);
  assert.notEqual(openingBraceIndex, -1, `Missing opening brace for CSS block: ${start}`);

  let depth = 0;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;

      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  assert.fail(`Missing closing brace for CSS block: ${start}`);
}

describe('UI Lab navigation tabs catalog', () => {
  it('connects the navigation comparison catalog to the UI Lab', async () => {
    const page = await readUiLabSource('ui-lab-page.tsx');

    assert.match(page, /import \{ NavigationTabsCatalog \} from '\.\/navigation-tabs-catalog'/);
    assert.match(page, /<NavigationTabsCatalog \/>/);
  });

  it('keeps route navigation semantics separate from sliding tab state', async () => {
    const catalog = await readUiLabSource('navigation-tabs-catalog.tsx');
    const routes = arrayDeclaration(catalog, 'routeItems');
    const routeSection = sourceBlock(
      catalog,
      '<nav aria-label={`경로 탭 비교 · ${variant.title}`}>',
      '</nav>',
    );
    const slidingSection = sourceBlock(
      catalog,
      '<Tabs value={activeView} onValueChange={setActiveView}>',
      '</Tabs>',
    );

    assert.match(catalog, /from '@\/shared\/ui\/tabs'/);
    assert.match(routeSection, /<nav aria-label=\{`경로 탭 비교 · \$\{variant\.title\}`\}>/);
    assert.match(
      routeSection,
      /(?:<a\b(?=[^>]*href=\{item\.href\})(?=[^>]*aria-current=\{activeRoute === item\.id \? 'page' : undefined\})[^>]*>|<Link\b(?=[^>]*to=\{item\.href\})(?=[^>]*aria-current=\{activeRoute === item\.id \? 'page' : undefined\})[^>]*>)/,
    );
    for (const route of ['overview', 'evidence', 'timeline']) {
      assert.match(routes, new RegExp(`href: '/__ui-lab\\?route-tab=${route}'`));
    }
    assert.doesNotMatch(routes, /href: '#/);
    assert.match(routeSection, /onClick=\{\(event\) => selectRoute\(event, item\)\}/);
    assert.match(catalog, /event\.preventDefault\(\)/);
    assert.match(
      catalog,
      /window\.history\.replaceState\(window\.history\.state, '', item\.href\)/,
    );
    assert.match(slidingSection, /<Tabs value=\{activeView\} onValueChange=\{setActiveView\}>/);
    assert.match(slidingSection, /<TabsHighlight/);
    assert.match(slidingSection, /aria-label=\{`화면 탭 비교 · \$\{variant\.title\}`\}/);
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
    const mobileCss = balancedCssBlock(css, '@media (max-width: 520px)');
    const slidingTargetCss = balancedCssBlock(
      mobileCss,
      ".variantCard[data-variant] .slidingList [role='tab']",
    );

    assert.match(mobileCss, /overflow-x: auto/);
    assert.match(mobileCss, /(?:flex-wrap|white-space): nowrap/);
    assert.match(mobileCss, /min-height: 44px/);
    assert.match(slidingTargetCss, /min-height: 44px/);
  });

  it('styles the rendered tab role instead of the overwritten trigger slot', async () => {
    const css = await readUiLabSource('navigation-tabs-catalog.module.css');
    const baseTriggerCss = balancedCssBlock(css, ".slidingList [role='tab']");
    const softInsetTriggerCss = balancedCssBlock(
      css,
      ".variantCard[data-variant='soft-inset'] .slidingList [role='tab']",
    );
    const underlineTriggerCss = balancedCssBlock(
      css,
      ".variantCard[data-variant='sliding-underline'] .slidingList [role='tab']",
    );
    const reducedMotionCss = balancedCssBlock(css, '@media (prefers-reduced-motion: reduce)');

    assert.match(baseTriggerCss, /width: 100%/);
    assert.match(softInsetTriggerCss, /border-radius:/);
    assert.match(underlineTriggerCss, /min-height: 42px/);
    assert.match(reducedMotionCss, /\.slidingList \[role='tab'\]/);
    assert.doesNotMatch(css, /\[data-slot='tabs-trigger'\]/);
  });

  it('keeps the catalog layout and indicator stronger than shared tab defaults', async () => {
    const css = await readUiLabSource('navigation-tabs-catalog.module.css');
    const listCss = balancedCssBlock(css, '.variantCard[data-variant] .slidingList');
    const indicatorCss = balancedCssBlock(
      css,
      '.variantCard[data-variant] .slidingList .slidingHighlight',
    );

    assert.match(listCss, /display: grid/);
    assert.match(listCss, /grid-template-columns: repeat\(3, minmax\(108px, 1fr\)\)/);
    assert.match(indicatorCss, /width: auto/);
    assert.match(indicatorCss, /padding: 0/);
    assert.match(indicatorCss, /border: 0/);
    assert.match(indicatorCss, /box-shadow: none/);
  });
});
