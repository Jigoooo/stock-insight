import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const pageUrl = new URL('../src/pages/auth/signup-page.tsx', import.meta.url);
const shellUrl = new URL('../src/pages/auth/auth-shell.tsx', import.meta.url);
const inputFieldUrl = new URL('../src/pages/auth/auth-input-field.tsx', import.meta.url);
const screenUrl = new URL('../src/pages/auth/signup-screen.tsx', import.meta.url);
const stylesheetUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
const routeUrl = new URL('../src/routes/signup.tsx', import.meta.url);
const loginPageUrl = new URL('../src/pages/auth/login-page.tsx', import.meta.url);
const loginStylesheetUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
const rootRouteUrl = new URL('../src/routes/__root.tsx', import.meta.url);
const rootComponentUrl = new URL('../src/pages/root/ui/root.tsx', import.meta.url);

describe('one-time signup source contract', () => {
  it('shares the centered auth shell and keeps every availability state inside one presence region', async () => {
    assert.equal(existsSync(shellUrl), true, 'the shared auth shell must exist');
    const [page, shell, stylesheet] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(shellUrl, 'utf8'),
      readFile(stylesheetUrl, 'utf8'),
    ]);

    assert.match(page, /<AuthShell/);
    assert.match(page, /<PresenceRegion[\s\S]*?presenceKey=\{availability\}/);
    assert.match(page, /initial=\{\{\s*opacity:\s*0\s*\}\}/);
    assert.match(page, /exit=\{\{\s*opacity:\s*0\s*\}\}/);
    assert.doesNotMatch(page, /initial=\{\{[\s\S]*?\by:/);
    assert.doesNotMatch(page, /One-time workspace setup|setupNotes|brandPanel|formEyebrow/);
    assert.match(shell, /data-auth-card/);
    assert.match(stylesheet, /@media\s*\(max-width:\s*520px\)[\s\S]*?\.authCard/);
  });

  it('wires enrollment availability and account creation to the auth server functions', async () => {
    assert.equal(existsSync(screenUrl), true, 'signup screen must exist');
    const screen = await readFile(screenUrl, 'utf8');

    assert.match(
      screen,
      /import\s*\{\s*enrollAccount,\s*getEnrollmentStatus\s*\}\s*from\s*'@\/pages\/auth\/model\/auth-functions'/,
    );
    assert.match(screen, /getEnrollmentStatus\(\)/);
    assert.match(
      screen,
      /enrollAccount\(\{\s*data:\s*\{\s*username,\s*password,\s*enrollmentCode\s*\}\s*\}\)/,
    );
    assert.doesNotMatch(screen, /passwordConfirmation[\s\S]*?enrollAccount\(/);
    assert.match(screen, /window\.location\.assign\('\/workspace'\)/);
    assert.match(screen, /result\.error/);
  });

  it('provides an accessible custom-validated four-field form with stable errors', async () => {
    assert.equal(existsSync(pageUrl), true, 'signup page must exist');
    const [page, inputField] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(inputFieldUrl, 'utf8'),
    ]);

    assert.match(page, /<form[\s\S]*?noValidate/);
    assert.match(page, /validateSignupInput/);
    assert.match(page, /requestAnimationFrame/);
    for (const field of ['username', 'password', 'password-confirmation', 'enrollment-code']) {
      assert.match(page, new RegExp(`id="signup-${field}"`));
      assert.match(page, new RegExp(`errorId="signup-${field}-error"`));
    }
    assert.match(inputField, /<FieldLabel htmlFor=\{id\}>\{label\}<\/FieldLabel>/);
    assert.match(inputField, /'aria-describedby': descriptionIds \|\| undefined/);
    assert.match(inputField, /<FieldError id=\{errorId\}[\s\S]*?aria-live="polite"/);
    assert.match(page, /autoComplete="new-password"/);
    assert.match(page, /aria-invalid=/);
    assert.match(page, /import \{ AuthFeedbackRegion, type AuthFeedbackState \}/);
    assert.match(page, /<AuthFeedbackRegion state=\{feedbackState\} \/>/);
    assert.doesNotMatch(page, /\srequired(?:=|\s|>)/);
  });

  it('renders the unavailable completion state with a login exit', async () => {
    const [page, screen] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(screenUrl, 'utf8'),
    ]);

    assert.match(screen, /availability=\{availability\}/);
    assert.match(page, /가입 완료/);
    assert.match(page, /href="\/login"/);
    assert.match(page, /가입 가능한 계정이 이미 설정되어 있습니다/);
  });

  it('keeps auth navigation links free of scaling motion', async () => {
    const [signupPage, loginPage] = await Promise.all([
      readFile(pageUrl, 'utf8'),
      readFile(loginPageUrl, 'utf8'),
    ]);

    for (const [source, href] of [
      [signupPage, '/login'],
      [loginPage, '/signup'],
    ] as const) {
      const link = source.match(new RegExp(`<TextLink[^>]*href="${href}"[^>]*>`));
      assert.ok(link, `auth navigation link to ${href} must exist`);
      assert.match(link[0], /motion="(?:quiet|none)"/);
      assert.doesNotMatch(link[0], /motion="pressable"/);
    }
  });

  it('keeps responsive and accessible preference fallbacks without locking one aesthetic', async () => {
    assert.equal(existsSync(stylesheetUrl), true, 'signup stylesheet must exist');
    const [stylesheet, rootRoute, rootComponent] = await Promise.all([
      readFile(stylesheetUrl, 'utf8'),
      readFile(rootRouteUrl, 'utf8'),
      readFile(rootComponentUrl, 'utf8'),
    ]);

    assert.match(stylesheet, /\.fieldFeedback\s*\{[\s\S]*?min-height:/);
    assert.match(stylesheet, /:focus-visible/);
    assert.match(rootComponent, /<MotionConfig reducedMotion="user">/);
    assert.match(stylesheet, /prefers-reduced-transparency:\s*reduce/);
    assert.match(stylesheet, /prefers-contrast:\s*more/);
    assert.match(stylesheet, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
    assert.match(rootRoute, /name:\s*'color-scheme',\s*content:\s*'light dark'/);
  });

  it('registers the signup route and adds a restrained account link to login', async () => {
    assert.equal(existsSync(routeUrl), true, 'signup route must exist');
    const [route, loginPage, loginStylesheet] = await Promise.all([
      readFile(routeUrl, 'utf8'),
      readFile(loginPageUrl, 'utf8'),
      readFile(loginStylesheetUrl, 'utf8'),
    ]);

    assert.match(route, /createFileRoute\('\/signup'\)/);
    assert.match(route, /<SignupScreen\s*\/>/);
    assert.match(loginPage, /<TextLink[^>]*href="\/signup"[^>]*>\s*계정 만들기\s*<\/TextLink>/);
    assert.match(loginStylesheet, /\.signupLink/);
  });
});
