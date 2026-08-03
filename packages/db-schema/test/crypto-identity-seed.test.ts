import assert from 'node:assert/strict';
import test from 'node:test';

import { cryptoIdentitySeedMigrationSql } from '../src/migrations/061_crypto_identity_seed.ts';

// crypto_identity.entity enforces CAIP-2 chain ids and CAIP-19 asset ids by regex,
// while the legacy tables hold only ticker strings. The plan called this a design
// blocker; the universe turned out to be 14 tickers, which makes it a lookup.

test('every identifier records where it came from', () => {
  // A chain id written from memory is invented provenance, which is the exact
  // thing the table's regex exists to prevent.
  assert.match(cryptoIdentitySeedMigrationSql, /CoinGecko \/asset_platforms chain_identifier/);
  assert.match(cryptoIdentitySeedMigrationSql, /namespaces\.chainagnostic\.org\/bip122\/caip2/);
  assert.match(cryptoIdentitySeedMigrationSql, /namespaces\.chainagnostic\.org\/solana\/caip2/);
  assert.match(cryptoIdentitySeedMigrationSql, /CoinGecko \/coins\/\{id\} platforms\.ethereum/);
});

test('the unseeded assets are named, not silently dropped', () => {
  // Seven of fourteen. Leaving that unsaid would read as "crypto identity is done".
  for (const ticker of ['TRX', 'XRP', 'NEAR', 'SUI', 'DOGE', 'HYPE', 'ADA']) {
    assert.match(cryptoIdentitySeedMigrationSql, new RegExp(ticker));
  }
  assert.match(cryptoIdentitySeedMigrationSql, /were not read in this pass/);
});

test('entity_key follows the shape the table CHECK requires', () => {
  // blockchain rows key on chain_id, token rows key on asset_id. Getting this
  // wrong fails at insert rather than silently, but the test keeps it at review.
  assert.match(
    cryptoIdentitySeedMigrationSql,
    /'crypto:blockchain:eip155:1', 'blockchain', 'eip155:1'/,
  );
  assert.match(
    cryptoIdentitySeedMigrationSql,
    /'crypto:token:eip155:1\/erc20:0x514910771af9ca656af840dff83e8264ecf986ca'/,
  );
});

test('re-running the seed is harmless', () => {
  const inserts = cryptoIdentitySeedMigrationSql.match(/ON CONFLICT \(entity_key\) DO NOTHING/g);
  assert.equal(inserts?.length, 2);
});
