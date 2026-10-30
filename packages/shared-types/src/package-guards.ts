import type { ReconstructionPackage, UINode } from './index';
import { assetSourceLabel, inlineBackgroundLabel } from './asset-source';

export function readPackageJson(text: string): unknown {
  if (text.length > 80_000_000) throw new Error('Package exceeds the 80 MB import limit.');
  const raw: unknown = JSON.parse(text);
  let count = 0;
  const visit = (value: unknown, depth: number): void => {
    if (depth > 140) throw new Error('Package nesting exceeds safety limit.');
    if (value && typeof value === 'object') {
      if (++count > 600000) throw new Error('Package object limit exceeded.');
      for (const child of Object.values(value)) visit(child, depth + 1);
    }
  };
  visit(raw, 0);
  // Repair old captures before either validator runs. Keep embedded image bytes
  // intact; do not relax URL/data limits or silently discard a URL-only payload.
  const record = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const repairAsset = (v: unknown) => {
    if (record(v) && typeof v.sourceUrl === 'string' && typeof v.data === 'string' && v.data)
      v.sourceUrl = assetSourceLabel(v.sourceUrl);
  };
  if (record(raw)) {
    // Legacy crawls concatenated all expanded section labels into this display
    // field. Bound only the label; preserve URLs, safety decisions and artwork.
    let shortenedAttention = 0;
    if (Array.isArray(raw.attention))
      for (const item of raw.attention) {
        if (record(item) && typeof item.screenName === 'string' && item.screenName.length > 300) {
          item.screenName = item.screenName.slice(0, 299) + '…';
          shortenedAttention++;
        }
      }
    if (shortenedAttention) {
      const warning = {
        code: 'ATTENTION_LABEL_TRUNCATED',
        message: `Shortened ${shortenedAttention} legacy attention display names to 300 characters. Screen content and safety decisions are unchanged.`,
      };
      if (Array.isArray(raw.warnings)) raw.warnings.push(warning);
      else raw.warnings = [warning];
    }
    let expandedStyleBytes = 0;
    let styles: Record<string, string>[] | undefined;
    if (raw.encoding !== undefined) {
      if (
        raw.encoding !== 'styles-v1' ||
        !Array.isArray(raw.styleTable) ||
        raw.styleTable.length > 100000
      )
        throw new Error('Invalid package style encoding');
      styles = raw.styleTable.map((style) => {
        if (
          !record(style) ||
          Object.keys(style).length > 100 ||
          Object.entries(style).some(
            ([k, v]) => k.length > 60 || typeof v !== 'string' || v.length > 10000,
          )
        )
          throw new Error('Invalid shared style entry');
        return style as Record<string, string>;
      });
    }
    // Older captures can repeat a node id when a page reuses the same HTML id
    // for a repeated component. Every consumer (Figma node maps, components,
    // replay) needs unique ids, so repair the later duplicates instead of
    // rejecting an otherwise usable package.
    const usedNodeIds = new Set<string>();
    let repairedNodeIds = 0;
    const uniqueNodeId = (id: string): string => {
      const base = id.length > 130 ? id.slice(0, 130) : id;
      let index = 2;
      let candidate = base + '_dup' + index;
      while (usedNodeIds.has(candidate)) {
        index++;
        candidate = base + '_dup' + index;
      }
      return candidate;
    };
    if (Array.isArray(raw.assets)) raw.assets.forEach(repairAsset);
    if (Array.isArray(raw.screens))
      for (const screen of raw.screens) {
        if (!record(screen)) continue;
        if (Array.isArray(screen.assets)) screen.assets.forEach(repairAsset);
        repairAsset(screen.screenshot);
        const repairNode = (node: unknown) => {
          if (!record(node)) return;
          if (typeof node.id === 'string' && node.id) {
            const id = node.id;
            if (usedNodeIds.has(id)) {
              const unique = uniqueNodeId(id);
              node.id = unique;
              usedNodeIds.add(unique);
              repairedNodeIds++;
            } else usedNodeIds.add(id);
          }
          if (styles && typeof node.styles === 'number') {
            const style = styles[node.styles];
            if (!Number.isInteger(node.styles) || !style)
              throw new Error('Invalid style table reference');
            expandedStyleBytes += JSON.stringify(style).length;
            if (expandedStyleBytes > 120_000_000) throw new Error('Expanded style budget exceeded');
            node.styles = { ...style };
          }
          if (
            node.assetId &&
            record(node.styles) &&
            typeof node.styles.backgroundImage === 'string'
          )
            node.styles.backgroundImage = inlineBackgroundLabel(node.styles.backgroundImage);
          if (Array.isArray(node.children)) node.children.forEach(repairNode);
        };
        if (Array.isArray(screen.uiTree)) screen.uiTree.forEach(repairNode);
      }
    if (repairedNodeIds) {
      const warning = {
        code: 'DUPLICATE_NODE_ID_REPAIRED',
        message:
          'Repaired ' +
          repairedNodeIds +
          ' duplicate node ID(s) caused by repeated HTML id attributes. The later nodes were renamed; component references keep pointing at the first occurrence.',
      };
      if (Array.isArray(raw.warnings)) raw.warnings.push(warning);
      else raw.warnings = [warning];
    }
  }
  return raw;
}

export function validatePackageReferences(result: ReconstructionPackage): ReconstructionPackage {
  const ids = new Set<string>();
  const assets = new Set(result.assets.map((asset) => asset.id));
  const walk = (node: UINode): void => {
    if (ids.has(node.id)) throw new Error('Duplicate node ID: ' + node.id);
    ids.add(node.id);
    if (node.assetId && !assets.has(node.assetId))
      throw new Error('Missing asset reference: ' + node.assetId);
    node.children.forEach(walk);
  };
  const screens = new Set<string>();
  for (const screen of result.screens) {
    if (screens.has(screen.id)) throw new Error('Duplicate screen ID');
    screens.add(screen.id);
    screen.uiTree.forEach(walk);
  }
  for (const edge of result.edges)
    if (!screens.has(edge.from) || (edge.to && !screens.has(edge.to)))
      throw new Error('Invalid graph edge');
  for (const component of result.components)
    if (!ids.has(component.sourceNodeId) || component.nodeIds.some((id) => !ids.has(id)))
      throw new Error('Invalid component reference');
  return result;
}
