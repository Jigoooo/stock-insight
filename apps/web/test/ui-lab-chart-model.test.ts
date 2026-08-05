import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  chartPreviewStates,
  chartRoles,
  chartVariants,
  sliceBarsByRange,
  validateChartBars,
} from '../src/pages/ui-lab/ui/chart-catalog-model.ts';
import { chartFixture, createChartFixture } from '../src/pages/ui-lab/ui/chart-fixtures.ts';

describe('UI Lab chart model', () => {
  it('defines three roles with three independent variants and a deterministic 180-bar fixture', () => {
    assert.deepEqual(
      chartRoles.map(({ id }) => id),
      ['market-tape', 'evidence-band', 'candle-ledger'],
    );
    assert.deepEqual(
      chartRoles.map(({ id }) => chartVariants[id].length),
      [3, 3, 3],
    );
    assert.equal(chartFixture.bars.length, 180);
    assert.deepEqual(createChartFixture(), chartFixture);
    assert.equal(chartFixture.bars.filter(({ volume }) => volume === null).length, 3);
    assert.deepEqual(chartPreviewStates, [
      'ready',
      'loading',
      'stale',
      'partial',
      'empty',
      'error',
      'unavailable',
    ]);
  });

  it('slices ranges and rejects invalid OHLC, duplicate timestamps, and broken evidence bounds', () => {
    assert.equal(sliceBarsByRange(chartFixture.bars, '1M').length, 22);
    assert.equal(sliceBarsByRange(chartFixture.bars, '3M').length, 66);
    assert.equal(sliceBarsByRange(chartFixture.bars, '6M').length, 126);
    assert.equal(sliceBarsByRange(chartFixture.bars, '1Y').length, 180);
    assert.deepEqual(validateChartBars(chartFixture.bars), { valid: true, issues: [] });
    assert.equal(validateChartBars([...chartFixture.bars, chartFixture.bars[0]!]).valid, false);
    assert.ok(chartFixture.evidence.every(({ barIndex }) => chartFixture.bars[barIndex]));
    assert.ok(
      chartFixture.bands.every(
        ({ startIndex, endIndex }) =>
          startIndex >= 0 && endIndex < chartFixture.bars.length && startIndex < endIndex,
      ),
    );
  });
});
