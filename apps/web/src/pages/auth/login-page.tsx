import { useReducedMotion } from 'motion/react';
import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';

import { AuthFeedbackRegion, type AuthFeedbackState } from './auth-feedback-region';
import { AuthInputField } from './auth-input-field';
import styles from './auth-page.module.css';
import { AuthShell } from './auth-shell';
import {
  validateLoginCredentials,
  type LoginCredentialsInput,
  type LoginFieldErrors,
} from './model/login-validation';
import { Button } from '@/shared/ui/animate-ui/components/buttons/button';
import { TextLink } from '@/shared/ui/primitives/link';

export type LoginCredentials = LoginCredentialsInput;

export type LoginPageProps = {
  onSubmit: (credentials: LoginCredentials) => void | Promise<void>;
  pending?: boolean;
  error?: string | null;
  initialUsername?: string;
};

const subscribeHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;
const authButtonHoverScale = 1.01;
const authButtonTapScale = 0.985;

export function LoginPage({
  error = null,
  initialUsername = '',
  onSubmit,
  pending = false,
}: LoginPageProps) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();
  const disableButtonMotion = !hydrated || pending || reducedMotion;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const credentials = { username, password };
    const nextErrors = validateLoginCredentials(credentials);
    setFieldErrors(nextErrors);

    if (nextErrors.username || nextErrors.password) {
      requestAnimationFrame(() => {
        (nextErrors.username ? usernameRef : passwordRef).current?.focus();
      });
      return;
    }

    onSubmit(credentials);
  }

  const usernameDescribedBy = error ? 'login-error' : undefined;
  const passwordDescribedBy = error ? 'login-error' : undefined;
  const feedbackState: AuthFeedbackState = error
    ? { key: 'error', id: 'login-error', message: error }
    : pending
      ? { key: 'pending', message: '계정 정보를 확인하고 있습니다.' }
      : { key: 'idle' };

  return (
    <AuthShell
      headingId="login-form-heading"
      title="로그인"
      footer={
        <p className={styles.signupPrompt}>
          처음 설정하시나요?{' '}
          <TextLink className={styles.signupLink} motion="quiet" href="/signup">
            계정 만들기
          </TextLink>
        </p>
      }
    >
      <form
        className={styles.form}
        method="post"
        onSubmit={handleSubmit}
        aria-busy={pending}
        noValidate
      >
        <AuthInputField
          ref={usernameRef}
          id="login-username"
          name="username"
          type="text"
          label="사용자 이름"
          error={fieldErrors.username}
          errorId="login-username-error"
          autoComplete="username"
          inputMode="text"
          placeholder="사용자 이름 입력"
          value={username}
          onChange={(event) => {
            const nextUsername = event.target.value;
            setUsername(nextUsername);
            if (fieldErrors.username && nextUsername.trim()) {
              setFieldErrors((current) => ({ ...current, username: undefined }));
            }
          }}
          aria-invalid={Boolean(fieldErrors.username || error)}
          aria-describedby={usernameDescribedBy}
          disabled={!hydrated || pending}
        />

        <AuthInputField
          ref={passwordRef}
          id="login-password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          label="비밀번호"
          error={fieldErrors.password}
          errorId="login-password-error"
          autoComplete="current-password"
          placeholder="비밀번호 입력"
          value={password}
          onChange={(event) => {
            const nextPassword = event.target.value;
            setPassword(nextPassword);
            if (fieldErrors.password && nextPassword) {
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }
          }}
          aria-invalid={Boolean(fieldErrors.password || error)}
          aria-describedby={passwordDescribedBy}
          disabled={!hydrated || pending}
          endAction={
            <Button
              className={styles.visibilityButton}
              variant="ghost"
              hoverScale={1}
              tapScale={1}
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시하기'}
              aria-controls="login-password"
              aria-pressed={showPassword}
              disabled={!hydrated || pending}
            >
              {showPassword ? '숨기기' : '보기'}
            </Button>
          }
        />

        <AuthFeedbackRegion state={feedbackState} />

        <Button
          className={styles.submitButton}
          variant="accent"
          hoverScale={disableButtonMotion ? 1 : authButtonHoverScale}
          tapScale={disableButtonMotion ? 1 : authButtonTapScale}
          type="submit"
          disabled={!hydrated || pending}
        >
          {pending ? '확인 중' : '로그인'}
        </Button>
      </form>
    </AuthShell>
  );
}
