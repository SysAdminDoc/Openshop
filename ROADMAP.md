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
