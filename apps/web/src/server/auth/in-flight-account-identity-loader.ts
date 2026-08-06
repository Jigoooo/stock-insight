type AccountIdentitySource<Value> = (userId: string) => Promise<Value | undefined>;

export function createInFlightAccountIdentityLoader<Value>(
  source: AccountIdentitySource<Value>,
): AccountIdentitySource<Value> {
  const pendingByUserId = new Map<string, Promise<Value | undefined>>();

  return (userId) => {
    const pending = pendingByUserId.get(userId);
    if (pending) return pending;

    const next = source(userId).finally(() => {
      if (pendingByUserId.get(userId) === next) pendingByUserId.delete(userId);
    });
    pendingByUserId.set(userId, next);
    return next;
  };
}
