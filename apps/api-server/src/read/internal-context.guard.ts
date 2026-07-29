import { HttpException, HttpStatus, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { enterRequestScope } from './internal-context-store.ts';
import {
  InternalContextError,
  verifyInternalContext,
} from '@stock-insight/contracts/internal-context';

// Header the web/BFF sets when calling the internal api-server. Lowercase so it
// matches Fastify's normalized header map.
export const INTERNAL_CONTEXT_HEADER = 'x-internal-user-context';

type RequestLike = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
};

type Secret = Buffer | Uint8Array;

type GuardOptions = Readonly<{
  secret: Secret;
  clock?: () => number;
  // Paths that bypass context enforcement (health/meta liveness).
  publicPaths?: readonly string[];
}>;

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function pathOf(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

// WHY A GUARD AND NOT AN INTERCEPTOR:
// Nest's InterceptorsConsumer builds its deferred handler with AsyncResource.bind
// BEFORE it invokes any interceptor. AsyncResource restores the async context
// captured at BIND time, so an AsyncLocalStorage scope opened inside an
// interceptor is invisible to the controller body — requireRequestUserScope()
// then throws "No verified user scope is bound to this request" and every data
// route answers 500. Guards run earlier in the same async chain, so binding the
// scope here (via enterWith) is captured by that later AsyncResource.bind.
//
// The guard accepts BOTH scope kinds (user and anonymous). Distinguishing them
// is the controller's job: data routes call requireRequestUserScope(), which
// fails closed on an anonymous context, and pre-authentication auth routes
// assert the anonymous kind explicitly.
export function createInternalContextGuard(options: GuardOptions): CanActivate {
  const clock = options.clock ?? Date.now;
  const publicPaths = options.publicPaths ?? [];
  return {
    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<RequestLike>();
      const path = pathOf(request.url);
      if (publicPaths.some((p) => path === p)) return true;

      const token = firstHeader(request.headers[INTERNAL_CONTEXT_HEADER]);
      if (!token) {
        throw new HttpException(
          { error: { code: 'UNAUTHORIZED', message: 'Internal user context required' } },
          HttpStatus.UNAUTHORIZED,
        );
      }
      try {
        const scope = verifyInternalContext(options.secret, token, {
          method: request.method,
          path,
          now: Math.floor(clock() / 1000),
        });
        // enterWith (not run()) so the scope survives for the remainder of this
        // request's async chain without needing to wrap a continuation.
        enterRequestScope(scope);
        return true;
      } catch (error) {
        if (error instanceof InternalContextError) {
          throw new HttpException(
            { error: { code: 'UNAUTHORIZED', message: 'Invalid internal user context' } },
            HttpStatus.UNAUTHORIZED,
          );
        }
        throw error;
      }
    },
  };
}
