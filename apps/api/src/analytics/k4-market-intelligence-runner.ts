import {
  buildK4DailyCutoffs,
  digestK4MarketIntelligencePlan,
  planK4MarketIntelligence,
  type K4MarketIntelligenceInput,
  type K4MarketIntelligencePlan,
} from './k4-market-intelligence-plan.ts';
import {
  loadK4MarketIntelligenceInput,
  loadK4OutcomePlans,
  withK4MarketIntelligenceTransaction,
  type K4QueryClient,
} from './k4-market-intelligence-store.ts';
import {
  persistK4MarketIntelligencePlan,
  type K4PersistenceOptions,
  type K4PersistenceResult,
  type K4OutcomePlan,
} from './k4-market-intelligence-writer.ts';

type Mode = 'dry-run' | 'rehearse' | 'apply';

export type K4ReplayArgs = {
  mode: Mode;
  runKind: 'replay';
  from: string;
  to: string;
  kstCutoffTime: string;
  securityLimit: 10;
};

export type K4CanaryArgs = {
  mode: 'apply';
  runKind: 'canary';
  cutoff: string;
  kstCutoffTime: string;
  securityLimit: 10;
};

export type K4MarketIntelligenceArgs = K4ReplayArgs | K4CanaryArgs;

function takeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseK4MarketIntelligenceArgs(argv: readonly string[]): K4MarketIntelligenceArgs {
  let from: string | undefined;
  let to: string | undefined;
  let cutoff: string | undefined;
  let kstCutoffTime = '23:59:59.999';
  let securityLimit = 10;
  let canary = false;
  const selectedModes: Mode[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--rehearse') {
      selectedModes.push('rehearse');
      continue;
    }
    if (argument === '--apply') {
      selectedModes.push('apply');
      continue;
    }
    if (argument === '--canary') {
      canary = true;
      continue;
    }
    if (argument === '--from') {
      from = takeValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--to') {
      to = takeValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--cutoff') {
      cutoff = takeValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--kst-cutoff-time') {
      kstCutoffTime = takeValue(argv, index, argument);
      index += 1;
      continue;
    }
    if (argument === '--security-limit') {
      securityLimit = Number(takeValue(argv, index, argument));
      index += 1;
      continue;
    }
    throw new Error(`unknown K4 argument: ${String(argument)}`);
  }
  if (selectedModes.length > 1) throw new Error('select exactly one K4 write mode');
  const mode = selectedModes[0] ?? 'dry-run';
  if (!Number.isSafeInteger(securityLimit) || securityLimit !== 10) {
    throw new Error('K4 evaluates exactly 10 securities');
  }
  if (canary) {
    if (mode !== 'apply') throw new Error('canary requires independent --apply');
    if (from || to) throw new Error('canary cannot use a replay range');
    if (!cutoff) throw new Error('canary requires --cutoff');
    const parsed = new Date(cutoff);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== cutoff) {
      throw new Error('canary cutoff must be a canonical ISO timestamp');
    }
    return {
      mode: 'apply',
      runKind: 'canary',
      cutoff,
      kstCutoffTime,
      securityLimit: 10,
    };
  }
  if (cutoff) throw new Error('--cutoff is reserved for canary');
  if (!from || !to) throw new Error('replay requires --from and --to');
  const replay: K4ReplayArgs = {
    mode,
    runKind: 'replay',
    from,
    to,
    kstCutoffTime,
    securityLimit: 10,
  };
  buildK4DailyCutoffs(replay);
  return replay;
}

export function buildK4RunCutoffs(args: K4MarketIntelligenceArgs): string[] {
  if (args.runKind === 'canary') return [args.cutoff];
  return buildK4DailyCutoffs(args);
}

export type K4RunSummary = {
  cutoff: string;
  mode: Mode;
  runKind: 'replay' | 'canary';
  requestDigest: string;
  planDigest: string;
  evaluationCount: number;
  acceptedEvaluationCount: number;
  coverage: K4MarketIntelligencePlan['coverage'];
  outcomeCount: number;
  persistence: K4PersistenceResult | null;
};

type LoadInput = (
  client: K4QueryClient,
  options: { cutoff: string; securityLimit: 10 },
) => Promise<K4MarketIntelligenceInput>;

type LoadOutcomes = (
  client: K4QueryClient,
  plan: K4MarketIntelligencePlan,
) => Promise<K4OutcomePlan[]>;

type PersistPlan = (
  client: K4QueryClient,
  plan: K4MarketIntelligencePlan,
  options: K4PersistenceOptions,
) => Promise<K4PersistenceResult>;

export async function executeK4MarketIntelligenceJob(input: {
  client: K4QueryClient;
  args: K4MarketIntelligenceArgs;
  loadInput?: LoadInput;
  plan?: typeof planK4MarketIntelligence;
  loadOutcomes?: LoadOutcomes;
  persistPlan?: PersistPlan;
}): Promise<K4RunSummary[]> {
  const loadInput = input.loadInput ?? loadK4MarketIntelligenceInput;
  const plan = input.plan ?? planK4MarketIntelligence;
  const loadOutcomes = input.loadOutcomes ?? loadK4OutcomePlans;
  const persistPlan = input.persistPlan ?? persistK4MarketIntelligencePlan;
  const summaries: K4RunSummary[] = [];
  for (const cutoff of buildK4RunCutoffs(input.args)) {
    const canonicalInput = await loadInput(input.client, {
      cutoff,
      securityLimit: input.args.securityLimit,
    });
    const planned = plan(canonicalInput);
    const outcomes = await loadOutcomes(input.client, planned);
    const requestDigest = digestK4MarketIntelligencePlan({
      runKind: input.args.runKind,
      cutoff,
      securityLimit: input.args.securityLimit,
      informationSetId: canonicalInput.informationSet.informationSetId,
    });
    const planDigest = digestK4MarketIntelligencePlan({ plan: planned, outcomes });
    const acceptedEvaluationCount = planned.evaluations.filter(
      (evaluation) => evaluation.evaluationDisposition === 'accepted',
    ).length;
    if (input.args.mode === 'dry-run') {
      summaries.push({
        cutoff,
        mode: 'dry-run',
        runKind: input.args.runKind,
        requestDigest,
        planDigest,
        evaluationCount: planned.evaluations.length,
        acceptedEvaluationCount,
        coverage: planned.coverage,
        outcomeCount: outcomes.length,
        persistence: null,
      });
      continue;
    }
    const persistence = await withK4MarketIntelligenceTransaction(
      input.client,
      { mode: input.args.mode, cutoff },
      () =>
        persistPlan(input.client, planned, {
          runKind: input.args.runKind,
          cutoff,
          requestDigest,
          planDigest,
          outcomes,
        }),
    );
    summaries.push({
      cutoff,
      mode: input.args.mode,
      runKind: input.args.runKind,
      requestDigest,
      planDigest,
      evaluationCount: planned.evaluations.length,
      acceptedEvaluationCount,
      coverage: planned.coverage,
      outcomeCount: outcomes.length,
      persistence,
    });
  }
  return summaries;
}
