import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { withReadSnapshot, type ReadSnapshotConnection } from '../src/server/read-snapshot.ts';

describe('withReadSnapshot', () => {
  it('runs every query on one repeatable-read read-only transaction', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    let releaseCount = 0;
    const connection: ReadSnapshotConnection = {
      async queryRows<TRow extends Record<string, unknown> = Record<string, unknown>>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<TRow[]> {
        calls.push({ sql, params });
        if (sql === 'SELECT first') return [{ value: 'first' }] as TRow[];
        if (sql === 'SELECT second') return [{ value: 'second' }] as TRow[];
        return [];
      },
      release() {
        releaseCount += 1;
      },
    };

    const result = await withReadSnapshot(
      { connect: async () => connection },
      async (snapshot) => {
        const first = await snapshot.queryRows<{ value: string }>('SELECT first');
        const second = await snapshot.queryRows<{ value: string }>('SELECT second');
        return [first[0]?.value, second[0]?.value];
      },
      {
        statementTimeoutMs: 4_000,
        lockTimeoutMs: 750,
        sessionUserId: '11111111-1111-4111-8111-111111111111',
      },
    );

    assert.deepEqual(result, ['first', 'second']);
    assert.deepEqual(
      calls.map(({ sql }) => sql),
      [
        'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
        "SELECT set_config('stock_insight.user_id', $1, true)",
        "SELECT set_config('statement_timeout', $1, true)",
        "SELECT set_config('lock_timeout', $1, true)",
        'SELECT first',
        'SELECT second',
        'COMMIT',
      ],
    );
    assert.deepEqual(calls[1]?.params, ['11111111-1111-4111-8111-111111111111']);
    assert.deepEqual(calls[2]?.params, ['4000ms']);
    assert.deepEqual(calls[3]?.params, ['750ms']);
    assert.equal(releaseCount, 1);
  });

  it('rolls back and releases the connection when work fails', async () => {
    const calls: string[] = [];
    let releaseCount = 0;
    const connection: ReadSnapshotConnection = {
      async queryRows(sql) {
        calls.push(sql);
        return [];
      },
      release() {
        releaseCount += 1;
      },
    };

    await assert.rejects(
      withReadSnapshot(
        { connect: async () => connection },
        async (snapshot) => {
          await snapshot.queryRows('SELECT broken');
          throw new Error('read failed');
        },
        { statementTimeoutMs: 4_000, lockTimeoutMs: 750 },
      ),
      /read failed/,
    );

    assert.equal(calls.includes('COMMIT'), false);
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.equal(releaseCount, 1);
  });

  it('rejects invalid timeout configuration before opening a connection', async () => {
    let connectCount = 0;

    await assert.rejects(
      withReadSnapshot(
        {
          async connect() {
            connectCount += 1;
            throw new Error('must not connect');
          },
        },
        async () => undefined,
        { statementTimeoutMs: 0, lockTimeoutMs: 750 },
      ),
      /statementTimeoutMs must be a positive integer/,
    );
    assert.equal(connectCount, 0);
  });
});
