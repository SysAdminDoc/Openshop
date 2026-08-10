import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const toolsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(toolsDirectory, '..');

export function readReleaseMetadata(root = repositoryRoot) {
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const version = String(packageJson.version || '').trim();
    const revision = Number(packageJson.release?.shellRevision);
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('package.json version must be a semantic version');
    if (!Number.isInteger(revision) || revision < 1 || revision > 99) throw new Error('package.json release.shellRevision must be an integer from 1 to 99');
    return Object.freeze({ version, shellRevision:`${version}-r${revision}`, revision });
}

function readAttribute(tag, name) {
    const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
    return match ? match[2].trim() : '';
}

function readTags(source, name) {
    return [...String(source).matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(match => match[0]);
}

function resolveReleaseAsset(root, href, baseFile, source) {
    const value = String(href || '').trim();
    if (!value) {
        return Object.freeze({ source, href:value, baseFile, fileUrl:null, filePath:null, hostedPath:null, local:false });
    }

    let fileUrl = null;
    let filePath = null;
    let local = false;
    try {
        const candidate = new URL(value, pathToFileURL(join(root, baseFile)));
        if (candidate.protocol === 'file:') {
            fileUrl = candidate.href;
            filePath = resolve(fileURLToPath(candidate));
            const rootPath = resolve(root);
            const relativePath = relative(rootPath, filePath);
            local = relativePath === ''
                || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath));
        }
    } catch {
        // The release test reports malformed or external metadata as a failure.
    }

    let hostedPath = null;
    try {
        hostedPath = new URL(value, `http://127.0.0.1/${String(baseFile).replaceAll('\\', '/')}`).pathname;
    } catch {
        // Keep a null hosted path so the test names the broken source.
    }

    return Object.freeze({ source, href:value, baseFile, fileUrl, filePath, hostedPath, local });
}

/**
 * Enumerate every local asset that a release-facing metadata surface names.
 * The returned URLs are intentionally derived from the HTML/manifest rather
 * than copied into a second hand-maintained list, so a new preview or install
 * asset automatically enters the standalone and hosted release checks.
 */
export function readReleaseSurfaceAssets(root = repositoryRoot) {
    const indexSource = readFileSync(join(root, 'index.html'), 'utf8');
    const metaTags = readTags(indexSource, 'meta');
    const manifestTags = readTags(indexSource, 'link');
    const previewTag = metaTags.find(tag => readAttribute(tag, 'property').toLowerCase() === 'og:image');
    const manifestTag = manifestTags.find(tag => readAttribute(tag, 'rel').toLowerCase().split(/\s+/).includes('manifest'));
    const manifestHref = readAttribute(manifestTag || '', 'href');
    const assets = [
        resolveReleaseAsset(root, readAttribute(previewTag || '', 'content'), 'index.html', 'index.html og:image'),
        resolveReleaseAsset(root, manifestHref, 'index.html', 'index.html manifest')
    ];

    if (manifestHref) {
        try {
            const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
            for (const [kind, entries] of [['icon', manifest.icons], ['screenshot', manifest.screenshots]]) {
                for (const [index, entry] of (Array.isArray(entries) ? entries : []).entries()) {
                    assets.push(resolveReleaseAsset(root, entry?.src, 'manifest.webmanifest', `manifest.${kind}[${index}]`));
                }
            }
        } catch {
            // The release test reports a malformed or missing manifest.
        }
    }

    const seen = new Set();
    return Object.freeze(assets.filter(asset => {
        const key = `${asset.baseFile}\\0${asset.href}\\0${asset.source}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }));
}

export const releaseMetadata = readReleaseMetadata();
