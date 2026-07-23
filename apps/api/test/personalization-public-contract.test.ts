import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { DECISION_REASON_CODES } from '../src/personalization/decision-runtime.ts';

import { personalizationDecisionReasonCodeSchema } from '@stock-insight/contracts/personalization';

const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('P4-C public personalization engine surface', () => {
  it('exports every deterministic P4-B engine through the API package root', () => {
    for (const modulePath of [
      './personalization/decision-runtime',
      './personalization/dynamic-probability-model',
      './personalization/multi-asset-optimizer',
      './personalization/portfolio-optimizer',
    ]) {
      assert.match(indexSource, new RegExp(`from '${modulePath.replaceAll('/', '\\/')}'`));
    }
  });

  it('keeps the API runtime and public contract on the same 18 reason codes', () => {
    assert.deepEqual(DECISION_REASON_CODES, personalizationDecisionReasonCodeSchema.options);
  });
});
