import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';

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

  it('suppresses a delayed sibling echo after applying an external range', async () => {
    const module = await import('../src/shared/ui/chart/internal/lightweight-range-sync.ts');
    const createRangeSyncCoordinator = Reflect.get(module, 'createRangeSyncCoordinator') as
      | (() => {
          acceptChartRange: (rangeKey: string) => boolean;
          acceptExternalRange: (rangeKey: string) => boolean;
        })
      | undefined;

    assert.equal(typeof createRangeSyncCoordinator, 'function');
    const coordinator = createRangeSyncCoordinator();
    const range = '2026-02-01:2026-05-01';

    assert.equal(coordinator.acceptExternalRange(range), true);
    assert.equal(coordinator.acceptChartRange(range), false);
    assert.equal(coordinator.acceptChartRange('2026-02-02:2026-05-02'), true);
  });

  it('coalesces continuous chart range events into the final range', async () => {
    const module = await import('../src/shared/ui/chart/internal/lightweight-range-sync.ts');
    const createTrailingEmitter = Reflect.get(module, 'createTrailingEmitter') as
      | (<T>(
          delayMs: number,
          emit: (value: T) => void,
        ) => {
          cancel: () => void;
          schedule: (value: T) => void;
        })
      | undefined;

    assert.equal(typeof createTrailingEmitter, 'function');
    const emitted: string[] = [];
    const emitter = createTrailingEmitter(5, (value: string) => emitted.push(value));

    emitter.schedule('range-1');
    emitter.schedule('range-2');
    emitter.schedule('range-3');
    await wait(25);

    assert.deepEqual(emitted, ['range-3']);
    emitter.cancel();
  });
});
