import {
  HttpException,
  HttpStatus,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';

import { runWithRequestUserScope } from './internal-context-store.ts';
import { InternalContextError, verifyInternalUserContext } from './internal-user-context.ts';

// Header the web/BFF sets when calling the internal api-server. Lowercase so it
// matches Fastify's normalized header map.
export const INTERNAL_CONTEXT_HEADER = 'x-internal-user-context';

type RequestLike = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
};

type Secret = Buffer | Uint8Array;

type InterceptorOptions = Readonly<{
  secret: Secret;
  clock?: () => number;
  // Path prefixes that bypass context enforcement (health/meta liveness).
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

export function createInternalContextInterceptor(options: InterceptorOptions): NestInterceptor {
  const clock = options.clock ?? Date.now;
  const publicPaths = options.publicPaths ?? [];
  return {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
      const request = context.switchToHttp().getRequest<RequestLike>();
      const path = pathOf(request.url);
      if (publicPaths.some((p) => path === p)) {
        return next.handle();
      }
      const token = firstHeader(request.headers[INTERNAL_CONTEXT_HEADER]);
      if (!token) {
        throw new HttpException(
          { error: { code: 'UNAUTHORIZED', message: 'Internal user context required' } },
          HttpStatus.UNAUTHORIZED,
        );
      }
      let scope;
      try {
        scope = verifyInternalUserContext(options.secret, token, {
          method: request.method,
          path: pathOf(request.url),
          now: Math.floor(clock() / 1000),
        });
      } catch (error) {
        if (error instanceof InternalContextError) {
          throw new HttpException(
            { error: { code: 'UNAUTHORIZED', message: 'Invalid internal user context' } },
            HttpStatus.UNAUTHORIZED,
          );
        }
        throw error;
      }
      // Keep the verified scope active for the ENTIRE downstream pipeline,
      // including the deferred subscription that actually runs the controller.
      // Wrapping subscribe (not just handle()) ensures AsyncLocalStorage.getStore
      // resolves inside the handler body, which executes lazily on subscribe.
      const source = next.handle();
      return {
        subscribe(observer: unknown) {
          return runWithRequestUserScope(scope, () =>
            (source as { subscribe: (o: unknown) => unknown }).subscribe(observer),
          );
        },
      } as Observable<unknown>;
    },
  };
}
