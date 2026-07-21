import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const componentPath = new URL(
  '../src/pages/research-workspace/ui/relation-sigma-graph.tsx',
  import.meta.url,
);
const viteConfigPath = new URL('../vite.config.ts', import.meta.url);
const componentStylesPath = new URL(
  '../src/pages/research-workspace/ui/research-workspace-page.module.css',
  import.meta.url,
);
const rootPackagePath = new URL('../../../package.json', import.meta.url);
const productionRunnerPath = new URL(
  '../../../scripts/run-sigma-production-e2e.mjs',
  import.meta.url,
);
const edgeHeadersPath = new URL(
  '../../../deploy/stock-edge/security-headers.conf',
  import.meta.url,
);

describe('RelationSigmaGraph structure', () => {
  it('implements official Sigma drag lifecycle and camera suppression', async () => {
    const source = await readFile(componentPath, 'utf8');

    for (const eventName of ['downNode', 'moveBody', 'upNode', 'upStage']) {
      assert.match(source, new RegExp(`renderer\\.on\\('${eventName}'`));
    }
    assert.match(source, /renderer\.viewportToGraph\(event\)/);
    assert.match(source, /event\.preventSigmaDefault\(\)/);
    assert.match(source, /event\.original\.preventDefault\(\)/);
    // Drag/click disambiguation must be distance-based (jitter guard) and feed
    // real pointer coordinates into the FSM.
    assert.match(source, /type: 'down',\s*\n\s*node,\s*\n\s*x: event\.x,\s*\n\s*y: event\.y,/);
    assert.match(source, /type: 'move',\s*\n\s*x: event\.x,\s*\n\s*y: event\.y,/);
    assert.match(source, /if \(!transition\.moved\) return;/);
    // A gesture release must never reset the camera (only user "원위치" does).
    assert.match(source, /scheduleLayoutStop\(650, false\)/);
    assert.doesNotMatch(source, /scheduleLayoutStop\(650, true\)/);
  });

  it('uses hover reducers and animated camera focus without creating graph data', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert.match(source, /renderer\.setSetting\('nodeReducer'/);
    assert.match(source, /renderer\.setSetting\('edgeReducer'/);
    assert.match(source, /renderer\.on\('enterNode'/);
    assert.match(source, /renderer\.on\('leaveNode'/);
    assert.match(source, /camera\.animate\(/);
    assert.doesNotMatch(source, /renderer\.on\('clickStage'/);
    assert.doesNotMatch(source, /\.addNode\(/);
  });

  it('kills the ForceAtlas2 worker and renderer on every lifecycle exit', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert.doesNotMatch(source, /^import Sigma from 'sigma';$/m);
    assert.doesNotMatch(source, /^import FA2LayoutSupervisor/m);
    assert.match(source, /import\('sigma'\)/);
    assert.match(source, /import\('graphology-layout-forceatlas2\/worker'\)/);
    assert.match(source, /createRelationRuntimeCleanup\(\)/);
    assert.match(source, /runtime\.setRenderer\(renderer\)/);
    assert.match(source, /runtime\.setLayout\(layout\)/);
    assert.match(source, /runtime\.cleanup\(\)/);
    assert.match(source, /initialize\(\)\.catch[\s\S]*?release\(\)/);
    assert.match(source, /renderer\.setCustomBBox\(null\)/);
    assert.match(source, /if \(!normalizeMotion\)/);
    const release = source.match(/const release = \(\) => \{[\s\S]*?\n    \};/)?.[0] ?? '';
    assert.doesNotMatch(release, /interactionRef\.current\s*=\s*\{\}/);
    assert.match(source, /runtime\.trackTimer\(/);
  });

  it('provides search, camera controls, and a keyboard node path', async () => {
    const source = await readFile(componentPath, 'utf8');

    assert.match(source, /aria-label="관계 노드 검색"/);
    assert.match(source, /aria-label="확대"/);
    assert.match(source, /aria-label="축소"/);
    assert.match(source, /aria-label="관계 지도 원위치"/);
    assert.match(source, /aria-label="관계 노드 목록"/);
  });

  it('allows only the pinned ForceAtlas2 blob worker through app and edge CSP', async () => {
    const [viteConfig, edgeHeaders] = await Promise.all([
      readFile(viteConfigPath, 'utf8'),
      readFile(edgeHeadersPath, 'utf8'),
    ]);

    assert.match(viteConfig, /worker-src blob:/);
    assert.match(edgeHeaders, /worker-src blob:/);
    assert.doesNotMatch(viteConfig, /worker-src 'self'/);
    assert.doesNotMatch(edgeHeaders, /worker-src 'self'/);
  });

  it('keeps mobile controls at 44px and binds Sigma CSP checks to a production artifact gate', async () => {
    const [styles, rootPackage, runner] = await Promise.all([
      readFile(componentStylesPath, 'utf8'),
      readFile(rootPackagePath, 'utf8'),
      readFile(productionRunnerPath, 'utf8'),
    ]);

    assert.match(styles, /grid-template-columns:\s*repeat\(3, 44px\)/);
    assert.match(styles, /\.graphControls button[\s\S]*?min-height:\s*44px/);
    assert.match(styles, /\.graphNodeList button\s*\{[\s\S]*?min-height:\s*44px/);
    // Vertical page scroll must survive over the canvas on touch devices.
    assert.match(styles, /\.sigmaCanvas\s*\{[\s\S]*?touch-action:\s*pan-y/);
    assert.doesNotMatch(styles, /\.sigmaCanvas\s*\{[\s\S]*?touch-action:\s*none/);
    assert.match(rootPackage, /"test:sigma:browser:production"/);
    assert.match(rootPackage, /"verify:release"[^\n]*test:sigma:browser:production/);
    // The release runner must hash the client bundle (not only the server
    // entry), strip ambient grep, and enforce zero-skip pass counts.
    assert.match(runner, /\.output\/server\/index\.mjs/);
    assert.match(runner, /public\/assets/);
    assert.match(runner, /PLAYWRIGHT_PRODUCTION_ARTIFACT_SHA256/);
    assert.match(runner, /delete process\.env\[key\]/);
    assert.match(runner, /PLAYWRIGHT_GREP/);
    assert.match(runner, /skipped/);
    assert.match(runner, /openSync\([^)]*'wx'/);
  });
});
