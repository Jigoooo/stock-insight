import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
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
      [['다음', 'Charts End-to-End']],
    );
  });
});
