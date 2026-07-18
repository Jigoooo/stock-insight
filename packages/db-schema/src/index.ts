import { appResearchFoundationMigrationSql } from './migrations/001_app_research_foundation';
import { appHistoryUuidBridgeMigrationSql } from './migrations/002_app_history_uuid_bridge';
import { appMutationIdempotencyMigrationSql } from './migrations/003_app_mutation_idempotency';
import { appPositionOpenUniquenessMigrationSql } from './migrations/004_app_position_open_uniqueness';
import { appLocalAccountEnrollmentMigrationSql } from './migrations/005_local_account_enrollment';
import { sourceDocumentKoreanTranslationMigrationSql } from './migrations/006_source_document_korean_translation';
import { servingReadLayerMigrationSql } from './migrations/007_serving_read_layer';

export type AppTableName =
  | 'company_profiles'
  | 'company_financials'
  | 'analysis_jobs'
  | 'analysis_job_events'
  | 'stock_learning_cards'
  | 'entity_glossary_terms'
  | 'user_notification_rules'
  | 'user_alert_events'
  | 'user_decision_journal_entries'
  | 'app_auth_bootstrap_state'
  | 'app_local_accounts'
  | 'app_user_identity_map'
  | 'app_mutation_idempotency'
  | 'source_documents'
  | 'user_positions'
  | 'serving_read_views'
  | 'v_user_decision_history_v3'
  | 'v_user_decision_journal'
  | 'v_stock_learning_status';

export type AppMigration = {
  id: string;
  description: string;
  tables: AppTableName[];
  sql: string;
};

export const additiveAppMigrations: AppMigration[] = [
  {
    id: '001_app_research_foundation',
    description:
      'App-facing additive tables for company profile, financial facts, study cards, and async analysis job state.',
    tables: [
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
    ],
    sql: appResearchFoundationMigrationSql,
  },
  {
    id: '002_app_history_uuid_bridge',
    description:
      'Additive UUID identity bridge and stable UUID decision-history view over the legacy journal.',
    tables: ['app_user_identity_map', 'v_user_decision_history_v3'],
    sql: appHistoryUuidBridgeMigrationSql,
  },
  {
    id: '003_app_mutation_idempotency',
    description: 'Durable at-most-once mutation claims and completed response replay by user UUID.',
    tables: ['app_mutation_idempotency'],
    sql: appMutationIdempotencyMigrationSql,
  },
  {
    id: '004_app_position_open_uniqueness',
    description: 'Enforce one open manual position per user and entity under concurrent writes.',
    tables: ['user_positions'],
    sql: appPositionOpenUniquenessMigrationSql,
  },
  {
    id: '005_local_account_enrollment',
    description: 'Store one RLS-protected local login account per canonical user UUID.',
    tables: ['app_auth_bootstrap_state', 'app_local_accounts'],
    sql: appLocalAccountEnrollmentMigrationSql,
  },
  {
    id: '006_source_document_korean_translation',
    description: 'Add Korean title/summary projections while preserving original source text.',
    tables: ['source_documents'],
    sql: sourceDocumentKoreanTranslationMigrationSql,
  },
  {
    id: '007_serving_read_layer',
    description:
      'Serving read layer: clean snapshot view, canonical ticker universe, OHLCV latest price, live dataset watermarks, and shadow policy registration for live RSS providers.',
    tables: ['serving_read_views'],
    sql: servingReadLayerMigrationSql,
  },
];

export {
  appHistoryUuidBridgeMigrationSql,
  appMutationIdempotencyMigrationSql,
  appPositionOpenUniquenessMigrationSql,
  appLocalAccountEnrollmentMigrationSql,
  appResearchFoundationMigrationSql,
  sourceDocumentKoreanTranslationMigrationSql,
  servingReadLayerMigrationSql,
};
