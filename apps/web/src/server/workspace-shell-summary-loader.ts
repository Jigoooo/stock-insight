import type { ResearchWorkspaceShellSummary } from '../pages/research-workspace/model/workspace-view-payload.ts';

type ShellSummarySource = (userId: string) => Promise<ResearchWorkspaceShellSummary>;

type ShellSummaryCacheEntry = {
  expiresAt: number;
  promise: Promise<ResearchWorkspaceShellSummary>;
};

export function createWorkspaceShellSummaryLoader(
  source: ShellSummarySource,
  options: { now?: () => number; ttlMs?: number } = {},
): ShellSummarySource {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 60_000;
  const cache = new Map<string, ShellSummaryCacheEntry>();

  return (userId) => {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now()) return cached.promise;

    const promise = Promise.resolve().then(() => source(userId));
    const entry = { expiresAt: now() + ttlMs, promise };
    cache.set(userId, entry);
    void promise.catch(() => {
      if (cache.get(userId) === entry) cache.delete(userId);
    });
    return promise;
  };
}
