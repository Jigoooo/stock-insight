import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const performanceSpecUrl = new URL('../../../e2e/motion-performance.spec.ts', import.meta.url);

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
    assert.match(source, /STARTUP_LONG_TASK_GATE_MS = 500/);
    assert.match(source, /STARTUP_SCRIPT_GATE_MS = 150/);
    assert.match(source, /STARTUP_STYLE_LAYOUT_GATE_MS = 500/);
    assert.match(source, /WORKSPACE_LONG_TASK_GATE_MS = 350/);
    assert.match(source, /WORKSPACE_SCRIPT_GATE_MS = 350/);
    assert.match(source, /expect\(snapshot\.probe\.observerFailures\)\.toEqual\(\[\]\)/);
    assert.match(source, /expect\(snapshot\.probe\.supportedEntryTypes\)\.toContain\(entryType\)/);
    assert.match(
      source,
      /expect\(navigationFrameTargets\)\.toEqual\(expectedNavigationFrameTargets\)/,
    );
    assert.doesNotMatch(
      source,
      /Math\.max\(0, \.\.\.baseline\.navigation\.eventToNextAnimationFrame/,
    );
    assert.match(source, /Math\.min\(entry\.duration, Math\.max\(0, endTime - renderStart\)\)/);
    assert.match(source, /durationMs:\s*round\(entry\.duration\)/);
    assert.match(source, /phase\.styleAndLayoutMs\)\.toBeLessThanOrEqual\(phase\.durationMs\)/);
    assert.match(source, /phaseMaxima/);
    assert.match(source, /baseline\.performance\.longTasks\.maxMs/);
    assert.match(source, /baseline\.transfer\.totalTransferBytes/);
    assert.match(source, /baseline\.performance\.layoutShifts\.cumulativeScore/);
  });

  it('times three real lane transitions without a current-lane no-op', async () => {
    const source = await readFile(performanceSpecUrl, 'utf8');
    assert.match(source, /WORKSPACE_LANES = \['for_you', 'explore', 'must_know'\]/);
    assert.match(source, /expect\(beforeId\)\.not\.toBe\(target\.id\)/);
    assert.match(source, /expect\(afterId\)\.toBe\(target\.id\)/);
  });

  it('excludes initial hydration work from the navigation-only performance budget', async () => {
    const source = await readFile(performanceSpecUrl, 'utf8');
    assert.match(
      source,
      /waitForLoadState\('networkidle'\);[\s\S]+settlePerformanceObservers\(page\);[\s\S]+resetBrowserProbe\(page\);[\s\S]+runWorkspaceNavigationPlan/,
    );
    assert.match(source, /probe\.resourceEntries\.length = 0/);
    assert.match(source, /performance\.clearResourceTimings\(\)/);
    assert.match(source, /transfer:\s*summarizeTransfer\(snapshot, false\)/);
  });
});
