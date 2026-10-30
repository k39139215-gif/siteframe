import type { AssetReference, UINode } from '@siteframe/shared-types';
function size(value: string, available: number): number | undefined {
  if (value.endsWith('%')) return (parseFloat(value) * available) / 100;
  if (/^[\d.]+(?:px)?$/.test(value)) return parseFloat(value);
  const fn = /^(max|min)\((.*)\)$/.exec(value);
  if (fn) {
    const values = fn[2]!.split(',').map((v) => size(v.trim(), available));
    if (values.every((v): v is number => v !== undefined))
      return fn[1] === 'max' ? Math.max(...values) : Math.min(...values);
  }
  return undefined;
}
export function imagePaint(n: UINode, asset: AssetReference, imageHash: string): ImagePaint {
  const w = Math.max(1, n.bounds.width),
    h = Math.max(1, n.bounds.height);
  const iw = Math.max(1, asset.width),
    ih = Math.max(1, asset.height);
  const bg =
    n.type !== 'image' && !!n.styles.backgroundImage && n.styles.backgroundImage !== 'none';
  const sizing = bg ? (n.styles.backgroundSize ?? 'cover') : (n.styles.objectFit ?? 'fill');
  let width = w,
    height = h;
  if (sizing === 'cover' || sizing === 'contain') {
    const scale = sizing === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
    width = iw * scale;
    height = ih * scale;
  } else if (sizing !== 'fill') {
    const parts = sizing.match(/(?:max|min|calc)\([^)]*\)|[^\s]+/g) ?? [];
    width = size(parts[0] ?? 'auto', w) ?? iw;
    height = size(parts[1] ?? 'auto', h) ?? ih;
    if (parts[1] === undefined || parts[1] === 'auto') height = (width * ih) / iw;
    if (parts[0] === 'auto' && parts[1] && parts[1] !== 'auto') width = (height * iw) / ih;
  }
  const position = (bg ? n.styles.backgroundPosition : undefined) ?? '50% 50%';
  const parts = position.split(/\s+/);
  const offset = (part: string | undefined, space: number) =>
    part === 'left' || part === 'top'
      ? 0
      : part === 'right' || part === 'bottom'
        ? space
        : part === 'center' || !part
          ? space / 2
          : part.endsWith('%')
            ? (parseFloat(part) * space) / 100
            : parseFloat(part) || 0;
  const x = offset(parts[0], w - width),
    y = offset(parts[1], h - height);
  const flip =
    n.styles.transform?.replace(/\s/g, '') === 'matrix(-1,0,0,-1,0,0)' && !n.children.length;
  const matrix: Transform = flip
    ? [
        [-w / width, 0, 1 + x / width],
        [0, -h / height, 1 + y / height],
      ]
    : [
        [w / width, 0, -x / width],
        [0, h / height, -y / height],
      ];
  return { type: 'IMAGE', imageHash, scaleMode: 'CROP', imageTransform: matrix };
}
