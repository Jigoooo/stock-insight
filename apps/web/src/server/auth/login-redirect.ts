const defaultRedirect = '/';

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return true;
    }
  }
  return false;
}

export function sanitizeLoginRedirect(candidate: unknown): string {
  if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//')) {
    return defaultRedirect;
  }

  try {
    const decoded = decodeURIComponent(candidate);
    if (decoded.includes('\\') || containsControlCharacter(decoded)) return defaultRedirect;

    const url = new URL(candidate, 'https://stock-insight.invalid');
    if (url.origin !== 'https://stock-insight.invalid' || url.pathname === '/login') {
      return defaultRedirect;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return defaultRedirect;
  }
}
