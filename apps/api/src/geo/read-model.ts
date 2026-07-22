import { latLngToCell } from 'h3-js';

import {
  computeGeoSnapshotDigest,
  deriveGeoSnapshotId,
  geoFeatureSchema,
  geoSnapshotSchema,
  type GeoFeature,
  type GeoSnapshot,
} from '@stock-insight/contracts/geo-api-contract';

export type GeoSnapshotQueryExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type GetGeoSnapshotOptions = Readonly<{
  knownAt?: Date;
  validAt?: Date;
  now?: Date;
  h3Resolution?: number;
  staleAfterMs?: number;
}>;

export type GetGeoMvtTileOptions = Readonly<{
  z: number;
  x: number;
  y: number;
  knownAt: Date;
  validAt: Date;
  snapshotId: string;
  now?: Date;
}>;

type GeoSchemaProbeRow = {
  geo_revision_relation: string | null;
  source_revision_relation: string | null;
};

type GeoSnapshotRow = {
  geo_entity_revision_id: number | string | null;
  geo_entity_key: string | null;
  canonical_name: string | null;
  geo_kind: string | null;
  precision_class: string | null;
  geometry_json: unknown;
  longitude: number | string | null;
  latitude: number | string | null;
  uncertainty_radius_km: number | string | null;
  source_revision_id: number | string | null;
  raw_object_id?: number | string | null;
  source_id?: string | null;
  known_from: string | Date | null;
};

type RejectionCode =
  | 'duplicate_geo_entity'
  | 'invalid_geometry'
  | 'invalid_timestamp'
  | 'missing_evidence';

const GEO_SCHEMA_PROBE_SQL = `
  SELECT
    to_regclass('geo.entity_revision')::text AS geo_revision_relation,
    to_regclass('ingestion.source_revision')::text AS source_revision_relation
`;

const GEO_SNAPSHOT_SQL = `
  WITH latest_revision AS (
    SELECT DISTINCT ON (entity.geo_entity_id)
      revision.geo_entity_revision_id,
      entity.geo_entity_key,
      entity.canonical_name,
      entity.geo_kind,
      revision.precision_class,
      revision.geom,
      revision.metadata,
      revision.source_revision_id,
      revision.known_from
    FROM geo.entity AS entity
    JOIN geo.entity_revision AS revision
      ON revision.geo_entity_id = entity.geo_entity_id
    WHERE revision.known_from <= $1::timestamptz
      AND (revision.valid_from IS NULL OR revision.valid_from <= $2::timestamptz)
      AND (revision.valid_until IS NULL OR revision.valid_until > $2::timestamptz)
    ORDER BY entity.geo_entity_id, revision.known_from DESC, revision.revision_no DESC
  ), current_revision AS (
    SELECT
      latest_revision.geo_entity_revision_id,
      latest_revision.geo_entity_key,
      latest_revision.canonical_name,
      latest_revision.geo_kind,
      latest_revision.precision_class,
      ST_AsGeoJSON(latest_revision.geom, 9, 0)::jsonb AS geometry_json,
      ST_X(ST_PointOnSurface(latest_revision.geom)) AS longitude,
      ST_Y(ST_PointOnSurface(latest_revision.geom)) AS latitude,
      CASE
        WHEN jsonb_typeof(latest_revision.metadata -> 'uncertainty_radius_km') = 'number'
          THEN (latest_revision.metadata ->> 'uncertainty_radius_km')::numeric
        ELSE NULL
      END AS uncertainty_radius_km,
      latest_revision.source_revision_id,
      source_revision.raw_object_id,
      source.provider_key AS source_id,
      latest_revision.known_from
    FROM latest_revision
    LEFT JOIN ingestion.source_revision AS source_revision
      ON source_revision.source_revision_id = latest_revision.source_revision_id
    LEFT JOIN ingestion.source_record_identity AS source_record
      ON source_record.source_record_identity_id = source_revision.source_record_identity_id
    LEFT JOIN ingestion.source AS source
      ON source.source_id = source_record.source_id
    WHERE latest_revision.geom IS NOT NULL
  )
  SELECT *
  FROM current_revision
  ORDER BY geo_entity_key
`;

const GEO_MVT_SQL = `
  WITH bounds AS (
    SELECT ST_TileEnvelope($1::int, $2::int, $3::int) AS geom
  ), accepted_revision AS (
    SELECT geo_entity_key, geo_entity_revision_id, source_revision_id
    FROM unnest($6::text[], $7::bigint[], $8::bigint[])
      AS accepted(geo_entity_key, geo_entity_revision_id, source_revision_id)
  ), latest_revision AS (
    SELECT DISTINCT ON (entity.geo_entity_id)
      entity.geo_entity_key,
      entity.canonical_name,
      entity.geo_kind,
      revision.geo_entity_revision_id,
      revision.precision_class,
      revision.source_revision_id,
      revision.geom
    FROM geo.entity AS entity
    JOIN geo.entity_revision AS revision
      ON revision.geo_entity_id = entity.geo_entity_id
    JOIN accepted_revision AS accepted
      ON accepted.geo_entity_key = entity.geo_entity_key
      AND accepted.geo_entity_revision_id = revision.geo_entity_revision_id
      AND accepted.source_revision_id = revision.source_revision_id
    WHERE revision.known_from <= $4::timestamptz
      AND (revision.valid_from IS NULL OR revision.valid_from <= $5::timestamptz)
      AND (revision.valid_until IS NULL OR revision.valid_until > $5::timestamptz)
    ORDER BY entity.geo_entity_id, revision.known_from DESC, revision.revision_no DESC
  ), current_revision AS (
    SELECT *
    FROM latest_revision
    WHERE latest_revision.geom IS NOT NULL
      AND latest_revision.source_revision_id IS NOT NULL
  ), tile_rows AS (
    SELECT
      current_revision.geo_entity_key,
      current_revision.canonical_name AS label,
      current_revision.geo_kind,
      current_revision.geo_entity_revision_id,
      current_revision.precision_class,
      current_revision.source_revision_id,
      ST_AsMVTGeom(
        ST_Transform(current_revision.geom, 3857),
        bounds.geom,
        4096,
        64,
        true
      ) AS geom
    FROM current_revision
    CROSS JOIN bounds
    WHERE ST_Intersects(ST_Transform(current_revision.geom, 3857), bounds.geom)
  )
  SELECT coalesce(ST_AsMVT(tile_rows, 'geo', 4096, 'geom'), '\\x'::bytea) AS tile
  FROM tile_rows
`;

const LIMITATIONS = [
  'H3 셀은 화면 집계용 파생 투영이며 정본 위치나 행정 경계를 대체하지 않습니다.',
  '지도 기준점은 원본 geometry의 표시 기준점이며 실제 시설 좌표로 승격되지 않습니다.',
  '불확실성 반경은 고정 화면 원으로 환산하지 않고 근거 표에서만 수치로 제공합니다.',
] as const;

function compareText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function parseFinite(value: number | string | null): number | undefined {
  if (value === null) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function parsePositiveIdentifier(
  value: number | string | null | undefined,
): number | string | undefined {
  if (value === null || value === undefined) return undefined;
  const numeric = Number(value);
  if (Number.isSafeInteger(numeric) && numeric > 0) return numeric;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function parseIso(value: string | Date | null): string | undefined {
  if (value === null) return undefined;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function parseGeometry(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function rejectionSummary(codes: RejectionCode[]) {
  const counts = new Map<RejectionCode, number>();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return {
    count: codes.length,
    reasons: [...counts.entries()]
      .sort(([first], [second]) => compareText(first, second))
      .map(([code, count]) => ({ code, count })),
  };
}

function deriveH3(features: GeoFeature[], resolution: number) {
  const cells = new Map<string, string[]>();
  for (const feature of features) {
    const { latitude, longitude, geoEntityKey } = feature.properties;
    const cellId = latLngToCell(latitude, longitude, resolution);
    const keys = cells.get(cellId) ?? [];
    keys.push(geoEntityKey);
    cells.set(cellId, keys);
  }
  return [...cells.entries()]
    .sort(([first], [second]) => compareText(first, second))
    .map(([cellId, keys]) => {
      const geoEntityKeys = [...new Set(keys)].sort(compareText);
      return { cellId, featureCount: geoEntityKeys.length, geoEntityKeys };
    });
}

function sealSnapshot(input: {
  availability: GeoSnapshot['availability'];
  features: GeoFeature[];
  generatedAt: string;
  h3Resolution: number;
  knownAt: string;
  validAt: string;
  rejected: ReturnType<typeof rejectionSummary>;
  sourceAsOf: string | null;
}): GeoSnapshot {
  const geojson = { type: 'FeatureCollection' as const, features: input.features };
  const h3 = {
    resolution: input.h3Resolution,
    cells: deriveH3(input.features, input.h3Resolution),
  };
  const digest = computeGeoSnapshotDigest({
    version: 1,
    knownAt: input.knownAt,
    validAt: input.validAt,
    sourceAsOf: input.sourceAsOf,
    availability: input.availability,
    geojson,
    h3,
    rejected: input.rejected,
    limitations: LIMITATIONS,
    mvt: {
      contentType: 'application/vnd.mapbox-vector-tile',
      minZoom: 0,
      maxZoom: 14,
    },
  });
  const snapshotId = deriveGeoSnapshotId(digest);
  const contentAvailable = ['available', 'partial', 'stale'].includes(input.availability);
  const mvt = contentAvailable
    ? {
        available: true as const,
        contentType: 'application/vnd.mapbox-vector-tile' as const,
        minZoom: 0,
        maxZoom: 14,
        urlTemplate: `/api/geo/tiles/{z}/{x}/{y}?snapshot=${snapshotId}&validAt=${encodeURIComponent(input.validAt)}&knownAt=${encodeURIComponent(input.knownAt)}`,
      }
    : {
        available: false as const,
        contentType: 'application/vnd.mapbox-vector-tile' as const,
        minZoom: 0,
        maxZoom: 14,
        urlTemplate: null,
      };
  return geoSnapshotSchema.parse({
    version: 1,
    snapshotId,
    digest,
    generatedAt: input.generatedAt,
    knownAt: input.knownAt,
    validAt: input.validAt,
    sourceAsOf: input.sourceAsOf,
    availability: input.availability,
    geojson,
    mvt,
    h3,
    rejected: input.rejected,
    limitations: LIMITATIONS,
  });
}

function mapRows(rows: GeoSnapshotRow[]) {
  const accepted: Array<{ feature: GeoFeature; knownFrom: string }> = [];
  const rejected: RejectionCode[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.geo_entity_key || seen.has(row.geo_entity_key)) {
      rejected.push('duplicate_geo_entity');
      continue;
    }
    seen.add(row.geo_entity_key);
    const geoEntityRevisionId = parsePositiveIdentifier(row.geo_entity_revision_id);
    const sourceRevisionId = parsePositiveIdentifier(row.source_revision_id);
    if (geoEntityRevisionId === undefined || sourceRevisionId === undefined) {
      rejected.push('missing_evidence');
      continue;
    }
    const knownFrom = parseIso(row.known_from);
    if (knownFrom === undefined) {
      rejected.push('invalid_timestamp');
      continue;
    }
    const longitude = parseFinite(row.longitude);
    const latitude = parseFinite(row.latitude);
    if (longitude === undefined || latitude === undefined) {
      rejected.push('invalid_geometry');
      continue;
    }
    const uncertaintyRadiusKm = parseFinite(row.uncertainty_radius_km);
    const result = geoFeatureSchema.safeParse({
      type: 'Feature',
      geometry: parseGeometry(row.geometry_json),
      properties: {
        geoEntityKey: row.geo_entity_key,
        label: row.canonical_name,
        geoKind: row.geo_kind,
        precisionClass: row.precision_class,
        longitude,
        latitude,
        ...(uncertaintyRadiusKm === undefined ? {} : { uncertaintyRadiusKm }),
        evidenceLocator: {
          geoEntityRevisionId,
          sourceRevisionId,
          ...(parsePositiveIdentifier(row.raw_object_id) === undefined
            ? {}
            : { rawObjectId: parsePositiveIdentifier(row.raw_object_id) }),
          ...(row.source_id ? { sourceId: row.source_id } : {}),
        },
      },
    });
    if (!result.success) {
      rejected.push('invalid_geometry');
      continue;
    }
    accepted.push({ feature: result.data, knownFrom });
  }

  accepted.sort((first, second) =>
    compareText(first.feature.properties.geoEntityKey, second.feature.properties.geoEntityKey),
  );
  return { accepted, rejected: rejectionSummary(rejected) };
}

export async function getGeoSnapshot(
  executor: GeoSnapshotQueryExecutor,
  options: GetGeoSnapshotOptions = {},
): Promise<GeoSnapshot> {
  const now = options.now ?? new Date();
  const knownAtDate = options.knownAt ?? now;
  const knownAt = parseIso(knownAtDate);
  if (knownAt === undefined) throw new Error('Geo snapshot knownAt is invalid');
  const validAtDate = options.validAt ?? knownAtDate;
  const validAt = parseIso(validAtDate);
  if (validAt === undefined) throw new Error('Geo snapshot validAt is invalid');
  if (validAtDate.getTime() > knownAtDate.getTime()) {
    throw new Error('Geo snapshot validAt must not follow knownAt');
  }
  const generatedAt = parseIso(now);
  if (generatedAt === undefined) throw new Error('Geo snapshot generation time is invalid');
  const h3Resolution = options.h3Resolution ?? 3;
  if (!Number.isInteger(h3Resolution) || h3Resolution < 0 || h3Resolution > 15) {
    throw new Error('Geo snapshot H3 resolution must be between 0 and 15');
  }
  const staleAfterMs = options.staleAfterMs ?? 24 * 60 * 60 * 1_000;
  if (!Number.isFinite(staleAfterMs) || staleAfterMs <= 0) {
    throw new Error('Geo snapshot stale threshold must be positive');
  }

  const probe = (await executor.queryRows<GeoSchemaProbeRow>(GEO_SCHEMA_PROBE_SQL))[0];
  if (!probe?.geo_revision_relation || !probe.source_revision_relation) {
    return sealSnapshot({
      availability: 'unavailable',
      features: [],
      generatedAt,
      h3Resolution,
      knownAt,
      validAt,
      rejected: rejectionSummary([]),
      sourceAsOf: null,
    });
  }

  const rows = await executor.queryRows<GeoSnapshotRow>(GEO_SNAPSHOT_SQL, [knownAt, validAt]);
  const mapped = mapRows(rows);
  const features = mapped.accepted.map(({ feature }) => feature);
  const sourceAsOf =
    mapped.accepted
      .map(({ knownFrom }) => knownFrom)
      .sort(compareText)
      .at(-1) ?? null;
  let availability: GeoSnapshot['availability'];
  if (features.length === 0) availability = rows.length === 0 ? 'empty' : 'error';
  else if (mapped.rejected.count > 0) availability = 'partial';
  else if (sourceAsOf && knownAtDate.getTime() - new Date(sourceAsOf).getTime() > staleAfterMs) {
    availability = 'stale';
  } else availability = 'available';

  return sealSnapshot({
    availability,
    features,
    generatedAt,
    h3Resolution,
    knownAt,
    validAt,
    rejected: mapped.rejected,
    sourceAsOf,
  });
}

export async function getGeoMvtTile(
  executor: GeoSnapshotQueryExecutor,
  options: GetGeoMvtTileOptions,
): Promise<Uint8Array> {
  if (!/^geo_[0-9a-f]{24}$/.test(options.snapshotId)) {
    throw new Error('Geo MVT snapshot id is invalid');
  }
  if (!Number.isInteger(options.z) || options.z < 0 || options.z > 14) {
    throw new Error('Geo MVT zoom must be between 0 and 14');
  }
  const tileLimit = 2 ** options.z;
  if (
    !Number.isInteger(options.x) ||
    !Number.isInteger(options.y) ||
    options.x < 0 ||
    options.y < 0 ||
    options.x >= tileLimit ||
    options.y >= tileLimit
  ) {
    throw new Error('Geo MVT tile coordinate is invalid');
  }
  const knownAt = parseIso(options.knownAt);
  if (knownAt === undefined) throw new Error('Geo MVT knownAt is invalid');
  const validAt = parseIso(options.validAt);
  if (validAt === undefined) throw new Error('Geo MVT validAt is invalid');
  if (options.validAt.getTime() > options.knownAt.getTime()) {
    throw new Error('Geo MVT validAt must not follow knownAt');
  }
  const snapshot = await getGeoSnapshot(executor, {
    knownAt: options.knownAt,
    validAt: options.validAt,
    now: options.now ?? options.knownAt,
  });
  if (snapshot.snapshotId !== options.snapshotId || !snapshot.mvt.available) {
    throw new Error('Geo MVT snapshot mismatch');
  }
  const acceptedGeoEntityRevisionIds = snapshot.geojson.features.map((feature) => {
    const geoEntityRevisionId = feature.properties.evidenceLocator?.geoEntityRevisionId;
    if (geoEntityRevisionId === undefined) {
      throw new Error('Geo MVT snapshot evidence is incomplete');
    }
    return geoEntityRevisionId;
  });
  const acceptedSourceRevisionIds = snapshot.geojson.features.map((feature) => {
    const sourceRevisionId = feature.properties.evidenceLocator?.sourceRevisionId;
    if (sourceRevisionId === undefined) {
      throw new Error('Geo MVT snapshot evidence is incomplete');
    }
    return sourceRevisionId;
  });
  const rows = await executor.queryRows<{ tile: Uint8Array | null }>(GEO_MVT_SQL, [
    options.z,
    options.x,
    options.y,
    knownAt,
    validAt,
    snapshot.geojson.features.map((feature) => feature.properties.geoEntityKey),
    acceptedGeoEntityRevisionIds,
    acceptedSourceRevisionIds,
  ]);
  const tile = rows[0]?.tile;
  if (tile === null || tile === undefined) return new Uint8Array();
  if (!(tile instanceof Uint8Array)) throw new Error('Geo MVT tile payload is invalid');
  return tile;
}
