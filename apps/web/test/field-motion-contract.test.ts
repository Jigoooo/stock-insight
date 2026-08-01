import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const authFieldUrl = new URL('../src/pages/auth/auth-input-field.tsx', import.meta.url);
const authCssUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
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
});
