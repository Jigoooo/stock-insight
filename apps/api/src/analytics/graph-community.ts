import { createHash } from 'node:crypto';

// B7 — deterministic snapshot-scoped community assignment (master plan §8 B7).
// v1 uses connected components over the sealed snapshot edge set. Communities
// are analytics LABELS bound to one snapshot — they are never themes and never
// write into the structural relation ledger. A Leiden/Louvain upgrade would be
// a new algorithm version with its own parameters; the storage contract
// (algorithm + parameters + snapshot scope) already accommodates it.

import type { SnapshotEdgeInput } from './graph-snapshot.ts';

export type CommunityAssignment = {
  communityKey: string;
  memberEntityIds: number[];
};

export type CommunityResult = {
  algorithm: 'connected-components-v1';
  parameters: { minCommunitySize: number };
  communities: CommunityAssignment[];
};

export function assignCommunities(
  edges: readonly SnapshotEdgeInput[],
  options: { minCommunitySize: number },
): CommunityResult {
  if (!Number.isSafeInteger(options.minCommunitySize) || options.minCommunitySize < 1) {
    throw new Error('minCommunitySize must be a positive integer');
  }

  // Union-find over entity ids (deterministic: processes sorted edges).
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cursor = x;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    // Deterministic: smaller id becomes the root.
    if (rootA < rootB) parent.set(rootB, rootA);
    else parent.set(rootA, rootB);
  };

  for (const edge of [...edges].sort((a, b) => a.relationRevisionId - b.relationRevisionId)) {
    union(edge.subjectEntityId, edge.objectEntityId);
  }

  const members = new Map<number, number[]>();
  for (const entityId of [...parent.keys()].sort((a, b) => a - b)) {
    const root = find(entityId);
    const list = members.get(root) ?? [];
    list.push(entityId);
    members.set(root, list);
  }

  const communities: CommunityAssignment[] = [];
  for (const root of [...members.keys()].sort((a, b) => a - b)) {
    const memberEntityIds = members.get(root)!.sort((a, b) => a - b);
    if (memberEntityIds.length < options.minCommunitySize) continue;
    // Key derives from exact membership, so an unchanged component keeps its
    // key across runs and a changed one provably gets a new key.
    const membershipDigest = createHash('sha256')
      .update(JSON.stringify(memberEntityIds))
      .digest('hex')
      .slice(0, 16);
    communities.push({
      communityKey: `cc-v1-${membershipDigest}`,
      memberEntityIds,
    });
  }

  return {
    algorithm: 'connected-components-v1',
    parameters: { minCommunitySize: options.minCommunitySize },
    communities,
  };
}
