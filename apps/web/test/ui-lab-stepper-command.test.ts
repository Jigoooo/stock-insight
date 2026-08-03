import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

async function readWebSource(path: string) {
  return readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
}

describe('UI Lab Stepper and CommandPalette catalog', () => {
  it('renders all approved Stepper variants through the shared public component', async () => {
    const [catalog, stepper] = await Promise.all([
      readWebSource('pages/ui-lab/ui/stepper-command-catalog.tsx'),
      readWebSource('shared/ui/stepper/stepper.tsx'),
    ]);

    assert.match(catalog, /import \{ Stepper, type StepperItem, type StepperVariant \}/);
    assert.match(catalog, /stepperVariants\.map\(\(variant\) =>/);
    assert.match(catalog, /<Stepper/);
    assert.doesNotMatch(catalog, /<ol\b/);

    assert.match(
      stepper,
      /export type StepperVariant = 'hairline-flow' \| 'soft-track' \| 'ledger-steps'/,
    );
    assert.match(stepper, /data-slot="stepper"/);
    assert.match(stepper, /aria-current=\{state === 'current' \? 'step' : undefined\}/);
    assert.match(stepper, /layoutId=\{reducedMotion \? undefined : 'stepper-hairline-active'\}/);
  });

  it('renders all approved CommandPalette variants through the shared public component', async () => {
    const [catalog, palette] = await Promise.all([
      readWebSource('pages/ui-lab/ui/stepper-command-catalog.tsx'),
      readWebSource('shared/ui/command-palette/command-palette.tsx'),
    ]);

    assert.match(catalog, /import \{\s*CommandPalette,/);
    assert.match(catalog, /<CommandPalette/);
    assert.doesNotMatch(catalog, /role="combobox"/);

    assert.match(
      palette,
      /export type CommandPaletteVariant = 'compact-command' \| 'split-context' \| 'quick-actions'/,
    );
    assert.match(palette, /data-command-palette=""/);
    assert.match(palette, /window\.addEventListener\('keydown', handleGlobalKeyDown\)/);
    assert.match(palette, /role="combobox"/);
    assert.match(palette, /role="listbox"/);
    assert.match(palette, /role="option"/);
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
      assert.match(palette, new RegExp(`case '${key}'`));
    }
  });
});
