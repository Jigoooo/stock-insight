import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveDatabaseConnectionStrings } from '../src/server/database-connection-policy.ts';
import { parseServerEnv } from '../src/server/env.ts';
import { requireUserScope } from '../src/shared/user-scope.ts';

const userId = '11111111-1111-4111-8111-111111111111';

describe('server user scope environment', () => {
  it('prefers the dedicated read DSN and preserves an explicit write DSN', () => {
    assert.deepEqual(
      parseServerEnv({
        DATABASE_URL: 'postgres://legacy.example/app',
        DATABASE_READ_URL: 'postgres://reader.example/app',
        DATABASE_WRITE_URL: 'postgres://writer.example/app',
      }),
      {
        databaseUrl: 'postgres://legacy.example/app',
        databaseReadUrl: 'postgres://reader.example/app',
        databaseWriteUrl: 'postgres://writer.example/app',
      },
    );
  });

  it('temporarily falls back to DATABASE_URL for reads but not dedicated writes', () => {
    assert.deepEqual(parseServerEnv({ DATABASE_URL: 'postgres://legacy.example/app' }), {
      databaseUrl: 'postgres://legacy.example/app',
      databaseReadUrl: 'postgres://legacy.example/app',
    });
  });

  it('never falls back to the legacy DSN for writes', () => {
    assert.deepEqual(
      resolveDatabaseConnectionStrings(
        parseServerEnv({
          DATABASE_URL: 'postgres://legacy.example/app',
          DATABASE_READ_URL: 'postgres://reader.example/app',
          DATABASE_WRITE_URL: 'postgres://writer.example/app',
        }),
      ),
      { read: 'postgres://reader.example/app', write: 'postgres://writer.example/app' },
    );
    assert.deepEqual(
      resolveDatabaseConnectionStrings(
        parseServerEnv({ DATABASE_URL: 'postgres://legacy.example/app' }),
      ),
      { read: 'postgres://legacy.example/app', write: undefined },
    );
  });

  it('parses a canonical server-owned user id', () => {
    assert.deepEqual(parseServerEnv({ STOCK_INSIGHT_USER_ID: userId }), { userId });
  });

  it('keeps the user scope absent when the variable is not configured', () => {
    assert.deepEqual(parseServerEnv({}), {});
  });

  it('rejects a non-UUID user id before a database client is created', () => {
    assert.throws(
      () => parseServerEnv({ STOCK_INSIGHT_USER_ID: 'default' }),
      /STOCK_INSIGHT_USER_ID must be a valid UUID/,
    );
  });

  it('fails closed when no server-owned user id is configured', () => {
    assert.throws(() => requireUserScope({}), /STOCK_INSIGHT_USER_ID is required/);
  });

  it('creates an immutable user scope from validated server environment', () => {
    assert.deepEqual(requireUserScope({ userId }), { userId });
  });
});
