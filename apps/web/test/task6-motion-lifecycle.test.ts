import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  createMotionTransitionController,
  MOTION_PREFERENCE_QUERIES,
  subscribeMotionPreferences,
  type MotionPreferenceMediaQuery,
  type MotionTransitionAdapter,
  type MotionTransitionElement,
  type MotionTransitionVars,
} from '../src/shared/ui/motion/use-motion-preferences.ts';

const motionRegionUrl = new URL('../src/shared/ui/motion/motion-region.tsx', import.meta.url);
const surfaceUrl = new URL('../src/shared/ui/primitives/surface.tsx', import.meta.url);
const feedbackUrl = new URL('../src/shared/ui/primitives/feedback.tsx', import.meta.url);
const toastUrl = new URL('../src/shared/ui/toast/motion-toast.tsx', import.meta.url);

class FakeMediaQuery implements MotionPreferenceMediaQuery {
  matches = false;
  readonly listeners = new Set<() => void>();

  addEventListener(type: 'change', listener: () => void) {
    assert.equal(type, 'change');
    this.listeners.add(listener);
  }

  removeEventListener(type: 'change', listener: () => void) {
    assert.equal(type, 'change');
    this.listeners.delete(listener);
  }

  dispatchChange() {
    for (const listener of this.listeners) listener();
  }
}

type TransitionCall = {
  from?: MotionTransitionVars;
  method: 'fromTo' | 'kill' | 'set' | 'to';
  to?: MotionTransitionVars;
};

function createTransitionHarness() {
  const calls: TransitionCall[] = [];
  const element: MotionTransitionElement = {};
  const adapter: MotionTransitionAdapter = {
    fromTo(_element, from, to) {
      calls.push({ from, method: 'fromTo', to });
    },
    killTweensOf() {
      calls.push({ method: 'kill' });
    },
    set(_element, to) {
      calls.push({ method: 'set', to });
    },
    to(_element, to) {
      calls.push({ method: 'to', to });
    },
  };

  return { calls, controller: createMotionTransitionController(adapter), element };
}

describe('Task 6 motion preferences', () => {
  it('subscribes to every accessibility preference and removes the exact listeners', () => {
    const media = new Map(MOTION_PREFERENCE_QUERIES.map((query) => [query, new FakeMediaQuery()]));
    let changes = 0;
    const cleanup = subscribeMotionPreferences(
      () => {
        changes += 1;
      },
      (query) => {
        const target = media.get(query);
        if (!target) throw new Error(`Unexpected media query: ${query}`);
        return target;
      },
    );

    assert.deepEqual(
      [...media.values()].map((target) => target.listeners.size),
      [1, 1, 1],
    );
    media.get(MOTION_PREFERENCE_QUERIES[0])?.dispatchChange();
    assert.equal(changes, 1);

    cleanup();
    assert.deepEqual(
      [...media.values()].map((target) => target.listeners.size),
      [0, 0, 0],
    );
    media.get(MOTION_PREFERENCE_QUERIES[1])?.dispatchChange();
    assert.equal(changes, 1);
  });
});

describe('Task 6 transition lifecycle', () => {
  it('owns a normal surface enter and interruptible exit on one scoped element', () => {
    const { calls, controller, element } = createTransitionHarness();

    controller.enter({ element, recipe: 'surface', reducedMotion: false });
    controller.exit({ element, recipe: 'surface', reducedMotion: false });

    assert.deepEqual(
      calls.map((call) => call.method),
      ['kill', 'fromTo', 'kill', 'to'],
    );
    assert.deepEqual(calls[1]?.from, { opacity: 0, y: 6 });
    assert.equal(calls[1]?.to?.opacity, 1);
    assert.equal(calls[1]?.to?.overwrite, 'auto');
    assert.equal(calls[3]?.to?.opacity, 0);
    assert.equal(calls[3]?.to?.overwrite, 'auto');
  });

  it('normalizes reduced motion and decorative loops without creating tweens', () => {
    const { calls, controller, element } = createTransitionHarness();
    let completed = 0;

    controller.enter({
      element,
      onComplete: () => {
        completed += 1;
      },
      recipe: 'feedback',
      reducedMotion: true,
    });
    controller.loop({ element, recipe: 'skeleton', reducedMotion: true });

    assert.deepEqual(
      calls.map((call) => call.method),
      ['kill', 'set', 'kill', 'set'],
    );
    assert.equal(completed, 1);
    assert.deepEqual(calls[1]?.to, { opacity: 1, x: 0, y: 0 });
    assert.deepEqual(calls[3]?.to, { opacity: 1, rotation: 0 });
  });

  it('kills active work and clears only motion-owned properties on cleanup', () => {
    const { calls, controller, element } = createTransitionHarness();

    controller.cleanup(element);

    assert.deepEqual(calls, [
      { method: 'kill' },
      { method: 'set', to: { clearProps: 'opacity,transform' } },
    ]);
  });
});

describe('Task 6 React ownership contract', () => {
  it('uses explicit MotionRegion owners for surfaces, status, feedback, and skeleton loops', async () => {
    const [motionRegion, surface, feedback] = await Promise.all([
      readFile(motionRegionUrl, 'utf8'),
      readFile(surfaceUrl, 'utf8'),
      readFile(feedbackUrl, 'utf8'),
    ]);

    assert.match(motionRegion, /useGSAP/);
    assert.match(motionRegion, /scope:\s*elementRef/);
    assert.match(motionRegion, /revertOnUpdate:\s*true/);
    assert.match(motionRegion, /onEnterComplete/);
    assert.match(motionRegion, /onExitComplete/);
    assert.match(surface, /MotionRegion/);
    assert.match(surface, /recipe="surface"/);
    assert.match(feedback, /recipe="status"/);
    assert.match(feedback, /recipe="feedback"/);
    assert.match(feedback, /recipe="skeleton"/);
    assert.doesNotMatch(surface + feedback, /data-motion-(?:enter|loop)/);
  });

  it('uses context-safe toast motion with finite outer lifetime and preserved pause/dismiss/swipe paths', async () => {
    const source = await readFile(toastUrl, 'utf8');

    assert.match(source, /useGSAP/);
    assert.match(source, /contextSafe/);
    assert.doesNotMatch(source, /useLayoutEffect/);
    assert.match(source, /const sonnerOuterDuration = 7 \* 24 \* 60 \* 60 \* 1000/);
    assert.match(source, /visibilitychange/);
    assert.match(source, /mouseenter/);
    assert.match(source, /app-toast-dismiss/);
    assert.match(source, /swipeDirections=\{\['right', 'top'\]\}/);
  });
});
