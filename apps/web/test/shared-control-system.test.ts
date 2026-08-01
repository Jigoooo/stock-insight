import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const buttonUrl = new URL('../src/shared/ui/button/button.tsx', import.meta.url);
const buttonCssUrl = new URL('../src/shared/ui/button/button.module.css', import.meta.url);
const inputUrl = new URL('../src/shared/ui/input/input.tsx', import.meta.url);
const inputGroupUrl = new URL('../src/shared/ui/input/input-group.tsx', import.meta.url);
const inputCssUrl = new URL('../src/shared/ui/input/input.module.css', import.meta.url);

describe('canonical shared controls', () => {
  it('exposes one canonical button and input owner', async () => {
    assert.equal(existsSync(buttonUrl), true, 'canonical Button source must exist');
    assert.equal(existsSync(inputUrl), true, 'canonical Input source must exist');

    const [button, input, inputGroup] = await Promise.all([
      readFile(buttonUrl, 'utf8'),
      readFile(inputUrl, 'utf8'),
      readFile(inputGroupUrl, 'utf8'),
    ]);

    assert.match(button, /pendingLabel/);
    assert.match(button, /data-slot="button-spinner"/);
    assert.match(input, /data-slot="input-shell"/);
    assert.match(inputGroup, /data-slot="input-group"/);
    assert.doesNotMatch(input, /focus-visible:ring-\[23\]/);
  });

  it('keeps press feedback calm and loading geometry stable', async () => {
    assert.equal(existsSync(buttonCssUrl), true, 'canonical Button styles must exist');

    const css = await readFile(buttonCssUrl, 'utf8');

    assert.match(css, /translateY\(1px\)/);
    assert.match(css, /cursor:\s*default/);
    assert.match(css, /grid-template-areas/);
    assert.doesNotMatch(css, /scale\(/);
  });

  it('assigns focus feedback to exactly one input shell', async () => {
    assert.equal(existsSync(inputCssUrl), true, 'canonical Input styles must exist');

    const [input, inputGroup, css] = await Promise.all([
      readFile(inputUrl, 'utf8'),
      readFile(inputGroupUrl, 'utf8'),
      readFile(inputCssUrl, 'utf8'),
    ]);

    assert.match(css, /\.inputShell:focus-within/);
    assert.match(css, /box-shadow:\s*0 0 0 2px color-mix/);
    assert.doesNotMatch(input, /focus-visible:ring/);
    assert.match(inputGroup, /styles\.groupControl/);
    assert.match(css, /\.groupControl[\s\S]*?border:\s*0/);
    assert.match(css, /\.groupControl[\s\S]*?box-shadow:\s*none/);
  });
});
