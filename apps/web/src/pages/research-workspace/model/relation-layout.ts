export type RelationLayoutNode = {
  entityKey: string;
  label: string;
  x: number;
  y: number;
};

type RelationLayoutInput = Pick<RelationLayoutNode, 'entityKey' | 'label'>;

const center = { x: 280, y: 150 } as const;

export function layoutRelationNodes(
  nodes: readonly RelationLayoutInput[],
  rootEntityKey: string,
): RelationLayoutNode[] {
  const root = nodes.find(({ entityKey }) => entityKey === rootEntityKey);
  const ordered = [
    ...(root ? [root] : []),
    ...nodes.filter(({ entityKey }) => entityKey !== rootEntityKey),
  ].slice(0, 20);

  return ordered.map((node, index) => {
    if (index === 0) return { ...node, ...center };
    const ringIndex = index - 1;
    const innerRing = ringIndex < 8;
    const ringOffset = innerRing ? ringIndex : ringIndex - 8;
    const ringCount = innerRing ? Math.min(8, ordered.length - 1) : Math.max(1, ordered.length - 9);
    const radiusX = innerRing ? 102 : 202;
    const radiusY = innerRing ? 72 : 116;
    const angle = -Math.PI / 2 + (ringOffset / ringCount) * Math.PI * 2;
    return {
      ...node,
      x: Number((center.x + Math.cos(angle) * radiusX).toFixed(2)),
      y: Number((center.y + Math.sin(angle) * radiusY).toFixed(2)),
    };
  });
}
