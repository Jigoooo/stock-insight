import pg, { type PoolConfig } from 'pg';

import type { ApiServerEnv } from '../config/env.ts';

type IdentityRow = {
  database_name: string;
  system_identifier: string;
  role_name: string;
  session_user_name: string;
  member_of_roles: string[];
  transaction_read_only: 'on' | 'off';
  reachable_roles_digest: string;
  relation_privileges_digest: string;
  extra_column_privileges_digest: string;
  sequence_privileges_digest: string;
  schema_privileges_digest: string;
  rls_contract_digest: string;
  security_definer_body_digest: string;
  has_app_users: boolean;
  has_local_accounts: boolean;
  has_account_roles: boolean;
  can_select_local_accounts: boolean;
  can_insert_local_accounts: boolean;
  can_update_local_accounts: boolean;
  can_delete_local_accounts: boolean;
  can_truncate_local_accounts: boolean;
  can_select_app_users: boolean;
  can_insert_app_users: boolean;
  can_update_app_users: boolean;
  can_delete_app_users: boolean;
  can_truncate_app_users: boolean;
  can_select_account_roles: boolean;
  can_insert_account_roles: boolean;
  can_update_account_roles: boolean;
  can_delete_account_roles: boolean;
  can_truncate_account_roles: boolean;
  can_select_idempotency: boolean;
  can_insert_idempotency: boolean;
  can_update_idempotency: boolean;
  can_delete_idempotency: boolean;
  can_truncate_idempotency: boolean;
  can_select_watchlist: boolean;
  can_insert_watchlist: boolean;
  can_update_watchlist: boolean;
  can_delete_watchlist: boolean;
  can_truncate_watchlist: boolean;
  executable_security_definer_functions: string[];
  owns_application_relations: boolean;
  owns_application_functions: boolean;
  owns_application_schemas: boolean;
  is_superuser: boolean;
  can_create_role: boolean;
  can_create_database: boolean;
  can_bypass_rls: boolean;
  can_create_database_objects: boolean;
  can_create_public_schema_objects: boolean;
};

type QueryResult = { rows: IdentityRow[] };
type ProbeClient = {
  query: (sql: string) => Promise<QueryResult>;
  release: (destroy?: boolean) => void;
};
type ProbePool = {
  query: (sql: string) => Promise<QueryResult>;
  connect?: () => Promise<ProbeClient>;
  end: () => Promise<void>;
};

type LiveDatabaseVerifierDependencies = {
  createPool?: (config: PoolConfig) => ProbePool;
  verificationTimeoutMs?: number;
  cleanupTimeoutMs?: number;
};

const DEFAULT_VERIFICATION_TIMEOUT_MS = 12_000;
const DEFAULT_CLEANUP_TIMEOUT_MS = 2_000;
const EXPECTED_POSTGRES_SYSTEM_IDENTIFIER = '7666128738310115356';
const EXPECTED_CATALOG_DIGESTS = {
  stock_insight_app_reader: {
    reachable_roles_digest: '63b21c9e8b590e4ad121480eda1abb1204850caa7c3e949a1cfa1d64066e1f6d',
    // Re-pinned 2026-08-04 for migrations 062 and 063. Both moves were proven,
    // not assumed: recomputing this array on the live database while excluding
    // `analytics.market_topic_term` (063) and `serving.v_knowledge_event_current_v1`
    // (062) reproduces the previous pin 1b9cf45e0…f27a2 exactly. Nothing else
    // changed what the reader can reach.
    relation_privileges_digest: 'c0d214162c7ee534f770e901833b86b8dd974bdcdd66defdb969d8fff09816a9',
    extra_column_privileges_digest:
      '11161bae25339adab5e99a03df17d80ec4d85276aa33848bf9f6a75daa459e64',
    sequence_privileges_digest: '43e6b7768efa9be918cf1007a836d3e81f7e3d0e32da0f87064a6b6c21e99e94',
    schema_privileges_digest: '2045de5d8e33dc7986b8588c175cef4eaf920e99b9ed7ccd825c46d8479d58b7',
    // Re-pinned 2026-08-04. This array enumerates every table the reader can
    // touch, so a new table moves it even when no policy changed — and that is
    // the whole change here: excluding `analytics.market_topic_term` (063)
    // reproduces the previous pin a749fb616…92af exactly. 062 added a view, and
    // views are not in this array (relkind r/p only), which is why one migration
    // moved this digest and two moved the relation one.
    rls_contract_digest: 'b256639281823edd64ff04f7d83028075ae29956dbff410d2bf5332b9874bdbe',
    security_definer_body_digest:
      'fea0137346051512445d7a4422a9c6194ea442e362958907606ca11e5f0de3bd',
  },
  stock_insight_app_writer: {
    reachable_roles_digest: 'cbff6d032ebb3896e50c3dd128d7210a9a61d43ba8621bb0ff4f39387dec4909',
    relation_privileges_digest: '3ab97bda6e34d6c53d4f394b7d47fb1f9926327d3b365750791f4476d0a3ff39',
    extra_column_privileges_digest:
      '11161bae25339adab5e99a03df17d80ec4d85276aa33848bf9f6a75daa459e64',
    sequence_privileges_digest: '49ce5f147110b657e27887ecd8602cccf6925afb93b7b6c5d8757fa507799913',
    schema_privileges_digest: '1c643e5c1f9cffb3b8f3ca63c1292f53c719f855a5bcc9d4b0cb45560f44da2c',
    rls_contract_digest: '6ed879300313b1b012371afaa8081c48a6b53123faff05ba592ec586ea2db77c',
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

// Pinning search_path to pg_catalog only makes the catalog helpers
// unshadowable; the extension function used for digests is called with its
// explicit public. prefix inside IDENTITY_SQL.
const PIN_SEARCH_PATH_SQL = `SET search_path = pg_catalog, public`;

export const SECURITY_DEFINER_ACL_JSON_SQL = `(
  SELECT pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object(
             'grantee_kind', CASE
               WHEN expanded_acl.grantee = 0 THEN 'public'
               ELSE 'role'
             END,
             'grantee_name', CASE
               WHEN expanded_acl.grantee = 0 THEN NULL
               ELSE grantee.rolname
             END,
             'grantor_name', grantor.rolname,
             'privilege', expanded_acl.privilege_type,
             'grantable', expanded_acl.is_grantable
           )
           ORDER BY
             (CASE WHEN expanded_acl.grantee = 0 THEN 'public' ELSE 'role' END) COLLATE "C",
             (CASE WHEN expanded_acl.grantee = 0 THEN NULL ELSE grantee.rolname END) COLLATE "C" NULLS FIRST,
             grantor.rolname COLLATE "C" NULLS FIRST,
             expanded_acl.privilege_type COLLATE "C",
             expanded_acl.is_grantable
         )
    FROM pg_catalog.aclexplode(
           COALESCE(
             procedure.proacl,
             pg_catalog.acldefault('f', procedure.proowner)
           )
         ) expanded_acl
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = expanded_acl.grantee
    LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid = expanded_acl.grantor
)`;

export const IDENTITY_SQL = `
WITH catalog AS (
  SELECT
    ARRAY(
      SELECT pg_catalog.format(
        '%s|super=%s|inherit=%s|createrole=%s|createdb=%s|login=%s|replication=%s|bypassrls=%s|connlimit=%s',
        candidate.rolname,
        candidate.rolsuper,
        candidate.rolinherit,
        candidate.rolcreaterole,
        candidate.rolcreatedb,
        candidate.rolcanlogin,
        candidate.rolreplication,
        candidate.rolbypassrls,
        candidate.rolconnlimit
      )
        FROM pg_catalog.pg_roles candidate
       WHERE pg_catalog.pg_has_role(current_user, candidate.oid, 'MEMBER')
       ORDER BY candidate.rolname COLLATE "C"
    ) AS reachable_roles,
    ARRAY(
      SELECT pg_catalog.format('%I.%I|%s', namespace.nspname, relation.relname, privilege.name)
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
       CROSS JOIN (
         VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
       ) privilege(name)
       WHERE namespace.nspname NOT LIKE 'pg_%'
         AND namespace.nspname <> 'information_schema'
         AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND pg_catalog.has_table_privilege(current_user, relation.oid, privilege.name)
       ORDER BY 1
    ) AS relation_privileges,
    ARRAY(
      SELECT pg_catalog.format(
        '%I.%I.%I|%s',
        namespace.nspname,
        relation.relname,
        attribute.attname,
        privilege.name
      )
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        JOIN pg_catalog.pg_attribute attribute
          ON attribute.attrelid = relation.oid
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
       CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) privilege(name)
       WHERE namespace.nspname NOT LIKE 'pg_%'
         AND namespace.nspname <> 'information_schema'
         AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND pg_catalog.has_column_privilege(
           current_user,
           relation.oid,
           attribute.attnum,
           privilege.name
         )
         AND NOT pg_catalog.has_table_privilege(current_user, relation.oid, privilege.name)
       ORDER BY 1
    ) AS extra_column_privileges,
    ARRAY(
      SELECT pg_catalog.format('%I.%I|%s', namespace.nspname, relation.relname, privilege.name)
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
       CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) privilege(name)
       WHERE namespace.nspname NOT LIKE 'pg_%'
         AND namespace.nspname <> 'information_schema'
         AND relation.relkind = 'S'
         AND pg_catalog.has_sequence_privilege(current_user, relation.oid, privilege.name)
       ORDER BY 1
    ) AS sequence_privileges,
    ARRAY(
      SELECT pg_catalog.format('%I|%s', namespace.nspname, privilege.name)
        FROM pg_catalog.pg_namespace namespace
       CROSS JOIN (VALUES ('USAGE'), ('CREATE')) privilege(name)
       WHERE namespace.nspname NOT LIKE 'pg_%'
         AND namespace.nspname <> 'information_schema'
         AND pg_catalog.has_schema_privilege(current_user, namespace.oid, privilege.name)
       ORDER BY 1
    ) AS schema_privileges,
    ARRAY(
      SELECT pg_catalog.format(
        '%I.%I|rls=%s|force=%s|policies=%s',
        namespace.nspname,
        relation.relname,
        relation.relrowsecurity,
        relation.relforcerowsecurity,
        COALESCE((
          SELECT string_agg(
            pg_catalog.format(
              '%s:%s:%s:%s:%s:%s',
              policy.polname,
              policy.polcmd,
              policy.polpermissive,
              policy.polroles::text,
              COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), ''),
              COALESCE(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')
            ),
            ';;'
            ORDER BY policy.polname
          )
            FROM pg_catalog.pg_policy policy
           WHERE policy.polrelid = relation.oid
        ), '')
      )
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname NOT LIKE 'pg_%'
         AND namespace.nspname <> 'information_schema'
         AND relation.relkind IN ('r', 'p')
         AND EXISTS (
           SELECT 1
             FROM (
               VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
             ) privilege(name)
            WHERE pg_catalog.has_table_privilege(current_user, relation.oid, privilege.name)
         )
       ORDER BY 1
    ) AS rls_contract
)
SELECT
  pg_catalog.current_database() AS database_name,
  (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier,
  current_user AS role_name,
  session_user AS session_user_name,
  pg_catalog.encode(
    public.digest(pg_catalog.convert_to(pg_catalog.array_to_json(catalog.reachable_roles)::text, 'UTF8'), 'sha256'),
    'hex'
  ) AS reachable_roles_digest,
  pg_catalog.encode(
    public.digest(pg_catalog.convert_to(pg_catalog.array_to_json(catalog.relation_privileges)::text, 'UTF8'), 'sha256'),
    'hex'
  ) AS relation_privileges_digest,
  pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(pg_catalog.array_to_json(catalog.extra_column_privileges)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  ) AS extra_column_privileges_digest,
  pg_catalog.encode(
    public.digest(pg_catalog.convert_to(pg_catalog.array_to_json(catalog.sequence_privileges)::text, 'UTF8'), 'sha256'),
    'hex'
  ) AS sequence_privileges_digest,
  pg_catalog.encode(
    public.digest(pg_catalog.convert_to(pg_catalog.array_to_json(catalog.schema_privileges)::text, 'UTF8'), 'sha256'),
    'hex'
  ) AS schema_privileges_digest,
  pg_catalog.encode(
    public.digest(pg_catalog.convert_to(pg_catalog.array_to_json(catalog.rls_contract)::text, 'UTF8'), 'sha256'),
    'hex'
  ) AS rls_contract_digest,
  ARRAY(
    SELECT parent.rolname
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles child ON child.oid = membership.member
      JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
     WHERE child.rolname = current_user
     ORDER BY parent.rolname COLLATE "C"
  ) AS member_of_roles,
  pg_catalog.current_setting('transaction_read_only') AS transaction_read_only,
  pg_catalog.to_regclass('public.app_users') IS NOT NULL AS has_app_users,
  pg_catalog.to_regclass('public.app_local_accounts') IS NOT NULL AS has_local_accounts,
  pg_catalog.to_regclass('public.app_account_roles') IS NOT NULL AS has_account_roles,
  pg_catalog.has_table_privilege(current_user, 'public.app_local_accounts', 'SELECT') AS can_select_local_accounts,
  pg_catalog.has_table_privilege(current_user, 'public.app_local_accounts', 'INSERT') AS can_insert_local_accounts,
  pg_catalog.has_table_privilege(current_user, 'public.app_local_accounts', 'UPDATE') AS can_update_local_accounts,
  pg_catalog.has_table_privilege(current_user, 'public.app_local_accounts', 'DELETE') AS can_delete_local_accounts,
  pg_catalog.has_table_privilege(current_user, 'public.app_local_accounts', 'TRUNCATE') AS can_truncate_local_accounts,
  pg_catalog.has_table_privilege(current_user, 'public.app_users', 'SELECT') AS can_select_app_users,
  pg_catalog.has_table_privilege(current_user, 'public.app_users', 'INSERT') AS can_insert_app_users,
  pg_catalog.has_table_privilege(current_user, 'public.app_users', 'UPDATE') AS can_update_app_users,
  pg_catalog.has_table_privilege(current_user, 'public.app_users', 'DELETE') AS can_delete_app_users,
  pg_catalog.has_table_privilege(current_user, 'public.app_users', 'TRUNCATE') AS can_truncate_app_users,
  pg_catalog.has_table_privilege(current_user, 'public.app_account_roles', 'SELECT') AS can_select_account_roles,
  pg_catalog.has_table_privilege(current_user, 'public.app_account_roles', 'INSERT') AS can_insert_account_roles,
  pg_catalog.has_table_privilege(current_user, 'public.app_account_roles', 'UPDATE') AS can_update_account_roles,
  pg_catalog.has_table_privilege(current_user, 'public.app_account_roles', 'DELETE') AS can_delete_account_roles,
  pg_catalog.has_table_privilege(current_user, 'public.app_account_roles', 'TRUNCATE') AS can_truncate_account_roles,
  pg_catalog.has_table_privilege(current_user, 'public.app_mutation_idempotency', 'SELECT') AS can_select_idempotency,
  pg_catalog.has_table_privilege(current_user, 'public.app_mutation_idempotency', 'INSERT') AS can_insert_idempotency,
  pg_catalog.has_table_privilege(current_user, 'public.app_mutation_idempotency', 'UPDATE') AS can_update_idempotency,
  pg_catalog.has_table_privilege(current_user, 'public.app_mutation_idempotency', 'DELETE') AS can_delete_idempotency,
  pg_catalog.has_table_privilege(current_user, 'public.app_mutation_idempotency', 'TRUNCATE') AS can_truncate_idempotency,
  pg_catalog.has_table_privilege(current_user, 'public.user_watchlist', 'SELECT') AS can_select_watchlist,
  pg_catalog.has_table_privilege(current_user, 'public.user_watchlist', 'INSERT') AS can_insert_watchlist,
  pg_catalog.has_table_privilege(current_user, 'public.user_watchlist', 'UPDATE') AS can_update_watchlist,
  pg_catalog.has_table_privilege(current_user, 'public.user_watchlist', 'DELETE') AS can_delete_watchlist,
  pg_catalog.has_table_privilege(current_user, 'public.user_watchlist', 'TRUNCATE') AS can_truncate_watchlist,
  ARRAY(
    SELECT pg_catalog.format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure.proname,
      pg_catalog.oidvectortypes(procedure.proargtypes)
    )
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
     WHERE procedure.prosecdef
       AND namespace.nspname NOT LIKE 'pg_%'
       AND namespace.nspname <> 'information_schema'
       AND pg_catalog.has_function_privilege(current_user, procedure.oid, 'EXECUTE')
     ORDER BY 1
  ) AS executable_security_definer_functions,
  -- Signature equality alone is forgeable: CREATE OR REPLACE keeps the
  -- signature while swapping the body of a SECURITY DEFINER function, which
  -- runs with the owner's rights. Bind the body, owner and proconfig too.
  pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        COALESCE(
          (
            SELECT pg_catalog.jsonb_agg(
                     pg_catalog.jsonb_build_object(
                       'signature', pg_catalog.format(
                         '%I.%I(%s)',
                         namespace.nspname,
                         procedure.proname,
                         pg_catalog.oidvectortypes(procedure.proargtypes)
                       ),
                       'owner', owner.rolname,
                       'definition', pg_catalog.pg_get_functiondef(procedure.oid),
                       'acl', ${SECURITY_DEFINER_ACL_JSON_SQL}
                     )
                     ORDER BY pg_catalog.format(
                       '%I.%I(%s)',
                       namespace.nspname,
                       procedure.proname,
                       pg_catalog.oidvectortypes(procedure.proargtypes)
                     ) COLLATE "C"
                   )::text
              FROM pg_catalog.pg_proc procedure
              JOIN pg_catalog.pg_namespace namespace
                ON namespace.oid = procedure.pronamespace
              JOIN pg_catalog.pg_roles owner ON owner.oid = procedure.proowner
             WHERE procedure.prosecdef
               AND namespace.nspname NOT LIKE 'pg_%'
               AND namespace.nspname <> 'information_schema'
               AND pg_catalog.has_function_privilege(current_user, procedure.oid, 'EXECUTE')
          ),
          ''
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ) AS security_definer_body_digest,
  EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      JOIN pg_catalog.pg_roles owner ON owner.oid = relation.relowner
     WHERE owner.rolname = current_user
       AND namespace.nspname NOT LIKE 'pg_%'
       AND namespace.nspname <> 'information_schema'
  ) AS owns_application_relations,
  EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
      JOIN pg_catalog.pg_roles owner ON owner.oid = procedure.proowner
     WHERE owner.rolname = current_user
       AND namespace.nspname NOT LIKE 'pg_%'
       AND namespace.nspname <> 'information_schema'
  ) AS owns_application_functions,
  EXISTS (
    SELECT 1
      FROM pg_catalog.pg_namespace namespace
      JOIN pg_catalog.pg_roles owner ON owner.oid = namespace.nspowner
     WHERE owner.rolname = current_user
       AND namespace.nspname NOT LIKE 'pg_%'
       AND namespace.nspname <> 'information_schema'
  ) AS owns_application_schemas,
  (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user) AS is_superuser,
  (SELECT rolcreaterole FROM pg_catalog.pg_roles WHERE rolname = current_user) AS can_create_role,
  (SELECT rolcreatedb FROM pg_catalog.pg_roles WHERE rolname = current_user) AS can_create_database,
  (SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = current_user) AS can_bypass_rls,
  pg_catalog.has_database_privilege(current_user, pg_catalog.current_database(), 'CREATE') AS can_create_database_objects,
  pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public_schema_objects
FROM catalog
`;

function equalStringArrays(actual: string[], expected: string[]): boolean {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}

// node-postgres ships no parser for the `name[]` OID, so these columns arrive as
// raw PostgreSQL array literals ('{a,"b c"}') instead of JS arrays. Normalising
// here keeps the contract checks identical for both shapes; anything else stays
// unparsed so it still fails closed.
function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value))
    return value.every((item) => typeof item === 'string') ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const literal = value.trim();
  if (!literal.startsWith('{') || !literal.endsWith('}')) return undefined;
  const body = literal.slice(1, -1);
  if (body === '') return [];
  const items: string[] = [];
  let current = '';
  let quoted = false;
  let escaped = false;
  for (const character of body) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      items.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  if (quoted || escaped) return undefined;
  items.push(current);
  return items;
}

function assertIdentity(
  row: IdentityRow | undefined,
  expectedRole: 'stock_insight_app_reader' | 'stock_insight_app_writer',
): void {
  const expectedInsert = expectedRole === 'stock_insight_app_writer';
  const expectedMembership = expectedInsert ? 'stock_insight_writer' : 'stock_insight_reader';
  const expectedSecurityDefinerFunctions = expectedInsert
    ? WRITER_SECURITY_DEFINER_FUNCTIONS
    : READER_SECURITY_DEFINER_FUNCTIONS;
  const expectedCatalogDigests = EXPECTED_CATALOG_DIGESTS[expectedRole];
  const memberOfRoles = toStringArray(row?.member_of_roles);
  const securityDefinerFunctions = toStringArray(row?.executable_security_definer_functions);
  if (
    !row ||
    row.database_name !== 'research_app' ||
    row.system_identifier !== EXPECTED_POSTGRES_SYSTEM_IDENTIFIER ||
    row.role_name !== expectedRole ||
    row.session_user_name !== expectedRole ||
    !memberOfRoles ||
    memberOfRoles.length !== 1 ||
    memberOfRoles[0] !== expectedMembership ||
    row.transaction_read_only !== (expectedInsert ? 'off' : 'on') ||
    row.reachable_roles_digest !== expectedCatalogDigests.reachable_roles_digest ||
    row.relation_privileges_digest !== expectedCatalogDigests.relation_privileges_digest ||
    row.extra_column_privileges_digest !== expectedCatalogDigests.extra_column_privileges_digest ||
    row.sequence_privileges_digest !== expectedCatalogDigests.sequence_privileges_digest ||
    row.schema_privileges_digest !== expectedCatalogDigests.schema_privileges_digest ||
    row.rls_contract_digest !== expectedCatalogDigests.rls_contract_digest ||
    row.security_definer_body_digest !== expectedCatalogDigests.security_definer_body_digest ||
    !row.has_app_users ||
    !row.has_local_accounts ||
    !row.has_account_roles ||
    !row.can_select_local_accounts ||
    row.can_insert_local_accounts !== expectedInsert ||
    row.can_update_local_accounts ||
    row.can_delete_local_accounts ||
    row.can_truncate_local_accounts ||
    row.can_select_app_users ||
    row.can_insert_app_users ||
    row.can_update_app_users ||
    row.can_delete_app_users ||
    row.can_truncate_app_users ||
    row.can_select_account_roles ||
    row.can_insert_account_roles ||
    row.can_update_account_roles ||
    row.can_delete_account_roles ||
    row.can_truncate_account_roles ||
    !row.can_select_idempotency ||
    row.can_insert_idempotency !== expectedInsert ||
    row.can_update_idempotency !== expectedInsert ||
    row.can_delete_idempotency ||
    row.can_truncate_idempotency ||
    !row.can_select_watchlist ||
    row.can_insert_watchlist !== expectedInsert ||
    row.can_update_watchlist !== expectedInsert ||
    row.can_delete_watchlist ||
    row.can_truncate_watchlist ||
    !securityDefinerFunctions ||
    !equalStringArrays(securityDefinerFunctions, expectedSecurityDefinerFunctions) ||
    row.owns_application_relations ||
    row.owns_application_functions ||
    row.owns_application_schemas ||
    row.is_superuser ||
    row.can_create_role ||
    row.can_create_database ||
    row.can_bypass_rls ||
    row.can_create_database_objects ||
    row.can_create_public_schema_objects
  ) {
    throw new Error(`live database verification failed for ${expectedRole}`);
  }
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function queryProbePool(
  pool: ProbePool,
  timeoutMs: number,
  label: string,
): Promise<QueryResult> {
  // A hostile search_path (DSN options or the role's rolconfig) can shadow the
  // catalog helpers with look-alike objects and forge the whole contract, so
  // the probe pins it before reading anything. Every identifier in IDENTITY_SQL
  // is pg_catalog-qualified as defence in depth.
  if (!pool.connect) {
    return withTimeout(
      pool.query(PIN_SEARCH_PATH_SQL).then(() => pool.query(IDENTITY_SQL)),
      timeoutMs,
      label,
    );
  }
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  let client: ProbeClient | undefined;
  try {
    client = await withTimeout(pool.connect(), remaining(), `${label} connection`);
    await withTimeout(client.query(PIN_SEARCH_PATH_SQL), remaining(), `${label} search_path`);
    return await withTimeout(client.query(IDENTITY_SQL), remaining(), label);
  } finally {
    client?.release(true);
  }
}

export async function verifyLiveDatabaseTarget(
  env: ApiServerEnv,
  {
    createPool = (config) => new pg.Pool(config),
    verificationTimeoutMs = DEFAULT_VERIFICATION_TIMEOUT_MS,
    cleanupTimeoutMs = DEFAULT_CLEANUP_TIMEOUT_MS,
  }: LiveDatabaseVerifierDependencies = {},
): Promise<void> {
  if (!env.liveDatabaseExpected && !env.databaseWriteUrl) return;
  if (!env.databaseReadUrl || !env.databaseWriteUrl) {
    throw new Error('DATABASE_READ_URL and DATABASE_WRITE_URL are required in live database mode');
  }
  const readUrl = new URL(env.databaseReadUrl);
  if (readUrl.searchParams.get('options') !== '-c default_transaction_read_only=on') {
    throw new Error('DATABASE_READ_URL must enforce default_transaction_read_only=on');
  }
  // The writer DSN must not smuggle extra startup options (a hostile
  // `-c search_path=...` would shadow the catalog helpers the guard relies on).
  const writeUrl = new URL(env.databaseWriteUrl);
  if (writeUrl.searchParams.has('options')) {
    throw new Error('DATABASE_WRITE_URL must not carry startup options');
  }

  const createProbePool = (connectionString: string) =>
    createPool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 10_000,
      query_timeout: 10_000,
    });
  let readPool: ProbePool | undefined;
  let writePool: ProbePool | undefined;
  let verificationFailure: unknown;
  try {
    readPool = createProbePool(env.databaseReadUrl);
    writePool = createProbePool(env.databaseWriteUrl);
    const [readProbe, writeProbe] = await Promise.allSettled([
      queryProbePool(readPool, verificationTimeoutMs, 'live database reader identity probe'),
      queryProbePool(writePool, verificationTimeoutMs, 'live database writer identity probe'),
    ]);
    if (readProbe.status === 'rejected') throw readProbe.reason;
    if (writeProbe.status === 'rejected') throw writeProbe.reason;
    const readResult = readProbe.value;
    const writeResult = writeProbe.value;
    assertIdentity(readResult.rows[0], 'stock_insight_app_reader');
    assertIdentity(writeResult.rows[0], 'stock_insight_app_writer');
  } catch (error) {
    verificationFailure =
      error instanceof Error && error.message.startsWith('live database verification failed')
        ? error
        : new Error('live database verification failed: connection or identity probe error', {
            cause: error,
          });
  } finally {
    const cleanupResults = await Promise.allSettled(
      [readPool, writePool]
        .filter((pool): pool is ProbePool => Boolean(pool))
        .map((pool) =>
          withTimeout(
            Promise.resolve().then(() => pool.end()),
            cleanupTimeoutMs,
            'live database probe cleanup',
          ),
        ),
    );
    const cleanupFailure = cleanupResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    // Never throw from `finally`: it would overwrite the in-flight verification
    // failure and report a socket teardown problem for what is actually a
    // wrong-cluster or wrong-role connection.
    if (!verificationFailure && cleanupFailure) {
      verificationFailure = new Error('live database probe cleanup failed', {
        cause: cleanupFailure.reason,
      });
    }
  }
  if (verificationFailure) throw verificationFailure;
}
