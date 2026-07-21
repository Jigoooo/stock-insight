import Graph from 'graphology';

import { layoutRelationNodes, RELATION_LAYOUT_CENTER } from './relation-layout.ts';

import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

export type RelationGraphNodeAttributes = {
  x: number;
  y: number;
  size: number;
  color: string;
  label: string;
  fullLabel: string;
  market: 'KR' | 'US';
  watched: boolean;
  holding: boolean;
  isRoot: boolean;
  fixed: boolean;
  highlighted?: boolean;
};

export type RelationGraphEdgeAttributes = {
  type: 'arrow' | 'line';
  size: number;
  color: string;
  relationType: EntityRelationGraph['edges'][number]['relationType'];
  evidenceQuality: EntityRelationGraph['edges'][number]['evidenceQuality'];
  evidenceCount: number;
  weight: number;
  approved: true;
  inferred: false;
};

export type RelationGraphology = Graph<
  RelationGraphNodeAttributes,
  RelationGraphEdgeAttributes,
  Record<string, never>
>;

const nodeColors = {
  default: '#d7dde6',
  holding: '#cce9d8',
  root: '#17233f',
  watched: '#c9d8f5',
} as const;

const edgeColors = {
  high: '#a9b9d8',
  medium: '#c2cad5',
  low: '#dde2e9',
} as const;

function graphLabel(label: string): string {
  return label.length > 16 ? `${label.slice(0, 15)}…` : label;
}

export function isVerifiedRelationEdge(edge: EntityRelationGraph['edges'][number]): boolean {
  return edge.approved === true && edge.inferred === false;
}

/**
 * Converts the already-verified relation DTO into a Graphology graph.
 * This function never creates inferred nodes or edges: graph identity is a
 * lossless projection of the API contract.
 */
export function buildRelationGraph(source: EntityRelationGraph): RelationGraphology {
  const graph: RelationGraphology = new Graph({
    allowSelfLoops: false,
    multi: true,
    type: 'mixed',
  });
  const layout = new Map(
    layoutRelationNodes(source.nodes, source.rootEntityKey).map((node) => [node.entityKey, node]),
  );

  for (const node of source.nodes) {
    const position = layout.get(node.entityKey);
    if (!position) throw new Error(`Missing deterministic relation layout for ${node.entityKey}`);
    const isRoot = node.entityKey === source.rootEntityKey;
    graph.addNode(node.entityKey, {
      x: (position.x - RELATION_LAYOUT_CENTER.x) / RELATION_LAYOUT_CENTER.x,
      y: (position.y - RELATION_LAYOUT_CENTER.y) / RELATION_LAYOUT_CENTER.y,
      size: isRoot ? 17 : node.holding ? 13 : node.watched ? 11 : 9,
      color: isRoot
        ? nodeColors.root
        : node.holding
          ? nodeColors.holding
          : node.watched
            ? nodeColors.watched
            : nodeColors.default,
      label: graphLabel(node.label),
      fullLabel: node.label,
      market: node.market,
      watched: node.watched,
      holding: node.holding,
      isRoot,
      fixed: isRoot,
    });
  }

  for (const edge of source.edges) {
    if (!isVerifiedRelationEdge(edge)) {
      throw new Error(`Unverified relation edge ${edge.edgeId}`);
    }
    const attributes: RelationGraphEdgeAttributes = {
      type: edge.direction === 'directed' ? 'arrow' : 'line',
      size: 0.35 + edge.weight * 0.75,
      color: edgeColors[edge.evidenceQuality],
      relationType: edge.relationType,
      evidenceQuality: edge.evidenceQuality,
      evidenceCount: edge.evidenceCount,
      weight: edge.weight,
      approved: true,
      inferred: false,
    };
    if (edge.direction === 'directed') {
      graph.addDirectedEdgeWithKey(edge.edgeId, edge.from, edge.to, attributes);
    } else {
      graph.addUndirectedEdgeWithKey(edge.edgeId, edge.from, edge.to, attributes);
    }
  }

  return graph;
}
