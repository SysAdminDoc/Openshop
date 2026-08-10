import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { check, checkServiceWorker } from '../tools/security.mjs';
import {
  OPENSHOP_BOOT_ASSETS,
  OPENSHOP_RUNTIME_ASSETS,
  licenseReport
} from '../tools/runtime-assets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const serviceWorker = readFileSync(join(root, 'sw.js'), 'utf8');

describe('canonical runtime asset manifest', () => {
  test('has unique keys and URL/integrity identities', () => {
    const assets = [...OPENSHOP_BOOT_ASSETS, ...OPENSHOP_RUNTIME_ASSETS];
    expect(new Set(assets.map(asset => asset.key)).size).toBe(assets.length);
    expect(new Set(assets.map(asset => `${asset.url}\n${asset.integrity}`)).size)
      .toBe(assets.length - 1);
    expect(assets.every(asset => /^sha384-[A-Za-z0-9+/=]+$/.test(asset.integrity))).toBe(true);
  });

  test('matches the shipped page and service-worker manifests', () => {
    expect(check(html)).toMatchObject({ bootAssets: 3, lazyAssets: 23 });
    expect(checkServiceWorker(serviceWorker)).toMatchObject({
      requiredAssets: 12,
      optionalAssets: 4,
      cacheableAssets: 26
    });
  });

  test('keeps the font stack local to the device', () => {
    expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/i);
    expect(serviceWorker).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/i);
  });

  test('refuses a service worker that omits a lazy asset from its cache allowlist', () => {
    const changed = serviceWorker.replace(
      '    "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284/build/pdf.min.mjs",\n',
      ''
    );
    expect(() => checkServiceWorker(changed)).toThrow(/not cache-allowlisted/);
  });

  test('can produce a traceable package/license inventory', () => {
    const report = licenseReport();
    expect(report).toHaveLength(26);
    expect(report.every(asset => asset.packageName && asset.version && asset.url && asset.license)).toBe(true);
  });
});
