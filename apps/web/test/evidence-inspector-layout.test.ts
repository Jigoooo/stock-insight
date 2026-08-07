import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  clampEvidenceInspectorWidth,
  evidenceInspectorDefaultWidth,
  evidenceInspectorMaxWidth,
  evidenceInspectorMinWidth,
  parseStoredEvidenceInspectorWidth,
} from '../src/pages/research-workspace/model/evidence-inspector-layout.ts';

describe('evidence inspector layout', () => {
  it('uses the approved defaults and clamps width to the desktop viewport', () => {
    assert.equal(evidenceInspectorDefaultWidth, 520);
    assert.equal(evidenceInspectorMinWidth, 420);
    assert.equal(evidenceInspectorMaxWidth, 760);
    assert.equal(clampEvidenceInspectorWidth(300, 1440), 420);
    assert.equal(clampEvidenceInspectorWidth(900, 1440), 760);
    assert.equal(clampEvidenceInspectorWidth(760, 700), 676);
  });

  it('accepts only finite stored widths and falls back to 520px', () => {
    assert.equal(parseStoredEvidenceInspectorWidth('612', 1440), 612);
    assert.equal(parseStoredEvidenceInspectorWidth('999', 1440), 760);
    assert.equal(parseStoredEvidenceInspectorWidth('invalid', 1440), 520);
    assert.equal(parseStoredEvidenceInspectorWidth(null, 1440), 520);
  });
});
