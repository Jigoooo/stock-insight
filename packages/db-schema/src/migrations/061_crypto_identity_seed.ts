export const cryptoIdentitySeedMigrationSql = `
-- Seeds crypto_identity.entity for the assets this system already tracks.
--
-- The enhancement plan treated crypto as blocked on "vendor selection plus
-- identifier derivation design", because crypto_identity.entity enforces CAIP-2
-- chain ids and CAIP-19 asset ids by regex while the legacy tables
-- (crypto.candidates, public.entities) hold nothing but ticker strings, and a
-- chain id cannot be synthesised from "BTC" in SQL.
--
-- Measured 2026-08-03: the universe is 14 tickers, not thousands.
--   BTC 183 · ETH 179 · SOL 168 · TRX 89 · BNB 72 · XRP 57 · NEAR 57
--   LINK 53 · UNI 50 · SUI 42 · DOGE 21 · HYPE 12 · AVAX 9 · ADA 9
-- At that size the identifiers are a lookup against published specifications, not
-- a design problem. No vendor is required to establish identity; a vendor is
-- required later, for market data.
--
-- Every value below was read from a source, none recalled:
--   eip155 chain numbers      CoinGecko /asset_platforms chain_identifier
--                             (ethereum 1, binance-smart-chain 56, avalanche 43114)
--   bip122 Bitcoin mainnet    namespaces.chainagnostic.org/bip122/caip2
--   solana mainnet            namespaces.chainagnostic.org/solana/caip2
--   ERC-20 contracts          CoinGecko /coins/{id} platforms.ethereum
--
-- Seven of the fourteen are seeded. TRX, XRP, NEAR, SUI, DOGE, HYPE and ADA are
-- deliberately absent: their CAIP-2 references live in per-namespace specs that
-- were not read in this pass, and writing a chain id from memory is exactly the
-- kind of invented provenance this schema's regex exists to prevent. They cover
-- 287 of 1,001 candidate rows; the seven seeded here cover 714.

INSERT INTO crypto_identity.entity (entity_key, entity_kind, chain_id, asset_id)
VALUES
  -- Native chains. entity_key is fixed by the table CHECK as
  -- 'crypto:' || entity_kind || ':' || chain_id.
  (
    'crypto:blockchain:bip122:000000000019d6689c085ae165831e93',
    'blockchain',
    'bip122:000000000019d6689c085ae165831e93',
    NULL
  ),
  ('crypto:blockchain:eip155:1', 'blockchain', 'eip155:1', NULL),
  ('crypto:blockchain:eip155:56', 'blockchain', 'eip155:56', NULL),
  ('crypto:blockchain:eip155:43114', 'blockchain', 'eip155:43114', NULL),
  (
    'crypto:blockchain:solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    'blockchain',
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    NULL
  )
ON CONFLICT (entity_key) DO NOTHING;

-- ERC-20 tokens. For token rows the CHECK fixes entity_key to
-- 'crypto:' || entity_kind || ':' || asset_id, and asset_id is CAIP-19.
INSERT INTO crypto_identity.entity (entity_key, entity_kind, chain_id, asset_id)
VALUES
  (
    'crypto:token:eip155:1/erc20:0x514910771af9ca656af840dff83e8264ecf986ca',
    'token',
    'eip155:1',
    'eip155:1/erc20:0x514910771af9ca656af840dff83e8264ecf986ca'
  ),
  (
    'crypto:token:eip155:1/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    'token',
    'eip155:1',
    'eip155:1/erc20:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'
  )
ON CONFLICT (entity_key) DO NOTHING;

COMMENT ON TABLE crypto_identity.entity IS
  'CAIP-2/CAIP-19 identities for tracked crypto assets. Seeded from published '
  'specifications and vendor platform metadata, never from recalled chain ids. '
  'Seven of the fourteen tracked tickers are present; TRX, XRP, NEAR, SUI, DOGE, '
  'HYPE and ADA await their namespace references being read rather than guessed.';
`;
