import type { LayerPlan } from '@siteframe/reconstruction-engine';
import type { UINode } from '@siteframe/shared-types';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Figma appends a child as the last (topmost) layer and the layers panel lists
 * the topmost layer first. Appending captured siblings in DOM order therefore
 * showed a page's last section at the top of the panel and its first section at
 * the bottom, which reads backwards in review.
 *
 * The order below is built from two kinds of evidence:
 *
 * 1. CSS painting order. Positioned and positive z-index siblings paint above
 *    static flow, whatever their DOM order, so those relationships are kept as
 *    hard constraints.
 * 2. Captured position. Siblings whose paint order is genuinely free - they do
 *    not overlap, or only one of them paints in the shared area - are emitted
 *    bottom-of-page first, which puts the top of the page at the top of the
 *    layers panel.
 *
 * Auto Layout groups are never reordered because there the child order defines
 * the layout itself.
 */

const paintedRects = new WeakMap<LayerPlan, Rect[]>();

function paints(plan: LayerPlan): boolean {
  const node = plan.source;
  if (plan.opacity <= 0.01) return false;
  if (node.type === 'text' || node.assetId) return true;
  return !!plan.fill || !!plan.border || plan.shadows.length > 0;
}

function paintRects(plan: LayerPlan): Rect[] {
  const cached = paintedRects.get(plan);
  if (cached) return cached;
  const rects: Rect[] = [];
  const walk = (current: LayerPlan): void => {
    if (current.opacity <= 0.01) return;
    if (paints(current)) rects.push(current.source.bounds);
    current.children.forEach(walk);
  };
  walk(plan);
  paintedRects.set(plan, rects);
  return rects;
}

function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y),
    right = Math.min(a.x + a.width, b.x + b.width),
    bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right - x <= 1 || bottom - y <= 1) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function paintsInside(plan: LayerPlan, area: Rect): boolean {
  return paintRects(plan).some((rect) => !!intersection(rect, area));
}

interface Stacking {
  group: number;
  z: number;
}

// Coarse CSS painting order: negative z-index below static flow, static flow,
// positioned at z-index auto/0, then positive z-index in ascending order.
function stacking(node: UINode): Stacking {
  // Synthetic boxless wrappers do not create a CSS stacking context. In Figma
  // they are frames, so propagate their sole child's stack level explicitly.
  if (node.styles.display === 'contents' && node.children.length === 1)
    return stacking(node.children[0]!);
  const positioned = ['absolute', 'fixed', 'sticky', 'relative'].includes(
    node.styles.position ?? '',
  );
  if (!positioned) return { group: 0, z: 0 };
  const raw = node.styles.zIndex ?? 'auto',
    z = raw === 'auto' ? 0 : parseInt(raw, 10) || 0;
  if (z < 0) return { group: -1, z };
  if (z > 0) return { group: 2, z };
  return { group: 1, z: 0 };
}

/** True when `a` paints above `b` regardless of DOM order. */
function stackingAbove(a: UINode, b: UINode): boolean | undefined {
  const left = stacking(a),
    right = stacking(b);
  if (left.group !== right.group) return left.group > right.group;
  if (left.group === 2 && left.z !== right.z) return left.z > right.z;
  return undefined;
}

/** Children in the order they must be appended to read top-to-bottom in Figma. */
export function orderedChildren(plan: LayerPlan): LayerPlan[] {
  const children = plan.children;
  if (plan.layout || children.length < 2) return children;
  const count = children.length;
  const edges: number[][] = Array.from({ length: count }, () => []),
    inbound = new Array<number>(count).fill(0);
  // An edge means "emit first": the target is painted in front of the source.
  const behind = (source: number, target: number): void => {
    edges[source]!.push(target);
    inbound[target]! += 1;
  };
  for (let i = 0; i < count; i++)
    for (let j = i + 1; j < count; j++) {
      const a = children[i]!,
        b = children[j]!;
      const shared = intersection(a.source.bounds, b.source.bounds);
      if (!shared || !paintsInside(a, shared) || !paintsInside(b, shared)) continue;
      const aAbove = stackingAbove(a.source, b.source);
      if (aAbove === true) {
        behind(j, i);
        continue;
      }
      if (aAbove === false) {
        behind(i, j);
        continue;
      }
      // Same painting group. Keep the browser order when both paint in the
      // shared area, because reordering could then hide artwork.
      if (shared && paintsInside(a, shared) && paintsInside(b, shared)) behind(i, j);
    }
  const later = (a: UINode, b: UINode): boolean =>
    Math.abs(a.bounds.y - b.bounds.y) <= 2 ? a.bounds.x > b.bounds.x : a.bounds.y > b.bounds.y;
  const emitted: LayerPlan[] = [],
    done = new Array<boolean>(count).fill(false);
  for (let step = 0; step < count; step++) {
    let pick = -1;
    for (let i = 0; i < count; i++) {
      if (done[i] || inbound[i]! > 0) continue;
      // Emit bottom-of-page first so the panel reads top-of-page first.
      if (pick === -1 || later(children[i]!.source, children[pick]!.source)) pick = i;
    }
    if (pick === -1) break;
    done[pick] = true;
    emitted.push(children[pick]!);
    for (const next of edges[pick]!) inbound[next]! -= 1;
  }
  // Defensive: only reachable if the evidence produced a cycle.
  for (let i = 0; i < count; i++) if (!done[i]) emitted.push(children[i]!);
  return emitted;
}
