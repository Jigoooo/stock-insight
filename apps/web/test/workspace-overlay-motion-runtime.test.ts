import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createWorkspaceOverlayMotionPlan } from '../src/pages/research-workspace/ui/workspace-overlay-motion-controller.ts';
import { runWorkspaceOverlayMotion } from '../src/pages/research-workspace/ui/workspace-overlay-motion-runtime.ts';

function createHarness() {
  const log: string[] = [];
  let timelineComplete: (() => void) | null = null;
  const panel = { id: 'panel' };
  const scrim = { id: 'scrim' };
  const timeline = {
    kill: () => log.push('timeline:kill'),
    to: (target: object, vars: object, at: number) => {
      log.push(`to:${target === panel ? 'panel' : 'scrim'}:${JSON.stringify(vars)}:${at}`);
      return timeline;
    },
  };
  const adapter = {
    createTimeline: ({ duration, onComplete }: { duration: number; onComplete: () => void }) => {
      log.push(`timeline:create:${duration}`);
      timelineComplete = onComplete;
      return timeline;
    },
    killTweensOf: (target: object) => log.push(`kill:${target === panel ? 'panel' : 'scrim'}`),
    set: (target: object, vars: object) =>
      log.push(`set:${target === panel ? 'panel' : 'scrim'}:${JSON.stringify(vars)}`),
  };
  return {
    adapter,
    complete: () => timelineComplete?.(),
    log,
    panel,
    scrim,
  };
}

describe('workspace overlay motion runtime', () => {
  it('runs every normal step on one timeline and completes once', () => {
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
      'kill:panel',
      'kill:scrim',
      'set:scrim:{"opacity":0}',
      'set:panel:{"opacity":0.96,"y":12}',
      'timeline:create:0.22',
      'to:scrim:{"opacity":1,"duration":0.22,"ease":"power2.out","overwrite":"auto"}:0',
      'to:panel:{"opacity":1,"y":0,"duration":0.22,"ease":"power2.out","overwrite":"auto"}:0',
    ]);

    harness.complete();
    harness.complete();
    assert.equal(completions, 1);

    dispose();
    assert.deepEqual(harness.log.slice(-3), ['timeline:kill', 'kill:panel', 'kill:scrim']);
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
      harness.log.some((entry) => entry.startsWith('timeline:')),
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
      harness.log.some((entry) => entry.startsWith('to:panel:')),
      true,
    );
  });
});
