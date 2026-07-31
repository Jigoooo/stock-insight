import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

type WorkspaceStateProps = {
  announcement?: 'inherit' | 'self';
  description: string;
  kind: 'error';
  title: string;
};

const webRoot = fileURLToPath(new URL('..', import.meta.url));

async function loadWorkspaceState() {
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
    const module = (await server.ssrLoadModule('/src/shared/ui/workspace/workspace-state.tsx')) as {
      WorkspaceState: ComponentType<WorkspaceStateProps>;
    };
    return module.WorkspaceState;
  } finally {
    await server.close();
  }
}

describe('WorkspaceState announcement ownership', () => {
  it('keeps standalone errors assertive and atomic by default', async () => {
    const WorkspaceState = await loadWorkspaceState();
    const html = renderToStaticMarkup(
      createElement(WorkspaceState, {
        description: '다시 시도해 주세요.',
        kind: 'error',
        title: '독립 오류',
      }),
    );

    assert.match(html, /role="alert"/);
    assert.match(html, /aria-live="assertive"/);
    assert.match(html, /aria-atomic="true"/);
  });

  it('inherits an owning live region without a nested announcement', async () => {
    const WorkspaceState = await loadWorkspaceState();
    const html = renderToStaticMarkup(
      createElement(WorkspaceState, {
        announcement: 'inherit',
        description: '다시 시도해 주세요.',
        kind: 'error',
        title: '중첩 오류',
      }),
    );

    assert.doesNotMatch(html, /role="alert"|role="status"/);
    assert.doesNotMatch(html, /aria-live=|aria-atomic=/);
    assert.equal((html.match(/중첩 오류/g) ?? []).length, 1);
  });
});
