import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement, Fragment, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

type PrimitiveComponent = ComponentType<Record<string, unknown>>;

type TabsModule = {
  Tabs: PrimitiveComponent;
  TabsHighlight: PrimitiveComponent;
  TabsHighlightItem: PrimitiveComponent;
  TabsList: PrimitiveComponent;
  TabsTrigger: PrimitiveComponent;
};

const webRoot = fileURLToPath(new URL('..', import.meta.url));

async function loadTabs(): Promise<TabsModule> {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('../src', import.meta.url)),
      },
    },
    root: webRoot,
    server: { hmr: false, middlewareMode: true, watch: null, ws: false },
  });

  try {
    return (await server.ssrLoadModule(
      '/src/shared/ui/animate-ui/primitives/radix/tabs.tsx',
    )) as TabsModule;
  } finally {
    await server.close();
  }
}

function renderTablist(
  tabs: TabsModule,
  label: string,
  values: readonly string[],
  activationMode: 'automatic' | 'manual',
) {
  const panelId = `${values[0]}-panel`;
  return createElement(
    tabs.Tabs,
    { activationMode, defaultValue: values[0] },
    createElement(
      tabs.TabsHighlight,
      { click: false },
      createElement(
        tabs.TabsList,
        { 'aria-label': label },
        values.map((value) =>
          createElement(
            tabs.TabsHighlightItem,
            { key: value, value },
            createElement(
              tabs.TabsTrigger,
              { 'aria-controls': panelId, id: `${value}-tab`, value },
              value,
            ),
          ),
        ),
      ),
    ),
  );
}

describe('Animate UI Tabs rendered accessibility anatomy', () => {
  it('keeps selection ARIA exclusively on Today and Radar tab triggers', async () => {
    const tabs = await loadTabs();
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        renderTablist(tabs, '인사이트 분류', ['must_know', 'for_you', 'explore'], 'manual'),
        renderTablist(
          tabs,
          '시장 화면 선택',
          [
            'event_radar',
            'factor_map',
            'propagation_map',
            'theme_community',
            'heatmap_matrix',
            'timeline',
            'map_globe',
            'value_chain',
          ],
          'automatic',
        ),
      ),
    );

    const openingTags = html.match(/<[^/!][^>]*>/g) ?? [];
    const tabTags = openingTags.filter((tag) => /\srole="tab"(?:\s|>)/.test(tag));
    const selectionTags = openingTags.filter((tag) => /\saria-selected=/.test(tag));

    assert.match(html, /role="tablist"[^>]*aria-label="인사이트 분류"/);
    assert.match(html, /role="tablist"[^>]*aria-label="시장 화면 선택"/);
    assert.equal(tabTags.length, 11);
    assert.equal(selectionTags.length, tabTags.length);
    assert.ok(
      selectionTags.every((tag) => /\srole="tab"(?:\s|>)/.test(tag)),
      `aria-selected must belong only to role=tab elements:\n${selectionTags.join('\n')}`,
    );
  });
});
