import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

type FormBoundary = {
  Field: ComponentType<{
    children: ReactNode;
    description?: ReactNode;
    error?: ReactNode;
    label?: ReactNode;
  }>;
  TextInput: ComponentType<Record<string, unknown>>;
};

const webRoot = fileURLToPath(new URL('..', import.meta.url));

async function loadFormBoundary() {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    root: webRoot,
    server: { hmr: false, middlewareMode: true, watch: null, ws: false },
  });

  try {
    return (await server.ssrLoadModule(
      '/src/shared/ui/primitives/form.tsx',
    )) as unknown as FormBoundary;
  } finally {
    await server.close();
  }
}

describe('Field rendered accessibility anatomy', () => {
  it('connects stable description and error IDs to its child control', async () => {
    const { Field, TextInput } = await loadFormBoundary();
    const html = renderToStaticMarkup(
      createElement(
        Field,
        {
          description: '이 입력값의 설명',
          error: '입력값을 확인해 주세요.',
          label: '종목 코드',
        },
        createElement(TextInput, {
          'aria-describedby': 'consumer-description',
          id: 'stock-code',
          name: 'stockCode',
        }),
      ),
    );

    assert.match(
      html,
      /<input(?=[^>]*id="stock-code")(?=[^>]*aria-describedby="consumer-description stock-code-description")(?=[^>]*aria-errormessage="stock-code-error")(?=[^>]*aria-invalid="true")[^>]*>/,
    );
    assert.match(
      html,
      /<span[^>]*id="stock-code-description"[^>]*data-slot="field-description"[^>]*>/,
    );
    assert.match(
      html,
      /<span[^>]*id="stock-code-error"[^>]*data-slot="field-error"[^>]*role="alert"[^>]*>/,
    );
  });
});
