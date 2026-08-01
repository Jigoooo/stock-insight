import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const canonicalButtonUrl = new URL('../src/shared/ui/button/button.tsx', import.meta.url);
const animateButtonPrimitiveUrl = new URL(
  '../src/shared/ui/animate-ui/primitives/buttons/button.tsx',
  import.meta.url,
);
const animateSlotUrl = new URL(
  '../src/shared/ui/animate-ui/primitives/animate/slot.tsx',
  import.meta.url,
);
const canonicalInputUrl = new URL('../src/shared/ui/input/input.tsx', import.meta.url);
const canonicalInputGroupUrl = new URL('../src/shared/ui/input/input-group.tsx', import.meta.url);
const canonicalInputCssUrl = new URL('../src/shared/ui/input/input.module.css', import.meta.url);
const canonicalFieldUrl = new URL('../src/shared/ui/field/field.tsx', import.meta.url);
const shadcnLabelUrl = new URL('../src/shared/ui/label.tsx', import.meta.url);
const shadcnSeparatorUrl = new URL('../src/shared/ui/separator.tsx', import.meta.url);
const tailwindFoundationUrl = new URL('../src/shared/ui/tailwind.css', import.meta.url);
const authInputUrl = new URL('../src/pages/auth/auth-input-field.tsx', import.meta.url);
const loginUrl = new URL('../src/pages/auth/login-page.tsx', import.meta.url);
const signupUrl = new URL('../src/pages/auth/signup-page.tsx', import.meta.url);
const authCssUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);

describe('auth registry component adoption', () => {
  it('keeps the Animate UI motion API behind the calm canonical button', async () => {
    const [button, primitive] = await Promise.all([
      readFile(canonicalButtonUrl, 'utf8'),
      readFile(animateButtonPrimitiveUrl, 'utf8'),
    ]);

    assert.match(
      button,
      /type ButtonVariant = 'primary' \| 'secondary' \| 'outline' \| 'ghost' \| 'danger'/,
    );
    assert.match(button, /hoverScale = 1/);
    assert.match(button, /tapScale = 1/);
    assert.match(button, /pendingLabel/);
    assert.match(primitive, /HTMLMotionProps<'button'>/);
    assert.match(primitive, /hoverScale\s*=\s*1\.05/);
    assert.match(primitive, /tapScale\s*=\s*0\.95/);
    assert.match(
      primitive,
      /whileHover=\{hoverScale === 1 \? undefined : \{ scale: hoverScale \}\}/,
    );
    assert.match(primitive, /whileTap=\{tapScale === 1 \? undefined : \{ scale: tapScale \}\}/);
  });

  it('uses a single neutral focus owner for canonical inputs', async () => {
    const [input, field, inputGroup, inputCss, tailwindFoundation] = await Promise.all([
      readFile(canonicalInputUrl, 'utf8'),
      readFile(canonicalFieldUrl, 'utf8'),
      readFile(canonicalInputGroupUrl, 'utf8'),
      readFile(canonicalInputCssUrl, 'utf8'),
      readFile(tailwindFoundationUrl, 'utf8'),
    ]);

    assert.match(input, /data-slot="input-shell"/);
    assert.doesNotMatch(input, /focus-visible:ring/);
    assert.match(field, /data-slot="field"/);
    assert.match(field, /data-slot="field-label"/);
    assert.match(field, /data-slot="field-error"/);
    assert.match(inputGroup, /data-slot="input-group"/);
    assert.match(inputGroup, /data-slot="input-group-control"/);
    assert.match(inputCss, /\.inputShell:focus-within/);
    assert.match(inputCss, /\.groupControl:focus-visible[\s\S]*?box-shadow:\s*none/);
    assert.match(tailwindFoundation, /\[data-slot='input'\]::placeholder,[\s\S]*?opacity:\s*1/);
  });

  it('keeps the public auth startup path off the Radix root barrel', async () => {
    const [button, label, separator] = await Promise.all([
      readFile(canonicalButtonUrl, 'utf8'),
      readFile(shadcnLabelUrl, 'utf8'),
      readFile(shadcnSeparatorUrl, 'utf8'),
    ]);

    assert.match(button, /animate-ui\/primitives\/buttons\/button/);
    assert.match(label, /from 'radix-ui\/label'/);
    assert.match(separator, /from 'radix-ui\/separator'/);

    for (const source of [button, label, separator]) {
      assert.doesNotMatch(source, /from 'radix-ui'/);
    }
  });

  it('keeps the public auth registry path off the general tailwind merge runtime', async () => {
    const registrySources = await Promise.all(
      [
        canonicalButtonUrl,
        animateButtonPrimitiveUrl,
        animateSlotUrl,
        canonicalFieldUrl,
        canonicalInputGroupUrl,
        canonicalInputUrl,
        shadcnLabelUrl,
        shadcnSeparatorUrl,
      ].map((url) => readFile(url, 'utf8')),
    );

    for (const source of registrySources) {
      assert.doesNotMatch(source, /@\/shared\/lib\/utils/);
    }
  });

  it('keeps unused registry branches out of the public auth startup graph', async () => {
    const [field, inputGroup] = await Promise.all([
      readFile(canonicalFieldUrl, 'utf8'),
      readFile(canonicalInputGroupUrl, 'utf8'),
    ]);

    assert.doesNotMatch(field, /@\/shared\/ui\/separator/);
    assert.doesNotMatch(inputGroup, /@\/shared\/ui\/button/);
    assert.doesNotMatch(inputGroup, /@\/shared\/ui\/textarea/);
  });

  it('migrates authentication controls to canonical public paths', async () => {
    const [authInput, login, signup] = await Promise.all([
      readFile(authInputUrl, 'utf8'),
      readFile(loginUrl, 'utf8'),
      readFile(signupUrl, 'utf8'),
    ]);

    assert.match(authInput, /from '@\/shared\/ui\/field'/);
    assert.match(authInput, /from '@\/shared\/ui\/input'/);
    assert.doesNotMatch(authInput, /TextInput|FieldMotionHalo/);
    assert.match(login, /from '@\/shared\/ui\/button'/);
    assert.match(signup, /from '@\/shared\/ui\/button'/);
    assert.match(login, /variant="primary"/);
    assert.match(signup, /variant="primary"/);
    assert.match(login, /variant="ghost"/);
    assert.match(signup, /variant="ghost"/);
    assert.match(login, /pending=\{pending\}/);
    assert.match(login, /pendingLabel="확인 중"/);
    assert.match(signup, /pending=\{pending\}/);
    assert.match(signup, /pendingLabel="설정 중"/);
    assert.doesNotMatch(
      login + signup,
      /authButtonHoverScale|authButtonTapScale|hoverScale|tapScale/,
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
