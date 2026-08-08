import { readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

// REQ-PIT-003: `now()` must not be used as a business cutoff.
//
// canonical/00 §5 fixes four time axes — valid/event, published, available,
// known. A query that resolves one of them against now() has silently made "the
// moment this process happens to run" into the analysis boundary. Nothing fails;
// the answer is simply not point-in-time, and a backtest built on it quietly
// grades itself against knowledge it should not have had.
//
// This is a source audit, not a database one, because the defect lives in SQL
// text rather than in a row. It reads no database and can run anywhere.
//
// WHY AN ALLOWLIST RATHER THAN A CLEAN FAIL. There is a real violation today in
// run-v2-graph-publish.ts, and migrating that file to the temporal kernel is K7's
// job — it is 121KB and rewriting it inside a kernel change would couple two
// risks. Shipping the audit as a pure failure would mean either breaking the
// pipeline immediately or not shipping it. The allowlist records the known ones
// with a reason and an owner, so a *new* violation still fails.
//
// The allowlist is also checked for rot: an entry that no longer matches fails
// too. Otherwise the list becomes a place where fixed problems go to be forgotten
// and a future reader cannot tell which entries still describe reality. Same idea
// as the STALE_ALLOWANCE check in the table-ownership verifier.

const ROOT = new URL('../../../../', import.meta.url).pathname;
const SCAN_ROOTS = ['apps/api/src', 'apps/api-server/src', 'apps/web/src'];

/**
 * Columns that carry one of the canonical time axes. Comparing one of these to
 * now() is the defect; comparing a lease or a TTL is not.
 */
const PIT_AXIS_COLUMNS = [
  'known_at',
  'known_from',
  'known_to',
  'available_at',
  'valid_at',
  'valid_from',
  'valid_to',
  'valid_cutoff',
  'published_at',
  'effective_from',
  'effective_to',
  'vintage_date',
  'as_of',
  'snapshot_as_of',
  'source_known_at',
  'observation_date',
  'sealed_at',
  'occurred_at',
  'event_time',
];

/**
 * Comparison against now() only. An assignment (`known_at = now()`) is a write of
 * when something happened, which is a fact about the record rather than a cutoff.
 * The distinction matters: 17 `updated_at = now()` writes in this repo are all
 * correct, and an audit that flagged them would be ignored within a week.
 */
const COMPARISON = String.raw`\s*(?:<=|>=|<|>)\s*now\(\)`;

type Finding = {
  file: string;
  line: number;
  column: string;
  text: string;
};

type Allowance = {
  file: string;
  column: string;
  reason: string;
  owner: string;
};

/**
 * Known violations, each with why it is still here and who closes it. Adding an
 * entry is a decision to defer, not a way to silence the check — every entry
 * names the phase that removes it.
 */
const ALLOWLIST: readonly Allowance[] = [
  {
    file: 'apps/api/src/analytics/run-v2-graph-publish.ts',
    column: 'effective_from',
    reason:
      'Resolves the approved predicate ontology at run time. Correct only while the publisher has no information set; K7 moves this file onto the temporal kernel, which supplies the cutoff.',
    owner: 'K7 product surface',
  },
  {
    file: 'apps/api/src/analytics/run-v2-graph-publish.ts',
    column: 'known_from',
    reason: 'Same query as the effective_from entry above — one ontology lookup, two axes.',
    owner: 'K7 product surface',
  },
];

function listSourceFiles(directory: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        walk(full);
        continue;
      }
      if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
    }
  };
  walk(directory);
  return out;
}

export function findPitNowViolations(roots: readonly string[] = SCAN_ROOTS): Finding[] {
  const findings: Finding[] = [];
  const patterns = PIT_AXIS_COLUMNS.map(
    (column) => [column, new RegExp(`[\\w.]*\\b${column}\\b${COMPARISON}`, 'i')] as const,
  );

  for (const root of roots) {
    // Roots are repo-relative in normal use; tests pass absolute fixture
    // directories, which must not be joined onto the repo root.
    const absoluteRoot = isAbsolute(root) ? root : join(ROOT, root);
    let files: string[];
    try {
      files = listSourceFiles(absoluteRoot);
    } catch {
      continue;
    }

    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((text, index) => {
        // A line that only comments about now() is not a query.
        const code = text.replace(/^\s*(\/\/|\*|--).*$/, '');
        for (const [column, pattern] of patterns) {
          if (pattern.test(code)) {
            findings.push({
              file: relative(ROOT, file),
              line: index + 1,
              column,
              text: text.trim().slice(0, 160),
            });
          }
        }
      });
    }
  }
  return findings;
}

export function auditPitNow(roots: readonly string[] = SCAN_ROOTS) {
  const findings = findPitNowViolations(roots);

  const allowed: Finding[] = [];
  const violations: Finding[] = [];
  const matchedAllowances = new Set<string>();

  for (const finding of findings) {
    const allowance = ALLOWLIST.find(
      (entry) => entry.file === finding.file && entry.column === finding.column,
    );
    if (allowance === undefined) {
      violations.push(finding);
      continue;
    }
    matchedAllowances.add(`${allowance.file}|${allowance.column}`);
    allowed.push(finding);
  }

  // An allowance that no longer matches anything is either fixed or moved. Either
  // way the list is now describing a codebase that does not exist.
  const staleAllowances = ALLOWLIST.filter(
    (entry) => !matchedAllowances.has(`${entry.file}|${entry.column}`),
  );

  return { findings, allowed, violations, staleAllowances };
}

export async function run(): Promise<void> {
  const result = auditPitNow();
  const summary = {
    job: 'stock-insight-pit-now-audit',
    requirement: 'REQ-PIT-003',
    scanned: SCAN_ROOTS,
    totalMatches: result.findings.length,
    allowedCount: result.allowed.length,
    violationCount: result.violations.length,
    staleAllowanceCount: result.staleAllowances.length,
    violations: result.violations,
    staleAllowances: result.staleAllowances,
    allowed: result.allowed.map((finding) => ({
      file: finding.file,
      line: finding.line,
      column: finding.column,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (result.violations.length > 0) {
    throw new Error(
      `REQ-PIT-003: ${result.violations.length} query/queries use now() as a business cutoff`,
    );
  }
  if (result.staleAllowances.length > 0) {
    throw new Error(
      `REQ-PIT-003 allowlist is stale: ${result.staleAllowances.length} entry/entries no longer match`,
    );
  }
}

if (process.argv[1]?.endsWith('run-pit-now-audit.ts')) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
