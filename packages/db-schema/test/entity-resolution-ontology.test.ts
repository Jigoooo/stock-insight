import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { entityResolutionOntologyMigrationSql } from '../src/migrations/033_entity_resolution_ontology.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('P1-W3 entity-resolution / ontology-RFC migration', () => {
  it('registers migration 033 and all resolution/ontology surfaces', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /entityResolutionOntologyMigrationSql/);
    assert.match(indexSource, /id: '033_entity_resolution_ontology'/);
    for (const surface of [
      'resolution_candidate',
      'resolution_feature',
      'resolution_decision',
      'ontology_rfc',
      'ontology_revision',
      'ontology_crosswalk',
    ]) {
      assert.match(indexSource, new RegExp(`'${surface}'`));
    }
  });

  it('never rewrites existing history destructively', () => {
    for (const token of destructiveTokens) {
      assert.doesNotMatch(entityResolutionOntologyMigrationSql, token);
    }
    assert.match(
      entityResolutionOntologyMigrationSql,
      /from knowledge\.predicate_ontology_revision/i,
    );
  });

  it('models a candidate pair with blocking key and typed feature evidence', () => {
    assert.match(
      entityResolutionOntologyMigrationSql,
      /create table if not exists knowledge\.resolution_candidate\s*\(/i,
    );
    assert.match(
      entityResolutionOntologyMigrationSql,
      /left_entity_id\s+bigint\s+not null\s+references core\.entity\s*\(entity_id\)/i,
    );
    assert.match(
      entityResolutionOntologyMigrationSql,
      /right_entity_id\s+bigint\s+not null\s+references core\.entity\s*\(entity_id\)/i,
    );
    assert.match(entityResolutionOntologyMigrationSql, /blocking_key\s+text\s+not null/i);
    assert.match(
      entityResolutionOntologyMigrationSql,
      /create table if not exists knowledge\.resolution_feature\s*\(/i,
    );
    assert.match(
      entityResolutionOntologyMigrationSql,
      /resolution_candidate_id\s+bigint\s+not null\s+references knowledge\.resolution_candidate/i,
    );
    // A candidate may not pair an entity with itself.
    assert.match(entityResolutionOntologyMigrationSql, /left_entity_id\s*<>\s*right_entity_id/i);
  });

  it('forbids forcing an ambiguous candidate into an auto link', () => {
    assert.match(
      entityResolutionOntologyMigrationSql,
      /create table if not exists knowledge\.resolution_decision\s*\(/i,
    );
    assert.match(
      entityResolutionOntologyMigrationSql,
      /decision\s+text\s+not null[\s\S]+auto_link[\s\S]+needs_review[\s\S]+non_link/i,
    );
    assert.match(entityResolutionOntologyMigrationSql, /classifier_score\s+numeric/i);
    // The auto-link floor is a machine gate.
    assert.match(entityResolutionOntologyMigrationSql, /resolution_auto_link_threshold/i);
    assert.match(
      entityResolutionOntologyMigrationSql,
      /create or replace function knowledge\.guard_resolution_decision_write/i,
    );
    assert.match(
      entityResolutionOntologyMigrationSql,
      /ambiguous candidate may not be auto-linked/i,
    );
    assert.match(entityResolutionOntologyMigrationSql, /is append-only/i);
  });

  it('controls ontology change through an RFC with a compatibility gate', () => {
    assert.match(
      entityResolutionOntologyMigrationSql,
      /create table if not exists knowledge\.ontology_rfc\s*\(/i,
    );
    assert.match(
      entityResolutionOntologyMigrationSql,
      /status\s+text\s+not null[\s\S]+draft[\s\S]+review[\s\S]+accepted[\s\S]+rejected[\s\S]+superseded/i,
    );
    assert.match(
      entityResolutionOntologyMigrationSql,
      /create table if not exists knowledge\.ontology_revision\s*\(/i,
    );
    assert.match(
      entityResolutionOntologyMigrationSql,
      /compatibility\s+text\s+not null[\s\S]+additive[\s\S]+backward[\s\S]+breaking/i,
    );
    assert.match(
      entityResolutionOntologyMigrationSql,
      /create or replace function knowledge\.guard_ontology_revision_write/i,
    );
    // Breaking predicate drift needs an explicit migration ledger reference.
    assert.match(
      entityResolutionOntologyMigrationSql,
      /breaking ontology revision requires a migration ledger reference/i,
    );
    assert.match(
      entityResolutionOntologyMigrationSql,
      /rfc supersession must reference the previous revision of the same rfc|invalid ontology rfc/i,
    );
  });

  it('maps external standards (LEI / FIBO) through a crosswalk', () => {
    assert.match(
      entityResolutionOntologyMigrationSql,
      /create table if not exists knowledge\.ontology_crosswalk\s*\(/i,
    );
    assert.match(
      entityResolutionOntologyMigrationSql,
      /standard\s+text\s+not null[\s\S]+lei_level_1[\s\S]+lei_level_2[\s\S]+fibo/i,
    );
    assert.match(entityResolutionOntologyMigrationSql, /external_id\s+text\s+not null/i);
  });

  it('seeds the ontology ledger from legacy predicate revisions without inventing links', () => {
    assert.match(entityResolutionOntologyMigrationSql, /insert into knowledge\.ontology_rfc/i);
    assert.match(entityResolutionOntologyMigrationSql, /legacy-predicate-seed/i);
    assert.match(entityResolutionOntologyMigrationSql, /insert into knowledge\.ontology_revision/i);
    // The seed compatibility is additive (non-breaking) so no ledger ref is required.
    assert.match(entityResolutionOntologyMigrationSql, /'additive'/i);
    // Resolution ledger starts empty (no forced legacy backfill), guarded only.
    assert.match(entityResolutionOntologyMigrationSql, /P1-W3 ontology seed/i);
  });

  it('grants least-privilege access and denies deletes on the new surfaces', () => {
    assert.match(entityResolutionOntologyMigrationSql, /grant select, insert on/i);
    assert.match(entityResolutionOntologyMigrationSql, /to si_knowledge/i);
    assert.match(entityResolutionOntologyMigrationSql, /grant select on/i);
    assert.doesNotMatch(entityResolutionOntologyMigrationSql, /grant\s+delete/i);
  });
});
