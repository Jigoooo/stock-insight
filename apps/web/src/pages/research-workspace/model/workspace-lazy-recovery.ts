export function resolveWorkspaceViewFocus(
  focusedViewKey: string,
  viewKey: string,
  resolvedViewKey: string | null,
) {
  if (focusedViewKey === viewKey || resolvedViewKey !== viewKey) {
    return { focusedViewKey, shouldFocus: false };
  }
  return { focusedViewKey: viewKey, shouldFocus: true };
}

export function isWorkspaceFocusStillOwned({
  activeFocus,
  currentContainsActiveFocus,
  focusOwner,
  focusOwnerConnected,
  isBodyFocused,
}: Readonly<{
  activeFocus: unknown;
  currentContainsActiveFocus: boolean;
  focusOwner: unknown;
  focusOwnerConnected: boolean;
  isBodyFocused: boolean;
}>) {
  return (
    activeFocus === focusOwner ||
    (focusOwner === null && (isBodyFocused || currentContainsActiveFocus)) ||
    (isBodyFocused && focusOwner !== null && !focusOwnerConnected)
  );
}

export function retryWorkspaceView<View extends string>(
  retryKeys: Readonly<Record<View, number>>,
  view: View,
): Record<View, number> {
  return { ...retryKeys, [view]: (retryKeys[view] ?? 0) + 1 };
}

export function createRetryablePromiseCache<Value>(load: () => Promise<Value>) {
  let cachedPromise: Promise<Value> | undefined;

  return function getCachedValue() {
    if (cachedPromise) return cachedPromise;
    const nextPromise = load().catch((error: unknown) => {
      if (cachedPromise === nextPromise) cachedPromise = undefined;
      throw error;
    });
    cachedPromise = nextPromise;
    return nextPromise;
  };
}
