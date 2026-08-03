import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

async function readCatalogSource() {
  return readFile(
    new URL('../src/pages/ui-lab/ui/stepper-command-catalog.tsx', import.meta.url),
    'utf8',
  );
}

describe('UI Lab Stepper and CommandPalette catalog', () => {
  it('defines the synchronized Stepper A, B, and C source contract', async () => {
    const catalog = await readCatalogSource();

    assert.match(catalog, /export function StepperCommandCatalog\(\)/);
    assert.match(
      catalog,
      /type StepperVariant = 'hairline-flow' \| 'soft-track' \| 'ledger-steps'/,
    );
    assert.match(catalog, /type ResearchStepId = 'sources' \| 'evidence' \| 'impact' \| 'review'/);

    for (const variant of ['hairline-flow', 'soft-track', 'ledger-steps']) {
      assert.match(catalog, new RegExp(`id: '${variant}'`));
    }

    assert.equal(catalog.match(/useState<ResearchStepId>\(/g)?.length, 1);
    assert.match(catalog, /const \[activeStep, setActiveStep\] = useState<ResearchStepId>/);
    assert.match(catalog, /stepperVariants\.map\(\(variant\) =>/);
    assert.match(catalog, /<ol\b/);
    assert.match(catalog, /<li\b/);
    assert.match(catalog, /aria-current=\{state === 'current' \? 'step' : undefined\}/);
    assert.match(catalog, /onClick=\{\(\) => setActiveStep\(step\.id\)\}/);
  });

  it('defines the keyboard-accessible CommandPalette A, B, and C source contract', async () => {
    const catalog = await readCatalogSource();

    assert.match(
      catalog,
      /type CommandVariant = 'compact-command' \| 'split-context' \| 'quick-actions'/,
    );
    for (const variant of ['compact-command', 'split-context', 'quick-actions']) {
      assert.match(catalog, new RegExp(`id: '${variant}'`));
    }

    assert.match(
      catalog,
      /const \[openVariant, setOpenVariant\] = useState<CommandVariant \| null>/,
    );
    assert.match(catalog, /const \[query, setQuery\] = useState\(''\)/);
    assert.match(catalog, /const \[activeIndex, setActiveIndex\] = useState\(0\)/);
    assert.match(catalog, /const \[lastAction, setLastAction\] = useState<string \| null>\(null\)/);
    assert.match(catalog, /window\.addEventListener\('keydown', handleGlobalKeyDown\)/);
    assert.match(catalog, /window\.removeEventListener\('keydown', handleGlobalKeyDown\)/);
    assert.match(catalog, /event\.metaKey \|\| event\.ctrlKey/);
    assert.match(catalog, /event\.key\.toLowerCase\(\) === 'k'/);

    assert.match(catalog, /role="combobox"/);
    assert.match(catalog, /role="listbox"/);
    assert.match(catalog, /role="option"/);
    assert.match(catalog, /aria-activedescendant=/);
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
      assert.match(catalog, new RegExp(`case '${key}'`));
    }
    assert.match(catalog, /검색 결과가 없습니다\./);
    assert.match(catalog, /setLastAction\(item\.label\)/);
  });
});
