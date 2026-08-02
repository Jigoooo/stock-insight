import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

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

  it('publishes the canonical Slider anatomy, variants, and pending behavior', async () => {
    const [source, publicIndex] = await Promise.all([
      read('shared/ui/slider/slider.tsx'),
      read('shared/ui/index.ts'),
    ]);

    assert.match(source, /Slider as SliderPrimitive/);
    assert.match(source, /type SliderVariant = 'hairline' \| 'inset' \| 'rail'/);
    assert.match(source, /SliderPrimitive\.Root/);
    assert.match(source, /SliderPrimitive\.Track/);
    assert.match(source, /SliderPrimitive\.Range/);
    assert.match(source, /SliderPrimitive\.Thumb/);
    assert.match(source, /data-slot="slider-control"/);
    assert.match(source, /data-slot="slider-track"/);
    assert.match(source, /data-slot="slider-range"/);
    assert.match(source, /data-slot="slider-thumb"/);
    assert.match(source, /data-slot="slider-value"/);
    assert.match(source, /const values = value \?\? defaultValue \?\? \[min \?\? 0\]/);
    assert.match(source, /values\.map\(\(_value, index\) =>/);
    assert.match(source, /aria-busy=\{pending \|\| props\['aria-busy'\]\}/);
    assert.match(source, /disabled=\{disabled \|\| pending\}/);
    assert.match(publicIndex, /export \* from '\.\/slider'/);
  });
});
