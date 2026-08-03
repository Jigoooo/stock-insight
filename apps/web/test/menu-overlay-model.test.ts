import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { roadmapBatches } from '../src/pages/ui-lab/ui/menu-overlay-model.ts';

describe('Menu & Overlay model', () => {
  it('exposes the four consolidated rollout batches in order', () => {
    assert.deepEqual(
      roadmapBatches.map((batch) => batch.title),
      ['Menu & Overlay', 'Identity & Content', 'Data & Feedback', 'Charts End-to-End'],
    );
    assert.deepEqual(
      roadmapBatches.map((batch) => batch.state),
      ['진행 중', '예정', '예정', '예정'],
    );
  });
});
