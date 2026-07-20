import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  InternalContextError,
  requireRequestUserScope,
  runWithRequestUserScope,
} from '../src/read/internal-context-store.ts';

const USER_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('api-server request user-scope store', () => {
  it('exposes the scope inside runWithRequestUserScope', () => {
    const seen = runWithRequestUserScope({ userId: USER_ID }, () => requireRequestUserScope());
    assert.equal(seen.userId, USER_ID);
  });

  it('fails closed when no scope is bound to the async context', () => {
    assert.throws(() => requireRequestUserScope(), InternalContextError);
  });

  it('does not leak a scope outside its run boundary', () => {
    runWithRequestUserScope({ userId: USER_ID }, () => undefined);
    assert.throws(() => requireRequestUserScope(), InternalContextError);
  });
});
