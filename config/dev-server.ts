export const DEFAULT_DEV_SERVER_PORT = 6100;

export function resolveDevServerPort(value?: string) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_DEV_SERVER_PORT;
}
