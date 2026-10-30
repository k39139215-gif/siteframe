import type { CrawlConfig, ScreenState, UINode } from '@siteframe/shared-types';
import { hash } from '@siteframe/utils';
import {
  expandMeasuredScrollContent,
  visibleContentBottom,
} from '../../../packages/shared-types/src/presentation-geometry';

/** Recover old app-shell packages only from recorded scroll measurements.
 * Descendants alone cannot distinguish a scrollport from intentionally hidden UI. */
export function prepareScreenPresentation(
  screen: ScreenState,
  config: CrawlConfig,
): {
  screen: ScreenState;
  recovered: string[];
} {
  // Packages contain JSON data. This also works in the Figma plugin sandbox,
  // which does not guarantee the browser structuredClone global.
  const uiTree = JSON.parse(JSON.stringify(screen.uiTree)) as UINode[];
  const result = { ...screen, uiTree, pageSize: { ...screen.pageSize } };
  const recovered: string[] = [];
  if (
    !config.fullPage ||
    config.captureMode === 'viewport' ||
    config.captureMode === 'element' ||
    screen.kind !== 'page' ||
    uiTree.some((n) => n.attributes['siteframe.animation-screen'])
  ) {
    return { screen: result, recovered };
  }
  const nodes: { node: UINode; parents: UINode[] }[] = [];
  const walk = (node: UINode, parents: UINode[]) => {
    nodes.push({ node, parents });
    node.children.forEach((child) => walk(child, [...parents, node]));
  };
  uiTree.forEach((node) => walk(node, []));
  const hasExpanded = nodes.some(({ node }) => node.attributes['siteframe.full-scroll-content']);
  const shell = screen.pageSize.height <= screen.viewport.height + 3;
  if (shell && !hasExpanded) {
    const measurements = (screen.diagnostics ?? []).flatMap((d) => {
      if (d.event === 'SCROLL_CONTAINER_ENTER') return [d.data];
      if (d.event === 'SCROLL_CONTAINERS' && Array.isArray(d.data.containers))
        return d.data.containers.map((data) => ({ ...data, container: data.selector }));
      return [];
    });
    const byContainer = new Map<string, Record<string, unknown>>();
    for (const measurement of measurements)
      if (typeof measurement.container === 'string')
        byContainer.set(measurement.container, measurement);
    const candidates = [...byContainer.values()].flatMap((data) => {
      const { container, scrollHeight, clientHeight, clientWidth } = data;
      if (
        typeof container !== 'string' ||
        typeof scrollHeight !== 'number' ||
        typeof clientHeight !== 'number' ||
        typeof clientWidth !== 'number' ||
        scrollHeight <= clientHeight + 3 ||
        clientHeight <= 0 ||
        clientWidth <= 0 ||
        (typeof data.scrollTop === 'number' && Math.abs(data.scrollTop) > 2)
      )
        return [];
      const suffix = 'node_' + hash(container);
      const found = nodes.find(({ node }) => node.id === suffix || node.id.endsWith('_' + suffix));
      if (
        !found ||
        [...found.parents, found.node].some(
          (node) =>
            node.bounds.height <= 0 ||
            ['nav', 'aside', 'dialog'].includes(node.tagName) ||
            ['navigation', 'dialog', 'menu'].includes(node.attributes.role ?? '') ||
            node.attributes['aria-modal'] === 'true',
        )
      )
        return [];
      return [
        { ...found, container, scrollHeight, clientHeight, area: clientWidth * clientHeight },
      ];
    });
    const selected = candidates
      .filter((c) => !candidates.some((p) => c !== p && c.parents.includes(p.node)))
      .sort((a, b) => b.area - a.area)[0];
    if (selected) {
      const height =
        selected.scrollHeight + Math.max(0, selected.node.bounds.height - selected.clientHeight);
      expandMeasuredScrollContent(uiTree, new Map([[selected.node.id, height]]));
      recovered.push(selected.container);
    }
  }
  result.pageSize.height = Math.max(result.pageSize.height, visibleContentBottom(uiTree));
  return { screen: result, recovered };
}
