import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

type AuthFeedbackState =
  | { key: 'idle' }
  | { key: 'pending'; message: string }
  | { key: 'error'; id: string; message: string };

type AuthFeedbackRegionProps = {
  state: AuthFeedbackState;
};

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const regionUrl = new URL('../src/pages/auth/auth-feedback-region.tsx', import.meta.url);
const stylesheetUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
const loginUrl = new URL('../src/pages/auth/login-page.tsx', import.meta.url);
const signupUrl = new URL('../src/pages/auth/signup-page.tsx', import.meta.url);

async function loadRegion() {
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
    const module = (await server.ssrLoadModule('/src/pages/auth/auth-feedback-region.tsx')) as {
      AuthFeedbackRegion: ComponentType<AuthFeedbackRegionProps>;
    };
    return module.AuthFeedbackRegion;
  } finally {
    await server.close();
  }
}

describe('auth feedback region', () => {
  it('renders idle, pending, and error through one stable announcement node', async () => {
    assert.equal(existsSync(regionUrl), true, 'the shared auth feedback region must exist');
    const AuthFeedbackRegion = await loadRegion();
    const states: AuthFeedbackState[] = [
      { key: 'idle' },
      { key: 'pending', message: '계정 정보를 확인하고 있습니다.' },
      { key: 'error', id: 'login-error', message: '아이디 또는 비밀번호를 확인해 주세요.' },
    ];
    const [idle, pending, error] = states.map((state) =>
      renderToStaticMarkup(createElement(AuthFeedbackRegion, { state })),
    );

    for (const html of [idle, pending, error]) {
      assert.equal((html.match(/data-auth-feedback-announcement/g) ?? []).length, 1);
      assert.equal((html.match(/aria-atomic="true"/g) ?? []).length, 1);
      assert.equal((html.match(/aria-hidden="true"/g) ?? []).length, 1);
    }
    assert.doesNotMatch(idle, /role="(?:status|alert)"|aria-live=/);
    assert.match(pending, /data-auth-feedback-announcement[^>]*role="status"/);
    assert.match(pending, /aria-live="polite"/);
    assert.match(error, /id="login-error"[^>]*role="alert"/);
    assert.match(error, /aria-live="assertive"/);
  });

  it('uses synchronized restrained presence inside a fixed-geometry slot', async () => {
    const [region, stylesheet] = await Promise.all([
      readFile(regionUrl, 'utf8'),
      readFile(stylesheetUrl, 'utf8'),
    ]);

    assert.match(region, /mode="sync"/);
    assert.match(region, /presenceKey=\{state\.key\}/);
    assert.match(region, /aria-hidden="true"/);
    assert.match(region, /useReducedMotion\(\)/);
    assert.doesNotMatch(region, /scale|blur|filter|boxShadow|layout/);
    for (const movement of region.matchAll(/\by:\s*(-?\d+(?:\.\d+)?)/g)) {
      assert.ok(Math.abs(Number(movement[1])) <= 2, 'feedback translation must stay within 2px');
    }
    assert.match(stylesheet, /\.feedbackSlot\s*\{[\s\S]*?min-height:/);
    assert.match(stylesheet, /\.feedbackVisual\s*\{[\s\S]*?grid-area:\s*1\s*\/\s*1/);
  });

  it('makes both auth pages derive one state and preserve error description links', async () => {
    const [login, signup] = await Promise.all([
      readFile(loginUrl, 'utf8'),
      readFile(signupUrl, 'utf8'),
    ]);

    for (const page of [login, signup]) {
      assert.match(page, /<AuthFeedbackRegion state=\{feedbackState\}\s*\/>/);
      assert.doesNotMatch(page, /styles\.(?:errorMessage|pendingMessage)/);
      assert.doesNotMatch(page, /<(?:output|p)[^>]*aria-live=/);
    }
    assert.match(login, /error\s*\?\s*\{\s*key:\s*'error',[\s\S]*?:\s*pending\s*\?/);
    assert.match(signup, /error\s*\?\s*\{\s*key:\s*'error',[\s\S]*?:\s*pending\s*\?/);
    assert.match(login, /aria-describedby=\{usernameDescribedBy\}/);
    assert.match(login, /aria-describedby=\{passwordDescribedBy\}/);
    assert.match(login, /id:\s*'login-error'/);
  });
});
