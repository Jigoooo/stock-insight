import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('current workspace shell behavior', () => {
  it('keeps URL authority and real navigation links', async () => {
    const page = await read('pages/research-workspace/ui/research-workspace-page.tsx');
    assert.match(page, /to=\{`\/workspace\/\$\{id\}`\}/);
    assert.match(page, /data-testid=\{`workspace-nav-\$\{id\}`\}/);
    assert.match(page, /onFocus=\{\(\) => onPrefetchSection\?\.\(id\)\}/);
    assert.match(page, /onPointerEnter=\{\(\) => onPrefetchSection\?\.\(id\)\}/);
    assert.match(page, /const lane = onUrlStateChange/);
    assert.match(page, /void onUrlStateChange\?\.\(\{ record: undefined \}\)/);
  });

  it('keeps mobile navigation and evidence focus ownership explicit', async () => {
    const page = await read('pages/research-workspace/ui/research-workspace-page.tsx');
    const inspector = await read('pages/research-workspace/ui/evidence-inspector.tsx');
    assert.match(page, /useFocusTrap\(mobileNavModalOpen/);
    assert.match(page, /inert=\{mobileNavModalOpen \|\| inspectorModalOpen \|\| undefined\}/);
    assert.match(page, /setMobileNavOpen\(false\)/);
    assert.match(page, /opener\?\.isConnected/);
    assert.match(inspector, /event\.key !== 'Escape'/);
    assert.match(inspector, /useFocusTrap\(renderModal && transition\.desiredOpen/);
    assert.match(inspector, /previousFocus\?\.isConnected/);
  });
});
