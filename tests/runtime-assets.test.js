import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { check, checkServiceWorker } from '../tools/security.mjs';
import {
  OPENSHOP_BOOT_ASSETS,
  OPENSHOP_RUNTIME_ASSETS,
  licenseReport,
  validateRuntimeProvenance
} from '../tools/runtime-assets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
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
    expect(check(html)).toMatchObject({ bootAssets: 3, lazyAssets: 27 });
    expect(checkServiceWorker(serviceWorker)).toMatchObject({
      requiredAssets: 12,
      optionalAssets: 4,
      cacheableAssets: 30
    });
  });

  test('keeps the font stack local to the device', () => {
    expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/i);
    expect(serviceWorker).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/i);
  });

  test('refuses a service worker that omits a lazy asset from its cache allowlist', () => {
    const changed = serviceWorker.replace(
      '    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.min.mjs",\n',
      ''
    );
    expect(() => checkServiceWorker(changed)).toThrow(/not cache-allowlisted/);
  });

  test('can produce a traceable package/license inventory', () => {
    const report = licenseReport();
    expect(report).toHaveLength(30);
    expect(report.every(asset => asset.packageName && asset.version && asset.url && asset.license)).toBe(true);
    expect(report.every(asset => !/not declared|unknown/i.test(asset.license))).toBe(true);
    expect(report.filter(asset => asset.packageName === 'modern-gif').every(asset => asset.license === 'MIT')).toBe(true);
    expect(report.filter(asset => asset.packageName === 'libraw-wasm').every(asset => asset.license === 'ISC')).toBe(true);
  });

  test('fails closed for unresolved and non-SPDX license values', () => {
    const asset = OPENSHOP_RUNTIME_ASSETS.find(value => value.key === 'gifCodec');
    expect(() => validateRuntimeProvenance([{ ...asset, license: null }])).toThrow(/no SPDX license identifier/);
    expect(() => validateRuntimeProvenance([{ ...asset, license: 'not declared in manifest' }]))
      .toThrow(/not a valid SPDX identifier/);
  });

  test('keeps the README runtime inventory synchronized with the canonical manifest', () => {
    const inventory = new Map();
    for (const asset of licenseReport()) {
      const prior = inventory.get(asset.packageName);
      if (prior) {
        expect(asset.version).toBe(prior.version);
        expect(asset.license).toBe(prior.license);
      } else {
        inventory.set(asset.packageName, asset);
      }
    }
    const rows = readme.split(/\r?\n/).filter(line => line.startsWith('|'));
    for (const [packageName, asset] of inventory) {
      const row = rows.find(line => line.includes(`\`${packageName}\``));
      expect(row, `README is missing ${packageName}`).toBeDefined();
      expect(row).toContain(asset.version);
      expect(row).toContain(`(${asset.license})`);
    }
  });

  test('keeps embedded dependency findings tied to the exact pinned bundle', () => {
    expect(validateRuntimeProvenance()).toBe(true);
    const report = licenseReport();
    const jsPdf = report.find(asset => asset.key === 'jsPdf');
    expect(jsPdf.provenance).toMatchObject({
      verifiedFor:'4.2.1',
      verifiedUrl:'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',
      embeddedDependencies:[]
    });
    expect(jsPdf.provenance.dependencyFindings).toEqual([
      expect.objectContaining({
        packageName:'dompurify',
        declaredRange:'^3.3.1',
        observedVersion:null,
        embedded:false,
        reachable:false
      })
    ]);
  });
});
