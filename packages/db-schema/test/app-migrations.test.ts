import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { appResearchFoundationMigrationSql } from '../src/migrations/001_app_research_foundation.ts';
import { appHistoryUuidBridgeMigrationSql } from '../src/migrations/002_app_history_uuid_bridge.ts';
import { appMutationIdempotencyMigrationSql } from '../src/migrations/003_app_mutation_idempotency.ts';
import { appPositionOpenUniquenessMigrationSql } from '../src/migrations/004_app_position_open_uniqueness.ts';
import { appLocalAccountEnrollmentMigrationSql } from '../src/migrations/005_local_account_enrollment.ts';
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

  it('adds an idempotent UUID identity bridge for decision history without mutating legacy rows', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /id: '002_app_history_uuid_bridge'/);
    assert.match(indexSource, /'app_user_identity_map'/);
    assert.match(indexSource, /'v_user_decision_history_v3'/);
    assert.match(
      appHistoryUuidBridgeMigrationSql,
      /create table if not exists public\.app_user_identity_map/i,
    );
    assert.match(appHistoryUuidBridgeMigrationSql, /user_id uuid not null unique/i);
    assert.match(
      appHistoryUuidBridgeMigrationSql,
      /create or replace view public\.v_user_decision_history_v3/i,
    );
    assert.match(appHistoryUuidBridgeMigrationSql, /md5\([^;]+entry_key[^;]*\) as digest/is);
    assert.match(
      appHistoryUuidBridgeMigrationSql,
      /substr\(history_key\.digest, 9, 4\) \|\| '-8'/i,
    );
    assert.match(
      appHistoryUuidBridgeMigrationSql,
      /substr\(history_key\.digest, 14, 3\) \|\| '-a'/i,
    );
    assert.match(
      appHistoryUuidBridgeMigrationSql,
      /join public\.app_user_identity_map identity_map/i,
    );
    assert.doesNotMatch(appHistoryUuidBridgeMigrationSql, /\b(update|insert into|delete from)\b/i);
    for (const token of destructiveTokens) {
      assert.doesNotMatch(appHistoryUuidBridgeMigrationSql, token);
    }
  });

  it('adds a durable mutation idempotency ledger without destructive DDL', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    assert.match(indexSource, /id: '003_app_mutation_idempotency'/);
    assert.match(indexSource, /'app_mutation_idempotency'/);
    assert.match(
      appMutationIdempotencyMigrationSql,
      /create table if not exists public\.app_mutation_idempotency/i,
    );
    assert.match(appMutationIdempotencyMigrationSql, /primary key \(user_id, idempotency_key\)/i);
    assert.match(appMutationIdempotencyMigrationSql, /request_hash char\(64\) not null/i);
    assert.match(appMutationIdempotencyMigrationSql, /state text not null/i);
    assert.match(appMutationIdempotencyMigrationSql, /response_json jsonb/i);
    for (const token of destructiveTokens) {
      assert.doesNotMatch(appMutationIdempotencyMigrationSql, token);
    }
  });

  it('preflights duplicates and enforces one open position per user and entity', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    assert.match(indexSource, /id: '004_app_position_open_uniqueness'/);
    assert.match(indexSource, /'user_positions'/);
    assert.match(appPositionOpenUniquenessMigrationSql, /having count\(\*\) > 1/i);
    assert.match(appPositionOpenUniquenessMigrationSql, /raise exception/i);
    assert.match(
      appPositionOpenUniquenessMigrationSql,
      /create unique index if not exists uq_user_positions_one_open/i,
    );
    assert.match(
      appPositionOpenUniquenessMigrationSql,
      /on public\.user_positions \(user_id, entity_key\)[\s\S]+where status = 'open'[\s\S]+closed_at is null/i,
    );
    for (const token of destructiveTokens) {
      assert.doesNotMatch(appPositionOpenUniquenessMigrationSql, token);
    }
  });

  it('adds an RLS-protected local account table with canonical enrollment constraints', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /id: '005_local_account_enrollment'/);
    assert.match(indexSource, /'app_local_accounts'/);
    assert.match(indexSource, /'app_auth_bootstrap_state'/);
    assert.match(indexSource, /appLocalAccountEnrollmentMigrationSql/);
    assert.match(
      appLocalAccountEnrollmentMigrationSql,
      /create table if not exists public\.app_local_accounts/i,
    );
    assert.match(
      appLocalAccountEnrollmentMigrationSql,
      /user_id uuid primary key references public\.app_user_identity_map\s*\(user_id\) on delete restrict/i,
    );
    assert.match(appLocalAccountEnrollmentMigrationSql, /username text not null/i);
    assert.match(
      appLocalAccountEnrollmentMigrationSql,
      /username_canonical text generated always as \(lower\(username\)\) stored/i,
    );
    assert.match(
      appLocalAccountEnrollmentMigrationSql,
      /check \(username ~ '\^\[A-Za-z0-9\._-\]\{3,64\}\$'\)/i,
    );
    assert.match(appLocalAccountEnrollmentMigrationSql, /password_record text not null/i);
    assert.ok(
      appLocalAccountEnrollmentMigrationSql.includes(
        String.raw`CHECK (password_record ~ '^scrypt\$v=1\$N=16384\$r=8\$p=1\$[A-Za-z0-9_-]{21}[AQgw]\$[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$')`,
      ),
    );
    assert.match(
      appLocalAccountEnrollmentMigrationSql,
      /created_at timestamptz not null default now\(\)/i,
    );
    assert.match(appLocalAccountEnrollmentMigrationSql, /unique \(username_canonical\)/i);
    assert.match(
      appLocalAccountEnrollmentMigrationSql,
      /create table if not exists public\.app_auth_bootstrap_state/i,
    );
    assert.match(
      appLocalAccountEnrollmentMigrationSql,
      /enrollment_consumed_at timestamptz not null default now\(\)/i,
    );
    assert.match(
      appLocalAccountEnrollmentMigrationSql,
      /alter table public\.app_local_accounts enable row level security/i,
    );
    assert.match(
      appLocalAccountEnrollmentMigrationSql,
      /alter table public\.app_local_accounts force row level security/i,
    );
    assert.match(
      appLocalAccountEnrollmentMigrationSql,
      /alter table public\.app_auth_bootstrap_state force row level security/i,
    );
    for (const token of destructiveTokens) {
      assert.doesNotMatch(appLocalAccountEnrollmentMigrationSql, token);
    }
  });
});
