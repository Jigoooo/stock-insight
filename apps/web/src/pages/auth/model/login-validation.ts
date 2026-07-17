export type LoginCredentialsInput = {
  username: string;
  password: string;
};

export type LoginFieldErrors = Partial<Record<keyof LoginCredentialsInput, string>>;

export function validateLoginCredentials({
  username,
  password,
}: LoginCredentialsInput): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  if (!username.trim()) errors.username = '사용자 이름을 입력해 주세요.';
  if (!password) errors.password = '비밀번호를 입력해 주세요.';
  return errors;
}
