import { cryptoResearchQuerySchema } from '@stock-insight/contracts/crypto-research';

export type CryptoWorkspaceQueryResult =
  | Readonly<{ success: true; knownAt: Date; limit: number }>
  | Readonly<{ success: false }>;

const allowedQueryKeys = new Set(['knownAt', 'limit']);

export function parseCryptoWorkspaceQuery(url: URL): CryptoWorkspaceQueryResult {
  if ([...url.searchParams.keys()].some((key) => !allowedQueryKeys.has(key))) {
    return { success: false };
  }
  const rawKnownAt = url.searchParams.getAll('knownAt');
  const rawLimit = url.searchParams.getAll('limit');
  if (rawKnownAt.length > 1 || rawLimit.length > 1) return { success: false };
  if (rawLimit[0] !== undefined && !/^(?:[1-9]|[1-9]\d|100)$/.test(rawLimit[0])) {
    return { success: false };
  }
  const query = cryptoResearchQuerySchema.safeParse({
    knownAt: rawKnownAt[0],
    limit: rawLimit[0] === undefined ? undefined : Number(rawLimit[0]),
  });
  if (!query.success) return { success: false };
  return {
    success: true,
    knownAt: query.data.knownAt === undefined ? new Date() : new Date(query.data.knownAt),
    limit: query.data.limit ?? 40,
  };
}
