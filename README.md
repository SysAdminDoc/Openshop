# OpenShop

![Version](https://img.shields.io/badge/version-0.30.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Browser-orange)
![Zero Install](https://img.shields.io/badge/install-none_required-brightgreen)
![Single File](https://img.shields.io/badge/single_file-HTML-E34F26?logo=html5&logoColor=white)

> A free, single-file browser-based image editor with layers, AI tools, pixel-level selections, filters, PSD import/export, and a Photoshop-inspired workflow. No server, no signup, no install.

## Try It Now

**[Open OpenShop in your browser](https://sysadmindoc.github.io/Openshop/)** — no download required.

Or download `index.html` and open it locally. Everything runs client-side. Your images never leave your machine — and the status bar tells you exactly what did, so you can check rather than trust. See [Privacy and Network Use](#privacy-and-network-use).

## Quick Start

1. Visit **https://sysadmindoc.github.io/Openshop/**
2. Or download the single HTML file and open it in any modern browser (network is required for a cold standalone launch)
3. Start editing

**Self-host it** — deploy the static files to a dedicated subdirectory on GitHub Pages, Netlify, S3, or Nginx. There is no build step, bundler, or runtime `node_modules`; include the PWA companions described below if you want verified offline reloads and installation. The service worker controls its containing directory, so do not put `sw.js` at the root of an origin shared with other applications.

## Features

### Core Editor

| Feature | Description |
|---------|-------------|
| **Layer System** | Multi-layer canvas with live nested groups/folders, collapsible rows, group visibility/lock/opacity, canonical render/export stacking, non-destructive Levels, Curves, and HSL adjustment layers, independent raster masks with feather and density controls, re-editable embedded Smart Objects, editable vector paths with draggable anchors and Bezier controls, text-on-path with basic OpenType features, per-range text styling, protected hidden or locked content, and undoable visibility, lock, opacity, blend, rename, grouping, and drag-reorder changes |
| **34 Tools** | Move, Brush, Pencil, Eraser, Spray, Clone Stamp, Healing Brush, Dodge, Burn, Sponge, Smudge, Shapes (rect, ellipse, triangle, polygon, star, arrow, line), Pen, Text, Gradient, Pattern Fill, Flood Fill, Eyedropper, Crop, Measure, Sticky Notes, AI Segment Select, Pan, Zoom |
| **Brush Engine** | Round, Soft, Flat, Scatter, Pixel presets with adjustable size, opacity, and flow; coalesced/predicted pen samples, pressure sizing, optional tilt dynamics, and bounded `.abr` brush-set import with persistent raster stamps |
| **Mobile Workspace** | Switch the Workspace selector to Mobile for a compact bottom toolbar, slide-out panels, touch-safe canvas targets, and variance-detected pen pressure sizing |
| **Selection Tools** | Rectangular/Elliptical Marquee, Magic Wand (contiguous + global), Lasso, Color Range dialog with fuzziness, presets, and live preview |
| **Selection Operations** | Select All, Deselect, Reselect, Inverse, Grow, Similar, Modify (Expand, Contract, Feather, Border, Smooth) |
| **Clipboard** | Copy and Cut pixel selections as PNG through the system clipboard, with an OpenShop-local paste fallback when browser permission is unavailable |
| **Symmetry Drawing** | Horizontal, vertical, both-axes, and radial (6-fold) mirror modes for brush strokes |
| **Undo/Redo** | 120-step versioned transaction history with dirty 64×64 raster tiles, named entries, exact destructive-edit rollback, and a visual history panel |
| **Snapshots & Branches** | Name the current state and return to it later, outside the undo step limit; editing after an undo archives the abandoned line as a branch instead of deleting it. Session-scoped and memory-budgeted |
| **Free Transform** | Resize, rotate, skew, perspective, and warp on any object |
| **Text Styling** | Bold, italic, underline, overline, and line-through on whole objects or selected character ranges, with per-range fill, size, weight, decoration colour, and thickness; independent LTR/RTL artwork direction commands keep interface locale changes from rewriting text objects |
| **Numeric Controls & Pixel Zoom** | Every slider has a keyboard-editable, validated number field; the Zoom tool can snap to reciprocal/integer ratios and use nearest-neighbour sampling above 100% |
| **Trace to Vector** | Converts a raster layer into editable paths with colour-count, smoothing, and detail controls; the source layer is hidden, not destroyed |
| **Gradient Stops** | Linear gradients expose draggable start and end handles on the canvas; imported `.grd` presets retain their stops and can be selected for linear or radial fills |
| **Auto-Save** | Dirty project revisions are written to browser recovery storage every 30 seconds and cleared only after the storage path acknowledges the write |
| **Accelerated Filters** | Parity-verified GPU kernels cover invert, grayscale, threshold, brightness/contrast, blur, and sharpen through WebGPU with WebGL2 fallback; supported filter application and capped previews use a capability-tested OffscreenCanvas worker, with Fabric and CPU-worker fallbacks, while `OS.aiBackendReport()` exposes the backend actually used per operation |

### File I/O

| Format | Import | Export |
|--------|--------|--------|
| **PNG** | Yes | Yes |
| **JPEG** | Yes | Yes |
| **WebP** | Yes (animated frames with timing) | Yes |
| **APNG** | Yes (animated frames with timing) | — |
| **AVIF** | Yes (verified WASM decoder) | Yes (deterministic verified WASM encoder) |
| **HEIC / HEIF** | Yes (native-first, verified WASM decoder; first image for sequences) | — |
| **JPEG XL** | Yes (native-first, verified WASM decoder) | — |
| **SVG** | Yes (editable shapes, text, groups, and per-range text spans — not rasterized) | Yes |
| **Vector PDF** | — | Yes (real path operators when no raster layer is visible) |
| **PDF** | Yes (page per layer) | Yes |
| **RAW** | Yes (LibRaw/WASM demosaic preview) | — |
| **PSD** | Yes (pixel layers, nested groups, supported blends, opacity, visibility, basic single-style text, and embedded ICC profile metadata) | Yes (same supported semantics; per-range text is rasterized with a loss report, plus explicit raster fallbacks and `0x040F` ICC profile resource when a profile is present) |
| **OpenRaster (`.ora`)** | Yes (PNG layers, offsets, opacity, visibility, supported blend modes, and named compatibility warnings for groups or unsupported constructs) | Yes (layered PNGs with `stack.xml`, merged image, thumbnail, and required stored `mimetype`) |
| **GIF** | Yes (animated, frame-based) | Yes (animated, frame-based) |
| **OpenShop Project (`.openshop` / legacy `.json`)** | Yes | Yes (full project with layers) |
| **Palette and asset sets (`.ase`, `.gpl`, `.abr`, `.grd`, `.json`)** | Yes | `.json` palettes |

Batch processing accepts raster images plus an `openshop-command-sequence` JSON action recipe, remaps recorded object and layer IDs to each imported image, and emits one ZIP with the selected PNG, JPEG, or WebP output. SVG, AVIF, RAW, and project inputs are rejected explicitly. The progress dialog reports each file, supports cancellation between safe file boundaries, restores the open document after success, failure, or cancellation, and reports partial failures without claiming a clean batch. ZIP assembly yields periodically so large result sets can keep the page responsive. The same menu also exports the current canvas to multiple formats in one click. Export Settings previews PNG/WebP/AVIF alpha or the chosen matte, disables alpha for JPEG, and lists project features that the selected format cannot preserve. Exporting never marks the editable project as saved. Native save/open dialogs are available on Chrome/Edge via File System Access API.

Image **Open**, **Place**, clipboard **Paste**, and **Drop** share one format-and-intent router. Open replaces or creates the document; Place and Paste insert into the active document, and Drop opens on the blank workspace but places onto an existing document. Animated GIF, APNG, and WebP files retain their decoded frame timing when opened or dropped onto a blank workspace. When inserted into an existing document, the first frame is shown as a normal image while all frames and delays are retained on that object with the documented `first-frame-static` policy, so saving and reopening the project does not silently discard the animation source.

Raster imports retain parsed EXIF/XMP in the document metadata. Export Settings offers `Preserve imported EXIF/XMP`, `Strip all metadata`, or `Strip location only` (the default); JPEG exports can carry the selected EXIF/XMP fields, while unsupported raster writers report that those fields were stripped. Image Information shows the detected source metadata and the default privacy policy. Images carrying a C2PA marker are checked with the lazy, SHA-384-verified read-only Content Credentials reader; Image Information shows the active manifest, manifest chain, and validation status, including failures. OpenShop never signs or re-signs exports, and the export compatibility report says so explicitly.

Use **Color → Swatches → Import** for ASE/GPL/JSON palettes, Photoshop ABR brush sets, or Photoshop GRD gradients. Imported brushes and gradients are bounded, sanitized, and retained in browser storage. Supported ABR tip pixels are stamped into raster layers with spacing, size, opacity, scatter, and pen-pressure dynamics; the import report names unsupported native descriptor, compression, or dynamics features rather than implying a faithful conversion.

Collaborative Session is available from the command palette. It uses WebRTC with no configured ICE relay: the offer creator selects **Create offer**, sends the generated JSON to the other peer, then applies the returned answer; the joining peer selects **Join with offer**, pastes the offer, and sends the generated answer back. The dialog requires explicit sharing consent and shows an opaque peer fingerprint. State transfers are bounded, chunked, bound to a session/document/peer identity, and revision-checked; stale or concurrent states are rejected or resolved by deterministic `(revision, peer)` ordering, and a failed remote load restores the local document.

### AI Features (Client-Side, via Transformers.js 4.2)

| Feature | Description |
|---------|-------------|
| **Background Removal** | MODNet-based automatic background removal |
| **Depth Map** | Depth-Anything monocular depth estimation |
| **Object Detection** | DETR-based object detection with bounding boxes |
| **Segment Select** | Click-guided subject masks via pinned SlimSAM |
| **Enlarge (AI model)** | Swin2SR super-resolution at 2x or 4x, run tile by tile with progress and cancellation |

All AI models download once and run entirely in-browser. Before the first download, OpenShop uses Transformers.js 4.2's model registry to report the exact transfer and installed sizes. It probes for a usable WebGPU adapter and falls back to WASM; the verified WASM engine is cached separately so the hosted app can reuse it offline after one online run. No API keys or image uploads are involved. Model revisions are pinned to immutable commit SHAs: Segment Select uses Apache-2.0 `Xenova/slimsam-77-uniform`, Depth Map uses Apache-2.0 `onnx-community/depth-anything-v2-small`, and Background Removal stays on the permissively licensed MODNet rather than noncommercial or GPL alternatives; the AI enlarger uses Apache-2.0 `Xenova/swin2SR-classical-sr-x2-64` and `-x4-64`. Model loading, inference, and CPU post-processing expose one cancel action; late results are discarded if the document revision or target layer changes.

### Adjustments & Filters

Enlarge 2x/4x (stepped high-quality resampling with a sharpening pass; the Image menu lists it beside the model-backed AI enlarger and labels which is which), non-destructive Levels, Curves, and HSL adjustment layers with editable parameters, stack preview, and Apply Stack, plus Brightness/Contrast, Hue/Saturation, Color Balance, Auto Levels, Auto Enhance, Grayscale, Sepia, Invert, Black & White, Sharpen, Blur, Noise, Vignette, Posterize, Threshold, Emboss, Edge Detect, Pixelate, Oil Paint, Halftone, Duotone, Tilt Shift, Chromatic Aberration, Gradient Map, Vibrance, Exposure, Shadows/Highlights, Photo Filter, Selective Color, Replace Color, Lens Correction, and 8 built-in photo presets with custom preset import/export.

Heavy filters (Oil Paint, Tilt Shift, Unsharp Mask, Posterize, Threshold, Vignette, Edge Detect, Duotone, Chromatic Aberration) run in a Web Worker so the UI stays responsive on large images. Photon WASM is loaded on demand as an optional accelerator for supported pixel filters, with automatic fallback to the JavaScript worker. Cancel terminates the active filter worker, rejects its pending job, and leaves the source layer and history unchanged.

### Interface

| Feature | Description |
|---------|-------------|
| **Precision Studio UI** | High-contrast workspace with a floating tool dock, structured inspector cards, responsive local-first launcher, dark/midnight/OLED variants, and a light theme that follows the system preference on first run |
| **Command Palette** | `Ctrl+K` to search and run any command |
| **Sandboxed Plugin API** | Register immutable JavaScript source in an opaque-origin `iframe` with explicit `commands`, `document:read`, `selection:read`, and `ui:toast` capabilities; plugin commands use the versioned `postMessage` protocol and can be disposed cleanly |
| **Action Recorder** | Records validated, versioned edit commands and replays mixed actions atomically; a failed step rolls back the whole action |
| **Batch Processor** | Select a folder of raster images, apply a saved versioned action recipe to each image, cancel safely, recover around bad files, and download a relative-path-preserving ZIP; the open document is restored after processing |
| **Collaborative Session** | Share one document peer-to-peer over a WebRTC data channel; create an offer, paste the answer, and sync state without a relay server |
| **Context Menus** | Right-click for contextual actions |
| **Rulers & Guides** | Draggable guides with snapping and pixel grid at high zoom |
| **Grid Overlay** | Toggleable composition grid |
| **Keyboard Shortcuts** | Full Photoshop-style shortcut set (40+ bindings), matched by physical key across keyboard layouts with layout-aware labels |
| **Marching Ants** | Animated selection borders |
| **Welcome Screen** | Template presets for common canvas sizes |
| **Tab Toggle** | `Tab` hides all panels for distraction-free editing |
| **Offline & Install** | The hosted HTTPS lane stages and verifies its complete core shell, gates Apply Update, Restore Previous Shell, and Rebuild Offline Shell behind Save/Discard/Cancel when the document is dirty, supports install prompts, exposes cache/model state, and rolls back an update that cannot confirm startup; the one-file `file://` lane is explicitly network-first |
| **Accessibility** | ARIA roles, keyboard navigation, focus indicators, reduced-motion support, hidden canvas-state mirror, and live status announcements |
| **Save State** | The status bar and document title distinguish clean, unsaved, saving, saved, and failed writes; unload warnings follow actual dirty state |

### Sandboxed Plugin API

Hosted deployments should publish `plugin-sandbox.html` and `plugin-sandbox.js` beside
`index.html`. A plugin is immutable JavaScript source, never a remote URL, and runs in an
opaque-origin `iframe` with `sandbox="allow-scripts"`. Plugins require a stable manifest
with an id, semver-like version, SHA-256 source hash, minimum API version, and explicit
capabilities. The first load must go through `showPluginConsent`, which displays the
manifest and persists the exact id/version/hash approval; changed hashes and versions need
new approval. Its explicit capabilities are `commands`, `document:read`, `selection:read`,
and `ui:toast`:

```js
const source = `
    const host = globalThis.__openShopPluginHost;
    window.addEventListener('message', event => {
      const message = event.data;
      if (message?.type === 'openshop:command-invoked') {
        parent.postMessage({
          type: 'openshop:plugin-result', protocolVersion: host.protocolVersion,
          pluginId: host.pluginId, token: host.token, requestId: message.requestId,
          ok: true
        }, '*');
      }
    });
    parent.postMessage({
      type: 'openshop:plugin-request', protocolVersion: host.protocolVersion,
      pluginId: host.pluginId, token: host.token, requestId: 'register',
      method: 'register-command', args: { label: 'Example command', category: 'Plugin' }
    }, '*');
`;
const manifest = {
  id: 'com.example.command', version: '1.0.0', name: 'Example command',
  sourceHash: await OS._pluginSourceHash(source),
  capabilities: ['commands', 'document:read'], minApiVersion: 1
};
const plugin = await OS.showPluginConsent({ manifest, source });
await plugin.ready;
plugin.dispose();
```

The host validates the protocol version, opaque frame source, token, capability for every
request, source hash, and bounded labels/commands. Network, file, DOM, and document-write
capabilities are not available. **Edit → Preferences → Plugin access** lists each saved grant
with its version, source digest, lifecycle status, granted capabilities, and most recent
failure; **Revoke access** removes the persisted approval, unloads the frame, and rejects
pending requests. `listPluginConsents()` and `removePluginConsent(id)` expose the same allow
list programmatically. `dispose()` removes the frame, listener, commands, and pending requests
without revoking consent.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Command Palette |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / Cut / Paste |
| `Ctrl+J` | Duplicate Object |
| `Ctrl+A` | Select All |
| `Ctrl+D` | Deselect |
| `Ctrl+Shift+D` | Reselect |
| `Ctrl+Shift+I` | Inverse Selection |
| `Ctrl+T` | Free Transform |
| `Ctrl+E` | Merge Down |
| `Ctrl+S` | Save Project |
| `Ctrl+N` | New Document |
| `Ctrl+G` / `Ctrl+Shift+G` | Group Layers / Ungroup Layers |
| `Ctrl+R` | Toggle Rulers |
| `Ctrl+0` / `Ctrl+1` | Zoom Fit / Zoom 100% |
| `Space` (hold) | Temporary Pan |
| `Tab` | Toggle UI Panels |
| `[ / ]` | Brush Size |
| `X` | Swap FG/BG Colors |
| `D` | Reset to Black/White |
| `V B E T G C Z H L R P M W S I J A N` | Tool shortcuts |

Select the Zoom tool and enable **Pixel-perfect** when working on pixel art. The
mode keeps zoom controls on reciprocal/integer ratios and switches image
sampling to nearest-neighbour above 100%; the setting is persisted with
Preferences.

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│  Single HTML File (single-file runtime)                      │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐               │
│  │  CSS     │  │  HTML    │  │  JavaScript  │               │
│  │  Styles  │  │  Layout  │  │  Engine      │               │
│  └──────────┘  └──────────┘  └──────┬───────┘               │
│                                      │                       │
│       ┌──────────────────────────────┼──────────────┐        │
│       │                              │              │        │
│  ┌────▼─────┐  ┌─────────────┐  ┌───▼──────┐  ┌────▼─────┐ │
│  │ Fabric.js│  │ ag-psd      │  │ jsPDF    │  │Transformers│ │
│  │ Canvas   │  │ PSD I/O     │  │ PDF Out  │  │.js AI     │ │
│  └──────────┘  └─────────────┘  └──────────┘  └──────────┘  │
│                                                              │
│  Everything runs client-side. Zero server dependency.        │
└──────────────────────────────────────────────────────────────┘
```

### Dependencies (loaded via CDN with SRI integrity hashes)

| Library | Purpose |
|---------|---------|
| [Fabric.js](https://fabricjs.com/) — `fabric` 7.4.0 (MIT) | Canvas rendering, object manipulation, serialization |
| [Fabric.js extensions](https://github.com/fabricjs/fabric.js/tree/master/extensions) — `fabric` 7.4.0 (MIT) | On-canvas linear gradient stop handles (loaded on demand) |
| [ImageTracer](https://github.com/jankovicsandras/imagetracerjs) — `imagetracerjs` 1.2.6 (Unlicense) | Raster-to-vector tracing (loaded on demand) |
| [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) — `svg2pdf.js` 2.7.0 (MIT) | Vector PDF pages for all-vector documents (loaded on demand) |
| [ag-psd](https://github.com/Agamnentzar/ag-psd) — `ag-psd` 31.0.2 (MIT) | Photoshop PSD file import and export |
| [jsPDF](https://github.com/parallax/jsPDF) — `jspdf` 4.2.1 (MIT) | PDF document generation |
| [modern-gif](https://github.com/qq15725/modern-gif) — `modern-gif` 2.1.0 (MIT) | Animated GIF import and export (loaded on demand) |
| [PDF.js](https://github.com/mozilla/pdf.js) — `pdfjs-dist` 6.2.108 (Apache-2.0) | PDF import and vector page generation (loaded on demand) |
| [LibRaw-Wasm](https://github.com/ybouane/LibRaw-Wasm) — `libraw-wasm` 1.6.0 (ISC) | RAW camera image decoding (loaded on demand) |
| [Transformers.js](https://huggingface.co/docs/transformers.js) — `@huggingface/transformers` 4.2.0 (Apache-2.0) | Client-side AI inference via WebGPU/WASM (loaded on demand) |
| [Photon](https://github.com/silvia-odwyer/photon) — `@silvia-odwyer/photon` 0.3.3 (Apache-2.0) | Optional WASM acceleration for supported pixel filters (loaded on demand) |
| [jSquash AVIF](https://github.com/jamsinclair/jSquash) — `@jsquash/avif` 2.1.1 (Apache-2.0) | Deterministic AVIF encode/decode via libavif WASM (loaded on demand) |
| [jSquash HEIC](https://github.com/discourse/jSquash) — `@discourse/heic` 1.0.0 (Apache-2.0) | Native-first HEIC/HEIF import fallback through separately verified decoder WASM (loaded on demand) |
| [jSquash JPEG XL](https://github.com/jamsinclair/jSquash) — `@jsquash/jxl` 1.3.0 (Apache-2.0) | Native-first JPEG XL import fallback through separately verified decoder WASM (loaded on demand) |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) — `onnxruntime-web` 1.26.0-dev.20260416-b7804b056c (MIT) | WebAssembly inference runtime for AI features (loaded on demand) |
| [C2PA web](https://github.com/contentauth/c2pa-js) — `@contentauth/c2pa-web` 0.13.4 (MIT) | Read-only Content Credentials manifest and validation reader (loaded only when a C2PA marker is detected) |
| [C2PA WebAssembly](https://github.com/contentauth/c2pa-js) — `@contentauth/c2pa-wasm` 0.11.2 (MIT) | Content Credentials verification engine (loaded on demand with the reader) |
| [highgain](https://github.com/contentauth/c2pa-js) — `highgain` 0.1.0 (ISC) | C2PA reader worker transport (loaded on demand with the reader) |
| [ts-deepmerge](https://github.com/voodoocreation/ts-deepmerge) — `ts-deepmerge` 8.0.0 (ISC) | C2PA reader settings merge (loaded on demand with the reader) |
| System font stacks | UI and monospace text without a third-party font request |

Package names, exact versions, and SPDX identifiers in this table are checked
against the canonical runtime manifest by `tests/runtime-assets.test.js`. The
manifest also records embedded-dependency provenance per
asset. The pinned jsPDF 4.2.1 UMD contains optional DOMPurify loader hooks but
does not bundle DOMPurify, and OpenShop never calls jsPDF's `.html()` path, so
that optional dependency is not reachable. `tests/runtime-assets.test.js` ties
the finding to the exact URL and version and fails if a future pin makes it
stale.

The HEIC decoder records its embedded libheif 1.19.7 and libde265 1.0.15
builds. The JPEG XL decoder records its pinned libjxl source commit
(`9f544641ec83f6abd9da598bdd08178ee8a003e0`); these notices are kept in the
canonical manifest alongside the Apache-2.0 package licenses.

OpenShop `.openshop` files are JSON-encoded document schema v3. The same envelope drives project save/open, recovery, and undo/redo so live layer hierarchy and order, masks, guides, selections, animation frames, per-character text styles, color-profile metadata/bytes, AI segment masks, and active state stay synchronized. Schema v1/v2 projects and legacy `.json`, Fabric 5, and OpenShop 0.18.13 projects are migrated on load through an explicit version registry; unknown future schemas are rejected before the active document is touched. Native project import/export records a structured compatibility report, and PSD import/export reports unsupported fields, color modes, metadata, and approximations. JPEG APP2, PNG `iCCP`, WebP `ICCP`, AVIF `colr`, and PSD profiles are parsed when present; matrix/TRC profiles are converted into the browser's sRGB working space or a supported Display P3 canvas, with the conversion recorded in the import/export report. PNG, JPEG, WebP, AVIF, and PSD exports embed the active working profile when their writer/container supports it, and explicitly report when embedding is unavailable.

At startup, the editor probes the active browser engine's usable canvas dimension and pixel-area ceiling, caches the result for the current browser/device profile, and applies it to New Image and every raster import path. A document above the measured ceiling is refused before allocation, with the measured per-side and total-pixel limits included in the error.

Recovery uses checksum-verified, immutable generations keyed by stable document IDs rather than one overwrite-in-place file. Writes stage and verify a temporary OPFS file before promotion, retain up to five generations per document, rebuild from snapshot files if the index is damaged, and fall back to the newest verified older generation when necessary. Web Locks serialize the shared index and active tab leases fork competing documents into separate recovery streams. Recovery Storage shows quota and durable/best-effort status and supports metadata preview, naming, export, restore, open-as-copy, and per-generation discard. The legacy singleton autosave migrates on first supported startup.

## Embedding OpenShop

A host page can drive OpenShop in an iframe over a versioned `postMessage` contract. Nothing in it carries code — every message is data, and the editor answers only the window that completed the handshake.

**Protocol version 1.** Every message in both directions carries `version: 1`; a message with any other version is answered with `openshop:error` rather than guessed at.

| Host → OpenShop | Payload | Reply |
|---|---|---|
| `openshop:hello` | — | `openshop:ready` with `capabilities: { exportFormats, tools, overrides }` |
| `openshop:configure` | `document`, `tools`, `overrides` | `openshop:configured` with the tool list and overrides in force |
| `openshop:export` | `format`, `options` | `openshop:exported` with `{ blob, filename, format }` |
| `openshop:open` | `document` | `openshop:opened` |

| OpenShop → Host | When |
|---|---|
| `openshop:ready` | Once at startup with no `id` (so a host that missed the load event can still start), then again as the reply to `hello` |
| `openshop:save-requested` | The user saved and the host took `overrides.save`; carries `{ blob, filename }` |
| `openshop:open-requested` | The user chose Open and the host took `overrides.open` |
| `openshop:error` | `{ id, message }` for anything refused |

`document` is either `{ width, height, background }` or `{ dataUrl | blob, name }`. `tools` is an allowlist of `data-tool` values; anything outside it is hidden and removed from the tab order. Export formats are `png`, `jpeg`, `webp`, `avif`, `svg`, and `pdf`.

```html
<iframe id="editor" src="/openshop/index.html" width="1200" height="800"></iframe>
<script>
  const frame = document.getElementById('editor');
  const send = (message) => frame.contentWindow.postMessage({ version: 1, ...message }, '*');

  window.addEventListener('message', async (event) => {
    if (event.source !== frame.contentWindow) return;
    const message = event.data;
    if (message?.version !== 1) return;

    if (message.type === 'openshop:ready' && !message.id) {
      send({ type: 'openshop:hello', id: 'hello' });
    }
    if (message.type === 'openshop:ready' && message.id === 'hello') {
      send({
        type: 'openshop:configure',
        id: 'setup',
        document: { width: 1200, height: 630, background: '#101820' },
        tools: ['select', 'brush', 'text', 'crop'],
        overrides: { open: true, save: true }
      });
    }
    if (message.type === 'openshop:open-requested') {
      const blob = await fetch('/assets/banner.png').then(response => response.blob());
      send({ type: 'openshop:open', id: 'open', document: { blob, name: 'banner.png' } });
    }
    if (message.type === 'openshop:save-requested') {
      await fetch('/api/artwork', { method: 'POST', body: message.blob });
    }
    if (message.type === 'openshop:exported') {
      console.log('got', message.filename, message.blob.size, 'bytes');
    }
    if (message.type === 'openshop:error') {
      console.warn('openshop refused', message.id, message.message);
    }
  });

  // Ask for the finished artwork whenever the host is ready for it.
  document.getElementById('done')?.addEventListener('click', () => {
    send({ type: 'openshop:export', id: 'final', format: 'png', options: { scale: 2 } });
  });
</script>
```

Serve OpenShop over http(s) rather than `file://` when embedding. A `file://` document reports its origin as the literal string `null`, which `postMessage` cannot be given as a target — the editor falls back to `'*'` for its replies in that case, so the handshake still works for local testing but the replies are not origin-restricted. The editor always binds to the exact window that sent `openshop:hello` and ignores every other one.

For a hosted deployment, set clickjacking protection in the **HTTP response
header**, using the ancestor list that matches your host application:

```http
Content-Security-Policy: frame-ancestors https://studio.example;
```

Do not use `frame-ancestors 'none'` on a deployment that embeds the editor. Browsers
ignore this directive when it is placed in a `<meta>` policy, so the portable
`file://` lane intentionally omits it and relies on the exact-window binding in the
versioned handshake above. The release checker rejects header-only directives in the
shipped meta policy rather than treating their text as protection.

## Privacy and Network Use

OpenShop has no account, no credit meter, no telemetry, and no upload path. Every edit, filter, export, and AI inference runs in your browser on your machine. There is no server-side component to send a document to, so no document, layer, selection, or pixel is ever transmitted.

What OpenShop *does* fetch is program code — and, the first time you use an AI feature, that model's weights:

| Host | What comes from it | When |
|---|---|---|
| `cdn.jsdelivr.net` | Pinned, SHA-384-verified libraries and codecs (Fabric, ag-psd, jsPDF, Photon, GIF, AVIF, HEIC, JPEG XL, Transformers.js, ONNX Runtime, C2PA reader) | Three at startup; the rest only when a feature that needs them is used |
| `huggingface.co` / `*.hf.co` | Pinned AI model weights | First use of a given AI feature |
| *(none)* | UI fonts use the device's system and monospace stacks | Page load |

You do not have to take that on trust. **The status bar reports outbound requests where a hosted competitor shows remaining credits.** It reads `Nothing sent` until something is fetched, then names the count; clicking it opens **Network Activity**, which lists every request this session grouped by host and purpose. The ledger is installed before the first fetch in the document, so the three startup libraries are on the list too.

**Strict offline mode** — the same dialog, or `Toggle Strict Offline Mode` in the command palette — refuses every request to anywhere but this page unless it is already cached. It disables whichever lazily fetched capabilities have not been downloaded yet, and the dialog names them individually rather than warning in the abstract. The preference persists across reloads.

One honest limitation: on the standalone `file://` lane a cold start needs the three pinned libraries, which *are* the application. If strict mode is on and nothing is cached, OpenShop stands the mode down, opens anyway, and reports why in the Network Activity dialog rather than leaving you with no interface to turn it off. To hold the guarantee across a cold start, use the hosted lane described under [Self-Hosting](#self-hosting), where those libraries are part of the verified offline shell — the same subdirectory bundle a school or clinic can serve from its own network.

## Security

- Core startup CDN scripts are version-pinned and loaded with [Subresource Integrity (SRI)](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) hashes
- PSD, Photon, GIF, AVIF, HEIC, JPEG XL, Transformers.js, ONNX, and C2PA lazy runtime bytes are version-pinned, SHA-384 verified before execution, and discarded on any digest mismatch
- Verified lazy runtime byte buffers are released after initialization, temporary executable blob URLs are revoked at their last safe owner, and the lifecycle disposer clears shared codec, PDF, RAW, AI, and worker resources without retaining duplicate payloads
- Static controls carry opaque action IDs resolved by a frozen listener registry; executable HTML event attributes are forbidden by the release security check
- Recent files, saved palettes, templates, and photo presets render through DOM APIs so persisted values remain inert text
- Worker-backed filters use a named operation registry, so filter jobs no longer pass executable source strings or require `unsafe-eval`
- Command palette, context menu, sticky notes, animation frames, macro list, AI progress titles, and save-preset modals render through DOM APIs instead of runtime `innerHTML`
- PSD import performs a raw ag-psd structure parse in a cancellable worker, decodes layer pixels on demand, enforces file/header/layer bounds plus an explicit 256 MB allocator and aggregate decoded-pixel ceiling, and commits the new document only after every layer is ready
- Project, palette, preset, and image imports share central schema/resource budgets for dimensions, file sizes, object counts, color formats, and adjustment ranges
- Recovery Storage in the command palette exposes checksum-verified per-document generations, corruption fallback, active-tab ownership, quota/durability, naming, preview, restore/open-as-copy, export, and discard actions
- The script policy uses exact SHA-256 hashes for the two reviewed inline scripts and permits neither `unsafe-inline` nor unrestricted `unsafe-eval`; `wasm-unsafe-eval` is retained only for digest-verified WebAssembly
- A single named Trusted Types policy, `openshop-loader`, wraps every digest-verified JavaScript blob before it reaches a script, module, or worker sink; the same verified-URL registry remains the fallback on engines without Trusted Types
- AI model revisions pinned to immutable commit SHAs (not mutable branch refs)
- PSD layer names and project JSON are sanitized to prevent XSS injection
- SVG export is sanitized to strip script tags and event handlers
- jsPDF upgraded to 4.2.1 to patch CVE-2026-25755

The portable `file://` lane enforces the policy embedded in `index.html`; because it has no response headers, it cannot emit violation reports or deliver header-only controls such as `frame-ancestors`. Its real embedding guard is the exact-window binding in the `postMessage` handshake. Hosted deployments retain that baseline and should copy the generated policy into an HTTP `Content-Security-Policy` header, adding a deployment-chosen `frame-ancestors` list when the editor is embedded. For a staged deployment, send the Trusted Types directives in `Content-Security-Policy-Report-Only` first, inspect violations, then enforce the same directives in the header. After any inline script edit, run `npm run security:write`; `npm run security:check` rejects stale hashes, Trusted Types policy/sink bypasses, executable event attributes, undeclared UI actions, unverified external scripts, lazy executable paths that bypass the digest manifest, and header-only directives incorrectly placed in meta delivery.

## Offline, Install, and File Launch

OpenShop has two explicit distribution contracts:

- `index.html` opened from disk remains the portable one-file editor. Core libraries are pinned but CDN-hosted, so a cold launch and any uncached optional helper require a connection. Browsers do not allow this lane to register a service worker.
- An HTTPS or localhost deployment that includes `sw.js`, `plugin-sandbox.html`, `plugin-sandbox.js`, `manifest.webmanifest`, both icons, and the two `design/` install screenshots stages the editor, plugin runtime, manifest, install assets, Fabric, ag-psd, and jsPDF as one verified shell. The status bar reports readiness. Once ready, the core editor reloads offline.

Hosted updates install into a separate cache and remain waiting until applied. The new shell must complete an editor health check; if it does not, the next launch returns to the last verified shell. The Offline & Install dialog exposes update, rollback, connection, install, optional-helper, and pinned AI-model cache state. Apply Update, Restore Previous Shell, and Rebuild Offline Shell first ask dirty documents whether to Save a verified recovery generation, Discard it explicitly, or Cancel without changing the worker or document; a failed Save leaves the current shell active.

Installed-app file launch is progressively enhanced through `launchQueue`. Supporting Chromium releases can launch raster, vector, AVIF/APNG, HEIC/HEIF, JPEG XL, PDF, RAW, PSD, OpenRaster, and `.openshop` project files. Installed browsers can also receive image files from the system share sheet; OpenShop stores the multipart handoff locally before opening it, so document pixels never upload. Other browsers retain Open, drag/drop, and file-picker workflows. AI models are intentionally outside the core shell and require one successful online use before their own cache can help offline.

## Self-Hosting

```bash
# Portable, network-first standalone
cp index.html /var/www/html/index.html

# Hosted offline/install lane, scoped to one application directory
mkdir -p /var/www/html/openshop
cp index.html plugin-sandbox.html plugin-sandbox.js sw.js manifest.webmanifest icon-192.png icon-512.png design/openshop-studio-master.png design/openshop-menu-states.png /var/www/html/openshop/

# Or with GitHub Pages
git init && git add . && git commit -m "init"
# Enable Pages in repo settings → serves as a live editor
```

No build step. No bundler. No runtime `node_modules`. `index.html` remains usable by itself; the eight static companions enable the hosted PWA and sandboxed-plugin contract.

Keep those nine hosted files together in their own directory. A service worker's default scope is the directory containing `sw.js`; placing it at `/sw.js` grants it navigation control over every path on that origin. GitHub project Pages sites such as `/Openshop/` already provide the desired directory scope. A user/organization Pages site served at the origin root should publish OpenShop below a subdirectory instead.

If the hosted directory is embedded by another site, add the response header shown in
the Embedding section at the server or reverse proxy. The allowed ancestor list belongs
to that deployment; it is deliberately not baked into the portable HTML file.

## Testing

The app still ships as a single HTML file. The Node tooling is only for local contributor verification:

Contributor verification requires Node.js 22.22.2 or newer; the shipped editor itself has no Node.js runtime dependency.

```bash
npm install
npm test
npm run test:e2e
npm run test:release
```

Runtime CDN URLs, integrity hashes, cache policy, and package metadata share one canonical manifest. After changing a pinned runtime dependency, run `npm run runtime:sync` followed by `npm run security:write` before running the release gate.

`node tools/roadmap-consistency.mjs` checks that `ROADMAP.md` remains the sole
actionable queue and that the Photoshop parity ledger's historical status totals
and classifications cannot drift silently.

The release workflow pins every GitHub Action to a full commit SHA with its human-readable release tag in a comment, grants only read access to repository contents, and is monitored by weekly Dependabot updates for both Actions and npm dependencies. The same immutable-action contract is covered by the unit suite.

`npm test` runs Vitest unit coverage for the core editor object with canvas mocks, including the redistributable `tests/fixtures/compatibility-corpus.json` manifest and its project/layer/mask/animation/metadata/loss invariants. `npm run test:e2e` runs Playwright against `index.html`, including onboarding and dialog checks at 320×568, 375×667, 768×1024, and their landscape equivalents. Hosted/offline browser tests query `__test/identity` and compare a checkout content token before boot, so local server reuse cannot silently exercise another tree; CI always starts a fresh server. The shell contract also gates accessible names for generated form controls, tablist/tab/tabpanel ownership, command-palette combobox state, keyboard entry to the canvas, and inert mobile drawers; the browser gate runs axe-core against blank, editor, modal, and mobile-drawer states. Release metadata tests resolve the manifest, social preview, icons, install screenshots, version surfaces, and Chromium visual-baseline manifest in both standalone-file and hosted lanes.
Chromium visual baselines are release-scoped by `tests/visual-snapshot-release.json`; after an intentional shell change, refresh them headlessly with `npx playwright test tests/openshop.e2e.spec.js --project=chromium --update-snapshots`, inspect the result, and update that manifest's release field when the shipped version changes.
`npm run test:mobile` runs the compact-workspace capability matrix in Chromium, Firefox, and WebKit using Pixel 5 and iPhone 13 emulation. It checks touch/pinch behavior, pressure variance handling, coalesced/predicted pointer APIs, tilt capability reporting, safe-area capability reporting, visual-viewport resize signals, orientation signals, and narrow-layout overflow. `npm run test:release` adds a high/critical advisory gate before running the performance, unit, desktop, cross-browser, and mobile suites.

`npm run test:perf` starts a fresh headless Chromium against the shipped page and runs real 4K (3840×2160), 8K (7680×4320), and 12MP (4000×3000) documents through import, paint, preview/apply filter, undo/redo, PNG export, batch, cancellation, and stale-result probes. It prints p50/p95 latency and records the actual Canvas2D/WebGL/compute-controller path for each operation. Budgets are fixed at four times the measured contributor p95 baselines; `OPENSHOP_PERF_SLOW_FILTER_MS=1000 npm run test:perf` is a documented failure probe for the filter gate. This is a headless Chromium release signal, not a claim about worker/GPU timing on every browser or physical device; those remain governed by the support matrix and cross-engine tests.

## Browser Support

| Browser engine | `file://` / hosted mode | Viewport or emulation | Physical device | Pen / stylus | Offline claim |
|----------------|-----------------------|----------------------|-----------------|--------------|---------------|
| Chrome / Edge 90+ | Core editor works from the single file; hosted HTTPS/localhost adds File System Access and PWA install | Chromium Playwright suite, including narrow viewport cases | Not validated on physical Android or desktop hardware | PointerEvent pressure path is automated; hardware pressure curve is not validated | Hosted shell and runtime cache are verified by the offline suite |
| Firefox 90+ | Core editing from the file picker; hosted mode is required for origin-backed recovery; Save Project downloads rather than writing in place | Firefox Playwright suite plus capability probe | Not validated on physical Android or desktop hardware | PointerEvent path only; no hardware claim | No offline claim for the direct `file://` lane; hosted service-worker behavior is covered where supported |
| Safari 15+ / WebKit | Core editing from the single file; hosted mode is required for auto-save/recovery | WebKit Playwright suite plus capability probe | Safari hardware is not validated | PointerEvent path only; no hardware claim | No direct-file offline/recovery claim; hosted behavior is limited to the observed WebKit capability |
| Mobile Chrome / Safari | Responsive shell and dialogs; precision canvas work is best on a larger display | Chromium, Firefox, and WebKit Pixel 5/iPhone 13 emulation plus capability probe | Physical Android/iOS behavior is unverified | Emulated PointerEvent pressure path only; no physical stylus claim | No physical-device offline claim |

The matrix reflects automated and capability checks run on 2026-08-02; it does not convert viewport emulation into a physical-device support claim. Before making one, validate a hosted/offline start, import/export, recovery, two-finger pan/pinch, safe-area layout, software-keyboard resize, and rotation on physical Android Chrome and iOS Safari. Validate both varying and constant pressure, save/reopen, and the diagnostics report with a physical Windows pen. Run the cross-engine flows yourself with `npm run test:cross-browser` and the mobile matrix with `npm run test:mobile`.

Offline installation depends on service-worker/PWA support. Operating-system file associations are currently a desktop Chromium capability; OpenShop feature-detects them and does not claim them in Firefox or Safari.

## Related Tools

| Tool | Type | Best For |
|------|------|----------|
| **OpenShop** (this repo) | Single-file browser app + optional hosted PWA | Zero-install editing — 34 tools, PSD import/export, client-side AI, and verified hosted-shell offline reloads |
| [PyShop](https://github.com/SysAdminDoc/PyShop) | Python desktop app | Native desktop image editor if you prefer a traditional installed application |

## FAQ

**Q: Is this really just one HTML file?**
Yes. All CSS, HTML, and JavaScript are in a single self-contained file. External resources are limited to CDN-hosted libraries (loaded with integrity hashes); the interface uses local system font stacks.

**Q: Do my images get uploaded anywhere?**
No. Everything runs in your browser. Images are processed locally via Canvas API and never leave your machine. AI models are downloaded once to your browser cache and run client-side.

**Q: Can I use this offline?**
The answer depends on how OpenShop is launched. A downloaded `index.html` is network-first because its pinned core libraries come from CDNs. The hosted HTTPS build becomes offline-ready only after its status indicator says **Offline ready**; its service worker then serves the verified core shell and can fall back after a bad update. Optional Photon/GIF helpers and AI models work offline only when their resources were previously cached, and the Offline & Install dialog reports the state it can verify.

**Q: How does PSD import/export work?**
OpenShop uses ag-psd to parse and write `.psd` files client-side. Import decoding runs in a worker: the raw structure is checked first, then layer pixels are decoded on demand under an explicit 256 MB allocator cap; a cancel action leaves the open document unchanged. Drawable layer files import without duplicating Photoshop's document composite. Nested PSD groups become live collapsible editor groups, with supported blend modes, opacity, visibility, locks, and single-style horizontal text surviving PSD import → edit → export → reimport. Group compositing is approximated while editing but the live hierarchy and original interchange metadata are retained for PSD export.

OpenShop shows a compatibility report whenever exact semantics are unavailable. The report also exposes machine-readable `losses` entries through the latest import/export report, including a path, feature, fallback, and message. Layer effects, masks, adjustment layers, clipping relationships, and separate fill opacity use the document composite as one flattened appearance layer. Smart objects, vector content, and rich text use per-layer decoded-pixel fallbacks. OpenShop masks and pixel filters are baked into exported PSD layer pixels; mixed-content text and vector objects are rasterized. The editable OpenShop project format is the lossless choice for OpenShop-only history, selections, guides, animation, and object structure.

**Q: Why not React/Vue/Svelte?**
Simplicity. A single HTML file can be hosted anywhere, shared as an email attachment, opened from a USB drive, or embedded in any environment. No build toolchain means zero maintenance burden.

## Contributing

Issues and PRs welcome. The codebase is a single file — just open `index.html` in any editor.

When contributing:
- Run `npm test` and `npm run test:e2e`; run `npm run test:cross-browser` before changing anything the browser-support table claims
- Run `npm run runtime:sync` and `npm run security:write` after changing a runtime asset or its inline loader
- Maintain the single-file architecture
- Keep every theme consistent with the shared CSS token scale
- Route replayable edits through a schema-v1 command and one history transaction; use `saveHistory()` only for a completed synchronous mutation
- Heavy pixel operations should use `_runFilterInWorker()` to avoid blocking the UI

## License

MIT License. See [LICENSE](LICENSE) for details.

---

**OpenShop** is built by the community for the community. No accounts, no tracking, no paywalls. Just open and edit.
