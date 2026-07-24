import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const runnerPath = new URL('../../../scripts/run-p3d-production-e2e.mjs', import.meta.url);
const runnerSource = existsSync(runnerPath) ? readFileSync(runnerPath, 'utf8') : '';
const rootPackage = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8');

describe('P3-D production E2E evidence runner', () => {
  it('exists as the only supported production evidence entrypoint', () => {
    assert.equal(existsSync(runnerPath), true);
  });

  it('is mandatory in the top-level release gate', () => {
    assert.match(rootPackage, /"test:p3d:browser:production"/);
    assert.match(rootPackage, /"verify:release"[^\n]*test:p3d:browser:production/);
  });

  it('binds each of two rounds to the same production artifact before and after browsers', () => {
    assert.match(runnerSource, /hashProductionArtifact/);
    assert.match(runnerSource, /ROUND_COUNT\s*=\s*2/);
    assert.match(runnerSource, /artifactBefore/);
    assert.match(runnerSource, /artifactAfter/);
    assert.match(runnerSource, /PLAYWRIGHT_PRODUCTION_ARTIFACT_SHA256/);
    assert.match(runnerSource, /PLAYWRIGHT_USE_PRODUCTION_BUILD:\s*'1'/);
    assert.match(runnerSource, /delete process\.env\[key\]/);
    assert.match(runnerSource, /PLAYWRIGHT_SKIP_WEB_SERVER/);
  });

  it('runs the cross-viewport and desktop-only branches without accepted skips', () => {
    assert.match(runnerSource, /--project=desktop/);
    assert.match(runnerSource, /--project=mobile/);
    assert.match(runnerSource, /normalExpected:\s*2/);
    assert.match(runnerSource, /edgeExpected:\s*2/);
    assert.match(runnerSource, /skipped !== 0/);
  });

  it('requires byte-identical screenshot sets across both rounds', () => {
    assert.match(runnerSource, /collectScreenshotDigests/);
    assert.match(runnerSource, /compareScreenshotRounds/);
    assert.match(runnerSource, /P3D_CAPTURE_SCREENSHOTS:\s*'1'/);
  });
});
