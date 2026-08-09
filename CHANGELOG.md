# Changelog

All notable changes to Openshop will be documented in this file.

## [Unreleased]

### Added
- Reimagined the complete editor shell from image-generated design references,
  including all seven top-menu states, command search in the product bar, a
  synchronized floating canvas zoom HUD, denser inspector cards, split color
  controls, and a more deliberate local-first status treatment. The approved
  master, menu board, and Select-state mockups are retained under `design/`.
- Restored the shell's hand-drawn SVG tool language in the registry-generated
  two-column rail and flyouts. Family faces now follow the selected nested tool
  instead of remaining as letter placeholders or showing a stale default.
- Turned the Motion workspace into a fitted, side-effect-free frame timeline
  with transport controls, live frame counts, a deliberate first-frame action,
  checkerboard thumbnails, and automatic canvas reflow instead of an overlay.
- Replaced the Move tool's instructional sentence with a compact options bar:
  functional Auto-select and Transform Controls toggles plus six existing align
  commands now match the image-generated studio reference at desktop and tablet.
- Elevated the intentional blank studio with a local-workspace launch card,
  keyboard and drop affordances, structured Layers/History empty states, and a
  current Chromium visual contract instead of the stale v0.27 snapshot.

### Fixed
- The seven top-level menu roots had only a 13px-high pointer target after the
  visual redesign; their interactive region now spans the full product bar.
- Automatic narrow-screen and explicitly selected Mobile workspaces now share
  one bottom-dock geometry. The horizontal tool rail and timeline clear the
  bottom tabs, tool families collapse to icon-only targets, and transient status
  messages no longer cover the rail.
- Storage-backed preferences, palettes, presets, imported assets, workspace settings,
  recent files, themes, plugin consent, and strict-offline state now detect quota
  failures, record diagnostics, and show an error instead of claiming persistence.
- The selected bottom tab failed WCAG 2.2 text contrast at 4.01:1 against its own
  tinted background; it now uses the lighter accent step.
- Two controls sat under the 24x24 CSS pixel pointer-target floor: the workspace
  selector (22px tall) and the tool options Reset button (20px tall).
- The tool family button never showed its active state on first paint. `setTool`
  looked only for the flyout after it has been portalled to the body host, but at
  that point in boot the flyout is still nested inside the group, so the face was
  left unmarked until the user picked a tool by hand.
- Registered Photoshop-parity tools without an implementation now appear disabled,
  refuse command and macro execution with a diagnostic, and leave the active tool
  unchanged instead of swallowing gestures as successful no-ops.
- Removed an unmatched stylesheet brace and added a release-gate parser for every
  inline and tracked stylesheet, with source locations and malformed-fixture coverage.
- Plugin records now distinguish pending, ready, failed, and disposed states. Source
  errors and handshake timeouts tear down the sandbox, reject later calls with the
  original reason, and are never resurrected by late messages. Direct `file://`
  launches also use the sandbox page's CSP-pinned inline fallback when browsers block
  local script subresources.
- Embed exports now pass request-scoped delivery sinks through raster, AVIF, SVG, and
  PDF writers. Concurrent exports no longer replace global download methods or capture
  a user's unrelated Save result.
- Removed inert `frame-ancestors` declarations from meta policies. The security gate now
  rejects header-only directives in meta delivery, while hosted embedding documents a
  deployment-selected response header and the file lane's exact-window handshake guard.
- Coverage now executes the extracted shipped `index.html` application block from a
  temporary source file, reports its real line numbers under `index.html`, and enforces
  thresholds against measured application coverage instead of the test harness.
- The performance gate now starts a fresh headless Chromium page and drives real
  4K/8K/12MP document, filter, history, export, batch, cancellation, and stale-result
  operations with fixed four-times p95 envelopes and recorded execution backends.

### Testing
- Added `tests/issue-3-requests.e2e.spec.js`: one browser test per request in issue
  #3, driving the running editor. The changelog already claimed all six shipped;
  these check the behaviour instead, so a regression surfaces here rather than in a
  second bug report.


## [v0.29.0] - 2026-08-02

### Added
- Add a clean npm/Node release workflow that installs the lockfile, provisions Chromium/Firefox/WebKit, runs the full release gate, and preserves browser diagnostics as CI artifacts.
- Drive the page loader, service-worker cache allowlist, security checker, and runtime package/license report from one canonical asset manifest; all 23 verified lazy assets are now cache-allowlisted.
- Make the Layers and History panels keyboard-operable listboxes with active-descendant semantics, announced position/selection state, keyboard reorder/delete paths, and Chromium/Firefox/WebKit coverage.
- Add an explicit document migration registry, rollback-safe future-schema rejection, and structured OpenShop/PSD loss reports for unsupported fields, color modes, metadata, and approximations.
- Make manual WebRTC sessions peer-identifiable and revision-safe with explicit consent, replay rejection, deterministic conflict handling, reconnect queuing, and local-document restore on failed remote loads.
- Add a package-owned release metadata source and consistency gate for project versions, hosted shell revisions, offline test fixtures, and documented browser/file/hosted support boundaries.
- Add a deterministic 4K/8K/12MP performance-budget runner covering editing, filters, tiled history, export boundaries, batch, cancellation, and stale-result probes; the release gate now runs it.
- Add a cross-engine mobile capability matrix with compact-workspace overflow, two-finger pinch, safe-area, orientation, visual-viewport, and pressure-variance coverage; physical-device support remains explicitly unclaimed.
- Require sandboxed plugins to declare stable manifests, verify source SHA-256 provenance, obtain explicit consent, persist exact-version approvals, and retain deny-by-default capability boundaries.
- Add cancellable, progress-reporting batch runs with raster-only format validation, partial-failure status, rollback-safe cancellation, and yielding ZIP assembly.
- Render bounded ABR tip textures as deterministic raster-stamped layers with spacing, opacity, scatter, and pressure sizing; report unsupported native ABR features by name.

## [v0.28.0] - 2026-08-02

### Added
- Import PDF documents entirely in the browser, rendering each page as its own editable layer with bounded page count, dimensions, and decoded memory use.
- Import animated WebP and APNG frames through the browser decoder, preserve each frame's duration in the timeline and project file, and reuse those timings for animated GIF export.
- Import common camera RAW files through a pinned LibRaw/WASM worker, demosaic them locally with camera white balance, and retain basic camera metadata for the current document.
- Preserve opaque ICC profile data and AI segment masks, including their labels and sources, in `.openshop` project round-trips.
- Add non-destructive Levels, Curves, and HSL adjustment layers with versioned parameters, editable stack previews, and an explicit Apply Stack path.
- Add independent raster layer masks with bounded project storage, non-destructive feather and density controls, and an explicit remove path.
- Add re-editable embedded Smart Objects with source replacement that preserves the placed object transform and keeps the original source in the `.openshop` project.
- Add vector-shape conversion to editable Fabric paths with draggable anchors and Bezier control handles before SVG or raster export.
- Add text-on-path groups with editable source text plus ligature, small-caps, and tabular-number feature controls.
- Run parity-verified invert filters through a WebGPU compute worker, fall back to WebGL2 on OffscreenCanvas, and retain the existing CPU worker as the final fallback; expose measured per-filter backend/FPS data for diagnostics.
- Store raster undo changes as 64×64 dirty-tile deltas with reconstruction assertions available in debug mode, doubling the default history ring from 60 to 120 steps while retaining full snapshots for metadata and non-raster edits.
- Replace the direct plugin `init(editor)` façade with an opaque-origin sandboxed iframe API. Plugins register immutable source strings with explicit capabilities, contribute versioned command-palette entries over `postMessage`, and can be disposed without leaving listeners, frames, or commands behind.
- Embed the retained ICC profile bytes in PSD exports as the standard `0x040F` ICC Untagged Profile resource and recover that resource on PSD import; pixel conversion remains intentionally out of scope.
- Add a folder batch processor that applies versioned action recipes to raster images, remaps per-document targets safely, preserves relative paths, and downloads the results as a bounded ZIP without changing the user's open document.
- Add no-server collaborative sessions over a local WebRTC data channel with manual offer/answer exchange, bounded chunked document sync, sanitized peer-state loading, and clean disconnect handling.
- Import ASE/GPL/JSON palettes, Photoshop ABR brush sets, and Photoshop GRD v3/v5 gradients through one bounded, sanitized asset picker, with persistent selectable brush and gradient presets.
- Add a persistent Mobile workspace layout with a compact toolbar, slide-out panels, touch-safe canvas input, and pen-pressure brush sizing that ignores constant touchscreen pressure.

## [v0.27.0] - 2026-08-01

### Security
- Make the release gate audit the whole script-policy contract instead of one permissive happy path. Script directive overrides, wildcard or scheme sources, nonces and alternate hashes, unquoted event handlers, whitespace around `src`, foreign or duplicate verified-asset URLs, missing boundary directives, added inline blocks, and replacement-pattern corruption now all fail with regression coverage
- Constrain the offline worker to the static runtime assets OpenShop actually uses, never cache private/no-store or credential-varying responses, reject state pointers to revisions that were never shipped, require the exact revision in the boot-health handshake, and accept shell-control messages only from the app document. The self-hosting recipe now keeps the worker in a dedicated subdirectory instead of granting it an origin-wide scope
- Lock the contributor web harness to localhost Host and Origin values, serve only the six files its browser tests need, and return bounded 4xx responses for malformed paths, invalid JSON, and oversized control bodies instead of exposing repository contents or terminating the process

### Added
- Expose a versioned `postMessage` contract so a host page can embed OpenShop in an iframe, preset the document, restrict the visible tool set, take over Open and Save, and receive the exported blob. The editor binds to the window that completed the handshake and ignores every other one; a message on an unknown protocol version is refused rather than guessed at. Documented with a working host example in the README
- Name the current state and keep it for the session, with a thumbnail, outside the undo step limit. Editing after an undo no longer deletes the rest of that line — it is archived as a branch and stays restorable, which is what the history panel silently threw away before. Snapshots and branches are both budgeted, and automatic branches are released before named states when the budget bites
- Import SVG as editable shapes, text, and groups rather than a flat bitmap, sizing a new document to the artwork's own viewBox. The markup is untrusted, so it goes through the exporter's sanitiser before Fabric parses it: scripts, event attributes, and unsafe `href` schemes are gone before any object exists, and shape-count and file-size ceilings apply
- Trace a raster layer into editable vector paths, with colour-count, smoothing, and detail controls. The tracer is public-domain imagetracerjs, fetched and SHA-384 verified on demand; every browser-usable potrace build is GPL-2.0 and could not be shipped. The result is ordinary Fabric paths, so it is editable on canvas and the existing SVG, PDF, and project writers already carry it
- Write a genuinely vector PDF when the document has no raster layer, through pinned svg2pdf.js, instead of flattening every export to an embedded bitmap. A document with any visible raster still gets the bitmap page, and an unavailable writer falls back to one rather than failing the export
- Enlarge with an actual super-resolution model. Swin2SR (Apache-2.0, revision-pinned) reconstructs 2x and 4x tile by tile with progress and cancellation, and normalises the model's window padding before stitching so no tile seam survives. When the model will not load, or the source needs more model passes than are reasonable, it says so and hands off to the resample enlarger — which keeps its own honest label in a menu that now lists both
- Drag gradient stops on the canvas. Fabric's interactive gradient handles ship in a second UMD bundle rather than the pinned main one, so it is fetched and SHA-384 verified on demand like every other lazy runtime asset and only when the gradient tool asks for it; radial gradients say so instead of half-working, since upstream provides no radial equivalent
- Underline, overline, and line-through for text, each with its own colour and thickness rather than borrowing the fill. New text inherits the current settings and an existing selection is restyled in place
- Report outbound network use where a hosted competitor shows a credit meter. A ledger installed ahead of the first fetch in the document records every request the page makes — including the three pinned startup libraries — and the status bar reads `Nothing sent` until one happens. Network Activity lists them grouped by host and purpose, and a persisted strict offline mode refuses anything not already cached while naming the individual capabilities that costs. Strict mode stands itself down rather than leave a cold `file://` start with no interface to switch it off

### Changed
- Upgrade the local AI runtime to Transformers.js 4.2, report each model's exact transfer and installed size before its first download, and retain the SHA-384-verified ONNX engine for hosted offline reuse. Segment Select now uses pinned Apache-2.0 SlimSAM point masks, Depth Map uses pinned Depth Anything V2, and Background Removal uses 4.x's dedicated MODNet pipeline; noncommercial and GPL model alternatives remain excluded
- Progressively enhance menus, context menus, tool flyouts, and transient dialogs with native Popover API top-layer behavior and logical CSS anchor positioning, while retaining the positioned and managed-focus fallback for older Safari. Keyboard navigation now owns exactly one menu even when the pointer remains parked over another title
- Add AVIF import and export through pinned jSquash 2.1.1 libavif modules whose JavaScript and WASM bytes are SHA-384 verified before use. One deterministic single-threaded encoder now produces identical files across browser engines, while the verified decoder covers engines without native AVIF support

### Fixed
- Keep an open dialog in charge of the keyboard. A popover does not trap focus the way a modal `<dialog>` does, so the platform's own focus restoration or the menu bar's could drop focus behind a dialog frames after it opened — the next Enter then opened a menu whose auto popover evicted the dialog from the top layer and discarded whatever had been typed into it. Dismissing the welcome screen also re-adopted it for the length of its fade, so the app believed a dialog was open for another 400ms after the editor was usable
- Decode EXIF-bearing JPEGs exactly once. Browsers already apply the orientation while decoding, so OpenShop now neutralizes the copied tag before baking its own pixel transform instead of rotating camera photos twice
- Carry the current verified offline shell into the next worker's trusted predecessor set so a failed update can still roll back after the shell revision advances
- Replace the abandoned gif.js encoder with pinned modern-gif 2.1.0 for worker-based encode and decode. Animated GIF import now preserves all frames in WebKit and other engines without `ImageDecoder`; the deterministic export gate is 34% smaller with lower pixel error than the previous `quality: 10` output

### Performance
- Keep adjustment and filter sliders responsive on 4K images by reusing a capped Canvas2D preview pipe; Apply still runs Fabric's normal filter path over the original full-resolution pixels

### Testing
- Run the full Chromium browser suite over both `file://` and localhost, add real Photoshop PSD, animated GIF, and EXIF JPEG fixtures plus clipboard and drag-and-drop coverage, and enforce coverage floors in the release gate
- Assert every frame, delay, dimension, and pixel hash in the real 11-frame GIF fixture across browser engines, and keep legacy size and quality ceilings as an export regression gate

## [v0.26.0] - 2026-08-01

### Fixed
- Paint onto the layer instead of over it. A brush stroke stayed a selectable, draggable Fabric path sitting above the layer, and an eraser stroke was a path too — so its "erasure" could be dragged around afterwards, which is the second complaint in issue #3. A finished stroke is now composited into the layer's pixels and the path discarded; the layer gains a raster the first time it is painted on, or paints into the image it already holds, wherever that image sits and whatever transform it carries. Symmetry mirrors are composited in the same pass. Preferences has a "Keep brush strokes as editable paths" option for the previous behaviour
- Let toasts go away again. Hovering paused the dismiss timer and nothing restarted it, so any toast the pointer crossed on its way somewhere else stayed on screen for good, and they piled up over the canvas. Leaving restarts the countdown, the stack is capped at four, and a slider drag with nothing selected says "Select an image to adjust" once instead of once per debounce tick
- Abort a filter panel's drag listeners when it is replaced. Only the close path aborted them, so opening one filter panel over another leaked two permanent document-level listeners closing over the removed node
- Say what best-effort storage actually costs. Recovery Storage reported "Durable" or "Best effort" without explaining either, and the engines differ in ways that matter: Safari clears script-writable storage after seven days without a visit unless the origin is persisted or installed. The panel now states the engine's rule in plain language and, when eviction is possible, offers to ask the browser to keep the data
- Create documents in millimetres or inches at a chosen resolution. New Image was pixels-only with no resolution field anywhere — the first request in issue #3 — and both exporters assumed 96 PPI regardless. The dialog takes units and a PPI value, shows the resulting pixel size as you type, converts what is already entered when you switch units rather than reinterpreting it, and the document carries its resolution into the PSD resolution resource and the PDF page size. A4, Letter and 6x4in presets ship at 300 PPI
- Make the right-hand panel sections resizable, the sixth request in issue #3. The Layers/History/Properties split was fixed however many layers a document had. Drag the bar between sections, or focus it and use the arrow keys — a drag-only control would fail WCAG 2.5.7, and the separator's box meets the 2.5.8 target size while the visible bar stays thin. Home or a double-click restores the natural size, and the sizes are remembered along with the other preferences
- Close lasso and pen paths by clicking their start point. Neither tool had any "suction" on the start and end points, so completing an outline was guesswork — the fourth point of issue #3. Once there is something to close, the start point is marked, the marker lights up when a click there would close the path, and clicking it finishes the shape. A pen path closed that way is treated as closed whatever the Filled toggle says, and now lands on its own layer like the other object tools
- Snap objects to the artboard and to each other. Only grid snapping existed, so positioning a layer against the canvas or lining it up with another meant eyeballing pixels — the fourth point of issue #3. Dragging now snaps edges, centres and midpoints to the artboard's edges and centre and to every other object, draws the smart guide it matched, and prefers that over the grid. Alt suppresses it for one drag, and the tolerance scales with zoom so it does not turn sticky when zoomed in
- Add, subtract and intersect selections. No boolean modes existed at all, which is the most-reacted open request on the nearest open-source rival and a baseline expectation for anyone arriving from Photoshop. Hold Shift to add, Alt to subtract, both to intersect, or pick a sticky mode from the marquee options bar for pointer-only and keyboard-only use. The mode is read when the gesture starts, since a marquee's modifier is usually released before the drag ends, and a marquee combined with an existing selection is promoted to a mask so the booleans apply to it
- Stay usable in Windows High Contrast. There was no `forced-colors` handling at all, and the chrome is glassmorphic — translucent panels over a blur — which in a forced-colours mode renders as invisible controls on an invisible background. Blur and shadows come off, the tokens resolve to system colours, controls get real borders, and the canvas opts out so the artwork is not repainted by the OS palette. `prefers-contrast: more` gets a stronger border and text treatment short of that
- Stop recounting the selection mask on every toast. `_selectionSummary` reduced the whole mask for a status line, and it runs from every toast — 48 million elements a message on an 8000x6000 document with a selection. The count is cached when the mask is built and kept in step when Invert rewrites it in place
- Import photos the right way up. Phone and camera JPEGs record their rotation in EXIF rather than in the pixels and nothing read it, so those photos came in sideways. A small APP1/TIFF reader handles orientations 1-8 and rotates the pixels — not the object — so the correction survives export and every downstream operation sees corrected pixels. Export still re-encodes through the canvas, which drops EXIF entirely; that remains the privacy-preserving default
- Collect diagnostics a bug report can attach. Failures reached the user as a toast and the developer as nothing, which is why every issue filed against this project so far is prose and a screenshot. A ring buffer keeps the last 200 errors, warnings and job outcomes, the status bar shows an error count once there is one, and Export Diagnostics writes a JSON file with the version, engine, capability probe, document shape and that buffer. Nothing is transmitted, and the report deliberately carries no document or file names — only scalars survive into it
- Make toasts and command labels translatable, and count them. Translation reached menus, tabs and tooltips only; every toast and all ~140 command-palette labels stayed English, and the parity metric measured just the DOM-stamped subset, so it reported near-parity however much of the UI was untranslated. `toast()` now translates through the dictionary, so a static message picks up its entry without touching any of the 268 call sites and an interpolated one falls back to itself exactly as before; palette labels render and search translated; and the key inventory includes them, so the remaining gap is measured rather than hidden
- Revert the menu hover-latching added alongside the offset bridge in v0.25.0. The bridge is what fixed the reported bug and it stays; the 260ms close delay and pointer latching turned out to fight keyboard navigation differently in each engine, and the underlying `:hover` interaction needs designing rather than patching. It is recorded on the roadmap
- Step the transform instead of calling into Fabric per pixel when deleting a selection. The old loop allocated two object literals for every pixel, so a 4000x3000 layer meant 12 million matrix calls and 24 million short-lived objects on the main thread
- Stop re-rendering the canvas once per object added. Fabric renders on every add by default, which is wasted work during a PSD import or a project open — both add every object in one pass and render once at the end anyway
- Persist the layer-stacking and vector-stroke preferences. Both were session-only and reset on the next reload

## [v0.25.0] - 2026-07-31

### Fixed
- Give the Tab key back to focus navigation. The panel toggle ran `preventDefault()` on every Tab, so focus never advanced anywhere in the editor and the chrome blinked instead — the app was unusable by keyboard and failed WCAG 2.1.1 and 2.4.3. Tab now traverses; it toggles panels only while the canvas is the surface being worked on, which is the case the Photoshop binding was for, and the toggle is also in the command palette
- Stop the modal focus trap leaking Tab to the global shortcut handler. `_onModalTabKey` only intervened at the first and last focusable, so every press from the middle of a dialog fell through and was cancelled — the trap passed its test because the test only ever pressed at the two ends
- Release the welcome overlay when it is dismissed. It fades to `opacity:0` but keeps its layout box, so it stayed focusable and stayed on the modal stack forever: Tab traversed an invisible dialog, and every check of "is a modal open" answered yes for the rest of the session. It is now `inert`, released from the stack, and focus moves to the editor instead of being stranded in an inert subtree
- Prune disconnected entries whenever the modal stack is read, not only inside the Tab handler
- Stop an animated GIF import from replacing the document after the user cancels it. Declining "Discard unsaved changes?" skipped adding the image but installed the decoded frames anyway, so an unsaved animation was replaced by the file the user had just refused — with no history entry, so undo could not bring it back, and the next autosave persisted the wrong frames
- Keep menus open while the pointer travels into them. The dropdown sits 7px below its title and the menu closed as soon as the pointer was over neither, so crossing that offset dismissed the menu before the pointer arrived — at every window size. The offset is now bridged, and a short close delay lets the pointer take any route into the menu instead of only the one path that never leaves a hover target
- Sample the document instead of the viewport when building selections. Grow and Similar read the Fabric surface — which carries the zoom and pan — while indexing it with the document's dimensions, so away from 100% zoom every mask pixel was compared against an unrelated one. The magic wand and Color Range sampled the viewport too, building the mask at whatever resolution the current zoom rendered and then upsampling it back, so a wand used at 25% zoom produced a quarter-resolution selection with a stepped edge. All four now read one shared 1:1 document snapshot, which needs no conversion at all
- Read the right pixel on HiDPI displays. With `enableRetinaScaling` the backing store is devicePixelRatio times larger than the size the sampling code asked for, so on a 2x display the magic wand, Grow, Similar and Color Range all read the top-left quarter of the surface and the eyedropper picked the wrong pixel outright
- Write full coverage from Grow and Similar. Both set the mask to 1 rather than 255, and the mask is 0-255 coverage — so a grown pixel read as 0.4% selected: the tint overlay rounded it to invisible and deleting the selection left those pixels 99.6% intact while reporting success. Both now route through the shared setter, which also recomputes the bounds and the overlay, and both report how many pixels they selected
- Delete the selected pixels instead of the selection tint. The tint overlay is an image and is always the last object added, so "topmost image" resolved to it whenever a mask selection was active; it belongs to no layer, so the edit guard refused the write while the caller cleared the selection and toasted success regardless — two contradictory toasts, nothing deleted, and the selection gone so there was nothing to retry from
- Stop a failed shell re-stage from destroying a working offline install. Staging deleted the live cache before refetching, and "Rebuild Offline Shell" runs against the revision already active — so pressing it on a flaky connection wiped the offline app and left the 503 "not ready offline" page until the network came back. After a rollback there is no previous revision to fall back to, so re-staging is the only recovery path there was. Assets are now fetched into a scratch cache and swapped in only once every required one is in hand
- Retire three version strings that had been stale for three releases. The welcome screen — the first thing a new user sees — read v0.21 on a v0.24 build, and `appVersion: '0.21.0'` was stamped into every saved project, every history snapshot, every recovery generation and every exported action, so those files misdated themselves and any future compatibility gate keyed on that field would have misread them. There is one `OS.version` constant now, and the release check fails on a hardcoded stamp or any disagreeing version literal rather than only on the nine places it happened to list
- Coalesce arrow-key nudges into one history entry. Key auto-repeat fires around 30 times a second and every snapshot serialises the whole document including base64 rasters, so holding an arrow for two seconds filled the 60-entry history and evicted everything the user had done before it. The coalescing mechanism already existed and simply was not used here
- Record a history entry when duplicating a layer partly fails. The counter form only finished on the success path and the Fabric shim turns a clone rejection into a console warning, so one failure left the new layer spliced in with a partial object set, a stale panel and nothing for undo to remove. It now settles every clone first, keeps what succeeded, and says how many objects it could not copy
- Commit the filter value that is on screen. The preview is debounced by 50ms while Apply saved history and cleared the target immediately, so moving a slider and applying within that window committed the previous value under the new one's label. Apply now forces the pending tick through first
- Say something when a filter job is cancelled or superseded. The worker returns null in that case and all nineteen callers simply returned, leaving the panel open with no message and no way to tell whether Apply had done anything — and since starting a job cancels the previous one, double-clicking Apply reproduced it every time
- Commit Liquify before declaring success. The dialog closed and toasted immediately while the write was still in flight, so a refused commit produced a success and an error toast together with the liquify canvas already discarded
- Restore the viewport after a failed Before/After capture. Both capture paths reset the viewport, hid every overlay and zeroed the boundary opacity without a `finally`, so a throw from `toDataURL` — out of memory on a large canvas, or a tainted one — left the editor stranded at an identity viewport with its overlays hidden. The boundary's real opacity is restored now rather than a hardcoded 1
- Let Reselect work more than once. It handed back the stored selection object rather than a copy, so a later Invert or Grow mutated the stored one in place and there was nothing to return to a second time. Its marching-ants box also went back as raw CSS pixels, which is only correct at 100% zoom for a mask selection
- Clamp the crop rectangle to the document. Dragging clamped only to the viewport edge and the handles were not clamped at all, so a crop could describe a rectangle partly outside the document — passed straight through to the export and producing a new document with blank regions and no warning. The result is also checked against the maximum image size
- Stop "open as copy" from deleting the source document's recovery generations. The copy assigned its new id directly instead of adopting it, so the alias list still pointed at the document it was branched from and the two counted as one lineage; saving the copy cleared both
- Only initialise the editor once when the welcome screen is dismissed. A PWA file launch dismisses it after an await chain, so clicking through while that resolved ran the whole initialisation block again — a second flyout host and a duplicate set of document-level paste, drop and keydown listeners, so one Ctrl+Z performed two undos and one paste inserted the image twice
- Compress the image stream in exported PDFs. The document was created without compression and `addImage` was given no compression level, so every export embedded a raw stream — a 600x400 page came to roughly 940 KB. It now uses the Paeth-predicted FlateDecode path, which is more than three times smaller on the export the test measures
- Expose list, tool and status state to assistive technology. The layers and history panels declared `role="listbox"` with no options inside, so neither was navigable as a list; none of the 42 tool buttons said which one was active, because that was carried by a CSS class alone; and the toast container was `aria-hidden`, so every error, warning and destructive-action message was announced to nobody. Rows are options with a selected state, tool buttons carry `aria-pressed`, and toasts are a polite live region
- Upgrade ag-psd from 22.0.2 to 31.0.2 and give the PSD decode a real memory ceiling. The worker carried a comment saying ag-psd had no decode-time memory option and hand-rolled a two-pass area estimate instead; that has been untrue since ag-psd 31, which enforces `totalMemoryLimit` inside the allocator and throws rather than committing the allocation. The estimate pass stays, because it also enforces the per-layer and layer-count ceilings ag-psd has no notion of, but the decode is now bounded by the allocator rather than by an estimate that counted layers only
- Give selection bounds one meaning. They held screen pixels when a marquee made them and document pixels when a mask did, and the consumers disagreed about which: the box placer always applied the viewport, two restore paths never did, and the saved project recorded whichever it happened to be. Drawing a marquee at 300% zoom, saving and reopening put the marching ants in the wrong place at the wrong size. Bounds are document coordinates now, converted once where the box is drawn
- Ask before crop, flatten and canvas rotate/flip discard part of the document. All four rebuild it through the same path, which drops every guide, every animation frame and the PSD group metadata a PSD export depends on — and the only feedback was "Cropped to W x H". They now name exactly what would be lost and let you cancel, and say nothing when there is nothing to lose
- Give each new object its own layer. Creating text or a shape pushed it into whichever layer happened to be active, so the layers panel described a one-layer document however much was on the canvas — Illustrator's model under a Photoshop-shaped panel, and the complaint that opens issue #3. Object tools now add a layer above the active one, named after what was made (a text layer takes the text), holding just that object; deleting the layer takes the object with it. Existing projects keep the structure they were saved with, and Preferences has a "Stack new objects in the active layer" option for the previous behaviour

## [v0.24.0] - 2026-07-30

### Performance
- Move the highlight during animation playback instead of rebuilding the whole thumbnail strip on every tick. A 20-frame timeline at 12 fps was creating a div, an 80px canvas, an image decode and two listeners per frame, 12 times a second — roughly 240 decodes a second purely to move a border

### Security
- Drop `https://cdn.jsdelivr.net` from `script-src`. Fabric, ag-psd and jsPDF were `<script src>` tags on that host, and CSP does not require SRI on scripts it permits by host — so an allowance covering three pinned tags also let any HTML-injection sink load an arbitrary npm package. All three are now fetched, SHA-384 verified in page, and executed from `blob:` URLs, the same path the eight lazy assets already took, leaving `script-src 'self' <hashes> 'wasm-unsafe-eval' blob:`. Substituted bytes stop the editor with a visible message instead of quietly becoming the engine
- Judge every `href` in an exported SVG regardless of namespace, against an allowlist. The old `[xlink\:href]` selector matched nothing — attribute selectors match the local name in the null namespace, and `xlink:href` is exactly what fabric emits for images — so that branch was dead, and the plain-`href` checks were case-sensitive, letting `JAVASCRIPT:` and `Data:text/html` through a file handed to the user as sanitized

### Changed
- Measure what each engine actually provides instead of assuming Chromium. A capability probe now runs on all three engines and asserts the fallback for each optional platform feature: the file picker when there is no File System Access API, static GIF import without `ImageDecoder`, the recovery critical section without Web Locks, coordination without `BroadcastChannel`, and autosave without an origin-private file system. That last one is real: WebKit gives a `file://` origin no OPFS at all, so opening the single HTML file directly in Safari has no auto-save or crash recovery. The browser-support table says so now
- Collapse the duplicated model-load path. `_loadPipeline` and `_loadRmbgModel` each carried their own busy guard, job ownership, transformers load, device probe, progress plumbing, dispose-on-cancel and failure toast, so every change to the download experience had to be made twice; both now call one helper. The PSD import also stops keeping a second registry of a job `_computeJobs` already tracks
- One treatment per component instead of several. Sliders had three thumb designs and Firefox showed the pre-redesign thumb everywhere, because only `::-webkit-slider-thumb` had been restyled; there is now a single design on both vendor pseudo-elements, verified in Chromium and Firefox. Radii collapse to a 6/8/12 scale, menu bars, dropdown rows and the context menu share one hover treatment, and `transition:all` — which also animates layout-affecting properties — is replaced by named properties on three duration tokens. Hovering a colour swatch no longer tucks it under the swatch beside it, and the active animation frame is marked with a ring instead of a scale that overlapped its neighbours

### Fixed
- Export PDF pages at the document's real size. jsPDF's `px` unit produced an 800x533pt page for a 600x400 document — an 11.1 inch wide page at roughly 54 DPI — so printing or placing the file gave something a third larger than intended. Pages are now sized in points from CSS pixels (450x300pt, 6.25x4.17in at 96 DPI) with the raster still at full resolution, and the file carries a title, creator and language
- Write a resolution resource into exported PSDs. Without one the file declared no DPI at all and its physical size was whatever the reader defaulted to; it now declares 96 PPI, matching the PDF export
- Every AI feature was broken. Background removal, Segment Select, Depth Map and Object Detection each handed the model a `data:` URL, which Transformers.js reads with `fetch()` — and `connect-src` does not list `data:`, so the request was blocked the moment the model finished downloading. They now receive canvas pixels directly, which also skips a full-image PNG encode and decode. Verified by running background removal end to end against the pinned MODNet weights: 3.3 s cold including the 25.9 MB download, 0.8 s warm
- Report a model as loaded when background removal is holding it. Its handles live outside `_aiPipelines`, so the Offline & Install dialog and the backend report both claimed nothing was loaded while a model was resident
- Stop routing pixel filters to Photon unless its result matches the JavaScript worker byte for byte. Measured on a 16x16 fixture, Photon's grayscale differs by up to 58 levels (it does not use the Rec.601 weights the rest of the app and the histogram use), sepia by 192, threshold flips pixels outright, and the sharpen and emboss convolutions zero the alpha of the outermost pixel ring — a transparent one-pixel frame. Which result you got depended on whether an optional WASM download succeeded; only `invert` agrees, so only `invert` is accelerated
- Break cyclic PSD group parents when a project is opened rather than letting them silently drop layers from a PSD export. Validation checked only that a parent existed, which `parentId === id` and longer loops satisfy, and the writer emits only what the walk from the document root reaches — so a looped group and every layer parented into it vanished without a word. Cycles now flatten to the root with a warning, and the export report names anything the root walk still could not place
- Version the service worker's runtime cache with the shell and prune it alongside. It was unversioned, unbounded and cache-first, so a fix to any asset outside the enumerated shell never reached a client that had already cached it. Opaque responses are no longer stored at all — an opaque response hides its status, so a captive-portal or CDN error page was kept and served forever; cross-origin runtime requests are re-asked with CORS so the status is visible, and the cache is capped at 60 entries
- Stop recovery ownership from flapping when another tab owns the stream. Autosave switches this tab to a fresh document id, but every history snapshot embeds the old one, so each undo re-installed the contested id and the next autosave renamed again — orphaning a set of generations every time, which were then offered as unsaved work on a later launch. The surrendered ids are now tracked as a session lineage: snapshots no longer re-claim them, and Save Project clears the generations written under all of them
- Refuse to autosave while a document load is in flight. `canvasW/H` are assigned before `loadFromJSON` resolves, so a capture landing in that window persisted the outgoing document's content under the incoming document's dimensions, stored against the outgoing id — a generation that restored at the wrong size and could evict a good one under the five-per-document retention cap. The work now stays queued and flushes once the load settles

## [v0.23.0] - 2026-07-30

### Performance
- Bound undo history by retained memory as well as entry count. Each entry embeds full base64 image sources, so 60 steps on a 12 MP photo could retain gigabytes; history now evicts against a 192 MB budget, always keeping at least one entry, and Image Information reports the retained size
- Keep the Levels and Color Balance sliders interactive on large photos: each tick used to run a full-resolution pixel pass, encode the result to a PNG data URL, and decode it again. Previews now run on a downscaled proxy, swap the working canvas straight into the layer, and use a 256-entry lookup table instead of three `Math.pow` calls per pixel; Apply still commits at full resolution

### Added
- A pseudo-locale that accents and brackets every translated string, so any interface text that never went through the localisation machinery is obvious at a glance; the Chinese map is now gated at parity with English apart from format names and single-letter typographic controls

### Fixed
- Report each cached model's size and whether it is loaded, and let a model's cached files be cleared individually rather than only by wiping all site data
- Probe for a usable WebGPU adapter and fall back to WASM, instead of pinning both model pipelines to WASM while the README promised WebGPU; the chosen backend is shown with the download progress
- Rename Smart Upscale to Enlarge (resample) and move it out of the AI menu into Image, because it is stepped canvas resampling with a sharpening pass and no model is involved
- Set the document's language and direction when the locale changes, which assistive technology, hyphenation, and bidirectional text all depend on and which the locale switch never touched
- Give canvas text an explicit direction and mirror the menu chrome with logical properties, so a right-to-left locale no longer strands shortcuts and submenu arrows on the wrong edge or reorders Arabic mixed with Latin and numerals
- Collapse the two competing mobile stylesheets into one. The first block was almost entirely overridden — it set a 36px topbar against 44px, a flush-bottom toolbar against the floating one, and a 200px tablet panel against 248px — so edits to it did nothing and any reordering would have flipped the mobile layout wholesale. The animation timeline also now clears the floating toolbar instead of sitting under it
- Honour the New Image background choice: the colour picker was read by nothing, so every new document came out transparent whatever was selected. The dialog now offers Transparent, White, or a custom colour, and the swatch is enabled only when it applies
- Save every preference, not just the language: default canvas size, grid size, snap tolerance, history cap, and accent colour now survive a reload, and a corrupted store is clamped on the way in rather than being able to disable undo
- Read GIMP `.gpl` and Adobe `.ase` palettes, both of which the file picker already advertised while the reader only ever parsed JSON, and report why a palette was rejected instead of a bare "Invalid palette file"
- Populate the welcome screen's Recent list, which was permanently empty because nothing ever recorded an opened document, and present the rows as the history record they are rather than as clickable shortcuts that did nothing

## [v0.22.0] - 2026-07-30

### Performance
- Run Solarize, Vibrance, Exposure, Shadows/Highlights, Photo Filter, Curves, Channel Mixer, Auto Levels, Auto Contrast, and Auto Enhance in the filter worker instead of blocking the main thread, so they can be cancelled mid-run and the interface stays responsive on large images
- Coalesce the Color Range preview instead of recomputing the whole mask on every fuzziness slider tick

### Added
- Keyboard alternatives to every drag: arrow keys move the selected object, Shift makes the step 10px, Alt resizes it, and Ctrl+Alt+Up/Down reorders the active layer
- Automated WCAG 2.2 gates for text contrast in all three themes, 24x24 minimum pointer targets, and the non-drag paths above
- Cross-engine test gate: the core open, edit, filter, save, recover, export, keyboard, and dialog flows now run automatically on Firefox and WebKit as well as Chromium (`npm run test:cross-browser`)
- A single assertion that keeps the version in `package.json`, `package-lock.json`, the README badge, the changelog, the page title, the in-app labels, and the offline shell revision aligned

### Security
- Add `base-uri 'none'` and `form-action 'none'` to the content security policy, neither of which falls back to `default-src`, closing a `<base href>` injection that could have redirected every relative URL including the service worker
- Widen the inline-handler check in the security gate from four specific attributes to any `on*=` handler, so an `onerror=` or `onload=` can no longer pass a gate that claims to cover them

### Fixed
- Store pixel selections in document space instead of screen space: zooming or panning between selecting and deleting no longer erases a different part of the image, and deleting below 100% zoom no longer leaves a sparse grid of surviving pixels
- Make the Lasso select the shape it encloses instead of its bounding box, mapped through the current zoom and pan, with a soft antialiased edge
- Give selections real partial coverage: Feather now keeps the gradient it computes instead of throwing it away and widening the hard edge by a pixel, deleting fades pixels by how selected they are, and the selection tint shows the falloff
- Delete every pixel under the selection on a layer scaled below 100%, which previously kept two out of three because the mask was stamped onto the image rather than sampled by it
- Preserve partial selection coverage in saved projects; projects written with the older one-bit format still open
- Keep the marching-ants box over the selection when the viewport moves
- Rescale selection masks saved by earlier versions into the document when a project is opened, rather than leaving them addressing pixels the document does not have
- Stop filters reporting success before the edit is actually committed: the "applied" toast, the panel close, and Reapply Last Filter now wait for the commit, so a result rejected because the document changed no longer produces two contradictory messages
- Apply one consistent rule for whether an edit is still valid, so a target removed from the canvas or on a locked layer is rejected the same way by every path instead of three different ways
- Stop the full-screen progress dialog flashing for filters that finish in a few milliseconds
- Raise the contrast of the welcome card's helper text, the active export-format and curves-channel pills, and the export preview placeholder, all of which fell below 4.5:1
- Enlarge the zoom readout, the offline status chip, the palette buttons, and the preference fields to the 24x24 minimum
- Correct the browser-support table to say what is actually verified on each engine rather than claiming blanket full support
- Sync `package-lock.json`, which still declared 0.20.0 after the 0.21.0 release
- Guard the last ten pixel adjustments against a document that changed while they ran: a result that arrives after the layer was replaced, deleted, or edited is now discarded rather than written over the new pixels
- Let a second AI request take over from the model download it cancels — starting one while another was loading used to kill both and require a third click
- Operate the whole menubar from the keyboard: arrow keys move between menus and rows, Enter or Space opens and activates, Home and End jump to the ends, typing a letter jumps to the next matching row, Escape closes one level at a time, and clicking a menu title now keeps it open instead of requiring the pointer to stay put
- Announce menus correctly to screen readers: menus, rows, separators, and submenu state carry real roles, submenu arrows and nested rows no longer leak into a menu's own name (Filter announced as "Filter ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸"), shortcuts are exposed as key shortcuts rather than name text, and the "Models download on first use" note in the AI menu is no longer hidden from assistive technology
- Keep Tab inside the open dialog instead of letting it walk into the editor behind, move focus into a dialog when it opens, and hand focus back to the control that opened it when it closes — applied to every dialog, the welcome launcher, and the command palette
- Name every dialog to assistive technology from its own heading and mark it modal, without publishing the same dialog twice for panels that already declared themselves
- Follow the selected theme in the last chrome that ignored it: lasso fill, welcome glow and primary-button glow, template-card hover, layer-thumbnail transparency checkerboards, ruler guides, and smart guides now come from the token scale
- Paint Free Transform handles in the accent colour — the handle colour was a CSS variable string handed to the canvas, which is not a valid fill and was silently discarded
- Stop Escape from falling through a dialog that has no cancel button: pressing it during the crash-recovery prompt no longer dismisses the welcome screen underneath and reaches the canvas shortcut handler

## [v0.21.0] - 2026-07-30

### Fixed
- Stop the import sanitizer from rewriting the editor's own snapshots: undo, redo, transaction rollback, project open, and recovery restore now preserve multi-line text, text longer than 500 characters, and base64 image sources exactly
- Keep selection overlays out of PNG, JPEG, WebP, PDF, PSD, flatten, crop, and before/after captures; the tint no longer bakes into exported or flattened pixels at any zoom level
- Stop a second command started during an in-flight asynchronous command from rolling back the first command's work
- Keep the document marked unsaved when an edit lands while a project save is clearing recovery generations
- Confirm before replacing a document that has unsaved changes, from New Image, templates, Open Image, Open Project, Open PSD, drag and drop, and installed-app launches, with a Save first option
- Show the crash-recovery offer above the welcome launcher instead of behind it, so it is visible on the first run after a crash

- Stop the hosted offline shell from rolling back an update after a single unconfirmed navigation; opening a second tab, refreshing during load, or closing the tab early no longer discards a healthy update, the rolled-back shell cache is retained, and a Rebuild Offline Shell action can re-stage without waiting for a new revision
- Report a cached shell against the asset manifest that populated it, so changing the pinned asset list no longer reports a complete shell as incomplete forever

- Make the Midnight and OLED themes apply to the whole studio: the precision-studio chrome now draws from the design tokens instead of ~170 hardcoded literals, so the topbar, toolbar, panels, dialogs, status bar, and canvas well all follow the selected theme, and the canvas-drawn rulers, curves grid, histogram, navigator, and before/after chrome repaint on a theme change
- Persist the selected theme across reloads and apply it during startup rather than after the welcome screen is dismissed
- Validate numeric dialog input instead of silently substituting defaults: New Image, Resize Canvas, and Preferences now clamp to their declared ranges, so a negative or empty value can no longer create an invalid canvas or disable undo by setting a non-positive history limit
- Reject invalid amounts in Expand, Contract, and Border Selection, and keep the existing selection when the operation would clear it, instead of wiping it and reporting "expanded by NaNpx"
- Show the accent colour currently in effect when Preferences opens, so applying an unrelated preference no longer resets a customised accent
- Keep toasts readable: errors stay on screen long enough to read, long messages wrap instead of overflowing, hovering pauses dismissal, clicking dismisses, and toasts are no longer hidden behind the timeline, macro, Liquify, or before/after surfaces
- Close filter panels, Liquify, and before/after with Escape instead of falling through to the canvas and clearing the selection while the panel stays open
- Keep modeless workspace panels below modal dialogs so a dialog is never overlapped by an un-dimmed panel
- Stop the status bar from re-announcing on every pointer move, and announce each toast once instead of twice
- Replace version-control jargon in the save-state and offline chips with plain language
- Report images that fail to decode instead of doing nothing at all, and stop renaming the open document when an open fails
- Bound animated GIF import by frame count and decoded size, close the decoder on every path, and discard a slow import if the document changed meanwhile
- Accept PSD and `.openshop` files dropped anywhere in the window, not only over the canvas, and say when extra dropped files are ignored
- Allow SVG in the Open Image picker, which previously advertised SVG but greyed it out
- Walk one step per undo when undo or redo is triggered faster than a restore completes; overlapping restores no longer interleave or mis-map layer membership
- Preserve layer masks, per-object opacity, blend mode, skew, shadow, and the object's own name when a filter or AI operation commits pixels
- Report filter failures instead of leaving the dialog open with no feedback when a worker errors
- Make Ctrl+K work on the welcome screen where it is advertised, and stop advertising Ctrl+Shift+P and Ctrl+N, which the browser reserves; the fullscreen shortcut is now listed consistently as F
- Confirm dialogs with Enter, matching the existing Escape-to-cancel behaviour
- Explain when the command palette has no matches and when its list is truncated
- Report the real outcome of Batch Export instead of always claiming success, and say when no format is selected
- Offer an inline undo when clearing the palette or recorded actions, which canvas history cannot recover
- Warn once that animation frames are flattened snapshots before the timeline replaces a multi-layer stack
- Translate the renamed Save Project menu item in Simplified Chinese
- Restore the previous document when opening a project or recovery generation fails partway through, instead of leaving a half-replaced canvas whose layers panel, history, and save state disagree
- Enforce the PSD decode budget before any pixels are allocated by reading the layer structure first; the previous `totalMemoryLimit` option does not exist in ag-psd and was silently ignored, so a small crafted file could exhaust memory during decode
- Export eraser strokes as erased pixels rather than solid black in PSD layers
- Release sticky-note drag listeners when a note is deleted instead of leaving document-level handlers behind for the session
- Retry a lazily loaded runtime library once bypassing the HTTP cache when its integrity check fails, so a poisoned cache entry no longer disables that feature until the cache expires
- Make template cards, New Image size presets, and the zoom indicator real buttons so they can be reached and activated from the keyboard, and give the layer visibility and lock controls accessible names
- Keep the export dialog's alpha preference when the JPEG format button is clicked more than once
- Report GIF export failures, clamp the frame rate to a usable range, and release the exported blob
- Explain why recovery actions are unavailable for a corrupt generation instead of showing an unexplained disabled button

### Performance
- Stop encoding a full-resolution PNG of the whole document on every edit and every zoom step: the navigator now renders at thumbnail scale, zoom and pan update only the viewport rectangle, and minimap and histogram refreshes coalesce into one frame and skip entirely while their panels are hidden

### Removed
- Delete unreachable code: the unused layer-rebuild, legacy recovery-restore, duplicate new-document and background-removal wrappers, and a PSD branch that could never run

### Changed
- Reimagine the editor as a high-contrast precision studio with a floating tool dock, structured inspector cards, technical canvas workspace, local-only trust indicator, and compact ready state
- Replace the welcome screen with a responsive local-first workspace launcher whose templates and primary actions remain reachable from phone through desktop widths
- Make mobile inspector groups independently usable through a bounded, scrollable drawer with no horizontal page overflow
- Unify project save/open, recovery, and history on document schema v1 with stable layer/object identity, masks, guides, selections, animation, active-state preservation, and legacy OpenShop/Fabric migration
- Make project and recovery writes transactional with visible clean/dirty/saving/saved/error states, acknowledged worker autosaves, revision-safe concurrent edits, and stale file-handle resets on new/open/recovery flows
- Move the complete PSD decode into a cancellable worker and atomically prepare every decoded layer before replacing the open document
- Keep all onboarding actions and dialog footers reachable at supported phone, tablet, portrait, and landscape sizes with safe-area spacing, touch-sized controls, and keyboard dismissal
- Keep layer ownership, panel order, Fabric stacking, export order, and edit eligibility synchronized; lock, visibility, opacity, blend, rename, and reorder changes now round-trip through history and project files
- Replace label-based macros with validated schema-v1 commands and atomic action replay; initialize history without a fake edit, coalesce live previews, and make crop, flatten, canvas rotation/flip, and frame changes fail-safe and exactly undoable
- Make raster export alpha/matte behavior explicit with real previews and format-loss guidance; keep checker pixels out of PNG, WebP, JPEG, SVG, and PDF output, restore temporary canvas state on failure, and leave project dirty state untouched
- Preserve nested PSD groups, supported blends, 0–1 opacity, visibility, locks, and basic editable text across import/export/reimport; avoid composite-layer duplication and report precise whole-document or per-layer raster fallbacks for unsupported semantics
- Replace the singleton autosave with checksum-verified immutable OPFS generations, staged promotion, bounded retention, corrupt-newest fallback, legacy migration, quota/durability UI, per-generation recovery actions, and cross-tab ownership forks
- Split distribution into a truthful network-first standalone file and a hosted PWA with a verified offline shell, health-confirmed updates, automatic rollback, install/cache diagnostics, and installed-app image/PSD/`.openshop` launch handling; project saves now use the dedicated extension while legacy `.json` remains readable
- Route PSD import, worker filters, AI inference, and chunked pixel post-processing through cancellable document jobs that reject pending work, terminate disposable workers, discard stale replies, and commit pixels/history only while the original document revision and target remain current

### Security
- Upgrade Fabric.js from 5.3.1 to 7.4.0 with legacy project adapters and browser regressions for stored-SVG injection through object IDs and gradient colors
- Refresh the contributor lock to PostCSS 8.5.25 and Nano ID 3.3.16, synchronize its root version, and add a release test command that fails on high or critical npm advisories
- Enforce a 256 MB aggregate PSD decoded-pixel budget in addition to existing file, canvas, layer-count, nesting, and per-layer bounds
- Replace 380 executable HTML event attributes with opaque actions backed by a frozen 288-entry listener registry
- Remove `unsafe-inline` and unrestricted `unsafe-eval` from script policy, hash both reviewed inline scripts, and add a release check that rejects stale hashes or handler regressions
- SHA-384 verify every lazy PSD, Photon, GIF, Transformers.js, and ONNX runtime payload before executing it; poisoned responses fail closed and are not retained

## [v0.19.1] - 2026-07-01

### Fixed
- Fix _sanitizeProjectValue truncating base64 data URLs to 500 chars, destroying saved projects on load (P0)
- Fix deselectSelection undefined method in context menu (should be deselectAll)
- Fix deleteLayer crash when all layers removed (auto-create empty layer)
- Fix _applyPreferences overwriting current document dimensions with default preferences
- Fix _selectionPath undefined reference in context menu (use _selectionBounds)
- Fix duplicateLayer async clone race: defer saveHistory until all clones complete
- Fix selectFrame destroying canvas state: rebuild boundary and layers after clear
- Fix filter worker race condition on concurrent operations via job ID message routing
- Fix blob URL memory leaks across all export/download paths (revoke after 60s)
- Fix draggable filter panel document listener leak via AbortController cleanup
- Fix guide listener leak on clearGuides (store and call cleanup functions)
- Fix _hexToRgba and _hexToOklch failing on 3-digit hex shorthand (NaN propagation)
- Fix previewLayerStyle drop shadow silently overwritten by outer glow (prioritize drop shadow)

### Security
- Fix SVG sanitizer only stripping 4 of 70+ event handler attributes (now strips all on* attributes)
- Fix macro replay allowing execution of private/internal methods via crafted JSON
- Fix macro load accepting arbitrary unvalidated JSON arrays

### Changed
- Timeline and macro panel positions now use CSS variables instead of hardcoded pixel offsets
- Recording indicator, macro button, AI progress bar, and grid colors now use theme CSS variables
- Active tool button box-shadow uses glass-border variable instead of hardcoded accent rgba
- Mobile panels accessible via slide-over drawer with toggle button instead of permanently hidden
- Color Range dialog wraps to fit mobile viewport
- Meta charset moved to first child of head per HTML spec
- Command palette input has aria-label for screen readers

## [v0.19.0] - 2026-07-01

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
