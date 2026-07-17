export const SESSION_COOKIE_NAME = '__Host-stock-insight-session';

function requireCookieToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) throw new Error('Session token is required');
  return encodeURIComponent(normalized);
}

function requireMaxAge(maxAgeSeconds: number): number {
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error('Session cookie Max-Age must be a positive integer');
  }
  return maxAgeSeconds;
}

const cookieBoundary = 'HttpOnly; Secure; SameSite=Strict; Path=/';

export function sessionCookieHeader(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE_NAME}=${requireCookieToken(token)}; ${cookieBoundary}; Max-Age=${requireMaxAge(maxAgeSeconds)}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; ${cookieBoundary}; Max-Age=0`;
}

export function readSessionCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(/;\s*/)) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator) !== SESSION_COOKIE_NAME) continue;
    const value = part.slice(separator + 1);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
}
