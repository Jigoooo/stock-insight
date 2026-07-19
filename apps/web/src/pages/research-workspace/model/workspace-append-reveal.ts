export function selectWorkspaceAppendedKeys(
  previousKeys: readonly string[],
  currentKeys: readonly string[],
  limit = 5,
) {
  const previous = new Set(previousKeys);
  const selected: string[] = [];
  for (const key of currentKeys) {
    if (previous.has(key) || selected.includes(key)) continue;
    selected.push(key);
    if (selected.length === limit) break;
  }
  return selected;
}
