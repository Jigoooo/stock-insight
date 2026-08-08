import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import pg, { type PoolClient } from 'pg';

import {
  assignRevisions,
  buildDartFactPlan,
  checkParity,
  type DartFactContext,
  type GroupState,
  type MetricDefinitionRow,
  type NumericFactRow,
  type PlannedWrite,
  type Skip,
} from './dart-numeric-fact-plan.ts';
import { resolveDartAvailability, type DartStatementRow } from './dart-numeric-fact.ts';

/**
 * Fills world.numeric_fact and governance.metric_definition from the DART
 * filings already in ingestion.raw_object.
 *
 * WHY FROM RAW OBJECTS AND NOT FROM market.financial_fact. Both come from the
 * same endpoint, but market.financial_fact is a *folded* table: 256,024 statement
 * rows reduced to 12 normalised concepts, keyed by filing_ref with no cell
 * address, no dimensions and no restatement chain. canonical/11 §2 asks for a
 * comparable numeric fact plus a definition registry, and a registry cannot be
 * rebuilt from the folded side — which account became which concept is no longer
 * recorded there. So this reads the unfolded payload, and treats the folded table
 * as a parity check instead (see below).
 *
 * WHY THE PAYLOAD ROWS ARE THE TRUTH, NOT source_document_id. Raw objects are
 * content-addressed, so every "no data" response DART returns collapses into one
 * object: measured 2026-08-08, a single raw object carries 443 source_revisions
 * because 443 different (issuer, year, report) requests all returned status 013.
 * Reading the issuer from the document id would attribute all 443 to one company.
 * The statement rows carry corp_code themselves, so they decide.
 */

const JOB_NAME = 'stock-insight-dart-numeric-fact';
const DART_PROVIDER = 'opendart';
const PROFILE_PROVIDER = 'internal-company-profile-snapshot';

const FILINGS_SQL = `
SELECT sr.source_revision_id, sr.ingested_at, ro.object_uri, ro.source_document_id
  FROM ingestion.source_revision sr
  JOIN ingestion.raw_object ro ON ro.raw_object_id = sr.raw_object_id
  JOIN ingestion.source s ON s.source_id = ro.source_id
 WHERE s.provider_key = $1
 ORDER BY sr.source_revision_id
`;

const PROFILE_OBJECTS_SQL = `
SELECT ro.object_uri
  FROM ingestion.raw_object ro
  JOIN ingestion.source s ON s.source_id = ro.source_id
 WHERE s.provider_key = $1
`;

const ENTITY_BY_CORP_CODE_SQL = `
SELECT identifier_value AS corp_code, entity_id
  FROM core.entity_identifier
 WHERE identifier_type = 'DART_CORP_CODE'
`;

const EXISTING_FACTS_SQL = `
SELECT fact_key, restatement_group_key, revision_no, numeric_fact_id
  FROM world.numeric_fact
`;

const INSERT_DEFINITION_SQL = `
INSERT INTO governance.metric_definition (
  definition_key, revision_no, concept_namespace, concept_key, canonical_concept,
  display_name, definition_scope, issuer_entity_id, period_basis, accounting_basis,
  unit, currency, comparability_group_key, comparability_group_version,
  effective_from, created_by
) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
ON CONFLICT (definition_key, revision_no) DO NOTHING
`;

const INSERT_FACT_SQL = `
INSERT INTO world.numeric_fact (
  fact_key, revision_no, entity_id, concept_namespace, concept_key, value, unit,
  currency, scale_power, period_start, period_end, instant_at, fiscal_year,
  fiscal_quarter, dimensions_json, restatement_group_key,
  original_cell_or_xbrl_locator, source_revision_id, available_at, known_at,
  supersedes_numeric_fact_id, metadata
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
RETURNING numeric_fact_id
`;

/**
 * The concepts market.financial_fact already carries, and the DART account each
 * was folded from. Overlap with this set is what the parity check can compare.
 */
const PARITY_CONCEPTS_SQL = `
SELECT concept, dart_account_ids FROM market.financial_concept
 WHERE cardinality(dart_account_ids) > 0
`;

const PARITY_FACTS_SQL = `
SELECT issuer_entity_id, concept, to_char(period_end, 'YYYY-MM-DD') AS period_end, value
  FROM market.financial_fact
 WHERE source_provider = 'opendart' AND period_end IS NOT NULL
`;

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required for the DART numeric fact backfill');
  return url;
}

function bump(counts: Map<string, number>, reason: string, by = 1): void {
  counts.set(reason, (counts.get(reason) ?? 0) + by);
}

function sortedSkips(counts: Map<string, number>): Skip[] {
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
}

function readJsonFile(objectUri: string): unknown {
  // Raw objects are stored as file:// URIs on the pipeline host.
  return JSON.parse(readFileSync(fileURLToPath(objectUri), 'utf8'));
}

/**
 * corp_code to fiscal close month, taken from our own lineage stack rather than
 * public.company_profiles.
 *
 * The public table holds the same values, but `public` is not one of the schemas
 * this repository owns (docs/architecture/operations/database-ownership.md), and
 * the survey that opened K2 concluded that canonical tables must not be fed from
 * tables we do not own. The profile snapshots are raw objects with source
 * revisions, so they carry the lineage the numeric facts are supposed to inherit.
 * Measured 2026-08-08: 86 of 86 DART issuers resolve, every one closing in
 * December.
 */
async function loadFiscalMonths(client: PoolClient): Promise<Map<string, string>> {
  const { rows } = await client.query<{ object_uri: string }>(PROFILE_OBJECTS_SQL, [
    PROFILE_PROVIDER,
  ]);
  const months = new Map<string, string>();
  for (const row of rows) {
    let payload: { profile?: { corpCode?: string; fiscalMonth?: string } };
    try {
      payload = readJsonFile(row.object_uri) as typeof payload;
    } catch {
      continue;
    }
    const corpCode = payload.profile?.corpCode;
    const fiscalMonth = payload.profile?.fiscalMonth;
    if (corpCode && fiscalMonth) months.set(corpCode, fiscalMonth);
  }
  return months;
}

async function loadEntities(client: PoolClient): Promise<Map<string, number>> {
  const { rows } = await client.query<{ corp_code: string; entity_id: string }>(
    ENTITY_BY_CORP_CODE_SQL,
  );
  return new Map(rows.map((row) => [row.corp_code, Number(row.entity_id)]));
}

async function collectFacts(client: PoolClient): Promise<{
  facts: NumericFactRow[];
  definitions: MetricDefinitionRow[];
  skips: Skip[];
  filings: number;
  issuers: number;
}> {
  const [fiscalMonths, entities, filings] = await Promise.all([
    loadFiscalMonths(client),
    loadEntities(client),
    client.query<{
      source_revision_id: string;
      ingested_at: Date;
      object_uri: string;
      source_document_id: string;
    }>(FILINGS_SQL, [DART_PROVIDER]),
  ]);

  const counts = new Map<string, number>();
  const facts: NumericFactRow[] = [];
  const definitions = new Map<string, MetricDefinitionRow>();
  const payloadCache = new Map<string, DartStatementRow[] | null>();
  const issuers = new Set<string>();
  let withRows = 0;

  for (const filing of filings.rows) {
    let rows = payloadCache.get(filing.object_uri);
    if (rows === undefined) {
      try {
        const payload = readJsonFile(filing.object_uri) as {
          status?: string;
          list?: DartStatementRow[];
        };
        rows = payload.status === '000' && Array.isArray(payload.list) ? payload.list : null;
      } catch (error) {
        rows = null;
        bump(counts, `payload unreadable: ${(error as Error).message.slice(0, 60)}`);
      }
      payloadCache.set(filing.object_uri, rows);
    }
    if (!rows || rows.length === 0) {
      bump(counts, 'filing carries no statement rows');
      continue;
    }
    withRows += 1;

    // One response can in principle carry more than one issuer or receipt, and
    // both decide the context, so group before building.
    const byContext = new Map<
      string,
      { corpCode: string; receiptNo: string; rows: DartStatementRow[] }
    >();
    for (const row of rows) {
      const key = `${row.corp_code}|${row.rcept_no}`;
      const bucket = byContext.get(key);
      if (bucket) bucket.rows.push(row);
      // Both fields are optional on the payload type. An empty one is not
      // silently defaulted: an unknown corp_code fails the identity lookup and an
      // unparseable receipt fails the availability derivation, so either way the
      // rows are counted as skipped rather than attributed to a guess.
      else
        byContext.set(key, {
          corpCode: row.corp_code ?? '',
          receiptNo: row.rcept_no ?? '',
          rows: [row],
        });
    }

    for (const { corpCode, receiptNo, rows: group } of byContext.values()) {
      issuers.add(corpCode);

      const entityId = entities.get(corpCode);
      if (entityId === undefined) {
        bump(counts, 'issuer has no DART_CORP_CODE identity', group.length);
        continue;
      }

      const availability = resolveDartAvailability({
        receiptNo,
        ingestedAt: filing.ingested_at,
      });
      if ('refused' in availability) {
        bump(counts, availability.reason, group.length);
        continue;
      }

      const context: DartFactContext = {
        corpCode,
        entityId,
        fiscalMonth: fiscalMonths.get(corpCode) ?? null,
        sourceRevisionId: Number(filing.source_revision_id),
        availableAt: availability.availableAt,
        knownAt: availability.knownAt,
      };

      const plan = buildDartFactPlan(group, context);
      for (const skip of plan.skips) bump(counts, skip.reason, skip.count);
      for (const definition of plan.definitions) {
        if (!definitions.has(definition.definitionKey)) {
          definitions.set(definition.definitionKey, definition);
        }
      }
      for (const fact of plan.facts) {
        fact.metadata = {
          ...fact.metadata,
          receiptDate: availability.receiptDate,
          availableAtBound: availability.availableAtBound,
        };
        facts.push(fact);
      }
    }
  }

  return {
    facts,
    definitions: [...definitions.values()],
    skips: sortedSkips(counts),
    filings: withRows,
    issuers: issuers.size,
  };
}

async function loadExisting(client: PoolClient): Promise<{
  factKeys: Set<string>;
  groups: Map<string, GroupState>;
}> {
  const { rows } = await client.query<{
    fact_key: string;
    restatement_group_key: string;
    revision_no: number;
    numeric_fact_id: string;
  }>(EXISTING_FACTS_SQL);

  const factKeys = new Set<string>();
  const groups = new Map<string, GroupState>();
  for (const row of rows) {
    factKeys.add(row.fact_key);
    const state = groups.get(row.restatement_group_key);
    if (!state || row.revision_no > state.maxRevision) {
      groups.set(row.restatement_group_key, {
        maxRevision: row.revision_no,
        latestFactId: Number(row.numeric_fact_id),
      });
    }
  }
  return { factKeys, groups };
}

async function loadParityInputs(client: PoolClient): Promise<{
  conceptByAccount: Map<string, string>;
  theirs: Map<string, number>;
}> {
  const [concepts, existing] = await Promise.all([
    client.query<{ concept: string; dart_account_ids: string[] }>(PARITY_CONCEPTS_SQL),
    // period_end is read as text on purpose: a DATE arrives as a JS Date at
    // local midnight, and converting that back through toISOString() shifts the
    // day by one in any timezone east of UTC.
    client.query<{
      issuer_entity_id: string;
      concept: string;
      period_end: string;
      value: string;
    }>(PARITY_FACTS_SQL),
  ]);

  const conceptByAccount = new Map<string, string>();
  for (const row of concepts.rows) {
    for (const accountId of row.dart_account_ids) conceptByAccount.set(accountId, row.concept);
  }

  const theirs = new Map<string, number>();
  for (const row of existing.rows) {
    theirs.set(`${row.issuer_entity_id}|${row.concept}|${row.period_end}`, Number(row.value));
  }
  return { conceptByAccount, theirs };
}

async function writeDefinitions(
  client: PoolClient,
  definitions: readonly MetricDefinitionRow[],
): Promise<void> {
  for (const definition of definitions) {
    await client.query(INSERT_DEFINITION_SQL, [
      definition.definitionKey,
      definition.conceptNamespace,
      definition.conceptKey,
      definition.canonicalConcept,
      definition.displayName,
      definition.definitionScope,
      definition.issuerEntityId,
      definition.periodBasis,
      definition.accountingBasis,
      definition.unit,
      definition.currency,
      definition.comparabilityGroupKey,
      definition.comparabilityGroupVersion,
      definition.effectiveFrom,
      JOB_NAME,
    ]);
  }
}

async function writeFacts(
  client: PoolClient,
  writes: readonly PlannedWrite[],
  existingGroups: ReadonlyMap<string, GroupState>,
): Promise<number> {
  // A revision above 1 has to name the row it replaces. That row is either
  // already in the table from an earlier run or was inserted moments ago in this
  // one, so seed from the former and keep updating with the latter.
  const latestByGroup = new Map<string, number>();
  for (const [group, state] of existingGroups) {
    if (state.latestFactId !== null) latestByGroup.set(group, state.latestFactId);
  }
  let written = 0;

  for (const write of writes) {
    const { fact } = write;
    const supersedes = write.supersedesKey
      ? (latestByGroup.get(write.supersedesKey) ?? null)
      : null;
    if (write.revisionNo > 1 && supersedes === null) {
      throw new Error(
        `revision ${write.revisionNo} of ${fact.restatementGroupKey} has nothing to supersede`,
      );
    }

    const result = await client.query<{ numeric_fact_id: string }>(INSERT_FACT_SQL, [
      fact.factKey,
      write.revisionNo,
      fact.entityId,
      fact.conceptNamespace,
      fact.conceptKey,
      fact.value,
      fact.unit,
      fact.currency,
      fact.scalePower,
      fact.periodStart,
      fact.periodEnd,
      fact.instantAt,
      fact.fiscalYear,
      fact.fiscalQuarter,
      JSON.stringify(fact.dimensionsJson),
      fact.restatementGroupKey,
      JSON.stringify(fact.locator),
      fact.sourceRevisionId,
      fact.availableAt,
      fact.knownAt,
      supersedes,
      JSON.stringify(fact.metadata),
    ]);
    const inserted = result.rows[0];
    if (!inserted) throw new Error(`insert of ${fact.factKey} returned no id`);
    latestByGroup.set(fact.restatementGroupKey, Number(inserted.numeric_fact_id));
    written += 1;
  }

  return written;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: getDatabaseUrl(), max: 1 });
  const client = await pool.connect();

  try {
    const collected = await collectFacts(client);
    const existing = await loadExisting(client);
    const { writes, skips: revisionSkips } = assignRevisions(collected.facts, existing);
    const parityInputs = await loadParityInputs(client);
    const parity = checkParity(
      writes.map((write) => write.fact),
      parityInputs.conceptByAccount,
      parityInputs.theirs,
    );

    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : 'dry-run',
      filingsWithRows: collected.filings,
      issuers: collected.issuers,
      factsPlanned: collected.facts.length,
      factsToWrite: writes.length,
      restatements: writes.filter((write) => write.revisionNo > 1).length,
      definitions: collected.definitions.length,
      parity,
      skips: [...collected.skips, ...revisionSkips],
    };

    if (!apply) {
      console.log(JSON.stringify({ ...summary, hint: 'rerun with --apply' }, null, 2));
      return;
    }

    await client.query('BEGIN');
    try {
      await writeDefinitions(client, collected.definitions);
      const written = await writeFacts(client, writes, existing.groups);
      await client.query('COMMIT');
      console.log(JSON.stringify({ ...summary, factsWritten: written }, null, 2));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
