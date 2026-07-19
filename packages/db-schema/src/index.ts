import { appResearchFoundationMigrationSql } from './migrations/001_app_research_foundation';
import { appHistoryUuidBridgeMigrationSql } from './migrations/002_app_history_uuid_bridge';
import { appMutationIdempotencyMigrationSql } from './migrations/003_app_mutation_idempotency';
import { appPositionOpenUniquenessMigrationSql } from './migrations/004_app_position_open_uniqueness';
import { appLocalAccountEnrollmentMigrationSql } from './migrations/005_local_account_enrollment';
import { sourceDocumentKoreanTranslationMigrationSql } from './migrations/006_source_document_korean_translation';
import { servingReadLayerMigrationSql } from './migrations/007_serving_read_layer';
import { coreIngestionFoundationMigrationSql } from './migrations/008_core_ingestion_foundation';
import { coreBackfillFromEntitiesMigrationSql } from './migrations/009_core_backfill_from_entities';
import { marketDataEnrichmentMigrationSql } from './migrations/010_market_data_enrichment';
import { knowledgeContentFoundationMigrationSql } from './migrations/011_knowledge_content_foundation';
import { knowledgeBackfillMigrationSql } from './migrations/012_knowledge_backfill';
import { graphAnalyticsFoundationMigrationSql } from './migrations/013_graph_analytics_foundation';
import { analyticsServingViewsMigrationSql } from './migrations/014_analytics_serving_views';
import { personalizationCalibrationMigrationSql } from './migrations/015_personalization_calibration';
import { productionizationCompletionMigrationSql } from './migrations/016_productionization_completion';
import { probabilityCalibrationHardeningMigrationSql } from './migrations/017_probability_calibration_hardening';
import { backendTruthGateMigrationSql } from './migrations/018_backend_truth_gate';
import { provenanceOutboxMigrationSql } from './migrations/019_provenance_outbox';
import { sourceRevisionContractsMigrationSql } from './migrations/020_source_revision_contracts';
import { identityTaxonomyMigrationSql } from './migrations/021_identity_taxonomy';
import { verifiedKnowledgeMigrationSql } from './migrations/022_verified_knowledge';
import { temporalRelationLedgerMigrationSql } from './migrations/023_temporal_relation_ledger';

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
  | 'core_identity'
  | 'ingestion_registry'
  | 'market_enrichment'
  | 'knowledge_layer'
  | 'content_layer'
  | 'analytics_layer'
  | 'personalization_layer'
  | 'ops_event_contract'
  | 'source_revision_contracts'
  | 'identity_taxonomy'
  | 'verified_knowledge'
  | 'temporal_relation_ledger'
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
  {
    id: '008_core_ingestion_foundation',
    description:
      'SET B foundation: core identity schema (entity/identifier/alias/listing), ingestion registry (source/contract/fetch_run/raw_object/watermark), ops model+prompt registries, and NOLOGIN worker roles.',
    tables: ['core_identity', 'ingestion_registry'],
    sql: coreIngestionFoundationMigrationSql,
  },
  {
    id: '009_core_backfill_from_entities',
    description:
      'SET B backfill: KR/US ticker universe decomposed into Exchange/Company/Stock entities with DART/CIK/ticker identifiers, aliases, listings, and the core.v_security_universe compat view.',
    tables: ['core_identity'],
    sql: coreBackfillFromEntitiesMigrationSql,
  },
  {
    id: '010_market_data_enrichment',
    description:
      'SET C: market schema — corporate actions, trading calendar, filing-level financial facts + concept dictionary, ALFRED-style macro vintages, and FINRA daily short volume.',
    tables: ['market_enrichment'],
    sql: marketDataEnrichmentMigrationSql,
  },
  {
    id: '011_knowledge_content_foundation',
    description:
      'SET D: knowledge layer (document/chunk/entity-links/claim/event) and content layer (report definition/run/report/evidence + latest pointer) with role grants.',
    tables: ['knowledge_layer', 'content_layer'],
    sql: knowledgeContentFoundationMigrationSql,
  },
  {
    id: '012_knowledge_backfill',
    description:
      'SET D backfill: source_documents promoted to knowledge.document, deterministic entity linking (legacy key/ticker/alias), and market_signals triage (event promotion + quarantine/numeric views).',
    tables: ['knowledge_layer'],
    sql: knowledgeBackfillMigrationSql,
  },
  {
    id: '013_graph_analytics_foundation',
    description:
      'SET E: non-ticker entity promotion to core, bitemporal knowledge.relation + evidence, approved temporal-graph migration, analytics layer (feature snapshots, impact paths, themes), and OHLCV adj_close columns.',
    tables: ['knowledge_layer', 'analytics_layer', 'core_identity'],
    sql: graphAnalyticsFoundationMigrationSql,
  },
  {
    id: '014_analytics_serving_views',
    description:
      'SET E serving: latest feature snapshot, impact summary, and 3-axis market confirmation views (axes kept separate per Baseline §10.3).',
    tables: ['analytics_layer', 'serving_read_views'],
    sql: analyticsServingViewsMigrationSql,
  },
  {
    id: '015_personalization_calibration',
    description:
      'SET F: personalization schema (profile/affinity/feed) with manual-ledger backfill, and label-level forecast calibration profiles + scorecard view (Brier deferred — issuance ledger has no probabilities).',
    tables: ['personalization_layer', 'analytics_layer', 'serving_read_views'],
    sql: personalizationCalibrationMigrationSql,
  },
  {
    id: '016_productionization_completion',
    description:
      'SET G: synchronize feed-provided RSS summaries into knowledge, stamp future forecasts with PIT-safe explicit/empirical probabilities, and add probability calibration snapshots + serving scorecard.',
    tables: ['knowledge_layer', 'analytics_layer', 'serving_read_views'],
    sql: productionizationCompletionMigrationSql,
  },
  {
    id: '017_probability_calibration_hardening',
    description:
      'SET G hardening: enforce source probability bounds and serialize one label-calibration profile per UTC day and segment.',
    tables: ['analytics_layer'],
    sql: probabilityCalibrationHardeningMigrationSql,
  },
  {
    id: '018_backend_truth_gate',
    description:
      'B0 product truth stop-line: serving impact exposure requires per-edge immutable source evidence (non-empty path_edges), plus a durable truth-gate policy readback in ops.',
    tables: ['serving_read_views', 'analytics_layer'],
    sql: backendTruthGateMigrationSql,
  },
  {
    id: '019_provenance_outbox',
    description:
      'B1 event contract: schema registry, transactional outbox with deterministic identity + conflict quarantine, per-destination fenced delivery, consumer inbox, bounded dead letter.',
    tables: ['ops_event_contract'],
    sql: provenanceOutboxMigrationSql,
  },
  {
    id: '020_source_revision_contracts',
    description:
      'B2 source contracts + immutable revisions: full active-source contract coverage, stable provider record identity, PIT-safe append-only source revisions.',
    tables: ['source_revision_contracts'],
    sql: sourceRevisionContractsMigrationSql,
  },
  {
    id: '021_identity_taxonomy',
    description:
      'B3 issuer/security identity bridge + ISSUED_BY graph predicate; versioned SIC/KSIC taxonomy with explicit unclassified membership and no fabricated codes.',
    tables: ['identity_taxonomy'],
    sql: identityTaxonomyMigrationSql,
  },
  {
    id: '022_verified_knowledge',
    description:
      'B4 versioned document chunks, chunk-anchored claim/event evidence, explicit verification state machine with distinct-document thresholds and append-only audit.',
    tables: ['verified_knowledge'],
    sql: verifiedKnowledgeMigrationSql,
  },
  {
    id: '023_temporal_relation_ledger',
    description:
      'B5 versioned predicate ontology, stable relation identity, immutable temporal revisions/evidence, evidence-gated accepted serving view.',
    tables: ['temporal_relation_ledger'],
    sql: temporalRelationLedgerMigrationSql,
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
  coreIngestionFoundationMigrationSql,
  coreBackfillFromEntitiesMigrationSql,
  marketDataEnrichmentMigrationSql,
  knowledgeContentFoundationMigrationSql,
  knowledgeBackfillMigrationSql,
  graphAnalyticsFoundationMigrationSql,
  analyticsServingViewsMigrationSql,
  personalizationCalibrationMigrationSql,
  productionizationCompletionMigrationSql,
  probabilityCalibrationHardeningMigrationSql,
  backendTruthGateMigrationSql,
  provenanceOutboxMigrationSql,
  sourceRevisionContractsMigrationSql,
  identityTaxonomyMigrationSql,
  verifiedKnowledgeMigrationSql,
  temporalRelationLedgerMigrationSql,
};
