export type RelationLayoutNode = {
  entityKey: string;
  label: string;
  x: number;
  y: number;
};

type RelationLayoutInput = Pick<RelationLayoutNode, 'entityKey' | 'label'>;

export const RELATION_LAYOUT_CENTER = { x: 280, y: 150 } as const;

export function layoutRelationNodes(
  nodes: readonly RelationLayoutInput[],
  rootEntityKey: string,
): RelationLayoutNode[] {
  const root = nodes.find(({ entityKey }) => entityKey === rootEntityKey);
  if (!root) throw new Error(`Missing relation root node ${rootEntityKey}`);

  const remaining = nodes.filter(({ entityKey }) => entityKey !== rootEntityKey);
  const rings: RelationLayoutInput[][] = [];
  for (let ringIndex = 0, offset = 0; offset < remaining.length; ringIndex += 1) {
    const capacity = 8 + ringIndex * 4;
    rings.push(remaining.slice(offset, offset + capacity));
    offset += capacity;
  }

  const positioned = rings.flatMap((ring, ringIndex) => {
    const radiusScale = (ringIndex + 1) / Math.max(1, rings.length);
    const radiusX = 102 + (250 - 102) * radiusScale;
    const radiusY = 72 + (138 - 72) * radiusScale;
    return ring.map((node, nodeIndex) => {
      const angle = -Math.PI / 2 + (nodeIndex / ring.length) * Math.PI * 2;
      return {
        ...node,
        x: Number((RELATION_LAYOUT_CENTER.x + Math.cos(angle) * radiusX).toFixed(2)),
        y: Number((RELATION_LAYOUT_CENTER.y + Math.sin(angle) * radiusY).toFixed(2)),
      };
    });
  });

  return [{ ...root, ...RELATION_LAYOUT_CENTER }, ...positioned];
}
