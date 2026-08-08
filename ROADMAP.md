# OpenShop Roadmap

Single-file browser image editor with layers, PSD import, and client-side AI. Roadmap targets staying turnkey while expanding pro-grade editing and export fidelity.

The complete live-Photoshop parity work breakdown is in
PHOTOSHOP_PARITY_ROADMAP.md. It is derived from the Photoshop CS6 audit under
windows-app-audit and is the implementation sequence for the audited shell, tools,
menus, panels, document semantics, accessibility, persistence, performance, and
testing gates. Note (2026-08-04): that breakdown is marked fully drained, but
`_toolCatalog` rows carry `auditStatus:'VISUALLY_INSPECTED'`, which means the
button was looked at — not that the tool works. See P0 below.

## P0 — the e2e suite is red at HEAD (found 2026-08-08)

The Chromium suite had **10 failures at the v0.29.0 tree** before any of today's work.
Four are fixed; the seven below are open. None of them was caught before shipping,
which is the more interesting problem: a release went out on a red suite.

| # | Test | What it reports |
|---|------|-----------------|
| 1 | `offline.e2e` — declares supported file handlers and consumes a queued project launch | Two layers. The test predated the blank-workspace change and captured state with no document open (fixed 2026-08-08 — it creates one first). The real defect is underneath: with a document present the queued `.openshop` launch is still never consumed, so `window.__openshopLaunchConsumer` accepts the file and nothing loads. Start at the consumer, not the capture. |
| 2 | `records validated commands and replays mixed edits as one atomic action` | Replay produces one entry more/less than the recording. Command-registry regression, likely from the tool-registry rebuild. |
| 3 | `resolves one mobile layout rather than two blocks that fight each other` | Two competing layout blocks resolve at mobile width. |
| 4 | `keeps one tablet block with the winning panel width` | Same class of defect at tablet width. |
| 5 | `flags untranslated interface strings through the pseudo-locale` | The audited Photoshop tool inventory added ~40 new DOM strings (`Marquee: Rectangular Marquee Tool`, `Move: Move Tool`, …) with no `zh` entries. **Needs a native speaker** — mechanically-added `zh` strings are already flagged as debt in CLAUDE.md, so do not bulk-translate these. Better fix: build the family tooltip from translated parts so the composite never becomes its own key. |
| 6 | `runs the Photon WASM backend for real on the operation it is allowed` | Photon parity check fails on the one allowlisted op. |
| 7 | `registers a sandbox plugin and lets it contribute a command` | `Plugin handshake timed out` — the sandboxed-iframe plugin bridge never completes. |

Fixed on 2026-08-08 and kept here only as the record: WCAG contrast on the selected
bottom tab (4.01:1 → passing), two pointer targets under the 24×24 floor
(`#workspace-selector`, `#tool-options-reset`), and the tool-family face never showing
its active state because `setTool` looked only for the portalled flyout while the
flyout was still nested at that point in boot.

## Planned Features

### Format & I/O
### Editor Core

### AI / ML (Transformers.js)

### Performance

## Competitive Research
- **Photopea** — closest peer; strong PSD parity and SVG editing. Lesson: invest in SVG-as-layers and smart-object fidelity.
- **Pixlr E / X** — cloud-assisted AI generative workflows; forces account gating. Lesson: keep AI local, make it the differentiator. (2026-08-04: verified — Pixlr meters AI at 80/1,000/10,000/20,000 credits per tier. Local inference is the single largest structural advantage OpenShop has and the README undersells it.)
- **miniPaint** — tiny single-file editor, weak on layers/AI. Lesson: OpenShop's AI + PSD import + single-file combo is a real gap they leave open. (2026-08-04: miniPaint is now effectively dormant — 4 commits since 2025-01-01; its open issues are OpenShop's shipped feature list.)
- **Krita (desktop)** — best-in-class brush engine and color management. Lesson: borrow the brush preset format, borrow ICC profile handling for print users. (2026-08-04: Krita 5.3 shipped a complete text-engine rewrite — on-canvas editing, full OpenType, text flowing into shapes, glyph palette for CJK alternates, PSD text objects — plus a much faster liquify. Text is the newer lesson.)
- **Graphite** (26.7k★, Apache-2.0, added 2026-07-31) — Rust/`wgpu` node-graph editor, the only genuine leapfrog threat. Lesson: the layer panel can be a *projection of a node graph*, and undo can be a graph diff instead of a pixel snapshot. Counter-lesson: they have deferred raster/photo tooling to Beta 2 and PSD to LTS, so the "parametric photo editor with PSD round-trip" intersection is currently unoccupied by anyone. (2026-08-04: still no tagged stable release since 2022-02-04; their top-voted issues are desktop packaging, which `file://` already solves.)
- **Photopea has shipped nothing since 5.6 (Sep 2024)** — verified 2026-07-31, blog dormant ~22 months. The free incumbent has stalled; its users' loudest complaints (ads eating canvas width, anti-adblock lockout, COPPA-driven school bans) are all things OpenShop already avoids by construction and never advertises. (2026-08-04: re-verified, ≥21 months with no announced release. HN names its professional gaps precisely — no colour profiles, no GPU acceleration for large PSDs, no camera RAW, weak healing, no plugins. OpenShop already has RAW and plugins; colour management and healing are the two remaining.)
- **Penpot / Excalidraw** (added 2026-08-04) — the #1 open issue in a 58k★ design tool is *image cropping*; Excalidraw's #2 and #3 are per-range text formatting inside one text element. Design tools structurally under-serve raster and rich text, and both features are cheap here.

## Nice-to-Haves

## Open-Source Research (Round 2)

### Related OSS Projects
- https://github.com/viliusle/miniPaint — Single-file browser image editor, layers/filters, closest conceptual peer. MIT.
- https://github.com/nhn/tui.image-editor — NHN Cloud Canvas editor, React/Vue wrappers, rich filter set. (2026-08-04: dead — last commit 2023-11-20, 289 open issues. Do not study further.)
- https://github.com/igorski/bitmappery — Vue/Vuex non-destructive web photo editor with PSD I/O. (2026-08-04: 1.2.0 added undo/redo history preserved across multiple open documents — the one idea still worth taking.)
- https://github.com/OliverBalfour/SimplePaint — HTML5 canvas editor with stylus/tablet support and Photoshop-style brushes.
- https://github.com/geeeeeeeek/freePS — Single-file HTML5 layer-based editor.
- https://github.com/mattketmo/darkroomjs — Fabric.js-backed pluggable image editor core.
- https://github.com/aurbano/nuophoto — Minimal browser editor, good reference for small-footprint adjustments.
- https://github.com/excalidraw/excalidraw — Not a raster editor but best-in-class canvas interaction patterns.
- https://github.com/steffest/DPaint-js — Zero-dependency, no-build-step ES6 editor with indexed-palette dithering and colour cycling (added 2026-08-04).

### Features to Borrow
- Tablet/stylus pressure curves + Photoshop-style custom brush dynamics (SimplePaint). (2026-08-04: pressure and ABR stamps shipped; tilt/azimuth and full-rate sampling are not — see P2 below.)
- Full-featured filter set: grayscale, emboss, tint, multiply, blend modes w/ WebGL (tui.image-editor). (2026-08-04: filter set shipped; GPU acceleration covers exactly one operation — see P2.)
- Complete UI/canvas-text localization and RTL behavior (BitMappery/miniPaint) — the shipped locale map is only partial. (2026-08-04: still open and larger than recorded — 365 toast call sites, essentially none translated. Superseded by the P2 localization item below.)
- Clipboard paste + URL/data-URL/drag-drop open paths (miniPaint). (2026-08-04: paste-in and drop shipped; copy-*out* does not exist — see P1.)

### Patterns & Architectures Worth Studying
- **Fabric.js canvas abstraction** (DarkroomJS) — sprite/object model for non-destructive transforms vs raw ImageData. (2026-08-04: adopted, but through a v5-shaped compatibility shim at `index.html:30-70` — see P2.)
- **OffscreenCanvas + Worker filter pipeline** (tui.image-editor) — keeps >4K images responsive. (2026-08-04: still open — `transferControlToOffscreen` is never called. Superseded by the P2 OffscreenCanvas item below.)
- **Plugin registration API** (DarkroomJS) — each tool is `plugin.register(editor)` with lifecycle hooks. (2026-08-04: superseded by the shipped sandboxed protocol; mirror Photoshop UXP's permission vocabulary rather than DarkroomJS's.)
- **WebGL shader-based color adjustments** (BitMappery) — real-time sliders without CPU re-composite. (2026-08-04: still open — superseded by the P2 acceleration-allowlist item below, which is gated on the existing parity harness rather than adding a second unverified backend.)

## Research-Driven Additions

### P0 — Release and trust

- [ ] P0 — Make the coverage gate measure the shipped file
  Why: the release gate enforces 80/70/85/80 thresholds against 189 lines of test harness; V8 attributes nothing to `index.html`, so the gate is structurally incapable of failing on app code.
  Evidence: `tests/os-harness.js:9-24` extracts the `const OS = {` block as a string and evaluates it with `new Function`; `coverage/coverage-summary.json` lists only `os-harness.js` and `tools/security.mjs`; thresholds at `vitest.config.js:12-19`; `test:coverage` is chained into `test:release` in `package.json`.
  Touches: `tests/os-harness.js`, `vitest.config.js`, `package.json`.
  Acceptance: coverage output attributes lines to `index.html` (e.g. by writing the extracted script to a temp `.js` with a source map back to the inline block, or by loading the real page under a browser coverage provider); thresholds are re-baselined against measured app coverage; deleting a covered method drops the number.
  Complexity: L

- [ ] P0 — Make the performance gate exercise the application
  Why: the gate never loads `index.html`. It benchmarks fabricated typed-array loops, "export" is `surface.slice()`, `staleResult` returns `1 !== 2`, `executionPaths` is hard-coded, and `cancellation.observed` is derived from the operation's own name. Budgets are 5,000-60,000 ms p95 against measured values of 8-175 ms — 300-3000× headroom.
  Evidence: `tools/performance-budget.mjs:43-119` (`runOperation`), `:90` (export), `:101-117` (cancel/staleResult), `:138-146` (hard-coded `executionPaths`, name-derived assertions), `:12-22` (budgets).
  Touches: `tools/performance-budget.mjs`, `package.json` (`test:perf`), possibly a Playwright-driven variant.
  Acceptance: each probe drives a real `OS` operation on a real document (Playwright or the harness), budgets are re-baselined to measured p95 with a defined multiplier, `executionPaths` reflects the backend actually taken, and an artificially slowed filter fails the gate.
  Complexity: L

- [ ] P0 — Resolve the `frame-ancestors` contradiction
  Why: two problems at once. CSP3 requires `frame-ancestors`, `report-uri` and `sandbox` to be ignored in a `<meta>` policy, and both CSPs are meta-only — so the declared clickjacking protection does not exist, and `tools/security.mjs` requires the inert form, printing "Security contract OK" for a control the browser discards. Worse, the declared value is `'none'`, which is *incompatible with the shipped embedding contract*: README documents hosting OpenShop in a host-page iframe over a versioned `postMessage` handshake, so a deployment that correctly promotes the policy to a response header would break embedding outright. The policy states an intent the product does not have.
  Evidence: `index.html:12` and `plugin-sandbox.html:5` (meta-only delivery, `frame-ancestors 'none'`); `tools/security.mjs:24-27` (`REQUIRED_POLICY_DIRECTIVES` includes `['frame-ancestors', ["'none'"]]`); README "Embedding OpenShop" and the embed handshake at `index.html:14086+`; https://www.w3.org/TR/CSP3/#directive-frame-ancestors
  Touches: `index.html`, `plugin-sandbox.html`, `tools/security.mjs`, `README.md` (Security and Embedding sections), the self-hosting recipe.
  Acceptance: the checker classifies directives by delivery channel and refuses to count a header-only directive as satisfied by a meta policy; the shipped meta policy no longer declares `frame-ancestors`; the self-hosting recipe documents the header form with a deployment-chosen ancestor list (not `'none'`, which would disable embedding) and says which lane needs which; the `file://`/meta-only lane relies on the existing window-binding handshake as the real guard, documented as such; a test asserts the checker fails when a meta policy claims a header-only directive.
  Complexity: M

### P1 — Trust, accessibility, and interoperability

- [ ] P1 — Copy and Cut pixel selections, and write to the system clipboard
  Why: `_copySelection` only clones an active Fabric object into an internal `_clipboard`. With a marquee selection on a raster layer it reports "Nothing selected", and nothing OpenShop copies ever reaches the OS clipboard — you can paste an image *in* but cannot paste a selection *out* into any other application. Pixels can already be deleted through a selection, so the asymmetry is in Copy alone.
  Evidence: `index.html:21314-21323` (`_copySelection`/`_cutSelection`), `21325-21343` (`_pasteSelection`), `20430-20445` (paste-in works), `_deleteSelectionPixels` at `21390+`; `navigator.clipboard` appears once, at `7890`, for text. `Clipboard.write()` with `image/png` is Baseline 2024 (MDN).
  Touches: `index.html` `_copySelection`, `_cutSelection`, `copyObj`, the Edit menu and context menus, `_readDocumentImageData`.
  Acceptance: with a pixel selection active, Copy extracts the selected region of the active raster layer, Cut clears it through the existing history transaction, and both write a PNG `ClipboardItem` when `navigator.clipboard.write` exists; a browser that refuses reports it rather than failing silently; paste-back into OpenShop and into a second application both work.
  Complexity: M

- [ ] P1 — Resolve keyboard shortcuts by physical key
  Why: every shortcut goes through `e.key.toLowerCase()`. Under Cyrillic, Greek, Hebrew, Arabic or Thai layouts `e.key` is a non-Latin character, so the entire advertised "Photoshop-style shortcut set (40+ bindings)" — including Ctrl+Z, Ctrl+S and every single-letter tool key — is unreachable. Dvorak and Colemak shift it rather than break it. The project ships a `zh` locale and asks for more.
  Evidence: `index.html:21163`, `21213`, `21287`; zero occurrences of `e.code`; https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
  Touches: `index.html` global keydown handler, shortcut tables, the shortcut labels in menus and the command palette.
  Acceptance: shortcuts match on `event.code` for letter/digit keys with `event.key` retained for punctuation and layout-specific keys; displayed labels use `navigator.keyboard.getLayoutMap()` where available and the US label otherwise; a Playwright test dispatching `KeyboardEvent` with a Cyrillic `key` and a Latin `code` selects the right tool.
  Complexity: M

- [ ] P1 — Remove the Google Fonts dependency
  Why: a blocking `<link rel="stylesheet">` to `fonts.googleapis.com` runs on every page view, with `fonts.gstatic.com` in `font-src`. It contradicts the "Nothing sent" privacy position that the status bar advertises, it is the first thing the network ledger records, it fails on the `file://` cold-offline lane (silently falling back to system fonts), and LG München 3 O 17493/20 awarded damages against a site operator for exactly this transfer.
  Evidence: `index.html:299-300`, CSP `style-src`/`font-src` at `index.html:12`, README "Privacy and Network Use" table; https://gdprhub.eu/index.php?section=3&title=LG_M%C3%BCnchen_-_3_O_17493%2F20
  Touches: `index.html` head, `<style>` font stacks, CSP meta, `sw.js` cache allowlist, `tools/runtime-assets.mjs`, README privacy table.
  Acceptance: no request to any Google host on load; either subsetted WOFF2 data URIs or a documented system font stack; `style-src` drops the external host and `font-src` becomes `'self' data:`; the ledger reads `Nothing sent` after a cold hosted load; `security:check` passes with the tightened policy.
  Complexity: M

- [ ] P1 — Give preferences a migration path, an export, and a reset
  Why: any future `version !== 1` silently discards every stored preference with no notice and no backup, there is no way to move settings between machines or browser profiles, and there is no recovery from a corrupted preference set short of clearing site data. The document format already has a migration registry; preferences do not.
  Evidence: `index.html:18135` (`if (!stored || stored.version !== 1) return;`); `showExportSettings` at `19146` is the image export dialog, unrelated; no `resetPrefs`/`restoreDefaults` exists.
  Touches: `index.html` preference load/save, the Preferences dialog, the command palette.
  Acceptance: a preference migration registry mirroring the document one runs before use and preserves unknown keys; Export/Import Settings writes and reads one JSON bundle covering prefs, palettes, brushes, gradients, presets, theme and language, validated against the existing import budgets; Reset to Defaults is available and confirms once; a test round-trips a v1 bundle through a synthetic v2 migration.
  Complexity: M

- [ ] P1 — Probe the real canvas ceiling before accepting a document
  Why: the import limit is 80 Mpx and `maxDimension` is 30,000, and the release performance gate certifies 8K (33 Mpx). WebKit caps total canvas area at 16,777,216 pixels and iOS additionally caps canvas memory. Exceeding a canvas limit produces a blank surface with no exception, so the failure mode is a silently empty document.
  Evidence: `index.html:4369` (`maxImagePixels: 80 * 1000 * 1000`), `4366-4380` (`_importLimits`), `8115-8118` (PSD limits, `maxDimension: 30000`), README performance-budget section; no occurrence of `16384`/`32767` or any probe.
  Touches: `index.html` `_importLimits`, New Image validation, PSD/PDF/RAW import preflight, the compatibility report.
  Acceptance: a cached startup probe binary-searches the engine's real maximum area and dimension; import and New Image clamp to it and explain the clamp by name; a document that would exceed it is refused with the measured ceiling in the message rather than opening blank; WebKit and mobile Playwright projects assert the refusal.
  Complexity: M

- [ ] P1 — Enforce Trusted Types on the blob script loader
  Why: `blob:` in `script-src` is required by the fetch→SHA-384→`createObjectURL` loader, but it permits *any* blob-URL script, so one DOM-XSS gadget executes arbitrary code. This is the only real hole in an otherwise strong policy, and Trusted Types is now cross-browser (Chrome 83, Firefox 148, Safari 26).
  Evidence: `index.html:12` (`script-src ... blob:`), the loader at `index.html:263` and `_executeVerifiedRuntimeScript`; zero occurrences of `trustedTypes`; https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/require-trusted-types-for
  Touches: `index.html` CSP meta and boot loader, `plugin-sandbox.html`, `tools/security.mjs`, README security section.
  Acceptance: a single named policy mints every script URL; `require-trusted-types-for 'script'; trusted-types openshop-loader` ships report-only first and then enforcing; `security:check` fails if a second policy name or a bare `createObjectURL`-to-script path appears; boot still succeeds on Firefox and WebKit, which is what the cross-browser projects prove.
  Complexity: M

- [ ] P1 — Reflect command enablement in the menus
  Why: `getCommandState` computes `blocked` correctly, but nothing in the menu bar consumes it. With no document open the entire File/Edit/Select/Image/Filter/AI/View menu is presented as available; `aria-disabled` is set in only three places, none of them menu items.
  Evidence: `index.html:12370-12396` (`getCommandState`), `12374-12376` (`blocked`), `aria-disabled` only at `4516-4517`, `10223`, `10228`, `13205`; 306 `data-os-click` actions with no disabled state.
  Touches: `index.html` menu rendering, `.dd-item` construction, the `data-os-*` dispatch map.
  Acceptance: dropdown items derive `disabled`/`aria-disabled` from command state on open; a disabled item is not activatable by pointer or keyboard and is announced as unavailable; an e2e test with no document open asserts document-scoped items are disabled and become enabled after New Image.
  Complexity: M

- [ ] P1 — Make swatch grids keyboard-operable and hit-target compliant
  Why: swatches are bare `<div>`s with click/contextmenu listeners, no `tabindex`, no `role` and no key handler — 28 default colours plus every saved palette entry are unreachable without a pointer — and `.color-swatch` is 19×19 px, under the WCAG 2.2 minimum target size, with no 44 px rule covering it.
  Evidence: `index.html:13633` (`initSwatches`), `20573-20581` (`_createPaletteSwatch`), `20611-20618` (`_renderSavedPalette`), `512` (`.color-swatch` sizing); the 44 px rules at `1331`, `1991`, `2047` cover layer items and modal buttons only.
  Touches: `index.html` swatch construction and CSS, the existing listbox keyboard pattern from the Layers panel.
  Acceptance: swatch grids are a `role="grid"`/`listbox` with roving tabindex, arrow-key navigation, Enter/Space to apply and a context-menu key path, reusing the pattern already proven in `tests/panel-keyboard.test.js`; effective target size meets 24×24 CSS px minimum with spacing exemption documented, or 44 px on the mobile workspace.
  Complexity: M

- [ ] P1 — Surface boot failure when `OS.init()` throws
  Why: the boot `try` wraps only the awaited boot promise. If `OS.init()` throws, `dataset.osBoot` is set to neither `ready` nor `failed`, the boot-status paragraph never updates, and the only feedback is a generic unhandled-rejection toast that itself depends on `OS.toast` existing. Every Playwright helper waits on `osBoot === 'ready'`, so it presents as an unrelated timeout.
  Evidence: `index.html:24666-24682`, `24663` (`unhandledrejection` handler), CLAUDE.md gotcha on asynchronous boot.
  Touches: `index.html` boot block, the boot-status element, `tests/openshop.e2e.spec.js`.
  Acceptance: any throw from `OS.init()` sets `dataset.osBoot='failed'`, renders a static failure panel naming the failing stage with a reload control, and does so without depending on `OS`; an e2e test that forces an init throw asserts the panel rather than timing out.
  Complexity: S

- [ ] P1 — Fix the plugin sandbox frame title and the stale `wand` tool id
  Why: two small defects with outsized effect. `iframe.title` interpolates an undeclared `name`, which resolves to `window.name` — every plugin frame's accessible name is wrong, and an embedding host that sets `window.name` gets that string into the DOM. The command palette lists a `wand` tool that `setTool` does not handle, so selecting it drops all tool state; the real id is `magic-wand`, and the palette also omits dodge, burn, sponge and smudge, which are implemented.
  Evidence: `index.html:24303` (`iframe.title = \`${name} plugin sandbox\``; locals are `manifest`, `capabilities`, `source`, `consentStatus`, `record`, `iframe`, `ready`, `handle`); `19566` (palette tool list contains `'wand'`), `23112` (`_selectionCombineTools` carries the same stale id), zero occurrences of `case 'wand'`.
  Touches: `index.html` `registerPlugin`, command palette tool list, `_selectionCombineTools`.
  Acceptance: the frame title uses the manifest name; the palette lists only ids `setTool` handles and includes the four missing implemented tools; the parity test from the P0 tool item covers the palette list as well as the registry.
  Complexity: S

- [ ] P1 — Give silent failures a user-visible path and a retry control
  Why: several flows fail into the console only. The auto-save recovery-discovery step is the worst: a user with recoverable work is never told the check failed. No failure path anywhere offers retry — retry currently means re-invoking the menu item or reloading.
  Evidence: `index.html:15415` (auto-save check, `console.warn` only), `11004`, `16559`, `21721` (clone/heal/retouch stroke errors), `17839` (histogram), `20512` (minimap), `14530` (embed announce), `14971` (offline status), `15092` (AI cache inventory).
  Touches: `index.html` those handlers, the toast/status-pill surface, the diagnostics ring buffer.
  Acceptance: each listed failure emits one toast or status-pill state and one diagnostics entry; the recovery, AI model load and runtime asset paths expose a Retry action that re-runs the operation without a reload; a test that forces the auto-save check to throw asserts a visible state change.
  Complexity: M

- [ ] P1 — Make offline shell promotion resumable
  Why: promotion deletes the live shell cache and then repopulates it in a loop. A service worker can be terminated at any await point, leaving a partially populated shell; status then reports `shellReady:false` and the user is stuck on "not ready offline" until a restage, with the previously working shell already gone.
  Evidence: `sw.js:194-196`, `sw.js:394-397`, `sw.js:429-443` (`statusPayload`).
  Touches: `sw.js` promotion path, shell revision bookkeeping, `tests/offline.e2e.spec.js`.
  Acceptance: promotion writes the complete new shell before any deletion (write-new, verify, atomically flip the pointer, then delete the old), or records a resume marker that the next activation completes; a test that aborts mid-promotion still starts from a verified shell.
  Complexity: M

### P2 — Performance, mobile, extensibility, and workflow depth

- [ ] P2 — Stop re-encoding the whole document on every history push
  Why: `_pushHistoryEntry` unconditionally captures every image layer at full resolution — `drawImage`, `getImageData`, then `btoa` of *every* 64×64 tile — and only then diffs base64 strings to decide what to keep. For an 8K layer that is roughly 8,100 base64 encodes per edit, including edits that touch no pixels at all (`Rename Layer`, `Layer Opacity`, `Blend:`). The tiling saved memory, not time, and this is the single largest interactive cost in the app.
  Evidence: `index.html:12906-12907` (unconditional capture), `12762-12794` (`_captureHistoryPixelSurfaces`), `12744` (`_encodeHistoryBytes`), `12784-12807` (`_historyPixelDelta`), `4318` (`_historyTileSize`), non-pixel callers at `9679`, `9696`, `9711`.
  Touches: `index.html` history capture/delta/encode path, `saveHistory` call sites.
  Acceptance: edits declare whether they touch pixels and non-pixel edits skip raster capture entirely; raster capture tracks dirty rects from the stroke/filter path and hashes tiles without base64 before encoding only changed ones; the P0 performance gate shows a measured drop on the 8K fixture and reconstruction assertions still pass in debug mode.
  Complexity: L

- [ ] P2 — Make history budgeting and undo linear
  Why: `_enforceHistoryByteBudget` loops while `historyByteSize()` re-`JSON.stringify`s all 120 entries, so a single edit near the 192 MB cap re-serialises the entire history repeatedly, and it is also called synchronously to paint the info panel. Undo replays the whole delta chain from the base state with a full tile-map clone per step, so undoing to state 0 from state 119 costs ~120 clones. There is no reverse delta and no checkpointing.
  Evidence: `index.html:12971-12980` (`historyByteSize`), `12981-12992` (`_enforceHistoryByteBudget`), `18033` (info panel call), `12861-12866` (`_historyPixelsForIndex`), `12736-12747` (`_cloneHistoryPixelState`), `4312`/`4316` (limits).
  Touches: `index.html` history budget and reconstruction.
  Acceptance: each entry caches its own byte size and the total is maintained incrementally; periodic full checkpoints bound reconstruction to a fixed number of deltas; a benchmark undoing 119 steps on the 8K fixture is bounded and covered by the performance gate.
  Complexity: M

- [ ] P2 — Move rendering and filters onto an OffscreenCanvas in a worker
  Why: `transferControlToOffscreen` has been universal since Safari 16.4 and is never used; the three existing `OffscreenCanvas` references are the PSD decoder, the WebGL2 invert backend and a capability probe. There is no dirty-region rendering either — 144 raw `renderAll`/`requestRenderAll` calls drive full repaints. "Lags like crazy on large files" is the universal complaint about every browser editor including Photopea.
  Evidence: `index.html:8433-8434`, `18368-18369`, `24525`; whole-document copies at `9724-9748`, `9750-9765`, `7005-7031`, `5686`; https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen
  Touches: `index.html` render loop, filter dispatch, `_readDocumentImageData`, the renderer seam established by PS-003.
  Acceptance: filter application and preview composite on a worker-owned OffscreenCanvas with the current main-thread path as the fallback; the renderer seam picks the path by capability and reports which one ran in `aiBackendReport`; the performance gate measures both paths on the 8K fixture; Firefox and WebKit projects prove the fallback.
  Complexity: L

- [ ] P2 — Sample the full pointer stream and use tilt
  Why: brush strokes sample one pointermove per frame while pens report at 120-240 Hz, so strokes are visibly faceted and lag by about a frame. `getCoalescedEvents`, `getPredictedEvents`, `azimuthAngle` and `altitudeAngle` are all available in every engine as of Safari 18.2, and each degrades to today's behaviour automatically. Pressure is already handled; tilt is not.
  Evidence: zero occurrences of `getCoalescedEvents`, `getPredictedEvents`, `tiltX`, `azimuth` in `index.html`; pressure handling in the mobile workspace and ABR stamp path; MDN compatibility for all four.
  Touches: `index.html` pointer handlers, brush stroke construction, ABR stamp dynamics, brush options UI.
  Acceptance: stroke construction consumes `getCoalescedEvents()` where present and falls back to the single event; predicted events drive a provisional stroke segment that is reconciled on the next real sample; tilt drives stamp rotation/flatten with a UI toggle; the mobile capability matrix reports which of the four the engine provided.
  Complexity: M

- [ ] P2 — Adopt ag-psd lazy layer decode and an explicit memory cap
  Why: ag-psd 30.0.0 added `useRawData` — parse without decompressing layer pixels, then `decodeLayerPixels()` per layer — which is the largest PSD open-time win available and needs no new dependency. 31.0.0 added a `totalMemoryLimit` (2 GB default) that the app currently leaves implicit while maintaining its own two-pass estimate. 30.2.0 added document-level pattern read/write.
  Evidence: https://github.com/Agamnentzar/ag-psd/blob/master/CHANGELOG.md ; current decode in the PSD worker at `index.html:8433-8560`, limits at `8115-8118`, CLAUDE.md note that `totalMemoryLimit` is enforced in the allocator.
  Touches: `index.html` PSD import worker and preflight, `_psdLimits`.
  Acceptance: import parses with `useRawData` and decodes layers on demand within the existing aggregate ceiling; `totalMemoryLimit` is set explicitly and lower than the default for untrusted files; time-to-first-layer on a large PSD improves measurably in the performance gate; the loss report is unchanged.
  Complexity: M

- [ ] P2 — Widen the parity-verified acceleration allowlist beyond `invert`
  Why: both GPU and WASM acceleration are allowlisted to exactly one operation while the README advertises "Accelerated Filters". The parity-divergence harness that gates the allowlist already exists, so this is extending a proven mechanism rather than building one.
  Evidence: `index.html:18264` (`_gpuParityOps`), `18819` (`_photonParityOps`), `18325-18402` (WebGPU/WebGL2/CPU chain), the divergence assertions in `tests/openshop.e2e.spec.js`; WebGPU is at 83.6% (caniuse) with no Firefox Linux/Android support, so the WebGL2 and CPU fallbacks stay.
  Touches: `index.html` filter worker op registry, GPU/WebGL2 kernels, parity test.
  Acceptance: grayscale, threshold, brightness/contrast, blur and sharpen each ship a GPU kernel admitted only after the harness measures divergence within tolerance; the allowlist cannot grow without a passing parity assertion; `filterBackends` reports the backend actually used per op.
  Complexity: L

- [ ] P2 — Read embedded ICC profiles and composite colour-managed
  Why: this is the most-cited professional gap in Photopea, the top technical criticism of new browser editors on HN, and it is absent from the entire web tier rather than paywalled — no commercial product gates it because none of them sell it. OpenShop already *retains* opaque ICC bytes through `.openshop` and PSD export but never interprets them.
  Evidence: PSD `0x040F` retention shipped v0.28.0 (README PSD row); zero occurrences of `colorSpace` or `display-p3` in `index.html`; there is no web API to read an embedded profile, so it must be parsed from JPEG APP2 / PNG `iCCP` / AVIF bytes; canvas `colorSpace:'display-p3'` is Chrome 92 and Safari 15.2 but **unsupported in Firefox**, so sRGB stays the baseline (MDN BCD, https://webkit.org/blog/12058/wide-gamut-2d-graphics-using-html-canvas/).
  Touches: `index.html` import decode paths, document model (add a working colour space), export writers, `color.js`-style conversion helpers as a new verified lazy asset (MIT).
  Acceptance: an embedded profile is parsed and named in the document info panel and the loss report; a P3-tagged source opens into a `display-p3` canvas where supported and is converted to sRGB with a stated conversion where not; exports embed the working profile; a round-trip test on a P3 fixture shows no unexplained hue shift.
  Complexity: XL

- [ ] P2 — Add OpenRaster (`.ora`) import and export
  Why: ORA is the only open, layered interchange format, it is a ZIP of PNGs plus `stack.xml`, and it is implementable with `CompressionStream('deflate-raw')` and the existing PNG encoder — zero new dependencies and zero added bytes. Krita, GIMP, MyPaint and Scribus read it, and nothing else in the browser writes it. It also gives OpenShop a lossless layered format that is not PSD.
  Evidence: https://www.openraster.org/ (spec 0.0.6, 8-bit RGBA, no vector layers); `CompressionStream` is Chrome 80 / Firefox 113 / Safari 16.4 (MDN); the ZIP assembly path already exists for batch export.
  Touches: `index.html` import dispatch, export writers, the loss report, README format table, `manifest.webmanifest` file handlers.
  Acceptance: export writes `mimetype` (stored, first entry), `stack.xml`, `data/layer*.png`, `mergedimage.png` and a thumbnail, and GIMP or Krita opens it with layer names, offsets, opacity and visibility intact; import reads a Krita-authored `.ora` and reports unsupported constructs by name; a round-trip test asserts layer geometry.
  Complexity: M

- [ ] P2 — Add layer groups
  Why: the editor has no grouping at all — no Group Layers, no folders, no Ctrl+G. PSD nested group *metadata* is retained for export, so an imported grouped PSD flattens into a flat list and re-exports from retained metadata rather than from a live structure. It is table-stakes for compositing and the main remaining PSD-fidelity limit under the project's own control.
  Evidence: zero occurrences of `groupLayers`, `createGroup`, `layerGroup`, `Group Layers` or `Ungroup` in `index.html`; PSD group metadata retention documented in README's PSD FAQ; cyclic-parent flattening fix in commit `a033dab`.
  Touches: `index.html` layer model, layers panel rendering and keyboard contract, PSD import/export mapping, `.openshop` schema (new migration), render order, `_enforceLayerInvariants`.
  Acceptance: Group/Ungroup with Ctrl+G/Ctrl+Shift+G, collapsible rows with group-level visibility, lock and opacity, drag-reorder into and out of groups, all through one history transaction; a grouped PSD imports into live groups and re-exports with the same hierarchy; a schema migration upgrades existing projects.
  Complexity: L

- [ ] P2 — Ship a light theme
  Why: all three themes are dark variants of each other; there is no light option and `prefers-color-scheme: light` is ignored. Every chrome colour already comes from the `--bg-depth-*`/`--border`/`--accent`/`--text-*` scale, so the token work is done — but roughly 50 hardcoded hex literals remain in the stylesheet and are exactly what made Midnight and OLED near-inert before v0.23.0.
  Evidence: `index.html:913-914` (only `theme-midnight` and `theme-oled`), `21622-21645` (`setTheme`), CLAUDE.md theme-token gotcha; ~50 raw hex literals in the `<style>` block.
  Touches: `index.html` `:root` token block, `setTheme`, theme menu and command palette, remaining hardcoded literals.
  Acceptance: a light theme meets the same WCAG 2.2 contrast bar the dark themes were held to; first run follows `prefers-color-scheme` unless a theme was persisted; a test asserts no chrome rule resolves to a literal outside the token scale.
  Complexity: M

- [ ] P2 — Complete the PWA manifest and add a share target
  Why: the manifest has no `maskable` icon purpose (Android letterboxes the icon), no `screenshots` (Chrome's richer install UI is unavailable), no `shortcuts`, no `launch_handler`, and no `share_target` — so an Android user cannot share a photo into OpenShop from the system sheet, which is the natural mobile entry point for a local-first editor. `file_handlers` also omits formats the app imports.
  Evidence: `manifest.webmanifest` (57 lines, none of the above); `sw.js:515` returns early for every non-GET request, so a share POST would need handling; https://web.dev/articles/add-manifest, https://developer.mozilla.org/en-US/docs/Web/Manifest/share_target
  Touches: `manifest.webmanifest`, `sw.js` fetch handler, `index.html` launch/share intake, icon assets, `tools/runtime-assets.mjs`.
  Acceptance: a maskable icon renders un-letterboxed on Android; `screenshots` with `form_factor` trigger the richer install UI; `share_target` accepts `multipart/form-data` image files, the service worker stores them and redirects, and the editor opens them; `file_handlers` covers every importable format; `launch_handler` avoids duplicate windows.
  Complexity: M

- [ ] P2 — Translate the runtime string surface and exercise RTL
  Why: `_locales` covers ~240 menu and panel keys; the 365 `toast(...)` call sites route through `_t` with essentially no `zh` entries, so a `zh` user gets translated chrome and English feedback for every operation. RTL is scaffolded but never exercised. This enlarges the gap already recorded in `Roadmap_Blocked.md` rather than replacing it — the blocker there (needs a native speaker) still stands for the content.
  Evidence: `index.html:3873` (`_locales`), `4117-4123` (English fallthrough), 365 `toast(` call sites, 8 `rtl` hits, CLAUDE.md note on four unreviewed mechanical `zh` strings.
  Touches: `index.html` toast call sites and `_t`, `i18nKeys()`/`missingLocaleKeys`, the pseudo-locale, RTL layout rules.
  Acceptance: every user-facing string is a keyed lookup and `missingLocaleKeys('zh')` enumerates the full surface including toasts; the pseudo-locale run shows no untranslated or clipped string; an RTL run of the pseudo-locale passes the existing screenshot and focus checks. Content translation stays blocked on a native speaker.
  Complexity: M

- [ ] P2 — Implement the highest-value tools from the P0 refusal list
  Why: once the 32 dead tools refuse honestly, the ones users actually reach for should become real. Polygonal and magnetic lasso, quick selection, spot healing and perspective crop are the ones named in competitor complaint threads and Photoshop-parity expectations; path/direct selection and custom shapes complete the vector story the editor already has anchors and Bezier handles for.
  Evidence: dead-tool list under the P0 item; existing primitives that make these tractable — `_setPixelSelectionMask({combine})`, lasso polygon rasterisation (`82fa5f1`), editable Fabric paths with anchors (v0.28.0), `_readDocumentImageData`; healing and clone stamp already exist as working tools.
  Touches: `index.html` `setTool`, `onMouseDown`/`onMouseMove` gesture handlers, options bar groups, `_toolCatalog` status.
  Acceptance: each implemented tool performs its documented operation through one history transaction, honours the active selection and layer locks, appears in the options bar with working controls, and moves from `unimplemented` to enabled in `listRegisteredTools`; the registry parity test's expected-dead list shrinks accordingly.
  Complexity: L

- [ ] P2 — Add Refine Edge and a real spot-healing algorithm
  Why: weak healing is one of the two remaining professional gaps HN names in Photopea, and selection edges are where a browser editor visibly loses. PyMatting is MIT, so closed-form and KNN alpha matting are directly portable — unlike resynthesizer, which is GPL-3.0 and unusable here. Telea fast-marching inpainting is small enough to implement inline and is the correct first step before any PatchMatch-class work.
  Evidence: https://github.com/PyMatting/pymatting (MIT), https://github.com/bootchk/resynthesizer (GPL-3.0, rejected in RESEARCH.md); existing AI segment masks and `_setPixelSelectionMask` provide the trimap inputs; `spot-healing`, `patch` and `content-aware-move` are already registered tool ids.
  Touches: `index.html` selection modify menu, a new worker op in the named filter registry, the healing tool.
  Acceptance: Refine Edge takes the current selection as a trimap, returns a soft alpha matte, and previews against a matte background; spot healing fills a brushed region by Telea inpainting within one history transaction; both are cancellable through the existing job registry and run in the worker.
  Complexity: L

- [ ] P2 — Preserve or deliberately strip image metadata on export
  Why: EXIF orientation is honoured on import but no metadata is read or written otherwise — no XMP anywhere. Silent metadata loss is a common browser-editor defect, and silent metadata *retention* (GPS in particular) is a privacy defect. The project's privacy positioning makes an explicit choice mandatory rather than optional.
  Evidence: 4 `exif` and 0 `xmp` occurrences in `index.html`; EXIF orientation handling from commit `442372e`; `exifreader` 4.41.3 (MPL-2.0) is maintained, `piexifjs` last released 2019 so writing means splicing APP1 segments directly.
  Touches: `index.html` import decode, export writers, Export Settings dialog, the loss report.
  Acceptance: import parses EXIF/XMP into document metadata and shows it; Export Settings offers Preserve / Strip / Strip location only, defaulting to strip location, and states the choice in the export report; a JPEG round-trip preserves the selected fields and drops the rest.
  Complexity: M

- [ ] P2 — Retire the Fabric v5 compatibility shim
  Why: the app is written against Fabric v5 and shimmed forward to 7.4.0. The shim re-adds callback signatures to `clone`, `FabricImage.fromURL` and `loadFromJSON` and routes failures into `reportAsyncError`, which converts every async failure at those call sites into a console entry rather than a rejected promise the caller can handle. It also makes the true upstream API invisible to anyone reading the code.
  Evidence: `index.html:30-70` (shim), call sites at `9614`, `13478`, `13491`, `13523`, `21317`, `21328`, `21350`, `21577`; Fabric 7.4.0 is also the minimum safe version (CVE-2026-44311, GHSA-w22m-hvvm-xmwx) so downgrading is not an option.
  Touches: `index.html` shim block and all listed call sites.
  Acceptance: every call site awaits the native promise and handles rejection locally; the shim block is deleted; `getPointer`/`setWidth`/`setHeight` aliases are either removed or documented as intentional; the unit and e2e suites pass unchanged.
  Complexity: M

- [ ] P2 — Bring the contributor toolchain current
  Why: `pdfjs-dist` is a full major behind (5.7.284 vs 6.2.108) and is the largest version gap in the project; `jsdom` is three majors behind (27 vs 30); Playwright 1.62.1 is what bundles Chromium 151 / Firefox 153 / WebKit 26.5, which is the only way the cross-browser projects actually test Safari 26 behaviour that several items above depend on.
  Evidence: pinned versions in `tools/runtime-assets.mjs` and `package.json`; https://github.com/microsoft/playwright/releases ; OSV.dev reports zero open advisories against all current pins, so this is currency, not remediation.
  Touches: `package.json`, `tools/runtime-assets.mjs`, `index.html` pinned URLs and hashes, `npm run runtime:sync`, `npm run security:write`.
  Acceptance: each upgrade lands separately with `runtime:sync` + `security:write` and a passing release gate; the PDF import fixture set passes on pdf.js 6.x; the WebKit project runs against 26.5.
  Complexity: M
  Research note (2026-08-08): **Verified** — the live lockfile now resolves `nanoid@3.3.16` through `vitest -> vite -> postcss`, and `npm audit` reports high-severity GHSA-2v37-7h3g-55p8 (patched in `nanoid >=3.3.17`). Treat this item as P0 remediation until `npm run test:release` passes the audit stage; `npm audit --omit=dev` remains clean.

- [ ] P2 — Confirm whether the pinned jsPDF bundle embeds DOMPurify
  Why: jsPDF 4.2.1 declares `dompurify@^3.3.1` as an optional dependency, and that range resolves into versions with open advisories — only 3.4.13 (2026-08-03) is clean. If the pinned UMD bundle embeds it, the SHA-384 pin freezes whatever copy was bundled and the project owns that advisory surface rather than inheriting it. jsPDF has shipped roughly one advisory per month across 4.0.0→4.2.1.
  Evidence: pinned `jspdf.umd.min.js` URL in `tools/runtime-assets.mjs`; https://github.com/parallax/jsPDF/releases ; marked Needs live validation in RESEARCH.md.
  Touches: `tools/runtime-assets.mjs` (a license/provenance report already exists), README security section.
  Acceptance: the runtime package report records, per bundled asset, which third-party libraries are embedded and at what version; if DOMPurify is present, either the pin moves to a bundle carrying 3.4.13+ or the exposure is documented with the reason it is not reachable; a recurring check flags the answer going stale.
  Complexity: S
  Research note (2026-08-08): **Verified** — the pinned jsPDF 4.2.1 UMD contains DOMPurify loader hooks but does not embed DOMPurify, and OpenShop does not invoke jsPDF's `.html()` path. The remaining action is to encode that embedded-dependency and reachability fact in the runtime provenance report/test so a future pin cannot silently change it.

### P3 — Polish and reach

- [ ] P3 — Numeric entry beside every slider, and integer zoom snapping
  Why: two cheap wins with disproportionate demand. Sliders without a typed value were rejected outright by users of a comparable browser editor on HN, and non-integer zoom levels were the top complaint about a browser pixel editor because they destroy pixel-art legibility. OpenShop shows read-only value labels for adjustments.
  Evidence: `index.html:528` (`.adj-val` is a read-only label), `436` (`.opt-val`); https://news.ycombinator.com/item?id=43823044 (numeric entry), https://news.ycombinator.com/item?id=46753708 (integer zoom).
  Touches: `index.html` adjustment and options-bar control markup, zoom step logic.
  Acceptance: every slider has a paired number input that validates through the existing numeric dialog rules and stays in sync in both directions; zoom offers a snap-to-integer-ratio mode with nearest-neighbour sampling above 100%; both are keyboard-reachable.
  Complexity: S

- [ ] P3 — Per-range text formatting inside one text object
  Why: the #2 and #3 most-requested features in a 128k★ canvas app are highlighting and colouring a range inside a single text element, and nobody in the browser-raster tier ships it. OpenShop already has decoration colour and thickness, ligatures, small caps and tabular numbers — all applied to the whole object.
  Evidence: Excalidraw open issues (per-range text colour, 167 reactions; highlight words in a paragraph, 236); text styling scope in README's Core Editor table; Fabric `IText`/`Textbox` support `styles` per character range natively.
  Touches: `index.html` text tool, options bar, `.openshop` schema (new migration), SVG/PDF/PSD export mapping.
  Acceptance: a selected character range takes its own fill, decoration, weight and size; the range survives project save/load through a schema migration; SVG export emits per-range spans and PSD export reports the rasterisation in the loss report.
  Complexity: L

- [ ] P3 — Read C2PA Content Credentials on import
  Why: provenance display is achievable in the browser today and fits the project's trust posture, which is its main differentiator. Signing is explicitly out — `@contentauth/c2pa-web` 0.13.1 is verify-only, signing exists only in `c2pa-node`, and it would require a certificate.
  Evidence: https://github.com/contentauth/c2pa-js (MIT, ~19 MB unpacked WASM); rejection of signing recorded in RESEARCH.md.
  Touches: `index.html` import path as a new verified lazy asset, document info panel, the loss report.
  Acceptance: an image carrying Content Credentials shows its manifest chain and validation status in the info panel; validation failure is stated rather than hidden; the asset loads only when a manifest is detected, and the export report states that OpenShop does not sign.
  Complexity: M

- [ ] P3 — Add portable JPEG XL and HEIC decode
  Why: HEIC is the native camera format on every iPhone and is unopenable in Chrome and Firefox — permanently, for HEVC licensing reasons — so a WASM decoder lets OpenShop open photos the browser itself cannot. JPEG XL is Safari-only by default (Chrome 145 is flag-gated, Firefox 152 pref-disabled), so a portable decoder is the only cross-browser route. Both fit the existing verified-lazy-asset pattern that jSquash AVIF already uses.
  Evidence: `@jsquash/jxl` 1.3.0 (Apache-2.0, encode + decode); Chrome JXL flag state and Firefox 152 pref, Safari 17+ default-on; Firefox HEIC bug 1402293 open; existing jSquash AVIF integration.
  Touches: `index.html` import dispatch and lazy asset manifest, `tools/runtime-assets.mjs`, `sw.js` cache allowlist, README format table, `manifest.webmanifest`.
  Acceptance: HEIC and JXL files import on Chrome, Firefox and WebKit; native decode is preferred where the engine has it; each decoder is SHA-384 verified and fetched only when that format is opened; the format table and file handlers are updated.
  Complexity: M

- [ ] P3 — Claim the empty self-hosted image-editing slot
  Why: awesome-selfhosted has no image-editing category at all — its only editors are Penpot and draw.io, both listed elsewhere — so there is no listing to compete for and no incumbent occupying it. The hosted-subdirectory recipe, verified offline shell and zero-server model are exactly what that list selects for.
  Evidence: https://github.com/awesome-selfhosted/awesome-selfhosted (full README grep, 2026-08-04); README self-hosting recipe.
  Touches: README (self-hosting and related-tools sections), a PR to the upstream list.
  Acceptance: the self-hosting recipe is verified end-to-end from a clean directory on a plain HTTP server, and a category PR is submitted meeting the list's inclusion rules.
  Complexity: S

### P0 — 2026-08-08 trust-state additions

- [ ] P0 — Make plugin readiness an explicit success state
  Why: a plugin that throws after installing a message handler, or answers after the handshake timeout, remains registered, is reported ready, and can still invoke previously granted capabilities because failure only settles the readiness promise.
  Evidence: `index.html:24088-24092` (`_pluginRejectReady` sets `readySettled`), `24142` (admission checks only settled state), `24317` (10-second timeout), `24338-24347` (`listPlugins()` reports settled records ready), `plugin-sandbox.js:45-52` (source errors are reported); the existing red plugin-handshake test exposes the same lifecycle boundary.
  Touches: `index.html` plugin record/handshake/admission/disposal methods, `plugin-sandbox.js`, plugin unit and e2e tests.
  Acceptance: every record has one authoritative `pending | ready | failed | disposed` state; only `ready` admits requests or reports `ready:true`; a source throw and a handshake timeout both dispose the frame, reject queued/in-flight/later calls with a stable reason, and cannot be resurrected by a late message; the existing handshake regression and new throw/timeout tests pass.
  Complexity: M

- [ ] P0 — Isolate concurrent exports with request-scoped delivery
  Why: embed export capture temporarily replaces global download methods across an `await`, so two embed requests or an embed request concurrent with user Save can capture each other's output, trigger an unintended download, or restore the wrong sink.
  Evidence: `index.html:14567-14585` (`_captureExportedBlob` replaces `_downloadBlob`/`_downloadDataUrl`), `14529` and `14670-14678` (asynchronous, unserialized message handling).
  Touches: `index.html` export writers, `_captureExportedBlob`, embed message dispatcher, export e2e tests.
  Acceptance: export writers accept a per-call delivery sink end-to-end, or a narrow mutex provides equivalent isolation; two deliberately overlapping embed exports each return the correct distinct blob; a concurrent UI Save still downloads only its own result; rejection/cancellation restores no shared mutable sink.
  Complexity: M

### P1 — 2026-08-08 data-safety and contract additions

- [ ] P1 — Separate interface locale direction from artwork direction
  Why: changing the UI locale currently calls a direction helper that mutates Fabric text objects, so a presentation preference can change saved artwork and exported pixels.
  Evidence: `index.html` `setLocale` -> `_applyTextDirection`; the existing locale test codifies object mutation rather than separating DOM `dir` from document text direction; W3C bidi guidance treats page direction and content direction as separate semantics.
  Touches: `index.html` locale application, text tool/object direction commands, history and project serialization, locale tests.
  Acceptance: switching among LTR, RTL, and pseudo-locales changes DOM chrome only; serialized project content, history length, and export pixels remain byte/pixel equivalent; artwork direction changes only through an explicit text-object command and round-trips through `.openshop`.
  Complexity: M

- [ ] P1 — Put dirty-document decisions in front of offline runtime replacement
  Why: Apply Update, Roll Back, and Rebuild Offline Cache can replace runtime state without a workflow-specific Save / Discard / Cancel transaction, risking edited work despite the generic unload guard.
  Evidence: `index.html` offline update/rollback/rebuild handlers and generic `beforeunload` path; `web.dev` PWA update guidance; the service worker already exposes staged promotion and rollback primitives.
  Touches: `index.html` offline controls and document-dirty state, `sw.js` message responses, `tests/offline.e2e.spec.js`.
  Acceptance: each runtime-replacement action shows Save / Discard / Cancel when dirty; Save completes and verifies persistence before promotion, Discard is explicit, Cancel changes neither document nor service-worker revision; failed save keeps the old runtime active; clean-document and dirty-document paths are covered.
  Complexity: M

- [ ] P1 — Normalize animated-image Open, Place, Paste, and Drop semantics
  Why: the same animated bytes currently become frames, a static image, a placed object, or a replacement document depending on the event handler rather than the user's intent.
  Evidence: normal GIF open uses the frame-aware path while dropped GIF uses a static decode; dropped APNG/WebP and AVIF/SVG follow inconsistent replace-versus-place branches in `index.html` import/drop dispatch.
  Touches: `index.html` file sniffing, Open/Place/Paste/Drop router, GIF/APNG/WebP decoders, animated import tests.
  Acceptance: one normalized format descriptor feeds one intent router; Open replaces/creates a document, Place/Paste inserts according to a documented animated-object policy, and Drop chooses by blank/open workspace rather than format-specific accident; GIF, APNG, and animated WebP fixtures preserve frame count/timing consistently across all four entry paths.
  Complexity: M

- [ ] P1 — Complete composite-control semantics and gate key accessible states
  Why: most labels have no programmatic association, the command palette and panel tabs lack their required composite roles/state relationships, the application canvas is not keyboard-focusable, and closed mobile drawers remain in the focus order.
  Evidence: 214 `<label>` elements, of which 190 neither wrap a control nor use `for`; command palette has no combobox/listbox/option semantics; panel tabs lack tab roles/relationships; canvas `role="application"` has no focus entry; mobile drawer lacks `inert`, `aria-expanded`, and `aria-controls`; WAI-ARIA combobox/tab patterns, WCAG 2.2, and the HTML `inert` contract. Menu command enablement remains owned by the existing P1 item rather than this semantic-control pass.
  Touches: `index.html` markup/event handling/CSS for Preferences, tool panels, command palette, tabs, canvas, mobile drawers, and blank state; Playwright accessibility tests; axe-core test dependency.
  Acceptance: every form control has a computed accessible name; the palette implements combobox/listbox/option active-descendant behavior; tabs expose tablist/tab/tabpanel selection and ownership; canvas has a documented keyboard focus entry; closed drawers are inert and toggles announce state; keyboard golden paths pass and axe-core reports no serious/critical violations in blank, editor, modal, and mobile-drawer states.
  Complexity: L

- [ ] P1 — Expose plugin grants, provenance, status, and revocation in Preferences
  Why: capability grants and revoke/list methods exist, but users have no UI to audit which plugin source/version holds which authority or to revoke it without code.
  Evidence: `index.html` plugin consent persistence plus `listPlugins()` and revoke/dispose APIs; Pintura/IMG.LY treat integration state as a first-class contract; plugin lifecycle evidence in this research.
  Touches: `index.html` Preferences UI, plugin consent store, lifecycle state machine, diagnostics, accessibility tests.
  Acceptance: Preferences lists each plugin's name, source digest/version, lifecycle status, granted capabilities, and last failure; Revoke removes persisted approval, disposes the frame, rejects queued/in-flight calls, and requires fresh consent before re-registration; the surface is keyboard/AT usable and updates without reload.
  Complexity: M

- [ ] P1 — Establish a round-trip compatibility corpus
  Why: broad format claims are not protected by enough redistributable fixtures, so layer, mask, frame, metadata, migration, or declared-loss regressions can ship unnoticed.
  Evidence: sparse current fixture coverage under `tests/fixtures`; Photopea user reports and ag-psd release history show that real compatibility failures cluster in malformed, nested, and version-specific files; existing roadmap items expand PSD, PDF, animation, ORA, JXL, and HEIC scope.
  Touches: `tests/fixtures`, a compact fixture/invariant manifest, Vitest import/export tests, Playwright golden workflows, format loss-report assertions.
  Acceptance: redistributable synthetic/upstream-licensed fixtures cover `.openshop` schema versions, PSD layers/groups/masks, PDF pages, GIF/APNG/WebP frames, metadata, and malformed boundaries; open -> export -> reopen asserts dimensions, layer order/names, masks, frame count/timing, metadata policy, and every intentional loss; corpus regressions block release and fixture provenance is machine-readable.
  Complexity: L

- [ ] P1 — Prove browser tests use the intended checkout across supported engines
  Why: Playwright always reuses port 4173, so a stale/unrelated server can satisfy startup, while Firefox/WebKit select `@cross-browser` tests that exclude the entire hosted/offline suite despite README coverage claims.
  Evidence: `playwright.config.js:17-20` (`reuseExistingServer:true`) and `34-35` (Firefox/WebKit grep); zero `@cross-browser` tags in `tests/offline.e2e.spec.js`; README hosted/offline browser claim.
  Touches: `playwright.config.js`, preview/test identity endpoint or page metadata, `tests/offline.e2e.spec.js`, README support matrix.
  Acceptance: CI always starts a fresh server; any local reuse must expose and match the current checkout/revision token before tests run; a supported hosted/install/offline subset is tagged and passes in Chromium, Firefox, and WebKit, with explicit capability skips; README claims are derived from or checked against that matrix.
  Complexity: M

- [ ] P1 — Pin CI actions to immutable commits
  Why: mutable action tags expand the release supply-chain trust boundary even when runtime assets themselves are digest-pinned.
  Evidence: `.github/workflows/verify.yml` uses major tags such as `@v4`; GitHub secure-use guidance states that a full-length commit SHA is the only immutable action reference.
  Touches: `.github/workflows/verify.yml`, dependency update automation/configuration, contributor documentation if needed.
  Acceptance: every third-party action reference is a full commit SHA with the human-readable release tag in a comment; workflow permissions are least-privilege and explicit; Dependabot or an equivalent reviewed process proposes SHA updates; the workflow and local release lane remain green.
  Complexity: S

- [ ] P1 — Fail closed on an incomplete runtime license inventory
  Why: unresolved licenses currently pass tests and several shipped runtimes are absent from the user-facing inventory, so the project can claim traceable licensing without complete machine-verifiable facts.
  Evidence: `tools/runtime-assets.mjs` omits license metadata for modern-gif and LibRaw-Wasm; `licenseReport()` substitutes a truthy unresolved string and `tests/runtime-assets.test.js` asserts only truthiness; README omits modern-gif, pdf.js, LibRaw-Wasm, and ONNX Runtime Web. Version upgrades remain owned by the existing contributor-toolchain item, and embedded-dependency reachability remains owned by the existing jsPDF item.
  Touches: `tools/runtime-assets.mjs`, license report/sync scripts, `tests/runtime-assets.test.js`, README dependency table, release checks.
  Acceptance: every shipped asset records source, exact version, hash, and SPDX-valid license; placeholder or unknown license values fail the release gate; README's runtime inventory is generated from or checked against the canonical manifest; modern-gif and LibRaw-Wasm report their verified package licenses without duplicating the toolchain or jsPDF tasks.
  Complexity: S

### P2 — 2026-08-08 lifecycle and maintenance additions

- [ ] P2 — Release verified runtime bytes and blob URLs after initialization
  Why: fulfilled asset and blob promises retain raw bytes and blob backing after large codecs, workers, WASM modules, or AI runtimes also retain initialized state, multiplying memory pressure beside large documents.
  Evidence: `index.html:3545-3607` (`_runtimeAssetPromises` stores `{asset, bytes}` and `_runtimeBlobPromises` stores URLs indefinitely), runtime initialization at `3645-3723` and `22639-22670`; browser-editor memory complaints and the existing large-document performance work.
  Touches: `index.html` runtime asset/blob loaders and owners for PDF, RAW, Transformers, ONNX, workers, and UMD globals; runtime lifecycle tests and performance gate.
  Acceptance: ownership rules release raw verified bytes after successful initialization, revoke temporary URLs at the earliest safe lifecycle point, and clear failed promises so retry works; shared runtimes stay reusable without refetch while owners exist; a deterministic lifecycle test observes zero stale cache entries/URLs after dispose and the real-app memory probe shows no duplicate retained payload class.
  Complexity: M

- [ ] P2 — Make roadmap and parity status mechanically consistent
  Why: the active roadmap's failure arithmetic and “parity roadmap drained” claim conflict with live rows and `PHOTOSHOP_PARITY_ROADMAP.md`, while the replaced research previously claimed the roadmap was empty; contradictory trackers make autonomous continuation unsafe.
  Evidence: `ROADMAP.md` baseline says 10 failures, 4 fixed, and 7 remaining; its parity-drained statement conflicts with 42 `PLANNED`, 3 `BLOCKED`, and 8 `VERIFIED` markers in `PHOTOSHOP_PARITY_ROADMAP.md`; release history shows rapid roadmap churn.
  Touches: `ROADMAP.md`, `PHOTOSHOP_PARITY_ROADMAP.md`, a focused tracker validation script/test, release checklist.
  Acceptance: `ROADMAP.md` is the single actionable source; parity rows either map to an active/blocked item or are explicitly historical evidence; a test rejects impossible totals, duplicate active items, checked-off rows, and a “drained” claim while planned rows remain; no cycle log or generated status file is introduced.
  Complexity: M

- [ ] P2 — Validate release-facing metadata and preview assets
  Why: the social preview is broken and version/architecture/screenshot claims have drifted from the shipped release, weakening distribution trust even when code metadata is synchronized.
  Evidence: `index.html:5` references untracked `banner.png`; README architecture graphic says approximately 17,000 lines while `index.html` has 24,691; CLAUDE mixes 0.27.0/0.28.0 against shipped 0.29.0; `tests/openshop.e2e.spec.js-snapshots/*.png` show older version badges.
  Touches: `index.html` metadata, an existing tracked image asset or metadata URL, README architecture/version surfaces, CLAUDE release instructions, version metadata test, screenshot refresh procedure.
  Acceptance: every local metadata asset resolves in both `file://` and hosted lanes; release tests verify all version-bearing docs/surfaces and reject missing preview assets; architecture size is generated or expressed without a stale line count; documented QA snapshots identify the release they represent and current required snapshots carry the current version.
  Complexity: S
