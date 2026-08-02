const loopbackHostnames = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isSameOriginRequest(
  method: string,
  requestOrigin: string | null | undefined,
  expectedOrigin: string,
): boolean {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') return true;
  if (!requestOrigin) return false;

  try {
    const requestUrl = new URL(requestOrigin);
    const expectedUrl = new URL(expectedOrigin);
    const originsAreCanonical =
      requestOrigin === requestUrl.origin && expectedOrigin === expectedUrl.origin;
    if (!originsAreCanonical) return false;
    if (requestUrl.origin === expectedUrl.origin) return true;

    return (
      requestUrl.protocol === expectedUrl.protocol &&
      requestUrl.port === expectedUrl.port &&
      loopbackHostnames.has(requestUrl.hostname) &&
      loopbackHostnames.has(expectedUrl.hostname)
    );
  } catch {
    return false;
  }
}
