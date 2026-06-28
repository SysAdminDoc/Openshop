# Research - OpenShop

## Executive Summary
OpenShop is a MIT-licensed, single-file browser image editor built around Fabric.js, client-side ML, layered canvas editing, PSD import/export, local autosave, and zero-account distribution. Its strongest current shape is the privacy-first Photoshop-style workflow in one static `index.html`; the highest-value direction is to preserve that distribution model while hardening untrusted inputs, reducing CSP exceptions, and making pro-format/recovery behavior verifiable. Priority opportunities: remove inline-event and `unsafe-eval` dependencies, preflight PSD/project/image imports before decoding, move worker filters from string execution to named operations, expand regression coverage for autosave/PSD/export/security paths, add a storage/recovery management surface, and keep format work aligned with existing SVG/PDF/GIF/mask/color roadmap items.

## Product Map
- Core workflows: create/open image or PSD, edit with layers/selections/filters/tools, use local ML features, autosave/recover, export PNG/JPEG/WebP/SVG/PDF/PSD/project JSON.
- User personas: privacy-conscious image editors, students learning layered editing, developers/self-hosters who need a static editor, lightweight design users who want no account or install.
- Platforms and distribution: static browser app, GitHub Pages/self-hosted/downloadable HTML, PWA manifest and Cache API precache, Chrome/Edge File System Access enhancement with fallback elsewhere.
- Key integrations and data flows: CDN Fabric.js/ag-psd/jsPDF/Photon/Transformers.js, Hugging Face model downloads, localStorage palettes/presets/recent files, OPFS autosave, canvas/Blob exports.

## Competitive Landscape
- Photopea: best browser parity for PSD, vectors, actions, scripts, color spaces, and plugin/API embedding. Learn from its scripting/plugin and file-format depth; avoid ad/account/server assumptions that weaken OpenShop's local-first promise.
- miniPaint: closest open browser editor with layers, broad import/export, translations, clipboard/URL open paths, animated GIF, and no server upload. Learn from its practical format breadth and i18n; avoid letting features sprawl without pro-layer fidelity.
- JS Paint: strongest accessibility and alternative-input signal among OSS canvas editors, including enlarged UI, dwell clicker, speech recognition, nonlinear history, palette formats, and system hooks. Learn from accessibility modes and storage management; avoid its intentionally retro workflow as a product direction.
- Toast UI Image Editor: embeddable component with documented APIs, themes, mask/filter basics, and framework wrappers. Learn from clear integration boundaries; avoid framework migration that breaks OpenShop's single-file delivery.
- ag-psd: current PSD foundation supports read/write and worker examples, but documents serious memory/DoS constraints for untrusted PSDs. Learn from its `useRawData` preflight guidance; avoid decoding arbitrary layer bitmaps on the main thread.
- Photon: useful WASM accelerator with many filters and native/web targets. Learn from operation-level acceleration; avoid making optional WASM required for baseline editing.
- Fabric.js 7.x: current upstream is typed/modular and has Promise-era APIs. Learn from the migration path already on the roadmap; avoid a rushed upgrade without a golden-file browser regression suite.
- Canva/Pixlr-style commercial editors: strong discoverability, templates, and generative workflows. Learn from contextual task surfacing; avoid account-gated or server-required features.

## Security, Privacy, and Reliability
- CSP is weaker than it should be for a local-first app: `index.html:12` allows `unsafe-inline` and `unsafe-eval`, while much of the UI uses inline `onclick` handlers and the filter worker uses `new Function()` at `index.html:4943`.
- Persisted UI data is not consistently validated before rendering: recent filenames from localStorage are injected into `innerHTML` at `index.html:3597`; saved palette colors imported from JSON are inserted into style/onclick/title attributes at `index.html:5903`; imported preset names are escaped, but adjustment values are not schema-clamped before pixel loops at `index.html:7553`.
- PSD import decodes user-provided files in the foreground path starting at `index.html:1744`; ag-psd's own production guidance recommends raw-data parsing, dimension/layer limits, queueing, and worker/process isolation for untrusted PSDs.
- Project JSON import sanitizes object text and URLs, but there is no explicit project size/version/migration gate before `canvas.loadFromJSON()` at `index.html:1726`.
- Autosave and recovery exist, but there is no visible storage manager, quota status, recovery export, or corrupt-recovery quarantine path; failures mostly surface as toasts/console messages.
- `npm audit --json` reported zero vulnerabilities for the local contributor toolchain; current risk is mainly shipped browser surface and untrusted image/PSD/project input handling.

## Architecture Assessment
- The single `OS` object in `index.html` keeps the ship artifact simple, but security-sensitive rendering, file I/O, filters, ML, history, and UI generation are tightly coupled. Add local boundaries inside the file before larger feature work: `OS.safeDom`, `OS.importGuards`, `OS.filterOps`, `OS.storage`.
- Filter worker architecture is close to the right shape, but stringified code execution is the wrong boundary. A registry of named operations and typed params would keep worker performance while allowing CSP tightening.
- History still serializes full canvas JSON snapshots in `saveHistory()` at `index.html:3351`; existing roadmap already calls for tiled/delta undo, so new work should add memory-pressure instrumentation and tests rather than duplicate that item.
- Format work is moving fast but under-tested: unit/e2e coverage currently exercises core tools, one direct filter, and Segment Select, but not PSD round-trip, project migration, autosave recovery, palette/preset import, SVG sanitization, or export dimensions.
- Mobile is documented as functional but desktop-recommended; no Playwright mobile viewport test currently protects toolbar/panel overflow, touch gestures, or file/recovery dialogs.
- Documentation is mostly synchronized at v0.18.5; the existing ROADMAP already covers SVG/PDF/GIF imports, adjustment layers, masks, smart objects, vector shapes, color management, plugin API, i18n, accessibility mirror DOM, Fabric migration, and worker render pipeline.

## Rejected Ideas
- Server-side image processing - Pixlr/Canva pattern - conflicts with local-first privacy and no-server distribution.
- Full React/Vue/Svelte rewrite - Toast UI ecosystem pattern - contradicts the stated single-file architecture and adds build maintenance without solving current trust gaps.
- Real-time multi-user editing - JS Paint experiment - high architectural risk and lower priority than single-user data safety.
- CMYK-first editing mode - Photopea/Krita parity - too large for the current Fabric/canvas pipeline; keep ICC/color-profile work already on the roadmap first.
- Unpinned third-party plugin marketplace - Photopea plugin/API signal - useful later, but unsafe before CSP and plugin sandbox boundaries exist.
- WebGPU filter engine from scratch - standards/blog signal - too much maintenance versus extending Photon/worker operations and existing Fabric filters.
- Account-based cloud templates/assets - commercial competitor pattern - weak fit for zero-signup, self-hostable OpenShop.

## Sources
Competitive:
- https://www.photopea.com/learn/
- https://www.photopea.com/api/
- https://github.com/viliusle/miniPaint
- https://github.com/1j01/jspaint
- https://github.com/nhn/tui.image-editor
- https://github.com/imgly/pesdk-html5-build
- https://www.canva.com/accessibility/
- https://pixlr.com/

Dependencies:
- https://github.com/Agamnentzar/ag-psd
- https://www.npmjs.com/package/ag-psd
- https://github.com/fabricjs/fabric.js
- https://fabricjs.com/docs/upgrading/upgrading-to-fabric-60/
- https://fabricjs.com/docs/upgrading/upgrading-to-fabric-70/
- https://github.com/silvia-odwyer/photon
- https://www.npmjs.com/package/@huggingface/transformers
- https://huggingface.co/docs/transformers.js

Web APIs and Standards:
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- https://www.w3.org/TR/WCAG22/
- https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API

Project:
- https://github.com/SysAdminDoc/Openshop
- https://sysadmindoc.github.io/Openshop/

## Open Questions
None block prioritization for the next implementation pass.
