import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) =>
  readFile(new URL(`../src/${path}`, import.meta.url), 'utf8').catch(() => '');

describe('shared choice controls', () => {
  it('publishes the canonical RadioGroup contract and pending behavior', async () => {
    const [source, publicIndex] = await Promise.all([
      read('shared/ui/radio-group/radio-group.tsx'),
      read('shared/ui/index.ts'),
    ]);

    assert.match(source, /RadioGroup as RadioGroupPrimitive/);
    assert.match(source, /type RadioGroupVariant = 'hairline' \| 'inset' \| 'rail'/);
    assert.match(source, /RadioGroupPrimitive\.Root/);
    assert.match(source, /data-slot="radio-group"/);
    assert.match(source, /data-slot="radio-group-item"/);
    assert.match(source, /data-slot="radio-group-indicator"/);
    assert.match(source, /data-slot="control-label"/);
    assert.match(source, /aria-busy=\{pending \|\| props\['aria-busy'\]\}/);
    assert.match(source, /disabled=\{item\.disabled \|\| pending\}/);
    assert.match(publicIndex, /export \* from '\.\/radio-group'/);
  });
});
