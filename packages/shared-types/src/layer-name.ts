import type { UINode } from './index';
const clean = (text: string) =>
  text
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
const generic = (n: UINode) =>
  n.name === n.tagName || /^(?:div|span|i)(?:::(?:before|after))?$/.test(n.name);
const textOf = (n: UINode, depth = 0): string =>
  depth > 5 ? '' : clean(n.text ?? n.children.map((c) => textOf(c, depth + 1)).join(' '));

/** Shared extraction/import naming. Never changes content, fonts, IDs or geometry. */
export function semanticLayerName(n: UINode): string {
  if (n.type === 'text') return clean(n.text ?? n.name) || 'Text';
  if (n.attributes['siteframe.navigation-rail'] === 'true') return 'Sidebar navigation';
  const attr = n.attributes,
    role = attr.role ?? '',
    tag = n.tagName;
  const typeNames: Record<string, string> = {
    button: 'Button',
    link: 'Link',
    input: 'Input',
    image: 'Image',
    svg: 'Vector',
    icon: 'Icon',
    dialog: 'Dialog',
    nav: 'Navigation',
    form: 'Form',
    list: 'List',
  };
  const roles: Record<string, string> = {
    button: 'Button',
    link: 'Link',
    dialog: 'Dialog',
    alertdialog: 'Alert dialog',
    navigation: 'Navigation',
    main: 'Main content',
    table: 'Table',
    grid: 'Data grid',
    row: 'Row',
    cell: 'Cell',
    columnheader: 'Column header',
    rowheader: 'Row header',
    tab: 'Tab',
    tablist: 'Tabs',
    tabpanel: 'Tab panel',
    combobox: 'Dropdown',
    searchbox: 'Search input',
    textbox: 'Input',
    checkbox: 'Checkbox',
    switch: 'Switch',
    menu: 'Menu',
    menuitem: 'Menu item',
    region: 'Section',
    progressbar: 'Progress',
  };
  const tags: Record<string, string> = {
    body: 'Page content',
    main: 'Main content',
    header: 'Header',
    footer: 'Footer',
    section: 'Section',
    article: 'Article',
    aside: 'Sidebar',
    nav: 'Navigation',
    ul: 'List',
    ol: 'List',
    li: 'List item',
    table: 'Table',
    thead: 'Table header',
    tbody: 'Table body',
    tr: 'Row',
    td: 'Cell',
    th: 'Column header',
    video: 'Video',
    canvas: 'Canvas',
    iframe: 'Embedded content',
    label: 'Label',
  };
  const kind =
    roles[role] ||
    typeNames[n.type] ||
    tags[tag] ||
    (/^h[1-6]$/.test(tag) ? 'Heading' : /::(?:before|after)$/.test(tag) ? 'Decoration' : 'Group');
  const label = clean(attr['aria-label'] || attr.alt || attr.placeholder || '');
  const derivedText = textOf(n);
  if (
    n.name &&
    !generic(n) &&
    n.name !== label &&
    !(
      n.name === derivedText &&
      [
        'Button',
        'Link',
        'Tab',
        'Menu item',
        'Input',
        'Image',
        'Vector',
        'Heading',
        'Label',
      ].includes(kind)
    )
  )
    return n.name.slice(0, 300);
  let content = label;
  if (
    !content &&
    [
      'Button',
      'Link',
      'Tab',
      'Menu item',
      'Label',
      'Heading',
      'List item',
      'Cell',
      'Column header',
    ].includes(kind)
  )
    content = textOf(n);
  if (!content && ['Section', 'Article', 'Dialog', 'Main content'].includes(kind)) {
    const heading = n.children.find(
      (c) => /^h[1-6]$/.test(c.tagName) || c.attributes.role === 'heading',
    );
    if (heading) content = textOf(heading);
  }
  if (!content && kind === 'Group' && n.children.length === 1 && n.children[0]!.type === 'text')
    content = textOf(n.children[0]!);
  return content ? `${kind} · ${content}` : kind;
}
