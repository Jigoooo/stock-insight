import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { worldEventTemporalLineageMigrationSql } from '../src/migrations/032_world_event_temporal_lineage.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('P1-W2 world-event temporal-lineage migration', () => {
  it('registers migration 032 and all world-event surfaces', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /worldEventTemporalLineageMigrationSql/);
    assert.match(indexSource, /id: '032_world_event_temporal_lineage'/);
    for (const surface of [
      'world_event',
      'world_event_revision',
      'world_event_participant',
      'world_reified_obligation',
      'ingestion_story',
      'ingestion_content_artifact',
    ]) {
      assert.match(indexSource, new RegExp(`'${surface}'`));
    }
  });

  it('never rewrites legacy history destructively', () => {
    for (const token of destructiveTokens) {
      assert.doesNotMatch(worldEventTemporalLineageMigrationSql, token);
    }
    // Legacy event table is preserved and only read for the additive backfill.
    assert.match(worldEventTemporalLineageMigrationSql, /from knowledge\.event/i);
    assert.doesNotMatch(worldEventTemporalLineageMigrationSql, /drop.*knowledge\.event/i);
  });

  it('models the event as an n-ary stateful object with a bitemporal revision chain', () => {
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /create table if not exists world\.event\s*\(/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /create table if not exists world\.event_revision\s*\(/i,
    );
    // Lifecycle state machine domain.
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /lifecycle_state\s+text\s+not null[\s\S]+rumored[\s\S]+announced[\s\S]+confirmed[\s\S]+effective[\s\S]+expired[\s\S]+repealed/i,
    );
    // Bitemporal columns with a future-known guard.
    assert.match(worldEventTemporalLineageMigrationSql, /available_at\s+timestamptz\s+not null/i);
    assert.match(worldEventTemporalLineageMigrationSql, /known_at\s+timestamptz\s+not null/i);
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /check\s*\(known_at\s*>=\s*available_at\)/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /valid_until is null or valid_from is null or valid_until\s*>=\s*valid_from/i,
    );
    // Revision-chain integrity: rev>1 requires a supersession to the same event.
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /revision_no > 1 and supersedes_event_revision_id is not null/i,
    );
  });

  it('enforces the forward-only lifecycle state machine in a guard', () => {
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /create or replace function world\.guard_event_revision_write/i,
    );
    // Forward transitions must be validated; a backward/skip transition is rejected.
    assert.match(worldEventTemporalLineageMigrationSql, /invalid event lifecycle transition/i);
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /event supersession must reference the previous revision of the same event/i,
    );
    assert.match(worldEventTemporalLineageMigrationSql, /is append-only/i);
  });

  it('adds n-ary participants with entity and location roles bound to a live revision', () => {
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /create table if not exists world\.event_participant\s*\(/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /event_revision_id\s+bigint\s+not null\s+references world\.event_revision\s*\(event_revision_id\)/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /participant_role\s+text\s+not null[\s\S]+actor[\s\S]+target[\s\S]+affected[\s\S]+counterparty[\s\S]+jurisdiction[\s\S]+issuer[\s\S]+regulator/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /location_role\s+text[\s\S]+source[\s\S]+actual[\s\S]+jurisdiction[\s\S]+target[\s\S]+affected/i,
    );
  });

  it('reifies Contract/Regulation obligations anchored to an event revision', () => {
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /create table if not exists world\.reified_obligation\s*\(/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /obligation_kind\s+text\s+not null[\s\S]+contract[\s\S]+regulation/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /event_revision_id\s+bigint\s+not null\s+references world\.event_revision/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /period_end is null or period_start is null or period_end\s*>=\s*period_start/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /currency is null or currency\s*~\s*'\^\[A-Z\]\{3\}\$'/i,
    );
  });

  it('captures story syndication and translation/artifact provenance lineage', () => {
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /create table if not exists ingestion\.story\s*\(/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /near_duplicate_of_story_id\s+bigint\s+references ingestion\.story/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /create table if not exists ingestion\.content_artifact\s*\(/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /artifact_kind\s+text\s+not null[\s\S]+raw[\s\S]+translation[\s\S]+parsed[\s\S]+ocr/i,
    );
    // Translation-without-original is forbidden.
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /artifact_kind\s*<>\s*'translation'\s+or\s+original_artifact_id is not null/i,
    );
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /translation artifact must reference an original artifact of the same source record/i,
    );
  });

  it('back-projects every legacy event one-to-one without inventing entity links', () => {
    // Legacy dedupe_key becomes a story cluster.
    assert.match(worldEventTemporalLineageMigrationSql, /insert into ingestion\.story/i);
    assert.match(worldEventTemporalLineageMigrationSql, /legacy-event:'\|\|/i);
    // unverified legacy events map to the most conservative lifecycle state.
    assert.match(worldEventTemporalLineageMigrationSql, /'rumored'/i);
    // known_at must dominate available_at even for legacy rows.
    assert.match(worldEventTemporalLineageMigrationSql, /greatest\(/i);
    // Participants are only projected where a real target entity exists.
    assert.match(
      worldEventTemporalLineageMigrationSql,
      /where\s+event\.target_entity_id is not null/i,
    );
    // Post-backfill parity assertion must exist.
    assert.match(worldEventTemporalLineageMigrationSql, /P1-W2 world-event backfill/i);
  });

  it('grants least-privilege access and denies deletes on the new surfaces', () => {
    assert.match(worldEventTemporalLineageMigrationSql, /grant select, insert on/i);
    assert.match(worldEventTemporalLineageMigrationSql, /to si_knowledge/i);
    assert.match(worldEventTemporalLineageMigrationSql, /grant select on/i);
    assert.doesNotMatch(worldEventTemporalLineageMigrationSql, /grant\s+delete/i);
  });
});
