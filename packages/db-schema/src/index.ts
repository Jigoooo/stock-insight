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
import { relationBuilderFoundationMigrationSql } from './migrations/024_relation_builder_foundation';
import { graphSnapshotAnalyticsMigrationSql } from './migrations/025_graph_snapshot_analytics';
import { backendServingV2MigrationSql } from './migrations/026_backend_serving_v2';
import { pipelineRunClaimMigrationSql } from './migrations/027_pipeline_run_claim';
import { undirectedImpactStepGuardMigrationSql } from './migrations/028_undirected_impact_step_guard';
import { coreIdentityGapBackfillMigrationSql } from './migrations/029_core_identity_gap_backfill';
import { multiUserInvitationSignupMigrationSql } from './migrations/030_multi_user_invitation_signup';
import { truthKernelMigrationSql } from './migrations/031_truth_kernel';
import { worldEventTemporalLineageMigrationSql } from './migrations/032_world_event_temporal_lineage';
import { entityResolutionOntologyMigrationSql } from './migrations/033_entity_resolution_ontology';
import { geoFoundationMigrationSql } from './migrations/034_geo_foundation';
import { geoExposurePitUniverseMigrationSql } from './migrations/035_geo_exposure_pit_universe';
import { truthGeoServingMigrationSql } from './migrations/036_truth_geo_serving';
import { impactExposureLedgerMigrationSql } from './migrations/037_impact_exposure_ledger';
import { productionNetworkMigrationSql } from './migrations/038_production_network';
import { methodologyRegistryMigrationSql } from './migrations/039_methodology_registry';
import { scenarioSpatialImpactMigrationSql } from './migrations/040_scenario_spatial_impact';
import { precomputeCacheLedgerMigrationSql } from './migrations/041_precompute_cache_ledger';
import { geoEntityIdentityImmutabilityMigrationSql } from './migrations/042_geo_entity_identity_immutability';
import { personalizationDecisionSupportMigrationSql } from './migrations/043_personalization_decision_support';
import { personalizationApiSurfaceMigrationSql } from './migrations/044_personalization_api_surface';
import { shadowExperimentLedgerMigrationSql } from './migrations/045_shadow_experiment_ledger';
import { cryptoIdentityFoundationMigrationSql } from './migrations/046_crypto_identity_foundation';
import { cryptoTruthFoundationMigrationSql } from './migrations/047_crypto_truth_foundation';
import { cryptoTokenomicsMigrationSql } from './migrations/048_crypto_tokenomics';

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
  | 'app_invitations'
  | 'app_invitation_consumptions'
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
  | 'relation_builder_foundation'
  | 'graph_snapshot_analytics'
  | 'backend_serving_v2'
  | 'pipeline_run_claim'
  | 'truth_assertion'
  | 'truth_numeric_fact'
  | 'truth_derivation_dag'
  | 'truth_coverage_ledger'
  | 'truth_conflict_set'
  | 'world_event'
  | 'world_event_revision'
  | 'world_event_participant'
  | 'world_reified_obligation'
  | 'ingestion_story'
  | 'ingestion_content_artifact'
  | 'resolution_candidate'
  | 'resolution_feature'
  | 'resolution_decision'
  | 'ontology_rfc'
  | 'ontology_revision'
  | 'ontology_crosswalk'
  | 'geo_entity'
  | 'geo_entity_revision'
  | 'geo_location_mention'
  | 'geo_location_candidate'
  | 'geo_location_decision'
  | 'geo_crosswalk'
  | 'geo_entity_exposure_revision'
  | 'security_master'
  | 'security_listing_revision'
  | 'security_ticker_history'
  | 'security_corporate_action'
  | 'pit_universe_membership'
  | 'v_truth_assertion_pit_v1'
  | 'v_world_event_current_v1'
  | 'v_geo_entity_exposure_v1'
  | 'v_pit_universe_current_v1'
  | 'truth_geo_serving_manifest'
  | 'impact_shock'
  | 'impact_channel'
  | 'impact_exposure_revision'
  | 'impact_score_component'
  | 'io_industry_linkage'
  | 'firm_supply_relation'
  | 'product_classification'
  | 'trade_route'
  | 'industry_firm_allocation'
  | 'meta_path_policy'
  | 'methodology_template'
  | 'method_estimate'
  | 'method_assumption'
  | 'method_diagnostic'
  | 'conformal_interval'
  | 'shadow_experiment_run'
  | 'candidate_score'
  | 'shadow_metric'
  | 'crypto_entity'
  | 'crypto_entity_revision'
  | 'crypto_entity_alias'
  | 'crypto_identity_evidence'
  | 'crypto_core_crosswalk'
  | 'crypto_event'
  | 'crypto_event_revision'
  | 'crypto_event_participant'
  | 'crypto_event_evidence'
  | 'crypto_contract_dependency_revision'
  | 'crypto_depeg_observation'
  | 'crypto_token_supply_revision'
  | 'crypto_unlock_schedule_revision'
  | 'crypto_emission_schedule_revision'
  | 'crypto_governance_proposal'
  | 'crypto_governance_proposal_revision'
  | 'crypto_governance_action'
  | 'scenario_set'
  | 'scenario_branch'
  | 'scenario_invalidation'
  | 'spatial_impact_path'
  | 'spatial_impact_step'
  | 'precompute_policy'
  | 'precompute_cache_entry'
  | 'precompute_invalidation'
  | 'user_profile_revision'
  | 'portfolio_snapshot'
  | 'portfolio_lot_snapshot'
  | 'thesis_revision'
  | 'decision_packet'
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
  {
    id: '024_relation_builder_foundation',
    description:
      'B6 source-revision-bound relation evidence foundation for type-specific canonical builders.',
    tables: ['relation_builder_foundation'],
    sql: relationBuilderFoundationMigrationSql,
  },
  {
    id: '025_graph_snapshot_analytics',
    description:
      'B7 reproducible graph snapshot with digest, exact-FK impact path v2 steps, snapshot-scoped measurements/communities, cross-hub degree ledger.',
    tables: ['graph_snapshot_analytics'],
    sql: graphSnapshotAnalyticsMigrationSql,
  },
  {
    id: '026_backend_serving_v2',
    description:
      'B8 canonical content pack bound to sealed graph snapshots with typed evidence FK items and a servable-freshness view.',
    tables: ['backend_serving_v2'],
    sql: backendServingV2MigrationSql,
  },
  {
    id: '027_pipeline_run_claim',
    description:
      'B9 durable pipeline run claim with fencing token — exactly one live scheduler winner per natural run key.',
    tables: ['pipeline_run_claim'],
    sql: pipelineRunClaimMigrationSql,
  },
  {
    id: '028_undirected_impact_step_guard',
    description:
      'P0-3 impact-path step endpoint guard accepts either edge orientation (symmetric structural predicates); all other snapshot/step invariants unchanged.',
    tables: ['graph_snapshot_analytics'],
    sql: undirectedImpactStepGuardMigrationSql,
  },
  {
    id: '029_core_identity_gap_backfill',
    description:
      'P0-5 additive core.entity + INTERNAL_KEY backfill for legacy-only US roots (AAL/NOK/T) so the V2 adapter can resolve them.',
    tables: ['core_identity'],
    sql: coreIdentityGapBackfillMigrationSql,
  },
  {
    id: '030_multi_user_invitation_signup',
    description:
      'P0-MU additive invitation ledger + atomic SECURITY DEFINER signup that mints identity map + bootstrap tombstone + local account per single-use invite; existing accounts untouched.',
    tables: ['app_invitations', 'app_invitation_consumptions'],
    sql: multiUserInvitationSignupMigrationSql,
  },
  {
    id: '031_truth_kernel',
    description:
      'P1-W1 truth kernel: source-backed assertions, normalized numeric facts, sealed multi-input derivation DAG, coverage revisions, and conflict/supersession revisions.',
    tables: [
      'truth_assertion',
      'truth_numeric_fact',
      'truth_derivation_dag',
      'truth_coverage_ledger',
      'truth_conflict_set',
    ],
    sql: truthKernelMigrationSql,
  },
  {
    id: '032_world_event_temporal_lineage',
    description:
      'P1-W2 world event, temporal lineage, and source provenance: n-ary stateful event object with bitemporal revisions, participant/location roles, reified Contract/Regulation obligations, story syndication clusters, and translation/artifact provenance. Legacy knowledge.event rows are one-to-one back-projected without destructive rewrite.',
    tables: [
      'world_event',
      'world_event_revision',
      'world_event_participant',
      'world_reified_obligation',
      'ingestion_story',
      'ingestion_content_artifact',
    ],
    sql: worldEventTemporalLineageMigrationSql,
  },
  {
    id: '033_entity_resolution_ontology',
    description:
      'P1-W3 entity resolution and ontology RFC control: append-only candidate/feature/decision resolution ledger with an ambiguous-auto-link machine gate, plus an ontology RFC → revision → crosswalk ledger with a breaking-change compatibility gate. Legacy predicate revisions are seeded additively without destructive rewrite.',
    tables: [
      'resolution_candidate',
      'resolution_feature',
      'resolution_decision',
      'ontology_rfc',
      'ontology_revision',
      'ontology_crosswalk',
    ],
    sql: entityResolutionOntologyMigrationSql,
  },
  {
    id: '034_geo_foundation',
    description:
      'P1-W4 geo foundation: canonical PostGIS geo entities with spatial/precision/boundary/bitemporal revisions, external standard crosswalk (ISO3166/UN M49/GeoNames/UN LOCODE/IANA tz), append-only location mention → candidate → decision resolution with abstention and an ambiguous-auto-resolve machine gate, and a gold set. Existing country codes are seeded additively without destructive rewrite.',
    tables: [
      'geo_entity',
      'geo_entity_revision',
      'geo_location_mention',
      'geo_location_candidate',
      'geo_location_decision',
      'geo_crosswalk',
    ],
    sql: geoFoundationMigrationSql,
  },
  {
    id: '035_geo_exposure_pit_universe',
    description:
      'P1-W5 geo exposure and point-in-time security universe: evidenced country/facility exposure ratios that cannot drop their denominator, an append-only security master with non-overlapping ticker tenure (GiST exclusion), corporate actions (delist/split/merger/ticker reuse), and a PIT universe that cannot leak a future constituent. Existing listings are seeded additively.',
    tables: [
      'geo_entity_exposure_revision',
      'security_master',
      'security_listing_revision',
      'security_ticker_history',
      'security_corporate_action',
      'pit_universe_membership',
    ],
    sql: geoExposurePitUniverseMigrationSql,
  },
  {
    id: '036_truth_geo_serving',
    description:
      'P1-W6 truth/geo serving and compatibility: read-only additive views over the canonical truth assertion (PIT, accepted-tier), current world event, geo exposure, and PIT universe ledgers, plus a lineage manifest of canonical row counts. No canonical ledger is mutated; existing consumers ignore the additive surfaces.',
    tables: [
      'v_truth_assertion_pit_v1',
      'v_world_event_current_v1',
      'v_geo_entity_exposure_v1',
      'v_pit_universe_current_v1',
      'truth_geo_serving_manifest',
    ],
    sql: truthGeoServingMigrationSql,
  },
  {
    id: '037_impact_exposure_ledger',
    description:
      'P2-WA impact engine exposure ledger: shock (anchored to world.event_revision) -> channel (17-class §7.2 taxonomy) -> append-only bitemporal exposure revision with the full §7.3 field set, plus the §7.4 eight-way score decomposition forced before sealing. Economic magnitude and epistemic confidence stay in separate columns and are never collapsed into one number.',
    tables: [
      'impact_shock',
      'impact_channel',
      'impact_exposure_revision',
      'impact_score_component',
    ],
    sql: impactExposureLedgerMigrationSql,
  },
  {
    id: '038_production_network',
    description:
      'P2-WB production network: industry IO linkage (OECD ICIO/Leontief coefficients), disclosed firm supplier/customer relations, product classification (HS/ECCN), geographic trade routes (ports via the geo layer), bounded industry->firm allocation (weights <= 1 per industry/basis/as_of), and a typed meta-path traversal policy (UI <= 3 hops, no mixed-relation shortest path). Append-only, least-privilege.',
    tables: [
      'io_industry_linkage',
      'firm_supply_relation',
      'product_classification',
      'trade_route',
      'industry_firm_allocation',
      'meta_path_policy',
    ],
    sql: productionNetworkMigrationSql,
  },
  {
    id: '039_methodology_registry',
    description:
      'P2-WC causal/statistical methodology registry: standard method templates (event study, local projection, SCM, DiD, DML, IV, PCMCI) with a claim class separating statistical association from causal estimate, replayable estimates (program + input snapshot + CI), assumptions and diagnostics as evidenced rows, and a conformal prediction wrapper. Hard rules: PCMCI is candidate-only and never causal; a causal estimate requires stored assumptions and diagnostics. Append-only, least-privilege.',
    tables: [
      'methodology_template',
      'method_estimate',
      'method_assumption',
      'method_diagnostic',
      'conformal_interval',
    ],
    sql: methodologyRegistryMigrationSql,
  },
  {
    id: '040_scenario_spatial_impact',
    description:
      'P2-WD scenario branches and spatial impact paths: bull/base/bear scenario branches with policy delay/exemption modifiers that must carry counter-evidence and an invalidation condition before sealing, plus the three standard spatial impact paths (disaster x facility, sanction jurisdiction, port closure) with a named stable method. Pure spatial distance may never promote an impact edge. Append-only, least-privilege, PostGIS geometry.',
    tables: [
      'scenario_set',
      'scenario_branch',
      'scenario_invalidation',
      'spatial_impact_path',
      'spatial_impact_step',
    ],
    sql: scenarioSpatialImpactMigrationSql,
  },
  {
    id: '041_precompute_cache_ledger',
    description:
      'P2-WE precompute strategy and cache-key ledger: three-tier precompute policy (always/conditional/on_demand) and an append-only cache-entry ledger whose key must carry all four version components (snapshot, query, ontology, model) so a stale precompute can never be served, plus an append-only invalidation ledger. Least-privilege, no delete.',
    tables: ['precompute_policy', 'precompute_cache_entry', 'precompute_invalidation'],
    sql: precomputeCacheLedgerMigrationSql,
  },
  {
    id: '042_geo_entity_identity_immutability',
    description:
      'P3-D canonical geo identity immutability: geo.entity remains insert-only so current name/kind/key state cannot leak into historical point-in-time snapshots; spatial and precision corrections continue through append-only geo.entity_revision rows.',
    tables: ['geo_entity'],
    sql: geoEntityIdentityImmutabilityMigrationSql,
  },
  {
    id: '043_personalization_decision_support',
    description:
      'P4 private personalization and read-only decision support: append-only user profile, portfolio/lot snapshot, thesis revision, and decision packet ledgers with same-user composite foreign keys, FORCE RLS, abstention-first semantics, immutable common-view lineage, and hard legal/order prohibitions.',
    tables: [
      'user_profile_revision',
      'portfolio_snapshot',
      'portfolio_lot_snapshot',
      'thesis_revision',
      'decision_packet',
    ],
    sql: personalizationDecisionSupportMigrationSql,
  },
  {
    id: '044_personalization_api_surface',
    description:
      'P4-C personalization API surface: distinguish user-authored and system-generated thesis revisions without weakening the append-only private ledger.',
    tables: ['thesis_revision'],
    sql: personalizationApiSurfaceMigrationSql,
  },
  {
    id: '045_shadow_experiment_ledger',
    description:
      'P5 append-only shadow experiment runs, candidate-only scores, and evaluation metrics with structural prohibitions on accepted facts, product actions, and orders.',
    tables: ['shadow_experiment_run', 'candidate_score', 'shadow_metric'],
    sql: shadowExperimentLedgerMigrationSql,
  },
  {
    id: '046_crypto_identity_foundation',
    description:
      'P6-1 separate crypto identity module with CAIP-compatible stable keys, append-only bitemporal revisions, aliases, source evidence, and reviewed crosswalks to shared core identity.',
    tables: [
      'crypto_entity',
      'crypto_entity_revision',
      'crypto_entity_alias',
      'crypto_identity_evidence',
      'crypto_core_crosswalk',
    ],
    sql: cryptoIdentityFoundationMigrationSql,
  },
  {
    id: '047_crypto_truth_foundation',
    description:
      'P6-2 separate crypto truth module with append-only bitemporal event lifecycle, evidence, contract dependency revisions, chain finality, and depeg observations.',
    tables: [
      'crypto_event',
      'crypto_event_revision',
      'crypto_event_participant',
      'crypto_event_evidence',
      'crypto_contract_dependency_revision',
      'crypto_depeg_observation',
    ],
    sql: cryptoTruthFoundationMigrationSql,
  },
  {
    id: '048_crypto_tokenomics',
    description:
      'P6-3 append-only token supply, unlock, emission, governance proposal, revision, and action economics with raw coefficients, units, PIT, and provenance.',
    tables: [
      'crypto_token_supply_revision',
      'crypto_unlock_schedule_revision',
      'crypto_emission_schedule_revision',
      'crypto_governance_proposal',
      'crypto_governance_proposal_revision',
      'crypto_governance_action',
    ],
    sql: cryptoTokenomicsMigrationSql,
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
  relationBuilderFoundationMigrationSql,
  graphSnapshotAnalyticsMigrationSql,
  backendServingV2MigrationSql,
  pipelineRunClaimMigrationSql,
  undirectedImpactStepGuardMigrationSql,
  coreIdentityGapBackfillMigrationSql,
  multiUserInvitationSignupMigrationSql,
  truthKernelMigrationSql,
  worldEventTemporalLineageMigrationSql,
  entityResolutionOntologyMigrationSql,
  geoFoundationMigrationSql,
  geoExposurePitUniverseMigrationSql,
  truthGeoServingMigrationSql,
  impactExposureLedgerMigrationSql,
  productionNetworkMigrationSql,
  methodologyRegistryMigrationSql,
  scenarioSpatialImpactMigrationSql,
  precomputeCacheLedgerMigrationSql,
  geoEntityIdentityImmutabilityMigrationSql,
  personalizationDecisionSupportMigrationSql,
  personalizationApiSurfaceMigrationSql,
  shadowExperimentLedgerMigrationSql,
  cryptoIdentityFoundationMigrationSql,
  cryptoTruthFoundationMigrationSql,
  cryptoTokenomicsMigrationSql,
};
