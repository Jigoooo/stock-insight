type RovingTabOptions = {
  currentIndex: number;
  disabled: readonly boolean[];
  key: string;
};

const rovingKeys = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

export function isRovingTabKey(key: string) {
  return rovingKeys.has(key);
}

export function getNextEnabledTabIndex({ currentIndex, disabled, key }: RovingTabOptions) {
  if (!isRovingTabKey(key) || disabled.length === 0 || disabled.every(Boolean)) {
    return currentIndex;
  }
  if (key === 'Home') return disabled.findIndex((value) => !value);
  if (key === 'End') {
    for (let index = disabled.length - 1; index >= 0; index -= 1) {
      if (!disabled[index]) return index;
    }
    return currentIndex;
  }

  const direction = key === 'ArrowRight' ? 1 : -1;
  let nextIndex = currentIndex;
  for (let step = 0; step < disabled.length; step += 1) {
    nextIndex = (nextIndex + direction + disabled.length) % disabled.length;
    if (!disabled[nextIndex]) return nextIndex;
  }
  return currentIndex;
}
