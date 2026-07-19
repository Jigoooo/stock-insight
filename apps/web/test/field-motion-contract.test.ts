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
const workspaceUrl = new URL(
  '../src/pages/research-workspace/ui/workspace-search.tsx',
  import.meta.url,
);

async function sources() {
  const [form, authField, primitiveCss, authCss] = await Promise.all([
    readFile(formUrl, 'utf8'),
    readFile(authFieldUrl, 'utf8'),
    readFile(primitiveCssUrl, 'utf8'),
    readFile(authCssUrl, 'utf8'),
  ]);
  return { authCss, authField, form, primitiveCss };
}

describe('field-shell motion contract', () => {
  it('uses only the closed field-shell recipe and a decorative halo', async () => {
    const { authField, form } = await sources();
    const combined = `${form}\n${authField}`;

    assert.doesNotMatch(combined, /data-motion="field"/);
    assert.match(form, /data-motion="field-shell"/);
    assert.match(authField, /data-motion="field-shell"/);
    assert.match(form, /data-field-motion-halo/);
    assert.match(authField, /FieldMotionHalo/);
  });

  it('owns focusin and focusout opacity with interruptible scoped GSAP only', async () => {
    const { form } = await sources();

    assert.match(form, /useGSAP/);
    assert.match(form, /addEventListener\('focusin'/);
    assert.match(form, /addEventListener\('focusout'/);
    assert.match(form, /gsap\.killTweensOf\(halo\)/);
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

  it('keeps semantic focus and invalid rings in CSS while the halo has no transition', async () => {
    const { authCss, primitiveCss } = await sources();
    const combinedCss = `${primitiveCss}\n${authCss}`.replace(/\/\*[\s\S]*?\*\//g, '');
    const haloBlocks = [
      ...combinedCss.matchAll(/\.[\w-]*fieldMotionHalo[\w-]*\s*\{([^}]*)\}/gi),
    ].map((match) => match[1] ?? '');
    const baseHaloBlock = haloBlocks.find((block) => /opacity:\s*0/.test(block));

    assert.ok(baseHaloBlock);
    assert.match(baseHaloBlock, /pointer-events:\s*none/);
    assert.doesNotMatch(baseHaloBlock, /transition\s*:/);
    assert.match(primitiveCss, /:where\(\.searchField:focus-within\)/);
    assert.match(authCss, /\.inputShell:focus-within/);
    assert.match(authCss, /\.inputShell\[data-invalid='true'\]/);
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
