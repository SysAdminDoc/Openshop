# Changelog

All notable changes to Openshop will be documented in this file.

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
- Sync version references across README.md, CLAUDE.md, and CHANGELOG.md
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
