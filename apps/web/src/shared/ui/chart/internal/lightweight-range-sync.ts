export type RangeEchoGuard = {
  markLocal: (rangeKey: string) => void;
  shouldApplyExternal: (rangeKey: string) => boolean;
};

export function createRangeEchoGuard(): RangeEchoGuard {
  let pendingLocalEcho: string | null = null;

  return {
    markLocal(rangeKey) {
      pendingLocalEcho = rangeKey;
    },
    shouldApplyExternal(rangeKey) {
      const isLocalEcho = pendingLocalEcho === rangeKey;
      pendingLocalEcho = null;
      return !isLocalEcho;
    },
  };
}

export function dateRangeKey(start: Date, end: Date) {
  return `${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`;
}
