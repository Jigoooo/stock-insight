export type WorkspaceInteraction =
  | 'search-input'
  | 'search-results'
  | 'sidebar-navigation'
  | 'lane-navigation'
  | 'inspector-open'
  | 'inspector-data'
  | 'pagination'
  | 'switch-toggle'
  | 'mobile-navigation'
  | 'relation-data';

export type WorkspaceConcurrencyLane = 'urgent' | 'deferred' | 'transition' | 'async';
export type WorkspacePendingPresentation =
  | 'none'
  | 'stale-results'
  | 'target-intent'
  | 'explicit-loading';

export type WorkspaceConcurrencyPolicy = {
  lane: WorkspaceConcurrencyLane;
  pending: WorkspacePendingPresentation;
  preservesAuthoritativeContent: boolean;
};

export const WORKSPACE_CONCURRENCY_POLICY = {
  'search-input': {
    lane: 'urgent',
    pending: 'none',
    preservesAuthoritativeContent: false,
  },
  'search-results': {
    lane: 'deferred',
    pending: 'stale-results',
    preservesAuthoritativeContent: true,
  },
  'sidebar-navigation': {
    lane: 'transition',
    pending: 'target-intent',
    preservesAuthoritativeContent: true,
  },
  'lane-navigation': {
    lane: 'transition',
    pending: 'target-intent',
    preservesAuthoritativeContent: true,
  },
  'inspector-open': {
    lane: 'urgent',
    pending: 'none',
    preservesAuthoritativeContent: false,
  },
  'inspector-data': {
    lane: 'async',
    pending: 'explicit-loading',
    preservesAuthoritativeContent: true,
  },
  pagination: {
    lane: 'async',
    pending: 'explicit-loading',
    preservesAuthoritativeContent: true,
  },
  'switch-toggle': {
    lane: 'urgent',
    pending: 'none',
    preservesAuthoritativeContent: false,
  },
  'mobile-navigation': {
    lane: 'urgent',
    pending: 'none',
    preservesAuthoritativeContent: false,
  },
  'relation-data': {
    lane: 'async',
    pending: 'explicit-loading',
    preservesAuthoritativeContent: true,
  },
} as const satisfies Record<WorkspaceInteraction, WorkspaceConcurrencyPolicy>;

export function getWorkspaceConcurrencyPolicy(interaction: WorkspaceInteraction) {
  return WORKSPACE_CONCURRENCY_POLICY[interaction];
}

export function shouldShowSettledEmpty({
  deferredQuery,
  hasError,
  isLoading,
  query,
  resultCount,
}: {
  deferredQuery: string;
  hasError: boolean;
  isLoading: boolean;
  query: string;
  resultCount: number;
}) {
  return query === deferredQuery && !isLoading && !hasError && resultCount === 0;
}

export function isLatestWorkspaceIntent<Intent extends number | string>(
  latestIntent: Intent,
  completedIntent: Intent,
) {
  return latestIntent === completedIntent;
}
