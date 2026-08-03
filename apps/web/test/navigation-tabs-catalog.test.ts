import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readUiLabSource = async (path: string) =>
  readFile(new URL(`../src/pages/ui-lab/ui/${path}`, import.meta.url), 'utf8');

const readSharedUiSource = async (path: string) =>
  readFile(new URL(`../src/shared/ui/${path}`, import.meta.url), 'utf8');

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

    assert.match(page, /NavigationTabsCatalog,[\s\S]*from '\.\/navigation-tabs-catalog'/);
    assert.match(page, /<NavigationTabsCatalog initialRouteTab=\{initialRouteTab\} \/>/);
  });

  it('keeps route navigation semantics separate from sliding tab state', async () => {
    const catalog = await readUiLabSource('navigation-tabs-catalog.tsx');
    const route = await readFile(new URL('../src/routes/[__ui-lab].tsx', import.meta.url), 'utf8');
    const page = await readUiLabSource('ui-lab-page.tsx');
    const routes = arrayDeclaration(catalog, 'routeItems');
    const routeSection = sourceBlock(catalog, '<RouteTabs', '</RouteTabs>');
    const slidingSection = sourceBlock(catalog, '<Tabs\n                  fullWidth', '</Tabs>');

    assert.match(catalog, /from '@\/shared\/ui\/tabs'/);
    assert.match(routeSection, /aria-label=\{`경로 탭 비교 · \$\{variant\.title\}`\}/);
    assert.match(
      routeSection,
      /<RouteTab\b(?=[^>]*href=\{item\.href\})(?=[^>]*active=\{activeRoute === item\.id\})[^>]*>/,
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
    assert.match(slidingSection, /value=\{activeView\}/);
    assert.match(slidingSection, /onValueChange=\{setActiveView\}/);
    assert.match(slidingSection, /<TabsHighlight/);
    assert.match(slidingSection, /aria-label=\{`화면 탭 비교 · \$\{variant\.title\}`\}/);
    assert.match(slidingSection, /<TabsTrigger[\s\S]*value=\{item\.id\}/);
    assert.doesNotMatch(
      slidingSection,
      /\bhref=|<Link\b|\bnavigate\(|window\.location|history\.(?:pushState|replaceState)/,
    );
    assert.match(route, /validateSearch:/);
    assert.match(route, /search\['route-tab'\]/);
    assert.match(route, /<UiLabPage initialRouteTab=\{search\['route-tab'\]\} \/>/);
    assert.match(page, /<NavigationTabsCatalog initialRouteTab=\{initialRouteTab\} \/>/);
    assert.match(catalog, /useState<RouteTabId>\(initialRouteTab\)/);
  });

  it('preserves native modified-click behavior for route links', async () => {
    const catalog = await readUiLabSource('navigation-tabs-catalog.tsx');
    const selectRoute = sourceBlock(catalog, 'const selectRoute =', '\n  };');

    assert.match(selectRoute, /event\.button !== 0/);
    assert.match(selectRoute, /event\.metaKey/);
    assert.match(selectRoute, /event\.ctrlKey/);
    assert.match(selectRoute, /event\.shiftKey/);
    assert.match(selectRoute, /event\.altKey/);
    assert.match(selectRoute, /event\.currentTarget\.target/);
    assert.match(selectRoute, /return;/);
    assert.match(selectRoute, /event\.preventDefault\(\)/);
  });

  it('scopes all four approved visual variants to the correct navigation behavior', async () => {
    const catalog = await readUiLabSource('navigation-tabs-catalog.tsx');
    const routeVariants = arrayDeclaration(catalog, 'routeVariants');
    const slidingVariants = arrayDeclaration(catalog, 'slidingVariants');

    for (const variant of ['hairline', 'quiet-surface']) {
      assert.match(routeVariants, new RegExp(`id: '${variant}'`));
      assert.doesNotMatch(slidingVariants, new RegExp(`id: '${variant}'`));
    }

    for (const variant of ['soft-inset', 'sliding-underline']) {
      assert.match(slidingVariants, new RegExp(`id: '${variant}'`));
      assert.doesNotMatch(routeVariants, new RegExp(`id: '${variant}'`));
    }

    assert.match(catalog, /routeVariants\.map\(\(variant\) =>[\s\S]*?data-variant=\{variant\.id\}/);
    assert.match(
      catalog,
      /slidingVariants\.map\(\(variant\) =>[\s\S]*?data-variant=\{variant\.id\}/,
    );
  });

  it('keeps only the approved Route and Sliding variants on shared components', async () => {
    const catalog = await readUiLabSource('navigation-tabs-catalog.tsx');
    const routeVariants = arrayDeclaration(catalog, 'routeVariants');
    const slidingVariants = arrayDeclaration(catalog, 'slidingVariants');

    assert.match(catalog, /from '@\/shared\/ui\/route-tabs'/);
    assert.match(catalog, /<RouteTabs[\s\S]*variant=\{variant\.id\}/);
    assert.match(catalog, /<RouteTab[\s\S]*active=\{activeRoute === item\.id\}/);
    assert.match(catalog, /<Tabs[\s\S]*fullWidth[\s\S]*variant=\{variant\.id\}/);
    assert.match(routeVariants, /id: 'hairline'/);
    assert.match(routeVariants, /id: 'quiet-surface'/);
    assert.doesNotMatch(routeVariants, /id: 'ledger'/);
    assert.match(slidingVariants, /id: 'soft-inset'/);
    assert.match(slidingVariants, /id: 'sliding-underline'/);
    assert.doesNotMatch(slidingVariants, /id: 'flush-segment'/);
  });

  it('preserves the narrow-screen overflow contract', async () => {
    const [routeCss, tabsCss] = await Promise.all([
      readSharedUiSource('route-tabs/route-tabs.module.css'),
      readSharedUiSource('tabs/tabs.module.css'),
    ]);
    const routeMobileCss = balancedCssBlock(routeCss, '@media (max-width: 520px)');
    const tabsMobileCss = balancedCssBlock(tabsCss, '@media (max-width: 520px)');

    assert.match(routeMobileCss, /overflow-x: auto/);
    assert.match(routeMobileCss, /white-space: nowrap/);
    assert.match(routeMobileCss, /min-height: 44px/);
    assert.match(tabsMobileCss, /overflow-x: auto/);
    assert.match(tabsMobileCss, /min-height: 44px/);
  });

  it('styles the rendered tab role from shared Tabs instead of the overwritten trigger slot', async () => {
    const css = await readSharedUiSource('tabs/tabs.module.css');
    const baseTriggerCss = balancedCssBlock(css, '.trigger');
    const softInsetTriggerCss = balancedCssBlock(css, ".root[data-variant='soft-inset'] .trigger");
    const underlineTriggerCss = balancedCssBlock(
      css,
      ".root[data-variant='sliding-underline'] .trigger",
    );
    const reducedMotionCss = balancedCssBlock(css, '@media (prefers-reduced-motion: reduce)');

    assert.match(baseTriggerCss, /width: 100%/);
    assert.match(softInsetTriggerCss, /border-radius:/);
    assert.match(underlineTriggerCss, /min-height: 42px/);
    assert.match(reducedMotionCss, /\.trigger/);
    assert.doesNotMatch(css, /\[data-slot='tabs-trigger'\]/);
  });

  it('leaves selected and focus visuals to shared navigation components', async () => {
    const css = await readUiLabSource('navigation-tabs-catalog.module.css');

    assert.doesNotMatch(css, /\[aria-current='page'\]/);
    assert.doesNotMatch(css, /\[role='tab'\]/);
    assert.doesNotMatch(css, /data-slot='motion-highlight'/);
  });
});
