import { AsyncLocalStorage } from 'node:async_hooks';

import { InternalContextError, type InternalUserScope } from './internal-user-context.ts';

export { InternalContextError, type InternalUserScope } from './internal-user-context.ts';

// Per-request verified scope, carried through the async call tree so read
// contexts never fall back to an ambient/server-owned user id. Populated once
// by the internal-context interceptor after the signed header is verified.
const storage = new AsyncLocalStorage<InternalUserScope>();

export function runWithRequestUserScope<T>(scope: InternalUserScope, work: () => T): T {
  return storage.run(scope, work);
}

export function requireRequestUserScope(): InternalUserScope {
  const scope = storage.getStore();
  if (!scope) {
    throw new InternalContextError('No verified user scope is bound to this request');
  }
  return scope;
}
