import { jsonResponse } from './http.ts';
import { parseCryptoWorkspaceQuery } from '../pages/research-workspace/model/crypto-query.ts';

export type CryptoWorkspaceGetHandlerDependencies = Readonly<{
  resolveUserId: (request: Request) => Promise<string>;
  loadWorkspace: (
    userId: string,
    options: Readonly<{ knownAt: Date; limit: number }>,
  ) => Promise<unknown>;
  isRequestScopeError: (error: unknown) => boolean;
  unauthorizedResponse: () => Response;
}>;

export function createCryptoWorkspaceGetHandler(
  dependencies: CryptoWorkspaceGetHandlerDependencies,
): ({ request }: { request: Request }) => Promise<Response> {
  return async ({ request }) => {
    const query = parseCryptoWorkspaceQuery(new URL(request.url));
    if (!query.success) return jsonResponse({ error: 'invalid_query' }, { status: 400 });
    try {
      const userId = await dependencies.resolveUserId(request);
      return jsonResponse(
        await dependencies.loadWorkspace(userId, {
          knownAt: query.knownAt,
          limit: query.limit,
        }),
      );
    } catch (error) {
      if (dependencies.isRequestScopeError(error)) return dependencies.unauthorizedResponse();
      throw error;
    }
  };
}
