import { useRef, useState, type FormEvent, type ReactNode } from 'react';

import { AuthFeedbackRegion, type AuthFeedbackState } from './auth-feedback-region';
import { AuthInputField } from './auth-input-field';
import styles from './auth-page.module.css';
import { AuthShell } from './auth-shell';
import {
  validateSignupInput,
  type SignupFieldErrors,
  type SignupInput,
} from './model/signup-validation';
import { Button } from '@/shared/ui/button';
import { PresenceRegion } from '@/shared/ui/motion';
import { TextLink } from '@/shared/ui/link';

export type SignupCredentials = Pick<SignupInput, 'username' | 'password' | 'enrollmentCode'>;
export type SignupAvailability = 'checking' | 'available' | 'unavailable' | 'error';

export type SignupPageProps = {
  availability: SignupAvailability;
  onSubmit: (credentials: SignupCredentials) => void | Promise<void>;
  onRetryAvailability: () => void | Promise<void>;
  pending?: boolean;
  error?: string | null;
};

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
  const feedbackState: AuthFeedbackState = error
    ? { key: 'error', id: 'signup-error', message: error }
    : pending
      ? { key: 'pending', message: '계정을 안전하게 설정하고 있습니다.' }
      : { key: 'idle' };
  const submitErrorDescription = error ? 'signup-error' : undefined;

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
    <AuthShell headingId="signup-form-heading">
      <PresenceRegion
        className={styles.availabilityRegion}
        mode="wait"
        presenceKey={availability}
        present
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        {availability === 'checking' ? (
          <StatusView
            title="가입 가능 여부를 확인하고 있습니다."
            description="잠시만 기다려 주세요."
          />
        ) : null}

        {availability === 'error' ? (
          <StatusView
            title="가입 상태를 확인하지 못했습니다."
            description="연결 상태를 확인한 뒤 다시 시도해 주세요."
            action={
              <Button
                className={styles.secondaryButton}
                variant="secondary"
                type="button"
                onClick={onRetryAvailability}
              >
                다시 확인
              </Button>
            }
          />
        ) : null}

        {availability === 'unavailable' ? (
          <StatusView
            title="가입 완료"
            description="가입 가능한 계정이 이미 설정되어 있습니다. 기존 계정으로 로그인해 주세요."
            action={
              <TextLink className={styles.primaryLink} motion="quiet" href="/login">
                로그인
              </TextLink>
            }
          />
        ) : null}

        {availability === 'available' ? (
          <>
            <header className={styles.formHeader}>
              <h1 id="signup-form-heading">계정을 설정하세요.</h1>
            </header>

            <form className={styles.form} onSubmit={handleSubmit} aria-busy={pending} noValidate>
              <AuthInputField
                ref={usernameRef}
                id="signup-username"
                name="username"
                type="text"
                label="사용자 이름"
                hint="영문·숫자·마침표·밑줄·하이픈, 3-64자"
                hintId="signup-username-hint"
                error={fieldErrors.username}
                errorId="signup-username-error"
                autoComplete="username"
                inputMode="text"
                placeholder="사용자 이름 입력"
                value={input.username}
                onChange={(event) => updateField('username', event.target.value)}
                aria-invalid={Boolean(fieldErrors.username)}
                aria-describedby={submitErrorDescription}
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
                aria-describedby={submitErrorDescription}
                disabled={pending}
                endAction={
                  <Button
                    className={styles.visibilityButton}
                    variant="ghost"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시하기'}
                    aria-controls="signup-password signup-password-confirmation"
                    aria-pressed={showPassword}
                    disabled={pending}
                  >
                    {showPassword ? '숨기기' : '보기'}
                  </Button>
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
                aria-describedby={submitErrorDescription}
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
                aria-describedby={submitErrorDescription}
                disabled={pending}
              />

              <AuthFeedbackRegion state={feedbackState} />

              <Button
                className={styles.submitButton}
                variant="primary"
                pending={pending}
                pendingLabel="설정 중"
                type="submit"
              >
                계정 만들기
              </Button>
            </form>

            <p className={styles.loginNote}>
              이미 계정이 있나요?{' '}
              <TextLink motion="quiet" href="/login">
                로그인
              </TextLink>
            </p>
          </>
        ) : null}
      </PresenceRegion>
    </AuthShell>
  );
}

type StatusViewProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

function StatusView({ action, description, title }: StatusViewProps) {
  return (
    <section className={styles.statusView} aria-live="polite" aria-atomic="true">
      <h1 id="signup-form-heading">{title}</h1>
      <p>{description}</p>
      {action ? <div className={styles.statusAction}>{action}</div> : null}
    </section>
  );
}
