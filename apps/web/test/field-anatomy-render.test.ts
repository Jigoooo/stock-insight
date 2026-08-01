import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

type AuthFieldBoundary = {
  AuthInputField: ComponentType<Record<string, unknown>>;
};

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

async function loadAuthFieldBoundary() {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    resolve: { alias: { '@': sourceRoot } },
    root: webRoot,
    server: { hmr: false, middlewareMode: true, watch: null, ws: false },
  });

  try {
    return (await server.ssrLoadModule(
      '/src/pages/auth/auth-input-field.tsx',
    )) as unknown as AuthFieldBoundary;
  } finally {
    await server.close();
  }
}

describe('Field rendered accessibility anatomy', () => {
  it('connects stable description and error IDs to the canonical input', async () => {
    const { AuthInputField } = await loadAuthFieldBoundary();
    const html = renderToStaticMarkup(
      createElement(AuthInputField, {
        'aria-describedby': 'consumer-description',
        'aria-invalid': true,
        error: '입력값을 확인해 주세요.',
        errorId: 'stock-code-error',
        hint: '이 입력값의 설명',
        hintId: 'stock-code-description',
        id: 'stock-code',
        label: '종목 코드',
        name: 'stockCode',
      }),
    );

    assert.match(
      html,
      /<input(?=[^>]*id="stock-code")(?=[^>]*aria-describedby="consumer-description stock-code-description stock-code-error")(?=[^>]*aria-invalid="true")[^>]*>/,
    );
    assert.match(
      html,
      /<p(?=[^>]*id="stock-code-description")(?=[^>]*data-slot="field-description")[^>]*>/,
    );
    assert.match(
      html,
      /<div(?=[^>]*id="stock-code-error")(?=[^>]*role="alert")(?=[^>]*data-slot="field-error")[^>]*>/,
    );
  });
});
