import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createWorkspaceOverlayMotionPlan } from '../src/pages/research-workspace/ui/workspace-overlay-motion-controller.ts';

describe('workspace overlay motion plan', () => {
  it('opens an inspector with one bounded panel and scrim timeline', () => {
    const plan = createWorkspaceOverlayMotionPlan({
      kind: 'inspector',
      phase: 'opening',
      reducedMotion: false,
    });

    assert.equal(plan.duration <= 0.24, true);
    assert.deepEqual(plan.sets, [
      { target: 'scrim', vars: { opacity: 0 } },
      { target: 'panel', vars: { opacity: 0.96, y: 12 } },
    ]);
    assert.deepEqual(plan.tweens, [
      { at: 0, target: 'scrim', vars: { opacity: 1 } },
      { at: 0, target: 'panel', vars: { opacity: 1, y: 0 } },
    ]);
  });

  it('closes without a from-value reset so rapid interruption stays continuous', () => {
    const plan = createWorkspaceOverlayMotionPlan({
      kind: 'inspector',
      phase: 'closing',
      reducedMotion: false,
    });

    assert.deepEqual(plan.sets, []);
    assert.deepEqual(plan.tweens, [
      { at: 0, target: 'scrim', vars: { opacity: 0 } },
      { at: 0, target: 'panel', vars: { opacity: 0.96, y: 12 } },
    ]);
  });

  it('moves a mobile drawer horizontally while leaving its content geometry fixed', () => {
    const opening = createWorkspaceOverlayMotionPlan({
      kind: 'drawer',
      phase: 'opening',
      reducedMotion: false,
    });
    const closing = createWorkspaceOverlayMotionPlan({
      kind: 'drawer',
      phase: 'closing',
      reducedMotion: false,
    });

    assert.deepEqual(opening.sets[1], {
      target: 'panel',
      vars: { x: 0, xPercent: -102 },
    });
    assert.deepEqual(opening.tweens[1], {
      at: 0,
      target: 'panel',
      vars: { x: 0, xPercent: 0 },
    });
    assert.deepEqual(closing.tweens[1], {
      at: 0,
      target: 'panel',
      vars: { x: 0, xPercent: -102 },
    });
  });

  it('does not reset a reversing opening transition to the closed endpoint', () => {
    const reversal = createWorkspaceOverlayMotionPlan({
      initializeOpening: false,
      kind: 'drawer',
      phase: 'opening',
      reducedMotion: false,
    });

    assert.deepEqual(reversal.sets, []);
    assert.deepEqual(reversal.tweens[0], {
      at: 0,
      target: 'scrim',
      vars: { opacity: 1 },
    });
    assert.deepEqual(reversal.tweens[1], {
      at: 0,
      target: 'panel',
      vars: { x: 0, xPercent: 0 },
    });
  });

  it('normalizes opening and closing synchronously for reduced motion', () => {
    const opening = createWorkspaceOverlayMotionPlan({
      kind: 'inspector',
      phase: 'opening',
      reducedMotion: true,
    });
    const closing = createWorkspaceOverlayMotionPlan({
      kind: 'drawer',
      phase: 'closing',
      reducedMotion: true,
    });

    assert.equal(opening.duration, 0);
    assert.equal(opening.completeSynchronously, true);
    assert.deepEqual(opening.tweens, []);
    assert.deepEqual(opening.sets, [
      { target: 'scrim', vars: { opacity: 1 } },
      { target: 'panel', vars: { opacity: 1, x: 0, xPercent: 0, y: 0 } },
    ]);
    assert.deepEqual(closing.sets, [
      { target: 'scrim', vars: { opacity: 0 } },
      { target: 'panel', vars: { x: 0, xPercent: -102 } },
    ]);
  });

  it('never emits scale, blur, backdrop-filter, or layout properties', () => {
    for (const kind of ['drawer', 'inspector'] as const) {
      for (const phase of ['closing', 'opening'] as const) {
        const serialized = JSON.stringify(
          createWorkspaceOverlayMotionPlan({ kind, phase, reducedMotion: false }),
        );
        assert.doesNotMatch(
          serialized,
          /backdrop|blur|grid|height|left|padding|right|scale|top|width/i,
        );
      }
    }
  });
});
