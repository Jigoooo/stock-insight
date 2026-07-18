import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const controller = read('../../api-server/src/read/product.controller.ts');
const textRoutes = [
  '../src/routes/api/v1/features.ts',
  '../src/routes/api/v1/impact.ts',
  '../src/routes/api/v1/confirmation.ts',
  '../src/routes/api/v1/personal/feed.ts',
  '../src/routes/api/v1/reports/latest.ts',
].map(read);
const limitRoutes = [textRoutes[0], textRoutes[1], textRoutes[2], textRoutes[4]];

test('Nest and Web product adapters share deterministic query normalization', () => {
  assert.match(controller, /normalizeProductTextParam/);
  assert.match(controller, /normalizeProductLimitParam/);
  assert.doesNotMatch(controller, /optionalLimit|firstParam/);
  assert.doesNotMatch(controller, /@Get\('personal\/feed'\)/);
  assert.match(textRoutes[3], /authRequestMiddleware/);

  for (const route of textRoutes) {
    assert.match(route, /normalizeProductTextParam/);
    assert.match(route, /searchParams\.getAll\(/);
  }
  for (const route of limitRoutes) {
    assert.match(route, /normalizeProductLimitParam/);
    assert.doesNotMatch(route, /Number\(url\.searchParams/);
  }
});
