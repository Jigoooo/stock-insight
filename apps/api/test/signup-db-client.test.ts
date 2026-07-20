import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createSignupDatabaseClient } from '../src/server/db-client.ts';
import type { ServerEnv } from '../src/server/env.ts';

const baseEnv: ServerEnv = {
  databaseUrl: 'postgres://reader@localhost:5432/app',
  databaseWriteUrl: 'postgres://writer@localhost:5432/app',
  userId: undefined,
} as unknown as ServerEnv;

describe('signup (unscoped bootstrap) database client', () => {
  it('is configured WITHOUT a pre-existing user scope (signup mints the user)', () => {
    const client = createSignupDatabaseClient(baseEnv);
    assert.equal(client.kind, 'configured');
    if (client.kind === 'configured') {
      assert.equal(typeof client.withTransaction, 'function');
    }
  });

  it('is disabled when no write connection string is configured', () => {
    const noWrite = { ...baseEnv, databaseWriteUrl: undefined } as unknown as ServerEnv;
    assert.equal(createSignupDatabaseClient(noWrite).kind, 'disabled');
  });
});
