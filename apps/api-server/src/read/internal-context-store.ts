import { AsyncLocalStorage } from 'node:async_hooks';

import { InternalContextError, type InternalUserScope } from './internal-user-context.ts';

export { InternalContextError, type InternalUserScope } from './internal-user-context.ts';

// Per-request verified scope, carried through the async call tree so read
// contexts never fall back to an ambient/server-owned user id. Populated once
// by the internal-context guard after the signed header is verified.
const storage = new AsyncLocalStorage<InternalUserScope>();

export function runWithRequestUserScope<T>(scope: InternalUserScope, work: () => T): T {
  return storage.run(scope, work);
}

// Binds the scope to the CURRENT async execution and everything downstream of
// it, without wrapping a continuation. Required because Nest snapshots the async
// context (AsyncResource.bind) before interceptors run, so a run()-style wrapper
// installed that late never reaches the controller body. Called from the guard,
// which executes early enough for the snapshot to capture this store.
export function enterRequestUserScope(scope: InternalUserScope): void {
  storage.enterWith(scope);
}

export function requireRequestUserScope(): InternalUserScope {
  const scope = storage.getStore();
  if (!scope) {
    throw new InternalContextError('No verified user scope is bound to this request');
  }
  return scope;
}
