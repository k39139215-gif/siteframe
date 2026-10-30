import type { UINode } from './index';

export function overflowAxis(node: UINode, axis: 'X' | 'Y'): string {
  const shorthand = (node.styles.overflow ?? 'visible').trim().split(/\s+/);
  return (
    node.styles[`overflow${axis}`] ?? (axis === 'Y' ? shorthand[1] : undefined) ?? shorthand[0]!
  );
}

export function clipsAxis(node: UINode, axis: 'X' | 'Y'): boolean {
  return ['hidden', 'clip', 'auto', 'scroll', 'overlay'].includes(overflowAxis(node, axis));
}

/** Visible vertical extent, respecting local scrollports and closed sections.
 * Selected full-content ports must be expanded before measuring this extent. */
export function visibleContentBottom(nodes: UINode[]): number {
  const visit = (node: UINode, clipBottom: number): number => {
    if (node.styles.display === 'none') return 0;
    const bottom = Math.min(clipBottom, node.bounds.y + node.bounds.height);
    const limit = clipsAxis(node, 'Y') ? bottom : clipBottom;
    return Math.max(bottom, ...node.children.map((child) => visit(child, limit)));
  };
  return Math.min(50000, Math.max(0, ...nodes.map((node) => visit(node, Infinity))));
}

/** Expand measured primary content only. Preserve local clips; move subsequent
 * in-flow siblings down by the expansion so they cannot overlap the content. */
export function expandMeasuredScrollContent(nodes: UINode[], heights: Map<string, number>): void {
  const translate = (node: UINode, dy: number): void => {
    node.bounds.y += dy;
    node.children.forEach((child) => translate(child, dy));
  };
  const visit = (node: UINode): boolean => {
    if (node.styles.display === 'none' || (node.bounds.height <= 0 && clipsAxis(node, 'Y')))
      return false;
    const original = node.bounds.height;
    const before = new Map(node.children.map((child) => [child, { ...child.bounds }]));
    const grew = new Set<UINode>();
    for (const child of node.children) if (visit(child)) grew.add(child);
    for (const child of [...grew].sort((a, b) => before.get(a)!.y - before.get(b)!.y)) {
      const box = before.get(child)!;
      const delta = child.bounds.height - box.height;
      if (delta <= 0) continue;
      for (const sibling of node.children) {
        const other = before.get(sibling)!;
        if (
          sibling === child ||
          ['absolute', 'fixed', 'sticky'].includes(sibling.styles.position ?? '')
        )
          continue;
        if (
          other.y >= box.y + box.height - 1 &&
          other.x < box.x + box.width &&
          other.x + other.width > box.x
        ) {
          translate(sibling, delta);
          grew.add(sibling);
        }
      }
    }
    const selected = heights.get(node.id);
    if (selected !== undefined) {
      node.bounds.height = Math.max(original, Math.min(50000 - node.bounds.y, selected));
      node.attributes['siteframe.full-scroll-content'] = 'true';
    }
    for (const child of grew)
      node.bounds.height = Math.max(
        node.bounds.height,
        child.bounds.y + child.bounds.height - node.bounds.y,
      );
    if (node.bounds.height !== original) node.styles.height = `${node.bounds.height}px`;
    return node.bounds.height > original;
  };
  nodes.forEach(visit);
}
