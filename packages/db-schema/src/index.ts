import { appResearchFoundationMigrationSql } from './migrations/001_app_research_foundation';
import { sourceDocumentKoreanTranslationMigrationSql } from './migrations/006_source_document_korean_translation';

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
  | 'source_documents'
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
    id: '006_source_document_korean_translation',
    description: 'Add Korean title/summary projections while preserving original source text.',
    tables: ['source_documents'],
    sql: sourceDocumentKoreanTranslationMigrationSql,
  },
];

export { appResearchFoundationMigrationSql, sourceDocumentKoreanTranslationMigrationSql };
