import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const runnerUrl = new URL('../scripts/run-sec-numeric-fact-rehearsal.mjs', import.meta.url);
const runner = existsSync(runnerUrl) ? readFileSync(runnerUrl, 'utf8') : '';
const libraryUrl = new URL('../scripts/sec-numeric-fact-rehearsal-lib.mjs', import.meta.url);
const library = existsSync(libraryUrl) ? readFileSync(libraryUrl, 'utf8') : '';
const duplicateHelperUrl = new URL(
  '../scripts/sec-numeric-fact-rehearsal-helpers.mjs',
  import.meta.url,
);
const implementation = `${runner}\n${library}`;
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { scripts: Record<string, string> };

describe('SEC numeric-fact disposable PostgreSQL rehearsal', () => {
  it('is registered and reapplies the exact schema contracts', () => {
    assert.equal(existsSync(runnerUrl), true);
    assert.equal(existsSync(libraryUrl), true);
    assert.equal(existsSync(duplicateHelperUrl), false);
    assert.doesNotMatch(runner, /sec-numeric-fact-rehearsal-helpers/);
    assert.equal(
      packageJson.scripts['rehearse:sec-numeric-fact:db'],
      'node scripts/run-sec-numeric-fact-rehearsal.mjs',
    );
    assert.match(implementation, /additiveAppMigrations/);
    assert.match(implementation, /090_numeric_fact_revision_guard/);
    assert.match(implementation, /migrationReapplyVerified/);
  });

  it('requires an admin DSN and guarantees uniquely scoped cleanup', () => {
    assert.match(runner, /SEC_NUMERIC_FACT_REHEARSAL_ADMIN_DATABASE_URL/);
    assert.match(runner, /stock_insight_sec_rehearsal_/);
    assert.match(implementation, /SELECT current_database\(\)/);
    assert.match(runner, /DROP DATABASE IF EXISTS/);
    assert.match(runner, /finally/);
    assert.doesNotMatch(implementation, /research-app-postgres/);
  });

  it('uses verified raw bytes and exercises every production mode', () => {
    assert.match(implementation, /writeRawObject/);
    assert.doesNotMatch(implementation, /const\s+\w+\s*=\s*false/);
    assert.match(implementation, /runSecCli/);
    assert.match(implementation, /countCanonicalRows/);
    assert.match(implementation, /assertEvidence/);
    assert.match(implementation, /sourceRevisionContentHashVerified/);
    for (const invariant of [
      'dryRunReadOnly',
      'rehearsalRolledBack',
      'firstApplyCommitted',
      'secondApplyIdempotent',
      'unchangedComparativeSuppressed',
      'changedAmendmentRevised',
      'exactNMinusOneSupersedes',
      'locatorLineageVerified',
      'pitAxesVerified',
      'definitionBindingVerified',
      'multipleGroupsWritten',
    ]) {
      assert.match(implementation, new RegExp(invariant));
    }
  });

  it('directly attacks migration 090 and the provider lock', () => {
    assert.match(implementation, /expectRevisionRejected/);
    assert.match(implementation, /observeProviderLock/);
    for (const invariant of [
      'wrongGroupRejected',
      'wrongRevisionRejected',
      'claimStructureRejected',
      'fiscalDriftRejected',
      'definitionDriftRejected',
      'backwardKnownAtRejected',
      'backwardAvailableAtRejected',
      'appendOnlyMutationRejected',
      'dartDistinctFactKeyAccepted',
      'providerAdvisoryLockObserved',
      'cleanupVerified',
    ]) {
      assert.match(implementation, new RegExp(invariant));
    }
  });
});
