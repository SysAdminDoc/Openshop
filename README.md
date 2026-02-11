# OpenShop

![Version](https://img.shields.io/badge/version-0.10.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Browser-orange)
![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Single File](https://img.shields.io/badge/architecture-single%20file-blueviolet)
![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8)

> A professional browser-based image editor in a single HTML file. 33 tools, 40+ filters, layer system, PSD import, animation timeline, macro recording, and a Photoshop-style grouped toolbar — no install, no server, no dependencies.

## Quick Start

**Option A — Open directly:**
1. Download `OpenShop-v0.10.0.html`
2. Double-click to open in any modern browser
3. Start editing

**Option B — Serve locally (for PWA/offline support):**
```bash
npx serve .
# or
python -m http.server 8000
```

**Option C — Deploy anywhere:**

Upload the single HTML file to any static host — GitHub Pages, Netlify, Vercel, S3, or drop it on a USB drive. It's fully self-contained.

## Features

### Tools (33)

Tools are organized in Photoshop-style grouped flyouts. Long-press or right-click a grouped tool to access all tools in that group.

| Group | Tools | Description |
|-------|-------|-------------|
| **Move** | Select / Move | Select, move, resize, rotate objects |
| **Selection** | Rect Marquee, Ellipse Marquee, Lasso, Magic Wand | Pixel-level selections with tolerance and contiguous options |
| **Crop** | Crop, Measure | Pro crop with 10 aspect presets, 8 resize handles, rule-of-thirds grid, live dimensions. Measure tool for distance/angle |
| **Brush** | Brush, Pencil, Spray/Airbrush | 5 brush presets (Round, Soft, Flat, Scatter, Pixel) with size, opacity, and color controls |
| **Eraser** | Eraser | Standalone — uses brush settings with white output |
| **Stamp** | Clone Stamp, Healing Brush | Alt+click to set source, paint to clone. Healing auto-blends |
| **Retouch** | Dodge, Burn, Sponge, Smudge | Non-destructive retouching on image objects. Size, exposure, and tonal range controls |
| **Shape** | Rectangle, Ellipse, Triangle, Line, Arrow, Polygon, Star | Fill/stroke/width controls, 5 dash patterns, polygon sides, star inner radius |
| **Pen** | Pen / Bezier | Click to add anchor points, drag for curves. Close path to create shape |
| **Text** | Text | IText with font family, size, color, bold, italic. Shadow and outline effects |
| **Fill** | Gradient, Fill Bucket, Pattern Fill | Linear/radial gradients, object fill, 6 pattern types (grid, dots, stripes, etc.) |
| **Eyedropper** | Eyedropper | Sample any pixel on canvas to set foreground color |
| **Note** | Sticky Note | Place draggable, resizable, color-coded annotations on canvas |
| **Navigate** | Pan, Zoom | Pan with drag or spacebar. Zoom with scroll, click, or slider (5%–2000%) |

### Filters & Adjustments (40+)

| Category | Filters |
|----------|---------|
| **Basic** | Grayscale, Invert, Sepia, Black & White, Sharpen, Emboss, Blur, Pixelate |
| **Color** | Brightness, Contrast, Saturation, Hue Rotation, Gamma, Vibrance, Exposure |
| **Advanced** | Posterize, Threshold, Solarize, Edge Detect, Vignette, Unsharp Mask |
| **Artistic** | Oil Paint, Halftone, Duotone, Tilt Shift, Chromatic Aberration, Noise Generator |
| **Pro Adjust** | Curves, Levels, Color Balance, Channel Mixer, Shadows/Highlights, Photo Filter, Selective Color, Replace Color, Lens Correction, Gradient Map |
| **Auto** | Auto Levels, Auto Contrast |

### Layer System

- Unlimited layers with add, delete, duplicate, merge, and reorder (drag)
- Per-layer opacity (0–100%) and visibility toggle
- 16 blend modes: Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion, Hue, Saturation, Color, Luminosity
- Layer masks with brush painting (black conceals, white reveals)
- Layer styles panel: Drop Shadow, Outer Glow, Stroke
- Object count per layer

### Canvas & View

- Rulers (horizontal + vertical) with pixel markings
- Draggable guides (click ruler to create, drag to position)
- Grid overlay with configurable size
- Snap-to-grid for precision alignment
- Navigator / Minimap panel with click-to-pan
- Pixel grid (visible at 800%+ zoom)
- Before / After split comparison with draggable divider
- Canvas rotate (90° CW/CCW) and flip (horizontal/vertical)
- Fullscreen mode (F11)

### File I/O

| Format | Import | Export |
|--------|--------|--------|
| PNG | Yes | Yes |
| JPEG | Yes | Yes (quality slider) |
| WebP | Yes | Yes (quality slider) |
| SVG | Yes | Yes |
| PDF | — | Yes |
| PSD | Yes (layers preserved) | — |
| Project JSON | Yes | Yes (full state save/restore) |

Export settings dialog with format selection, quality slider, scale (0.25x–2x), transparent background option, and live file size estimation.

### Animation Timeline

- Frame-based animation with visual thumbnails
- Transport controls: previous, play/pause, next
- Add, duplicate, and delete frames
- Configurable FPS (1–60)
- Export as PNG spritesheet with auto-layout grid
- Frame selection loads state back onto canvas

### Action / Macro System

- Record button captures every canvas action
- Playback executes recorded steps sequentially
- Save macros as JSON, load from file
- Visual recording indicator

### Additional Features

| Feature | Description |
|---------|-------------|
| **Command Palette** | Ctrl+K spotlight search across 100+ commands with fuzzy matching |
| **Context Menu** | Right-click for dynamic actions based on selection state |
| **Align & Distribute** | 6 alignment + 2 distribution modes for multi-object layouts |
| **Free Transform** | Scale, rotate, skew with interactive handles |
| **Perspective Transform** | 4-corner perspective warp for images |
| **Liquify** | Full-screen editor: Forward Warp, Bloat, Pucker, Twirl CW/CCW |
| **Curved Text** | Text along circular arc with radius, angle, size controls |
| **Watermark** | Custom text watermarks with tiling option |
| **Histogram** | Live histogram panel with L/R/G/B channel selection |
| **HSB Color Wheel** | Visual color picker with hue ring and saturation/brightness square |
| **Color Palettes** | 24 default colors + save/export/import custom palettes |
| **Templates** | 16 canvas presets (social media, print, web, display) |
| **Themes** | Dark (default), Midnight, OLED Black |
| **Clipboard Paste** | Ctrl+V to paste images from system clipboard |
| **File Dropzone** | Drag and drop files anywhere on the window |
| **AI Background Removal** | One-click subject isolation via remove.bg API |
| **PWA** | Installable as a desktop app with offline support |
| **Plugin API** | `registerPlugin({ name, init })` for custom extensions |

## How It Works

```
┌──────────────────────────────────────────────────────────┐
│                    OpenShop v0.10.0                       │
│                  Single HTML File (338K)                  │
├──────────┬───────────────┬───────────────┬───────────────┤
│  Toolbar │  Canvas Area  │  Right Panels │  Status Bar   │
│  33 Tools│  Fabric.js    │  Layers       │  Zoom / Info  │
│  Grouped │  Canvas API   │  Adjustments  │  Tool Display │
│  Flyouts │  WebGL        │  Histogram    │  Dimensions   │
│          │               │  Navigator    │               │
│          │               │  Palettes     │               │
│          │               │  History      │               │
│          │               │  Info         │               │
├──────────┴───────────────┴───────────────┴───────────────┤
│                      Menu Bar                             │
│  File │ Edit │ Image │ Layer │ Select │ Filter │ View    │
├──────────────────────────────────────────────────────────┤
│  Dependencies: Fabric.js 5.x (loaded from CDN)          │
│  Storage: localStorage (palettes, preferences)           │
│  Offline: Service Worker + Web App Manifest              │
└──────────────────────────────────────────────────────────┘
```

All pixel manipulation (filters, retouching, adjustments) operates on image object data via offscreen canvases, commits changes back to Fabric objects, and records to the undo history. The layer system wraps Fabric.js object groups with metadata for visibility, opacity, blend modes, masks, and styles.

## Configuration

### Preferences (Edit > Preferences)

| Setting | Default | Description |
|---------|---------|-------------|
| Default Canvas Width | 1920 | New document width in pixels |
| Default Canvas Height | 1080 | New document height in pixels |
| Grid Size | 20 | Grid spacing in pixels |
| Snap Tolerance | 5 | Snap distance in pixels |
| History States | 60 | Maximum undo steps |
| Accent Color | `#6c8cff` | UI accent color |

### Themes (View > Theme)

| Theme | Background | Accent | Best For |
|-------|-----------|--------|----------|
| **Dark** | `#0d1117` | `#6c8cff` | General use |
| **Midnight** | `#0a0e1a` | `#7c9cff` | Late night editing |
| **OLED** | `#000000` | `#6c8cff` | OLED displays, battery saving |

## Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 90+ | Full support |
| Firefox | 90+ | Full support |
| Edge | 90+ | Full support |
| Safari | 15+ | Supported (no File Handling API) |

Requires a modern browser with ES6+, Canvas API, and Blob support. PWA installation requires HTTPS or localhost.

## FAQ

**Q: How do I access grouped tools?**
Long-press or right-click any tool with a small triangle indicator in the bottom-right corner. The flyout panel shows all tools in that group. Selecting a tool swaps it into the visible position.

**Q: Can I use this offline?**
Yes. Serve it from localhost or any HTTPS host once to install the service worker, then it works fully offline. The only online dependency is the Fabric.js CDN load on first visit.

**Q: How do I use the crop aspect ratio lock?**
Select the Crop tool, then choose a ratio from the dropdown in the tool options bar. The crop box will enforce that ratio when resizing via handles. Use the swap button (⇆) to toggle between landscape and portrait orientation.

**Q: Where are my saved palettes stored?**
In the browser's localStorage under the site origin. Export palettes as JSON to back them up.

**Q: Can I extend this with plugins?**
Yes. Use the Plugin API:
```javascript
OS.registerPlugin({
    name: 'My Plugin',
    init(app) {
        // app is the OS instance
        // Add tools, filters, panels, etc.
    }
});
```

**Q: Does PSD import preserve layers?**
Yes. OpenShop parses PSD files and imports each layer as a separate Fabric image object with name, position, and visibility preserved.

## Contributing

Issues and PRs welcome. The codebase is a single HTML file — all CSS, HTML, and JavaScript are inline for zero-build deployment.

## License

MIT License — free for personal and commercial use.
