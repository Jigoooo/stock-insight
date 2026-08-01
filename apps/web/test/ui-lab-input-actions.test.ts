import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

async function readSource(path: string) {
  return readFile(new URL(path, import.meta.url), 'utf8').catch(() => '');
}

describe('UI Lab input and action mockup batch', () => {
  it('keeps the comparison catalog separate from the product preview', async () => {
    const [labPage, catalog, previewPage] = await Promise.all([
      readSource('../src/pages/ui-lab/ui/ui-lab-page.tsx'),
      readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx'),
      readSource('../src/pages/dev-preview/ui/dev-preview-page.tsx'),
    ]);

    assert.match(labPage, /<InputActionCatalog/);
    assert.doesNotMatch(previewPage, /InputActionCatalog|ui-lab/);
    assert.doesNotMatch(catalog, /ResearchWorkspacePage|stocksPreviewFixture/);
  });

  it('offers the complete first batch through three coherent visual directions', async () => {
    const catalog = await readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx');

    for (const label of [
      'RadioGroup',
      'Slider',
      'Calendar',
      'DatePicker · RangePicker',
      'FileUpload · Dropzone',
      'OTP',
      'ButtonGroup · SplitButton',
    ]) {
      assert.match(catalog, new RegExp(label.replace(' · ', '[\\s\\S]*')));
    }

    for (const direction of ['hairline', 'inset', 'rail']) {
      assert.match(catalog, new RegExp(`id: '${direction}'`));
    }
  });

  it('keeps the mockups keyboard-operable and stateful', async () => {
    const catalog = await readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx');

    assert.match(catalog, /aria-pressed=/);
    assert.match(catalog, /type="radio"/);
    assert.match(catalog, /type="range"/);
    assert.match(catalog, /type="file"/);
    assert.match(catalog, /aria-label=\{`OTP/);
    assert.match(catalog, /aria-haspopup="menu"/);
  });
});
