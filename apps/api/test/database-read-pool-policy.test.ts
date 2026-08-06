import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import pg from 'pg';

describe('database read pool policy', () => {
  it('retains two warm read connections and primes both before serving requests', async () => {
    const OriginalPool = pg.Pool;
    let capturedOptions: Record<string, unknown> | undefined;
    let connectCount = 0;
    let idleErrorHandler: ((error: Error) => void) | undefined;
    let releaseCount = 0;

    class CapturingPool {
      constructor(options: Record<string, unknown>) {
        capturedOptions = options;
      }

      on(event: string, listener: (error: Error) => void) {
        if (event === 'error') idleErrorHandler = listener;
        return this;
      }

      async connect() {
        connectCount += 1;
        return {
          release() {
            releaseCount += 1;
          },
        };
      }
    }

    Object.defineProperty(pg, 'Pool', {
      configurable: true,
      value: CapturingPool,
      writable: true,
    });
    after(() => {
      Object.defineProperty(pg, 'Pool', {
        configurable: true,
        value: OriginalPool,
        writable: true,
      });
    });

    const { createReadOnlyDatabaseClient, primeReadOnlyDatabasePool } =
      await import('../src/server/db-client.ts');
    const env = {
      databaseUrl: 'postgres://reader@localhost:5432/pool-policy-test',
      databaseWriteUrl: undefined,
      userId: undefined,
    } as never;
    const client = createReadOnlyDatabaseClient(env);

    assert.equal(client.kind, 'configured');
    assert.equal(capturedOptions?.min, 2);
    assert.equal(capturedOptions?.keepAlive, true);
    assert.equal(capturedOptions?.keepAliveInitialDelayMillis, 10_000);
    assert.equal(typeof idleErrorHandler, 'function');
    assert.equal(connectCount, 0);

    await primeReadOnlyDatabasePool(env);
    assert.equal(connectCount, 2);
    assert.equal(releaseCount, 2);
  });
});
