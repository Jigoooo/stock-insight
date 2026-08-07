import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { auditPitNow, findPitNowViolations } from '../src/ops/run-pit-now-audit.ts';

// The audit scans source text, so the fixtures are source files. They live in a
// temp directory and are passed as absolute roots, which the audit accepts so a
// test never has to write inside the repo it is auditing.
const fixtureRoot = mkdtempSync(join(tmpdir(), 'pit-now-audit-'));

after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

function fixture(name: string, contents: string): string {
  const directory = join(fixtureRoot, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'query.ts'), contents);
  return directory;
}

describe('REQ-PIT-003 now() audit — detection', () => {
  it('flags a PIT axis column compared against now()', () => {
    const root = fixture(
      'violating',
      `const SQL = \`SELECT * FROM knowledge.assertion WHERE known_at <= now()\`;`,
    );
    const findings = findPitNowViolations([root]);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.column, 'known_at');
  });

  it('flags each axis independently on the same line', () => {
    const root = fixture(
      'two-axes',
      `const SQL = \`WHERE effective_from <= now() AND known_from <= now()\`;`,
    );
    const findings = findPitNowViolations([root]);
    assert.deepEqual(findings.map((f) => f.column).sort(), ['effective_from', 'known_from']);
  });

  it('ignores an assignment — that records when something happened', () => {
    // 17 `updated_at = now()` writes in this repo are all correct. An audit that
    // flagged them would be ignored within a week.
    const root = fixture('assignment', `const SQL = \`UPDATE x SET known_at = now()\`;`);
    assert.deepEqual(findPitNowViolations([root]), []);
  });

  it('ignores a lease or TTL comparison', () => {
    const root = fixture(
      'lease',
      `const SQL = \`WHERE lease_expires_at > now() AND fresh_until > now() AND period_end > now()\`;`,
    );
    assert.deepEqual(findPitNowViolations([root]), []);
  });

  it('ignores a comment that merely mentions the pattern', () => {
    const root = fixture(
      'comment',
      `// never write known_at <= now() here\nconst SQL = 'SELECT 1';`,
    );
    assert.deepEqual(findPitNowViolations([root]), []);
  });
});

describe('REQ-PIT-003 now() audit — allowlist behaviour', () => {
  it('passes on the real tree: every match is a recorded exception', () => {
    // If this fails, either a new violation landed or run-v2-graph-publish.ts was
    // migrated — both are things a reader must be told about rather than have
    // silently absorbed.
    const result = auditPitNow();
    assert.deepEqual(result.violations, [], 'a new now() cutoff was introduced');
    assert.deepEqual(result.staleAllowances, [], 'an allowlist entry no longer matches');
    assert.ok(result.allowed.length > 0, 'the known exceptions should still be found');
  });

  it('reports an unlisted violation rather than absorbing it', () => {
    const root = fixture('unlisted', `const SQL = \`WHERE available_at <= now()\`;`);
    const result = auditPitNow([root]);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.column, 'available_at');
  });

  it('reports every allowlist entry as stale when scanning a tree without them', () => {
    // The rot check: a list that keeps entries for problems that no longer exist
    // stops describing the codebase, and a reader cannot tell which are real.
    const root = fixture('clean', `const SQL = 'SELECT 1';`);
    const result = auditPitNow([root]);
    assert.ok(result.staleAllowances.length > 0);
  });
});
