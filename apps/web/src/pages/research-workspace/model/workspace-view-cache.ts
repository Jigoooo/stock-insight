export type WorkspaceViewId =
  | 'today'
  | 'radar'
  | 'stocks'
  | 'crypto'
  | 'themes'
  | 'research'
  | 'history'
  | 'status';

export type WorkspaceViewCacheKey = {
  cursor: string | null;
  lane: 'must_know' | 'for_you' | 'explore' | null;
  scopeVersion: string;
  view: WorkspaceViewId;
};

export type WorkspaceViewLoaderContext = {
  signal: AbortSignal;
};

type WorkspaceViewLoader<Value> = (context: WorkspaceViewLoaderContext) => Promise<Value>;

type CacheEntry<Value> =
  | { data: Value; status: 'ready' }
  | {
      controller: AbortController;
      promise: Promise<Value>;
      status: 'pending';
    };

type QueuedRequest<Value> = {
  controller: AbortController;
  detachExternalAbort?: () => void;
  generation: number;
  key: string;
  loader: WorkspaceViewLoader<Value>;
  promise: Promise<Value>;
  reject: (reason: unknown) => void;
  resolve: (value: Value) => void;
  scopeVersion: string;
  settled: boolean;
  started: boolean;
};

type PrefetchOptions = {
  priority: 'idle' | 'intent';
};

function createAbortError(message: string) {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function waitForCaller<Value>(promise: Promise<Value>, signal?: AbortSignal) {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? createAbortError('Workspace view caller aborted'));
  }
  return new Promise<Value>((resolve, reject) => {
    const detach = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      detach();
      reject(signal.reason ?? createAbortError('Workspace view caller aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(
      (value) => {
        detach();
        resolve(value);
      },
      (error: unknown) => {
        detach();
        reject(error);
      },
    );
  });
}

function serializeKey(key: WorkspaceViewCacheKey) {
  return JSON.stringify([key.scopeVersion, key.view, key.lane, key.cursor]);
}

export class WorkspaceViewCache<Value> {
  readonly #entries = new Map<string, CacheEntry<Value>>();
  readonly #maxConcurrency: number;
  readonly #queue: Array<QueuedRequest<Value>> = [];
  #activeCount = 0;
  #activeLoadToken = 0;
  #activeValue: Value | undefined;
  #generation = 0;
  #idlePrefetch: Promise<boolean> | null = null;
  #scopeVersion: string;

  constructor(scopeVersion: string, maxConcurrency = 2) {
    if (!scopeVersion) throw new Error('Workspace cache scope version is required');
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 2) {
      throw new Error('Workspace cache concurrency must be between 1 and 2');
    }
    this.#scopeVersion = scopeVersion;
    this.#maxConcurrency = maxConcurrency;
  }

  load(
    key: WorkspaceViewCacheKey,
    loader: WorkspaceViewLoader<Value>,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ): Promise<Value> {
    if (key.scopeVersion !== this.#scopeVersion) {
      return Promise.reject(createAbortError('Workspace cache scope does not match'));
    }
    if (options.signal?.aborted) {
      return Promise.reject(
        options.signal.reason ?? createAbortError('Workspace view caller aborted'),
      );
    }

    const serializedKey = serializeKey(key);
    const cached = this.#entries.get(serializedKey);
    if (cached?.status === 'ready') return Promise.resolve(cached.data);
    if (cached?.status === 'pending') return waitForCaller(cached.promise, options.signal);

    const controller = new AbortController();
    let resolve!: (value: Value) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<Value>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    const request: QueuedRequest<Value> = {
      controller,
      generation: this.#generation,
      key: serializedKey,
      loader,
      promise,
      reject,
      resolve,
      scopeVersion: key.scopeVersion,
      settled: false,
      started: false,
    };

    this.#entries.set(serializedKey, { controller, promise, status: 'pending' });
    controller.signal.addEventListener('abort', () => this.#rejectAborted(request), { once: true });
    if (options.signal) {
      if (options.signal.aborted) controller.abort(options.signal.reason);
      else {
        const externalSignal = options.signal;
        const onExternalAbort = () => controller.abort(externalSignal.reason);
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
        request.detachExternalAbort = () =>
          externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
    this.#queue.push(request);
    this.#pump();
    return promise;
  }

  prefetch(
    key: WorkspaceViewCacheKey,
    loader: WorkspaceViewLoader<Value>,
    { priority }: Readonly<PrefetchOptions> = { priority: 'intent' },
  ): Promise<boolean> {
    if (priority === 'idle' && this.#idlePrefetch) return Promise.resolve(false);

    const work = this.load(key, loader).then(
      () => true,
      () => false,
    );
    if (priority === 'idle') {
      this.#idlePrefetch = work;
      void work.finally(() => {
        if (this.#idlePrefetch === work) this.#idlePrefetch = null;
      });
    }
    return work;
  }

  beginActiveLoad() {
    this.#activeLoadToken += 1;
    return this.#activeLoadToken;
  }

  commitActive(value: Value, token: number) {
    if (token !== this.#activeLoadToken) return false;
    this.#activeValue = value;
    return true;
  }

  isActiveLoad(token: number) {
    return token === this.#activeLoadToken;
  }

  getActive() {
    return this.#activeValue;
  }

  clear() {
    this.#generation += 1;
    this.#activeLoadToken += 1;
    this.#activeValue = undefined;
    this.#idlePrefetch = null;
    for (const entry of this.#entries.values()) {
      if (entry.status === 'pending') {
        entry.controller.abort(createAbortError('Workspace cache cleared'));
      }
    }
    this.#entries.clear();
  }

  setScopeVersion(scopeVersion: string) {
    if (!scopeVersion) throw new Error('Workspace cache scope version is required');
    if (scopeVersion === this.#scopeVersion) return;

    this.#scopeVersion = scopeVersion;
    this.clear();
  }

  #deletePending(request: QueuedRequest<Value>) {
    const entry = this.#entries.get(request.key);
    if (entry?.status === 'pending' && entry.promise === request.promise) {
      this.#entries.delete(request.key);
    }
  }

  #pump() {
    while (this.#activeCount < this.#maxConcurrency) {
      const request = this.#queue.shift();
      if (!request) return;
      if (request.settled || request.controller.signal.aborted) continue;

      request.started = true;
      this.#activeCount += 1;
      let work: Promise<Value>;
      try {
        work = request.loader({ signal: request.controller.signal });
      } catch (error) {
        work = Promise.reject(error);
      }
      void work
        .then(
          (value) => {
            if (request.settled) return;
            if (
              request.generation !== this.#generation ||
              request.controller.signal.aborted ||
              request.scopeVersion !== this.#scopeVersion
            ) {
              this.#rejectAborted(request);
              return;
            }
            request.settled = true;
            request.detachExternalAbort?.();
            this.#entries.set(request.key, { data: value, status: 'ready' });
            request.resolve(value);
          },
          (error: unknown) => {
            if (request.settled) return;
            request.settled = true;
            request.detachExternalAbort?.();
            this.#deletePending(request);
            request.reject(error);
          },
        )
        .finally(() => {
          this.#activeCount -= 1;
          this.#pump();
        });
    }
  }

  #rejectAborted(request: QueuedRequest<Value>) {
    if (request.settled) return;
    request.settled = true;
    request.detachExternalAbort?.();
    this.#deletePending(request);
    request.reject(createAbortError('Workspace request aborted after scope change'));
    if (!request.started) {
      const index = this.#queue.indexOf(request);
      if (index >= 0) this.#queue.splice(index, 1);
    }
  }
}
