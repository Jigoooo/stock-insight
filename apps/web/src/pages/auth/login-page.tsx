import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';

import { AuthInputField } from './auth-input-field';
import styles from './auth-page.module.css';
import {
  validateLoginCredentials,
  type LoginCredentialsInput,
  type LoginFieldErrors,
} from './model/login-validation';

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

  return (
    <div className={`${styles.page} ${styles.loginPage}`} data-layout="full-split">
      <div className={styles.loginWindow}>
        <aside className={styles.loginVisualPanel} aria-labelledby="login-visual-heading">
          <div className={styles.loginVisualContent}>
            <div className={styles.loginVisualHero}>
              <p>Research workspace</p>
              <h1 id="login-visual-heading">
                시장의 흐름을 읽고
                <span>판단의 근거를 남깁니다.</span>
              </h1>
              <small>흩어진 종목·뉴스·테마를 한 맥락으로 연결합니다.</small>
            </div>
          </div>
        </aside>

        <main
          className={`${styles.signInPanel} ${styles.loginFormPanel}`}
          data-panel="sign-in"
          aria-labelledby="login-form-heading"
        >
          <div className={`${styles.formFrame} ${styles.loginFormFrame}`}>
            <div className={styles.loginProductLockup} aria-label="Futur Insight">
              <strong>Futur Insight</strong>
            </div>
            <header className={styles.formHeader}>
              <h2 id="login-form-heading">로그인</h2>
              <p>계정으로 로그인해 리서치 워크스페이스를 확인하세요.</p>
            </header>

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
                <button
                  className={styles.visibilityButton}
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시하기'}
                  aria-controls="login-password"
                  aria-pressed={showPassword}
                  disabled={!hydrated || pending}
                >
                  {showPassword ? '숨기기' : '보기'}
                </button>
              }
            />

            <div className={styles.feedbackSlot}>
              {error ? (
                <p
                  id="login-error"
                  className={styles.errorMessage}
                  role="alert"
                  aria-live="assertive"
                >
                  {error}
                </p>
              ) : null}
              <output className={styles.pendingMessage} aria-live="polite" aria-atomic="true">
                {pending ? '계정 정보를 확인하고 있습니다.' : ''}
              </output>
            </div>

            <button className={styles.submitButton} type="submit" disabled={!hydrated || pending}>
              <span>{pending ? '확인 중' : '로그인'}</span>
            </button>
          </form>

            <p className={styles.signupPrompt}>
              처음 설정하시나요?{' '}
              <a className={styles.signupLink} href="/signup">
                계정 만들기
              </a>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
