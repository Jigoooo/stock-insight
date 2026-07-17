import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { appResearchFoundationMigrationSql } from '../src/migrations/001_app_research_foundation.ts';
import { sourceDocumentKoreanTranslationMigrationSql } from '../src/migrations/006_source_document_korean_translation.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('app additive migrations', () => {
  it('adds nullable Korean source-document projections without replacing originals', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    assert.match(indexSource, /id: '006_source_document_korean_translation'/);
    assert.match(
      sourceDocumentKoreanTranslationMigrationSql,
      /add column if not exists title_ko text/i,
    );
    assert.match(
      sourceDocumentKoreanTranslationMigrationSql,
      /add column if not exists summary_ko text/i,
    );
    assert.match(
      sourceDocumentKoreanTranslationMigrationSql,
      /add column if not exists translated_at timestamptz/i,
    );
    assert.doesNotMatch(sourceDocumentKoreanTranslationMigrationSql, /\bupdate\b/i);
    for (const token of destructiveTokens) {
      assert.doesNotMatch(sourceDocumentKoreanTranslationMigrationSql, token);
    }
  });

  it('ships the Phase 3 analysis and learning DDL as an idempotent additive migration', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /id: '001_app_research_foundation'/);
    for (const table of [
      'company_profiles',
      'company_financials',
      'analysis_jobs',
      'analysis_job_events',
      'stock_learning_cards',
      'entity_glossary_terms',
      'user_notification_rules',
      'user_alert_events',
      'user_decision_journal_entries',
      'v_user_decision_journal',
      'v_stock_learning_status',
    ]) {
      assert.match(indexSource, new RegExp(`'${table}'`));
    }
    assert.match(
      appResearchFoundationMigrationSql,
      /create table if not exists public\.analysis_jobs/i,
    );
    assert.match(
      appResearchFoundationMigrationSql,
      /create table if not exists public\.analysis_job_events/i,
    );
    assert.match(
      appResearchFoundationMigrationSql,
      /create table if not exists public\.stock_learning_cards/i,
    );
    assert.match(
      appResearchFoundationMigrationSql,
      /create table if not exists public\.entity_glossary_terms/i,
    );
    assert.match(
      appResearchFoundationMigrationSql,
      /create or replace view public\.v_stock_learning_status/i,
    );
    assert.match(
      appResearchFoundationMigrationSql,
      /create table if not exists public\.user_notification_rules/i,
    );
    assert.match(
      appResearchFoundationMigrationSql,
      /create table if not exists public\.user_alert_events/i,
    );
    assert.match(appResearchFoundationMigrationSql, /stock_only boolean not null default true/i);
    assert.match(appResearchFoundationMigrationSql, /unique \(user_id, event_key\)/i);
    assert.match(
      appResearchFoundationMigrationSql,
      /create table if not exists public\.user_decision_journal_entries/i,
    );
    assert.match(
      appResearchFoundationMigrationSql,
      /create or replace view public\.v_user_decision_journal/i,
    );
    assert.match(
      appResearchFoundationMigrationSql,
      /advice_prohibited boolean not null default true/i,
    );
    assert.match(appResearchFoundationMigrationSql, /check \(advice_prohibited is true\)/i);
    assert.match(
      appResearchFoundationMigrationSql,
      /references public\.entities\s*\(entity_key\)/i,
    );
    assert.match(appResearchFoundationMigrationSql, /references public\.analysis_jobs\s*\(id\)/i);
    assert.match(
      appResearchFoundationMigrationSql,
      /check \(status in \('queued', 'running', 'completed', 'failed', 'cancelled'\)\)/i,
    );
    assert.equal((appResearchFoundationMigrationSql.match(/'unsupported'/g) ?? []).length, 3);
    for (const token of destructiveTokens) {
      assert.doesNotMatch(appResearchFoundationMigrationSql, token);
    }
  });
});
