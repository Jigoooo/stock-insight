import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { summarizeCssSources } from '../scripts/audit-design-profile.mjs';

describe('advisory design profile audit', () => {
  it('reports aesthetic choices without treating them as failures', () => {
    const report = summarizeCssSources([
      {
        path: 'public/styles/profiles/expressive.css',
        kind: 'profile',
        source: `
          :root {
            --color-canvas: #fff4fb;
            --radius-panel: 32px;
            --duration-base: 420ms;
            background: linear-gradient(#fff4fb, #e8d7ff);
            box-shadow: 0 20px 60px rgb(80 20 100 / 30%);
          }
        `,
      },
      {
        path: 'src/pages/example.module.css',
        kind: 'component',
        source: '.example { color: #123456; border-radius: 7px; }',
      },
      {
        path: 'src/pages/example.tsx',
        kind: 'script',
        source:
          "gsap.to(node, { y: -10, duration: 0.2, ease: 'power2.out' }); const color = '#abcdef';",
      },
    ]);

    assert.equal(report.mode, 'advisory');
    assert.equal(report.summary.files, 3);
    assert.equal(report.summary.profiles, 1);
    assert.equal(report.summary.scripts, 1);
    assert.equal(report.summary.gradients, 1);
    assert.equal(report.summary.shadows, 1);
    assert.equal(report.summary.literalRadii, 2);
    assert.equal(report.summary.motionDurations, 1);
    assert.equal(report.summary.profileTokenDefinitions, 3);
    assert.equal(report.summary.componentTokenOverrides, 0);
    assert.equal(report.summary.componentDirectColors, 1);
    assert.equal(report.summary.scriptDirectColors, 1);
    assert.equal(report.summary.scriptMotionRecipes, 3);
    assert.deepEqual(report.componentDirectColorFiles, ['src/pages/example.module.css']);
    assert.deepEqual(report.radiusSpread, { minPx: 7, maxPx: 32, distinctPx: [7, 32] });
    assert.deepEqual(report.density, {
      compactHeightDeclarations: 0,
      compactPaddingDeclarations: 0,
    });
    assert.equal(report.blocking, false);
  });
});
