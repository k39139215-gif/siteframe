import { readPackageJson, validatePackageReferences } from './package-guards';
import { z } from 'zod';
export { stringifyPackage } from './package-encoding';
z.config({ jitless: true });
const httpUrl = z
  .string()
  .max(4096)
  .regex(
    /^https?:\/\/(?![^/]*@)[a-z0-9\[\].:-]+(?:[/?#][^\s]*)?$/i,
    'Expected an HTTP(S) URL without credentials',
  );
export const VERSION = '1.0' as const;
export const boundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().min(0).max(100000),
  height: z.number().min(0).max(100000),
});
export type Bounds = z.infer<typeof boundsSchema>;
export const actionSchema = z.object({
  id: z.string().max(160),
  type: z.enum([
    'link',
    'button',
    'tab',
    'menu',
    'dropdown',
    'accordion',
    'dialog',
    'navigation',
    'other',
  ]),
  label: z.string().max(300),
  selector: z.string().max(4000),
  safety: z.enum(['safe', 'unknown', 'destructive', 'external', 'submission']),
  reason: z.string().max(500),
  destinationUrl: z.string().max(4096).optional(),
  resultingStateId: z.string().optional(),
  fingerprint: z.string().max(160),
  navigationScope: z.string().max(160).optional(),
  active: z.boolean().optional(),
  method: z.enum(['click', 'hover', 'navigation']).optional(),
  ariaLabel: z.string().max(300).optional(),
  role: z.string().max(100).optional(),
  elementType: z.string().max(100).optional(),
  priority: z.number().optional(),
  contextKey: z.string().max(160).optional(),
  scrollPositions: z.array(z.object({ selector: z.string(), top: z.number(), left: z.number() })).optional(),
});
export type UIAction = z.infer<typeof actionSchema>;
export type StyleKey =
  | 'display'
  | 'position'
  | 'width'
  | 'height'
  | 'minWidth'
  | 'maxWidth'
  | 'minHeight'
  | 'maxHeight'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'marginTop'
  | 'marginRight'
  | 'marginBottom'
  | 'marginLeft'
  | 'gap'
  | 'rowGap'
  | 'columnGap'
  | 'flexDirection'
  | 'flexWrap'
  | 'justifyContent'
  | 'alignItems'
  | 'gridTemplateColumns'
  | 'gridTemplateRows'
  | 'fontFamily'
  | 'fontSize'
  | 'fontWeight'
  | 'fontStyle'
  | 'lineHeight'
  | 'letterSpacing'
  | 'textAlign'
  | 'textTransform'
  | 'color'
  | 'backgroundColor'
  | 'backgroundImage'
  | 'backgroundSize'
  | 'backgroundPosition'
  | 'backgroundRepeat'
  | 'mixBlendMode'
  | 'borderTopWidth'
  | 'borderRightWidth'
  | 'borderBottomWidth'
  | 'borderLeftWidth'
  | 'borderTopColor'
  | 'borderTopStyle'
  | 'borderRightColor'
  | 'borderBottomColor'
  | 'borderLeftColor'
  | 'borderRightStyle'
  | 'borderBottomStyle'
  | 'borderLeftStyle'
  | 'borderRadius'
  | 'boxShadow'
  | 'opacity'
  | 'overflow'
  | 'overflowX'
  | 'overflowY'
  | 'zIndex'
  | 'filter'
  | 'backdropFilter'
  | 'transform'
  | 'objectFit'
  | 'whiteSpace'
  | 'textDecorationLine';
// Not raw CSS properties: resolved at capture time to describe the font the
// browser actually painted with, so importers do not trust an unused CSS
// fallback (for example Georgia behind a webfont sans).
export type ResolvedStyleKey = 'fontFamilyUsed' | 'fontClass';
export type ComputedStyles = Partial<Record<StyleKey | ResolvedStyleKey, string>>;
export const textLayoutSchema = z.object({
  lineCount: z.number().int().min(1).max(100000),
  lineHeight: z.number().min(0.001).max(100000),
  glyphBounds: boundsSchema,
  lines: z.array(z.string().max(100000)).max(10000).optional(),
});
export interface UINode {
  id: string;
  type:
    | 'frame'
    | 'container'
    | 'text'
    | 'image'
    | 'svg'
    | 'button'
    | 'input'
    | 'link'
    | 'nav'
    | 'list'
    | 'dialog'
    | 'form'
    | 'icon'
    | 'other';
  tagName: string;
  name: string;
  text?: string;
  /** Browser line boxes, distinct from the tight glyph rectangles returned by Range. */
  textLayout?: z.infer<typeof textLayoutSchema>;
  bounds: Bounds;
  styles: ComputedStyles;
  attributes: Record<string, string>;
  children: UINode[];
  assetId?: string;
  interaction?: UIAction;
}
export const uiNodeSchema: z.ZodType<UINode> = z.lazy(() =>
  z.object({
    id: z.string().max(160),
    type: z.enum([
      'frame',
      'container',
      'text',
      'image',
      'svg',
      'button',
      'input',
      'link',
      'nav',
      'list',
      'dialog',
      'form',
      'icon',
      'other',
    ]),
    tagName: z.string().max(100),
    name: z.string().max(300),
    text: z.string().max(100000).optional(),
    textLayout: textLayoutSchema.optional(),
    bounds: boundsSchema,
    styles: z.record(z.string().max(60), z.string().max(10000)),
    attributes: z.record(z.string().max(100), z.string().max(1000)),
    children: z.array(uiNodeSchema),
    assetId: z.string().optional(),
    interaction: actionSchema.optional(),
  }),
);
export const assetSchema = z.object({
  id: z.string(),
  sourceUrl: z.string().max(10000),
  type: z.enum(['raster', 'svg', 'reference']),
  hash: z.string(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  mime: z.string(),
  data: z.string().max(4000000).optional(),
  rasterFallback: z
    .object({
      data: z.string().max(1000000),
      mime: z.literal('image/png'),
      width: z.number().min(1).max(4096),
      height: z.number().min(1).max(4096),
    })
    .optional(),
  error: z.string().optional(),
});
export type AssetReference = z.infer<typeof assetSchema>;
export const warningSchema = z.object({
  code: z.string(),
  message: z.string(),
  nodeId: z.string().optional(),
  url: z.string().optional(),
});
export type CaptureWarning = z.infer<typeof warningSchema>;
export const accessIssueSchema = z.object({
  kind: z.enum(['login', 'access', 'verification']),
  reason: z.string().max(1000),
  selector: z.string().max(4000).optional(),
});
export type AccessIssue = z.infer<typeof accessIssueSchema>;
export const attentionSchema = z.object({
  id: z.string().max(160),
  kind: z.enum(['login', 'access', 'verification', 'unsafe', 'unknown', 'external', 'error']),
  status: z.enum(['pending', 'resolved', 'skipped', 'deferred']),
  sourceUrl: httpUrl,
  destinationUrl: httpUrl.optional(),
  screenName: z.string().max(300),
  control: z.string().max(300),
  selector: z.string().max(4000).optional(),
  reason: z.string().max(1000),
  nextStep: z.string().max(1000),
  occurrences: z.number().int().min(1).optional(),
  locations: z
    .array(z.object({ sourceUrl: httpUrl, selector: z.string().max(4000).optional() }))
    .max(200)
    .optional(),
});
export type AttentionItem = z.infer<typeof attentionSchema>;
export const configSchema = z.object({
  captureMode: z.enum(['site', 'page', 'viewport', 'element']).default('site'),
  maxPages: z.number().int().min(1).max(200).default(50),
  maxStatesPerPage: z.number().int().min(1).max(100).default(20),
  maxDepth: z.number().int().min(0).max(12).default(5),
  maxActionsPerState: z.number().int().min(1).max(100).default(30),
  maxTotalStates: z.number().int().min(1).max(1000).default(200),
  timeoutMs: z.number().min(1000).max(3600000).default(600000),
  operationTimeoutMs: z.number().min(1000).max(60000).default(30000),
  settleMs: z.number().min(50).max(3000).default(350),
  discoverUIStates: z.boolean().default(true),
  captureAssets: z.boolean().default(true),
  detectComponents: z.boolean().default(true),
  fullPage: z.boolean().default(true),
  maxScrollSteps: z.number().int().min(0).max(100).default(20),
  maxNodes: z.number().int().min(10).max(20000).default(6000),
  trustedOrigins: z.array(httpUrl).max(10).default([]),
  viewport: z
    .object({
      width: z.number().int().min(320).max(3840),
      height: z.number().int().min(320).max(2160),
    })
    .default({ width: 1440, height: 900 }),
  debug: z.boolean().default(false),
});
export type CrawlConfig = z.infer<typeof configSchema>;
export const defaultConfig = configSchema.parse({});

/** A single-page capture never starts route or interaction exploration. */
export function scopeCaptureConfig(config: CrawlConfig): CrawlConfig {
  if (config.captureMode === 'site') return config;
  return {
    ...config,
    fullPage: config.captureMode === 'page',
    discoverUIStates: false,
    maxPages: 1,
    maxStatesPerPage: 1,
    maxTotalStates: 1,
    maxDepth: 0,
    maxScrollSteps: config.captureMode === 'page' ? 100 : 0,
    trustedOrigins: [],
  };
}
export const snapshotSchema = z.object({
  diagnostics: z.array(z.object({ event: z.string(), data: z.record(z.string(), z.unknown()) })).optional(),
  landmarks: z.array(z.string()).optional(),
  url: z.string(),
  title: z.string(),
  viewport: z.object({ width: z.number(), height: z.number() }),
  pageSize: z.object({ width: z.number(), height: z.number() }),
  uiTree: z.array(uiNodeSchema),
  actions: z.array(actionSchema),
  assets: z.array(assetSchema),
  warnings: z.array(warningSchema),
  observedRoutes: z.array(z.string()),
  accessIssue: accessIssueSchema.optional(),
  timings: z.record(z.string().max(40), z.number().nonnegative()).optional(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type CrawlDiagnostic = NonNullable<Snapshot['diagnostics']>[number];
export const screenSchema = snapshotSchema.extend({
  id: z.string(),
  route: z.string(),
  name: z.string(),
  domHash: z.string(),
  visualHash: z.string().optional(),
  parentStateId: z.string().optional(),
  screenshot: assetSchema.optional(),
  depth: z.number(),
  kind: z.enum(['page', 'modal']),
});
export type ScreenState = z.infer<typeof screenSchema>;
export const edgeSchema = z.object({
  from: z.string(),
  to: z.string().optional(),
  action: actionSchema,
  status: z.enum(['visited', 'duplicate', 'skipped', 'failed']),
  reason: z.string().optional(),
});
export type GraphEdge = z.infer<typeof edgeSchema>;
export const logSchema = z.object({
  time: z.string(),
  category: z.enum([
    'DISCOVERY',
    'STATE',
    'ACTION',
    'SAFETY',
    'DEDUP',
    'ASSET',
    'FIGMA',
    'ERROR',
    'LIMIT',
  ]),
  message: z.string(),
});
export type LogEntry = z.infer<typeof logSchema>;
export const componentSchema = z.object({
  id: z.string(),
  name: z.string(),
  signature: z.string(),
  nodeIds: z.array(z.string()),
  sourceNodeId: z.string(),
  count: z.number(),
});
export type ComponentDefinition = z.infer<typeof componentSchema>;
export const packageSchema = z.object({
  version: z.literal(VERSION),
  project: z.object({
    name: z.string().max(300),
    origin: httpUrl,
    createdAt: z.string(),
    config: configSchema,
  }),
  screens: z.array(screenSchema).max(1000),
  edges: z.array(edgeSchema).max(50000),
  assets: z.array(assetSchema).max(10000),
  components: z.array(componentSchema),
  warnings: z.array(warningSchema),
  logs: z.array(logSchema).max(50000),
  attention: z.array(attentionSchema).max(50000).optional(),
});
export type ReconstructionPackage = z.infer<typeof packageSchema>;
export type ScanStatus = 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'failed';
export interface ReplayStep {
  action: UIAction;
  expectedBefore: string;
  expectedSemantic?: string;
}
export interface Candidate {
  url: string;
  path: ReplayStep[];
  depth: number;
  parentId?: string;
  via?: UIAction;
  initial?: boolean;
  attempts?: number;
}
export interface CrawlCheckpoint {
  status: ScanStatus;
  frontier: Candidate[];
  seenCandidates: string[];
  exploredTransitions?: string[];
  package: ReconstructionPackage;
  elapsedMs: number;
  current: string;
  error?: string;
  blocked?: { attentionId: string; candidate: Candidate }[];
  inFlight?: Candidate;
  stopReason?: 'user' | 'limit';
}
export function parsePackage(text: string): ReconstructionPackage {
  return validatePackageReferences(packageSchema.parse(readPackageJson(text)));
}
