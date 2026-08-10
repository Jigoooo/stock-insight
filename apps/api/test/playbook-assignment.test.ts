import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assignPlaybooks, type TaxonomyMember } from '../src/backfill/playbook-assignment.ts';

function member(overrides: Partial<TaxonomyMember> = {}): TaxonomyMember {
  return {
    entityId: 1,
    entityKey: 'US:NVDA',
    entityName: 'NVIDIA',
    taxonomyNodeId: 500,
    taxonomySystem: 'SIC',
    code: '3674',
    ...overrides,
  };
}

/** Every curated company, so a scope's curations never read as stale in an unrelated test. */
function allCurated(): TaxonomyMember[] {
  return [
    member({ entityId: 90, entityKey: 'KR:005930', entityName: '삼성전자', code: '264' }),
    member({ entityId: 91, entityKey: 'KR:055550', entityName: '신한지주', code: '64992' }),
    member({ entityId: 92, entityKey: 'KR:086790', entityName: '086790', code: '64992' }),
    member({ entityId: 93, entityKey: 'KR:105560', entityName: '105560', code: '64992' }),
    member({ entityId: 94, entityKey: 'KR:138930', entityName: '138930', code: '64992' }),
    member({ entityId: 95, entityKey: 'KR:175330', entityName: '175330', code: '64992' }),
    member({ entityId: 96, entityKey: 'KR:139130', entityName: '아이엠금융지주', code: '64992' }),
  ];
}

describe('the industry code is evidence, not proof', () => {
  it('assigns on a code that says semiconductors outright', () => {
    const { assignments } = assignPlaybooks([member()]);
    const semi = assignments.filter((row) => row.playbookKey === 'semiconductor');
    assert.equal(semi.length, 1);
    assert.equal(semi[0]?.assignmentBasis, 'taxonomy');
    assert.equal(semi[0]?.taxonomyNodeId, 500);
  });

  it('assigns Samsung Electronics against its code, and says why', () => {
    // KSIC 264 is communications equipment, assigned on the handset business.
    // It is also the largest memory manufacturer in the world.
    const { assignments } = assignPlaybooks([
      member({ entityId: 9, entityKey: 'KR:005930', entityName: '삼성전자', code: '264' }),
    ]);
    assert.equal(assignments[0]?.assignmentBasis, 'curated');
    assert.match(assignments[0]?.rationale ?? '', /largest memory manufacturer/);
  });

  it('leaves the node out of a curated assignment', () => {
    // The assignment is being made against the code, so naming the node would
    // suggest the code carried it.
    const { assignments } = assignPlaybooks([
      member({ entityId: 9, entityKey: 'KR:005930', entityName: '삼성전자', code: '264' }),
    ]);
    assert.equal(assignments[0]?.taxonomyNodeId, null);
  });

  it('does not take in the rest of the KSIC 26 branch', () => {
    const { assignments, nearMisses } = assignPlaybooks([
      member({ entityId: 2, entityKey: 'KR:272210', entityName: '한화시스템', code: '26299' }),
      member({ entityId: 3, entityKey: 'KR:189300', entityName: '인텔리안테크', code: '26429' }),
      member({ entityId: 4, entityKey: 'KR:034220', entityName: 'LG디스플레이', code: '2621' }),
      member({ entityId: 5, entityKey: 'KR:009150', entityName: '삼성전기', code: '2622' }),
    ]);
    assert.equal(assignments.length, 0);
    assert.equal(nearMisses.length, 4);
    assert.ok(nearMisses.every((miss) => miss.reason.length > 20));
  });

  it('says nothing about a company in an unrelated industry', () => {
    const { assignments, nearMisses } = assignPlaybooks([
      member({ entityId: 6, entityKey: 'US:AMZN', entityName: 'Amazon', code: '7372' }),
    ]);
    assert.equal(assignments.length, 0);
    assert.equal(nearMisses.length, 0);
  });

  it('assigns a company holding two qualifying codes only once', () => {
    const { assignments } = assignPlaybooks([
      member({ entityId: 7, code: '3674', taxonomyNodeId: 500 }),
      member({ entityId: 7, code: '2612', taxonomyNodeId: 600 }),
    ]);
    assert.equal(assignments.filter((row) => row.entityId === 7).length, 1);
  });

  it('reports a curation that no longer names anybody', () => {
    // A stale decision that fails loudly beats one that quietly governs nothing.
    const { unmatchedCurations } = assignPlaybooks([member()]);
    assert.ok(unmatchedCurations.some((entry) => entry.entityKey === 'KR:005930'));
    assert.ok(unmatchedCurations.every((entry) => entry.playbookKey.length > 0));
  });

  it('finds every curated company when they are all present', () => {
    const { unmatchedCurations } = assignPlaybooks(allCurated());
    assert.deepEqual(unmatchedCurations, []);
  });
});

describe('a holding company code is a legal form, not a sector', () => {
  // KSIC 64992 지주회사 covers six bank groups and eight industrials. This is the same
  // failure mode as KSIC 26 taking in a defence contractor, and it is why the bank
  // groups arrive curated while the code itself is an explicit near miss.
  it('assigns the bank holding companies by name, not by their shared code', () => {
    const { assignments } = assignPlaybooks(allCurated());
    const banks = assignments.filter((row) => row.playbookKey === 'bank');
    assert.equal(banks.length, 6);
    assert.ok(banks.every((row) => row.assignmentBasis === 'curated'));
    assert.ok(banks.every((row) => row.taxonomyNodeId === null));
  });

  it('records the industrial holding companies as near misses under the same code', () => {
    const { assignments, nearMisses } = assignPlaybooks([
      member({ entityId: 20, entityKey: 'KR:034730', entityName: 'SK', code: '64992' }),
      member({ entityId: 21, entityKey: 'KR:009540', entityName: 'HD한국조선해양', code: '64992' }),
      member({ entityId: 22, entityKey: 'KR:086520', entityName: '에코프로', code: '64992' }),
    ]);
    assert.equal(assignments.length, 0);
    assert.equal(nearMisses.length, 3);
    assert.ok(nearMisses.every((miss) => /legal form/.test(miss.reason)));
  });

  it('keeps brokers, insurers, crypto platforms, ETFs and REITs out of the bank playbook', () => {
    // canonical/04 §5 heads the section 'Banks / Financials', but every minimum it
    // lists — deposit beta, NIM, capital — is a bank concept. A broker has no deposit
    // franchise and an ETF is not an operating company.
    const { assignments, nearMisses } = assignPlaybooks([
      member({ entityId: 30, entityKey: 'KR:016360', entityName: '삼성증권', code: '66121' }),
      member({ entityId: 31, entityKey: 'KR:000810', entityName: '삼성화재', code: '65121' }),
      member({ entityId: 32, entityKey: 'US:COIN', entityName: 'Coinbase', code: '6199' }),
      member({ entityId: 33, entityKey: 'US:GLD', entityName: 'SPDR Gold', code: '6221' }),
      member({ entityId: 34, entityKey: 'US:PLD', entityName: 'Prologis', code: '6798' }),
      member({ entityId: 35, entityKey: 'US:UNH', entityName: 'UNH', code: '6324' }),
    ]);
    assert.equal(assignments.length, 0);
    assert.equal(nearMisses.length, 6);
    assert.ok(nearMisses.every((miss) => miss.playbookKey === 'bank'));
  });

  it('assigns an unambiguous bank code without curation', () => {
    const { assignments } = assignPlaybooks([
      member({
        entityId: 40,
        entityKey: 'US:JPM',
        entityName: 'JPMorgan Chase & Co',
        code: '6021',
      }),
      member({ entityId: 41, entityKey: 'KR:024110', entityName: '중소기업은행', code: '64121' }),
    ]);
    const banks = assignments.filter((row) => row.playbookKey === 'bank');
    assert.equal(banks.length, 2);
    assert.ok(banks.every((row) => row.assignmentBasis === 'taxonomy'));
  });
});

describe('curations are keyed by identifier, not by name', () => {
  it('matches a bank group whose canonical name is its ticker', () => {
    // core.entity.canonical_name reads '086790' for 하나금융지주 and '105560' for
    // KB금융지주. A curation keyed by name matches neither, and the failure is silent —
    // the company simply never gets a playbook and nothing says so.
    const { assignments } = assignPlaybooks([
      member({ entityId: 50, entityKey: 'KR:086790', entityName: '086790', code: '64992' }),
    ]);
    assert.equal(assignments.length, 1);
    assert.match(assignments[0]?.rationale ?? '', /하나금융지주/);
  });

  it('does not match a company that merely shares a name with a curated one', () => {
    const { assignments, nearMisses } = assignPlaybooks([
      member({ entityId: 51, entityKey: 'KR:999999', entityName: '신한지주', code: '64992' }),
    ]);
    assert.equal(assignments.length, 0);
    assert.equal(nearMisses.length, 1);
  });
});
