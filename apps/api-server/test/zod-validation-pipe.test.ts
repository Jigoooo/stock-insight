import assert from 'node:assert/strict';
import test from 'node:test';

import { z } from 'zod';

import { ZodValidationPipe } from '../dist/index.js';

test('passes valid input through with coercion result', () => {
  const pipe = new ZodValidationPipe(z.object({ limit: z.coerce.number().int().max(100) }));
  assert.deepEqual(pipe.transform({ limit: '20' }), { limit: 20 });
});

test('rejects invalid input with structured issues', () => {
  const pipe = new ZodValidationPipe(z.object({ market: z.enum(['KR', 'US']) }));
  try {
    pipe.transform({ market: 'JP' });
    assert.fail('expected BadRequestException');
  } catch (error) {
    const response = (error as { getResponse: () => unknown }).getResponse() as {
      code: string;
      issues: { path: string; message: string }[];
    };
    assert.equal(response.code, 'VALIDATION_FAILED');
    assert.equal(response.issues.length, 1);
    assert.equal(response.issues[0]?.path, 'market');
  }
});
