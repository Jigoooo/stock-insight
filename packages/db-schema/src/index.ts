import { appResearchFoundationMigrationSql } from './migrations/001_app_research_foundation.ts';
import { appHistoryUuidBridgeMigrationSql } from './migrations/002_app_history_uuid_bridge.ts';
import { appMutationIdempotencyMigrationSql } from './migrations/003_app_mutation_idempotency.ts';
import { appPositionOpenUniquenessMigrationSql } from './migrations/004_app_position_open_uniqueness.ts';
import { appLocalAccountEnrollmentMigrationSql } from './migrations/005_local_account_enrollment.ts';
import { sourceDocumentKoreanTranslationMigrationSql } from './migrations/006_source_document_korean_translation.ts';
import { servingReadLayerMigrationSql } from './migrations/007_serving_read_layer.ts';
import { coreIngestionFoundationMigrationSql } from './migrations/008_core_ingestion_foundation.ts';
import { coreBackfillFromEntitiesMigrationSql } from './migrations/009_core_backfill_from_entities.ts';
import { marketDataEnrichmentMigrationSql } from './migrations/010_market_data_enrichment.ts';
import { knowledgeContentFoundationMigrationSql } from './migrations/011_knowledge_content_foundation.ts';
import { knowledgeBackfillMigrationSql } from './migrations/012_knowledge_backfill.ts';
import { graphAnalyticsFoundationMigrationSql } from './migrations/013_graph_analytics_foundation.ts';
import { analyticsServingViewsMigrationSql } from './migrations/014_analytics_serving_views.ts';
import { personalizationCalibrationMigrationSql } from './migrations/015_personalization_calibration.ts';
import { productionizationCompletionMigrationSql } from './migrations/016_productionization_completion.ts';
import { probabilityCalibrationHardeningMigrationSql } from './migrations/017_probability_calibration_hardening.ts';
import { backendTruthGateMigrationSql } from './migrations/018_backend_truth_gate.ts';
import { provenanceOutboxMigrationSql } from './migrations/019_provenance_outbox.ts';
import { sourceRevisionContractsMigrationSql } from './migrations/020_source_revision_contracts.ts';
import { identityTaxonomyMigrationSql } from './migrations/021_identity_taxonomy.ts';
import { verifiedKnowledgeMigrationSql } from './migrations/022_verified_knowledge.ts';
import { temporalRelationLedgerMigrationSql } from './migrations/023_temporal_relation_ledger.ts';
import { relationBuilderFoundationMigrationSql } from './migrations/024_relation_builder_foundation.ts';
import { graphSnapshotAnalyticsMigrationSql } from './migrations/025_graph_snapshot_analytics.ts';
import { backendServingV2MigrationSql } from './migrations/026_backend_serving_v2.ts';
import { pipelineRunClaimMigrationSql } from './migrations/027_pipeline_run_claim.ts';
import { undirectedImpactStepGuardMigrationSql } from './migrations/028_undirected_impact_step_guard.ts';
import { coreIdentityGapBackfillMigrationSql } from './migrations/029_core_identity_gap_backfill.ts';
import { multiUserInvitationSignupMigrationSql } from './migrations/030_multi_user_invitation_signup.ts';
import { truthKernelMigrationSql } from './migrations/031_truth_kernel.ts';
import { worldEventTemporalLineageMigrationSql } from './migrations/032_world_event_temporal_lineage.ts';
import { entityResolutionOntologyMigrationSql } from './migrations/033_entity_resolution_ontology.ts';
import { geoFoundationMigrationSql } from './migrations/034_geo_foundation.ts';
import { geoExposurePitUniverseMigrationSql } from './migrations/035_geo_exposure_pit_universe.ts';
import { truthGeoServingMigrationSql } from './migrations/036_truth_geo_serving.ts';
import { impactExposureLedgerMigrationSql } from './migrations/037_impact_exposure_ledger.ts';
import { productionNetworkMigrationSql } from './migrations/038_production_network.ts';
import { methodologyRegistryMigrationSql } from './migrations/039_methodology_registry.ts';
import { scenarioSpatialImpactMigrationSql } from './migrations/040_scenario_spatial_impact.ts';
import { precomputeCacheLedgerMigrationSql } from './migrations/041_precompute_cache_ledger.ts';
import { geoEntityIdentityImmutabilityMigrationSql } from './migrations/042_geo_entity_identity_immutability.ts';
import { personalizationDecisionSupportMigrationSql } from './migrations/043_personalization_decision_support.ts';
import { personalizationApiSurfaceMigrationSql } from './migrations/044_personalization_api_surface.ts';
import { shadowExperimentLedgerMigrationSql } from './migrations/045_shadow_experiment_ledger.ts';
import { cryptoIdentityFoundationMigrationSql } from './migrations/046_crypto_identity_foundation.ts';
import { cryptoTruthFoundationMigrationSql } from './migrations/047_crypto_truth_foundation.ts';
import { cryptoTokenomicsMigrationSql } from './migrations/048_crypto_tokenomics.ts';
import { cryptoContagionImpactMigrationSql } from './migrations/049_crypto_contagion_impact.ts';
import { cryptoCrossDomainGraphMigrationSql } from './migrations/050_crypto_cross_domain_graph.ts';
import { cryptoServingViewsMigrationSql } from './migrations/051_crypto_serving_views.ts';
import { personalizationReaderSurfaceHardeningMigrationSql } from './migrations/052_personalization_reader_surface_hardening.ts';
import { cryptoServingAppReaderGrantMigrationSql } from './migrations/053_crypto_serving_app_reader_grant.ts';
import { adminInvitationControlMigrationSql } from './migrations/054_admin_invitation_control.ts';
import { impactV1InternalOnlyMigrationSql } from './migrations/055_impact_v1_internal_only.ts';
import { marketFactSourceLineageMigrationSql } from './migrations/056_market_fact_source_lineage.ts';
import { macroVintageSourceLineageMigrationSql } from './migrations/057_macro_vintage_source_lineage.ts';
import { secFinraSourceRegistrationMigrationSql } from './migrations/058_sec_finra_source_registration.ts';
import { marketConfirmationReadsV2MigrationSql } from './migrations/059_market_confirmation_reads_v2.ts';
import { worldEventProjectsMagnitudeMigrationSql } from './migrations/060_world_event_projects_magnitude.ts';
import { cryptoIdentitySeedMigrationSql } from './migrations/061_crypto_identity_seed.ts';
import { eventRevisionIdentityMigrationSql } from './migrations/062_event_revision_identity.ts';
import { marketTopicVocabularyMigrationSql } from './migrations/063_market_topic_vocabulary.ts';
import { feedLabelEventTargetsMigrationSql } from './migrations/064_feed_label_event_targets.ts';
import { macroSeriesEntitiesMigrationSql } from './migrations/065_macro_series_entities.ts';
import { macroComovementOntologyMigrationSql } from './migrations/066_macro_comovement_ontology.ts';
import { macroSeriesEnergyMigrationSql } from './migrations/067_macro_series_energy.ts';
import { macroTopicEntitiesMigrationSql } from './migrations/068_macro_topic_entities.ts';
import { dartSupplyDisclosureSourceMigrationSql } from './migrations/069_dart_supply_disclosure_source.ts';
import { documentEntityCanonicalNameMigrationSql } from './migrations/070_document_entity_canonical_name.ts';
import { claimDedupeKeyMigrationSql } from './migrations/071_claim_dedupe_key.ts';
import { dartSupplyLicenseTierMigrationSql } from './migrations/072_dart_supply_license_tier.ts';
import { macroSeriesNaturalGasMigrationSql } from './migrations/073_macro_series_natural_gas.ts';
import { scheduledEventMigrationSql } from './migrations/074_scheduled_event.ts';
import { legislativeActionMigrationSql } from './migrations/075_legislative_action.ts';
import { ecosMacroSeriesMigrationSql } from './migrations/076_ecos_macro_series.ts';
import { institutionalHolderEntitiesMigrationSql } from './migrations/077_institutional_holder_entities.ts';
import { semanticSnapshotMigrationSql } from './migrations/078_semantic_snapshot.ts';
import { analysisInformationSetMigrationSql } from './migrations/079_analysis_information_set.ts';
import { sourcePitQualityMigrationSql } from './migrations/080_source_pit_quality.ts';

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
  | 'app_account_roles'
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
  | 'crypto_risk_shock'
  | 'crypto_transmission_channel'
  | 'crypto_risk_exposure_revision'
  | 'crypto_risk_score_component'
  | 'crypto_contagion_edge_revision'
  | 'crypto_liquidation_observation'
  | 'cross_crypto_core_relation_revision'
  | 'cross_crypto_core_metric_revision'
  | 'cross_crypto_geo_relation_revision'
  | 'cross_crypto_macro_relation_revision'
  | 'cross_crypto_world_event_link_revision'
  | 'crypto_serving_entity_revision'
  | 'crypto_serving_event_revision'
  | 'crypto_serving_core_relation_revision'
  | 'crypto_serving_risk_exposure_revision'
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
  {
    id: '049_crypto_contagion_impact',
    description:
      'P6-4 crypto impact chain with event shocks, typed transmission channels, decomposed sealed exposures, contagion edges, and liquidation observations.',
    tables: [
      'crypto_risk_shock',
      'crypto_transmission_channel',
      'crypto_risk_exposure_revision',
      'crypto_risk_score_component',
      'crypto_contagion_edge_revision',
      'crypto_liquidation_observation',
    ],
    sql: cryptoContagionImpactMigrationSql,
  },
  {
    id: '050_crypto_cross_domain_graph',
    description:
      'P6-5 first-class crypto-to-company, security, metric, regulation, risk, geo, and world-event graph with PIT evidence and separate economic/confidence fields.',
    tables: [
      'cross_crypto_core_relation_revision',
      'cross_crypto_core_metric_revision',
      'cross_crypto_geo_relation_revision',
      'cross_crypto_macro_relation_revision',
      'cross_crypto_world_event_link_revision',
    ],
    sql: cryptoCrossDomainGraphMigrationSql,
  },
  {
    id: '051_crypto_serving_views',
    description:
      'P6-6 sanitized read-only crypto entity, event, stock-linked relation, and risk revision views for explicit PIT API selection.',
    tables: [
      'crypto_serving_entity_revision',
      'crypto_serving_event_revision',
      'crypto_serving_core_relation_revision',
      'crypto_serving_risk_exposure_revision',
    ],
    sql: cryptoServingViewsMigrationSql,
  },
  {
    id: '052_personalization_reader_surface_hardening',
    description:
      'XG least-privilege cutover from raw personalization decision tables to exact reader column grants.',
    tables: ['decision_packet'],
    sql: personalizationReaderSurfaceHardeningMigrationSql,
  },
  {
    id: '053_crypto_serving_app_reader_grant',
    description:
      'P6 forward-only production app-reader grant for sanitized crypto serving views only.',
    tables: [
      'crypto_serving_entity_revision',
      'crypto_serving_event_revision',
      'crypto_serving_core_relation_revision',
      'crypto_serving_risk_exposure_revision',
    ],
    sql: cryptoServingAppReaderGrantMigrationSql,
  },
  {
    id: '054_admin_invitation_control',
    description:
      'P0-MU-2 server-authoritative owner/admin/member capabilities with digest-only invitation issue, list, and revocation functions.',
    tables: ['app_account_roles', 'app_invitations', 'app_invitation_consumptions'],
    sql: adminInvitationControlMigrationSql,
  },
  {
    id: '055_impact_v1_internal_only',
    description:
      'Declares the v1 impact plane internal-only: serving.impact_summary_v1 is structurally empty since migration 023 and the servable plane is impact_path_v2 via impact_brief content packs.',
    // Comment-only: it creates no objects, so it claims none.
    tables: [],
    sql: impactV1InternalOnlyMigrationSql,
  },
  {
    id: '056_market_fact_source_lineage',
    description:
      'Adds source_revision_id to market.financial_fact so a fact can be traced to the payload it came from; none of the seven market.* tables had anywhere to record lineage.',
    tables: [],
    sql: marketFactSourceLineageMigrationSql,
  },
  {
    id: '057_macro_vintage_source_lineage',
    description:
      'Adds source_revision_id to market.macro_vintage so a PIT vintage can be audited against the fetch that produced it.',
    tables: [],
    sql: macroVintageSourceLineageMigrationSql,
  },
  {
    id: '058_sec_finra_source_registration',
    description:
      'Registers SEC EDGAR and FINRA, which were collecting outside the source registry entirely, and adds the lineage column to market.short_volume_daily. FINRA carries an explicit unresolved-terms note.',
    tables: [],
    sql: secFinraSourceRegistrationMigrationSql,
  },
  {
    id: '059_market_confirmation_reads_v2',
    description:
      'Points serving.market_confirmation_v1 at a new serving.impact_summary_v2 built from servable impact packs. Its industry_link_strength and path_count were structurally 0/NULL for all 253 rows because the v1 plane they read is empty by construction.',
    tables: [],
    sql: marketConfirmationReadsV2MigrationSql,
  },
  {
    id: '060_world_event_projects_magnitude',
    description:
      'Projects magnitude, magnitude_unit, story_id and published_at from serving.v_world_event_current_v1, which read them in a LATERAL and dropped them. surprise_score and source_revision_id stay unprojected because no producer writes them.',
    tables: [],
    sql: worldEventProjectsMagnitudeMigrationSql,
  },
  {
    id: '061_crypto_identity_seed',
    description:
      'Seeds crypto_identity.entity with CAIP-2/CAIP-19 identities for 7 of the 14 tracked tickers, every value read from a published spec or vendor platform metadata. The remaining 7 await their namespace references being read rather than guessed.',
    tables: [],
    sql: cryptoIdentitySeedMigrationSql,
  },
  {
    id: '062_event_revision_identity',
    description:
      'Gives knowledge.event the (event_key, revision_no) identity every other observation table here already has, so a re-extraction supersedes rather than duplicates. Adds serving.v_knowledge_event_current_v1 as the single place consumers read current observations from.',
    tables: [],
    sql: eventRevisionIdentityMigrationSql,
  },
  {
    id: '063_market_topic_vocabulary',
    description:
      'Seeds analytics.market_topic_term, the vocabulary that marks an event as market-wide news naming no company. A definition kept in a table so a wrong term is a row to delete rather than a deploy; never used to attach an event to a company.',
    tables: [],
    sql: marketTopicVocabularyMigrationSql,
  },
  {
    id: '064_feed_label_event_targets',
    description:
      'Clears collection-feed labels (us_insider_buys, us_corporate_events, gl_major_event, crypto_regulation) out of knowledge.event.target_entity_id. 1,478 events claimed to have reached a company when they had only reached the name of the feed they arrived on; they were also invisible to the text-attribution pass while the column was occupied. The attributed count drops from 3,099 to about 1,621 — a correction, not a regression.',
    tables: [],
    sql: feedLabelEventTargetsMigrationSql,
  },
  {
    id: '065_macro_series_entities',
    description:
      'Gives the 13 FRED series in market.macro_vintage a core.entity identity and a FRED_SERIES identifier, plus analytics.macro_series_topic mapping each series to a market-news topic. 55,775 rows of macro data have never reached the graph because a relation needs both endpoints to be entities and no series had one. Creates identity only — it asserts no relationship to any company.',
    tables: [],
    sql: macroSeriesEntitiesMigrationSql,
  },
  {
    id: '066_macro_comovement_ontology',
    description:
      'Approves the MACRO_COMOVEMENT predicate so the macro correlation builder can produce accepted relations between a FRED series entity and a stock. Statistical association only, undirected, model-config bound — it asserts co-movement over a stated window and no direction, mechanism or cause. effective_from is 2000-01-01 because the accepted-revision guard requires it to precede a candidate valid_from derived from the observation window.',
    tables: [],
    sql: macroComovementOntologyMigrationSql,
  },
  {
    id: '067_macro_series_energy',
    description:
      "Maps fred:DCOILWTICO to the 'energy' market-news topic and gives it a core.entity identity, so the 12 unattributed macro events matching 유가/원유 have a series to reach. Measured 2026-08-05: energy had 0 series mapped, so those events could not touch the graph regardless of attribution design. trade (37 events) is left uncovered because FRED's trade-balance series are monthly/quarterly and fall below the model's 60-observation minimum; market (23) because correlating every stock with an index is beta, not information.",
    tables: [],
    sql: macroSeriesEnergyMigrationSql,
  },
  {
    id: '068_macro_topic_entities',
    description:
      "Creates a Metric entity per macro topic ('topic:rates' and friends) and approves MEASURED_BY, the curated topic-to-series predicate, plus its own ingestion source. knowledge.event.target_entity_id is a single value, so an event about rates cannot attach to DGS10, DGS2, FEDFUNDS and WALCL at once and run-event-text-attribution refuses to guess; under the strict rule only single-series topics were attributable (fx 3 events, energy 12) while rates 18 stayed unreachable, and adding series made attribution HARDER rather than easier. A topic is always one thing, so attaching the event there removes the ambiguity and survives coverage growth, at the cost of one extra hop — event to topic to series to stock is exactly MAX_HOPS. Measured 2026-08-05: the widest topic reaches 10 stocks in two hops against a 20-path budget, so no degree cap is warranted.",
    tables: [],
    sql: macroTopicEntitiesMigrationSql,
  },
  {
    id: '069_dart_supply_disclosure_source',
    description:
      "Registers a dedicated ingestion source for supply relations extracted from Korean 사업보고서 filings, plus the resume cursor the chunked collector needs. Reusing source 18 ('opendart') would repeat the provenance misattribution corrected on 2026-08-05, when five distinct internal snapshots all reported themselves as one ETF source: document.xml is a different endpoint with different content and a different epistemic status, because a financial fact is asserted by the filer while a supply relation is EXTRACTED by us from prose. The contract states that separation, and records the two decisions that changed the measurement — utf-8 decoding (EUC-KR produced 148,449 replacement characters and a false reading of '0 매출처') and a 150-character context window (whole-document search turned a holding company's portfolio into its customers). Emptiness is declared a valid observation here, unlike the curated macro mapping: 6 of 40 sampled reports genuinely have no 매출처 section. The cursor exists because 188 KR issuers at ~2 requests each cannot fit one day's document.xml budget, which ran out at 120 requests.",
    tables: [],
    sql: dartSupplyDisclosureSourceMigrationSql,
  },
  {
    id: '070_document_entity_canonical_name',
    description:
      "Admits 'canonical_name' as a document-to-entity link method so the linker can use core.entity.canonical_name, the one catalog holding a name for every stock and the one it never consulted. Measured 2026-08-06 over 4,895 news documents: core.entity_alias holds 354 rows for 325 Stock entities and only 94 contain Hangul, while 2,712 of the documents are Korean — so Korean news naming a Korean company could match only if that company was one of the 94. Canonical names match 770 documents alone and lift the union of all linkers from 672 to 914 (13.7% to 18.7%). Restricted to Hangul names because stripping Korean corporate forms also strips whitespace, and a Latin name without token boundaries hides inside longer Latin words (sk in novonordiskas, ls in appliedmaterialsinc, gm in figma — 76 collisions across 10 short Latin names against 7 across 24 Hangul ones); Latin stays with the ticker and alias linkers, which keep their boundaries. Folding this into alias_exact was rejected: the finding is that one catalog went unread, and a link method that cannot name its catalog would hide that from the next audit.",
    tables: [],
    sql: documentEntityCanonicalNameMigrationSql,
  },
  {
    id: '071_claim_dedupe_key',
    description:
      "Gives knowledge.claim the document-scoped uniqueness it never had. Every extraction INSERT was unconditional — no ON CONFLICT, no pre-existence check, and no constraint to conflict against across all 70 prior migrations — while knowledge.event has deduped on dedupe_key since it was written. Measured 2026-08-06 over 327 claims and split by cause, because the two kinds need different fixes: 34 duplicates come from the same document repeated (this migration), 10 from two documents reporting the same claim (run-claim-merge, which stays). The cross-document ten cannot become a constraint — two documents days apart are one claim and months apart are two, and a unique index cannot express 'within 7 days'. The column is nullable and the index partial so the 327 existing rows keep a NULL key and never conflict: nothing is deleted and no history is rewritten, which matters because claim status transitions are trigger-guarded and audited and there is no deletion path at all.",
    tables: [],
    sql: claimDedupeKeyMigrationSql,
  },
  {
    id: '072_dart_supply_license_tier',
    description:
      "Gives opendart-business-report-supply the ADR-002 T1 tier contract migration 069 omitted. 069 approved the source with a license_policy of {basis: official_api_terms, status: conditional} and no tier tuple, which violates this repository's own invariant that an approved contract carries either an exact ADR-002 tier tuple or the internal-transitional exemption — it was the only violation among 36 approved contracts. It went unnoticed because source-contract-integrity.test.ts skips unless STOCK_INSIGHT_SOURCE_REVISION_TEST_DB_URL is set, which the ordinary test run does not set: six tests reported skipped and the suite was green. T1/accepted_evidence_and_display/attribution_required mirrors the sibling 'opendart' source approved 2026-07-20 — same API, same licence, same use as accepted evidence behind SUPPLIES and CUSTOMER_OF. Appended as a new revision because contracts are append-only.",
    tables: [],
    sql: dartSupplyLicenseTierMigrationSql,
  },
  {
    id: '073_macro_series_natural_gas',
    description:
      "Adds Henry Hub natural gas as a second series under the 'energy' topic, which had exactly one (WTI, migration 067) so every energy event reached the graph through a single instrument. Gold, silver and copper were checked against the live FRED API rather than assumed and did not make it: FRED no longer publishes a gold or silver spot price (the LBMA fixings are discontinued; GVZCLS is a volatility index and the remainder are producer/import price indices), and copper's PCOPPUSDM is monthly, which the co-movement model drops for trading-day alignment (38/59 overlap) — adding it would collect vintages nothing reads.",
    tables: [],
    sql: macroSeriesNaturalGasMigrationSql,
  },
  {
    id: '074_scheduled_event',
    description:
      "Creates market.scheduled_event for dated things — central bank meetings, economic releases, earnings — promoted from research-common calendar snapshots that have been collected daily for months and discarded. Both scripts/event_calendar.py and research_common/macro_calendar.py are scheduled in run_collectors.py and both write only a JSON file; what reaches Postgres is a derived signal card that keeps the narrative and drops the date, so 'BOK 2026-08-28 한국은행 금통위, D-21' existed on disk and nowhere in this database. Explicitly NOT a legislative calendar: bill status and chamber schedules are collected by no project — macro_calendar.py's policy_events are news headlines tagged with a category, not schedules with vote dates — and modelling them needs a new external source rather than a half-shaped column here.",
    tables: [],
    sql: scheduledEventMigrationSql,
  },
  {
    id: '075_legislative_action',
    description:
      "Admits 'legislative_action' into market.scheduled_event. Migration 074 stated the table was not a legislative calendar because no project collected one — macro_calendar.py's policy_events are news headlines with a category and carry no vote date, chamber or bill id. CONGRESS_GOV_API_KEY was added on 2026-08-07 and api.congress.gov returns exactly the missing shape (S850 2026-08-05 Passed Senate; HR9882 2026-07-22 Referred to the House Committee on Homeland Security), so the kind is admitted and 074's note is superseded rather than left reading as current. Modelled as one row per bill action rather than as a bill: a bill has identity and a months-long stream of actions, and faking that by overloading a calendar row would be worse than leaving the richer model for later.",
    tables: [],
    sql: legislativeActionMigrationSql,
  },
  {
    id: '076_ecos_macro_series',
    description:
      "Gives the five collected BOK ECOS series a core.entity identity, the first ECOS_SERIES identifiers this database has ever held, and an analytics.macro_series_topic mapping under 'rates'. The vocabulary was never the gap: analytics.market_topic_term already carried 국채·금리·기준금리·한국은행 under 'rates' while every series mapped to it was American. The wall was run-v2-graph-publish joining core.entity_identifier on identifier_type='FRED_SERIES' alone, so a Korean series could not enter the co-movement model whatever mapping it was given; that join now accepts both namespaces and this migration is the half that mints the rows. Excludes 원/달러 (the same quantity as fred:DEXKOUS, already mapped to 'fx'), KOSPI (nearly the same object as the equal-weighted KR beta control in MARKET_FACTOR_SQL — a modelling decision, not a series list entry) and 뉴스심리지수 (BOK publishes it as 실험적 통계).",
    tables: [],
    sql: ecosMacroSeriesMigrationSql,
  },
  {
    id: '077_institutional_holder_entities',
    description:
      "Mints a LegalEntity per institutional holder in public.institutional_holdings, which is the missing subject the ownership builder needed. buildOwnershipCandidates has had approved ontology (024 seeds OWNS/HELD_BY/COMMON_OWNER as approved) and golden/determinism/superhub tests since B6, yet its only callers were tests and HELD_BY never held an edge — not because it was unwired but because core.entity contained no institution to be the owner. The owned side already resolved: 250 of 250 holdings join to a core Stock via public.entities.entity_key. Uses INTERNAL_KEY with an 'INSTITUTION:' prefix rather than CIK, because core.entity_identifier is UNIQUE (identifier_type, identifier_value, namespace) and a holder can also be an issuer we cover (Berkshire Hathaway files here); the CIK is kept in metadata where it is joinable and cannot collide. Derived from the table rather than hardcoded so a later holder is picked up by a re-run, and so the seven holders with no CIK (국민연금공단, 삼성자산운용 …) are not dropped.",
    tables: [],
    sql: institutionalHolderEntitiesMigrationSql,
  },
  {
    id: '078_semantic_snapshot',
    description:
      "Creates governance.semantic_snapshot, the version pin canonical/02 §9 requires so 'what did this number mean' has one answer per artifact, and REQ-REL-001 can ask whether two surfaces used compatible snapshots. Numbered before the information set because that table carries semantic_snapshot_id as a foreign key — numbering follows the dependency, not the order the plan listed them. Uses a TEXT primary key rather than the usual surrogate-plus-key pair because the snapshot id is quoted inside run manifests and artifacts that outlive the row, so a surrogate would force every consumer to join to translate. Append-only with one state-machine exception (open -> sealed -> superseded): editing a snapshot rewrites the meaning of artifacts already derived under it, which is REQ-SEM-002 applied to versioning. Granted to pipeline roles only; the boot guard's digests are all has_table_privilege-filtered, so a table the app roles cannot see does not move their pins and needs no re-pin — the discipline migration 059 lacked when it crashlooped the brain.",
    tables: [],
    sql: semanticSnapshotMigrationSql,
  },
  {
    id: '079_analysis_information_set',
    description:
      "Creates governance.analysis_information_set — canonical/02 §1's record of what a derivation was allowed to see. Keeps four cutoffs separate (valid, source-available, system-known, market-observation) because canonical/00 §5 keeps the time axes separate; collapsing them loses the sentence a leak-free backtest depends on, 'this was true then but we could not have known it'. The cutoffs are NOT NULL with no default precisely because a default is how now() becomes a business cutoff without anyone deciding to, which REQ-PIT-003 forbids. Four CHECK constraints mirror packages/contracts/src/analysis-information-set.ts one for one — the contract rejects a bad request before work starts, the constraint rejects a bad row however it was produced, and a leak only the application can catch is a leak. Fully append-only with no state machine: an information set describes a boundary, and an editable boundary is not one (REQ-KERN-002).",
    tables: [],
    sql: analysisInformationSetMigrationSql,
  },
  {
    id: '080_source_pit_quality',
    description:
      'Records the PIT reconstructability class (canonical/02 §3) per source, so REQ-KERN-020 — PIT_D/E data must not be a core input to past ex-ante evaluation — becomes enforceable instead of unstated. canonical/08 §1 puts the class in the source contract and that was the plan, but ingestion.source_contract_revision carries an immutability trigger and a content_hash over the contract it states: adding a column and backfilling would either fail or leave 69 revisions whose hash no longer describes their content. Grading is also revised as a source is learned, a different lifecycle from the contract, so it gets its own append-only ledger with a current-view mirroring source_contract_current_v1. Grades only what has a checkable reason — fred PIT_A (ALFRED vintages), SEC/DART PIT_B (immutable accession-addressed filings), internal snapshots and bok-ecos PIT_C (no source revision axis; run-ecos-vintage already marks vintage_quality approximate), quote APIs PIT_D — and leaves the remaining sources PIT_E_UNKNOWN because over-claiming replayability silently admits data the system could not have had.',
    tables: [],
    sql: sourcePitQualityMigrationSql,
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
  cryptoContagionImpactMigrationSql,
  cryptoCrossDomainGraphMigrationSql,
  cryptoServingViewsMigrationSql,
  personalizationReaderSurfaceHardeningMigrationSql,
  cryptoServingAppReaderGrantMigrationSql,
  adminInvitationControlMigrationSql,
  impactV1InternalOnlyMigrationSql,
  marketFactSourceLineageMigrationSql,
  macroVintageSourceLineageMigrationSql,
  marketConfirmationReadsV2MigrationSql,
  worldEventProjectsMagnitudeMigrationSql,
  cryptoIdentitySeedMigrationSql,
  eventRevisionIdentityMigrationSql,
  marketTopicVocabularyMigrationSql,
  feedLabelEventTargetsMigrationSql,
  macroSeriesEntitiesMigrationSql,
  macroComovementOntologyMigrationSql,
  macroSeriesEnergyMigrationSql,
  macroTopicEntitiesMigrationSql,
  dartSupplyDisclosureSourceMigrationSql,
  documentEntityCanonicalNameMigrationSql,
  claimDedupeKeyMigrationSql,
  dartSupplyLicenseTierMigrationSql,
  macroSeriesNaturalGasMigrationSql,
  scheduledEventMigrationSql,
  legislativeActionMigrationSql,
  ecosMacroSeriesMigrationSql,
  institutionalHolderEntitiesMigrationSql,
  secFinraSourceRegistrationMigrationSql,
  semanticSnapshotMigrationSql,
  analysisInformationSetMigrationSql,
  sourcePitQualityMigrationSql,
};
