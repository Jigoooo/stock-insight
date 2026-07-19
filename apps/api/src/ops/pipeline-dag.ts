// B9 — pipeline dependency DAG, selective recompute, producer coverage
// (master plan §8 B9 code-contract scope). Pure declaration + verification:
// existing Node workers remain behavior owners; this module only DECLARES the
// dataset dependency graph and computes what must recompute when inputs
// change. Dagster/systemd cutover is a separately-approved operational step.

export type PipelineNode = {
  datasetKey: string;
  /** Owning producer job key; null marks a dataset with no registered producer. */
  producerKey: string | null;
};

export type PipelineEdge = { from: string; to: string };

export type PipelineDag = {
  nodes: Map<string, PipelineNode>;
  downstream: Map<string, string[]>;
  topologicalOrder: string[];
};

export function buildPipelineDag(
  nodes: readonly PipelineNode[],
  edges: readonly PipelineEdge[],
): PipelineDag {
  const nodeMap = new Map<string, PipelineNode>();
  for (const node of nodes) {
    if (!node.datasetKey.trim()) throw new Error('datasetKey is required');
    if (nodeMap.has(node.datasetKey)) {
      throw new Error(`duplicate dataset declaration: ${node.datasetKey}`);
    }
    nodeMap.set(node.datasetKey, node);
  }

  const downstream = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const key of nodeMap.keys()) {
    downstream.set(key, []);
    indegree.set(key, 0);
  }
  // Deterministic edge processing regardless of input order.
  const sortedEdges = [...edges].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  );
  for (const edge of sortedEdges) {
    if (!nodeMap.has(edge.from))
      throw new Error(`edge references undeclared dataset: ${edge.from}`);
    if (!nodeMap.has(edge.to)) throw new Error(`edge references undeclared dataset: ${edge.to}`);
    downstream.get(edge.from)!.push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to)! + 1);
  }

  // Kahn's algorithm with lexicographic tie-break → deterministic order.
  const ready = [...nodeMap.keys()].filter((key) => indegree.get(key) === 0).sort();
  const topologicalOrder: string[] = [];
  const remaining = new Map(indegree);
  while (ready.length > 0) {
    const key = ready.shift()!;
    topologicalOrder.push(key);
    for (const next of downstream.get(key)!) {
      const degree = remaining.get(next)! - 1;
      remaining.set(next, degree);
      if (degree === 0) {
        // Insert keeping the ready queue sorted (small N; clarity over speed).
        const index = ready.findIndex((candidate) => candidate > next);
        if (index === -1) ready.push(next);
        else ready.splice(index, 0, next);
      }
    }
  }
  if (topologicalOrder.length !== nodeMap.size) {
    throw new Error('pipeline dependency graph contains a cycle');
  }

  return { nodes: nodeMap, downstream, topologicalOrder };
}

/**
 * Downstream closure of the changed datasets, in topological order.
 * This is the EXACT recompute set — nothing more (no full-pipeline rebuilds
 * for a leaf change), nothing less (every transitive consumer included).
 */
export function computeSelectiveRecompute(
  dag: PipelineDag,
  changedDatasetKeys: readonly string[],
): string[] {
  const affected = new Set<string>();
  const queue: string[] = [];
  for (const key of changedDatasetKeys) {
    if (!dag.nodes.has(key)) throw new Error(`unknown dataset: ${key}`);
    if (!affected.has(key)) {
      affected.add(key);
      queue.push(key);
    }
  }
  while (queue.length > 0) {
    const key = queue.shift()!;
    for (const next of dag.downstream.get(key)!) {
      if (!affected.has(next)) {
        affected.add(next);
        queue.push(next);
      }
    }
  }
  return dag.topologicalOrder.filter((key) => affected.has(key));
}

export type ProducerCoverageReport = {
  complete: boolean;
  coverageRatio: number;
  uncovered: string[];
  /** Reserved for future multi-producer declarations; currently impossible
   * because buildPipelineDag rejects duplicate dataset keys. */
  conflicts: string[];
};

export function verifyProducerCoverage(dag: PipelineDag): ProducerCoverageReport {
  const uncovered: string[] = [];
  for (const key of dag.topologicalOrder) {
    const node = dag.nodes.get(key)!;
    if (node.producerKey === null || !node.producerKey.trim()) uncovered.push(key);
  }
  const total = dag.topologicalOrder.length;
  const covered = total - uncovered.length;
  return {
    complete: uncovered.length === 0,
    coverageRatio: total === 0 ? 1 : covered / total,
    uncovered,
    conflicts: [],
  };
}
