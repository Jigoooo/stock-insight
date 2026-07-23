import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileCryptoIdentityKey } from '../src/crypto/identity-key.ts';

describe('P6-1 crypto canonical identity keys', () => {
  it('normalizes CAIP-2 blockchain and EVM CAIP-10 contract identities', () => {
    assert.deepEqual(compileCryptoIdentityKey({ kind: 'blockchain', chainId: 'eip155:1' }), {
      status: 'ok',
      entityKind: 'blockchain',
      entityKey: 'crypto:blockchain:eip155:1',
      chainId: 'eip155:1',
      accountAddress: null,
      readOnly: true,
      orderExecutable: false,
    });
    assert.deepEqual(
      compileCryptoIdentityKey({
        kind: 'token',
        chainId: 'eip155:1',
        accountAddress: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      }),
      {
        status: 'ok',
        entityKind: 'token',
        entityKey: 'crypto:token:eip155:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        chainId: 'eip155:1',
        accountAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        readOnly: true,
        orderExecutable: false,
      },
    );
  });

  it('keeps off-chain protocol identities separate from ticker aliases', () => {
    assert.deepEqual(compileCryptoIdentityKey({ kind: 'protocol', slug: 'aave-v3' }), {
      status: 'ok',
      entityKind: 'protocol',
      entityKey: 'crypto:protocol:aave-v3',
      chainId: null,
      accountAddress: null,
      readOnly: true,
      orderExecutable: false,
    });
    assert.notDeepEqual(
      compileCryptoIdentityKey({
        kind: 'smart_contract',
        chainId: 'eip155:1',
        accountAddress: '0x0000000000000000000000000000000000000001',
      }),
      compileCryptoIdentityKey({
        kind: 'token',
        chainId: 'eip155:1',
        accountAddress: '0x0000000000000000000000000000000000000001',
      }),
    );
  });

  it('supports CAIP-19 native assets such as bitcoin without inventing a contract address', () => {
    assert.deepEqual(
      compileCryptoIdentityKey({
        kind: 'token',
        assetId: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
      }),
      {
        status: 'ok',
        entityKind: 'token',
        entityKey: 'crypto:token:bip122:000000000019d6689c085ae165831e93/slip44:0',
        chainId: 'bip122:000000000019d6689c085ae165831e93',
        accountAddress: null,
        readOnly: true,
        orderExecutable: false,
      },
    );
  });

  it('fails closed on ticker-only, malformed CAIP, missing locator, or wrong address case rules', () => {
    for (const input of [
      { kind: 'token', slug: 'usdc' },
      { kind: 'blockchain', chainId: 'EIP155:1' },
      { kind: 'smart_contract', chainId: 'eip155:1' },
      { kind: 'exchange', slug: 'Binance' },
      { kind: 'token', chainId: 'eip155:1', accountAddress: '0x1234' },
    ]) {
      assert.deepEqual(compileCryptoIdentityKey(input), {
        status: 'abstained',
        reason: 'INVALID_CRYPTO_IDENTITY',
        readOnly: true,
        orderExecutable: false,
      });
    }
  });
});
