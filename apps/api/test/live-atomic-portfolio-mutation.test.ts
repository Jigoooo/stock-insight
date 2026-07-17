import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg, { type QueryResultRow } from 'pg';

import { createPostgresManualPortfolioWriteModel } from '../src/me/manual-input.ts';
import { getManualPortfolioBootstrapAfterMutation } from '../src/me/manual-service.ts';
import { createPostgresMeBootstrapReadModel } from '../src/me/read-model.ts';
import { claimMutation, completeMutation } from '../src/mutations/idempotency.ts';
import {
  withWriteTransaction,
  type WriteTransactionExecutor,
} from '../src/server/write-transaction.ts';

const databaseUrl = process.env.STOCK_INSIGHT_LIVE_WRITE_DB_URL;
const userId = process.env.STOCK_INSIGHT_LIVE_USER_ID;
const skipReason =
  databaseUrl && userId
    ? false
    : 'STOCK_INSIGHT_LIVE_WRITE_DB_URL and STOCK_INSIGHT_LIVE_USER_ID are required';
const rollbackError = 'intentional atomic rollback';
const idempotencyKey = '44444444-4444-4444-8444-444444444444';

describe('live atomic portfolio mutation', () => {
  it(
    'rolls back claim, portfolio write, readback, and completion together on failure',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      assert.ok(userId);
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      const provider = {
        async connect() {
          const client = await pool.connect();
          return {
            async queryRows<TRow extends Record<string, unknown> = Record<string, unknown>>(
              sql: string,
              params: readonly unknown[] = [],
            ): Promise<TRow[]> {
              const result = await client.query<TRow & QueryResultRow>(sql, [...params]);
              return result.rows;
            },
            release() {
              client.release();
            },
          };
        },
      };
      const options = { statementTimeoutMs: 5_000, lockTimeoutMs: 1_000, sessionUserId: userId };
      const userScope = { userId };

      try {
        const before = await withWriteTransaction(
          provider,
          (executor) =>
            executor.queryRows<{
              entity_key: string;
              market: 'KR' | 'US';
              ticker: string;
              display_name: string | null;
            }>(
              `SELECT entity_key, market, ticker, display_name
               FROM public.user_watchlist
               WHERE user_id = $1::uuid AND active = true
               ORDER BY entity_key
               LIMIT 1`,
              [userId],
            ),
          options,
        );
        assert.equal(before.length, 1);
        const row = before[0]!;
        const sentinelDisplayName = `${row.display_name ?? row.ticker} atomic-rollback-test`;

        await assert.rejects(
          withWriteTransaction(
            provider,
            async (executor: WriteTransactionExecutor) => {
              const claim = await claimMutation(executor, {
                userScope,
                idempotencyKey,
                operation: 'watchlist.upsert',
                payload: {
                  market: row.market,
                  ticker: row.ticker,
                  displayName: sentinelDisplayName,
                },
              });
              assert.equal(claim.kind, 'execute');
              if (claim.kind !== 'execute') return;

              const writeModel = createPostgresManualPortfolioWriteModel(
                (sql, params) => executor.queryRows(sql, params),
                userScope,
              );
              const readModel = createPostgresMeBootstrapReadModel(
                (sql, params) => executor.queryRows(sql, params) as never,
                userScope,
              );
              const response = await getManualPortfolioBootstrapAfterMutation({
                mutation: () =>
                  writeModel.upsertWatchlist({
                    market: row.market,
                    ticker: row.ticker,
                    displayName: sentinelDisplayName,
                  }),
                readModel,
                failureMode: 'throw',
              });
              await completeMutation(executor, claim, response);
              throw new Error(rollbackError);
            },
            options,
          ),
          new RegExp(rollbackError),
        );

        const after = await withWriteTransaction(
          provider,
          async (executor) => {
            const watchlist = await executor.queryRows<{ display_name: string | null }>(
              'SELECT display_name FROM public.user_watchlist WHERE user_id = $1::uuid AND entity_key = $2',
              [userId, row.entity_key],
            );
            const claims = await executor.queryRows<{ count: string }>(
              'SELECT count(*) FROM public.app_mutation_idempotency WHERE user_id = $1::uuid AND idempotency_key = $2::uuid',
              [userId, idempotencyKey],
            );
            return {
              displayName: watchlist[0]?.display_name ?? null,
              claimCount: Number(claims[0]?.count ?? 0),
            };
          },
          options,
        );
        assert.equal(after.claimCount, 0);
        assert.equal(after.displayName, row.display_name);
      } finally {
        await pool.end();
      }
    },
  );
});
