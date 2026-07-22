import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  epistemicClassSchema,
  renderSpecForClass,
  resolveEdgeRenderSpec,
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
