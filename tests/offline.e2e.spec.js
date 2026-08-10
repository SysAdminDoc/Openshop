import { expect, test } from '@playwright/test';
import { checkoutIdentity } from './checkout-identity.mjs';
import { releaseMetadata } from '../tools/release-metadata.mjs';

const origin = 'http://127.0.0.1:4173';
const productionRevision = releaseMetadata.shellRevision;

async function setServerState(request, state = {}) {
  const response = await request.post(`${origin}/__test/control`, {
    headers: { origin },
    data: {
      revision: productionRevision,
      badShell: false,
      networkDown: false,
      ...state
    }
  });
  expect(response.ok()).toBe(true);
}

async function assertCheckoutIdentity(request) {
  const response = await request.get(`${origin}/__test/identity`);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual(checkoutIdentity);
}

async function clearOfflineState(page) {
  await page.evaluate(async () => {
    if (!navigator.serviceWorker || typeof caches === 'undefined') return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('openshop-')).map(name => caches.delete(name)));
  });
}

test.describe('hosted offline contract', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ request }) => {
    await assertCheckoutIdentity(request);
    await setServerState(request);
  });

  test.afterEach(async ({ page, request, context }) => {
    await context.setOffline(false);
    await setServerState(request);
    if (!page.isClosed()) await clearOfflineState(page);
  });

  test('keeps the local harness bound to its public test surface @cross-browser', async ({ request }) => {
    const rebound = await request.get(`${origin}/`, { headers: { host: 'rebound.example' } });
    expect(rebound.status()).toBe(421);

    const missingOrigin = await request.post(`${origin}/__test/control`, { data: '{}' });
    expect(missingOrigin.status()).toBe(403);
    const foreignOrigin = await request.post(`${origin}/__test/control`, {
      headers: { origin: 'https://example.test' },
      data: '{}'
    });
    expect(foreignOrigin.status()).toBe(403);

    const malformedBody = await request.post(`${origin}/__test/control`, {
      headers: { origin },
      data: '{'
    });
    expect(malformedBody.status()).toBe(400);
    const oversizedBody = await request.post(`${origin}/__test/control`, {
      headers: { origin },
      data: 'x'.repeat(20 * 1024)
    });
    expect(oversizedBody.status()).toBe(413);

    expect((await request.get(`${origin}/package.json`)).status()).toBe(404);
    expect((await request.get(`${origin}/.git/config`)).status()).toBe(404);
    expect((await request.get(`${origin}/%`)).status()).toBe(400);
    expect((await request.get(`${origin}/manifest.webmanifest`)).status()).toBe(200);
  });

  test('caches the complete core shell and reloads it offline @cross-browser', async ({ page, context, request, browserName }) => {
    // Cold-cache worst case: the shell install and the page boot both pull the
    // same three libraries over the network while the rest of the suite runs in
    // parallel.
    test.setTimeout(90000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    // Libraries are verified and executed asynchronously, so there is no OS
    // object to talk to until the boot promise settles.
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    await expect(page.locator('#editor-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Enter Studio' }).click();
    await expect(page.locator('#offline-state')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const status = await page.evaluate(() => OS._requestOfflineWorker('OPENSHOP_GET_STATUS'));
    expect(status.shellReady).toBe(true);
    expect(status.requiredCached).toBe(status.requiredTotal);

    await page.locator('#offline-state').click();
    const offlineDialog = page.getByRole('dialog', { name: 'Offline & Install' });
    await expect(offlineDialog).toBeVisible();
    await expect(offlineDialog).toContainText('0/2 verified files cached');
    await expect(offlineDialog).toContainText('Size checked on first use');
    await page.getByRole('button', { name: 'Close' }).click();

    if (browserName === 'webkit') await setServerState(request, { networkDown: true });
    else await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#editor-canvas')).toBeVisible();
    await expect(page.locator('#offline-state-label')).toHaveText('Offline ready');
    expect(pageErrors).toEqual([]);
  });

  test('versions and scopes the runtime cache, and refuses private or opaque responses @cross-browser', async ({ page }) => {
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    // Libraries are verified and executed asynchronously, so there is no OS
    // object to talk to until the boot promise settles.
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 30000 });
    await page.getByRole('button', { name: 'Enter Studio' }).click();
    await expect(page.locator('#offline-state')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const result = await page.evaluate(async () => {
      const status = await OS._requestOfflineWorker('OPENSHOP_GET_STATUS');
      const runtimeName = `openshop-runtime-${status.activeRevision}`;

      // A cache left by an older shell, which nothing used to prune.
      const stale = await caches.open('openshop-runtime-0.0.1-r1');
      await stale.put('https://example.test/stale.js', new Response('stale'));

      // An error page fetched no-cors used to be stored opaque — status hidden —
      // and served cache-first forever, outliving the network recovering.
      const missing = 'https://cdn.jsdelivr.net/npm/openshop-does-not-exist@0.0.0/missing.js';
      await fetch(missing, { mode: 'no-cors' }).catch(() => {});

      const probes = {
        allowed: `${location.origin}/manifest.webmanifest?runtimePolicy=public`,
        private: `${location.origin}/manifest.webmanifest?runtimePolicy=private`,
        varying: `${location.origin}/manifest.webmanifest?runtimePolicy=vary-cookie`,
        unrelated: `${location.origin}/__test/cacheable.js`
      };
      for (const url of Object.values(probes)) await fetch(url, { cache: 'reload' });

      await OS._requestOfflineWorker('OPENSHOP_CONFIRM_BOOT', { revision: status.activeRevision });

      const names = await caches.keys();
      const runtime = await caches.open(runtimeName);
      const poisoned = await runtime.match(missing);
      return {
        activeRevision: status.activeRevision,
        runtimeNames: names.filter(name => name.startsWith('openshop-runtime-')),
        unversioned: names.includes('openshop-runtime-v1'),
        poisonedCached: Boolean(poisoned),
        poisonedStatus: poisoned ? poisoned.status : null,
        allowedCached: Boolean(await runtime.match(probes.allowed)),
        privateCached: Boolean(await runtime.match(probes.private)),
        varyingCached: Boolean(await runtime.match(probes.varying)),
        unrelatedCached: Boolean(await runtime.match(probes.unrelated))
      };
    });

    expect(result.runtimeNames).toEqual([`openshop-runtime-${result.activeRevision}`]);
    expect(result.unversioned).toBe(false);
    expect(result.poisonedCached).toBe(false);
    expect(result.allowedCached).toBe(true);
    expect(result.privateCached).toBe(false);
    expect(result.varyingCached).toBe(false);
    expect(result.unrelatedCached).toBe(false);
  });

  test('ignores a page-written shell revision and requires an exact boot revision', async ({ page }) => {
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    await expect(page.locator('#offline-state')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const missingRevisionError = await page.evaluate(async () => {
      try {
        await OS._requestOfflineWorker('OPENSHOP_CONFIRM_BOOT');
        return null;
      } catch (error) {
        return error.message;
      }
    });
    expect(missingRevisionError).toContain('revision is required');

    await page.evaluate(async () => {
      const stateUrl = new URL('./__openshop_offline_state__', location.href).href;
      const meta = await caches.open('openshop-offline-meta-v1');
      const current = await (await meta.match(stateUrl)).json();
      await meta.put(stateUrl, new Response(JSON.stringify({
        ...current,
        activeRevision: 'attacker-selected',
        confirmed: true
      }), { headers: { 'content-type': 'application/json' } }));
      const poisoned = await caches.open('openshop-shell-attacker-selected');
      await poisoned.put(new URL('./index.html', location.href).href, new Response(
        '<!doctype html><main id="cache-poison">Wrong shell</main>',
        { headers: { 'content-type': 'text/html' } }
      ));
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    await expect(page.locator('#cache-poison')).toHaveCount(0);
    await expect(page.locator('#editor-canvas')).toBeVisible();
    const status = await page.evaluate(() => OS._requestOfflineWorker('OPENSHOP_GET_STATUS'));
    expect(status.activeRevision).toBe(productionRevision);
  });

  test('rejects shell-control messages from another page in the worker scope', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(`${origin}/__test/untrusted.html`, { waitUntil: 'domcontentloaded' });
    const reply = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => resolve(event.data);
        setTimeout(() => reject(new Error('worker reply timed out')), 10000);
        registration.active.postMessage({ type: 'OPENSHOP_APPLY_UPDATE' }, [channel.port2]);
      });
    });
    expect(reply).toEqual({
      ok: false,
      error: 'Only the OpenShop document can control its offline shell'
    });
  });

  test('declares supported file handlers and consumes a queued project launch @cross-browser', async ({ page, request }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'launchQueue', {
        configurable: true,
        value: {
          setConsumer(callback) {
            window.__openshopLaunchConsumer = callback;
          }
        }
      });
    });

    const manifestResponse = await request.get(`${origin}/manifest.webmanifest`);
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest.icons.filter(icon => icon.purpose === 'maskable')).toHaveLength(2);
    expect(manifest.screenshots.map(screenshot => screenshot.form_factor)).toEqual(['wide', 'narrow']);
    expect(manifest.shortcuts.map(shortcut => shortcut.url)).toEqual(['./?action=new', './?action=open']);
    expect(manifest.launch_handler.client_mode).toBe('navigate-existing');
    expect(manifest.share_target).toMatchObject({
      action: './?share=target',
      method: 'POST',
      enctype: 'multipart/form-data'
    });
    expect(manifest.share_target.params.files[0].accept).toContain('image/*');
    expect(manifest.file_handlers[0].accept['image/vnd.adobe.photoshop']).toContain('.psd');
    expect(manifest.file_handlers[0].accept['application/vnd.openshop+json']).toContain('.openshop');
    expect(manifest.file_handlers[0].accept['application/pdf']).toContain('.pdf');
    expect(manifest.file_handlers[0].accept['application/octet-stream']).toContain('.cr3');
    for (const screenshot of manifest.screenshots) {
      expect((await request.get(`${origin}/${screenshot.src.slice(2)}`)).ok()).toBe(true);
    }

    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    // Libraries are verified and executed asynchronously, so there is no OS
    // object to talk to until the boot promise settles.
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    await expect(page.locator('#editor-canvas')).toBeVisible();
    const result = await page.evaluate(async () => {
      // The editor boots into a blank workspace with no document session, which
      // is deliberate (see "keeps a first-class blank workspace separate from the
      // document session"). Capturing state needs a document to capture.
      await OS.createNewDocument({ width: 320, height: 240, clean: true });
      const project = OS._captureDocumentState();
      project.document.name = 'Launched Project';
      const file = new File([JSON.stringify(project)], 'launched.openshop', {
        type: 'application/vnd.openshop+json'
      });
      window.__openshopLaunchConsumer({
        files: [{
          async getFile() {
            return file;
          }
        }]
      });
      await new Promise((resolve, reject) => {
        const started = performance.now();
        const poll = () => {
          if (OS._docName === 'Launched Project' && document.getElementById('welcome-overlay').classList.contains('hidden')) return resolve();
          if (performance.now() - started > 5000) return reject(new Error('Launch queue project was not consumed'));
          setTimeout(poll, 25);
        };
        poll();
      });
      return {
        name: OS._docName,
        state: OS._persistenceState,
        welcomeHidden: document.getElementById('welcome-overlay').classList.contains('hidden')
      };
    });

    expect(result).toEqual({
      name: 'Launched Project',
      state: 'clean',
      welcomeHidden: true
    });
  });

  test('stores a multipart share target and opens the handed-off image', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    await expect(page.locator('#editor-canvas')).toBeVisible();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    }
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });

    const redirect = await page.evaluate(async () => {
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg=='), character => character.charCodeAt(0));
      const body = new FormData();
      body.append('files', new File([bytes], 'shared.png', { type:'image/png' }));
      const response = await fetch('./?share=target', { method:'POST', body });
      return {
        status:response.status,
        location:response.url
      };
    });
    expect(redirect.status).toBe(200);
    expect(redirect.location).toContain('share=ready');
    expect(redirect.location).toContain('share_id=share-');

    await page.goto(new URL(redirect.location, origin).href, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    await page.waitForFunction(() => OS._docName === 'shared', null, { timeout: 30000 });
    await expect(page.locator('#welcome-overlay')).toHaveClass(/hidden/);
    const remaining = await page.evaluate(async () => new Promise((resolve, reject) => {
      const request = indexedDB.open('openshop-share-v1', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('payloads', 'readonly');
        const getAll = transaction.objectStore('payloads').getAll();
        getAll.onsuccess = () => { database.close(); resolve(getAll.result.length); };
        getAll.onerror = () => { database.close(); reject(getAll.error); };
      };
    }));
    expect(remaining).toBe(0);
  });

  test('returns to the last verified shell when an update cannot confirm boot', async ({ page, request }) => {
    test.setTimeout(90000);
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    // Libraries are verified and executed asynchronously, so there is no OS
    // object to talk to until the boot promise settles.
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    await expect(page.locator('#offline-state')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await setServerState(request, { revision: 'test-v2-bad', badShell: true });
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
    });
    await page.waitForFunction(() => Boolean(OS._pwaRegistration?.waiting));
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const changed = new Promise(resolve => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      });
      registration.waiting.postMessage({ type: 'OPENSHOP_APPLY_UPDATE' });
      await changed;
    });

    // A single unconfirmed navigation is normal (second tab, refresh during
    // load, quick close) and must not roll the update back.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#bad-shell')).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#bad-shell')).toBeVisible();
    // The trial shell has no OS object, so ask the worker directly.
    const stillTrialling = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => resolve(event.data?.status);
        setTimeout(() => reject(new Error('worker status timed out')), 5000);
        registration.active.postMessage({ type: 'OPENSHOP_GET_STATUS' }, [channel.port2]);
      });
    });
    expect(stillTrialling.rolledBackFrom).toBeFalsy();
    expect(stillTrialling.activeRevision).toBe('test-v2-bad');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#bad-shell')).toBeVisible();

    // Repeated failures to confirm do roll back.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#editor-canvas')).toBeVisible();
    const status = await page.evaluate(() => OS._requestOfflineWorker('OPENSHOP_GET_STATUS'));
    expect(status.activeRevision).toBe(productionRevision);
    expect(status.rolledBackFrom).toBe('test-v2-bad');
    expect(status.shellReady).toBe(true);
  });

  test('a failed re-stage leaves the working offline shell intact', async ({ page, context, request }) => {
    test.setTimeout(90000);
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    await expect(page.locator('#offline-state')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const before = await page.evaluate(() => OS._requestOfflineWorker('OPENSHOP_GET_STATUS'));
    expect(before.shellReady).toBe(true);

    // Rebuild Offline Shell on a dead connection. Staging used to delete the
    // live cache before refetching, so this wiped a working install and left
    // the user on the "not ready offline" page until the network came back.
    await setServerState(request, { networkDown: true });
    const failed = await page.evaluate(async () => {
      try {
        await OS._requestOfflineWorker('OPENSHOP_RESTAGE');
        return null;
      } catch (error) {
        return String(error.message || error);
      }
    });
    expect(failed).toBeTruthy();

    // The shell survived, and the app still loads with the origin unreachable.
    const after = await page.evaluate(() => OS._requestOfflineWorker('OPENSHOP_GET_STATUS'));
    expect(after.shellReady).toBe(true);
    expect(after.activeRevision).toBe(productionRevision);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#editor-canvas')).toBeVisible();
    await context.setOffline(false);
  });

  test('gates every runtime replacement behind an explicit dirty-document decision', async ({ page }) => {
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    await page.getByRole('button', { name: 'Enter Studio' }).click();

    const result = await page.evaluate(async () => {
      OS._isDirty = true;
      OS._pwaRegistration = { waiting:{} };
      OS.__offlineCalls = [];
      OS._requestOfflineWorker = async type => { OS.__offlineCalls.push(type); return true; };
      OS._saveOfflineDocumentBeforeReplacement = async () => { OS.__offlineSaved = true; return true; };
      OS._discardOfflineDocumentBeforeReplacement = async () => { OS.__offlineDiscarded = true; return true; };

      const decide = async (operation, label) => {
        const pending = operation();
        await new Promise(resolve => setTimeout(resolve, 0));
        const overlay = [...document.querySelectorAll('.modal-overlay')].at(-1);
        const button = [...overlay.querySelectorAll('button')].find(candidate => candidate.textContent === label);
        if (!button) throw new Error(`Decision button ${label} was not rendered`);
        button.click();
        return pending;
      };

      const cancelled = await decide(() => OS.applyOfflineUpdate(), 'Cancel');
      const afterCancel = { calls:[...OS.__offlineCalls], dirty:OS._isDirty };

      OS._offlineRuntimeReplacementInProgress = false;
      OS._offlineReloadForUpdate = false;
      OS._isDirty = true;
      OS._saveOfflineDocumentBeforeReplacement = async () => false;
      const failedSavePromise = OS.applyOfflineUpdate();
      await new Promise(resolve => setTimeout(resolve, 0));
      const failedSaveOverlay = [...document.querySelectorAll('.modal-overlay')].at(-1);
      failedSaveOverlay.querySelector('button:not([data-modal-cancel])').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const failedSaveModalStayed = document.body.contains(failedSaveOverlay);
      const failedSaveCalls = [...OS.__offlineCalls];
      failedSaveOverlay.querySelector('[data-modal-cancel]').click();
      const failedSave = await failedSavePromise;

      OS._offlineRuntimeReplacementInProgress = false;
      OS._offlineReloadForUpdate = false;
      OS._isDirty = true;
      OS._saveOfflineDocumentBeforeReplacement = async () => { OS.__offlineSaved = true; return true; };
      const saved = await decide(() => OS.applyOfflineUpdate(), 'Save');
      const afterSave = { calls:[...OS.__offlineCalls], saved:OS.__offlineSaved, replacement:OS._offlineRuntimeReplacementInProgress };

      OS._offlineRuntimeReplacementInProgress = false;
      OS._offlineReloadForUpdate = false;
      OS._isDirty = true;
      const rollbackCancelled = await decide(() => OS.rollbackOfflineShell(), 'Cancel');
      const afterRollbackCancel = [...OS.__offlineCalls];

      OS._offlineRuntimeReplacementInProgress = false;
      OS._isDirty = true;
      OS._requestOfflineWorker = async type => {
        OS.__offlineCalls.push(type);
        throw new Error('test keeps the page from reloading');
      };
      const restageDiscarded = await decide(() => OS.restageOfflineShell(), 'Discard');
      return {
        cancelled,
        afterCancel,
        failedSave,
        failedSaveModalStayed,
        failedSaveCalls,
        saved,
        afterSave,
        rollbackCancelled,
        afterRollbackCancel,
        restageDiscarded,
        discarded:OS.__offlineDiscarded,
        finalReplacement:OS._offlineRuntimeReplacementInProgress
      };
    });

    expect(result.cancelled).toBe(false);
    expect(result.afterCancel).toEqual({ calls:[], dirty:true });
    expect(result.failedSave).toBe(false);
    expect(result.failedSaveModalStayed).toBe(true);
    expect(result.failedSaveCalls).toEqual([]);
    expect(result.saved).toBe(true);
    expect(result.afterSave).toEqual({
      calls:['OPENSHOP_APPLY_UPDATE'], saved:true, replacement:true
    });
    expect(result.rollbackCancelled).toBe(false);
    expect(result.afterRollbackCancel).toEqual(['OPENSHOP_APPLY_UPDATE']);
    expect(result.restageDiscarded).toBe(false);
    expect(result.discarded).toBe(true);
    expect(result.finalReplacement).toBe(false);
  });

  test('resumes an interrupted promotion without replacing the verified shell', async ({ page, request }) => {
    test.setTimeout(120000);
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 60000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const before = await page.evaluate(() => OS._requestOfflineWorker('OPENSHOP_GET_STATUS'));
    expect(before.shellReady).toBe(true);

    // A test-only service-worker URL aborts after the first candidate write.
    // The old worker remains active, so the page can still ask it for status.
    await setServerState(request, { revision:'test-v2-promotion' });
    const interrupted = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register(
        './sw.js?openshop-test-abort-promotion=1',
        { scope:'./', updateViaCache:'none' }
      );
      const installing = registration.installing || await new Promise(resolve => {
        registration.addEventListener('updatefound', () => resolve(registration.installing), { once:true });
      });
      await new Promise(resolve => {
        if (installing.state === 'redundant') return resolve();
        installing.addEventListener('statechange', () => {
          if (installing.state === 'redundant') resolve();
        });
      });
      const status = await OS._requestOfflineWorker('OPENSHOP_GET_STATUS');
      return { installState:installing.state, status };
    });
    expect(interrupted.installState).toBe('redundant');
    expect(interrupted.status.activeRevision).toBe(before.activeRevision);
    expect(interrupted.status.shellReady).toBe(true);

    // Removing the interruption flag lets a fresh worker consume the retained
    // staging cache and candidate, proving the marker is resumable as well as
    // keeping the old shell alive during the failed attempt.
    const resumed = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register(
        './sw.js?openshop-test-abort-promotion=0',
        { scope:'./', updateViaCache:'none' }
      );
      const installing = registration.installing || await new Promise(resolve => {
        registration.addEventListener('updatefound', () => resolve(registration.installing), { once:true });
      });
      await new Promise((resolve, reject) => {
        if (installing.state === 'installed') return resolve();
        if (installing.state === 'redundant') return reject(new Error('Resumed promotion became redundant'));
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') resolve();
          if (installing.state === 'redundant') reject(new Error('Resumed promotion became redundant'));
        });
      });
      const waiting = registration.waiting;
      await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => event.data?.ok ? resolve() : reject(new Error(event.data?.error));
        waiting.postMessage({ type:'OPENSHOP_APPLY_UPDATE' }, [channel.port2]);
      });
      await new Promise(resolve => {
        if (navigator.serviceWorker.controller?.scriptURL.includes('openshop-test-abort-promotion=0')) return resolve();
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once:true });
      });
      return OS._requestOfflineWorker('OPENSHOP_GET_STATUS');
    });
    expect(resumed.activeRevision).toBe('test-v2-promotion');
    expect(resumed.shellReady).toBe(true);
  });
});
