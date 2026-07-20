import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  WorkspaceViewCache,
  type WorkspaceViewCacheKey,
} from '../src/pages/research-workspace/model/workspace-view-cache.ts';

const key = (
  view: WorkspaceViewCacheKey['view'],
  scopeVersion = 'user-a:v1',
): WorkspaceViewCacheKey => ({
  cursor: null,
  lane: view === 'today' ? 'must_know' : null,
  scopeVersion,
  view,
});

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

describe('authenticated workspace view cache', () => {
  it('deduplicates the same scoped view request', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    const result = deferred<string>();
    let calls = 0;
    const loader = () => {
      calls += 1;
      return result.promise;
    };

    const first = cache.load(key('today'), loader);
    const second = cache.load(key('today'), loader);
    result.resolve('today-data');

    assert.equal(first, second);
    assert.equal(await first, 'today-data');
    assert.equal(calls, 1);
    assert.equal(await cache.load(key('today'), loader), 'today-data');
    assert.equal(calls, 1);
  });

  it('runs no more than two distinct requests concurrently', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    let active = 0;
    let maxActive = 0;
    const loadAt = (index: number) => () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return gates[index]!.promise.finally(() => {
        active -= 1;
      });
    };

    const requests = [
      cache.load(key('radar'), loadAt(0)),
      cache.load(key('stocks'), loadAt(1)),
      cache.load(key('themes'), loadAt(2)),
    ];
    await Promise.resolve();
    assert.equal(active, 2);

    gates[0]!.resolve('radar');
    await requests[0];
    await Promise.resolve();
    assert.equal(active, 2);
    assert.equal(maxActive, 2);

    gates[1]!.resolve('stocks');
    gates[2]!.resolve('themes');
    assert.deepEqual(await Promise.all(requests), ['radar', 'stocks', 'themes']);
  });

  it('promotes a queued prefetch when an active route joins the same request', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1', 1);
    const stocksGate = deferred<string>();
    const themesGate = deferred<string>();
    const starts: string[] = [];
    const prefetch = (
      view: WorkspaceViewCacheKey['view'],
      gate: ReturnType<typeof deferred<string>>,
    ) =>
      cache.prefetch(
        key(view),
        () => {
          starts.push(view);
          return gate.promise;
        },
        { priority: 'intent' },
      );

    const radar = prefetch('radar', deferred<string>());
    const stocks = prefetch('stocks', stocksGate);
    const themes = prefetch('themes', themesGate);
    const activeThemes = cache.load(key('themes'), () =>
      Promise.reject(new Error('dedupe failed')),
    );
    assert.deepEqual(starts, ['radar', 'themes']);
    assert.equal(await radar, false);

    themesGate.resolve('themes');
    assert.equal(await activeThemes, 'themes');
    await Promise.resolve();
    assert.deepEqual(starts, ['radar', 'themes', 'stocks']);

    stocksGate.resolve('stocks');
    assert.equal(await themes, true);
    assert.equal(await stocks, true);
  });

  it('preempts a running speculative prefetch when an active route needs a slot', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    const prefetchSignals: AbortSignal[] = [];
    const neverSettles = ({ signal }: { signal: AbortSignal }) => {
      prefetchSignals.push(signal);
      return new Promise<string>(() => undefined);
    };

    const radar = cache.prefetch(key('radar'), neverSettles, { priority: 'intent' });
    const stocks = cache.prefetch(key('stocks'), neverSettles, { priority: 'intent' });
    assert.equal(prefetchSignals.length, 2);

    const active = cache.load(key('themes'), () => Promise.resolve('active-themes'));

    assert.equal(await active, 'active-themes');
    assert.equal(prefetchSignals.filter((signal) => signal.aborted).length, 1);
    assert.equal(await Promise.race([radar, stocks]), false);
  });

  it('preempts a running prefetch when active navigation joins a queued prefetch', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    const runningSignals: AbortSignal[] = [];
    const neverSettles = ({ signal }: { signal: AbortSignal }) => {
      runningSignals.push(signal);
      return new Promise<string>(() => undefined);
    };
    const themesGate = deferred<string>();
    let themesStarted = false;

    const radar = cache.prefetch(key('radar'), neverSettles, { priority: 'intent' });
    const stocks = cache.prefetch(key('stocks'), neverSettles, { priority: 'intent' });
    const themes = cache.prefetch(
      key('themes'),
      () => {
        themesStarted = true;
        return themesGate.promise;
      },
      { priority: 'intent' },
    );
    const activeThemes = cache.load(key('themes'), () =>
      Promise.reject(new Error('queued prefetch was not reused')),
    );

    assert.equal(themesStarted, true);
    assert.equal(runningSignals.filter((signal) => signal.aborted).length, 1);
    themesGate.resolve('themes');
    assert.equal(await activeThemes, 'themes');
    assert.equal(await themes, true);
    assert.equal(await Promise.race([radar, stocks]), false);
  });

  it('reclassifies a running prefetch after its last active waiter aborts', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1', 1);
    let radarSignal: AbortSignal | undefined;
    const radar = cache.prefetch(
      key('radar'),
      ({ signal }) => {
        radarSignal = signal;
        return new Promise<string>(() => undefined);
      },
      { priority: 'intent' },
    );
    const routeAbort = new AbortController();
    const activeRadar = cache.load(key('radar'), () => Promise.resolve('unexpected'), {
      signal: routeAbort.signal,
    });

    routeAbort.abort();
    const activeStocks = cache.load(key('stocks'), () => Promise.resolve('stocks'));

    await assert.rejects(activeRadar, /abort/i);
    assert.equal(await activeStocks, 'stocks');
    assert.equal(radarSignal?.aborted, true);
    assert.equal(await radar, false);
  });

  it('allows only one idle candidate while intent prefetch still uses the bounded pool', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    const idleGate = deferred<string>();
    const intentGate = deferred<string>();
    let skippedIdleCalls = 0;

    const firstIdle = cache.prefetch(key('radar'), () => idleGate.promise, { priority: 'idle' });
    const skippedIdle = cache.prefetch(
      key('themes'),
      () => {
        skippedIdleCalls += 1;
        return Promise.resolve('themes');
      },
      { priority: 'idle' },
    );
    const intent = cache.prefetch(key('stocks'), () => intentGate.promise, { priority: 'intent' });

    assert.equal(await skippedIdle, false);
    assert.equal(skippedIdleCalls, 0);
    idleGate.resolve('radar');
    intentGate.resolve('stocks');
    assert.equal(await firstIdle, true);
    assert.equal(await intent, true);
  });

  it('aborts and rejects stale scope work without caching a late result', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    const staleGate = deferred<string>();
    let staleSignal: AbortSignal | undefined;
    const stale = cache.load(key('status'), ({ signal }) => {
      staleSignal = signal;
      return staleGate.promise;
    });

    cache.setScopeVersion('user-b:v1');
    assert.equal(staleSignal?.aborted, true);
    await assert.rejects(stale, /scope|abort/i);
    staleGate.resolve('stale-user-a-data');

    let freshCalls = 0;
    const fresh = await cache.load(key('status', 'user-b:v1'), () => {
      freshCalls += 1;
      return Promise.resolve('fresh-user-b-data');
    });
    assert.equal(fresh, 'fresh-user-b-data');
    assert.equal(freshCalls, 1);
  });

  it('forwards route abort signals into the active view request', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    const routeAbort = new AbortController();
    const request = cache.load(
      key('radar'),
      ({ signal }) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('loader observed abort')), {
            once: true,
          });
        }),
      { signal: routeAbort.signal },
    );

    routeAbort.abort();
    await assert.rejects(request, /abort/i);
  });

  it('aborts a route caller that joined an existing prefetch without cancelling the shared work', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    const gate = deferred<string>();
    const prefetched = cache.prefetch(key('radar'), () => gate.promise, { priority: 'intent' });
    const routeAbort = new AbortController();
    const active = cache.load(key('radar'), () => Promise.resolve('unexpected'), {
      signal: routeAbort.signal,
    });

    routeAbort.abort();
    await assert.rejects(active, /abort/i);
    gate.resolve('prefetched-radar');
    assert.equal(await prefetched, true);
  });

  it('clears ready and pending user data without changing the authenticated scope', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    const pendingGate = deferred<string>();
    await cache.load(key('today'), () => Promise.resolve('cached-today'));
    const pending = cache.load(key('radar'), () => pendingGate.promise);

    cache.clear();
    await assert.rejects(pending, /clear|abort/i);
    let freshCalls = 0;
    const fresh = await cache.load(key('today'), () => {
      freshCalls += 1;
      return Promise.resolve('fresh-today');
    });

    assert.equal(fresh, 'fresh-today');
    assert.equal(freshCalls, 1);
    pendingGate.resolve('late-radar');
  });

  it('does not turn a background prefetch failure into cached empty data', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    const prefetched = await cache.prefetch(key('history'), () =>
      Promise.reject(new Error('offline')),
    );
    let actualCalls = 0;

    assert.equal(prefetched, false);
    await assert.rejects(
      cache.load(key('history'), () => {
        actualCalls += 1;
        return Promise.reject(new Error('history unavailable'));
      }),
      /history unavailable/,
    );
    assert.equal(actualCalls, 1);
  });

  it('keeps an explicit active payload separate from prefetched ready entries', async () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    await cache.prefetch(key('radar'), () => Promise.resolve('prefetched-radar'), {
      priority: 'intent',
    });

    assert.equal(cache.getActive(), undefined);
    const activeToken = cache.beginActiveLoad();
    assert.equal(cache.commitActive('active-today', activeToken), true);
    assert.equal(cache.getActive(), 'active-today');

    cache.clear();
    assert.equal(cache.getActive(), undefined);
  });

  it('seeds the hydrated payload without overwriting a committed active view', () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    cache.seedActive('ssr-today');
    cache.seedActive('late-ssr-value');
    assert.equal(cache.getActive(), 'ssr-today');

    const token = cache.beginActiveLoad();
    assert.equal(cache.commitActive('client-radar', token), true);
    cache.seedActive('ssr-today');
    assert.equal(cache.getActive(), 'client-radar');
  });

  it('atomically adopts the hydrated user scope without clearing its SSR payload later', () => {
    const cache = new WorkspaceViewCache<string>('anonymous');
    cache.hydrateActive('user-a:v1', 'ssr-today');
    assert.equal(cache.getActive(), 'ssr-today');

    cache.setScopeVersion('user-a:v1');
    assert.equal(cache.getActive(), 'ssr-today');
    cache.hydrateActive('user-a:v1', 'late-ssr-value');
    assert.equal(cache.getActive(), 'ssr-today');
  });

  it('lets only the latest active route token commit a fallback payload', () => {
    const cache = new WorkspaceViewCache<string>('user-a:v1');
    const staleToken = cache.beginActiveLoad();
    const latestToken = cache.beginActiveLoad();

    assert.equal(cache.commitActive('stale-radar', staleToken), false);
    assert.equal(cache.getActive(), undefined);
    assert.equal(cache.commitActive('latest-history', latestToken), true);
    assert.equal(cache.getActive(), 'latest-history');

    cache.clear();
    assert.equal(cache.commitActive('late-history', latestToken), false);
    assert.equal(cache.getActive(), undefined);
  });
});
