import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getDataGridVirtualRange,
  nextDataGridSort,
} from '../src/shared/ui/data-grid/data-grid-model.ts';

describe('public Data & Feedback UI', () => {
  it('cycles sortable DataGrid state and keeps the virtual window bounded', () => {
    assert.deepEqual(nextDataGridSort({ key: 'ticker', direction: 'none' }, 'score'), {
      key: 'score',
      direction: 'asc',
    });
    assert.deepEqual(nextDataGridSort({ key: 'score', direction: 'asc' }, 'score'), {
      key: 'score',
      direction: 'desc',
    });
    assert.deepEqual(nextDataGridSort({ key: 'score', direction: 'desc' }, 'score'), {
      key: 'score',
      direction: 'none',
    });
    assert.deepEqual(
      getDataGridVirtualRange({ scrollTop: 43_000, viewportHeight: 320, rowCount: 1_000 }),
      { start: 971, end: 991, offsetTop: 42_724, totalHeight: 44_000 },
    );
  });
});
