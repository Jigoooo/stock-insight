import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectInitialRelationRoot } from '../src/pages/research-workspace/model/relation-root.ts';

describe('initial relation root selection', () => {
  it('prefers the selected record entity', () => {
    assert.equal(
      selectInitialRelationRoot(['US:AAPL'], [{ topEntityKeys: ['US:NVDA'] }]),
      'US:AAPL',
    );
  });

  it('falls back to the first theme representative when the record has no entity', () => {
    assert.equal(
      selectInitialRelationRoot(
        [],
        [{ topEntityKeys: [] }, { topEntityKeys: ['US:NVDA', 'KR:005930'] }],
      ),
      'US:NVDA',
    );
  });

  it('returns null only when neither source has a graph root', () => {
    assert.equal(selectInitialRelationRoot([], [{ topEntityKeys: [] }]), null);
  });
});
