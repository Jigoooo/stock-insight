import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  menuOverlayVariants,
  researchActions,
  resolveResearchActionResult,
  roadmapBatches,
} from '../src/pages/ui-lab/ui/menu-overlay-model.ts';

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

  it('returns a local result only for enabled menu actions', () => {
    const evidence = researchActions.find((action) => action.id === 'evidence');
    const archived = researchActions.find((action) => action.id === 'archived');

    assert.ok(evidence);
    assert.ok(archived);
    assert.equal(resolveResearchActionResult(evidence), '근거 보기 실행됨');
    assert.equal(resolveResearchActionResult(archived), null);
    assert.deepEqual(
      menuOverlayVariants.map((variant) => variant.id),
      ['hairline', 'soft-surface', 'compact-ledger'],
    );
  });
});
