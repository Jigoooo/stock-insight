import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const formUrl = new URL('../src/shared/ui/primitives/form.tsx', import.meta.url);
const authFieldUrl = new URL('../src/pages/auth/auth-input-field.tsx', import.meta.url);
const primitiveCssUrl = new URL(
  '../src/shared/ui/primitives/primitives.module.css',
  import.meta.url,
);
const authCssUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
const shadcnInputUrl = new URL('../src/shared/ui/input.tsx', import.meta.url);
const shadcnInputGroupUrl = new URL('../src/shared/ui/input-group.tsx', import.meta.url);
const workspaceUrl = new URL(
  '../src/pages/research-workspace/ui/workspace-search.tsx',
  import.meta.url,
);

async function sources() {
  const [form, authField, primitiveCss, authCss, shadcnInput, shadcnInputGroup] = await Promise.all(
    [
      readFile(formUrl, 'utf8'),
      readFile(authFieldUrl, 'utf8'),
      readFile(primitiveCssUrl, 'utf8'),
      readFile(authCssUrl, 'utf8'),
      readFile(shadcnInputUrl, 'utf8'),
      readFile(shadcnInputGroupUrl, 'utf8'),
    ],
  );
  return { authCss, authField, form, primitiveCss, shadcnInput, shadcnInputGroup };
}

describe('field-shell motion contract', () => {
  it('keeps the legacy halo recipe out of public auth while retaining it for workspace fields', async () => {
    const { authField, form } = await sources();

    assert.doesNotMatch(form, /data-motion="field"/);
    assert.match(form, /data-motion="field-shell"/);
    assert.match(form, /data-field-motion-halo/);
    assert.match(authField, /<Field\b/);
    assert.match(authField, /<InputGroup\b/);
    assert.doesNotMatch(authField, /data-motion="field-shell"|FieldMotionHalo/);
  });

  it('owns focusin and focusout opacity with interruptible scoped Motion only', async () => {
    const { form } = await sources();

    assert.match(form, /createMotionDomAdapter/);
    assert.doesNotMatch(form, /(?:@gsap\/react|from ['"]gsap['"]|useGSAP|\bgsap\.)/);
    assert.match(form, /addEventListener\('focusin'/);
    assert.match(form, /addEventListener\('focusout'/);
    assert.match(form, /adapter\.killTweensOf\(halo\)/);
    assert.match(form, /opacity:\s*(?:focused \? )?1/);
    assert.match(form, /overwrite:\s*'auto'/);
    assert.match(form, /clearProps:\s*'opacity'/);
    assert.doesNotMatch(form, /(?:boxShadow|box-shadow|transform|x:|y:)\s*:/);
  });

  it('normalizes the halo immediately when reduced-motion changes', async () => {
    const { form } = await sources();

    assert.match(form, /prefers-reduced-motion: reduce/);
    assert.match(form, /addEventListener\('change'/);
    assert.match(form, /removeEventListener\('change'/);
    assert.match(form, /motionPreference\.matches/);
    assert.match(form, /shell\.matches\(':focus-within'\)/);
  });

  it('keeps auth focus and invalid rings in shadcn while the legacy halo has no transition', async () => {
    const { authCss, primitiveCss, shadcnInput, shadcnInputGroup } = await sources();
    const combinedCss = `${primitiveCss}\n${authCss}`.replace(/\/\*[\s\S]*?\*\//g, '');
    const haloBlocks = [
      ...combinedCss.matchAll(/\.[\w-]*fieldMotionHalo[\w-]*\s*\{([^}]*)\}/gi),
    ].map((match) => match[1] ?? '');
    const baseHaloBlock = haloBlocks.find((block) => /opacity:\s*0/.test(block));

    assert.ok(baseHaloBlock);
    assert.match(baseHaloBlock, /pointer-events:\s*none/);
    assert.doesNotMatch(baseHaloBlock, /transition\s*:/);
    assert.match(primitiveCss, /:where\(\.searchField:focus-within\)/);
    assert.match(shadcnInput, /focus-visible:ring-\[3px\]/);
    assert.match(shadcnInput, /aria-invalid:border-destructive/);
    assert.match(shadcnInputGroup, /focus-visible\]:ring-\[3px\]/);
    assert.match(shadcnInputGroup, /aria-invalid=true\]\]:border-destructive/);
    assert.doesNotMatch(authCss, /\.inputShell|\.authInput:focus-visible/);
    assert.match(combinedCss, /box-shadow:\s*0 0 0/);
    assert.match(combinedCss, /@media\s*\(forced-colors:\s*active\)/);
  });

  it('adopts the shared field shell in workspace search without duplicate raw markup', async () => {
    const [form, workspace, primitiveCss] = await Promise.all([
      readFile(formUrl, 'utf8'),
      readFile(workspaceUrl, 'utf8'),
      readFile(primitiveCssUrl, 'utf8'),
    ]);

    assert.match(form, /data-motion="field-shell"/);
    assert.match(workspace, /<SearchField[\s\S]*?className=\{styles\.search\}/);
    assert.doesNotMatch(workspace, /<label className=\{styles\.search\}>/);
    assert.match(primitiveCss, /:where\(\.searchField\)\s*\{/);
    assert.match(primitiveCss, /:where\(\.searchField:focus-within\)\s*\{/);
  });
});
