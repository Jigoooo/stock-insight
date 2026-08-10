import pg, { type PoolClient } from 'pg';

import {
  loadSloCurrent,
  type SafetyState,
  type SloCurrentRow,
} from './run-safety-state-downgrade.ts';

// Recovery. Called by a person, never by a timer.
//
// Migration 082: "A transition toward safety may be automatic; a transition back
// records who decided the condition had cleared. If recovery were automatic, a
// flapping SLO would walk the product in and out of INFORMATION_ONLY unattended, and
// the state would stop meaning anything."
//
// So the decision stays with a human and only the checking is mechanical. What this
// refuses to do is let that human record a recovery while the gauges that caused the
// downgrade are still breaching — the ledger is append-only, and a recovery written
// over a live breach cannot be taken back.

const JOB_NAME = 'stock-insight-safety-state-recovery';

const STATES: SafetyState[] = ['NORMAL', 'CAUTION', 'INFORMATION_ONLY', 'HALTED'];
const SEVERITY: Record<SafetyState, number> = {
  NORMAL: 0,
  CAUTION: 1,
  INFORMATION_ONLY: 2,
  HALTED: 3,
};

export type RecoveryArgs = {
  apply: boolean;
  toState: SafetyState;
  reason: string;
  decidedBy: string;
};

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseRecoveryArgs(argv: readonly string[]): RecoveryArgs {
  let apply = false;
  let toState: string | undefined;
  let reason: string | undefined;
  let decidedBy: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    if (argument === '--to' || argument === '--reason' || argument === '--decided-by') {
      const value = valueAfter(argv, index, argument);
      if (argument === '--to') toState = value;
      else if (argument === '--reason') reason = value;
      else decidedBy = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown safety state recovery argument: ${String(argument)}`);
  }
  if (!toState || !STATES.includes(toState as SafetyState)) {
    throw new Error(`--to must be one of ${STATES.join(', ')}`);
  }
  if (!reason?.trim()) throw new Error('--reason is required');
  // No default, and no job name standing in for a person. The whole point of the
  // manual path is that somebody's name is on it.
  if (!decidedBy?.trim()) throw new Error('--decided-by is required');
  return {
    apply,
    toState: toState as SafetyState,
    reason: reason.trim(),
    decidedBy: decidedBy.trim(),
  };
}

export type RecoveryBlocker = { sloKey: string; consecutiveBreaches: number; required: number };

/** Gauges still breaching past their requirement — every one blocks a recovery. */
export function recoveryBlockers(rows: readonly SloCurrentRow[]): RecoveryBlocker[] {
  return rows
    .filter(
      (row) =>
        row.breachSafetyState !== null && row.consecutiveBreaches >= row.breachConsecutiveRequired,
    )
    .map((row) => ({
      sloKey: row.sloKey,
      consecutiveBreaches: row.consecutiveBreaches,
      required: row.breachConsecutiveRequired,
    }))
    .sort((left, right) => left.sloKey.localeCompare(right.sloKey));
}

export function assertRecoveryDirection(current: SafetyState, toState: SafetyState): void {
  if (SEVERITY[toState] >= SEVERITY[current]) {
    throw new Error(
      `recovery must move toward NORMAL; ${current} to ${toState} is not a recovery — use the downgrade rule`,
    );
  }
}

type PgModule = {
  Pool: new (options: { connectionString: string; max: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const CURRENT_STATE_SQL = `
SELECT safety_state FROM governance.safety_state_current_v1 WHERE scope = 'global'
`;

const INSERT_TRANSITION_SQL = `
INSERT INTO governance.safety_state_transition (
  scope, from_state, to_state, trigger_kind, reason, evidence_ref, decided_by
) VALUES ('global', $1, $2, 'manual', $3, $4, $5)
`;

async function run(): Promise<void> {
  const args = parseRecoveryArgs(process.argv.slice(2));
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    let current: SafetyState;
    let rows: SloCurrentRow[];
    try {
      current = String(
        (await client.query(CURRENT_STATE_SQL)).rows[0]?.safety_state ?? 'NORMAL',
      ) as SafetyState;
      rows = await loadSloCurrent(client);
    } finally {
      await client.query('COMMIT');
    }

    assertRecoveryDirection(current, args.toState);
    const blockers = recoveryBlockers(rows);
    const summary = {
      job: JOB_NAME,
      mode: args.apply ? 'apply' : 'dry-run',
      currentState: current,
      toState: args.toState,
      decidedBy: args.decidedBy,
      blockers,
    };
    console.log(JSON.stringify(summary, null, 2));

    if (blockers.length > 0) {
      throw new Error(
        `cannot record a recovery while ${blockers.length} gauge(s) are still breaching: ${blockers
          .map((row) => row.sloKey)
          .join(', ')}`,
      );
    }
    if (args.apply) {
      await client.query(INSERT_TRANSITION_SQL, [
        current,
        args.toState,
        args.reason,
        blockers.length === 0 ? 'all promoted gauges clear' : null,
        args.decidedBy,
      ]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('run-safety-state-recovery.ts')) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
