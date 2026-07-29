import { AsyncLocalStorage } from 'node:async_hooks';

import {
  InternalContextError,
  type InternalScope,
  type InternalUserScope,
} from './internal-user-context.ts';

export {
  InternalContextError,
  type InternalScope,
  type InternalUserScope,
} from './internal-user-context.ts';

// Per-request verified scope, carried through the async call tree so read
// contexts never fall back to an ambient/server-owned user id. Populated once
// by the internal-context guard after the signed header is verified.
const storage = new AsyncLocalStorage<InternalScope>();

export function runWithRequestScope<T>(scope: InternalScope, work: () => T): T {
  return storage.run(scope, work);
}

/** @deprecated use runWithRequestScope; kept for existing call sites/tests. */
export function runWithRequestUserScope<T>(scope: InternalUserScope, work: () => T): T {
  return storage.run({ kind: 'user', userId: scope.userId }, work);
}

// Binds the scope to the CURRENT async execution and everything downstream of
// it, without wrapping a continuation. Required because Nest snapshots the async
// context (AsyncResource.bind) before interceptors run, so a run()-style wrapper
// installed that late never reaches the controller body. Called from the guard,
// which executes early enough for the snapshot to capture this store.
export function enterRequestScope(scope: InternalScope): void {
  storage.enterWith(scope);
}

/** @deprecated use enterRequestScope; kept for existing call sites/tests. */
export function enterRequestUserScope(scope: InternalUserScope): void {
  storage.enterWith({ kind: 'user', userId: scope.userId });
}

export function requireRequestScope(): InternalScope {
  const scope = storage.getStore();
  if (!scope) {
    throw new InternalContextError('No verified scope is bound to this request');
  }
  return scope;
}

// Data routes call this: an anonymous (pre-authentication) context can never
// resolve to a user scope, so it fails closed exactly like a missing context.
export function requireRequestUserScope(): InternalUserScope {
  const scope = requireRequestScope();
  if (scope.kind !== 'user') {
    throw new InternalContextError('No verified user scope is bound to this request');
  }
  return Object.freeze({ userId: scope.userId });
}
