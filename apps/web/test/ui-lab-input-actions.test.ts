import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

async function readSource(path: string) {
  return readFile(new URL(path, import.meta.url), 'utf8').catch(() => '');
}

function sourceBlock(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `Missing source block start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source block end: ${end}`);

  return source.slice(startIndex, endIndex);
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
      readSource('../src/shared/ui/calendar/calendar.module.css'),
    ]);

    assert.match(catalog, /A · Compact/);
    assert.match(catalog, /B · Soft Inset/);
    assert.match(catalog, /C · Ledger/);
    assert.match(styles, /--calendar-cell-size: 30px/);
    assert.match(styles, /border-radius: 7px/);
  });

  it('renders date controls through the shared public APIs instead of page-owned inputs', async () => {
    const [catalog, styles] = await Promise.all([
      readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx'),
      readSource('../src/pages/ui-lab/ui/input-action-catalog.module.css'),
    ]);
    const calendarPreview = sourceBlock(
      catalog,
      'function CalendarPreview',
      'function DateRangePreview',
    );
    const dateRangePreview = sourceBlock(
      catalog,
      'function DateRangePreview',
      'type UploadDemoState',
    );

    assert.match(catalog, /from '@\/shared\/ui\/calendar'/);
    assert.match(catalog, /from '@\/shared\/ui\/date-picker'/);
    assert.match(calendarPreview, /<Calendar/);
    assert.match(calendarPreview, /calendarVariantByDirection\[direction\]/);
    assert.doesNotMatch(calendarPreview, /calendarDays\.map|<button/);
    assert.match(dateRangePreview, /<DatePicker/);
    assert.match(dateRangePreview, /<RangePicker/);
    assert.doesNotMatch(dateRangePreview, /<button/);
    assert.doesNotMatch(styles, /\.calendarGrid button/);
    assert.doesNotMatch(styles, /\.dateFields button/);
    assert.match(styles, /\.previewSurface button:not\(\[data-slot\]\):focus-visible/);
    assert.doesNotMatch(styles, /\.previewSurface button:focus-visible/);
  });

  it('keeps the rail OTP focus feedback on the underline only', async () => {
    const styles = await readSource('../src/pages/ui-lab/ui/input-action-catalog.module.css');

    assert.match(styles, /\.otp\[data-direction='rail'\] \.otpCells input:focus-visible/);
    assert.match(styles, /border-bottom-color: var\(--color-text-primary\)/);
    assert.match(styles, /outline: none/);
  });

  it('renders file input states through the shared public API without page-owned drop logic', async () => {
    const [catalog, pageStyles, sharedComponent, sharedStyles] = await Promise.all([
      readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx'),
      readSource('../src/pages/ui-lab/ui/input-action-catalog.module.css'),
      readSource('../src/shared/ui/file-upload/file-upload.tsx'),
      readSource('../src/shared/ui/file-upload/file-upload.module.css'),
    ]);
    const uploadPreview = sourceBlock(catalog, 'function UploadPreview', 'function OtpPreview');

    assert.match(catalog, /from '@\/shared\/ui\/file-upload'/);
    assert.match(uploadPreview, /<FileUpload/);
    assert.match(uploadPreview, /mode=\{mode\}/);
    assert.match(uploadPreview, /files=\{files\}/);
    assert.match(uploadPreview, /dragActive=\{dragActive\}/);
    assert.doesNotMatch(uploadPreview, /onDrop=|onDragEnter=|type="file"|<motion\.li/);
    assert.doesNotMatch(
      pageStyles,
      /\.upload\b|\.uploadPicker|\.uploadFileList|\.uploadDropFeedback/,
    );
    assert.match(sharedComponent, /<AnimatePresence initial=\{false\} mode="popLayout"/);
    assert.match(sharedComponent, /layout=\{reducedMotion \? false : 'position'\}/);
    assert.match(sharedComponent, /index % 2 === 0 \? -18 : 18/);
    assert.match(sharedStyles, /@media \(prefers-reduced-motion: reduce\)/);
  });

  it('keeps the mockups keyboard-operable and stateful', async () => {
    const catalog = await readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx');

    assert.match(catalog, /aria-pressed=/);
    assert.match(catalog, /<RadioGroup/);
    assert.match(catalog, /<Slider/);
    assert.match(catalog, /<Calendar/);
    assert.match(catalog, /<DatePicker/);
    assert.match(catalog, /<RangePicker/);
    assert.match(catalog, /<FileUpload/);
    assert.match(catalog, /aria-label=\{`OTP/);
    assert.match(catalog, /aria-haspopup="menu"/);
  });

  it('uses the canonical choice controls without retaining raw control ownership', async () => {
    const [catalog, styles] = await Promise.all([
      readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx'),
      readSource('../src/pages/ui-lab/ui/input-action-catalog.module.css'),
    ]);
    const radioPreview = sourceBlock(catalog, 'function RadioPreview', 'function SliderPreview');
    const sliderPreview = sourceBlock(
      catalog,
      'function SliderPreview',
      'function CalendarPreview',
    );

    assert.match(
      catalog,
      /import \{ RadioGroup, type RadioGroupVariant \} from '@\/shared\/ui\/radio-group'/,
    );
    assert.match(catalog, /import \{ Slider, type SliderVariant \} from '@\/shared\/ui\/slider'/);
    assert.match(radioPreview, /<RadioGroup[\s\S]*variant=\{direction\}/);
    assert.match(sliderPreview, /<Slider[\s\S]*defaultValue=\{\[64\]\}/);
    assert.doesNotMatch(radioPreview, /type="radio"/);
    assert.doesNotMatch(sliderPreview, /type="range"|--slider-value/);
    assert.doesNotMatch(styles, /\.radioMark|\.sliderPreview|\.sliderScale|::-webkit-slider/);
  });
});
