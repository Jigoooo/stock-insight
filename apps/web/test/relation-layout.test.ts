import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { layoutRelationNodes } from '../src/pages/research-workspace/model/relation-layout.ts';

const nodes = Array.from({ length: 20 }, (_, index) => ({
  entityKey: index === 0 ? 'US:ROOT' : `US:N${index}`,
  label: `Node ${index}`,
}));

describe('bounded relation graph layout', () => {
  it('centers the root and keeps up to 20 unique nodes inside the SVG bounds', () => {
    const layout = layoutRelationNodes(nodes, 'US:ROOT');
    assert.equal(layout.length, 20);
    assert.deepEqual(layout[0], { ...nodes[0], x: 280, y: 150 });
    assert.equal(new Set(layout.map(({ x, y }) => `${x}:${y}`)).size, 20);
    assert.ok(layout.every(({ x }) => x >= 34 && x <= 526));
    assert.ok(layout.every(({ y }) => y >= 28 && y <= 272));
  });

  it('caps malformed oversized input and still includes the requested root', () => {
    const oversized = [
      ...nodes,
      ...nodes.map((node, index) => ({
        ...node,
        entityKey: `KR:${String(index).padStart(6, '0')}`,
      })),
    ];
    const layout = layoutRelationNodes(oversized, 'US:ROOT');
    assert.equal(layout.length, 20);
    assert.equal(layout[0]?.entityKey, 'US:ROOT');
  });
});
