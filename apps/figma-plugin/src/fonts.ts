import type { UINode } from '@siteframe/shared-types';

export interface FontSubstitution {
  nodeId: string;
  requested: string;
  used: string;
  reason: string;
}

function weightOf(style: string): number {
  const s = style.toLowerCase().replace(/[\s-]/g, '');
  if (/thin|hairline/.test(s)) return 100;
  if (/extralight|ultralight/.test(s)) return 200;
  if (/light/.test(s)) return 300;
  if (/medium/.test(s)) return 500;
  if (/semibold|demibold/.test(s)) return 600;
  if (/extrabold|ultrabold/.test(s)) return 800;
  if (/black|heavy/.test(s)) return 900;
  if (/bold/.test(s)) return 700;
  return 400;
}

// Figma reports a font's real family name ("Suisse Intl") while a site may
// declare an internal webfont alias ("Suisseintl"). Compare ignoring case,
// spaces, hyphens and punctuation so an installed font is still found.
export function normalizeFamily(name: string): string {
  return name
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function familyKey(name: string): string {
  // A packaging suffix, not a license to equate unrelated CSS fallback families.
  return normalizeFamily(name.replace(/[\s_-]+variable$/i, ''));
}

export interface MissingFont {
  requested: string;
  nodeIds: string[];
  sourceText?: { nodeId: string; text: string }[];
  reason: string;
}

export class MissingFontsError extends Error {
  constructor(readonly missingFonts: MissingFont[]) {
    super(
      'Import paused: exact website fonts are unavailable in Figma.\n' +
        missingFonts
          .map((f) => `${f.requested} (${f.nodeIds.length} text layers): ${f.reason}`)
          .join('\n') +
        '\nInstall or enable these exact fonts in Figma, then retry the same package. No fonts were substituted. Website WOFF/WOFF2 files are not automatically available to the Figma Plugin API.',
    );
    this.name = 'MissingFontsError';
  }
}

export function fontRequest(n: UINode) {
  const family = (n.styles.fontFamilyUsed || n.styles.fontFamily?.split(',')[0] || 'Inter')
    .trim()
    .replace(/^["']|["']$/g, '');
  const parsed = Number(n.styles.fontWeight ?? '400');
  const weight = Number.isFinite(parsed) ? parsed : n.styles.fontWeight === 'bold' ? 700 : 400;
  const italic = /italic|oblique/i.test(n.styles.fontStyle ?? '');
  return { family, weight, italic, label: `${family} ${weight}${italic ? ' Italic' : ''}` };
}

export function assignExactFont(text: TextNode, face: FontName, source: UINode): void {
  try {
    text.fontName = face;
    const applied = text.fontName as FontName;
    for (const [axis, value] of Object.entries(face.variationSettings ?? {}))
      if (applied.variationSettings?.[axis] !== value)
        throw new Error('Figma did not preserve variation axis ' + axis + '=' + value);
  } catch (error) {
    throw new MissingFontsError([
      {
        requested: fontRequest(source).label,
        nodeIds: [source.id],
        sourceText: [{ nodeId: source.id, text: source.text ?? '' }],
        reason: 'Figma rejected the exact font: ' + String(error),
      },
    ]);
  }
}

export class FontResolver {
  private fonts: Font[] = [];
  private byFamily = new Map<string, Font[]>();
  private loaded = new Set<string>();
  private failures = new Map<string, string>();
  private unloadable = new Set<string>();
  private fallbackCandidates = new Map<string, FontName[]>();
  readonly substitutions: FontSubstitution[] = [];

  async init(): Promise<void> {
    this.byFamily.clear();
    this.loaded.clear();
    this.failures.clear();
    this.unloadable.clear();
    this.fallbackCandidates.clear();
    this.fonts = await figma.listAvailableFontsAsync();
    for (const font of this.fonts) {
      const key = familyKey(font.fontName.family);
      const bucket = this.byFamily.get(key);
      if (bucket) bucket.push(font);
      else this.byFamily.set(key, [font]);
    }
  }

  private pick(family: string, weight: number, italic: boolean): FontName | undefined {
    const matches = this.byFamily.get(familyKey(family));
    if (!matches?.length) return undefined;
    const score = (font: Font): number =>
      Math.abs(weightOf(font.fontName.style) - weight) +
      (/(italic|oblique)/i.test(font.fontName.style) !== italic ? 1000 : 0) +
      (normalizeFamily(font.fontName.family) === normalizeFamily(family) ? 0 : 10) +
      (/\d+pt/i.test(font.fontName.style) ? 50 : 0);
    const compatible = matches.filter(
      (f) =>
        /(italic|oblique)/i.test(f.fontName.style) === italic &&
        !/condensed|expanded/i.test(f.fontName.style) &&
        (!/display/i.test(f.fontName.style) || /display/i.test(family)),
    );
    const exact = compatible
      .filter((f) => weightOf(f.fontName.style) === weight)
      .sort((a, b) => score(a) - score(b))[0]?.fontName;
    if (exact) return exact;
    // Feature-detect against this editor. Older hosts must report the exact
    // weight unavailable rather than silently rounding it to a named instance.
    if (typeof figma.getFontFamilyVariationAxes === 'function') {
      for (const font of compatible.sort((a, b) => score(a) - score(b))) {
        try {
          if (figma.getFontFamilyVariationAxes(font.fontName.family)?.includes('wght'))
            return {
              ...font.fontName,
              variationSettings: { ...font.fontName.variationSettings, wght: weight },
            };
        } catch {
          /* An unavailable family is handled by resolve's diagnostic. */
        }
      }
    }
    return undefined;
  }

  private async load(font: FontName): Promise<boolean> {
    const key = JSON.stringify(font);
    if (this.loaded.has(key)) return true;
    if (this.unloadable.has(key)) return false;
    try {
      await figma.loadFontAsync(font);
      this.loaded.add(key);
      return true;
    } catch {
      this.unloadable.add(key);
      return false;
    }
  }

  /** An explicit presentation fallback; exact resolution above stays strict.
   * Use only faces the editor reports and successfully loads, and record every
   * substitution so the original request can be restored later. */
  async assignFallback(text: TextNode, n: UINode, reason: string): Promise<FontName> {
    const request = fontRequest(n);
    const stack = (n.styles.fontFamily ?? '').split(',').map(familyKey);
    const fontClass = n.styles.fontClass ||
      (/mono/i.test(request.family + ' ' + n.styles.fontFamily) ? 'monospace' :
        /(?:^|,)\s*serif\s*(?:,|$)/i.test(n.styles.fontFamily ?? '') ? 'serif' : 'sans-serif');
    const preferred = (fontClass === 'monospace'
      ? ['Roboto Mono', 'Noto Sans Mono', 'IBM Plex Mono', 'Courier New']
      : fontClass === 'serif'
        ? ['Noto Serif', 'Georgia', 'Times New Roman', 'Roboto Serif']
        : ['Inter', 'Arial', 'Noto Sans', 'Roboto', 'Open Sans']).map(familyKey);
    const score = (face: FontName) => {
      const key = familyKey(face.family);
      const cssIndex = stack.indexOf(key), preferredIndex = preferred.indexOf(key);
      const family = key === familyKey(request.family) ? 0 : cssIndex >= 0 ? 2000 + cssIndex * 10 :
        preferredIndex >= 0 ? 4000 + preferredIndex * 10 : 8000;
      return family + Math.abs(weightOf(face.style) - request.weight) +
        (/(italic|oblique)/i.test(face.style) !== request.italic ? 1000 : 0) +
        (/condensed|expanded/i.test(face.style) ? 500 : 0);
    };
    const cacheKey = JSON.stringify([request.label, fontClass, stack]);
    let candidates = this.fallbackCandidates.get(cacheKey);
    if (!candidates) {
      candidates = this.fonts.map(f => ({ family: f.fontName.family, style: f.fontName.style }))
        .filter(f => !/icon|dingbat|wingding|webding|emoji|symbol/i.test(f.family))
        .sort((a, b) => score(a) - score(b) || (a.family + a.style).localeCompare(b.family + b.style));
      this.fallbackCandidates.set(cacheKey, candidates);
    }
    for (const face of candidates) {
      if (!(await this.load(face))) continue;
      try { assignExactFont(text, face, n); } catch { continue; }
      this.substitutions.push({ nodeId: n.id, requested: request.label,
        used: face.family + ' ' + face.style, reason });
      return face;
    }
    throw new Error('No available font could be loaded for editable text: ' + request.label +
      '. Enable at least one text font in Figma and retry.');
  }

  /** Collect exact-font requirements before deciding on presentation fallbacks. */
  async preflight(roots: UINode[]): Promise<MissingFont[]> {
    const requests = new Map<string, UINode[]>();
    const collect = (n: UINode) => {
      if (n.type === 'text') {
        const key = fontRequest(n).label;
        const nodes = requests.get(key) ?? [];
        nodes.push(n);
        requests.set(key, nodes);
      }
      n.children.forEach(collect);
    };
    roots.forEach(collect);
    const missing: MissingFont[] = [];
    for (const nodes of requests.values()) {
      try {
        await this.resolve(nodes[0]!);
      } catch (e) {
        if (!(e instanceof MissingFontsError)) throw e;
        missing.push({
          ...e.missingFonts[0]!,
          nodeIds: nodes.map((n) => n.id),
          sourceText: nodes.map((n) => ({ nodeId: n.id, text: n.text ?? '' })),
        });
      }
    }
    return missing;
  }

  async resolve(n: UINode): Promise<FontName> {
    const { family, weight, italic, label } = fontRequest(n);
    const failure = this.failures.get(label);
    if (failure)
      throw new MissingFontsError([
        {
          requested: label,
          nodeIds: [n.id],
          sourceText: [{ nodeId: n.id, text: n.text ?? '' }],
          reason: failure,
        },
      ]);
    const selected = this.pick(family, weight, italic);
    const reason = !selected
      ? 'Family, weight or italic style is not installed'
      : !(await this.load(selected))
        ? 'Figma could not load this font'
        : '';
    if (reason) {
      this.failures.set(label, reason);
      throw new MissingFontsError([
        {
          requested: label,
          nodeIds: [n.id],
          sourceText: [{ nodeId: n.id, text: n.text ?? '' }],
          reason,
        },
      ]);
    }
    return selected!;
  }
}
