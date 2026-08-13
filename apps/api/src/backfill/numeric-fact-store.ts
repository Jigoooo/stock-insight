import {
  immutableClaimStructure,
  numericFactSemanticFingerprint,
  type ExistingNumericFactState,
  type GroupState,
  type MetricDefinitionRow,
  type NumericFactRow,
  type PlannedWrite,
} from './numeric-fact-plan.ts';

export type NumericFactQueryClient = {
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

export type WriteMode = 'apply' | 'rehearse';

export async function withNumericFactWriteTransaction<T>(
  client: NumericFactQueryClient,
  options: { mode: WriteMode; advisoryLockKey: string },
  operation: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      options.advisoryLockKey,
    ]);
    const result = await operation();
    await client.query(options.mode === 'apply' ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

const EXISTING_FACTS_SQL = `
SELECT fact.fact_key AS fact_key,
       fact.restatement_group_key AS restatement_group_key,
       fact.revision_no AS revision_no,
       fact.numeric_fact_id AS numeric_fact_id,
       fact.entity_id AS entity_id,
       fact.concept_namespace AS concept_namespace,
       fact.concept_key AS concept_key,
       fact.value::text AS value,
       fact.unit AS unit,
       fact.currency AS currency,
       fact.scale_power AS scale_power,
       fact.period_start::text AS period_start,
       fact.period_end::text AS period_end,
       fact.instant_at AS instant_at,
       fact.fiscal_year AS fiscal_year,
       fact.fiscal_quarter AS fiscal_quarter,
       fact.dimensions_json AS dimensions_json,
       fact.source_revision_id AS source_revision_id,
       fact.available_at AS available_at,
       fact.known_at AS known_at,
       fact.original_cell_or_xbrl_locator AS original_cell_or_xbrl_locator,
       fact.metadata AS metadata
  FROM world.numeric_fact AS fact
  JOIN ingestion.source_revision AS revision
    ON revision.source_revision_id = fact.source_revision_id
  JOIN ingestion.source_record_identity AS identity
    ON identity.source_record_identity_id = revision.source_record_identity_id
  JOIN ingestion.source AS source ON source.source_id = identity.source_id
 WHERE fact.entity_id = ANY($1::bigint[])
   AND fact.fact_key LIKE $2
   AND source.provider_key = $3
   -- NULL 은 '제한하지 않음' 이다. 그런데 x = ANY(NULL) 은 참이 아니라 NULL 을
   -- 돌려주므로, IS NULL 분기 없이 쓰면 생략 경로가 전량이 아니라 **전무**가
   -- 된다 — 조용히 0행이 되고 모든 사실이 리비전 1 로 다시 쓰인다.
   --
   -- 이 SQL 은 통째로 템플릿 리터럴 하나다. 주석 안이라도 역따옴표를 쓰면
   -- 리터럴이 그 자리에서 끊긴다. 2026-08-12 부터 이걸로 다섯 번 죽였다.
   AND ($4::text[] IS NULL OR fact.restatement_group_key = ANY($4::text[]))
 ORDER BY fact.restatement_group_key, fact.revision_no, fact.numeric_fact_id
`;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function rowToFact(row: Record<string, unknown>): NumericFactRow {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    factKey: String(row.fact_key),
    restatementGroupKey: String(row.restatement_group_key),
    entityId: Number(row.entity_id),
    conceptNamespace: String(row.concept_namespace),
    conceptKey: String(row.concept_key),
    value: Number(row.value),
    unit: String(row.unit),
    currency: nullableText(row.currency),
    scalePower: Number(row.scale_power),
    periodStart: nullableText(row.period_start),
    periodEnd: nullableText(row.period_end),
    instantAt: row.instant_at == null ? null : iso(row.instant_at),
    fiscalYear: row.fiscal_year == null ? null : Number(row.fiscal_year),
    fiscalQuarter: row.fiscal_quarter == null ? null : Number(row.fiscal_quarter),
    dimensionsJson: (row.dimensions_json ?? {}) as Record<string, string>,
    locator: (row.original_cell_or_xbrl_locator ?? {}) as Record<string, unknown>,
    sourceRevisionId: Number(row.source_revision_id),
    availableAt: iso(row.available_at),
    knownAt: iso(row.known_at),
    metadata,
    definitionKey:
      typeof metadata.metricDefinitionKey === 'string' ? metadata.metricDefinitionKey : '',
  };
}

/**
 * **이 배치가 건드리는 리스테이트먼트 그룹만 읽는다.**
 *
 * 원래 조건은 엔티티 + 접두사뿐이었다. SEC 쪽 실측(2026-08-13)에서 그 뜻은
 * "사실 556,285행 · 그룹 538,070개 · 메타데이터 305MB 를 통째로 자바스크립트
 * 객체로 올린다" 였다 — 엔티티가 124개뿐이라 어떤 배치를 돌려도 전량이었다.
 * 로더 하나가 힙 **1,471MB** 를 썼고, 그 위에 계획이 얹히면서
 * `run-sec-numeric-fact.ts` 가 OOM 으로 죽었다(exit 134). 그 잡이
 * `market-enrichment-wrapper` 를 죽이고, 그것이 analytics 입력 게이트를 막고,
 * 발행이 멈추고, today 화면이 비었다 — dart 쪽과 **같은 사슬의 두 번째 고리**다.
 *
 * 소비자가 실제로 필요로 하는 것은 전량이 아니다. `assignRevisions` 는
 * 배치에 있는 fact key 의 존재 여부와 배치에 있는 그룹의 최신 리비전만 본다.
 * 나머지 53만 그룹은 읽어서 버린다.
 *
 * 그래서 그룹 키를 인자로 받는다. 넘기지 않으면 예전처럼 전량을 읽으므로
 * **조용히 좁아지지 않는다** — 좁히는 쪽이 명시적으로 좁힌다.
 */
export async function loadExistingNumericFactState(
  client: NumericFactQueryClient,
  scope: {
    entityIds: readonly number[];
    factKeyPrefix: string;
    sourceProvider: string;
    /** 이 배치가 건드리는 그룹. 생략하면 전량(옛 동작). */
    restatementGroupKeys?: readonly string[];
  },
): Promise<ExistingNumericFactState> {
  if (scope.entityIds.length === 0) return { factKeys: new Set(), groups: new Map() };
  // 빈 배열은 "그룹이 없다" 이지 "제한하지 않는다" 가 아니다. 그 둘을 섞으면
  // 계획이 비었을 때 전량을 읽는다.
  if (scope.restatementGroupKeys?.length === 0) {
    return { factKeys: new Set(), groups: new Map() };
  }
  const result = await client.query(EXISTING_FACTS_SQL, [
    scope.entityIds,
    scope.factKeyPrefix,
    scope.sourceProvider,
    scope.restatementGroupKeys ?? null,
  ]);
  const factKeys = new Set<string>();
  const factIdsByGroup = new Map<string, Map<string, number>>();
  const groups = new Map<string, GroupState>();

  for (const row of result.rows) {
    const fact = rowToFact(row);
    const revisionNo = Number(row.revision_no);
    const factId = Number(row.numeric_fact_id);
    factKeys.add(fact.factKey);
    let ids = factIdsByGroup.get(fact.restatementGroupKey);
    if (!ids) {
      ids = new Map();
      factIdsByGroup.set(fact.restatementGroupKey, ids);
    }
    ids.set(fact.factKey, factId);
    const current = groups.get(fact.restatementGroupKey);
    if (!current || revisionNo > current.maxRevision) {
      groups.set(fact.restatementGroupKey, {
        maxRevision: revisionNo,
        latestFactId: factId,
        latestFactKey: fact.factKey,
        factIdsByKey: ids,
        latestSemanticFingerprint: numericFactSemanticFingerprint(fact),
        // 리비전 사슬 구조 검사가 비교할 대상. 이걸 싣지 않으면
        // findRevisionStructureViolations 가 조용히 아무것도 못 잡는다.
        latestStructure: immutableClaimStructure(fact),
      });
    }
  }
  return { factKeys, groups };
}

type DefinitionDbRow = Record<string, unknown>;

const DEFINITION_SELECT_SQL = `
SELECT definition_key, revision_no, concept_namespace, concept_key,
       canonical_concept, display_name, definition_scope, issuer_entity_id,
       source_id, period_basis,
       accounting_basis, unit, currency, comparability_group_key,
       comparability_group_version, effective_from, numerator_description,
       denominator_description, inclusions, exclusions, scale_power,
       supersedes_metric_definition_id, definition_state, effective_to, notes
  FROM governance.metric_definition
 WHERE revision_no = 1 AND definition_key = ANY($1::text[])
`;

/** Case-folded the same way the definition key is, so the two cannot disagree. */
function foldedUnit(value: unknown): string | null {
  return value == null ? null : String(value).toLowerCase();
}

function definitionMismatch(
  planned: MetricDefinitionRow,
  existing: DefinitionDbRow,
): string | null {
  const normalizeTimestamp = (value: unknown): string => {
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.valueOf()) ? String(value) : parsed.toISOString();
  };
  const fields: Array<[string, unknown, unknown]> = [
    ['concept_namespace', planned.conceptNamespace, existing.concept_namespace],
    ['concept_key', planned.conceptKey, existing.concept_key],
    ['canonical_concept', planned.canonicalConcept, existing.canonical_concept],
    ['display_name', planned.displayName, existing.display_name],
    ['definition_scope', planned.definitionScope, existing.definition_scope],
    [
      'issuer_entity_id',
      planned.issuerEntityId,
      existing.issuer_entity_id == null ? null : Number(existing.issuer_entity_id),
    ],
    [
      'source_id',
      planned.sourceId ?? null,
      existing.source_id == null ? null : Number(existing.source_id),
    ],
    ['period_basis', planned.periodBasis, existing.period_basis],
    ['accounting_basis', planned.accountingBasis, existing.accounting_basis],
    // Unit and currency reach the definition key through `boundedDefinitionKey`, which
    // lowercases. Two spellings of one unit therefore share a key by design, and the
    // row keeps whichever draft sorted first — SEC files both `reporting_Unit` and
    // `reporting_unit`. Comparing case-sensitively made the key and this check
    // contradict each other and stopped the whole SEC apply. The rule is: this check is
    // exactly as case-sensitive as the key that decided these are the same definition.
    ['unit', foldedUnit(planned.unit), foldedUnit(existing.unit)],
    ['currency', foldedUnit(planned.currency), foldedUnit(existing.currency ?? null)],
    // Same rule as unit/currency: the group key embeds the unit verbatim, so it
    // inherits the key's case folding. unit, currency and comparability_group_key are
    // the complete set of fields carrying the unit string — nothing else derives from it.
    [
      'comparability_group_key',
      foldedUnit(planned.comparabilityGroupKey),
      foldedUnit(existing.comparability_group_key),
    ],
    [
      'comparability_group_version',
      planned.comparabilityGroupVersion,
      Number(existing.comparability_group_version),
    ],
    [
      'effective_from',
      normalizeTimestamp(planned.effectiveFrom),
      normalizeTimestamp(existing.effective_from),
    ],
    ['numerator_description', null, existing.numerator_description ?? null],
    ['denominator_description', null, existing.denominator_description ?? null],
    ['inclusions', '[]', JSON.stringify(existing.inclusions ?? [])],
    ['exclusions', '[]', JSON.stringify(existing.exclusions ?? [])],
    ['scale_power', 0, Number(existing.scale_power)],
    ['supersedes_metric_definition_id', null, existing.supersedes_metric_definition_id ?? null],
    ['definition_state', 'active', existing.definition_state],
    ['effective_to', null, existing.effective_to ?? null],
    ['notes', null, existing.notes ?? null],
  ];
  const mismatch = fields.find(([, expected, actual]) => expected !== actual);
  return mismatch
    ? `${mismatch[0]} expected ${String(mismatch[1])}, got ${String(mismatch[2])}`
    : null;
}

const DEFINITION_INSERT_SQL = `
INSERT INTO governance.metric_definition (
  definition_key, revision_no, concept_namespace, concept_key, canonical_concept,
  display_name, definition_scope, issuer_entity_id, source_id, period_basis,
  accounting_basis, unit, currency, comparability_group_key,
  comparability_group_version, effective_from, created_by,
  numerator_description, denominator_description, inclusions, exclusions,
  scale_power, supersedes_metric_definition_id, definition_state, effective_to,
  notes
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,$22,$23,$24,$25,$26)
RETURNING definition_key, revision_no, concept_namespace, concept_key,
          canonical_concept, display_name, definition_scope, issuer_entity_id,
          source_id, period_basis,
          accounting_basis, unit, currency, comparability_group_key,
          comparability_group_version, effective_from, numerator_description,
          denominator_description, inclusions, exclusions, scale_power,
          supersedes_metric_definition_id, definition_state, effective_to,
          notes
`;

export async function ensureMetricDefinitions(
  client: NumericFactQueryClient,
  definitions: readonly MetricDefinitionRow[],
  options: { createdBy: string },
): Promise<number> {
  if (definitions.length === 0) return 0;
  const byKey = new Map(definitions.map((definition) => [definition.definitionKey, definition]));
  const found = await client.query(DEFINITION_SELECT_SQL, [[...byKey.keys()].sort()]);
  const existingKeys = new Set<string>();
  for (const row of found.rows) {
    const key = String(row.definition_key);
    const planned = byKey.get(key);
    if (!planned) throw new Error(`unexpected metric definition ${key}`);
    const mismatch = definitionMismatch(planned, row);
    if (mismatch) throw new Error(`metric definition drift for ${key}: ${mismatch}`);
    existingKeys.add(key);
  }

  let inserted = 0;
  for (const definition of [...definitions].sort((a, b) =>
    a.definitionKey.localeCompare(b.definitionKey),
  )) {
    if (existingKeys.has(definition.definitionKey)) continue;
    const result = await client.query(DEFINITION_INSERT_SQL, [
      definition.definitionKey,
      1,
      definition.conceptNamespace,
      definition.conceptKey,
      definition.canonicalConcept,
      definition.displayName,
      definition.definitionScope,
      definition.issuerEntityId,
      definition.sourceId ?? null,
      definition.periodBasis,
      definition.accountingBasis,
      definition.unit,
      definition.currency,
      definition.comparabilityGroupKey,
      definition.comparabilityGroupVersion,
      definition.effectiveFrom,
      options.createdBy,
      null,
      null,
      [],
      [],
      0,
      null,
      'active',
      null,
      null,
    ]);
    if (result.rows.length !== 1)
      throw new Error(`metric definition insert returned no row for ${definition.definitionKey}`);
    const mismatch = definitionMismatch(definition, result.rows[0]!);
    if (mismatch)
      throw new Error(
        `inserted metric definition mismatch for ${definition.definitionKey}: ${mismatch}`,
      );
    inserted += 1;
  }
  return inserted;
}

const FACT_COLUMNS = `fact_key, revision_no, entity_id, concept_namespace, concept_key,
  value, unit, currency, scale_power, period_start, period_end, instant_at,
  fiscal_year, fiscal_quarter, dimensions_json, restatement_group_key,
  original_cell_or_xbrl_locator, source_revision_id, available_at, known_at,
  supersedes_numeric_fact_id, metadata`;
const CHUNK_SIZE = 1000;

function placeholders(rows: number, columns: number): string {
  return Array.from(
    { length: rows },
    (_, row) =>
      `(${Array.from({ length: columns }, (_, column) => `$${row * columns + column + 1}`).join(',')})`,
  ).join(',');
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

export async function writeNumericFacts(
  client: NumericFactQueryClient,
  writes: readonly PlannedWrite[],
  existingGroups: ReadonlyMap<string, GroupState>,
): Promise<number> {
  for (const write of writes) {
    if (write.fact.definitionKey.trim() === '') {
      throw new Error(`numeric fact ${write.fact.factKey} has no metric definition key`);
    }
  }
  const idByFactKey = new Map<string, number>();
  for (const state of existingGroups.values()) {
    for (const [key, id] of state.factIdsByKey ?? []) idByFactKey.set(key, id);
  }
  const levels = new Map<number, PlannedWrite[]>();
  for (const write of writes) {
    const level = levels.get(write.revisionNo) ?? [];
    level.push(write);
    levels.set(write.revisionNo, level);
  }

  let written = 0;
  for (const revisionNo of [...levels.keys()].sort((a, b) => a - b)) {
    for (const batch of chunk(levels.get(revisionNo) ?? [], CHUNK_SIZE)) {
      const params = batch.flatMap((write) => {
        const fact = write.fact;
        if (write.revisionNo > 1 && write.supersedesFactKey === null) {
          throw new Error(
            `revision ${write.revisionNo} of ${fact.factKey} has no exact predecessor fact key`,
          );
        }
        const exactPredecessor =
          write.supersedesFactKey === null ? undefined : idByFactKey.get(write.supersedesFactKey);
        if (
          write.supersedesNumericFactId !== null &&
          exactPredecessor !== write.supersedesNumericFactId
        ) {
          throw new Error(
            `predecessor id ${write.supersedesNumericFactId} for ${fact.factKey} disagrees with exact key ${write.supersedesFactKey}: ${String(exactPredecessor)}`,
          );
        }
        const supersedes = write.supersedesNumericFactId ?? exactPredecessor ?? null;
        if (write.revisionNo > 1 && supersedes === null) {
          throw new Error(
            `revision ${write.revisionNo} of ${fact.factKey} has no exact predecessor`,
          );
        }
        return [
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
          JSON.stringify({ ...fact.metadata, metricDefinitionKey: fact.definitionKey }),
        ];
      });
      const result = await client.query(
        `INSERT INTO world.numeric_fact (${FACT_COLUMNS}) VALUES ${placeholders(batch.length, 22)} RETURNING fact_key, numeric_fact_id`,
        params,
      );
      const expectedKeys = new Set(batch.map((write) => write.fact.factKey));
      const returnedIds = new Map<string, number>();
      for (const row of result.rows) {
        if (typeof row.fact_key !== 'string') throw new Error('missing returned fact_key');
        if (!expectedKeys.has(row.fact_key)) {
          throw new Error(`unexpected returned fact key ${row.fact_key}`);
        }
        if (returnedIds.has(row.fact_key)) {
          throw new Error(`duplicate returned fact key ${row.fact_key}`);
        }
        const id = Number(row.numeric_fact_id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new Error(`invalid numeric_fact_id for ${row.fact_key}`);
        }
        returnedIds.set(row.fact_key, id);
      }
      for (const write of batch) {
        const id = returnedIds.get(write.fact.factKey);
        if (id === undefined) throw new Error(`missing returned fact key ${write.fact.factKey}`);
        idByFactKey.set(write.fact.factKey, id);
      }
      written += batch.length;
    }
  }
  return written;
}
