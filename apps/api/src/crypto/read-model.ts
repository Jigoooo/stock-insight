import {
  cryptoResearchWorkspaceSchema,
  type CryptoResearchWorkspace,
} from '@stock-insight/contracts/crypto-research';

export type CryptoResearchQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetCryptoResearchWorkspaceOptions = Readonly<{
  knownAt: Date;
  limit?: number;
}>;

type EntityRow = {
  entity_key: string;
  entity_kind: string;
  display_name: string;
  symbol: string | null;
  chain_id: string | null;
  source_revision_id: string | number;
  known_at: string | Date;
};

type EventRow = {
  event_key: string;
  event_type: string;
  lifecycle_state: string;
  summary: string;
  finality_state: string;
  source_revision_id: string | number;
  known_at: string | Date;
};

type CompanyLinkRow = {
  relation_key: string;
  crypto_entity_key: string;
  crypto_name: string;
  core_entity_key: string;
  core_name: string;
  core_entity_type: string;
  relation_kind: string;
  relation_state: string;
  economic_magnitude: string | number | null;
  economic_magnitude_unit: string | null;
  epistemic_confidence: string | number | null;
  source_revision_id: string | number;
  known_at: string | Date;
};

type RiskExposureRow = {
  exposure_key: string;
  crypto_entity_key: string;
  crypto_name: string;
  shock_type: string;
  channel_key: string;
  direction_sign: string | number;
  economic_magnitude: string | number | null;
  economic_magnitude_unit: string | null;
  epistemic_confidence: string | number;
  lifecycle_state: string;
  source_revision_id: string | number;
  known_at: string | Date;
};

const ENTITY_SQL = `
  WITH selected AS (
    SELECT DISTINCT ON (entity_key)
      entity_key, entity_kind, display_name, symbol, chain_id, source_revision_id, known_at,
      valid_from, valid_until
    FROM crypto_serving.entity_revision
    WHERE known_at <= $1::timestamptz
    ORDER BY entity_key, known_at DESC, revision_no DESC
  )
  SELECT entity_key, entity_kind, display_name, symbol, chain_id, source_revision_id, known_at
  FROM selected
  WHERE (valid_from IS NULL OR valid_from <= $1::timestamptz)
    AND (valid_until IS NULL OR valid_until > $1::timestamptz)
  ORDER BY known_at DESC, entity_key
  LIMIT $2::integer
`;

const EVENT_SQL = `
  WITH selected AS (
    SELECT DISTINCT ON (event_key)
      event_key, event_type, lifecycle_state, summary, finality_state,
      source_revision_id, known_at, revision_no, occurred_at, valid_from, valid_until
    FROM crypto_serving.event_revision
    WHERE known_at <= $1::timestamptz
    ORDER BY event_key, known_at DESC, revision_no DESC
  )
  SELECT event_key, event_type, lifecycle_state, summary, finality_state,
    source_revision_id, known_at
  FROM selected
  WHERE (occurred_at IS NULL OR occurred_at <= $1::timestamptz)
    AND (valid_from IS NULL OR valid_from <= $1::timestamptz)
    AND (valid_until IS NULL OR valid_until > $1::timestamptz)
    AND lifecycle_state <> 'retracted'
    AND summary IS NOT NULL
  ORDER BY known_at DESC, event_key
  LIMIT $2::integer
`;

const COMPANY_LINK_SQL = `
  WITH selected AS (
    SELECT DISTINCT ON (relation_key)
      relation_key, crypto_entity_key, crypto_name, core_entity_key, core_name,
      core_entity_type, relation_kind, relation_state, economic_magnitude,
      economic_magnitude_unit, epistemic_confidence, source_revision_id,
      known_at, revision_no, valid_from, valid_until
    FROM crypto_serving.core_relation_revision
    WHERE known_at <= $1::timestamptz
    ORDER BY relation_key, known_at DESC, revision_no DESC
  )
  SELECT relation_key, crypto_entity_key, crypto_name, core_entity_key, core_name,
    core_entity_type, relation_kind, relation_state, economic_magnitude,
    economic_magnitude_unit, epistemic_confidence, source_revision_id, known_at
  FROM selected
  WHERE (valid_from IS NULL OR valid_from <= $1::timestamptz)
    AND (valid_until IS NULL OR valid_until > $1::timestamptz)
    AND relation_state IN ('proposed','verified')
    AND crypto_name IS NOT NULL
    AND core_entity_key IS NOT NULL
  ORDER BY (relation_state = 'verified') DESC, known_at DESC, relation_key
  LIMIT $2::integer
`;

const RISK_EXPOSURE_SQL = `
  WITH selected AS (
    SELECT DISTINCT ON (exposure_key)
      exposure_key, crypto_entity_key, crypto_name, shock_type, channel_key,
      direction_sign, economic_magnitude, economic_magnitude_unit,
      epistemic_confidence, lifecycle_state, source_revision_id, known_at, revision_no,
      valid_from, valid_until
    FROM crypto_serving.risk_exposure_revision
    WHERE known_at <= $1::timestamptz
    ORDER BY exposure_key, known_at DESC, revision_no DESC
  )
  SELECT exposure_key, crypto_entity_key, crypto_name, shock_type, channel_key,
    direction_sign, economic_magnitude, economic_magnitude_unit,
    epistemic_confidence, lifecycle_state, source_revision_id, known_at
  FROM selected
  WHERE (valid_from IS NULL OR valid_from <= $1::timestamptz)
    AND (valid_until IS NULL OR valid_until > $1::timestamptz)
    AND lifecycle_state IN ('building','sealed')
    AND crypto_name IS NOT NULL
  ORDER BY (lifecycle_state = 'sealed') DESC, epistemic_confidence DESC,
    known_at DESC, exposure_key
  LIMIT $2::integer
`;

function toIso(value: string | Date, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Crypto research ${field} is invalid`);
  return date.toISOString();
}

function toNullableDecimal(value: string | number | null, field: string): string | null {
  if (value === null) return null;
  const text = String(value);
  if (!Number.isFinite(Number(text))) throw new Error(`Crypto research ${field} is invalid`);
  return text;
}

function toConfidence(value: string | number | null, field: string): number | null {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`Crypto research ${field} is invalid`);
  }
  return number;
}

function toDirection(value: string | number): -1 | 0 | 1 {
  const number = Number(value);
  if (number !== -1 && number !== 0 && number !== 1) {
    throw new Error('Crypto research direction sign is invalid');
  }
  return number;
}

function toSourceRevisionId(value: string | number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error('Crypto research source revision id is invalid');
  }
  return number;
}

export async function getCryptoResearchWorkspace(
  executor: CryptoResearchQueryExecutor,
  options: GetCryptoResearchWorkspaceOptions,
): Promise<CryptoResearchWorkspace> {
  const limit = options.limit ?? 40;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Crypto research limit must be between 1 and 100');
  }
  if (!(options.knownAt instanceof Date) || !Number.isFinite(options.knownAt.getTime())) {
    throw new Error('Crypto research knownAt is invalid');
  }
  const parameters = [options.knownAt.toISOString(), limit] as const;
  const entityRows = await executor.queryRows<EntityRow>(ENTITY_SQL, parameters);
  const eventRows = await executor.queryRows<EventRow>(EVENT_SQL, parameters);
  const companyRows = await executor.queryRows<CompanyLinkRow>(COMPANY_LINK_SQL, parameters);
  const riskRows = await executor.queryRows<RiskExposureRow>(RISK_EXPOSURE_SQL, parameters);

  const entities = entityRows.map((row) => ({
    entityKey: row.entity_key,
    entityKind: row.entity_kind,
    displayName: row.display_name,
    symbol: row.symbol,
    chainId: row.chain_id,
    sourceRevisionId: toSourceRevisionId(row.source_revision_id),
    knownAt: toIso(row.known_at, 'entity knownAt'),
  }));
  const events = eventRows.map((row) => ({
    eventKey: row.event_key,
    eventType: row.event_type,
    lifecycleState: row.lifecycle_state,
    summary: row.summary,
    finalityState: row.finality_state,
    sourceRevisionId: toSourceRevisionId(row.source_revision_id),
    knownAt: toIso(row.known_at, 'event knownAt'),
  }));
  const companyLinks = companyRows.map((row) => ({
    relationKey: row.relation_key,
    cryptoEntityKey: row.crypto_entity_key,
    cryptoName: row.crypto_name,
    coreEntityKey: row.core_entity_key,
    coreName: row.core_name,
    coreEntityType: row.core_entity_type,
    relationKind: row.relation_kind,
    relationState: row.relation_state,
    economicMagnitude: toNullableDecimal(row.economic_magnitude, 'economic magnitude'),
    economicMagnitudeUnit: row.economic_magnitude_unit,
    epistemicConfidence: toConfidence(row.epistemic_confidence, 'company-link confidence'),
    sourceRevisionId: toSourceRevisionId(row.source_revision_id),
    knownAt: toIso(row.known_at, 'company-link knownAt'),
  }));
  const riskExposures = riskRows.map((row) => ({
    exposureKey: row.exposure_key,
    cryptoEntityKey: row.crypto_entity_key,
    cryptoName: row.crypto_name,
    shockType: row.shock_type,
    channelKey: row.channel_key,
    directionSign: toDirection(row.direction_sign),
    economicMagnitude: toNullableDecimal(row.economic_magnitude, 'risk magnitude'),
    economicMagnitudeUnit: row.economic_magnitude_unit,
    epistemicConfidence: toConfidence(row.epistemic_confidence, 'risk confidence'),
    lifecycleState: row.lifecycle_state,
    sourceRevisionId: toSourceRevisionId(row.source_revision_id),
    knownAt: toIso(row.known_at, 'risk knownAt'),
  }));

  return cryptoResearchWorkspaceSchema.parse({
    schemaVersion: 'p6.v1',
    availability:
      entities.length + events.length + companyLinks.length + riskExposures.length > 0
        ? 'available'
        : 'empty',
    knownAt: options.knownAt.toISOString(),
    readOnly: true,
    orderExecutable: false,
    stats: {
      entities: entities.length,
      events: events.length,
      companyLinks: companyLinks.length,
      riskExposures: riskExposures.length,
    },
    entities,
    events,
    companyLinks,
    riskExposures,
  });
}
