import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) =>
  readFile(new URL(`../src/${path}`, import.meta.url), 'utf8').catch(() => '');
const rootPackageUrl = new URL('../../../package.json', import.meta.url);

const options = [
  { value: 'one', label: 'One' },
  { value: 'two', label: 'Two', disabled: true },
  { value: 'three', label: 'Three', description: 'Third option' },
] as const;

describe('select option behavior', () => {
  it('moves with arrows, Home, and End without wrapping past boundaries', async () => {
    const controller = await import('../src/shared/ui/select/select-controller.ts').catch(
      () => null,
    );
    assert.ok(controller, 'select controls controller must exist');

    assert.equal(
      controller.getNextEnabledOptionIndex({
        currentIndex: 0,
        key: 'ArrowDown',
        options,
      }),
      2,
    );
    assert.equal(
      controller.getNextEnabledOptionIndex({
        currentIndex: 2,
        key: 'ArrowDown',
        options,
      }),
      2,
    );
    assert.equal(
      controller.getNextEnabledOptionIndex({
        currentIndex: 0,
        key: 'ArrowUp',
        options,
      }),
      0,
    );
    assert.equal(
      controller.getNextEnabledOptionIndex({
        currentIndex: 2,
        key: 'Home',
        options,
      }),
      0,
    );
    assert.equal(
      controller.getNextEnabledOptionIndex({
        currentIndex: 0,
        key: 'End',
        options,
      }),
      2,
    );
  });

  it('filters labels locally by default and accepts a custom filter', async () => {
    const controller = await import('../src/shared/ui/select/select-controller.ts').catch(
      () => null,
    );
    assert.ok(controller, 'select controls controller must exist');

    assert.deepEqual(
      controller.filterSelectOptions(options, 'thr').map((option) => option.value),
      ['three'],
    );
    assert.deepEqual(
      controller
        .filterSelectOptions(options, 'third', (option, query) =>
          option.description?.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        )
        .map((option) => option.value),
      ['three'],
    );
    assert.deepEqual(controller.filterSelectOptions(options, 'missing'), []);
  });

  it('selects enabled options and preserves the current value for disabled options', async () => {
    const controller = await import('../src/shared/ui/select/select-controller.ts').catch(
      () => null,
    );
    assert.ok(controller, 'select controls controller must exist');

    assert.equal(controller.resolveSelectableValue(options[2], 'one'), 'three');
    assert.equal(controller.resolveSelectableValue(options[1], 'one'), 'one');
  });

  it('positions popup content outside clipping parents and flips near the viewport edge', async () => {
    const portal = await import('../src/shared/ui/select/select-portal.ts').catch(() => null);
    assert.ok(portal, 'select portal positioning must exist');
    if (!portal) return;

    const below = portal.calculateSelectPopupPosition({
      anchor: { bottom: 140, left: 24, top: 100, width: 220 },
      viewportHeight: 800,
      viewportWidth: 1200,
    });
    assert.deepEqual(below, {
      bottom: undefined,
      left: 24,
      maxHeight: 320,
      placement: 'bottom',
      top: 146,
      width: 220,
    });

    const above = portal.calculateSelectPopupPosition({
      anchor: { bottom: 760, left: 340, top: 720, width: 180 },
      viewportHeight: 800,
      viewportWidth: 390,
    });
    assert.equal(above.placement, 'top');
    assert.equal(above.left, 202);
    assert.equal(above.bottom, 86);
    assert.equal(above.top, undefined);
    assert.equal(above.maxHeight, 320);
  });
});

describe('SelectBox and Combobox structure', () => {
  it('exposes the approved A+C anatomy from canonical public paths', async () => {
    const [selectSource, comboboxSource, selectCss, selectIndex, comboboxIndex] = await Promise.all(
      [
        read('shared/ui/select/select.tsx'),
        read('shared/ui/combobox/combobox.tsx'),
        read('shared/ui/select/select.module.css'),
        read('shared/ui/select/index.ts'),
        read('shared/ui/combobox/index.ts'),
      ],
    );

    assert.match(selectSource, /const optionCloseDurationMs = 155/);
    assert.match(selectSource, /data-density=\{density\}/);
    assert.match(selectSource, /data-selected=\{selected\}/);
    assert.match(selectSource, /data-highlighted=\{highlighted\}/);
    assert.match(selectSource, /data-disabled=\{option\.disabled \|\| undefined\}/);
    assert.match(selectSource, /createPortal\(/);
    assert.match(selectSource, /listboxRef\.current\?\.contains/);
    assert.match(comboboxSource, /createPortal\(/);
    assert.match(comboboxSource, /listboxRef\.current\?\.contains/);
    assert.match(selectCss, /\.listbox\s*\{[\s\S]*?position:\s*fixed/);
    assert.match(
      selectCss,
      /:where\(\.trigger, \.option\)\s*>\s*\[data-slot='motion-visual'\][\s\S]*?grid-column:\s*1\s*\/\s*-1/,
    );
    assert.match(selectCss, /gap:\s*2px/);
    assert.match(selectCss, /\[data-density='compact'\][\s\S]*min-height:\s*38px/);
    assert.match(selectCss, /\[data-density='descriptive'\][\s\S]*min-height:\s*51px/);
    assert.match(selectIndex, /export \{ Select/);
    assert.match(selectIndex, /export type \{ SelectOption/);
    assert.match(comboboxIndex, /export \{ Combobox/);
    assert.match(comboboxSource, /SelectOptionItem/);
  });

  it('keeps the real-rendered browser and accessibility gate on a named package script', async () => {
    const packageJson = JSON.parse(await readFile(rootPackageUrl, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    assert.equal(
      packageJson.scripts?.['test:select-controls:browser'],
      'node scripts/run-select-controls-browser-gate.mjs',
    );
  });

  it('connects combobox triggers to listboxes and submits values through hidden inputs', async () => {
    const [selectBox, combobox, selectIndex, comboboxIndex] = await Promise.all([
      read('shared/ui/select/select.tsx'),
      read('shared/ui/combobox/combobox.tsx'),
      read('shared/ui/select/index.ts'),
      read('shared/ui/combobox/index.ts'),
    ]);

    for (const source of [selectBox, combobox]) {
      assert.match(source, /role="combobox"/);
      assert.match(source, /aria-controls=\{listboxId\}/);
      assert.match(source, /aria-expanded=\{open\}/);
      assert.match(source, /aria-activedescendant=/);
      assert.match(source, /role="listbox"/);
      assert.match(source, /role="option"/);
      assert.match(source, /aria-selected=/);
      assert.match(source, /aria-disabled=/);
      assert.match(source, /type="hidden"/);
      assert.match(source, /name=\{name\}/);
    }
    assert.match(selectIndex, /export \{ Select, SelectBox/);
    assert.match(selectIndex, /SelectOption/);
    assert.match(comboboxIndex, /export \{ Combobox/);
    assert.match(comboboxIndex, /SelectOption/);
  });

  it('dismisses with Escape, Tab, and outside pointer interaction', async () => {
    const [selectBox, combobox] = await Promise.all([
      read('shared/ui/select/select.tsx'),
      read('shared/ui/combobox/combobox.tsx'),
    ]);

    for (const source of [selectBox, combobox]) {
      assert.match(source, /case 'Escape'/);
      assert.match(source, /case 'Tab'/);
      assert.match(source, /pointerdown/);
      assert.match(source, /setOpen\(false\)/);
    }
  });

  it('provides an explicit empty state and clear control for filtered combobox results', async () => {
    const source = await read('shared/ui/combobox/combobox.tsx');

    assert.match(source, /emptyMessage/);
    assert.match(source, /filteredOptions\.length === 0/);
    assert.match(source, /clearLabel/);
    assert.match(source, /setQueryValue\(''\)/);
    assert.match(source, /setSelectedValue\(''\)/);
  });

  it('keeps invitation field names, submitted values, and form reset defaults', async () => {
    const source = await read('pages/admin-invitations/ui/admin-invitation-page.tsx');

    assert.doesNotMatch(source, /<select/);
    assert.match(source, /name="maxUses"/);
    assert.match(source, /defaultValue="1"/);
    assert.match(source, /value: '10', label: '10회'/);
    assert.match(source, /name="expiresInHours"/);
    assert.match(source, /defaultValue="24"/);
    assert.match(source, /value: '168', label: '7일'/);
    assert.match(source, /form\.reset\(\)/);
  });
});
