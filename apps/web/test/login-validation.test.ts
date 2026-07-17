import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateLoginCredentials } from '../src/pages/auth/model/login-validation.ts';

describe('login credential validation', () => {
  it('returns field-specific Korean guidance for empty credentials', () => {
    assert.deepEqual(validateLoginCredentials({ username: '', password: '' }), {
      username: '사용자 이름을 입력해 주세요.',
      password: '비밀번호를 입력해 주세요.',
    });
  });

  it('treats a whitespace-only username as empty', () => {
    assert.deepEqual(validateLoginCredentials({ username: '   ', password: 'secret' }), {
      username: '사용자 이름을 입력해 주세요.',
    });
  });

  it('accepts credentials when both fields contain a value', () => {
    assert.deepEqual(validateLoginCredentials({ username: 'jigoo', password: 'secret' }), {});
  });
});
