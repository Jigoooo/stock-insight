import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cryptoResearchQuerySchema,
  cryptoResearchWorkspaceSchema,
  parseCanonicalCryptoKey,
} from '../src/crypto-research.ts';

const fixture = {
  schemaVersion: 'p6.v1',
  availability: 'available',
  knownAt: '2026-07-23T00:00:00.000Z',
  readOnly: true,
  orderExecutable: false,
  stats: { entities: 1, events: 1, companyLinks: 1, riskExposures: 1 },
  entities: [
    {
      entityKey: 'crypto:token:bip122:000000000019d6689c085ae165831e93/slip44:0',
      entityKind: 'token',
      displayName: 'Bitcoin',
      symbol: 'BTC',
      chainId: 'bip122:000000000019d6689c085ae165831e93',
      sourceRevisionId: 11,
      knownAt: '2026-07-22T00:00:00.000Z',
    },
  ],
  events: [
    {
      eventKey: 'crypto:event:chain_halt:test',
      eventType: 'chain_halt',
      lifecycleState: 'confirmed',
      summary: '확인된 체인 사건',
      finalityState: 'finalized',
      sourceRevisionId: 12,
      knownAt: '2026-07-22T00:00:00.000Z',
    },
  ],
  companyLinks: [
    {
      relationKey: 'cross:btc:mstr',
      cryptoEntityKey: 'crypto:token:bip122:000000000019d6689c085ae165831e93/slip44:0',
      cryptoName: 'Bitcoin',
      coreEntityKey: 'COMPANY:US:MSTR',
      coreName: 'Strategy',
      coreEntityType: 'Company',
      relationKind: 'treasury_held_by_company',
      relationState: 'verified',
      economicMagnitude: '214000',
      economicMagnitudeUnit: 'BTC',
      epistemicConfidence: 0.99,
      sourceRevisionId: 13,
      knownAt: '2026-07-22T00:00:00.000Z',
    },
  ],
  riskExposures: [
    {
      exposureKey: 'crypto:risk:btc',
      cryptoEntityKey: 'crypto:token:bip122:000000000019d6689c085ae165831e93/slip44:0',
      cryptoName: 'Bitcoin',
      shockType: 'liquidity_withdrawal',
      channelKey: 'exchange_venue',
      directionSign: -1,
      economicMagnitude: '0.2',
      economicMagnitudeUnit: 'ratio',
      epistemicConfidence: 0.8,
      lifecycleState: 'sealed',
      sourceRevisionId: 14,
      knownAt: '2026-07-22T00:00:00.000Z',
    },
  ],
};

describe('P6-6 crypto research workspace contract', () => {
  it('accepts complete read-only crypto and company evidence', () => {
    const result = cryptoResearchWorkspaceSchema.parse(fixture);
    assert.equal(result.companyLinks[0]?.coreEntityKey, 'COMPANY:US:MSTR');
    assert.equal(result.readOnly, true);
    assert.equal(result.orderExecutable, false);
    assert.equal(
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        riskExposures: [
          {
            ...fixture.riskExposures[0],
            epistemicConfidence: null,
            lifecycleState: 'building',
          },
        ],
      }).riskExposures[0]?.epistemicConfidence,
      null,
    );
    assert.equal(
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        companyLinks: [
          { ...fixture.companyLinks[0], coreEntityKey: 'STOCK:US:MSTR', coreEntityType: 'Stock' },
        ],
      }).companyLinks[0]?.coreEntityKey,
      'STOCK:US:MSTR',
    );
  });

  it('rejects execution flags, collapsed confidence, and malformed crypto identity', () => {
    assert.deepEqual(parseCanonicalCryptoKey('crypto:oracle:solana:main:a+b'), {
      kind: 'oracle',
      chainId: 'solana:main',
    });
    assert.equal(parseCanonicalCryptoKey('crypto:oracle:solana:main:a!b'), null);
    assert.throws(() => cryptoResearchWorkspaceSchema.parse({ ...fixture, orderExecutable: true }));
    assert.throws(() =>
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        companyLinks: [{ ...fixture.companyLinks[0], confidenceWeightedMagnitude: '211860' }],
      }),
    );
    assert.throws(() =>
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        entities: [{ ...fixture.entities[0], entityKey: 'crypto:BTC' }],
      }),
    );
    assert.throws(() =>
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        entities: [{ ...fixture.entities[0], chainId: 'eip155:1' }],
      }),
    );
    assert.throws(() =>
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        entities: [
          {
            ...fixture.entities[0],
            entityKey: 'crypto:token:eip155:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            chainId: 'eip155:1',
          },
        ],
      }),
    );
    for (const [entityKey, chainId] of [
      ['crypto:token:eip155:1/erc20:0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'eip155:1'],
      [
        'crypto:token:bip122:000000000019d6689c085ae165831e93/slip44:BTC',
        'bip122:000000000019d6689c085ae165831e93',
      ],
      [
        'crypto:token:cosmos:cosmoshub-4/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        'cosmos:cosmoshub-4',
      ],
      ['crypto:smart_contract:cosmos:cosmoshub-4:a', 'cosmos:cosmoshub-4'],
    ]) {
      assert.throws(() =>
        cryptoResearchWorkspaceSchema.parse({
          ...fixture,
          entities: [{ ...fixture.entities[0], entityKey, chainId }],
        }),
      );
    }
    assert.throws(() =>
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        companyLinks: [{ ...fixture.companyLinks[0], relationState: 'rejected' }],
      }),
    );
    assert.throws(() =>
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        companyLinks: [
          {
            ...fixture.companyLinks[0],
            coreEntityKey: 'ETF:US:BITO',
            coreEntityType: 'Company',
          },
        ],
      }),
    );
    assert.throws(() =>
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        companyLinks: [{ ...fixture.companyLinks[0], coreEntityKey: 'US:MSTR' }],
      }),
    );
    assert.throws(() =>
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        riskExposures: [{ ...fixture.riskExposures[0], economicMagnitudeUnit: null }],
      }),
    );
    assert.throws(() =>
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        riskExposures: [{ ...fixture.riskExposures[0], economicMagnitude: '-0.2' }],
      }),
    );
    assert.throws(() =>
      cryptoResearchWorkspaceSchema.parse({
        ...fixture,
        entities: [...fixture.entities, fixture.entities[0]],
        stats: { ...fixture.stats, entities: 2 },
      }),
    );
    assert.throws(() => cryptoResearchQuerySchema.parse({ knownAt: '', limit: 40 }));
    assert.throws(() => cryptoResearchQuerySchema.parse({ knownAt: '2026-07-23', limit: 100.5 }));
  });
});
