import type { ReactNode } from 'react';

export type SelectOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

export type NavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export type SelectOptionFilter = (
  option: SelectOption,
  query: string,
) => boolean | null | undefined;

type NavigationOptions = {
  currentIndex: number;
  key: NavigationKey;
  options: readonly SelectOption[];
};

export function getOptionText(option: SelectOption) {
  if (typeof option.label === 'string' || typeof option.label === 'number') {
    return String(option.label);
  }
  return option.value;
}

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
  if (currentIndex < 0) return findEnabledIndex(options, direction === -1);

  for (
    let index = currentIndex + direction;
    index >= 0 && index < options.length;
    index += direction
  ) {
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
      : getOptionText(option).toLocaleLowerCase().includes(normalizedQuery),
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
      getOptionText(option).toLocaleLowerCase().startsWith(normalizedQuery)
    ) {
      return index;
    }
  }

  return currentIndex;
}
