import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  OPENSHOP_BOOT_ASSETS,
  OPENSHOP_CACHEABLE_RUNTIME_ASSETS,
  OPENSHOP_LOCAL_SHELL_ASSETS,
  OPENSHOP_OPTIONAL_RUNTIME_KEYS,
  OPENSHOP_REQUIRED_BOOT_KEYS,
  OPENSHOP_RUNTIME_ASSETS,
  OPENSHOP_RUNTIME_ORIGINS,
  assetsForKeys,
  validateRuntimeProvenance
} from './runtime-assets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

validateRuntimeProvenance();

function quote(value) {
  return JSON.stringify(value);
}

function renderBootAssets() {
  return [
    '/* OPENSHOP_RUNTIME_MANIFEST:BOOT:BEGIN */',
    'const OPENSHOP_BOOT_ASSETS = Object.freeze([',
    OPENSHOP_BOOT_ASSETS.map((value, index) => [
      '    Object.freeze({',
      `        name:${quote(value.name)},`,
      `        url:${quote(value.url)},`,
      `        integrity:${quote(value.integrity)}`,
      `    })${index === OPENSHOP_BOOT_ASSETS.length - 1 ? '' : ','}`
    ].join('\n')).join('\n'),
    ']);',
    '/* OPENSHOP_RUNTIME_MANIFEST:BOOT:END */'
  ].join('\n');
}

function renderLazyAssets() {
  return [
    '    /* OPENSHOP_RUNTIME_MANIFEST:LAZY:BEGIN */',
    '    _runtimeAssets: Object.freeze({',
    OPENSHOP_RUNTIME_ASSETS.map((value, index) => [
      `        ${value.key}: Object.freeze({`,
      `            url:${quote(value.url)},`,
      `            integrity:${quote(value.integrity)},`,
      `            type:${quote(value.type)}`,
      `        })${index === OPENSHOP_RUNTIME_ASSETS.length - 1 ? '' : ','}`
    ].join('\n')).join('\n'),
    '    }),',
    '    /* OPENSHOP_RUNTIME_MANIFEST:LAZY:END */'
  ].join('\n');
}

function renderShellAssets() {
  const required = [...OPENSHOP_LOCAL_SHELL_ASSETS, ...assetsForKeys(OPENSHOP_REQUIRED_BOOT_KEYS).map(value => value.url)];
  const optional = assetsForKeys(OPENSHOP_OPTIONAL_RUNTIME_KEYS).map(value => value.url);
  const shellUrls = new Set([...required, ...optional]);
  const cacheable = OPENSHOP_CACHEABLE_RUNTIME_ASSETS
    .map(value => value.url)
    .filter(url => !shellUrls.has(url));
  return [
    '/* OPENSHOP_RUNTIME_MANIFEST:SHELL:BEGIN */',
    'const REQUIRED_ASSETS = [',
    required.map(value => `    ${quote(value)}`).join(',\n'),
    '];',
    '',
    'const OPTIONAL_ASSETS = [',
    optional.map(value => `    ${quote(value)}`).join(',\n'),
    '];',
    '',
    'const RUNTIME_ORIGINS = new Set([',
    OPENSHOP_RUNTIME_ORIGINS.map(value => `    ${quote(value)}`).join(',\n'),
    ']);',
    '',
    'const CACHEABLE_RUNTIME_URLS = new Set([',
    '    ...REQUIRED_ASSETS,',
    '    ...OPTIONAL_ASSETS,',
    cacheable.map((value, index) => `    ${quote(value)}${index === cacheable.length - 1 ? '' : ','}`).join('\n'),
    '].map(resolveAsset));',
    '/* OPENSHOP_RUNTIME_MANIFEST:SHELL:END */'
  ].join('\n');
}

function replaceOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Cannot find ${label} block`);
  return source.replace(pattern, replacement);
}

let index = readFileSync(join(root, 'index.html'), 'utf8');
index = replaceOnce(
  index,
  /(?:\/\* OPENSHOP_RUNTIME_MANIFEST:BOOT:BEGIN \*\/\n)?const OPENSHOP_BOOT_ASSETS = Object\.freeze\(\[[\s\S]*?\n\]\);(?:\n\/\* OPENSHOP_RUNTIME_MANIFEST:BOOT:END \*\/)?/,
  renderBootAssets(),
  'boot runtime manifest'
);
index = replaceOnce(
  index,
  /(?:    \/\* OPENSHOP_RUNTIME_MANIFEST:LAZY:BEGIN \*\/\n)?    _runtimeAssets: Object\.freeze\(\{[\s\S]*?\n    \}\),\n(?:    \/\* OPENSHOP_RUNTIME_MANIFEST:LAZY:END \*\/\n)?    _runtimeAssetPromises:/,
  `${renderLazyAssets()}\n    _runtimeAssetPromises:`,
  'lazy runtime manifest'
);
writeFileSync(join(root, 'index.html'), index);

let serviceWorker = readFileSync(join(root, 'sw.js'), 'utf8');
serviceWorker = replaceOnce(
  serviceWorker,
  /(?:\/\* OPENSHOP_RUNTIME_MANIFEST:SHELL:BEGIN \*\/\n)?const REQUIRED_ASSETS = \[[\s\S]*?const CACHEABLE_RUNTIME_URLS = new Set\(\[[\s\S]*?\n\]\.map\(resolveAsset\)\);(?:\n\/\* OPENSHOP_RUNTIME_MANIFEST:SHELL:END \*\/)?/,
  renderShellAssets(),
  'service-worker runtime manifest'
);
writeFileSync(join(root, 'sw.js'), serviceWorker);

console.log(`Synchronized ${OPENSHOP_BOOT_ASSETS.length} boot and ${OPENSHOP_RUNTIME_ASSETS.length} lazy runtime assets.`);
