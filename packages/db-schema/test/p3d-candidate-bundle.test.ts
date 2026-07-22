import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EXPECTED_P3D_CANDIDATE_MIGRATION_IDS,
  selectExactP3dCandidateBundle,
} from '../../../apps/api/scripts/p3d-candidate-bundle.mjs';

function migrations(ids: readonly string[]) {
  return ids.map((id) => ({ id, sql: `-- ${id}` }));
}

const exactRegistry = [
  { id: '030_multi_user_invitation_signup', sql: '-- 030' },
  ...migrations(EXPECTED_P3D_CANDIDATE_MIGRATION_IDS),
  { id: '043_future', sql: '-- 043' },
];

describe('P3-D candidate migration bundle selector', () => {
  it('returns the exact contiguous 031→042 bundle from a larger registry', () => {
    assert.deepEqual(
      selectExactP3dCandidateBundle(exactRegistry).map(({ id }) => id),
      EXPECTED_P3D_CANDIDATE_MIGRATION_IDS,
    );
  });

  it('rejects a duplicate candidate id after the first 042', () => {
    assert.throws(
      () =>
        selectExactP3dCandidateBundle([
          ...exactRegistry,
          { id: '042_geo_entity_identity_immutability', sql: '-- duplicate 042' },
        ]),
      /exact ordered 031→042 set/,
    );
  });

  it('rejects an inserted migration inside the candidate range', () => {
    const registry = [...exactRegistry];
    registry.splice(5, 0, { id: '035a_inserted', sql: '-- inserted' });
    assert.throws(() => selectExactP3dCandidateBundle(registry), /exact ordered 031→042 set/);
  });

  it('rejects leading duplicates, missing ids, and reordered ids', () => {
    const leadingDuplicate = [
      { id: '031_truth_kernel', sql: '-- duplicate 031' },
      ...exactRegistry,
    ];
    const missing = exactRegistry.filter(({ id }) => id !== '037_impact_exposure_ledger');
    const reordered = [...exactRegistry];
    [reordered[4], reordered[5]] = [reordered[5]!, reordered[4]!];

    for (const registry of [leadingDuplicate, missing, reordered]) {
      assert.throws(() => selectExactP3dCandidateBundle(registry), /exact ordered 031→042 set/);
    }
  });
});
