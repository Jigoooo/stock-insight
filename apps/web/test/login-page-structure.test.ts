import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const componentUrl = new URL('../src/pages/auth/login-page.tsx', import.meta.url);
const shellUrl = new URL('../src/pages/auth/auth-shell.tsx', import.meta.url);
const inputFieldUrl = new URL('../src/pages/auth/auth-input-field.tsx', import.meta.url);
const stylesheetUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
const fontStylesheetUrl = new URL('../public/styles/font.css', import.meta.url);
const rootRouteUrl = new URL('../src/routes/__root.tsx', import.meta.url);
const rootComponentUrl = new URL('../src/pages/root/ui/root.tsx', import.meta.url);

describe('login page structure', () => {
  it('uses the shared OpenHuman-style auth shell without legacy marketing chrome', async () => {
    assert.equal(existsSync(shellUrl), true, 'the shared auth shell must exist');
    const [component, shell, stylesheet] = await Promise.all([
      readFile(componentUrl, 'utf8'),
      readFile(shellUrl, 'utf8'),
      readFile(stylesheetUrl, 'utf8'),
    ]);

    assert.match(component, /<AuthShell[\s\S]*?title="로그인"/);
    assert.doesNotMatch(component, /계정으로 로그인해 개인 리서치 워크스페이스를 확인하세요/);
    assert.match(shell, />Stock Insight</);
    assert.match(shell, /data-auth-shell/);
    assert.match(shell, /data-auth-card/);
    assert.match(shell, /<Effect/);
    assert.doesNotMatch(shell, /slide=/);
    assert.doesNotMatch(shell, /theme|테마 전환|brand-logo|>F</i);
    assert.doesNotMatch(
      component,
      /Research workspace|시장의 흐름을 읽고|판단의 근거를 남깁니다|loginVisualPanel/,
    );
    assert.match(stylesheet, /\.authCard\s*\{[\s\S]*?max-width:\s*400px/);
    assert.match(stylesheet, /\.authCard\s*\{[\s\S]*?border-radius:\s*16px/);
    assert.match(stylesheet, /\.authGrid/);
    assert.match(stylesheet, /\.authGlow/);
  });

  it('renders an identified login workflow with adaptive safety hooks', async () => {
    assert.equal(existsSync(componentUrl), true, 'the full-screen login page must exist');
    assert.equal(existsSync(stylesheetUrl), true, 'the login page stylesheet must exist');

    const [component, shell, stylesheet, rootComponent] = await Promise.all([
      readFile(componentUrl, 'utf8'),
      readFile(shellUrl, 'utf8'),
      readFile(stylesheetUrl, 'utf8'),
      readFile(rootComponentUrl, 'utf8'),
    ]);

    assert.match(shell, /<main[\s\S]*?aria-labelledby=\{headingId\}/);
    assert.match(component, /headingId="login-form-heading"/);
    assert.match(component, /title="로그인"/);
    assert.match(stylesheet, /min-height:\s*100svh/);
    assert.doesNotMatch(stylesheet, /\.(?:primaryLink|signupLink):focus-visible/);
    assert.match(rootComponent, /<MotionConfig reducedMotion="user">/);
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
    assert.match(inputField, /<FieldLabel htmlFor=\{id\}>\{label\}<\/FieldLabel>/);
    assert.match(component, /aria-pressed=/);
    assert.match(component, /import \{ AuthFeedbackRegion, type AuthFeedbackState \}/);
    assert.match(component, /<AuthFeedbackRegion state=\{feedbackState\} \/>/);
    assert.match(component, /pending\??:\s*boolean/);
    assert.match(component, /error\??:\s*string\s*\|\s*null/);
    assert.match(component, /useSyncExternalStore\(/);
    assert.match(component, /<form[\s\S]*?method="post"/);
    assert.match(component, /disabled=\{!hydrated \|\| pending\}/);
    assert.doesNotMatch(component, /Google|Kakao|Naver|Apple|OAuth|SSO/i);
  });

  it('uses state-matched password visibility icons without replacing the accessible label', async () => {
    const [component, stylesheet] = await Promise.all([
      readFile(componentUrl, 'utf8'),
      readFile(stylesheetUrl, 'utf8'),
    ]);

    assert.match(component, /import \{ Eye, EyeOff \} from 'lucide-react'/);
    assert.match(
      component,
      /aria-label=\{showPassword \? '비밀번호 숨기기' : '비밀번호 표시하기'\}/,
    );
    assert.match(component, /showPassword \? <EyeOff[^>]*aria-hidden="true"[^>]*\/> : <Eye/);
    assert.doesNotMatch(component, /\{showPassword \? '숨기기' : '보기'\}/);
    assert.match(
      stylesheet,
      /\.authCard \.visibilityButton\[data-slot='button-control'\]\s*\{(?=[^}]*width:\s*32px)(?=[^}]*height:\s*32px)(?=[^}]*min-width:\s*32px)(?=[^}]*min-height:\s*32px)[^}]*\}/s,
    );
    assert.match(stylesheet, /\.visibilityButton\s+svg\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/s);
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
    assert.match(inputField, /<FieldError id=\{errorId\}[\s\S]*?aria-live="polite"/);
    assert.doesNotMatch(component, /\srequired(?:=|\s|>)/);
  });

  it('keeps public auth on the system font while preserving form feedback geometry', async () => {
    const [stylesheet, fontStylesheet, rootRoute] = await Promise.all([
      readFile(stylesheetUrl, 'utf8'),
      readFile(fontStylesheetUrl, 'utf8'),
      readFile(rootRouteUrl, 'utf8'),
    ]);

    assert.doesNotMatch(rootRoute, /WantedSansVariable\.woff2/);
    assert.doesNotMatch(fontStylesheet, /@font-face|Wanted Sans/);
    assert.match(fontStylesheet, /Noto Sans KR/);
    assert.match(stylesheet, /\.fieldFeedback\s*\{[\s\S]*?min-height:/);
    assert.doesNotMatch(stylesheet, /\.submitButton:focus-visible/);
  });
});
