import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  contentItems,
  getAdjacentContentId,
  identityContentTabs,
  identityContentVariants,
} from '../src/pages/ui-lab/ui/identity-content-model.ts';
import { roadmapBatches } from '../src/pages/ui-lab/ui/menu-overlay-model.ts';

describe('Identity & Content model', () => {
  it('keeps six independent A/B/C component comparisons and only remaining roadmap cards', () => {
    assert.deepEqual(
      identityContentTabs.map((tab) => tab.id),
      ['avatar', 'badge', 'status', 'list', 'timeline', 'carousel'],
    );
    assert.deepEqual(
      identityContentTabs.map((tab) => identityContentVariants[tab.id].length),
      [3, 3, 3, 3, 3, 3],
    );
    assert.deepEqual(
      roadmapBatches.map(({ state, title }) => [state, title]),
      [
        ['진행 중', 'Identity & Content'],
        ['예정', 'Data & Feedback'],
        ['예정', 'Charts End-to-End'],
      ],
    );
  });

  it('moves shared content selection one item at a time and stops at the boundaries', () => {
    assert.deepEqual(
      contentItems.map((item) => item.id),
      ['ai-infrastructure', 'memory-cycle', 'supply-risk'],
    );
    assert.equal(getAdjacentContentId('ai-infrastructure', -1), 'ai-infrastructure');
    assert.equal(getAdjacentContentId('ai-infrastructure', 1), 'memory-cycle');
    assert.equal(getAdjacentContentId('memory-cycle', 1), 'supply-risk');
    assert.equal(getAdjacentContentId('supply-risk', 1), 'supply-risk');
  });
});
