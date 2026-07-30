export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type NavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

type NavigationOptions = {
  currentIndex: number;
  key: NavigationKey;
  options: readonly SelectOption[];
};

export type SelectOptionFilter = (
  option: SelectOption,
  query: string,
) => boolean | null | undefined;

function findEnabledIndex(options: readonly SelectOption[], fromEnd: boolean) {
  if (fromEnd) {
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index]?.disabled) return index;
    }
    return -1;
  }

  return options.findIndex((option) => !option.disabled);
}

export function getNextEnabledOptionIndex({ currentIndex, key, options }: NavigationOptions) {
  if (options.length === 0) return -1;
  if (key === 'Home') return findEnabledIndex(options, false);
  if (key === 'End') return findEnabledIndex(options, true);

  const direction = key === 'ArrowDown' ? 1 : -1;
  const fallback = direction === 1 ? -1 : 0;
  const startIndex = currentIndex >= 0 ? currentIndex : fallback;

  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (startIndex + direction * offset + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }

  return currentIndex;
}

export function filterSelectOptions(
  options: readonly SelectOption[],
  query: string,
  filter?: SelectOptionFilter,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...options];

  return options.filter((option) =>
    filter
      ? Boolean(filter(option, query))
      : option.label.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export function resolveSelectableValue(option: SelectOption, currentValue: string) {
  return option.disabled ? currentValue : option.value;
}

export function getTypeaheadOptionIndex({
  currentIndex,
  options,
  query,
}: {
  currentIndex: number;
  options: readonly SelectOption[];
  query: string;
}) {
  const normalizedQuery = query.toLocaleLowerCase();
  if (!normalizedQuery || options.length === 0) return currentIndex;

  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (Math.max(currentIndex, -1) + offset) % options.length;
    const option = options[index];
    if (
      option &&
      !option.disabled &&
      option.label.toLocaleLowerCase().startsWith(normalizedQuery)
    ) {
      return index;
    }
  }

  return currentIndex;
}
