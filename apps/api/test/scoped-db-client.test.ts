import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createScopedReadOnlyDatabaseClient,
  createScopedDatabaseClient,
} from '../src/server/db-client.ts';
import type { ServerEnv } from '../src/server/env.ts';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const baseEnv: ServerEnv = {
  databaseUrl: 'postgres://reader@localhost:5432/app',
  databaseWriteUrl: 'postgres://writer@localhost:5432/app',
  userId: undefined,
} as unknown as ServerEnv;

describe('per-request scoped database clients', () => {
  it('rejects a scoped read client without a canonical UUID scope', () => {
    assert.throws(() => createScopedReadOnlyDatabaseClient('not-a-uuid', baseEnv), /user scope/i);
    assert.throws(() => createScopedReadOnlyDatabaseClient('', baseEnv), /user scope/i);
  });

  it('rejects a scoped write client without a canonical UUID scope', () => {
    assert.throws(() => createScopedDatabaseClient('nope', baseEnv), /user scope/i);
  });

  it('accepts a valid UUID scope and exposes the standard client surface', () => {
    const read = createScopedReadOnlyDatabaseClient(USER_A, baseEnv);
    assert.equal(read.kind, 'configured');
    if (read.kind === 'configured') {
      assert.equal(typeof read.withReadSnapshot, 'function');
      assert.equal(typeof read.queryRows, 'function');
    }
    const write = createScopedDatabaseClient(USER_B, baseEnv);
    assert.equal(write.kind, 'configured');
    if (write.kind === 'configured') {
      assert.equal(typeof write.withTransaction, 'function');
    }
  });

  it('returns a disabled client when the connection string is absent', () => {
    const noReadEnv = { ...baseEnv, databaseUrl: undefined } as unknown as ServerEnv;
    const read = createScopedReadOnlyDatabaseClient(USER_A, noReadEnv);
    assert.equal(read.kind, 'disabled');
    const noWriteEnv = { ...baseEnv, databaseWriteUrl: undefined } as unknown as ServerEnv;
    const write = createScopedDatabaseClient(USER_A, noWriteEnv);
    assert.equal(write.kind, 'disabled');
  });
});
