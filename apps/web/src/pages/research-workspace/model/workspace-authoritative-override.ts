export type WorkspaceAuthoritativeOverride<Base, Value> = {
  base: Base;
  value: Value;
};

export function resolveWorkspaceAuthoritativeOverride<Base extends object, Value>(
  authoritativeBase: Base,
  override: WorkspaceAuthoritativeOverride<Base, Value> | null,
): Value | null {
  return override?.base === authoritativeBase ? override.value : null;
}
