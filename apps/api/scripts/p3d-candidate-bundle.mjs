export const EXPECTED_P3D_CANDIDATE_MIGRATION_IDS = Object.freeze([
  '031_truth_kernel',
  '032_world_event_temporal_lineage',
  '033_entity_resolution_ontology',
  '034_geo_foundation',
  '035_geo_exposure_pit_universe',
  '036_truth_geo_serving',
  '037_impact_exposure_ledger',
  '038_production_network',
  '039_methodology_registry',
  '040_scenario_spatial_impact',
  '041_precompute_cache_ledger',
  '042_geo_entity_identity_immutability',
]);

const EXACT_BUNDLE_ERROR =
  'Migration registry P3-D candidate bundle is not the exact ordered 031→042 set';

export function selectExactP3dCandidateBundle(migrations) {
  const expectedIds = EXPECTED_P3D_CANDIDATE_MIGRATION_IDS;
  const expectedSet = new Set(expectedIds);
  const candidateOccurrences = migrations.filter(({ id }) => expectedSet.has(id));
  const occurrenceIds = candidateOccurrences.map(({ id }) => id);
  const startIndex = migrations.findIndex(({ id }) => id === expectedIds[0]);
  const contiguousBundle =
    startIndex < 0 ? [] : migrations.slice(startIndex, startIndex + expectedIds.length);
  const contiguousIds = contiguousBundle.map(({ id }) => id);

  if (
    occurrenceIds.length !== expectedIds.length ||
    occurrenceIds.some((id, index) => id !== expectedIds[index]) ||
    contiguousIds.length !== expectedIds.length ||
    contiguousIds.some((id, index) => id !== expectedIds[index])
  ) {
    throw new Error(EXACT_BUNDLE_ERROR);
  }

  return contiguousBundle;
}
