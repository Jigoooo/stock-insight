export type SignupInput = {
  username: string;
  password: string;
  passwordConfirmation: string;
  enrollmentCode: string;
};

export type SignupFieldErrors = Partial<Record<keyof SignupInput, string>>;

const usernamePattern = /^[A-Za-z0-9._-]+$/;

export function validateSignupInput({
  username,
  password,
  passwordConfirmation,
  enrollmentCode,
}: SignupInput): SignupFieldErrors {
  const errors: SignupFieldErrors = {};

  if (!username) {
    errors.username = '사용자 이름을 입력해 주세요.';
  } else if (username.length < 3) {
    errors.username = '사용자 이름은 3자 이상이어야 합니다.';
  } else if (username.length > 64) {
    errors.username = '사용자 이름은 64자 이하여야 합니다.';
  } else if (!usernamePattern.test(username)) {
    errors.username = '영문, 숫자, 마침표, 밑줄, 하이픈만 사용할 수 있습니다.';
  }

  if (!password) {
    errors.password = '비밀번호를 입력해 주세요.';
  } else if (password.length < 12) {
    errors.password = '비밀번호는 12자 이상이어야 합니다.';
  } else if (password.length > 1_024) {
    errors.password = '비밀번호는 1024자 이하여야 합니다.';
  }

  if (!passwordConfirmation) {
    errors.passwordConfirmation = '비밀번호를 한 번 더 입력해 주세요.';
  } else if (passwordConfirmation !== password) {
    errors.passwordConfirmation = '비밀번호가 일치하지 않습니다.';
  }

  if (!enrollmentCode.trim()) {
    errors.enrollmentCode = '가입 코드를 입력해 주세요.';
  } else if (enrollmentCode.length > 256) {
    errors.enrollmentCode = '가입 코드는 256자 이하여야 합니다.';
  }

  return errors;
}
