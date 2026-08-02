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
      'ButtonGroup',
      'SplitButton',
    ]) {
      assert.match(catalog, new RegExp(label.replace(' · ', '[\\s\\S]*')));
    }

    for (const direction of ['hairline', 'inset', 'rail']) {
      assert.match(catalog, new RegExp(`id: '${direction}'`));
    }
  });

  it('records approved directions as reusable variant candidates', async () => {
    const catalog = await readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx');

    assert.match(catalog, /calendar: \['hairline', 'inset', 'rail'\]/);
    assert.match(catalog, /upload: \['hairline', 'inset'\]/);
    assert.match(catalog, /'button-group': \['hairline', 'inset'\]/);
    assert.match(catalog, /'split-button': \['hairline', 'inset', 'rail'\]/);
  });

  it('renders only the approved upload directions while preserving three-way comparisons elsewhere', async () => {
    const catalog = await readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx');

    assert.match(
      catalog,
      /activeCategory === 'upload'[\s\S]*directions\.filter\(\(\{ id \}\) => id !== 'rail'\)/,
    );
    assert.match(catalog, /visibleDirections\.map\(\(defaultDirection\) =>/);
  });

  it('offers the approved calendar variants with compact rounded-square cells', async () => {
    const [catalog, styles] = await Promise.all([
      readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx'),
      readSource('../src/pages/ui-lab/ui/input-action-catalog.module.css'),
    ]);

    assert.match(catalog, /A · Compact/);
    assert.match(catalog, /B · Soft Inset/);
    assert.match(catalog, /C · Ledger/);
    assert.match(styles, /--calendar-cell-size: 30px/);
    assert.match(styles, /border-radius: 7px/);
  });

  it('keeps the rail OTP focus feedback on the underline only', async () => {
    const styles = await readSource('../src/pages/ui-lab/ui/input-action-catalog.module.css');

    assert.match(styles, /\.otp\[data-direction='rail'\] \.otpCells input:focus-visible/);
    assert.match(styles, /border-bottom-color: var\(--color-text-primary\)/);
    assert.match(styles, /outline: none/);
  });

  it('previews drop, single, multiple, selected, and removable upload states', async () => {
    const catalog = await readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx');

    assert.match(catalog, /type UploadMode = 'single' \| 'multiple'/);
    assert.match(catalog, /type UploadDemoState = 'idle' \| 'dragging' \| 'selected'/);
    assert.match(catalog, /onDragEnter=/);
    assert.match(catalog, /onDrop=/);
    assert.match(catalog, /multiple=\{mode === 'multiple'\}/);
    assert.match(catalog, /aria-label="선택된 파일"/);
    assert.match(catalog, /aria-label=\{`\$\{file\.name\} 삭제`\}/);
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
