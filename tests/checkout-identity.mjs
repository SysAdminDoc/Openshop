import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReleaseMetadata } from '../tools/release-metadata.mjs';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const identityFiles = [
  'index.html',
  'sw.js',
  'plugin-sandbox.html',
  'plugin-sandbox.js',
  'manifest.webmanifest',
  'package.json',
  'package-lock.json'
];

export function readCheckoutIdentity(root = moduleRoot) {
  const digest = createHash('sha256');
  identityFiles.forEach(relative => {
    digest.update(relative);
    digest.update('\0');
    digest.update(readFileSync(join(root, relative)));
    digest.update('\0');
  });
  const release = readReleaseMetadata(root);
  return Object.freeze({
    token:`${release.version}-r${release.revision}-${digest.digest('hex').slice(0, 24)}`,
    version:release.version,
    shellRevision:release.shellRevision,
    files:[...identityFiles]
  });
}

export const checkoutIdentity = readCheckoutIdentity();
