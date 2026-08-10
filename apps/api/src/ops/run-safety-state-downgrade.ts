import { randomUUID } from 'node:crypto';
import pg, { type PoolClient } from 'pg';

// The downgrade rule migration 083 said 082 would consume, and 082 never contained.
//
// 083's own comment on slo_current_v1: "The run length is what migration 082's
// downgrade rule consumes: a definition fires only once its breach_consecutive_required
// is met." Migration 082 has the transition ledger, the append-only trigger, the
// severity function and the current-state view — but no rule. Nothing ever compared
// consecutive_breaches to breach_consecutive_required, and nothing ever inserted a
// trigger_kind='slo' transition. REQ-SAFE-002 had a permission and no mechanism.
//
// SEPARATE FROM THE OBSERVER ON PURPOSE. run-slo-observation.ts is a gauge and never
// throws; moving the product's state is a decision, and 082 keeps measurement and
// decision apart. Reading only the ledger also means this rule judges what was
// recorded, not what it re-measured.
//
// DOWNGRADE ONLY. 082: "A transition toward safety may be automatic; a transition
// back records who decided the condition had cleared." Recovery is
// run-safety-state-recovery.ts, called by a person.

const JOB_NAME = 'stock-insight-safety-state-downgrade';

export type SafetyState = 'NORMAL' | 'CAUTION' | 'INFORMATION_ONLY' | 'HALTED';

/** contracts/safety-state.json. NORMAL is deliberately unreachable by a breach. */
const SEVERITY: Record<SafetyState, number> = {
  NORMAL: 0,
  CAUTION: 1,
  INFORMATION_ONLY: 2,
  HALTED: 3,
};

export type SloCurrentRow = {
  sloKey: string;
  breachSafetyState: SafetyState | null;
  breachConsecutiveRequired: number;
  consecutiveBreaches: number;
  observedValue: number | null;
};

export type DowngradeDecision = {
  toState: SafetyState;
  firing: Array<{ sloKey: string; consecutiveBreaches: number; required: number }>;
} | null;

/**
 * The state the ledger currently justifies, or null for "leave it alone".
 *
 * A definition fires only once its own consecutive requirement is met, and only if
 * it was ever promoted. When several fire at once the worst of them wins — a gauge
 * asking for CAUTION cannot soften one asking for HALTED.
 */
export function planDowngrade(
  rows: readonly SloCurrentRow[],
  current: SafetyState,
): DowngradeDecision {
  const firing = rows.filter(
    (row) =>
      row.breachSafetyState !== null &&
      row.consecutiveBreaches >= row.breachConsecutiveRequired &&
      row.breachConsecutiveRequired > 0,
  );
  if (firing.length === 0) return null;
  const worst = firing.reduce((left, right) =>
    SEVERITY[right.breachSafetyState!] > SEVERITY[left.breachSafetyState!] ? right : left,
  );
  const toState = worst.breachSafetyState!;
  // Already there, or already worse. Re-recording it would add a transition that
  // transitions nothing to an append-only ledger.
  if (SEVERITY[toState] <= SEVERITY[current]) return null;
  return {
    toState,
    firing: firing
      .filter((row) => row.breachSafetyState === toState)
      .map((row) => ({
        sloKey: row.sloKey,
        consecutiveBreaches: row.consecutiveBreaches,
        required: row.breachConsecutiveRequired,
      }))
      .sort((left, right) => left.sloKey.localeCompare(right.sloKey)),
  };
}

type QueryClient = {
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
};

const CURRENT_STATE_SQL = `
SELECT safety_state FROM governance.safety_state_current_v1 WHERE scope = 'global'
`;

const SLO_CURRENT_SQL = `
SELECT slo_key, breach_safety_state, breach_consecutive_required,
       consecutive_breaches, observed_value::float8 AS observed_value
  FROM governance.slo_current_v1
 WHERE definition_state = 'active'
 ORDER BY slo_key
`;

const INSERT_TRANSITION_SQL = `
INSERT INTO governance.safety_state_transition (
  scope, from_state, to_state, trigger_kind, reason, evidence_ref, decided_by
) VALUES ('global', $1, $2, 'slo', $3, $4, $5)
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

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

export async function loadSloCurrent(client: QueryClient): Promise<SloCurrentRow[]> {
  return (await client.query(SLO_CURRENT_SQL)).rows.map((row) => ({
    sloKey: String(row.slo_key),
    breachSafetyState:
      row.breach_safety_state == null ? null : (String(row.breach_safety_state) as SafetyState),
    breachConsecutiveRequired: Number(row.breach_consecutive_required),
    consecutiveBreaches: Number(row.consecutive_breaches),
    observedValue: row.observed_value == null ? null : Number(row.observed_value),
  }));
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const startedAt = new Date();
  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    let rows: SloCurrentRow[];
    let current: SafetyState;
    try {
      current = String(
        (await client.query(CURRENT_STATE_SQL)).rows[0]?.safety_state ?? 'NORMAL',
      ) as SafetyState;
      rows = await loadSloCurrent(client);
    } finally {
      await client.query('COMMIT');
    }

    const decision = planDowngrade(rows, current);
    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : 'dry-run',
      currentState: current,
      // Every promoted gauge and where it stands, not just the ones firing. A rule
      // that reports only when it acts looks identical to a rule that is not running.
      gauges: rows
        .filter((row) => row.breachSafetyState !== null)
        .map((row) => ({
          sloKey: row.sloKey,
          observedValue: row.observedValue,
          consecutiveBreaches: row.consecutiveBreaches,
          required: row.breachConsecutiveRequired,
          wouldFire: row.consecutiveBreaches >= row.breachConsecutiveRequired,
        })),
      reportOnly: rows.filter((row) => row.breachSafetyState === null).map((row) => row.sloKey),
      decision,
    };
    console.log(JSON.stringify(summary, null, 2));

    if (apply && decision) {
      const reason = decision.firing
        .map(
          (row) => `${row.sloKey} breached ${row.consecutiveBreaches}/${row.required} consecutive`,
        )
        .join('; ');
      await client.query(INSERT_TRANSITION_SQL, [
        current,
        decision.toState,
        reason,
        decision.firing.map((row) => row.sloKey).join(','),
        JOB_NAME,
      ]);
    }
    if (apply) {
      await client.query(INSERT_MIGRATION_RUN_SQL, [
        `${JOB_NAME}-${randomUUID()}`,
        JOB_NAME,
        'completed',
        startedAt.toISOString(),
        JSON.stringify(summary),
      ]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('run-safety-state-downgrade.ts')) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
