# OpenShop Roadmap

Single-file browser image editor with layers, PSD import, and client-side AI. Roadmap targets staying turnkey while expanding pro-grade editing and export fidelity.

## Planned Features

### Format & I/O
- SVG import (paths, text, groups) with editable vector layers before rasterize
- PDF multi-page import (page-per-layer or page-picker)
- GIF / APNG / WebP animation import with per-frame timeline
- Raw camera file reader (via libraw wasm) with demosaic preview
- `.openshop` project export round-trip that preserves guides, color profiles, and AI masks

### Editor Core
- Adjustment layers (non-destructive Levels / Curves / HSL) stackable above pixel layers
- Layer masks with feather + density sliders, separate from alpha
- Smart objects: re-editable embedded source so edits don't resample
- Vector shapes stored as paths (Bezier handles on the canvas), not rasterized until export
- Text on path + basic OpenType feature toggles (ligatures, small caps, tabular)

### AI / ML (Transformers.js)
- Generative fill for selections (in-browser SDXL-turbo lite or remote-optional)
- Inpainting brush backed by LaMa or MI-GAN webgpu builds
- Prompt-driven text-to-image panel that lands output as a new layer
- AI denoise + face restoration pass (Real-ESRGAN + GFPGAN webgpu)

### Performance
- OffscreenCanvas + Web Worker render pipeline for filters so UI never blocks
- WebGPU filter path with CPU fallback — publish per-filter FPS matrix
- Tiled undo history (dirty-tile deltas, not full layer snapshots) to raise 60-step cap

## Competitive Research
- **Photopea** — closest peer; strong PSD parity and SVG editing. Lesson: invest in SVG-as-layers and smart-object fidelity.
- **Pixlr E / X** — cloud-assisted AI generative workflows; forces account gating. Lesson: keep AI local, make it the differentiator.
- **miniPaint** — tiny single-file editor, weak on layers/AI. Lesson: OpenShop's AI + PSD import + single-file combo is a real gap they leave open.
- **Krita (desktop)** — best-in-class brush engine and color management. Lesson: borrow the brush preset format, borrow ICC profile handling for print users.

## Nice-to-Haves
- Command palette plugin API (third-party scripts registered at runtime)
- Color management with embedded ICC profiles on export
- Batch processor (drop a folder, apply an action recipe, zip the output)
- Collaborative session via WebRTC data channel (single doc, no server)
- Swatches/brushes/gradients import from .ase / .abr / .grd
- Mobile-first toolbar layout toggle with pressure-sensitive stylus support

## Open-Source Research (Round 2)

### Related OSS Projects
- https://github.com/viliusle/miniPaint — Single-file browser image editor, layers/filters, closest conceptual peer. MIT.
- https://github.com/nhn/tui.image-editor — NHN Cloud Canvas editor, React/Vue wrappers, rich filter set.
- https://github.com/igorski/bitmappery — Vue/Vuex non-destructive web photo editor with PSD I/O.
- https://github.com/OliverBalfour/SimplePaint — HTML5 canvas editor with stylus/tablet support and Photoshop-style brushes.
- https://github.com/geeeeeeeek/freePS — Single-file HTML5 layer-based editor.
- https://github.com/mattketmo/darkroomjs — Fabric.js-backed pluggable image editor core.
- https://github.com/aurbano/nuophoto — Minimal browser editor, good reference for small-footprint adjustments.
- https://github.com/excalidraw/excalidraw — Not a raster editor but best-in-class canvas interaction patterns.

### Features to Borrow
- Non-destructive adjustment layers (BitMappery) — curves/levels/HSL as editable nodes, not baked pixels.
- Tablet/stylus pressure curves + Photoshop-style custom brush dynamics (SimplePaint).
- Plugin architecture for tools and filters (DarkroomJS) — lets third parties ship `.js` tool packs.
- Full-featured filter set: grayscale, emboss, tint, multiply, blend modes w/ WebGL (tui.image-editor).
- Vuel18n-style multi-language UI strings (BitMappery).
- PSD layer read AND write round-trip (BitMappery) — currently PSD import only.
- Clipboard paste + URL/data-URL/drag-drop open paths (miniPaint).
- JSON scene export format for reopening layered work (miniPaint).

### Patterns & Architectures Worth Studying
- **Fabric.js canvas abstraction** (DarkroomJS) — sprite/object model for non-destructive transforms vs raw ImageData.
- **OffscreenCanvas + Worker filter pipeline** (tui.image-editor) — keeps >4K images responsive.
- **Plugin registration API** (DarkroomJS) — each tool is `plugin.register(editor)` with lifecycle hooks.
- **Vuex-style state store for history/undo** (BitMappery) — time-travel debugging, branch histories.
- **WebGL shader-based color adjustments** (BitMappery) — real-time sliders without CPU re-composite.

## Research-Driven Additions

### P2 — Later (features and UX)


- [ ] P2 — Wide-gamut color picker with Color.js and oklch()
  Why: Current color picker is sRGB-only; modern displays (all Apple devices since 2016) support Display P3; oklch() has ~90.5% browser support
  Evidence: CSS Color Level 4 spec; Color.js library (v0.6.1, tree-shakeable, by CSS spec editors)
  Touches: Color wheel, HSB sliders, foreground/background color system; integrate Color.js for P3/OKLCh conversion
  Acceptance: Color picker shows and selects Display P3 colors on capable monitors; exports correctly map to sRGB when needed
  Complexity: M




- [ ] P2 — Externalize all UI strings for i18n readiness
  Why: All ~200 user-facing strings are hardcoded in English throughout 6883 lines; no i18n infrastructure exists; limits international adoption
  Evidence: Code audit; BitMappery uses Vue-i18n pattern for multi-language UI
  Touches: Extract all string literals to a strings object/map; render via lookup; add language switcher (start with en, structure for community translations)
  Acceptance: All visible text comes from a single strings map; changing locale key switches all UI text; English is default
  Complexity: L

- [ ] P2 — WebCodecs-based animated GIF import/export
  Why: Current GIF "export" is spritesheet-only (index.html:6385-6414); no actual GIF encoding; WebCodecs ImageDecoder enables proper frame-by-frame GIF I/O
  Evidence: WebCodecs has ~92.7% browser support; current exportGIF() even acknowledges "GIF requires gif.js library"
  Touches: index.html:6385-6414 (exportGIF); new GIF encoder using WebCodecs or gif.js library; GIF import via ImageDecoder
  Acceptance: Export produces actual animated .gif file; import loads GIF frames into timeline; frame delay preserved
  Complexity: M

- [ ] P2 — Fabric.js 5.3.1 → 7.x migration
  Why: 5.3.1 is end-of-life with two CVEs; 7.4.0 has TypeScript, Promise API, better eraser, SSR support; migration is prerequisite for future architecture improvements
  Evidence: Fabric.js changelog; CVE fixes require ≥7.2.0; ES6 class migration, callback→Promise conversion, group system rewrite
  Touches: Every `fabric.` reference in index.html (~200+ occurrences); CDN URL; all callback-based image loading; group/selection behavior
  Acceptance: All tools, filters, layers, PSD import, export work identically; zero Fabric CVEs; code uses Promise-based API
  Complexity: XL

## Research-Driven Additions

- [ ] P0 - Harden CSP and DOM rendering
  Why: `index.html` still requires `unsafe-inline`/`unsafe-eval` and renders persisted data through `innerHTML`, leaving avoidable injection paths.
  Evidence: `index.html:12`, `index.html:3597`, `index.html:5903`, MDN CSP guidance
  Touches: `index.html` CSP meta, menu/modal/palette/recent rendering, `tests/os-unit.test.js`, `tests/openshop.e2e.spec.js`
  Acceptance: No user- or localStorage-derived value reaches `innerHTML` or inline event attributes; CSP no longer needs `unsafe-inline`; malicious recent-file/palette/preset fixtures render as inert text.
  Complexity: L

- [ ] P0 - Add PSD import preflight, limits, and worker isolation
  Why: ag-psd warns that untrusted PSDs can declare huge canvases/layers and should be parsed with raw-data limits and off-main-thread processing.
  Evidence: ag-psd production guidance, `index.html:1744`
  Touches: `index.html` PSD open path, ag-psd initialization, toast/error flow, tests with oversized synthetic PSD metadata
  Acceptance: Oversized dimensions, layer counts, unsupported bit depth/color modes, and memory budgets fail before bitmap decode; valid PSDs still import; UI remains responsive during parse.
  Complexity: L

- [ ] P1 - Add central import schema and resource budgets for project, palette, preset, and image files
  Why: Each importer validates differently, so corrupt or hostile JSON/images can reach rendering, storage, or pixel loops with inconsistent limits.
  Evidence: `index.html:1726`, `index.html:3597`, `index.html:5903`, `index.html:7553`
  Touches: `index.html` import helpers, project JSON sanitizer, palette/preset import, image open/drop/paste paths, unit fixtures
  Acceptance: Shared validators clamp dimensions, string lengths, color formats, adjustment ranges, project versions, and array counts; invalid imports show a toast and leave current work unchanged.
  Complexity: M

- [ ] P1 - Build recovery and storage management UI
  Why: OPFS autosave exists, but users cannot inspect quota, export recovery data, clear stale saves, or distinguish corrupt recovery from no recovery.
  Evidence: `index.html:3759`, `index.html:3774`, JS Paint storage-management precedent
  Touches: `index.html` autosave/recovery methods, Preferences or File menu, OPFS/localStorage helpers, Playwright recovery test
  Acceptance: UI shows autosave age/size/quota estimate; users can restore, export, discard, or clear stale recovery state; corrupt recovery is quarantined with a clear error.
  Complexity: M

- [ ] P1 - Expand regression coverage for shipped file and recovery workflows
  Why: Current tests cover core object behavior, one direct filter, screenshot smoke, and Segment Select, but not PSD round-trip, project migration, autosave, import sanitization, or export dimensions.
  Evidence: `tests/os-unit.test.js`, `tests/openshop.e2e.spec.js`, README testing section
  Touches: `tests/os-unit.test.js`, `tests/openshop.e2e.spec.js`, `tests/os-harness.js`, Playwright fixtures
  Acceptance: Automated tests cover project save/open, recovery restore/discard, palette/preset import validation, SVG sanitization, PSD export structure, and at least one mobile viewport smoke path.
  Complexity: M

- [ ] P2 - Add mobile viewport and touch ergonomics pass
  Why: README says mobile is functional but desktop recommended; no current test protects toolbar overflow, touch panning, dialogs, or panel visibility on phone/tablet viewports.
  Evidence: README Browser Support, JS Paint mobile affordances, `tests/openshop.e2e.spec.js`
  Touches: `index.html` responsive CSS/toolbars/dialogs, Playwright mobile projects
  Acceptance: Phone and tablet Playwright screenshots show no clipped primary controls; touch pan/zoom and modal close/apply flows work without keyboard dependence.
  Complexity: M
