'use strict';

const SHELL_REVISION = '0.30.0-r2';
// State is origin-readable, so a cache name from it is never trusted merely
// because it looks like a revision. Keep the bounded set of revisions this
// worker knows were actually shipped; releases carry the newest predecessors
// forward for rollback across skipped updates.
const TRUSTED_SHELL_REVISIONS = new Set([
    SHELL_REVISION,
    '0.29.0-r2',
    '0.29.0-r1',
    '0.28.0-r1',
    '0.27.0-r2',
    '0.27.0-r1',
    '0.26.0-r4',
    '0.26.0-r3',
    '0.26.0-r2',
    '0.26.0-r1',
    '0.25.0-r1'
]);
const STATE_SCHEMA = 1;
const SHELL_CACHE_PREFIX = 'openshop-shell-';
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}${SHELL_REVISION}`;
// Scratch space so a failed stage cannot destroy a working offline install.
const STAGING_CACHE = `${SHELL_CACHE}-staging`;
// Promotion writes into a separate, verified cache. The state pointer flips
// only after that cache is complete, so a worker terminated during copying
// leaves the active shell untouched and can resume from the staging cache.
const PROMOTION_CACHE = `${SHELL_CACHE}-candidate`;
const PROMOTION_RETRY_CACHE = `${PROMOTION_CACHE}-retry`;
const PROMOTION_ABORT_AFTER = (() => {
    try {
        return Number(new URL(self.location.href).searchParams.get('openshop-test-abort-promotion')) || 0;
    } catch {
        return 0;
    }
})();
// Versioned with the shell: an unversioned runtime cache meant a fix to any
// non-enumerated asset never reached a client that had already cached it.
const RUNTIME_CACHE_PREFIX = 'openshop-runtime-';
const RUNTIME_CACHE = `${RUNTIME_CACHE_PREFIX}${SHELL_REVISION}`;
const RUNTIME_CACHE_LIMIT = 60;
const META_CACHE = 'openshop-offline-meta-v1';
// Navigations that may occur before the health handshake completes without
// meaning the new shell is broken (extra tab, refresh, quick close).
const MAX_TRIAL_NAVIGATIONS = 3;
const SCOPE_URL = new URL('./', self.registration.scope).href;
const STATE_URL = new URL('./__openshop_offline_state__', self.registration.scope).href;
const SHARE_DATABASE_NAME = 'openshop-share-v1';
const SHARE_DATABASE_VERSION = 1;
const SHARE_STORE_NAME = 'payloads';
const SHARE_TARGET_PATH = new URL('./', self.registration.scope).pathname;
const SHARE_TARGET_QUERY = 'target';
const SHARE_MAX_FILES = 8;
const SHARE_MAX_FILE_BYTES = 128 * 1024 * 1024;
const SHARE_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const SHARE_MAX_AGE_MS = 30 * 60 * 1000;

/* OPENSHOP_RUNTIME_MANIFEST:SHELL:BEGIN */
const REQUIRED_ASSETS = [
    "./",
    "./index.html",
    "./plugin-sandbox.html",
    "./plugin-sandbox.js",
    "./manifest.webmanifest",
    "./icon-192.png",
    "./icon-512.png",
    "./design/openshop-studio-master.png",
    "./design/openshop-menu-states.png",
    "https://cdn.jsdelivr.net/npm/fabric@7.4.0/dist/index.min.js",
    "https://cdn.jsdelivr.net/npm/ag-psd@31.0.2/dist/bundle.js",
    "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js"
];

const OPTIONAL_ASSETS = [
    "https://cdn.jsdelivr.net/npm/@silvia-odwyer/photon@0.3.3/photon_rs.js",
    "https://cdn.jsdelivr.net/npm/@silvia-odwyer/photon@0.3.3/photon_rs_bg.wasm",
    "https://cdn.jsdelivr.net/npm/modern-gif@2.1.0/dist/index.js",
    "https://cdn.jsdelivr.net/npm/modern-gif@2.1.0/dist/worker.js"
];

const RUNTIME_ORIGINS = new Set([
    "https://cdn.jsdelivr.net"
]);

const CACHEABLE_RUNTIME_URLS = new Set([
    ...REQUIRED_ASSETS,
    ...OPTIONAL_ASSETS,
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.min.mjs",
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.worker.min.mjs",
    "https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/index.js",
    "https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/worker.js",
    "https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/libraw.js",
    "https://cdn.jsdelivr.net/npm/libraw-wasm@1.6.0/dist/libraw.wasm",
    "https://cdn.jsdelivr.net/npm/@jsquash/avif@2.1.1/codec/enc/avif_enc.js",
    "https://cdn.jsdelivr.net/npm/@jsquash/avif@2.1.1/codec/enc/avif_enc.wasm",
    "https://cdn.jsdelivr.net/npm/@jsquash/avif@2.1.1/codec/dec/avif_dec.js",
    "https://cdn.jsdelivr.net/npm/@jsquash/avif@2.1.1/codec/dec/avif_dec.wasm",
    "https://cdn.jsdelivr.net/npm/svg2pdf.js@2.7.0/dist/svg2pdf.umd.min.js",
    "https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js",
    "https://cdn.jsdelivr.net/npm/fabric@7.4.0/dist-extensions/fabric-extensions.min.js",
    "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0",
    "https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.13.4/+esm",
    "https://cdn.jsdelivr.net/npm/highgain@0.1.0/+esm",
    "https://cdn.jsdelivr.net/npm/ts-deepmerge@8.0.0/+esm",
    "https://cdn.jsdelivr.net/npm/@contentauth/c2pa-wasm@0.11.2/pkg/c2pa_bg.wasm",
    "https://cdn.jsdelivr.net/npm/@discourse/heic@1.0.0/codec/dec/heic_dec.js",
    "https://cdn.jsdelivr.net/npm/@discourse/heic@1.0.0/codec/dec/heic_dec.wasm",
    "https://cdn.jsdelivr.net/npm/@jsquash/jxl@1.3.0/codec/dec/jxl_dec.js",
    "https://cdn.jsdelivr.net/npm/@jsquash/jxl@1.3.0/codec/dec/jxl_dec.wasm",
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/ort-wasm-simd-threaded.asyncify.wasm",
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/ort-wasm-simd-threaded.asyncify.mjs",
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/ort-wasm-simd-threaded.wasm",
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/ort-wasm-simd-threaded.mjs"
].map(resolveAsset));
/* OPENSHOP_RUNTIME_MANIFEST:SHELL:END */

function shellCacheName(revision) {
    return `${SHELL_CACHE_PREFIX}${revision}`;
}

function trustedCacheName(value, revision) {
    if (typeof value !== 'string' || !revision) return null;
    if (value === shellCacheName(revision)) return value;
    if (value === `${shellCacheName(revision)}-candidate`
        || value === `${shellCacheName(revision)}-candidate-retry`) return value;
    return null;
}

function isPromotionCacheName(value, revision = SHELL_REVISION) {
    return value === `${shellCacheName(revision)}-candidate`
        || value === `${shellCacheName(revision)}-candidate-retry`;
}

function cacheNameForState(state, revision) {
    if (revision === state.activeRevision && state.activeCache) return state.activeCache;
    if (revision === state.previousRevision && state.previousCache) return state.previousCache;
    return shellCacheName(revision);
}

function resolveAsset(asset) {
    return new URL(asset, SCOPE_URL).href;
}

function defaultState() {
    return {
        schemaVersion: STATE_SCHEMA,
        workerRevision: SHELL_REVISION,
        activeRevision: null,
        previousRevision: null,
        stagedRevision: null,
        activeCache: null,
        previousCache: null,
        stagedCache: null,
        promotion: null,
        confirmed: false,
        trialStarted: false,
        trialAttempts: 0,
        rolledBackFrom: null,
        failedRevision: null,
        reports: {}
    };
}

function trustedRevision(value) {
    return typeof value === 'string' && TRUSTED_SHELL_REVISIONS.has(value) ? value : null;
}

function sanitizeState(state) {
    const activeRevision = trustedRevision(state.activeRevision);
    const previousRevision = trustedRevision(state.previousRevision);
    const activeCache = activeRevision
        ? trustedCacheName(state.activeCache, activeRevision) || shellCacheName(activeRevision)
        : null;
    const previousCache = previousRevision
        ? trustedCacheName(state.previousCache, previousRevision) || shellCacheName(previousRevision)
        : null;
    const stagedRevision = state.stagedRevision === SHELL_REVISION ? SHELL_REVISION : null;
    const stagedCache = stagedRevision
        ? trustedCacheName(state.stagedCache, stagedRevision) || shellCacheName(stagedRevision)
        : null;
    const promotion = state.promotion?.revision === SHELL_REVISION
        && isPromotionCacheName(state.promotion.cache)
        ? { revision:SHELL_REVISION, cache:state.promotion.cache }
        : null;
    const reports = Object.fromEntries(
        Object.entries(state.reports || {}).filter(([revision]) => TRUSTED_SHELL_REVISIONS.has(revision))
    );
    return {
        ...state,
        activeRevision,
        previousRevision: previousRevision === activeRevision ? null : previousRevision,
        activeCache,
        previousCache: previousRevision === activeRevision ? null : previousCache,
        stagedRevision,
        stagedCache,
        promotion,
        reports
    };
}

async function readState() {
    try {
        const cache = await caches.open(META_CACHE);
        const response = await cache.match(STATE_URL);
        if (!response) return defaultState();
        const parsed = await response.json();
        if (parsed?.schemaVersion !== STATE_SCHEMA) return defaultState();
        return sanitizeState({ ...defaultState(), ...parsed, reports: parsed.reports || {} });
    } catch {
        return defaultState();
    }
}

async function writeState(state) {
    const cache = await caches.open(META_CACHE);
    const normalized = {
        ...defaultState(),
        ...state,
        schemaVersion: STATE_SCHEMA,
        workerRevision: SHELL_REVISION,
        updatedAt: new Date().toISOString()
    };
    await cache.put(STATE_URL, new Response(JSON.stringify(normalized), {
        headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store'
        }
    }));
    return normalized;
}

async function fetchAndCache(cache, asset) {
    const href = resolveAsset(asset);
    const url = new URL(href);
    const sameOrigin = url.origin === self.location.origin;
    const request = new Request(href, {
        cache: 'reload',
        credentials: sameOrigin ? 'same-origin' : 'omit',
        mode: sameOrigin ? 'same-origin' : 'cors'
    });
    const response = await fetch(request);
    if (!response.ok) throw new Error(`${response.status} ${href}`);
    await cache.put(href, response.clone());
}

async function cacheContainsAssets(cacheName, assets) {
    const names = await caches.keys();
    if (!names.includes(cacheName)) return false;
    const cache = await caches.open(cacheName);
    const matches = await Promise.all(assets.map(asset => cache.match(resolveAsset(asset))));
    return matches.every(Boolean);
}

// The candidate cache is never the cache selected by the current state
// pointer. Copying can therefore be resumed after a worker is terminated;
// activation only flips the pointer after every staged entry is verified.
async function promoteStagedShell(targetName = PROMOTION_CACHE) {
    if (!isPromotionCacheName(targetName)) throw new Error('OpenShop shell promotion target is not trusted');
    const staging = await caches.open(STAGING_CACHE);
    const staged = await staging.keys();
    if (!staged.length) throw new Error('OpenShop shell staging produced no entries');
    const candidate = await caches.open(targetName);
    let copied = 0;
    for (const request of staged) {
        const response = await staging.match(request);
        if (!response) throw new Error(`OpenShop shell staging lost ${request.url}`);
        await candidate.put(request, response.clone());
        copied++;
        if (PROMOTION_ABORT_AFTER && copied >= PROMOTION_ABORT_AFTER) {
            throw new Error('OpenShop test promotion interruption');
        }
    }
    const missing = (await candidate.keys()).length < staged.length
        || !(await Promise.all(staged.map(request => candidate.match(request)))).every(Boolean);
    if (missing) throw new Error('OpenShop shell promotion verification failed');
    return targetName;
}

async function stageShell() {
    let state = await readState();
    const promotionCache = state.promotion?.cache
        || (state.activeRevision === SHELL_REVISION && state.activeCache === PROMOTION_CACHE
            ? PROMOTION_RETRY_CACHE
            : PROMOTION_CACHE);
    let cache = await caches.open(STAGING_CACHE);
    if (!(await cacheContainsAssets(STAGING_CACHE, REQUIRED_ASSETS))) {
        await caches.delete(STAGING_CACHE);
        cache = await caches.open(STAGING_CACHE);
        if (state.promotion) {
            state = await writeState({ ...state, promotion:null });
        }
    }
    const requiredMissing = [];
    for (const asset of REQUIRED_ASSETS) {
        if (await cache.match(resolveAsset(asset))) continue;
        try {
            await fetchAndCache(cache, asset);
        } catch (error) {
            requiredMissing.push({ asset, error: error.message });
        }
    }
    if (requiredMissing.length) {
        // The active cache and any previous verified shell were never touched.
        await caches.delete(STAGING_CACHE);
        if (state.promotion) await writeState({ ...state, promotion:null });
        throw new Error(`OpenShop shell staging failed: ${requiredMissing.map(item => item.asset).join(', ')}`);
    }

    const optionalMissing = [];
    for (const asset of OPTIONAL_ASSETS) {
        if (await cache.match(resolveAsset(asset))) continue;
        try {
            await fetchAndCache(cache, asset);
        } catch (error) {
            optionalMissing.push({ asset, error: error.message });
        }
    }

    const reports = {
        ...state.reports,
        [SHELL_REVISION]: {
            requiredTotal: REQUIRED_ASSETS.length,
            requiredCached: REQUIRED_ASSETS.length,
            // Recorded so a later worker reports this cache against the manifest
            // that filled it, not against its own asset list.
            requiredAssets: REQUIRED_ASSETS.slice(),
            optionalTotal: OPTIONAL_ASSETS.length,
            optionalCached: OPTIONAL_ASSETS.length - optionalMissing.length,
            optionalMissing,
            stagedAt: new Date().toISOString()
        }
    };
    const revisions = Object.keys(reports);
    while (revisions.length > 4) delete reports[revisions.shift()];
    // Persist a resume marker before touching the candidate. If the worker is
    // killed during promotion, the next install/activation can finish this
    // exact staged copy without refetching or risking the active shell.
    state = await writeState({
        ...state,
        promotion:{ revision:SHELL_REVISION, cache:promotionCache },
        reports
    });
    await promoteStagedShell(promotionCache);
    await writeState({
        ...state,
        stagedRevision:SHELL_REVISION,
        stagedCache:promotionCache,
        promotion:null,
        reports
    });
    await caches.delete(STAGING_CACHE);
}

async function trimShellCaches(keepRevisions, keepCaches = []) {
    const revisions = [...keepRevisions].filter(Boolean);
    const keep = new Set([...keepCaches, ...revisions.map(shellCacheName)].filter(Boolean));
    // A trim landing mid-stage must not delete the scratch cache under it.
    keep.add(STAGING_CACHE);
    const keepRuntime = new Set(revisions.map(revision => `${RUNTIME_CACHE_PREFIX}${revision}`));
    keepRuntime.add(RUNTIME_CACHE);
    const names = await caches.keys();
    await Promise.all(names
        .filter(name => (name.startsWith(SHELL_CACHE_PREFIX) && !keep.has(name))
            || (name.startsWith(RUNTIME_CACHE_PREFIX) && !keepRuntime.has(name)))
        .map(name => caches.delete(name)));
}

// Cache keys are insertion-ordered, so the oldest entries go first.
async function trimRuntimeCache(cache) {
    const keys = await cache.keys();
    const excess = keys.length - RUNTIME_CACHE_LIMIT;
    for (let index = 0; index < excess; index++) await cache.delete(keys[index]);
}

async function fetchRuntimeAsset(request) {
    // An opaque response hides its status, so a captive-portal or CDN error
    // page fetched no-cors used to cache as if it were the asset and be served
    // cache-first forever. Ask again with CORS — every runtime origin allows
    // it — so the status is visible and the entry is safe to keep.
    if (request.mode === 'no-cors' && RUNTIME_ORIGINS.has(new URL(request.url).origin)) {
        try {
            const cors = await fetch(request.url, { mode:'cors', credentials:'omit' });
            if (cors.ok) return cors;
        } catch {
            // Fall through to the request as the page made it.
        }
    }
    return fetch(request);
}

function isCacheableRuntimeRequest(request) {
    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
        // Query parameters do not turn a known static path into a new cache
        // namespace, but an unrelated path never becomes eligible by extension.
        const withoutQuery = new URL(url.pathname, url.origin).href;
        return CACHEABLE_RUNTIME_URLS.has(withoutQuery);
    }
    if (CACHEABLE_RUNTIME_URLS.has(url.href)) return true;
    return false;
}

function responseAllowsRuntimeCaching(response) {
    const cacheControl = response.headers.get('cache-control') || '';
    if (/(?:^|,)\s*(?:no-store|private)(?:\s|=|,|$)/i.test(cacheControl)) return false;
    const vary = response.headers.get('vary') || '';
    if (vary.trim() === '*' || /(?:^|,)\s*(?:cookie|authorization)\s*(?:,|$)/i.test(vary)) return false;
    return true;
}

async function activateShell() {
    let state = await readState();
    if (state.promotion?.revision === SHELL_REVISION) {
        // An install may have been terminated after the resume marker was
        // written but before the candidate copy completed. Activation is the
        // next durable opportunity to finish it.
        await promoteStagedShell(state.promotion.cache);
        state = await writeState({
            ...state,
            stagedRevision:SHELL_REVISION,
            stagedCache:state.promotion.cache,
            promotion:null
        });
    }
    if (state.stagedRevision === SHELL_REVISION) {
        const candidate = state.stagedCache || shellCacheName(SHELL_REVISION);
        const report = state.reports?.[SHELL_REVISION] || {};
        const requiredAssets = Array.isArray(report.requiredAssets) && report.requiredAssets.length
            ? report.requiredAssets
            : REQUIRED_ASSETS;
        if (!(await cacheContainsAssets(candidate, requiredAssets))) {
            await self.clients.claim();
            return;
        }
        const oldRevision = state.activeRevision;
        const oldCache = oldRevision ? cacheNameForState(state, oldRevision) : null;
        const replacingSameRevision = oldRevision === SHELL_REVISION;
        const previousRevision = replacingSameRevision ? state.previousRevision : oldRevision;
        const previousCache = replacingSameRevision
            ? state.previousCache
            : oldCache;
        state = await writeState({
            ...state,
            previousRevision,
            previousCache,
            activeRevision: SHELL_REVISION,
            activeCache:candidate,
            stagedRevision: null,
            stagedCache:null,
            confirmed: !state.activeRevision,
            trialStarted: false,
            rolledBackFrom: null,
            failedRevision: null,
            activatedAt: new Date().toISOString()
        });
    } else if (!state.activeRevision) {
        state = await writeState({
            ...state,
            activeRevision: SHELL_REVISION,
            activeCache:SHELL_CACHE,
            stagedRevision: null,
            stagedCache:null,
            confirmed: true,
            activatedAt: new Date().toISOString()
        });
    }
    await trimShellCaches([state.previousRevision], [state.activeCache, state.previousCache]);
    await self.clients.claim();
}

async function revisionForNavigation() {
    let state = await readState();
    if (state.activeRevision === SHELL_REVISION && !state.confirmed && state.previousRevision) {
        // A second tab, a refresh during load, or closing the tab before the
        // health handshake completes are all normal. Only roll back once the
        // new shell has repeatedly failed to confirm.
        const attempts = Number(state.trialAttempts || 0) + 1;
        if (attempts > MAX_TRIAL_NAVIGATIONS) {
            const failedRevision = state.activeRevision;
            const fallbackRevision = state.previousRevision;
            const fallbackCache = cacheNameForState(state, fallbackRevision);
            state = await writeState({
                ...state,
                activeRevision: fallbackRevision,
                activeCache:fallbackCache,
                previousRevision: null,
                previousCache:null,
                confirmed: true,
                trialStarted: false,
                trialAttempts: 0,
                rolledBackFrom: failedRevision,
                failedRevision,
                rollbackAt: new Date().toISOString()
            });
            // The failed shell cache is kept so a re-stage can recover without
            // waiting for a new SHELL_REVISION to ship.
            return { revision:state.activeRevision, cacheName:state.activeCache };
        }
        state = await writeState({
            ...state,
            trialStarted: true,
            trialAttempts: attempts,
            trialStartedAt: state.trialStartedAt || new Date().toISOString()
        });
    }
    const revision = state.activeRevision || SHELL_REVISION;
    return { revision, cacheName:cacheNameForState(state, revision) };
}

async function activeRevision() {
    const state = await readState();
    return state.activeRevision || SHELL_REVISION;
}

async function cachedShellResponse(request, revision, navigation = false, cacheName = shellCacheName(revision)) {
    const cache = await caches.open(cacheName);
    if (navigation) {
        return await cache.match(resolveAsset('./index.html'))
            || await cache.match(resolveAsset('./'));
    }
    return cache.match(request);
}

function isShareTargetRequest(request) {
    if (request.method !== 'POST') return false;
    try {
        const url = new URL(request.url);
        return url.origin === new URL(SCOPE_URL).origin
            && url.pathname === SHARE_TARGET_PATH
            && url.searchParams.get('share') === SHARE_TARGET_QUERY;
    } catch {
        return false;
    }
}

function openShareDatabase() {
    if (!self.indexedDB) throw new Error('IndexedDB is unavailable');
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(SHARE_DATABASE_NAME, SHARE_DATABASE_VERSION);
        request.onupgradeneeded = event => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(SHARE_STORE_NAME)) {
                database.createObjectStore(SHARE_STORE_NAME, { keyPath:'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open share storage'));
    });
}

function shareFileName(value) {
    return String(value || 'shared-file')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .slice(0, 240)
        || 'shared-file';
}

async function purgeExpiredSharePayloads(database, now = Date.now()) {
    await new Promise((resolve, reject) => {
        const transaction = database.transaction(SHARE_STORE_NAME, 'readwrite');
        const cursorRequest = transaction.objectStore(SHARE_STORE_NAME).openCursor();
        cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const record = cursor.value;
            if (!record || now - Number(record.createdAt || 0) > SHARE_MAX_AGE_MS) cursor.delete();
            cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error || new Error('Could not inspect share storage'));
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Could not clean share storage'));
    });
}

async function storeShareTarget(request) {
    const form = await request.formData();
    const values = form.getAll('files');
    if (!values.length) throw new Error('No shared files were supplied');
    if (values.length > SHARE_MAX_FILES) throw new Error('Too many shared files');

    const files = [];
    let totalBytes = 0;
    for (const value of values) {
        if (!value || typeof value.arrayBuffer !== 'function') continue;
        const declaredSize = Number(value.size);
        if (Number.isFinite(declaredSize) && declaredSize > SHARE_MAX_FILE_BYTES) {
            throw new Error('A shared file is too large');
        }
        const data = await value.arrayBuffer();
        const size = data.byteLength;
        if (size > SHARE_MAX_FILE_BYTES || totalBytes + size > SHARE_MAX_TOTAL_BYTES) {
            throw new Error('Shared files exceed the import limit');
        }
        totalBytes += size;
        files.push({
            name:shareFileName(value.name),
            type:String(value.type || '').slice(0, 120),
            lastModified:Number(value.lastModified) || Date.now(),
            size,
            data
        });
    }
    if (!files.length) throw new Error('No shared files were supplied');

    const id = `share-${Date.now().toString(36)}-${(self.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/[^a-z0-9-]/gi, '').slice(0, 40)}`;
    const database = await openShareDatabase();
    try {
        await purgeExpiredSharePayloads(database);
        await new Promise((resolve, reject) => {
            const transaction = database.transaction(SHARE_STORE_NAME, 'readwrite');
            transaction.objectStore(SHARE_STORE_NAME).put({ id, createdAt:Date.now(), files });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error || new Error('Could not save shared files'));
        });
    } finally {
        database.close();
    }
    return id;
}

function shareRedirectUrl(id = null, error = null) {
    const url = new URL(SCOPE_URL);
    if (id) {
        url.searchParams.set('share', 'ready');
        url.searchParams.set('share_id', id);
    } else {
        url.searchParams.set('share', 'error');
        url.searchParams.set('share_error', error || 'unavailable');
    }
    return url.href;
}

async function handleShareTarget(request) {
    try {
        const id = await storeShareTarget(request);
        return Response.redirect(shareRedirectUrl(id), 303);
    } catch (error) {
        console.error('OpenShop share target failed:', error);
        return Response.redirect(shareRedirectUrl(null, 'unavailable'), 303);
    }
}

async function handleNavigation(request) {
    const target = await revisionForNavigation();
    const cached = await cachedShellResponse(request, target.revision, true, target.cacheName);
    if (cached) return cached;
    try {
        return await fetch(request);
    } catch {
        return new Response(
            '<!doctype html><meta charset="utf-8"><title>OpenShop unavailable</title><h1>OpenShop is not ready offline</h1><p>Reconnect once so the hosted shell can finish caching.</p>',
            { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } }
        );
    }
}

async function handleAsset(request) {
    const state = await readState();
    const revision = state.activeRevision || SHELL_REVISION;
    const shellResponse = await cachedShellResponse(request, revision, false, cacheNameForState(state, revision));
    if (shellResponse) return shellResponse;

    if (!isCacheableRuntimeRequest(request)) return fetchRuntimeAsset(request);
    const runtime = await caches.open(RUNTIME_CACHE);
    const cached = await runtime.match(request);
    if (cached) return cached;
    const response = await fetchRuntimeAsset(request);
    if (response && response.ok && response.type !== 'opaque' && responseAllowsRuntimeCaching(response)) {
        await runtime.put(request, response.clone());
        await trimRuntimeCache(runtime);
    }
    return response;
}

async function statusPayload() {
    const state = await readState();
    const revision = state.activeRevision || SHELL_REVISION;
    const cacheName = cacheNameForState(state, revision);
    const cacheNames = await caches.keys();
    const report = state.reports?.[revision] || {};
    // An older revision was cached from its own manifest; checking it against
    // this worker's list would report a healthy shell as incomplete forever.
    const requiredAssets = Array.isArray(report.requiredAssets) && report.requiredAssets.length
        ? report.requiredAssets
        : REQUIRED_ASSETS;
    let requiredCached = 0;
    if (cacheNames.includes(cacheName)) {
        const cache = await caches.open(cacheName);
        const matches = await Promise.all(requiredAssets.map(asset => cache.match(resolveAsset(asset))));
        requiredCached = matches.filter(Boolean).length;
    }
    return {
        ...state,
        workerRevision: SHELL_REVISION,
        activeRevision: revision,
        requiredTotal: requiredAssets.length,
        requiredCached,
        optionalTotal: OPTIONAL_ASSETS.length,
        optionalCached: Number(report.optionalCached || 0),
        shellReady: requiredCached === requiredAssets.length,
        rollbackAvailable: Boolean(state.previousRevision
            && cacheNames.includes(cacheNameForState(state, state.previousRevision)))
    };
}

async function confirmBoot(expectedRevision) {
    const state = await readState();
    if (!expectedRevision) throw new Error('The shell revision is required to confirm boot');
    const currentRevision = state.activeRevision || SHELL_REVISION;
    if (expectedRevision !== currentRevision) {
        throw new Error('The running shell is no longer the active cached revision');
    }
    const confirmed = await writeState({
        ...state,
        activeRevision: currentRevision,
        confirmed: true,
        trialStarted: false,
        trialAttempts: 0,
        confirmedAt: new Date().toISOString()
    });
    await trimShellCaches([confirmed.previousRevision], [confirmed.activeCache, confirmed.previousCache]);
    return statusPayload();
}

async function rollbackShell() {
    const state = await readState();
    if (!state.previousRevision) throw new Error('No previous verified shell is available');
    const failedRevision = state.activeRevision;
    const failedCache = cacheNameForState(state, failedRevision);
    const fallbackCache = cacheNameForState(state, state.previousRevision);
    const rolledBack = await writeState({
        ...state,
        activeRevision: state.previousRevision,
        activeCache:fallbackCache,
        previousRevision: null,
        previousCache:null,
        confirmed: true,
        trialStarted: false,
        rolledBackFrom: failedRevision,
        failedRevision,
        rollbackAt: new Date().toISOString()
    });
    if (failedCache !== fallbackCache) await caches.delete(failedCache);
    await trimShellCaches([], [rolledBack.activeCache]);
    return statusPayload();
}

// Recovery path for a shell that was rolled back: stageShell only runs during
// install, and a byte-identical worker never reinstalls, so without this a
// rolled-back client is pinned to the old shell until a new revision ships.
async function restageShell() {
    await stageShell();
    const state = await readState();
    const restaged = await writeState({
        ...state,
        rolledBackFrom: null,
        failedRevision: null,
        trialAttempts: 0,
        restagedAt: new Date().toISOString()
    });
    if (restaged.stagedRevision === SHELL_REVISION
        && (restaged.activeRevision !== SHELL_REVISION || restaged.activeCache !== restaged.stagedCache)) {
        await activateShell();
    }
    return statusPayload();
}

self.addEventListener('install', event => {
    event.waitUntil(stageShell());
});

self.addEventListener('activate', event => {
    event.waitUntil(activateShell());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (isShareTargetRequest(request)) {
        event.respondWith(handleShareTarget(request));
        return;
    }
    if (request.method !== 'GET') return;
    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(request));
        return;
    }
    const url = new URL(request.url);
    if (url.origin === self.location.origin || RUNTIME_ORIGINS.has(url.origin)) {
        event.respondWith(handleAsset(request));
    }
});

function messageComesFromApp(event) {
    const sourceUrl = event.source?.url;
    if (!sourceUrl) return false;
    try {
        const url = new URL(sourceUrl);
        const scope = new URL(SCOPE_URL);
        if (url.origin !== scope.origin) return false;
        const indexPath = new URL('./index.html', scope).pathname;
        return url.pathname === scope.pathname || url.pathname === indexPath;
    } catch {
        return false;
    }
}

self.addEventListener('message', event => {
    const type = event.data?.type;
    const reply = payload => event.ports?.[0]?.postMessage(payload);
    const knownTypes = new Set([
        'OPENSHOP_APPLY_UPDATE',
        'OPENSHOP_GET_STATUS',
        'OPENSHOP_CONFIRM_BOOT',
        'OPENSHOP_ROLLBACK',
        'OPENSHOP_RESTAGE'
    ]);
    if (!knownTypes.has(type)) return;
    if (!messageComesFromApp(event)) {
        reply({ ok: false, error: 'Only the OpenShop document can control its offline shell' });
        return;
    }
    if (type === 'OPENSHOP_APPLY_UPDATE') {
        event.waitUntil((async () => {
            await self.skipWaiting();
            reply({ ok: true });
        })());
        return;
    }
    if (type === 'OPENSHOP_GET_STATUS') {
        event.waitUntil(statusPayload()
            .then(status => reply({ ok: true, status }))
            .catch(error => reply({ ok: false, error: error.message })));
        return;
    }
    if (type === 'OPENSHOP_CONFIRM_BOOT') {
        event.waitUntil(confirmBoot(event.data?.revision)
            .then(status => reply({ ok: true, status }))
            .catch(error => reply({ ok: false, error: error.message })));
        return;
    }
    if (type === 'OPENSHOP_ROLLBACK') {
        event.waitUntil(rollbackShell()
            .then(status => reply({ ok: true, status }))
            .catch(error => reply({ ok: false, error: error.message })));
        return;
    }
    if (type === 'OPENSHOP_RESTAGE') {
        event.waitUntil(restageShell()
            .then(status => reply({ ok: true, status }))
            .catch(error => reply({ ok: false, error: error.message })));
    }
});
