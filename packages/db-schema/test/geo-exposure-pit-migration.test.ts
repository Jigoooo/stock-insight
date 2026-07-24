import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { geoExposurePitUniverseMigrationSql } from '../src/migrations/035_geo_exposure_pit_universe.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('P1-W5 geo-exposure / PIT-universe migration', () => {
  it('registers migration 035 and all exposure/security surfaces', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /geoExposurePitUniverseMigrationSql/);
    assert.match(indexSource, /id: '035_geo_exposure_pit_universe'/);
    for (const surface of [
      'geo_entity_exposure_revision',
      'security_master',
      'security_listing_revision',
      'security_ticker_history',
      'security_corporate_action',
      'pit_universe_membership',
    ]) {
      assert.match(indexSource, new RegExp(`'${surface}'`));
    }
  });

  it('never rewrites history destructively', () => {
    for (const token of destructiveTokens) {
      assert.doesNotMatch(geoExposurePitUniverseMigrationSql, token);
    }
    assert.match(geoExposurePitUniverseMigrationSql, /from core\.listing/i);
  });

  it('records geo exposure as an evidenced ratio that cannot omit the denominator', () => {
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /create table if not exists geo\.entity_exposure_revision\s*\(/i,
    );
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /exposure_kind\s+text\s+not null[\s\S]+revenue[\s\S]+asset[\s\S]+production[\s\S]+supply/i,
    );
    assert.match(geoExposurePitUniverseMigrationSql, /numerator\s+numeric\s+not null/i);
    assert.match(geoExposurePitUniverseMigrationSql, /denominator\s+numeric/i);
    // A ratio with no denominator is rejected (no bare ratio without its base).
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /ratio is null or \(denominator is not null and denominator\s*<>\s*0\)/i,
    );
    assert.match(geoExposurePitUniverseMigrationSql, /derivation_priority\s+integer/i);
    assert.match(geoExposurePitUniverseMigrationSql, /evidence_locator\s+jsonb\s+not null/i);
  });

  it('builds a security master with append-only listing revisions', () => {
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /create table if not exists core\.security_master\s*\(/i,
    );
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /create table if not exists core\.security_listing_revision\s*\(/i,
    );
    assert.match(geoExposurePitUniverseMigrationSql, /share_class\s+text/i);
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /create or replace function core\.guard_security_listing_revision_write/i,
    );
    assert.match(geoExposurePitUniverseMigrationSql, /is append-only/i);
  });

  it('forbids overlapping ticker tenure on the same exchange', () => {
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /create table if not exists core\.security_ticker_history\s*\(/i,
    );
    // Exclusion constraint (GiST + tstzrange) prevents ticker reuse overlap.
    assert.match(geoExposurePitUniverseMigrationSql, /exclude using gist/i);
    assert.match(geoExposurePitUniverseMigrationSql, /tstzrange\s*\(/i);
    assert.match(geoExposurePitUniverseMigrationSql, /btree_gist/i);
  });

  it('captures corporate actions (delist / split / merger / ticker reuse)', () => {
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /create table if not exists core\.security_corporate_action\s*\(/i,
    );
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /action_kind\s+text\s+not null[\s\S]+delisting[\s\S]+split[\s\S]+merger[\s\S]+ticker_reuse/i,
    );
  });

  it('models a point-in-time universe that cannot leak a future constituent', () => {
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /create table if not exists analytics\.pit_universe_membership\s*\(/i,
    );
    assert.match(geoExposurePitUniverseMigrationSql, /as_of\s+timestamptz\s+not null/i);
    assert.match(geoExposurePitUniverseMigrationSql, /known_at\s+timestamptz\s+not null/i);
    // known_at must dominate as_of so a future constituent is never visible early.
    assert.match(geoExposurePitUniverseMigrationSql, /check\s*\(known_at\s*>=\s*as_of\)/i);
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /create or replace function analytics\.guard_pit_universe_write/i,
    );
    assert.match(
      geoExposurePitUniverseMigrationSql,
      /point-in-time universe cannot admit a future constituent/i,
    );
  });

  it('grants least-privilege access and denies deletes on the new surfaces', () => {
    assert.match(geoExposurePitUniverseMigrationSql, /grant select, insert on/i);
    assert.match(geoExposurePitUniverseMigrationSql, /grant select on/i);
    assert.doesNotMatch(geoExposurePitUniverseMigrationSql, /grant\s+delete/i);
  });
});
