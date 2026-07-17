import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

type EnvSource = Record<string, string | undefined>;
type SecretReader = (path: string) => Promise<string>;

export type AuthRuntimeConfig = {
  staticCredential?: {
    username: string;
    passwordRecord: string;
  };
  enrollmentTokenHash?: string;
  sessionSecret: string;
  appOrigin: string;
  sessionTtlSeconds: number;
};

const invalidConfig = () => new Error('Invalid authentication runtime configuration');

function requireValue(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw invalidConfig();
  return normalized;
}

function parseUsername(value: string | undefined): string {
  const username = requireValue(value);
  if (username.length > 64 || !/^[A-Za-z0-9._-]+$/.test(username)) throw invalidConfig();
  return username;
}

function parseSecretPath(value: string | undefined): string {
  const path = requireValue(value);
  if (!isAbsolute(path)) throw invalidConfig();
  return path;
}

function parseOptionalSecretPath(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : parseSecretPath(value);
}

function parseOrigin(value: string | undefined): string {
  const origin = requireValue(value);
  const url = new URL(origin);
  const isLoopback =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (
    url.origin !== origin ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback))
  ) {
    throw invalidConfig();
  }
  return origin;
}

function parseSessionTtl(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 28_800;
  if (!/^\d+$/.test(value)) throw invalidConfig();
  const ttl = Number(value);
  if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > 86_400) throw invalidConfig();
  return ttl;
}

const defaultSecretReader: SecretReader = (path) => readFile(path, 'utf8');

export async function loadAuthRuntimeConfig(
  source: EnvSource = process.env,
  readSecret: SecretReader = defaultSecretReader,
): Promise<AuthRuntimeConfig> {
  try {
    const usernameSource = source.STOCK_INSIGHT_AUTH_USERNAME;
    const passwordRecordPath = parseOptionalSecretPath(
      source.STOCK_INSIGHT_AUTH_PASSWORD_RECORD_FILE,
    );
    const hasUsername = usernameSource !== undefined && usernameSource.trim() !== '';
    if (hasUsername !== Boolean(passwordRecordPath)) throw invalidConfig();
    const username = hasUsername ? parseUsername(usernameSource) : undefined;
    const enrollmentTokenHashPath = parseOptionalSecretPath(
      source.STOCK_INSIGHT_AUTH_ENROLLMENT_TOKEN_HASH_FILE,
    );
    const sessionSecretPath = parseSecretPath(source.STOCK_INSIGHT_SESSION_SECRET_FILE);
    const appOrigin = parseOrigin(source.STOCK_INSIGHT_APP_ORIGIN);
    const sessionTtlSeconds = parseSessionTtl(source.STOCK_INSIGHT_SESSION_TTL_SECONDS);
    const [passwordRecordRaw, enrollmentTokenHashRaw, sessionSecretRaw] = await Promise.all([
      passwordRecordPath ? readSecret(passwordRecordPath) : Promise.resolve(undefined),
      enrollmentTokenHashPath ? readSecret(enrollmentTokenHashPath) : Promise.resolve(undefined),
      readSecret(sessionSecretPath),
    ]);
    const passwordRecord = passwordRecordRaw?.trim();
    const enrollmentTokenHash = enrollmentTokenHashRaw?.trim().toLowerCase();
    const sessionSecret = sessionSecretRaw.trim();
    if ((username && !passwordRecord) || sessionSecret.length < 32) throw invalidConfig();
    if (enrollmentTokenHash && !/^[0-9a-f]{64}$/.test(enrollmentTokenHash)) {
      throw invalidConfig();
    }

    const config: AuthRuntimeConfig = {
      sessionSecret,
      appOrigin,
      sessionTtlSeconds,
    };
    if (username && passwordRecord) config.staticCredential = { username, passwordRecord };
    if (enrollmentTokenHash) config.enrollmentTokenHash = enrollmentTokenHash;
    return config;
  } catch {
    throw invalidConfig();
  }
}
