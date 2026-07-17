import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const componentUrl = new URL('../src/pages/auth/login-page.tsx', import.meta.url);
const inputFieldUrl = new URL('../src/pages/auth/auth-input-field.tsx', import.meta.url);
const stylesheetUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
const fontStylesheetUrl = new URL('../public/styles/font.css', import.meta.url);
const rootRouteUrl = new URL('../src/routes/__root.tsx', import.meta.url);

describe('login page structure', () => {
  it('renders an identified login workflow with adaptive safety hooks', async () => {
    assert.equal(existsSync(componentUrl), true, 'the full-screen login page must exist');
    assert.equal(existsSync(stylesheetUrl), true, 'the login page stylesheet must exist');

    const [component, stylesheet] = await Promise.all([
      readFile(componentUrl, 'utf8'),
      readFile(stylesheetUrl, 'utf8'),
    ]);

    assert.match(component, /<main[\s\S]*?data-panel="sign-in"[\s\S]*?aria-labelledby=/);
    assert.match(component, /<h2 id="login-form-heading">로그인<\/h2>/);
    assert.match(stylesheet, /min-height:\s*100svh/);
    assert.match(stylesheet, /:focus-visible/);
    assert.match(stylesheet, /prefers-reduced-motion:\s*reduce/);
    assert.match(stylesheet, /prefers-reduced-transparency:\s*reduce/);
    assert.match(stylesheet, /prefers-contrast:\s*more/);
    assert.match(stylesheet, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
  });

  it('preserves an accessible credential form without placeholder SSO actions', async () => {
    assert.equal(existsSync(componentUrl), true, 'the login page must exist');
    const [component, inputField] = await Promise.all([
      readFile(componentUrl, 'utf8'),
      readFile(inputFieldUrl, 'utf8'),
    ]);

    assert.match(component, /onSubmit:\s*\(credentials:\s*LoginCredentials\)/);
    assert.match(component, /id="login-username"[\s\S]*?label="사용자 이름"/);
    assert.match(component, /autoComplete="username"/);
    assert.match(component, /id="login-password"[\s\S]*?label="비밀번호"/);
    assert.match(component, /autoComplete="current-password"/);
    assert.match(inputField, /<label htmlFor=\{id\}>\{label\}<\/label>/);
    assert.match(component, /aria-pressed=/);
    assert.match(component, /aria-live="(?:polite|assertive)"/);
    assert.match(component, /pending\??:\s*boolean/);
    assert.match(component, /error\??:\s*string\s*\|\s*null/);
    assert.match(component, /useSyncExternalStore\(/);
    assert.match(component, /<form[\s\S]*?method="post"/);
    assert.match(component, /disabled=\{!hydrated \|\| pending\}/);
    assert.doesNotMatch(component, /Google|Kakao|Naver|Apple|OAuth|SSO/i);
  });

  it('uses custom inline validation and focuses the first invalid field', async () => {
    const [component, inputField] = await Promise.all([
      readFile(componentUrl, 'utf8'),
      readFile(inputFieldUrl, 'utf8'),
    ]);

    assert.match(component, /<form[\s\S]*?noValidate/);
    assert.match(component, /validateLoginCredentials/);
    assert.match(component, /requestAnimationFrame/);
    assert.match(component, /errorId="login-username-error"/);
    assert.match(component, /errorId="login-password-error"/);
    assert.match(inputField, /<p id=\{errorId\}[\s\S]*?aria-live="polite"/);
    assert.doesNotMatch(component, /\srequired(?:=|\s|>)/);
  });

  it('preloads the real font without fixing one visual recipe', async () => {
    const [stylesheet, fontStylesheet, rootRoute] = await Promise.all([
      readFile(stylesheetUrl, 'utf8'),
      readFile(fontStylesheetUrl, 'utf8'),
      readFile(rootRouteUrl, 'utf8'),
    ]);

    assert.match(rootRoute, /WantedSansVariable\.woff2[\s\S]*?as:\s*'font'/);
    assert.match(fontStylesheet, /font-display:\s*optional/);
    assert.match(stylesheet, /\.fieldError\s*\{[\s\S]*?min-height:/);
    assert.match(stylesheet, /\.submitButton:focus-visible/);
  });
});
