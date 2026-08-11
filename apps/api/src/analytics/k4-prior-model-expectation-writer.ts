import { buildK4DailyCutoffs } from './k4-market-intelligence-plan.ts';
import {
  loadK4MarketIntelligenceInput,
  withK4MarketIntelligenceTransaction,
  type K4ConceptScope,
  type K4QueryClient,
} from './k4-market-intelligence-store.ts';
import {
  ensureInformationSet,
  insertSealedDerivation,
  type K4PersistenceClient,
} from './k4-market-intelligence-writer.ts';
import {
  planK4PriorModelExpectations,
  priorModelExpectationInputs,
  priorModelExpectationParameters,
  type K4PriorModelExpectationPlan,
} from './k4-prior-model-expectation.ts';

export type K4PriorModelExpectationArgs = {
  mode: 'dry-run' | 'rehearse' | 'apply';
  runKind: 'replay' | 'canary';
  cutoffs: string[];
  /**
   * `rules` — the historical read, bounded by `input_concept_selectors`.
   * `universe` — the regulator/canonical concepts the subject actually has annual
   * history for. See `UNIVERSE_CONCEPT_SQL`; the default stays `rules` so an
   * unflagged run issues the same statements it always did.
   */
  conceptScope: K4ConceptScope;
};

export type K4PriorModelExpectationPersistence = {
  insertedCount: number;
  skippedCount: number;
  /**
   * Expectations dropped because their metric definition is missing or ambiguous.
   * Reported rather than thrown: one unresolvable concept must not take the whole
   * pipeline stage down, and a silent drop is the defect this repository already
   * paid for once — so the count and the keys are always surfaced.
   */
  unresolvedDefinitionCount: number;
  unresolvedDefinitionKeys: string[];
  expectationKeys: string[];
};

export type K4PriorModelExpectationSummary = {
  cutoff: string;
  mode: K4PriorModelExpectationArgs['mode'];
  /**
   * Reported because the information-set id digests only the cutoff and the semantic
   * snapshot, so a `rules` run and a `universe` run at the same cutoff share one id
   * while reading different inputs. Until that is resolved, the summary is the only
   * place the two are told apart.
   */
  conceptScope: K4ConceptScope;
  informationSetId: string;
  plannedCount: number;
  persistence: K4PriorModelExpectationPersistence | null;
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

export function parseK4PriorModelExpectationArgs(
  argv: readonly string[],
): K4PriorModelExpectationArgs {
  let from: string | undefined;
  let to: string | undefined;
  let cutoff: string | undefined;
  let live = false;
  let kstCutoffTime = '23:59:59.999';
  let conceptScope: K4ConceptScope = 'rules';
  const modes: Array<K4PriorModelExpectationArgs['mode']> = [];
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
    if (argument === '--concept-scope') {
      const value = valueAfter(argv, index, argument);
      if (value !== 'rules' && value !== 'universe') {
        throw new Error('--concept-scope must be rules or universe');
      }
      conceptScope = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown K4 prior-model expectation argument: ${String(argument)}`);
  }
  if (modes.length > 1) throw new Error('select exactly one prior-model expectation write mode');
  const mode = modes[0] ?? 'dry-run';
  if (live) {
    if (from || to) throw new Error('live prior-model expectations cannot use a replay range');
    if (!cutoff) throw new Error('live prior-model expectations require --cutoff');
    return {
      mode,
      runKind: 'canary',
      cutoffs: [canonicalIso(cutoff, 'live cutoff')],
      conceptScope,
    };
  }
  if (cutoff) throw new Error('--cutoff requires --live');
  if (!from || !to) throw new Error('prior-model expectation replay requires --from and --to');
  return {
    mode,
    runKind: 'replay',
    cutoffs: buildK4DailyCutoffs({ from, to, kstCutoffTime }),
    conceptScope,
  };
}

function positiveId(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

/**
 * The store joins `governance.metric_definition` to rebuild the target period, so an
 * expectation without exactly one active definition is refused rather than guessed.
 */
const METRIC_DEFINITION_SQL = `
/* k4_read_expectation_metric_definition */
SELECT metric_definition_id
  FROM governance.metric_definition
 WHERE concept_namespace=$1 AND concept_key=$2 AND period_basis=$3
   AND definition_state='active' AND known_at <= $4::timestamptz
   AND (issuer_entity_id IS NULL OR issuer_entity_id=$5)
   AND (effective_to IS NULL OR effective_to > $4::timestamptz)
 ORDER BY issuer_entity_id NULLS LAST, revision_no DESC
 LIMIT 2
`;

const EXISTING_EXPECTATION_SQL = `
/* k4_read_prior_model_expectation */
SELECT expectation_revision_id
  FROM analytics.expectation_revision
 WHERE expectation_key=$1
 LIMIT 1
`;

const INSERT_EXPECTATION_SQL = `
/* k4_insert_prior_model_expectation */
INSERT INTO analytics.expectation_revision (
  expectation_key, revision_no, target_entity_id, metric_definition_id,
  expectation_kind, as_of_at, horizon, target_period_start, target_period_end,
  expected_value, expected_unit, distribution, dispersion, source_revision_id,
  information_set_id, derivation_id, available_at, known_at, metadata
) VALUES (
  $1, 1, $2, $3, $4, $5::timestamptz, $6, $7::date, $8::date,
  $9, $10, $11::jsonb, $12, NULL, $13, $14, $15::timestamptz, $16::timestamptz, $17::jsonb
)
ON CONFLICT (expectation_key, revision_no) DO NOTHING
RETURNING expectation_revision_id
`;

export async function persistK4PriorModelExpectations(
  client: K4PersistenceClient,
  plans: readonly K4PriorModelExpectationPlan[],
  options: {
    informationSetId: string;
    cutoff: string;
    /**
     * The producer runs before the K4 canary, so on a fresh cutoff the analysis
     * information set does not exist yet. Sealing it here is the same idempotent
     * insert-and-verify the canary performs, so both agree or both fail.
     */
    informationSet?: Parameters<typeof ensureInformationSet>[1];
    runKind?: 'replay' | 'canary';
  },
): Promise<K4PriorModelExpectationPersistence> {
  const cutoffAt = Date.parse(options.cutoff);
  if (Number.isNaN(cutoffAt)) throw new Error('K4 prior-model cutoff must be parseable');
  if (options.informationSet && plans.length > 0) {
    await ensureInformationSet(client, options.informationSet, options.runKind ?? 'canary');
  }
  const expectationKeys: string[] = [];
  const unresolvedDefinitionKeys: string[] = [];
  let insertedCount = 0;
  let skippedCount = 0;
  for (const plan of plans) {
    if (Date.parse(plan.knownAt) > cutoffAt || Date.parse(plan.availableAt) > cutoffAt) {
      throw new Error(
        `prior-model expectation ${plan.expectationKey} would be known after the cutoff`,
      );
    }
    const existing = await client.query(EXISTING_EXPECTATION_SQL, [plan.expectationKey]);
    if (existing.rows.length > 0) {
      skippedCount += 1;
      expectationKeys.push(plan.expectationKey);
      continue;
    }
    const definitions = await client.query(METRIC_DEFINITION_SQL, [
      plan.conceptNamespace,
      plan.conceptKey,
      plan.periodBasis,
      options.cutoff,
      plan.issuerEntityId,
    ]);
    if (definitions.rows.length !== 1) {
      unresolvedDefinitionKeys.push(plan.expectationKey);
      continue;
    }
    const definition = definitions.rows[0]!;
    const derivation = await insertSealedDerivation(client, {
      key: plan.derivationKey,
      kind: 'calculation',
      method: plan.modelKey,
      outputType: 'expectation_revision',
      outputLocator: { expectation_key: plan.expectationKey },
      parameters: priorModelExpectationParameters(plan),
      inputs: priorModelExpectationInputs(plan).map((item) => ({
        kind: 'numeric_fact' as const,
        numericFactId: item.numericFactId,
        role: item.role,
      })),
    });
    const inserted = await client.query(INSERT_EXPECTATION_SQL, [
      plan.expectationKey,
      plan.issuerEntityId,
      positiveId(definition.metric_definition_id, 'metric_definition_id'),
      plan.expectationKind,
      plan.asOfAt,
      plan.horizon,
      plan.targetPeriodStart,
      plan.targetPeriodEnd,
      plan.expectedValue,
      plan.expectedUnit,
      JSON.stringify({
        family: 'point_with_dispersion',
        drift: plan.drift,
        dispersion: plan.dispersion,
      }),
      plan.dispersion,
      options.informationSetId,
      derivation.derivationId,
      plan.availableAt,
      plan.knownAt,
      JSON.stringify({
        model_key: plan.modelKey,
        prior_observation_count: plan.priorObservationCount,
        target_numeric_fact_id: plan.targetNumericFactId,
      }),
    ]);
    if (inserted.rows.length === 0) skippedCount += 1;
    else insertedCount += 1;
    expectationKeys.push(plan.expectationKey);
  }
  return {
    insertedCount,
    skippedCount,
    unresolvedDefinitionCount: unresolvedDefinitionKeys.length,
    unresolvedDefinitionKeys,
    expectationKeys,
  };
}

export async function executeK4PriorModelExpectationJob(input: {
  client: K4QueryClient & K4PersistenceClient;
  args: K4PriorModelExpectationArgs;
}): Promise<K4PriorModelExpectationSummary[]> {
  const summaries: K4PriorModelExpectationSummary[] = [];
  for (const cutoff of input.args.cutoffs) {
    const loaded = await loadK4MarketIntelligenceInput(input.client, {
      cutoff,
      securityLimit: 10,
      conceptScope: input.args.conceptScope,
    });
    const plans = planK4PriorModelExpectations(loaded);
    if (input.args.mode === 'dry-run') {
      summaries.push({
        cutoff,
        mode: 'dry-run',
        conceptScope: input.args.conceptScope,
        informationSetId: loaded.informationSet.informationSetId,
        plannedCount: plans.length,
        persistence: null,
      });
      continue;
    }
    const persistence = await withK4MarketIntelligenceTransaction(
      input.client,
      { mode: input.args.mode, cutoff },
      async () =>
        persistK4PriorModelExpectations(input.client, plans, {
          informationSetId: loaded.informationSet.informationSetId,
          cutoff,
          informationSet: loaded.informationSet,
          runKind: input.args.runKind,
        }),
    );
    summaries.push({
      cutoff,
      mode: input.args.mode,
      conceptScope: input.args.conceptScope,
      informationSetId: loaded.informationSet.informationSetId,
      plannedCount: plans.length,
      persistence,
    });
  }
  return summaries;
}
