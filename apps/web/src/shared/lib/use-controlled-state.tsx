/* oxlint-disable react-hooks-js/set-state-in-effect -- Official Animate UI controlled-state hook mirrors controlled prop changes. */

// Upstream: https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/hooks/use-controlled-state/index.tsx
// Registry item: @animate-ui/hooks-use-controlled-state
// Revision: efeb96ffd7a3b7a4868667e4ac3c346620fb3044

import * as React from 'react';

interface CommonControlledStateProps<T> {
  value?: T;
  defaultValue?: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useControlledState<T, Rest extends any[] = []>(
  props: CommonControlledStateProps<T> & {
    onChange?: (value: T, ...args: Rest) => void;
  },
): readonly [T, (next: T, ...args: Rest) => void] {
  const { value, defaultValue, onChange } = props;

  const [state, setInternalState] = React.useState<T>(
    value !== undefined ? value : (defaultValue as T),
  );

  React.useEffect(() => {
    if (value !== undefined) setInternalState(value);
  }, [value]);

  const setState = React.useCallback(
    (next: T, ...args: Rest) => {
      setInternalState(next);
      onChange?.(next, ...args);
    },
    [onChange],
  );

  return [state, setState] as const;
}
