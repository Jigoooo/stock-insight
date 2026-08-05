import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

type RangeEchoGuard = {
  markLocal: (rangeKey: string) => void;
  shouldApplyExternal: (rangeKey: string) => boolean;
};

describe('Lightweight Evidence range synchronization', () => {
  it('ignores only the source chart local echo while accepting sibling ranges', async () => {
    const module = await import('../src/shared/ui/chart/internal/lightweight-range-sync.ts').catch(
      () => ({}),
    );
    const createRangeEchoGuard = Reflect.get(module, 'createRangeEchoGuard') as
      | (() => RangeEchoGuard)
      | undefined;

    assert.equal(typeof createRangeEchoGuard, 'function');
    const guard = createRangeEchoGuard();
    const localRange = '2026-01-02:2026-04-09';

    guard.markLocal(localRange);
    assert.equal(guard.shouldApplyExternal(localRange), false);
    assert.equal(guard.shouldApplyExternal(localRange), true);

    guard.markLocal(localRange);
    assert.equal(guard.shouldApplyExternal('2026-02-01:2026-05-01'), true);
  });
});
