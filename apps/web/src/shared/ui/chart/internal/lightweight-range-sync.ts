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

export function createRangeSyncCoordinator() {
  const localEcho = createRangeEchoGuard();
  const externalEcho = createRangeEchoGuard();

  return {
    acceptChartRange(rangeKey: string) {
      if (!externalEcho.shouldApplyExternal(rangeKey)) return false;
      localEcho.markLocal(rangeKey);
      return true;
    },
    acceptExternalRange(rangeKey: string) {
      if (!localEcho.shouldApplyExternal(rangeKey)) return false;
      externalEcho.markLocal(rangeKey);
      return true;
    },
  };
}

export function createTrailingEmitter<T>(delayMs: number, emit: (value: T) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
    schedule(value: T) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        emit(value);
      }, delayMs);
    },
  };
}

export function dateRangeKey(start: Date, end: Date) {
  return `${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`;
}
