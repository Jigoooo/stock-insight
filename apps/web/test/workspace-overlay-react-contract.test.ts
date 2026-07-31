import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const hookUrl = new URL(
  '../src/pages/research-workspace/ui/use-workspace-overlay-motion.ts',
  import.meta.url,
);
const runtimeUrl = new URL(
  '../src/pages/research-workspace/ui/workspace-overlay-motion-runtime.ts',
  import.meta.url,
);

describe('workspace overlay React motion ownership', () => {
  it('syncs intent before paint and owns one interruptible Motion group', async () => {
    const [source, runtime] = await Promise.all([
      readFile(hookUrl, 'utf8'),
      readFile(runtimeUrl, 'utf8'),
    ]);

    assert.match(source, /useLayoutEffect/);
    assert.match(source, /from 'motion\/react'/);
    assert.match(source, /\banimate\(/);
    assert.match(runtime, /\.stop\(\)/);
    assert.match(source, /previousAnimatedPhaseRef/);
    assert.match(source, /initializeOpening[,}]/);
    assert.match(source, /state\.phase !== 'open' && state\.phase !== 'closed'/);
    assert.match(source, /removeProperty\('opacity'\)/);
    assert.match(source, /removeProperty\('transform'\)/);
    assert.match(source, /runWorkspaceOverlayMotion/);
    assert.match(source, /createWorkspaceOverlayMotionPlan/);
    assert.doesNotMatch(source, /@gsap\/react|from ['"]gsap['"]|useGSAP|contextSafe/);
  });

  it('reacts to accessibility preferences and finishes only the current reducer token', async () => {
    const source = await readFile(hookUrl, 'utf8');

    assert.match(source, /useMotionPreferences/);
    assert.match(source, /reducedMotion \|\| forcedColors/);
    assert.match(source, /token:\s*state\.token/);
    assert.match(source, /type:\s*'finish'/);
    assert.match(source, /type:\s*'request'/);
    assert.match(source, /onExitedRef\.current\?\.\(\)/);
  });
});
