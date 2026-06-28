# OpenShop

![Version](https://img.shields.io/badge/version-0.18.12-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Browser-orange)
![Zero Install](https://img.shields.io/badge/install-none_required-brightgreen)
![Single File](https://img.shields.io/badge/single_file-HTML-E34F26?logo=html5&logoColor=white)

> A free, single-file browser-based image editor with layers, AI tools, pixel-level selections, filters, PSD import/export, and a Photoshop-inspired workflow. No server, no signup, no install.

## Try It Now

**[Open OpenShop in your browser](https://sysadmindoc.github.io/Openshop/)** — no download required.

Or download `index.html` and open it locally. Everything runs client-side. Your images never leave your machine.

## Quick Start

1. Visit **https://sysadmindoc.github.io/Openshop/**
2. Or download the single HTML file and open it in any modern browser
3. Start editing

**Self-host it** — drop the file on any static host (GitHub Pages, Netlify, S3, Nginx) and it works as a full web app. No build step, no bundler, no `node_modules`.

## Features

### Core Editor

| Feature | Description |
|---------|-------------|
| **Layer System** | Multi-layer canvas with add, delete, duplicate, merge, flatten, visibility toggle, opacity, blend modes, and drag reorder |
| **34 Tools** | Move, Brush, Pencil, Eraser, Spray, Clone Stamp, Healing Brush, Dodge, Burn, Sponge, Smudge, Shapes (rect, ellipse, triangle, polygon, star, arrow, line), Pen, Text, Gradient, Pattern Fill, Flood Fill, Eyedropper, Crop, Measure, Sticky Notes, AI Segment Select, Pan, Zoom |
| **Brush Engine** | Round, Soft, Flat, Scatter, Pixel presets with adjustable size, opacity, and flow |
| **Selection Tools** | Rectangular/Elliptical Marquee, Magic Wand (contiguous + global), Lasso, Color Range dialog with fuzziness, presets, and live preview |
| **Selection Operations** | Select All, Deselect, Reselect, Inverse, Grow, Similar, Modify (Expand, Contract, Feather, Border, Smooth) |
| **Symmetry Drawing** | Horizontal, vertical, both-axes, and radial (6-fold) mirror modes for brush strokes |
| **Undo/Redo** | 60-step history with named entries and visual history panel |
| **Free Transform** | Resize, rotate, skew, perspective, and warp on any object |
| **Auto-Save** | Project state saved to browser storage every 30 seconds with crash recovery |

### File I/O

| Format | Import | Export |
|--------|--------|--------|
| **PNG** | Yes | Yes |
| **JPEG** | Yes | Yes |
| **WebP** | Yes | Yes |
| **SVG** | — | Yes |
| **PDF** | — | Yes |
| **PSD** | Yes (layers preserved) | Yes (layers preserved) |
| **GIF** | — | Yes (animated, frame-based) |
| **OpenShop JSON** | Yes | Yes (full project with layers) |

Batch export to multiple formats in one click. Native save/open dialogs on Chrome/Edge via File System Access API.

### AI Features (Client-Side, via Transformers.js 4.0)

| Feature | Description |
|---------|-------------|
| **Background Removal** | MODNet-based automatic background removal |
| **Depth Map** | Depth-Anything monocular depth estimation |
| **Object Detection** | DETR-based object detection with bounding boxes |
| **Segment Select** | Click-to-segment pixel selections via pinned DETR panoptic segmentation |
| **Smart Upscale** | 2x / 4x AI super-resolution |

All AI models download once and run entirely in-browser via WebGPU/WASM. No API keys, no server calls. Model revisions are pinned to immutable commit SHAs for supply-chain security. Segment Select uses `Xenova/detr-resnet-50-panoptic`; SAM-style mask-generation is not available in current Transformers.js browser pipelines.

### Adjustments & Filters

Levels, Curves (per-channel), Brightness/Contrast, Hue/Saturation, Color Balance, Auto Levels, Auto Enhance, Grayscale, Sepia, Invert, Black & White, Sharpen, Blur, Noise, Vignette, Posterize, Threshold, Emboss, Edge Detect, Pixelate, Oil Paint, Halftone, Duotone, Tilt Shift, Chromatic Aberration, Gradient Map, Vibrance, Exposure, Shadows/Highlights, Photo Filter, Selective Color, Replace Color, Lens Correction, and 8 built-in photo presets with custom preset import/export.

Heavy filters (Oil Paint, Tilt Shift, Unsharp Mask, Posterize, Threshold, Vignette, Edge Detect, Duotone, Chromatic Aberration) run in a Web Worker so the UI stays responsive on large images. Photon WASM is loaded on demand as an optional accelerator for supported pixel filters, with automatic fallback to the JavaScript worker.

### Interface

| Feature | Description |
|---------|-------------|
| **Dark Theme** | Professional dark UI with depth-layered panels (default, midnight, OLED variants) |
| **Command Palette** | `Ctrl+K` to search and run any command |
| **Context Menus** | Right-click for contextual actions |
| **Rulers & Guides** | Draggable guides with snapping and pixel grid at high zoom |
| **Grid Overlay** | Toggleable composition grid |
| **Keyboard Shortcuts** | Full Photoshop-style shortcut set (40+ bindings) |
| **Marching Ants** | Animated selection borders |
| **Welcome Screen** | Template presets for common canvas sizes |
| **Tab Toggle** | `Tab` hides all panels for distraction-free editing |
| **PWA Support** | Installable as a standalone desktop app with offline CDN caching |
| **Accessibility** | ARIA roles, keyboard navigation, focus indicators, reduced-motion support, hidden canvas-state mirror, and live status announcements |

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
| `Ctrl+G` / `Ctrl+R` | Toggle Grid / Rulers |
| `Ctrl+0` / `Ctrl+1` | Zoom Fit / Zoom 100% |
| `Space` (hold) | Temporary Pan |
| `Tab` | Toggle UI Panels |
| `[ / ]` | Brush Size |
| `X` | Swap FG/BG Colors |
| `D` | Reset to Black/White |
| `V B E T G C Z H L R P M W S I J A N` | Tool shortcuts |

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│  Single HTML File (~7,300 lines)                             │
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
| [Fabric.js 5.3.1](http://fabricjs.com/) | Canvas rendering, object manipulation, serialization |
| [ag-psd 22.0.2](https://github.com/Agamnentzar/ag-psd) | Photoshop PSD file import and export |
| [jsPDF 4.2.1](https://github.com/parallax/jsPDF) | PDF document generation |
| [Transformers.js 4.0](https://huggingface.co/docs/transformers.js) | Client-side AI inference via WebGPU/WASM (loaded on demand) |
| [Photon 0.3.3](https://github.com/silvia-odwyer/photon) | Optional WASM acceleration for supported pixel filters (loaded on demand) |
| [Google Fonts](https://fonts.google.com/) | JetBrains Mono + DM Sans |

## Security

- Core startup CDN scripts are loaded with [Subresource Integrity (SRI)](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) hashes
- On-demand AI/filter modules are version-pinned and run client-side
- Recent files, saved palettes, templates, and photo presets render through DOM APIs so persisted values remain inert text
- Worker-backed filters use a named operation registry, so filter jobs no longer pass executable source strings or require `unsafe-eval`
- Command palette, context menu, sticky notes, animation frames, macro list, AI progress titles, and save-preset modals render through DOM APIs instead of runtime `innerHTML`
- PSD import preflights file size, header fields, canvas dimensions, layer count, and layer bounds before bitmap decode; structure parsing is isolated in a worker when available
- Project, palette, preset, and image imports share central schema/resource budgets for dimensions, file sizes, object counts, color formats, and adjustment ranges
- Recovery Storage in the command palette shows autosave age, size, quota usage, corruption state, and restore/export/discard actions
- Content Security Policy restricts script/style/connect sources
- AI model revisions pinned to immutable commit SHAs (not mutable branch refs)
- PSD layer names and project JSON are sanitized to prevent XSS injection
- SVG export is sanitized to strip script tags and event handlers
- jsPDF upgraded to 4.2.1 to patch CVE-2026-25755

## Self-Hosting

```bash
# Simplest possible deployment
cp index.html /var/www/html/index.html

# Or with GitHub Pages
git init && git add . && git commit -m "init"
# Enable Pages in repo settings → serves as a live editor
```

No build step. No bundler. No `node_modules`. One file.

## Testing

The app still ships as a single HTML file. The Node tooling is only for local contributor verification:

```bash
npm install
npm test
npm run test:e2e
```

`npm test` runs Vitest unit coverage for the core editor object with canvas mocks. `npm run test:e2e` runs Playwright against `index.html` and checks the editor shell screenshot.

## Browser Support

| Browser | Status |
|---------|--------|
| Chrome / Edge 90+ | Full support (including AI via WebGPU) |
| Firefox 90+ | Full support (AI via WASM fallback) |
| Safari 15+ | Full support (AI via WASM fallback, auto-save via Worker) |
| Mobile Chrome/Safari | Functional, desktop recommended |

## Related Tools

| Tool | Type | Best For |
|------|------|----------|
| **OpenShop** (this repo) | Single-file browser app | Zero-install editing in any browser — 34 tools, PSD import/export, client-side AI, works offline |
| [PyShop](https://github.com/SysAdminDoc/PyShop) | Python desktop app | Native desktop image editor if you prefer a traditional installed application |

## FAQ

**Q: Is this really just one HTML file?**
Yes. All CSS, HTML, and JavaScript are in a single self-contained file. External resources are limited to CDN-hosted libraries (loaded with integrity hashes) and fonts.

**Q: Do my images get uploaded anywhere?**
No. Everything runs in your browser. Images are processed locally via Canvas API and never leave your machine. AI models are downloaded once to your browser cache and run client-side.

**Q: Can I use this offline?**
After the first load, CDN resources are cached via the Cache API. Most features work offline. AI features require their models to be cached from a prior use. Install as a PWA for the best offline experience.

**Q: How does PSD import/export work?**
OpenShop uses the ag-psd library to parse and write `.psd` files client-side. Layers, blend modes, opacity, and visibility are preserved in both directions. Some advanced PSD features (layer effects, smart objects, adjustment layers) may not import perfectly.

**Q: Why not React/Vue/Svelte?**
Simplicity. A single HTML file can be hosted anywhere, shared as an email attachment, opened from a USB drive, or embedded in any environment. No build toolchain means zero maintenance burden.

## Contributing

Issues and PRs welcome. The codebase is a single file — just open `index.html` in any editor.

When contributing:
- Test in Chrome and Firefox at minimum
- Maintain the single-file architecture
- Keep the dark theme consistent with existing CSS variables
- Add undo history entries (`saveHistory('Action Name')`) for any canvas-modifying operation
- Heavy pixel operations should use `_runFilterInWorker()` to avoid blocking the UI

## License

MIT License. See [LICENSE](LICENSE) for details.

---

**OpenShop** is built by the community for the community. No accounts, no tracking, no paywalls. Just open and edit.
