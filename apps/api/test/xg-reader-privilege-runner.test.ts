import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const runner = readFileSync(
  new URL('../scripts/run-xg-reader-privilege-rehearsal.mjs', import.meta.url),
  'utf8',
);
const rootPackage = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };

describe('XG reader privilege rehearsal runner', () => {
  it('rejects inherited raw ACLs, then replays migration 052 and probes allowed plus denied reads', () => {
    assert.equal(
      (runner.match(/target\.query\(personalizationReaderSurfaceHardeningMigrationSql\)/g) ?? [])
        .length,
      4,
    );
    for (const probe of [
      'readerSurfaceVerified',
      'writerSurfaceVerified',
      'inheritedColumnPrivilegeRejected',
      'publicColumnPrivilegeRejected',
      'connectedDatabaseVerified',
    ]) {
      assert.match(runner, new RegExp(probe));
    }
    assert.match(runner, /error\?\.code === '42501'/);
    assert.match(runner, /GRANT \$\{quotedInheritedRole\} TO stock_insight_reader/);
    assert.match(runner, /GRANT SELECT \(reviewer_ref\)/);
    assert.match(runner, /GRANT SELECT \(packet_digest\)[\s\S]*TO PUBLIC/);
    assert.match(runner, /decisionAllowedColumns\.join/);
    assert.match(runner, /legalAllowedColumns\.join/);
    assert.match(runner, /for \(const column of decisionDeniedColumns\)/);
    assert.match(runner, /DROP ROLE IF EXISTS \$\{quotedInheritedRole\}/);
  });

  it('restores exact role state and removes the disposable database', () => {
    assert.match(runner, /pg_auth_members/);
    assert.match(runner, /roleStateRestored/);
    assert.match(
      runner,
      /JSON\.stringify\(roleStateAfter\) === JSON\.stringify\(roleStateBefore\)/,
    );
    assert.match(runner, /pg_terminate_backend/);
    assert.match(runner, /DROP DATABASE IF EXISTS/);
    assert.match(runner, /adminUrl\.search !== ''/);
    assert.match(runner, /adminUrl\.hash !== ''/);
    assert.match(runner, /SELECT current_database\(\) AS database_name/);
  });

  it('is mandatory in the root release command', () => {
    assert.equal(
      rootPackage.scripts['test:xg:db'],
      'pnpm --filter @stock-insight/api test:xg-reader-privileges',
    );
    assert.match(rootPackage.scripts['verify:release'] ?? '', /pnpm test:xg:db/);
  });
});
