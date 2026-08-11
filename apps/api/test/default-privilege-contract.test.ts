import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

// No schema may hand the application roles a privilege on tables nobody has decided to
// share. This is the check that was missing when the same failure shipped twice.
//
// 2026-08-03, migration 059: serving.impact_summary_v2 was created, the reader received
// SELECT on it without any GRANT in the file, relation_privileges_digest moved, and
// live-database-guard.ts threw on boot. The log said only "live database verification
// failed for stock_insight_app_reader" — no indication which of ~40 conditions failed —
// and ops/scripts/repin-live-database-digests.mjs was written to make the next one
// diagnosable.
//
// 2026-08-10, migration 099: identical failure. Its header states, in good faith, "NO
// grant to stock_insight_app_reader and NO EXPECTED_CATALOG_DIGESTS change", while all
// four of its serving relations carry `stock_insight_app_reader=r/research_app` in
// pg_class.relacl. The author was right about the file and wrong about the database,
// because migration 007 line 159 left an ALTER DEFAULT PRIVILEGES standing in serving —
// and five sibling schemas carried the same instruction.
//
// A repin script makes the second occurrence cheaper to diagnose. It does not stop a
// third. Migration 117 removed all six default privileges; this test is what keeps them
// from being reintroduced.
//
// WHAT MAKES THIS RUN, AND WHAT STILL DOES NOT, stated at this length because the mistake
// above was a header that was true about its file and false about the world.
//
// Until 2026-08-11 this did not run in `pnpm test` at all: the turbo `test` task declared
// no `env` or `passThroughEnv` and turbo runs in strict env mode, so DATABASE_URL never
// reached the child process and this skipped — silently, inside a suite that reported
// green. That was not specific to this file; 47 tests in this package skipped that way.
// `turbo.json` now lists DATABASE_URL and STOCK_INSIGHT_LIVE_READ_DB_URL (with the other
// live keys the tests here read) under the `test` task, so with a URL in the environment
// the count measured through turbo is 45 skipped, 1309 of 1354 passing, zero failures.
//
// 키를 어느 목록에 두느냐가 그 다음 문제이고, 둘의 차이가 이 문단의 전부다.
// `passThroughEnv` 는 어떤 변수가 자식 프로세스에 **닿는지**만 선언하고 값은 캐시 키에
// 들어가지 않는다. 그 상태로는 URL 없는 실행이 URL 있는 캐시를 재생할 수 있고, 더 나쁘게는
// URL 을 제대로 넣은 실행이 오래된 no-DB 캐시를 재생해 DB 계약 테스트를 조용히 건너뛴다.
// `env` 는 값이 해시에 들어가므로 URL 상태가 바뀌면 캐시가 무효화된다. 그래서 키들은
// `env` 에 있고, `pnpm test` 의 초록은 최소한 "이 URL 상태로 실제 실행된 결과" 를 뜻한다.
//
// 확인 방법은 해시 값이 아니라 **분리 여부**다. URL 을 넣은 실행과 `env -u DATABASE_URL`
// 실행이 `@stock-insight/api#test` 에 대해 서로 다른 해시를 내면 참이고, 같으면 거짓이다.
// 특정 해시 문자열을 여기 적지 않는 이유는 그것이 증거가 못 되기 때문이다 — 이 파일 자신이
// 그 해시의 입력이라 숫자를 적는 순간 무효가 되고, 값은 머신과 워킹트리에 따라 달라진다.
// 내구성 있는 단언은 live-read-surface-gate-runner.test.ts 가 갖고 있다: 키가 `env` 에
// 있을 것 **그리고** `passThroughEnv` 로 돌아가 있지 않을 것.
//
// 대가는 명시해 둔다: `env` 는 `test` 태스크 전체에 걸리므로 DB 를 전혀 쓰지 않는
// 패키지(web·ui·contracts)의 test 캐시도 DATABASE_URL 변화에 무효화된다. 캐시 적중률을
// 정확성과 맞바꾼 것이고, 이 방향이 맞다. `build` 는 건드리지 않았다 — 빌드 산출물은
// 이 키들에 의존하지 않는다.
//
// 그래도 `pnpm test` 를 단독 게이트로 부르지는 않는다. 캐시는 정직해졌지만 URL 이
// 애초에 환경에 없으면 이 파일은 여전히 (이제는 정직하게) skip 되기 때문이다.
//
// The gate is `pnpm test:read-surface:db`, in the `verify:release` chain. It bypasses
// turbo, injects the URL under both key names, runs this file plus
// live-common-asset-view-privacy.test.ts, and fails unless the suite reports `skipped 0` —
// so it cannot pass by not running. live-read-surface-gate-runner.test.ts asserts that
// chain membership on every ordinary test run, which is what `test:core-release` lacks:
// that gate is real, correct, and referenced by nothing, so it has never failed a release.
// That same runner test pins both filenames and the `skipped 0` assertion, so the
// paragraph above fails a test rather than quietly going stale if the runner is edited —
// which is the only reason it is safe to describe another file's contents from here.
//
// Still true, and not fixed here: there is no `.github/workflows` directory, so no CI
// fails on any of this. Everything above depends on someone running `verify:release`.
//
// Beyond the outage, personalization was among the six. REQ-SEM-003 and REQ-REC-001 hold
// that private per-user derivations are readable only by explicit decision — three of
// that schema's ten tables are, deliberately and scoped by a transaction-local user GUC.
// A default privilege would have added the eleventh table silently.
//
// Requires a live connection. Skipped without one, because a check that silently passes
// when it cannot run is worse than no check.
const databaseUrl = process.env.STOCK_INSIGHT_LIVE_READ_DB_URL ?? process.env.DATABASE_URL;
const skipReason = databaseUrl
  ? false
  : 'STOCK_INSIGHT_LIVE_READ_DB_URL or DATABASE_URL is required';

// aclexplode rather than a LIKE over defaclacl::text. The text form is
// `grantee=privs/grantor`, so a substring match also fires on the grantor half and would
// pass or fail for the wrong reason. Expanding the ACL compares the grantee OID itself.
//
// PUBLIC IS IN THE LIST BECAUSE THE ROLE NAMES ARE NOT THE THING BEING PROTECTED. A
// default privilege granted `TO PUBLIC` records grantee OID 0, which renders as '-' and
// slips past a filter that names the two app roles — while still handing the reader
// SELECT on every future table, because PUBLIC includes it. The boot guard measures
// effective privilege (`has_table_privilege(current_user, ...)`), so that route moves the
// same digests and crashloops the brain identically. Reproduced 2026-08-11: a default ACL
// granted to PUBLIC left `has_table_privilege('stock_insight_app_reader', ..., 'SELECT')`
// true while the role-name filter returned nothing. No migration in this package grants
// anything TO PUBLIC today (only REVOKE ... FROM PUBLIC appears), so this is a door being
// shut before anyone walks through it, not a leak being patched.
const DEFAULT_ACL_SQL = `
  SELECT default_acl.defaclnamespace::regnamespace::text AS schema_name,
         default_acl.defaclobjtype AS object_type,
         CASE WHEN entry.grantee = 0 THEN 'PUBLIC'
              ELSE entry.grantee::regrole::text
         END AS grantee_name,
         entry.privilege_type AS privilege
    FROM pg_catalog.pg_default_acl default_acl
   CROSS JOIN pg_catalog.aclexplode(default_acl.defaclacl) entry
   WHERE entry.grantee = 0
      OR entry.grantee::regrole::text IN (
           'stock_insight_app_reader',
           'stock_insight_app_writer'
         )
   ORDER BY 1, 2, 3, 4
`;

describe('no schema grants the app roles privileges on objects by default', () => {
  it(
    'has no pg_default_acl entry reaching the app roles, by name or through PUBLIC',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      try {
        const client = await pool.connect();
        try {
          // Read-only and rolled back: this test never changes what it measures.
          await client.query('BEGIN READ ONLY');
          const { rows } = await client.query(DEFAULT_ACL_SQL);
          await client.query('ROLLBACK');

          // Named, not counted. A failure here has to say which schema to write the
          // REVOKE against, or the next author repeats the hunt this test exists to end.
          const offenders = rows.map(
            (row) =>
              `${row.schema_name} (objtype ${row.object_type}): ${row.grantee_name} ${row.privilege}`,
          );
          assert.deepEqual(
            offenders,
            [],
            `pg_default_acl grants the app roles privileges on future objects. Every object created in these schemas is handed over with no GRANT in any migration, which moves the catalog digests in live-database-guard.ts and crashloops the brain on boot. Add an ALTER DEFAULT PRIVILEGES ... REVOKE in a new migration, as 117 did:\n  ${offenders.join('\n  ')}`,
          );
        } finally {
          client.release();
        }
      } finally {
        await pool.end();
      }
    },
  );
});
