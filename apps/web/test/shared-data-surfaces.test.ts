import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) =>
  readFile(new URL(`../src/${path}`, import.meta.url), 'utf8').catch(() => '');

describe('shared data surfaces', () => {
  it('keeps Accordion motion calm and exposes role-based variants', async () => {
    const [source, primitive] = await Promise.all([
      read('shared/ui/accordion/accordion.tsx'),
      read('shared/ui/animate-ui/primitives/radix/accordion.tsx'),
    ]);

    assert.match(source, /type AccordionVariant = 'editorial' \| 'ledger' \| 'index'/);
    assert.match(source, /data-variant=\{variant\}/);
    assert.match(primitive, /duration:\s*0\.22/);
    assert.match(primitive, /y:\s*4/);
    assert.doesNotMatch(primitive, /y:\s*20/);
  });

  it('makes only selectable Cards interactive', async () => {
    const source = await read('shared/ui/card/card.tsx');

    assert.match(source, /type CardVariant = 'panel' \| 'quiet' \| 'editorial' \| 'selectable'/);
    assert.match(source, /variant === 'selectable'/);
    assert.match(source, /aria-pressed=\{selectable \? selected : undefined\}/);
    assert.match(source, /data-selected=\{selectable \? selected : undefined\}/);
  });

  it('keeps native table semantics with explicit surfaces and selection modes', async () => {
    const [tableSource, summarySource] = await Promise.all([
      read('shared/ui/table/table.tsx'),
      read('shared/ui/table/table-selection-summary.tsx'),
    ]);

    assert.match(tableSource, /<table\b/);
    assert.match(tableSource, /<thead\b/);
    assert.match(tableSource, /<tbody\b/);
    assert.match(tableSource, /<tr\b/);
    assert.doesNotMatch(tableSource, /role="table"/);
    assert.match(tableSource, /surface\?: TableSurface/);
    assert.match(tableSource, /selectionMode\?: TableSelectionMode/);
    assert.match(tableSource, /'radio' : 'checkbox'/);
    assert.match(tableSource, /toggleSelectedKey/);
    assert.match(summarySource, /data-slot="table-selection-summary"/);
  });

  it('supports radio-style single selection and reversible multiple selection', async () => {
    const table = await import('../src/shared/ui/table/table-selection-controller.ts');

    assert.deepEqual(
      table.resolveTableSelection({
        currentKeys: ['alpha'],
        key: 'beta',
        selectionMode: 'single',
      }),
      ['beta'],
    );
    assert.deepEqual(
      table.resolveTableSelection({
        currentKeys: ['alpha'],
        key: 'beta',
        selectionMode: 'multiple',
      }),
      ['alpha', 'beta'],
    );
    assert.deepEqual(
      table.resolveTableSelection({
        currentKeys: ['alpha', 'beta'],
        key: 'beta',
        selectionMode: 'multiple',
      }),
      ['alpha'],
    );
  });
});
