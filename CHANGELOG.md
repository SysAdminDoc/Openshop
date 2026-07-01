# Changelog

All notable changes to Openshop will be documented in this file.

## [v0.18.13] - 2026-07-01

### Security
- Remove all inline event handlers from dynamically generated HTML (modals, layer list, color range, export settings)
- Convert modal buttons from onclick attributes to addEventListener with data-attribute delegation
- Convert layer panel visibility/lock/rename handlers from innerHTML onclick to DOM event listeners
- Convert New Image presets, Color Range controls, and Curved Text sliders to delegated event wiring
- Add global data-modal-close and data-suffix delegation handlers for modal buttons and range labels

### Added
- Unit tests for project save round-trip, recovery offer/restore/discard, SVG sanitization, and PSD export structure
- Playwright mobile viewport smoke test verifying toolbar and canvas render on 375x667
- Test harness modal delegation support via installModalDelegation helper
- Responsive mobile layout: toolbar moves to bottom, right panels collapse, modals fit viewport at <768px
- Tablet breakpoint: right panels narrow to 200px at 768-1023px
- Two-finger pinch-to-zoom and pan gestures on canvas for touch devices
- Animated GIF export via on-demand gif.js with spritesheet fallback for unsupported browsers
- GIF import via WebCodecs ImageDecoder: multi-frame GIFs load into timeline with per-frame editing
- Static image fallback for single-frame GIFs and browsers without ImageDecoder support
- OKLCh color value display in the foreground color panel alongside hex values
- sRGB to OKLab/OKLCh conversion computed inline using the Oklab specification matrix transforms
- i18n infrastructure: automatic DOM text discovery via _initI18n(), locale map with _t() lookup, setLocale() for switching
- Language selector in Preferences dialog (English default, extensible for community translations)
- 28 common toast messages converted to _t() locale-aware lookup (project, undo, filters, adjustments)

## [v0.18.12] - 2026-06-28

### Added
- Add Recovery Storage UI with autosave age, size, quota, restore, export, and discard actions
- Detect corrupt autosave data and block restore while preserving export/discard options
- Add unit coverage for recovery status rendering and sanitized restore flow

## [v0.18.11] - 2026-06-28

### Security
- Add central import schema and resource-budget helpers for project JSON, palettes, presets, and images
- Clamp project dimensions/object counts, image dimensions/file sizes, palette colors, preset counts, and adjustment ranges through shared validators
- Add unit coverage for hostile project, palette, preset, and image import fixtures

## [v0.18.10] - 2026-06-28

### Security
- Add PSD header and structure preflight before bitmap decode
- Enforce PSD file size, dimension, pixel, layer count, bit-depth, and color-mode budgets
- Parse PSD structure in a worker when available, with main-thread fallback and unit coverage for oversized fixtures

## [v0.18.9] - 2026-06-28

### Security
- Render command palette, context menu, sticky notes, animation frame labels, macro steps, AI progress titles, and save-preset modals through DOM APIs
- Remove runtime inline handlers from those generated UI surfaces
- Add malicious fixture coverage for dynamic UI renderers

## [v0.18.8] - 2026-06-28

### Security
- Replace worker filter source-string execution with a named operation registry
- Remove `unsafe-eval` from the document CSP while preserving Photon fallback behavior
- Add regression coverage for op-based worker payloads and CSP string-execution guards

## [v0.18.7] - 2026-06-28

### Security
- Render recent files, templates, saved palettes, and photo presets through DOM APIs instead of persisted-data `innerHTML`
- Validate saved/imported palette colors as hex colors and normalize imported preset names/adjustment values
- Add unit and Playwright malicious fixture coverage for recent, palette, and preset rendering

## [v0.18.6] - 2026-06-28

### Added
- Hidden canvas accessibility tree mirroring current tool, active layer, object count, selection state, and layer list for screen readers
- Polite canvas live region for status/action announcements, plus `aria-roledescription` and state-rich canvas labels
- Unit and Playwright coverage for assistive-technology state mirroring

## [v0.18.5] - 2026-06-27

### Added
- AI Segment Select tool with click-to-mask pixel selections using pinned `Xenova/detr-resnet-50-panoptic`
- Unit and Playwright coverage for mocked panoptic segmentation result routing into the existing pixel-selection mask path

### Changed
- README AI docs now distinguish the supported Transformers.js panoptic segmentation workflow from unsupported SAM-style mask-generation

## [v0.18.4] - 2026-06-27

### Added
- Optional Photon WASM filter backend loaded on demand from jsDelivr for supported pixel filters
- JS worker fallback path when Photon/WASM loading fails or an operation is unsupported
- Unit coverage for Photon preference, fallback disablement, and direct filter routing

### Fixed
- Command palette direct color filters now route to `applyFilterDirect()` instead of the missing `applyFilter()` helper

## [v0.18.3] - 2026-06-27

### Added
- Vitest + Playwright testing foundation with unit coverage for tool switching, layer add/delete, undo/redo, PNG export naming, and keyboard shortcuts
- Playwright browser smoke test with editor-shell screenshot comparison

### Changed
- Document contributor-only test commands while keeping the shipped app as a single HTML file

## [v0.18.2] - 2026-06-15

### Security
- Pin AI model revisions to immutable commit SHAs instead of mutable 'main' branch refs

### Changed
- PSD export: File → Export As → PSD writes layered .psd files via ag-psd writePsd() (layers, opacity, visibility preserved)
- CDN resources pre-cached via Cache API for offline capability (Fabric.js, ag-psd, jsPDF, fonts)
- Filter Worker redesigned as generic function executor — any filter can now run off-thread
- Posterize, Threshold, Vignette, Edge Detect filters moved to Web Worker (joins Oil Paint, Tilt Shift, Unsharp Mask)
- Upgrade Transformers.js from 3.3.3 to 4.0.0 (WebGPU C++ runtime, image segmentation support, esbuild bundles)
- Minimap updates are now event-driven (on canvas change/zoom) instead of polling every 2 seconds

### Fixed
- OPFS auto-save now works on Safari via Worker + createSyncAccessHandle() fallback (createWritable() not supported in Safari)
- Auto-save dirty flag wired up — no longer serializes entire canvas every 30 seconds when nothing changed
- Manual project save now clears auto-save data to avoid stale recovery prompts
- Global error/unhandledrejection handlers surface silent failures as user-visible toasts

## [v0.18.1] - 2026-06-15

### Security
- Upgrade jsPDF from 2.5.1 to 4.2.1 to patch CVE-2026-25755 (PDF object injection)
- Mitigate Fabric.js CVE-2026-27013/CVE-2026-44311: sanitize SVG export output and strip XSS vectors from project JSON on load
- Pin Transformers.js AI model revisions via _modelRevisions map to prevent supply-chain poisoning
- Add SRI integrity hashes to all CDN-loaded scripts (fabric.js, ag-psd, jsPDF)
- Fix ag-psd CDN reference (v22.2.0 does not exist; corrected to v22.0.2)
- Sanitize PSD layer names in layer panel to prevent HTML injection via crafted PSD files
- Add HTML escape helper (`_esc()`) for all user-supplied strings in innerHTML contexts

### Added
- Auto-save project state to OPFS every 30 seconds with crash recovery prompt on reload
- One-click Auto Enhance (auto-levels + vibrance + contrast + sharpening) via Image menu and command palette
- Photo Presets system: 8 built-in presets (Warm Glow, Cool Tone, Vintage, Vivid, Dramatic, Pastel, B&W High Contrast, Golden Hour) with JSON import/export and custom preset saving
- Symmetry tool: horizontal, vertical, both-axes, and radial (6-fold) mirroring for brush strokes (View menu)
- EyeDropper API integration: system-wide color picking on Chrome/Edge, canvas fallback on other browsers
- File System Access API: native save/open dialogs on Chrome/Edge with graceful fallback to download/file-input
- Web Worker filter pipeline for Oil Paint, Tilt Shift, and Unsharp Mask — UI stays responsive during heavy filters
- Content Security Policy meta tag restricting script/style/connect sources
- ARIA accessibility: roles, labels, live regions on all major UI elements (menubar, toolbar, panels, canvas, dialogs, toasts, layers, history)
- Keyboard activation (Enter/Space) for all tool buttons; tabindex on toolbar
- .psd added to PWA file_handlers manifest

### Fixed
- Version string mismatch: saveProject() now writes v0.18.0 (was hardcoded to v0.16.0)
- Sync version references across README.md and CHANGELOG.md
- PWA service worker: removed broken blob-URL registration (browsers reject it)
- Replace all 15 empty catch blocks with appropriate console.warn/debug logging

## [v0.16.0] - %Y->- (HEAD -> main, origin/main, origin/HEAD)

- docs: add Related Tools cross-reference to PyShop
- Added: Add web link to Quick Start section
- Added: Add files via upload
- Changed: Update README.md
- Added: Add files via upload
- Changed: Update README.md
- Added: Add files via upload
- Added: Add files via upload
- Added: Add files via upload
