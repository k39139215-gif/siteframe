import type { Bounds, ComputedStyles, UINode } from './index';

const clips = (value: string | undefined) => /^(hidden|clip|auto|scroll)$/.test(value ?? '');

/** A collapsed clipping box is different from a boxless display:contents wrapper. */
export function isCollapsedClip(bounds: Bounds, styles: ComputedStyles): boolean {
  return (
    styles.display !== 'contents' &&
    ((bounds.width <= 0 && clips(styles.overflowX ?? styles.overflow)) ||
      (bounds.height <= 0 && clips(styles.overflowY ?? styles.overflow)))
  );
}

/** Reject missing captures; a body background alone is not a reconstructed screen. */
export function hasCaptureContent(nodes: UINode[], area: Bounds): boolean {
  const visit = (node: UINode, clip: Bounds): boolean => {
    const { bounds: b, styles: s } = node;
    if (
      s.display === 'none' ||
      (s.opacity !== undefined && Number(s.opacity) === 0) ||
      isCollapsedClip(b, s)
    )
      return false;
    const overlaps =
      b.width > 0 &&
      b.height > 0 &&
      b.x < clip.x + clip.width &&
      b.y < clip.y + clip.height &&
      b.x + b.width > clip.x &&
      b.y + b.height > clip.y;
    const nonRoot = !['body', 'html'].includes(node.tagName);
    const transparent = (v: string | undefined) =>
      !v || ['transparent', 'rgba(0, 0, 0, 0)'].includes(v);
    const decoration =
      nonRoot &&
      ((!transparent(s.backgroundColor) && !node.children.length) ||
        (s.backgroundImage && s.backgroundImage !== 'none') ||
        ['Top', 'Right', 'Bottom', 'Left'].some(
          (side) => parseFloat(s[`border${side}Width` as keyof ComputedStyles] ?? '') > 0,
        ));
    if (
      overlaps &&
      ((node.type === 'text' && !!node.text?.trim()) ||
        node.assetId ||
        ['svg', 'input'].includes(node.type) ||
        decoration)
    )
      return true;
    let childClip = clip;
    if (clips(s.overflowX ?? s.overflow) || clips(s.overflowY ?? s.overflow)) {
      const x = clips(s.overflowX ?? s.overflow) ? Math.max(clip.x, b.x) : clip.x;
      const y = clips(s.overflowY ?? s.overflow) ? Math.max(clip.y, b.y) : clip.y;
      const right = clips(s.overflowX ?? s.overflow)
        ? Math.min(clip.x + clip.width, b.x + b.width)
        : clip.x + clip.width;
      const bottom = clips(s.overflowY ?? s.overflow)
        ? Math.min(clip.y + clip.height, b.y + b.height)
        : clip.y + clip.height;
      childClip = { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
    }
    return (
      childClip.width > 0 && childClip.height > 0 && node.children.some((n) => visit(n, childClip))
    );
  };
  return nodes.some((node) => visit(node, area));
}
