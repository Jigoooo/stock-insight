export type CryptoContagionChannel =
  | 'contract_dependency'
  | 'reserve_backing'
  | 'bridge_route'
  | 'oracle_feed'
  | 'custody_chain'
  | 'exchange_venue'
  | 'liquidity_pool'
  | 'collateral_chain';

export type CryptoContagionResult =
  | Readonly<{
      status: 'ok';
      dataCutoff: string;
      candidates: readonly Readonly<{
        entityKey: string;
        riskScore: number;
        depth: number;
        pathEdgeKeys: readonly string[];
      }>[];
      candidateOnly: true;
      acceptedImpactAllowed: false;
      orderExecutable: false;
    }>
  | Readonly<{
      status: 'abstained';
      reason: 'INVALID_CRYPTO_CONTAGION_INPUT';
      candidateOnly: true;
      acceptedImpactAllowed: false;
      orderExecutable: false;
    }>;

const abstained: CryptoContagionResult = {
  status: 'abstained',
  reason: 'INVALID_CRYPTO_CONTAGION_INPUT',
  candidateOnly: true,
  acceptedImpactAllowed: false,
  orderExecutable: false,
};

const channels = new Set<CryptoContagionChannel>([
  'contract_dependency',
  'reserve_backing',
  'bridge_route',
  'oracle_feed',
  'custody_chain',
  'exchange_venue',
  'liquidity_pool',
  'collateral_chain',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function probability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1;
}

function cryptoKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('crypto:') && value.length <= 512;
}

function parseUtcTimestamp(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  try {
    return new Date(parsed).toISOString() === value ? parsed : Number.NaN;
  } catch {
    return Number.NaN;
  }
}

export function evaluateCryptoContagion(input: unknown): CryptoContagionResult {
  try {
    const record = asRecord(input);
    const cutoff = parseUtcTimestamp(record?.dataCutoff);
    if (
      record === null ||
      !Number.isFinite(cutoff) ||
      !Number.isSafeInteger(record.maxDepth) ||
      (record.maxDepth as number) < 1 ||
      (record.maxDepth as number) > 5 ||
      !Array.isArray(record.seeds) ||
      record.seeds.length < 1 ||
      record.seeds.length > 100 ||
      !Array.isArray(record.edges) ||
      record.edges.length > 100_000
    ) {
      return abstained;
    }

    const seedKeys = new Set<string>();
    const seeds: Array<{ entityKey: string; shockMagnitude: number }> = [];
    for (const value of record.seeds) {
      const seed = asRecord(value);
      if (
        seed === null ||
        !cryptoKey(seed.entityKey) ||
        seedKeys.has(seed.entityKey) ||
        !probability(seed.shockMagnitude)
      ) {
        return abstained;
      }
      seedKeys.add(seed.entityKey);
      seeds.push({ entityKey: seed.entityKey, shockMagnitude: seed.shockMagnitude });
    }

    const edgeKeys = new Set<string>();
    const edges: Array<{
      edgeKey: string;
      fromEntityKey: string;
      toEntityKey: string;
      channel: CryptoContagionChannel;
      propagationWeight: number;
      knownAt: number;
    }> = [];
    for (const value of record.edges) {
      const edge = asRecord(value);
      const knownAt = parseUtcTimestamp(edge?.knownAt);
      if (
        edge === null ||
        typeof edge.edgeKey !== 'string' ||
        edge.edgeKey.trim().length === 0 ||
        edge.edgeKey.length > 512 ||
        edgeKeys.has(edge.edgeKey) ||
        !cryptoKey(edge.fromEntityKey) ||
        !cryptoKey(edge.toEntityKey) ||
        edge.fromEntityKey === edge.toEntityKey ||
        typeof edge.channel !== 'string' ||
        !channels.has(edge.channel as CryptoContagionChannel) ||
        !probability(edge.propagationWeight) ||
        !Number.isFinite(knownAt)
      ) {
        return abstained;
      }
      edgeKeys.add(edge.edgeKey);
      if (knownAt > cutoff) continue;
      edges.push({
        edgeKey: edge.edgeKey,
        fromEntityKey: edge.fromEntityKey,
        toEntityKey: edge.toEntityKey,
        channel: edge.channel as CryptoContagionChannel,
        propagationWeight: edge.propagationWeight,
        knownAt,
      });
    }
    edges.sort(
      (left, right) =>
        left.fromEntityKey.localeCompare(right.fromEntityKey) ||
        left.edgeKey.localeCompare(right.edgeKey),
    );
    const adjacency = new Map<string, typeof edges>();
    for (const edge of edges) {
      const list = adjacency.get(edge.fromEntityKey) ?? [];
      list.push(edge);
      adjacency.set(edge.fromEntityKey, list);
    }

    type Candidate = { riskScore: number; depth: number; pathEdgeKeys: string[] };
    const best = new Map<string, Candidate>();
    const queue: Array<{ entityKey: string } & Candidate> = [];
    seeds.sort((left, right) => left.entityKey.localeCompare(right.entityKey));
    for (const seed of seeds) {
      const candidate = { riskScore: seed.shockMagnitude, depth: 0, pathEdgeKeys: [] };
      best.set(seed.entityKey, candidate);
      queue.push({ entityKey: seed.entityKey, ...candidate });
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current === undefined || current.depth >= (record.maxDepth as number)) continue;
      for (const edge of adjacency.get(current.entityKey) ?? []) {
        const riskScore = current.riskScore * edge.propagationWeight;
        if (!Number.isFinite(riskScore) || riskScore <= 0 || riskScore > 1) return abstained;
        const next: Candidate = {
          riskScore,
          depth: current.depth + 1,
          pathEdgeKeys: [...current.pathEdgeKeys, edge.edgeKey],
        };
        const previous = best.get(edge.toEntityKey);
        const nextPath = next.pathEdgeKeys.join('\u0000');
        const previousPath = previous?.pathEdgeKeys.join('\u0000') ?? '';
        const improves =
          previous === undefined ||
          next.riskScore > previous.riskScore + Number.EPSILON ||
          (Math.abs(next.riskScore - previous.riskScore) <= Number.EPSILON &&
            (next.depth < previous.depth ||
              (next.depth === previous.depth && nextPath < previousPath)));
        if (!improves) continue;
        best.set(edge.toEntityKey, next);
        queue.push({ entityKey: edge.toEntityKey, ...next });
      }
    }

    const candidates = [...best.entries()]
      .map(([entityKey, candidate]) => ({ entityKey, ...candidate }))
      .sort(
        (left, right) =>
          right.riskScore - left.riskScore ||
          left.depth - right.depth ||
          left.entityKey.localeCompare(right.entityKey),
      );
    return {
      status: 'ok',
      dataCutoff: record.dataCutoff as string,
      candidates,
      candidateOnly: true,
      acceptedImpactAllowed: false,
      orderExecutable: false,
    };
  } catch {
    return abstained;
  }
}
