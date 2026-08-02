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

  it('animates upload rows with alternating exits, pop-layout reflow, and reduced-motion feedback', async () => {
    const [catalog, styles] = await Promise.all([
      readSource('../src/pages/ui-lab/ui/input-action-catalog.tsx'),
      readSource('../src/pages/ui-lab/ui/input-action-catalog.module.css'),
    ]);

    const motionConfig = sourceBlock(catalog, 'const uploadEnterEase', 'function formatFileSize');
    const uploadPreview = sourceBlock(catalog, 'function UploadPreview', 'function OtpPreview');
    const removeFileHandler = sourceBlock(
      uploadPreview,
      'const removeFile',
      'const handleFileListExitComplete',
    );
    const exitCompleteHandler = sourceBlock(
      uploadPreview,
      'const handleFileListExitComplete',
      'const demoState',
    );
    const nativeFileInput = sourceBlock(uploadPreview, '<input', '/>');
    const filePickerButton = sourceBlock(
      uploadPreview,
      '<button\n              ref={fileSelectRef}',
      '</button>',
    );
    const presenceTag = sourceBlock(uploadPreview, '<AnimatePresence', '>');
    const previewFocusRule = sourceBlock(styles, '.categoryNav button:focus-visible', '}');
    const uploadStyles = sourceBlock(styles, '.uploadFileList {', '.visuallyHidden {');
    const uploadListRule = sourceBlock(uploadStyles, '.uploadFileList {', '.uploadFileList li {');

    assert.match(catalog, /useReducedMotion/);
    assert.match(motionConfig, /\[0\.22, 1, 0\.36, 1\] as const/);
    assert.match(motionConfig, /\[0\.4, 0, 1, 1\] as const/);
    assert.match(presenceTag, /initial=\{false\}/);
    assert.match(presenceTag, /mode="popLayout"/);
    assert.match(presenceTag, /onExitComplete=\{handleFileListExitComplete\}/);
    assert.match(uploadPreview, /<motion\.li/);
    assert.match(uploadPreview, /<motion\.li[\s\S]*key=\{file\.id\}/);
    assert.doesNotMatch(uploadPreview, /key=\{index\}/);
    assert.match(uploadPreview, /layout=\{reducedMotion \? false : 'position'\}/);
    assert.match(uploadPreview, /index % 2 === 0 \? -18 : 18/);
    assert.match(uploadPreview, /duration: 0\.16/);
    assert.match(uploadPreview, /delay: index \* 0\.028/);
    assert.match(uploadPreview, /ease: uploadEnterEase/);
    assert.match(uploadPreview, /duration: 0\.14, ease: uploadExitEase/);
    assert.match(uploadPreview, /scale: 0\.985/);
    assert.match(uploadPreview, /duration: 0\.24/);
    assert.match(uploadPreview, /delay: index \* 0\.018/);
    assert.match(
      uploadPreview,
      /reducedMotion\s*\? \{ opacity: 1, transition: \{ duration: 0\.1 \} \}/,
    );
    assert.match(
      uploadPreview,
      /reducedMotion\s*\? \{ opacity: 0, transition: \{ duration: 0\.1 \} \}/,
    );
    assert.match(uploadPreview, /files\.length === 0 && !listExitPending/);
    assert.match(
      removeFileHandler,
      /const remainingFiles = files\.filter[\s\S]*const nextFile = remainingFiles\[Math\.min\(index, remainingFiles\.length - 1\)\];[\s\S]*if \(nextFile\) \{[\s\S]*deleteButtonRefs\.current\[nextFile\.id\]\?\.focus\(\);[\s\S]*\} else \{[\s\S]*focusFileSelectAfterExit\.current = true;[\s\S]*setListExitPending\(true\);[\s\S]*\}[\s\S]*setFiles\(remainingFiles\);/,
    );
    assert.match(
      exitCompleteHandler,
      /setListExitPending\(false\);[\s\S]*if \(!focusFileSelectAfterExit\.current\) return;[\s\S]*focusFileSelectAfterExit\.current = false;[\s\S]*fileSelectRef\.current\?\.focus\(\);/,
    );
    assert.match(nativeFileInput, /ref=\{fileInputRef\}/);
    assert.match(nativeFileInput, /type="file"/);
    assert.match(nativeFileInput, /tabIndex=\{-1\}/);
    assert.match(nativeFileInput, /aria-hidden="true"/);
    assert.match(filePickerButton, /className=\{styles\.uploadPicker\}/);
    assert.match(filePickerButton, /type="button"/);
    assert.match(filePickerButton, /onClick=\{\(\) => fileInputRef\.current\?\.click\(\)\}/);
    assert.match(filePickerButton, /\{files\.length > 0 \? '파일 다시 선택' : '파일 선택'\}/);
    assert.match(previewFocusRule, /\.previewSurface button:focus-visible/);
    assert.match(previewFocusRule, /outline: 2px solid var\(--color-focus\)/);
    assert.match(uploadPreview, /deleteButtonRefs\.current\[file\.id\] = node/);
    assert.match(uploadListRule, /position: relative/);
    assert.doesNotMatch(uploadListRule, /animation:/);
    assert.match(uploadStyles, /\.uploadFileList\[aria-hidden='true'\] \{[\s\S]*?display: none/);
    assert.doesNotMatch(styles, /upload-file-enter/);
    assert.match(styles, /@keyframes upload-drop-enter/);
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
