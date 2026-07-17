import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  claimMutation,
  completeMutation,
  hashMutationRequest,
  type MutationIdempotencyExecutor,
} from '../src/mutations/idempotency.ts';

const userScope = { userId: 'b3ca4de6-905c-484e-bfd6-a927c801d903' } as const;
const key = '11111111-1111-4111-8111-111111111111';

describe('durable mutation idempotency', () => {
  it('hashes semantically identical object payloads identically', () => {
    assert.equal(
      hashMutationRequest('watchlist.upsert', { entityKey: 'US:NVDA', active: true }),
      hashMutationRequest('watchlist.upsert', { active: true, entityKey: 'US:NVDA' }),
    );
  });

  it('claims a new UUID key exactly once and completes it with a replay response', async () => {
    const calls: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const executor: MutationIdempotencyExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(sql: string, parameters = []) => {
        calls.push({ sql, parameters });
        if (sql.includes('INSERT INTO public.app_mutation_idempotency')) {
          return [{ inserted: true }] as unknown as TRow[];
        }
        return [{ completed: true }] as unknown as TRow[];
      },
    };

    const claim = await claimMutation(executor, {
      userScope,
      idempotencyKey: key,
      operation: 'watchlist.upsert',
      payload: { entityKey: 'US:NVDA' },
    });
    assert.equal(claim.kind, 'execute');
    if (claim.kind !== 'execute') return;

    const response = { data: { saved: true } };
    await completeMutation(executor, claim, response);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.parameters[0], userScope.userId);
    assert.equal(calls[0]?.parameters[1], key);
  });

  it('replays only a completed response with the same operation and request hash', async () => {
    const expected = { data: { saved: true } };
    const hash = hashMutationRequest('watchlist.upsert', { entityKey: 'US:NVDA' });
    const executor: MutationIdempotencyExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(sql: string) => {
        if (sql.includes('INSERT INTO public.app_mutation_idempotency')) return [];
        return [
          {
            operation: 'watchlist.upsert',
            request_hash: hash,
            state: 'completed',
            response_json: expected,
          },
        ] as unknown as TRow[];
      },
    };

    const claim = await claimMutation(executor, {
      userScope,
      idempotencyKey: key,
      operation: 'watchlist.upsert',
      payload: { entityKey: 'US:NVDA' },
    });
    assert.deepEqual(claim, { kind: 'replay', response: expected });
  });

  it('rejects malformed keys and reuse with a different request', async () => {
    const executor: MutationIdempotencyExecutor = {
      queryRows: async <TRow extends Record<string, unknown>>(sql: string) => {
        if (sql.includes('INSERT INTO public.app_mutation_idempotency')) return [];
        return [
          {
            operation: 'position.close',
            request_hash: 'a'.repeat(64),
            state: 'completed',
            response_json: {},
          },
        ] as unknown as TRow[];
      },
    };
    await assert.rejects(
      claimMutation(executor, {
        userScope,
        idempotencyKey: 'not-a-uuid',
        operation: 'watchlist.upsert',
        payload: {},
      }),
      /Idempotency-Key/,
    );
    assert.deepEqual(
      await claimMutation(executor, {
        userScope,
        idempotencyKey: key,
        operation: 'watchlist.upsert',
        payload: { entityKey: 'US:NVDA' },
      }),
      { kind: 'conflict' },
    );
  });
});
