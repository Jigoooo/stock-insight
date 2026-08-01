import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const authFieldUrl = new URL('../src/pages/auth/auth-input-field.tsx', import.meta.url);
const authCssUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
const authE2eUrl = new URL('../../../e2e/auth-login.spec.ts', import.meta.url);
const inputUrl = new URL('../src/shared/ui/input/input.tsx', import.meta.url);
const inputGroupUrl = new URL('../src/shared/ui/input/input-group.tsx', import.meta.url);
const inputCssUrl = new URL('../src/shared/ui/input/input.module.css', import.meta.url);
const searchFieldUrl = new URL('../src/shared/ui/input/search-field.tsx', import.meta.url);
const workspaceUrl = new URL(
  '../src/pages/research-workspace/ui/workspace-search.tsx',
  import.meta.url,
);

describe('field focus ownership contract', () => {
  it('keeps auth and workspace fields on one canonical input boundary', async () => {
    const [authField, workspace] = await Promise.all([
      readFile(authFieldUrl, 'utf8'),
      readFile(workspaceUrl, 'utf8'),
    ]);

    assert.match(authField, /<Field\b/);
    assert.match(authField, /<Input(?:Group|GroupInput)?\b/);
    assert.match(workspace, /<SearchField[\s\S]*?className=\{styles\.search\}/);
    assert.doesNotMatch(authField + workspace, /FieldMotionHalo|useFieldShellMotion/);
  });

  it('uses a single neutral ring owner and makes bare inputs opt out completely', async () => {
    const [authCss, input, inputGroup, inputCss, searchField] = await Promise.all([
      readFile(authCssUrl, 'utf8'),
      readFile(inputUrl, 'utf8'),
      readFile(inputGroupUrl, 'utf8'),
      readFile(inputCssUrl, 'utf8'),
      readFile(searchFieldUrl, 'utf8'),
    ]);

    assert.match(input, /data-slot="input-shell"/);
    assert.match(input, /data-variant=\{variant\}/);
    assert.match(inputGroup, /data-slot="input-group-control"/);
    assert.match(inputCss, /\.inputShell:focus-within/);
    assert.match(
      inputCss,
      /\.inputShell\[data-variant='bare'\]:focus-within[\s\S]*box-shadow:\s*none/,
    );
    assert.match(searchField, /variant="bare"/);
    assert.doesNotMatch(authCss, /\.inputShell|\.authInput:focus-visible/);
    assert.doesNotMatch(inputCss, /fieldMotionHalo|@keyframes|animation:/);
  });

  it('keeps canonical density, lift, state propagation, and search halo in one input system', async () => {
    const [inputGroup, inputCss] = await Promise.all([
      readFile(inputGroupUrl, 'utf8'),
      readFile(inputCssUrl, 'utf8'),
    ]);

    assert.match(inputCss, /\.inputShell\s*\{[^}]*height:\s*40px/s);
    assert.match(inputCss, /\.inputShell\[data-density='auth'\]\s*\{[^}]*height:\s*44px/s);
    assert.match(inputCss, /\.inputShell\[data-density='search'\]\s*\{[^}]*height:\s*36px/s);
    assert.match(inputCss, /\.inputShell:focus-within\s*\{[^}]*translateY\(-0\.5px\)/s);
    assert.match(
      inputCss,
      /\.inputShell\[data-density='auth'\]:focus-within\s*\{[^}]*translateY\(-1px\)/s,
    );
    assert.match(
      inputCss,
      /\.inputShell\[data-density='search'\]:focus-within\s*\{[^}]*transform:\s*none/s,
    );
    assert.match(
      inputCss,
      /\.searchField:focus-within\s*\{[^}]*box-shadow:\s*0 0 0 3px color-mix\([^;]+16%/s,
    );
    assert.match(
      inputCss,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.inputShell\[data-density='auth'\]:focus-within\s*\{[^}]*transform:\s*none/,
    );
    assert.match(inputGroup, /aria-disabled=\{disabled \|\| undefined\}/);
    assert.match(inputGroup, /data-disabled=\{disabled \|\| undefined\}/);
    assert.match(inputGroup, /data-invalid=\{invalid \|\| undefined\}/);
    assert.match(
      inputCss,
      /@media \(forced-colors: active\)[\s\S]*?\.inputGroup:focus-within\s*\{[^}]*outline:\s*2px solid Highlight[^}]*outline-offset:\s*2px[^}]*box-shadow:\s*none/,
    );
    assert.match(
      inputCss,
      /@media \(forced-colors: active\)[\s\S]*?\.inputGroup \.groupControl:focus-visible,[\s\S]*?\[data-slot='button-control'\]:focus-visible\s*\{[^}]*outline:\s*none[^}]*box-shadow:\s*none/,
    );
  });

  it('locks the auth browser contract to shell transforms and one parsed focus halo', async () => {
    const authE2e = await readFile(authE2eUrl, 'utf8');
    const suppressionTest = authE2e.match(
      /test\('suppresses auth lift[\s\S]*?\n  test\('keeps the password addon/,
    )?.[0];

    assert.ok(suppressionTest);
    assert.equal(
      suppressionTest.match(/closest<HTMLElement>\([\s\S]*?input-group[\s\S]*?input-shell/g)
        ?.length,
      4,
    );
    assert.equal(suppressionTest.match(/getComputedStyle\(shell\)\.transform/g)?.length, 3);
    assert.doesNotMatch(suppressionTest, /getComputedStyle\(input\)\.transform/);
    assert.match(
      suppressionTest,
      /await usernameField\.focus\(\);[\s\S]*?shell\.dataset\.disabled = 'true'/,
    );
    assert.doesNotMatch(suppressionTest, /input\.disabled = true;[\s\S]*?input\.focus\(\)/);

    assert.match(authE2e, /function parseComputedBoxShadows/);
    assert.match(authE2e, /const focusedShadows = parseComputedBoxShadows/);
    assert.match(authE2e, /expect\(focusedShadows\)\.toHaveLength\(1\)/);
    assert.match(
      authE2e,
      /expect\(focusedHalo\)\.toMatchObject\([\s\S]*?blur:\s*0,[\s\S]*?spread:\s*3/,
    );
    assert.match(authE2e, /focusedHalo!\.color\.alpha\)\.toBeLessThanOrEqual\(0\.25\)/);
    assert.match(authE2e, /Math\.abs\(focusedHalo!\.color\.red - focusToken\.red\)/);
    assert.match(authE2e, /expect\(groupFocusState\.explicitIndicatorCount\)\.toBe\(1\)/);
  });
});
