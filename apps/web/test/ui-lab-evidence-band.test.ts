import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

describe('UI Lab Evidence Band refinement', () => {
  it('defines range, event, and linked-evidence reading modes with shared selection semantics', async () => {
    const preview = await read('../src/pages/ui-lab/ui/evidence-band-preview.tsx');
    assert.match(preview, /A · Range Ledger/);
    assert.match(preview, /B · Event Pulse/);
    assert.match(preview, /C · Linked Evidence/);
    assert.match(preview, /data-slot="evidence-context-legend"/);
    assert.match(preview, /data-slot="evidence-selected-summary"/);
    assert.match(preview, /aria-current=\{selected \? 'true' : undefined\}/);
    assert.doesNotMatch(preview, /className=\{styles\.bandLabels\}/);
  });

  it('uses solid reference underlays and three distinct evidence layouts', async () => {
    const renderer = await read('../src/shared/ui/chart/internal/bklit-preview.tsx');
    const css = await read('../src/pages/ui-lab/ui/chart-catalog.module.css');
    assert.match(renderer, /pattern="none"/);
    assert.match(renderer, /fadeEdges=\{tone !== 'evidence-split'\}/);
    assert.match(css, /\.variantCard\[data-variant='band-ledger'\] \.evidenceRow/);
    assert.match(css, /\.variantCard\[data-variant='event-pulse'\] \.evidencePreview/);
    assert.match(css, /\.variantCard\[data-variant='evidence-split'\] \.evidencePreview/);
  });
});
