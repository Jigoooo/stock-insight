import '@tanstack/react-start/server-only';

import {
  signAnonymousInternalContext,
  signInternalUserContext,
} from '@stock-insight/contracts/internal-context';

// The BFF's single doorway to the brain (api-server). Replaces every direct
// PostgreSQL connection apps/web used to open, so this process no longer holds
// database credentials at all — only the internal-context signing secret.
//
// Every request carries a freshly minted HMAC context bound to the exact method
// and path, with a short TTL, so a captured header cannot be replayed against a
// different route or after it expires.

const CONTEXT_TTL_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 15_000;

let cachedSecret: Promise<Buffer> | undefined;

function requireBaseUrl(): string {
  const raw = process.env.STOCK_INSIGHT_BRAIN_URL?.trim();
  if (!raw) throw new Error('STOCK_INSIGHT_BRAIN_URL is required');
  return raw.replace(/\/$/, '');
}

async function loadSecret(): Promise<Buffer> {
  const inline = process.env.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET?.trim();
  if (inline) {
    if (inline.length < 32) {
      throw new Error('Internal context secret must be at least 32 characters');
    }
    return Buffer.from(inline, 'utf8');
  }
  const file = process.env.STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE?.trim();
  if (!file) {
    throw new Error(
      'STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET_FILE or STOCK_INSIGHT_INTERNAL_CONTEXT_SECRET is required',
    );
  }
  const { readFile } = await import('node:fs/promises');
  const secret = (await readFile(file, 'utf8')).trim();
  if (secret.length < 32) {
    throw new Error('Internal context secret must be at least 32 characters');
  }
  return Buffer.from(secret, 'utf8');
}

function secret(): Promise<Buffer> {
  cachedSecret ??= loadSecret();
  return cachedSecret;
}

/** Test hook: forget the memoised secret so a suite can swap the env. */
export function resetBrainClientCache(): void {
  cachedSecret = undefined;
}

export class BrainRequestError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message = `Brain request failed (${status})`) {
    super(message);
    this.name = 'BrainRequestError';
    this.status = status;
    this.body = body;
  }
}

export type BrainQuery = Record<string, string | number | boolean | undefined | null>;

export type BrainRequestOptions = Readonly<{
  // 'user' binds the caller's RLS scope; 'anonymous' is only for the
  // pre-authentication auth routes, which have no user id yet.
  scope: { kind: 'user'; userId: string } | { kind: 'anonymous' };
  method?: 'GET' | 'POST' | 'DELETE';
  query?: BrainQuery;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}>;

function buildTarget(path: string, query?: BrainQuery): { url: string; path: string } {
  const base = requireBaseUrl();
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  // The context MAC binds the path WITHOUT the query string, matching how the
  // api-server guard strips it before verifying.
  return { url: url.toString(), path: url.pathname };
}

// Cloudflare Access sits in front of the brain when it is reached over the
// public hostname. These are service-token credentials, not user credentials.
function accessHeaders(): Record<string, string> {
  const id = process.env.STOCK_INSIGHT_BRAIN_ACCESS_CLIENT_ID?.trim();
  const secretValue = process.env.STOCK_INSIGHT_BRAIN_ACCESS_CLIENT_SECRET?.trim();
  if (!id || !secretValue) return {};
  return { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secretValue };
}

export async function brainRequest<T = unknown>(
  path: string,
  options: BrainRequestOptions,
): Promise<T> {
  const method = options.method ?? 'GET';
  const { url, path: signedPath } = buildTarget(path, options.query);
  const key = await secret();
  const now = Math.floor(Date.now() / 1000);

  const context =
    options.scope.kind === 'user'
      ? signInternalUserContext(key, {
          userId: options.scope.userId,
          method,
          path: signedPath,
          now,
          ttlSeconds: CONTEXT_TTL_SECONDS,
        })
      : signAnonymousInternalContext(key, {
          method,
          path: signedPath,
          now,
          ttlSeconds: CONTEXT_TTL_SECONDS,
        });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        'x-internal-user-context': context,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...accessHeaders(),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }

  if (!response.ok) throw new BrainRequestError(response.status, parsed);
  return parsed as T;
}

// Binary variant for vector tiles, which are not JSON.
export async function brainRequestBinary(
  path: string,
  options: BrainRequestOptions,
): Promise<Uint8Array> {
  const method = options.method ?? 'GET';
  const { url, path: signedPath } = buildTarget(path, options.query);
  const key = await secret();
  const now = Math.floor(Date.now() / 1000);
  if (options.scope.kind !== 'user') throw new Error('Binary brain reads require a user scope');

  const context = signInternalUserContext(key, {
    userId: options.scope.userId,
    method,
    path: signedPath,
    now,
    ttlSeconds: CONTEXT_TTL_SECONDS,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { 'x-internal-user-context': context, ...accessHeaders(), ...options.headers },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    throw new BrainRequestError(response.status, parsed);
  }
  return new Uint8Array(await response.arrayBuffer());
}
