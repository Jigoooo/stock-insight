import type { TableSelectionMode } from './table';

export function resolveTableSelection({
  currentKeys,
  key,
  selectionMode,
}: {
  currentKeys: readonly string[];
  key: string;
  selectionMode: TableSelectionMode;
}) {
  if (selectionMode === 'none') return currentKeys;
  if (selectionMode === 'single') return [key];
  return currentKeys.includes(key)
    ? currentKeys.filter((selectedKey) => selectedKey !== key)
    : [...currentKeys, key];
}
