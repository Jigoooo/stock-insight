export function isDevSurfaceEnabled(isDev: boolean, flag: unknown): boolean {
  return isDev && flag === '1';
}
