// Recomputes the catalog digests that apps/api-server/src/db/live-database-guard.ts
// pins for stock_insight_app_reader and stock_insight_app_writer.
//
// The guard hashes what each application role can reach — relation privileges,
// schema privileges, RLS contract, SECURITY DEFINER bodies — and refuses to boot
// when the live database disagrees with the pinned digest. That is deliberate:
// any change to what the app can read has to be re-pinned by a human rather than
// picked up silently.
//
// It also means a migration that adds or grants a serving view will crashloop the
// brain on next deploy, with only "live database verification failed for <role>"
// in the log and no indication of which of the ~40 conditions failed. That
// happened on 2026-08-03 with migration 059 (serving.impact_summary_v2), which is
// why this exists.
//
// Usage:
//   DATABASE_URL=… node ops/scripts/repin-live-database-digests.mjs
//
// It prints the live digests next to the pinned ones and names the differences.
// Read the diff before copying: a digest change you cannot explain from your own
// migration means something else altered the app roles' reach, and that is the
// tripwire doing its job.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const pg = require('pg');

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error('DATABASE_URL is required');

const guardPath = new URL('../../apps/api-server/src/db/live-database-guard.ts', import.meta.url)
  .pathname;
const guardSource = readFileSync(guardPath, 'utf8');

// The probe is a template literal that interpolates one other constant. Reading
// it out of the guard rather than restating it keeps this script from drifting
// away from the check it is meant to re-pin.
function templateLiteral(name) {
  const start = guardSource.indexOf(`const ${name} = \``);
  if (start === -1) throw new Error(`cannot find ${name} in live-database-guard.ts`);
  const from = guardSource.indexOf('`', start) + 1;
  const to = guardSource.indexOf('`;', from);
  if (to === -1) throw new Error(`cannot find end of ${name}`);
  return guardSource.slice(from, to);
}

const aclSql = templateLiteral('SECURITY_DEFINER_ACL_JSON_SQL');
const chunkExclusionSql = templateLiteral('TIMESCALE_CHUNK_EXCLUSION');

// Function replacements, not string ones. A replacement *string* expands `$&`,
// `$'`, "$`" and `$n` — and the chunk exclusion contains `_chunk$'` from its regex
// anchor, where `$'` means "everything after the match" and silently splices the
// rest of the query back in. The result still parses as text and fails only when
// Postgres sees it. A function replacement is returned verbatim.
// aclSql goes through the same form because a SECURITY DEFINER body probe is
// exactly the kind of SQL that grows a `$$` quote later.
const identitySql = templateLiteral('IDENTITY_SQL')
  .replaceAll('${SECURITY_DEFINER_ACL_JSON_SQL}', () => aclSql)
  .replaceAll('${TIMESCALE_CHUNK_EXCLUSION}', () => chunkExclusionSql);

if (/\$\{[A-Z_]+\}/.test(identitySql)) {
  // A placeholder that survives reaches Postgres as a syntax error at some
  // unrelated position. Naming it here costs one line and saves the hunt.
  throw new Error(
    `unresolved placeholder in IDENTITY_SQL: ${identitySql.match(/\$\{[A-Z_]+\}/g).join(', ')}`,
  );
}

const DIGEST_KEYS = [
  'reachable_roles_digest',
  'relation_privileges_digest',
  'extra_column_privileges_digest',
  'sequence_privileges_digest',
  'schema_privileges_digest',
  'rls_contract_digest',
  'security_definer_body_digest',
];

function pinnedDigests(role) {
  const block = guardSource.slice(guardSource.indexOf(`  ${role}: {`));
  const end = block.indexOf('  },');
  const body = block.slice(0, end);
  return Object.fromEntries(
    DIGEST_KEYS.map((key) => {
      const match = body.match(new RegExp(`${key}:\\s*\\n?\\s*'([a-f0-9]{64})'`));
      return [key, match?.[1] ?? null];
    }),
  );
}

const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
let drift = 0;
try {
  for (const role of ['stock_insight_app_reader', 'stock_insight_app_writer']) {
    // Read-only and rolled back: this script never changes what it measures.
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query('SET search_path = pg_catalog, public');
    const { rows } = await client.query(identitySql);
    await client.query('ROLLBACK');

    const live = rows[0];
    const pinned = pinnedDigests(role);
    console.log(`\n${role}`);
    for (const key of DIGEST_KEYS) {
      const same = live[key] === pinned[key];
      if (!same) drift += 1;
      console.log(`  ${same ? '  ' : '≠ '}${key}`);
      if (!same) {
        console.log(`      pinned ${pinned[key]}`);
        console.log(`      live   ${live[key]}`);
      }
    }
  }
} finally {
  client.release();
  await pool.end();
}

console.log(
  drift === 0
    ? '\n일치 — 재핀 불필요.'
    : `\n${drift}개 digest 가 어긋난다. 각각을 자신의 마이그레이션으로 설명할 수 있을 때만 옮겨 적을 것.`,
);
process.exit(drift === 0 ? 0 : 1);
