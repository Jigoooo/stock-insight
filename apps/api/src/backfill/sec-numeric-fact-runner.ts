import { createHash } from 'node:crypto';

import {
  assignRevisions,
  findSchemaViolations,
  type MetricDefinitionRow,
  type NumericFactRow,
  type PlannedWrite,
  type Skip,
} from './numeric-fact-plan.ts';
import {
  ensureMetricDefinitions,
  loadExistingNumericFactState,
  withNumericFactWriteTransaction,
  writeNumericFacts,
  type NumericFactQueryClient,
} from './numeric-fact-store.ts';
import {
  buildSecFactPlan,
  checkSecFinancialParity,
  type FoldedFinancialFact,
  type SecFinancialConceptMapping,
  type SecParityResult,
} from './sec-numeric-fact-plan.ts';
import {
  expandSecCompanyFacts,
  normalizeSecCik,
  validateSecSourceRevisionLineage,
  type SecCompanyFactsPayload,
} from './sec-numeric-fact.ts';
import { readRawObjectVerified } from '../ingest/raw-object-store.ts';

export type SecNumericFactMode = 'dry-run' | 'rehearse' | 'apply';
export type SecNumericFactArgs = {
  mode: SecNumericFactMode;
  limit: number;
  cik: string | null;
  sinceYear: number;
};
export type SecRawRevisionInput = {
  sourceId: number;
  sourceRevisionId: number;
  ingestedAt: string;
  sourceAvailableAt: string;
  definitionEffectiveFrom: string;
  contentHash: string;
  providerRecordKey: string;
  canonicalCik: string;
  entityId: number;
  payload: SecCompanyFactsPayload;
};

export type SecCanonicalPlan = {
  sourceId: number;
  definitionEffectiveFrom: string | null;
  rawRevisionCount: number;
  issuerCount: number;
  facts: NumericFactRow[];
  definitions: MetricDefinitionRow[];
  skips: Skip[];
  digest: string;
  rawInputs: Array<{ sourceRevisionId: number; contentHash: string }>;
};

export type SecNumericFactSummary = {
  mode: SecNumericFactMode;
  selection: { limit: number; cik: string | null; sinceYear: number };
  rawRevisions: number;
  issuers: number;
  factsPlanned: number;
  factsToWrite: number;
  restatements: number;
  definitions: number;
  definitionsInserted?: number;
  definitionsRolledBack?: number;
  skips: Skip[];
  schemaViolations: ReturnType<typeof findSchemaViolations>;
  parity: SecParityResult;
  digest: string;
  factsWritten?: number;
  factsRolledBack?: number;
  hint: string;
};

type RawReader = typeof readRawObjectVerified;

const SEC_RAW_REVISIONS_SQL = `
WITH selected_identity AS (
  SELECT sri.source_record_identity_id, sri.provider_record_key
    FROM ingestion.source_record_identity sri
    JOIN ingestion.source s ON s.source_id = sri.source_id
   WHERE s.provider_key = $1
     AND ($3::text IS NULL OR sri.provider_record_key = 'CIK' || $3)
   ORDER BY sri.provider_record_key
   LIMIT $2
)
SELECT s.source_id, s.created_at AS source_created_at,
       sr.source_revision_id, sr.ingested_at,
       sr.available_at AS source_available_at,
       ro.fetched_at AS raw_fetched_at,
       sr.content_hash AS source_revision_content_hash,
       ro.content_hash AS raw_object_content_hash,
       ro.object_uri, selected.provider_record_key,
       coalesce(array_agg(DISTINCT ident.identifier_value)
         FILTER (WHERE entity.entity_type = 'Company'), '{}') AS canonical_ciks,
       coalesce(array_agg(DISTINCT entity.entity_id::text)
         FILTER (WHERE entity.entity_type = 'Company'), '{}') AS company_entity_ids
  FROM selected_identity selected
  JOIN ingestion.source_revision sr ON sr.source_record_identity_id = selected.source_record_identity_id
  JOIN ingestion.raw_object ro ON ro.raw_object_id = sr.raw_object_id
  JOIN ingestion.source s ON s.source_id = ro.source_id AND s.provider_key = $1
  LEFT JOIN core.entity_identifier ident ON ident.identifier_type = 'CIK'
   AND lpad(ident.identifier_value, 10, '0') = substring(selected.provider_record_key FROM 4)
  LEFT JOIN core.entity entity ON entity.entity_id = ident.entity_id
 GROUP BY s.source_id, s.created_at, sr.source_revision_id, sr.ingested_at,
          sr.available_at, ro.fetched_at, sr.content_hash, ro.content_hash,
          ro.object_uri, selected.provider_record_key
 ORDER BY selected.provider_record_key, sr.source_revision_id
`;

function bump(counts: Map<string, number>, reason: string): void {
  counts.set(reason, (counts.get(reason) ?? 0) + 1);
}

function skips(counts: Map<string, number>): Skip[] {
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => a.reason.localeCompare(b.reason));
}

function values(argv: readonly string[], option: string): string[] {
  const found: string[] = [];

  argv.forEach((value, index) => {
    if (value === option) found.push(argv[index + 1] ?? '');
  });
  if (found.length > 1) throw new Error(`${option} may be supplied only once`);
  return found;
}

export function parseSecNumericFactArgs(argv: readonly string[]): SecNumericFactArgs {
  const known = new Set(['--apply', '--rehearse', '--limit', '--cik', '--since-year']);
  const valueOptions = new Set(['--limit', '--cik', '--since-year']);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!known.has(argument)) throw new Error(`unknown argument: ${argument}`);
    if (valueOptions.has(argument)) {
      if (index + 1 >= argv.length || argv[index + 1]!.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      index += 1;
    }
  }

  const apply = argv.includes('--apply');
  const rehearse = argv.includes('--rehearse');
  if (apply && rehearse) throw new Error('--apply and --rehearse are mutually exclusive');

  const limitRaw = values(argv, '--limit')[0];
  const limit = Number(limitRaw ?? 200);
  if (!Number.isInteger(limit) || limit <= 0 || limit > 10_000) {
    throw new Error('--limit must be a positive integer no greater than 10000');
  }

  const sinceRaw = values(argv, '--since-year')[0];
  const sinceYear = Number(sinceRaw ?? 2020);
  if (!Number.isInteger(sinceYear) || sinceYear < 1800 || sinceYear > 3000) {
    throw new Error('--since-year must be an integer between 1800 and 3000');
  }

  const cikRaw = values(argv, '--cik')[0];
  const cik = cikRaw === undefined ? null : normalizeSecCik(cikRaw);
  if (cikRaw !== undefined && cik === null) throw new Error('--cik must be a valid CIK (non-zero)');

  return {
    mode: apply ? 'apply' : rehearse ? 'rehearse' : 'dry-run',
    limit,
    cik,
    sinceYear,
  };
}

function parseProviderCik(providerRecordKey: string): string | null {
  const match = /^CIK(\d+)$/.exec(providerRecordKey);
  return match ? normalizeSecCik(match[1]) : null;
}

export async function loadSecRawRevisions(
  client: NumericFactQueryClient,
  selection: { limit: number; cik: string | null },
  readRawObject: RawReader = readRawObjectVerified,
): Promise<{ sourceId: number | null; revisions: SecRawRevisionInput[]; skips: Skip[] }> {
  const result = await client.query(SEC_RAW_REVISIONS_SQL, [
    'sec-edgar',
    selection.limit,
    selection.cik,
  ]);
  const revisions: SecRawRevisionInput[] = [];
  const counts = new Map<string, number>();
  let sourceId: number | null = null;
  let definitionEffectiveFrom: string | null = null;

  for (const row of result.rows) {
    const rowSourceId = Number(row.source_id);
    const sourceCreatedValue =
      row.source_created_at instanceof Date
        ? row.source_created_at.toISOString()
        : String(row.source_created_at);
    const sourceCreatedMillis = Date.parse(sourceCreatedValue);
    if (!Number.isInteger(rowSourceId) || rowSourceId <= 0) {
      throw new Error('sec-edgar source id is invalid');
    }
    if (!Number.isFinite(sourceCreatedMillis)) {
      throw new Error('sec-edgar source registration time is invalid');
    }
    const sourceCreatedAt = new Date(sourceCreatedMillis).toISOString();
    if (sourceId !== null && sourceId !== rowSourceId) {
      throw new Error('ambiguous sec-edgar source id');
    }
    if (definitionEffectiveFrom !== null && definitionEffectiveFrom !== sourceCreatedAt) {
      throw new Error('inconsistent sec-edgar source registration time');
    }
    sourceId = rowSourceId;
    definitionEffectiveFrom = sourceCreatedAt;

    const providerRecordKey = String(row.provider_record_key);
    const providerCik = parseProviderCik(providerRecordKey);
    const canonicalCiks = (row.canonical_ciks ?? []) as string[];
    const entityIds = (row.company_entity_ids ?? []) as string[];
    if (canonicalCiks.length === 0 || entityIds.length === 0) {
      bump(counts, `missing Company CIK for ${providerRecordKey}`);
      continue;
    }
    if (canonicalCiks.length !== 1 || entityIds.length !== 1) {
      throw new Error(`ambiguous Company CIK for ${providerRecordKey}`);
    }
    const canonicalCik = normalizeSecCik(canonicalCiks[0]);
    if (!providerCik || !canonicalCik || providerCik !== canonicalCik) {
      throw new Error(`provider record CIK does not match canonical CIK for ${providerRecordKey}`);
    }
    const sourceRevisionContentHash = String(row.source_revision_content_hash ?? '');
    const rawObjectContentHash = String(row.raw_object_content_hash ?? '');
    if (
      sourceRevisionContentHash === '' ||
      rawObjectContentHash === '' ||
      sourceRevisionContentHash !== rawObjectContentHash
    ) {
      throw new Error(
        `registered content hash disagreement for revision ${String(row.source_revision_id)}`,
      );
    }
    const sourceIngestedAt =
      row.ingested_at instanceof Date ? row.ingested_at.toISOString() : String(row.ingested_at);
    const sourceAvailableAt =
      row.source_available_at instanceof Date
        ? row.source_available_at.toISOString()
        : String(row.source_available_at);
    const rawFetchedAt =
      row.raw_fetched_at instanceof Date
        ? row.raw_fetched_at.toISOString()
        : String(row.raw_fetched_at);
    const sourceIngestedTime = Date.parse(sourceIngestedAt);
    const sourceAvailableTime = Date.parse(sourceAvailableAt);
    const rawFetchedTime = Date.parse(rawFetchedAt);
    if (
      !Number.isFinite(sourceIngestedTime) ||
      !Number.isFinite(sourceAvailableTime) ||
      !Number.isFinite(rawFetchedTime)
    ) {
      throw new Error('SEC collection timestamps must all be valid');
    }
    if (sourceAvailableTime !== rawFetchedTime) {
      throw new Error('source availability does not match raw fetch time');
    }
    const knownAt = new Date(Math.max(sourceIngestedTime, rawFetchedTime)).toISOString();
    if (Date.parse(sourceCreatedAt) > Date.parse(knownAt)) {
      throw new Error('sec-edgar source registration time is after source revision ingestedAt');
    }

    let body: Buffer;
    try {
      body = await readRawObject({
        objectUri: String(row.object_uri),
        contentHash: sourceRevisionContentHash,
      });
    } catch (error) {
      throw new Error(
        `raw object verification failed for revision ${String(row.source_revision_id)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let payload: SecCompanyFactsPayload;
    try {
      payload = JSON.parse(body.toString('utf8')) as SecCompanyFactsPayload;
    } catch {
      throw new Error(`raw object JSON invalid for revision ${String(row.source_revision_id)}`);
    }
    const payloadCik = normalizeSecCik(payload.cik);
    if (payloadCik !== canonicalCik) {
      throw new Error(`payload CIK does not match canonical CIK for ${providerRecordKey}`);
    }
    validateSecSourceRevisionLineage(payload, sourceAvailableAt, knownAt);
    revisions.push({
      sourceId: rowSourceId,
      sourceRevisionId: Number(row.source_revision_id),
      ingestedAt: knownAt,
      sourceAvailableAt,
      definitionEffectiveFrom: sourceCreatedAt,
      contentHash: sourceRevisionContentHash,
      providerRecordKey,
      canonicalCik,
      entityId: Number(entityIds[0]),
      payload,
    });
  }
  revisions.sort(
    (a, b) =>
      a.canonicalCik.localeCompare(b.canonicalCik) ||
      a.ingestedAt.localeCompare(b.ingestedAt) ||
      a.sourceRevisionId - b.sourceRevisionId ||
      a.contentHash.localeCompare(b.contentHash),
  );
  return { sourceId, revisions, skips: skips(counts) };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

/**
 * A value JSON.stringify would drop: object properties disappear, array slots
 * become null. Mirrored here so the streamed bytes match the old monolithic call.
 */
function isSerializable(value: unknown): boolean {
  return value !== undefined && typeof value !== 'function' && typeof value !== 'symbol';
}

/** A key JavaScript treats as an array index, and therefore lists before string keys. */
function isIntegerIndexKey(key: string): boolean {
  return /^(0|[1-9]\d*)$/.test(key) && Number(key) <= 4_294_967_294;
}

/**
 * Emits exactly the bytes `JSON.stringify(canonical(value))` would, one bounded
 * chunk at a time.
 *
 * This used to be a single `JSON.stringify` over the whole plan. On 2026-08-09 the
 * SEC backfill grew past Node's maximum string length, every market-enrichment run
 * died with `RangeError: Invalid string length`, and because the analytics pipeline
 * gates on that wrapper it stopped running for two days. Widening the batch would
 * have re-broken it later; not materialising the string cannot.
 *
 * The digest value must not move — `sec-numeric-fact-digest.test.ts` pins it against
 * the pre-rewrite implementation.
 */
export function writeCanonicalJson(value: unknown, write: (chunk: string) => void): void {
  if (Array.isArray(value)) {
    write('[');
    for (const [index, item] of value.entries()) {
      if (index > 0) write(',');
      if (isSerializable(item)) writeCanonicalJson(item, write);
      else write('null');
    }
    write(']');
    return;
  }
  if (value !== null && typeof value === 'object') {
    write('{');
    const sorted = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => isSerializable(item))
      .sort(([a], [b]) => a.localeCompare(b));
    // The old code rebuilt the sorted pairs with `Object.fromEntries`, and an object
    // literal always lists integer-like keys first in ascending numeric order however
    // they were inserted. Reproducing that re-ordering is what keeps the digest stable.
    const entries = [
      ...sorted.filter(([key]) => isIntegerIndexKey(key)).sort(([a], [b]) => Number(a) - Number(b)),
      ...sorted.filter(([key]) => !isIntegerIndexKey(key)),
    ];
    for (const [index, [key, item]] of entries.entries()) {
      if (index > 0) write(',');
      write(JSON.stringify(key));
      write(':');
      writeCanonicalJson(item, write);
    }
    write('}');
    return;
  }
  const text = JSON.stringify(value);
  write(text === undefined ? 'null' : text);
}

export function canonicalDigest(value: unknown): string {
  const hash = createHash('sha256');
  writeCanonicalJson(value, (chunk) => hash.update(chunk, 'utf8'));
  return hash.digest('hex');
}

function digest(value: unknown): string {
  return canonicalDigest(value);
}

function mergeSkips(values: readonly Skip[]): Skip[] {
  const counts = new Map<string, number>();
  for (const skip of values) counts.set(skip.reason, (counts.get(skip.reason) ?? 0) + skip.count);
  return skips(counts);
}

export function buildSecCanonicalPlan(
  revisions: readonly SecRawRevisionInput[],
  selection: { limit: number; cik: string | null; sinceYear: number },
): SecCanonicalPlan {
  const ordered = [...revisions].sort(
    (a, b) =>
      a.ingestedAt.localeCompare(b.ingestedAt) ||
      a.sourceRevisionId - b.sourceRevisionId ||
      a.contentHash.localeCompare(b.contentHash),
  );
  const sourceIds = new Set(ordered.map((revision) => revision.sourceId));
  if (sourceIds.size > 1) throw new Error('SEC plan spans multiple source ids');
  const sourceId = ordered[0]?.sourceId ?? 0;
  if (ordered.length === 0) {
    const rawInputs: Array<{ sourceRevisionId: number; contentHash: string }> = [];
    return {
      sourceId,
      definitionEffectiveFrom: null,
      rawRevisionCount: 0,
      issuerCount: 0,
      facts: [],
      definitions: [],
      skips: [],
      digest: digest({
        selection,
        definitionEffectiveFrom: null,
        rawInputs,
        facts: [],
        definitions: [],
      }),
      rawInputs,
    };
  }
  const effectiveTimes = new Set(ordered.map((revision) => revision.definitionEffectiveFrom));
  if (effectiveTimes.size > 1) throw new Error('SEC plan spans multiple source registration times');
  const definitionEffectiveFrom = ordered[0]?.definitionEffectiveFrom;
  if (!definitionEffectiveFrom || !Number.isFinite(Date.parse(definitionEffectiveFrom))) {
    throw new Error('SEC plan has no valid source registration time');
  }
  const draftByFactKey = new Map<
    string,
    ReturnType<typeof expandSecCompanyFacts>['drafts'][number]
  >();
  const allSkips: Skip[] = [];

  for (const revision of ordered) {
    const expanded = expandSecCompanyFacts(revision.payload, {
      canonicalCik: revision.canonicalCik,
      entityId: revision.entityId,
      sourceRevisionId: revision.sourceRevisionId,
      ingestedAt: revision.ingestedAt,
      sinceYear: selection.sinceYear,
      sourceAvailableAt: revision.sourceAvailableAt,
      sourceRevisionContentHash: revision.contentHash,
    });
    allSkips.push(...expanded.skips);
    for (const draft of expanded.drafts) {
      if (!draftByFactKey.has(draft.factKey)) draftByFactKey.set(draft.factKey, draft);
    }
  }
  const planned = buildSecFactPlan([...draftByFactKey.values()], {
    sourceId,
    definitionEffectiveFrom,
  });
  const rawInputs = ordered.map(({ sourceRevisionId, contentHash }) => ({
    sourceRevisionId,
    contentHash,
  }));
  const planDigest = digest({
    selection,
    definitionEffectiveFrom,
    rawInputs,
    facts: planned.facts
      .map((fact) => ({ ...fact, metadata: canonical(fact.metadata) }))
      .sort((a, b) => a.factKey.localeCompare(b.factKey)),
    definitions: [...planned.definitions].sort((a, b) =>
      a.definitionKey.localeCompare(b.definitionKey),
    ),
  });
  return {
    sourceId,
    definitionEffectiveFrom,
    rawRevisionCount: ordered.length,
    issuerCount: new Set(ordered.map((revision) => revision.entityId)).size,
    facts: planned.facts,
    definitions: planned.definitions,
    skips: mergeSkips([...allSkips, ...planned.skips]),
    digest: planDigest,
    rawInputs,
  };
}

const PARITY_CONCEPTS_SQL = `
SELECT concept, us_gaap_tags, unit_class
  FROM market.financial_concept
 WHERE cardinality(us_gaap_tags) > 0
`;
const PARITY_FACTS_SQL = `
SELECT issuer_entity_id AS entity_id, concept, value::text AS value, unit,
       currency, period_start::text AS period_start, period_end::text AS period_end,
       fiscal_period, filing_ref
  FROM market.financial_fact
 WHERE issuer_entity_id = ANY($1::bigint[])
   AND source_provider = 'sec-companyfacts'
`;

export async function loadSecParityDiagnostics(
  client: NumericFactQueryClient,
  facts: readonly NumericFactRow[],
): Promise<SecParityResult> {
  if (facts.length === 0) {
    return { comparable: 0, agreed: 0, disagreed: 0, excluded: 0, disagreementSamples: [] };
  }
  const concepts = await client.query(PARITY_CONCEPTS_SQL);
  const folded = await client.query(PARITY_FACTS_SQL, [
    [...new Set(facts.map((fact) => fact.entityId))].sort((a, b) => a - b),
  ]);
  const mappings: SecFinancialConceptMapping[] = concepts.rows.map((row) => ({
    concept: String(row.concept),
    usGaapTags: (row.us_gaap_tags ?? []) as string[],
    unitClass: String(row.unit_class) as SecFinancialConceptMapping['unitClass'],
  }));
  const foldedFacts: FoldedFinancialFact[] = folded.rows.map((row) => ({
    entityId: Number(row.entity_id),
    concept: String(row.concept),
    value: Number(row.value),
    unit: String(row.unit),
    currency: row.currency == null ? null : String(row.currency),
    periodStart: row.period_start == null ? null : String(row.period_start),
    periodEnd: String(row.period_end),
    fiscalPeriod: row.fiscal_period == null ? null : String(row.fiscal_period),
    filingRef: String(row.filing_ref),
  }));
  return checkSecFinancialParity(facts, foldedFacts, mappings);
}

function assignmentDigest(planDigest: string, writes: readonly PlannedWrite[]): string {
  return digest({
    planDigest,
    writes: writes.map((write) => ({
      factKey: write.fact.factKey,
      revisionNo: write.revisionNo,
      supersedesFactKey: write.supersedesFactKey,
      supersedesNumericFactId: write.supersedesNumericFactId,
    })),
  });
}

export async function executeSecNumericFactJob(options: {
  client: NumericFactQueryClient;
  args: SecNumericFactArgs;
  readRawObject?: RawReader;
}): Promise<SecNumericFactSummary> {
  const raw = await loadSecRawRevisions(
    options.client,
    { limit: options.args.limit, cik: options.args.cik },
    options.readRawObject,
  );
  const plan = buildSecCanonicalPlan(raw.revisions, options.args);
  const entityIds = [...new Set(plan.facts.map((fact) => fact.entityId))].sort((a, b) => a - b);
  const initialExisting = await loadExistingNumericFactState(options.client, {
    entityIds,
    factKeyPrefix: 'sec:%',
    sourceProvider: 'sec-edgar',
  });
  const initialAssignment = assignRevisions(plan.facts, initialExisting);
  const parity = await loadSecParityDiagnostics(options.client, plan.facts);
  let writes = initialAssignment.writes;
  let revisionSkips = initialAssignment.skips;
  let violations = findSchemaViolations(
    writes.map((write) => write.fact),
    plan.definitions,
  );
  let definitionsInserted = 0;
  let factsWritten = 0;
  let runDigest = assignmentDigest(plan.digest, writes);

  if (options.args.mode !== 'dry-run') {
    await withNumericFactWriteTransaction(
      options.client,
      { mode: options.args.mode, advisoryLockKey: 'sec-edgar:numeric-fact' },
      async () => {
        const lockedExisting = await loadExistingNumericFactState(options.client, {
          entityIds,
          factKeyPrefix: 'sec:%',
          sourceProvider: 'sec-edgar',
        });
        const lockedAssignment = assignRevisions(plan.facts, lockedExisting);
        writes = lockedAssignment.writes;
        revisionSkips = lockedAssignment.skips;
        runDigest = assignmentDigest(plan.digest, writes);
        violations = findSchemaViolations(
          writes.map((write) => write.fact),
          plan.definitions,
        );
        if (violations.length > 0) {
          throw new Error(`refusing numeric-fact write: ${JSON.stringify(violations)}`);
        }
        const definitionKeys = new Set(plan.definitions.map((item) => item.definitionKey));
        const missing = writes.find((write) => !definitionKeys.has(write.fact.definitionKey));
        if (missing)
          throw new Error(
            `planned fact references missing definition ${missing.fact.definitionKey}`,
          );
        definitionsInserted = await ensureMetricDefinitions(options.client, plan.definitions, {
          createdBy: 'stock-insight-sec-numeric-fact',
        });
        factsWritten = await writeNumericFacts(options.client, writes, lockedExisting.groups);
      },
    );
  }

  const combinedSkips = mergeSkips([...raw.skips, ...plan.skips, ...revisionSkips]);
  return {
    mode: options.args.mode,
    selection: {
      limit: options.args.limit,
      cik: options.args.cik,
      sinceYear: options.args.sinceYear,
    },
    rawRevisions: plan.rawRevisionCount,
    issuers: plan.issuerCount,
    factsPlanned: plan.facts.length,
    factsToWrite: writes.length,
    restatements: writes.filter((write) => write.revisionNo > 1).length,
    definitions: plan.definitions.length,
    ...(options.args.mode === 'apply'
      ? { definitionsInserted }
      : options.args.mode === 'rehearse'
        ? { definitionsRolledBack: definitionsInserted }
        : {}),
    skips: combinedSkips,
    schemaViolations: violations,
    parity,
    digest: runDigest,
    ...(options.args.mode === 'apply'
      ? { factsWritten }
      : options.args.mode === 'rehearse'
        ? { factsRolledBack: factsWritten }
        : {}),
    hint:
      options.args.mode === 'dry-run'
        ? 'rerun with --rehearse, then --apply'
        : options.args.mode === 'rehearse'
          ? 'rehearsal rolled back; rerun with --apply to commit'
          : 'apply committed',
  };
}
