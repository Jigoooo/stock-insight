import type { ServerEnv } from '../server/env.ts';

export type UserScope = {
  readonly userId: string;
};

export function requireUserScope(env: ServerEnv): UserScope {
  if (!env.userId) throw new Error('STOCK_INSIGHT_USER_ID is required');
  return Object.freeze({ userId: env.userId });
}
