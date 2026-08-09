import {
  buildK4DailyCutoffs,
  digestK4MarketIntelligencePlan,
  K4_PLANNER_VERSION,
  K4_SCORE_FORMULA_VERSION,
} from './k4-market-intelligence-plan.ts';

export type K4SemanticSnapshotQueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
};

export type K4SemanticSnapshotQueryClient = {
  query: (sql: string, params?: readonly unknown[]) => Promise<K4SemanticSnapshotQueryResult>;
};

export type K4SemanticSnapshotArgs = {
  mode: 'dry-run' | 'rehearse' | 'apply';
  constructionMode: 'live_observed' | 'historical_reconstruction';
  cutoffs: string[];
};

export type K4SemanticSnapshotBasis = Record<string, unknown>;

export type K4SemanticSnapshotPlan = {
  semanticSnapshotId: string;
  ontologyRevisionId: number | null;
  metricDefinitionRevision: string;
  entityResolutionRevision: string;
  modelVersion: string;
  promptVersion: string;
  featureVersion: string;
  sourceContractRevisionDigest: string;
  marketCalendar: string;
  corporateActionBasis: string;
  constructionMode: K4SemanticSnapshotArgs['constructionMode'];
  knowledgeCutoff: string | null;
  notes: string;
};

export type K4SemanticSnapshotSummary = {
  cutoff: string;
  mode: K4SemanticSnapshotArgs['mode'];
  semanticSnapshotId: string;
  basisDigest: string;
  persistence: null | { inserted: boolean };
};

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function canonicalIso(value: string, label: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

export function parseK4SemanticSnapshotArgs(argv: readonly string[]): K4SemanticSnapshotArgs {
  let from: string | undefined;
  let to: string | undefined;
  let cutoff: string | undefined;
  let live = false;
  let kstCutoffTime = '23:59:59.999';
  const modes: Array<K4SemanticSnapshotArgs['mode']> = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--rehearse' || argument === '--apply') {
      modes.push(argument === '--rehearse' ? 'rehearse' : 'apply');
      continue;
    }
    if (argument === '--live') {
      live = true;
      continue;
    }
    if (argument === '--from' || argument === '--to' || argument === '--cutoff') {
      const value = valueAfter(argv, index, argument);
      if (argument === '--from') from = value;
      else if (argument === '--to') to = value;
      else cutoff = value;
      index += 1;
      continue;
    }
    if (argument === '--kst-cutoff-time') {
      kstCutoffTime = valueAfter(argv, index, argument);
      index += 1;
      continue;
    }
    throw new Error(`unknown K4 semantic snapshot argument: ${String(argument)}`);
  }
  if (modes.length > 1) throw new Error('select exactly one semantic snapshot write mode');
  const mode = modes[0] ?? 'dry-run';
  if (live) {
    if (from || to) throw new Error('live semantic snapshot cannot use a replay range');
    if (!cutoff) throw new Error('live semantic snapshot requires --cutoff');
    return {
      mode,
      constructionMode: 'live_observed',
      cutoffs: [canonicalIso(cutoff, 'live cutoff')],
    };
  }
  if (cutoff) throw new Error('--cutoff requires --live');
  if (!from || !to) throw new Error('historical semantic snapshots require --from and --to');
  return {
    mode,
    constructionMode: 'historical_reconstruction',
    cutoffs: buildK4DailyCutoffs({ from, to, kstCutoffTime }),
  };
}

function recordArray(basis: K4SemanticSnapshotBasis, key: string): Record<string, unknown>[] {
  const value = basis[key];
  if (!Array.isArray(value)) throw new Error(`K4 semantic basis ${key} must be an array`);
  return value.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`K4 semantic basis ${key} contains a non-object row`);
    }
    return row as Record<string, unknown>;
  });
}

export function buildK4SemanticSnapshotPlan(
  cutoff: string,
  basis: K4SemanticSnapshotBasis,
  constructionMode: K4SemanticSnapshotArgs['constructionMode'],
): K4SemanticSnapshotPlan {
  canonicalIso(cutoff, 'semantic basis cutoff');
  const ontology = recordArray(basis, 'ontology');
  const metricDefinitions = recordArray(basis, 'metricDefinitions');
  const identities = recordArray(basis, 'identities');
  const playbooks = recordArray(basis, 'playbooks');
  const drivers = recordArray(basis, 'drivers');
  const rules = recordArray(basis, 'rules');
  const assignments = recordArray(basis, 'assignments');
  const sourcePitQuality = recordArray(basis, 'sourcePitQuality');
  const ontologyDigest = digestK4MarketIntelligencePlan(ontology);
  const metricDefinitionRevision = digestK4MarketIntelligencePlan(metricDefinitions);
  const entityResolutionRevision = digestK4MarketIntelligencePlan(identities);
  const featureDigest = digestK4MarketIntelligencePlan({
    playbooks,
    drivers,
    rules,
    assignments,
    plannerVersion: K4_PLANNER_VERSION,
    scoreFormulaVersion: K4_SCORE_FORMULA_VERSION,
  });
  const sourceContractRevisionDigest = digestK4MarketIntelligencePlan(sourcePitQuality);
  const basisDigest = digestK4MarketIntelligencePlan({
    cutoff,
    ontologyDigest,
    metricDefinitionRevision,
    entityResolutionRevision,
    featureDigest,
    sourceContractRevisionDigest,
  });
  const singleOntologyId = ontology.length === 1 ? Number(ontology[0]?.ontology_revision_id) : null;
  const ontologyRevisionId =
    singleOntologyId !== null && Number.isSafeInteger(singleOntologyId) && singleOntologyId > 0
      ? singleOntologyId
      : null;
  const dateKey = cutoff.slice(0, 10).replaceAll('-', '');
  const notes = JSON.stringify({
    basis_cutoff: cutoff,
    basis_digest: basisDigest,
    construction_mode: constructionMode,
    ontology_digest: ontologyDigest,
    planner_version: K4_PLANNER_VERSION,
    score_formula_version: K4_SCORE_FORMULA_VERSION,
  });
  return {
    semanticSnapshotId: `k4.semantic.${dateKey}.${basisDigest.slice(0, 32)}`,
    ontologyRevisionId,
    metricDefinitionRevision,
    entityResolutionRevision,
    modelVersion: K4_PLANNER_VERSION,
    promptVersion: 'none.no-llm',
    featureVersion: `k4.feature.${featureDigest.slice(0, 40)}`,
    sourceContractRevisionDigest,
    marketCalendar: 'market-cutoff-calendar.v1',
    corporateActionBasis: 'unadjusted-close.v1',
    constructionMode,
    knowledgeCutoff: constructionMode === 'historical_reconstruction' ? cutoff : null,
    notes,
  };
}

const K4_SEMANTIC_BASIS_SQL = `
/* k4_semantic_basis */
SELECT jsonb_build_object(
  'ontology', COALESCE((
    SELECT jsonb_agg(to_jsonb(item) ORDER BY item.ontology_revision_id)
      FROM (SELECT * FROM knowledge.ontology_revision WHERE known_from <= $1::timestamptz) item
  ), '[]'::jsonb),
  'metricDefinitions', COALESCE((
    SELECT jsonb_agg(to_jsonb(item) ORDER BY item.metric_definition_id)
      FROM (SELECT * FROM governance.metric_definition WHERE known_at <= $1::timestamptz) item
  ), '[]'::jsonb),
  'identities', COALESCE((
    SELECT jsonb_agg(to_jsonb(item) ORDER BY item.security_issuer_identity_id)
      FROM (SELECT * FROM core.security_issuer_identity WHERE known_from <= $1::timestamptz) item
  ), '[]'::jsonb),
  'playbooks', COALESCE((
    SELECT jsonb_agg(to_jsonb(item) ORDER BY item.sector_playbook_id)
      FROM (SELECT * FROM governance.sector_playbook WHERE known_at <= $1::timestamptz) item
  ), '[]'::jsonb),
  'drivers', COALESCE((
    SELECT jsonb_agg(to_jsonb(item) ORDER BY item.business_driver_id)
      FROM (SELECT * FROM governance.business_driver WHERE created_at <= $1::timestamptz) item
  ), '[]'::jsonb),
  'rules', COALESCE((
    SELECT jsonb_agg(to_jsonb(item) ORDER BY item.business_driver_measurement_rule_id)
      FROM (SELECT * FROM governance.business_driver_measurement_rule WHERE known_at <= $1::timestamptz) item
  ), '[]'::jsonb),
  'assignments', COALESCE((
    SELECT jsonb_agg(to_jsonb(item) ORDER BY item.playbook_assignment_id)
      FROM (SELECT * FROM governance.playbook_assignment WHERE known_at <= $1::timestamptz) item
  ), '[]'::jsonb),
  'sourcePitQuality', COALESCE((
    SELECT jsonb_agg(to_jsonb(item) ORDER BY item.source_pit_quality_id)
      FROM (SELECT * FROM governance.source_pit_quality WHERE known_at <= $1::timestamptz) item
  ), '[]'::jsonb)
) AS snapshot_payload
`;

async function loadBasis(
  client: K4SemanticSnapshotQueryClient,
  cutoff: string,
): Promise<K4SemanticSnapshotBasis> {
  const result = await client.query(K4_SEMANTIC_BASIS_SQL, [cutoff]);
  const payload = result.rows[0]?.snapshot_payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('K4 semantic basis did not resolve exactly once');
  }
  return payload as K4SemanticSnapshotBasis;
}

function iso(value: unknown): string | null {
  return value == null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(String(value)).toISOString();
}

async function persistPlan(
  client: K4SemanticSnapshotQueryClient,
  plan: K4SemanticSnapshotPlan,
): Promise<{ inserted: boolean }> {
  const inserted = await client.query(
    `/* k4_insert_semantic_snapshot */
     INSERT INTO governance.semantic_snapshot (
       semantic_snapshot_id, ontology_revision_id, metric_definition_revision,
       entity_resolution_revision, model_version, prompt_version, feature_version,
       source_contract_revision_digest, market_calendar, corporate_action_basis,
       snapshot_state, created_at, sealed_at, created_by, notes,
       construction_mode, knowledge_cutoff, reconstructed_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       'sealed', statement_timestamp(), statement_timestamp(),
       'k4-semantic-snapshot', $11,
       $12, $13::timestamptz,
       CASE WHEN $12='historical_reconstruction' THEN statement_timestamp() ELSE NULL END
     )
     ON CONFLICT (semantic_snapshot_id) DO NOTHING`,
    [
      plan.semanticSnapshotId,
      plan.ontologyRevisionId,
      plan.metricDefinitionRevision,
      plan.entityResolutionRevision,
      plan.modelVersion,
      plan.promptVersion,
      plan.featureVersion,
      plan.sourceContractRevisionDigest,
      plan.marketCalendar,
      plan.corporateActionBasis,
      plan.notes,
      plan.constructionMode,
      plan.knowledgeCutoff,
    ],
  );
  const rows = (
    await client.query(
      `/* k4_verify_semantic_snapshot */
       SELECT semantic_snapshot_id, ontology_revision_id, metric_definition_revision,
              entity_resolution_revision, model_version, prompt_version, feature_version,
              source_contract_revision_digest, market_calendar, corporate_action_basis,
              snapshot_state, construction_mode, knowledge_cutoff, notes
         FROM governance.semantic_snapshot
        WHERE semantic_snapshot_id=$1`,
      [plan.semanticSnapshotId],
    )
  ).rows;
  if (rows.length !== 1) throw new Error('K4 semantic snapshot did not resolve exactly once');
  const row = rows[0]!;
  const exact =
    row.semantic_snapshot_id === plan.semanticSnapshotId &&
    (row.ontology_revision_id == null ? null : Number(row.ontology_revision_id)) ===
      plan.ontologyRevisionId &&
    row.metric_definition_revision === plan.metricDefinitionRevision &&
    row.entity_resolution_revision === plan.entityResolutionRevision &&
    row.model_version === plan.modelVersion &&
    row.prompt_version === plan.promptVersion &&
    row.feature_version === plan.featureVersion &&
    row.source_contract_revision_digest === plan.sourceContractRevisionDigest &&
    row.market_calendar === plan.marketCalendar &&
    row.corporate_action_basis === plan.corporateActionBasis &&
    row.snapshot_state === 'sealed' &&
    row.construction_mode === plan.constructionMode &&
    iso(row.knowledge_cutoff) === plan.knowledgeCutoff &&
    row.notes === plan.notes;
  if (!exact) throw new Error('existing K4 semantic snapshot differs from reconstructed basis');
  return { inserted: inserted.rowCount === 1 };
}

export async function executeK4SemanticSnapshotJob(input: {
  client: K4SemanticSnapshotQueryClient;
  args: K4SemanticSnapshotArgs;
}): Promise<K4SemanticSnapshotSummary[]> {
  const summaries: K4SemanticSnapshotSummary[] = [];
  for (const cutoff of input.args.cutoffs) {
    const basis = await loadBasis(input.client, cutoff);
    const plan = buildK4SemanticSnapshotPlan(cutoff, basis, input.args.constructionMode);
    const basisDigest = JSON.parse(plan.notes).basis_digest as string;
    if (input.args.mode === 'dry-run') {
      summaries.push({
        cutoff,
        mode: 'dry-run',
        semanticSnapshotId: plan.semanticSnapshotId,
        basisDigest,
        persistence: null,
      });
      continue;
    }
    await input.client.query('BEGIN');
    try {
      await input.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `k4-semantic-snapshot:${cutoff}`,
      ]);
      const persistence = await persistPlan(input.client, plan);
      await input.client.query(input.args.mode === 'apply' ? 'COMMIT' : 'ROLLBACK');
      summaries.push({
        cutoff,
        mode: input.args.mode,
        semanticSnapshotId: plan.semanticSnapshotId,
        basisDigest,
        persistence,
      });
    } catch (error) {
      await input.client.query('ROLLBACK');
      throw error;
    }
  }
  return summaries;
}
