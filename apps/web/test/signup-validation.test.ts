import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateSignupInput } from '../src/pages/auth/model/signup-validation.ts';

const validInput = {
  username: 'research.user_01',
  password: 'twelve-chars!',
  passwordConfirmation: 'twelve-chars!',
  enrollmentCode: 'one-time-code',
};

describe('signup input validation', () => {
  it('accepts every allowed username character at the length boundaries', () => {
    assert.deepEqual(validateSignupInput({ ...validInput, username: 'A.-' }), {});
    assert.deepEqual(validateSignupInput({ ...validInput, username: 'a'.repeat(64) }), {});
  });

  it('rejects usernames outside 3..64 ASCII characters', () => {
    assert.equal(
      validateSignupInput({ ...validInput, username: 'ab' }).username,
      '사용자 이름은 3자 이상이어야 합니다.',
    );
    assert.equal(
      validateSignupInput({ ...validInput, username: 'a'.repeat(65) }).username,
      '사용자 이름은 64자 이하여야 합니다.',
    );
    assert.equal(
      validateSignupInput({ ...validInput, username: '사용자' }).username,
      '영문, 숫자, 마침표, 밑줄, 하이픈만 사용할 수 있습니다.',
    );
    assert.equal(
      validateSignupInput({ ...validInput, username: 'has space' }).username,
      '영문, 숫자, 마침표, 밑줄, 하이픈만 사용할 수 있습니다.',
    );
  });

  it('enforces password length 12..1024 and exact confirmation', () => {
    const minimumPassword = 'a'.repeat(12);
    const maximumPassword = 'a'.repeat(1_024);
    assert.deepEqual(
      validateSignupInput({
        ...validInput,
        password: minimumPassword,
        passwordConfirmation: minimumPassword,
      }),
      {},
    );
    assert.deepEqual(
      validateSignupInput({
        ...validInput,
        password: maximumPassword,
        passwordConfirmation: maximumPassword,
      }),
      {},
    );
    assert.equal(
      validateSignupInput({ ...validInput, password: 'short', passwordConfirmation: 'short' })
        .password,
      '비밀번호는 12자 이상이어야 합니다.',
    );
    assert.equal(
      validateSignupInput({
        ...validInput,
        password: 'a'.repeat(1_025),
        passwordConfirmation: 'a'.repeat(1_025),
      }).password,
      '비밀번호는 1024자 이하여야 합니다.',
    );
    assert.equal(
      validateSignupInput({ ...validInput, passwordConfirmation: 'different-pass' })
        .passwordConfirmation,
      '비밀번호가 일치하지 않습니다.',
    );
  });

  it('requires a nonempty enrollment code no longer than 256 characters', () => {
    assert.equal(
      validateSignupInput({ ...validInput, enrollmentCode: '   ' }).enrollmentCode,
      '가입 코드를 입력해 주세요.',
    );
    assert.equal(
      validateSignupInput({ ...validInput, enrollmentCode: 'a'.repeat(257) }).enrollmentCode,
      '가입 코드는 256자 이하여야 합니다.',
    );
    assert.deepEqual(validateSignupInput({ ...validInput, enrollmentCode: 'a'.repeat(256) }), {});
  });

  it('returns Korean guidance for every empty field in form order', () => {
    assert.deepEqual(
      validateSignupInput({
        username: '',
        password: '',
        passwordConfirmation: '',
        enrollmentCode: '',
      }),
      {
        username: '사용자 이름을 입력해 주세요.',
        password: '비밀번호를 입력해 주세요.',
        passwordConfirmation: '비밀번호를 한 번 더 입력해 주세요.',
        enrollmentCode: '가입 코드를 입력해 주세요.',
      },
    );
  });
});
