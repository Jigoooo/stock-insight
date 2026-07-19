import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { getNextEnabledTabIndex } from '../src/shared/ui/primitives/segmented-tabs-controller.ts';

const segmentedTabsUrl = new URL('../src/shared/ui/primitives/segmented-tabs.tsx', import.meta.url);
const primitiveIndexUrl = new URL('../src/shared/ui/primitives/index.ts', import.meta.url);

describe('segmented tab roving focus', () => {
  const disabled = [false, true, false, false];

  it('wraps ArrowRight and ArrowLeft while skipping disabled tabs', () => {
    assert.equal(getNextEnabledTabIndex({ currentIndex: 0, disabled, key: 'ArrowRight' }), 2);
    assert.equal(getNextEnabledTabIndex({ currentIndex: 2, disabled, key: 'ArrowLeft' }), 0);
    assert.equal(getNextEnabledTabIndex({ currentIndex: 3, disabled, key: 'ArrowRight' }), 0);
    assert.equal(getNextEnabledTabIndex({ currentIndex: 0, disabled, key: 'ArrowLeft' }), 3);
  });

  it('moves Home and End to the first and last enabled tabs', () => {
    assert.equal(getNextEnabledTabIndex({ currentIndex: 2, disabled, key: 'Home' }), 0);
    assert.equal(getNextEnabledTabIndex({ currentIndex: 0, disabled, key: 'End' }), 3);
  });

  it('keeps focus stable for unrelated keys or when every tab is disabled', () => {
    assert.equal(getNextEnabledTabIndex({ currentIndex: 2, disabled, key: 'Enter' }), 2);
    assert.equal(
      getNextEnabledTabIndex({ currentIndex: 1, disabled: [true, true], key: 'ArrowRight' }),
      1,
    );
  });
});

describe('SegmentedTabs APG structure', () => {
  it('owns tablist semantics, roving tabindex, selection, and keyboard focus', async () => {
    const [source, primitiveIndex] = await Promise.all([
      readFile(segmentedTabsUrl, 'utf8'),
      readFile(primitiveIndexUrl, 'utf8'),
    ]);

    assert.match(source, /role="tablist"/);
    assert.match(source, /role="tab"/);
    assert.match(source, /aria-selected=\{selected\}/);
    assert.match(source, /tabIndex=\{selected \? 0 : -1\}/);
    assert.match(source, /aria-controls=\{item\.controls\}/);
    assert.match(source, /getNextEnabledTabIndex/);
    assert.match(source, /\.focus\(\)/);
    assert.match(source, /onValueChange\(item\.value\)/);
    assert.match(primitiveIndex, /export \{ SegmentedTabs \} from '\.\/segmented-tabs'/);
  });
});
