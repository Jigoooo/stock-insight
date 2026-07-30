import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createWorkspaceOverlayMotionPlan } from '../src/pages/research-workspace/ui/workspace-overlay-motion-controller.ts';
import { runWorkspaceOverlayMotion } from '../src/pages/research-workspace/ui/workspace-overlay-motion-runtime.ts';

function createHarness() {
  const log: string[] = [];
  const resolvers: Array<() => void> = [];
  const panel = { id: 'panel' };
  const scrim = { id: 'scrim' };
  const adapter = {
    animate: (target: object, vars: object, options: object) => {
      log.push(
        `animate:${target === panel ? 'panel' : 'scrim'}:${JSON.stringify(vars)}:${JSON.stringify(options)}`,
      );
      let resolve!: () => void;
      const finished = new Promise<void>((done) => {
        resolve = done;
      });
      resolvers.push(resolve);
      return {
        finished,
        stop: () => log.push(`stop:${target === panel ? 'panel' : 'scrim'}`),
      };
    },
    set: (target: object, vars: object) =>
      log.push(`set:${target === panel ? 'panel' : 'scrim'}:${JSON.stringify(vars)}`),
  };
  return {
    adapter,
    complete: () => {
      for (const resolve of resolvers) resolve();
    },
    log,
    panel,
    scrim,
  };
}

describe('workspace overlay motion runtime', () => {
  it('runs every normal step as one Motion group and completes once', async () => {
    const harness = createHarness();
    let completions = 0;
    const dispose = runWorkspaceOverlayMotion({
      adapter: harness.adapter,
      onComplete: () => {
        completions += 1;
      },
      plan: createWorkspaceOverlayMotionPlan({
        kind: 'inspector',
        phase: 'opening',
        reducedMotion: false,
      }),
      targets: { panel: harness.panel, scrim: harness.scrim },
    });

    assert.deepEqual(harness.log, [
      'set:scrim:{"opacity":0}',
      'set:panel:{"opacity":0.96,"y":12}',
      'animate:scrim:{"opacity":1}:{"duration":0.22,"ease":"easeOut"}',
      'animate:panel:{"opacity":1,"y":0}:{"duration":0.22,"ease":"easeOut"}',
    ]);

    harness.complete();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(completions, 1);

    dispose();
    assert.deepEqual(harness.log.slice(-2), ['stop:scrim', 'stop:panel']);
  });

  it('normalizes reduced motion without creating a timeline', () => {
    const harness = createHarness();
    let completions = 0;
    runWorkspaceOverlayMotion({
      adapter: harness.adapter,
      onComplete: () => {
        completions += 1;
      },
      plan: createWorkspaceOverlayMotionPlan({
        kind: 'drawer',
        phase: 'closing',
        reducedMotion: true,
      }),
      targets: { panel: harness.panel, scrim: harness.scrim },
    });

    assert.equal(completions, 1);
    assert.equal(
      harness.log.some((entry) => entry.startsWith('animate:')),
      false,
    );
    assert.deepEqual(harness.log.slice(-2), [
      'set:scrim:{"opacity":0}',
      'set:panel:{"x":0,"xPercent":-102}',
    ]);
  });

  it('skips missing optional scrim targets without dropping panel motion', () => {
    const harness = createHarness();
    runWorkspaceOverlayMotion({
      adapter: harness.adapter,
      onComplete: () => undefined,
      plan: createWorkspaceOverlayMotionPlan({
        kind: 'inspector',
        phase: 'closing',
        reducedMotion: false,
      }),
      targets: { panel: harness.panel, scrim: null },
    });

    assert.equal(
      harness.log.some((entry) => entry.includes('scrim')),
      false,
    );
    assert.equal(
      harness.log.some((entry) => entry.startsWith('animate:panel:')),
      true,
    );
  });
});
