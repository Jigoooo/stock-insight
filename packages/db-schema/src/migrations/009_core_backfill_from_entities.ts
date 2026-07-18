export const coreBackfillFromEntitiesMigrationSql = `
-- SET B / B-3: idempotent backfill of core identity from transitional public.entities.
-- Scope: KR/US ticker universe -> Exchange + Company + Stock + identifiers + aliases + listings.
-- Crypto/theme/macro entities stay transitional (classified during knowledge wave).
-- Idempotency anchor: core.entity_identifier(INTERNAL_KEY, value).

-- 1) Exchange entities.
WITH exchange_seed(internal_key, name, country, mic) AS (
  VALUES
    ('EXCHANGE:KOSPI', 'KRX KOSPI', 'KR', 'XKRX'),
    ('EXCHANGE:KOSDAQ', 'KRX KOSDAQ', 'KR', 'XKOS'),
    ('EXCHANGE:US_COMPOSITE', 'US Composite (exchange TBD)', 'US', NULL)
), inserted AS (
  INSERT INTO core.entity (entity_type, canonical_name, country_code, metadata)
  SELECT 'Exchange', seed.name, seed.country,
         jsonb_build_object('mic', seed.mic, 'backfill', 'entities-v1')
  FROM exchange_seed seed
  WHERE NOT EXISTS (
    SELECT 1 FROM core.entity_identifier ident
    WHERE ident.identifier_type = 'INTERNAL_KEY' AND ident.identifier_value = seed.internal_key
  )
  RETURNING entity_id, canonical_name
)
INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT inserted.entity_id, 'INTERNAL_KEY', seed.internal_key
FROM inserted
JOIN exchange_seed seed ON seed.name = inserted.canonical_name
ON CONFLICT DO NOTHING;

INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT ident.entity_id, 'MIC', entity.metadata ->> 'mic'
FROM core.entity_identifier ident
JOIN core.entity entity ON entity.entity_id = ident.entity_id
WHERE ident.identifier_type = 'INTERNAL_KEY'
  AND ident.identifier_value IN ('EXCHANGE:KOSPI', 'EXCHANGE:KOSDAQ')
  AND entity.metadata ->> 'mic' IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2) Stock entities (INTERNAL_KEY = legacy entity_key).
WITH legacy AS (
  SELECT entity.entity_key, entity.market, upper(entity.symbol) AS ticker,
         coalesce(nullif(entity.name, ''), entity.symbol) AS name,
         entity.first_seen_at, entity.id AS legacy_id
  FROM public.entities entity
  WHERE entity.entity_type = 'ticker' AND entity.market IN ('KR', 'US')
    AND coalesce(entity.symbol, '') <> ''
), inserted AS (
  INSERT INTO core.entity (entity_type, canonical_name, country_code, metadata, created_at)
  SELECT 'Stock', legacy.name, legacy.market,
         jsonb_build_object('legacy_entity_key', legacy.entity_key,
                            'legacy_entities_id', legacy.legacy_id,
                            'backfill', 'entities-v1'),
         coalesce(legacy.first_seen_at, now())
  FROM legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM core.entity_identifier ident
    WHERE ident.identifier_type = 'INTERNAL_KEY' AND ident.identifier_value = legacy.entity_key
  )
  RETURNING entity_id, metadata
)
INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT entity_id, 'INTERNAL_KEY', metadata ->> 'legacy_entity_key' FROM inserted
ON CONFLICT DO NOTHING;

-- 3) Company entities (INTERNAL_KEY = 'COMPANY:' || legacy key).
WITH legacy AS (
  SELECT entity.entity_key, entity.market,
         coalesce(nullif(profile.name, ''), nullif(entity.name, ''), entity.symbol) AS name,
         entity.first_seen_at
  FROM public.entities entity
  LEFT JOIN public.company_profiles profile ON profile.entity_key = entity.entity_key
  WHERE entity.entity_type = 'ticker' AND entity.market IN ('KR', 'US')
    AND coalesce(entity.symbol, '') <> ''
), inserted AS (
  INSERT INTO core.entity (entity_type, canonical_name, country_code, metadata, created_at)
  SELECT 'Company', legacy.name, legacy.market,
         jsonb_build_object('issues_internal_key', legacy.entity_key, 'backfill', 'entities-v1'),
         coalesce(legacy.first_seen_at, now())
  FROM legacy
  WHERE NOT EXISTS (
    SELECT 1 FROM core.entity_identifier ident
    WHERE ident.identifier_type = 'INTERNAL_KEY'
      AND ident.identifier_value = 'COMPANY:' || legacy.entity_key
  )
  RETURNING entity_id, metadata
)
INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT entity_id, 'INTERNAL_KEY', 'COMPANY:' || (metadata ->> 'issues_internal_key') FROM inserted
ON CONFLICT DO NOTHING;

-- 4) Official identifiers: DART corp code (KR), CIK (US when present in profile_json).
INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT company_ident.entity_id, 'DART_CORP_CODE', profile.profile_json ->> 'corpCode'
FROM public.company_profiles profile
JOIN core.entity_identifier company_ident
  ON company_ident.identifier_type = 'INTERNAL_KEY'
 AND company_ident.identifier_value = 'COMPANY:' || profile.entity_key
WHERE profile.market = 'KR' AND coalesce(profile.profile_json ->> 'corpCode', '') <> ''
ON CONFLICT DO NOTHING;

INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value)
SELECT company_ident.entity_id, 'CIK',
       lpad(regexp_replace(profile.profile_json ->> 'cik', '[^0-9]', '', 'g'), 10, '0')
FROM public.company_profiles profile
JOIN core.entity_identifier company_ident
  ON company_ident.identifier_type = 'INTERNAL_KEY'
 AND company_ident.identifier_value = 'COMPANY:' || profile.entity_key
WHERE profile.market = 'US'
  AND coalesce(regexp_replace(profile.profile_json ->> 'cik', '[^0-9]', '', 'g'), '') <> ''
ON CONFLICT DO NOTHING;

-- 5) Aliases: legacy display name (ko default) + English corp name when known.
INSERT INTO core.entity_alias (entity_id, alias_text, language_code, alias_type)
SELECT stock_ident.entity_id, coalesce(nullif(entity.name, ''), entity.symbol), '', 'display'
FROM public.entities entity
JOIN core.entity_identifier stock_ident
  ON stock_ident.identifier_type = 'INTERNAL_KEY'
 AND stock_ident.identifier_value = entity.entity_key
WHERE entity.entity_type = 'ticker' AND entity.market IN ('KR', 'US')
ON CONFLICT DO NOTHING;

INSERT INTO core.entity_alias (entity_id, alias_text, language_code, alias_type)
SELECT company_ident.entity_id, profile.profile_json ->> 'corpNameEnglish', 'en', 'official'
FROM public.company_profiles profile
JOIN core.entity_identifier company_ident
  ON company_ident.identifier_type = 'INTERNAL_KEY'
 AND company_ident.identifier_value = 'COMPANY:' || profile.entity_key
WHERE coalesce(profile.profile_json ->> 'corpNameEnglish', '') <> ''
ON CONFLICT DO NOTHING;

-- 6) Listings: KR via corporationClass (Y=KOSPI, K=KOSDAQ), US -> composite placeholder.
WITH exchange_map AS (
  SELECT ident.identifier_value AS internal_key, ident.entity_id
  FROM core.entity_identifier ident
  WHERE ident.identifier_type = 'INTERNAL_KEY'
    AND ident.identifier_value IN ('EXCHANGE:KOSPI', 'EXCHANGE:KOSDAQ', 'EXCHANGE:US_COMPOSITE')
), legacy AS (
  SELECT entity.entity_key, entity.market, upper(entity.symbol) AS ticker,
         coalesce(entity.first_seen_at, now()) AS listed_from,
         CASE
           WHEN entity.market = 'US' THEN 'EXCHANGE:US_COMPOSITE'
           WHEN profile.profile_json ->> 'corporationClass' = 'K' THEN 'EXCHANGE:KOSDAQ'
           ELSE 'EXCHANGE:KOSPI'
         END AS exchange_key,
         CASE WHEN entity.market = 'KR' THEN 'KRW' ELSE 'USD' END AS currency
  FROM public.entities entity
  LEFT JOIN public.company_profiles profile ON profile.entity_key = entity.entity_key
  WHERE entity.entity_type = 'ticker' AND entity.market IN ('KR', 'US')
    AND coalesce(entity.symbol, '') <> ''
)
INSERT INTO core.listing (security_entity_id, exchange_entity_id, local_ticker, currency,
                          listing_status, valid_from, metadata)
SELECT stock_ident.entity_id, exchange_map.entity_id, legacy.ticker, legacy.currency,
       'listed', legacy.listed_from,
       jsonb_build_object('backfill', 'entities-v1',
                          'exchange_confidence',
                          CASE WHEN legacy.exchange_key = 'EXCHANGE:US_COMPOSITE'
                               THEN 'placeholder' ELSE 'profile_class' END)
FROM legacy
JOIN core.entity_identifier stock_ident
  ON stock_ident.identifier_type = 'INTERNAL_KEY'
 AND stock_ident.identifier_value = legacy.entity_key
JOIN exchange_map ON exchange_map.internal_key = legacy.exchange_key
WHERE NOT EXISTS (
  SELECT 1 FROM core.listing existing
  WHERE existing.security_entity_id = stock_ident.entity_id
)
ON CONFLICT DO NOTHING;

-- 7) LOCAL_TICKER identifiers namespaced by exchange internal key.
INSERT INTO core.entity_identifier (entity_id, identifier_type, identifier_value, namespace)
SELECT listing.security_entity_id, 'LOCAL_TICKER', listing.local_ticker, exchange_ident.identifier_value
FROM core.listing listing
JOIN core.entity_identifier exchange_ident
  ON exchange_ident.entity_id = listing.exchange_entity_id
 AND exchange_ident.identifier_type = 'INTERNAL_KEY'
ON CONFLICT DO NOTHING;

-- 8) Compat view: canonical universe keyed like the legacy API expects.
CREATE OR REPLACE VIEW core.v_security_universe AS
SELECT
  stock_ident.identifier_value AS entity_key,
  stock.country_code AS market,
  listing.local_ticker AS ticker,
  stock.canonical_name AS name,
  exchange_ident.identifier_value AS exchange_internal_key,
  listing.currency,
  listing.listing_status,
  stock.entity_id AS security_entity_id
FROM core.entity stock
JOIN core.entity_identifier stock_ident
  ON stock_ident.entity_id = stock.entity_id AND stock_ident.identifier_type = 'INTERNAL_KEY'
JOIN core.listing listing ON listing.security_entity_id = stock.entity_id AND listing.valid_to IS NULL
JOIN core.entity_identifier exchange_ident
  ON exchange_ident.entity_id = listing.exchange_entity_id
 AND exchange_ident.identifier_type = 'INTERNAL_KEY'
WHERE stock.entity_type = 'Stock' AND stock.status = 'active';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stock_insight_app_reader') THEN
    GRANT SELECT ON core.v_security_universe TO stock_insight_app_reader;
  END IF;
END $$;
`;
