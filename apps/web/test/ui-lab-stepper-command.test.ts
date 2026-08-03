import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

async function readCatalogSource() {
  return readFile(
    new URL('../src/pages/ui-lab/ui/stepper-command-catalog.tsx', import.meta.url),
    'utf8',
  ).catch(() => '');
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
});
