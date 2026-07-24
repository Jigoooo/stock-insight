import { createHash } from 'node:crypto';
import { hostname } from 'node:os';

import { Client, type PoolClient, type QueryResultRow } from 'pg';

import { planGraphSnapshotFromDatabase, type GraphSnapshotPlan } from './graph-snapshot.ts';
import {
  appendRawObjectManifest,
  CLOSE_FETCH_RUN_SQL,
  OPEN_FETCH_RUN_SQL,
  registerRawObjectWithRevision,
  writeRawObject,
  type RawObjectRef,
} from '../ingest/raw-object-store.ts';
import {
  buildEtfBasketCandidates,
  type EtfBasketObservation,
} from '../relations/builders/etf-overlap.ts';
import {
  buildOfficialSectorCandidates,
  type OfficialSectorObservation,
} from '../relations/builders/official-sector.ts';
import { buildProductSimilarityCandidates } from '../relations/builders/product-similarity.ts';
import {
  buildContentPack,
  type ContentPackDraft,
  type ContentPackSourceItem,
} from '../relations/content-pack-builder.ts';
import {
  buildProductSimilarityObservations,
  type ProductSimilarityProfile,
} from '../relations/product-similarity-model.ts';
import { persistRelationCandidates } from '../relations/relation-candidate-store.ts';
import {
  buildRelationGraphProjections,
  type RelationGraphProjection,
  type RelationGraphProjectionEdge,
  type RelationGraphProjectionEntity,
} from '../relations/relation-graph-projector-v2.ts';

const APPLY = process.argv.includes('--apply');
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const FRESHNESS_HOURS = 36;
const SUPERHUB_DEGREE_THRESHOLD = 200;
const PACK_KIND = 'entity_relation_graph';
const RELEASE_COMMIT = 'f2ec673';
const ETF_PROVIDER = 'internal-etf-holdings-snapshot';
const SECTOR_PROVIDER = 'internal-industry-classification-snapshot';
const PROFILE_PROVIDER = 'internal-company-profile-snapshot';

type EtfHoldingRow = QueryResultRow & {
  etf_ticker: string;
  etf_name: string;
  as_of: string;
  member_entity_key: string;
  member_name: string;
  member_entity_id: string | number | null;
  weight_pct: string | null;
  sector: string | null;
  source: string;
  collected_at: Date | string;
};

type SectorRow = QueryResultRow & {
  entity_key: string;
  entity_name: string;
  subject_entity_id: string | number | null;
  taxonomy_system: 'SIC' | 'KSIC';
  taxonomy_code: string;
  taxonomy_description: string | null;
  source_system: string;
  source_ref: string;
  valid_from: Date | string | null;
};

type CompanyProfileRow = QueryResultRow & {
  entity_key: string;
  entity_name: string;
  entity_id: string | number | null;
  summary_text: string;
  profile_json: Record<string, unknown>;
  source_refs_json: unknown;
  availability: string;
  captured_at: Date | string;
};

type ManifestEntry = { providerKey: string; ref: RawObjectRef; fetchedAt: Date };

type SourceDefinition = {
  providerKey: string;
  displayName: string;
  sourceTable: string;
  requiredFields: string[];
};

const ETF_SOURCE: SourceDefinition = {
  providerKey: ETF_PROVIDER,
  displayName: 'Immutable ETF holdings snapshot from transitional serving data',
  sourceTable: 'public.etf_holdings',
  requiredFields: ['etf_ticker', 'as_of', 'member_entity_key', 'weight_pct', 'source'],
};
const SECTOR_SOURCE: SourceDefinition = {
  providerKey: SECTOR_PROVIDER,
  displayName: 'Immutable SIC/KSIC classification snapshot from transitional serving data',
  sourceTable: 'public.entities',
  requiredFields: ['entity_key', 'industry_code_system', 'industry_code', 'industry_code_source'],
};
const PROFILE_SOURCE: SourceDefinition = {
  providerKey: PROFILE_PROVIDER,
  displayName: 'Immutable company profile summary snapshot from transitional serving data',
  sourceTable: 'public.company_profiles',
  requiredFields: ['entity_key', 'summary_text', 'source_refs_json', 'captured_at'],
};

const LATEST_ETF_HOLDINGS_SQL = `
WITH latest_date AS (
  SELECT etf_ticker,max(as_of) AS as_of
  FROM public.etf_holdings
  GROUP BY etf_ticker
), latest_row AS (
  SELECT DISTINCT ON (holding.etf_ticker,entity.entity_key)
         holding.etf_ticker,
         coalesce(nullif(holding.etf_name,''),holding.etf_ticker) AS etf_name,
         holding.as_of::text AS as_of,
         entity.entity_key AS member_entity_key,
         entity.name AS member_name,
         identifier.entity_id AS member_entity_id,
         holding.weight_pct::text AS weight_pct,
         holding.sector,
         holding.source,
         holding.collected_at
  FROM public.etf_holdings holding
  JOIN latest_date latest
    ON latest.etf_ticker=holding.etf_ticker AND latest.as_of=holding.as_of
  JOIN public.entities entity ON entity.id=holding.entity_id
  LEFT JOIN core.entity_identifier identifier
    ON identifier.identifier_type='INTERNAL_KEY'
   AND identifier.identifier_value=entity.entity_key
  ORDER BY holding.etf_ticker,entity.entity_key,holding.collected_at DESC,holding.id DESC
)
SELECT * FROM latest_row ORDER BY etf_ticker,member_entity_key
`;

const SECTOR_ROWS_SQL = `
SELECT entity.entity_key,
       entity.name AS entity_name,
       identifier.entity_id AS subject_entity_id,
       entity.industry_code_system AS taxonomy_system,
       entity.industry_code AS taxonomy_code,
       entity.industry_code_desc AS taxonomy_description,
       coalesce(nullif(entity.industry_code_source,''),entity.source_system,'unknown') AS source_system,
       coalesce(nullif(entity.source_ref,''),entity.entity_key) AS source_ref,
       entity.industry_code_as_of AS valid_from
FROM public.entities entity
LEFT JOIN core.entity_identifier identifier
  ON identifier.identifier_type='INTERNAL_KEY'
 AND identifier.identifier_value=entity.entity_key
WHERE entity.entity_key ~ '^(KR:[0-9]{6}|US:[A-Z][A-Z0-9]{0,7}([.-][A-Z0-9]{1,2})?)$'
  AND entity.industry_code_system IN ('SIC','KSIC')
  AND nullif(entity.industry_code,'') IS NOT NULL
ORDER BY entity.entity_key
`;

const COMPANY_PROFILE_ROWS_SQL = `
SELECT profile.entity_key,
       profile.name AS entity_name,
       identifier.entity_id,
       profile.summary_text,
       profile.profile_json,
       profile.source_refs_json,
       profile.availability,
       profile.captured_at
FROM public.company_profiles profile
LEFT JOIN core.entity_identifier identifier
  ON identifier.identifier_type='INTERNAL_KEY'
 AND identifier.identifier_value=profile.entity_key
WHERE nullif(profile.summary_text,'') IS NOT NULL
ORDER BY profile.entity_key
`;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function numeric(value: string | number, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function etfEntityKey(ticker: string): string {
  return /^\d{6}$/.test(ticker) ? `KR:${ticker}` : `US:${ticker}`;
}

function contractPolicy(definition: SourceDefinition): Record<string, unknown> {
  return {
    providerKey: definition.providerKey,
    sourceTable: definition.sourceTable,
    cadencePolicy: { kind: 'daily_materialized_snapshot', timezone: 'Asia/Seoul' },
    cutoffPolicy: { kind: 'capture_time', no_backdating: true },
    delayPolicy: { state: 'observed_at_capture' },
    correctionPolicy: { mode: 'append_revision' },
    requiredFields: definition.requiredFields,
    licensePolicy: { status: 'allowed', basis: 'internal_materialization' },
    redistributionPolicy: { mode: 'internal_only' },
    rawRetentionPolicy: { mode: 'retain' },
    qualityGatePolicy: {
      require_non_empty: true,
      exact_source_table_disclosure: definition.sourceTable,
      transitional_source: true,
    },
  };
}

async function loadInputs(client: Client): Promise<{
  holdings: EtfHoldingRow[];
  sectors: SectorRow[];
  profiles: CompanyProfileRow[];
}> {
  const holdings = await client.query<EtfHoldingRow>(LATEST_ETF_HOLDINGS_SQL);
  const sectors = await client.query<SectorRow>(SECTOR_ROWS_SQL);
  const profiles = await client.query<CompanyProfileRow>(COMPANY_PROFILE_ROWS_SQL);
  if (holdings.rows.length === 0) throw new Error('latest ETF holdings are empty');
  if (sectors.rows.length === 0) throw new Error('SIC/KSIC classifications are empty');
  if (profiles.rows.length === 0) throw new Error('company profile summaries are empty');
  const missingMember = holdings.rows.find((row) => row.member_entity_id === null);
  if (missingMember)
    throw new Error(`ETF member lacks canonical core entity: ${missingMember.member_entity_key}`);
  const missingSector = sectors.rows.find((row) => row.subject_entity_id === null);
  if (missingSector)
    throw new Error(`classified stock lacks canonical core entity: ${missingSector.entity_key}`);
  const missingProfile = profiles.rows.find((row) => row.entity_id === null);
  if (missingProfile)
    throw new Error(`company profile lacks canonical core entity: ${missingProfile.entity_key}`);
  return { holdings: holdings.rows, sectors: sectors.rows, profiles: profiles.rows };
}

async function ensureSource(
  client: Client,
  definition: SourceDefinition,
  knownAt: string,
): Promise<number> {
  await client.query(
    `INSERT INTO ingestion.source (
       provider_key,source_type,tier,license_status,redistribution,enforcement,metadata
     ) VALUES ($1,'internal',1,'allowed','internal_only','hard',$2::jsonb)
     ON CONFLICT (provider_key) DO NOTHING`,
    [
      definition.providerKey,
      JSON.stringify({
        display_name: definition.displayName,
        source_class: 'internal_derived',
        source_table: definition.sourceTable,
        transitional_source: true,
      }),
    ],
  );
  const sourceResult = await client.query<
    QueryResultRow & {
      source_id: string | number;
      source_type: string;
      tier: number;
      license_status: string;
      redistribution: string;
      enforcement: string;
      metadata: Record<string, unknown>;
    }
  >(
    `SELECT source_id,source_type,tier,license_status,redistribution,enforcement,metadata
     FROM ingestion.source WHERE provider_key=$1`,
    [definition.providerKey],
  );
  const source = sourceResult.rows[0];
  if (
    source === undefined ||
    source.source_type !== 'internal' ||
    Number(source.tier) !== 1 ||
    source.license_status !== 'allowed' ||
    source.redistribution !== 'internal_only' ||
    source.enforcement !== 'hard' ||
    source.metadata['source_table'] !== definition.sourceTable ||
    source.metadata['transitional_source'] !== true
  ) {
    throw new Error(`source policy mismatch for ${definition.providerKey}`);
  }
  const sourceId = numeric(source.source_id, 'sourceId');
  const policy = contractPolicy(definition);
  const contentHash = sha256(JSON.stringify(policy));
  const current = await client.query<
    QueryResultRow & {
      source_contract_revision_id: string | number;
      policy_status: string;
      content_hash: string;
    }
  >(
    `SELECT source_contract_revision_id,policy_status,content_hash
     FROM ingestion.source_contract_revision
     WHERE source_id=$1 AND known_to IS NULL
     ORDER BY revision_no DESC LIMIT 1`,
    [sourceId],
  );
  if (current.rows.length === 0) {
    await client.query(
      `INSERT INTO ingestion.source_contract (
         source_id,version,schedule_policy,required_fields,quality_policy,revision_policy,active
       ) VALUES ($1,1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,true)
       ON CONFLICT (source_id,version) DO NOTHING`,
      [
        sourceId,
        JSON.stringify(policy['cadencePolicy']),
        JSON.stringify(definition.requiredFields),
        JSON.stringify(policy['qualityGatePolicy']),
        JSON.stringify(policy['correctionPolicy']),
      ],
    );
    await client.query(
      `INSERT INTO ingestion.source_contract_revision (
         source_id,revision_no,policy_status,cadence_policy,cutoff_policy,delay_policy,
         correction_policy,required_fields,license_policy,redistribution_policy,
         raw_retention_policy,quality_gate_policy,effective_from,known_from,content_hash
       ) VALUES ($1,1,'approved',$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,
                 $7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,'2000-01-01T00:00:00.000Z',$11,$12)`,
      [
        sourceId,
        JSON.stringify(policy['cadencePolicy']),
        JSON.stringify(policy['cutoffPolicy']),
        JSON.stringify(policy['delayPolicy']),
        JSON.stringify(policy['correctionPolicy']),
        JSON.stringify(definition.requiredFields),
        JSON.stringify(policy['licensePolicy']),
        JSON.stringify(policy['redistributionPolicy']),
        JSON.stringify(policy['rawRetentionPolicy']),
        JSON.stringify(policy['qualityGatePolicy']),
        knownAt,
        contentHash,
      ],
    );
  } else if (
    current.rows[0]!.policy_status !== 'approved' ||
    current.rows[0]!.content_hash !== contentHash
  ) {
    throw new Error(`approved immutable contract mismatch for ${definition.providerKey}`);
  }
  return sourceId;
}

async function ensureEntity(
  client: Client,
  input: { entityKey: string; entityType: 'ETF' | 'Industry'; name: string; metadata: object },
): Promise<number> {
  const existing = await client.query<
    QueryResultRow & { entity_id: string | number; entity_type: string }
  >(
    `SELECT entity.entity_id,entity.entity_type
     FROM core.entity_identifier identifier
     JOIN core.entity entity USING(entity_id)
     WHERE identifier.identifier_type='INTERNAL_KEY' AND identifier.identifier_value=$1`,
    [input.entityKey],
  );
  if (existing.rows[0]) {
    const allowedTypes =
      input.entityType === 'ETF' ? new Set(['ETF', 'Stock']) : new Set(['Industry']);
    if (!allowedTypes.has(existing.rows[0].entity_type)) {
      throw new Error(
        `canonical key ${input.entityKey} has incompatible type ${existing.rows[0].entity_type}`,
      );
    }
    return numeric(existing.rows[0].entity_id, 'entityId');
  }
  const inserted = await client.query<QueryResultRow & { entity_id: string | number }>(
    `INSERT INTO core.entity (entity_type,canonical_name,status,metadata)
     VALUES ($1,$2,'active',$3::jsonb) RETURNING entity_id`,
    [input.entityType, input.name, JSON.stringify(input.metadata)],
  );
  const entityId = numeric(inserted.rows[0]!.entity_id, 'entityId');
  await client.query(
    `INSERT INTO core.entity_identifier (entity_id,identifier_type,identifier_value,namespace,valid_from)
     VALUES ($1,'INTERNAL_KEY',$2,'',now())`,
    [entityId, input.entityKey],
  );
  return entityId;
}

async function openFetchRun(
  client: Client,
  providerKey: string,
  naturalRunKey: string,
  token: number,
  startedAt: string,
): Promise<{ fetchRunId: number; sourceId: number }> {
  const runId = `${naturalRunKey}:fencing-${token}`;
  const result = await client.query<
    QueryResultRow & { fetch_run_id: string | number; source_id: string | number }
  >(OPEN_FETCH_RUN_SQL, [providerKey, runId, runId, startedAt]);
  return {
    fetchRunId: numeric(result.rows[0]!.fetch_run_id, 'fetchRunId'),
    sourceId: numeric(result.rows[0]!.source_id, 'sourceId'),
  };
}

async function closeFetchRun(
  client: Client,
  fetchRunId: number,
  finishedAt: string,
  rowsRead: number,
  rowsWritten: number,
  rowsSkipped: number,
  summary: object,
): Promise<void> {
  const result = await client.query(CLOSE_FETCH_RUN_SQL, [
    fetchRunId,
    finishedAt,
    'success',
    rowsRead,
    rowsWritten,
    rowsSkipped,
    JSON.stringify({}),
    finishedAt,
    JSON.stringify(summary),
  ]);
  if (result.rowCount !== 1) throw new Error(`fetch run ${fetchRunId} close failed`);
}

async function materializeSources(
  client: Client,
  inputs: { holdings: EtfHoldingRow[]; sectors: SectorRow[]; profiles: CompanyProfileRow[] },
  naturalRunKey: string,
  token: number,
  capturedAt: string,
): Promise<{
  etfObservations: EtfBasketObservation[];
  sectorObservations: OfficialSectorObservation[];
  productProfiles: ProductSimilarityProfile[];
  manifests: ManifestEntry[];
  replayedRawObjects: number;
}> {
  const capturedDate = new Date(capturedAt);
  await ensureSource(client, ETF_SOURCE, capturedAt);
  await ensureSource(client, SECTOR_SOURCE, capturedAt);
  await ensureSource(client, PROFILE_SOURCE, capturedAt);
  const manifests: ManifestEntry[] = [];
  let replayedRawObjects = 0;

  const etfRows = new Map<string, EtfHoldingRow[]>();
  for (const row of inputs.holdings) {
    const rows = etfRows.get(row.etf_ticker) ?? [];
    rows.push(row);
    etfRows.set(row.etf_ticker, rows);
  }
  const etfRun = await openFetchRun(client, ETF_PROVIDER, naturalRunKey, token, capturedAt);
  const etfObservations: EtfBasketObservation[] = [];
  let etfWritten = 0;
  for (const [ticker, rows] of [...etfRows].sort(([left], [right]) => left.localeCompare(right))) {
    const entityKey = etfEntityKey(ticker);
    const etfEntityId = await ensureEntity(client, {
      entityKey,
      entityType: 'ETF',
      name: rows[0]!.etf_name,
      metadata: { source: ETF_PROVIDER, ticker, transitional_source: true },
    });
    const payload = JSON.stringify({
      schemaVersion: 1,
      provider: ETF_PROVIDER,
      etfTicker: ticker,
      etfEntityKey: entityKey,
      asOf: rows[0]!.as_of,
      holdings: rows.map((row) => ({
        entityKey: row.member_entity_key,
        weightPct: row.weight_pct,
        sector: row.sector,
        source: row.source,
      })),
    });
    const raw = await writeRawObject({
      providerKey: ETF_PROVIDER,
      content: payload,
      extension: 'json',
      fetchedAt: capturedDate,
    });
    const registered = await registerRawObjectWithRevision(client as unknown as PoolClient, {
      fetchRunId: etfRun.fetchRunId,
      sourceId: etfRun.sourceId,
      providerRecordKey: `etf:${ticker}`,
      contentHash: raw.contentHash,
      objectUri: raw.objectUri,
      httpMeta: {
        bytes: raw.bytes,
        kind: 'transitional_etf_snapshot',
        source_table: ETF_SOURCE.sourceTable,
      },
      fetchedAt: capturedAt,
    });
    if (registered.rawInserted) {
      manifests.push({ providerKey: ETF_PROVIDER, ref: raw, fetchedAt: capturedDate });
      etfWritten += 1;
    } else {
      replayedRawObjects += 1;
    }
    const validFrom = `${rows[0]!.as_of}T00:00:00.000Z`;
    for (const row of rows) {
      etfObservations.push({
        etfEntityId,
        memberEntityId: numeric(row.member_entity_id!, 'memberEntityId'),
        sourceRevisionId: registered.sourceRevisionId,
        availableAt: registered.sourceAvailableAt,
        validFrom,
      });
    }
  }
  await closeFetchRun(
    client,
    etfRun.fetchRunId,
    capturedAt,
    inputs.holdings.length,
    etfWritten,
    etfRows.size - etfWritten,
    { etfs: etfRows.size, observations: etfObservations.length },
  );

  const sectorRun = await openFetchRun(client, SECTOR_PROVIDER, naturalRunKey, token, capturedAt);
  const sectorObservations: OfficialSectorObservation[] = [];
  let sectorWritten = 0;
  for (const row of inputs.sectors) {
    const taxonomyKey = `INDUSTRY:${row.taxonomy_system}:${row.taxonomy_code}`;
    const taxonomyEntityId = await ensureEntity(client, {
      entityKey: taxonomyKey,
      entityType: 'Industry',
      name: row.taxonomy_description?.trim() || `${row.taxonomy_system} ${row.taxonomy_code}`,
      metadata: {
        taxonomy_system: row.taxonomy_system,
        taxonomy_code: row.taxonomy_code,
        source: SECTOR_PROVIDER,
        transitional_source: true,
      },
    });
    const sourceValidFrom = row.valid_from === null ? null : toIso(row.valid_from);
    const payload = JSON.stringify({
      schemaVersion: 1,
      provider: SECTOR_PROVIDER,
      entityKey: row.entity_key,
      taxonomySystem: row.taxonomy_system,
      taxonomyCode: row.taxonomy_code,
      taxonomyDescription: row.taxonomy_description,
      sourceSystem: row.source_system,
      sourceRef: row.source_ref,
      validFrom: sourceValidFrom,
    });
    const raw = await writeRawObject({
      providerKey: SECTOR_PROVIDER,
      content: payload,
      extension: 'json',
      fetchedAt: capturedDate,
    });
    const registered = await registerRawObjectWithRevision(client as unknown as PoolClient, {
      fetchRunId: sectorRun.fetchRunId,
      sourceId: sectorRun.sourceId,
      providerRecordKey: `classification:${row.entity_key}`,
      contentHash: raw.contentHash,
      objectUri: raw.objectUri,
      httpMeta: {
        bytes: raw.bytes,
        kind: 'transitional_industry_classification',
        source_table: SECTOR_SOURCE.sourceTable,
      },
      fetchedAt: capturedAt,
    });
    if (registered.rawInserted) {
      manifests.push({ providerKey: SECTOR_PROVIDER, ref: raw, fetchedAt: capturedDate });
      sectorWritten += 1;
    } else {
      replayedRawObjects += 1;
    }
    sectorObservations.push({
      subjectEntityId: numeric(row.subject_entity_id!, 'subjectEntityId'),
      taxonomyEntityId,
      taxonomySystem: row.taxonomy_system,
      taxonomyCode: row.taxonomy_code,
      classificationStatus: 'source_reported',
      sourceRevisionId: registered.sourceRevisionId,
      availableAt: registered.sourceAvailableAt,
      validFrom: sourceValidFrom ?? registered.sourceAvailableAt,
    });
  }
  await closeFetchRun(
    client,
    sectorRun.fetchRunId,
    capturedAt,
    inputs.sectors.length,
    sectorWritten,
    inputs.sectors.length - sectorWritten,
    { observations: sectorObservations.length },
  );

  const profileRun = await openFetchRun(client, PROFILE_PROVIDER, naturalRunKey, token, capturedAt);
  const productProfiles: ProductSimilarityProfile[] = [];
  let profileWritten = 0;
  for (const row of inputs.profiles) {
    const payload = JSON.stringify({
      schemaVersion: 1,
      provider: PROFILE_PROVIDER,
      entityKey: row.entity_key,
      entityName: row.entity_name,
      summaryText: row.summary_text,
      profile: row.profile_json,
      sourceRefs: row.source_refs_json,
      availability: row.availability,
      sourceCapturedAt: toIso(row.captured_at),
    });
    const raw = await writeRawObject({
      providerKey: PROFILE_PROVIDER,
      content: payload,
      extension: 'json',
      fetchedAt: capturedDate,
    });
    const registered = await registerRawObjectWithRevision(client as unknown as PoolClient, {
      fetchRunId: profileRun.fetchRunId,
      sourceId: profileRun.sourceId,
      providerRecordKey: `profile:${row.entity_key}`,
      contentHash: raw.contentHash,
      objectUri: raw.objectUri,
      httpMeta: {
        bytes: raw.bytes,
        kind: 'transitional_company_profile',
        source_table: PROFILE_SOURCE.sourceTable,
      },
      fetchedAt: capturedAt,
    });
    if (registered.rawInserted) {
      manifests.push({ providerKey: PROFILE_PROVIDER, ref: raw, fetchedAt: capturedDate });
      profileWritten += 1;
    } else {
      replayedRawObjects += 1;
    }
    productProfiles.push({
      entityId: numeric(row.entity_id!, 'profileEntityId'),
      text: row.summary_text,
      sourceRevisionId: registered.sourceRevisionId,
      availableAt: registered.sourceAvailableAt,
      validFrom: registered.sourceAvailableAt,
    });
  }
  await closeFetchRun(
    client,
    profileRun.fetchRunId,
    capturedAt,
    inputs.profiles.length,
    profileWritten,
    inputs.profiles.length - profileWritten,
    { profiles: productProfiles.length },
  );
  return {
    etfObservations,
    sectorObservations,
    productProfiles,
    manifests,
    replayedRawObjects,
  };
}

async function approvedOntologyIds(client: Client): Promise<Record<string, number>> {
  const rows = await client.query<
    QueryResultRow & { predicate: string; predicate_ontology_revision_id: string | number }
  >(
    `SELECT DISTINCT ON (ontology.predicate)
            ontology.predicate,ontology.predicate_ontology_revision_id
     FROM knowledge.predicate_ontology_revision ontology
     WHERE ontology.policy_status='approved'
       AND ontology.effective_from<=now()
       AND ontology.known_from<=now()
     ORDER BY ontology.predicate,ontology.revision_no DESC,ontology.known_from DESC`,
  );
  return Object.fromEntries(
    rows.rows.map((row) => [
      row.predicate,
      numeric(row.predicate_ontology_revision_id, 'predicateOntologyRevisionId'),
    ]),
  );
}

async function insertGraphSnapshot(client: Client, plan: GraphSnapshotPlan): Promise<number> {
  const header = await client.query<QueryResultRow & { graph_snapshot_id: string | number }>(
    `INSERT INTO analytics.graph_snapshot (
       as_of,known_at,builder_version,status,snapshot_digest,edge_count,entity_count,metadata
     ) VALUES ($1,$2,$3,'building',$4,$5,$6,$7::jsonb)
     RETURNING graph_snapshot_id`,
    [
      plan.header.asOf,
      plan.header.knownAt,
      plan.header.builderVersion,
      plan.header.snapshotDigest,
      plan.header.edgeCount,
      plan.header.entityCount,
      JSON.stringify({ writer: 'run-v2-graph-publish', release_commit: RELEASE_COMMIT }),
    ],
  );
  const graphSnapshotId = numeric(header.rows[0]!.graph_snapshot_id, 'graphSnapshotId');
  for (let offset = 0; offset < plan.edges.length; offset += 400) {
    const rows = plan.edges.slice(offset, offset + 400);
    const values: unknown[] = [];
    const tuples = rows.map((edge, index) => {
      const start = index * 8;
      values.push(
        graphSnapshotId,
        edge.relationRevisionId,
        edge.relationIdentityId,
        edge.subjectEntityId,
        edge.objectEntityId,
        edge.predicate,
        edge.relationKind,
        edge.confidence,
      );
      return `(${Array.from({ length: 8 }, (_, column) => `$${start + column + 1}`).join(',')})`;
    });
    await client.query(
      `INSERT INTO analytics.graph_snapshot_edge (
         graph_snapshot_id,relation_revision_id,relation_identity_id,
         subject_entity_id,object_entity_id,predicate,relation_kind,confidence
       ) VALUES ${tuples.join(',')}`,
      values,
    );
  }
  for (let offset = 0; offset < plan.degrees.length; offset += 500) {
    const rows = plan.degrees.slice(offset, offset + 500);
    const values: unknown[] = [];
    const tuples = rows.map((degree, index) => {
      const start = index * 5;
      values.push(
        graphSnapshotId,
        degree.entityId,
        degree.totalDegree,
        JSON.stringify(degree.degreeByPredicate),
        degree.superhubFlag,
      );
      return `(${Array.from({ length: 5 }, (_, column) => `$${start + column + 1}`).join(',')})`;
    });
    await client.query(
      `INSERT INTO analytics.graph_snapshot_degree (
         graph_snapshot_id,entity_id,total_degree,degree_by_predicate,superhub_flag
       ) VALUES ${tuples.join(',')}`,
      values,
    );
  }
  const sealed = await client.query(
    `UPDATE analytics.graph_snapshot
     SET status='sealed',sealed_at=clock_timestamp()
     WHERE graph_snapshot_id=$1 AND status='building'`,
    [graphSnapshotId],
  );
  if (sealed.rowCount !== 1) throw new Error('graph snapshot seal failed');
  return graphSnapshotId;
}

async function loadProjectionInputs(
  client: Client,
  graphSnapshotId: number,
): Promise<{
  edges: RelationGraphProjectionEdge[];
  entities: RelationGraphProjectionEntity[];
}> {
  const edges = await client.query<
    QueryResultRow & {
      relation_revision_id: string | number;
      relation_identity_id: string | number;
      predicate: string;
      subject_entity_id: string | number;
      object_entity_id: string | number;
      confidence: number;
      evidence_ids: Array<string | number> | null;
    }
  >(
    `SELECT snapshot.relation_revision_id,snapshot.relation_identity_id,snapshot.predicate,
            snapshot.subject_entity_id,snapshot.object_entity_id,snapshot.confidence,
            coalesce(array_agg(evidence.relation_evidence_ledger_id ORDER BY evidence.relation_evidence_ledger_id)
              FILTER (WHERE evidence.relation_evidence_ledger_id IS NOT NULL),'{}') AS evidence_ids
     FROM analytics.graph_snapshot_edge snapshot
     JOIN knowledge.relation_revision revision
       ON revision.relation_revision_id=snapshot.relation_revision_id
     LEFT JOIN knowledge.relation_evidence_ledger evidence
       ON evidence.relation_identity_id=snapshot.relation_identity_id
      AND evidence.relation_payload_hash=revision.payload_hash
     WHERE snapshot.graph_snapshot_id=$1
     GROUP BY snapshot.graph_snapshot_edge_id,snapshot.relation_revision_id,
              snapshot.relation_identity_id,snapshot.predicate,snapshot.subject_entity_id,
              snapshot.object_entity_id,snapshot.confidence
     ORDER BY snapshot.relation_revision_id`,
    [graphSnapshotId],
  );
  const entityRows = await client.query<
    QueryResultRow & {
      entity_id: string | number;
      entity_key: string;
      label: string;
    }
  >(
    `SELECT DISTINCT entity.entity_id,identifier.identifier_value AS entity_key,
            entity.canonical_name AS label
     FROM analytics.graph_snapshot_edge snapshot
     JOIN core.entity entity
       ON entity.entity_id IN (snapshot.subject_entity_id,snapshot.object_entity_id)
     JOIN core.entity_identifier identifier
       ON identifier.entity_id=entity.entity_id AND identifier.identifier_type='INTERNAL_KEY'
     WHERE snapshot.graph_snapshot_id=$1
     ORDER BY identifier.identifier_value`,
    [graphSnapshotId],
  );
  return {
    edges: edges.rows.map((row) => ({
      relationRevisionId: numeric(row.relation_revision_id, 'relationRevisionId'),
      relationIdentityId: numeric(row.relation_identity_id, 'relationIdentityId'),
      predicate: row.predicate,
      subjectEntityId: numeric(row.subject_entity_id, 'subjectEntityId'),
      objectEntityId: numeric(row.object_entity_id, 'objectEntityId'),
      confidence: Number(row.confidence),
      evidenceIds: (row.evidence_ids ?? []).map((value) => numeric(value, 'evidenceId')),
    })),
    entities: entityRows.rows.map((row) => ({
      entityId: numeric(row.entity_id, 'entityId'),
      entityKey: row.entity_key,
      label: row.label,
      market: row.entity_key.startsWith('KR:')
        ? ('KR' as const)
        : row.entity_key.startsWith('US:')
          ? ('US' as const)
          : null,
    })),
  };
}

function packSourceItems(projection: RelationGraphProjection): ContentPackSourceItem[] {
  if (
    projection.relationRevisionIds.length === 0 ||
    projection.relationEvidenceLedgerIds.length === 0
  ) {
    throw new Error(`projection ${projection.entityKey} lacks typed lineage anchors`);
  }
  const relationItems = projection.relationRevisionIds.map(
    (relationRevisionId, index): ContentPackSourceItem => ({
      itemKind: 'relation',
      relationRevisionId,
      displayPayload:
        index === 0
          ? { graph: projection.depth1 }
          : {
              lineage: {
                graphSnapshotEntityKey: projection.entityKey,
                relationRevisionId,
              },
            },
      rank: index === 0 ? 1000 : 100 - index,
    }),
  );
  const evidenceItems = projection.relationEvidenceLedgerIds.map(
    (relationEvidenceLedgerId, index): ContentPackSourceItem => ({
      itemKind: 'evidence',
      relationEvidenceLedgerId,
      displayPayload:
        index === 0
          ? { graph: projection.depth2 }
          : {
              lineage: {
                graphSnapshotEntityKey: projection.entityKey,
                relationEvidenceLedgerId,
              },
            },
      rank: index === 0 ? 999 : 50 - index,
    }),
  );
  return [...relationItems, ...evidenceItems];
}

async function publishPacks(
  client: Client,
  projections: RelationGraphProjection[],
  graphSnapshotId: number,
  builderVersion: string,
  builtAt: Date,
): Promise<{ packIds: number[]; itemCount: number }> {
  const drafts: Array<{ packId: number; draft: ContentPackDraft }> = [];
  let itemCount = 0;
  for (const projection of projections) {
    const sourceItems = packSourceItems(projection);
    const maxItems = 512;
    if (sourceItems.length > maxItems) {
      throw new Error(
        `projection ${projection.entityKey} exceeds lineage item cap: ${sourceItems.length}`,
      );
    }
    const draft = buildContentPack(sourceItems, {
      packKind: PACK_KIND,
      entityId: projection.entityId,
      graphSnapshotId,
      snapshotStatus: 'sealed',
      builderVersion,
      freshnessHours: FRESHNESS_HOURS,
      maxItems,
      now: builtAt,
    });
    if (draft.itemCount !== sourceItems.length) {
      throw new Error(`projection ${projection.entityKey} lost typed lineage anchors`);
    }
    const inserted = await client.query<QueryResultRow & { content_pack_id: string | number }>(
      `INSERT INTO serving.content_pack (
         pack_kind,entity_id,graph_snapshot_id,builder_version,status,pack_digest,
         item_count,built_at,fresh_until,metadata
       ) VALUES ($1,$2,$3,$4,'building',$5,$6,$7,$8,$9::jsonb)
       RETURNING content_pack_id`,
      [
        draft.packKind,
        draft.entityId,
        draft.graphSnapshotId,
        draft.builderVersion,
        draft.packDigest,
        draft.itemCount,
        draft.builtAt,
        draft.freshUntil,
        JSON.stringify({ source: 'canonical_v2_projection', release_commit: RELEASE_COMMIT }),
      ],
    );
    drafts.push({
      packId: numeric(inserted.rows[0]!.content_pack_id, 'contentPackId'),
      draft,
    });
    itemCount += draft.itemCount;
  }
  const itemRows = drafts.flatMap(({ packId, draft }) =>
    draft.items.map((item) => ({ packId, item })),
  );
  for (let offset = 0; offset < itemRows.length; offset += 300) {
    const rows = itemRows.slice(offset, offset + 300);
    const derivationValues: unknown[] = [];
    const derivationKeys = rows.map(({ packId, item }, index) => {
      const derivationKey = `content-pack:${packId}:item:${item.itemNo}:direct-v1`;
      const start = index * 3;
      derivationValues.push(
        derivationKey,
        builderVersion,
        JSON.stringify({
          source: 'canonical_v2_projection',
          content_pack_id: packId,
          item_no: item.itemNo,
        }),
      );
      return {
        derivationKey,
        tuple: `($${start + 1},'direct_projection','canonical_v2_projection',$${start + 2},'stock-insight-v2-graph-publisher',$${start + 3}::jsonb)`,
      };
    });
    const derivations = await client.query<
      QueryResultRow & { derivation_id: string | number; derivation_key: string }
    >(
      `INSERT INTO knowledge.derivation (
         derivation_key,derivation_kind,method,method_version,created_by,metadata
       ) VALUES ${derivationKeys.map((row) => row.tuple).join(',')}
       RETURNING derivation_id,derivation_key`,
      derivationValues,
    );
    const derivationIdByKey = new Map(
      derivations.rows.map((row) => [
        row.derivation_key,
        numeric(row.derivation_id, 'derivationId'),
      ]),
    );
    const stepValues: unknown[] = [];
    const rowsWithDerivations = rows.map(({ packId, item }, index) => {
      const derivationKey = derivationKeys[index]!.derivationKey;
      const derivationId = derivationIdByKey.get(derivationKey);
      if (derivationId === undefined) throw new Error(`missing derivation ${derivationKey}`);
      stepValues.push(
        derivationId,
        builderVersion,
        JSON.stringify({ content_pack_id: packId, item_no: item.itemNo }),
      );
      return { packId, item, derivationId };
    });
    const steps = await client.query<
      QueryResultRow & { derivation_step_id: string | number; derivation_id: string | number }
    >(
      `INSERT INTO knowledge.derivation_step (
         derivation_id,step_no,activity_type,activity_version,
         output_type,output_locator,parameters
       ) VALUES ${rowsWithDerivations
         .map((_, index) => {
           const start = index * 3;
           return `($${start + 1},1,'direct_projection',$${start + 2},'serving.content_pack_item',$${start + 3}::jsonb,'{}'::jsonb)`;
         })
         .join(',')}
       RETURNING derivation_step_id,derivation_id`,
      stepValues,
    );
    const stepIdByDerivationId = new Map(
      steps.rows.map((row) => [
        numeric(row.derivation_id, 'derivationId'),
        numeric(row.derivation_step_id, 'derivationStepId'),
      ]),
    );
    const inputValues: unknown[] = [];
    const inputTuples = rowsWithDerivations.map(({ item, derivationId }, index) => {
      const derivationStepId = stepIdByDerivationId.get(derivationId);
      if (derivationStepId === undefined) {
        throw new Error(`missing derivation step ${derivationId}`);
      }
      const anchors = [
        { kind: 'relation_revision', id: item.relationRevisionId },
        { kind: 'relation_evidence', id: item.relationEvidenceLedgerId },
        { kind: 'impact_path', id: item.impactPathV2Id },
        { kind: 'relation_measurement', id: item.relationMeasurementId },
      ].filter((anchor): anchor is { kind: string; id: number } => anchor.id !== null);
      if (anchors.length !== 1) throw new Error(`item ${item.itemNo} needs one typed anchor`);
      const anchor = anchors[0]!;
      const start = index * 7;
      inputValues.push(
        derivationStepId,
        anchor.kind,
        anchor.kind === 'relation_revision' ? anchor.id : null,
        anchor.kind === 'relation_evidence' ? anchor.id : null,
        anchor.kind === 'impact_path' ? anchor.id : null,
        anchor.kind === 'relation_measurement' ? anchor.id : null,
        JSON.stringify({ policy: 'p1-w1-direct-v1' }),
      );
      return `($${start + 1},1,$${start + 2},$${start + 3},$${start + 4},$${start + 5},$${start + 6},'evidence',$${start + 7}::jsonb)`;
    });
    await client.query(
      `INSERT INTO knowledge.derivation_input (
         derivation_step_id,input_no,input_kind,relation_revision_id,
         relation_evidence_ledger_id,impact_path_v2_id,relation_measurement_id,
         input_role,metadata
       ) VALUES ${inputTuples.join(',')}`,
      inputValues,
    );
    const derivationIds = rowsWithDerivations.map((row) => row.derivationId);
    const sealed = await client.query(
      `UPDATE knowledge.derivation AS derivation
       SET status='sealed',step_count=1,input_count=1,
           derivation_digest=knowledge.compute_derivation_digest(derivation.derivation_id),
           sealed_at=clock_timestamp()
       WHERE derivation.derivation_id = ANY($1::bigint[]) AND derivation.status='building'`,
      [derivationIds],
    );
    if (sealed.rowCount !== derivationIds.length)
      throw new Error('derivation sealing was incomplete');
    const values: unknown[] = [];
    const tuples = rowsWithDerivations.map(({ packId, item, derivationId }, index) => {
      const start = index * 9;
      values.push(
        packId,
        item.itemNo,
        item.itemKind,
        derivationId,
        item.relationRevisionId,
        item.relationEvidenceLedgerId,
        item.impactPathV2Id,
        item.relationMeasurementId,
        JSON.stringify(item.displayPayload),
      );
      return `(${Array.from({ length: 9 }, (_, column) => `$${start + column + 1}`).join(',')})`;
    });
    await client.query(
      `INSERT INTO serving.content_pack_item (
         content_pack_id,item_no,item_kind,derivation_id,relation_revision_id,
         relation_evidence_ledger_id,impact_path_v2_id,relation_measurement_id,display_payload
       ) VALUES ${tuples.join(',')}`,
      values,
    );
  }
  for (const { packId } of drafts) {
    const published = await client.query(
      `UPDATE serving.content_pack
       SET status='published',published_at=clock_timestamp()
       WHERE content_pack_id=$1 AND status='building'`,
      [packId],
    );
    if (published.rowCount !== 1) throw new Error(`content pack ${packId} publish failed`);
  }
  const packIds = drafts.map((row) => row.packId);
  await client.query(
    `UPDATE serving.content_pack
     SET status='superseded'
     WHERE pack_kind=$1 AND status='published' AND graph_snapshot_id<>$2`,
    [PACK_KIND, graphSnapshotId],
  );
  await client.query(
    `UPDATE analytics.graph_snapshot snapshot
     SET status='superseded'
     WHERE snapshot.status='sealed' AND snapshot.graph_snapshot_id<>$1
       AND NOT EXISTS (
         SELECT 1 FROM serving.content_pack pack
         WHERE pack.graph_snapshot_id=snapshot.graph_snapshot_id AND pack.status='published'
       )`,
    [graphSnapshotId],
  );
  return { packIds, itemCount };
}

async function dryRun(client: Client): Promise<void> {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const inputs = await loadInputs(client);
    const nowResult = await client.query<QueryResultRow & { now: Date | string }>(
      `SELECT clock_timestamp() AS now`,
    );
    const cutoff = toIso(nowResult.rows[0]!.now);
    const freshUntil = new Date(
      new Date(cutoff).getTime() + FRESHNESS_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const fakeEtfIds = new Map<string, number>();
    const fakeEtfRevisions = new Map<string, number>();
    const etfObservations: EtfBasketObservation[] = [];
    for (const [index, ticker] of [...new Set(inputs.holdings.map((row) => row.etf_ticker))]
      .sort()
      .entries()) {
      fakeEtfIds.set(ticker, 10_000_000 + index);
      fakeEtfRevisions.set(ticker, 20_000_000 + index);
    }
    for (const row of inputs.holdings) {
      etfObservations.push({
        etfEntityId: fakeEtfIds.get(row.etf_ticker)!,
        memberEntityId: numeric(row.member_entity_id!, 'memberEntityId'),
        sourceRevisionId: fakeEtfRevisions.get(row.etf_ticker)!,
        availableAt: cutoff,
        validFrom: `${row.as_of}T00:00:00.000Z`,
      });
    }
    const taxonomyIds = new Map<string, number>();
    const sectorObservations: OfficialSectorObservation[] = [];
    for (const [index, row] of inputs.sectors.entries()) {
      const key = `${row.taxonomy_system}:${row.taxonomy_code}`;
      if (!taxonomyIds.has(key)) taxonomyIds.set(key, 30_000_000 + taxonomyIds.size);
      sectorObservations.push({
        subjectEntityId: numeric(row.subject_entity_id!, 'subjectEntityId'),
        taxonomyEntityId: taxonomyIds.get(key)!,
        taxonomySystem: row.taxonomy_system,
        taxonomyCode: row.taxonomy_code,
        classificationStatus: 'source_reported',
        sourceRevisionId: 40_000_000 + index,
        availableAt: cutoff,
        validFrom: row.valid_from === null ? cutoff : toIso(row.valid_from),
      });
    }
    const productProfiles: ProductSimilarityProfile[] = inputs.profiles.map((row, index) => ({
      entityId: numeric(row.entity_id!, 'profileEntityId'),
      text: row.summary_text,
      sourceRevisionId: 80_000_000 + index,
      availableAt: cutoff,
      validFrom: cutoff,
    }));
    const etf = buildEtfBasketCandidates(etfObservations, { asOf: cutoff });
    const sectors = buildOfficialSectorCandidates(sectorObservations, { asOf: cutoff });
    const products = buildProductSimilarityCandidates(
      buildProductSimilarityObservations(productProfiles),
      { asOf: cutoff },
    );
    const candidates = [...etf.candidates, ...sectors, ...products.candidates];
    const projectionEdges: RelationGraphProjectionEdge[] = candidates.map((candidate, index) => ({
      relationRevisionId: 50_000_000 + index,
      relationIdentityId: 60_000_000 + index,
      predicate: candidate.predicate,
      subjectEntityId: candidate.subjectEntityId,
      objectEntityId: candidate.objectEntityId,
      confidence:
        candidate.predicate === 'CLASSIFIED_AS'
          ? 1
          : candidate.predicate === 'PRODUCT_SIMILARITY'
            ? Number(candidate.metadata['similarityScore'])
            : 0.8,
      evidenceIds: candidate.evidence.map(
        (_, evidenceIndex) => 70_000_000 + index * 100 + evidenceIndex,
      ),
    }));
    const entityById = new Map<number, RelationGraphProjectionEntity>();
    for (const row of [
      ...inputs.holdings.map((holding) => ({
        entityId: numeric(holding.member_entity_id!, 'memberEntityId'),
        entityKey: holding.member_entity_key,
        label: holding.member_name,
      })),
      ...inputs.sectors.map((sector) => ({
        entityId: numeric(sector.subject_entity_id!, 'subjectEntityId'),
        entityKey: sector.entity_key,
        label: sector.entity_name,
      })),
      ...inputs.profiles.map((profile) => ({
        entityId: numeric(profile.entity_id!, 'profileEntityId'),
        entityKey: profile.entity_key,
        label: profile.entity_name,
      })),
    ]) {
      entityById.set(row.entityId, {
        ...row,
        market: row.entityKey.startsWith('KR:') ? 'KR' : 'US',
      });
    }
    for (const [key, entityId] of taxonomyIds) {
      entityById.set(entityId, {
        entityId,
        entityKey: `INDUSTRY:${key}`,
        label: key,
        market: null,
      });
    }
    const projections = buildRelationGraphProjections(projectionEdges, [...entityById.values()], {
      graphSnapshotId: 1,
      asOf: cutoff,
      knownAt: cutoff,
      builderVersion: 'v2-dry-run',
      freshUntil,
      marketDataAsOf: null,
    });
    console.log(
      JSON.stringify({
        mode: 'dry-run',
        holdings: inputs.holdings.length,
        etfs: fakeEtfIds.size,
        classifications: inputs.sectors.length,
        profiles: inputs.profiles.length,
        etfCandidates: etf.candidates.length,
        sectorCandidates: sectors.length,
        productCandidates: products.candidates.length,
        exclusions: etf.exclusions.length,
        projectedRoots: projections.length,
        projectedDepth2Edges: projections.reduce((sum, row) => sum + row.depth2.edges.length, 0),
      }),
    );
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function apply(client: Client): Promise<void> {
  const slotResult = await client.query<QueryResultRow & { slot: string }>(
    `SELECT to_char(clock_timestamp() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS slot`,
  );
  const slot = slotResult.rows[0]!.slot;
  const naturalRunKey = `v2-graph-publish:${slot}`;
  const claimedBy = `${hostname()}:${process.pid}:${RELEASE_COMMIT}`;
  const claimResult = await client.query<
    QueryResultRow & { claimed: boolean; fencing_token: string | number; owner: string }
  >(`SELECT * FROM ops.claim_pipeline_run($1,$2,$3,$4)`, [
    naturalRunKey,
    'serving.entity_relation_graph_v2',
    claimedBy,
    3600,
  ]);
  const claim = claimResult.rows[0]!;
  const token = numeric(claim.fencing_token, 'fencingToken');
  if (!claim.claimed) {
    const existing = await client.query<
      QueryResultRow & { claim_status: string; completed_at: Date | string | null }
    >(
      `SELECT claim_status,completed_at
       FROM ops.pipeline_run_claim
       WHERE natural_run_key=$1`,
      [naturalRunKey],
    );
    const current = existing.rows[0];
    if (current?.claim_status !== 'completed' || current.completed_at === null) {
      throw new Error(`v2 graph publish claim is owned by another active run: ${claim.owner}`);
    }
    console.log(
      JSON.stringify({
        mode: 'apply',
        outcome: 'already_completed',
        naturalRunKey,
        fencingToken: token,
        claimOwner: claim.owner,
        completedAt: toIso(current.completed_at),
      }),
    );
    return;
  }
  const manifests: ManifestEntry[] = [];
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query(`SET LOCAL lock_timeout='5s'`);
    await client.query(`SET LOCAL statement_timeout='20min'`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout='20min'`);
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('stock-insight-v2-publisher',0))`,
    );
    const captured = await client.query<QueryResultRow & { captured_at: Date | string }>(
      `SELECT clock_timestamp() AS captured_at`,
    );
    const capturedAt = toIso(captured.rows[0]!.captured_at);
    const inputs = await loadInputs(client);
    const materialized = await materializeSources(client, inputs, naturalRunKey, token, capturedAt);
    manifests.push(...materialized.manifests);
    const etfBuilt = buildEtfBasketCandidates(materialized.etfObservations, { asOf: capturedAt });
    const sectorBuilt = buildOfficialSectorCandidates(materialized.sectorObservations, {
      asOf: capturedAt,
    });
    const productBuilt = buildProductSimilarityCandidates(
      buildProductSimilarityObservations(materialized.productProfiles),
      { asOf: capturedAt },
    );
    if (etfBuilt.exclusions.length > 0) {
      throw new Error(`ETF superhub exclusions require review: ${etfBuilt.exclusions.length}`);
    }
    const ontologyIds = await approvedOntologyIds(client);
    const sectorPersisted = await persistRelationCandidates(
      client as unknown as PoolClient,
      sectorBuilt,
      { predicateOntologyRevisionIds: ontologyIds, confidence: 1 },
    );
    const etfPersisted = await persistRelationCandidates(
      client as unknown as PoolClient,
      etfBuilt.candidates,
      { predicateOntologyRevisionIds: ontologyIds, confidence: 0.8 },
    );
    const productPersisted = await persistRelationCandidates(
      client as unknown as PoolClient,
      productBuilt.candidates,
      {
        predicateOntologyRevisionIds: ontologyIds,
        confidence: (candidate) => Number(candidate.metadata['similarityScore']),
      },
    );
    const known = await client.query<QueryResultRow & { known_at: Date | string }>(
      `SELECT clock_timestamp() AS known_at`,
    );
    const knownAt = toIso(known.rows[0]!.known_at);
    const builderVersion = `v2-publish:${RELEASE_COMMIT}:${slot}:f${token}`;
    const plan = await planGraphSnapshotFromDatabase(client, {
      asOf: capturedAt,
      knownAt,
      builderVersion,
      superhubDegreeThreshold: SUPERHUB_DEGREE_THRESHOLD,
    });
    const graphSnapshotId = await insertGraphSnapshot(client, plan);
    const projectionInputs = await loadProjectionInputs(client, graphSnapshotId);
    const builtAt = new Date(knownAt);
    const projections = buildRelationGraphProjections(
      projectionInputs.edges,
      projectionInputs.entities,
      {
        graphSnapshotId,
        asOf: plan.header.asOf,
        knownAt: plan.header.knownAt,
        builderVersion,
        freshUntil: new Date(builtAt.getTime() + FRESHNESS_HOURS * 60 * 60 * 1000).toISOString(),
        marketDataAsOf: null,
      },
    );
    if (projections.length === 0) throw new Error('no displayable v2 graph projections were built');
    const published = await publishPacks(
      client,
      projections,
      graphSnapshotId,
      builderVersion,
      builtAt,
    );
    const finished = await client.query<QueryResultRow & { finished: boolean }>(
      `SELECT ops.finish_pipeline_run($1,$2,$3,'completed') AS finished`,
      [naturalRunKey, claimedBy, token],
    );
    if (!finished.rows[0]!.finished) throw new Error('pipeline claim finish was fenced out');
    await client.query('COMMIT');
    for (const manifest of manifests) {
      await appendRawObjectManifest(manifest).catch((error: unknown) =>
        process.stderr.write(`raw object manifest append skipped: ${String(error)}\n`),
      );
    }
    console.log(
      JSON.stringify({
        mode: 'apply',
        outcome: 'completed',
        naturalRunKey,
        fencingToken: token,
        graphSnapshotId,
        snapshotDigest: plan.header.snapshotDigest,
        snapshotEdges: plan.header.edgeCount,
        snapshotEntities: plan.header.entityCount,
        projectedRoots: projections.length,
        contentPacks: published.packIds.length,
        contentPackItems: published.itemCount,
        sectorCandidates: sectorBuilt.length,
        etfCandidates: etfBuilt.candidates.length,
        productCandidates: productBuilt.candidates.length,
        insertedRelationRevisions: [
          ...sectorPersisted.persisted,
          ...etfPersisted.persisted,
          ...productPersisted.persisted,
        ].filter((row) => row.outcome === 'inserted').length,
        replayedRelationRevisions: [
          ...sectorPersisted.persisted,
          ...etfPersisted.persisted,
          ...productPersisted.persisted,
        ].filter((row) => row.outcome === 'replayed').length,
        replayedRawObjects: materialized.replayedRawObjects,
      }),
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await client
      .query(`SELECT ops.finish_pipeline_run($1,$2,$3,'failed')`, [naturalRunKey, claimedBy, token])
      .catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    if (APPLY) await apply(client);
    else await dryRun(client);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
