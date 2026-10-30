# Siteframe architecture

Siteframe discovers routes and UI states, captures a semantic DOM tree, and imports editable design layers into Figma. Screenshots are optional validation evidence, never the primary document format.

## Workspace

- `apps/extension`: Manifest V3 popup, background launch broker, persistent scan monitor, injected scanner and Chrome tab adapter. A scan-owned tab protects the source tab from exploration. The foreground extension monitor owns long-running work; the service worker does not need artificial keepalive. Closing the monitor interrupts work; completed checkpoints remain exportable.
- `apps/figma-plugin`: bounded, schema-validated local JSON import; creates horizontal screen frames on the current page, text, image fills, vectors and exact-match reusable components. No account tokens or network access are needed.
- `apps/web-dashboard`: scan-package inspector and deterministic SPA test application with nested tabs, overlays, routes and deliberate unsafe controls.
- `apps/crawler-worker`: Playwright adapter, BullMQ worker and local CLI. The worker uses isolated unauthenticated contexts; it never copies browser cookies. Optional screenshots and perceptual comparison use Sharp.
- `apps/api`: authenticated local API, PostgreSQL metadata, Redis job queue, bounded package upload/download. Backend crawling is restricted to configured origins and rejects private network destinations; the local CLI is the explicit localhost testing path.
- `packages/shared-types`: versioned runtime schemas and TypeScript types.
- `packages/protocol`: discriminated request/response protocols at extension boundaries.
- `packages/dom-model`: browser-only extraction, route/action discovery, settling, full-page hydration, asset collection and unsupported-content reporting.
- `packages/crawler-engine`: adapter-independent BFS, safety, normalization, graph identity, replay, cancellation, limits and logs.
- `packages/reconstruction-engine`: conservative layout inference, paint parsing, component detection, Figma-neutral layer plans and geometry validation.
- `packages/utils`: deterministic hashes and small shared helpers.

## Data flow

User gesture → grant current origin → capture source state → scan monitor → disposable tab → scanner → semantic snapshot → state identity → bounded graph → reconstruction package → local JSON download → Figma plugin → horizontal editable frames on the active page + import report.

Assets are embedded only when safely readable and size-bounded. Cross-origin and unsupported content produces explicit warnings. Input values, password fields and cookies are never serialized. Visible authenticated page text can be sensitive; packages stay local unless the user explicitly submits a backend job.

## Crawler state machine

`idle → running ⇄ paused → completed | stopped | failed`

The serializable checkpoint includes the BFS frontier, replay paths, graph, visited identities, route/state counts, elapsed active time, action history and warnings. For each candidate: reset to its route, replay validated safe actions while checking expected parent state identities, wait for stability, hydrate bounded full-page content, capture, deduplicate, record its edge, enqueue new safe links and UI actions. Scroll positions never become graph nodes. A failed or divergent replay is reported and not explored from the wrong parent. User Stop and global limits end the loop. Per-operation timeouts dispose the browser document before continuation; transient navigation/capture failures get one persisted retry, while uncertain action delivery is never automatically resent. Unknown, destructive, submission and untrusted-origin actions are not executed.

Safety is conservative classification of observable semantics, not a guarantee about arbitrary JavaScript handlers. The scanner checks fresh DOM attributes before every click. Links are visited directly rather than invoking attached click handlers. Confirmation dialogs suppress progression into confirmation controls.

Generic discovery uses structural evidence (links, navigation containers, tabs, menuitems, controlled panels, and disclosures) and generic opening/management verbs, not screen-name allowlists. Visible access barriers are classified separately from screen identity, including during replay. The package carries optional attention records with status, route, control, selector, reason, and recovery instructions. `pending` is for actual access barriers, `deferred` for capture failures, and `skipped` for excluded controls. The checkpoint retains retry candidates and persists the in-flight candidate before navigation. Automatic monitor reload recovery retains the elapsed budget; explicit Resume grants a new time budget. Only an explicit destination retry requeues deferred failures. Replay capture skips image resolution while retaining the DOM, geometry, asset IDs, and action fingerprints. Manually handled tabs are saved by tab ID and can contribute a fresh snapshot before exploration resumes. Credentials and input values are never part of that snapshot.

## Figma import

Capture active page → parse JSON with byte/node/depth limits → validate schema/version/references → sanitize SVG allowlist → build layer plans → identify exact reusable subtrees → load fonts with recorded fallback → create nested layers in original coordinates → apply Auto Layout only to high-confidence, non-wrapping flex layouts → create exact component instances → collect actual Figma bounds/typography → place independent screen frames horizontally on the captured page → downloadable validation report.

The importer stages created nodes in a hidden temporary frame. Successful imports reparent each screen directly onto the original page, after its existing artwork, with source dimensions and 120 px spacing. Component definitions occupy a library frame below the storyboard. A failure removes only nodes created by this import. Switching pages during font loading does not redirect the import or switch the user back. Neither route groups nor component definitions create Figma Pages.

Grid, complex flex, sticky/fixed elements and transformed layouts retain captured geometry when Auto Layout is uncertain. Real font metrics can cause differences. Unsupported canvas, cross-origin frames, closed shadow roots and virtualized offscreen content are reported. Open shadow roots are inspected. Generated pseudo-elements are reported rather than silently assumed editable. Visual accuracy is computed only when both original and actual exported Figma PNGs are supplied; no invented accuracy score is shown.

## Verification

Each implementation phase runs strict typechecking, core tests and its build. Browser integration tests exercise the local SPA, nested Settings tabs, menus, modal, accordion, asset extraction, route and state deduplication, forbidden-action counters, replay behavior and scroll identity. Extension smoke tests load the unpacked build in Chromium. Plugin reconstruction is tested with a Figma API test double; native Figma desktop import and PNG comparison evidence is recorded separately in review/base44/.

## Fidelity and attention update — 16 September 2026

Discovery update (17 September): destination identity is semantic (content, assets, action state and paint/typography), while `domHash` retains the full geometry/style identity for diagnostics. Group-scoped navigation uses a current matching fingerprint and same-origin route, independent of unrelated page text; non-navigation replay retains parent-state checks. The scheduler prioritizes navigation, then links, then local states, leaving automatic retries last. Background paint waits have a timer fallback; Chrome navigation accepts DOM readiness only after the pending navigation has committed. Guard captures skip scrolling and image resolution, with full hydration only on mismatches. Asset loading uses a four-worker pool with shared time/byte bounds.

Browser extraction merges neutral inline text across framework comments and explicit breaks, records browser lines, traverses boxless wrappers with visible descendants, and retains all border edges, background sizing and blend mode. WebP/AVIF are decoded locally into PNG; opaque rasters above 160 KB may use quality-0.94 JPEG when at least 20% smaller. Alpha is retained in PNG; raster dimensions are capped at 4096. The plugin UI also converts old embedded WebP/AVIF packages. Text remains editable, with captured line breaks to avoid fallback-font rewrapping. Background crop and simple texture flipping are mapped; complex transforms and repeated/multi-layer backgrounds remain limited.

Compact exports replace per-node styles with indexes into a package-wide style table. Both validators expand and bound the table before normal schema/reference validation; expansion preserves all style values and editability. The crawler budgets a prospective compact package before committing its screen/assets, retaining a rejected candidate. Checkpoints remain ordinary objects in IndexedDB. The 60 MB content ceiling remains; automatic package rollover is not implemented. Stage timing metadata identifies slow settle/hydration/action/DOM/asset work. Hydration and assets each have six-second ceilings, and asset fetches abort at the shared deadline. Late codecs cannot mutate an already returned result. Synchronous DOM analysis remains dependent on page complexity.

The extension stays on the selected origin and uses the source tab viewport. Optional unknown/external/unsafe records are grouped separately from required attention. Grouped errors retain every retry candidate and resolve only when all succeed. Replay accepts semantic equivalence after decorative geometry changes but still checks control fingerprints, safety and selected states. Compact exclusive view groups with current/pressed state are discovered structurally; submissions remain blocked.
