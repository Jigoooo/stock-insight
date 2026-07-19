import { createHash } from 'node:crypto';

// B8 — canonical content pack builder (master plan §8 B8).
// A pack is the serving artifact for one entity × pack kind × SEALED graph
// snapshot × builder version. Items carry exactly ONE typed evidence anchor
// (relation revision / evidence ledger / impact path / measurement) matching
// their kind — no free-floating JSON facts. Digest is deterministic and
// input-order-insensitive; freshness derives from build time.

export type ContentPackKind = 'entity_relation_graph' | 'entity_evidence_digest' | 'impact_brief';

export type ContentPackItemKind = 'relation' | 'evidence' | 'impact_path' | 'measurement';

export type ContentPackSourceItem = {
  itemKind: ContentPackItemKind;
  relationRevisionId?: number;
  relationEvidenceLedgerId?: number;
  impactPathV2Id?: number;
  relationMeasurementId?: number;
  displayPayload: Record<string, unknown>;
  /** Ranking weight within the pack; higher serves first. */
  rank: number;
};

export type ContentPackItem = {
  itemNo: number;
  itemKind: ContentPackItemKind;
  relationRevisionId: number | null;
  relationEvidenceLedgerId: number | null;
  impactPathV2Id: number | null;
  relationMeasurementId: number | null;
  displayPayload: Record<string, unknown>;
};

export type ContentPackBuildOptions = {
  packKind: ContentPackKind;
  entityId: number;
  graphSnapshotId: number;
  snapshotStatus: 'building' | 'sealed' | 'superseded' | 'failed';
  builderVersion: string;
  freshnessHours: number;
  maxItems: number;
  now: Date;
};

export type ContentPackDraft = {
  packKind: ContentPackKind;
  entityId: number;
  graphSnapshotId: number;
  builderVersion: string;
  packDigest: string;
  itemCount: number;
  builtAt: string;
  freshUntil: string;
  items: ContentPackItem[];
};

const ANCHOR_FIELDS = [
  'relationRevisionId',
  'relationEvidenceLedgerId',
  'impactPathV2Id',
  'relationMeasurementId',
] as const;

const KIND_TO_ANCHOR: Record<ContentPackItemKind, (typeof ANCHOR_FIELDS)[number]> = {
  relation: 'relationRevisionId',
  evidence: 'relationEvidenceLedgerId',
  impact_path: 'impactPathV2Id',
  measurement: 'relationMeasurementId',
};

const compareUtf8 = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

type CanonicalJsonSnapshot = { value: unknown; text: string };

function assertWellFormedUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error(`${path} must not contain an unpaired surrogate`);
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error(`${path} must not contain an unpaired surrogate`);
    }
  }
}

function canonicalJsonSnapshot(
  value: unknown,
  path = 'content pack payload',
  ancestors = new WeakSet<object>(),
): CanonicalJsonSnapshot {
  if (value === null) return { value: null, text: 'null' };
  if (typeof value === 'string') {
    assertWellFormedUnicode(value, path);
    return { value, text: JSON.stringify(value) };
  }
  if (typeof value === 'boolean') return { value, text: value ? 'true' : 'false' };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite numbers`);
    return { value, text: JSON.stringify(value) };
  }
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error(`${path} must not contain symbol keys`);
    }
    for (const key of Object.getOwnPropertyNames(value)) {
      if (key === 'length') continue;
      if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
        throw new Error(`${path} must not contain non-index array keys`);
      }
    }
    if (ancestors.has(value)) throw new Error(`${path} must not contain cyclic references`);
    ancestors.add(value);
    try {
      const entries = Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor) throw new Error(`${path} must not contain sparse array holes`);
        if (!('value' in descriptor)) throw new Error(`${path}[${index}] must not be an accessor`);
        return canonicalJsonSnapshot(descriptor.value, `${path}[${index}]`, ancestors);
      });
      const clone = entries.map((entry) => entry.value);
      Object.setPrototypeOf(clone, null);
      return {
        value: Object.freeze(clone),
        text: `[${entries.map((entry) => entry.text).join(',')}]`,
      };
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} must contain only plain JSON objects`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error(`${path} must not contain symbol keys`);
    }
    if (Object.getOwnPropertyNames(value).length !== Object.keys(value).length) {
      throw new Error(`${path} must not contain non-enumerable keys`);
    }
    if (ancestors.has(value)) throw new Error(`${path} must not contain cyclic references`);
    ancestors.add(value);
    try {
      const canonical = Object.create(null) as Record<string, unknown>;
      const tokens: string[] = [];
      const keys = Object.keys(value);
      for (const key of keys) assertWellFormedUnicode(key, `${path} key`);
      for (const key of keys.sort(compareUtf8)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!('value' in descriptor)) throw new Error(`${path}.${key} must not be an accessor`);
        if (descriptor.value === undefined) throw new Error(`${path}.${key} must not be undefined`);
        const nested = canonicalJsonSnapshot(descriptor.value, `${path}.${key}`, ancestors);
        canonical[key] = nested.value;
        tokens.push(`${JSON.stringify(key)}:${nested.text}`);
      }
      return { value: Object.freeze(canonical), text: `{${tokens.join(',')}}` };
    } finally {
      ancestors.delete(value);
    }
  }
  throw new Error(`${path} must contain only JSON values`);
}

function snapshotOwnDataObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path} must not use an inherited prototype`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${path} must not contain symbol keys`);
  }
  if (Object.getOwnPropertyNames(value).length !== Object.keys(value).length) {
    throw new Error(`${path} must not contain non-enumerable keys`);
  }
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor)) throw new Error(`${path}.${key} must not be an accessor`);
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function snapshotOwnDataArray(value: readonly unknown[], path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${path} must not contain symbol keys`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'length') continue;
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      throw new Error(`${path} must not contain non-index array keys`);
    }
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor) throw new Error(`${path} must not contain sparse array holes`);
    if (!('value' in descriptor)) throw new Error(`${path}[${index}] must not be an accessor`);
    return descriptor.value;
  });
}

function anchorOf(item: ContentPackSourceItem): { field: string; value: number } {
  const present = ANCHOR_FIELDS.filter(
    (field) => item[field] !== undefined && item[field] !== null,
  );
  if (present.length !== 1) {
    throw new Error(
      `content pack item must carry exactly one typed evidence anchor, got ${present.length}`,
    );
  }
  const field = present[0]!;
  if (KIND_TO_ANCHOR[item.itemKind] !== field) {
    throw new Error(`content pack item anchor ${field} does not match item kind ${item.itemKind}`);
  }
  const value = item[field]!;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`content pack anchor ${field} must be a positive integer`);
  }
  return { field, value };
}

export function buildContentPack(
  sourceItems: readonly ContentPackSourceItem[],
  options: ContentPackBuildOptions,
): ContentPackDraft {
  const optionValues = snapshotOwnDataObject(options, 'content pack options');
  const safeOptions = {
    packKind: optionValues.packKind,
    entityId: optionValues.entityId,
    graphSnapshotId: optionValues.graphSnapshotId,
    snapshotStatus: optionValues.snapshotStatus,
    builderVersion: optionValues.builderVersion,
    freshnessHours: optionValues.freshnessHours,
    maxItems: optionValues.maxItems,
    now: optionValues.now,
  };
  if (
    safeOptions.packKind !== 'entity_relation_graph' &&
    safeOptions.packKind !== 'entity_evidence_digest' &&
    safeOptions.packKind !== 'impact_brief'
  ) {
    throw new Error('packKind is invalid');
  }
  if (safeOptions.snapshotStatus !== 'sealed') {
    throw new Error('content packs may only be built on a sealed graph snapshot');
  }
  if (!Number.isSafeInteger(safeOptions.entityId) || (safeOptions.entityId as number) <= 0) {
    throw new Error('entityId must be a positive integer');
  }
  if (
    !Number.isSafeInteger(safeOptions.graphSnapshotId) ||
    (safeOptions.graphSnapshotId as number) <= 0
  ) {
    throw new Error('graphSnapshotId must be a positive integer');
  }
  if (
    typeof safeOptions.freshnessHours !== 'number' ||
    !Number.isFinite(safeOptions.freshnessHours) ||
    safeOptions.freshnessHours <= 0
  ) {
    throw new Error('freshnessHours must be positive');
  }
  if (!Number.isSafeInteger(safeOptions.maxItems) || (safeOptions.maxItems as number) < 1) {
    throw new Error('maxItems must be a positive integer');
  }
  if (typeof safeOptions.builderVersion !== 'string' || !safeOptions.builderVersion.trim()) {
    throw new Error('builderVersion is required');
  }
  if (!(safeOptions.now instanceof Date) || Number.isNaN(safeOptions.now.getTime())) {
    throw new Error('now must be a valid Date');
  }
  const buildTime = new Date(safeOptions.now.getTime());

  const safeSourceItems = snapshotOwnDataArray(sourceItems, 'content pack source items').map(
    (rawItem, index): ContentPackSourceItem => {
      const item = snapshotOwnDataObject(rawItem, `content pack source item ${index}`);
      if (
        item.itemKind !== 'relation' &&
        item.itemKind !== 'evidence' &&
        item.itemKind !== 'impact_path' &&
        item.itemKind !== 'measurement'
      ) {
        throw new Error('content pack item kind is invalid');
      }
      if (typeof item.rank !== 'number' || !Number.isFinite(item.rank)) {
        throw new Error('rank must be finite');
      }
      const display = canonicalJsonSnapshot(
        item.displayPayload,
        `content pack source item ${index}.displayPayload`,
      ).value;
      if (display === null || typeof display !== 'object' || Array.isArray(display)) {
        throw new Error('displayPayload must be a JSON object');
      }
      return Object.freeze({
        itemKind: item.itemKind,
        relationRevisionId: item.relationRevisionId as number | undefined,
        relationEvidenceLedgerId: item.relationEvidenceLedgerId as number | undefined,
        impactPathV2Id: item.impactPathV2Id as number | undefined,
        relationMeasurementId: item.relationMeasurementId as number | undefined,
        displayPayload: display as Record<string, unknown>,
        rank: item.rank,
      });
    },
  );

  // Validate anchors and reject duplicates.
  const seenAnchors = new Set<string>();
  for (const item of safeSourceItems) {
    const anchor = anchorOf(item);
    const key = `${anchor.field}:${anchor.value}`;
    if (seenAnchors.has(key)) {
      throw new Error(`duplicate content pack anchor: ${key}`);
    }
    seenAnchors.add(key);
  }

  // Deterministic ordering: rank desc, then anchor field/value for ties.
  const ordered = [...safeSourceItems]
    .sort((a, b) => {
      const anchorA = anchorOf(a);
      const anchorB = anchorOf(b);
      return (
        b.rank - a.rank ||
        compareUtf8(anchorA.field, anchorB.field) ||
        anchorA.value - anchorB.value
      );
    })
    .slice(0, safeOptions.maxItems as number);

  const items: ContentPackItem[] = ordered.map((item, index) =>
    Object.freeze({
      itemNo: index + 1,
      itemKind: item.itemKind,
      relationRevisionId: item.relationRevisionId ?? null,
      relationEvidenceLedgerId: item.relationEvidenceLedgerId ?? null,
      impactPathV2Id: item.impactPathV2Id ?? null,
      relationMeasurementId: item.relationMeasurementId ?? null,
      displayPayload: item.displayPayload,
    }),
  );

  const digestPayload = canonicalJsonSnapshot({
    packKind: safeOptions.packKind,
    entityId: safeOptions.entityId,
    graphSnapshotId: safeOptions.graphSnapshotId,
    builderVersion: safeOptions.builderVersion,
    items: items.map((item) => [
      item.itemNo,
      item.itemKind,
      item.relationRevisionId,
      item.relationEvidenceLedgerId,
      item.impactPathV2Id,
      item.relationMeasurementId,
      item.displayPayload,
    ]),
  });
  const packDigest = createHash('sha256').update(digestPayload.text).digest('hex');

  const builtAt = buildTime.toISOString();
  const freshUntil = new Date(
    buildTime.getTime() + safeOptions.freshnessHours * 3600 * 1000,
  ).toISOString();
  Object.defineProperty(items, 'toJSON', { value: undefined, enumerable: false });
  Object.freeze(items);

  return Object.freeze({
    packKind: safeOptions.packKind,
    entityId: safeOptions.entityId as number,
    graphSnapshotId: safeOptions.graphSnapshotId as number,
    builderVersion: safeOptions.builderVersion,
    packDigest,
    itemCount: items.length,
    builtAt,
    freshUntil,
    items,
  });
}
