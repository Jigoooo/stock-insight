import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  createDataRows,
  dataFeedbackTabs,
  dataFeedbackVariants,
  getVirtualRange,
  sortDataRows,
  updateDataCell,
} from '../src/pages/ui-lab/ui/data-feedback-model.ts';

describe('Data & Feedback model', () => {
  it('keeps eight independent A/B/C comparisons and connects them to the active mockup tab', async () => {
    assert.deepEqual(
      dataFeedbackTabs.map(({ id }) => id),
      ['table', 'data-grid', 'progress', 'spinner', 'skeleton', 'empty', 'error', 'loading'],
    );
    assert.deepEqual(
      dataFeedbackTabs.map(({ id }) => dataFeedbackVariants[id].length),
      [3, 3, 3, 3, 3, 3, 3, 3],
    );

    const rows = createDataRows(1_000);

    assert.equal(rows.length, 1_000);
    assert.deepEqual(createDataRows(3), rows.slice(0, 3));

    const pageSource = await readFile(
      new URL('../src/pages/ui-lab/ui/ui-lab-page.tsx', import.meta.url),
      'utf8',
    );

    assert.match(pageSource, /import \{ DataFeedbackCatalog \}/);
    assert.match(pageSource, /<TabsContent value="in-progress">[\s\S]*?<DataFeedbackCatalog \/>/);
    assert.match(pageSource, /<TabsContent value="completed">[\s\S]*?<IdentityContentCatalog \/>/);
  });

  it('sorts, edits, and virtualizes without mutating source rows', () => {
    const rows = createDataRows(1_000);
    const sorted = sortDataRows(rows, { key: 'score', direction: 'desc' });

    assert.ok(sorted[0]!.score >= sorted[1]!.score);
    assert.deepEqual(rows[0], createDataRows(1)[0]);

    const edited = updateDataCell(rows, rows[20]!.id, 'note', '다시 확인');

    assert.equal(edited[20]!.note, '다시 확인');
    assert.notEqual(edited, rows);
    assert.deepEqual(getVirtualRange({ scrollTop: 8_800, viewportHeight: 320, rowCount: 1_000 }), {
      start: 194,
      end: 214,
      offsetTop: 8_536,
      totalHeight: 44_000,
    });
  });
});
