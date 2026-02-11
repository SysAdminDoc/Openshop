# OpenShop

![Version](https://img.shields.io/badge/version-0.16.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Browser-orange)
![Zero Install](https://img.shields.io/badge/install-none_required-brightgreen)
![Single File](https://img.shields.io/badge/single_file-HTML-E34F26?logo=html5&logoColor=white)

> A free, single-file browser-based image editor with layers, AI tools, pixel-level selections, filters, PSD import, and a Photoshop-inspired workflow. No server, no signup, no install.

![Screenshot](screenshot.png)

## Quick Start

1. Download `OpenShop-v0.16.0.html`
2. Open it in any modern browser (Chrome, Edge, Firefox, Safari)
3. Start editing

That's it. Everything runs client-side. Your images never leave your machine.

**Or host it** — drop the file on any static host (GitHub Pages, Netlify, S3, Nginx) and it works as a full web app.

## Features

### Core Editor

| Feature | Description |
|---------|-------------|
| **Layer System** | Multi-layer canvas with add, delete, duplicate, merge, flatten, visibility toggle, opacity, and blend modes |
| **33 Tools** | Move, Brush, Pencil, Eraser, Spray, Clone Stamp, Healing Brush, Dodge, Burn, Sponge, Smudge, Shapes (rect, ellipse, triangle, polygon, star, arrow, line), Pen, Text, Gradient, Pattern Fill, Flood Fill, Eyedropper, Crop, Measure, Sticky Notes, Pan, Zoom |
| **Brush Engine** | Round, Soft, Flat, Fan, Splatter, Pixel presets with adjustable size, opacity, and flow |
| **Selection Tools** | Rectangular/Elliptical Marquee, Magic Wand (contiguous + global), Lasso, Color Range dialog with fuzziness, presets (Reds/Greens/Blues/Highlights/Midtones/Shadows), and live preview |
| **Selection Operations** | Select All, Deselect, Reselect, Inverse, Grow, Similar, Modify (Expand, Contract, Feather, Border, Smooth) |
| **Undo/Redo** | 60-step history with named entries and visual history panel |
| **Free Transform** | Resize, rotate, skew, perspective, and warp on any object |

### File I/O

| Format | Import | Export |
|--------|--------|--------|
| **PNG** | Yes | Yes |
| **JPEG** | Yes | Yes |
| **WebP** | Yes | Yes |
| **SVG** | — | Yes |
| **PDF** | — | Yes |
| **PSD** | Yes (layers preserved) | — |
| **GIF** | — | Yes (animated, frame-based) |
| **OpenShop JSON** | Yes | Yes (full project with layers) |

Batch export to multiple formats in one click.

### AI Features (Client-Side, via Transformers.js)

| Feature | Description |
|---------|-------------|
| **Background Removal** | MODNet-based automatic background removal |
| **Depth Map** | Depth-Anything monocular depth estimation |
| **Object Detection** | DETR-based object detection with bounding boxes |
| **Smart Upscale** | 2x / 4x AI super-resolution |

All AI models download once and run entirely in-browser via WebGPU/WASM. No API keys, no server calls.

### Adjustments & Filters

Levels, Curves (per-channel), Brightness/Contrast, Hue/Saturation, Color Balance, Auto Levels, Grayscale, Sepia, Invert, Black & White, Sharpen, Blur, Noise, Vignette, Posterize, Threshold, Emboss, Edge Detect, Pixelate, Oil Paint, and more.

### Interface

| Feature | Description |
|---------|-------------|
| **Dark Theme** | Professional dark UI with depth-layered panels |
| **Command Palette** | `Ctrl+K` to search and run any command |
| **Context Menus** | Right-click for contextual actions |
| **Rulers & Guides** | Draggable guides with snapping and pixel grid at high zoom |
| **Grid Overlay** | Toggleable composition grid |
| **Keyboard Shortcuts** | Full Photoshop-style shortcut set (40+ bindings) |
| **Marching Ants** | Animated selection borders |
| **Welcome Screen** | Template presets for common canvas sizes |
| **Tab Toggle** | `Tab` hides all panels for distraction-free editing |
| **PWA Support** | Installable as a standalone desktop app |

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
│  Single HTML File (~6,400 lines)                             │
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
│  │ Canvas   │  │ PSD Import  │  │ PDF Out  │  │.js AI     │ │
│  └──────────┘  └─────────────┘  └──────────┘  └──────────┘  │
│                                                              │
│  Everything runs client-side. Zero server dependency.        │
└──────────────────────────────────────────────────────────────┘
```

### Dependencies (loaded via CDN)

| Library | Purpose |
|---------|---------|
| [Fabric.js 5.3.1](http://fabricjs.com/) | Canvas rendering, object manipulation, serialization |
| [ag-psd 22.2](https://github.com/nicktomlin/ag-psd) | Photoshop PSD file parsing with layer support |
| [jsPDF 2.5.1](https://github.com/parallax/jsPDF) | PDF document generation |
| [Transformers.js](https://huggingface.co/docs/transformers.js) | Client-side AI inference (loaded on demand) |
| [Google Fonts](https://fonts.google.com/) | JetBrains Mono + DM Sans |

## Self-Hosting

```bash
# Simplest possible deployment
cp OpenShop-v0.16.0.html /var/www/html/index.html

# Or with GitHub Pages
git init && git add . && git commit -m "init"
# Enable Pages in repo settings → serves as a live editor
```

No build step. No bundler. No `node_modules`. One file.

## Browser Support

| Browser | Status |
|---------|--------|
| Chrome / Edge 90+ | Full support (including AI via WebGPU) |
| Firefox 90+ | Full support (AI via WASM fallback) |
| Safari 15+ | Full support (AI via WASM fallback) |
| Mobile Chrome/Safari | Functional, desktop recommended |

## FAQ

**Q: Is this really just one HTML file?**
Yes. All CSS, HTML, and JavaScript are in a single self-contained file. External resources are limited to CDN-hosted libraries and fonts.

**Q: Do my images get uploaded anywhere?**
No. Everything runs in your browser. Images are processed locally via Canvas API and never leave your machine. AI models are downloaded once to your browser cache and run client-side.

**Q: Can I use this offline?**
After the first load (which caches CDN resources), most features work offline. AI features require their models to be cached from a prior use. Install as a PWA for the best offline experience.

**Q: How does PSD import work?**
OpenShop uses the ag-psd library to parse `.psd` files client-side. Layers, blend modes, and visibility are preserved. Some advanced PSD features (layer effects, smart objects, adjustment layers) may not import perfectly.

**Q: Why not React/Vue/Svelte?**
Simplicity. A single HTML file can be hosted anywhere, shared as an email attachment, opened from a USB drive, or embedded in any environment. No build toolchain means zero maintenance burden.

## Contributing

Issues and PRs welcome. The codebase is a single file — just open `OpenShop-v0.16.0.html` in any editor.

When contributing:
- Test in Chrome and Firefox at minimum
- Maintain the single-file architecture
- Keep the dark theme consistent with existing CSS variables
- Add undo history entries (`saveHistory('Action Name')`) for any canvas-modifying operation

## License

MIT License. See [LICENSE](LICENSE) for details.

---

**OpenShop** is built by the community for the community. No accounts, no tracking, no paywalls. Just open and edit.
