import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { truthKernelMigrationSql } from '../src/migrations/031_truth_kernel.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('P1-W1 truth-kernel migration', () => {
  it('registers migration 031 and all truth-kernel surfaces', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /truthKernelMigrationSql/);
    assert.match(indexSource, /id: '031_truth_kernel'/);
    for (const surface of [
      'truth_assertion',
      'truth_numeric_fact',
      'truth_derivation_dag',
      'truth_coverage_ledger',
      'truth_conflict_set',
    ]) {
      assert.match(indexSource, new RegExp(`'${surface}'`));
    }
  });

  it('physically separates source-backed assertions and normalized numeric facts', () => {
    assert.match(truthKernelMigrationSql, /create table if not exists knowledge\.assertion/i);
    assert.match(
      truthKernelMigrationSql,
      /source_revision_id\s+bigint\s+not null\s+references ingestion\.source_revision\s*\(source_revision_id\)/i,
    );
    assert.match(
      truthKernelMigrationSql,
      /subject_entity_id\s+bigint\s+not null\s+references core\.entity\s*\(entity_id\)/i,
    );
    assert.match(
      truthKernelMigrationSql,
      /polarity\s+text\s+not null[\s\S]+affirmed[\s\S]+negated/i,
    );
    assert.match(
      truthKernelMigrationSql,
      /modality\s+text\s+not null[\s\S]+factual[\s\S]+planned[\s\S]+possible[\s\S]+alleged[\s\S]+forecast/i,
    );
    assert.match(
      truthKernelMigrationSql,
      /verification_state\s+text\s+not null[\s\S]+verified_span[\s\S]+verified_semantics[\s\S]+accepted[\s\S]+quarantined/i,
    );
    assert.match(truthKernelMigrationSql, /source_span_locator\s+jsonb\s+not null/i);
    assert.match(truthKernelMigrationSql, /parser_version\s+text\s+not null/i);
    assert.match(truthKernelMigrationSql, /extraction_run_id\s+text\s+not null/i);

    assert.match(truthKernelMigrationSql, /create schema if not exists world/i);
    assert.match(truthKernelMigrationSql, /create table if not exists world\.numeric_fact/i);
    assert.match(truthKernelMigrationSql, /value\s+numeric\s+not null/i);
    assert.match(truthKernelMigrationSql, /unit\s+text\s+not null/i);
    assert.match(truthKernelMigrationSql, /dimensions_json\s+jsonb\s+not null/i);
    assert.match(truthKernelMigrationSql, /original_cell_or_xbrl_locator\s+jsonb\s+not null/i);
    assert.match(truthKernelMigrationSql, /restatement_group_key\s+text\s+not null/i);
    assert.match(
      truthKernelMigrationSql,
      /supersedes_numeric_fact_id\s+bigint\s+references world\.numeric_fact\s*\(numeric_fact_id\)/i,
    );
  });

  it('adds a sealed multi-input derivation DAG and gives every pack item exactly one derivation', () => {
    assert.match(truthKernelMigrationSql, /create table if not exists knowledge\.derivation\s*\(/i);
    assert.match(
      truthKernelMigrationSql,
      /create table if not exists knowledge\.derivation_step\s*\(/i,
    );
    assert.match(
      truthKernelMigrationSql,
      /create table if not exists knowledge\.derivation_input\s*\(/i,
    );
    assert.match(
      truthKernelMigrationSql,
      /check \(num_nonnulls\([\s\S]+source_revision_id[\s\S]+assertion_id[\s\S]+numeric_fact_id[\s\S]+relation_revision_id[\s\S]+relation_evidence_ledger_id[\s\S]+impact_path_v2_id[\s\S]+relation_measurement_id[\s\S]+source_derivation_step_id[\s\S]+\) = 1\)/i,
    );
    assert.match(truthKernelMigrationSql, /source_step\.step_no >= target_step\.step_no/i);
    assert.match(
      truthKernelMigrationSql,
      /source_step\.derivation_id is distinct from target_step\.derivation_id/i,
    );
    assert.match(truthKernelMigrationSql, /for share/i);
    assert.match(truthKernelMigrationSql, /compute_derivation_digest/i);
    assert.match(truthKernelMigrationSql, /derivation input count mismatch/i);
    assert.doesNotMatch(truthKernelMigrationSql, /from lateral/i);
    assert.match(
      truthKernelMigrationSql,
      /group by step\.derivation_id[\s\S]+counts\.derivation_id\s*=\s*derivation\.derivation_id/i,
    );

    assert.match(
      truthKernelMigrationSql,
      /alter table serving\.content_pack_item[\s\S]+add column if not exists derivation_id bigint/i,
    );
    assert.match(
      truthKernelMigrationSql,
      /content-pack-item:'\|\|item\.content_pack_item_id::text/i,
    );
    assert.match(
      truthKernelMigrationSql,
      /update serving\.content_pack_item item[\s\S]+set derivation_id\s*=\s*derivation\.derivation_id[\s\S]+where item\.derivation_id is null/i,
    );
    assert.match(
      truthKernelMigrationSql,
      /alter table serving\.content_pack_item[\s\S]+alter column derivation_id set not null/i,
    );
    assert.match(truthKernelMigrationSql, /unique \(derivation_id\)/i);
    assert.match(truthKernelMigrationSql, /v_derivation_status is distinct from 'sealed'/i);
  });

  it('records coverage and conflict revisions without destructive history mutation', () => {
    assert.match(truthKernelMigrationSql, /create schema if not exists governance/i);
    assert.match(
      truthKernelMigrationSql,
      /create table if not exists governance\.coverage_ledger/i,
    );
    for (const state of [
      'complete',
      'partial',
      'not_collected',
      'source_unavailable',
      'not_applicable',
    ]) {
      assert.match(truthKernelMigrationSql, new RegExp(`'${state}'`));
    }
    assert.match(
      truthKernelMigrationSql,
      /supersedes_coverage_ledger_id\s+bigint\s+references governance\.coverage_ledger\s*\(coverage_ledger_id\)/i,
    );

    assert.match(truthKernelMigrationSql, /create table if not exists knowledge\.conflict_set/i);
    assert.match(
      truthKernelMigrationSql,
      /create table if not exists knowledge\.conflict_set_member/i,
    );
    for (const relation of ['contradicts', 'supersedes', 'narrows', 'corrects']) {
      assert.match(truthKernelMigrationSql, new RegExp(`'${relation}'`));
    }
    assert.match(truthKernelMigrationSql, /resolved_by_later_official_source/i);
    assert.match(
      truthKernelMigrationSql,
      /supersedes_conflict_set_id\s+bigint\s+references knowledge\.conflict_set\s*\(conflict_set_id\)/i,
    );

    assert.match(truthKernelMigrationSql, /is append-only/i);
    assert.match(truthKernelMigrationSql, /grant select, insert on[\s\S]+knowledge\.assertion/i);
    assert.match(truthKernelMigrationSql, /grant select on[\s\S]+governance\.coverage_ledger/i);
    for (const token of destructiveTokens) {
      assert.doesNotMatch(truthKernelMigrationSql, token);
    }
  });
});
