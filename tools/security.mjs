import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
const indexPath = join(root, 'index.html');
const serviceWorkerPath = join(root, 'sw.js');
const write = process.argv.includes('--write');
const EXPECTED_INLINE_SCRIPTS = 2;
const TRUSTED_TYPES_POLICY_NAME = 'openshop-loader';
const VERIFIED_ASSET_ORIGINS = new Set(OPENSHOP_RUNTIME_ORIGINS);
const SCRIPT_SOURCE_TOKENS = new Set(["'self'", "'wasm-unsafe-eval'", 'blob:']);
const REQUIRED_POLICY_DIRECTIVES = new Map([
  ['base-uri', ["'none'"]],
  ['object-src', ["'none'"]],
  ['connect-src', null]
]);
// CSP3 defines these as response-header controls. A meta-delivered policy can
// carry the text, but the browser must ignore it; accepting it here would make
// the release gate certify protection the shipped file does not have.
const META_UNSUPPORTED_DIRECTIVES = new Set(['frame-ancestors', 'report-uri', 'report-to', 'sandbox']);

export function inlineScriptHashes(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(([, source]) => {
      const normalized = source.replace(/\r\n?/g, '\n');
      return `sha256-${createHash('sha256').update(normalized, 'utf8').digest('base64')}`;
    });
}

export function contentSecurityPolicy(html) {
  const match = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)">/i);
  if (!match) throw new Error('Content-Security-Policy meta tag is missing');
  return { full: match[0], value: match[1] };
}

function policyDirectives(policy) {
  return policy.split(';')
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => {
      const [name, ...sources] = value.split(/\s+/);
      return { name: name.toLowerCase(), sources, value };
    });
}

export function updatePolicy(html) {
  const policy = contentSecurityPolicy(html);
  const hashes = inlineScriptHashes(html).map(value => `'${value}'`);
  const directives = policy.value.split(';').map(value => value.trim()).filter(Boolean);
  const index = directives.findIndex(value => /^script-src(?:\s|$)/i.test(value));
  if (index < 0) throw new Error('script-src directive is missing');
  directives[index] = [
    "script-src 'self'",
    ...hashes,
    "'wasm-unsafe-eval'",
    'blob:'
  ].join(' ');
  const nextPolicy = `${directives.join('; ')};`;
  const nextTag = policy.full.replace(policy.value, () => nextPolicy);
  return html.replace(policy.full, () => nextTag);
}

function verifiedAssets(block, label, expectedAssets, failures) {
  const assets = [...block.matchAll(
    /url\s*:\s*["']([^"']+)["']\s*,\s*\n\s*integrity\s*:\s*["'](sha384-[A-Za-z0-9+/=]+)["']/g
  )].map(([, url, integrity]) => ({ url, integrity }));

  if (assets.length !== expectedAssets.length) {
    failures.push(`expected ${expectedAssets.length} verified ${label} assets, found ${assets.length}`);
  }
  if (new Set(assets.map(asset => asset.url)).size !== assets.length) {
    failures.push(`verified ${label} asset URLs are not unique`);
  }
  const expectedByUrl = new Map(expectedAssets.map(asset => [asset.url, asset.integrity]));
  for (const asset of assets) {
    let origin;
    try {
      origin = new URL(asset.url).origin;
    } catch {
      failures.push(`verified ${label} asset URL is invalid: ${asset.url}`);
      continue;
    }
    if (!VERIFIED_ASSET_ORIGINS.has(origin)) {
      failures.push(`verified ${label} asset uses an unauthorized origin: ${asset.url}`);
    }
    if (!expectedByUrl.has(asset.url)) {
      failures.push(`verified ${label} asset is not in the canonical runtime manifest: ${asset.url}`);
    } else if (expectedByUrl.get(asset.url) !== asset.integrity) {
      failures.push(`verified ${label} asset integrity differs from the canonical runtime manifest: ${asset.url}`);
    }
  }
  const actualUrls = new Set(assets.map(asset => asset.url));
  for (const expected of expectedAssets) {
    if (!actualUrls.has(expected.url)) {
      failures.push(`canonical ${label} asset is missing from the shipped manifest: ${expected.url}`);
    }
  }
  return assets;
}

function arrayValues(source, name) {
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`));
  if (!match) return null;
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map(([, value]) => value);
}

function compareArray(actual, expected, label, failures) {
  if (!actual) {
    failures.push(`${label} manifest is missing`);
    return;
  }
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    failures.push(`${label} manifest does not match the canonical runtime manifest`);
  }
}

export function checkServiceWorker(source) {
  const failures = [];
  const required = [
    ...OPENSHOP_LOCAL_SHELL_ASSETS,
    ...assetsForKeys(OPENSHOP_REQUIRED_BOOT_KEYS).map(asset => asset.url)
  ];
  const optional = assetsForKeys(OPENSHOP_OPTIONAL_RUNTIME_KEYS).map(asset => asset.url);
  compareArray(arrayValues(source, 'REQUIRED_ASSETS'), required, 'required shell asset', failures);
  compareArray(arrayValues(source, 'OPTIONAL_ASSETS'), optional, 'optional shell asset', failures);

  const originMatch = source.match(/const RUNTIME_ORIGINS = new Set\(\[([\s\S]*?)\n\]\);/);
  const origins = originMatch
    ? [...originMatch[1].matchAll(/["']([^"']+)["']/g)].map(([, value]) => value)
    : null;
  compareArray(origins, [...OPENSHOP_RUNTIME_ORIGINS], 'runtime origin', failures);

  const cacheMatch = source.match(/const CACHEABLE_RUNTIME_URLS = new Set\(\[([\s\S]*?)\n\]\.map\(resolveAsset\)\);/);
  if (!cacheMatch) {
    failures.push('cacheable runtime asset manifest is missing');
  } else {
    const directValues = [...cacheMatch[1].matchAll(/["']([^"']+)["']/g)].map(([, value]) => value);
    const cacheable = new Set([...required, ...optional, ...directValues]);
    const expected = [
      ...OPENSHOP_CACHEABLE_RUNTIME_ASSETS.map(asset => asset.url)
    ];
    for (const url of expected) {
      if (!cacheable.has(url)) failures.push(`runtime asset is not cache-allowlisted: ${url}`);
    }
    const allowed = new Set([...required, ...optional, ...OPENSHOP_CACHEABLE_RUNTIME_ASSETS.map(asset => asset.url)]);
    for (const url of directValues) {
      if (!allowed.has(url)) failures.push(`cacheable runtime manifest contains an unknown URL: ${url}`);
    }
    if (new Set(directValues).size !== directValues.length) {
      failures.push('cacheable runtime asset URLs are not unique');
    }
  }

  if (failures.length) {
    throw new Error(`Service worker runtime asset contract failed:\n- ${failures.join('\n- ')}`);
  }
  return {
    requiredAssets: required.length,
    optionalAssets: optional.length,
    cacheableAssets: OPENSHOP_CACHEABLE_RUNTIME_ASSETS.length
  };
}

export function check(html) {
  const failures = [];
  try {
    validateRuntimeProvenance();
  } catch (error) {
    failures.push(error.message);
  }
  const policy = contentSecurityPolicy(html).value;
  const directives = policyDirectives(policy);
  const directiveNames = directives.map(directive => directive.name);
  for (const name of new Set(directiveNames)) {
    if (directiveNames.filter(value => value === name).length > 1) {
      failures.push(`duplicate CSP directive: ${name}`);
    }
  }
  const byName = new Map(directives.map(directive => [directive.name, directive]));
  for (const directive of directives) {
    if (META_UNSUPPORTED_DIRECTIVES.has(directive.name)) {
      failures.push(`${directive.name} is header-only and cannot be satisfied by a meta policy`);
    }
  }
  const scriptDirective = byName.get('script-src');
  const scriptSources = scriptDirective?.sources || [];
  if (!scriptDirective) failures.push('script-src directive is missing');
  for (const overridingName of ['script-src-elem', 'script-src-attr']) {
    if (byName.has(overridingName)) {
      failures.push(`${overridingName} is forbidden because it can override the audited script-src contract`);
    }
  }
  if (scriptSources.includes("'unsafe-inline'")) failures.push("script-src still permits 'unsafe-inline'");
  if (scriptSources.includes("'unsafe-eval'")) failures.push("script-src permits unrestricted 'unsafe-eval'");
  if (!scriptSources.includes("'wasm-unsafe-eval'")) {
    failures.push("script-src does not narrowly authorize verified WebAssembly");
  }
  for (const source of scriptSources) {
    if (/^'nonce-/i.test(source)) {
      failures.push(`script-src nonce sources are forbidden: ${source}`);
      continue;
    }
    if (SCRIPT_SOURCE_TOKENS.has(source) || /^'sha256-[A-Za-z0-9+/=]+'$/.test(source)) continue;
    failures.push(`script-src contains an unauthorized source: ${source}`);
  }

  const requireTrustedTypes = byName.get('require-trusted-types-for');
  if (!requireTrustedTypes) {
    failures.push("require-trusted-types-for 'script' directive is missing");
  } else if (requireTrustedTypes.sources.length !== 1 || requireTrustedTypes.sources[0] !== "'script'") {
    failures.push("require-trusted-types-for must be exactly 'script'");
  }
  const trustedTypes = byName.get('trusted-types');
  if (!trustedTypes) {
    failures.push('trusted-types directive is missing');
  } else if (trustedTypes.sources.length !== 1 || trustedTypes.sources[0] !== TRUSTED_TYPES_POLICY_NAME) {
    failures.push(`trusted-types must allow only ${TRUSTED_TYPES_POLICY_NAME}`);
  }
  const policyDeclarations = [...html.matchAll(
    /\btrustedTypes\s*\.\s*createPolicy\s*\(\s*['"]([^'"]+)['"]/g
  )].map(([, name]) => name);
  if (policyDeclarations.length !== 1) {
    failures.push(`expected exactly one Trusted Types policy declaration, found ${policyDeclarations.length}`);
  } else if (policyDeclarations[0] !== TRUSTED_TYPES_POLICY_NAME) {
    failures.push(`Trusted Types policy must be named ${TRUSTED_TYPES_POLICY_NAME}`);
  }

  // These are the executable URL sinks in the editor. Every one must receive
  // the value returned by the one policy above; image, download, and iframe
  // URLs are deliberately outside this list.
  const executableSinkChecks = [
    [/\b(?:element|s)\.src\s*=\s*([^;\n]+)/g, 'script src'],
    [/\bnew\s+Worker\(([^;\n]+)\)/g, 'Worker URL'],
    [/\bimport\(([^;\n]+)\)/g, 'dynamic import URL'],
    [/\bworkerSrc\s*=\s*([^;\n]+)/g, 'workerSrc URL']
  ];
  for (const [pattern, label] of executableSinkChecks) {
    for (const match of html.matchAll(pattern)) {
      if (!match[1].trim().startsWith('OPENSHOP_TRUSTED_SCRIPT_URL(')) {
        failures.push(`${label} bypasses the Trusted Types loader`);
      }
    }
  }
  const sourceLines = html.split(/\r?\n/);
  for (let index = 0; index < sourceLines.length; index++) {
    const line = sourceLines[index];
    if (!line.includes('URL.createObjectURL') || line.includes('createOpenShopScriptBlobUrl')) continue;
    const context = sourceLines.slice(index, index + 8).join('\n');
    if (/\bwasmUrl\s*=/.test(line) && /\bwasmAsset\b/.test(line)) continue;
    if (/type\s*:\s*['"][^'"]*(?:javascript|ecmascript)/i.test(context)
        || /\b(?:factory|module|worker|lib|index)Asset\.asset\.type\b/.test(context)) {
      failures.push('a JavaScript Blob URL is created without the Trusted Types loader');
    }
  }

  for (const [name, requiredSources] of REQUIRED_POLICY_DIRECTIVES) {
    const directive = byName.get(name);
    if (!directive) {
      failures.push(`${name} directive is missing`);
      continue;
    }
    if (requiredSources && (directive.sources.length !== requiredSources.length
        || requiredSources.some(source => !directive.sources.includes(source)))) {
      failures.push(`${name} must be exactly ${requiredSources.join(' ')}`);
    }
  }

  const inlineHashes = inlineScriptHashes(html);
  const expectedHashes = new Set(inlineHashes);
  const declaredHashes = new Set(
    scriptSources
      .filter(source => /^'sha(?:256|384|512)-[A-Za-z0-9+/=]+'$/i.test(source))
      .map(source => source.slice(1, -1))
  );
  if (expectedHashes.size !== declaredHashes.size
      || [...expectedHashes].some(hash => !declaredHashes.has(hash))) {
    failures.push('inline script hashes do not match the current source');
  }
  if (inlineHashes.length !== EXPECTED_INLINE_SCRIPTS) {
    failures.push(`expected ${EXPECTED_INLINE_SCRIPTS} inline scripts, found ${inlineHashes.length}`);
  }

  // Any inline handler, not just the four the registry happens to use: an
  // onerror= or onload= used to sail through the gate that claims to cover them.
  const inlineHandler = [...html.matchAll(/<[a-z][^>]*>/gi)]
    .map(match => match[0].match(/[\s/]on[a-z]+\s*=/i))
    .find(Boolean);
  if (inlineHandler) {
    failures.push(`executable HTML event attribute remains: ${inlineHandler[0].trim()}`);
  }

  const registryIds = new Set(
    [...html.matchAll(/^\s*"((?:click|change|input|keydown)-[^"]+)":\s*function\b/gm)]
      .map(match => match[1])
  );
  const declaredActions = [...html.matchAll(/\sdata-os-(?:click|change|input|keydown)="([^"]+)"/g)]
    .map(match => match[1]);
  const missingActions = [...new Set(declaredActions.filter(id => !registryIds.has(id)))];
  if (missingActions.length) failures.push(`undeclared UI actions: ${missingActions.join(', ')}`);

  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    if (/\bsrc\s*=/i.test(match[1]) && !/\bintegrity\s*=\s*"sha384-[A-Za-z0-9+/=]+"/i.test(match[1])) {
      failures.push(`external script lacks SHA-384 integrity: ${match[0]}`);
    }
  }

  const bootBlock = html.match(/const OPENSHOP_BOOT_ASSETS = Object\.freeze\(\[([\s\S]*?)\n\]\);/);
  if (!bootBlock) {
    failures.push('verified boot asset manifest is missing');
  } else {
    verifiedAssets(bootBlock[1], 'boot', OPENSHOP_BOOT_ASSETS, failures);
  }

  const runtimeBlock = html.match(/_runtimeAssets:\s*Object\.freeze\(\{([\s\S]*?)\n\s*\}\),\n(?:\s*\/\* OPENSHOP_RUNTIME_MANIFEST:LAZY:END \*\/\n)?\s*_runtimeAssetPromises:/);
  if (!runtimeBlock) {
    failures.push('verified runtime asset manifest is missing');
  } else {
    verifiedAssets(runtimeBlock[1], 'lazy', OPENSHOP_RUNTIME_ASSETS, failures);
  }

  if (/(?:import|importScripts)\s*\(\s*['"`]https?:/i.test(html)
      || /workerScript\s*:\s*['"]https?:/i.test(html)
      || /\.src\s*=\s*['"]https?:\/\/(?:cdn\.jsdelivr|cdnjs)/i.test(html)) {
    failures.push('a lazy executable path bypasses the verified runtime loader');
  }

  if (failures.length) {
    throw new Error(`Security contract failed:\n- ${failures.join('\n- ')}`);
  }
  return {
    inlineScripts: inlineHashes.length,
    trustedTypesPolicy: TRUSTED_TYPES_POLICY_NAME,
    actions: declaredActions.length,
    registryEntries: registryIds.size,
    lazyAssets: OPENSHOP_RUNTIME_ASSETS.length,
    bootAssets: OPENSHOP_BOOT_ASSETS.length
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let html = readFileSync(indexPath, 'utf8');
  if (write) {
    html = updatePolicy(html);
    writeFileSync(indexPath, html);
  }
  const result = check(html);
  const worker = checkServiceWorker(readFileSync(serviceWorkerPath, 'utf8'));
  console.log(`Security contract OK: ${result.inlineScripts} hashed scripts, ${result.actions} controls, ${result.registryEntries} actions, ${result.bootAssets} verified boot assets, ${result.lazyAssets} verified lazy assets.`);
  console.log(`Runtime manifest OK: ${worker.requiredAssets} required shell assets, ${worker.optionalAssets} optional shell assets, ${worker.cacheableAssets} cacheable runtime assets.`);
}
