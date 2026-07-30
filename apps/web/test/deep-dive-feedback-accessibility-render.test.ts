import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

type DeepDivePanelProps = {
  deepDive: null;
  errorMessage?: string;
  onRetry: () => void;
  onSelectEntity: (entityKey: string) => void;
  relation: null;
  state: 'error' | 'idle' | 'loading';
};

const webRoot = fileURLToPath(new URL('..', import.meta.url));

async function loadPanel() {
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
    const module = (await server.ssrLoadModule(
      '/src/pages/research-workspace/ui/stock-deep-dive-panel.tsx',
    )) as { StockDeepDivePanel: ComponentType<DeepDivePanelProps> };
    return module.StockDeepDivePanel;
  } finally {
    await server.close();
  }
}

function renderState(Panel: ComponentType<DeepDivePanelProps>, state: DeepDivePanelProps['state']) {
  return renderToStaticMarkup(
    createElement(Panel, {
      deepDive: null,
      onRetry: () => undefined,
      onSelectEntity: () => undefined,
      relation: null,
      state,
    }),
  );
}

describe('Deep Dive rendered feedback accessibility', () => {
  it('announces idle and loading feedback atomically as non-error status regions', async () => {
    const Panel = await loadPanel();

    for (const state of ['idle', 'loading'] as const) {
      const html = renderState(Panel, state);
      assert.match(html, /role="status"/);
      assert.match(html, /aria-atomic="true"/);
      assert.doesNotMatch(html, /role="alert"/);
    }
  });
});
