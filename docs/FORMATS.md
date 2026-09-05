# Formats and compatibility

OpenShop shows a compatibility report when an import or export needs a fallback. Read that report before replacing an original file. The native `.openshop` format is the only format intended to preserve every OpenShop editing feature.

## Image and document formats

| Format | Import | Export | What to expect |
|---|---:|---:|---|
| PNG | Yes | Yes | Alpha and supported color-profile data are retained. Editable objects become pixels on export. |
| JPEG | Yes | Yes | No alpha. Export can preserve selected EXIF and XMP fields, remove all metadata, or remove location data only. |
| WebP | Yes | Yes | Animated imports keep frames and timing. Export support depends on the selected still or animation workflow. |
| APNG | Yes | No | Frames and timing are retained when opened as a document. |
| AVIF | Yes | Yes | A pinned WASM codec provides deterministic fallback decoding and encoding. |
| HEIC and HEIF | Yes | No | Native decoding is tried first. The verified fallback imports the first image from a sequence. |
| JPEG XL | Yes | No | Native decoding is tried first, followed by a verified WASM fallback. |
| BMP | Yes | No | Imported as raster pixels. |
| SVG | Yes | Yes | Supported shapes, text, groups, paths, and text spans stay editable. Unsupported constructs are reported or rasterized. |
| PDF | Yes | Yes | Import creates a layer per page. All-vector documents can produce real vector path operators; visible raster content produces raster output where needed. |
| Camera RAW | Yes | No | LibRaw/WASM creates a demosaiced editing preview. The source RAW file is not modified. |
| PSD | Yes | Yes | Pixel layers, nested groups, common blend modes, opacity, visibility, basic single-style text, and supported profile metadata can round-trip. See the PSD notes below. |
| OpenRaster | Yes | Yes | Supported layer pixels, names, offsets, visibility, opacity, and blend modes are retained. |
| GIF | Yes | Yes | Animated frames and timing are supported. |
| OpenShop project | Yes | Yes | Preserves the complete editable document, including history-related state that interchange formats cannot store. |

## PSD boundaries

OpenShop parses the PSD structure in a cancellable worker before it commits a new document. Layer pixels are decoded on demand under explicit file, layer, pixel, and memory limits.

Supported pixel layers and nested groups remain live. Common blend modes, opacity, visibility, locks, simple horizontal text, and embedded ICC profile metadata can survive import and export.

Some Photoshop constructs do not have an exact OpenShop equivalent:

- Layer effects, clipping relationships, adjustment layers, separate fill opacity, and unsupported masks can use the document composite as a flattened appearance fallback.
- Smart Objects and rich text can use decoded per-layer pixels when their native structure cannot be represented.
- OpenShop pixel filters and masks are baked into PSD layer pixels on export.
- Mixed-style text and vector objects are rasterized when the PSD writer cannot keep them editable.

The compatibility report records a path, feature, fallback, and explanation for every known loss.

## OpenRaster boundaries

OpenRaster export writes the required `mimetype`, `stack.xml`, PNG layer files, a merged image, and a thumbnail. Supported opacity, visibility, offsets, names, and blend modes remain layered. Groups or uncommon constructs that need approximation appear in the compatibility report.

## Animation behavior

Opening or dropping an animated GIF, APNG, or WebP onto a blank workspace keeps its frames and delays. Placing one inside an existing document displays the first frame as the editable object while retaining the original animation payload in the OpenShop project.

## Color and metadata

OpenShop reads supported profiles from JPEG, PNG, WebP, AVIF, and PSD files. Matrix/TRC profiles are converted into the browser's working space when needed. PNG, JPEG, WebP, AVIF, and PSD writers embed the active profile where their containers and writers allow it.

Raster metadata choices appear in Export Settings:

- **Strip location only** is the default.
- **Strip all metadata** removes supported EXIF and XMP fields.
- **Preserve imported EXIF/XMP** keeps supported fields where the writer can carry them.

When a file contains a C2PA marker, OpenShop can load its read-only Content Credentials verifier. It reports the active manifest and validation result. OpenShop does not sign or re-sign exports.

## Palettes, brushes, and gradients

Use **Color > Swatches > Import** for ASE or GPL palettes, ABR brush sets, GRD gradients, and supported JSON assets. Bounds and input checks apply before an imported asset is stored. Unsupported native brush or gradient behavior is named in the import report.

## Batch processing

Batch mode accepts raster images plus an `openshop-command-sequence` action recipe. It produces a ZIP containing PNG, JPEG, or WebP results while retaining relative paths. SVG, AVIF, RAW, and project inputs are refused because their behavior would be ambiguous in this workflow. A failed file is reported without presenting the batch as fully successful, and cancellation occurs between safe file boundaries.

## Choosing a working format

Save a native OpenShop project while you are still editing. Export to PSD or OpenRaster when another layered editor needs the file. Use SVG for supported vector work. Choose a raster format only when a flattened result is intentional.
