import pg, { type PoolClient, type QueryResultRow } from 'pg';

import {
  classifyIdentityState,
  normalizeCik,
  type IdentityState,
} from './core-identity-sync-contract.ts';

const JOB_NAME = 'stock-insight-core-identity-sync';
const APPLY = process.argv.includes('--apply');

const ELIGIBLE_IDENTITIES_SQL = `
WITH eligible AS (
  SELECT legacy.id AS legacy_id,
         legacy.entity_key,
         upper(legacy.market) AS market,
         upper(legacy.symbol) AS ticker,
         legacy.first_seen_at,
         nullif(btrim(profile.name), '') AS profile_name,
         profile.profile_json ->> 'cik' AS cik,
         CASE
           WHEN upper(legacy.market) = 'US' THEN 'EXCHANGE:US_COMPOSITE'
           WHEN profile.profile_json ->> 'corporationClass' = 'K' THEN 'EXCHANGE:KOSDAQ'
           WHEN profile.profile_json ->> 'corporationClass' = 'Y' THEN 'EXCHANGE:KOSPI'
           ELSE null
         END AS exchange_key
  FROM public.entities legacy
  LEFT JOIN public.company_profiles profile ON profile.entity_key = legacy.entity_key
  WHERE legacy.entity_type = 'ticker'
    AND upper(legacy.market) IN ('KR', 'US')
    AND coalesce(legacy.symbol, '') <> ''
)
SELECT eligible.*,
       stock_identifier.entity_id AS stock_id,
       stock.entity_type AS stock_type,
       listing.listing_count,
       listing.listing_owner,
       listing.listing_exchange_key,
       ticker_identifier.ticker_identifier_count,
       ticker_identifier.ticker_identifier_owner,
       ticker_identifier.ticker_identifier_namespace,
       company_identifier.entity_id AS company_id,
       company.entity_type AS company_type,
       cik_identifier.entity_id AS cik_owner,
       cik_entity.entity_type AS cik_owner_type
FROM eligible
LEFT JOIN core.entity_identifier stock_identifier
  ON stock_identifier.identifier_type='INTERNAL_KEY'
 AND stock_identifier.identifier_value=eligible.entity_key
 AND stock_identifier.valid_to IS NULL
LEFT JOIN core.entity stock ON stock.entity_id=stock_identifier.entity_id
LEFT JOIN LATERAL (
  SELECT count(*)::int AS listing_count,
         min(current_listing.security_entity_id) AS listing_owner,
         min(exchange_identifier.identifier_value) AS listing_exchange_key
  FROM core.listing current_listing
  JOIN core.entity_identifier exchange_identifier
    ON exchange_identifier.entity_id=current_listing.exchange_entity_id
   AND exchange_identifier.identifier_type='INTERNAL_KEY'
   AND exchange_identifier.valid_to IS NULL
  WHERE current_listing.local_ticker=eligible.ticker
    AND current_listing.valid_to IS NULL
    AND (eligible.exchange_key IS NULL OR exchange_identifier.identifier_value=eligible.exchange_key)
) listing ON true
LEFT JOIN LATERAL (
  SELECT count(*)::int AS ticker_identifier_count,
         min(identifier.entity_id) AS ticker_identifier_owner,
         min(identifier.namespace) AS ticker_identifier_namespace
  FROM core.entity_identifier identifier
  WHERE identifier.identifier_type='LOCAL_TICKER'
    AND identifier.identifier_value=eligible.ticker
    AND identifier.valid_to IS NULL
    AND identifier.namespace=listing.listing_exchange_key
) ticker_identifier ON true
LEFT JOIN core.entity_identifier company_identifier
  ON company_identifier.identifier_type='INTERNAL_KEY'
 AND company_identifier.identifier_value='COMPANY:' || eligible.entity_key
 AND company_identifier.valid_to IS NULL
LEFT JOIN core.entity company ON company.entity_id=company_identifier.entity_id
LEFT JOIN core.entity_identifier cik_identifier
  ON cik_identifier.identifier_type='CIK'
 AND cik_identifier.identifier_value=eligible.cik
 AND cik_identifier.valid_to IS NULL
LEFT JOIN core.entity cik_entity ON cik_entity.entity_id=cik_identifier.entity_id
ORDER BY eligible.entity_key
`;

const FIND_ENTITY_SQL = `
SELECT entity.entity_id, entity.entity_type
FROM core.entity_identifier identifier
JOIN core.entity entity ON entity.entity_id = identifier.entity_id
WHERE identifier.identifier_type = $1
  AND identifier.identifier_value = $2
  AND ($3::text IS NULL OR identifier.namespace = $3)
ORDER BY identifier.valid_to DESC NULLS FIRST, identifier.identifier_id DESC
`;

const INSERT_ENTITY_SQL = `
INSERT INTO core.entity (entity_type, canonical_name, country_code, metadata, created_at)
VALUES ($1, $2, $3, $4::jsonb, $5)
RETURNING entity_id
`;

const INSERT_IDENTIFIER_SQL = `
INSERT INTO core.entity_identifier (
  entity_id, identifier_type, identifier_value, namespace, valid_from
) VALUES ($1, $2, $3, $4, $5)
ON CONFLICT DO NOTHING
`;

const INSERT_ALIAS_SQL = `
INSERT INTO core.entity_alias (entity_id, alias_text, language_code, alias_type)
VALUES ($1, $2, '', $3)
ON CONFLICT DO NOTHING
`;

const INSERT_LISTING_SQL = `
INSERT INTO core.listing (
  security_entity_id, exchange_entity_id, local_ticker, currency,
  listing_status, valid_from, metadata
) VALUES ($1, $2, $3, $4, 'listed', $5, $6::jsonb)
ON CONFLICT DO NOTHING
RETURNING security_entity_id, exchange_entity_id, local_ticker
`;

const CURRENT_LISTING_SQL = `
SELECT security_entity_id, exchange_entity_id, local_ticker
FROM core.listing
WHERE exchange_entity_id=$1 AND local_ticker=$2 AND valid_to IS NULL
ORDER BY listing_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES (
  'core-identity-sync-' || gen_random_uuid()::text,
  $1, 'public-company-profile', 'completed', $2, clock_timestamp(),
  $3, $4, 0, null, $5::jsonb
)
`;

type IdentityRow = QueryResultRow & {
  legacy_id: string | number;
  entity_key: string;
  market: 'KR' | 'US';
  ticker: string;
  first_seen_at: Date | string;
  profile_name: string | null;
  cik: string | null;
  exchange_key: string | null;
  stock_id: string | number | null;
  stock_type: string | null;
  listing_count: number;
  listing_owner: string | number | null;
  listing_exchange_key: string | null;
  ticker_identifier_count: number;
  ticker_identifier_owner: string | number | null;
  ticker_identifier_namespace: string | null;
  company_id: string | number | null;
  company_type: string | null;
  cik_owner: string | number | null;
  cik_owner_type: string | null;
};

type ListingRow = QueryResultRow & {
  security_entity_id: string | number;
  exchange_entity_id: string | number;
  local_ticker: string;
};

type EntityRow = QueryResultRow & {
  entity_id: string | number;
  entity_type: string;
};

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
}

function numeric(value: string | number, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function isTrustedName(row: IdentityRow): row is IdentityRow & { profile_name: string } {
  const name = row.profile_name?.trim();
  return Boolean(name && name.toUpperCase() !== row.ticker.toUpperCase());
}

function toIdentityState(row: IdentityRow): IdentityState {
  return {
    entityKey: row.entity_key,
    market: row.market,
    ticker: row.ticker,
    expectedExchangeKey: row.exchange_key,
    cik: normalizeCik(row.cik),
    stockId: row.stock_id,
    stockType: row.stock_type,
    listingCount: Number(row.listing_count),
    listingOwner: row.listing_owner,
    listingExchangeKey: row.listing_exchange_key,
    tickerIdentifierCount: Number(row.ticker_identifier_count),
    tickerIdentifierOwner: row.ticker_identifier_owner,
    tickerIdentifierNamespace: row.ticker_identifier_namespace,
    companyId: row.company_id,
    companyType: row.company_type,
    cikOwner: row.cik_owner,
    cikOwnerType: row.cik_owner_type,
  };
}

async function findEntity(
  client: PoolClient,
  identifierType: string,
  identifierValue: string,
  namespace: string | null = null,
): Promise<{ entityId: number; entityType: string } | null> {
  const result = await client.query<EntityRow>(FIND_ENTITY_SQL, [
    identifierType,
    identifierValue,
    namespace,
  ]);
  const identities = new Map(
    result.rows.map((row) => [
      numeric(row.entity_id, 'entityId'),
      { entityId: numeric(row.entity_id, 'entityId'), entityType: row.entity_type },
    ]),
  );
  if (identities.size > 1) {
    throw new Error(`${identifierType}:${identifierValue} is ambiguous across namespaces`);
  }
  return identities.values().next().value ?? null;
}

async function ensureIdentifier(
  client: PoolClient,
  entityId: number,
  identifierType: string,
  identifierValue: string,
  namespace: string,
  validFrom: Date,
): Promise<void> {
  await client.query(INSERT_IDENTIFIER_SQL, [
    entityId,
    identifierType,
    identifierValue,
    namespace,
    validFrom,
  ]);
  const winner = await findEntity(
    client,
    identifierType,
    identifierValue,
    identifierType === 'LOCAL_TICKER' ? namespace : null,
  );
  if (!winner || winner.entityId !== entityId) {
    throw new Error(`${identifierType}:${identifierValue} identity conflict`);
  }
}

async function insertEntity(
  client: PoolClient,
  entityType: 'Company' | 'Stock',
  canonicalName: string,
  countryCode: string,
  metadata: Record<string, unknown>,
  createdAt: Date,
): Promise<number> {
  const result = await client.query<QueryResultRow & { entity_id: string | number }>(
    INSERT_ENTITY_SQL,
    [entityType, canonicalName, countryCode, JSON.stringify(metadata), createdAt],
  );
  return numeric(result.rows[0]!.entity_id, 'entityId');
}

async function ensureCompany(
  client: PoolClient,
  row: IdentityRow & { profile_name: string },
  validFrom: Date,
): Promise<number> {
  const companyKey = `COMPANY:${row.entity_key}`;
  const cik = normalizeCik(row.cik);
  const byKey = await findEntity(client, 'INTERNAL_KEY', companyKey);
  let companyId: number;
  if (byKey) {
    if (byKey.entityType !== 'Company') throw new Error(`${companyKey} is not a Company`);
    companyId = byKey.entityId;
  } else {
    const byCik = cik ? await findEntity(client, 'CIK', cik) : null;
    if (byCik && byCik.entityType !== 'Company') {
      throw new Error(`CIK:${cik} is not a Company`);
    }
    companyId =
      byCik?.entityId ??
      (await insertEntity(
        client,
        'Company',
        row.profile_name,
        row.market,
        { identity_sync: JOB_NAME, issues_internal_key: row.entity_key },
        validFrom,
      ));
  }
  await ensureIdentifier(client, companyId, 'INTERNAL_KEY', companyKey, '', validFrom);
  if (cik) {
    await ensureIdentifier(client, companyId, 'CIK', cik, '', validFrom);
  }
  await client.query(INSERT_ALIAS_SQL, [companyId, row.profile_name, 'official']);
  return companyId;
}

async function ensureListing(
  client: PoolClient,
  stockId: number,
  exchangeId: number,
  row: IdentityRow,
  validFrom: Date,
): Promise<void> {
  const before = await client.query<ListingRow>(CURRENT_LISTING_SQL, [exchangeId, row.ticker]);
  if (before.rows.length === 0) {
    await client.query<ListingRow>(INSERT_LISTING_SQL, [
      stockId,
      exchangeId,
      row.ticker,
      row.market === 'KR' ? 'KRW' : 'USD',
      validFrom,
      JSON.stringify({ identity_sync: JOB_NAME, exchange_confidence: 'profile_or_composite' }),
    ]);
  }
  const readback = await client.query<ListingRow>(CURRENT_LISTING_SQL, [exchangeId, row.ticker]);
  if (
    readback.rows.length !== 1 ||
    numeric(readback.rows[0]!.security_entity_id, 'listing readback security') !== stockId ||
    numeric(readback.rows[0]!.exchange_entity_id, 'listing readback exchange') !== exchangeId ||
    readback.rows[0]!.local_ticker !== row.ticker
  ) {
    throw new Error(`${row.entity_key} listing readback conflict`);
  }
}

async function syncIdentity(
  client: PoolClient,
  row: IdentityRow & { profile_name: string; exchange_key: string },
): Promise<void> {
  const validFrom = new Date(row.first_seen_at);
  if (Number.isNaN(validFrom.getTime()))
    throw new Error(`${row.entity_key} has invalid first_seen_at`);
  const exchange = await findEntity(client, 'INTERNAL_KEY', row.exchange_key);
  if (!exchange || exchange.entityType !== 'Exchange') {
    throw new Error(`${row.entity_key} exchange ${row.exchange_key} is unavailable`);
  }

  const stockId = await insertEntity(
    client,
    'Stock',
    row.profile_name,
    row.market,
    {
      identity_sync: JOB_NAME,
      legacy_entity_key: row.entity_key,
      legacy_entities_id: numeric(row.legacy_id, 'legacyId'),
    },
    validFrom,
  );
  await ensureIdentifier(client, stockId, 'INTERNAL_KEY', row.entity_key, '', validFrom);
  await ensureIdentifier(client, stockId, 'LOCAL_TICKER', row.ticker, row.exchange_key, validFrom);
  await client.query(INSERT_ALIAS_SQL, [stockId, row.profile_name, 'display']);
  await client.query(INSERT_ALIAS_SQL, [stockId, row.ticker, 'ticker']);
  await ensureListing(client, stockId, exchange.entityId, row, validFrom);
  await ensureCompany(client, row, validFrom);
}

async function loadEligible(client: PoolClient): Promise<IdentityRow[]> {
  return (await client.query<IdentityRow>(ELIGIBLE_IDENTITIES_SQL)).rows;
}

function missingRows(rows: IdentityRow[]): IdentityRow[] {
  return rows.filter((row) => classifyIdentityState(toIdentityState(row)) === 'missing');
}

function repairableRows(rows: IdentityRow[]): IdentityRow[] {
  return rows.filter((row) => classifyIdentityState(toIdentityState(row)) === 'repairable');
}

async function repairIdentity(client: PoolClient, row: IdentityRow): Promise<void> {
  const cik = normalizeCik(row.cik);
  if (row.company_id === null || cik === null) {
    throw new Error(`${row.entity_key} repairable CIK state is incomplete`);
  }
  const validFrom = new Date(row.first_seen_at);
  if (Number.isNaN(validFrom.getTime())) {
    throw new Error(`${row.entity_key} has invalid first_seen_at`);
  }
  await ensureIdentifier(
    client,
    numeric(row.company_id, 'repair companyId'),
    'CIK',
    cik,
    '',
    validFrom,
  );
}

async function run(): Promise<void> {
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  const client = await pool.connect();
  try {
    if (!APPLY) {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const eligible = await loadEligible(client);
      const missing = missingRows(eligible);
      const repairable = repairableRows(eligible);
      await client.query('COMMIT');
      const blocked = missing.filter(
        (row) =>
          !isTrustedName(row) ||
          row.exchange_key === null ||
          (row.market === 'US' && normalizeCik(row.cik) === null),
      );
      console.log(
        JSON.stringify(
          {
            mode: 'dry-run',
            readOnly: true,
            eligible: eligible.length,
            missing: missing.length,
            repairable: repairable.length,
            syncable: missing.length - blocked.length,
            blocked: blocked.map((row) => row.entity_key),
          },
          null,
          2,
        ),
      );
      if (blocked.length > 0) throw new Error('core identity sync has blocked rows');
      return;
    }

    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('stock-insight-core-identity-sync', 0))",
    );
    const eligible = await loadEligible(client);
    const missing = missingRows(eligible);
    const repairable = repairableRows(eligible);
    const blocked = missing.filter(
      (row) =>
        !isTrustedName(row) ||
        row.exchange_key === null ||
        (row.market === 'US' && normalizeCik(row.cik) === null),
    );
    if (blocked.length > 0) {
      throw new Error(
        `core identity sync blocked: ${blocked.map((row) => row.entity_key).join(',')}`,
      );
    }
    for (const row of missing) {
      if (!isTrustedName(row) || row.exchange_key === null) continue;
      await syncIdentity(client, { ...row, exchange_key: row.exchange_key });
    }
    for (const row of repairable) await repairIdentity(client, row);
    const verified = await loadEligible(client);
    const unresolved = verified.filter(
      (row) => classifyIdentityState(toIdentityState(row)) !== 'complete',
    );
    if (unresolved.length > 0) {
      throw new Error(
        `post-write identity verification failed: ${unresolved.map((row) => row.entity_key).join(',')}`,
      );
    }
    const summary = {
      eligible: eligible.length,
      existing: eligible.length - missing.length,
      missing: missing.length,
      synced: missing.length,
      repaired: repairable.length,
      blocked: [],
    };
    await client.query(INSERT_MIGRATION_RUN_SQL, [
      JOB_NAME,
      startedAt,
      eligible.length,
      missing.length + repairable.length,
      JSON.stringify(summary),
    ]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ mode: 'apply', jobName: JOB_NAME, audit: summary }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
