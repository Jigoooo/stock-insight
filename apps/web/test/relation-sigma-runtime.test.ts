import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createRelationDragState,
  createRelationRuntimeCleanup,
  RELATION_DRAG_MOVE_THRESHOLD_PX,
  transitionRelationDrag,
} from '../src/pages/research-workspace/model/relation-sigma-runtime.ts';

describe('relation Sigma runtime state', () => {
  it('runs down → move → up and suppresses exactly the drag-generated click', () => {
    let state = createRelationDragState();
    ({ state } = transitionRelationDrag(state, { type: 'down', node: 'US:NVDA', x: 100, y: 100 }));
    assert.equal(state.activeNode, 'US:NVDA');

    ({ state } = transitionRelationDrag(state, { type: 'move', x: 140, y: 130 }));
    const completed = transitionRelationDrag(state, { type: 'up' });
    state = completed.state;
    assert.equal(completed.completedNode, 'US:NVDA');
    assert.equal(completed.moved, true);
    assert.equal(state.activeNode, null);

    const draggedClick = transitionRelationDrag(state, { type: 'click' });
    state = draggedClick.state;
    assert.equal(draggedClick.suppressClick, true);
    const nextClick = transitionRelationDrag(state, { type: 'click' });
    assert.equal(nextClick.suppressClick, false);
  });

  it('does not suppress a click when pointer movement never occurred', () => {
    let state = createRelationDragState();
    ({ state } = transitionRelationDrag(state, { type: 'down', node: 'KR:005930', x: 10, y: 10 }));
    ({ state } = transitionRelationDrag(state, { type: 'up' }));
    const click = transitionRelationDrag(state, { type: 'click' });
    assert.equal(click.suppressClick, false);
  });

  it('treats sub-threshold pointer jitter as a click, not a drag', () => {
    let state = createRelationDragState();
    ({ state } = transitionRelationDrag(state, { type: 'down', node: 'US:NVDA', x: 200, y: 200 }));
    const jitterDistance = RELATION_DRAG_MOVE_THRESHOLD_PX - 1;
    const jitter = transitionRelationDrag(state, { type: 'move', x: 200 + jitterDistance, y: 200 });
    state = jitter.state;
    assert.equal(jitter.moved, false);
    assert.equal(state.moved, false);

    const up = transitionRelationDrag(state, { type: 'up' });
    state = up.state;
    assert.equal(up.moved, false);
    const click = transitionRelationDrag(state, { type: 'click' });
    assert.equal(click.suppressClick, false);
  });

  it('classifies movement as a drag once it crosses the threshold', () => {
    let state = createRelationDragState();
    ({ state } = transitionRelationDrag(state, { type: 'down', node: 'US:NVDA', x: 0, y: 0 }));
    const crossing = transitionRelationDrag(state, {
      type: 'move',
      x: RELATION_DRAG_MOVE_THRESHOLD_PX,
      y: 0,
    });
    state = crossing.state;
    assert.equal(crossing.moved, true);
    assert.equal(state.moved, true);
  });

  it('expires drag click suppression when a stage release produces no click', () => {
    let state = createRelationDragState();
    ({ state } = transitionRelationDrag(state, { type: 'down', node: 'US:NVDA', x: 0, y: 0 }));
    ({ state } = transitionRelationDrag(state, { type: 'move', x: 40, y: 40 }));
    ({ state } = transitionRelationDrag(state, { type: 'up' }));
    ({ state } = transitionRelationDrag(state, { type: 'expire-click-suppression' }));

    const nextGestureClick = transitionRelationDrag(state, { type: 'click' });
    assert.equal(nextGestureClick.suppressClick, false);
  });

  it('cleans partially initialized resources once and kills late resources immediately', () => {
    const killed: string[] = [];
    const runtime = createRelationRuntimeCleanup();
    runtime.setRenderer({ kill: () => killed.push('renderer') });
    runtime.cleanup();
    runtime.cleanup();
    runtime.setLayout({ kill: () => killed.push('late-layout') });

    assert.deepEqual(killed, ['renderer', 'late-layout']);
  });

  it('keeps bbox release independent from automated layout cancellation', async () => {
    let layoutStopped = false;
    let bboxReleased = false;
    const runtime = createRelationRuntimeCleanup();
    runtime.setTimer(setTimeout(() => (layoutStopped = true), 0));
    runtime.setBBoxTimer(setTimeout(() => (bboxReleased = true), 0));

    runtime.clearTimer();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));

    assert.equal(layoutStopped, false);
    assert.equal(bboxReleased, true);
    runtime.cleanup();
  });

  it('clears a pending settle timer during cleanup', async () => {
    let fired = false;
    const runtime = createRelationRuntimeCleanup();
    runtime.setTimer(setTimeout(() => (fired = true), 0));
    runtime.cleanup();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    assert.equal(fired, false);
  });
});
