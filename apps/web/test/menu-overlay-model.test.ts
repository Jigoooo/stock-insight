import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  menuOverlayVariants,
  researchActions,
  resolveResearchActionResult,
} from '../src/pages/ui-lab/ui/menu-overlay-model.ts';

describe('Menu & Overlay model', () => {
  it('returns a local result only for enabled menu actions', () => {
    const evidence = researchActions.find((action) => action.id === 'evidence');
    const archived = researchActions.find((action) => action.id === 'archived');

    assert.ok(evidence);
    assert.ok(archived);
    assert.equal(resolveResearchActionResult(evidence), '근거 보기 실행됨');
    assert.equal(resolveResearchActionResult(archived), null);
    assert.deepEqual(
      menuOverlayVariants.map((variant) => variant.id),
      ['hairline', 'soft-surface'],
    );
  });
});
