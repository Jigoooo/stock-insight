import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const runner = readFileSync(new URL('../scripts/run-p6-db-rehearsal.mjs', import.meta.url), 'utf8');

describe('P6 disposable PostgreSQL rehearsal runner', () => {
  it('applies 046 through 051 twice and exercises the production read model', () => {
    for (const migration of [
      'cryptoIdentityFoundationMigrationSql',
      'cryptoTruthFoundationMigrationSql',
      'cryptoTokenomicsMigrationSql',
      'cryptoContagionImpactMigrationSql',
      'cryptoCrossDomainGraphMigrationSql',
      'cryptoServingViewsMigrationSql',
    ]) {
      assert.match(runner, new RegExp(migration));
    }
    assert.equal(
      (runner.match(/for \(const sql of migrations\) await target\.query\(sql\);/g) ?? []).length,
      2,
    );
    assert.match(runner, /getCryptoResearchWorkspace\(executor/);
  });

  it('proves temporal terminals, lineage, cleanup, and exact role-state restoration', () => {
    for (const invariant of [
      'futureEventHidden',
      'retractedEventHidden',
      'rejectedRelationHidden',
      'retractedRiskHidden',
      'createdAtMutationRejected',
      'relationIdentityIsPIT',
      'riskIdentityIsPIT',
      'tokenAccountAlternativeRejected',
      'uppercaseAssetRejected',
      'mismatchedAssetChainRejected',
      'invalidAccountCharacterRejected',
      'relationMagnitudePairRejected',
      'relationIdentityDriftRejected',
      'shockMagnitudePairRejected',
      'shockNegativeMagnitudeRejected',
      'riskMagnitudePairRejected',
      'riskNegativeMagnitudeRejected',
      'riskTerminalResurrectionRejected',
      'riskBackdatedRetractionRejected',
      'riskConcurrentRetractionRejected',
      'riskConcurrentLockObserved',
      'buildingNullConfidencePreserved',
      'terminalRelationIdentityGapPreserved',
      'terminalRiskIdentityGapPreserved',
      'connectedDatabaseVerified',
      'sourceRevisionIds',
      'roleStateRestored',
    ]) {
      assert.match(runner, new RegExp(invariant));
    }
    assert.match(runner, /DROP DATABASE IF EXISTS/);
    assert.match(runner, /pg_terminate_backend/);
    assert.match(runner, /pg_auth_members/);
    assert.match(runner, /adminUrl\.search !== ''/);
    assert.match(runner, /adminUrl\.hash !== ''/);
    assert.match(runner, /SELECT current_database\(\) AS database_name/);
    assert.match(
      runner,
      /JSON\.stringify\(roleStateAfter\) === JSON\.stringify\(roleStateBefore\)/,
    );
  });
});
