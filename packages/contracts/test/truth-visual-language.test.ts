import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readFileSync } from 'node:fs';

import {
  epistemicClassForTruthClass,
  epistemicClassSchema,
  renderSpecForClass,
  renderSpecForTruthClass,
  resolveEdgeRenderSpec,
  truthClassRenderSpecSchema,
  truthClassSchema,
  truthRenderSpecSchema,
} from '../src/truth-visual-language.ts';

describe('P3-WA1 truth visual language', () => {
  it('exposes the six epistemic classes (§21.3)', () => {
    assert.deepEqual(
      [...epistemicClassSchema.options].sort(),
      ['candidate', 'causal', 'estimate', 'fact', 'forecast', 'hypothesis'].sort(),
    );
  });

  it('maps each class to a distinct, schema-valid render spec', () => {
    const specs = epistemicClassSchema.options.map((c) => {
      const spec = renderSpecForClass(c);
      truthRenderSpecSchema.parse(spec);
      return spec;
    });
    // Line style is a load-bearing distinction: fact solid, hypothesis dashed.
    assert.equal(renderSpecForClass('fact').lineStyle, 'solid');
    assert.equal(renderSpecForClass('hypothesis').lineStyle, 'dashed');
    // Causal is identified by an explicit label, never implied by style alone.
    assert.equal(renderSpecForClass('causal').requiresCausalLabel, true);
    assert.equal(renderSpecForClass('fact').requiresCausalLabel, false);
    // Estimate carries a distinct marker so it is never confused with a fact.
    assert.notEqual(renderSpecForClass('estimate').badge, renderSpecForClass('fact').badge);
    // Forecast is rendered as a distribution, not a point.
    assert.equal(renderSpecForClass('forecast').distribution, true);
    // Every class produces a distinct legend key.
    const legendKeys = specs.map((s) => s.legendKey);
    assert.equal(new Set(legendKeys).size, legendKeys.length);
  });

  it('hides candidate relations by default and only shows them in research mode (§S2)', () => {
    assert.equal(renderSpecForClass('candidate').defaultVisible, false);
    // fact/estimate/forecast/causal/hypothesis are visible by default.
    for (const c of ['fact', 'estimate', 'forecast', 'causal', 'hypothesis'] as const) {
      assert.equal(renderSpecForClass(c).defaultVisible, true);
    }
  });

  it('resolves an edge render spec that is fail-closed on an unverified candidate', () => {
    // In default (non-research) mode a candidate edge must not be rendered.
    const hidden = resolveEdgeRenderSpec({ epistemicClass: 'candidate', researchMode: false });
    assert.equal(hidden.visible, false);
    // In research mode the candidate becomes visible but stays dashed + flagged.
    const shown = resolveEdgeRenderSpec({ epistemicClass: 'candidate', researchMode: true });
    assert.equal(shown.visible, true);
    assert.equal(shown.spec.lineStyle, 'dashed');
    assert.equal(shown.spec.candidateOnly, true);
    // A fact edge is always visible regardless of research mode.
    assert.equal(
      resolveEdgeRenderSpec({ epistemicClass: 'fact', researchMode: false }).visible,
      true,
    );
  });

  it('rejects an unknown epistemic class rather than defaulting to a visible style', () => {
    assert.throws(() => renderSpecForClass('speculation' as never));
  });

  it('rejects render specs that contradict their epistemic class', () => {
    const candidate = renderSpecForClass('candidate');
    assert.throws(() =>
      truthRenderSpecSchema.parse({
        ...candidate,
        lineStyle: 'solid',
        badge: 'none',
        defaultVisible: true,
        candidateOnly: false,
      }),
    );
  });

  it('keeps canonical render specs immutable across consumers', () => {
    const candidate = renderSpecForClass('candidate');
    assert.equal(Object.isFrozen(candidate), true);
    assert.throws(() => {
      (candidate as unknown as { defaultVisible: boolean }).defaultVisible = true;
    }, TypeError);
    assert.equal(
      resolveEdgeRenderSpec({ epistemicClass: 'candidate', researchMode: false }).visible,
      false,
    );
  });

  it('is a pure deterministic mapping (same class yields an equal spec)', () => {
    assert.deepEqual(renderSpecForClass('estimate'), renderSpecForClass('estimate'));
  });
});

describe('truth classes — REQ-SEM-010 visual distinction', () => {
  const FREEZE = new URL(
    '../../../docs/plan/stock-crypto-investment-context-world-model-v2-final/',
    import.meta.url,
  );

  it('exposes exactly the 14 classes frozen in contracts/truth-classes.json', () => {
    const frozen = JSON.parse(
      readFileSync(new URL('contracts/truth-classes.json', FREEZE), 'utf8'),
    );
    assert.deepEqual([...truthClassSchema.options], frozen.classes);
    assert.equal(truthClassSchema.options.length, 14);
  });

  it('gives every class a schema-valid spec', () => {
    for (const truthClass of truthClassSchema.options) {
      truthClassRenderSpecSchema.parse(renderSpecForTruthClass(truthClass));
    }
  });

  it('renders no two classes identically (REQ-SEM-010)', () => {
    // The requirement is that a reader can tell classes apart. Identical
    // line+badge+distribution for two classes would break exactly that.
    const seen = new Map<string, string>();
    for (const truthClass of truthClassSchema.options) {
      const spec = renderSpecForTruthClass(truthClass);
      const key = `${spec.lineStyle}|${spec.badge}|${spec.distribution}`;
      const clash = seen.get(key);
      assert.equal(clash, undefined, `${truthClass} renders identically to ${clash}`);
      seen.set(key, truthClass);
    }
  });

  it('marks PERSONAL_DECISION as the only private-scope class (REQ-REC-001)', () => {
    const private_ = truthClassSchema.options.filter(
      (c) => renderSpecForTruthClass(c).privateScope,
    );
    assert.deepEqual(private_, ['PERSONAL_DECISION']);
  });

  it('keeps NARRATIVE visually distinct from FACT (narrative is not economic truth)', () => {
    const narrative = renderSpecForTruthClass('NARRATIVE');
    const fact = renderSpecForTruthClass('FACT');
    assert.notEqual(narrative.lineStyle, fact.lineStyle);
    assert.notEqual(narrative.badge, fact.badge);
  });

  it('keeps ASSERTION visually distinct from FACT (REQ-KERN-030)', () => {
    // "contracted" / "denied" / "under review" are assertions, not facts.
    assert.notEqual(
      renderSpecForTruthClass('ASSERTION').lineStyle,
      renderSpecForTruthClass('FACT').lineStyle,
    );
  });

  it('requires a causal label only for CAUSAL_ESTIMATE', () => {
    const labelled = truthClassSchema.options.filter(
      (c) => renderSpecForTruthClass(c).requiresCausalLabel,
    );
    assert.deepEqual(labelled, ['CAUSAL_ESTIMATE']);
  });

  it('draws only FORECAST as a distribution', () => {
    const distributions = truthClassSchema.options.filter(
      (c) => renderSpecForTruthClass(c).distribution,
    );
    assert.deepEqual(distributions, ['FORECAST']);
  });

  it('fails closed on an unknown class rather than defaulting to a fact style', () => {
    assert.throws(() => renderSpecForTruthClass('MADE_UP' as never));
  });

  it('keeps specs immutable across consumers', () => {
    const spec = renderSpecForTruthClass('EXPOSURE');
    assert.throws(() => {
      (spec as unknown as { privateScope: boolean }).privateScope = true;
    }, TypeError);
    assert.equal(renderSpecForTruthClass('EXPOSURE').privateScope, false);
  });

  it('maps the five overlapping classes to epistemic classes and nothing else', () => {
    const mapped = truthClassSchema.options
      .map((c) => [c, epistemicClassForTruthClass(c)] as const)
      .filter(([, e]) => e !== null);
    assert.deepEqual(mapped, [
      ['FACT', 'fact'],
      ['STATISTICAL_ESTIMATE', 'estimate'],
      ['CAUSAL_ESTIMATE', 'causal'],
      ['FORECAST', 'forecast'],
      ['HYPOTHESIS', 'hypothesis'],
    ]);
  });

  it('leaves the pre-existing six epistemic specs byte-identical (backward compatible)', () => {
    // Adding the truth-class layer must not move the shipped rendering contract.
    assert.deepEqual(renderSpecForClass('fact'), {
      epistemicClass: 'fact',
      lineStyle: 'solid',
      badge: 'none',
      requiresCausalLabel: false,
      distribution: false,
      defaultVisible: true,
      candidateOnly: false,
      legendKey: 'truth.fact',
    });
    assert.equal(renderSpecForClass('candidate').candidateOnly, true);
  });
});
