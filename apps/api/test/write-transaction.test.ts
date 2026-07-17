import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  withWriteTransaction,
  type WriteTransactionConnection,
} from '../src/server/write-transaction.ts';

const options = {
  statementTimeoutMs: 5_000,
  lockTimeoutMs: 1_000,
  sessionUserId: '11111111-1111-4111-8111-111111111111',
} as const;

describe('withWriteTransaction', () => {
  it('binds user scope and commits all work on one connection', async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
    let releases = 0;
    const connection: WriteTransactionConnection = {
      async queryRows<TRow extends Record<string, unknown>>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<TRow[]> {
        calls.push({ sql, params });
        return [];
      },
      release() {
        releases += 1;
      },
    };

    const result = await withWriteTransaction(
      { connect: async () => connection },
      async (executor) => {
        await executor.queryRows('INSERT claim');
        await executor.queryRows('UPDATE portfolio');
        await executor.queryRows('UPDATE complete');
        return 'done';
      },
      options,
    );

    assert.equal(result, 'done');
    assert.deepEqual(
      calls.map((call) => call.sql),
      [
        'BEGIN',
        "SELECT set_config('stock_insight.user_id', $1, true)",
        "SELECT set_config('statement_timeout', $1, true)",
        "SELECT set_config('lock_timeout', $1, true)",
        'INSERT claim',
        'UPDATE portfolio',
        'UPDATE complete',
        'COMMIT',
      ],
    );
    assert.equal(releases, 1);
  });

  it('rolls back claim and mutation together when work fails', async () => {
    const calls: string[] = [];
    const connection: WriteTransactionConnection = {
      async queryRows<TRow extends Record<string, unknown>>(sql: string): Promise<TRow[]> {
        calls.push(sql);
        return [];
      },
      release() {},
    };

    await assert.rejects(
      withWriteTransaction(
        { connect: async () => connection },
        async (executor) => {
          await executor.queryRows('INSERT claim');
          throw new Error('mutation failed');
        },
        options,
      ),
      /mutation failed/,
    );
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.doesNotMatch(calls.join('\n'), /COMMIT/);
  });
});
