import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyLiveDatabaseTarget } from '../dist/index.js';

const EXPECTED_POSTGRES_SYSTEM_IDENTIFIER = '7666128738310115356';

const EXPECTED_CATALOG_DIGESTS = {
  stock_insight_app_reader: {
    reachable_roles_digest: '63b21c9e8b590e4ad121480eda1abb1204850caa7c3e949a1cfa1d64066e1f6d',
    // Kept in step with EXPECTED_CATALOG_DIGESTS in the guard. Moved 2026-08-08 by
    // the TimescaleDB chunk exclusion and migration 074 (market.scheduled_event);
    // before that 2026-08-05 by 065 (analytics.macro_series_topic), and 2026-08-04
    // by 062 (serving.v_knowledge_event_current_v1) and 063
    // (analytics.market_topic_term).
    //
    // 074 landed on 2026-08-07 and was never re-pinned, so the brain crashlooped
    // for about 24 hours. This fixture did not catch it: it asserts that the guard
    // accepts a row matching these values, so a pin that no longer matches the live
    // database passes here and fails only at boot. The check that would have caught
    // it is ops/scripts/repin-live-database-digests.mjs against the live database.
    // Re-pinned 2026-08-08 by migration 085, which grants the reader SELECT on
    // serving.content_pack_item_truth_v1 — the one relation REQ-SEM-010 needs a
    // rendering surface to see. This fixture is a literal mirror of the guard's
    // constant rather than an import, so moving the pin fails here and forces a
    // conscious update. That failure is the mechanism, not an inconvenience: it is
    // the last checkpoint before a re-pin ships without anyone looking at it.
    //
    // Moved again 2026-08-09 by migrations 092/093, and 2026-08-11 by migration 099 —
    // whose four serving relations reached the reader through the ALTER DEFAULT
    // PRIVILEGES that migration 007 left standing in serving, with no GRANT in 099
    // itself. The guard's own comment carries the arithmetic and the reproduction proof.
    // The mechanism described above did its job here: this fixture failed first, which
    // is how the re-pin got looked at. Migration 117 removed that default privilege in
    // the same landing, so the next relation created in serving will not move this
    // digest on its own.
    relation_privileges_digest: 'f89525cc1af76c9bbb6a1ff1a374ef4fb72fdf55eb4259814a722782c6d9aa3f',
    extra_column_privileges_digest:
      '11161bae25339adab5e99a03df17d80ec4d85276aa33848bf9f6a75daa459e64',
    sequence_privileges_digest: '43e6b7768efa9be918cf1007a836d3e81f7e3d0e32da0f87064a6b6c21e99e94',
    schema_privileges_digest: '2045de5d8e33dc7986b8588c175cef4eaf920e99b9ed7ccd825c46d8479d58b7',
    // Moved 2026-08-11 with the relation array above, by the two TABLES migration 099
    // created. This array is relkind IN ('r','p'), so the two _v1 views 099 also added
    // stayed out of it — which is why it moved by two entries where the array above
    // moved by four.
    rls_contract_digest: '7daeb13d9adecb526a40380af897ead251f41cc242664bf6b8db2046ee0756a9',
    security_definer_body_digest:
      'fea0137346051512445d7a4422a9c6194ea442e362958907606ca11e5f0de3bd',
  },
  stock_insight_app_writer: {
    reachable_roles_digest: 'cbff6d032ebb3896e50c3dd128d7210a9a61d43ba8621bb0ff4f39387dec4909',
    relation_privileges_digest: '718daead8c22bd6e5de5a93d8630da26f31450352c983e59ef9add653a285bbc',
    extra_column_privileges_digest:
      '11161bae25339adab5e99a03df17d80ec4d85276aa33848bf9f6a75daa459e64',
    sequence_privileges_digest: '49ce5f147110b657e27887ecd8602cccf6925afb93b7b6c5d8757fa507799913',
    schema_privileges_digest: '1c643e5c1f9cffb3b8f3ca63c1292f53c719f855a5bcc9d4b0cb45560f44da2c',
    rls_contract_digest: 'e53a17df640e4ec647cdea2d97817ff91cbcc5ab376cc064f291db16133a1860',
    security_definer_body_digest:
      '595890696572a24b461b34797ebd4e5f5377cee555651e65ce772b78da809252',
  },
} as const;

const READER_SECURITY_DEFINER_FUNCTIONS = [
  'ops.analysis_run_binding_requires_payload_recovery(text, integer)',
  'public.current_app_account_role()',
  'public.get_app_capabilities()',
  'public.list_app_invitations()',
  'public.lookup_account_by_id(uuid)',
  'public.lookup_login_account(text)',
];

const WRITER_SECURITY_DEFINER_FUNCTIONS = [
  'ops.analysis_run_binding_requires_payload_recovery(text, integer)',
  'public.consume_invitation_and_create_account(text, text, text)',
  'public.current_app_account_role()',
  'public.get_app_capabilities()',
  'public.issue_app_invitation(text, text, integer, timestamp with time zone)',
  'public.list_app_invitations()',
  'public.lookup_account_by_id(uuid)',
  'public.lookup_login_account(text)',
  'public.revoke_app_invitation(uuid, text)',
];

const liveEnv = {
  host: '127.0.0.1',
  port: 6200,
  databaseReadUrl:
    'postgresql://reader@127.0.0.1:55432/research_app?options=-c+default_transaction_read_only%3Don',
  databaseWriteUrl: 'postgresql://writer@127.0.0.1:55432/research_app',
  liveDatabaseExpected: true,
};

function identity(roleName: string, transactionReadOnly: 'on' | 'off') {
  const writer = roleName === 'stock_insight_app_writer';
  return {
    database_name: 'research_app',
    system_identifier: EXPECTED_POSTGRES_SYSTEM_IDENTIFIER,
    role_name: roleName,
    session_user_name: roleName,
    member_of_roles: [writer ? 'stock_insight_writer' : 'stock_insight_reader'],
    transaction_read_only: transactionReadOnly,
    ...EXPECTED_CATALOG_DIGESTS[writer ? 'stock_insight_app_writer' : 'stock_insight_app_reader'],
    has_app_users: true,
    has_local_accounts: true,
    has_account_roles: true,
    can_select_local_accounts: true,
    can_insert_local_accounts: writer,
    can_update_local_accounts: false,
    can_delete_local_accounts: false,
    can_truncate_local_accounts: false,
    can_select_app_users: false,
    can_insert_app_users: false,
    can_update_app_users: false,
    can_delete_app_users: false,
    can_truncate_app_users: false,
    can_select_account_roles: false,
    can_insert_account_roles: false,
    can_update_account_roles: false,
    can_delete_account_roles: false,
    can_truncate_account_roles: false,
    can_select_idempotency: true,
    can_insert_idempotency: writer,
    can_update_idempotency: writer,
    can_delete_idempotency: false,
    can_truncate_idempotency: false,
    can_select_watchlist: true,
    can_insert_watchlist: writer,
    can_update_watchlist: writer,
    can_delete_watchlist: false,
    can_truncate_watchlist: false,
    executable_security_definer_functions: writer
      ? WRITER_SECURITY_DEFINER_FUNCTIONS
      : READER_SECURITY_DEFINER_FUNCTIONS,
    owns_application_relations: false,
    owns_application_functions: false,
    owns_application_schemas: false,
    is_superuser: false,
    can_create_role: false,
    can_create_database: false,
    can_bypass_rls: false,
    can_create_database_objects: false,
    can_create_public_schema_objects: false,
  };
}

test('verifyLiveDatabaseTarget is a no-op outside explicit live mode', async () => {
  let created = 0;
  await verifyLiveDatabaseTarget(
    {
      host: '127.0.0.1',
      port: 6200,
      liveDatabaseExpected: false,
    },
    {
      createPool: () => {
        created += 1;
        throw new Error('must not connect');
      },
    },
  );
  assert.equal(created, 0);
});

test('verifyLiveDatabaseTarget accepts only the existing production reader and writer identities', async () => {
  const ended: string[] = [];
  const queries: string[] = [];
  const poolConfigs: Array<Record<string, unknown>> = [];
  await verifyLiveDatabaseTarget(liveEnv, {
    createPool: (config) => {
      poolConfigs.push(config);
      const connectionString = String(config.connectionString);
      return {
        async query(sql: string) {
          queries.push(sql);
          return {
            rows: [
              connectionString === liveEnv.databaseReadUrl
                ? identity('stock_insight_app_reader', 'on')
                : identity('stock_insight_app_writer', 'off'),
            ],
          };
        },
        async end() {
          ended.push(connectionString);
          return undefined;
        },
      };
    },
  });

  // Each probe pins search_path before running the identity contract query.
  assert.equal(queries.length, 4);
  assert.equal(queries.filter((sql) => /SET\s+search_path\s*=\s*pg_catalog/i.test(sql)).length, 2);
  const identityQueries = queries.filter((sql) => sql.includes('system_identifier'));
  assert.equal(identityQueries.length, 2);
  for (const sql of identityQueries) {
    for (const predicate of [
      'session_user',
      'pg_catalog.pg_has_role',
      'pg_catalog.has_table_privilege',
      'pg_catalog.has_column_privilege',
      'pg_catalog.has_sequence_privilege',
      'pg_catalog.has_schema_privilege',
      'pg_policy',
      'relrowsecurity',
      'public.digest',
      'pg_catalog.pg_get_functiondef',
      'pg_catalog.jsonb_build_object',
      'pg_catalog.aclexplode',
      'pg_catalog.acldefault',
      'procedure.proacl',
      "'grantee_kind'",
      "'grantee_name'",
      "'grantor_name'",
      'NULLS FIRST',
    ]) {
      assert.ok(sql.includes(predicate), `identity SQL must contain ${predicate}`);
    }
    assert.doesNotMatch(sql, /md5\s*\(\s*procedure\.prosrc\s*\)/i);
  }
  assert.ok(
    poolConfigs.every(
      (config) =>
        config.max === 1 &&
        config.connectionTimeoutMillis === 10_000 &&
        config.query_timeout === 10_000,
    ),
  );
  assert.deepEqual(ended.sort(), [liveEnv.databaseReadUrl, liveEnv.databaseWriteUrl].sort());
});

test('verifyLiveDatabaseTarget pins search_path and schema-qualifies every catalog lookup', async () => {
  // A hostile search_path (injected via the DSN options or the role's
  // rolconfig) can shadow has_table_privilege / to_regclass / pg_roles with
  // look-alike objects that return whatever the guard wants to see, so the
  // whole contract check becomes forgeable.
  const queries: string[] = [];
  await verifyLiveDatabaseTarget(liveEnv, {
    createPool: (config) => ({
      async query(sql: string) {
        queries.push(sql);
        return {
          rows: [
            String(config.connectionString) === liveEnv.databaseReadUrl
              ? identity('stock_insight_app_reader', 'on')
              : identity('stock_insight_app_writer', 'off'),
          ],
        };
      },
      async connect() {
        return {
          async query(sql: string) {
            queries.push(sql);
            return {
              rows: [
                String(config.connectionString) === liveEnv.databaseReadUrl
                  ? identity('stock_insight_app_reader', 'on')
                  : identity('stock_insight_app_writer', 'off'),
              ],
            };
          },
          release(_destroy?: boolean) {},
        };
      },
      async end() {},
    }),
  });

  assert.ok(
    queries.some((sql) => /SET\s+search_path\s*=\s*pg_catalog/i.test(sql)),
    'the probe session must pin search_path to pg_catalog before reading the catalog',
  );
  const identitySql = queries.find((sql) => sql.includes('system_identifier')) ?? '';
  for (const unqualified of [
    /(?<!pg_catalog\.)\bhas_table_privilege\(/,
    /(?<!pg_catalog\.)\bhas_schema_privilege\(/,
    /(?<!pg_catalog\.)\bhas_function_privilege\(/,
    /(?<!pg_catalog\.)\bhas_database_privilege\(/,
    /(?<!pg_catalog\.)\bto_regclass\(/,
    /(?<!pg_catalog\.)\bFROM pg_roles\b/,
    /(?<!pg_catalog\.)\bFROM pg_auth_members\b/,
  ]) {
    assert.doesNotMatch(
      identitySql,
      unqualified,
      `identity SQL must schema-qualify ${String(unqualified)}`,
    );
  }
});

test('verifyLiveDatabaseTarget rejects a lookalike database from another PostgreSQL cluster', async () => {
  await assert.rejects(
    verifyLiveDatabaseTarget(liveEnv, {
      createPool: (config) => ({
        async query() {
          const row =
            String(config.connectionString) === liveEnv.databaseReadUrl
              ? identity('stock_insight_app_reader', 'on')
              : identity('stock_insight_app_writer', 'off');
          return { rows: [{ ...row, system_identifier: '9999999999999999999' }] };
        },
        async end() {},
      }),
    }),
    /live database verification failed/,
  );
});

test('verifyLiveDatabaseTarget rejects every single-field identity mutation for both roles', async () => {
  for (const target of [
    {
      role: 'stock_insight_app_reader',
      transactionReadOnly: 'on',
      connectionString: liveEnv.databaseReadUrl,
    },
    {
      role: 'stock_insight_app_writer',
      transactionReadOnly: 'off',
      connectionString: liveEnv.databaseWriteUrl,
    },
  ] as const) {
    const baseline = identity(target.role, target.transactionReadOnly);
    const mutations = Object.entries(baseline).map(([field, value]) => {
      let invalidValue: unknown;
      if (Array.isArray(value)) invalidValue = [...value, 'unexpected'];
      else if (typeof value === 'boolean') invalidValue = !value;
      else if (field === 'transaction_read_only')
        invalidValue = target.role.endsWith('_writer') ? 'on' : 'off';
      else invalidValue = `unexpected:${String(value)}`;
      return { field, row: { ...baseline, [field]: invalidValue } };
    });
    mutations.push({
      field: 'member_of_roles:wrong-content',
      row: { ...baseline, member_of_roles: ['unexpected_role'] },
    });

    for (const mutation of mutations) {
      await assert.rejects(
        verifyLiveDatabaseTarget(liveEnv, {
          createPool: (config) => ({
            async query() {
              if (String(config.connectionString) === target.connectionString) {
                return { rows: [mutation.row] };
              }
              return {
                rows: [
                  String(config.connectionString) === liveEnv.databaseReadUrl
                    ? identity('stock_insight_app_reader', 'on')
                    : identity('stock_insight_app_writer', 'off'),
                ],
              };
            },
            async end() {},
          }),
        }),
        /live database verification failed/,
        `${target.role}:${mutation.field}`,
      );
    }
  }
});

test('verifyLiveDatabaseTarget fails closed on a wrong role, read/write mode, or required object', async () => {
  for (const badWriter of [
    identity('postgres', 'off'),
    identity('stock_insight_app_writer', 'on'),
    {
      ...identity('stock_insight_app_writer', 'off'),
      member_of_roles: ['pg_read_all_data', 'stock_insight_writer'],
    },
    { ...identity('stock_insight_app_writer', 'off'), has_app_users: false },
    { ...identity('stock_insight_app_writer', 'off'), can_insert_local_accounts: false },
    { ...identity('stock_insight_app_writer', 'off'), can_select_app_users: true },
    { ...identity('stock_insight_app_writer', 'off'), can_insert_account_roles: true },
    { ...identity('stock_insight_app_writer', 'off'), can_delete_idempotency: true },
    { ...identity('stock_insight_app_writer', 'off'), can_update_watchlist: false },
    { ...identity('stock_insight_app_writer', 'off'), can_delete_watchlist: true },
    { ...identity('stock_insight_app_writer', 'off'), can_bypass_rls: true },
  ]) {
    const ended: string[] = [];
    await assert.rejects(
      verifyLiveDatabaseTarget(liveEnv, {
        createPool: (config) => {
          const connectionString = String(config.connectionString);
          return {
            async query() {
              return {
                rows: [
                  connectionString === liveEnv.databaseReadUrl
                    ? identity('stock_insight_app_reader', 'on')
                    : badWriter,
                ],
              };
            },
            async end() {
              ended.push(connectionString);
              return undefined;
            },
          };
        },
      }),
      /live database verification failed/,
    );
    assert.equal(ended.length, 2);
  }
});

test('verifyLiveDatabaseTarget closes the first pool when the second pool constructor fails', async () => {
  let created = 0;
  let ended = 0;
  await assert.rejects(
    verifyLiveDatabaseTarget(liveEnv, {
      createPool: () => {
        created += 1;
        if (created === 2) throw new Error('writer pool construction failed');
        return {
          async query() {
            return { rows: [identity('stock_insight_app_reader', 'on')] };
          },
          async end() {
            ended += 1;
          },
        };
      },
    }),
    /live database verification failed/,
  );
  assert.equal(ended, 1);
});

test('verifyLiveDatabaseTarget bounds a hanging probe and pool cleanup', async () => {
  const startedAt = Date.now();
  let destroyedClients = 0;
  let endedPools = 0;
  await assert.rejects(
    verifyLiveDatabaseTarget(liveEnv, {
      verificationTimeoutMs: 10,
      cleanupTimeoutMs: 10,
      createPool: () => ({
        query: async () => {
          throw new Error('pool.query must not bypass forced client cleanup');
        },
        async connect() {
          return {
            query: () => new Promise(() => {}),
            release(destroy?: boolean) {
              assert.equal(destroy, true);
              destroyedClients += 1;
            },
          };
        },
        async end() {
          endedPools += 1;
        },
      }),
    }),
    /live database verification failed/,
  );
  assert.ok(Date.now() - startedAt < 500);
  assert.equal(destroyedClients, 2);
  assert.equal(endedPools, 2);
});

test('verifyLiveDatabaseTarget fails startup when probe pool cleanup fails', async () => {
  await assert.rejects(
    verifyLiveDatabaseTarget(liveEnv, {
      createPool: (config) => ({
        async query() {
          return {
            rows: [
              String(config.connectionString) === liveEnv.databaseReadUrl
                ? identity('stock_insight_app_reader', 'on')
                : identity('stock_insight_app_writer', 'off'),
            ],
          };
        },
        async end() {
          throw new Error('socket cleanup failed');
        },
      }),
    }),
    /live database probe cleanup failed/,
  );
});

test('verifyLiveDatabaseTarget preserves the identity failure when cleanup also fails', async () => {
  // A `finally` that throws overwrites the in-flight verification error, so an
  // operator sees "cleanup failed" for what is actually a wrong-cluster or
  // wrong-role connection. The identity failure must always win.
  await assert.rejects(
    verifyLiveDatabaseTarget(liveEnv, {
      createPool: (config) => ({
        async query() {
          const row =
            String(config.connectionString) === liveEnv.databaseReadUrl
              ? identity('stock_insight_app_reader', 'on')
              : identity('stock_insight_app_writer', 'off');
          return { rows: [{ ...row, system_identifier: '9999999999999999999' }] };
        },
        async end(): Promise<void> {
          throw new Error('socket cleanup failed');
        },
      }),
    }),
    /live database verification failed/,
  );
});

test('verifyLiveDatabaseTarget requires both DSNs in live mode', async () => {
  await assert.rejects(
    verifyLiveDatabaseTarget({ ...liveEnv, databaseWriteUrl: undefined }),
    /DATABASE_READ_URL and DATABASE_WRITE_URL are required/,
  );
});

test('verifyLiveDatabaseTarget accepts PostgreSQL name[] columns returned as array literals', async () => {
  // node-postgres has no parser for the `name[]` OID, so `member_of_roles` and
  // `executable_security_definer_functions` arrive as raw literals like
  // '{stock_insight_reader}'. Treating those as a failure made the guard reject
  // the real production cluster while every unit test (which hands back real JS
  // arrays) still passed.
  const toLiteral = (values: string[]) =>
    `{${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(',')}}`;
  await verifyLiveDatabaseTarget(liveEnv, {
    createPool: (config) => ({
      async query() {
        const row =
          String(config.connectionString) === liveEnv.databaseReadUrl
            ? identity('stock_insight_app_reader', 'on')
            : identity('stock_insight_app_writer', 'off');
        return {
          rows: [
            {
              ...row,
              member_of_roles: toLiteral(row.member_of_roles) as unknown as string[],
              executable_security_definer_functions: toLiteral(
                row.executable_security_definer_functions,
              ) as unknown as string[],
            },
          ],
        };
      },
      async end() {},
    }),
  });
});

test('verifyLiveDatabaseTarget rejects a live reader DSN without session read-only enforcement', async () => {
  await assert.rejects(
    verifyLiveDatabaseTarget({
      ...liveEnv,
      databaseReadUrl: 'postgresql://reader@127.0.0.1:55432/research_app',
    }),
    /DATABASE_READ_URL must enforce default_transaction_read_only=on/,
  );
});
