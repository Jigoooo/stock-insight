import { buildK4DailyCutoffs } from './k4-market-intelligence-plan.ts';

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
