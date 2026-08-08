import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assignSemiconductorPlaybook,
  type TaxonomyMember,
} from '../src/backfill/playbook-assignment.ts';

function member(overrides: Partial<TaxonomyMember> = {}): TaxonomyMember {
  return {
    entityId: 1,
    entityName: 'NVIDIA',
    taxonomyNodeId: 500,
    taxonomySystem: 'SIC',
    code: '3674',
    ...overrides,
  };
}

describe('the industry code is evidence, not proof', () => {
  it('assigns on a code that says semiconductors outright', () => {
    const { assignments } = assignSemiconductorPlaybook([member()]);
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].assignmentBasis, 'taxonomy');
    assert.equal(assignments[0].taxonomyNodeId, 500);
  });

  it('assigns Samsung Electronics against its code, and says why', () => {
    // KSIC 264 is communications equipment, assigned on the handset business.
    // It is also the largest memory manufacturer in the world.
    const { assignments } = assignSemiconductorPlaybook([
      member({ entityId: 9, entityName: '삼성전자', code: '264', taxonomySystem: 'KSIC' }),
    ]);
    assert.equal(assignments[0].assignmentBasis, 'curated');
    assert.match(assignments[0].rationale, /largest memory manufacturer/);
  });

  it('leaves the node out of a curated assignment', () => {
    // The assignment is being made against the code, so naming the node would
    // suggest the code carried it.
    const { assignments } = assignSemiconductorPlaybook([
      member({ entityId: 9, entityName: '삼성전자', code: '264' }),
    ]);
    assert.equal(assignments[0].taxonomyNodeId, null);
  });

  it('does not take in the rest of the KSIC 26 branch', () => {
    // Defence electronics and satellite antennas share the branch and nothing
    // else. Assigning by branch would govern them with a memory-cycle playbook.
    const { assignments, nearMisses } = assignSemiconductorPlaybook([
      member({ entityId: 2, entityName: '한화시스템', code: '26299' }),
      member({ entityId: 3, entityName: '인텔리안테크', code: '26429' }),
      member({ entityId: 4, entityName: 'LG디스플레이', code: '2621' }),
      member({ entityId: 5, entityName: '삼성전기', code: '2622' }),
    ]);
    assert.equal(assignments.length, 0);
    assert.equal(nearMisses.length, 4);
    assert.ok(nearMisses.every((miss) => miss.reason.length > 20));
  });

  it('reports the near misses rather than dropping them silently', () => {
    // An absence is not a decision a later reader can see.
    const { nearMisses } = assignSemiconductorPlaybook([
      member({ entityId: 4, entityName: 'LG디스플레이', code: '2621' }),
    ]);
    assert.match(nearMisses[0].reason, /display panel/);
  });

  it('says nothing about a company in an unrelated industry', () => {
    const { assignments, nearMisses } = assignSemiconductorPlaybook([
      member({ entityId: 6, entityName: 'Amazon', code: '7372' }),
    ]);
    assert.equal(assignments.length, 0);
    assert.equal(nearMisses.length, 0);
  });

  it('assigns a company holding two qualifying codes only once', () => {
    const { assignments } = assignSemiconductorPlaybook([
      member({ entityId: 7, code: '3674', taxonomyNodeId: 500 }),
      member({ entityId: 7, code: '2612', taxonomyNodeId: 600 }),
    ]);
    assert.equal(assignments.length, 1);
  });

  it('reports a curation that no longer names anybody', () => {
    // A stale decision that fails loudly beats one that quietly governs nothing.
    const { unmatchedCurations } = assignSemiconductorPlaybook([member()]);
    assert.deepEqual(unmatchedCurations, ['삼성전자']);
  });
});
