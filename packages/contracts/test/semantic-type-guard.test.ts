import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  checkDerivationInputs,
  checkTransition,
  findDerivationCycle,
  isAllowedTransition,
  SEMANTIC_TYPE_RULES,
  truthClassSchema,
} from '../src/semantic-type-guard.ts';

const FREEZE = new URL(
  '../../../docs/plan/stock-crypto-investment-context-world-model-v2-final/',
  import.meta.url,
);

const frozen = JSON.parse(
  readFileSync(new URL('contracts/semantic-type-rules.json', FREEZE), 'utf8'),
);

describe('semantic type guard — parity with the frozen rules', () => {
  // The module inlines the tables because it is imported by browser-facing code
  // with no filesystem. That is only safe if drift fails here.
  it('mirrors allowed_direction exactly, in order', () => {
    assert.deepEqual(
      SEMANTIC_TYPE_RULES.allowedDirections.map(([from, to]) => [from, to]),
      frozen.allowed_direction,
    );
  });

  it('mirrors the forbidden edges and their reasons', () => {
    assert.deepEqual(
      SEMANTIC_TYPE_RULES.forbiddenDirections.map((rule) => ({
        from: rule.from,
        to: rule.to,
        reason: rule.reason,
      })),
      frozen.forbidden,
    );
  });

  it('treats the freeze as requiring acyclicity', () => {
    assert.equal(frozen.acyclic, true);
  });

  it('declares the same 14 classes as contracts/truth-classes.json', () => {
    // This module declares the vocabulary locally because modules in this package
    // cannot import each other (tsc rejects the .ts specifier, Node requires it).
    // That is only safe while this assertion holds.
    const frozenClasses = JSON.parse(
      readFileSync(new URL('contracts/truth-classes.json', FREEZE), 'utf8'),
    );
    assert.deepEqual([...truthClassSchema.options], frozenClasses.classes);
  });

  it('names only real truth classes in the rule tables', () => {
    const known = new Set<string>(truthClassSchema.options);
    for (const [from, to] of SEMANTIC_TYPE_RULES.allowedDirections) {
      assert.ok(known.has(from), `${from} is not a truth class`);
      assert.ok(known.has(to), `${to} is not a truth class`);
    }
    for (const rule of SEMANTIC_TYPE_RULES.forbiddenDirections) {
      assert.ok(known.has(rule.from), `${rule.from} is not a truth class`);
      assert.ok(known.has(rule.to), `${rule.to} is not a truth class`);
    }
  });
});

describe('semantic type guard — the edges that destroy epistemics', () => {
  // canonical/00 §3. Each of these looks like "use what we have" at the call site.
  it('refuses a recommendation as evidence for a fact', () => {
    const violation = checkTransition('RECOMMENDATION', 'FACT');
    assert.equal(violation?.kind, 'forbidden');
    assert.match(violation!.reason, /decision output cannot become truth evidence/);
  });

  it('refuses a private decision mutating common truth (REQ-SEM-003)', () => {
    const violation = checkTransition('PERSONAL_DECISION', 'FACT');
    assert.equal(violation?.kind, 'forbidden');
    assert.match(violation!.reason, /private action cannot mutate common truth/);
  });

  it('refuses a forecast overwriting a historical assertion', () => {
    assert.equal(checkTransition('FORECAST', 'ASSERTION')?.kind, 'forbidden');
  });

  it('refuses narrative promoted to economic truth', () => {
    const violation = checkTransition('NARRATIVE', 'FACT');
    assert.equal(violation?.kind, 'forbidden');
    assert.match(violation!.reason, /attention is not economic truth/);
  });

  it('separates a named prohibition from a mere gap', () => {
    // Both reject; only the first can explain itself, and a reviewer needs to
    // know whether they hit a wall or an omission.
    assert.equal(checkTransition('NARRATIVE', 'FACT')?.kind, 'forbidden');
    assert.equal(checkTransition('OUTCOME', 'SOURCE')?.kind, 'not_allowed');
  });
});

describe('semantic type guard — allowed flow', () => {
  it('admits the canonical chain source → assertion → fact → exposure', () => {
    assert.ok(isAllowedTransition('SOURCE', 'ASSERTION'));
    assert.ok(isAllowedTransition('ASSERTION', 'FACT'));
    assert.ok(isAllowedTransition('FACT', 'EXPOSURE'));
    assert.ok(isAllowedTransition('EXPOSURE', 'STATISTICAL_ESTIMATE'));
  });

  it('admits recommendation → personal decision but not the reverse', () => {
    assert.ok(isAllowedTransition('RECOMMENDATION', 'PERSONAL_DECISION'));
    assert.ok(!isAllowedTransition('PERSONAL_DECISION', 'RECOMMENDATION'));
  });

  it('returns null for an allowed edge', () => {
    assert.equal(checkTransition('FACT', 'FORECAST'), null);
  });

  it('rejects an unknown class rather than passing it through', () => {
    assert.throws(() => checkTransition('MADE_UP' as never, 'FACT'));
  });
});

describe('semantic type guard — derivation inputs', () => {
  it('accepts a derivation whose every input is admitted', () => {
    assert.deepEqual(checkDerivationInputs('FORECAST', ['FACT', 'EVENT', 'CAUSAL_ESTIMATE']), []);
  });

  it('reports every bad input, not just the first', () => {
    // Three mistakes is a different problem from one, and reporting them one
    // error at a time hides that.
    const violations = checkDerivationInputs('FACT', [
      'ASSERTION',
      'RECOMMENDATION',
      'NARRATIVE',
      'PERSONAL_DECISION',
    ]);
    assert.equal(violations.length, 3);
    assert.deepEqual(
      violations.map((v) => v.from),
      ['RECOMMENDATION', 'NARRATIVE', 'PERSONAL_DECISION'],
    );
  });
});

describe('semantic type guard — acyclicity (REQ-SEM-001, REQ-KERN-040)', () => {
  it('returns null for an acyclic derivation graph', () => {
    assert.equal(
      findDerivationCycle([
        { from: 'd1', to: 'd2' },
        { from: 'd2', to: 'd3' },
        { from: 'd1', to: 'd3' },
      ]),
      null,
    );
  });

  it('finds a direct cycle and names the loop', () => {
    const cycle = findDerivationCycle([
      { from: 'd1', to: 'd2' },
      { from: 'd2', to: 'd1' },
    ]);
    assert.ok(cycle);
    assert.equal(cycle[0], cycle[cycle.length - 1], 'the reported path must close');
    assert.ok(cycle.includes('d1') && cycle.includes('d2'));
  });

  it('finds a cycle that only closes through several hops', () => {
    // The class table alone cannot catch this: FACT → FORECAST → OUTCOME are all
    // allowed, so a concrete graph can still close a loop.
    const cycle = findDerivationCycle([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
      { from: 'd', to: 'b' },
    ]);
    assert.ok(cycle);
    assert.ok(!cycle.includes('a'), 'the loop is b→c→d, not the path that reached it');
  });

  it('finds a self-loop', () => {
    assert.deepEqual(findDerivationCycle([{ from: 'd1', to: 'd1' }]), ['d1', 'd1']);
  });

  it('survives a chain deep enough to blow a recursive implementation', () => {
    const edges = Array.from({ length: 50_000 }, (_, index) => ({
      from: `n${index}`,
      to: `n${index + 1}`,
    }));
    assert.equal(findDerivationCycle(edges), null);

    edges.push({ from: 'n50000', to: 'n0' });
    assert.ok(findDerivationCycle(edges), 'a cycle closing a long chain must still be found');
  });
});
