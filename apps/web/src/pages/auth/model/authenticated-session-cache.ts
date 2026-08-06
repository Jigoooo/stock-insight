export type AuthenticatedSession = {
  user: {
    id: string;
    username: string;
  };
  capabilities: {
    role: string;
    canManageInvitations: boolean;
  };
};

export class AuthenticatedSessionCache<Value> {
  private generation = 0;
  private hasValue = false;
  private pending: Promise<Value | null> | undefined;
  private value: Value | undefined;

  load(loader: () => Promise<Value | null>): Promise<Value | null> {
    if (this.hasValue) return Promise.resolve(this.value as Value);
    if (this.pending) return this.pending;

    const generation = this.generation;
    const pending = loader()
      .then((value) => {
        if (generation !== this.generation) throw createSupersededSessionError();
        if (value !== null) {
          this.value = value;
          this.hasValue = true;
        }
        return value;
      })
      .finally(() => {
        if (this.pending === pending) this.pending = undefined;
      });

    this.pending = pending;
    return pending;
  }

  clear() {
    this.generation += 1;
    this.hasValue = false;
    this.pending = undefined;
    this.value = undefined;
  }

  set(value: Value) {
    this.generation += 1;
    this.hasValue = true;
    this.pending = undefined;
    this.value = value;
  }
}

function createSupersededSessionError() {
  const error = new Error('Authenticated session check was superseded');
  error.name = 'AbortError';
  return error;
}
