import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) =>
  readFile(new URL(`../src/${path}`, import.meta.url), 'utf8').catch(() => '');

describe('shared dialog system', () => {
  it('keeps one content Motion owner and the approved B spring', async () => {
    const source = await read('shared/ui/dialog/dialog.tsx');

    assert.match(source, /stiffness:\s*150/);
    assert.match(source, /damping:\s*25/);
    assert.match(source, /reducedMotion \? false : \{ x: 72, opacity: 0 \}/);
    assert.equal(source.match(/data-motion-owner="motion"/g)?.length, 1);
  });

  it('reserves a 32px close slot and stable action widths', async () => {
    const css = await read('shared/ui/dialog/dialog.module.css');

    assert.match(css, /--dialog-close-size:\s*32px/);
    assert.match(css, /border-radius:\s*7px/);
    assert.match(css, /min-height:\s*62px/);
    assert.match(css, /data-tone='secondary'[\s\S]*min-width:\s*92px/);
    assert.match(css, /data-tone='primary'[\s\S]*min-width:\s*104px/);
    assert.match(css, /data-tone='danger'[\s\S]*min-width:\s*104px/);
  });

  it('keeps AlertDialog modal and deliberately omits an X close control', async () => {
    const source = await read('shared/ui/dialog/alert-dialog.tsx');

    assert.match(source, /onEscapeKeyDown/);
    assert.match(source, /AlertDialogPrimitive\.Content/);
    assert.doesNotMatch(source, /\bX\b|AlertDialogPrimitive\.Close|data-slot="dialog-close"/);
  });

  it('does not restyle nested form controls from the dialog stylesheet', async () => {
    const css = await read('shared/ui/dialog/dialog.module.css');

    assert.doesNotMatch(css, /\binput\b|\btextarea\b|\.button\b|\.checkbox\b/);
  });
});
