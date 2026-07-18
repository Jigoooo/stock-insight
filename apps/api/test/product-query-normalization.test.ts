import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeProductLimitParam,
  normalizeProductTextParam,
} from '../src/product/read-model.ts';

test('product query text normalization is trim-first and first-value deterministic', () => {
  assert.equal(normalizeProductTextParam(' US:NVDA '), 'US:NVDA');
  assert.equal(normalizeProductTextParam([' first ', 'second']), 'first');
  assert.equal(normalizeProductTextParam('   '), undefined);
  assert.equal(normalizeProductTextParam([]), undefined);
  assert.equal(normalizeProductTextParam(42), undefined);
});

test('product limit normalization treats invalid and non-positive values as omitted', () => {
  assert.equal(normalizeProductLimitParam('25'), 25);
  assert.equal(normalizeProductLimitParam(['7', '9']), 7);
  for (const value of ['', '0', '-1', '1.5', '1e2', 'NaN', [], undefined]) {
    assert.equal(normalizeProductLimitParam(value), undefined, String(value));
  }
});
