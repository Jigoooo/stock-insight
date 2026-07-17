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
    return (
      requestOrigin === requestUrl.origin &&
      expectedOrigin === expectedUrl.origin &&
      requestUrl.origin === expectedUrl.origin
    );
  } catch {
    return false;
  }
}
