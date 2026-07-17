export type LoginRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

type LoginRateLimiterOptions = {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
};

type AttemptBucket = {
  count: number;
  resetsAt: number;
};

export function createLoginRateLimiter(options: LoginRateLimiterOptions) {
  const { limit, windowMs, maxKeys = 10_000, now = Date.now } = options;
  if (
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    !Number.isSafeInteger(windowMs) ||
    windowMs <= 0 ||
    !Number.isSafeInteger(maxKeys) ||
    maxKeys <= 0
  ) {
    throw new Error('Invalid login rate limiter options');
  }

  const buckets = new Map<string, AttemptBucket>();

  return {
    consume(key: string): LoginRateLimitResult {
      const currentTime = now();
      const existing = buckets.get(key);
      if (existing && currentTime >= existing.resetsAt) buckets.delete(key);

      const active = buckets.get(key);
      if (!active) {
        if (buckets.size >= maxKeys) {
          const oldest = buckets.entries().next().value as [string, AttemptBucket] | undefined;
          if (oldest && currentTime >= oldest[1].resetsAt) {
            buckets.delete(oldest[0]);
          } else {
            return {
              allowed: false,
              retryAfterSeconds: Math.max(
                1,
                Math.ceil(((oldest?.[1].resetsAt ?? currentTime + windowMs) - currentTime) / 1000),
              ),
            };
          }
        }
        buckets.set(key, { count: 1, resetsAt: currentTime + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (active.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((active.resetsAt - currentTime) / 1000)),
        };
      }

      active.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset(key: string): void {
      buckets.delete(key);
    },
    size(): number {
      return buckets.size;
    },
  };
}

export function createConcurrencyGate(limit: number) {
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('Invalid concurrency limit');
  let active = 0;

  return {
    tryAcquire(): (() => void) | undefined {
      if (active >= limit) return undefined;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
      };
    },
    active(): number {
      return active;
    },
  };
}

export function normalizedClientKey(headers: Headers): string {
  const value = headers.get('cf-connecting-ip')?.trim();
  if (!value || value.length > 45 || !/^[0-9a-f:.]+$/i.test(value)) return 'unknown';
  return value.toLocaleLowerCase('en-US');
}
