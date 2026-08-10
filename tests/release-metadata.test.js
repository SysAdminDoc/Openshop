import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readReleaseMetadata, readReleaseSurfaceAssets } from '../tools/release-metadata.mjs';

const root = join(process.cwd());
const read = name => readFileSync(join(root, name), 'utf8');

describe('release metadata', () => {
  const { version } = readReleaseMetadata(root);

  it('keeps every shipped version and offline shell revision on one source of truth', () => {
    const { version, shellRevision } = readReleaseMetadata(root);
    const index = read('index.html');
    const manifest = JSON.parse(read('manifest.webmanifest'));
    const changelog = read('CHANGELOG.md');
    const readme = read('README.md');
    const serviceWorker = read('sw.js');
    const offlineSpec = read('tests/offline.e2e.spec.js');
    const server = read('tests/server.mjs');

    expect(manifest.version, 'manifest.webmanifest version').toBe(version);
    expect(index, 'index.html title version').toContain(`<title>OpenShop v${version} —`);
    expect(index, 'index.html about version').toContain(`aria-label="OpenShop version ${version}"`);
    expect(index, 'index.html runtime version').toContain(`application: { id:'openshop', version:'${version}'`);
    expect(index, 'index.html document version').toContain(`version: '${version}'`);
    expect(readme, 'README version badge').toContain(`version-${version}-blue`);
    expect(changelog, 'CHANGELOG release heading').toContain(`## [v${version}]`);
    expect(serviceWorker, 'sw.js shell revision').toContain(`const SHELL_REVISION = '${shellRevision}';`);
    expect(offlineSpec, 'offline browser spec revision').toContain('productionRevision = releaseMetadata.shellRevision');
    expect(server, 'offline test server revision').toContain('productionRevision = releaseMetadata.shellRevision');
    expect(serviceWorker, 'sw.js current revision allowlist').toContain('    SHELL_REVISION,');
  });

  it('keeps every release-facing local asset resolvable from a standalone file', () => {
    const assets = readReleaseSurfaceAssets(root);
    expect(assets.map(asset => asset.source)).toEqual([
      'index.html og:image',
      'index.html manifest',
      'manifest.icon[0]',
      'manifest.icon[1]',
      'manifest.icon[2]',
      'manifest.icon[3]',
      'manifest.screenshot[0]',
      'manifest.screenshot[1]'
    ]);

    for (const asset of assets) {
      expect(asset.local, `${asset.source} must be a repository-local URL`).toBe(true);
      expect(asset.fileUrl, `${asset.source} file URL`).toBe(
        new URL(asset.href, pathToFileURL(join(root, asset.baseFile))).href
      );
      expect(existsSync(asset.filePath), `${asset.source} file`).toBe(true);
      expect(asset.hostedPath, `${asset.source} hosted path`).toMatch(/^\/(?:design|icon|manifest\.webmanifest)/);
    }
  });

  it('identifies the current Chromium visual baselines by release', () => {
    const snapshotManifest = JSON.parse(read('tests/visual-snapshot-release.json'));
    const html = read('index.html');
    const [major, minor] = version.split('.');
    const expectedTestNames = [...read('tests/openshop.e2e.spec.js').matchAll(/toHaveScreenshot\('([^']+)'/g)]
      .map(match => match[1]);

    expect(snapshotManifest.release, 'visual baseline release').toBe(version);
    expect(snapshotManifest.badge, 'visual baseline badge').toBe(`v${major}.${minor}`);
    expect(snapshotManifest.project, 'visual baseline project').toBe('chromium');
    expect(snapshotManifest.required.map(entry => entry.testName)).toEqual(expectedTestNames);
    expect(html, 'visual baseline topbar badge').toContain(`<span class="logo-version">${snapshotManifest.badge}</span>`);
    expect(html, 'visual baseline welcome badge').toContain(`<small>${snapshotManifest.badge}</small>`);

    for (const entry of snapshotManifest.required) {
      expect(entry.file, `${entry.testName} must remain a Chromium baseline`).toContain('-chromium-');
      expect(existsSync(join(root, 'tests', 'openshop.e2e.spec.js-snapshots', entry.file)), `${entry.file} file`).toBe(true);
    }
  });

  it('keeps the local contributor guide on the current release when present', () => {
    const claudePath = join(root, 'CLAUDE.md');
    if (!existsSync(claudePath)) return;
    const claude = read('CLAUDE.md');
    expect(claude, 'CLAUDE title version').toContain(`# Openshop v${version}`);
    expect(claude, 'CLAUDE version badge').toContain(`badge/version-${version}-blue`);
    expect(claude, 'CLAUDE status version').toContain(`- Version: v${version}`);
    expect(claude, 'CLAUDE current-focus claim').not.toContain('v0.27.0 drained the whole prioritised backlog');
  });
});
