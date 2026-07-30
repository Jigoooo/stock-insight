import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const performanceSpecUrl = new URL('../../../e2e/motion-performance.spec.ts', import.meta.url);
const rootPackageUrl = new URL('../../../package.json', import.meta.url);

describe('startup performance attribution contract', () => {
  it('retains resource identity and reports the largest startup transfers', async () => {
    const source = await readFile(performanceSpecUrl, 'utf8');

    const resourceType = source.match(/type ResourceEntry = \{([\s\S]*?)\};/)?.[1] ?? '';
    assert.match(resourceType, /name:\s*string/);
    assert.match(source, /name:\s*resource\.name/);
    assert.match(source, /name:\s*entry\.name/);
    assert.match(source, /name:\s*navigation\.name/);
    assert.match(source, /largestResources/);
    assert.match(source, /\.sort\(\(left, right\) => right\.transferSize - left\.transferSize\)/);
    assert.match(source, /sourceURL/);
    assert.match(source, /sourceFunctionName/);
    assert.match(source, /renderStart/);
    assert.match(source, /styleAndLayoutStart/);
    assert.match(source, /phaseTotals/);
    assert.match(source, /test\.use\(\{\s*trace:\s*'off',\s*video:\s*'off'\s*\}\)/);
    assert.match(source, /longTask\.attribution/);
    assert.match(source, /topAttribution/);
    assert.match(source, /LOGIN_CRITICAL_TRANSFER_GATE_BYTES = 650 \* 1024/);
    assert.match(source, /FONT_LAYOUT_SHIFT_GATE = 0\.02/);
    assert.match(source, /STARTUP_LONG_TASK_GATE_MS = 330/);
    assert.match(source, /STARTUP_SCRIPT_GATE_MS = 120/);
    assert.match(source, /STARTUP_STYLE_LAYOUT_GATE_MS = 325/);
    assert.match(source, /phaseMaxima/);
    assert.match(source, /baseline\.performance\.longTasks\.maxMs/);
    assert.match(source, /baseline\.transfer\.totalTransferBytes/);
    assert.match(source, /baseline\.performance\.layoutShifts\.cumulativeScore/);
  });

  it('enforces the transfer budget against the production artifact in the release gate', async () => {
    const [source, rootPackageSource] = await Promise.all([
      readFile(performanceSpecUrl, 'utf8'),
      readFile(rootPackageUrl, 'utf8'),
    ]);
    const rootPackage = JSON.parse(rootPackageSource) as {
      scripts: Record<string, string>;
    };

    assert.match(
      source,
      /const useProductionBuild = process\.env\.PLAYWRIGHT_USE_PRODUCTION_BUILD/,
    );
    assert.match(
      source,
      /if \(useProductionBuild\) \{\s*expect\(baseline\.transfer\.totalTransferBytes\)/,
    );
    assert.match(
      rootPackage.scripts['test:motion:browser:production'] ?? '',
      /PLAYWRIGHT_USE_PRODUCTION_BUILD=1/,
    );
    assert.match(
      rootPackage.scripts['test:motion:browser:production'] ?? '',
      /motion-performance\.spec\.ts/,
    );
    assert.match(
      rootPackage.scripts['test:motion:browser:production'] ?? '',
      /records the credential-free/,
    );
    assert.match(rootPackage.scripts['verify:release'] ?? '', /test:motion:browser:production/);
  });
});
