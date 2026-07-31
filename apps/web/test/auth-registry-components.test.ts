import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const animateButtonUrl = new URL(
  '../src/shared/ui/animate-ui/components/buttons/button.tsx',
  import.meta.url,
);
const animateButtonPrimitiveUrl = new URL(
  '../src/shared/ui/animate-ui/primitives/buttons/button.tsx',
  import.meta.url,
);
const shadcnInputUrl = new URL('../src/shared/ui/input.tsx', import.meta.url);
const shadcnFieldUrl = new URL('../src/shared/ui/field.tsx', import.meta.url);
const shadcnInputGroupUrl = new URL('../src/shared/ui/input-group.tsx', import.meta.url);
const tailwindFoundationUrl = new URL('../src/shared/ui/tailwind.css', import.meta.url);
const authInputUrl = new URL('../src/pages/auth/auth-input-field.tsx', import.meta.url);
const loginUrl = new URL('../src/pages/auth/login-page.tsx', import.meta.url);
const signupUrl = new URL('../src/pages/auth/signup-page.tsx', import.meta.url);
const authCssUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);

describe('auth registry component adoption', () => {
  it('keeps the official Animate UI button API and motion defaults', async () => {
    const [button, primitive] = await Promise.all([
      readFile(animateButtonUrl, 'utf8'),
      readFile(animateButtonPrimitiveUrl, 'utf8'),
    ]);

    assert.match(button, /class-variance-authority/);
    assert.match(button, /variant:\s*\{[\s\S]*?accent:/);
    assert.match(button, /variant:\s*\{[\s\S]*?ghost:/);
    assert.match(primitive, /HTMLMotionProps<'button'>/);
    assert.match(primitive, /hoverScale\s*=\s*1\.05/);
    assert.match(primitive, /tapScale\s*=\s*0\.95/);
    assert.match(primitive, /whileHover=\{\{\s*scale:\s*hoverScale\s*\}\}/);
    assert.match(primitive, /whileTap=\{\{\s*scale:\s*tapScale\s*\}\}/);
  });

  it('uses the official shadcn focus and invalid-state recipes', async () => {
    const [input, field, inputGroup, tailwindFoundation] = await Promise.all([
      readFile(shadcnInputUrl, 'utf8'),
      readFile(shadcnFieldUrl, 'utf8'),
      readFile(shadcnInputGroupUrl, 'utf8'),
      readFile(tailwindFoundationUrl, 'utf8'),
    ]);

    assert.match(input, /data-slot="input"/);
    assert.match(input, /focus-visible:border-ring/);
    assert.match(input, /focus-visible:ring-\[3px\]/);
    assert.match(input, /focus-visible:ring-ring\/50/);
    assert.match(input, /aria-invalid:border-destructive/);
    assert.match(field, /data-slot="field"/);
    assert.match(field, /data-slot="field-label"/);
    assert.match(field, /data-slot="field-error"/);
    assert.match(inputGroup, /data-slot="input-group"/);
    assert.match(inputGroup, /data-slot="input-group-control"/);
    assert.match(inputGroup, /ring-ring\/50/);
    assert.match(tailwindFoundation, /\[data-slot='input'\]::placeholder,[\s\S]*?opacity:\s*1/);
  });

  it('migrates only auth controls to the registry components', async () => {
    const [authInput, login, signup] = await Promise.all([
      readFile(authInputUrl, 'utf8'),
      readFile(loginUrl, 'utf8'),
      readFile(signupUrl, 'utf8'),
    ]);

    assert.match(authInput, /from '@\/shared\/ui\/field'/);
    assert.match(authInput, /from '@\/shared\/ui\/input-group'/);
    assert.match(authInput, /focus-visible:border-foreground focus-visible:ring-0/);
    assert.match(
      authInput,
      /has-\[\[data-slot=input-group-control\]:focus-visible\]:border-foreground[\s\S]*?ring-0/,
    );
    assert.match(authInput, /transition-none/);
    assert.doesNotMatch(authInput, /transition-colors|duration-100/);
    assert.doesNotMatch(authInput, /TextInput|FieldMotionHalo/);
    assert.match(login, /from '@\/shared\/ui\/animate-ui\/components\/buttons\/button'/);
    assert.match(signup, /from '@\/shared\/ui\/animate-ui\/components\/buttons\/button'/);
    assert.match(login, /variant="accent"/);
    assert.match(signup, /variant="accent"/);
    assert.match(login, /variant="ghost"/);
    assert.match(signup, /variant="ghost"/);
    assert.match(login, /const authButtonHoverScale = 1\.01/);
    assert.match(login, /const authButtonTapScale = 0\.985/);
    assert.match(login, /hoverScale=\{disableButtonMotion \? 1 : authButtonHoverScale\}/);
    assert.match(login, /tapScale=\{disableButtonMotion \? 1 : authButtonTapScale\}/);
    assert.match(login, /variant="ghost"[\s\S]*?hoverScale=\{1\}[\s\S]*?tapScale=\{1\}/);
    assert.match(login, /const disableButtonMotion = !hydrated \|\| pending \|\| reducedMotion/);
    assert.match(signup, /const authButtonHoverScale = 1\.01/);
    assert.match(signup, /const authButtonTapScale = 0\.985/);
    assert.match(signup, /hoverScale=\{pending \|\| reducedMotion \? 1 : authButtonHoverScale\}/);
    assert.match(signup, /tapScale=\{pending \|\| reducedMotion \? 1 : authButtonTapScale\}/);
    assert.match(
      signup,
      /variant="secondary"[\s\S]*?hoverScale=\{reducedMotion \? 1 : authButtonHoverScale\}/,
    );
    assert.match(
      signup,
      /variant="secondary"[\s\S]*?tapScale=\{reducedMotion \? 1 : authButtonTapScale\}/,
    );
  });

  it('leaves component state visuals to Animate UI and shadcn', async () => {
    const css = (await readFile(authCssUrl, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');

    assert.doesNotMatch(css, /\.field\s+input\b/);
    assert.doesNotMatch(css, /\.inputShell\b/);
    assert.doesNotMatch(css, /\.authInput:focus-visible\b/);
    assert.doesNotMatch(css, /\.visibilityButton:(?:hover|focus-visible|disabled)\b/);
    assert.doesNotMatch(css, /\.submitButton:(?:hover|focus-visible|disabled|active)\b/);
  });
});
