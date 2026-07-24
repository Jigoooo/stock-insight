import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateCryptoContagion } from '../src/crypto/contagion.ts';

const usdc = 'crypto:stablecoin:eip155:1/erc20:0x0000000000000000000000000000000000000001';
const protocol = 'crypto:protocol:lending-v1';
const exchange = 'crypto:exchange:venue-a';
const base = {
  dataCutoff: '2026-07-23T00:00:00.000Z',
  maxDepth: 3,
  seeds: [{ entityKey: usdc, shockMagnitude: 1 }],
  edges: [
    {
      edgeKey: 'reserve-to-protocol',
      fromEntityKey: usdc,
      toEntityKey: protocol,
      channel: 'reserve_backing',
      propagationWeight: 0.8,
      knownAt: '2026-07-22T00:00:00.000Z',
    },
    {
      edgeKey: 'protocol-to-exchange',
      fromEntityKey: protocol,
      toEntityKey: exchange,
      channel: 'liquidity_pool',
      propagationWeight: 0.5,
      knownAt: '2026-07-22T00:00:00.000Z',
    },
  ],
};

describe('P6-4 crypto contagion propagation', () => {
  it('propagates bounded candidate risk with complete path lineage', () => {
    const result = evaluateCryptoContagion(base);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.deepEqual(
      result.candidates.map(({ entityKey, riskScore, depth }) => ({ entityKey, riskScore, depth })),
      [
        { entityKey: usdc, riskScore: 1, depth: 0 },
        { entityKey: protocol, riskScore: 0.8, depth: 1 },
        { entityKey: exchange, riskScore: 0.4, depth: 2 },
      ],
    );
    assert.deepEqual(result.candidates[2]?.pathEdgeKeys, [
      'reserve-to-protocol',
      'protocol-to-exchange',
    ]);
    assert.equal(result.candidateOnly, true);
    assert.equal(result.acceptedImpactAllowed, false);
    assert.equal(result.orderExecutable, false);
  });

  it('ignores post-cutoff edges and does not amplify cycles', () => {
    const result = evaluateCryptoContagion({
      ...base,
      edges: [
        ...base.edges,
        {
          edgeKey: 'cycle',
          fromEntityKey: exchange,
          toEntityKey: usdc,
          channel: 'liquidity_pool',
          propagationWeight: 1,
          knownAt: '2026-07-22T00:00:00.000Z',
        },
        {
          edgeKey: 'future',
          fromEntityKey: usdc,
          toEntityKey: 'crypto:protocol:future-only',
          channel: 'reserve_backing',
          propagationWeight: 1,
          knownAt: '2026-07-24T00:00:00.000Z',
        },
      ],
    });
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') {
      assert.equal(
        result.candidates.some(({ entityKey }) => entityKey.endsWith('future-only')),
        false,
      );
      assert.ok(result.candidates.every(({ riskScore }) => riskScore >= 0 && riskScore <= 1));
    }
  });

  it('fails closed on malformed probabilities, duplicate edges, stock identities, or unbounded depth', () => {
    for (const input of [
      { ...base, seeds: [{ entityKey: usdc, shockMagnitude: 2 }] },
      { ...base, edges: [base.edges[0], base.edges[0]] },
      { ...base, edges: [{ ...base.edges[0], toEntityKey: 'KR:005930' }] },
      { ...base, maxDepth: 100 },
    ]) {
      assert.deepEqual(evaluateCryptoContagion(input), {
        status: 'abstained',
        reason: 'INVALID_CRYPTO_CONTAGION_INPUT',
        candidateOnly: true,
        acceptedImpactAllowed: false,
        orderExecutable: false,
      });
    }
  });
});
