import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileCryptoTruthEvent } from '../src/crypto/truth-event.ts';

const transactionHash = `0x${'A'.repeat(64)}`;
const base = {
  chainEntityKey: 'crypto:blockchain:eip155:1',
  eventType: 'exploit',
  lifecycleState: 'confirmed',
  primaryReference: { kind: 'transaction', value: transactionHash },
  occurredAt: '2026-07-20T00:00:00.000Z',
  availableAt: '2026-07-20T00:01:00.000Z',
  knownAt: '2026-07-20T00:02:00.000Z',
  finalityState: 'finalized',
  participants: [
    { entityKey: 'crypto:protocol:aave-v3', role: 'affected' },
    {
      entityKey: 'crypto:smart_contract:eip155:1:0x0000000000000000000000000000000000000001',
      role: 'target',
    },
  ],
};

describe('P6-2 crypto truth event compiler', () => {
  it('normalizes transaction evidence and emits a read-only crypto event identity', () => {
    const result = compileCryptoTruthEvent(base);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(
      result.eventKey,
      `crypto:event:exploit:crypto:blockchain:eip155:1:tx:${transactionHash.toLowerCase()}`,
    );
    assert.equal(result.primaryReference.value, transactionHash.toLowerCase());
    assert.deepEqual(
      result.participants.map(({ role }) => role),
      ['affected', 'target'],
    );
    assert.equal(result.readOnly, true);
    assert.equal(result.acceptedRelationAllowed, false);
    assert.equal(result.orderExecutable, false);
  });

  it('supports source-bound depeg observations without pretending they are on-chain transactions', () => {
    const digest = 'b'.repeat(64);
    const result = compileCryptoTruthEvent({
      ...base,
      eventType: 'depeg',
      primaryReference: { kind: 'source_digest', value: digest },
      finalityState: 'not_applicable',
    });
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') {
      assert.match(result.eventKey, new RegExp(`source:${digest}$`));
    }
  });

  it('fails closed on chronology, malformed finality, duplicate participants, or stock identities', () => {
    for (const input of [
      { ...base, knownAt: '2026-07-19T00:00:00.000Z' },
      { ...base, finalityState: 'not_applicable' },
      { ...base, participants: [base.participants[0], base.participants[0]] },
      {
        ...base,
        participants: [{ entityKey: 'KR:005930', role: 'affected' }],
      },
      {
        ...base,
        primaryReference: { kind: 'transaction', value: '0x1234' },
      },
    ]) {
      assert.deepEqual(compileCryptoTruthEvent(input), {
        status: 'abstained',
        reason: 'INVALID_CRYPTO_TRUTH_EVENT',
        readOnly: true,
        acceptedRelationAllowed: false,
        orderExecutable: false,
      });
    }
  });
});
