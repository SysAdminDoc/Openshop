# OpenShop Photoshop-Parity Roadmap

This document is a historical parity ledger derived from the live Adobe Photoshop
CS6 audit. It preserves implementation context and acceptance evidence, but it is
not the active engineering queue. `ROADMAP.md` is the single actionable source;
entries here remain historical PLANNED, BLOCKED, or VERIFIED evidence unless an
item is explicitly represented in that active tracker.

## Source of truth

- Live UI evidence: windows-app-audit/evidence
- Observed shell and screen catalog: windows-app-audit/screens and windows-app-audit/windows
- Complete tool inventory: windows-app-audit/tools/tool-catalog.csv
- Tool purposes: windows-app-audit/tools/tool-details.md
- Tool prerequisites and safety: windows-app-audit/tools/tool-prerequisite-matrix.csv and
  windows-app-audit/tools/tool-safety-classification.csv
- Reconstruction guidance: windows-app-audit/planning/reconstruction-specification.md
- Historical parity ledger: PHOTOSHOP_PARITY_ROADMAP.md
- Active engineering tracker: ROADMAP.md

The audit target was Photoshop CS6 Version 13.0 x64. The live instance had no document
open. Therefore the audit confirms shell, menu, panel, flyout, shortcut, blank-state,
and accessibility observations, while document mutation and file-side-effect behavior
remain untested. Roadmap entries preserve that distinction.

## Priority and status vocabulary

- P0: prerequisite or parity blocker; do before feature expansion.
- P1: core Photoshop-style workflow required for a credible editor.
- P2: important fidelity, interoperability, accessibility, or performance work.
- P3: advanced or optional expansion after the core contract is stable.
- PLANNED: captured as an actionable entry but not implemented.
- BLOCKED: requires a decision, disposable test fixture, or external input.
- VERIFIED: acceptance evidence exists in the repository.

## Non-negotiable sequencing rules

1. Establish a canonical document/session model and renderer seam before adding more
   tools or adjustment types.
2. Keep the blank workspace as a first-class state. A missing document is not an error.
3. Separate tool selection from document mutation. Selecting a tool changes options and
   focus; a canvas gesture creates the edit transaction.
4. Treat the live audit screenshots as visual reference only. Recreate icons, colors,
   marks, and assets from original OpenShop sources.
5. Every entry must add automated acceptance coverage or explicitly document why the
   case remains blocked.

## Phase 0 — Product contract and architecture

### PS-001 — Establish audit traceability

Priority: P0  
Status: VERIFIED  
Dependencies: none

Create a traceability table in the issue or milestone system that maps every roadmap
entry to the relevant audit artifact. Keep the live observation status separate from
the intended feature description.

Acceptance criteria:

- Every observed screen has a linked screen-spec JSON and screenshot.
- Every visible tool has a roadmap family and a tool-catalog row.
- Every untested document-dependent behavior is labeled UNTESTED or
  BLOCKED_BY_PREREQUISITE rather than implied complete.
- Changes to the parity contract identify the audit evidence or a new observation.

Implementation notes:

- Added `windows-app-audit/traceability/roadmap-traceability.csv` as the repository-owned
  mapping between this roadmap entry and the audited screen, tool, behavior, and safety
  catalogs.
- Added `tests/roadmap-traceability.test.js` to verify screen-spec/screenshot links, the
  complete 60-row tool inventory, tool-family coverage, and explicit untested or blocked
  labels for document-dependent behavior.

Test evidence: `npm run test:unit -- tests/roadmap-traceability.test.js` (PS-001 traceability
acceptance coverage).

Remaining limitations: the live Photoshop audit intentionally did not open a document, so
document mutation, file side effects, and persistence remain UNTESTED or
BLOCKED_BY_PREREQUISITE in the source catalogs.

### PS-002 — Split workspace session from document session

Priority: P0  
Status: VERIFIED  
Dependencies: none

Define separate state owners for application session, workspace layout, active tool,
active document, canvas viewport, panels, preferences, and persistence. The session
must support a valid no-document state while retaining the shell and command registry.

Acceptance criteria:

- OpenShop starts in a stable blank workspace with no phantom document.
- A document can be opened, closed, or replaced without destroying workspace state.
- Active tool, panel arrangement, language, zoom, and preferences are not stored as
  accidental document pixels.
- A document mutation cannot leak into another open document or recovery stream.

Implementation notes:

- Added an explicit application/session owner for workspace layout, active tool,
  document identity, viewport, panels, preferences, and persistence state.
- Added a first-class blank workspace with no active document, disabled document
  panel actions, accessible blank-state messaging, and close/replace transitions
  that preserve the active tool, panel tabs, language, theme, and viewport.
- Separated document snapshots from workspace state and made document capture and
  history no-ops in the ready blank state rather than creating phantom layers.
- Added recovery-lineage cleanup for close, new-document replacement, and project
  open so old generations cannot be offered as the next document's recovery stream.

Test evidence: `node node_modules/vitest/vitest.mjs run` (98 unit tests, including
`tests/session-model.test.js`); hosted browser acceptance for the blank/open/close
flow passed with Chromium against `tests/server.mjs`.

Remaining limitations: the session currently exposes one active document at a time;
multi-document tabs and independent document windows are not implemented. The live
Photoshop audit did not exercise document mutation, so Photoshop-side behavioral
parity remains UNTESTED beyond the OpenShop fixtures covered here.

### PS-003 — Introduce a renderer-agnostic seam

Priority: P0  
Status: VERIFIED  
Dependencies: PS-002

Define a document scene and render contract independent of the current Fabric.js
surface. The first adapter may continue to use Fabric, but tools, filters, history,
preview rendering, export rendering, and future GPU paths must not depend directly on
Fabric internals.

Acceptance criteria:

- A document model can produce an interactive preview and a deterministic export
  render through separate adapters.
- Viewport transforms never modify document pixels.
- A future WebGL2, WebGPU, worker, or tile renderer can be added without changing
  tool command semantics.
- Visual output parity is asserted between the current adapter and the reference
  render for representative documents.

Implementation notes:

- Added the `openshop-render-v1` scene contract, which normalizes document canvas,
  layers, nodes, guides, selection, animation, and interchange data without
  exposing Fabric instances to downstream render consumers.
- Added separate preview and export adapters over the existing Fabric surface;
  export renders with a document-space viewport and restores the user's viewport
  and zoom after rendering.
- Added a deterministic reference adapter and scene fingerprints so representative
  preview/export scenes can assert parity without coupling tests to Fabric internals.

Test evidence: `node node_modules/vitest/vitest.mjs run` (98 unit tests, including
`tests/renderer-seam.test.js`); `tools/security.mjs --check` passed with the updated
inline-script hash.

Remaining limitations: Fabric remains the only production preview/export adapter;
the reference adapter validates scene determinism and contract parity, not an
independent GPU or pixel compositor. Worker, WebGL2, and WebGPU adapters remain
future work under PS-060.

### PS-004 — Build a typed command and tool registry

Priority: P0  
Status: VERIFIED  
Dependencies: PS-002

Create one registry for menu commands, keyboard shortcuts, toolbar tools, tool groups,
options-bar contexts, prerequisites, outputs, undo policy, and side-effect class.
Commands must expose stable IDs rather than depending on display labels.

Acceptance criteria:

- The registry represents the 60 audit entries: 58 tool entries plus Quick Mask Mode
  and Screen Mode controls.
- The registry can answer whether a command is visible, enabled, checked, selected,
  or blocked in the blank state.
- A shortcut can cycle a grouped tool without duplicating command logic.
- Tool and menu labels can be localized without changing command IDs.

Implementation notes:

- Extended the existing versioned command map with all 60 audited tool and mode
  entries using stable IDs, family membership, shortcut, options context,
  prerequisite, output, undo policy, side-effect class, and audit status metadata.
- Added registry queries for visible, enabled, blocked, checked, and selected
  state, including the blank-state policy that keeps Screen Mode available while
  blocking document-dependent tools and layer commands.
- Added one grouped-tool cycling path and localized registry labels so display text
  can change without changing command IDs or replay payloads.

Test evidence: `node node_modules/vitest/vitest.mjs run` (102 unit tests, including
`tests/command-registry.test.js`); hosted Chromium browser acceptance passed for
blank-state enablement, 60-entry coverage, grouped cycling, and accessible pressed
state; `tools/security.mjs --check` passed.

Remaining limitations: the registry is complete for the audited inventory, but
several entries still resolve to selection/state placeholders until their concrete
tool implementations land in PS-030 through PS-037. Menu surfaces have not yet
been migrated wholesale to registry-backed command items under PS-016 and PS-040.

## Phase 1 — Photoshop shell and interaction model

### PS-010 — Reconstruct the application shell

Priority: P0  
Status: VERIFIED  
Dependencies: PS-002, PS-003

Implement the observed shell relationships: dark workspace surround, application/menu
bar, options bar, two-column left toolbox, right stacked dock, bottom Mini Bridge and
Timeline tabs, foreground/background swatches, and upper-right workspace selector.

Acceptance criteria:

- The blank shell visually matches the captured baseline at the recorded window
  geometry and remains usable at common browser sizes.
- The left toolbox, center workspace, right dock, and bottom tabs preserve ownership
  when the viewport resizes.
- Disabled controls use a distinct but legible state.
- The shell remains stable when no document is open.

Evidence: screen 000_initial_untouched and screen 002_final_restored_baseline.

Implementation notes: The shell now has an explicit blank-workspace owner, dark
menu/options/tool/panel chrome, a responsive center-column bottom tab strip for
Mini Bridge and Timeline, and an upper-right workspace selector persisted in the
application session. The canvas reserves the bottom-tab band so toolbar, canvas,
right dock, status bar, and bottom tabs retain ownership during resize. Timeline
selection is shell-only until its panel is opened, and selecting Mini Bridge
dismisses the timeline without creating or mutating a document.

Test evidence: `node node_modules/vitest/vitest.mjs run` (106 unit tests, including
`tests/shell-contract.test.js`), `node work/ps010-e2e.mjs` (hosted Chromium blank
shell and 1440x1000/1024x720 ownership checks), `tools/security.mjs --write`, and
visual review of `tests/openshop.e2e.spec.js-snapshots/openshop-blank-shell-chromium-win32.png`.

Remaining limitations: The Mini Bridge tab is a shell surface only; an offline
file browser implementation remains outside this milestone. The responsive
acceptance covers desktop and tablet widths; the existing mobile-specific shell
tests remain the authority for phone layout.

### PS-011 — Implement shell tokens and density

Priority: P0  
Status: VERIFIED  
Dependencies: PS-010

Define reusable tokens for dark neutral surfaces, separators, compact UI text,
selected-tool highlights, disabled contrast, focus rings, flyout surfaces, and panel
headers. Preserve the dense professional desktop hierarchy without copying Adobe
artwork.

Acceptance criteria:

- Tokens drive menus, flyouts, panels, options controls, dialogs, and status surfaces.
- The shell is readable in normal, reduced-motion, forced-colors, and high-contrast
  modes.
- No implementation relies on screenshot pixels or proprietary Adobe assets.

Implementation notes: Shared CSS variables drive neutral surfaces, borders,
text hierarchy, accent/disabled states, focus rings, radii, motion durations,
flyouts, panel headers, options controls, dialogs, status surfaces, and the
two-column toolbox. Reduced-motion clamps animation and transition durations;
forced-colors replaces glass effects with system colors; high-contrast preference
raises secondary text and separator contrast. All toolbox visuals are original
text/glyph treatments and do not copy Adobe artwork.

Test evidence: `node node_modules/vitest/vitest.mjs run` (106 unit tests,
including the component-treatment contract), hosted Chromium forced-colors and
reduced-motion acceptance via `node work/ps011-e2e.mjs`, and
`tools/security.mjs --write`.

Remaining limitations: High-contrast preference is validated through the CSS
contract and forced-colors browser lane; native Windows theme rendering remains
platform-dependent.

### PS-012 — Reconstruct the options bar

Priority: P0  
Status: VERIFIED  
Dependencies: PS-004, PS-010

Implement a context-driven options bar. The audit observed distinct contexts for
selection tools, healing, paths, type, shapes, zoom, and Move. Each tool must declare
its options schema rather than manually mutating unrelated controls.

Acceptance criteria:

- Switching tools replaces only the relevant options context.
- Options are disabled or hidden when the document prerequisite is absent.
- Options have accessible labels, keyboard focus, reset behavior, and persistence
  rules.
- Options changes are transactional when they affect document output.

Implementation notes: Each registered tool exposes an `optionsContext` and
`optionsSchema` with group ownership, document prerequisite, and control IDs.
Tool selection applies the declared context, hides unrelated groups, disables
document-dependent controls in the blank workspace, and exposes the state through
ARIA-disabled controls. A shared Reset action restores captured defaults without
mutating document objects; option values persist only in the local preference
store and are restored offline. Output-affecting state remains pending until the
tool gesture commits its document command.

Test evidence: `node node_modules/vitest/vitest.mjs run` (106 unit tests), hosted
Chromium context/reset/blank/persistence acceptance via `node work/ps012-e2e.mjs`,
and `tools/security.mjs --write`.

Remaining limitations: Some audited tools still map to placeholder tool-state
implementations until PS-030 through PS-037; their schemas are declared now so
the shell does not need another options-bar migration.

### PS-013 — Implement the two-column toolbox and flyouts

Priority: P0  
Status: VERIFIED  
Dependencies: PS-004, PS-010, PS-012

Reconstruct the grouped toolbox with current-tool highlight, group indicator,
right-click or press-hold flyout, exact member names, shared shortcut behavior, and
safe Escape dismissal.

Acceptance criteria:

- The visible family inventory is represented exactly:
  - Marquee: Rectangular, Elliptical, Single Row, Single Column
  - Move: Move
  - Lasso: Lasso, Polygonal Lasso, Magnetic Lasso
  - Selection: Quick Selection, Magic Wand
  - Crop: Crop, Perspective Crop, Slice, Slice Select
  - Sampling: Eyedropper, Color Sampler, Ruler, Note
  - Healing: Spot Healing Brush, Healing Brush, Patch, Content-Aware Move, Red Eye
  - Clone: Clone Stamp, Pattern Stamp
  - History: History Brush, Art History Brush
  - Eraser: Eraser, Background Eraser, Magic Eraser
  - Fill: Gradient, Paint Bucket
  - Blur: Blur, Sharpen, Smudge
  - Tone: Dodge, Burn, Sponge
  - Pen: Pen, Freeform Pen, Add Anchor Point, Delete Anchor Point, Convert Point
  - Type: Horizontal Type, Vertical Type, Horizontal Type Mask, Vertical Type Mask
  - Path Selection: Path Selection, Direct Selection
  - Shape: Rectangle, Rounded Rectangle, Ellipse, Polygon, Line, Custom Shape
  - Navigation: Hand, Rotate View, Zoom
  - Mode controls: Quick Mask Mode, Screen Mode
- Flyouts list exact labels and per-tool shortcuts.
- Escape closes an open flyout without changing the active document.
- Keyboard selection and pointer selection resolve to the same tool state.
- Active tool state is exposed through an accessible selected or pressed semantic.

Implementation notes: The visible toolbox is generated from the typed registry
in the audited family order, rendering all 58 audited members in a two-column
rail. Every flyout uses the same pointer/keyboard selection path, carries the
selected-family pressed state, and closes on Escape. OpenShop-native Brush,
Pencil, Spray/Airbrush, and AI Segment Select extensions remain available without
altering the audited inventory. No Adobe icons or extracted resources were used.

Test evidence: `node node_modules/vitest/vitest.mjs run` (106 unit tests), hosted
Chromium exact-family inventory/pointer/keyboard/Escape acceptance via
`node work/ps013-e2e.mjs`, visual review of `work/ps013-toolbox.png`, and
`tools/security.mjs --write`.

Remaining limitations: Several audited members intentionally route to the
existing selection/placeholder state until their concrete behavior lands in
PS-030 through PS-037; the family surface and command identity are complete.

### PS-014 — Reconstruct the right dock and workspace menu

Priority: P1  
Status: PLANNED  
Dependencies: PS-010, PS-004

Implement the observed dock groups and Window menu behavior: Color and Swatches;
Adjustments and Styles; Layers, Channels, and Paths; bottom Mini Bridge and Timeline
tabs; Options and Tools visibility; workspace selector; workspace reset and creation
contracts.

Acceptance criteria:

- Panel tabs can be selected without losing document or tool state.
- Empty-state panels remain visible with correct disabled or empty behavior.
- Panel visibility, ordering, width, and docking state are serializable.
- Workspace reset is explicit and reversible.
- The Window menu reflects actual panel visibility and checked state.

### PS-015 — Implement viewport navigation and screen modes

Priority: P1  
Status: PLANNED  
Dependencies: PS-003, PS-010, PS-013

Implement Zoom, Hand, Rotate View, Fit on Screen, Actual Pixels, Print Size, Standard
Screen Mode, Full Screen With Menu Bar, Full Screen, and viewport-only transforms.
Viewport transforms must never alter document pixels.

Acceptance criteria:

- Zoom and pan are continuous and preserve the document coordinate under the pointer.
- Rotate View is a view transform and can reset without pixel changes.
- Full-screen and panel-hiding behavior preserves focus and can be reversed.
- Keyboard shortcuts and temporary Space-to-pan behavior are consistent.

### PS-016 — Standardize menus, flyouts, dialogs, and focus lifecycle

Priority: P0  
Status: PLANNED  
Dependencies: PS-004, PS-010, PS-013

Define one popup lifecycle for top-level menus, nested submenus, tool flyouts, context
menus, modal dialogs, and About-like informational surfaces.

Acceptance criteria:

- Popup focus is trapped only when appropriate and returns to the invoker on close.
- Escape closes the deepest popup first.
- Disabled entries remain visible and cannot dispatch commands.
- Pointer travel between a menu title and its dropdown has no dead gap.
- Popup coordinates adapt to viewport edges and browser zoom.

## Phase 2 — Document semantics and editing primitives

### PS-020 — Correct the layer and object model

Priority: P0  
Status: PLANNED  
Dependencies: PS-002, PS-003

Make the document model Photoshop-like: pixel layers own raster content; text and
shape objects have explicit layer or vector semantics; groups are first-class; hidden,
locked, opacity, blend, and ordering state are independent from the viewport.

Acceptance criteria:

- New text, shape, and vector content can receive its own layer or explicit group
  placement according to a documented policy.
- Existing OpenShop projects migrate without flattening supported content.
- The Layers panel reflects the same hierarchy used for rendering and export.
- Layer commands from the audit have deterministic enablement and undo behavior.

### PS-021 — Move raster painting into the document pipeline

Priority: P0  
Status: PLANNED  
Dependencies: PS-003, PS-020, PS-025

Implement Brush-class raster mutation as an explicit pipeline instead of leaving
strokes as draggable vector objects. The finished stroke must composite into the
target pixel layer while vector drawing remains an explicit separate mode.

Acceptance criteria:

- A brush or eraser stroke produces the expected raster pixels on the selected layer.
- One complete stroke produces one history transaction.
- Cancelled or failed strokes leave source pixels and history unchanged.
- Selection, opacity, blend mode, pressure, and sample-all-layers behavior are defined.
- Vector paths remain editable when a vector tool is explicitly selected.

### PS-022 — Implement selection as a document primitive

Priority: P1  
Status: PLANNED  
Dependencies: PS-003, PS-020

Create a canonical selection mask with add, subtract, intersect, inverse, feather,
anti-alias, expand, contract, smooth, border, grow, similar, color range, save, load,
hide, and show operations.

Acceptance criteria:

- Selection state is independent from layer pixels and serializes in project files.
- The marching-ants visualization is a view of the mask, not the mask itself.
- Every selection tool uses the same boolean modifier contract.
- Selection commands are disabled or enabled correctly with and without a document.
- Copy, cut, fill, filter, and transform respect the current selection.

### PS-023 — Implement paths and vector shape semantics

Priority: P1  
Status: PLANNED  
Dependencies: PS-003, PS-020

Implement Bezier paths, anchor points, handles, work paths, shape layers, fill and
stroke modes, and conversion between path, selection, pixels, and shape output.

Acceptance criteria:

- Pen, Freeform Pen, Add Anchor, Delete Anchor, Convert Point, Path Selection, and
  Direct Selection share one path model.
- Rectangle, Rounded Rectangle, Ellipse, Polygon, Line, and Custom Shape produce
  editable vector output.
- Path editing does not rasterize unless the user invokes a rasterizing command.
- Shape fill, stroke, alignment, and constraint options persist with the shape.

### PS-024 — Implement editable type semantics

Priority: P1  
Status: PLANNED  
Dependencies: PS-003, PS-020

Implement horizontal and vertical point text, paragraph text, text layers, text masks,
font selection, size, anti-alias, alignment, character and paragraph panels, styles,
orientation, OpenType options, warp, type-to-shape, and type-to-work-path conversion.

Acceptance criteria:

- Point text and paragraph text use distinct bounding behavior.
- Text remains editable after save and reload for supported fonts.
- Horizontal and vertical type masks produce selections without creating unwanted
  raster content.
- Missing fonts are reported and replacement is explicit.
- Type changes are undoable as one coherent transaction.

### PS-025 — Replace snapshot-only history with transaction-aware history

Priority: P0  
Status: PLANNED  
Dependencies: PS-002, PS-003, PS-020

Keep full snapshots as a correctness fallback while introducing command transactions,
stroke coalescing, branching behavior, and a future tile-delta representation.

Acceptance criteria:

- One user gesture produces one named history entry.
- Undo and redo restore document, selection, viewport-relevant state, and layer
  metadata consistently.
- Failed commands roll back completely.
- A debug mode compares tile or region reconstruction with a full snapshot.
- Memory budget is measured by actual retained bytes rather than only step count.

### PS-026 — Build a typed non-destructive operation stack

Priority: P1  
Status: PLANNED  
Dependencies: PS-003, PS-020, PS-025

Represent adjustments and filters as versioned operations with stable IDs, parameters,
input scope, preview cache key, render version, and explicit Apply or Merge behavior.
Use fixed operation order for deterministic old-project rendering.

Acceptance criteria:

- Levels, Curves, HSL, Brightness/Contrast, Color Balance, exposure, vibrance,
  grayscale, sepia, invert, black and white, posterize, threshold, gradient map,
  shadows/highlights, photo filter, selective color, and replacement operations can
  be represented without baking immediately.
- Preview rendering can be cancelled and does not commit history.
- Applying or merging an operation is explicit and reversible.
- Old project files either render deterministically or report unsupported operations.

### PS-027 — Implement crop, transform, image size, and canvas size contracts

Priority: P1  
Status: PLANNED  
Dependencies: PS-003, PS-020, PS-021, PS-022

Implement Crop, Perspective Crop, Free Transform, Content-Aware Scale, Image Size,
Canvas Size, rotation, flip, trim, reveal all, and transform selection with clear
pixel, layer, selection, and viewport boundaries.

Acceptance criteria:

- Crop and transform previews are cancellable.
- Pixel dimensions, resolution metadata, and physical units are distinct fields.
- Transforming a selection does not silently transform the whole layer.
- The command registry accurately gates each command by document and selection state.

### PS-028 — Implement measurement, notes, and analysis state

Priority: P2  
Status: PLANNED  
Dependencies: PS-003, PS-014

Implement Ruler, Note, Count, measurement scale, data points, record measurements,
and scale markers as document annotations or analysis metadata rather than pixels.

Acceptance criteria:

- Notes and measurement markers can be shown, hidden, selected, and removed.
- Ruler output exposes distance and angle in the chosen unit system.
- Analysis metadata serializes separately from raster content.
- Empty-state analysis commands follow the observed disabled behavior.

## Phase 3 — Tool family completion

These entries implement the behavior described in tool-details.md. The exact labels,
shortcuts, prerequisites, outputs, and evidence paths are already in tool-catalog.csv.

### PS-030 — Complete selection tools

Priority: P1  
Status: PLANNED  
Dependencies: PS-021, PS-022

Implement Marquee, Lasso, Polygonal Lasso, Magnetic Lasso, Quick Selection, and Magic
Wand with common selection modifiers, feathering, anti-aliasing, tolerance, sample
scope, contiguous behavior, edge snapping, and cursor feedback.

### PS-031 — Complete crop and slice tools

Priority: P1  
Status: PLANNED  
Dependencies: PS-027

Implement Crop, Perspective Crop, Slice, and Slice Select. Define whether slices are
export-only metadata and keep them out of ordinary pixel and layer operations.

### PS-032 — Complete sampling, measurement, and note tools

Priority: P2  
Status: PLANNED  
Dependencies: PS-014, PS-028

Implement Eyedropper, Color Sampler, Ruler, and Note. Define sample-all-layers,
sample-size, color readout, unit display, annotation focus, and persistence.

### PS-033 — Complete healing and clone tools

Priority: P1  
Status: PLANNED  
Dependencies: PS-021, PS-025

Implement Spot Healing Brush, Healing Brush, Patch, Content-Aware Move, Red Eye, Clone
Stamp, and Pattern Stamp with source sampling, alignment, brush dynamics, layer scope,
content-aware fallback, and one-gesture history boundaries.

### PS-034 — Complete erase, blur, tone, and fill tools

Priority: P1  
Status: PLANNED  
Dependencies: PS-021, PS-025, PS-026

Implement Eraser, Background Eraser, Magic Eraser, Blur, Sharpen, Smudge, Dodge, Burn,
Sponge, Gradient, and Paint Bucket. Define transparency, sampling, tolerance,
saturation, exposure, gradient geometry, pattern source, and protected-layer behavior.

### PS-035 — Complete pen, path, and shape tools

Priority: P1  
Status: PLANNED  
Dependencies: PS-023

Implement Pen, Freeform Pen, anchor editing, Path Selection, Direct Selection, the six
Shape tools, and their options-bar modes: Shape, Path, and Pixels.

### PS-036 — Complete type tools

Priority: P1  
Status: PLANNED  
Dependencies: PS-024

Implement Horizontal Type, Vertical Type, Horizontal Type Mask, and Vertical Type
Mask, plus font loading, missing-font handling, text cursor behavior, and type-layer
selection.

### PS-037 — Complete navigation and mode controls

Priority: P1  
Status: PLANNED  
Dependencies: PS-015

Implement Hand, Rotate View, Zoom, Quick Mask Mode, and Screen Mode. Add temporary
keyboard activation and ensure view-only operations cannot enter document history.

## Phase 4 — Menu command parity

### PS-040 — File menu and document lifecycle

Priority: P1  
Status: PLANNED  
Dependencies: PS-002, PS-004, PS-020

Implement the observed File surface: New, Open, Browse in Bridge, Browse in Mini
Bridge, Open As, Open as Smart Object, Open Recent, Close, Close All, Close and Go to
Bridge, Save, Save As, Check In, Save for Web, Revert, Place, Import, Export,
Automate, Scripts, File Info, Print, Print One Copy, and Exit.

Acceptance criteria:

- Commands have explicit side-effect classifications and dirty-state prompts.
- Disabled no-document commands match the observed blank-state policy.
- Open, save, import, export, print, and Bridge adapters are testable without touching
  a user's real files or account.
- File failure leaves the current document and history intact.

### PS-041 — Edit menu, preferences, presets, and purge

Priority: P1  
Status: PLANNED  
Dependencies: PS-004, PS-025

Implement Undo, Step Forward, Step Backward, Fade, clipboard operations, Fill, Stroke,
Content-Aware Scale, Puppet Warp, Free Transform, Transform, Auto-Align, Auto-Blend,
Define Preset commands, Purge, PDF Presets, Presets, Remote Connections, Color
Settings, Assign and Convert Profile, Keyboard Shortcuts, Menus, and Preferences.

Acceptance criteria:

- Destructive or global operations require clear confirmation or a disposable context.
- Preferences pages are schema-driven and reversible.
- Keyboard Shortcuts and Menus expose the same command registry used by the toolbar.
- Purge operations cannot silently discard user work or shared system state.

### PS-042 — Image menu and analysis

Priority: P1  
Status: PLANNED  
Dependencies: PS-020, PS-026, PS-027, PS-028

Implement Mode, Adjustments, Auto Tone, Auto Contrast, Auto Color, Image Size, Canvas
Size, Image Rotation, Crop, Trim, Reveal All, Duplicate, Apply Image, Calculations,
Variables, Apply Data Set, Trap, and Analysis.

Acceptance criteria:

- Enablement reflects document mode, layer state, selection, and analysis prerequisites.
- Adjustment commands use the typed operation stack where non-destructive behavior is
  supported.
- Duplicate and calculations preserve explicit document/session separation.

### PS-043 — Layer menu and panel commands

Priority: P1  
Status: PLANNED  
Dependencies: PS-020, PS-023, PS-024, PS-026

Implement New, Duplicate, Delete, Rename, Layer Style, Smart Filter, Fill Layer,
Adjustment Layer, Layer Content Options, Layer Mask, Vector Mask, Clipping Mask,
Smart Objects, Rasterize, Layer-Based Slice, Group/Ungroup, Hide, Arrange, Combine
Shapes, Align, Distribute, Lock, Link, Select Linked, Merge, Merge Visible, Flatten,
and Matting.

Acceptance criteria:

- Every layer command updates the layer tree and renderer atomically.
- Rasterizing is explicit and irreversible only after confirmation.
- Layer masks, vector masks, smart objects, styles, and clipping relationships have
  defined persistence and PSD mapping.

### PS-044 — Type, Select, and Filter menus

Priority: P1  
Status: PLANNED  
Dependencies: PS-022, PS-023, PS-024, PS-026

Implement Type panels, anti-alias, orientation, OpenType, Create Work Path, Convert
to Shape, Rasterize Type, Convert Text Shape, Warp Text, Font Preview Size, Language
Options, Update and Replace Missing Fonts, Paste Lorem Ipsum; Select All, Deselect,
Reselect, Inverse, layer selection, Color Range, Refine Edge, Modify, Grow, Similar,
Transform Selection, Quick Mask, Load, and Save Selection; and Filter families.

Acceptance criteria:

- Type and selection commands operate on explicit document primitives.
- Filter dialogs support preview, cancel, apply, and undo boundaries.
- Filter availability and unsafe side effects are visible in the command registry.

### PS-045 — View menu parity

Priority: P1  
Status: PLANNED  
Dependencies: PS-015, PS-022, PS-028

Implement Proof Setup, Proof Colors, Gamut Warning, Pixel Aspect Ratio, 32-bit Preview,
Zoom commands, Screen Mode, Extras, Show, Rulers, Snap, Snap To, Lock and Clear
Guides, Lock and Clear Slices, and New Guide.

Acceptance criteria:

- View-only toggles never alter document pixels.
- Show and Snap reflect actual guide, grid, slice, note, path, selection, and cursor
  state.
- Proof and gamut states are explicit and labeled as approximate if browser color
  management cannot guarantee Photoshop parity.

### PS-046 — Window menu and workspaces

Priority: P1  
Status: PLANNED  
Dependencies: PS-014, PS-015

Implement Arrange, Workspace, Extensions, panel visibility, checked states, workspace
presets, Reset Essentials, New Workspace, Delete Workspace, and Keyboard Shortcuts
and Menus entry points.

Acceptance criteria:

- Window menu state is derived from actual panel and workspace state.
- Reset does not erase user documents or preferences outside the workspace.
- Workspace serialization supports future user-defined panel layouts.

### PS-047 — Help and system information

Priority: P2  
Status: PLANNED  
Dependencies: PS-004, PS-010

Implement Photoshop Online Help equivalent, Support Center, About, Plug-in information,
Legal Notices, System Info, registration/deactivation/update placeholders, online
resources, and product improvement controls with OpenShop-specific privacy behavior.

Acceptance criteria:

- About and legal surfaces are informational and keyboard-dismissible.
- Online actions disclose network use and never upload document pixels silently.
- License, account, and update controls are not represented as fake capabilities.

### PS-048 — Automation, scripting, import, and print boundaries

Priority: P2  
Status: BLOCKED  
Dependencies: PS-004, PS-020, PS-025, PS-040

Define safe adapters for Batch, PDF Presentation, Droplet, Contact Sheet, Lens
Correction, HDR, Photomerge, Image Processor, Script Events, Load Files into Stack,
and layer export scripts. Do not expose these as complete until external-file and
batch-side-effect behavior has a sandboxed test plan.

Acceptance criteria:

- Each operation declares input scope, output files, cancellation, progress, and
  partial-failure behavior.
- Batch operations run against an explicit user-selected scope.
- Scripting is capability-scoped and cannot access arbitrary network or filesystem
  resources.

## Phase 5 — Persistence, interoperability, and trust

### PS-050 — PSD interoperability with Photoshop-authored fixtures

Priority: P0  
Status: BLOCKED  
Dependencies: PS-020, PS-023, PS-024, PS-026

Create a fixture corpus authored by Photoshop or another independent producer. Cover
groups, nested layers, text, shapes, paths, masks, blend modes, opacity, adjustment
layers, smart objects, layer styles, channels, selections, paths, guides, color
profiles, layer comps, animation, and unsupported feature reporting.

Acceptance criteria:

- Import and export are tested against independent fixtures rather than only files
  written by ag-psd.
- Round-trip comparisons report semantic differences by entity.
- Unsupported features are preserved where possible or clearly disclosed.
- No fixture contains private user content.

### PS-051 — Version the OpenShop document schema

Priority: P0  
Status: PLANNED  
Dependencies: PS-002, PS-020, PS-025, PS-026

Separate document data from session and workspace data. Add explicit schema versions,
migrations, feature capability declarations, checksums, recovery generations, and
forward-compatible unknown-field handling.

Acceptance criteria:

- Existing OpenShop projects migrate without flattening supported content.
- Unsupported Photoshop features are represented as preserved metadata or warnings.
- Recovery, undo, export, and postMessage use the same canonical document contract.

### PS-052 — Preferences, workspace, and lifecycle persistence

Priority: P1  
Status: PLANNED  
Dependencies: PS-014, PS-046, PS-051

Implement persistent preferences for interface, file handling, performance, cursors,
transparency, units, guides/grids/slices, plug-ins, type, and Camera Raw equivalents
only where OpenShop has a real capability. Track clean, dirty, saving, saved, failed,
recovered, and closing states.

Acceptance criteria:

- Preferences are versioned, validated, resettable, and scoped to the app.
- Workspace persistence does not overwrite document content.
- Recovery is explicit, inspectable, and safe across tabs and browser restarts.

### PS-053 — Clipboard, drag/drop, import/export, and print contracts

Priority: P1  
Status: PLANNED  
Dependencies: PS-020, PS-040, PS-051

Define safe behavior for clipboard copy/cut/paste, image and PSD drag/drop, URL/data
inputs, file pickers, native File System Access, export formats, print preview, and
batch export.

Acceptance criteria:

- Clipboard and drag/drop tests use synthetic fixtures and never the user's clipboard
  or files.
- Export never falsely marks the editable project clean.
- Alpha, matte, metadata, animation, and unsupported feature warnings are explicit.
- Print and file operations are cancellable and leave the current document intact on
  failure.

### PS-054 — Complete localization

Priority: P1  
Status: PLANNED  
Dependencies: PS-004, PS-010, PS-013, PS-014

Move every menu label, tool name, options label, panel label, tooltip, modal string,
toast, status message, command-palette label, error, recovery message, and accessibility
label into the localization registry. Support RTL layout constraints.

Acceptance criteria:

- No user-facing UI string bypasses the translation function.
- Command search uses localized labels and stable command IDs.
- Toasts, dialogs, menus, flyouts, and canvas-state mirrors all translate together.
- Missing translations are detected in CI rather than inferred from rendered text.

### PS-055 — Accessibility contract for custom surfaces

Priority: P0  
Status: PLANNED  
Dependencies: PS-004, PS-010, PS-013, PS-014, PS-016

Expose semantic roles and states for menus, flyouts, toolbar groups, active tools,
panel tabs, list rows, layers, history entries, dialogs, canvas state, and status
messages. Correct the observed gaps: listboxes without options, tools without pressed
state, hidden toast container, and no forced-colors or prefers-contrast strategy.

Acceptance criteria:

- Every tool button exposes name, shortcut, selected or pressed state, disabled state,
  and group membership.
- Layers and history expose real listbox or tree descendants with roving focus.
- Toasts and errors are announced without exposing irrelevant visual noise.
- Keyboard-only users can reach every menu, tool, panel, dialog, and dismissal path.
- Automated axe checks and manual screen-reader checks run in the browser matrix.

### PS-056 — Legal, privacy, and asset provenance

Priority: P0  
Status: PLANNED  
Dependencies: PS-010, PS-040, PS-047

Document original asset ownership and prohibit Adobe logos, icons, extracted resources,
or proprietary screenshot-derived artwork. Preserve OpenShop's local-first promise:
network use, AI model downloads, file access, clipboard, plugins, and external
resources must be disclosed and capability-scoped.

Acceptance criteria:

- Every new icon, font, image, and sample fixture has a license or provenance record.
- No tool or panel ships with copied Adobe artwork.
- Privacy tests prove that ordinary editing never uploads document pixels.
- Online and offline lanes report exactly what they need.

## Phase 6 — Performance and large-document behavior

### PS-060 — Implement the tiered render pipeline

Priority: P2  
Status: PLANNED  
Dependencies: PS-003, PS-026

Add worker-based preview rendering first; add WebGL2 as the broad GPU tier; add WebGPU
only where feature-detected; retain a deterministic CPU fallback. Publish per-operation
parity and performance measurements.

Acceptance criteria:

- UI remains responsive during large filter previews.
- Cancel terminates or invalidates in-flight work and never commits stale results.
- GPU and CPU output match within documented tolerances.
- Browser support and fallback selection are visible in diagnostics.

### PS-061 — Add tile or region-based history

Priority: P2  
Status: PLANNED  
Dependencies: PS-025, PS-060

Introduce copy-on-write tiles or dirty-region deltas behind a debug flag while keeping
full snapshots for comparison. Coalesce input events into user-level transactions.

Acceptance criteria:

- Tile reconstruction equals the full-snapshot reference across randomized edits.
- Memory budget is enforced by measured retained bytes.
- Undo latency and memory are reported for small, medium, and large documents.
- A bookkeeping failure disables the optimized path rather than corrupting history.

### PS-062 — Large canvas, DPI, and responsive layout validation

Priority: P2  
Status: PLANNED  
Dependencies: PS-010, PS-015, PS-060

Test browser zoom, device pixel ratio, high-density displays, 1920x1080 and larger
documents, multi-panel layouts, narrow windows, and touch/stylus target sizing.

Acceptance criteria:

- Document coordinates remain stable across device pixel ratios.
- Canvas and panel resizing do not introduce scroll traps or lost focus.
- Memory ceilings and degraded modes are explicit.
- Touch targets meet the chosen accessibility minimum without breaking desktop density.

## Phase 7 — Verification and release gates

### PS-070 — Photoshop shell visual regression suite

Priority: P0  
Status: PLANNED  
Dependencies: PS-010 through PS-016

Add screenshots for blank workspace, each top-level menu, representative submenus,
each tool flyout family, About, disabled empty panels, and restored baseline.

Acceptance criteria:

- Baseline comparisons cover Chromium at the supported viewport matrix.
- Menu, flyout, options-bar, and panel state are captured after each interaction.
- A changed visual token produces a reviewable diff rather than silent drift.

### PS-071 — Command and tool interaction matrix

Priority: P0  
Status: PLANNED  
Dependencies: PS-004, PS-013, PS-020 through PS-048

Turn tool-catalog.csv, keyboard-shortcut-map.csv, flow-catalog.csv, and
tool-prerequisite-matrix.csv into automated test data.

Acceptance criteria:

- Every tool can be selected by pointer and keyboard.
- Every grouped tool opens and closes correctly.
- Every command has tests for visible, enabled, disabled, checked, cancelled, and
  failed states where applicable.
- Unsafe and external-side-effect flows run only in disposable fixtures.

### PS-072 — Accessibility and focus matrix

Priority: P0  
Status: PLANNED  
Dependencies: PS-055, PS-070

Test semantic tree, tab order, arrow-key navigation, Escape dismissal, shortcut
precedence, focus restoration, zoom, reduced motion, forced colors, high contrast,
and screen-reader announcements.

Acceptance criteria:

- No custom surface is only screenshot-readable.
- Active tool, active layer, selected path, selection state, and dirty state are
  announced or otherwise available semantically.
- Accessibility regressions fail CI.

### PS-073 — Independent interoperability matrix

Priority: P1  
Status: BLOCKED  
Dependencies: PS-050, PS-051, PS-053

Run independent PSD, PNG, JPEG, WebP, AVIF, GIF, SVG, PDF, and OpenShop fixtures
through import, edit, save, reload, and export. Include files with metadata,
orientation, animation, transparency, nested groups, and unsupported features.

Acceptance criteria:

- The corpus contains files not generated by OpenShop.
- Pixel, semantic, metadata, and warning comparisons are separated.
- A failed round trip identifies the first differing entity or resource.

### PS-074 — Hosted, offline, and privacy matrix

Priority: P1  
Status: PLANNED  
Dependencies: PS-040, PS-053, PS-054, PS-056

Run the full command and document matrix in file, hosted, installed, offline-after-
warmup, and restricted-network modes. Verify model download disclosures, service
worker behavior, file handlers, cache updates, and rollback.

Acceptance criteria:

- The file lane and hosted lane have explicit capability differences.
- No network request occurs for ordinary local editing after required assets are
  available.
- Failed update or asset verification leaves a usable prior version.

### PS-075 — Release parity gate

Priority: P0  
Status: PLANNED  
Dependencies: PS-070 through PS-074

Do not declare Photoshop-parity complete until all of the following are true:

- Blank shell, menus, panels, tool groups, flyouts, options bars, and shortcuts are
  cataloged and visually verified.
- The blank no-document state matches the documented enablement matrix.
- Selection, layer, raster, vector, text, mask, history, and filter primitives have
  independent acceptance coverage.
- PSD tests include independent Photoshop-authored fixtures.
- Accessibility, localization, privacy, and legal asset gates pass.
- Performance and fallback results are recorded for the supported browser matrix.
- Remaining gaps are listed as explicit, user-visible limitations.

## Dependency order

The shortest safe implementation path is:

PS-001 → PS-002 → PS-003 → PS-004 → PS-010 → PS-011 → PS-012 → PS-013 → PS-016  
PS-002 and PS-003 → PS-020 → PS-021 → PS-022 / PS-023 / PS-024 → PS-025  
PS-004 and PS-010 → PS-014 / PS-015 → PS-040 through PS-047  
PS-020 through PS-026 → PS-050 / PS-051 / PS-053  
PS-055 and PS-056 should begin with shell work, not be deferred to the end.  
PS-060 through PS-062 follow renderer and history contracts.  
PS-070 through PS-075 are continuous gates, not a final test-only phase.

## Audit-to-roadmap traceability

| Audit finding | Roadmap entries |
|---|---|
| Maximized dark shell with options bar, toolbox, dock, bottom tabs | PS-010, PS-011, PS-012, PS-014 |
| Blank state keeps shell but disables document commands | PS-002, PS-004, PS-040, PS-042 |
| 60 visible tool and mode entries | PS-004, PS-013, PS-030 through PS-037 |
| Tool flyouts are custom-drawn and weak in UI Automation | PS-013, PS-055, PS-070, PS-071 |
| Menu hierarchy and disabled states | PS-004, PS-016, PS-040 through PS-048 |
| Options bar changes with the selected tool | PS-012, PS-013, PS-071 |
| Layers, channels, paths, Color, Swatches, Adjustments, Styles panels | PS-014, PS-020, PS-023, PS-026, PS-043 |
| Hand, Rotate View, Zoom, screen modes, rulers, guides, snap | PS-015, PS-028, PS-045 |
| About surface and system/help controls | PS-016, PS-047 |
| Sparse accessibility tree and missing custom-surface semantics | PS-055, PS-072 |
| No document available for safe canvas testing | PS-002, PS-021 through PS-028, PS-073 |
| Need to avoid copied Adobe assets | PS-056 |
| Evidence and reconstruction artifacts | PS-001, PS-070 |

## Roadmap completion record

When an entry is implemented, record the commit, test command, evidence path, and
remaining limitations beside the entry. Never change a PLANNED entry to VERIFIED
based only on code existence; require the corresponding interaction or visual
acceptance evidence.
