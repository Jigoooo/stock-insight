import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const controller = read('../../api-server/src/read/product.controller.ts');
const researchProductController = read('../../api-server/src/read/research-product.controller.ts');
const textRoutes = [
  '../src/routes/api/v1/features.ts',
  '../src/routes/api/v1/impact.ts',
  '../src/routes/api/v1/confirmation.ts',
  '../src/routes/api/v1/personal/feed.ts',
  '../src/routes/api/v1/reports/latest.ts',
].map(read);

// Before the P2 brain split both sides normalized query params, and this test
// pinned the two implementations together so they could not drift. The split
// removes the duplication entirely: normalization now exists ONLY in the brain
// and the web routes are pure proxies. The invariant therefore inverts — the web
// side must NOT re-implement normalization, because a second implementation is
// exactly the drift this test was protecting against.
test('query normalization lives solely in the brain controllers', () => {
  assert.match(controller, /normalizeProductTextParam/);
  assert.match(controller, /normalizeProductLimitParam/);
  // The product controller normalizes through the shared helpers only: neither a
  // local optionalLimit nor a raw firstParam shortcut may creep back in, since
  // either would reintroduce a second normalization implementation.
  assert.doesNotMatch(controller, /optionalLimit|firstParam/);
  // personal/feed moved to the research-product controller during the split.
  assert.doesNotMatch(controller, /@Get\('personal\/feed'\)/);
  assert.match(researchProductController, /@Get\('personal\/feed'\)/);
  assert.match(researchProductController, /normalizeProductTextParam/);
});

test('web product routes are authenticated proxies with no local normalization', () => {
  for (const route of textRoutes) {
    assert.match(route, /authRequestMiddleware/);
    assert.match(route, /brainProxyGet/);
    assert.doesNotMatch(route, /normalizeProduct(Text|Limit)Param/);
    // No direct data access may survive in the BFF.
    assert.doesNotMatch(route, /@stock-insight\/api'/);
    assert.doesNotMatch(route, /Number\(url\.searchParams/);
  }
});
