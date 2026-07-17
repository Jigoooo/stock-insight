export function selectInitialRelationRoot(
  recordEntityKeys: readonly string[],
  themes: readonly { topEntityKeys: readonly string[] }[],
): string | null {
  return (
    recordEntityKeys[0] ??
    themes.find(({ topEntityKeys }) => topEntityKeys.length > 0)?.topEntityKeys[0] ??
    null
  );
}
