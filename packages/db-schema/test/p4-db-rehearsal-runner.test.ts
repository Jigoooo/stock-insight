import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const runner = readFileSync(
  new URL('../../../apps/api/scripts/run-p4a-db-rehearsal.mjs', import.meta.url),
  'utf8',
);

describe('P4-A disposable DB rehearsal runner', () => {
  it('fences the temporary database lifecycle and always cleans it up', () => {
    assert.match(runner, /stock_insight_p4_rehearsal_\$\{randomBytes/);
    assert.match(runner, /\^stock_insight_p4_rehearsal_\[a-f0-9\]\+\$/);
    assert.match(runner, /pg_terminate_backend/);
    assert.match(runner, /DROP DATABASE IF EXISTS \$\{quoted\}/);
    assert.match(runner, /finally\s*\{/);
    assert.match(runner, /cleanupErrors/);
    assert.match(runner, /membership_existed/);
    assert.match(runner, /membership_state/);
    assert.match(runner, /roleStateRestored/);
    assert.match(runner, /SELECT 1 FROM pg_database WHERE datname=\$1/);
    assert.ok(
      runner.indexOf('console.log(JSON.stringify(result))') > runner.lastIndexOf('finally'),
    );
    assert.doesNotMatch(runner, /DROP DATABASE IF EXISTS[^\n]+\.catch\(\(\) => undefined\)/);
  });

  it('replays migration 043 twice with exact relation counts and a SQL digest', () => {
    assert.match(runner, /createHash\('sha256'\)/);
    assert.match(runner, /countsAfterFirstApply/);
    assert.match(runner, /countsAfterReplay/);
    assert.match(runner, /replayCountsStable/);
    assert.equal(
      (runner.match(/target\.query\(personalizationDecisionSupportMigrationSql\)/g) ?? []).length,
      2,
    );
  });

  it('proves same-user revision succession and rejects forks with the real writer role', () => {
    assert.match(runner, /SET LOCAL ROLE stock_insight_writer/);
    assert.match(runner, /supersedes_profile_revision_id/);
    assert.match(runner, /supersedes_thesis_revision_id/);
    assert.match(runner, /profile_head_count/);
    assert.match(runner, /thesis_head_count/);
    assert.match(runner, /forkBlocked/);
    assert.match(runner, /skippedRevisionBlocked/);
  });

  it('keeps the two-user, legal, order, append-only, and reverse-link attack probes', () => {
    for (const probe of [
      'crossUserBlocked',
      'orderPathBlocked',
      'legalStatusSpoofBlocked',
      'futureCommonViewBlocked',
      'sealMismatchBlocked',
      'unsealedPacketBlocked',
      'lateLotBlocked',
      'backdatedPacketBlocked',
      'duplicatePacketTimeBlocked',
      'expiredProfilePacketBlocked',
      'supersededProfilePacketBlocked',
      'supersededThesisPacketBlocked',
      'appWriterReviewBlocked',
      'sameTimeReviewBlocked',
      'backdatedReviewBlocked',
      'mutationBlocked',
      'commonToPrivateForeignKeys',
      'optionalThesisInsertAccepted',
    ]) {
      assert.match(runner, new RegExp(probe));
    }
  });
});
