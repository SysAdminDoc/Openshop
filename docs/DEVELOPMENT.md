# Development

OpenShop ships as static files. Node.js is used only for local tests, release checks, and screenshot capture.

## Requirements

- Node.js 22.22.2 or newer
- npm
- Browsers installed by Playwright

Install the contributor dependencies:

```bash
npm ci
npx playwright install
```

Open `index.html` directly for the portable lane. The Playwright tests start their own local server for hosted, service-worker, and offline checks.

## Everyday checks

```bash
npm test
npm run css:check
npm run security:check
npm run test:e2e
```

The complete release gate adds dependency auditing, coverage, measured performance budgets, Firefox and WebKit checks, plus mobile viewport coverage:

```bash
npm run test:release
```

All release verification runs locally. The repository does not use a remote build or test workflow.

## Inline scripts and runtime assets

OpenShop's two inline scripts are covered by exact Content Security Policy hashes. After changing either script, update the generated policy:

```bash
npm run security:write
```

Pinned CDN libraries and optional codecs come from the canonical manifest in `tools/runtime-assets.mjs`. After changing a URL, version, integrity value, or shell asset, run:

```bash
npm run runtime:sync
npm run security:write
npm run security:check
```

The security check rejects stale hashes, unverified executable paths, undeclared interface actions, unsafe event attributes, and service-worker assets that drift from the manifest.

## Release metadata

Keep the semantic version aligned in:

- `package.json` and `package-lock.json`
- `manifest.webmanifest`
- every release-facing version in `index.html`
- fixture versions used by the compatibility suite
- `tests/visual-snapshot-release.json`
- the README badge and newest changelog heading

`package.json` owns the service-worker revision number. `tools/release-metadata.mjs` combines it with the version, and the tests require `sw.js` to match.

When the shell changes, refresh the release-scoped Chromium baselines:

```bash
npx playwright test tests/openshop.e2e.spec.js --project=chromium --update-snapshots=all
```

Inspect every changed image before committing it. Firefox and WebKit render text differently and do not share the Chromium baseline files.

## Marketing captures

The screenshot script creates a deterministic layered sample inside the real editor and captures four useful product states:

```bash
npm run marketing:capture
```

It runs Chromium headlessly and writes the README images under `assets/screenshots/`. It also refreshes the wide and narrow PWA install images under `design/`. If the interface changes, regenerate and visually inspect all captures.

The social preview source is `design/openshop-social-preview-source.svg`. Its final PNG contains an actual editor capture. Keep the headline readable at small social-card sizes and do not replace the product image with a fabricated interface.

## Service-worker changes

The hosted shell installs into a trial cache before promotion. A new shell must pass its startup health check, and rollback depends on the previous revision remaining in `TRUSTED_SHELL_REVISIONS`.

Serve OpenShop from its own subdirectory during manual checks. A service worker controls its directory and descendants. Putting `sw.js` at a shared origin root can affect unrelated pages.

## Pull requests

Keep changes focused and include a reproducible test for behavior changes. Mention whether you exercised the standalone file, the hosted lane, or both. Do not treat viewport emulation as physical-device validation.
