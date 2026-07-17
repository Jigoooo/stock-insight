import { useRef, useState, type FormEvent, type ReactNode } from 'react';

import { AuthInputField } from './auth-input-field';
import styles from './auth-page.module.css';
import {
  validateSignupInput,
  type SignupFieldErrors,
  type SignupInput,
} from './model/signup-validation';

export type SignupCredentials = Pick<SignupInput, 'username' | 'password' | 'enrollmentCode'>;
export type SignupAvailability = 'checking' | 'available' | 'unavailable' | 'error';

export type SignupPageProps = {
  availability: SignupAvailability;
  onSubmit: (credentials: SignupCredentials) => void | Promise<void>;
  onRetryAvailability: () => void | Promise<void>;
  pending?: boolean;
  error?: string | null;
};

const setupNotes = [
  {
    title: '일회성 계정 설정',
    description: '첫 계정이 만들어지면 추가 가입은 닫힙니다.',
  },
  {
    title: '가입 코드로 보호',
    description: '관리자에게 전달받은 코드가 있어야 진행됩니다.',
  },
  {
    title: '개인 리서치 전용',
    description: '주문이나 거래 없이 판단 근거만 안전하게 남깁니다.',
  },
] as const;

const initialInput: SignupInput = {
  username: '',
  password: '',
  passwordConfirmation: '',
  enrollmentCode: '',
};

export function SignupPage({
  availability,
  error = null,
  onRetryAvailability,
  onSubmit,
  pending = false,
}: SignupPageProps) {
  const [input, setInput] = useState<SignupInput>(initialInput);
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordConfirmationRef = useRef<HTMLInputElement>(null);
  const enrollmentCodeRef = useRef<HTMLInputElement>(null);

  function updateField(field: keyof SignupInput, value: string) {
    setInput((current) => ({ ...current, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateSignupInput(input);
    setFieldErrors(nextErrors);

    const firstInvalidRef = nextErrors.username
      ? usernameRef
      : nextErrors.password
        ? passwordRef
        : nextErrors.passwordConfirmation
          ? passwordConfirmationRef
          : nextErrors.enrollmentCode
            ? enrollmentCodeRef
            : null;

    if (firstInvalidRef) {
      requestAnimationFrame(() => firstInvalidRef.current?.focus());
      return;
    }

    onSubmit({
      username: input.username,
      password: input.password,
      enrollmentCode: input.enrollmentCode,
    });
  }

  return (
    <div className={styles.page} data-layout="split-screen">
      <aside
        className={styles.brandPanel}
        data-panel="brand"
        aria-labelledby="signup-brand-heading"
      >
        <div className={styles.brandContent}>
          <a
            className={styles.brandLockup}
            href="/login"
            aria-label="Futur Insight 로그인으로 이동"
          >
            <span>
              <strong>Futur Insight</strong>
              <small>Research workspace</small>
            </span>
          </a>

          <div className={styles.brandHero}>
            <p className={styles.eyebrow}>One-time workspace setup</p>
            <h1 id="signup-brand-heading">
              처음 한 번만,
              <span>리서치 공간의 주인을 정합니다.</span>
            </h1>
            <p className={styles.heroDescription}>
              계정을 만든 뒤에는 이 가입 화면이 닫히고 로그인만 사용할 수 있습니다.
            </p>
          </div>

          <ol className={styles.setupList} aria-label="계정 설정 안내">
            {setupNotes.map(({ description, title }, index) => (
              <li key={title}>
                <span className={styles.setupIndex} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.setupCopy}>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
              </li>
            ))}
          </ol>

          <p className={styles.trustNote}>
            일회성 등록 · 이후 로그인 전용
          </p>
        </div>
      </aside>

      <main
        className={styles.signupPanel}
        data-panel="signup"
        aria-labelledby="signup-form-heading"
      >
        <div className={styles.formFrame}>
          {availability === 'checking' ? (
            <StatusView
              eyebrow="Workspace enrollment"
              title="가입 가능 여부를 확인하고 있습니다."
              description="잠시만 기다려 주세요."
            />
          ) : null}

          {availability === 'error' ? (
            <StatusView
              eyebrow="Connection required"
              title="가입 상태를 확인하지 못했습니다."
              description="연결 상태를 확인한 뒤 다시 시도해 주세요."
              action={
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={onRetryAvailability}
                >
                  다시 확인
                </button>
              }
            />
          ) : null}

          {availability === 'unavailable' ? (
            <StatusView
              eyebrow="Enrollment closed"
              title="가입 완료"
              description="가입 가능한 계정이 이미 설정되어 있습니다. 기존 계정으로 로그인해 주세요."
              action={
                <a className={styles.primaryLink} href="/login">
                  로그인
                </a>
              }
            />
          ) : null}

          {availability === 'available' ? (
            <>
              <header className={styles.formHeader}>
                <p className={styles.formEyebrow}>Create the workspace account</p>
                <h2 id="signup-form-heading">계정을 설정하세요.</h2>
                <p>사용할 이름과 긴 비밀번호, 전달받은 가입 코드를 입력해 주세요.</p>
              </header>

              <form className={styles.form} onSubmit={handleSubmit} aria-busy={pending} noValidate>
                <AuthInputField
                  ref={usernameRef}
                  id="signup-username"
                  name="username"
                  type="text"
                  label="사용자 이름"
                  hint="영문·숫자·마침표·밑줄·하이픈, 3–64자"
                  hintId="signup-username-hint"
                  error={fieldErrors.username}
                  errorId="signup-username-error"
                  autoComplete="username"
                  inputMode="text"
                  placeholder="사용자 이름 입력"
                  value={input.username}
                  onChange={(event) => updateField('username', event.target.value)}
                  aria-invalid={Boolean(fieldErrors.username)}
                  disabled={pending}
                />

                <AuthInputField
                  ref={passwordRef}
                  id="signup-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  label="비밀번호"
                  hint="12자 이상"
                  hintId="signup-password-hint"
                  error={fieldErrors.password}
                  errorId="signup-password-error"
                  autoComplete="new-password"
                  placeholder="비밀번호 입력"
                  value={input.password}
                  onChange={(event) => updateField('password', event.target.value)}
                  aria-invalid={Boolean(fieldErrors.password)}
                  disabled={pending}
                  endAction={
                    <button
                      className={styles.visibilityButton}
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시하기'}
                      aria-controls="signup-password signup-password-confirmation"
                      aria-pressed={showPassword}
                      disabled={pending}
                    >
                      {showPassword ? '숨기기' : '보기'}
                    </button>
                  }
                />

                <AuthInputField
                  ref={passwordConfirmationRef}
                  id="signup-password-confirmation"
                  name="passwordConfirmation"
                  type={showPassword ? 'text' : 'password'}
                  label="비밀번호 확인"
                  error={fieldErrors.passwordConfirmation}
                  errorId="signup-password-confirmation-error"
                  autoComplete="new-password"
                  placeholder="비밀번호 다시 입력"
                  value={input.passwordConfirmation}
                  onChange={(event) => updateField('passwordConfirmation', event.target.value)}
                  aria-invalid={Boolean(fieldErrors.passwordConfirmation)}
                  disabled={pending}
                />

                <AuthInputField
                  ref={enrollmentCodeRef}
                  id="signup-enrollment-code"
                  name="enrollmentCode"
                  type="password"
                  label="가입 코드"
                  hint="관리자에게 받은 일회성 코드"
                  hintId="signup-enrollment-code-hint"
                  error={fieldErrors.enrollmentCode}
                  errorId="signup-enrollment-code-error"
                  autoComplete="off"
                  placeholder="가입 코드 입력"
                  value={input.enrollmentCode}
                  onChange={(event) => updateField('enrollmentCode', event.target.value)}
                  aria-invalid={Boolean(fieldErrors.enrollmentCode)}
                  disabled={pending}
                />

                <div className={styles.feedbackSlot}>
                  {error ? (
                    <p className={styles.errorMessage} role="alert" aria-live="assertive">
                      {error}
                    </p>
                  ) : null}
                  <output className={styles.pendingMessage} aria-live="polite" aria-atomic="true">
                    {pending ? '계정을 안전하게 설정하고 있습니다.' : ''}
                  </output>
                </div>

                <button className={styles.submitButton} type="submit" disabled={pending}>
                  <span>{pending ? '설정 중' : '계정 만들기'}</span>
                </button>
              </form>

              <p className={styles.loginNote}>
                이미 계정이 있나요? <a href="/login">로그인</a>
              </p>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

type StatusViewProps = {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
};

function StatusView({ action, description, eyebrow, title }: StatusViewProps) {
  return (
    <section className={styles.statusView} aria-live="polite" aria-atomic="true">
      <p className={styles.formEyebrow}>{eyebrow}</p>
      <h2 id="signup-form-heading">{title}</h2>
      <p>{description}</p>
      {action ? <div className={styles.statusAction}>{action}</div> : null}
    </section>
  );
}
