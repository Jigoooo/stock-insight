import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

type EnvSource = Record<string, string | undefined>;
type SecretReader = (path: string) => Promise<string>;

// Runtime configuration for the BFF's session layer. Credential material
// (password records, enrollment-code digests) is NOT part of this any more: the
// brain owns it, so the only secret this process loads is the session signing
// key. STOCK_INSIGHT_AUTH_USERNAME / _PASSWORD_RECORD_FILE /
// _ENROLLMENT_TOKEN_HASH_FILE are intentionally no longer read.
export type AuthRuntimeConfig = {
  sessionSecret: string;
  appOrigin: string;
  sessionTtlSeconds: number;
  signupEnabled: boolean;
};

const invalidConfig = () => new Error('Invalid authentication runtime configuration');

function requireValue(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw invalidConfig();
  return normalized;
}

function parseSecretPath(value: string | undefined): string {
  const path = requireValue(value);
  if (!isAbsolute(path)) throw invalidConfig();
  return path;
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
    const sessionSecretPath = parseSecretPath(source.STOCK_INSIGHT_SESSION_SECRET_FILE);
    const appOrigin = parseOrigin(source.STOCK_INSIGHT_APP_ORIGIN);
    const sessionTtlSeconds = parseSessionTtl(source.STOCK_INSIGHT_SESSION_TTL_SECONDS);
    const sessionSecret = (await readSecret(sessionSecretPath)).trim();
    if (sessionSecret.length < 32) throw invalidConfig();

    return {
      sessionSecret,
      appOrigin,
      sessionTtlSeconds,
      signupEnabled: source.STOCK_INSIGHT_SIGNUP_ENABLED === 'true',
    };
  } catch {
    throw invalidConfig();
  }
}
