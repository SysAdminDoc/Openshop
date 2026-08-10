import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkoutIdentity } from './checkout-identity.mjs';

const fileAppUrl = pathToFileURL(join(process.cwd(), 'index.html')).toString();
const fixturePath = name => join(process.cwd(), 'tests', 'fixtures', name);
const require = createRequire(import.meta.url);
const axeSourcePath = require.resolve('axe-core/axe.min.js');

function projectAppUrl() {
  return test.info().project.metadata?.appUrl || fileAppUrl;
}

async function assertCheckoutIdentity(page, url) {
  const identityUrl = new URL('/__test/identity', url).toString();
  const response = await page.request.get(identityUrl);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual(checkoutIdentity);
}

// The three libraries the editor needs are fetched and SHA-384 verified in page
// now rather than loaded from <script src>, so nothing is wired up until the
// boot promise settles.
async function openApp(page, url, { axe = false } = {}) {
  if (axe) await page.addInitScript({ path: axeSourcePath });
  const targetUrl = url || projectAppUrl();
  if (/^https?:/i.test(targetUrl)) await assertCheckoutIdentity(page, targetUrl);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 30000 });
}

async function runCriticalAxe(page) {
  await expect.poll(() => page.evaluate(() => Boolean(window.axe))).toBe(true);
  return page.evaluate(async () => {
    const result = await window.axe.run(document, { resultTypes:['violations'] });
    return result.violations
      .filter(violation => ['serious', 'critical'].includes(violation.impact))
      .map(violation => ({
        id:violation.id,
        impact:violation.impact,
        nodes:violation.nodes.map(node => node.target.join(' '))
      }));
  });
}

test('keeps a first-class blank workspace separate from the document session @cross-browser', async ({ page }) => {
  await openApp(page);

  const initial = await page.evaluate(() => ({
    document: OS.session.document,
    state: document.documentElement.dataset.osDocument,
    layers: OS.layers.length
  }));
  expect(initial).toEqual({
    document: { activeId: null, openIds: [], name: null },
    state: 'blank',
    layers: 0
  });

  await page.getByRole('button', { name: 'Enter Studio' }).click();
  const afterEnter = await page.evaluate(() => ({
    document: OS.session.document,
    state: document.documentElement.dataset.osDocument,
    layers: OS.layers.length,
    dismissed: OS._welcomeDismissed
  }));
  expect(afterEnter).toMatchObject({ state: 'open', layers: 2, dismissed: true });
  await expect(page.locator('#blank-workspace')).toHaveClass(/hidden/);
  await page.evaluate(() => OS.setTool('brush'));
  const afterClose = await page.evaluate(() => OS.closeDocument({ force: true }).then(() => ({
    document: OS.session.document,
    state: document.documentElement.dataset.osDocument,
    layers: OS.layers.length,
    tool: OS.session.tool.selectedId,
    tabs: OS.session.panels.activeTabs
  })));

  expect(afterClose).toEqual({
    document: { activeId: null, openIds: [], name: null },
    state: 'blank',
    layers: 0,
    tool: 'brush',
    tabs: { ptg1: 'ptg1-layers', ptg2: 'ptg2-color', ptg3: 'ptg3-history' }
  });
});

test('renders the intentional blank studio as a first-class state @cross-browser', async ({ page }, testInfo) => {
  await openApp(page);
  await page.evaluate(() => OS.dismissWelcome());
  await expect(page.locator('#welcome-overlay')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-os-document', 'blank');
  await expect(page.locator('#layers-empty')).toContainText('No document open');
  await expect(page.locator('#history-list .history-empty')).toContainText('History begins after you open a document.');
  await expect(page.locator('#select-auto')).toBeDisabled();
  await expect(page.locator('#select-transform')).toBeDisabled();
  await expect(page.locator('#blank-workspace .blank-kicker')).toHaveText('Local workspace ready');

  if (testInfo.project.name === 'chromium') {
    await expect(page).toHaveScreenshot('openshop-blank-shell.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixelRatio: 0.03
    });
  }
});

test('loads the editor shell and supports core UI interactions @cross-browser', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await openApp(page);
  await page.evaluate(() => {
    document.dispatchEvent(new MouseEvent('mouseenter'));
    document.dispatchEvent(new MouseEvent('click'));
  });
  await expect(page.locator('#editor-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Enter Studio' }).click();
  await expect(page.locator('#welcome-overlay')).toHaveClass(/hidden/);
  await expect(page.locator('.tool-btn[data-tool="select"]').first()).toHaveClass(/active/);

  const brushTool = page.locator('.tool-btn[data-tool="brush"]').first();
  await brushTool.click();
  await brushTool.click();
  await expect(brushTool).toHaveClass(/active/);

  const layerItems = page.locator('#layers-list-visual .layer-item');
  const layerCount = await layerItems.count();
  await page.locator('button[title="New Layer"]').click();
  await expect(layerItems).toHaveCount(layerCount + 1);

  await page.keyboard.press('Control+Z');
  await expect(page.locator('#history-list .history-item.current')).toContainText(/New Document|New Layer/);

  // One rendering engine owns the visual baseline; the others are here to prove
  // the flow works, not to re-litigate sub-pixel text rasterisation.
  if (testInfo.project.name === 'chromium') {
    await expect(page).toHaveScreenshot('openshop-editor-shell.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixelRatio: 0.03
    });
  }
  expect(pageErrors).toEqual([]);
});

test('groups layers with live hierarchy, persistence, cascading state, and shortcuts @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.addLayer({ name:'Groupable A' });
    OS.addLayer({ name:'Groupable B' });
    const a = OS.layers.findIndex(layer => layer.name === 'Groupable A');
    const b = OS.layers.findIndex(layer => layer.name === 'Groupable B');
    const first = new fabric.Rect({ left:40, top:40, width:20, height:20, fill:'#f00', name:'Groupable A object' });
    const second = new fabric.Rect({ left:80, top:40, width:20, height:20, fill:'#00f', name:'Groupable B object' });
    OS.canvas.add(first); OS.canvas.add(second);
    OS.layers[a].objects.push(first); OS.layers[b].objects.push(second);
    OS._enforceLayerInvariants();
    OS.groupLayers([a, b]);
    const group = OS.layers[OS.activeLayerIdx];
    const childNames = OS.layers.filter(layer => layer.parentId === group.id).map(layer => layer.name);
    OS.toggleLayerVisibility(OS.activeLayerIdx);
    OS.setLayerOpacity(50);
    const cascaded = [first, second].map(object => ({ visible:object.visible, opacity:object.opacity }));
    const beforeCollapse = document.querySelectorAll('#layers-list [role="option"]').length;
    OS.toggleGroupCollapsed(OS.activeLayerIdx);
    const afterCollapse = document.querySelectorAll('#layers-list [role="option"]').length;
    const saved = OS._captureDocumentState();
    await OS._loadDocumentState(saved, { trusted:true });
    const restoredGroup = OS.layers.find(layer => layer.kind === 'group');
    const restoredChildren = OS.layers.filter(layer => layer.parentId === restoredGroup?.id).map(layer => layer.name);
    OS.selectLayer(OS.layers.indexOf(restoredGroup));
    return {
      group:{ name:group.name, kind:group.kind, childNames, visible:group.visible, opacity:group.opacity },
      cascaded,
      collapsedRows:[beforeCollapse, afterCollapse],
      restored:{ kind:restoredGroup?.kind, opacity:restoredGroup?.opacity, collapsed:restoredGroup?.collapsed, children:restoredChildren },
      optionLabels:[...document.querySelectorAll('#layers-list [role="option"]')].map(option => option.getAttribute('aria-label'))
    };
  });

  expect(result.group).toEqual({ name:'Group', kind:'group', childNames:['Groupable A', 'Groupable B'], visible:false, opacity:50 });
  expect(result.cascaded).toEqual([{ visible:false, opacity:0.5 }, { visible:false, opacity:0.5 }]);
  expect(result.collapsedRows[1]).toBe(result.collapsedRows[0] - 2);
  expect(result.restored).toEqual({ kind:'group', opacity:50, collapsed:true, children:['Groupable A', 'Groupable B'] });
  expect(result.optionLabels).toContain('Group, hidden');

  await page.keyboard.press('Control+Shift+G');
  await expect.poll(() => page.evaluate(() => OS.layers.some(layer => layer.kind === 'group'))).toBe(false);
  await page.keyboard.press('Control+G');
  await expect.poll(() => page.evaluate(() => OS.layers.some(layer => layer.kind === 'group'))).toBe(true);
});

test('opens command search and keeps both zoom readouts synchronized @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).evaluate(button => button.click());

  const commandButton = page.getByRole('button', { name: 'Open command palette' });
  await expect(commandButton).toBeVisible();
  await commandButton.click();
  await expect(page.locator('#cmd-palette')).toHaveClass(/visible/);
  await expect(page.locator('#cmd-input')).toBeFocused();
  await page.evaluate(() => OS.closeCmdPalette());

  const before = await page.locator('#canvas-zoom-display').textContent();
  await page.getByRole('button', { name: 'Zoom in' }).evaluate(button => button.click());
  const canvasReadout = page.locator('#canvas-zoom-display');
  const statusReadout = page.locator('#zoom-display');
  await expect(canvasReadout).not.toHaveText(before);
  await expect(statusReadout).toHaveText(await canvasReadout.textContent());
});

test('keeps composite controls and responsive drawers accessible in every shell state @cross-browser @mobile', async ({ page }) => {
  await openApp(page, undefined, { axe:true });
  const failures = {};
  await page.evaluate(() => OS.dismissWelcome());
  failures.blank = await runCriticalAxe(page);

  await page.evaluate(() => OS.createNewDocument(320, 240, { resetProject:true }));
  failures.editor = await runCriticalAxe(page);

  const panelSemantics = await page.evaluate(() => ({
    tablists:document.querySelectorAll('[role="tablist"]').length,
    tabs:document.querySelectorAll('[role="tab"]').length,
    tabpanels:document.querySelectorAll('[role="tabpanel"]').length,
    controlled:[...document.querySelectorAll('[role="tab"]')].every(tab => {
      const target = document.getElementById(tab.getAttribute('aria-controls'));
      return target && target.getAttribute('aria-labelledby') === tab.id;
    }),
    controls:[...document.querySelectorAll('input:not([type="hidden"]),select,textarea')]
      .filter(control => !control.getAttribute('aria-label')
        && !control.getAttribute('aria-labelledby')
        && !(control.labels && control.labels.length))
      .map(control => control.id || control.type)
  }));
  expect(panelSemantics.tablists).toBeGreaterThanOrEqual(4);
  expect(panelSemantics.tabs).toBeGreaterThanOrEqual(10);
  expect(panelSemantics.tabpanels).toBeGreaterThanOrEqual(5);
  expect(panelSemantics.controlled).toBe(true);
  expect(panelSemantics.controls).toEqual([]);

  const commandButton = page.getByRole('button', { name: 'Open command palette' });
  if (await commandButton.isVisible()) await commandButton.click();
  else await page.evaluate(() => OS.toggleCmdPalette());
  await expect(page.locator('#cmd-input')).toHaveAttribute('role', 'combobox');
  await expect(page.locator('#cmd-input')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#cmd-results')).toHaveAttribute('role', 'listbox');
  await expect(page.locator('#cmd-results [role="option"]').first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#cmd-input')).toHaveAttribute('aria-activedescendant', /openshop-command-option-/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#cmd-palette')).not.toHaveClass(/visible/);
  if (await commandButton.isVisible()) await expect(commandButton).toBeFocused();

  await page.evaluate(() => OS.showShortcuts());
  failures.modal = await runCriticalAxe(page);
  await page.locator('.modal-overlay [data-modal-close]').click();
  await page.evaluate(() => OS.setWorkspaceMode('mobile', { announce:false }));
  await expect(page.locator('#panels')).toHaveAttribute('inert', '');
  await expect(page.locator('#mobile-panel-toggle')).toHaveAttribute('aria-expanded', 'false');
  failures.mobile = await runCriticalAxe(page);
  expect(failures).toEqual({ blank:[], editor:[], modal:[], mobile:[] });
});

test('keeps every slider paired with a keyboard-editable number and supports pixel-perfect zoom @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).evaluate(button => button.click());

  const ranges = await page.evaluate(() => [...document.querySelectorAll('input[type="range"]')].map(range => ({
    id:range.id,
    numberId:range.dataset.rangeNumberId,
    numberExists:Boolean(range.dataset.rangeNumberId && document.getElementById(range.dataset.rangeNumberId)),
    numberType:range.dataset.rangeNumberId ? document.getElementById(range.dataset.rangeNumberId)?.type : null
  })));
  expect(ranges.length).toBeGreaterThan(20);
  expect(ranges.filter(range => !range.numberId || !range.numberExists || range.numberType !== 'number')).toEqual([]);

  await page.evaluate(() => OS.setTool('brush'));
  const brushSize = page.locator('#brush-size');
  const brushSizeNumber = page.locator('#brush-size-number');
  await expect(brushSizeNumber).toBeVisible();
  await brushSizeNumber.fill('42');
  await expect(brushSize).toHaveValue('42');
  await expect.poll(() => page.evaluate(() => OS.state.brushSize)).toBe(42);
  await brushSizeNumber.fill('999');
  await brushSizeNumber.press('Enter');
  await expect(brushSize).toHaveValue('150');

  await page.evaluate(() => {
    const row = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = 'Dynamic';
    const range = document.createElement('input');
    range.id = 'dynamic-range';
    range.type = 'range';
    range.min = '0';
    range.max = '10';
    range.value = '3';
    const output = document.createElement('span');
    output.textContent = '3';
    row.append(label, range, output);
    document.body.appendChild(row);
  });
  const dynamicNumber = page.locator('#dynamic-range-number');
  await expect(dynamicNumber).toHaveAttribute('aria-label', 'Dynamic numeric value');
  await dynamicNumber.fill('8');
  await expect(page.locator('#dynamic-range')).toHaveValue('8');

  await page.evaluate(() => OS.setTool('zoom'));
  const pixelZoom = page.locator('#zoom-pixel-snap');
  await expect(pixelZoom).toBeVisible();
  await pixelZoom.check();
  const snapped = await page.evaluate(() => {
    OS.zoom = 1;
    OS.zoomIn();
    OS.canvas.renderAll();
    return {
      zoom:OS.zoom,
      canvasSmoothing:OS.canvas.imageSmoothingEnabled,
      contextSmoothing:OS.canvas.contextContainer?.imageSmoothingEnabled
    };
  });
  expect(snapped).toEqual({ zoom:2, canvasSmoothing:false, contextSmoothing:false });
  await page.evaluate(() => OS.zoomOut());
  await expect.poll(() => page.evaluate(() => OS.zoom)).toBe(1);
});

test('surfaces active document color metadata without stale blank-state values @cross-browser', async ({ page }) => {
  await openApp(page);

  await expect(page.locator('#status-bit-depth')).toHaveText('—');
  await expect(page.locator('#status-color-profile')).toHaveText('—');
  await page.getByRole('button', { name: 'Enter Studio' }).evaluate(button => button.click());
  await expect(page.locator('#status-bit-depth')).toHaveText('8 bit');
  await expect(page.locator('#status-color-profile')).toHaveText('sRGB IEC61966-2.1');
  await expect(page.locator('#info-color-mode')).toHaveText('RGB / 8 bit');

  await page.evaluate(() => {
    OS._colorProfile = { name:'Display P3', sourceKind:'embedded', iccData:null };
    OS.updateStatus();
  });
  await expect(page.locator('#status-color-profile')).toHaveText('Display P3');
  await expect(page.locator('#info-color-profile')).toHaveText('Display P3');
  await expect(page.locator('#status-color-profile')).toHaveAttribute('title', 'Display P3');

  await page.setViewportSize({ width:820, height:900 });
  await expect(page.locator('#status-bit-depth')).toBeVisible();
  await expect(page.locator('#persistence-state')).toBeVisible();
  await expect(page.locator('#network-state')).toBeVisible();
  await expect(page.locator('#status-color-profile')).toBeHidden();
  await expect(page.locator('#offline-state')).toBeHidden();
  await expect(page.locator('#object-count')).toBeHidden();
  expect(await page.locator('#statusbar').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  await page.evaluate(() => OS.closeDocument({ force:true }));
  await expect(page.locator('#status-bit-depth')).toHaveText('—');
  await expect(page.locator('#status-color-profile')).toHaveText('—');
  await expect(page.locator('#info-color-mode')).toHaveText('—');
  await expect(page.locator('#info-color-profile')).toHaveText('—');
});

test('shows imported image metadata and makes the export privacy policy explicit @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();
  await page.evaluate(() => {
    OS._imageMetadata = OS._normalizeImageMetadata({
      sourceFormat:'jpeg',
      exif:{ orientation:1, make:'OpenShop', model:'Camera', hasGps:true },
      xmp:{ title:'Travel photo', hasLocation:true },
      c2pa:{
        detected:true,
        status:'invalid',
        activeLabel:'manifest-1',
        manifests:[{ label:'manifest-1', title:'Travel source', ingredients:[{ title:'Camera original' }] }],
        validation:[{ code:'signingCredential.untrusted', explanation:'Certificate could not be trusted.', status:'invalid' }]
      }
    });
    OS.showImageInfo();
    OS.showExportSettings('jpeg');
  });
  await expect(page.locator('.modal-overlay').filter({ hasText:'Image Information' })).toContainText('OpenShop Camera');
  await expect(page.locator('.c2pa-details')).toContainText('Travel source');
  await expect(page.locator('.c2pa-details')).toContainText('Invalid — validation failed');
  const exportDialog = page.locator('.modal-overlay').filter({ hasText:'Export Settings' });
  await expect(exportDialog.locator('#es-metadata')).toHaveValue('strip-location');
  await expect(exportDialog.locator('#es-metadata option')).toHaveText([
    'Strip location only (recommended)', 'Preserve imported EXIF/XMP', 'Strip all metadata'
  ]);
  await expect.poll(() => page.evaluate(() => OS._getExportImpact('jpeg', { metadataPolicy:'preserve' }).warnings.some(warning => warning.includes('including location fields')))).toBe(true);
});

test('keeps the C2PA reader lazy and reports an unreadable detected marker', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const before = OS._runtimeResourceReport();
    const absent = await OS._readC2PAMetadata(new Uint8Array([1, 2, 3, 4]), 'image/png');
    const afterAbsent = OS._runtimeResourceReport();
    const detected = await OS._readC2PAMetadata(new TextEncoder().encode('synthetic c2pa marker'), 'image/jpeg');
    return {
      absent,
      before,
      afterAbsent,
      detected,
      loaded:[...OS._runtimeLoadedAssets].filter(name => name.startsWith('c2pa'))
    };
  });
  expect(result.absent).toBeNull();
  expect(result.afterAbsent).toMatchObject({ retainedAssetBytes:result.before.retainedAssetBytes, loadedAssets:result.before.loadedAssets });
  expect(result.detected).toMatchObject({ detected:true });
  expect(['invalid', 'error']).toContain(result.detected.status);
  expect(result.loaded).toEqual(expect.arrayContaining(['c2paModule', 'c2paWasm', 'c2paHighgain', 'c2paDeepmerge']));
});

test('opens a tagged Display P3 raster with an explicit working-space conversion and embeds it on export', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).evaluate(button => button.click());
  const result = await page.evaluate(async () => {
    const source = document.createElement('canvas');
    source.width = 2;
    source.height = 1;
    const sourceContext = source.getContext('2d');
    sourceContext.fillStyle = '#d06040';
    sourceContext.fillRect(0, 0, 1, 1);
    sourceContext.fillStyle = '#4070d0';
    sourceContext.fillRect(1, 0, 1, 1);
    const tagged = OS._embedRasterICCDataUrl(source.toDataURL('image/png'), 'png', OS._makeMatrixICCProfile('display-p3'));
    const file = new File([OS._dataUrlToBytes(tagged)], 'display-p3.png', { type:'image/png' });
    OS._confirmDiscardUnsaved = async () => true;
    const opened = await OS._loadRasterFile(file, 'open');
    const exported = OS._captureExportRaster({ format:'png', transparent:true });
    const outputProfile = await OS._readEmbeddedColorProfile(OS._dataUrlToBytes(exported.dataUrl), 'image/png');
    return {
      opened,
      displayP3Supported:OS._displayP3CanvasSupported(),
      profile:OS._colorProfile,
      workingSpace:OS._workingColorSpace,
      outputProfile,
      lossReport:OS._getExportImpact('png').warnings
    };
  });

  expect(result.opened).toBe(true);
  expect(result.profile).toMatchObject({ name:'Display P3', colorSpace:'display-p3', valid:true });
  expect(result.workingSpace).toBe(result.displayP3Supported ? 'display-p3' : 'srgb');
  expect(result.profile.conversion).toBe(result.displayP3Supported ? 'identity' : 'display-p3-to-srgb');
  expect(result.outputProfile).toMatchObject({ colorSpace:result.workingSpace, sourceKind:'embedded-png' });
  if (!result.displayP3Supported) expect(result.lossReport.join(' ')).toMatch(/converted from Display P3/i);
});

test('frames desktop documents with persistent measured rulers @cross-browser', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#ruler-h')).toBeHidden();
  await page.getByRole('button', { name: 'Enter Studio' }).evaluate(button => button.click());
  await expect(page.locator('body')).toHaveClass(/rulers-on/);
  await expect(page.locator('#ruler-h')).toBeVisible();
  await expect(page.locator('#ruler-v')).toBeVisible();

  const frame = await page.evaluate(() => {
    const rect = id => {
      const value = document.getElementById(id).getBoundingClientRect();
      return { top:value.top, right:value.right, bottom:value.bottom, left:value.left };
    };
    return { options:rect('tool-options'), horizontal:rect('ruler-h'), vertical:rect('ruler-v'), canvas:rect('canvas-area') };
  });
  expect(Math.abs(frame.options.bottom - frame.horizontal.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(frame.horizontal.bottom - frame.canvas.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(frame.vertical.right - frame.canvas.left)).toBeLessThanOrEqual(1);

  await page.evaluate(() => OS.toggleRulers());
  await expect(page.locator('body')).not.toHaveClass(/rulers-on/);
  await expect(page.locator('#ruler-h')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('os_prefs')).rulersVisible)).toBe(false);

  await page.evaluate(() => OS.toggleRulers());
  await expect(page.locator('#ruler-h')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('os_prefs')).rulersVisible)).toBe(true);
});

test('keeps icon-led status feedback clear of document chrome @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).evaluate(button => button.click());
  await page.evaluate(() => {
    document.getElementById('toast-container').replaceChildren();
    OS.toast('Saved locally', 'success');
    OS.toast('Review compatibility', 'warning');
    OS.toast('Could not export', 'error');
    OS.toast('Workspace changed', 'info');
  });

  const feedback = await page.locator('#toast-container .toast').evaluateAll(elements => elements.map(element => ({
    type:[...element.classList].find(value => value !== 'toast' && value !== 'show'),
    text:element.textContent,
    icon:getComputedStyle(element, '::before').content,
    minHeight:getComputedStyle(element).minHeight
  })));
  expect(feedback).toEqual([
    { type:'success', text:'Saved locally', icon:'"✓"', minHeight:'42px' },
    { type:'warning', text:'Review compatibility', icon:'"!"', minHeight:'42px' },
    { type:'error', text:'Could not export', icon:'"×"', minHeight:'42px' },
    { type:'info', text:'Workspace changed', icon:'"i"', minHeight:'42px' }
  ]);

  const clearance = await page.evaluate(() => {
    const toast = document.querySelector('#toast-container .toast:last-child').getBoundingClientRect();
    const dock = document.getElementById('bottom-tabs').getBoundingClientRect();
    return dock.top - toast.bottom;
  });
  expect(clearance).toBeGreaterThanOrEqual(13);

  await page.evaluate(() => {
    document.getElementById('toast-container').replaceChildren();
    OS.setWorkspaceMode('motion', { announce:false });
    OS.toast('Timeline ready', 'success');
  });
  const timelineClearance = await page.evaluate(() => {
    const toast = document.querySelector('#toast-container .toast').getBoundingClientRect();
    const timeline = document.getElementById('timeline-panel').getBoundingClientRect();
    return timeline.top - toast.bottom;
  });
  expect(timelineClearance).toBeGreaterThanOrEqual(13);
});

test('transforms and round-trips portable selection files @cross-browser', async ({ page }, testInfo) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).evaluate(button => button.click());
  await page.waitForFunction(() => getComputedStyle(document.getElementById('welcome-overlay')).display === 'none');

  await page.locator('.menu-bar > .menu-item').filter({ hasText:/^Select/ }).click();
  await expect(page.getByText('Transform Selection...', { exact:true })).toBeVisible();
  await expect(page.getByText('Save Selection...', { exact:true })).toBeVisible();
  await expect(page.getByText('Load Selection...', { exact:true })).toBeVisible();
  if (testInfo.project.name === 'chromium') {
    await expect(page).toHaveScreenshot('openshop-select-menu.png', {
      animations:'disabled',
      fullPage:false,
      maxDiffPixelRatio:0.03
    });
  }
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    OS.createNewDocument(8, 8, null, { resetProject:true, clean:true });
    const mask = new Uint8Array(64);
    for (let y = 1; y < 3; y++) for (let x = 1; x < 3; x++) mask[y * 8 + x] = 255;
    OS._setPixelSelectionMask(mask, 8, 8, { coverage:true });
  });

  const transformed = await page.evaluate(() => {
    const applied = OS.transformSelection({ x:3, y:2, w:4, h:3 });
    return { applied, bounds:{ ...OS._selectionBounds }, count:OS._selectionMask.count };
  });
  expect(transformed).toEqual({ applied:true, bounds:{ x:3, y:2, w:4, h:3 }, count:12 });

  const downloadPromise = page.waitForEvent('download');
  expect(await page.evaluate(() => OS.saveSelectionFile('Subject selection'))).toBe(true);
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Subject_selection.openshop-selection');

  const loaded = await page.evaluate(async () => {
    const payload = OS._selectionExchangePayload('Round trip');
    OS.clearSelection();
    const file = new File([JSON.stringify(payload)], 'round-trip.openshop-selection', {
      type:'application/vnd.openshop.selection+json'
    });
    const success = await OS.loadSelectionFile(file);
    return { success, bounds:{ ...OS._selectionBounds }, count:OS._selectionMask.count };
  });
  expect(loaded).toEqual({ success:true, bounds:{ x:3, y:2, w:4, h:3 }, count:12 });

  expect(await page.evaluate(async () => {
    const payload = OS._selectionExchangePayload('Wrong canvas');
    payload.canvas.width = 9;
    return OS.loadSelectionFile(new File([JSON.stringify(payload)], 'wrong.openshop-selection'));
  })).toBe(false);
  await expect(page.locator('#toast-container .toast.error').last()).toContainText('not 8 × 8');
});

test('exposes View settings as live menu checkboxes and radios @cross-browser', async ({ page }, testInfo) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).evaluate(button => button.click());

  const view = page.locator('.menu-bar > .menu-item').filter({ hasText:/^View/ });
  await view.click();
  await page.getByRole('menuitem', { name:'Show', exact:true }).click();
  const grid = page.locator('[data-os-menu-check="grid"]');
  const rulers = page.locator('[data-os-menu-check="rulers"]');
  await expect(grid).toHaveAttribute('role', 'menuitemcheckbox');
  await expect(grid).toHaveAttribute('aria-checked', 'false');
  await expect(rulers).toHaveAttribute('aria-checked', 'true');
  expect(await rulers.evaluate(element => getComputedStyle(element, '::after').content)).toBe('"✓"');
  if (testInfo.project.name === 'chromium') {
    await expect(page).toHaveScreenshot('openshop-view-menu.png', {
      animations:'disabled',
      fullPage:false,
      maxDiffPixelRatio:0.03
    });
  }

  await grid.click();
  await expect(grid).toHaveAttribute('aria-checked', 'true');
  expect(await grid.evaluate(element => getComputedStyle(element, '::after').content)).toBe('"✓"');

  const state = await page.evaluate(() => {
    OS.setSymmetryMode('horizontal');
    OS.setTheme('midnight');
    OS.togglePixelGrid();
    OS.toggleTimeline();
    OS.toggleMacroPanel();
    const checked = selector => document.querySelector(selector).getAttribute('aria-checked');
    const values = {
      symmetry:checked('[data-os-menu-radio="symmetry"][data-os-menu-value="horizontal"]'),
      symmetryOff:checked('[data-os-menu-radio="symmetry"][data-os-menu-value="off"]'),
      theme:checked('[data-os-menu-radio="theme"][data-os-menu-value="midnight"]'),
      pixelGrid:checked('[data-os-menu-check="pixel-grid"]'),
      timeline:checked('[data-os-menu-check="timeline"]'),
      macros:checked('[data-os-menu-check="macros"]')
    };
    OS.toggleFullscreen();
    values.fullscreen = checked('[data-os-menu-check="fullscreen"]');
    OS.toggleFullscreen();
    return values;
  });
  expect(state).toEqual({
    symmetry:'true', symmetryOff:'false', theme:'true', pixelGrid:'true',
    timeline:'true', macros:'true', fullscreen:'true'
  });
  await expect(page.locator('[data-os-menu-radio="theme"]').first()).toHaveAttribute('role', 'menuitemradio');
});

test('turns the Motion workspace into a fitted frame timeline @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).evaluate(button => button.click());
  const before = await page.evaluate(() => ({ dirty:OS._isDirty, history:OS.history.length }));
  await page.evaluate(() => OS.setWorkspaceMode('motion', { announce:false }));

  await expect(page.locator('html')).toHaveAttribute('data-os-workspace', 'motion');
  await expect(page.locator('html')).toHaveAttribute('data-os-bottom-tab', 'timeline');
  await expect(page.locator('#timeline-panel')).toBeVisible();
  await expect(page.locator('#timeline-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#timeline-summary')).toHaveText('0 frames');
  await expect(page.locator('#timeline-tab-count')).toHaveText('0');
  await expect(page.getByRole('button', { name: 'Add first animation frame' })).toBeVisible();
  expect(await page.evaluate(() => ({ dirty:OS._isDirty, history:OS.history.length }))).toEqual(before);
  const fitted = await page.evaluate(() => {
    const area = document.getElementById('canvas-area');
    const canvas = area.getBoundingClientRect();
    const timeline = document.getElementById('timeline-panel').getBoundingClientRect();
    const viewport = OS.canvas.viewportTransform;
    return {
      canvasBottom:canvas.bottom,
      timelineTop:timeline.top,
      backingHeight:OS.canvas.height,
      areaHeight:area.clientHeight,
      documentTop:viewport[5],
      documentBottom:viewport[5] + OS.canvasH * OS.zoom
    };
  });
  expect(fitted.canvasBottom).toBeLessThanOrEqual(fitted.timelineTop + 1);
  expect(fitted.backingHeight).toBe(fitted.areaHeight);
  expect(fitted.documentTop).toBeGreaterThanOrEqual(39);
  expect(fitted.documentBottom).toBeLessThanOrEqual(fitted.areaHeight - 39);

  await page.getByRole('button', { name: 'Add first animation frame' }).evaluate(button => button.click());
  await expect(page.locator('#timeline-summary')).toHaveText('1 frame');
  await expect(page.locator('#timeline-tab-count')).toHaveText('1');

  await page.evaluate(() => OS.setWorkspaceMode('standard', { announce:false }));
  await expect(page.locator('#timeline-panel')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-os-bottom-tab', 'mini-bridge');
  await expect(page.locator('#mini-bridge-tab')).toHaveAttribute('aria-selected', 'true');
});

test('makes the Move options bar control selection and transform chrome @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).evaluate(button => button.click());
  await expect(page.locator('#opt-select')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Align selected objects' })).toBeVisible();

  await page.evaluate(() => {
    const first = new fabric.Rect({ left:80, top:80, width:50, height:50, name:'Move option first' });
    const second = new fabric.Rect({ left:180, top:80, width:50, height:50, name:'Move option second' });
    OS._addObjectAsLayer(first, 'Move option first');
    OS._addObjectAsLayer(second, 'Move option second');
    OS._enforceLayerInvariants();
    OS.canvas.setActiveObject(first);
  });
  await page.locator('#select-auto').evaluate((control) => {
    control.checked = false;
    control.dispatchEvent(new Event('change', { bubbles:true }));
  });
  expect(await page.evaluate(() => {
    const first = OS.canvas.getObjects().find(object => object.name === 'Move option first');
    const second = OS.canvas.getObjects().find(object => object.name === 'Move option second');
    return {
      autoSelect:OS.state.autoSelect,
      canvasSelection:OS.canvas.selection,
      firstSelectable:first.selectable,
      secondSelectable:second.selectable,
      active:OS.canvas.getActiveObject()?.name
    };
  })).toEqual({
    autoSelect:false,
    canvasSelection:false,
    firstSelectable:true,
    secondSelectable:false,
    active:'Move option first'
  });

  await page.locator('#select-transform').evaluate((control) => {
    control.checked = false;
    control.dispatchEvent(new Event('change', { bubbles:true }));
  });
  expect(await page.evaluate(() => ({
    showTransformControls:OS.state.showTransformControls,
    objectControls:OS.canvas.getObjects()
      .filter(object => object.name?.startsWith('Move option'))
      .map(object => object.hasControls),
    activeControls:OS.canvas.getActiveObject()?.hasControls
  }))).toEqual({ showTransformControls:false, objectControls:[false, false], activeControls:false });

  await page.locator('#select-auto').evaluate((control) => {
    control.checked = true;
    control.dispatchEvent(new Event('change', { bubbles:true }));
  });
  expect(await page.evaluate(() => OS.canvas.getObjects()
    .filter(object => object.name?.startsWith('Move option'))
    .every(object => object.selectable && object.evented))).toBe(true);
});

test('navigates Layers and History listboxes without a pointer @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const layers = page.locator('#layers-list');
  await layers.focus();
  await expect(layers).toHaveAttribute('aria-activedescendant', /openshop-layer-option-/);
  const initialLayer = await page.evaluate(() => OS.activeLayerIdx);
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => OS.activeLayerIdx)).not.toBe(initialLayer);
  await page.keyboard.press('Home');
  await expect(layers).toHaveAttribute('aria-activedescendant', 'openshop-layer-option-1');
  await page.keyboard.press('Control+Alt+ArrowDown');
  await expect(layers).toBeFocused();

  const history = page.locator('#history-list');
  await history.focus();
  await expect(history).toHaveAttribute('aria-activedescendant', /openshop-history-option-/);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(history.locator('[aria-selected="true"]')).toHaveCount(1);
});

test('navigates colour grids and applies foreground or background swatches by keyboard @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();
  await page.getByRole('tab', { name: 'Swatches', exact: true }).click();

  const palette = page.locator('#palette-default');
  const cells = palette.locator('[role="gridcell"]');
  await expect(palette).toHaveAttribute('role', 'grid');
  await expect(cells).toHaveCount(24);
  expect(await cells.first().evaluate(cell => {
    const rect = cell.getBoundingClientRect();
    return { width:rect.width, height:rect.height };
  })).toEqual({ width:24, height:24 });

  await cells.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(cells.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => OS.state.fgColor)).toBe('#000000');
  await page.keyboard.press('Shift+F10');
  expect(await page.evaluate(() => OS.state.bgColor)).toBe('#000000');
  await expect(cells.nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('requires collaboration consent and exposes peer identity status', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    OS.showCollaborationDialog();
    const overlay = document.getElementById('collab-overlay');
    return {
      consentRequired: overlay.querySelector('#collab-consent').checked === false,
      consentLabel: overlay.querySelector('label').textContent,
      peerStatus: overlay.querySelector('#collab-peer').textContent,
      statusLive: overlay.querySelector('#collab-status').getAttribute('aria-live')
    };
  });
  expect(result.consentRequired).toBe(true);
  expect(result.consentLabel).toContain('consent');
  expect(result.peerStatus).toBe('Peer fingerprint: not established');
  expect(result.statusLive).toBe('polite');
});

test('exposes clean, dirty, saving, and saved project states @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const unloadPrevented = () => page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

  await expect(page.locator('#persistence-state')).toHaveAttribute('data-state', 'clean');
  await expect(page.locator('#persistence-state-label')).toHaveText('All changes saved');
  expect(await unloadPrevented()).toBe(false);

  await page.locator('button[title="New Layer"]').click();
  await expect(page.locator('#persistence-state')).toHaveAttribute('data-state', 'dirty');
  await expect(page.locator('#persistence-state-label')).toHaveText('Unsaved changes');
  await expect(page).toHaveTitle(/^\* /);
  expect(await unloadPrevented()).toBe(true);

  await page.evaluate(() => {
    window.showSaveFilePicker = undefined;
    OS._clearAutoSave = () => new Promise((resolve) => { window.__finishRecoveryClear = resolve; });
  });
  const downloadPromise = page.waitForEvent('download');
  const savePromise = page.evaluate(() => OS.saveProject());
  await expect(page.locator('#persistence-state')).toHaveAttribute('data-state', 'saving');
  await downloadPromise;
  await page.evaluate(() => window.__finishRecoveryClear(true));
  await expect(savePromise).resolves.toBe(true);

  await expect(page.locator('#persistence-state')).toHaveAttribute('data-state', 'saved');
  await expect(page.locator('#persistence-state-label')).toHaveText('All changes saved');
  await expect(page).not.toHaveTitle(/^\* /);
  expect(await unloadPrevented()).toBe(false);
});

test('renders imported ABR tips as bounded raster layers @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const asset = {
      id:'abr-e2e', name:'Raster Tip', sourceFormat:'ABR', version:6, size:12,
      spacing:50, opacity:80, scatter:15, pressureSize:true, pressureOpacity:true,
      tip:{ width:2, height:2, alpha:[0,255,255,0] }, unsupportedFeatures:[]
    };
    OS._importedBrushes = [asset];
    OS.state.fgColor = '#ff3366';
    OS.state.brushSize = 12;
    OS.canvas.isDrawingMode = true;
    OS.setBrushPreset(asset.id);
    const brush = OS.canvas.freeDrawingBrush;
    const raster = OS._renderABRStroke([
      { x:40, y:40, pressure:0.2 }, { x:100, y:40, pressure:0.9 }
    ], asset);
    await OS._commitABRStroke([
      { x:40, y:40, pressure:0.2 }, { x:100, y:40, pressure:0.9 }
    ], asset);
    return {
      isStampBrush: brush._openShopABRStamp === true,
      stampCount: raster.stampCount,
      hasPixels: Array.from(raster.rgba).some((value, index) => index % 4 === 3 && value > 0),
      layerName: OS.layers.at(-1)?.name,
      objectMarker: OS.canvas.getObjects().at(-1)?._openShopABRStamp?.assetId
    };
  });

  expect(result).toMatchObject({
    isStampBrush:true,
    hasPixels:true,
    layerName:'ABR: Raster Tip',
    objectMarker:'abr-e2e'
  });
  expect(result.stampCount).toBeGreaterThan(1);
});

test('applies a one-click pixel filter to an active image layer @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const source = document.createElement('canvas');
    source.width = 8;
    source.height = 8;
    const ctx = source.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 8, 8);
    gradient.addColorStop(0, '#203040');
    gradient.addColorStop(1, '#d8e8f8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 8, 8);

    const img = await fabric.FabricImage.fromURL(source.toDataURL('image/png'));
    img.set({ name: 'Filter Smoke', left: 20, top: 20, selectable: true });
    OS.canvas.add(img);
    if (!OS.layers.length) OS.addLayer();
    OS.layers[OS.activeLayerIdx].objects.push(img);
    OS.canvas.setActiveObject(img);
    OS.canvas.renderAll();

    await OS.applyFilterDirect('Sharpen');

    await new Promise((resolve, reject) => {
      const started = performance.now();
      const poll = () => {
        const latest = OS.history[OS.history.length - 1]?.action;
        if (latest === 'Filter: Sharpen') {
          resolve();
          return;
        }
        if (performance.now() - started > 10000) {
          reject(new Error(`Timed out waiting for filter history, latest=${latest}`));
          return;
        }
        setTimeout(poll, 50);
      };
      poll();
    });

    return {
      activeName: OS.canvas.getActiveObject()?.name,
      historyAction: OS.history[OS.history.length - 1]?.action,
      photonDisabled: OS._photonFilterDisabled
    };
  });

  expect(result.historyAction).toBe('Filter: Sharpen');
  // The history entry carries the label; the object keeps its own identity.
  expect(result.activeName).toBe('Filter Smoke');
  expect(result.photonDisabled).toBe(false);
});

test('reports the OffscreenCanvas filter path and its main-thread fallback @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const renderer = await page.evaluate(async () => {
    await OS._ensureRendererReady();
    return OS.aiBackendReport().renderer;
  });

  expect(renderer.contract).toBe('openshop-render-v1');
  expect(renderer.paths.preview).toMatch(/^(offscreen-filter-worker|fabric-main-thread)$/);
  expect(renderer.paths.filter).toMatch(/^(offscreen-filter-worker|filter-worker)$/);
  if (renderer.capabilities.offscreenFilter) {
    expect(renderer.paths.preview).toBe('offscreen-filter-worker');
    expect(renderer.paths.filter).toBe('offscreen-filter-worker');
  } else {
    expect(renderer.paths.preview).toBe('fabric-main-thread');
    expect(renderer.paths.filter).toBe('filter-worker');
  }
});

test('cancels a running pixel filter without changing pixels or history', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const before = await page.evaluate(async () => {
    const source = document.createElement('canvas');
    source.width = 8;
    source.height = 8;
    source.getContext('2d').fillRect(0, 0, 8, 8);
    const img = await fabric.FabricImage.fromURL(source.toDataURL('image/png'));
    img.set({ name: 'Cancelable Filter', left: 20, top: 20, selectable: true });
    OS.canvas.add(img);
    OS.layers[OS.activeLayerIdx].objects.push(img);
    OS.canvas.setActiveObject(img);
    OS.canvas.renderAll();

    const listeners = {};
    const worker = {
      terminated: false,
      addEventListener(type, listener) { listeners[type] = listener; },
      postMessage() {},
      terminate() { this.terminated = true; }
    };
    OS._photonFilterDisabled = true;
    OS._getFilterWorker = () => worker;
    window.__cancelWorker = worker;
    window.__cancelFilterPromise = OS.applyFilterDirect('Sharpen');
    return {
      revision: OS._documentRevision,
      history: OS.history.map((entry) => entry.action),
      objectNames: OS.canvas.getObjects().map((object) => object.name)
    };
  });

  await expect(page.locator('#compute-cancel')).toBeVisible();
  await page.locator('#compute-cancel').click();

  const after = await page.evaluate(async () => {
    await window.__cancelFilterPromise;
    return {
      revision: OS._documentRevision,
      history: OS.history.map((entry) => entry.action),
      objectNames: OS.canvas.getObjects().map((object) => object.name),
      workerTerminated: window.__cancelWorker.terminated,
      callbacks: Object.keys(OS._filterJobCallbacks).length,
      progressVisible: document.getElementById('ai-progress').classList.contains('visible')
    };
  });

  expect(after).toMatchObject({
    revision: before.revision,
    history: before.history,
    objectNames: before.objectNames,
    workerTerminated: true,
    callbacks: 0,
    progressVisible: false
  });
  expect(pageErrors).toEqual([]);
});

test('creates a pixel selection from a mocked AI segment mask', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.activateSegmentSelect();
    const source = document.createElement('canvas');
    source.width = 16;
    source.height = 16;
    const ctx = source.getContext('2d');
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(12, 4, 4, 8);

    const img = await fabric.FabricImage.fromURL(source.toDataURL('image/png'));
    img.set({ name: 'Segment Smoke', left: 0, top: 0, selectable: true });
    OS.canvas.add(img);
    OS.layers[OS.activeLayerIdx].objects.push(img);
    OS.canvas.setActiveObject(img);
    OS.canvas.renderAll();

    const data = new Uint8Array(16 * 16);
    for (let y = 4; y <= 11; y++) {
      for (let x = 12; x <= 15; x++) data[y * 16 + x] = 255;
    }
    OS._segmentResultsAtPoint = async () => [
      { label: 'bright-block', score: 0.99, mask: { width: 16, height: 16, channels: 1, data } }
    ];

    await OS.aiSegmentSelectAt({ x: 14, y: 8 });

    return {
      tool: OS.state.tool,
      optionVisible: document.getElementById('opt-ai-segment').style.display,
      bounds: OS._selectionBounds,
      count: OS._selectionMask ? OS._selectionMask.mask.filter(Boolean).length : 0,
      activeName: OS.canvas.getActiveObject()?.name
    };
  });

  expect(result.tool).toBe('ai-segment');
  expect(result.optionVisible).toBe('flex');
  expect(result.activeName).toBe('Segment Smoke');
  expect(result.count).toBeGreaterThan(0);
  expect(result.bounds.w).toBeGreaterThan(0);
  expect(result.bounds.h).toBeGreaterThan(0);
});

test('loads legacy Fabric 5 documents without geometry or metadata drift', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);

  const result = await page.evaluate(async () => {
    const legacyDocument = {
      version: '5.3.1',
      _openShop: {
        version: '0.18.13',
        w: 320,
        h: 200,
        activeLayerIdx: 2,
        layers: [
          { name: 'Legacy rectangle', visible: true, locked: false, opacity: 100, blend: 'source-over' },
          { name: 'Legacy text', visible: true, locked: false, opacity: 100, blend: 'source-over' },
          { name: 'Legacy group', visible: true, locked: false, opacity: 100, blend: 'source-over' }
        ]
      },
      objects: [
        {
          type: 'rect',
          version: '5.3.1',
          originX: 'left',
          originY: 'top',
          left: 17,
          top: 23,
          width: 80,
          height: 40,
          fill: '#336699',
          name: 'Legacy rectangle'
        },
        {
          type: 'i-text',
          version: '5.3.1',
          originX: 'left',
          originY: 'top',
          left: 41,
          top: 79,
          text: 'Legacy text',
          fontSize: 24,
          fill: '#ffffff',
          name: 'Legacy text'
        },
        {
          type: 'group',
          version: '5.3.1',
          originX: 'left',
          originY: 'top',
          left: 140,
          top: 90,
          width: 24,
          height: 24,
          name: 'Legacy group',
          objects: [{
            type: 'circle',
            version: '5.3.1',
            originX: 'left',
            originY: 'top',
            left: -12,
            top: -12,
            radius: 12,
            fill: '#cc3344'
          }]
        }
      ]
    };

    const migrated = await OS._loadDocumentState(legacyDocument);
    const objects = OS.canvas.getObjects();
    const cloneName = (await objects[0].clone()).name;
    const serialized = OS.canvas.toJSON(['name']);

    return {
      version: fabric.version,
      migratedFrom: migrated.migratedFrom,
      cloneName,
      objects: objects.map((object) => ({
        type: object.type,
        name: object.name,
        left: object.left,
        top: object.top,
        originX: object.originX,
        originY: object.originY,
        text: object.text,
        children: object.getObjects?.().length || 0
      })),
      serializedNames: serialized.objects.map((object) => object.name),
      layers: OS.layers.map((layer) => ({
        name: layer.name,
        objects: layer.objects.map((object) => object.name)
      })),
      activeLayer: OS.layers[OS.activeLayerIdx].name
    };
  });

  expect(result.version).toBe('7.4.0');
  expect(result.migratedFrom).toBe('0.18.13');
  expect(result.cloneName).toBe('Legacy rectangle');
  expect(result.objects).toEqual([
    expect.objectContaining({ type: 'rect', name: 'Legacy rectangle', left: 17, top: 23, originX: 'left', originY: 'top' }),
    expect.objectContaining({ type: 'i-text', name: 'Legacy text', left: 41, top: 79, text: 'Legacy text' }),
    expect.objectContaining({ type: 'group', name: 'Legacy group', left: 140, top: 90, children: 1 })
  ]);
  expect(result.serializedNames).toEqual(['Legacy rectangle', 'Legacy text', 'Legacy group']);
  expect(result.layers).toEqual([
    { name: 'Legacy rectangle', objects: ['Legacy rectangle'] },
    { name: 'Legacy text', objects: ['Legacy text'] },
    { name: 'Legacy group', objects: ['Legacy group'] }
  ]);
  expect(result.activeLayer).toBe('Legacy group');
  expect(pageErrors).toEqual([]);
});

test('keeps hostile Fabric object ids and gradient colors inert in SVG export', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(() => {
    const payload = 'red"><img src="x" onerror="window.__fabricGradientXss=1">';
    const canvas = new fabric.StaticCanvas(null, { width: 32, height: 32 });
    const rect = new fabric.Rect({
      width: 20,
      height: 20,
      id: 'shape"><img src="x" onerror="window.__fabricIdXss=1">',
      fill: new fabric.Gradient({
        type: 'linear',
        coords: { x1: 0, y1: 0, x2: 20, y2: 0 },
        colorStops: [
          { offset: 0, color: payload },
          { offset: 1, color: '#336699' }
        ]
      })
    });
    canvas.add(rect);

    const cleanSvg = OS._sanitizeSVG(canvas.toSVG());
    const parsed = new DOMParser().parseFromString(OS._trustedHTML(cleanSvg), 'image/svg+xml');
    const elements = [...parsed.querySelectorAll('*')];
    const eventAttributes = elements.flatMap((element) =>
      [...element.attributes].filter((attribute) => attribute.name.toLowerCase().startsWith('on'))
    );
    const unsafeLinks = elements.some((element) => {
      const href = element.getAttribute('href') || element.getAttribute('xlink:href') || '';
      return /^(javascript:|data:text\/html)/i.test(href);
    });

    return {
      fabricVersion: fabric.version,
      parserErrors: parsed.querySelectorAll('parsererror').length,
      executableNodes: parsed.querySelectorAll('script, foreignObject, img').length,
      eventAttributes: eventAttributes.length,
      unsafeLinks,
      injectedFlags: Boolean(window.__fabricGradientXss || window.__fabricIdXss)
    };
  });

  expect(result).toEqual({
    fabricVersion: '7.4.0',
    parserErrors: 0,
    executableNodes: 0,
    eventAttributes: 0,
    unsafeLinks: false,
    injectedFlags: false
  });
});

test('decodes and bounds PSD pixels in a worker before committing the document', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const makeCanvas = (color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 6;
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas;
    };
    const bytes = agPsd.writePsd({
      width: 8,
      height: 6,
      canvas: makeCanvas('#cc2233'),
      children: [{
        name: 'Blue worker layer',
        left: 0,
        top: 0,
        right: 8,
        bottom: 6,
        canvas: makeCanvas('#2244cc')
      }]
    });
    const file = new File([bytes], 'worker-fixture.psd', { type: 'image/vnd.adobe.photoshop' });

    let workerCalls = 0;
    let mainThreadReadCalls = 0;
    let heartbeats = 0;
    const decode = OS._decodePSDInWorker.bind(OS);
    OS._decodePSDInWorker = (...args) => {
      workerCalls++;
      return decode(...args);
    };
    const mainRead = agPsd.readPsd;
    agPsd.readPsd = (...args) => {
      mainThreadReadCalls++;
      return mainRead(...args);
    };
    const heartbeat = setInterval(() => { heartbeats++; }, 0);
    const imported = await OS._loadPSDFile(file);
    clearInterval(heartbeat);
    agPsd.readPsd = mainRead;

    const layerImage = OS.layers.find((layer) => layer.name === 'Blue worker layer')?.objects[0];
    const pixel = layerImage?.getElement()?.getContext('2d')?.getImageData(0, 0, 1, 1).data;
    return {
      imported,
      workerCalls,
      mainThreadReadCalls,
      heartbeats,
      dimensions: [OS.canvasW, OS.canvasH],
      layers: OS.layers.map((layer) => layer.name),
      bluePixel: pixel ? [...pixel] : null,
      decodedLimit: OS._psdLimits.maxDecodedBytes,
      decodeMetrics: OS._lastPSDImportMetrics,
      progressClosed: !document.getElementById('psd-import-progress'),
      dirty: OS._isDirty
    };
  });

  expect(result).toEqual(expect.objectContaining({
    imported: true,
    workerCalls: 1,
    mainThreadReadCalls: 0,
    dimensions: [8, 6],
    layers: ['Background', 'Blue worker layer'],
    progressClosed: true,
    dirty: true
  }));
  expect(result.heartbeats).toBeGreaterThan(0);
  expect(result.bluePixel[2]).toBeGreaterThan(result.bluePixel[0]);
  expect(result.decodedLimit).toBe(256 * 1024 * 1024);
  expect(result.decodeMetrics).toMatchObject({
    strategy:'useRawData',
    lazy:true,
    totalMemoryLimit:result.decodedLimit,
    layerDecoder:expect.stringMatching(/getLayerImageData|decodeLayerPixels/)
  });
  expect(result.decodeMetrics.firstLayerMs).toBeGreaterThanOrEqual(0);
  expect(result.decodeMetrics.decodedLayerCount).toBe(1);
  expect(pageErrors).toEqual([]);
});

test('imports a Photoshop-authored nested PSD fixture', async ({ page }) => {
  const payload = (await readFile(fixturePath('photoshop-nested.psd'))).toString('base64');
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const imported = await OS._loadPSDFile(new File(
      [bytes],
      'photoshop-nested.psd',
      { type: 'image/vnd.adobe.photoshop' }
    ));
    const groups = OS._psdInterchange?.groups || [];
    const namesById = new Map(groups.map(group => [group.id, group.name]));
    return {
      imported,
      dimensions: [OS.canvasW, OS.canvasH],
      layers: OS.layers.slice(1).filter(layer => layer.kind !== 'group').map(layer => ({
        name: layer.name,
        parent: namesById.get(layer.psd?.parentId) || null,
        hasPixels: Boolean(layer.objects[0]?.getElement?.())
      })),
      liveGroups: OS.layers.filter(layer => layer.kind === 'group').map(layer => ({
        name: layer.name,
        parent: OS.layers.find(candidate => candidate.id === layer.parentId)?.name || null,
        collapsed: layer.collapsed
      })),
      groups: groups.map(group => ({
        name: group.name,
        parent: namesById.get(group.parentId) || null
      })),
      flattened: OS._lastPSDImportReport?.flattenWholeDocument,
      decodeMetrics: OS._lastPSDImportMetrics
    };
  }, payload);

  expect(result.imported).toBe(true);
  expect(result.dimensions).toEqual([1, 1]);
  expect(result.flattened).toBe(false);
  expect(result.layers).toEqual([
    { name: 'Layer1 (#ff)', parent: null, hasPixels: true },
    { name: 'Layer10 (#00)', parent: 'Folder10', hasPixels: true }
  ]);
  expect(result.liveGroups).toEqual(Array.from({ length: 10 }, (_, index) => ({
    name: `Folder${index + 1}`,
    parent: index === 0 ? null : `Folder${index}`,
    collapsed: false
  })));
  expect(result.groups).toEqual(Array.from({ length: 10 }, (_, index) => ({
    name: `Folder${index + 1}`,
    parent: index === 0 ? null : `Folder${index}`
  })));
  expect(result.decodeMetrics).toMatchObject({ strategy:'useRawData', lazy:true });
  expect(result.decodeMetrics.firstLayerMs).toBeGreaterThanOrEqual(0);
  expect(result.decodeMetrics.decodedLayerCount).toBeGreaterThan(0);
});

test('round-trips nested PSD groups, blends, opacity, and basic text without duplicating the composite', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const makeCanvas = (color, width = 16, height = 12) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, width, height);
      return canvas;
    };
    const sourceBytes = agPsd.writePsd({
      width: 16,
      height: 12,
      canvas: makeCanvas('#ee3344'),
      children: [{
        name: 'Outer',
        opacity: 0.75,
        blendMode: 'pass through',
        opened: false,
        children: [{
          name: 'Inner',
          blendMode: 'pass through',
          children: [{
            name: 'Blue',
            opacity: 0.5,
            blendMode: 'multiply',
            canvas: makeCanvas('#2244cc')
          }, {
            name: 'Caption',
            opacity: 0.6,
            blendMode: 'screen',
            canvas: makeCanvas('#222222'),
            text: {
              text: 'Hello',
              transform: [1, 0, 0, 1, 3, 4],
              style: {
                font: { name: 'Arial' },
                fontSize: 5,
                fillColor: { r: 255, g: 255, b: 255 }
              }
            }
          }]
        }]
      }]
    }, { trimImageData: true, noBackground: true });

    const summarizeDocument = () => ({
      layers: OS.layers.filter((layer) => layer.kind !== 'group').map((layer) => ({
        name: layer.name,
        opacity: layer.opacity,
        blend: layer.blend,
        type: layer.objects[0]?.type || null,
        text: layer.objects[0]?.text || null,
        parentId: layer.psd?.parentId || null,
        effectiveOpacity: layer.objects[0]?.opacity ?? null
      })),
      liveGroups: OS.layers.filter((layer) => layer.kind === 'group').map((group) => ({
        name: group.name,
        parentId: OS.layers.find((layer) => layer.id === group.parentId)?.name || null,
        opacity: group.opacity,
        blend: group.blend,
        collapsed: group.collapsed
      })),
      groups: OS._psdInterchange?.groups.map((group) => ({
        name: group.name,
        parentId: group.parentId,
        opacity: group.opacity,
        blendMode: group.blendMode,
        opened: group.opened
      })) || [],
      compositeLayerCount: OS.layers.filter((layer) => /Composite/.test(layer.name)).length
    });

    const firstImport = await OS._loadPSDFile(new File(
      [sourceBytes],
      'nested.psd',
      { type: 'image/vnd.adobe.photoshop' }
    ));
    const first = summarizeDocument();
    const importWarning = document.querySelector('.psd-compat-report')?.innerText || '';
    document.querySelector('.psd-compat-report')?.remove();

    const built = OS._buildPsdExportStructure();
    const exportedBytes = agPsd.writePsd(built.structure, { trimImageData: true, noBackground: true });
    const parsed = agPsd.readPsd(exportedBytes, {
      useImageData: true,
      skipThumbnail: true
    });
    const outer = parsed.children[0];
    const inner = outer.children[0];

    const secondImport = await OS._loadPSDFile(new File(
      [exportedBytes],
      'nested-roundtrip.psd',
      { type: 'image/vnd.adobe.photoshop' }
    ));
    const second = summarizeDocument();
    document.querySelector('.psd-compat-report')?.remove();

    const clippedBytes = agPsd.writePsd({
      width: 8,
      height: 8,
      canvas: makeCanvas('#cc2233', 8, 8),
      children: [{
        name: 'Clipped glow',
        clipping: true,
        canvas: makeCanvas('#2244cc', 8, 8)
      }]
    });
    const fallbackImport = await OS._loadPSDFile(new File(
      [clippedBytes],
      'unsupported.psd',
      { type: 'image/vnd.adobe.photoshop' }
    ));
    const fallback = {
      layers: OS.layers.map((layer) => layer.name),
      warning: document.querySelector('.psd-compat-report')?.innerText || '',
      flattened: OS._lastPSDImportReport?.flattenWholeDocument
    };

    return {
      firstImport,
      secondImport,
      fallbackImport,
      first,
      second,
      importWarning,
      exportWarnings: built.report.warnings,
      parsed: {
        hasComposite: Boolean(parsed.imageData),
        rootNames: parsed.children.map((child) => child.name),
        outer: {
          opacity: outer.opacity,
          blendMode: outer.blendMode,
          opened: outer.opened
        },
        innerNames: inner.children.map((child) => child.name),
        leaves: inner.children.map((child) => ({
          name: child.name,
          opacity: child.opacity,
          blendMode: child.blendMode,
          text: child.text?.text || null
        }))
      },
      fallback
    };
  });

  expect(result.firstImport).toBe(true);
  expect(result.secondImport).toBe(true);
  expect(result.fallbackImport).toBe(true);
  for (const snapshot of [result.first, result.second]) {
    expect(snapshot.compositeLayerCount).toBe(0);
    expect(snapshot.layers.map((layer) => layer.name)).toEqual(['Background', 'Blue', 'Caption']);
    expect(snapshot.layers[1]).toEqual(expect.objectContaining({
      opacity: 50,
      blend: 'multiply',
      type: 'image'
    }));
    expect(snapshot.layers[1].effectiveOpacity).toBeCloseTo(0.375, 2);
    expect(snapshot.layers[2]).toEqual(expect.objectContaining({
      opacity: 60,
      blend: 'screen',
      type: 'i-text',
      text: 'Hello'
    }));
    expect(snapshot.groups.map((group) => group.name)).toEqual(['Outer', 'Inner']);
    expect(snapshot.liveGroups).toEqual([
      { name:'Outer', parentId:null, opacity:75, blend:'source-over', collapsed:true },
      { name:'Inner', parentId:'Outer', opacity:100, blend:'source-over', collapsed:false }
    ]);
    expect(snapshot.groups[0]).toEqual(expect.objectContaining({
      parentId: null,
      blendMode: 'pass through',
      opened: false
    }));
    expect(snapshot.groups[0].opacity).toBeCloseTo(0.75, 2);
  }
  expect(result.importWarning).toContain('group opacity is approximated');
  expect(result.exportWarnings).toEqual([]);
  expect(result.parsed.hasComposite).toBe(true);
  expect(result.parsed.rootNames).toEqual(['Outer']);
  expect(result.parsed.outer.opacity).toBeCloseTo(0.75, 2);
  expect(result.parsed.outer.blendMode).toBe('pass through');
  expect(result.parsed.outer.opened).toBe(false);
  expect(result.parsed.innerNames).toEqual(['Blue', 'Caption']);
  expect(result.parsed.leaves).toEqual([
    expect.objectContaining({ name: 'Blue', blendMode: 'multiply', text: null }),
    expect.objectContaining({ name: 'Caption', blendMode: 'screen', text: 'Hello' })
  ]);
  expect(result.parsed.leaves[0].opacity).toBeCloseTo(0.5, 2);
  expect(result.parsed.leaves[1].opacity).toBeCloseTo(0.6, 2);
  expect(result.fallback).toEqual(expect.objectContaining({
    layers: ['Background', 'PSD Flattened Appearance'],
    flattened: true
  }));
  expect(result.fallback.warning).toContain('one flattened appearance layer instead of duplicating the composite');
  expect(result.fallback.warning).toContain('clipping relationships are not supported');
  expect(pageErrors).toEqual([]);
});

test('rejects hostile or cancelled PSD work without mutating the open document', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const makeHeader = ({ width = 4, height = 4 } = {}) => {
      const bytes = new Uint8Array(26);
      bytes.set([0x38, 0x42, 0x50, 0x53], 0);
      const view = new DataView(bytes.buffer);
      view.setUint16(4, 1, false);
      view.setUint16(12, 4, false);
      view.setUint32(14, height, false);
      view.setUint32(18, width, false);
      view.setUint16(22, 8, false);
      view.setUint16(24, 3, false);
      return bytes;
    };
    const summary = () => JSON.stringify({
      dimensions: [OS.canvasW, OS.canvasH],
      layers: OS.layers.map((layer) => [layer.name, layer.objects.map((object) => object.name)]),
      objects: OS.canvas.getObjects().map((object) => object.name),
      history: OS.history.map((entry) => entry.action),
      generation: OS._documentGeneration,
      name: OS._docName
    });
    const before = summary();

    const huge = await OS._loadPSDFile(new File(
      [makeHeader({ width: OS._psdLimits.maxDimension + 1 })],
      'huge.psd',
      { type: 'image/vnd.adobe.photoshop' }
    ));
    const afterHuge = summary();

    const truncated = await OS._loadPSDFile(new File(
      [makeHeader()],
      'truncated.psd',
      { type: 'image/vnd.adobe.photoshop' }
    ));
    const afterTruncated = summary();

    const decode = OS._decodePSDInWorker;
    OS._decodePSDInWorker = async (bytes, size) => ({
      header: OS._readPSDHeader(bytes),
      psd: {
        width: 4,
        height: 4,
        decodedBytes: OS._psdLimits.maxDecodedBytes + 1,
        composite: null,
        children: []
      }
    });
    const overBudget = await OS._loadPSDFile(new File(
      [makeHeader()],
      'decompression-heavy.psd',
      { type: 'image/vnd.adobe.photoshop' }
    ));
    const afterOverBudget = summary();

    OS._decodePSDInWorker = (bytes, size, job) => new Promise((resolve, reject) => {
      job.reject = reject;
    });
    const pendingCancellation = OS._loadPSDFile(new File(
      [makeHeader()],
      'cancel.psd',
      { type: 'image/vnd.adobe.photoshop' }
    ));
    while (!OS._activeComputeJob('psd-import')?.reject) await new Promise((resolve) => setTimeout(resolve, 0));
    const cancelAccepted = OS._cancelPSDImport();
    const cancelled = await pendingCancellation;
    const afterCancelled = summary();
    OS._decodePSDInWorker = decode;

    return {
      huge,
      truncated,
      overBudget,
      cancelAccepted,
      cancelled,
      atomic: [afterHuge, afterTruncated, afterOverBudget, afterCancelled].every((value) => value === before),
      progressClosed: !document.getElementById('psd-import-progress')
    };
  });

  expect(result).toEqual({
    huge: false,
    truncated: false,
    overBudget: false,
    cancelAccepted: true,
    cancelled: false,
    atomic: true,
    progressClosed: true
  });
});

test('stores atomic recovery generations, falls back from corruption, and forks cross-tab ownership', async ({ page }) => {
  test.setTimeout(60_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const hostedHtml = await readFile(join(process.cwd(), 'index.html'), 'utf8');
  await page.route('http://localhost/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: hostedHtml
  }));
  await openApp(page, 'http://localhost/index.html');
  await page.evaluate(() => OS.dismissWelcome());
  await page.waitForTimeout(100);

  const first = await page.evaluate(async () => {
    clearInterval(OS._autoSaveTimer);
    OS._autoSaveTimer = null;
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OS._recoveryDirectoryName, { recursive: true }).catch(() => {});
    await root.removeEntry('openshop-autosave.json').catch(() => {});
    OS.createNewDocument(64, 48, { resetProject: true });
    OS._docName = 'Recovery Primary';
    OS._markDocumentDirty();
    await OS._autoSave();
    const records = await OS._listRecoveryGenerations();
    return {
      documentId: OS._documentId,
      records: records.map((record) => ({
        filename: record.filename,
        documentId: record.documentId,
        ownerId: record.ownerId,
        schemaVersion: record.envelope?.schemaVersion,
        checksumAlgorithm: record.checksumAlgorithm,
        valid: record.valid
      }))
    };
  });

  expect(first.records).toHaveLength(1);
  expect(first.records[0]).toEqual(expect.objectContaining({
    documentId: first.documentId,
    schemaVersion: 1,
    checksumAlgorithm: 'sha256',
    valid: true
  }));

  const secondPage = await page.context().newPage();
  const secondErrors = [];
  secondPage.on('pageerror', (error) => secondErrors.push(error.message));
  await secondPage.route('http://localhost/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: hostedHtml
  }));
  await secondPage.goto('http://localhost/index.html', { waitUntil: 'domcontentloaded' });
  // Boot is asynchronous: the libraries are fetched, verified and executed
  // from blob URLs, so there is no OS.canvas to drive until it settles.
  await secondPage.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 30000 });
  await secondPage.evaluate(() => {
    OS.dismissWelcome();
    document.querySelectorAll('.modal-overlay').forEach((overlay) => overlay.remove());
  });
  await secondPage.waitForTimeout(100);
  const second = await secondPage.evaluate(async (documentId) => {
    clearInterval(OS._autoSaveTimer);
    OS._autoSaveTimer = null;
    OS.createNewDocument(64, 48, { resetProject: true });
    OS._documentId = documentId;
    OS._docName = 'Recovery Competing Tab';
    OS._initRecoveryCoordination();
    OS._claimRecoveryOwnership();
    await new Promise((resolve) => setTimeout(resolve, 80));
    OS._markDocumentDirty();
    const saved = await OS._autoSave();
    const records = await OS._listRecoveryGenerations();
    return {
      saved,
      documentId: OS._documentId,
      forked: OS._documentId !== documentId,
      recordDocumentIds: records.filter((record) => record.valid).map((record) => record.documentId),
      toast: document.getElementById('toast-container').textContent
    };
  }, first.documentId);
  await secondPage.close();

  expect(second.saved).toBe(true);
  expect(second.forked).toBe(true);
  expect(new Set(second.recordDocumentIds).size).toBe(2);
  expect(second.toast).toContain('separate copy');
  expect(secondErrors).toEqual([]);

  const generations = await page.evaluate(async () => {
    for (let index = 0; index < 2; index++) {
      OS.layers[1].name = `Checkpoint ${index + 2}`;
      OS._markDocumentDirty();
      await new Promise((resolve) => setTimeout(resolve, 10));
      await OS._autoSave();
    }
    const records = await OS._listRecoveryGenerations();
    const primary = records.filter((record) => record.valid && record.documentId === OS._documentId);
    const newest = primary[0];
    const directory = await OS._getRecoveryDirectory(false);
    const handle = await directory.getFileHandle(newest.filename, { create: false });
    const writable = await handle.createWritable();
    await writable.write('{"truncated":');
    await writable.close();
    const info = await OS._getRecoveryInfo();
    const directoryEntries = [];
    const recoveryDirectory = await OS._getRecoveryDirectory(false);
    for await (const [name] of recoveryDirectory.entries()) directoryEntries.push(name);
    await OS.showRecoveryManager();
    const manager = document.querySelector('.recovery-manager');
    const verifiedCard = [...manager.querySelectorAll('.recovery-generation')]
      .find((card) => !card.classList.contains('corrupt'));
    verifiedCard?.querySelector('.recovery-actions .btn')?.click();
    const managerState = {
      text: manager.textContent,
      cards: [...manager.querySelectorAll('.recovery-generation')].map((card) => card.textContent),
      restoreButtons: [...manager.querySelectorAll('.recovery-actions .btn-primary')].map((button) => button.disabled),
      previewVisible: verifiedCard ? !verifiedCard.querySelector('.recovery-details').hidden : false
    };
    document.querySelector('.modal-overlay:has(.recovery-manager)')?.remove();
    return {
      filenames: records.map((record) => record.filename),
      primaryCount: primary.length,
      fallbackUsed: info.fallbackUsed,
      recoverableFilename: info.recoverable?.filename,
      corruptedFilename: newest.filename,
      newestCorrupt: info.generations[0]?.corrupt,
      directoryEntries,
      managerState
    };
  });

  expect(new Set(generations.filenames).size).toBe(generations.filenames.length);
  expect(generations.primaryCount).toBe(3);
  expect(generations.fallbackUsed).toBe(true);
  expect(generations.newestCorrupt).toBe(true);
  expect(generations.recoverableFilename).not.toBe(generations.corruptedFilename);
  expect(generations.directoryEntries).toContain('index.json');
  expect(generations.directoryEntries.some((name) => name.startsWith('.tmp-'))).toBe(false);
  expect(generations.managerState.text).toContain('newest generation is corrupt');
  expect(generations.managerState.text).toContain('Durability');
  expect(generations.managerState.text).toContain('Storage Used');
  expect(generations.managerState.cards.some((card) => card.includes('Corrupt'))).toBe(true);
  expect(generations.managerState.restoreButtons).toContain(true);
  expect(generations.managerState.restoreButtons).toContain(false);
  expect(generations.managerState.previewVisible).toBe(true);

  const renamed = await page.evaluate(async () => {
    const info = await OS._getRecoveryInfo();
    const record = info.recoverable;
    await OS._renameRecoveryGeneration(record, 'Named checkpoint');
    const records = await OS._listRecoveryGenerations();
    const named = records.find((candidate) => candidate.label === 'Named checkpoint');
    return {
      exists: Boolean(named),
      filename: named?.filename,
      documentId: named?.documentId,
      label: named?.label
    };
  });
  expect(renamed).toEqual(expect.objectContaining({
    exists: true,
    label: 'Named checkpoint',
    documentId: first.documentId
  }));

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async (filename) => {
    const record = (await OS._listRecoveryGenerations()).find((candidate) => candidate.filename === filename);
    OS._exportRecovery(record);
  }, renamed.filename);
  const recoveryDownload = await downloadPromise;
  expect(recoveryDownload.suggestedFilename()).toBe('Named_checkpoint.openshop');

  const restoredCopy = await page.evaluate(async ({ filename, originalDocumentId }) => {
    const record = (await OS._listRecoveryGenerations()).find((candidate) => candidate.filename === filename);
    const restored = await OS._restoreRecoveryRecord(record, null, true);
    return {
      restored,
      documentId: OS._documentId,
      changedId: OS._documentId !== originalDocumentId,
      name: OS._docName,
      dirty: OS._isDirty
    };
  }, { filename: renamed.filename, originalDocumentId: first.documentId });
  expect(restoredCopy).toEqual(expect.objectContaining({
    restored: true,
    changedId: true,
    name: 'Recovery Primary Copy',
    dirty: true
  }));

  const finalState = await page.evaluate(async (corruptedFilename) => {
    const records = await OS._listRecoveryGenerations();
    const corrupt = records.find((record) => record.filename === corruptedFilename);
    await OS._discardRecovery(corrupt);
    const remaining = await OS._listRecoveryGenerations();
    const corruptRemoved = !remaining.some((record) => record.filename === corruptedFilename);
    await OS._discardAllRecovery(remaining);
    const root = await navigator.storage.getDirectory();
    const legacyHandle = await root.getFileHandle('openshop-autosave.json', { create: true });
    const legacyWritable = await legacyHandle.createWritable();
    await legacyWritable.write(JSON.stringify(OS._captureDocumentState()));
    await legacyWritable.close();
    const migrated = await OS._migrateLegacyRecovery();
    const legacyExists = Boolean(await root.getFileHandle('openshop-autosave.json', { create: false }).catch(() => null));
    const migratedRecords = await OS._listRecoveryGenerations();
    const migratedLabel = migratedRecords.find((record) => record.valid)?.label || '';
    await OS._discardAllRecovery(migratedRecords);
    return {
      corruptRemoved,
      migrated,
      legacyExists,
      migratedLabel,
      remainingAfterCleanup: (await OS._listRecoveryGenerations()).length
    };
  }, generations.corruptedFilename);
  expect(finalState).toEqual({
    corruptRemoved: true,
    migrated: true,
    legacyExists: false,
    migratedLabel: 'Migrated legacy autosave',
    remainingAfterCleanup: 0
  });
  expect(pageErrors).toEqual([]);
});

test('round-trips one document state through save, open, recovery, undo, and redo @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  await page.evaluate(() => {
    OS.createNewDocument(320, 240);
    OS._docName = 'Golden Document';

    const rect = new fabric.Rect({
      left: 14,
      top: 18,
      width: 90,
      height: 60,
      fill: '#336699',
      name: 'Masked subject',
      opacity: 0.65,
      visible: false,
      selectable: false,
      evented: false,
      globalCompositeOperation: 'multiply'
    });
    rect.clipPath = new fabric.Rect({
      originX: 'center',
      originY: 'center',
      width: 64,
      height: 36
    });
    rect._hasMask = true;
    OS.canvas.add(rect);
    Object.assign(OS.layers[1], {
      name: 'Subject',
      visible: false,
      locked: true,
      opacity: 65,
      blend: 'multiply',
      objects: [rect]
    });

    OS.addLayer();
    const text = new fabric.IText('Top label', {
      left: 130,
      top: 42,
      fontSize: 22,
      fill: '#ffffff',
      name: 'Top label',
      opacity: 0.8,
      globalCompositeOperation: 'screen'
    });
    OS.canvas.add(text);
    Object.assign(OS.layers[2], {
      name: 'Labels',
      visible: true,
      locked: false,
      opacity: 80,
      blend: 'screen',
      objects: [text]
    });
    OS.activeLayerIdx = 2;
    OS.canvas.setActiveObject(text);

    OS.addGuide('horizontal', 37, { silent: true, recordHistory: false });
    OS.addGuide('vertical', 91, { silent: true, recordHistory: false });
    // Masks are document-space, so a round trip must return exactly what went in.
    const maskW = Math.round(OS.canvasW), maskH = Math.round(OS.canvasH);
    const mask = new Uint8Array(maskW * maskH);
    for (let y = 1; y < 3; y++) for (let x = 1; x < 3; x++) mask[y * maskW + x] = 1;
    OS._selectionMask = { w: maskW, h: maskH, mask };
    OS._selectionBounds = { x: 1, y: 1, w: 2, h: 2 };
    const frame = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==';
    OS._animFrames = [frame, frame];
    OS._animIdx = 1;
    OS.saveHistory('Golden document');
    window.showSaveFilePicker = undefined;
  });

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => OS.saveProject());
  const download = await downloadPromise;
  const savedPath = await download.path();
  const projectText = await readFile(savedPath, 'utf8');
  const savedState = JSON.parse(projectText);
  expect(savedState).toEqual(expect.objectContaining({
    kind: 'openshop-document',
    schemaVersion: 1,
    canvas: expect.objectContaining({ width: 320, height: 240 }),
    layers: expect.any(Array)
  }));
  expect(savedState.layers).toHaveLength(3);

  const summarize = () => page.evaluate(() => ({
    dimensions: [OS.canvasW, OS.canvasH],
    documentName: OS._docName,
    layers: OS.layers.map((layer) => ({
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      blend: layer.blend,
      objects: layer.objects.filter((object) => !object.excludeFromExport).map((object) => object.name)
    })),
    zOrder: OS.canvas.getObjects().filter((object) => !object.excludeFromExport).map((object) => object.name),
    masked: Boolean(OS.layers[1]?.objects[0]?._hasMask && OS.layers[1]?.objects[0]?.clipPath),
    guides: OS.guides.map((guide) => [guide.orientation, guide.pos]),
    selection: {
      bounds: OS._selectionBounds,
      selected: OS._selectionMask ? [...OS._selectionMask.mask].filter(Boolean).length : 0
    },
    activeLayer: OS.layers[OS.activeLayerIdx]?.name,
    activeObject: OS.canvas.getActiveObject()?.name || null,
    animation: [OS._animFrames.length, OS._animIdx],
    projectHandleCleared: OS._projectFileHandle === null
  }));

  const newDocumentClearedHandle = await page.evaluate(() => {
    OS._projectFileHandle = { stale: true };
    OS.createNewDocument(64, 64, { resetProject: true });
    return OS._projectFileHandle === null;
  });
  expect(newDocumentClearedHandle).toBe(true);
  await page.evaluate(() => { OS._projectFileHandle = { stale: true }; });
  await page.locator('#project-input').setInputFiles({
    name: 'golden.openshop.json',
    mimeType: 'application/json',
    buffer: Buffer.from(projectText)
  });
  // The new document above left unsaved changes, so opening prompts first.
  await page.locator('.modal-overlay:has-text("Discard unsaved changes?") button:text-is("Discard")').click();
  await expect(page.locator('#toast-container')).toContainText('Project loaded');
  const opened = await summarize();

  await page.evaluate(async (text) => {
    OS._projectFileHandle = { stale: true };
    OS.createNewDocument(80, 80);
    await OS._restoreRecoveryText(text);
  }, projectText);
  const recovered = await summarize();

  await page.evaluate(() => {
    OS.layers[2].name = 'Changed labels';
    OS.activeLayerIdx = 1;
    OS.canvas.discardActiveObject();
    OS._selectionMask = null;
    OS._selectionBounds = null;
    OS.guides[0].pos = 123;
    OS.saveHistory('Mutated document');
  });
  await page.evaluate(() => OS.undo());
  const undone = await summarize();
  await page.evaluate(() => OS.redo());
  const redone = await summarize();

  const golden = {
    dimensions: [320, 240],
    documentName: 'Golden Document',
    layers: [
      { name: 'Background', visible: true, locked: true, opacity: 100, blend: 'source-over', objects: ['__boundary__'] },
      { name: 'Subject', visible: false, locked: true, opacity: 65, blend: 'multiply', objects: ['Masked subject'] },
      { name: 'Labels', visible: true, locked: false, opacity: 80, blend: 'screen', objects: ['Top label'] }
    ],
    zOrder: ['__boundary__', 'Masked subject', 'Top label'],
    masked: true,
    guides: [['horizontal', 37], ['vertical', 91]],
    selection: { bounds: { x: 1, y: 1, w: 2, h: 2 }, selected: 4 },
    activeLayer: 'Labels',
    activeObject: 'Top label',
    animation: [2, 1],
    projectHandleCleared: true
  };
  expect(opened).toEqual(golden);
  expect(recovered).toEqual(golden);
  expect(undone).toEqual(golden);
  expect(redone).toEqual(expect.objectContaining({
    layers: expect.arrayContaining([expect.objectContaining({ name: 'Changed labels' })]),
    activeLayer: 'Subject',
    activeObject: null,
    selection: { bounds: null, selected: 0 },
    guides: [['horizontal', 123], ['vertical', 91]]
  }));
});

test('keeps layer stacking, locks, visibility, and history in one canonical model @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.createNewDocument(240, 180);
    const lower = new fabric.Rect({
      left: 20,
      top: 20,
      width: 120,
      height: 100,
      fill: '#cc3344',
      name: 'Lower object'
    });
    OS.canvas.add(lower);
    OS.layers[1].name = 'Lower';
    OS.layers[1].objects.push(lower);

    OS.layers.push({
      id: OS._newDocumentId('layer'),
      name: 'Upper',
      visible: true,
      locked: false,
      opacity: 100,
      blend: 'source-over',
      objects: []
    });
    OS.activeLayerIdx = 2;
    const upper = new fabric.Rect({
      left: 45,
      top: 35,
      width: 120,
      height: 100,
      fill: '#3366dd',
      name: 'Upper object'
    });
    OS.canvas.add(upper);
    OS.layers[2].objects.push(upper);
    OS._enforceLayerInvariants();
    OS.updateLayersPanel();
    OS.history = [];
    OS.historyIdx = -1;
    OS.saveHistory('Layer Baseline', { markDirty: false });

    OS.renameLayer(2, 'Foreground');
    OS.setLayerOpacity(60);
    OS.setLayerBlend('multiply');
    OS.canvas.setActiveObject(upper);
    OS.toggleLayerLock(2);
    const discardedOnLock = !OS.canvas.getActiveObject();
    OS.setTool('select');
    const lockedInteraction = {
      selectable: upper.selectable,
      evented: upper.evented
    };
    OS.setTool('brush');
    const drawingWhileLocked = OS.canvas.isDrawingMode;
    OS.toggleLayerVisibility(2);
    const hiddenInteraction = {
      visible: upper.visible,
      selectable: upper.selectable,
      evented: upper.evented
    };
    OS.toggleLayerVisibility(2);
    OS._moveLayer(2, 1);

    const summarize = () => ({
      layerNames: OS.layers.map((layer) => layer.name),
      panelNames: [...document.querySelectorAll('#layers-list-visual .layer-name')].map((node) => node.textContent),
      canvasOrder: OS.canvas.getObjects().map((object) => object.name),
      foreground: (() => {
        const layer = OS.layers.find((candidate) => candidate.name === 'Foreground');
        if (!layer) return null;
        return {
          visible: layer.visible,
          locked: layer.locked,
          opacity: layer.opacity,
          blend: layer.blend,
          objects: layer.objects.map((object) => object.name)
        };
      })()
    });
    const final = summarize();
    const project = OS._captureDocumentState();

    for (let index = 0; index < 7; index++) await OS.undo();
    const undone = summarize();
    for (let index = 0; index < 7; index++) await OS.redo();
    const redone = summarize();

    await OS._loadDocumentState(project);
    const reopened = summarize();
    const restoredUpper = OS.layers.find((layer) => layer.name === 'Foreground').objects[0];
    OS.setTool('select');

    return {
      discardedOnLock,
      lockedInteraction,
      drawingWhileLocked,
      hiddenInteraction,
      historyActions: OS.history.map((entry) => entry.action),
      final,
      undone,
      redone,
      reopened,
      reopenedInteraction: {
        selectable: restoredUpper.selectable,
        evented: restoredUpper.evented
      }
    };
  });

  expect(result.discardedOnLock).toBe(true);
  expect(result.lockedInteraction).toEqual({ selectable: false, evented: false });
  expect(result.drawingWhileLocked).toBe(false);
  expect(result.hiddenInteraction).toEqual({ visible: false, selectable: false, evented: false });
  expect(result.historyActions).toEqual([
    'Layer Baseline',
    'Rename Layer',
    'Layer Opacity',
    'Blend: multiply',
    'Lock Layer',
    'Hide Layer',
    'Show Layer',
    'Reorder Layers'
  ]);
  expect(result.undone.layerNames).toEqual(['Background', 'Lower', 'Upper']);
  expect(result.final).toEqual({
    layerNames: ['Background', 'Foreground', 'Lower'],
    panelNames: ['Lower', 'Foreground', 'Background'],
    canvasOrder: ['__boundary__', 'Upper object', 'Lower object'],
    foreground: {
      visible: true,
      locked: true,
      opacity: 60,
      blend: 'multiply',
      objects: ['Upper object']
    }
  });
  expect(result.redone).toEqual(result.final);
  expect(result.reopened).toEqual(result.final);
  expect(result.reopenedInteraction).toEqual({ selectable: false, evented: false });
});

test('records validated commands and replays mixed edits as one atomic action', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.createNewDocument(160, 120, { resetProject: true, clean: true });
    const subject = new fabric.Rect({
      left: 20,
      top: 18,
      width: 70,
      height: 50,
      fill: '#c43d55',
      name: 'Subject'
    });
    OS.canvas.add(subject);
    OS.layers[1].name = 'Subject layer';
    OS.layers[1].objects.push(subject);
    OS.canvas.setActiveObject(subject);
    OS._enforceLayerInvariants();
    OS.updateLayersPanel();
    OS._initializeHistory('Command Baseline');
    OS._markDocumentClean(OS._historyBaseSnapshot, 'clean');

    const summarize = () => {
      const object = OS.canvas.getObjects().find((candidate) => candidate.name === 'Subject');
      const layer = OS.layers.find((candidate) => candidate.objects.includes(object));
      return {
        layerName: layer?.name,
        opacity: layer?.opacity,
        angle: object?.angle || 0,
        active: OS.canvas.getActiveObject()?.name || null
      };
    };
    const baseline = summarize();
    const initializationTransactions = OS.history.length;

    OS._macroSteps = [];
    OS._macroRecording = true;
    OS.renameLayer(OS.activeLayerIdx, 'Retouched subject');
    OS.setLayerOpacity(75, false);
    OS.setLayerOpacity(55, false);
    const previewHistoryLength = OS.history.length;
    OS.commitLayerOpacity();
    OS.canvas.setActiveObject(subject);
    OS.rotateObj(30);
    OS._macroRecording = false;

    const recorded = JSON.parse(JSON.stringify(OS._macroSteps));
    const edited = summarize();
    const transactionIds = OS.history.map((entry) => entry.command?.id);

    for (let index = 0; index < 3; index++) await OS.undo();
    const undone = summarize();
    const replaySucceeded = await OS.playMacro();
    const replayed = summarize();
    const replayEntry = OS.history.at(-1);

    const beforeFailure = JSON.stringify(OS._captureDocumentState());
    const beforeFailureHistoryLength = OS.history.length;
    const layerId = OS.layers.find((layer) => layer.name === 'Retouched subject').id;
    const failedSequence = OS._makeCommand('macro.sequence', {
      commands: [
        OS._makeCommand('layer.rename', { layerId, name: 'Must roll back' }),
        OS._makeCommand('object.rotate', { objectId: 'object-does-not-exist', degrees: 45 })
      ]
    });
    const failedSequenceResult = await OS._executeCommand(failedSequence, { recordMacro: false });
    const afterFailure = JSON.stringify(OS._captureDocumentState());

    const invalidResult = await OS._executeCommand({
      schemaVersion: 1,
      id: 'layer.opacity.set',
      args: { layerId, opacity: 999 }
    }, { recordMacro: false });

    return {
      initializationTransactions,
      previewHistoryLength,
      baseline,
      edited,
      undone,
      replaySucceeded,
      replayed,
      recorded,
      transactionIds,
      replayEntry: {
        kind: replayEntry?.kind,
        schemaVersion: replayEntry?.schemaVersion,
        commandId: replayEntry?.command?.id,
        childIds: replayEntry?.command?.args?.commands?.map((command) => command.id)
      },
      failedSequenceResult,
      failureRolledBack: beforeFailure === afterFailure,
      failureHistoryUnchanged: OS.history.length === beforeFailureHistoryLength,
      invalidResult,
      layerNameAfterFailures: OS.layers.find((layer) => layer.id === layerId)?.name
    };
  });

  expect(result.initializationTransactions).toBe(0);
  expect(result.previewHistoryLength).toBe(1);
  expect(result.transactionIds).toEqual(['layer.rename', 'layer.opacity.set', 'object.rotate']);
  expect(result.recorded.map((command) => [command.schemaVersion, command.id])).toEqual([
    [1, 'layer.rename'],
    [1, 'layer.opacity.set'],
    [1, 'object.rotate']
  ]);
  expect(result.recorded.every((command) => !('timestamp' in command) && !('action' in command))).toBe(true);
  expect(result.undone).toEqual(result.baseline);
  expect(result.replaySucceeded).toBe(true);
  expect(result.replayed).toEqual(result.edited);
  expect(result.replayEntry).toEqual({
    kind: 'openshop-history-entry',
    schemaVersion: 2,
    commandId: 'macro.sequence',
    childIds: ['layer.rename', 'layer.opacity.set', 'object.rotate']
  });
  expect(result.failedSequenceResult).toBe(false);
  expect(result.failureRolledBack).toBe(true);
  expect(result.failureHistoryUnchanged).toBe(true);
  expect(result.invalidResult).toBe(false);
  expect(result.layerNameAfterFailures).toBe('Retouched subject');
  expect(pageErrors).toEqual([]);
});

test('undoes destructive canvas and frame transactions without state loss', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.createNewDocument(96, 64, { resetProject: true, clean: true });
    const subject = new fabric.Rect({
      left: 12,
      top: 10,
      width: 42,
      height: 30,
      fill: '#d1425b',
      name: 'Subject'
    });
    OS.canvas.add(subject);
    OS.layers[1].name = 'Subject';
    OS.layers[1].objects.push(subject);
    OS.canvas.setActiveObject(subject);
    OS._enforceLayerInvariants();
    OS.updateLayersPanel();
    OS._initializeHistory('Destructive Baseline');
    OS._markDocumentClean(OS._historyBaseSnapshot, 'clean');

    const snapshot = () => JSON.stringify(OS._captureDocumentState());
    const baseline = snapshot();
    const operations = [];
    const verifyOperation = async (id, run) => {
      const succeeded = await run();
      const after = snapshot();
      const entryId = OS.history.at(-1)?.command?.id;
      const undoSucceeded = await OS.undo();
      const exactUndo = snapshot() === baseline;
      const redoSucceeded = await OS.redo();
      const exactRedo = snapshot() === after;
      await OS.undo();
      operations.push({ id, succeeded, entryId, undoSucceeded, exactUndo, redoSucceeded, exactRedo });
    };

    await verifyOperation('canvas.flatten', () => OS.flattenImage());
    await verifyOperation('canvas.rotate', () => OS.canvasRotate(90));
    await verifyOperation('canvas.flip', () => OS.canvasFlip('h'));
    await verifyOperation('canvas.crop', () => {
      const vpt = OS.canvas.viewportTransform;
      OS._cropRegion = {
        x: vpt[4] + 8 * vpt[0],
        y: vpt[5] + 6 * vpt[3],
        w: 60 * vpt[0],
        h: 40 * vpt[3]
      };
      return OS.applyCrop();
    });

    const originalFromURL = fabric.FabricImage.fromURL;
    const beforeFailure = snapshot();
    const historyBeforeFailure = OS.history.length;
    fabric.FabricImage.fromURL = () => Promise.reject(new Error('Synthetic image decode failure'));
    const failedFlatten = await OS.flattenImage();
    fabric.FabricImage.fromURL = originalFromURL;
    const failedFlattenRolledBack = snapshot() === beforeFailure && OS.history.length === historyBeforeFailure;

    const frameBase = snapshot();
    const addSucceeded = await OS.addFrame();
    const afterAdd = snapshot();
    await OS.undo();
    const addUndoExact = snapshot() === frameBase;
    await OS.redo();
    const addRedoExact = snapshot() === afterAdd;

    await OS.addFrame();
    const liveSubject = OS.canvas.getObjects().find((object) => object.name === 'Subject');
    liveSubject.set('fill', '#315fd1');
    OS.canvas.renderAll();
    const beforeSelect = snapshot();
    const selectSucceeded = await OS.selectFrame(0);
    const afterSelect = snapshot();
    await OS.undo();
    const selectUndoExact = snapshot() === beforeSelect;
    await OS.redo();
    const selectRedoExact = snapshot() === afterSelect;
    await OS.undo();

    const beforeDuplicate = snapshot();
    const duplicateSucceeded = await OS.dupFrame();
    const afterDuplicate = snapshot();
    await OS.undo();
    const duplicateUndoExact = snapshot() === beforeDuplicate;
    await OS.redo();
    const duplicateRedoExact = snapshot() === afterDuplicate;
    await OS.undo();

    const beforeRemove = snapshot();
    const removeSucceeded = await OS.removeFrame(0);
    const afterRemove = snapshot();
    await OS.undo();
    const removeUndoExact = snapshot() === beforeRemove;
    await OS.redo();
    const removeRedoExact = snapshot() === afterRemove;

    return {
      operations,
      failedFlatten,
      failedFlattenRolledBack,
      frames: {
        addSucceeded,
        addUndoExact,
        addRedoExact,
        selectSucceeded,
        selectUndoExact,
        selectRedoExact,
        duplicateSucceeded,
        duplicateUndoExact,
        duplicateRedoExact,
        removeSucceeded,
        removeUndoExact,
        removeRedoExact
      }
    };
  });

  expect(result.operations).toEqual([
    expect.objectContaining({ id: 'canvas.flatten', succeeded: true, entryId: 'canvas.flatten', undoSucceeded: true, exactUndo: true, redoSucceeded: true, exactRedo: true }),
    expect.objectContaining({ id: 'canvas.rotate', succeeded: true, entryId: 'canvas.rotate', undoSucceeded: true, exactUndo: true, redoSucceeded: true, exactRedo: true }),
    expect.objectContaining({ id: 'canvas.flip', succeeded: true, entryId: 'canvas.flip', undoSucceeded: true, exactUndo: true, redoSucceeded: true, exactRedo: true }),
    expect.objectContaining({ id: 'canvas.crop', succeeded: true, entryId: 'canvas.crop', undoSucceeded: true, exactUndo: true, redoSucceeded: true, exactRedo: true })
  ]);
  expect(result.failedFlatten).toBe(false);
  expect(result.failedFlattenRolledBack).toBe(true);
  expect(result.frames).toEqual({
    addSucceeded: true,
    addUndoExact: true,
    addRedoExact: true,
    selectSucceeded: true,
    selectUndoExact: true,
    selectRedoExact: true,
    duplicateSucceeded: true,
    duplicateUndoExact: true,
    duplicateRedoExact: true,
    removeSucceeded: true,
    removeUndoExact: true,
    removeRedoExact: true
  });
  expect(pageErrors).toEqual([]);
});

test('drives the editor from an embedding host over a versioned contract @cross-browser', async ({ page }) => {
  test.setTimeout(120_000);
  // A real cross-document frame, not a stub: the origin binding, the Blob
  // transfer and the override seams only exist across that boundary. The host
  // page is same-origin so the assertions can look at what the frame did.
  await openApp(page);
  const appUrl = projectAppUrl();

  const result = await page.evaluate(async ({ appUrl, protocolVersion }) => {
    const frame = document.createElement('iframe');
    frame.id = 'editor';
    frame.width = '1200';
    frame.height = '800';
    const inbox = [];
    const waiters = new Map();
    window.addEventListener('message', (event) => {
      if (!event.data || typeof event.data.type !== 'string') return;
      inbox.push(event.data);
      for (const [key, resolve] of [...waiters]) {
        const [type, id] = key.split('|');
        if (event.data.type === type && (id === '' || String(event.data.id) === id)) {
          waiters.delete(key);
          resolve(event.data);
        }
      }
    });
    const awaitMessage = (type, id = '') => new Promise((resolve, reject) => {
      const existing = inbox.find(message => message.type === type && (id === '' || String(message.id) === id));
      if (existing) return resolve(existing);
      const timer = setTimeout(() => reject(new Error('Timed out waiting for ' + type)), 20000);
      waiters.set(type + '|' + id, (message) => { clearTimeout(timer); resolve(message); });
    });
    const send = (message) => frame.contentWindow.postMessage({ version: protocolVersion, ...message }, '*');

    frame.src = appUrl;
    document.body.appendChild(frame);
    await new Promise((resolve) => { frame.addEventListener('load', resolve, { once: true }); });
    await awaitMessage('openshop:ready');
    // A file:// document is its own opaque origin, so the host cannot look
    // inside the frame on that lane. The protocol is asserted either way; the
    // DOM effects it causes are asserted where they are observable.
    let sameOrigin = false;
    try { sameOrigin = Boolean(frame.contentDocument?.documentElement); } catch (error) { sameOrigin = false; }
    if (sameOrigin) {
      await new Promise((resolve) => {
        const poll = () => (frame.contentDocument.documentElement.dataset.osBoot === 'ready'
          ? resolve()
          : setTimeout(poll, 50));
        poll();
      });
    }

    send({ type: 'openshop:hello', id: 'h1' });
    const ready = await awaitMessage('openshop:ready', 'h1');

    send({
      type: 'openshop:configure',
      id: 'c1',
      document: { width: 320, height: 200, background: '#101820' },
      tools: ['select', 'brush', 'text'],
      overrides: { open: true, save: true }
    });
    const configured = await awaitMessage('openshop:configured', 'c1');
    const hiddenTools = sameOrigin
      ? [...frame.contentDocument.querySelectorAll('.tool-btn[data-tool]')].filter(button => button.hidden).length
      : null;
    const brushVisible = sameOrigin
      ? !frame.contentDocument.querySelector('.tool-btn[data-tool="brush"]').hidden
      : null;
    // `const OS = {...}` is a global lexical binding, not a window property,
    // so the host reads the frame through its DOM rather than its internals.
    const presetSize = sameOrigin ? frame.contentDocument.getElementById('canvas-dims').textContent.trim() : null;

    send({ type: 'openshop:export', id: 'e0', format: 'png' });
    const png = await awaitMessage('openshop:exported', 'e0');

    // A version this build does not speak is refused, not guessed at.
    frame.contentWindow.postMessage({ type: 'openshop:export', id: 'bad', version: 99, format: 'png' }, '*');
    const versionError = await awaitMessage('openshop:error', 'bad');

    send({ type: 'openshop:export', id: 'e1', format: 'svg' });
    const svg = await awaitMessage('openshop:exported', 'e1');
    const svgText = await svg.blob.text();

    send({ type: 'openshop:export', id: 'e2', format: 'pdf' });
    const pdf = await awaitMessage('openshop:exported', 'e2');

    send({ type: 'openshop:export', id: 'e3', format: 'tiff' });
    const badFormat = await awaitMessage('openshop:error', 'e3');

    // Overrides are real seams, not flags.
    const seen = [];
    window.addEventListener('message', (event) => { if (event.data?.type) seen.push(event.data); });
    if (sameOrigin) {
      // Drive the real menu rows, so the override is proven at the seam a user
      // would actually reach.
      frame.contentDocument.querySelector('[data-os-click="click-004"]').click();
      frame.contentDocument.querySelector('[data-os-click="click-002"]').click();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const saved = seen.find(message => message.type === 'openshop:save-requested');

    return {
      readyVersion: ready.version,
      capabilities: ready.capabilities,
      configured: { tools: configured.tools, overrides: configured.overrides },
      hiddenTools,
      brushVisible,
      presetSize,
      png: { type: png.blob.type, size: png.blob.size, filename: png.filename },
      versionError: versionError.message,
      svg: { isSvg: svgText.trimStart().startsWith('<'), type: svg.blob.type },
      pdf: { type: pdf.blob.type, size: pdf.blob.size },
      badFormat: badFormat.message,
      sameOrigin,
      eraserStillHidden: sameOrigin
        ? frame.contentDocument.querySelector('.tool-btn[data-tool="eraser"]').hidden
        : null,
      saved: Boolean(saved),
      savedFilename: saved?.filename ?? null,
      savedSize: saved?.blob?.size ?? 0,
      openRequested: seen.some(message => message.type === 'openshop:open-requested'),
      downloadAnchors: sameOrigin ? frame.contentDocument.querySelectorAll('a[download]').length : 0
    };
  }, { appUrl, protocolVersion: 1 });

  expect(result.readyVersion).toBe(1);
  expect(result.capabilities.exportFormats).toEqual(['png', 'jpeg', 'webp', 'avif', 'svg', 'pdf', 'ora']);
  expect(result.capabilities.overrides).toEqual(['open', 'save']);
  expect(result.capabilities.tools.length).toBeGreaterThan(10);
  expect(result.configured.tools).toEqual(['select', 'brush', 'text']);
  expect(result.configured.overrides).toEqual({ open: true, save: true });
  if (result.sameOrigin) {
    expect(result.hiddenTools).toBeGreaterThan(0);
    expect(result.brushVisible).toBe(true);
    expect(result.presetSize).toBe('320 x 200');
  }
  expect(result.png.type).toBe('image/png');
  expect(result.png.size).toBeGreaterThan(0);
  expect(result.png.filename).toMatch(/\.png$/);
  expect(result.versionError).toContain('Unsupported protocol version 99');
  expect(result.svg.isSvg).toBe(true);
  expect(result.svg.type).toContain('svg');
  expect(result.pdf.type).toBe('application/pdf');
  expect(result.pdf.size).toBeGreaterThan(0);
  expect(result.badFormat).toContain('Unsupported export format: tiff');
  if (result.sameOrigin) {
    expect(result.eraserStillHidden).toBe(true);
    expect(result.saved).toBe(true);
    expect(result.savedFilename).toMatch(/\.png$/);
    expect(result.savedSize).toBeGreaterThan(0);
    expect(result.openRequested).toBe(true);
  }
  // Nothing was downloaded behind the host's back.
  expect(result.downloadAnchors).toBe(0);

  // Once a host is bound, another window's message is ignored outright — no
  // reply, no state change. Reaching through a second frame from this page
  // would still name this page as the sender, so the guard is exercised
  // directly against the handler.
  const binding = await page.evaluate(async () => {
    const replies = [];
    const boundSource = { postMessage: (message) => replies.push({ from: 'bound', message }) };
    const otherSource = { postMessage: (message) => replies.push({ from: 'other', message }) };
    OS._embed = {
      origin: 'https://host.example',
      target: 'https://host.example',
      source: boundSource,
      overrideOpen: false,
      overrideSave: false,
      tools: ['select']
    };
    await OS._onEmbedMessage({
      data: { type: 'openshop:configure', version: 1, id: 'intruder', tools: ['eraser'] },
      origin: 'https://host.example',
      source: otherSource
    });
    await OS._onEmbedMessage({
      data: { type: 'openshop:configure', version: 1, id: 'elsewhere', tools: ['eraser'] },
      origin: 'https://evil.example',
      source: boundSource
    });
    const afterStrangers = OS._embed.tools;
    await OS._onEmbedMessage({
      data: { type: 'openshop:configure', version: 1, id: 'real', tools: ['brush'] },
      origin: 'https://host.example',
      source: boundSource
    });
    const afterHost = OS._embed.tools;
    OS._embed = null;
    OS._applyEmbedTools(null);
    return { replies: replies.map(entry => `${entry.from}:${entry.message.type}:${entry.message.id}`), afterStrangers, afterHost };
  });
  expect(binding.afterStrangers).toEqual(['select']);
  expect(binding.afterHost).toEqual(['brush']);
  expect(binding.replies).toEqual(['bound:openshop:configured:real']);
});

test('names states and keeps the branch an edit-after-undo used to delete @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const add = (fill, name) => {
      const rect = new fabric.Rect({ left: 5, top: 5, width: 40, height: 40, fill, name });
      OS.canvas.add(rect);
      OS.layers[OS.activeLayerIdx].objects.push(rect);
      OS.saveHistory(name);
      return rect;
    };
    const names = () => OS.canvas.getObjects().map(object => object.name).filter(name => name && name !== '__boundary__');

    add('#ff0000', 'Red');
    const named = OS.nameCurrentState('  After red  ');
    add('#00ff00', 'Green');
    add('#0000ff', 'Blue');
    const beforeUndo = names();

    // Step back over Blue and Green, then edit — the old line would vanish here.
    await OS.undo();
    await OS.undo();
    const atRed = names();
    add('#ffff00', 'Yellow');
    const afterBranchingEdit = names();

    const branch = OS._historyBranches.at(-1);
    await OS.restoreSnapshot(branch.id);
    const restoredBranch = names();

    // Step back so branching genuinely leaves a line behind to archive.
    await OS.undo();
    const branchesBeforeBranching = OS._historyBranches.length;
    await OS.restoreSnapshot(named.id, { branch: true });
    const restoredNamed = names();

    const branchesAfter = OS._historyBranches.length;
    const budget = (() => {
      OS._maxHistoryBranches = 1;
      OS._maxSnapshots = 1;
      const dropped = OS._enforceSnapshotBudget();
      return { dropped, branches: OS._historyBranches.length, snapshots: OS._snapshots.length };
    })();

    return {
      namedName: named.name,
      hasThumbnail: typeof named.thumbnail === 'string' && named.thumbnail.startsWith('data:image/png'),
      beforeUndo,
      atRed,
      afterBranchingEdit,
      branchName: branch.name,
      branchTip: branch.tipLabel,
      restoredBranch,
      restoredNamed,
      // Branching from a named state archives the line it left behind too.
      branchesBeforeBranching,
      branchesAfter,
      budget,
      missing: await OS.restoreSnapshot('snapshot-does-not-exist')
    };
  });

  expect(result.namedName).toBe('After red');
  expect(result.hasThumbnail).toBe(true);
  expect(result.beforeUndo).toEqual(['Red', 'Green', 'Blue']);
  expect(result.atRed).toEqual(['Red']);
  expect(result.afterBranchingEdit).toEqual(['Red', 'Yellow']);
  // The two steps that used to be silently discarded are still reachable.
  expect(result.branchName).toContain('2 steps');
  expect(result.branchTip).toBe('Blue');
  expect(result.restoredBranch).toEqual(['Red', 'Green', 'Blue']);
  expect(result.restoredNamed).toEqual(['Red']);
  expect(result.branchesAfter).toBe(result.branchesBeforeBranching + 1);
  expect(result.budget.branches).toBe(1);
  expect(result.budget.snapshots).toBe(1);
  expect(result.budget.dropped).toBeGreaterThan(0);
  expect(result.missing).toBe(false);
});

test('imports SVG as editable shapes and strips anything executable @cross-browser', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const markup = [
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="240" height="160" viewBox="0 0 240 160">',
      '<script>window.__svgRan = true;<\/script>',
      '<rect x="10" y="10" width="80" height="60" fill="#d61f4e" onclick="window.__svgClicked = true"/>',
      '<circle cx="160" cy="80" r="40" fill="#3978ff"/>',
      '<text x="20" y="140" font-size="18" fill="#ffffff">Vector</text>',
      '<image x="0" y="0" width="10" height="10" xlink:href="javascript:window.__svgHref = true"/>',
      '</svg>'
    ].join('');
    const file = new File([markup], 'logo.svg', { type: 'image/svg+xml' });
    OS._confirmDiscardUnsaved = async () => true;
    const ok = await OS._loadSVGFile(file, 'open');
    const group = OS.canvas.getActiveObject();
    const shapes = group?.getObjects?.() || [];
    return {
      ok,
      docSize: [OS.canvasW, OS.canvasH],
      layerName: OS.layers[OS.activeLayerIdx].name,
      types: shapes.map(shape => shape.type).sort(),
      // Editable means real objects with real properties, not one flat <img>.
      fills: shapes.map(shape => String(shape.fill || '').toLowerCase()).filter(Boolean).sort(),
      text: shapes.find(shape => typeof shape.text === 'string')?.text ?? null,
      scriptRan: Boolean(window.__svgRan),
      clickHandlerKept: shapes.some(shape => typeof shape.onclick === 'function'),
      hrefRan: Boolean(window.__svgHref),
      // And the guards refuse what they should.
      tooManyShapes: await (async () => {
        const many = ['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">'];
        for (let index = 0; index < 12; index++) many.push(`<rect x="${index}" y="0" width="1" height="1" fill="#fff"/>`);
        many.push('</svg>');
        const limit = OS._importLimits.maxProjectObjects;
        OS._importLimits = { ...OS._importLimits, maxProjectObjects: 5 };
        const refused = await OS._loadSVGFile(new File([many.join('')], 'many.svg', { type: 'image/svg+xml' }), 'drop');
        OS._importLimits = { ...OS._importLimits, maxProjectObjects: limit };
        return refused;
      })(),
      empty: await OS._loadSVGFile(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>'], 'empty.svg', { type: 'image/svg+xml' }), 'drop')
    };
  });

  expect(result.ok).toBe(true);
  expect(result.docSize).toEqual([240, 160]);
  expect(result.layerName).toBe('logo.svg');
  expect(result.types).toEqual(['circle', 'image', 'rect', 'text']);
  expect(result.fills).toContain('#d61f4e');
  expect(result.fills).toContain('#3978ff');
  expect(result.text).toBe('Vector');
  // Nothing executable survives the sanitiser.
  expect(result.scriptRan).toBe(false);
  expect(result.clickHandlerKept).toBe(false);
  expect(result.hrefRan).toBe(false);
  expect(result.tooManyShapes).toBe(false);
  expect(result.empty).toBe(false);
  expect(pageErrors).toEqual([]);
});

test('traces a raster layer into editable paths that survive SVG and PDF export @cross-browser', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const traced = await page.evaluate(async () => {
    const size = 64;
    const element = document.createElement('canvas');
    element.width = size;
    element.height = size;
    const context = element.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.fillStyle = '#d61f4e';
    context.beginPath();
    context.arc(32, 32, 20, 0, Math.PI * 2);
    context.fill();
    const image = await fabric.FabricImage.fromURL(element.toDataURL('image/png'));
    image.set({ left: 0, top: 0 });
    OS.canvas.add(image);
    OS.layers[OS.activeLayerIdx].objects.push(image);
    OS.canvas.setActiveObject(image);

    const lazyBefore = OS._runtimeLoadedAssets.has('imageTracer');
    const layersBefore = OS.layers.length;
    const ok = await OS.traceRasterLayer({ colors: 4, smoothing: 1, detail: 8 });
    const group = OS.canvas.getActiveObject();
    const shapes = group?.getObjects?.() || [];
    const svg = OS.canvas.toSVG();
    return {
      lazyBefore,
      lazyAfter: OS._runtimeLoadedAssets.has('imageTracer'),
      verified: OS._runtimeAssets.imageTracer.integrity.startsWith('sha384-'),
      ok,
      newLayer: OS.layers.length - layersBefore,
      layerName: OS.layers[OS.activeLayerIdx].name,
      pathCount: shapes.length,
      // Editable means real Path objects with real commands, not an <image>.
      allPaths: shapes.length > 0 && shapes.every(shape => shape.type === 'path' && Array.isArray(shape.path) && shape.path.length > 2),
      tracedColors: [...new Set(shapes.map(shape => String(shape.fill).toLowerCase()))].length,
      svgHasPaths: (svg.match(/<path/g) || []).length,
      svgHasRasterImage: /<image[\s>]/.test(svg),
      history: OS._historyLabels ? null : true
    };
  });

  expect(traced.lazyBefore).toBe(false);
  expect(traced.lazyAfter).toBe(true);
  expect(traced.verified).toBe(true);
  expect(traced.ok).toBe(true);
  expect(traced.newLayer).toBe(1);
  expect(traced.layerName).toBe('Traced (4 colors)');
  expect(traced.pathCount).toBeGreaterThan(0);
  expect(traced.allPaths).toBe(true);
  expect(traced.tracedColors).toBeGreaterThan(1);
  // SVG export carries the traced geometry, not a re-embedded bitmap of it.
  expect(traced.svgHasPaths).toBeGreaterThanOrEqual(traced.pathCount);

  // The same paths reach the PDF page as path operators, not a bitmap of them.
  const pdf = await page.evaluate(async () => {
    const { jsPDF } = window.jspdf;
    await OS._loadSvgToPdf();
    const read = async (options) => {
      let bytes = null;
      // jsPDF copies jsPDF.API onto the instance as it is built, so the API
      // object is where a stub has to go to reach this export's own method.
      const originalSave = jsPDF.API.save;
      jsPDF.API.save = function() { bytes = new Uint8Array(this.output('arraybuffer')); return this; };
      const ok = await OS.exportPDF(options);
      jsPDF.API.save = originalSave;
      let text = '';
      for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
      return { ok, bytes: bytes.length, hasImage: /\/Subtype\s*\/Image/.test(text), text };
    };
    const auto = await read(undefined);
    const forcedRaster = await read({ vector: false });
    return {
      isVector: OS._documentIsVector(),
      auto: { ok: auto.ok, bytes: auto.bytes, hasImage: auto.hasImage },
      forcedRaster: { ok: forcedRaster.ok, bytes: forcedRaster.bytes, hasImage: forcedRaster.hasImage }
    };
  });
  expect(pdf.isVector).toBe(true);
  expect(pdf.auto.ok).toBe(true);
  // No embedded image XObject: the page is drawn, not photographed.
  expect(pdf.auto.hasImage).toBe(false);
  expect(pdf.forcedRaster.hasImage).toBe(true);
  expect(pdf.auto.bytes).toBeGreaterThan(0);

  const guard = await page.evaluate(async () => {
    OS._traceMaxPaths = 1;
    const refused = await OS.traceRasterLayer({ colors: 16 });
    OS._traceMaxPaths = 4000;
    return refused;
  });
  expect(guard).toBe(false);
  expect(pageErrors).toEqual([]);
});

test('reconstructs an enlargement with a real model and falls back honestly @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    // A 200x200 source with a 128px tile is a 2x2 grid, so the seam maths and
    // the skirt cropping are both exercised without downloading a model.
    const size = 200;
    const element = document.createElement('canvas');
    element.width = size;
    element.height = size;
    const context = element.getContext('2d');
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        context.fillStyle = `rgb(${x % 256},${y % 256},${(x + y) % 256})`;
        context.fillRect(x, y, 1, 1);
      }
    }
    const target = { name: 'Photo', type: 'image', getElement: () => element };
    OS._getActiveImage = () => target;
    OS._isEditCurrent = () => true;
    OS._canvasToRawImage = async (canvas) => {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      return { data: data.data, width: canvas.width, height: canvas.height, channels: 4 };
    };

    const seen = [];
    // Stand in for Swin2SR: nearest-neighbour to exactly 2x, but padded the way
    // the real model pads its window, so the normalisation step is proven too.
    OS._loadPipeline = async (task, model) => {
      seen.push({ task, model });
      return async (raw) => {
        const pad = 3;
        const w = raw.width * 2, h = raw.height * 2;
        const out = new Uint8ClampedArray((w + pad) * (h + pad) * 3);
        for (let y = 0; y < h + pad; y++) {
          for (let x = 0; x < w + pad; x++) {
            const sx = Math.min(raw.width - 1, x >> 1);
            const sy = Math.min(raw.height - 1, y >> 1);
            const from = (sy * raw.width + sx) * 4;
            const to = (y * (w + pad) + x) * 3;
            out[to] = raw.data[from];
            out[to + 1] = raw.data[from + 1];
            out[to + 2] = raw.data[from + 2];
          }
        }
        return { data: out, width: w + pad, height: h + pad, channels: 3 };
      };
    };
    let replacement = null;
    OS._replaceActiveImage = async (_target, url, label) => { replacement = { url, label }; return true; };

    const ok = await OS.aiSuperResolve(2);
    const image = await new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = reject;
      node.src = replacement.url;
    });
    const check = document.createElement('canvas');
    check.width = image.width;
    check.height = image.height;
    check.getContext('2d').drawImage(image, 0, 0);
    const pixels = check.getContext('2d').getImageData(0, 0, check.width, check.height).data;
    const read = (x, y) => [...pixels.slice((y * check.width + x) * 4, (y * check.width + x) * 4 + 3)];
    // The source is a 1-unit-per-pixel ramp, so a correctly stitched 2x is
    // monotonic with steps of 0 or 1. A tile placed at the wrong offset repeats
    // or drops its whole 16px skirt, which shows up as a double-digit jump.
    let worstRowStep = 0;
    let worstColumnStep = 0;
    for (let x = 1; x < check.width; x++) worstRowStep = Math.max(worstRowStep, Math.abs(read(x, 100)[0] - read(x - 1, 100)[0]));
    for (let y = 1; y < check.height; y++) worstColumnStep = Math.max(worstColumnStep, Math.abs(read(100, y)[1] - read(100, y - 1)[1]));

    // The fallback path: a model that will not load must still enlarge.
    OS._loadPipeline = async () => null;
    let resampled = null;
    OS._replaceActiveImage = async (_target, url, label) => { resampled = label; return true; };
    const fellBack = await OS.aiSuperResolve(4);

    // A source too large for the model path is redirected, not refused.
    OS._superResolutionTileLimit = 1;
    let redirected = null;
    OS._replaceActiveImage = async (_target, url, label) => { redirected = label; return true; };
    const redirectedOk = await OS.aiSuperResolve(2);
    OS._superResolutionTileLimit = 256;

    return {
      ok,
      seen,
      label: replacement.label,
      width: image.width,
      height: image.height,
      // Every tile boundary must continue the ramp rather than show a seam.
      worstRowStep,
      worstColumnStep,
      corner: read(0, 0),
      farCorner: read(398, 398),
      fellBack,
      resampled,
      redirectedOk,
      redirected,
      pinned: Object.keys(OS._modelRevisions).filter(model => model.includes('swin2SR'))
    };
  });

  expect(result.ok).toBe(true);
  expect(result.seen).toEqual([{ task: 'image-to-image', model: 'Xenova/swin2SR-classical-sr-x2-64' }]);
  expect(result.label).toBe('Super Resolution 2x');
  expect(result.width).toBe(400);
  expect(result.height).toBe(400);
  expect(result.worstRowStep).toBeLessThanOrEqual(4);
  expect(result.worstColumnStep).toBeLessThanOrEqual(4);
  // The ramp still starts and ends where the source does.
  expect(result.corner[0]).toBeLessThanOrEqual(4);
  expect(result.farCorner[0]).toBeGreaterThanOrEqual(195);
  expect(result.farCorner[1]).toBeGreaterThanOrEqual(195);
  expect(result.fellBack).toBe(true);
  expect(result.resampled).toBe('Upscale 4x');
  expect(result.redirectedOk).toBe(true);
  expect(result.redirected).toBe('Upscale 2x');
  expect(result.pinned).toEqual([
    'Xenova/swin2SR-classical-sr-x2-64',
    'Xenova/swin2SR-classical-sr-x4-64'
  ]);
});

test('drags gradient stops on canvas and colours text decorations @cross-browser', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const gradient = await page.evaluate(async () => {
    OS.state.gradType = 'linear';
    OS.drawGradient({ x: 20, y: 20 }, { x: 220, y: 140 });
    const rect = OS.canvas.getObjects().at(-1);
    OS.canvas.setActiveObject(rect);
    const before = Object.keys(rect.controls).sort();
    const lazyBefore = OS._runtimeLoadedAssets.has('fabricExtensions');
    const attached = await OS.editGradientStops();
    const controls = Object.keys(rect.controls);

    // Driving one handle has to move the gradient itself, not the rectangle.
    const handle = rect.controls[controls.find(name => !before.includes(name))];
    const geometryBefore = { left: rect.left, top: rect.top, coords: { ...rect.fill.coords } };
    const pointer = new fabric.Point(rect.left + 160, rect.top + 30);
    handle.actionHandler(
      { clientX: 0, clientY: 0 },
      { target: rect, action: 'gradient', corner: '', originX: 'left', originY: 'top', scenePoint: pointer, pointer },
      pointer.x,
      pointer.y
    );

    const radial = new fabric.Rect({ left: 0, top: 0, width: 40, height: 40, fill: new fabric.Gradient({ type: 'radial', coords: { x1: 20, y1: 20, r1: 0, x2: 20, y2: 20, r2: 20 }, colorStops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] }) });
    OS.canvas.add(radial);
    OS.canvas.setActiveObject(radial);
    const radialRefused = await OS.editGradientStops();

    OS.canvas.setActiveObject(rect);
    return {
      lazyBefore,
      lazyAfter: OS._runtimeLoadedAssets.has('fabricExtensions'),
      verified: OS._runtimeAssets.fabricExtensions.integrity.startsWith('sha384-'),
      attached,
      newControls: controls.filter(name => !before.includes(name)).length,
      moved: rect.left === geometryBefore.left && rect.top === geometryBefore.top,
      coordsChanged: JSON.stringify(rect.fill.coords) !== JSON.stringify(geometryBefore.coords),
      radialRefused,
      // Deselecting must hand the object its ordinary transform handles back.
      restored: (OS.exitGradientStops(), Object.keys(rect.controls).sort().join()) === before.join()
    };
  });
  expect(gradient.lazyBefore).toBe(false);
  expect(gradient.lazyAfter).toBe(true);
  expect(gradient.verified).toBe(true);
  expect(gradient.attached).toBe(true);
  expect(gradient.newControls).toBeGreaterThan(0);
  expect(gradient.moved).toBe(true);
  expect(gradient.coordsChanged).toBe(true);
  expect(gradient.radialRefused).toBe(false);
  expect(gradient.restored).toBe(true);

  const text = await page.evaluate(() => {
    OS.canvas.discardActiveObject();
    const node = new fabric.IText('Decorated', { left: 10, top: 10, fontSize: 24, fill: '#ffffff' });
    OS.canvas.add(node);
    OS.canvas.setActiveObject(node);
    OS.setTextDecoration('underline', true);
    OS.setTextDecoration('linethrough', true);
    OS.setTextDecoration('textDecorationColor', '#ff0055');
    OS.setTextDecoration('textDecorationThickness', 250);
    OS.setTextDecoration('textDecorationThickness', 0);
    const clamped = node.textDecorationThickness;
    OS.setTextDecoration('textDecorationColor', 'javascript:alert(1)');
    return {
      underline: node.underline,
      overline: node.overline,
      linethrough: node.linethrough,
      colour: node.textDecorationColor,
      clamped,
      // A new text object has to pick the same settings up.
      inherited: OS._textDecorationProps()
    };
  });
  expect(text).toMatchObject({
    underline: true,
    overline: false,
    linethrough: true,
    colour: '#ff0055',
    clamped: 10
  });
  expect(text.inherited).toMatchObject({ underline: true, linethrough: true, textDecorationColor: '#ff0055' });
  expect(pageErrors).toEqual([]);
});

test('formats text ranges through project save/load and export loss reporting @cross-browser', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const text = new fabric.IText('Hello world', { left:30, top:30, fontSize:24, fill:'#ffffff' });
    const layer = OS._addObjectAsLayer(text, 'Range Text');
    OS.canvas.setActiveObject(text);
    text.enterEditing();
    text.selectionStart = 0;
    text.selectionEnd = 5;
    document.getElementById('text-font').value = 'Georgia';
    document.getElementById('text-size').value = '42';
    document.getElementById('text-color').value = '#ff3355';
    document.getElementById('text-bold').checked = true;
    document.getElementById('text-italic').checked = true;
    document.getElementById('text-underline').checked = true;
    document.getElementById('text-decoration-color').value = '#22cc88';
    document.getElementById('text-decoration-thickness').value = '180';
    OS._syncTextRangeControls();
    document.getElementById('apply-text-range').click();
    const applied = text.styles?.['0']?.['0']?.fill === '#ff3355';
    const before = JSON.parse(JSON.stringify(text.styles));
    const project = OS._captureDocumentState();
    const objectId = text._openShopObjectId;
    const serialized = project.canvas.fabric.objects.find(object => object._openShopObjectId === objectId);
    const svg = OS._exportSVGMarkup();
    const impact = OS._getExportImpact('psd');
    const psd = OS._buildPsdExportStructure();
    await OS._loadDocumentState(project, { trusted:true });
    const restored = OS.canvas.getObjects().find(object => object._openShopObjectId === objectId);
    return {
      applied,
      layerName:layer.name,
      style:before['0']['0'],
      serialized:serialized?.styles?.[0]?.style,
      restored:restored?.styles?.['0']?.['0'],
      schemaVersion:project.schemaVersion,
      svgHasSpans:/<tspan\b/i.test(svg),
      svgHasRangeFill:/<tspan[\s\S]*?fill:\s*rgb\(255,51,85\)/i.test(svg),
      impactWarning:impact.warnings.find(warning => warning.includes('per-range formatting')) || null,
      psdWarning:psd.report.warnings.find(warning => warning.includes('per-range formatting')) || null
    };
  });
  expect(result.applied).toBe(true);
  expect(result.layerName).toBe('Range Text');
  expect(result.style).toMatchObject({
    fontFamily:'Georgia', fontSize:42, fill:'#ff3355', fontWeight:'bold', fontStyle:'italic',
    underline:true, textDecorationColor:'#22cc88', textDecorationThickness:180
  });
  expect(result.serialized).toMatchObject(result.style);
  expect(result.restored).toMatchObject(result.style);
  expect(result.schemaVersion).toBe(3);
  expect(result.svgHasSpans).toBe(true);
  expect(result.svgHasRangeFill).toBe(true);
  expect(result.impactWarning).toMatch(/rasterized/);
  expect(result.psdWarning).toMatch(/rasterized/);
  expect(pageErrors).toEqual([]);
});

test('reports what it sent and can refuse every uncached download @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // The three pinned boot libraries are fetched before anything else runs, so
  // the ledger has to have been installed ahead of them to be worth trusting.
  const boot = await page.evaluate(() => {
    const snapshot = OS._network().snapshot();
    return {
      strict: snapshot.strict,
      cdn: snapshot.hosts.find(host => host.host === 'cdn.jsdelivr.net') || null,
      documentBytesSent: snapshot.entries.some(entry => entry.method !== 'GET'),
      badge: document.getElementById('network-state-label').textContent
    };
  });
  expect(boot.strict).toBe(false);
  expect(boot.cdn).toMatchObject({ purpose: 'Pinned library or codec', external: true });
  expect(boot.cdn.sent).toBeGreaterThanOrEqual(3);
  // Nothing OpenShop does is a POST, because there is nowhere to post to.
  expect(boot.documentBytesSent).toBe(false);
  expect(boot.badge).toBe(`${boot.cdn.sent} downloads`);

  const dialog = await page.evaluate(async () => {
    const overlay = await OS.showNetworkActivity();
    return {
      summary: overlay.querySelector('#network-activity-summary').textContent,
      hosts: [...overlay.querySelectorAll('#network-activity-hosts dt')].map(node => node.textContent),
      impact: [...overlay.querySelectorAll('#network-strict-impact .offline-model')].map(row => row.textContent),
      checked: overlay.querySelector('#network-strict-toggle').checked
    };
  });
  expect(dialog.hosts).toContain('cdn.jsdelivr.net');
  expect(dialog.summary).toContain('outbound request');
  expect(dialog.checked).toBe(false);
  expect(dialog.impact.some(row => row.startsWith('AVIF import and export'))).toBe(true);

  // Turning strict mode on must actually refuse an uncached cross-origin fetch,
  // leave same-origin and in-page URLs alone, and say what it took away.
  const strict = await page.evaluate(async () => {
    const overlay = document.querySelector('.modal-overlay');
    const toggle = overlay.querySelector('#network-strict-toggle');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 60));
    let blocked = null;
    try {
      await fetch('https://cdn.jsdelivr.net/npm/openshop-strict-mode-probe@0.0.0/nothing.js');
    } catch (error) {
      blocked = error.message;
    }
    const inPage = await fetch(URL.createObjectURL(new Blob(['ok']))).then(response => response.text());
    const snapshot = OS._network().snapshot();
    const impact = [...overlay.querySelectorAll('#network-strict-impact .offline-model')].map(row => row.textContent);
    overlay.remove();
    return {
      blocked,
      inPage,
      persisted: localStorage.getItem('os_strict_offline'),
      blockedCount: snapshot.blocked,
      badge: document.getElementById('network-state-label').textContent,
      disabled: impact.filter(row => row.endsWith('Disabled while strict')).length
    };
  });
  expect(strict.blocked).toContain('Strict offline mode blocked a request to cdn.jsdelivr.net');
  expect(strict.inPage).toBe('ok');
  expect(strict.persisted).toBe('on');
  expect(strict.blockedCount).toBe(1);
  expect(strict.badge).toBe('Strict · 1 blocked');
  expect(strict.disabled).toBeGreaterThan(0);

  // A cold start must never be left unopenable by the toggle: the pinned boot
  // libraries are the app, so strict mode stands down and records why.
  await openApp(page);
  const recovered = await page.evaluate(() => ({
    strict: OS._network().strict,
    reason: OS._network().strictDisabledReason,
    persisted: localStorage.getItem('os_strict_offline'),
    booted: document.documentElement.dataset.osBoot
  }));
  expect(recovered.booted).toBe('ready');
  if (recovered.strict === false && recovered.reason) {
    expect(recovered.reason).toContain('cold start');
    expect(recovered.persisted).toBe('off');
  } else {
    // The shell was cached, so the guarantee survived the reload intact.
    expect(recovered.strict).toBe(true);
  }
  await page.evaluate(() => OS.setStrictOffline(false));
});

test('exports real alpha or matte pixels and presents format loss before download @cross-browser', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.createNewDocument(32, 24, { resetProject: true, clean: true });
    const card = new fabric.Rect({
      left: 2,
      top: 2,
      width: 8,
      height: 8,
      fill: '#e43f55',
      strokeWidth: 0,
      name: 'Card'
    });
    OS.canvas.add(card);
    OS.layers[1].name = 'Card';
    OS.layers[1].objects.push(card);
    const captionLayer = {
      id: OS._newDocumentId('layer'),
      name: 'Caption',
      visible: true,
      locked: false,
      opacity: 100,
      blend: 'source-over',
      objects: []
    };
    const caption = new fabric.IText('A', {
      left: 13,
      top: 3,
      fontSize: 8,
      fill: '#ffffff',
      name: 'Caption'
    });
    OS.canvas.add(caption);
    captionLayer.objects.push(caption);
    OS.layers.push(captionLayer);
    OS.activeLayerIdx = 2;
    OS._enforceLayerInvariants();
    OS.updateLayersPanel();
    OS._initializeHistory('Export Baseline');
    OS._markDocumentDirty();

    const sample = (dataUrl, x, y) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        resolve([...context.getImageData(x, y, 1, 1).data]);
      };
      image.onerror = reject;
      image.src = dataUrl;
    });
    const waitForPreview = (overlay, labelPrefix) => new Promise((resolve, reject) => {
      const deadline = performance.now() + 2000;
      const check = () => {
        const label = overlay.querySelector('#es-preview')?.getAttribute('aria-label') || '';
        if (label.startsWith(labelPrefix)) {
          resolve(label);
        } else if (performance.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${labelPrefix} export preview`));
        } else {
          setTimeout(check, 16);
        }
      };
      check();
    });

    const stateBefore = JSON.stringify(OS._captureDocumentState());
    const viewportBefore = OS.canvas.viewportTransform.slice();
    const dirtyBefore = {
      dirty: OS._isDirty,
      autoSaveDirty: OS._autoSaveDirty,
      revision: OS._documentRevision,
      historyLength: OS.history.length
    };
    const transparentPng = OS._captureExportRaster({ format: 'png', transparent: true });
    const mattePng = OS._captureExportRaster({ format: 'png', transparent: false, matte: '#00ff00' });
    const transparentWebp = OS._captureExportRaster({ format: 'webp', transparent: true, quality: 1 });
    const jpeg = OS._captureExportRaster({ format: 'jpeg', transparent: true, matte: '#00ff00', quality: 1 });
    const pixels = {
      transparentPng: await sample(transparentPng.dataUrl, 30, 22),
      mattePng: await sample(mattePng.dataUrl, 30, 22),
      transparentWebp: await sample(transparentWebp.dataUrl, 30, 22),
      jpeg: await sample(jpeg.dataUrl, 30, 22)
    };
    const boundary = OS.canvas.getObjects().find((object) => object.name === '__boundary__');
    const svgProbe = OS._withExportCanvasState({ transparent: true }, () => ({
      source: OS.canvas.toSVG({
        viewBox: { x: 0, y: 0, width: OS.canvasW, height: OS.canvasH },
        width: OS.canvasW,
        height: OS.canvasH
      }),
      boundaryOpacity: boundary.opacity,
      boundaryExcluded: boundary.excludeFromExport
    }));
    const svgBoundaryRestored = boundary.opacity === 1 && boundary.excludeFromExport === false;

    window.__pdfProbe = {};
    window.jspdf = {
      jsPDF: class {
        constructor(options) { window.__pdfProbe.options = options; }
        addImage(dataUrl) { window.__pdfProbe.dataUrl = dataUrl; }
        save(filename) { window.__pdfProbe.filename = filename; }
      }
    };
    // `vector: false` keeps this probe on the raster page it is measuring; the
    // stub jsPDF above has no SVG writer either way.
    const pdfSucceeded = await OS.exportPDF({ matte: '#00ff00', vector: false });
    const pdfPixel = await sample(window.__pdfProbe.dataUrl, 30, 22);

    const originalToDataURL = OS.canvas.toDataURL;
    OS.canvas.toDataURL = () => { throw new Error('Synthetic export failure'); };
    const failedExport = OS.saveFile('png');
    OS.canvas.toDataURL = originalToDataURL;

    const stateAfter = JSON.stringify(OS._captureDocumentState());
    const dirtyAfter = {
      dirty: OS._isDirty,
      autoSaveDirty: OS._autoSaveDirty,
      revision: OS._documentRevision,
      historyLength: OS.history.length
    };
    const overlay = OS.showExportSettings('jpeg');
    overlay.querySelector('#es-matte').value = '#00ff00';
    overlay.querySelector('#es-matte').dispatchEvent(new Event('input', { bubbles: true }));
    await waitForPreview(overlay, 'JPEG');
    const jpegUi = {
      alphaDisabled: overlay.querySelector('#es-transparent').disabled,
      alphaChecked: overlay.querySelector('#es-transparent').checked,
      matteVisible: overlay.querySelector('#es-matte-row').style.display,
      previewLabel: overlay.querySelector('#es-preview').getAttribute('aria-label'),
      impact: overlay.querySelector('#es-impact').textContent,
      projectPromptVisible: !overlay.querySelector('#es-project-state').hidden
    };
    overlay.querySelector('[data-fmt="png"]').click();
    const alpha = overlay.querySelector('#es-transparent');
    alpha.checked = false;
    alpha.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForPreview(overlay, 'PNG');
    const pngMatteUi = {
      alphaDisabled: alpha.disabled,
      matteVisible: overlay.querySelector('#es-matte-row').style.display,
      previewLabel: overlay.querySelector('#es-preview').getAttribute('aria-label')
    };
    overlay.remove();

    return {
      pixels,
      svg: {
        checkerExcluded: !svgProbe.source.includes('<pattern'),
        boundaryOpacityDuringExport: svgProbe.boundaryOpacity,
        boundaryExcludedDuringExport: svgProbe.boundaryExcluded,
        boundaryRestored: svgBoundaryRestored
      },
      pdf: {
        succeeded: pdfSucceeded,
        pixel: pdfPixel,
        filename: window.__pdfProbe.filename
      },
      jpegTransparentOption: jpeg.options.transparent,
      stateRestored: stateAfter === stateBefore,
      viewportRestored: JSON.stringify(OS.canvas.viewportTransform) === JSON.stringify(viewportBefore),
      dirtyUnchanged: JSON.stringify(dirtyAfter) === JSON.stringify(dirtyBefore),
      failedExport,
      jpegUi,
      pngMatteUi
    };
  });

  expect(result.pixels.transparentPng[3]).toBe(0);
  expect(result.pixels.transparentWebp[3]).toBe(0);
  // WebKit's canvas composite lands a channel one step off pure green.
  expect(result.pixels.mattePng[0]).toBeLessThanOrEqual(2);
  expect(result.pixels.mattePng[1]).toBeGreaterThanOrEqual(253);
  expect(result.pixels.mattePng[2]).toBeLessThanOrEqual(2);
  expect(result.pixels.mattePng[3]).toBe(255);
  expect(result.pixels.jpeg[1]).toBeGreaterThan(180);
  expect(result.pixels.jpeg[0]).toBeLessThan(80);
  expect(result.pixels.jpeg[2]).toBeLessThan(80);
  expect(result.pixels.jpeg[3]).toBe(255);
  expect(result.svg).toEqual({
    checkerExcluded: true,
    boundaryOpacityDuringExport: 0,
    boundaryExcludedDuringExport: true,
    boundaryRestored: true
  });
  expect(result.pdf.succeeded).toBe(true);
  expect(result.pdf.pixel[0]).toBeLessThanOrEqual(2);
  expect(result.pdf.pixel[1]).toBeGreaterThanOrEqual(253);
  expect(result.pdf.pixel[2]).toBeLessThanOrEqual(2);
  expect(result.pdf.pixel[3]).toBe(255);
  expect(result.pdf.filename).toBe('Untitled.pdf');
  expect(result.jpegTransparentOption).toBe(false);
  expect(result.stateRestored).toBe(true);
  expect(result.viewportRestored).toBe(true);
  expect(result.dirtyUnchanged).toBe(true);
  expect(result.failedExport).toBe(false);
  expect(result.jpegUi).toEqual(expect.objectContaining({
    alphaDisabled: true,
    alphaChecked: false,
    matteVisible: 'flex',
    projectPromptVisible: true
  }));
  expect(result.jpegUi.previewLabel).toContain('JPEG · matte #00ff00');
  expect(result.jpegUi.impact).toContain('2 editable layers will be flattened');
  expect(result.jpegUi.impact).toContain('1 text object will no longer be editable');
  expect(result.jpegUi.impact).toContain('JPEG has no alpha channel');
  expect(result.jpegUi.impact).toContain('does not save the editable project');
  expect(result.pngMatteUi).toEqual({
    alphaDisabled: false,
    matteVisible: 'flex',
    previewLabel: 'PNG · matte #00ff00'
  });
  expect(pageErrors).toEqual([]);
});

test('encodes deterministic verified AVIF and reopens it @cross-browser', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const originalFetch = window.fetch;
    const fetched = [];
    window.fetch = (...args) => {
      fetched.push(String(args[0]));
      return originalFetch(...args);
    };
    const hash = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(value => value.toString(16).padStart(2, '0'))
      .join('');
    try {
      const rgba = new Uint8ClampedArray(4 * 4 * 4);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const offset = (y * 4 + x) * 4;
          rgba.set([x * 60, y * 70, (x + y) * 35, (x + y) % 2 ? 255 : 96], offset);
        }
      }
      const pixels = new ImageData(rgba, 4, 4);
      const lazyBefore = !OS._runtimeLoadedAssets.has('avifEncoderModule')
        && !OS._runtimeLoadedAssets.has('avifEncoderWasm')
        && !OS._runtimeLoadedAssets.has('avifDecoderModule')
        && !OS._runtimeLoadedAssets.has('avifDecoderWasm');
      const first = new Uint8Array(await OS._encodeAvifImageData(pixels, 0.73));
      const second = new Uint8Array(await OS._encodeAvifImageData(pixels, 0.73));
      const firstHash = await hash(first.buffer);
      const secondHash = await hash(second.buffer);
      const decoded = await OS._decodeAvif(first);
      const decodedAlpha = [...decoded.data].filter((value, index) => index % 4 === 3);
      const oversized = first.slice();
      const ispeOffset = oversized.findIndex((value, index) => value === 0x69
        && oversized[index + 1] === 0x73 && oversized[index + 2] === 0x70
        && oversized[index + 3] === 0x65);
      new DataView(oversized.buffer).setUint32(ispeOffset + 8, 30_001, false);
      let oversizedRejected = false;
      try { OS._readAvifDimensions(oversized); } catch (error) {
        oversizedRejected = /canvas ceiling|dimensions exceed import limits/i.test(error.message);
      }

      await OS._loadRasterFile(new File([first], 'verified-fixture.avif', { type:'image/avif' }));
      const imported = {
        name:OS._docName,
        width:OS.canvasW,
        height:OS.canvasH,
        objectType:OS.canvas.getObjects().find(object => object.type === 'image')?.type
      };

      let downloaded = null;
      const originalDownload = OS._downloadBlob;
      OS._downloadBlob = (blob, filename) => {
        downloaded = { blob, filename };
        return true;
      };
      const exported = await OS.saveFile('avif', { quality:0.73, transparent:true });
      OS._downloadBlob = originalDownload;
      const downloadedBytes = downloaded ? new Uint8Array(await downloaded.blob.arrayBuffer()) : null;

      OS.addLayer();
      const marker = new fabric.Rect({ left:0, top:0, width:1, height:1, fill:'#ffffff' });
      OS.canvas.add(marker);
      OS.layers[OS.activeLayerIdx].objects.push(marker);
      OS._enforceLayerInvariants();
      const overlay = OS.showExportSettings('avif');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await new Promise(resolve => setTimeout(resolve, 90));
      const ui = {
        active:overlay.querySelector('.export-format-row .btn.active')?.dataset.fmt,
        qualityVisible:overlay.querySelector('#es-quality-row').style.display,
        alphaHelp:overlay.querySelector('#es-alpha-help').textContent,
        preview:overlay.querySelector('#es-preview').getAttribute('aria-label'),
        impact:overlay.querySelector('#es-impact').textContent,
        menu:Boolean([...document.querySelectorAll('.dd-item')].find(item => item.textContent.trim() === 'AVIF')),
        command:OS._getCommands().some(command => command.label === 'Export AVIF')
      };
      overlay.remove();

      return {
        lazyBefore,
        fetched:[...new Set(fetched)].filter(url => url.includes('@jsquash/avif')),
        declared:[
          OS._runtimeAssets.avifEncoderModule,
          OS._runtimeAssets.avifEncoderWasm,
          OS._runtimeAssets.avifDecoderModule,
          OS._runtimeAssets.avifDecoderWasm
        ]
          .map(asset => ({ url:asset.url, integrity:asset.integrity })),
        deterministic:first.length === second.length
          && first.every((value, index) => value === second[index]),
        hash:firstHash,
        secondHash,
        brand:String.fromCharCode(...first.slice(4, 12)),
        decodedAlpha:{ min:Math.min(...decodedAlpha), max:Math.max(...decodedAlpha) },
        oversizedRejected,
        imported,
        exported,
        download:downloadedBytes && {
          filename:downloaded.filename,
          type:downloaded.blob.type,
          brand:String.fromCharCode(...downloadedBytes.slice(4, 12)),
          bytes:downloadedBytes.length
        },
        ui
      };
    } finally {
      window.fetch = originalFetch;
    }
  });

  expect(result.lazyBefore).toBe(true);
  expect(result.fetched).toEqual(result.declared.map(asset => asset.url));
  expect(result.declared.every(asset => asset.integrity.startsWith('sha384-'))).toBe(true);
  expect(result.deterministic).toBe(true);
  expect(result.secondHash).toBe(result.hash);
  expect(result.hash).toBe('c192cfec1279626c98a4fc6293be0309a4a77917429d1285b8dd8118322ad131');
  expect(result.brand).toBe('ftypavif');
  expect(result.decodedAlpha.min).toBeLessThan(200);
  expect(result.decodedAlpha.max).toBe(255);
  expect(result.oversizedRejected).toBe(true);
  expect(result.imported).toEqual({
    name: 'verified-fixture',
    width: 4,
    height: 4,
    objectType: 'image'
  });
  expect(result.exported).toBe(true);
  expect(result.download).toEqual(expect.objectContaining({
    filename: 'verified-fixture.avif',
    type: 'image/avif',
    brand: 'ftypavif'
  }));
  expect(result.download.bytes).toBeGreaterThan(100);
  expect(result.ui).toEqual(expect.objectContaining({
    active: 'avif',
    qualityVisible: 'flex',
    menu: true,
    command: true
  }));
  expect(result.ui.alphaHelp).toContain('AVIF');
  expect(result.ui.preview).toContain('AVIF · alpha preview');
  expect(result.ui.impact).toContain('will be flattened');
  expect(pageErrors).toEqual([]);
});

test('imports HEIC and JPEG XL through native-first verified decoder paths @cross-browser', async ({ page, request }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const jxlResponse = await request.get('https://chromium.googlesource.com/chromium/src/+/750db13c3097a50ee1c55dc3a006229239cea745/third_party/blink/web_tests/images/resources/jxl/3x3_srgb_lossless.jxl?format=TEXT');
  expect(jxlResponse.ok()).toBe(true);
  const jxlText = (await jxlResponse.text()).replace(/^\)\]\}'\n/, '').trim();
  const heicResponse = await request.get('https://raw.githubusercontent.com/nokiatech/heif_conformance/master/conformance_files/C002.heic');
  expect(heicResponse.ok()).toBe(true);
  const jxlBase64 = Buffer.from(jxlText, 'base64').toString('base64');
  const heicBase64 = (await heicResponse.body()).toString('base64');

  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async ({ jxlBase64: jxlSource, heicBase64: heicSource }) => {
    const decodeBase64 = value => {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      return bytes;
    };
    const originalFetch = window.fetch;
    const fetched = [];
    window.fetch = (...args) => {
      fetched.push(String(args[0]));
      return originalFetch(...args);
    };
    const nativeImageDecoder = window.ImageDecoder;
    const nativeCreateImageBitmap = window.createImageBitmap;
    try {
      OS._confirmDiscardUnsaved = async () => true;
      window.ImageDecoder = undefined;
      window.createImageBitmap = undefined;
      const load = async (format, name, type, source) => {
        await OS._loadPortableImageFile(new File([decodeBase64(source)], name, { type }), format, 'open', { historyMode:'open' });
        return {
          path:OS._lastPortableDecodePath,
          dimensions:[OS.canvasW, OS.canvasH],
          objectType:OS.canvas.getObjects().at(-1)?.type,
          loaded:[`${format}DecoderModule`, `${format}DecoderWasm`].map(asset => OS._runtimeLoadedAssets.has(asset))
        };
      };
      const jxl = await load('jxl', 'verified-fixture.jxl', 'image/jxl', jxlSource);
      const heic = await load('heic', 'verified-fixture.heic', 'image/heic', heicSource);
      const declared = [
        OS._runtimeAssets.jxlDecoderModule,
        OS._runtimeAssets.jxlDecoderWasm,
        OS._runtimeAssets.heicDecoderModule,
        OS._runtimeAssets.heicDecoderWasm
      ].map(asset => ({ url:asset.url, integrity:asset.integrity }));
      return {
        jxl,
        heic,
        declared,
        fetched:[...new Set(fetched)].filter(url => url.includes('@jsquash/jxl@1.3.0') || url.includes('@discourse/heic@1.0.0'))
      };
    } finally {
      window.fetch = originalFetch;
      window.ImageDecoder = nativeImageDecoder;
      window.createImageBitmap = nativeCreateImageBitmap;
    }
  }, { jxlBase64, heicBase64 });

  expect(result.jxl).toEqual({
    path:'wasm',
    dimensions:[3, 3],
    objectType:'image',
    loaded:[true, true]
  });
  expect(result.heic).toEqual({
    path:'wasm',
    dimensions:[1280, 720],
    objectType:'image',
    loaded:[true, true]
  });
  expect(result.fetched).toEqual(result.declared.map(asset => asset.url));
  expect(result.declared.every(asset => asset.integrity.startsWith('sha384-'))).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('round-trips OpenRaster layer order, geometry, opacity, visibility, and required files @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const png = (width, height, color) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, width, height);
      return OS._dataUrlToBytes(canvas.toDataURL('image/png'));
    };
    const bottomPng = png(42, 31, '#ff4050');
    const topPng = png(24, 18, '#4050ff');
    const stackXml = `<?xml version="1.0" encoding="UTF-8"?>
<image version="0.0.6" w="320" h="240">
  <stack>
    <layer name="Top" src="data/top.png" x="8" y="12" opacity="0.5" visibility="hidden" composite-op="svg:src-over" />
    <stack name="Imported Group" opacity="0.8">
      <layer name="Bottom" src="data/bottom.png" x="17" y="23" opacity="0.75" composite-op="svg:multiply" />
    </stack>
  </stack>
</image>`;
    const makeDeflatedZip = async specs => {
      const localParts = [];
      const centralParts = [];
      let offset = 0;
      const write16 = (view, position, value) => view.setUint16(position, value, true);
      const write32 = (view, position, value) => view.setUint32(position, value >>> 0, true);
      for (const spec of specs) {
        const source = spec.bytes;
        const method = spec.method || 0;
        const packed = method === 8
          ? new Uint8Array(await new Response(new ReadableStream({ start(controller) { controller.enqueue(source); controller.close(); } }).pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
          : source;
        const name = new TextEncoder().encode(spec.name);
        const checksum = OS._crc32(source);
        const local = new Uint8Array(30 + name.length + packed.length);
        const localView = new DataView(local.buffer);
        write32(localView, 0, 0x04034b50); write16(localView, 4, 20); write16(localView, 6, 0x0800);
        write16(localView, 8, method); write32(localView, 14, checksum); write32(localView, 18, packed.length); write32(localView, 22, source.length);
        write16(localView, 26, name.length); local.set(name, 30); local.set(packed, 30 + name.length);
        localParts.push(local);
        const central = new Uint8Array(46 + name.length);
        const centralView = new DataView(central.buffer);
        write32(centralView, 0, 0x02014b50); write16(centralView, 4, 20); write16(centralView, 6, 20); write16(centralView, 8, 0x0800);
        write16(centralView, 10, method); write32(centralView, 16, checksum); write32(centralView, 20, packed.length); write32(centralView, 24, source.length);
        write16(centralView, 28, name.length); write32(centralView, 42, offset); central.set(name, 46); centralParts.push(central);
        offset += local.length;
      }
      const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
      const end = new Uint8Array(22);
      const endView = new DataView(end.buffer);
      write32(endView, 0, 0x06054b50); write16(endView, 8, specs.length); write16(endView, 10, specs.length); write32(endView, 12, centralSize); write32(endView, 16, offset);
      return new Blob([...localParts, ...centralParts, end], { type:'application/zip' });
    };
    const archive = await makeDeflatedZip([
      { name:'mimetype', bytes:new TextEncoder().encode('image/openraster') },
      { name:'stack.xml', bytes:new TextEncoder().encode(stackXml), method:8 },
      { name:'data/top.png', bytes:topPng, method:8 },
      { name:'data/bottom.png', bytes:bottomPng, method:8 },
      { name:'mergedimage.png', bytes:bottomPng, method:8 },
      { name:'Thumbnails/thumbnail.png', bytes:png(64, 48, '#111111'), method:8 }
    ]);
    const archiveBytes = new Uint8Array(await archive.arrayBuffer());
    OS._confirmDiscardUnsaved = async () => true;
    const imported = await OS._loadORAFile(new File([archiveBytes], 'fixture.ora', { type:'image/openraster' }), { skipConfirm:true });
    const importedLayers = OS.layers.slice(1).map(layer => ({
      name:layer.name,
      left:layer.objects[0]?.left,
      top:layer.objects[0]?.top,
      opacity:layer.opacity,
      visible:layer.visible,
      blend:layer.blend
    }));
    const importReport = OS._lastORAImportReport;
    let downloaded = null;
    const exported = await OS.saveFile('ora', {
      deliver:(blob, filename) => { downloaded = { blob, filename }; return true; }
    });
    const exportedBytes = downloaded ? new Uint8Array(await downloaded.blob.arrayBuffer()) : null;
    const exportedEntries = exportedBytes ? await OS._readORAZipEntries(exportedBytes) : [];
    const exportedStack = new TextDecoder().decode(exportedEntries.find(entry => entry.name === 'stack.xml')?.bytes || new Uint8Array());
    const reimported = exportedBytes
      ? await OS._loadORAFile(new File([exportedBytes], 'roundtrip.ora', { type:'image/openraster' }), { skipConfirm:true })
      : false;
    const roundTripLayers = OS.layers.slice(1).map(layer => ({ name:layer.name, left:layer.objects[0]?.left, top:layer.objects[0]?.top }));
    return {
      imported,
      importedLayers,
      importWarnings:importReport?.warnings || [],
      exported,
      filename:downloaded?.filename,
      entries:exportedEntries.map(entry => ({ name:entry.name, method:entry.method, size:entry.bytes.byteLength })),
      exportedStack,
      reimported,
      roundTripLayers
    };
  });

  expect(result.imported).toBe(true);
  expect(result.importedLayers).toEqual([
    { name:'Bottom', left:17, top:23, opacity:60, visible:true, blend:'multiply' },
    { name:'Top', left:8, top:12, opacity:50, visible:false, blend:'source-over' }
  ]);
  expect(result.importWarnings.join(' ')).toMatch(/Imported Group.*flattened/);
  expect(result.exported).toBe(true);
  expect(result.filename).toBe('fixture.ora');
  expect(result.entries.map(entry => entry.name)).toEqual([
    'mimetype', 'stack.xml', 'data/layer0.png', 'data/layer1.png', 'mergedimage.png', 'Thumbnails/thumbnail.png'
  ]);
  expect(result.entries[0].method).toBe(0);
  expect(result.entries.every(entry => entry.size > 0)).toBe(true);
  expect(result.exportedStack.indexOf('name="Top"')).toBeLessThan(result.exportedStack.indexOf('name="Bottom"'));
  expect(result.reimported).toBe(true);
  expect(result.roundTripLayers).toEqual([
    { name:'Bottom', left:17, top:23 },
    { name:'Top', left:8, top:12 }
  ]);
});

test('mirrors tool, layer, selection, and actions for assistive tech', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  await page.locator('button[title="New Layer"]').click();

  const result = await page.evaluate(() => {
    OS.setTool('brush');
    OS._selectionBounds = { x: 3, y: 4, w: 12, h: 14 };
    OS._selectionMask = { w: 32, h: 32, mask: new Uint8Array(32 * 32) };
    OS._selectionMask.mask[0] = 1;
    OS._selectionMask.mask[1] = 1;
    OS.saveHistory('Accessibility Smoke');
    OS.toast('Accessibility status');
    return {
      summary: document.getElementById('canvas-a11y-summary').textContent,
      tool: document.getElementById('canvas-a11y-tool').textContent,
      layer: document.getElementById('canvas-a11y-layer').textContent,
      selection: document.getElementById('canvas-a11y-selection').textContent,
      live: document.getElementById('canvas-a11y-live').textContent,
      canvasLabel: document.getElementById('canvas-area').getAttribute('aria-label'),
      roleDescription: document.getElementById('canvas-area').getAttribute('aria-roledescription'),
      layerItems: document.querySelectorAll('#canvas-a11y-layers li').length
    };
  });

  expect(result.roleDescription).toBe('image editor canvas');
  expect(result.tool).toBe('Tool: Brush');
  expect(result.layer).toContain('Layer');
  expect(result.selection).toContain('2 pixels selected');
  expect(result.summary).toContain('Last action: Accessibility Smoke');
  expect(result.live).toBe('Accessibility status');
  expect(result.canvasLabel).toContain('Tool: Brush');
  expect(result.layerItems).toBeGreaterThan(0);
});

test('keeps onboarding actions reachable across supported narrow viewports', async ({ page }) => {
  const viewports = [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
    { width: 568, height: 320 },
    { width: 667, height: 375 },
    { width: 1024, height: 768 }
  ];

  await page.setViewportSize(viewports[0]);
  await openApp(page);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.locator('#welcome-overlay')).toBeVisible();
    await page.evaluate(() => {
      document.getElementById('welcome-overlay').scrollTop = 0;
      document.querySelector('.welcome-launch').scrollTop = 0;
    });

    const actions = page.locator('.welcome-actions button');
    await expect(actions).toHaveCount(4);
    for (let index = 0; index < await actions.count(); index++) {
      const action = actions.nth(index);
      await action.scrollIntoViewIfNeeded();
      const box = await action.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }

    const layout = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      welcomeOverflow: document.getElementById('welcome-overlay').scrollWidth >
        document.getElementById('welcome-overlay').clientWidth
    }));
    expect(layout).toEqual({ pageOverflow: false, welcomeOverflow: false });

    const toolbar = page.locator('#toolbar');
    await expect(toolbar).toBeVisible();
    const toolbarBox = await toolbar.boundingBox();
    expect(toolbarBox.x).toBeGreaterThanOrEqual(0);
    expect(toolbarBox.y).toBeGreaterThanOrEqual(0);
    expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(viewport.width);
    expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(viewport.height);
  }

  const enterStudio = page.getByRole('button', { name: 'Enter Studio' });
  await enterStudio.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#welcome-overlay')).toHaveClass(/hidden/);
});

test('keeps dialog actions visible and operable across narrow portrait and landscape layouts', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const viewports = [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
    { width: 568, height: 320 },
    { width: 667, height: 375 },
    { width: 1024, height: 768 }
  ];
  const dialogs = ['newImage', 'showPreferences', 'showExportSettings', 'showShortcuts', 'showRecoveryManager'];

  await page.setViewportSize(viewports[0]);
  await openApp(page);
  await page.evaluate(() => OS.dismissWelcome());
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    for (const dialog of dialogs) {
      await page.evaluate(async (name) => {
        const result = OS[name]();
        if (result?.then) await result;
      }, dialog);

      const overlay = page.locator('.modal-overlay').last();
      const modal = overlay.locator('.modal');
      await expect(modal).toBeVisible();
      await expect(overlay).toHaveClass(/show/);
      await page.waitForTimeout(25);
      const modalBox = await modal.boundingBox();
      expect(modalBox.x).toBeGreaterThanOrEqual(0);
      expect(modalBox.y).toBeGreaterThanOrEqual(0);
      expect(modalBox.x + modalBox.width).toBeLessThanOrEqual(viewport.width);
      expect(modalBox.y + modalBox.height).toBeLessThanOrEqual(viewport.height);

      const actions = modal.locator('.modal-btns button');
      expect(await actions.count()).toBeGreaterThan(0);
      for (let index = 0; index < await actions.count(); index++) {
        const action = actions.nth(index);
        const box = await action.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        expect(box.height).toBeGreaterThanOrEqual(43);
        expect(await action.evaluate((button) => parseFloat(getComputedStyle(button).minHeight))).toBeGreaterThanOrEqual(44);
      }

      if (dialog === 'showPreferences' && viewport.width === 320) {
        await modal.locator('#pref-grid').fill('24');
        await modal.locator('[data-modal-action]').focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.modal-overlay')).toHaveCount(0);
        expect(await page.evaluate(() => OS.gridSize)).toBe(24);
      } else if (dialog === 'showRecoveryManager' && viewport.width === 375) {
        await modal.getByRole('button', { name: 'Close' }).click();
        await expect(page.locator('.modal-overlay')).toHaveCount(0);
      } else {
        await page.keyboard.press('Escape');
        await expect(page.locator('.modal-overlay')).toHaveCount(0);
      }
    }
  }
});

test('keeps focus inside an open dialog when something behind it claims focus @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();
  // The welcome overlay only fades; it keeps its layout box for the length of
  // the transition, and the class change that dismisses it is what wakes the
  // observer that adopts dialogs. It must not be re-adopted on the way out.
  expect(await page.evaluate(() => ({
    active: OS._activeModal()?.id ?? null,
    stack: OS._modalStack.map(entry => entry.overlay.id)
  }))).toEqual({ active: null, stack: [] });
  await page.evaluate(() => OS.showPreferences());
  const overlay = page.locator('.modal-overlay').last();
  await expect(overlay.locator('.modal')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.modal-overlay'))))
    .toBe(true);

  // The platform restores focus behind a popover in a queued task, and the
  // menu bar re-focuses its own row the same way, so a dialog can lose focus
  // frames after it opened.
  const escaped = await page.evaluate(async () => {
    const root = document.querySelector('.menu-bar > .menu-item');
    root.focus();
    await new Promise(resolve => setTimeout(resolve, 0));
    const stolen = document.activeElement === root;
    return { stolen, containedTo: document.activeElement?.closest('.modal-overlay') ? 'dialog' : 'outside' };
  });
  expect(escaped.stolen).toBe(false);
  expect(escaped.containedTo).toBe('dialog');

  // ...and the next key still reaches the dialog rather than opening the menu
  // whose own auto popover would evict the dialog from the top layer.
  await overlay.locator('#pref-grid').fill('37');
  await overlay.locator('[data-modal-action]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => OS.gridSize)).toBe(37);
  expect(await page.locator('.menu-item.open').count()).toBe(0);
});

test('renders persisted UI data without activating markup', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const payload = '<img src=x onerror=alert(1)>';
    localStorage.setItem('openshop_recent', JSON.stringify([
      { name: payload, dims: '<svg onload=alert(2)>', date: '<script>alert(3)</script>' }
    ]));
    localStorage.setItem('os_palette', JSON.stringify(['#112233', 'javascript:alert(1)', '#AABBCC']));
    localStorage.setItem('os_presets', JSON.stringify([
      { name: payload, adjustments: { brightness: 20 }, custom: true }
    ]));
    OS.populateRecentFiles();
    OS.loadSavedPalette();
    OS.showPresets();
  });

  await expect(page.locator('#recent-files-area img')).toHaveCount(0);
  await expect(page.locator('#recent-files-area script')).toHaveCount(0);
  await expect(page.locator('#recent-files-area')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#palette-saved .palette-swatch')).toHaveCount(2);
  await expect(page.locator('.modal-overlay .modal img')).toHaveCount(0);
  await expect(page.locator('.modal-overlay .modal script')).toHaveCount(0);
  await expect(page.locator('.modal-overlay .modal')).toContainText('<img src=x onerror=alert(1)>');
});

test('keeps zoom cheap and coalesces inspector redraws after edits', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    // Make the navigator visible so the minimap actually renders.
    document.querySelector('[data-os-click="click-186"]').click();

    const calls = [];
    const originalToDataURL = OS.canvas.toDataURL.bind(OS.canvas);
    OS.canvas.toDataURL = (options = {}) => {
      calls.push({ multiplier: options.multiplier ?? 1, width: options.width });
      return originalToDataURL(options);
    };
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    // Zoom must not re-capture the composite at all.
    calls.length = 0;
    for (let i = 0; i < 12; i += 1) {
      OS.onMouseWheel({ e: { preventDefault() {}, deltaY: -40, offsetX: 100, offsetY: 100 } });
    }
    await frame();
    const capturesDuringZoom = calls.length;

    // A burst of edits collapses into a single coalesced capture.
    calls.length = 0;
    for (let i = 0; i < 8; i += 1) {
      OS.canvas.add(new fabric.Rect({ left: i * 4, top: 4, width: 6, height: 6, fill: '#3978ff' }));
      OS.saveHistory(`Draw rect ${i}`);
    }
    await frame();
    const capturesAfterEdits = calls.length;
    const thumbnailMultiplier = calls.length ? calls[0].multiplier : null;

    OS.canvas.toDataURL = originalToDataURL;
    return { capturesDuringZoom, capturesAfterEdits, thumbnailMultiplier };
  });

  expect(result.capturesDuringZoom).toBe(0);
  expect(result.capturesAfterEdits).toBe(1);
  // The minimap renders at thumbnail scale, not full document resolution.
  expect(result.thumbnailMultiplier).toBeLessThan(1);
});

test('applies every theme across the studio chrome and persists the choice', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const sample = () => page.evaluate(() => {
    const bg = (sel) => {
      const el = document.querySelector(sel);
      const style = getComputedStyle(el);
      return style.backgroundImage !== 'none' ? style.backgroundImage : style.backgroundColor;
    };
    return {
      topbar: bg('#topbar'),
      toolbar: bg('#toolbar'),
      canvasArea: getComputedStyle(document.querySelector('#canvas-area')).backgroundColor,
      statusbar: bg('#statusbar'),
      panel: bg('.panel-tabs')
    };
  });

  const seen = {};
  for (const theme of ['default', 'midnight', 'oled', 'light']) {
    await page.evaluate((t) => OS.setTheme(t, { silent: true, persist: false }), theme);
    await page.waitForTimeout(220);
    seen[theme] = await sample();
  }

  // Every chrome surface must actually change between themes.
  for (const [index, theme] of ['default', 'midnight', 'oled', 'light'].entries()) {
    for (const other of ['default', 'midnight', 'oled', 'light'].slice(index + 1)) {
      for (const surface of Object.keys(seen.default)) {
        expect(seen[theme][surface], `${theme}/${other}/${surface}`).not.toBe(seen[other][surface]);
      }
    }
  }
  // OLED drives the canvas well to near black.
  expect(seen.oled.canvasArea).toBe('rgb(3, 4, 5)');
  expect(seen.light.canvasArea).toBe('rgb(229, 233, 239)');

  // The choice survives a reload.
  await page.evaluate(() => OS.setTheme('oled'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(/theme-oled/);

  const systemTheme = await page.evaluate(() => {
    const originalMatchMedia = window.matchMedia;
    localStorage.removeItem('os_theme');
    OS._systemThemeMediaQuery = null;
    window.matchMedia = () => ({ matches:true, addEventListener() {} });
    OS._restoreTheme();
    const result = {
      light: document.documentElement.classList.contains('theme-light'),
      persisted: localStorage.getItem('os_theme')
    };
    window.matchMedia = originalMatchMedia;
    OS.setTheme('default', { silent:true, persist:false });
    return result;
  });
  expect(systemTheme.light).toBe(true);
  expect(systemTheme.persisted).toBeNull();
});

test('exposes onboarding and layer controls to the keyboard', async ({ page }) => {
  await openApp(page);

  // Template cards are reachable and operable without a mouse.
  const card = page.locator('#template-grid .template-card').first();
  await expect(card).toHaveJSProperty('tagName', 'BUTTON');
  await expect(card).toHaveAttribute('aria-label', /\d+ by \d+ pixels/);
  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#welcome-overlay')).toBeHidden();

  // Icon-only layer controls carry accessible names.
  const visibility = page.locator('#layers-list-visual .layer-vis').first();
  await expect(visibility).toHaveAttribute('aria-label', /(Hide|Show) layer/);
  const lock = page.locator('#layers-list-visual .layer-lock').first();
  await expect(lock).toHaveAttribute('aria-label', /(Lock|Unlock) layer/);

  // New Image size presets are buttons, not click-only divs.
  await page.evaluate(() => OS.newImage());
  const preset = page.locator('.modal-overlay .preset-btn').first();
  await expect(preset).toHaveJSProperty('tagName', 'BUTTON');
  await preset.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ni-w')).toHaveValue('1920');
});

test('refuses documents above the measured canvas ceiling before allocation @cross-browser @mobile', async ({ page }) => {
  await openApp(page);

  const result = await page.evaluate(async () => {
    const ceiling = OS.getCanvasCeiling();
    OS.newImage();
    const overlay = document.querySelector('.modal-overlay');
    const width = ceiling.maxDimension + 1;
    overlay.querySelector('#ni-w').value = String(width);
    overlay.querySelector('#ni-h').value = '1';
    const created = await OS.doNewImage(overlay);
    let importMessage = '';
    try { OS._validateDecodedImage({ width, height:1 }); }
    catch (error) { importMessage = error.message; }
    return {
      ceiling,
      created,
      blank:!OS._hasActiveDocument(),
      importMessage,
      toast:[...document.querySelectorAll('#toast-container .toast')].at(-1)?.textContent || ''
    };
  });

  expect(result.ceiling.measured).toBe(true);
  expect(result.created).toBe(false);
  expect(result.blank).toBe(true);
  expect(result.importMessage).toContain('measured browser canvas ceiling');
  expect(result.toast).toContain('measured browser canvas ceiling');
});

test('progressively enhances menus and dialogs with anchored native popovers @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();
  await expect(page.locator('#welcome-overlay')).toBeHidden();

  const support = await page.evaluate(() => ({
    popover: typeof HTMLElement.prototype.showPopover === 'function',
    anchors: CSS.supports('position-anchor: --os-anchor')
      && CSS.supports('position-area: block-end span-inline-end'),
    enhanced: OS._nativePopoverUI,
    className: document.documentElement.classList.contains('os-native-popovers')
  }));
  expect(support.enhanced).toBe(support.popover && support.anchors);
  expect(support.className).toBe(support.enhanced);

  const file = page.locator('.menu-bar > .menu-item').first();
  const dropdown = file.locator(':scope > .menu-dropdown');
  await file.click();
  await expect(dropdown).toBeVisible();

  if (support.enhanced) {
    const placement = await page.evaluate(() => {
      const owner = document.querySelector('.menu-bar > .menu-item');
      const popup = owner.querySelector(':scope > .menu-dropdown');
      const ownerBox = owner.getBoundingClientRect();
      const popupBox = popup.getBoundingClientRect();
      return {
        open: popup.matches(':popover-open'),
        anchorName: owner.style.getPropertyValue('anchor-name'),
        positionAnchor: popup.style.getPropertyValue('position-anchor'),
        belowOwner: popupBox.top >= ownerBox.bottom - 1,
        withinViewport: popupBox.left >= 0 && popupBox.right <= innerWidth
          && popupBox.top >= 0 && popupBox.bottom <= innerHeight
      };
    });
    expect(placement).toMatchObject({ open: true, belowOwner: true, withinViewport: true });
    expect(placement.anchorName).toBeTruthy();
    expect(placement.positionAnchor).toBe(placement.anchorName);
  } else {
    await expect(dropdown).not.toHaveAttribute('popover');
    await expect(file).toHaveClass(/open/);
  }

  await page.keyboard.press('Escape');
  await expect(dropdown).toBeHidden();
  await file.focus();
  await page.evaluate(() => OS.showShortcuts());
  const overlay = page.locator('.modal-overlay').last();
  await expect(overlay).toBeVisible();

  if (support.enhanced) {
    expect(await overlay.evaluate((element) => ({
      open: element.matches(':popover-open'),
      mode: element.getAttribute('popover'),
      legacyStacked: OS._modalStack.some((entry) => entry.overlay === element)
    }))).toEqual({ open: true, mode: 'auto', legacyStacked: false });
  } else {
    await expect(overlay).not.toHaveAttribute('popover');
  }

  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
  await expect(file).toBeFocused();

  if (support.enhanced) {
    await page.evaluate(() => {
      const area = document.querySelector('#canvas-area');
      const box = area.getBoundingClientRect();
      area.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: box.left + 80,
        clientY: box.top + 80
      }));
    });
    const contextMenu = page.locator('#context-menu');
    await expect(contextMenu).toBeVisible();
    expect(await contextMenu.evaluate((element) => ({
      open: element.matches(':popover-open'),
      anchored: element.style.getPropertyValue('position-anchor').startsWith('--os-anchor-')
    }))).toEqual({ open: true, anchored: true });
    await page.keyboard.press('Escape');
    await expect(contextMenu).toBeHidden();

    const tool = page.locator('.tool-group > .tool-btn').first();
    await tool.click();
    const flyout = page.locator('#flyout-host .tool-flyout:popover-open');
    await expect(flyout).toBeVisible();
    expect(await flyout.evaluate((element) =>
      element.style.getPropertyValue('position-anchor').startsWith('--os-anchor-'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(flyout).toBeHidden();
  }
});

test('retains the positioned menu and managed-dialog fallback without CSS anchors', async ({ page }) => {
  await page.addInitScript(() => {
    const supports = CSS.supports.bind(CSS);
    Object.defineProperty(CSS, 'supports', {
      configurable: true,
      value(query, value) {
        const feature = value === undefined ? String(query) : `${query}: ${value}`;
        if (feature.startsWith('position-anchor:') || feature.startsWith('position-area:')) return false;
        return value === undefined ? supports(query) : supports(query, value);
      }
    });
  });
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  expect(await page.evaluate(() => OS._nativePopoverUI)).toBe(false);
  await expect(page.locator('html')).not.toHaveClass(/os-native-popovers/);
  const file = page.locator('.menu-bar > .menu-item').first();
  const dropdown = file.locator(':scope > .menu-dropdown');
  await file.click();
  await expect(file).toHaveClass(/open/);
  await expect(dropdown).toBeVisible();
  await expect(dropdown).not.toHaveAttribute('popover');
  await page.keyboard.press('Escape');
  await expect(dropdown).toBeHidden();

  await file.focus();
  await page.evaluate(() => OS.showShortcuts());
  const overlay = page.locator('.modal-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).not.toHaveAttribute('popover');
  expect(await overlay.evaluate((element) =>
    OS._modalStack.some((entry) => entry.overlay === element))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
  await expect(file).toBeFocused();
});

test('matches tool shortcuts by physical key under a Cyrillic layout @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(() => {
    OS.setTool('select');
    const event = new KeyboardEvent('keydown', {
      key: 'с', code: 'KeyC', bubbles: true, cancelable: true
    });
    document.dispatchEvent(event);
    return { tool: OS.state.tool, defaultPrevented: event.defaultPrevented };
  });

  expect(result).toEqual({ tool: 'crop', defaultPrevented: true });
});

test('drives the whole menubar from the keyboard with clean accessible names @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const menubar = page.getByRole('menubar', { name: 'Main menu' });
  await expect(menubar).toBeVisible();

  // The submenu arrows and every nested row used to leak into the top-level
  // name, so "Filter" announced as "Filter ▸ ▸ ▸ ▸ ▸ ▸ ▸ ▸".
  const rootNames = await page.evaluate(() =>
    [...document.querySelectorAll('.menu-bar > .menu-item')].map(item => item.getAttribute('aria-label')));
  expect(rootNames).toEqual(['File', 'Edit', 'Select', 'Image', 'Filter', 'AI', 'View']);

  // Only the first root is in the tab order; the rest are reached with arrows.
  const tabindexes = await page.evaluate(() =>
    [...document.querySelectorAll('.menu-bar > .menu-item')].map(item => item.getAttribute('tabindex')));
  expect(tabindexes).toEqual(['0', '-1', '-1', '-1', '-1', '-1', '-1']);

  const focused = () => page.evaluate(() => ({
    label: document.activeElement?.getAttribute('aria-label'),
    role: document.activeElement?.getAttribute('role'),
    expanded: document.activeElement?.getAttribute('aria-expanded')
  }));

  // A stationary pointer must not keep File painted while the keyboard opens
  // another root. Home and End must stay within that keyboard-owned popup.
  const fileRoot = page.locator('.menu-bar > .menu-item').first();
  const fileBox = await fileRoot.boundingBox();
  await page.mouse.move(fileBox.x + fileBox.width / 2, fileBox.y + fileBox.height / 2);
  await expect(fileRoot.locator(':scope > .menu-dropdown')).toBeVisible();
  await fileRoot.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => [...document.querySelectorAll('.menu-bar > .menu-item')]
    .filter(root => root.querySelector(':scope > .menu-dropdown')?.getClientRects().length)
    .map(root => root.getAttribute('aria-label')))).toEqual(['Edit']);
  const editEnds = await page.evaluate(() => {
    const menu = document.querySelectorAll('.menu-bar > .menu-item')[1]
      .querySelector(':scope > .menu-dropdown');
    const rows = OS._menuEntries(menu);
    return [rows[0]?.getAttribute('aria-label'), rows.at(-1)?.getAttribute('aria-label')];
  });
  await page.keyboard.press('End');
  expect((await focused()).label).toBe(editEnds[1]);
  await page.keyboard.press('Home');
  expect((await focused()).label).toBe(editEnds[0]);
  await page.keyboard.press('Escape');

  // Reset modality before the independent traversal scenario below.
  await page.mouse.move(600, 500);
  await fileRoot.focus();
  await page.keyboard.press('ArrowRight');
  expect(await focused()).toMatchObject({ label: 'Edit', role: 'menuitem' });
  await page.keyboard.press('ArrowLeft');
  expect(await focused()).toMatchObject({ label: 'File' });

  // Down opens the menu and lands on its first row.
  await page.keyboard.press('ArrowDown');
  expect(await focused()).toMatchObject({ label: 'New', role: 'menuitem' });
  await expect(page.locator('.menu-bar > .menu-item').first()).toHaveAttribute('aria-expanded', 'true');

  // Arrow into the submenu, then back out of it.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await focused()).toMatchObject({ label: 'Export As', expanded: 'false' });
  await page.keyboard.press('ArrowRight');
  expect(await focused()).toMatchObject({ label: 'PNG' });
  await page.keyboard.press('ArrowLeft');
  expect(await focused()).toMatchObject({ label: 'Export As', expanded: 'false' });

  // Type-ahead inside an open menu.
  await page.keyboard.press('t');
  expect(await focused()).toMatchObject({ label: 'Templates...' });

  // Escape closes the menu and returns focus to its root.
  await page.keyboard.press('Escape');
  expect(await focused()).toMatchObject({ label: 'File', expanded: 'false' });
  await expect(page.locator('.menu-bar .menu-dropdown').first()).toBeHidden();

  // Enter on a leaf runs the command and collapses the tree.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await focused()).toMatchObject({ label: 'View' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  expect(await focused()).toMatchObject({ label: 'Keyboard Shortcuts...' });
  await page.keyboard.press('Enter');
  await expect(page.locator('.modal-overlay')).toBeVisible();
  expect(await page.evaluate(() => document.querySelectorAll('.menu-bar .open').length)).toBe(0);
  await page.getByRole('button', { name: 'Close' }).first().click();

  // The AI note was role="note" and aria-hidden at the same time.
  const note = page.locator('.dd-note').first();
  await expect(note).not.toHaveAttribute('aria-hidden', 'true');
  const shortcut = await page.evaluate(() =>
    document.querySelector('[data-os-click="click-027"]')?.getAttribute('aria-keyshortcuts'));
  expect(shortcut).toBe('Ctrl+A');
});

test('reflects document command state in menu rows and blocks disabled activation @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => OS.dismissWelcome());
  await expect(page.locator('html')).toHaveAttribute('data-os-document', 'blank');

  const file = page.locator('.menu-bar > .menu-item').first();
  await file.click();
  const initial = await page.evaluate(() => {
    const row = action => document.querySelector(`.menu-bar .dd-item[data-os-click="${action}"]`);
    return {
      newImage: row('click-001')?.getAttribute('aria-disabled'),
      openImage: row('click-002')?.getAttribute('aria-disabled'),
      exportPng: row('click-004')?.getAttribute('aria-disabled'),
      selectAll: row('click-027')?.getAttribute('aria-disabled'),
      aiDepth: row('click-096')?.getAttribute('aria-disabled'),
      preferences: row('click-026')?.getAttribute('aria-disabled'),
      exportCommand: row('click-004')?.getAttribute('data-os-command')
    };
  });
  expect(initial).toEqual({
    newImage: 'false',
    openImage: 'false',
    exportPng: 'true',
    selectAll: 'true',
    aiDepth: 'true',
    preferences: 'false',
    exportCommand: 'menu.click-004'
  });

  const exportMenu = file.locator(':scope > .menu-dropdown > .dd-sub').filter({ hasText: 'Export As' });
  await exportMenu.click();
  await expect(page.locator('[data-os-click="click-004"]')).toBeVisible();
  await page.evaluate(() => {
    window.__menuActivationCount = 0;
    OS.saveFile = () => { window.__menuActivationCount += 1; };
  });
  const exportPng = page.locator('[data-os-click="click-004"]');
  await exportPng.click({ force:true });
  expect(await page.evaluate(() => window.__menuActivationCount)).toBe(0);
  await expect(file.locator(':scope > .menu-dropdown')).toBeVisible();

  await exportPng.focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__menuActivationCount)).toBe(0);
  await expect(file.locator(':scope > .menu-dropdown')).toBeVisible();

  await file.locator('[data-os-click="click-001"]').click();
  await page.locator('[data-modal-create]').click();
  await expect(page.locator('html')).toHaveAttribute('data-os-document', 'open');

  await file.click();
  await expect.poll(() => page.evaluate(() => ({
    exportPng: document.querySelector('[data-os-click="click-004"]')?.getAttribute('aria-disabled'),
    selectAll: document.querySelector('[data-os-click="click-027"]')?.getAttribute('aria-disabled'),
    aiDepth: document.querySelector('[data-os-click="click-096"]')?.getAttribute('aria-disabled')
  }))).toEqual({ exportPng: 'false', selectAll: 'false', aiDepth: 'false' });
});

test('menus stay open while the pointer travels from the title into them @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();
  await expect(page.locator('#welcome-overlay')).toBeHidden();

  // The dropdown is offset below its title. Every previous menu test clicked,
  // which latches the menu open; hovering is what real users do, and the
  // pointer used to lose the menu while crossing the offset.
  const count = await page.locator('.menu-bar > .menu-item').count();
  expect(count).toBeGreaterThan(3);

  for (const index of [0, 4, count - 1]) {
    const item = page.locator('.menu-bar > .menu-item').nth(index);
    await page.mouse.move(600, 500);
    const title = await item.boundingBox();
    await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
    await expect
      .poll(() => page.evaluate(i => {
        const dd = document.querySelectorAll('.menu-bar > .menu-item')[i].querySelector('.menu-dropdown');
        return dd.getBoundingClientRect().height > 0;
      }, index))
      .toBe(true);

    // Straight down from the title, through the offset, into the menu — the
    // motion the bug report describes. Moving sideways along the menubar is a
    // different gesture and correctly opens the neighbouring menu.
    const column = title.x + title.width / 2;
    const entry = await page.evaluate(i => {
      const dd = document.querySelectorAll('.menu-bar > .menu-item')[i].querySelector('.menu-dropdown');
      return dd.getBoundingClientRect().top + 14;
    }, index);
    for (let y = title.y + title.height / 2; y <= entry; y += 2) {
      await page.mouse.move(column, y);
    }
    expect(await page.evaluate(i => {
      const dd = document.querySelectorAll('.menu-bar > .menu-item')[i].querySelector('.menu-dropdown');
      return dd.getBoundingClientRect().height > 0;
    }, index)).toBe(true);

    // And then across to a row, inside the menu.
    const target = await page.evaluate(i => {
      const dd = document.querySelectorAll('.menu-bar > .menu-item')[i].querySelector('.menu-dropdown');
      const r = dd.querySelector('.dd-item').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, index);
    await page.mouse.move(target.x, target.y);

    const state = await page.evaluate(i => {
      const dd = document.querySelectorAll('.menu-bar > .menu-item')[i].querySelector('.menu-dropdown');
      const row = dd.querySelector('.dd-item');
      const r = row.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { open: dd.getBoundingClientRect().height > 0, rowReachable: row.contains(top) };
    }, index);
    expect(state.open).toBe(true);
    expect(state.rowReachable).toBe(true);
  }

  // This test deliberately leaves the pointer resting inside a dropdown, which
  // :hover keeps painted. Park it away from the menubar so the next test does
  // not inherit an open menu.
  await page.mouse.move(600, 500);
});

test('Tab moves focus through the editor instead of toggling panels @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();
  // The welcome overlay fades for 400ms before it is removed from layout.
  await expect(page.locator('#welcome-overlay')).toBeHidden();

  // The panel toggle used to swallow every Tab, so focus never advanced and
  // the chrome blinked instead. Traversal is the default; the toggle only
  // applies while the canvas is the working surface.
  const seen = [];
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40);
    }));
  }
  const reached = seen.filter(Boolean);
  expect(reached.length).toBeGreaterThan(5);
  expect(new Set(reached).size).toBeGreaterThan(3);

  // The chrome stayed put the whole way through.
  const chrome = await page.evaluate(() => ['panels', 'toolbar', 'tool-options']
    .map(id => document.getElementById(id).style.display));
  expect(chrome.every(display => display !== 'none')).toBe(true);

  // Pressing Tab after working on the canvas still hides the panels.
  await page.locator('#canvas-area').click({ position: { x: 40, y: 40 } });
  await page.keyboard.press('Tab');
  const afterCanvas = await page.evaluate(() => document.getElementById('panels').style.display);
  expect(afterCanvas).toBe('none');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.getElementById('panels').style.display)).toBe('');
});

test('traps focus inside dialogs and returns it to whatever opened them @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Open New Image from the menubar so the trigger is a real focused control.
  await page.locator('.menu-bar > .menu-item').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const overlay = page.locator('.modal-overlay').last();
  await expect(overlay).toBeVisible();

  const named = await page.evaluate(() => {
    const dialog = document.querySelector('.modal-overlay:last-of-type [role="dialog"], .modal-overlay:last-of-type');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    return {
      modal: dialog.getAttribute('aria-modal'),
      role: dialog.getAttribute('role'),
      title: labelledBy ? document.getElementById(labelledBy)?.textContent : null,
      dialogCount: document.querySelectorAll('.modal-overlay [role="dialog"], .modal-overlay[role="dialog"]').length
    };
  });
  expect(named.role).toBe('dialog');
  expect(named.modal).toBe('true');
  expect(named.title).toBe('New Image');
  // One dialog node per overlay — not the overlay and its inner panel both.
  expect(named.dialogCount).toBe(1);

  // Focus is moved into the dialog rather than left behind it.
  await expect
    .poll(() => page.evaluate(() => document.querySelector('.modal-overlay')?.contains(document.activeElement)))
    .toBe(true);

  // Tab wraps at both ends instead of escaping into the editor behind.
  const focusables = await page.evaluate(() => {
    const o = document.querySelector('.modal-overlay');
    return [...o.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter(el => el.getClientRects().length).length;
  });
  expect(focusables).toBeGreaterThan(1);

  // A press from the middle of the list is the case the global shortcut
  // handler used to eat: it is neither end, so the trap did not intervene.
  await page.evaluate(() => {
    const o = document.querySelector('.modal-overlay');
    const list = [...o.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter(el => el.getClientRects().length);
    list[0].focus();
  });
  const midStart = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 60));
  await page.keyboard.press('Tab');
  const midEnd = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 60));
  expect(midEnd).not.toBe(midStart);
  expect(await page.evaluate(() => document.querySelector('.modal-overlay').contains(document.activeElement))).toBe(true);
  expect(await page.evaluate(() => document.getElementById('panels').style.display)).not.toBe('none');

  await page.evaluate(() => {
    const o = document.querySelector('.modal-overlay');
    const list = [...o.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter(el => el.getClientRects().length);
    list.at(-1).focus();
  });
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => {
    const o = document.querySelector('.modal-overlay');
    const list = [...o.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter(el => el.getClientRects().length);
    return document.activeElement === list[0];
  })).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => {
    const o = document.querySelector('.modal-overlay');
    const list = [...o.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')]
      .filter(el => el.getClientRects().length);
    return document.activeElement === list.at(-1);
  })).toBe(true);

  // Escape closes it and hands focus back to the menu that opened it.
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('File');
});

test('keeps a decision-only dialog on screen when Escape is pressed', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#welcome-overlay')).toBeVisible();

  // The recovery prompt has Restore/Copy/Discard but deliberately no cancel.
  await page.evaluate(() => OS._offerRecovery('{"version":1,"objects":[]}'));
  const recovery = page.locator('.modal-overlay.recovery-overlay');
  await expect(recovery).toBeVisible();
  await expect(recovery.locator('[data-modal-cancel],[data-modal-close]')).toHaveCount(0);

  await page.keyboard.press('Escape');
  // Escape used to fall through: the prompt stayed and the welcome screen behind
  // it was dismissed instead.
  await expect(recovery).toBeVisible();
  await expect(page.locator('#welcome-overlay')).toBeVisible();

  await recovery.getByRole('button', { name: 'Discard' }).click();
  await expect(recovery).toHaveCount(0);
});

test('resolves accent-derived chrome through the token scale in every theme', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const sampled = await page.evaluate(async () => {
    const read = () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'lasso-path');
      svg.appendChild(path);
      document.body.appendChild(svg);
      const guide = document.createElement('div');
      guide.className = 'guide-line horizontal';
      const smart = document.createElement('div');
      smart.className = 'smart-guide vertical';
      const checker = document.createElement('div');
      checker.className = 'layer-thumb-checker';
      const holder = document.createElement('div');
      holder.className = 'layer-item';
      holder.append(checker);
      document.body.append(guide, smart, holder);
      const primary = document.querySelector('.welcome-actions .btn-primary');
      const values = {
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        lassoFill: getComputedStyle(path).fill,
        primaryShadow: primary ? getComputedStyle(primary).boxShadow : null,
        guide: getComputedStyle(guide).backgroundColor,
        smartGuide: getComputedStyle(smart).backgroundColor,
        checkerBase: getComputedStyle(checker).backgroundColor,
        checkerSquares: getComputedStyle(checker).backgroundImage
      };
      svg.remove();
      guide.remove();
      smart.remove();
      holder.remove();
      return values;
    };
    const out = {};
    document.querySelector('.welcome-actions .btn-primary')?.style.setProperty('transition', 'none');
    for (const theme of ['default', 'midnight', 'oled', 'light']) {
      OS.setTheme(theme, { silent: true, persist: false });
      await new Promise(resolve => requestAnimationFrame(resolve));
      out[theme] = read();
    }
    // Free Transform handles are painted onto the canvas, so the CSS-variable
    // string this used to carry was simply an invalid fillStyle and the theme
    // never reached them.
    OS.setTheme('default', { silent: true, persist: false });
    const rect = new fabric.Rect({ width: 40, height: 40, left: 10, top: 10 });
    OS.canvas.add(rect);
    OS.canvas.setActiveObject(rect);
    OS.freeTransform();
    out.cornerColor = OS.canvas.getActiveObject().cornerColor;
    return out;
  });

  expect(sampled.cornerColor).toBe(sampled.default.accent);
  expect(sampled.cornerColor.startsWith('var(')).toBe(false);

  const themes = ['default', 'midnight', 'oled', 'light'];
  expect(new Set(themes.map(theme => sampled[theme].accent)).size).toBe(4);
  expect(new Set(themes.map(theme => sampled[theme].lassoFill)).size).toBe(4);
  expect(new Set(themes.map(theme => sampled[theme].primaryShadow)).size).toBe(4);
  // Checkerboards and guides used to sit outside the token scale entirely.
  for (const key of ['guide', 'smartGuide', 'checkerBase', 'checkerSquares']) {
    expect(new Set(themes.map(theme => sampled[theme][key])).size, key).toBe(4);
  }
  for (const theme of themes) {
    expect(sampled[theme].lassoFill).not.toContain('108, 140, 255');
    expect(sampled[theme].primaryShadow).not.toContain('108, 140, 255');
    expect(sampled[theme].checkerBase).not.toBe('rgb(102, 102, 102)');
    expect(sampled[theme].guide).not.toContain('108, 220, 255');
  }
});

test('keeps chrome color declarations on the theme token scale @cross-browser', async ({ page }) => {
  await openApp(page);

  const literals = await page.evaluate(() => {
    const violations = [];
    const tokenRule = selector => /^:root(?:\.theme-[\w-]+|:not\([^)]*\))?$/.test(selector.trim());
    const visit = rules => {
      for (const rule of rules) {
        if (rule.type === CSSRule.STYLE_RULE) {
          if (!tokenRule(rule.selectorText)) {
            for (let i = 0; i < rule.style.length; i++) {
              const property = rule.style[i];
              const value = rule.style.getPropertyValue(property);
              if (/#(?:[0-9a-f]{3,8})\b/i.test(value)) violations.push(`${rule.selectorText} ${property}: ${value}`);
            }
          }
        } else if (rule.cssRules) visit(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try { visit(sheet.cssRules); } catch (error) {}
    }
    return violations;
  });

  expect(literals).toEqual([]);
});

test('runs every migrated pixel filter off the main thread with unchanged math @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const outcome = await page.evaluate(async () => {
    const W = 8, H = 8;
    const source = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      source[i * 4] = (i * 7) % 256;
      source[i * 4 + 1] = (i * 13 + 40) % 256;
      source[i * 4 + 2] = (i * 29 + 90) % 256;
      source[i * 4 + 3] = 255;
    }
    const fresh = () => new ImageData(new Uint8ClampedArray(source), W, H);

    // Reference implementations transcribed from the pre-migration main-thread
    // code, so a porting mistake shows up as a pixel diff rather than silence.
    const clamp = v => Math.max(0, Math.min(255, v));
    const references = {
      solarize: d => { for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) if (d[i + c] > 128) d[i + c] = 255 - d[i + c]; },
      vibrance: d => {
        const amt = 0.5;
        for (let i = 0; i < d.length; i += 4) {
          const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
          const sat = max === 0 ? 0 : (max - min) / max;
          const boost = amt * (1 - sat) * (sat < 0.5 ? 1 : 0.5);
          const avg = (d[i] + d[i + 1] + d[i + 2]) / 3;
          for (let c = 0; c < 3; c++) d[i + c] = clamp(d[i + c] + (d[i + c] - avg) * boost);
        }
      },
      exposure: d => {
        const mult = Math.pow(2, 0.75), offset = 12, gamma = 1.4;
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) {
          let v = d[i + c] / 255;
          v = v * mult + offset / 255;
          v = Math.pow(Math.max(0, v), 1 / gamma);
          d[i + c] = clamp(Math.round(v * 255));
        }
      },
      shadowsHighlights: d => {
        const shAmt = 0.6, hlAmt = 0.35;
        for (let i = 0; i < d.length; i += 4) {
          const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
          for (let c = 0; c < 3; c++) {
            let v = d[i + c];
            if (l < 0.5) { const w = 1 - l * 2; v += (255 - v) * shAmt * w * 0.5; }
            if (l > 0.5) { const w = (l - 0.5) * 2; v -= v * hlAmt * w * 0.5; }
            d[i + c] = clamp(Math.round(v));
          }
        }
      },
      photoFilter: d => {
        const color = [236, 138, 0], density = 0.3;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = Math.min(255, d[i] + (color[0] - d[i]) * density);
          d[i + 1] = Math.min(255, d[i + 1] + (color[1] - d[i + 1]) * density);
          d[i + 2] = Math.min(255, d[i + 2] + (color[2] - d[i + 2]) * density);
        }
      },
      channelMixer: d => {
        const m = [1.1, -0.1, 0.05, 0.2, 0.9, -0.05, -0.15, 0.25, 1.0];
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          d[i] = clamp(Math.round(r * m[0] + g * m[1] + b * m[2]));
          d[i + 1] = clamp(Math.round(r * m[3] + g * m[4] + b * m[5]));
          d[i + 2] = clamp(Math.round(r * m[6] + g * m[7] + b * m[8]));
        }
      },
      autoLevels: d => {
        let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] < rMin) rMin = d[i]; if (d[i] > rMax) rMax = d[i];
          if (d[i + 1] < gMin) gMin = d[i + 1]; if (d[i + 1] > gMax) gMax = d[i + 1];
          if (d[i + 2] < bMin) bMin = d[i + 2]; if (d[i + 2] > bMax) bMax = d[i + 2];
        }
        const stretch = (v, mn, mx) => mx === mn ? v : Math.round((v - mn) / (mx - mn) * 255);
        for (let i = 0; i < d.length; i += 4) {
          d[i] = stretch(d[i], rMin, rMax); d[i + 1] = stretch(d[i + 1], gMin, gMax); d[i + 2] = stretch(d[i + 2], bMin, bMax);
        }
      },
      autoContrast: d => {
        let lMin = 255, lMax = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
          if (l < lMin) lMin = l; if (l > lMax) lMax = l;
        }
        const range = lMax - lMin || 1;
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = clamp(Math.round((d[i + c] - lMin) / range * 255));
      },
      autoEnhance: d => {
        references.autoLevels(d);
        for (let i = 0; i < d.length; i += 4) {
          const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
          for (let c = 0; c < 3; c++) d[i + c] = clamp(Math.round(d[i + c] + (d[i + c] - l) * 0.15));
          for (let c = 0; c < 3; c++) d[i + c] = clamp(Math.round((d[i + c] - 128) * 1.08 + 128));
        }
        const src = new Uint8ClampedArray(d);
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i = (y * W + x) * 4;
          for (let c = 0; c < 3; c++) {
            const s = src[i + c] * 5 - src[((y - 1) * W + x) * 4 + c] - src[((y + 1) * W + x) * 4 + c] - src[(y * W + x - 1) * 4 + c] - src[(y * W + x + 1) * 4 + c];
            d[i + c] = clamp(Math.round(d[i + c] * 0.7 + s * 0.3));
          }
        }
      },
      curves: d => {
        const lut = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) lut[i] = clamp(Math.round(255 * Math.pow(i / 255, 0.8)));
        for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = lut[lut[d[i + c]]];
      }
    };
    const curveLut = [];
    for (let i = 0; i < 256; i++) curveLut.push(clamp(Math.round(255 * Math.pow(i / 255, 0.8))));
    const params = {
      solarize: {},
      vibrance: { amount: 0.5 },
      exposure: { ev: 0.75, offset: 12, gamma: 1.4 },
      shadowsHighlights: { shadows: 0.6, highlights: 0.35 },
      photoFilter: { color: [236, 138, 0], density: 0.3 },
      channelMixer: { matrix: [1.1, -0.1, 0.05, 0.2, 0.9, -0.05, -0.15, 0.25, 1.0] },
      autoLevels: {}, autoContrast: {}, autoEnhance: {},
      curves: { master: curveLut, r: curveLut, g: curveLut, b: curveLut }
    };

    const mismatches = [];
    for (const op of Object.keys(references)) {
      const produced = await OS._runFilterInWorker(op, fresh(), W, H, params[op]);
      const expected = new Uint8ClampedArray(source);
      references[op](expected);
      if (!produced) { mismatches.push(op + ': no result'); continue; }
      for (let i = 0; i < expected.length; i++) {
        if (produced.data[i] !== expected[i]) {
          mismatches.push(op + '@' + i + ': ' + produced.data[i] + ' != ' + expected[i]);
          break;
        }
      }
    }
    return { mismatches, ops: Object.keys(references).length };
  });

  expect(outcome.mismatches).toEqual([]);
  expect(outcome.ops).toBe(10);
});

test('applies an auto adjustment through the async worker path and records history', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const oc = document.createElement('canvas');
    oc.width = 16; oc.height = 16;
    const ctx = oc.getContext('2d');
    // A deliberately low-contrast source so Auto Levels has something to do.
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      ctx.fillStyle = 'rgb(' + (100 + x) + ',' + (105 + y) + ',110)';
      ctx.fillRect(x, y, 1, 1);
    }
    const image = await new Promise(resolve => {
      const el = new Image();
      el.onload = () => resolve(new fabric.Image(el, { left: 0, top: 0 }));
      el.src = oc.toDataURL();
    });
    OS.canvas.add(image);
    OS.layers[OS.activeLayerIdx].objects.push(image);
    OS.canvas.setActiveObject(image);
    const before = OS.history.length;

    await OS.autoLevels();
    await new Promise(resolve => setTimeout(resolve, 500));

    const active = OS.canvas.getActiveObject();
    const el = active.getElement();
    const probe = document.createElement('canvas');
    probe.width = el.naturalWidth || el.width;
    probe.height = el.naturalHeight || el.height;
    probe.getContext('2d').drawImage(el, 0, 0);
    const pixels = probe.getContext('2d').getImageData(0, 0, probe.width, probe.height).data;
    let min = 255, max = 0;
    for (let i = 0; i < pixels.length; i += 4) { if (pixels[i] < min) min = pixels[i]; if (pixels[i] > max) max = pixels[i]; }
    return { min, max, historyGrew: OS.history.length > before };
  });

  // Auto Levels stretches each channel to the full range.
  expect(result.min).toBe(0);
  expect(result.max).toBe(255);
  expect(result.historyGrew).toBe(true);
});

test('lets a second AI request take over from the model load it cancels', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const toasts = [];
    const realToast = OS.toast.bind(OS);
    OS.toast = (msg, type) => { toasts.push(String(msg)); return realToast(msg, type); };

    // Stand in for the network: the first load never settles until released.
    let releaseFirst;
    let loads = 0;
    OS._loadTransformers = async () => {
      loads++;
      if (loads === 1) await new Promise(resolve => { releaseFirst = resolve; });
      return {
        pipeline: async () => ({ tag: 'pipe-' + loads })
      };
    };

    const first = OS._loadPipeline('image-segmentation', 'test/model-a', 'A');
    await new Promise(resolve => setTimeout(resolve, 20));
    const busyWhileLoading = OS._aiModelLoadBusy();

    // Starting a second operation cancels the first; the mutex must go with it.
    const second = await OS._loadPipeline('image-segmentation', 'test/model-b', 'B');
    releaseFirst?.();
    const firstResult = await first.catch(error => ({ aborted: error?.name }));

    OS.toast = realToast;
    return {
      busyWhileLoading,
      second,
      firstAborted: firstResult && firstResult.aborted ? firstResult.aborted : firstResult,
      blockedMessage: toasts.some(msg => msg.includes('Another AI model is loading')),
      mutexReleased: OS._aiModelLoadBusy()
    };
  });

  expect(result.busyWhileLoading).toBe(true);
  // The replacement request succeeds instead of both dying.
  expect(result.second).toEqual({ tag: 'pipe-2' });
  expect(result.blockedMessage).toBe(false);
  expect(result.mutexReleased).toBe(false);
});

test('deletes the selected pixels at any zoom or pan, not the ones under the old viewport @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    OS.zoom = 1;

    // A 200x200 opaque layer sitting at the document origin.
    const oc = document.createElement('canvas');
    oc.width = 200; oc.height = 200;
    const ctx = oc.getContext('2d');
    ctx.fillStyle = 'rgb(200,60,60)';
    ctx.fillRect(0, 0, 200, 200);
    const image = await new Promise(resolve => {
      const el = new Image();
      el.onload = () => resolve(new fabric.Image(el, { left: 0, top: 0, originX: 'left', originY: 'top' }));
      el.src = oc.toDataURL();
    });
    OS.canvas.add(image);
    OS.layers[OS.activeLayerIdx].objects.push(image);
    OS.canvas.setActiveObject(image);

    // Select a known document-space square: 20,20 to 59,59.
    const dw = Math.round(OS.canvasW), dh = Math.round(OS.canvasH);
    const mask = new Uint8Array(dw * dh);
    for (let y = 20; y < 60; y++) for (let x = 20; x < 60; x++) mask[y * dw + x] = 1;
    OS._setPixelSelectionMask(mask, dw, dh);
    const bounds = { ...OS._selectionBounds };

    // Zoom out and pan *after* selecting — this is what used to relocate the
    // deletion to a different part of the image and punch it full of holes.
    OS.canvas.setViewportTransform([0.5, 0, 0, 0.5, 137, 91]);
    OS.canvas.renderAll();

    OS._deleteSelectionPixels();
    await new Promise(resolve => setTimeout(resolve, 600));

    const active = OS.canvas.getObjects().find(o => o.type === 'image' && !o._wandOverlay);
    const el = active.getElement();
    const probe = document.createElement('canvas');
    probe.width = el.naturalWidth || el.width;
    probe.height = el.naturalHeight || el.height;
    probe.getContext('2d').drawImage(el, 0, 0);
    const data = probe.getContext('2d').getImageData(0, 0, probe.width, probe.height).data;
    const alphaAt = (x, y) => data[(y * probe.width + x) * 4 + 3];

    let clearedInside = 0, holesInside = 0, clearedOutside = 0;
    for (let y = 0; y < probe.height; y++) {
      for (let x = 0; x < probe.width; x++) {
        const inside = x >= 20 && x < 60 && y >= 20 && y < 60;
        if (inside) { if (alphaAt(x, y) === 0) clearedInside++; else holesInside++; }
        else if (alphaAt(x, y) === 0) clearedOutside++;
      }
    }
    return { bounds, clearedInside, holesInside, clearedOutside, size: probe.width };
  });

  expect(result.size).toBe(200);
  expect(result.bounds).toEqual({ x: 20, y: 20, w: 40, h: 40 });
  // The whole selected square is gone — no sparse checkerboard of survivors.
  expect(result.clearedInside).toBe(40 * 40);
  expect(result.holesInside).toBe(0);
  // And nothing outside it was touched.
  expect(result.clearedOutside).toBe(0);
});

test('keeps the marching-ants box over the selection when the viewport moves', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const box = await page.evaluate(async () => {
    OS.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const dw = Math.round(OS.canvasW), dh = Math.round(OS.canvasH);
    const mask = new Uint8Array(dw * dh);
    for (let y = 10; y < 50; y++) for (let x = 30; x < 90; x++) mask[y * dw + x] = 1;
    OS._setPixelSelectionMask(mask, dw, dh);
    const read = () => {
      const el = document.getElementById('selection-overlay');
      return { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
    };
    const atIdentity = read();
    OS.canvas.setViewportTransform([2, 0, 0, 2, 25, 40]);
    OS.canvas.renderAll();
    await new Promise(resolve => requestAnimationFrame(resolve));
    return { atIdentity, zoomed: read() };
  });

  expect(box.atIdentity).toEqual({ left: '30px', top: '10px', width: '60px', height: '40px' });
  // 2x zoom with a (25,40) pan: 30*2+25, 10*2+40, 60*2, 40*2.
  expect(box.zoomed).toEqual({ left: '85px', top: '60px', width: '120px', height: '80px' });
});

test('rescales a pre-document-space selection mask from an older project', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(() => {
    // Projects saved before masks were document-space stored them at the
    // canvas element's size under a viewport transform that was never recorded.
    const legacy = { w: 8, h: 8, mask: new Uint8Array(64) };
    [9, 10, 17, 18].forEach(index => { legacy.mask[index] = 1; });

    const converted = OS._toDocumentSpaceMask(legacy);
    const dw = Math.round(OS.canvasW), dh = Math.round(OS.canvasH);
    let selected = 0;
    for (let i = 0; i < converted.mask.length; i++) if (converted.mask[i]) selected++;

    // The four set cells occupy the 1..2 block of an 8x8 grid, so a quarter of
    // the way across and down the document must land inside the region.
    const insideX = Math.floor(dw * 1.5 / 8), insideY = Math.floor(dh * 1.5 / 8);
    const outsideX = Math.floor(dw * 6.5 / 8), outsideY = Math.floor(dh * 6.5 / 8);

    // A mask already at document size is returned untouched, not re-scaled.
    const native = { w: dw, h: dh, mask: new Uint8Array(dw * dh) };
    return {
      dims: [converted.w, converted.h],
      docDims: [dw, dh],
      fraction: selected / (dw * dh),
      inside: converted.mask[insideY * dw + insideX] === 1,
      outside: converted.mask[outsideY * dw + outsideX] === 1,
      nativeUntouched: OS._toDocumentSpaceMask(native) === native,
      nullSafe: OS._toDocumentSpaceMask(null)
    };
  });

  expect(result.dims).toEqual(result.docDims);
  // 4 of 64 source cells stay 1/16 of the document after scaling.
  expect(result.fraction).toBeCloseTo(4 / 64, 2);
  expect(result.inside).toBe(true);
  expect(result.outside).toBe(false);
  expect(result.nativeUntouched).toBe(true);
  expect(result.nullSafe).toBe(null);
});

test('translates toasts and command labels, and counts them as coverage @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // The inventory includes DOM labels, command-palette labels, static toast/_t
  // literals from the single-file source, and messages seen at runtime.
  const result = await page.evaluate(() => {
    const domOnly = [...document.querySelectorAll('[data-i18n],[data-i18n-tip]')].length;
    const keys = OS.i18nKeys();
    const commandLabels = OS._getCommands().map(c => c.label);
    const covered = commandLabels.filter(label => keys.includes(label)).length;

    // A dictionary entry now reaches a toast without touching its call site.
    OS._locales.pseudo = undefined;
    OS._locales.zh['Project saved'] = 'ZH-SAVED';
    OS.setLocale('zh');
    document.getElementById('toast-container').replaceChildren();
    OS.toast('Project saved', 'success');
    const toastText = document.getElementById('toast-container').lastElementChild.textContent;

    // An interpolated message with no entry falls back to itself.
    OS.toast('Created 12 x 34 canvas', 'info');
    const passthrough = document.getElementById('toast-container').lastElementChild.textContent;
    const runtimeKeys = OS.i18nKeys();

    OS.setLocale('en');
    return {
      domOnly,
      keyCount: keys.length,
      commandCount: commandLabels.length,
      covered,
      toastText,
      passthrough,
      sourceToastKeys:['Filters cleared', 'Undo', 'Diagnostics cleared'].map(key => runtimeKeys.includes(key)),
      missingStaticToast:OS.missingLocaleKeys('zh').includes('Diagnostics cleared')
    };
  });

  // The inventory is now larger than the DOM-stamped subset.
  expect(result.commandCount).toBeGreaterThan(100);
  expect(result.covered).toBe(result.commandCount);
  expect(result.keyCount).toBeGreaterThan(result.domOnly);
  expect(result.keyCount).toBeGreaterThan(250);
  expect(result.sourceToastKeys).toEqual([true, true, true]);
  expect(result.missingStaticToast).toBe(true);
  // Toasts translate, and untranslated ones read exactly as before.
  expect(result.toastText).toBe('ZH-SAVED');
  expect(result.passthrough).toBe('Created 12 x 34 canvas');
});

test('collects diagnostics a bug report can attach @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Failures reached the user as a toast and the developer as nothing, so
  // every issue filed so far is prose and a screenshot.
  const result = await page.evaluate(() => {
    OS.createNewDocument(120, 90, '#ffffff');
    OS.clearDiagnostics();

    OS.toast('something went wrong', 'error');
    OS.toast('a warning', 'warning');
    OS.toast('just information', 'info');
    OS.recordDiagnostic('job', 'filter cancelled', { op: 'blur', pixels: 400, nested: { deep: true } });

    const report = OS.buildDiagnosticsReport();
    const badge = document.getElementById('diagnostics-badge');
    const serialised = JSON.stringify(report);

    return {
      kinds: report.events.map(e => e.kind),
      errorCount: report.errorCount,
      badgeText: badge.textContent,
      badgeShown: badge.style.display !== 'none',
      hasVersion: report.version === OS.version,
      docLayers: report.document.layers,
      capabilityKeys: Object.keys(report.capabilities).length,
      // Only scalars survive; nested objects are dropped.
      jobDetail: report.events.find(e => e.kind === 'job')?.detail,
      // A report must not carry what the user was working on.
      leaksDocName: serialised.includes(OS._docName || 'nope'),
      afterClear: (() => { OS.clearDiagnostics(); return OS.buildDiagnosticsReport().events.length; })()
    };
  });

  // Errors and warnings are recorded; plain information is not.
  expect(result.kinds).toEqual(['error', 'warning', 'job']);
  expect(result.errorCount).toBe(1);
  expect(result.badgeShown).toBe(true);
  expect(result.badgeText).toBe('1 error');
  expect(result.hasVersion).toBe(true);
  expect(result.docLayers).toBeGreaterThan(0);
  expect(result.capabilityKeys).toBeGreaterThan(4);
  expect(result.jobDetail).toEqual({ op: 'blur', pixels: 400 });
  expect(result.leaksDocName).toBe(false);
  expect(result.afterClear).toBe(0);
});

test('honours EXIF orientation on import @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Phone and camera JPEGs carry rotation in EXIF rather than in the pixels,
  // and nothing read it — so those photos imported sideways.
  const result = await page.evaluate(async () => {
    // Build a JPEG carrying an APP1/EXIF block with a given orientation.
    const withOrientation = (orientation) => {
      const tiff = [];
      const u16 = v => [v >> 8 & 255, v & 255];
      tiff.push(0x4D, 0x4D, 0x00, 0x2A, 0, 0, 0, 8);      // big-endian, IFD0 at 8
      tiff.push(...u16(1));                                // one entry
      tiff.push(...u16(0x0112), ...u16(3), 0, 0, 0, 1, ...u16(orientation), 0, 0);
      tiff.push(0, 0, 0, 0);                               // no next IFD
      const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
      const size = app1.length + 2;
      return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, size >> 8 & 255, size & 255, ...app1, 0xFF, 0xDA]).buffer;
    };

    const parsed = [1, 3, 6, 8].map(o => OS._readExif(withOrientation(o))?.orientation);
    const neutralized = [3, 6, 8].map(o => {
      const source = withOrientation(o);
      return OS._readExif(OS._neutralizeExifOrientation(source).buffer)?.orientation;
    });

    // A 4x2 source: after a 90-degree rotation it must measure 2x4.
    const src = document.createElement('canvas');
    src.width = 4; src.height = 2;
    const sctx = src.getContext('2d');
    sctx.fillStyle = '#ff0000'; sctx.fillRect(0, 0, 4, 2);
    sctx.fillStyle = '#0000ff'; sctx.fillRect(0, 0, 1, 1);

    const rotated = OS._applyExifOrientation(src, 6);
    const rctx = rotated.getContext('2d');
    const topRight = [...rctx.getImageData(rotated.width - 1, 0, 1, 1).data].slice(0, 3);
    const unchanged = OS._applyExifOrientation(src, 1);

    return {
      parsed,
      neutralized,
      rotatedSize: [rotated.width, rotated.height],
      topRight,
      unchanged,
      noExif: OS._readExif(new Uint8Array([1, 2, 3, 4]).buffer)
    };
  });

  expect(result.parsed).toEqual([1, 3, 6, 8]);
  expect(result.neutralized).toEqual([1, 1, 1]);
  // 4x2 rotated a quarter turn is 2x4.
  expect(result.rotatedSize).toEqual([2, 4]);
  // The blue corner moves from top-left to top-right under orientation 6.
  expect(result.topRight).toEqual([0, 0, 255]);
  // Orientation 1 needs no work, and a non-JPEG parses to nothing.
  expect(result.unchanged).toBeNull();
  expect(result.noExif).toBeNull();
});

test('imports an EXIF-bearing JPEG fixture upright', async ({ page }) => {
  const payload = (await readFile(fixturePath('exif-orientation-6.jpg'))).toString('base64');
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const file = new File([bytes], 'exif-orientation-6.jpg', { type: 'image/jpeg' });
    const parsed = OS._readExif(bytes.buffer);
    await OS._loadRasterFile(file);
    const image = OS.layers.flatMap(layer => layer.objects).find(object => object.type === 'image');
    return {
      parsedOrientation: parsed?.orientation,
      importedOrientation: OS._lastImportExif?.orientation,
      dimensions: [OS.canvasW, OS.canvasH],
      imageDimensions: [image?.width, image?.height]
    };
  }, payload);

  expect(result).toEqual({
    parsedOrientation: 6,
    importedOrientation: 6,
    dimensions: [1800, 1200],
    imageDimensions: [1800, 1200]
  });
});

test('imports every frame from a real animated GIF fixture without ImageDecoder @cross-browser', async ({ page }) => {
  const payload = (await readFile(fixturePath('animated-multiframe.gif'))).toString('base64');
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async base64 => {
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const originalDecoder = window.ImageDecoder;
    Object.defineProperty(window, 'ImageDecoder', { configurable: true, value: undefined });
    const decodedWithoutImageDecoder = typeof window.ImageDecoder === 'undefined';
    const codec = await OS._loadGifCodec();
    const metadata = codec.decode(bytes.buffer);
    await OS._importGifFrames(new File([bytes], 'animated-multiframe.gif', { type: 'image/gif' }));
    const frames = [];
    for (let index = 0; index < OS._animFrames.length; index += 1) {
      const dataUrl = OS._animFrames[index];
      const image = await new Promise((resolve, reject) => {
        const candidate = new Image();
        candidate.onload = () => resolve(candidate);
        candidate.onerror = reject;
        candidate.src = dataUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (const value of pixels) {
        hash ^= value;
        hash = Math.imul(hash, 16777619);
      }
      frames.push({
        index,
        width: image.naturalWidth,
        height: image.naturalHeight,
        bytes: Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4),
        hash: hash >>> 0,
        delay: metadata.frames[index].delay
      });
    }
    if (originalDecoder) Object.defineProperty(window, 'ImageDecoder', { configurable: true, value: originalDecoder });
    return {
      frames,
      uniqueFrames: new Set(OS._animFrames).size,
      activeIndex: OS._animIdx,
      timelineItems: document.getElementById('timeline-frames').children.length,
      decodedWithoutImageDecoder
    };
  }, payload);

  expect(result.frames.map(frame => frame.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(result.frames.map(frame => [frame.width, frame.height])).toEqual(Array(11).fill([640, 300]));
  expect(result.frames.map(frame => frame.delay)).toEqual([90, 90, 90, 90, 90, 100, 90, 90, 90, 90, 90]);
  expect(result.frames.map(frame => frame.hash)).toEqual([
    910180162, 711788703, 180253782, 4018033855, 185040418, 3941068463,
    262979675, 679044684, 1372786581, 3153160446, 3153160446
  ]);
  expect(result.frames.every(frame => frame.bytes > 100)).toBe(true);
  expect(result.uniqueFrames).toBeGreaterThan(1);
  expect(result.activeIndex).toBe(0);
  expect(result.timelineItems).toBe(11);
  expect(result.decodedWithoutImageDecoder).toBe(true);
});

test('routes animated image intents consistently and preserves placed timing metadata @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'animated.gif', { type:'image/gif' });
    const routes = [];
    const originalGif = OS._importGifFrames;
    const originalDecoder = OS._importImageDecoderFrames;
    OS._importGifFrames = async (candidate, intent) => { routes.push(['gif', intent, candidate.name]); return true; };
    OS._importImageDecoderFrames = async (candidate, intent) => { routes.push(['decoder', intent, candidate.name]); return true; };
    OS._documentId = 'route-document';
    OS._blankWorkspace = false;
    await OS._handleFileLoad(file, 'open');
    await OS._handleFileLoad(file, 'place');
    await OS._handleFileLoad(file, 'paste');
    await OS._handleFileLoad(file, 'drop');
    OS._blankWorkspace = true;
    await OS._handleFileLoad(file, 'drop');
    OS._importGifFrames = originalGif;
    OS._importImageDecoderFrames = originalDecoder;

    const frame = color => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, 2, 1);
      return canvas.toDataURL('image/png');
    };
    const frames = [frame('#d33'), frame('#3a6'), frame('#28e')];
    const delays = [90, 140, 260];
    const animated = new File([new Uint8Array([1])], 'timed.gif', { type:'image/gif' });
    OS._confirmDiscardUnsaved = async () => true;
    OS._blankWorkspace = false;
    OS.createNewDocument(32, 16, { clean:true });
    const opened = await OS._installAnimationFrames(frames, delays, animated, 'GIF', { intent:'open' });
    const openedState = { frames:OS._animFrames.length, delays:OS._animDelays.slice() };

    OS.createNewDocument(32, 16, { clean:true });
    const placed = await OS._installAnimationFrames(frames, delays, animated, 'GIF', { intent:'place' });
    const placedObject = OS.canvas.getActiveObject();
    const placedAnimation = placedObject?._openShopAnimation;
    const placedProject = OS._captureDocumentState();
    const placedSerialized = placedProject.canvas.fabric.objects.find(object => object._openShopAnimation)?._openShopAnimation;
    await OS._loadDocumentState(placedProject, { trusted:true });
    const restoredObject = OS.canvas.getObjects().find(object => object._openShopAnimation);
    const restoredAnimation = restoredObject?._openShopAnimation;
    const placedHistory = OS.history.at(-1)?.action;

    OS.createNewDocument(32, 16, { clean:true });
    const pasted = await OS._installAnimationFrames(frames, delays, animated, 'GIF', { intent:'paste' });
    const pastedObject = OS.canvas.getActiveObject();

    return {
      routes,
      opened,
      openedState,
      placed,
      placedHistory,
      placedAnimation,
      placedSerialized,
      restoredAnimation,
      pasted,
      pastedHistory:OS.history.at(-1)?.action,
      pastedAnimation:pastedObject?._openShopAnimation,
      documentAnimation:OS._animFrames.length
    };
  });

  expect(result.routes).toEqual([
    ['gif', 'open', 'animated.gif'],
    ['gif', 'place', 'animated.gif'],
    ['gif', 'paste', 'animated.gif'],
    ['gif', 'place', 'animated.gif'],
    ['gif', 'open', 'animated.gif']
  ]);
  expect(result.opened).toBe(true);
  expect(result.openedState).toEqual({ frames:3, delays:[90, 140, 260] });
  expect(result.placed).toBe(true);
  expect(result.placedHistory).toBe('Place Image');
  expect(result.placedAnimation).toMatchObject({ format:'GIF', policy:'first-frame-static', delays:[90, 140, 260] });
  expect(result.placedAnimation.frames).toHaveLength(3);
  expect(result.placedSerialized).toMatchObject({ policy:'first-frame-static', delays:[90, 140, 260] });
  expect(result.restoredAnimation).toMatchObject({ policy:'first-frame-static', delays:[90, 140, 260] });
  expect(result.restoredAnimation.frames).toHaveLength(3);
  expect(result.pasted).toBe(true);
  expect(result.pastedHistory).toBe('Paste Image');
  expect(result.pastedAnimation).toMatchObject({ format:'GIF', policy:'first-frame-static', delays:[90, 140, 260] });
  expect(result.documentAnimation).toBe(0);
});

test('imports every PDF page as an editable layer @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit:'pt', format:[120, 80], compress:true });
    pdf.setFillColor(220, 40, 70);
    pdf.rect(0, 0, 120, 80, 'F');
    pdf.addPage([120, 80]);
    pdf.setFillColor(40, 110, 220);
    pdf.rect(0, 0, 120, 80, 'F');
    const bytes = pdf.output('arraybuffer');
    const opened = await OS._loadPDFFile(new File([bytes], 'two-page.pdf', { type:'application/pdf' }));
    return {
      opened,
      size:[OS.canvasW, OS.canvasH],
      layers:OS.layers.map(layer => ({ name:layer.name, objects:layer.objects.filter(object => object.name !== '__boundary__').length })),
      pageNames:OS.canvas.getObjects().filter(object => /^Page \d+$/.test(object.name || '')).map(object => object.name)
    };
  });

  expect(result.opened).toBe(true);
  expect(result.size).toEqual([80, 120]);
  expect(result.layers).toEqual([
    { name:'Background', objects:0 },
    { name:'Page 1', objects:1 },
    { name:'Page 2', objects:1 }
  ]);
  expect(result.pageNames).toEqual(['Page 1', 'Page 2']);
});

test('imports animated WebP frames with microsecond durations converted to timeline timing', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const originalDecoder = window.ImageDecoder;
    class FakeImageDecoder {
      constructor(options) {
        this.type = options.type;
        this.tracks = {
          ready:Promise.resolve(),
          selectedTrack:{ frameCount:3, frameDuration:90000 }
        };
      }
      async decode({ frameIndex }) {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        context.fillStyle = ['#e22', '#2a5', '#28e'][frameIndex];
        context.fillRect(0, 0, 2, 1);
        canvas.displayWidth = 2;
        canvas.displayHeight = 1;
        canvas.duration = [90000, 140000, 260000][frameIndex];
        canvas.close = () => {};
        return { image:canvas };
      }
      close() {}
    }
    Object.defineProperty(window, 'ImageDecoder', { configurable:true, value:FakeImageDecoder });
    try {
      const imported = await OS._importImageDecoderFrames(new File([new Uint8Array([1, 2, 3])], 'timed.webp', { type:'image/webp' }));
      const project = OS._captureDocumentState();
      return {
        imported,
        frames:OS._animFrames.length,
        delays:OS._animDelays,
        persistedDelays:project.animation.delays,
        timelineItems:document.getElementById('timeline-frames').children.length
      };
    } finally {
      if (originalDecoder) Object.defineProperty(window, 'ImageDecoder', { configurable:true, value:originalDecoder });
    }
  });

  expect(result).toEqual({
    imported:true,
    frames:3,
    delays:[90, 140, 260],
    persistedDelays:[90, 140, 260],
    timelineItems:3
  });
});

test('loads the verified LibRaw runtime and imports a demosaiced RAW preview', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const LibRaw = await OS._loadLibRaw();
    const runtimeLoaded = typeof LibRaw === 'function';
    const decoder = new LibRaw();
    decoder.dispose();
    class FakeLibRaw {
      async open() {}
      async metadata() { return { camera_make:'OpenShop', camera_model:'Fixture', iso_speed:200, width:2, height:1 }; }
      async imageData() { return { width:2, height:1, colors:3, bits:8, data:new Uint8Array([255,0,0, 0,255,0]) }; }
      dispose() {}
    }
    OS._libRawPromise = Promise.resolve(FakeLibRaw);
    const imported = await OS._loadRAWFile(new File([new Uint8Array([1,2,3])], 'fixture.dng', { type:'application/octet-stream' }));
    const runtimeBeforeDispose = OS._runtimeResourceReport();
    const runtimeAfterDispose = OS._disposeRuntimeResources();
    return {
      runtimeLoaded,
      imported,
      runtimeBeforeDispose,
      runtimeAfterDispose,
      size:[OS.canvasW, OS.canvasH],
      raw:OS._lastImportRaw,
      imageCount:OS.layers.flatMap(layer => layer.objects).filter(object => object.type === 'image').length
    };
  });

  expect(result.runtimeLoaded).toBe(true);
  expect(result.imported).toBe(true);
  expect(result.runtimeBeforeDispose).toMatchObject({ assetPromises:0, retainedAssetBytes:0 });
  expect(result.runtimeAfterDispose).toMatchObject({ assetPromises:0, retainedAssetBytes:0, blobUrls:0, scriptUrls:0 });
  expect(result.size).toEqual([2, 1]);
  expect(result.raw.model).toBe('Fixture');
  expect(result.imageCount).toBe(1);
});

test('exports a smaller, more accurate animated GIF than the legacy encoder', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const width = 96;
    const height = 64;
    const delay = 83;
    const sources = [];
    const sourcePixels = [];
    for (let frameIndex = 0; frameIndex < 6; frameIndex += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      const image = context.createImageData(width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          image.data[offset] = (x * 3 + y + frameIndex * 31) % 256;
          image.data[offset + 1] = (x + y * 4 + frameIndex * 47) % 256;
          image.data[offset + 2] = ((x ^ y) * 5 + frameIndex * 59) % 256;
          image.data[offset + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
      sources.push(canvas.toDataURL('image/png'));
      sourcePixels.push(image.data.slice());
    }

    const encoded = await OS._encodeGifFrames(sources, delay);
    const buffer = await encoded.arrayBuffer();
    const codec = await OS._loadGifCodec();
    const metadata = codec.decode(buffer);
    const frames = await codec.decodeFrames(buffer);
    let squaredError = 0;
    let samples = 0;
    frames.forEach((frame, frameIndex) => {
      for (let offset = 0; offset < frame.data.length; offset += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          const difference = frame.data[offset + channel] - sourcePixels[frameIndex][offset + channel];
          squaredError += difference * difference;
          samples += 1;
        }
      }
    });
    return {
      bytes: encoded.size,
      type: encoded.type,
      signature: String.fromCharCode(...new Uint8Array(buffer, 0, 6)),
      width: metadata.width,
      height: metadata.height,
      frameCount: frames.length,
      mse: squaredError / samples
    };
  });

  expect(result.type).toBe('image/gif');
  expect(result.signature).toBe('GIF89a');
  expect([result.width, result.height, result.frameCount]).toEqual([96, 64, 6]);
  // Measured before removal: gif.js@0.2.0 quality=10 emitted 32,372 bytes
  // with RGB MSE 317.9249 for this exact deterministic sequence.
  expect(result.bytes).toBeLessThanOrEqual(32372);
  expect(result.mse).toBeLessThanOrEqual(317.925);
});

test('accepts image files from clipboard paste and drag-and-drop', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const makeFile = async (name, color) => {
      const canvas = document.createElement('canvas');
      canvas.width = 3;
      canvas.height = 2;
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      return new File([blob], name, { type: 'image/png' });
    };
    const waitForHistory = action => new Promise((resolve, reject) => {
      const started = performance.now();
      const poll = () => {
        if (OS.history.at(-1)?.action === action) return resolve();
        if (performance.now() - started > 5000) return reject(new Error(`Timed out waiting for ${action}`));
        setTimeout(poll, 10);
      };
      poll();
    });

    const initialObjects = OS.canvas.getObjects().length;
    const pastedFile = await makeFile('clipboard-fixture.png', '#e23b52');
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { items: [{ type: pastedFile.type, getAsFile: () => pastedFile }] }
    });
    document.dispatchEvent(paste);
    await waitForHistory('Paste Image');
    const afterPaste = OS.canvas.getObjects().length;

    const droppedFile = await makeFile('drop-fixture.png', '#3978ff');
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [droppedFile], types: ['Files'] }
    });
    document.getElementById('canvas-area').dispatchEvent(drop);
    await waitForHistory('Drop Image');

    return {
      pastePrevented: paste.defaultPrevented,
      dropPrevented: drop.defaultPrevented,
      objectCounts: [initialObjects, afterPaste, OS.canvas.getObjects().length],
      history: OS.history.slice(-2).map(entry => entry.action),
      names: OS.layers.flatMap(layer => layer.objects).map(object => object.name)
    };
  });

  expect(result.pastePrevented).toBe(true);
  expect(result.dropPrevented).toBe(true);
  expect(result.objectCounts[1]).toBe(result.objectCounts[0] + 1);
  expect(result.objectCounts[2]).toBe(result.objectCounts[1] + 1);
  expect(result.history).toEqual(['Paste Image', 'Drop Image']);
  expect(result.names).toEqual(expect.arrayContaining(['clipboard-fixture.png', 'drop-fixture.png']));
});

test('copies and cuts pixel selections through PNG and the system clipboard @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.createNewDocument(8, 8, { resetProject:true, clean:true });
    const source = document.createElement('canvas');
    source.width = 8; source.height = 8;
    source.getContext('2d').fillStyle = '#c8501e';
    source.getContext('2d').fillRect(0, 0, 8, 8);
    const image = await fabric.FabricImage.fromURL(source.toDataURL('image/png'));
    image.set({ left:0, top:0, name:'Clipboard source' });
    OS.canvas.add(image);
    OS.layers[OS.activeLayerIdx].objects.push(image);
    OS.canvas.setActiveObject(image);
    OS._enforceLayerInvariants();

    const mask = new Uint8Array(8 * 8);
    for (let y = 3; y < 5; y++) for (let x = 2; x < 5; x++) mask[y * 8 + x] = 255;
    const setSelection = () => OS._setPixelSelectionMask(mask.slice(), 8, 8, { coverage:true });
    const readPixel = (target, x, y) => {
      const probe = document.createElement('canvas'); probe.width = 8; probe.height = 8;
      const ctx = probe.getContext('2d'); ctx.drawImage(target.getElement(), 0, 0);
      return [...ctx.getImageData(x, y, 1, 1).data];
    };

    const writes = [];
    let rejectWrite = false;
    const clipboardApi = { write: async items => {
      if (rejectWrite) throw new Error('clipboard permission denied');
      writes.push(items);
    } };
    class FakeClipboardItem { constructor(data) { this.data = data; } }
    Object.defineProperty(navigator, 'clipboard', { configurable:true, value:clipboardApi });
    Object.defineProperty(globalThis, 'ClipboardItem', { configurable:true, value:FakeClipboardItem });

    setSelection();
    const copied = await OS._copyPixelSelection();
    const copiedImage = await fabric.FabricImage.fromURL(OS._pixelClipboard.dataUrl);
    const copiedPixel = readPixel(copiedImage, 1, 1);
    const copiedShape = { width:copiedImage.width, height:copiedImage.height, pixel:copiedPixel };

    setSelection();
    OS._cutSelection();
    await new Promise((resolve, reject) => {
      const started = performance.now();
      const poll = () => {
        if (OS.history.at(-1)?.action === 'Cut Selection') { resolve(); return; }
        if (performance.now() - started > 5000) { reject(new Error('Cut did not commit')); return; }
        setTimeout(poll, 10);
      };
      poll();
    });
    const cutTarget = OS._layerRasterTarget(OS.layers[OS.activeLayerIdx]);
    const cutInside = readPixel(cutTarget, 2, 3);
    const cutOutside = readPixel(cutTarget, 0, 0);

    const pasted = await OS._pastePixelSelection();
    const pastedImage = OS.canvas.getActiveObject();
    const pastedShape = { width:pastedImage?.width, height:pastedImage?.height, left:pastedImage?.left, top:pastedImage?.top };

    rejectWrite = true;
    setSelection();
    const copiedWithoutPermission = await OS._copyPixelSelection();
    const warning = [...document.querySelectorAll('#toast-container .toast')].at(-1)?.textContent || '';
    return {
      copied,
      writes:writes.length,
      clipboardType:writes[0]?.[0]?.data?.['image/png']?.type,
      copiedShape,
      cutInside,
      cutOutside,
      pasted,
      pastedShape,
      copiedWithoutPermission,
      warning
    };
  });

  expect(result.copied).toBe(true);
  expect(result.writes).toBe(2);
  expect(result.clipboardType).toBe('image/png');
  expect(result.copiedShape).toEqual({ width:3, height:2, pixel:[200, 80, 30, 255] });
  expect(result.cutInside[3]).toBe(0);
  expect(result.cutOutside).toEqual([200, 80, 30, 255]);
  expect(result.pasted).toBe(true);
  expect(result.pastedShape).toMatchObject({ width:3, height:2 });
  expect(result.copiedWithoutPermission).toBe(true);
  expect(result.warning).toContain('system clipboard unavailable');
});

test('stays usable in forced-colors mode', async ({ page }) => {
  // The chrome is glassmorphic — translucent panels over a blur — which in
  // Windows High Contrast renders as invisible controls on an invisible
  // background. There was no forced-colors handling at all.
  await page.emulateMedia({ forcedColors: 'active' });
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(() => {
    const read = (el, prop) => getComputedStyle(el).getPropertyValue(prop);
    const glassy = [...document.querySelectorAll('#panels,#topbar,.modal,.filter-panel')]
      .filter(el => {
        const filter = read(el, 'backdrop-filter') || read(el, '-webkit-backdrop-filter');
        return filter && filter !== 'none';
      }).length;

    const tool = document.querySelector('.tool-btn');
    const canvasArea = document.getElementById('canvas-area');
    return {
      glassy,
      toolHasBorder: read(tool, 'border-top-style') === 'solid',
      canvasOptsOut: read(canvasArea, 'forced-color-adjust') === 'none',
      // The tokens resolve to system colours rather than the dark palette.
      accent: read(document.documentElement, '--accent').trim(),
      border: read(document.documentElement, '--border').trim()
    };
  });

  // Blur and shadows are off, so panels do not vanish into the background.
  expect(result.glassy).toBe(0);
  expect(result.toolHasBorder).toBe(true);
  // The artwork is not repainted by the OS palette.
  expect(result.canvasOptsOut).toBe(true);
  expect(result.accent).toBe('Highlight');
  expect(result.border).toBe('CanvasText');
});

test('selections add, subtract and intersect @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // No boolean modes existed at all — the most-reacted open issue on the
  // nearest open-source rival, and a baseline expectation from Photoshop.
  const result = await page.evaluate(async () => {
    OS.createNewDocument(100, 100, '#ffffff');
    const w = Math.round(OS.canvasW), h = Math.round(OS.canvasH);
    const box = (x0, y0, x1, y1) => {
      const mask = new Uint8Array(w * h);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mask[y * w + x] = 255;
      return mask;
    };
    const count = () => (OS._selectionMask ? [...OS._selectionMask.mask].filter(Boolean).length : 0);

    // Two 20x20 squares overlapping in a 10x10 corner.
    const a = box(10, 10, 30, 30);
    const b = box(20, 20, 40, 40);

    OS._setPixelSelectionMask(a, w, h, { coverage: true });
    const base = count();

    OS._setPixelSelectionMask(b, w, h, { coverage: true, combine: 'add' });
    const added = count();

    OS._setPixelSelectionMask(a.slice(), w, h, { coverage: true });
    OS._setPixelSelectionMask(b.slice(), w, h, { coverage: true, combine: 'subtract' });
    const subtracted = count();

    OS._setPixelSelectionMask(a.slice(), w, h, { coverage: true });
    OS._setPixelSelectionMask(b.slice(), w, h, { coverage: true, combine: 'intersect' });
    const intersected = count();

    // Modifiers map to the modes, and the toolbar sets a sticky default.
    const fromEvent = {
      plain: OS._combineModeFromEvent({}),
      shift: OS._combineModeFromEvent({ shiftKey: true }),
      alt: OS._combineModeFromEvent({ altKey: true }),
      both: OS._combineModeFromEvent({ shiftKey: true, altKey: true })
    };
    OS.setSelectionCombineMode('add');
    const stickyDefault = OS._combineModeFromEvent({});
    const buttonState = [...document.querySelectorAll('.selection-mode')]
      .map(btn => [btn.dataset.combine, btn.getAttribute('aria-pressed')]);
    OS.setSelectionCombineMode('replace');

    return { base, added, subtracted, intersected, fromEvent, stickyDefault, buttonState };
  });

  expect(result.base).toBe(400);
  // Union of two 20x20 squares overlapping by 10x10.
  expect(result.added).toBe(700);
  expect(result.subtracted).toBe(300);
  expect(result.intersected).toBe(100);
  expect(result.fromEvent).toEqual({ plain: 'replace', shift: 'add', alt: 'subtract', both: 'intersect' });
  // The toolbar default applies when no modifier is held.
  expect(result.stickyDefault).toBe('add');
  expect(result.buttonState).toContainEqual(['add', 'true']);
  expect(result.buttonState).toContainEqual(['replace', 'false']);
});

test('objects snap to the canvas and to each other @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Issue #3: there was no "adsorption" between layers or against the
  // artboard, so composing anything meant eyeballing pixel positions. Only
  // grid snapping existed.
  const result = await page.evaluate(async () => {
    OS.createNewDocument(400, 300, '#ffffff');
    OS.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    OS.snapEnabled = true;
    OS._prefs.snapTolerance = 8;

    const anchor = new fabric.Rect({ left: 100, top: 50, width: 80, height: 60, fill: '#3355ff' });
    OS.canvas.add(anchor);
    OS.layers[OS.activeLayerIdx].objects.push(anchor);

    const mover = new fabric.Rect({ left: 0, top: 0, width: 40, height: 40, fill: '#ff3355' });
    OS.canvas.add(mover);
    OS.layers[OS.activeLayerIdx].objects.push(mover);

    const drag = (left, top, altKey = false) => {
      mover.set({ left, top });
      mover.setCoords();
      OS.canvas.fire('object:moving', { target: mover, e: { altKey } });
      return { left: Math.round(mover.left), top: Math.round(mover.top) };
    };

    // Near the left edge of the artboard: snaps to 0.
    const toCanvasEdge = drag(3, 200);
    // Near the anchor's left edge: snaps to 100.
    const toObject = drag(104, 200);
    const guidesShown = document.querySelectorAll('#canvas-area .smart-guide').length;
    // Alt suppresses it.
    const withAlt = drag(104, 203, true);
    const guidesAfterAlt = document.querySelectorAll('#canvas-area .smart-guide').length;

    OS.canvas.fire('mouse:up', {});
    const guidesAfterRelease = document.querySelectorAll('#canvas-area .smart-guide').length;

    return { toCanvasEdge, toObject, guidesShown, withAlt, guidesAfterAlt, guidesAfterRelease };
  });

  expect(result.toCanvasEdge.left).toBe(0);
  expect(result.toObject.left).toBe(100);
  expect(result.guidesShown).toBeGreaterThan(0);
  // Alt leaves the position alone and shows no guides.
  expect(result.withAlt).toEqual({ left: 104, top: 203 });
  expect(result.guidesAfterAlt).toBe(0);
  // Guides do not outlive the drag.
  expect(result.guidesAfterRelease).toBe(0);
});

test('lasso and pen paths close by clicking their start point @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Issue #3: neither tool had "suction" on the start and end points, so an
  // outline could not reliably be completed.
  const result = await page.evaluate(async () => {
    OS.createNewDocument(200, 150, '#ffffff');
    OS.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

    // Lasso: three corners, then a click back near the first one.
    OS.setTool('lasso');
    OS._lassoPoints = [];
    OS._lassoClick({ offsetX: 20, offsetY: 20 });
    OS._lassoClick({ offsetX: 120, offsetY: 20 });
    OS._lassoClick({ offsetX: 120, offsetY: 100 });
    const handle = document.getElementById('lasso-close-handle');
    const markerShown = handle.classList.contains('visible');
    // Just outside the radius adds a point; just inside closes.
    OS._lassoClick({ offsetX: 20 + 40, offsetY: 20 });
    const afterFarClick = OS._lassoPoints.length;
    OS._lassoClick({ offsetX: 20 + 4, offsetY: 20 + 4 });
    const lassoSelected = OS._selectionMask ? [...OS._selectionMask.mask].filter(Boolean).length : 0;

    // Pen: closing on the start point produces a closed, filled path.
    OS.setTool('pen');
    OS._penPoints = [];
    OS._penClick({ x: 30, y: 30 });
    OS._penClick({ x: 90, y: 30 });
    OS._penClick({ x: 90, y: 80 });
    const layersBefore = OS.layers.length;
    OS._penClick({ x: 33, y: 33 });
    const penPath = OS.canvas.getObjects().find(o => o.type === 'path');

    return {
      markerShown,
      afterFarClick,
      lassoSelected,
      penPointsCleared: OS._penPoints.length,
      penClosed: Boolean(penPath && /z/i.test(penPath.path.flat().join(' '))),
      penAddedLayer: OS.layers.length > layersBefore
    };
  });

  expect(result.markerShown).toBe(true);
  // A click outside the radius is a normal point.
  expect(result.afterFarClick).toBe(4);
  // A click on the start point closed the lasso into a real selection.
  expect(result.lassoSelected).toBeGreaterThan(1000);
  // The pen committed and closed its path.
  expect(result.penPointsCleared).toBe(0);
  expect(result.penClosed).toBe(true);
  expect(result.penAddedLayer).toBe(true);
});

test('enables the highest-value parity tools with real selection, vector, shape, and warp paths', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.createNewDocument(160, 120, '#ffffff');
    OS.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const toolStates = ['lasso-polygonal', 'lasso-magnetic', 'quick-selection', 'perspective-crop', 'spot-healing', 'path-selection', 'direct-selection', 'rounded-rect', 'custom-shape'];
    const registry = Object.fromEntries(toolStates.map(tool => [tool, OS.listRegisteredTools({ documentOpen:true }).find(entry => entry.toolState === tool)]));

    OS.setTool('lasso-polygonal');
    OS._lassoPoints = ['12,12', '90,12', '90,70'];
    OS._lassoDoubleClick();
    const polygonSelection = OS._selectionMask?.count || 0;

    OS.clearSelection();
    OS.setTool('quick-selection');
    OS._selectionCombine = 'replace';
    OS._quickSelectionStart({ x:30, y:30 });
    const quickSelection = OS._quickSelectionFinish();
    const quickPixels = OS._selectionMask?.count || 0;

    OS.clearSelection();
    OS.setTool('lasso-magnetic');
    OS._magneticLassoStart({ x:15, y:15 }, { offsetX:15, offsetY:15 });
    OS._magneticLassoMove({ x:90, y:15 });
    OS._magneticLassoMove({ x:90, y:70 });
    OS._magneticLassoFinish();
    const magneticSelection = OS._selectionMask?.count || 0;

    OS.createNewDocument(40, 30, '#ffffff');
    OS.setTool('perspective-crop');
    OS._perspectiveCropCorners = [{x:2,y:2},{x:38,y:2},{x:38,y:28},{x:2,y:28}];
    const historyBeforePerspective = OS.history.length;
    const perspectiveApplied = await OS.applyPerspectiveCrop();
    const perspectiveHistoryEntries = OS.history.length - historyBeforePerspective;

    const source = document.createElement('canvas');
    source.width = 4; source.height = 4;
    source.getContext('2d').fillStyle = '#ff0000';
    source.getContext('2d').fillRect(0, 0, 4, 4);
    const warped = OS._perspectiveWarpCanvas(source, [{x:0,y:0},{x:3,y:0},{x:3,y:3},{x:0,y:3}], 4, 4);
    const warpedPixel = [...warped.getContext('2d').getImageData(1, 1, 1, 1).data];

    const path = new fabric.Path('M 0 0 L 45 0 L 45 45 Z', { left:20, top:20, fill:'#6c8cff', selectable:true });
    OS._addObjectAsLayer(path, 'Path');
    OS.setTool('path-selection');
    const pathSelected = OS._pathSelectionClick({ x:25, y:25 }, 'path-selection');
    OS.setTool('direct-selection');
    const directSelected = OS._pathSelectionClick({ x:25, y:25 }, 'direct-selection');
    OS.finishPathEdit(false);

    OS.setTool('rounded-rect');
    const roundedOptions = document.getElementById('opt-shape').style.display;
    const pointer = (x, y) => ({
      e: { clientX:x, clientY:y, offsetX:x, offsetY:y, buttons:1 },
      absolutePointer: { x, y }, pointer: { x, y }
    });
    OS.onMouseDown(pointer(20, 20));
    OS.onMouseMove(pointer(70, 55));
    OS.onMouseUp(pointer(70, 55));
    const roundedShape = OS.canvas.getObjects().find(object => object.type === 'rect' && object.rx > 0);
    OS.setTool('custom-shape');
    const customOptions = document.getElementById('opt-shape').style.display;
    OS.onMouseDown(pointer(80, 25));
    OS.onMouseMove(pointer(130, 75));
    OS.onMouseUp(pointer(130, 75));
    const customShape = OS.canvas.getObjects().find(object => object.type === 'path' && object.name === undefined);

    return {
      implemented: Object.fromEntries(toolStates.map(tool => [tool, registry[tool]?.implemented === true && registry[tool]?.enabled === true])),
      polygonSelection, quickSelection, quickPixels, magneticSelection,
      perspectiveApplied, perspectiveHistoryEntries, perspectiveSize:[OS.canvasW, OS.canvasH],
      warpedPixel, pathSelected, directSelected, roundedOptions, customOptions,
      roundedShape: Boolean(roundedShape), customShape: Boolean(customShape)
    };
  });

  expect(Object.values(result.implemented).every(Boolean)).toBe(true);
  expect(result.polygonSelection).toBeGreaterThan(0);
  expect(result.quickSelection).toBe(true);
  expect(result.quickPixels).toBeGreaterThan(0);
  expect(result.magneticSelection).toBeGreaterThan(0);
  expect(result.perspectiveApplied).toBe(true);
  expect(result.perspectiveHistoryEntries).toBe(1);
  expect(result.perspectiveSize).toEqual([36, 26]);
  expect(result.warpedPixel.slice(0, 3)).toEqual([255, 0, 0]);
  expect(result.pathSelected).toBe(true);
  expect(result.directSelected).toBe(true);
  expect(result.roundedOptions).toBe('flex');
  expect(result.customOptions).toBe('flex');
  expect(result.roundedShape).toBe(true);
  expect(result.customShape).toBe(true);
});

test('runs Refine Edge and Telea inpainting through the cancellable filter worker', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const width = 9, height = 9;
    const source = new ImageData(width, height);
    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      source.data[pixel] = 100; source.data[pixel + 1] = 150; source.data[pixel + 2] = 200; source.data[pixel + 3] = 255;
      if (x < 4) mask[y * width + x] = 255;
    }
    const refined = await OS._runFilterInWorker('refineEdge', source, width, height, { mask, radius:2 });
    const softAlpha = [...refined.data].filter((value, index) => index % 4 === 3 && value > 0 && value < 255).length;

    const damaged = new ImageData(width, height);
    const damageMask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      damaged.data[pixel] = 100; damaged.data[pixel + 1] = 150; damaged.data[pixel + 2] = 200; damaged.data[pixel + 3] = 255;
    }
    for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) {
      const pixel = (y * width + x) * 4;
      damaged.data[pixel] = 255; damaged.data[pixel + 1] = 0; damaged.data[pixel + 2] = 0;
      damageMask[y * width + x] = 255;
    }
    const healed = await OS._runFilterInWorker('teleaInpaint', damaged, width, height, { mask:damageMask, radius:3 });
    const center = [...healed.data.slice((4 * width + 4) * 4, (4 * width + 4) * 4 + 4)];
    return { softAlpha, center, activeJobs:OS._computeJobs.size };
  });

  expect(result.softAlpha).toBeGreaterThan(0);
  expect(result.center).toEqual([100, 150, 200, 255]);
  expect(result.activeJobs).toBe(0);
});

test('previews and applies Refine Edge, then commits one Spot Healing history step', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  await page.evaluate(() => {
    OS.createNewDocument(32, 32, '#ffffff');
    const mask = new Uint8Array(32 * 32);
    for (let y = 4; y < 28; y++) for (let x = 4; x < 16; x++) mask[y * 32 + x] = 255;
    OS._setPixelSelectionMask(mask, 32, 32, { coverage:true, combine:'replace' });
    OS.showRefineEdge();
  });
  await page.waitForFunction(() => Boolean(OS._refineEdgeResult));
  const refined = await page.evaluate(async () => {
    const applied = await OS._applyRefineEdge();
    const partial = OS._selectionMask?.mask.filter(value => value > 0 && value < 255).length || 0;
    await new Promise(resolve => setTimeout(resolve, 220));
    return { applied, partial, panel:Boolean(document.getElementById('refine-edge-overlay')) };
  });
  expect(refined).toEqual({ applied:true, partial:expect.any(Number), panel:false });
  expect(refined.partial).toBeGreaterThan(0);

  const healing = await page.evaluate(async () => {
    const source = document.createElement('canvas');
    source.width = 32; source.height = 32;
    const sourceContext = source.getContext('2d');
    sourceContext.fillStyle = 'rgb(100,150,200)'; sourceContext.fillRect(0, 0, 32, 32);
    sourceContext.fillStyle = 'rgb(255,0,0)'; sourceContext.fillRect(14, 14, 4, 4);
    const target = await new Promise(resolve => {
      const element = new Image();
      element.onload = () => resolve(new fabric.Image(element, { left:0, top:0, originX:'left', originY:'top' }));
      element.src = source.toDataURL();
    });
    OS.canvas.add(target); OS.layers[OS.activeLayerIdx].objects.push(target); OS.canvas.setActiveObject(target);
    const mask = new Uint8Array(32 * 32);
    for (let y = 13; y < 19; y++) for (let x = 13; x < 19; x++) mask[y * 32 + x] = 255;
    const before = OS.history.length;
    const committed = await OS._commitSpotHealing({
      target,
      oc:source,
      mask,
      guard:{ generation:OS._documentGeneration, revision:OS._documentRevision, targetId:OS._ensureObjectId(target) }
    });
    const active = OS.canvas.getActiveObject();
    const check = document.createElement('canvas'); check.width = 32; check.height = 32;
    check.getContext('2d').drawImage(active.getElement(), 0, 0);
    const center = [...check.getContext('2d').getImageData(16, 16, 1, 1).data];
    return { committed, historyEntries:OS.history.length - before, center, activeJobs:OS._computeJobs.size };
  });
  expect(healing.committed).toBe(true);
  expect(healing.historyEntries).toBe(1);
  expect(healing.center.slice(0, 3)).toEqual([100, 150, 200]);
  expect(healing.activeJobs).toBe(0);
});

test('the panel stack resizes by drag and by keyboard @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Issue #3 asked for drag bars between the panel sections. A drag-only
  // control would fail WCAG 2.5.7, so the separator takes focus and keys too.
  const splitters = page.locator('#panels .panel-splitter');
  await expect(splitters.first()).toBeAttached();
  const count = await splitters.count();
  expect(count).toBeGreaterThan(0);

  const roles = await page.evaluate(() => [...document.querySelectorAll('#panels .panel-splitter')].map(el => ({
    role: el.getAttribute('role'),
    orientation: el.getAttribute('aria-orientation'),
    labelled: Boolean(el.getAttribute('aria-label'))
  })));
  roles.forEach(r => {
    expect(r.role).toBe('separator');
    expect(r.orientation).toBe('horizontal');
    expect(r.labelled).toBe(true);
  });

  const resized = await page.evaluate(async () => {
    const group = document.querySelector('#panels > .panel-tab-group');
    const splitter = document.querySelector('#panels .panel-splitter');
    const before = Math.round(group.getBoundingClientRect().height);

    splitter.focus();
    const focused = document.activeElement === splitter;
    for (let i = 0; i < 3; i += 1) {
      splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    }
    const afterKeys = Math.round(group.getBoundingClientRect().height);

    // Home restores the natural size.
    splitter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    const afterHome = Math.round(group.getBoundingClientRect().height);

    return { focused, before, afterKeys, afterHome, saved: OS._prefs.panelSizes?.length || 0 };
  });

  expect(resized.focused).toBe(true);
  expect(resized.afterKeys).toBeGreaterThan(resized.before);
  expect(resized.afterHome).toBe(resized.before);
  // Sizes are remembered.
  expect(resized.saved).toBeGreaterThan(0);
});

test('creates documents in physical units at a chosen resolution @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Issue #3 asked for millimetre sizes; the templates were pixel-only with no
  // resolution anywhere, and both exporters assumed 96 PPI.
  const maths = await page.evaluate(() => ({
    mmToPx: OS._documentPixelSize(210, 297, 'mm', 300),
    inToPx: OS._documentPixelSize(6, 4, 'in', 300),
    pxPassthrough: OS._documentPixelSize(800, 600, 'px', 96),
    roundTrip: OS._convertLength(OS._convertLength(210, 'mm', 'px', 300), 'px', 'mm', 300)
  }));
  // A4 at 300 PPI is 2480 x 3508.
  expect(maths.mmToPx.width).toBe(2480);
  expect(maths.mmToPx.height).toBe(3508);
  expect(maths.inToPx).toMatchObject({ width: 1800, height: 1200, resolution: 300 });
  expect(maths.pxPassthrough).toMatchObject({ width: 800, height: 600 });
  expect(maths.roundTrip).toBeCloseTo(210, 1);

  // Creating through the dialog carries the resolution into the document.
  const created = await page.evaluate(async () => {
    OS.newImage();
    const modal = document.querySelector('.modal-overlay:last-of-type');
    modal.querySelector('#ni-unit').value = 'mm';
    modal.querySelector('#ni-unit').dispatchEvent(new Event('change'));
    modal.querySelector('#ni-dpi').value = '300';
    modal.querySelector('#ni-w').value = '210';
    modal.querySelector('#ni-h').value = '297';
    modal.querySelector('#ni-w').dispatchEvent(new Event('input'));
    const preview = modal.querySelector('#ni-pixels').textContent;
    await OS.doNewImage(modal);
    return { preview, w: Math.round(OS.canvasW), h: Math.round(OS.canvasH), dpi: OS._documentResolution };
  });

  expect(created.preview).toBe('2480 x 3508 px');
  expect([created.w, created.h]).toEqual([2480, 3508]);
  expect(created.dpi).toBe(300);

  // And the PSD resolution resource declares it rather than a hardcoded 96.
  const psd = await page.evaluate(() => {
    OS._colorProfile = {
      name: 'Fixture Display P3',
      sourceKind: 'embedded-icc',
      iccData: 'data:application/vnd.openshop.icc;base64,AAECAwQ='
    };
    const { structure, report } = OS._withExportCanvasState({ transparent: true }, () => OS._buildPsdExportStructure());
    const bytes = agPsd.writePsd(structure, { trimImageData: true, noBackground: true });
    const profile = OS._decodeProjectBytes(OS._colorProfile.iccData);
    const embedded = OS._embedPSDICCProfile(bytes, profile);
    return {
      resolution: structure.imageResources?.resolutionInfo || null,
      report,
      builtProfile: [...profile],
      parsedProfile: [...OS._readPSDICCProfile(embedded)]
    };
  });
  expect(psd.resolution).toMatchObject({ horizontalResolution: 300, verticalResolution: 300 });
  expect(psd.report.iccProfileAvailable).toBe(true);
  expect(psd.builtProfile).toEqual([0, 1, 2, 3, 4]);
  expect(psd.parsedProfile).toEqual([0, 1, 2, 3, 4]);
});

test('says what best-effort storage actually costs @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // The panel reported the persisted flag but never said what it meant, and
  // WebKit clears script-writable storage after seven days without a visit.
  const notes = await page.evaluate(() => ({
    persisted: OS._storageDurabilityNote(true),
    bestEffort: OS._storageDurabilityNote(false),
    unknown: OS._storageDurabilityNote(null),
    hasRequest: typeof OS._requestStoragePersistence === 'function'
  }));

  expect(notes.persisted).toMatch(/will not evict/i);
  expect(notes.bestEffort).toMatch(/delete/i);
  expect(notes.unknown).toMatch(/does not report/i);
  expect(notes.hasRequest).toBe(true);

  // The recovery panel surfaces the note and, when eviction is possible, the
  // way to ask the browser not to.
  await page.evaluate(() => OS.showRecoveryManager());
  await expect(page.locator('.recovery-manager')).toBeVisible();
  const panel = await page.evaluate(() => {
    const modal = document.querySelector('.recovery-manager');
    return {
      text: modal.textContent,
      // WebKit exposes no origin-private file system to a file:// origin, so
      // there is no recovery storage to describe there.
      storageSupported: Boolean(navigator.storage?.getDirectory),
      hasKeep: [...modal.querySelectorAll('button')].some(b => b.textContent === 'Keep recovery data')
    };
  });
  expect(panel.text).toMatch(/Durability/);
  if (panel.storageSupported) {
    // Whichever state the engine reports, the note explains it.
    expect(panel.text).toMatch(/evict|delete|does not report/i);
    if (/may delete|deletes this data/i.test(panel.text)) expect(panel.hasKeep).toBe(true);
  } else {
    expect(panel.text).toMatch(/does not expose Origin Private File System/i);
  }
});

test('toasts dismiss themselves, cap their stack, and stop repeating @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const container = document.getElementById('toast-container');
    container.replaceChildren();

    // Hovering pauses dismissal; leaving used to never restart it, so any
    // toast the pointer crossed stayed on screen forever.
    OS.toast('hover me', 'info');
    const el = container.lastElementChild;
    el.dispatchEvent(new MouseEvent('mouseenter'));
    await new Promise(r => setTimeout(r, 300));
    const heldWhileHovered = container.contains(el);
    el.dispatchEvent(new MouseEvent('mouseleave'));
    await new Promise(r => setTimeout(r, 1800));
    const goneAfterLeave = !container.contains(el);

    // The stack is capped rather than growing over the canvas.
    container.replaceChildren();
    for (let i = 0; i < 9; i += 1) OS.toast(`message ${i}`, 'info');
    const capped = container.children.length;

    // One slider drag with nothing selected says it once, not once per tick.
    container.replaceChildren();
    OS.canvas.discardActiveObject();
    OS._adjustTargetWarned = false;
    let warnings = 0;
    const realToast = OS.toast.bind(OS);
    OS.toast = (msg, type) => { if (/Select an image to adjust/.test(msg)) warnings += 1; return realToast(msg, type); };
    for (let i = 0; i < 5; i += 1) {
      OS.liveAdjust();
      await new Promise(r => setTimeout(r, 120));
    }
    OS.toast = realToast;

    return { heldWhileHovered, goneAfterLeave, capped, warnings };
  });

  expect(result.heldWhileHovered).toBe(true);
  expect(result.goneAfterLeave).toBe(true);
  expect(result.capped).toBeLessThanOrEqual(4);
  expect(result.warnings).toBe(1);
});

test('brush and eraser strokes become layer pixels, not draggable paths @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Issue #3: a stroke stayed a selectable Fabric path above the layer, so an
  // eraser's "erasure" could be dragged around afterwards.
  const result = await page.evaluate(async () => {
    OS.createNewDocument(120, 90, '#ffffff');
    OS.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    OS.setTool('brush');

    const stroke = (opts) => {
      const path = new fabric.Path('M 20 20 L 80 20', {
        stroke: '#ff0000', strokeWidth: 12, fill: null, strokeLineCap: 'round', ...opts
      });
      OS.canvas.add(path);
      OS.canvas.fire('path:created', { path });
      return path;
    };
    const settle = () => new Promise(r => setTimeout(r, 500));
    const pixel = (x, y) => {
      const d = OS._readDocumentImageData().data;
      const i = (y * 120 + x) * 4;
      return [d[i], d[i + 1], d[i + 2], d[i + 3]];
    };

    const brushPath = stroke();
    await settle();
    const afterBrush = {
      pathOnCanvas: OS.canvas.getObjects().includes(brushPath),
      layerTypes: OS.layers[OS.activeLayerIdx].objects.map(o => o.type),
      onStroke: pixel(50, 20),
      offStroke: pixel(100, 70)
    };

    // Erasing removes those pixels rather than laying a path over them.
    OS.setTool('eraser');
    stroke({ globalCompositeOperation: 'destination-out', stroke: 'rgba(0,0,0,1)' });
    await settle();
    const afterErase = { onStroke: pixel(50, 20) };

    // Undo puts the painted pixels back.
    OS.undo();
    await settle();
    const afterUndo = { onStroke: pixel(50, 20) };

    // With the opt-out on, the stroke stays an editable path.
    OS._prefs.vectorStrokes = true;
    OS.setTool('brush');
    const vectorPath = stroke();
    await settle();
    const afterOptOut = {
      pathOnCanvas: OS.canvas.getObjects().includes(vectorPath),
      inLayer: OS.layers[OS.activeLayerIdx].objects.includes(vectorPath),
      type: vectorPath.type
    };
    OS._prefs.vectorStrokes = false;

    return { afterBrush, afterErase, afterUndo, afterOptOut };
  });

  // The path is gone; the layer holds one raster carrying the paint.
  expect(result.afterBrush.pathOnCanvas).toBe(false);
  expect(result.afterBrush.layerTypes).toEqual(['image']);
  expect(result.afterBrush.onStroke).toEqual([255, 0, 0, 255]);
  expect(result.afterBrush.offStroke[3]).toBe(0);
  // Erasing clears the alpha it was drawn over.
  expect(result.afterErase.onStroke[3]).toBe(0);
  // And undo brings the paint back.
  expect(result.afterUndo.onStroke[3]).toBeGreaterThan(200);
  // The preference keeps the old vector behaviour available.
  expect(result.afterOptOut.pathOnCanvas).toBe(true);
  expect(result.afterOptOut.inLayer).toBe(true);
  // Still a path, not flattened into the raster.
  expect(result.afterOptOut.type).toBe('path');
});

test('object tools create their own layer instead of stacking @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Issue #3: "the corresponding text layer will pop up on the layer page ...
  // instead of stacking all elements under one layer". Everything landed in
  // whichever layer was active, so the panel described a one-layer document
  // however much was on the canvas.
  const result = await page.evaluate(async () => {
    OS.createNewDocument(300, 200, '#ffffff');
    const before = OS.layers.length;

    OS.setTool('text');
    OS.onMouseDown({ e: {}, absolutePointer: { x: 30, y: 30 }, pointer: { x: 30, y: 30 } });
    const afterText = OS.layers.map(l => ({ name: l.name, count: l.objects.length }));
    const textLayer = OS.layers[OS.activeLayerIdx];

    // Deleting the layer takes its object with it.
    const objectsBeforeDelete = OS.canvas.getObjects().length;
    OS.deleteLayer();
    const objectsAfterDelete = OS.canvas.getObjects().length;

    // The opt-out restores the previous behaviour.
    OS._prefs.stackNewObjects = true;
    const layersBeforeOptOut = OS.layers.length;
    OS.setTool('text');
    OS.onMouseDown({ e: {}, absolutePointer: { x: 60, y: 60 }, pointer: { x: 60, y: 60 } });
    const layersAfterOptOut = OS.layers.length;
    OS._prefs.stackNewObjects = false;

    return {
      before,
      afterText,
      textLayerNamed: textLayer.name,
      textLayerCount: textLayer.objects.length,
      objectsBeforeDelete,
      objectsAfterDelete,
      layersBeforeOptOut,
      layersAfterOptOut
    };
  });

  // A layer was added for the text, named after it, holding only it.
  expect(result.afterText.length).toBe(result.before + 1);
  expect(result.textLayerNamed).toBe('Type here');
  expect(result.textLayerCount).toBe(1);
  // The original layers are untouched.
  expect(result.afterText[0].name).toBe('Background');
  expect(result.afterText[1].count).toBe(0);
  // Deleting that layer removes its object from the canvas too.
  expect(result.objectsAfterDelete).toBeLessThan(result.objectsBeforeDelete);
  // With the preference on, objects stack in the active layer as before.
  expect(result.layersAfterOptOut).toBe(result.layersBeforeOptOut);
});

test('warns before a document rebuild discards guides, frames or PSD metadata @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Crop, flatten and canvas rotate/flip all rebuild the document through
  // createNewDocument, which silently drops all three. The user saw only
  // "Cropped to W x H".
  const clean = await page.evaluate(async () => {
    OS.createNewDocument(80, 60, '#ffffff');
    return { loss: OS._documentStateLoss(), modal: !!document.querySelector('.modal-overlay') };
  });
  expect(clean.loss).toEqual([]);

  const withState = await page.evaluate(async () => {
    OS.createNewDocument(80, 60, '#ffffff');
    OS.guides = [{ axis: 'h', position: 20 }];
    OS._animFrames = ['a', 'b'];
    const loss = OS._documentStateLoss();
    // A destructive rebuild now has to ask first.
    const pending = OS.flattenImage();
    await new Promise(r => setTimeout(r, 120));
    const overlay = document.querySelector('.modal-overlay');
    const text = overlay ? overlay.textContent : '';
    overlay?.querySelector('[data-modal-cancel]')?.click();
    const result = await pending;
    return {
      loss,
      asked: Boolean(overlay),
      mentionsGuide: /guide/i.test(text),
      mentionsFrames: /animation frame/i.test(text),
      result,
      guidesKept: OS.guides.length,
      framesKept: OS._animFrames.length
    };
  });

  expect(withState.loss).toContain('1 guide');
  expect(withState.loss).toContain('2 animation frames');
  expect(withState.asked).toBe(true);
  expect(withState.mentionsGuide).toBe(true);
  expect(withState.mentionsFrames).toBe(true);
  // Cancelling leaves the document exactly as it was.
  expect(withState.result).toBe(false);
  expect(withState.guidesKept).toBe(1);
  expect(withState.framesKept).toBe(2);
});

test('selection bounds are document coordinates whatever made them @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Bounds used to mean screen pixels for a marquee and document pixels for a
  // mask, so consumers disagreed about which they were holding and a project
  // saved at one zoom reopened with the box in the wrong place and size.
  const result = await page.evaluate(async () => {
    OS.createNewDocument(200, 150, '#ffffff');
    OS.setTool('marquee-rect');

    const dragMarquee = (zoom) => {
      OS.canvas.setViewportTransform([zoom, 0, 0, zoom, 0, 0]);
      const el = document.getElementById('selection-overlay');
      // The overlay is written in screen pixels while dragging; the commit
      // converts. A 40x30 document rect starting at (20,15).
      el.style.display = 'block';
      el.style.left = `${20 * zoom}px`;
      el.style.top = `${15 * zoom}px`;
      el.style.width = `${40 * zoom}px`;
      el.style.height = `${30 * zoom}px`;
      OS._marqueeStart = { x: 20, y: 15 };
      OS.state.isDrawing = true;
      OS.onMouseUp({ e: {} });
      return { ...OS._selectionBounds };
    };

    const at1 = dragMarquee(1);
    const at3 = dragMarquee(3);

    // And the placed box tracks the viewport rather than being baked into it.
    OS.canvas.setViewportTransform([2, 0, 0, 2, 10, 5]);
    OS._placeSelectionBox({ borderRadius: '0' });
    const box = document.getElementById('selection-overlay');
    return {
      at1,
      at3,
      toCanvas: OS._selToCanvasCoords(),
      placed: {
        left: parseFloat(box.style.left),
        top: parseFloat(box.style.top),
        width: parseFloat(box.style.width)
      }
    };
  });

  // Same document rectangle, whatever zoom it was drawn at.
  expect(result.at1.w).toBeCloseTo(40, 1);
  expect(result.at3.w).toBeCloseTo(40, 1);
  expect(result.at1.x).toBeCloseTo(result.at3.x, 1);
  expect(result.at1.y).toBeCloseTo(result.at3.y, 1);
  // _selToCanvasCoords hands back document coordinates without converting.
  expect(result.toCanvas.w).toBeCloseTo(40, 1);
  // Placed at 2x with a pan: 20*2+10 = 50, 15*2+5 = 35, 40*2 = 80.
  expect(result.placed.left).toBeCloseTo(50, 0);
  expect(result.placed.top).toBeCloseTo(35, 0);
  expect(result.placed.width).toBeCloseTo(80, 0);
});

test('exposes list, tool and status state to assistive technology @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.createNewDocument(40, 30, '#ffffff');
    OS.addLayer();
    OS.setTool('brush');
    OS.updateHistoryPanel();
    await new Promise(r => setTimeout(r, 100));

    const optionsIn = (id) => [...document.querySelectorAll(`#${id} [role="option"]`)];
    const layers = optionsIn('layers-list');
    const history = optionsIn('history-list');
    const tools = [...document.querySelectorAll('.tool-btn')];
    const toasts = document.getElementById('toast-container');
    return {
      listboxes: [...document.querySelectorAll('[role="listbox"]')]
        .filter(el => !el.hidden && !el.closest('[aria-hidden="true"]')).length,
      layerOptions: layers.length,
      layerSelected: layers.filter(el => el.getAttribute('aria-selected') === 'true').length,
      historyOptions: history.length,
      historySelected: history.filter(el => el.getAttribute('aria-selected') === 'true').length,
      toolsWithPressed: tools.filter(el => el.hasAttribute('aria-pressed')).length,
      toolCount: tools.length,
      pressedTool: tools.filter(el => el.getAttribute('aria-pressed') === 'true').map(el => el.dataset.tool),
      toastHidden: toasts.getAttribute('aria-hidden'),
      toastLive: toasts.getAttribute('aria-live')
    };
  });

  expect(result.listboxes).toBe(2);
  // A listbox with no options is not a list to a screen reader.
  expect(result.layerOptions).toBeGreaterThan(1);
  expect(result.layerSelected).toBe(1);
  expect(result.historyOptions).toBeGreaterThan(0);
  expect(result.historySelected).toBe(1);
  // Every tool button reports whether it is the active one.
  expect(result.toolsWithPressed).toBe(result.toolCount);
  // A tool can appear both in the dock and in its flyout group.
  expect(result.pressedTool.length).toBeGreaterThan(0);
  expect([...new Set(result.pressedTool)]).toEqual(['brush']);
  // Toasts carry errors and destructive-action feedback, so they must reach AT.
  expect(result.toastHidden).toBeNull();
  expect(result.toastLive).toBe('polite');
});

test('dismissing the welcome screen twice does not double-bind the editor @cross-browser', async ({ page }) => {
  await openApp(page);

  // A PWA file launch calls dismissWelcome() after an await chain, so it can
  // land after the user has already clicked through — which used to run the
  // whole initialisation block a second time and duplicate every
  // document-level listener.
  const result = await page.evaluate(async () => {
    OS.dismissWelcome();
    OS.dismissWelcome();
    OS.dismissWelcome();
    await new Promise(r => setTimeout(r, 450));

    OS.createNewDocument(60, 40, '#ffffff');

    // Count how often one keystroke reaches the handler: a duplicate
    // registration is exactly what the double dismissal used to create.
    let undos = 0;
    const realUndo = OS.undo.bind(OS);
    OS.undo = () => { undos += 1; return realUndo(); };
    let pastes = 0;
    const realPaste = OS._pasteSelection.bind(OS);
    OS._pasteSelection = () => { pastes += 1; };

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 250));

    OS.undo = realUndo;
    OS._pasteSelection = realPaste;
    return { flyoutHosts: document.querySelectorAll('#flyout-host').length, undos, pastes };
  });

  expect(result.flyoutHosts).toBeLessThanOrEqual(1);
  expect(result.undos).toBe(1);
  expect(result.pastes).toBe(1);
});

test('applying a filter commits the value on screen, not the last debounce tick @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // The preview is debounced by 50ms while Apply saved history immediately and
  // nulled the target, so the pending tick returned early and the committed
  // image carried the previous slider value under the new one's label.
  const result = await page.evaluate(async () => {
    const seen = [];
    const original = OS._filterPreviewNow.bind(OS);
    OS._filterPreviewNow = (name) => { seen.push(OS._filterName); return original(name); };
    OS._filterName = 'Brightness';
    OS._filterTarget = null;

    // Schedule a preview and apply inside the debounce window.
    OS._filterPreview('Brightness');
    const pendingBefore = OS._filterPreviewDebounce !== null;
    OS._filterApply();
    const pendingAfter = OS._filterPreviewDebounce;
    OS._filterPreviewNow = original;
    return { pendingBefore, pendingAfter, flushed: seen.length };
  });

  expect(result.pendingBefore).toBe(true);
  // Apply forced the pending tick through and left nothing scheduled.
  expect(result.flushed).toBe(1);
  expect(result.pendingAfter).toBeNull();
});

test('deleting a mask selection edits the image, not the selection tint @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // The tint overlay is an image and is always added last, so "topmost image"
  // resolved to it whenever a mask was active. It belongs to no layer, so the
  // edit guard refused the write — and the caller toasted success anyway.
  const result = await page.evaluate(async () => {
    OS.createNewDocument(80, 60, '#ffffff');
    const block = new fabric.Rect({ left: 0, top: 0, width: 80, height: 60, fill: '#00aa00', selectable: false });
    OS.canvas.add(block);
    OS.layers[OS.activeLayerIdx].objects.push(block);
    OS.flattenImage();
    await new Promise(r => setTimeout(r, 300));

    const w = Math.round(OS.canvasW), h = Math.round(OS.canvasH);
    const mask = new Uint8Array(w * h);
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) mask[y * w + x] = 255;
    OS._setPixelSelectionMask(mask, w, h);
    OS.canvas.discardActiveObject();
    // The tint overlay is added from an async image decode.
    for (let i = 0; i < 40 && !OS.canvas.getObjects().some(o => o._wandOverlay); i++) {
      await new Promise(r => setTimeout(r, 25));
    }

    const overlayPresent = OS.canvas.getObjects().some(o => o._wandOverlay);
    OS._deleteSelectionPixels();
    await new Promise(r => setTimeout(r, 400));

    const data = OS._readDocumentImageData().data;
    const at = (x, y) => data[(y * w + x) * 4 + 3];
    return { overlayPresent, insideAlpha: at(20, 20), outsideAlpha: at(60, 50) };
  });

  expect(result.overlayPresent).toBe(true);
  // Inside the mask is now transparent; outside is untouched.
  expect(result.insideAlpha).toBe(0);
  expect(result.outsideAlpha).toBe(255);
});

test('Grow and Similar write full coverage, not a token 1 @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // The mask is 0-255 coverage. These two wrote 1, which reads as 0.4%
  // selected: the tint rounded to invisible and a delete left the pixels
  // ~99.6% intact while reporting success.
  const result = await page.evaluate(() => {
    OS.createNewDocument(120, 90, '#ffffff');
    const block = new fabric.Rect({ left: 20, top: 20, width: 60, height: 40, fill: '#2244ff', selectable: false });
    OS.canvas.add(block);
    OS.layers[OS.activeLayerIdx].objects.push(block);
    OS.canvas.renderAll();

    const w = Math.round(OS.canvasW), h = Math.round(OS.canvasH);
    const seed = new Uint8Array(w * h);
    for (let y = 30; y < 40; y++) for (let x = 30; x < 40; x++) seed[y * w + x] = 255;
    OS.state.wandTolerance = 30;

    OS._setPixelSelectionMask(seed, w, h);
    OS.growSelection();
    const afterGrow = [...new Set(OS._selectionMask.mask)].sort((a, b) => a - b);

    OS._setPixelSelectionMask(seed.slice(), w, h);
    OS.similarSelection();
    const afterSimilar = [...new Set(OS._selectionMask.mask)].sort((a, b) => a - b);
    let similarCount = 0;
    for (const v of OS._selectionMask.mask) if (v === 255) similarCount++;
    return { afterGrow, afterSimilar, similarCount };
  });

  expect(result.afterGrow).toEqual([0, 255]);
  expect(result.afterSimilar).toEqual([0, 255]);
  // Similar spreads from the seed across the whole blue block.
  expect(result.similarCount).toBeGreaterThan(2000);
});

test('the magic wand selects the same pixels at any zoom or pan @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Sampling used to come off the viewport surface, so the selection depended
  // on the zoom it was made at — and below 100% it was built at that reduced
  // resolution and upsampled back, leaving a stepped edge.
  const runs = await page.evaluate(async () => {
    OS.createNewDocument(200, 150, '#ffffff');
    const block = new fabric.Rect({ left: 40, top: 30, width: 80, height: 60, fill: '#ff0000', selectable: false });
    OS.canvas.add(block);
    OS.layers[OS.activeLayerIdx].objects.push(block);
    OS.canvas.renderAll();
    OS.setTool('wand');
    OS.state.wandTolerance = 20;
    OS.state.wandContiguous = true;

    const sample = (transform) => {
      OS.canvas.setViewportTransform(transform);
      OS.canvas.renderAll();
      OS._doMagicWand({ x: 80, y: 60 });
      const m = OS._selectionMask;
      let count = 0;
      for (let i = 0; i < m.mask.length; i++) if (m.mask[i]) count++;
      return { w: m.w, h: m.h, count, bounds: { ...OS._selectionBounds } };
    };

    return {
      identity: sample([1, 0, 0, 1, 0, 0]),
      zoomedOut: sample([0.5, 0, 0, 0.5, 0, 0]),
      zoomedInPanned: sample([3, 0, 0, 3, -120, -90]),
      doc: [Math.round(OS.canvasW), Math.round(OS.canvasH)]
    };
  });

  // The mask is always the document's size, never the viewport's.
  for (const run of [runs.identity, runs.zoomedOut, runs.zoomedInPanned]) {
    expect([run.w, run.h]).toEqual(runs.doc);
  }
  // The red block is 80x60 = 4800px. Allow a small edge tolerance.
  expect(runs.identity.count).toBeGreaterThan(4000);
  expect(runs.zoomedOut.count).toBe(runs.identity.count);
  expect(runs.zoomedInPanned.count).toBe(runs.identity.count);
  expect(runs.zoomedOut.bounds).toEqual(runs.identity.bounds);
  expect(runs.zoomedInPanned.bounds).toEqual(runs.identity.bounds);
});

test('selects the shape a lasso encloses rather than its bounding box', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(() => {
    OS.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    OS.setTool('lasso');
    // A right triangle: (10,10) (110,10) (10,110). Its bounding box is the
    // whole 100x100 square, but only the lower-left half is enclosed.
    OS._lassoPoints = ['10,10', '110,10', '10,110'];
    OS._lassoDoubleClick();

    const mask = OS._selectionMask;
    // Mask values are 0-255 coverage; the interior is fully selected and the
    // antialiased hypotenuse carries partial coverage.
    const at = (x, y) => mask.mask[y * mask.w + x];
    let selected = 0;
    for (let i = 0; i < mask.mask.length; i++) if (mask.mask[i] === 255) selected++;
    return {
      dims: [mask.w, mask.h],
      docDims: [Math.round(OS.canvasW), Math.round(OS.canvasH)],
      bounds: { ...OS._selectionBounds },
      insideTriangle: at(20, 20) === 255,
      // Just inside the bounding box but outside the hypotenuse.
      outsideHypotenuse: at(100, 100) === 0,
      // The diagonal edge is soft rather than a hard staircase.
      // The antialiased hypotenuse leaves partially-covered pixels rather than
      // a hard staircase; a binary mask would have none at all.
      softEdgeValues: mask.mask.reduce((total, v) => total + (v > 0 && v < 255 ? 1 : 0), 0),
      selected
    };
  });

  expect(result.dims).toEqual(result.docDims);
  expect(result.insideTriangle).toBe(true);
  expect(result.outsideHypotenuse).toBe(true);
  expect(result.softEdgeValues).toBeGreaterThan(0);
  // Roughly half the 100x100 bounding box, not all of it.
  expect(result.selected).toBeGreaterThan(4200);
  expect(result.selected).toBeLessThan(5800);
  expect(result.bounds.w).toBeGreaterThan(90);
  expect(result.bounds.h).toBeGreaterThan(90);
});

test('maps lasso points through the viewport before rasterising', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(() => {
    // Same on-screen gesture, but drawn while zoomed to 2x and panned.
    OS.canvas.setViewportTransform([2, 0, 0, 2, 40, 60]);
    OS.setTool('lasso');
    OS._lassoPoints = ['60,80', '160,80', '160,180', '60,180'];
    OS._lassoDoubleClick();
    const mask = OS._selectionMask;
    const at = (x, y) => mask.mask[y * mask.w + x];
    return {
      bounds: { ...OS._selectionBounds },
      // Screen (60,80) is document (10,10); screen (160,180) is document (60,60).
      insideDoc: at(30, 30) === 255,
      outsideDoc: at(80, 80) === 0
    };
  });

  expect(result.bounds).toEqual({ x: 10, y: 10, w: 50, h: 50 });
  expect(result.insideDoc).toBe(true);
  expect(result.outsideDoc).toBe(true);
});

test('feathers a selection into partial coverage instead of dilating it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(() => {
    OS.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const dw = Math.round(OS.canvasW), dh = Math.round(OS.canvasH);
    const mask = new Uint8Array(dw * dh);
    for (let y = 40; y < 80; y++) for (let x = 40; x < 80; x++) mask[y * dw + x] = 1;
    OS._setPixelSelectionMask(mask, dw, dh);

    const before = OS._selectionMask.mask.reduce((t, v) => t + (v > 0 && v < 255 ? 1 : 0), 0);
    OS._doModifySelection('feather', 6);
    const after = OS._selectionMask;
    const at = (x, y) => after.mask[y * after.w + x];

    let partial = 0;
    for (let i = 0; i < after.mask.length; i++) if (after.mask[i] > 0 && after.mask[i] < 255) partial++;
    return {
      before,
      partial,
      core: at(60, 60),
      justOutside: at(40, 60),
      farOutside: at(20, 60)
    };
  });

  expect(result.before).toBe(0);
  // The gradient the blur computes is kept rather than thresholded back to a
  // hard edge one pixel wider than it started.
  expect(result.partial).toBeGreaterThan(100);
  expect(result.core).toBe(255);
  expect(result.justOutside).toBeGreaterThan(0);
  expect(result.justOutside).toBeLessThan(255);
  expect(result.farOutside).toBe(0);
});

test('deletes through a downscaled layer without leaving gaps', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const oc = document.createElement('canvas');
    oc.width = 300; oc.height = 300;
    const ctx = oc.getContext('2d');
    ctx.fillStyle = 'rgb(30,140,220)';
    ctx.fillRect(0, 0, 300, 300);
    const image = await new Promise(resolve => {
      const el = new Image();
      el.onload = () => resolve(new fabric.Image(el, {
        left: 0, top: 0, originX: 'left', originY: 'top', scaleX: 1 / 3, scaleY: 1 / 3
      }));
      el.src = oc.toDataURL();
    });
    OS.canvas.add(image);
    OS.layers[OS.activeLayerIdx].objects.push(image);
    OS.canvas.setActiveObject(image);

    // 30x30 document pixels covers 90x90 image pixels at 1/3 scale — the case
    // where stamping mask pixels onto the image left two out of three untouched.
    const dw = Math.round(OS.canvasW), dh = Math.round(OS.canvasH);
    const mask = new Uint8Array(dw * dh);
    for (let y = 10; y < 40; y++) for (let x = 10; x < 40; x++) mask[y * dw + x] = 1;
    OS._setPixelSelectionMask(mask, dw, dh);

    OS._deleteSelectionPixels();
    await new Promise(resolve => setTimeout(resolve, 700));

    const active = OS.canvas.getObjects().find(o => o.type === 'image' && !o._wandOverlay);
    const el = active.getElement();
    const probe = document.createElement('canvas');
    probe.width = el.naturalWidth || el.width;
    probe.height = el.naturalHeight || el.height;
    probe.getContext('2d').drawImage(el, 0, 0);
    const data = probe.getContext('2d').getImageData(0, 0, probe.width, probe.height).data;

    let survivors = 0, clearedOutside = 0;
    for (let y = 0; y < probe.height; y++) {
      for (let x = 0; x < probe.width; x++) {
        const alpha = data[(y * probe.width + x) * 4 + 3];
        const inside = x >= 30 && x < 120 && y >= 30 && y < 120;
        if (inside && alpha !== 0) survivors++;
        if (!inside && alpha === 0) clearedOutside++;
      }
    }
    return { size: probe.width, survivors, clearedOutside };
  });

  expect(result.size).toBe(300);
  expect(result.survivors).toBe(0);
  expect(result.clearedOutside).toBe(0);
});

test('meets WCAG 2.2 text contrast across every theme @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const audit = await page.evaluate(async () => {
    const parse = (value) => {
      const match = String(value).match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    const relative = ({ r, g, b }) => {
      const channel = (value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const composite = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1
    });
    const contrast = (a, b) => {
      const la = relative(a), lb = relative(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const backdrop = (el) => {
      let node = el, stack = null;
      while (node && node !== document.documentElement) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg && bg.a > 0) {
          stack = stack ? composite(stack, bg) : bg;
          if (stack.a >= 1) return stack;
        }
        node = node.parentElement;
      }
      const root = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 0, g: 0, b: 0, a: 1 };
      return stack ? composite(stack, root) : root;
    };

    const failures = [];
    let sampled = 0;
    const auditStyle = document.createElement('style');
    auditStyle.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
    document.head.appendChild(auditStyle);
    for (const theme of ['default', 'midnight', 'oled', 'light']) {
      OS.setTheme(theme, { silent: true, persist: false });
      // Open representative surfaces so muted text inside dialogs and panels is
      // measured, not only the resting studio chrome.
      document.querySelectorAll('.modal-overlay,.filter-panel').forEach(node => node.remove());
      try { OS.showPreferences(); } catch (error) {}
      try { OS.newImage(); } catch (error) {}
      try { OS.showExportSettings?.(); } catch (error) {}
      try { OS.showShortcuts?.(); } catch (error) {}
      try { OS.showLevelsDialog?.(); } catch (error) {}
      document.querySelectorAll('.panel-tab').forEach(tab => { try { tab.click(); } catch (error) {} });
      document.getElementById('welcome-overlay')?.classList.remove('hidden');
      OS.toast('Contrast sample', 'info');
      await new Promise(resolve => setTimeout(resolve, 250));

      for (const el of document.querySelectorAll('body *')) {
        if (!el.getClientRects().length) continue;
        const own = [...el.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent.trim()).join('');
        if (!own) continue;
        const style = getComputedStyle(el);
        const fg = parse(style.color);
        if (!fg || fg.a === 0) continue;
        const size = parseFloat(style.fontSize);
        const weight = Number(style.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const required = large ? 3 : 4.5;
        const bg = backdrop(el);
        const ratio = contrast(composite(fg, bg), bg);
        sampled++;
        if (ratio < required) {
          failures.push(`${theme} ${ratio.toFixed(2)}<${required} ${size}px ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${own.slice(0, 24)}"`);
        }
      }
    }
    auditStyle.remove();
    return { failures: [...new Set(failures)], sampled };
  });

  expect(audit.sampled).toBeGreaterThan(100);
  expect(audit.failures).toEqual([]);
});

test('gives every pointer target at least 24 by 24 CSS pixels', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const undersized = await page.evaluate(async () => {
    try { OS.showPreferences(); } catch (error) {}
    try { OS.newImage(); } catch (error) {}
    document.querySelectorAll('.panel-tab').forEach(tab => { try { tab.click(); } catch (error) {} });
    await new Promise(resolve => setTimeout(resolve, 250));

    const selector = 'button,a[href],input:not([type="hidden"]),select,[role="button"],[role="menuitem"],[role="tab"],[tabindex]:not([tabindex="-1"])';
    const offenders = new Set();
    for (const el of document.querySelectorAll(selector)) {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.width >= 24 && rect.height >= 24) continue;
      // Sliders, checkboxes, and radios are sized by the platform.
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'range' || type === 'checkbox' || type === 'radio') continue;
      offenders.add(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`);
    }
    return [...offenders];
  });

  expect(undersized).toEqual([]);
});

test('offers a keyboard path for moving, resizing, and reordering', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const rect = new fabric.Rect({ left: 100, top: 100, width: 60, height: 40, fill: '#888', strokeWidth: 0 });
    OS.canvas.add(rect);
    OS.layers[OS.activeLayerIdx].objects.push(rect);
    OS.canvas.setActiveObject(rect);

    const press = (key, init = {}) => document.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    );

    press('ArrowRight');
    press('ArrowDown');
    const nudged = { left: rect.left, top: rect.top };

    press('ArrowRight', { shiftKey: true });
    const coarse = rect.left;

    press('ArrowRight', { altKey: true });
    press('ArrowDown', { altKey: true });
    const resized = { w: Math.round(rect.width * rect.scaleX), h: Math.round(rect.height * rect.scaleY) };

    OS.addLayer();
    await new Promise(resolve => setTimeout(resolve, 50));
    const before = OS.activeLayerIdx;
    const names = OS.layers.map(layer => layer.name);
    press('ArrowDown', { ctrlKey: true, altKey: true });
    const afterNames = OS.layers.map(layer => layer.name);

    return {
      nudged,
      coarse,
      resized,
      reordered: names.join('|') !== afterNames.join('|'),
      movedIndex: OS.activeLayerIdx !== before
    };
  });

  expect(result.nudged).toEqual({ left: 101, top: 101 });
  // Shift makes the step coarse rather than doing nothing.
  expect(result.coarse).toBe(111);
  expect(result.resized).toEqual({ w: 61, h: 41 });
  expect(result.reordered).toBe(true);
  expect(result.movedIndex).toBe(true);
});

test('applies one edit-currency rule to every commit path', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const messages = [];
    const realToast = OS.toast.bind(OS);
    OS.toast = (msg, type) => { messages.push(String(msg)); return realToast(msg, type); };

    const makeImage = async () => {
      const oc = document.createElement('canvas');
      oc.width = 8; oc.height = 8;
      const ctx = oc.getContext('2d');
      ctx.fillStyle = '#c33';
      ctx.fillRect(0, 0, 8, 8);
      return new Promise(resolve => {
        const el = new Image();
        el.onload = () => resolve(new fabric.Image(el, { left: 0, top: 0 }));
        el.src = oc.toDataURL();
      });
    };

    const outcomes = {};

    // 1. Target removed from the canvas after the work started.
    let image = await makeImage();
    OS.canvas.add(image);
    OS.layers[OS.activeLayerIdx].objects.push(image);
    OS.canvas.setActiveObject(image);
    let info = OS._getActiveImageData();
    OS.canvas.remove(image);
    outcomes.removed = await OS._commitImageData(info, 'Removed target');

    // 2. Target still present but its layer is locked.
    image = await makeImage();
    OS.canvas.add(image);
    OS.layers[OS.activeLayerIdx].objects.push(image);
    OS.canvas.setActiveObject(image);
    info = OS._getActiveImageData();
    OS.layers[OS.activeLayerIdx].locked = true;
    outcomes.locked = await OS._commitImageData(info, 'Locked layer');
    OS.layers[OS.activeLayerIdx].locked = false;

    // 3. Unchanged document still commits.
    image = await makeImage();
    OS.canvas.add(image);
    OS.layers[OS.activeLayerIdx].objects.push(image);
    OS.canvas.setActiveObject(image);
    info = OS._getActiveImageData();
    outcomes.current = await OS._commitImageData(info, 'Current');

    OS.toast = realToast;
    return {
      outcomes,
      // Both rejections read the same, rather than one path saying "the
      // document changed" and the next saying "edit cancelled".
      distinctRejections: [...new Set(messages.filter(m => m.includes('discarded') || m.includes('cancelled')))]
    };
  });

  expect(result.outcomes.removed).toBe(false);
  expect(result.outcomes.locked).toBe(false);
  expect(result.outcomes.current).toBe(true);
  expect(result.distinctRejections).toEqual([
    'Filter result discarded because the document or target layer changed'
  ]);
});

test('records opened documents in the welcome screen Recent list', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.removeItem('openshop_recent'));
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Nothing has been opened yet, so the section stays empty rather than
  // rendering an empty heading.
  await expect(page.locator('#recent-files-area .recent-item')).toHaveCount(0);

  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const created = await page.evaluate(async () => {
    OS.createNewDocument(640, 480, { resetProject: true });
    OS._docName = 'Recent Smoke';
    OS.trackRecentFile(OS._docName, 640, 480);
    // A project open records the canvas it actually produced.
    OS.createNewDocument(320, 200, { resetProject: true });
    OS._docName = 'Second Doc';
    OS.trackRecentFile(OS._docName, OS.canvasW, OS.canvasH);
    // Garbage dimensions are refused instead of writing "NaNxNaN".
    OS.trackRecentFile('Broken', Number.NaN, 100);
    return JSON.parse(localStorage.getItem('openshop_recent') || '[]');
  });

  expect(created.map(entry => entry.name)).toEqual(['Second Doc', 'Recent Smoke']);
  expect(created[0].dims).toBe('320x200');
  expect(created[1].dims).toBe('640x480');

  await page.reload({ waitUntil: 'domcontentloaded' });
  const rows = page.locator('#recent-files-area .recent-item');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Second Doc');
  await expect(rows.first()).toContainText('320x200');

  // The rows are a record, not a reopen shortcut, so they must not advertise
  // themselves as clickable.
  const presentation = await page.evaluate(() => {
    const row = document.querySelector('#recent-files-area .recent-item');
    return {
      tag: row.tagName,
      cursor: getComputedStyle(row).cursor,
      listRole: row.parentElement.getAttribute('role')
    };
  });
  expect(presentation.tag).toBe('LI');
  expect(presentation.cursor).toBe('default');
  expect(presentation.listRole).toBe('list');
});

test('honours the New Image background choice instead of ignoring it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  // Sample through the export path so the reading is in document space and
  // independent of the current zoom.
  const sampleCentre = () => page.evaluate(async () => {
    const url = OS._captureCanvasRaster();
    const image = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const probe = document.createElement('canvas');
    probe.width = image.width; probe.height = image.height;
    probe.getContext('2d').drawImage(image, 0, 0);
    return [...probe.getContext('2d')
      .getImageData(Math.round(image.width / 2), Math.round(image.height / 2), 1, 1).data];
  });

  // Transparent stays the default: only the checkerboard boundary is present.
  const transparent = await page.evaluate(() => {
    OS.createNewDocument(80, 60, { resetProject: true });
    return OS.layers[0].objects.map(o => o.name);
  });
  expect(transparent).toEqual(['__boundary__']);

  // White fills the canvas for real.
  await page.evaluate(() => OS.createNewDocument(80, 60, { resetProject: true, background: '#ffffff' }));
  expect(await page.evaluate(() => OS.layers[0].objects.map(o => o.name)))
    .toEqual(['__boundary__', 'Background Fill']);
  expect(await sampleCentre()).toEqual([255, 255, 255, 255]);

  // A custom colour lands as chosen.
  await page.evaluate(() => OS.createNewDocument(80, 60, { resetProject: true, background: '#3366cc' }));
  expect(await sampleCentre()).toEqual([51, 102, 204, 255]);

  // A malformed value falls back to transparent rather than throwing.
  const bogus = await page.evaluate(() => {
    OS.createNewDocument(80, 60, { resetProject: true, background: 'javascript:alert(1)' });
    return OS.layers[0].objects.map(o => o.name);
  });
  expect(bogus).toEqual(['__boundary__']);

  // The dialog's colour swatch is only enabled when it can be used.
  await page.evaluate(() => OS.newImage());
  const modeSelect = page.locator('#ni-bg-mode');
  await expect(page.locator('#ni-bg')).toBeDisabled();
  await modeSelect.selectOption('custom');
  await expect(page.locator('#ni-bg')).toBeEnabled();
  await modeSelect.selectOption('white');
  await expect(page.locator('#ni-bg')).toBeDisabled();

  // Creating through the dialog carries the choice through.
  await page.locator('#ni-w').fill('60');
  await page.locator('#ni-h').fill('40');
  await page.getByRole('button', { name: 'Create' }).click();
  // The scratch documents above left the project dirty, so the discard guard
  // stands between Create and the new canvas.
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.locator('.modal-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => OS.layers[0].objects.map(o => o.name)))
    .toEqual(['__boundary__', 'Background Fill']);
  expect(await sampleCentre()).toEqual([255, 255, 255, 255]);
});

test('reads every palette format the file picker advertises', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const asFile = (data, name, type) => new File([data], name, { type });

    // GIMP palette: header, comments, and a Columns line all have to be skipped.
    const gpl = [
      'GIMP Palette',
      'Name: Smoke',
      'Columns: 4',
      '# a comment',
      '255   0   0\tRed',
      '  0 128   0 Green',
      '17 34 51',
      '999 0 0 out of range'
    ].join('\n');

    // Minimal ASEF file with one RGB entry and one CMYK entry.
    const encodeAse = (entries) => {
      const parts = [];
      const header = new DataView(new ArrayBuffer(12));
      header.setUint8(0, 0x41); header.setUint8(1, 0x53); header.setUint8(2, 0x45); header.setUint8(3, 0x46);
      header.setUint16(4, 1, false); header.setUint16(6, 0, false);
      header.setUint32(8, entries.length, false);
      parts.push(new Uint8Array(header.buffer));
      for (const entry of entries) {
        const values = entry.values;
        const bodyLength = 2 + 2 + 4 + values.length * 4 + 2;
        const block = new DataView(new ArrayBuffer(6 + bodyLength));
        block.setUint16(0, 0x0001, false);
        block.setUint32(2, bodyLength, false);
        block.setUint16(6, 1, false);           // one UTF-16 char (the null terminator)
        block.setUint16(8, 0, false);
        for (let i = 0; i < 4; i++) block.setUint8(10 + i, entry.model.charCodeAt(i));
        values.forEach((v, i) => block.setFloat32(14 + i * 4, v, false));
        block.setUint16(14 + values.length * 4, 0, false);
        parts.push(new Uint8Array(block.buffer));
      }
      const total = parts.reduce((sum, p) => sum + p.length, 0);
      const out = new Uint8Array(total);
      let offset = 0;
      for (const p of parts) { out.set(p, offset); offset += p.length; }
      return out;
    };
    const ase = encodeAse([
      { model: 'RGB ', values: [1, 0, 0] },
      { model: 'Gray', values: [0.5] }
    ]);

    const json = JSON.stringify({ colors: ['#123456', 'not a colour', '#abcdef'] });

    const out = {};
    out.gpl = await OS.readPaletteFile(asFile(gpl, 'smoke.gpl', 'text/plain'));
    out.ase = await OS.readPaletteFile(asFile(ase, 'smoke.ase', 'application/octet-stream'));
    out.json = await OS.readPaletteFile(asFile(json, 'smoke.json', 'application/json'));
    // A GIMP palette named .txt is still detected from its header.
    out.sniffed = await OS.readPaletteFile(asFile(gpl, 'smoke.txt', 'text/plain'));

    try {
      await OS.readPaletteFile(asFile('nonsense', 'broken.ase', 'application/octet-stream'));
      out.badAse = 'accepted';
    } catch (error) { out.badAse = error.message; }

    OS._savedPalette = [];
    out.committed = OS._commitImportedPalette(out.json);
    out.stored = JSON.parse(localStorage.getItem('os_palette') || '[]');
    return out;
  });

  expect(result.gpl).toEqual(['#ff0000', '#008000', '#112233']);
  expect(result.ase).toEqual(['#ff0000', '#808080']);
  expect(result.json).toEqual(['#123456', 'not a colour', '#abcdef']);
  expect(result.sniffed).toEqual(['#ff0000', '#008000', '#112233']);
  expect(result.badAse).toContain('Not an ASE palette');
  // Only the valid hex values survive sanitisation and reach storage.
  expect(result.committed).toBe(2);
  expect(result.stored).toEqual(['#123456', '#abcdef']);
});

test('persists preferences across a reload instead of only saying it did', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { localStorage.removeItem('os_prefs'); localStorage.removeItem('os_theme'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  await page.evaluate(() => OS.showPreferences());
  await expect(page.getByRole('button', { name: 'Export Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset to Defaults' })).toBeVisible();
  const exported = await page.evaluate(() => {
    let download = null;
    OS._downloadBlob = (blob, filename) => { download = { filename, type: blob.type, size: blob.size }; };
    const bundle = OS.exportSettings();
    return { download, bundle };
  });
  expect(exported.download).toMatchObject({ filename: 'openshop-settings.json', type: 'application/json' });
  expect(exported.bundle).toMatchObject({ kind: 'openshop-settings', version: 1, prefs: { version: 2 } });
  await page.getByRole('button', { name: 'Reset to Defaults' }).click();
  const resetOverlay = page.locator('.modal-overlay').filter({ hasText: 'Reset preferences?' });
  await expect(resetOverlay.getByRole('heading', { name: 'Reset preferences?' })).toBeVisible();
  await resetOverlay.getByRole('button', { name: 'Cancel' }).click();
  await expect(resetOverlay).toHaveCount(0);
  await page.locator('#pref-dw').fill('1234');
  await page.locator('#pref-dh').fill('789');
  await page.locator('#pref-grid').fill('42');
  await page.locator('#pref-snap').fill('7');
  await page.locator('#pref-hist').fill('120');
  await page.locator('#pref-accent').evaluate(el => { el.value = '#aa3355'; });
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.modal-overlay')).toHaveCount(0);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('os_prefs')));
  expect(stored).toMatchObject({
    version: 2, defaultW: 1234, defaultH: 789, gridSize: 42, snapTolerance: 7, maxHistory: 120, accent: '#aa3355'
  });

  // The whole set has to come back, not just the language.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Enter Studio' }).click();
  const restored = await page.evaluate(() => ({
    defaultW: OS._prefs.defaultW,
    defaultH: OS._prefs.defaultH,
    gridSize: OS.gridSize,
    snapTolerance: OS._prefs.snapTolerance,
    maxHistory: OS.maxHistory,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  }));
  expect(restored).toEqual({
    defaultW: 1234, defaultH: 789, gridSize: 42, snapTolerance: 7, maxHistory: 120, accent: '#aa3355'
  });

  // A corrupted store cannot disable undo or break the grid on the way in.
  await page.evaluate(() => localStorage.setItem('os_prefs', JSON.stringify({
    version: 1, defaultW: -50, defaultH: 1e9, gridSize: 0, snapTolerance: 'x', maxHistory: 0, accent: 'javascript:alert(1)'
  })));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Enter Studio' }).click();
  const clamped = await page.evaluate(() => ({
    defaultW: OS._prefs.defaultW,
    gridSize: OS.gridSize,
    maxHistory: OS.maxHistory,
    accentIsHex: /^#[0-9a-f]{6}$/i.test(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
  }));
  expect(clamped.defaultW).toBe(1);
  expect(clamped.gridSize).toBe(1);
  expect(clamped.maxHistory).toBe(10);
  expect(clamped.accentIsHex).toBe(true);

  await page.evaluate(() => localStorage.removeItem('os_prefs'));
});

test('previews Levels and Color Balance without a full-resolution PNG per tick', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    // A source large enough to trip the proxy threshold.
    const width = 1600, height = 1000;
    const oc = document.createElement('canvas');
    oc.width = width; oc.height = height;
    const ctx = oc.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#202020');
    gradient.addColorStop(1, '#d0d0d0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const image = await new Promise(resolve => {
      const el = new Image();
      el.onload = () => resolve(new fabric.Image(el, { left: 0, top: 0 }));
      el.src = oc.toDataURL();
    });
    OS.canvas.add(image);
    OS.layers[OS.activeLayerIdx].objects.push(image);
    OS.canvas.setActiveObject(image);

    const displayedBefore = [image.getScaledWidth(), image.getScaledHeight()];

    // Count full-resolution PNG encodes: the old preview did one per tick.
    // Count encodes at exactly the layer's own size — that is what the old
    // preview did every tick. The navigator and histogram legitimately capture
    // the composite at document size, which is a different shape.
    let encodes = 0;
    const realToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      if (this.width === width && this.height === height) encodes++;
      return realToDataURL.apply(this, args);
    };

    OS.showLevelsDialog();
    const panel = document.getElementById('levels-dialog-overlay');
    const proxyPixels = OS._lvlProxy.width * OS._lvlProxy.height;

    // Ignore any encode the editor's own chrome did while the dialog opened;
    // what matters is that ticks add none.
    const encodesBeforeTicks = encodes;
    for (let tick = 0; tick < 8; tick++) {
      panel.querySelector('#lvl-mid').value = String(60 + tick * 20);
      OS._levelsPreview();
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    const encodesDuringPreview = encodes - encodesBeforeTicks;
    const previewElementWidth = OS.canvas.getActiveObject().getElement().width;
    const displayedDuringPreview = [
      OS.canvas.getActiveObject().getScaledWidth(),
      OS.canvas.getActiveObject().getScaledHeight()
    ];

    OS._levelsApply();
    const applied = OS.canvas.getActiveObject();
    const appliedElementWidth = applied.getElement().width;

    HTMLCanvasElement.prototype.toDataURL = realToDataURL;

    // The LUT has to reproduce the old per-pixel maths exactly.
    const params = { shadow: 20, mid: 1.6, high: 240, oBlack: 10, oWhite: 250 };
    const lut = OS._levelsLUT(params);
    let worst = 0;
    for (let v = 0; v < 256; v++) {
      const normalized = Math.max(0, Math.min(1, (v - params.shadow) / (params.high - params.shadow)));
      const expected = Math.round(params.oBlack + Math.pow(normalized, 1 / params.mid) * (params.oWhite - params.oBlack));
      worst = Math.max(worst, Math.abs(lut[v] - expected));
    }

    return {
      sourcePixels: width * height,
      proxyPixels,
      encodesDuringPreview,
      previewElementWidth,
      appliedElementWidth,
      displayedBefore,
      displayedDuringPreview,
      lutWorstError: worst
    };
  });

  // Preview runs on a proxy, not the 1.6 MP original.
  expect(result.proxyPixels).toBeLessThan(result.sourcePixels);
  expect(result.previewElementWidth).toBeLessThan(1600);
  // Eight slider ticks, zero full-resolution PNG encodes.
  expect(result.encodesDuringPreview).toBe(0);
  // Swapping in a smaller bitmap must not resize the layer on the canvas.
  expect(result.displayedDuringPreview[0]).toBeCloseTo(result.displayedBefore[0], 3);
  expect(result.displayedDuringPreview[1]).toBeCloseTo(result.displayedBefore[1], 3);
  // Apply commits at full resolution even though the preview was a proxy.
  expect(result.appliedElementWidth).toBe(1600);
  expect(result.lutWorstError).toBe(0);
});

test('keeps 4K adjustment and filter previews responsive while Apply stays full resolution', async ({ page }) => {
  test.setTimeout(60000);
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const width = 4000, height = 3000;
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext('2d');
    sourceContext.fillStyle = 'rgb(40,80,120)';
    sourceContext.fillRect(0, 0, width, height);

    const image = new fabric.Image(source, { left:0, top:0, name:'4K Preview' });
    OS.canvas.add(image);
    OS.layers[OS.activeLayerIdx].objects.push(image);
    OS.canvas.setActiveObject(image);
    OS.canvas.renderAll();
    const displayedBefore = [image.getScaledWidth(), image.getScaledHeight()];

    OS.showFilterDialog('Brightness');
    const panel = document.getElementById('filter-dialog-overlay');
    const slider = panel.querySelector('#fp-bright');
    let frames = 0;
    let measuring = true;
    const started = performance.now();
    const countFrame = () => {
      if (!measuring) return;
      frames += 1;
      requestAnimationFrame(countFrame);
    };
    requestAnimationFrame(countFrame);
    const previewDurations = [];

    // Space ticks far enough apart that every one renders. The old path ran
    // Fabric over all 12 million pixels per tick and stalled animation frames.
    for (let tick = 0; tick < 8; tick += 1) {
      slider.value = String(10 + tick * 5);
      slider.dispatchEvent(new Event('input', { bubbles:true }));
      await new Promise(resolve => setTimeout(resolve, 90));
      if (OS._lastFilterRenderMetrics?.preview) previewDurations.push(OS._lastFilterRenderMetrics.durationMs);
    }
    await new Promise(resolve => setTimeout(resolve, 90));
    measuring = false;
    const elapsed = performance.now() - started;
    const filterPreview = { ...OS._lastFilterRenderMetrics };
    const filterPreviewSize = [image.getElement().width, image.getElement().height];
    const displayedDuringPreview = [image.getScaledWidth(), image.getScaledHeight()];
    const finalBrightness = Number(slider.value);

    OS._filterApply();
    const filterApply = { ...OS._lastFilterRenderMetrics };
    const filterApplySize = [image.getElement().width, image.getElement().height];
    const appliedPixel = [...image.getElement().getContext('2d').getImageData(0, 0, 1, 1).data];

    // A one-pixel full-resolution reference exercises the same Fabric filter
    // maths without allocating a second 12 MP output.
    const referenceSource = document.createElement('canvas');
    referenceSource.width = 1;
    referenceSource.height = 1;
    const referenceContext = referenceSource.getContext('2d');
    referenceContext.fillStyle = 'rgb(40,80,120)';
    referenceContext.fillRect(0, 0, 1, 1);
    const reference = new fabric.Image(referenceSource);
    reference.filters = [new fabric.filters.Brightness({ brightness:finalBrightness / 250 })];
    reference.applyFilters();
    const referencePixel = [...reference.getElement().getContext('2d').getImageData(0, 0, 1, 1).data];

    // The persistent adjustment strip uses the same preview pipe and still
    // forces a full-size render when its Apply button is used.
    document.getElementById('adj-bright').value = '25';
    document.getElementById('adj-contrast').value = '0';
    document.getElementById('adj-sat').value = '0';
    document.getElementById('adj-hue').value = '0';
    document.getElementById('adj-blur').value = '0';
    OS.liveAdjust();
    await new Promise(resolve => setTimeout(resolve, 120));
    const adjustmentPreview = { ...OS._lastFilterRenderMetrics };
    const adjustmentPreviewSize = [image.getElement().width, image.getElement().height];
    OS.applyAdjustments();
    const adjustmentApply = { ...OS._lastFilterRenderMetrics };
    const adjustmentApplySize = [image.getElement().width, image.getElement().height];

    return {
      fps: frames * 1000 / elapsed,
      previewDurations,
      limit: OS._previewPixelLimit,
      filterPreview,
      filterPreviewSize,
      filterApply,
      filterApplySize,
      adjustmentPreview,
      adjustmentPreviewSize,
      adjustmentApply,
      adjustmentApplySize,
      displayedBefore,
      displayedDuringPreview,
      appliedPixel,
      referencePixel
    };
  });

  expect(result.fps, JSON.stringify(result)).toBeGreaterThan(30);
  for (const preview of [result.filterPreview, result.adjustmentPreview]) {
    expect(preview.capped).toBe(true);
    expect(preview.renderWidth * preview.renderHeight).toBeLessThanOrEqual(result.limit);
    expect(preview.fullWidth * preview.fullHeight).toBe(4000 * 3000);
  }
  expect(result.filterPreviewSize[0] * result.filterPreviewSize[1]).toBeLessThanOrEqual(result.limit);
  expect(result.adjustmentPreviewSize[0] * result.adjustmentPreviewSize[1]).toBeLessThanOrEqual(result.limit);
  expect(result.displayedDuringPreview[0]).toBeCloseTo(result.displayedBefore[0], 3);
  expect(result.displayedDuringPreview[1]).toBeCloseTo(result.displayedBefore[1], 3);
  expect(result.filterApply.preview).toBe(false);
  expect(result.adjustmentApply.preview).toBe(false);
  expect(result.filterApplySize).toEqual([4000, 3000]);
  expect(result.adjustmentApplySize).toEqual([4000, 3000]);
  expect(result.appliedPixel).toEqual(result.referencePixel);
});

test('resolves one mobile layout rather than two blocks that fight each other', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const layout = await page.evaluate(() => {
    // The timeline is display:none until opened, so a hidden element would
    // measure as zeros.
    document.getElementById('timeline-panel').classList.add('visible');
    const root = getComputedStyle(document.documentElement);
    const box = id => {
      const el = document.getElementById(id);
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        position: style.position,
        zIndex: style.zIndex,
        left: Math.round(rect.left),
        right: Math.round(window.innerWidth - rect.right),
        bottom: Math.round(window.innerHeight - rect.bottom),
        height: Math.round(rect.height),
        overflowX: style.overflowX,
        flexDirection: style.flexDirection,
        fontSize: style.fontSize
      };
    };
    return {
      topbarH: root.getPropertyValue('--topbar-h').trim(),
      toolSize: root.getPropertyValue('--tool-size').trim(),
      toolbar: box('toolbar'),
      toolOptions: box('tool-options'),
      panels: box('panels'),
      timeline: box('timeline-panel'),
      statusbarDisplay: getComputedStyle(document.getElementById('statusbar')).display,
      // The dead block set these to values that would have produced a
      // completely different layout had the stylesheet ever been reordered.
      mediaBlocks: [...document.styleSheets]
        .flatMap(sheet => { try { return [...sheet.cssRules]; } catch (e) { return []; } })
        .filter(rule => rule.conditionText && rule.conditionText.replace(/\s+/g, '') === '(max-width:767px)')
        .length
    };
  });

  // Exactly one plain max-width:767px block; the landscape variant has its own
  // condition text and is counted separately.
  expect(layout.mediaBlocks).toBe(1);

  // The winning values are the ones that survive.
  expect(layout.topbarH).toBe('44px');
  expect(layout.toolSize).toBe('34px');

  // Structural declarations that only the dead block carried are still applied.
  expect(layout.toolbar.position).toBe('fixed');
  expect(layout.toolbar.zIndex).toBe('100');
  expect(layout.toolbar.flexDirection).toBe('row');
  expect(layout.toolbar.overflowX).toBe('auto');
  expect(layout.panels.position).toBe('fixed');
  expect(layout.panels.zIndex).toBe('200');
  expect(layout.toolOptions.fontSize).toBe('10px');
  expect(layout.statusbarDisplay).toBe('none');

  // The floating toolbar geometry clears the bottom panel tabs.
  expect(layout.toolbar.left).toBe(6);
  expect(layout.toolbar.right).toBe(6);
  expect(layout.toolbar.bottom).toBe(46);
  expect(layout.toolbar.height).toBe(46);

  // The timeline clears both the floating toolbar and the bottom panel tabs.
  expect(layout.timeline.bottom).toBe(98);
  expect(layout.timeline.left).toBe(6);
});

test('keeps one tablet block with the winning panel width', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await openApp(page);

  const tablet = await page.evaluate(() => ({
    panelWidth: getComputedStyle(document.documentElement).getPropertyValue('--panel-width').trim(),
    toolbarWidth: getComputedStyle(document.documentElement).getPropertyValue('--toolbar-w').trim(),
    blocks: [...document.styleSheets]
      .flatMap(sheet => { try { return [...sheet.cssRules]; } catch (e) { return []; } })
      .filter(rule => rule.conditionText && rule.conditionText.includes('768px') && rule.conditionText.includes('1023px'))
      .length
  }));

  expect(tablet.blocks).toBe(1);
  expect(tablet.panelWidth).toBe('248px');
  expect(tablet.toolbarWidth).toBe('112px');
});

test('updates document language and direction when the locale changes @cross-browser', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(() => {
    const read = () => ({
      lang: document.documentElement.getAttribute('lang'),
      dir: document.documentElement.getAttribute('dir')
    });
    const out = {};

    OS.setLocale('zh');
    out.zh = read();

    // Direction is derived from the locale, so a right-to-left one flips the
    // document without needing its own code path.
    OS.setLocale('ar');
    out.ar = read();
    out.arDirections = ['ar', 'he', 'fa', 'ur'].map(l => OS._localeDirection(l));
    out.ltrDirections = ['en', 'zh', 'de', 'ja'].map(l => OS._localeDirection(l));

    OS.setLocale('en');
    out.en = read();
    return out;
  });

  expect(result.zh).toEqual({ lang: 'zh', dir: 'ltr' });
  expect(result.ar).toEqual({ lang: 'ar', dir: 'rtl' });
  expect(result.en).toEqual({ lang: 'en', dir: 'ltr' });
  expect(result.arDirections).toEqual(['rtl', 'rtl', 'rtl', 'rtl']);
  expect(result.ltrDirections).toEqual(['ltr', 'ltr', 'ltr', 'ltr']);
});

test('keeps interface locale direction separate from explicit artwork text direction', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const text = OS._applyDirectionToObject(new fabric.IText('مرحبا OpenShop 2026', { left: 10, top: 10, fontSize: 20 }));
    OS.canvas.add(text);
    OS.layers[OS.activeLayerIdx].objects.push(text);
    OS.canvas.setActiveObject(text);

    const baseline = {
      project: JSON.stringify(OS._captureDocumentState()),
      history: OS.history.length,
      pixels: OS.canvas.toDataURL('image/png'),
      direction: text.direction,
      marker: text._openShopTextDirection
    };

    OS.setLocale('ar');
    const arabicLocale = {
      htmlDirection: document.documentElement.dir,
      textDirection: text.direction,
      project: JSON.stringify(OS._captureDocumentState()),
      history: OS.history.length,
      pixels: OS.canvas.toDataURL('image/png')
    };

    OS.setLocale('pseudo');
    const fresh = OS._applyDirectionToObject(new fabric.IText('نص جديد 42', { left: 10, top: 60 }));
    const pseudoLocale = {
      htmlDirection: document.documentElement.dir,
      textDirection: text.direction,
      freshDirection: fresh.direction,
      freshMarker: fresh._openShopTextDirection
    };

    const historyBeforeCommand = OS.history.length;
    const directionControl = document.getElementById('text-direction');
    directionControl.value = 'rtl';
    directionControl.dispatchEvent(new Event('change', { bubbles: true }));
    const project = OS._captureDocumentState();
    const serializedObject = project.canvas.fabric.objects.find(object => object._openShopObjectId === text._openShopObjectId);
    const afterCommand = {
      direction: text.direction,
      marker: text._openShopTextDirection,
      historyDelta: OS.history.length - historyBeforeCommand,
      serializedDirection: serializedObject?.direction,
      serializedMarker: serializedObject?._openShopTextDirection,
      control: document.getElementById('text-direction').value
    };

    const objectId = text._openShopObjectId;
    await OS._applyDocumentState(project, { trusted: true });
    const restored = OS.canvas.getObjects().find(object => object._openShopObjectId === objectId);
    OS.setLocale('en');
    return {
      baseline,
      arabicLocale,
      pseudoLocale,
      afterCommand,
      restored: {
        direction: restored?.direction,
        marker: restored?._openShopTextDirection,
        text: restored?.text
      }
    };
  });

  expect(result.baseline.direction).toBe('ltr');
  expect(result.baseline.marker).toBe('ltr');
  expect(result.arabicLocale.htmlDirection).toBe('rtl');
  expect(result.arabicLocale.textDirection).toBe('ltr');
  expect(result.arabicLocale.project).toBe(result.baseline.project);
  expect(result.arabicLocale.history).toBe(result.baseline.history);
  expect(result.arabicLocale.pixels).toBe(result.baseline.pixels);
  expect(result.pseudoLocale.htmlDirection).toBe('ltr');
  expect(result.pseudoLocale.textDirection).toBe('ltr');
  expect(result.pseudoLocale.freshDirection).toBe('ltr');
  expect(result.pseudoLocale.freshMarker).toBe('ltr');
  expect(result.afterCommand.direction).toBe('rtl');
  expect(result.afterCommand.marker).toBe('rtl');
  expect(result.afterCommand.historyDelta).toBe(1);
  expect(result.afterCommand.serializedDirection).toBe('rtl');
  expect(result.afterCommand.serializedMarker).toBe('rtl');
  expect(result.afterCommand.control).toBe('rtl');
  expect(result.restored.direction).toBe('rtl');
  expect(result.restored.marker).toBe('rtl');
  expect(result.restored.text).toBe('مرحبا OpenShop 2026');
});

test('mirrors menu chrome instead of stranding it on the wrong edge', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const measure = () => page.evaluate(() => {
    const root = document.querySelector('.menu-bar > .menu-item');
    OS._openMenuPopup(root);
    const dropdown = root.querySelector(':scope > .menu-dropdown');
    const sub = dropdown.querySelector('.dd-sub');
    OS._openMenuPopup(sub);
    const submenu = sub.querySelector(':scope > .menu-dropdown');

    const rowWithShortcut = document.querySelector('.dd-item .dd-shortcut')?.parentElement;
    const shortcut = rowWithShortcut?.querySelector('.dd-shortcut');

    const out = {
      dropdownStart: Math.round(dropdown.getBoundingClientRect().left - root.getBoundingClientRect().left),
      submenuBeyondParent: submenu.getBoundingClientRect().left > sub.getBoundingClientRect().left,
      shortcutBeyondLabel: shortcut
        ? shortcut.getBoundingClientRect().left > rowWithShortcut.getBoundingClientRect().left
        : null,
      // A row must never be so cramped that the shortcut overlaps the label.
      shortcutOverflows: shortcut
        ? shortcut.getBoundingClientRect().right > rowWithShortcut.getBoundingClientRect().right + 1
        : null
    };
    OS._closeMenuPopup(root);
    return out;
  });

  const ltr = await measure();
  expect(ltr.dropdownStart).toBe(0);
  expect(ltr.submenuBeyondParent).toBe(true);
  expect(ltr.shortcutOverflows).toBe(false);

  await page.evaluate(() => OS.setLocale('ar'));
  const rtl = await measure();
  // In RTL the dropdown hangs from the menu's right edge and submenus open
  // leftwards, which physical `left:100%` could never do.
  expect(rtl.submenuBeyondParent).toBe(false);
  expect(rtl.shortcutOverflows).toBe(false);

  await page.evaluate(() => OS.setLocale('en'));
});

test('flags untranslated interface strings through the pseudo-locale', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(() => {
    const sample = () => [...document.querySelectorAll('.menu-bar > .menu-item')]
      .map(item => item.getAttribute('aria-label') || '')
      .concat([...document.querySelectorAll('.panel-tab')].map(tab => tab.textContent.trim()));

    OS.setLocale('pseudo');
    // Read the row's own text node: textContent would also pull in the
    // shortcut span, which is not a translated string.
    const ownText = el => [...el.childNodes]
      .filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim();
    const pseudo = [...document.querySelectorAll('.dd-item')].slice(0, 5).map(ownText);
    const toast = OS._t('Project loaded');
    const lang = document.documentElement.getAttribute('lang');
    const direction = document.documentElement.getAttribute('dir');

    OS.setLocale('en');
    const restored = sample();
    return {
      pseudo,
      toast,
      lang,
      direction,
      restored,
      keys: OS.i18nKeys().length,
      missingInChinese: OS.missingLocaleKeys('zh'),
      // The menu/tab/tooltip surface stamped into the DOM, separately from the
      // command-palette labels the inventory also covers now.
      domKeys: [...document.querySelectorAll('[data-i18n]')].map(el => el.dataset.i18n)
        .concat([...document.querySelectorAll('[data-i18n-tip]')].map(el => el.dataset.i18nTip)),
      commandLabels: OS._getCommands().map(c => c.label)
    };
  });

  // Every string that went through the locale machinery is visibly marked.
  expect(result.pseudo.every(text => text.startsWith('⟦') && text.endsWith('⟧'))).toBe(true);
  expect(result.toast).toBe('⟦Prójéçt lóádéd⟧');
  expect(result.lang).toBe('en-x-pseudo');
  expect(result.direction).toBe('ltr');
  // Switching back restores real English rather than leaving markers behind.
  expect(result.restored.some(text => text.includes('⟦'))).toBe(false);
  expect(result.keys).toBeGreaterThan(50);
  // Chinese covers the menu, tab and tooltip surface apart from format names,
  // units, and the single-letter typographic controls, which are the same in
  // every locale. The three remaining visible gaps are held in the blocked
  // translation record until a native-speaker review supplies their copy.
  const sameEverywhere = new Set([
    'PNG', 'JPEG', 'WebP', 'AVIF', 'SVG', 'PDF', 'PSD (Photoshop)', 'AI', '100%', 'B', 'I', 'U', 'O', 'S', 'W', 'x', 'H'
  ]);
  const domSet = new Set(result.domKeys);
  const missingInChrome = result.missingInChinese
    .filter(key => domSet.has(key) && !sameEverywhere.has(key));
  expect(new Set(missingInChrome)).toEqual(new Set(['OpenRaster (.ora)', 'Light', 'Tilt dynamics']));

  // The inventory now also covers the command palette, which the dictionary
  // does not reach yet. Measuring it is the point — the metric used to report
  // parity because those labels were not counted at all. This asserts the gap
  // is visible and does not grow silently, not that it is zero.
  const commandSet = new Set(result.commandLabels);
  const untranslatedCommands = result.missingInChinese.filter(key => commandSet.has(key));
  expect(result.commandLabels.length).toBeGreaterThan(100);
  expect(untranslatedCommands.length).toBeLessThanOrEqual(result.commandLabels.length);
  expect(result.keys).toBeGreaterThan(result.domKeys.length);
});

test('selects WebGPU only when an adapter resolves and falls back to WASM', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const original = navigator.gpu;
    const withGpu = async (gpu) => {
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu });
      OS._aiDevice = null;
      OS._aiDevicePromise = null;
      return OS._selectAIDevice();
    };

    const out = {};
    out.noGpu = await withGpu(undefined);
    out.nullAdapter = await withGpu({ requestAdapter: async () => null });
    out.throws = await withGpu({ requestAdapter: async () => { throw new Error('no device'); } });
    out.webgpu = await withGpu({ requestAdapter: async () => ({ name: 'fake' }) });

    // The probe runs once and the answer is reused.
    let calls = 0;
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: async () => { calls++; return { name: 'fake' }; } }
    });
    OS._aiDevice = null;
    OS._aiDevicePromise = null;
    await Promise.all([OS._selectAIDevice(), OS._selectAIDevice(), OS._selectAIDevice()]);
    out.adapterRequests = calls;
    out.report = OS.aiBackendReport();

    Object.defineProperty(navigator, 'gpu', { configurable: true, value: original });
    return out;
  });

  expect(result.noGpu).toBe('wasm');
  expect(result.nullAdapter).toBe('wasm');
  expect(result.throws).toBe('wasm');
  expect(result.webgpu).toBe('webgpu');
  expect(result.adapterRequests).toBe(1);
  expect(result.report.device).toBe('webgpu');
  // Model revisions stay pinned to immutable commits, and the report says so.
  expect(Object.keys(result.report.pinnedRevisions).length).toBeGreaterThan(0);
});

test('preflights the exact model download and passes the selected device to the pipeline', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: async () => ({ name: 'fake' }) }
    });
    OS._aiDevice = null;
    OS._aiDevicePromise = null;
    OS._aiPipelines = {};

    let captured = null;
    let downloadMessage = null;
    OS._loadTransformers = async () => ({
      ModelRegistry: {
        get_pipeline_files: async (task, model, opts) => {
          captured = { ...captured, registry:{ task, model, opts } };
          return ['config.json', 'onnx/model_q8.onnx'];
        },
        get_file_metadata: async (_model, file) => ({
          exists:true,
          size:file === 'config.json' ? 2 * 1024 * 1024 : 8 * 1024 * 1024,
          fromCache:file === 'config.json'
        })
      },
      pipeline: async (task, model, opts) => {
        captured = { ...captured, task, model, opts };
        downloadMessage = document.getElementById('ai-msg').textContent;
        return { tag: 'pipe' };
      }
    });
    await OS._loadPipeline('image-segmentation', 'test/model', 'Test');
    return { captured, downloadMessage, footprint:OS._modelFootprints['test/model'] };
  });

  // The README promised WebGPU with a WASM fallback while this was pinned to
  // 'wasm' in both pipelines.
  expect(result.captured.opts.device).toBe('webgpu');
  expect(result.captured.opts.revision).toBeTruthy();
  expect(result.captured.registry).toEqual({
    task:'image-segmentation',
    model:'test/model',
    opts:expect.objectContaining({ device:'webgpu', dtype:'q8' })
  });
  expect(result.downloadMessage).toBe('8.0 MB download · 10.0 MB installed size (webgpu)');
  expect(result.footprint).toEqual(expect.objectContaining({
    exact:true,
    totalBytes:10 * 1024 * 1024,
    cachedBytes:2 * 1024 * 1024,
    downloadBytes:8 * 1024 * 1024
  }));
});

test('reloads the verified Transformers.js WASM runtime offline after one online use', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-http', 'Service workers require the hosted lane');
  testInfo.setTimeout(120_000);
  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once:true }));
    }
  });

  const online = await page.evaluate(async () => {
    const lib = await OS._loadTransformers();
    const cache = await OS._inspectAIBackendCache();
    const names = OS._aiBackendAssetNames();
    const model = 'onnx-community/depth-anything-v2-small';
    const footprint = await OS._modelDownloadFootprint(lib, {
      task:'depth-estimation',
      model,
      revision:OS._modelRevisions[model],
      dtype:'q8',
      device:'wasm'
    });
    return {
      version:lib.env.version,
      cache,
      footprint:footprint && {
        exact:footprint.exact,
        files:footprint.files.length,
        totalBytes:footprint.totalBytes,
        message:OS._modelDownloadMessage(footprint, 'wasm')
      },
      paths:{ ...lib.env.backends.onnx.wasm.wasmPaths },
      expected:{
        wasm:OS._runtimeAssets[names.wasm].url,
        mjs:OS._runtimeAssets[names.factory].url
      }
    };
  });
  expect(online.version).toBe('4.2.0');
  expect(online.cache).toEqual(expect.objectContaining({ cached:2, total:2 }));
  expect(online.cache.bytes).toBeGreaterThan(12_000_000);
  expect(online.footprint).toEqual(expect.objectContaining({ exact:true }));
  expect(online.footprint.files).toBeGreaterThan(2);
  expect(online.footprint.totalBytes).toBeGreaterThan(10_000_000);
  expect(online.footprint.message).toMatch(/^\d+\.\d (?:MB|GB) (?:download|model verified in cache)/);
  expect(online.paths).toEqual(online.expected);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout:30_000 });
    const offline = await page.evaluate(async () => {
      const lib = await OS._loadTransformers();
      return {
        version:lib.env.version,
        cache:await OS._inspectAIBackendCache(),
        paths:{ ...lib.env.backends.onnx.wasm.wasmPaths }
      };
    });
    expect(offline.version).toBe('4.2.0');
    expect(offline.cache).toEqual(expect.objectContaining({ cached:2, total:2, bytes:online.cache.bytes }));
    expect(offline.paths).toEqual(online.expected);
  } finally {
    await context.setOffline(false);
  }
});

test('uses the Transformers.js 4.x background-removal pipeline with pinned MODNet', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const target = {
      name:'Portrait',
      type:'image',
      getElement:() => ({ naturalWidth:2, naturalHeight:2 })
    };
    OS._getActiveImage = () => target;
    OS._isEditCurrent = () => true;
    OS._imageToRawImage = async () => ({ tag:'raw-pixels' });
    let loadArgs = null;
    let pipelineInput = null;
    OS._loadPipeline = async (...args) => {
      loadArgs = args.slice(0, 4).map(value => typeof value === 'object' ? { kind:value.kind } : value);
      loadArgs.push(args[4]);
      return async input => {
        pipelineInput = input;
        return {
          width:2,
          height:2,
          channels:4,
          data:new Uint8ClampedArray([
            255, 0, 0, 255,
            0, 255, 0, 0,
            0, 0, 255, 128,
            255, 255, 255, 255
          ])
        };
      };
    };
    let replacement = null;
    OS._replaceActiveImage = async (_target, url, label, guards) => {
      replacement = { url, label, guards };
      return true;
    };
    const returned = await OS.aiRemoveBackground();
    return {
      returned,
      loadArgs,
      pipelineInput,
      replacement:{
        label:replacement?.label,
        isPng:replacement?.url?.startsWith('data:image/png;base64,'),
        guarded:Boolean(replacement?.guards?.targetId)
      },
      revision:OS._modelRevisions['Xenova/modnet']
    };
  });

  expect(result.returned).toBe(true);
  expect(result.loadArgs).toEqual([
    'background-removal',
    'Xenova/modnet',
    'Background Removal',
    { kind:'Background Removal' },
    { dtype:'fp32' }
  ]);
  expect(result.pipelineInput).toEqual({ tag:'raw-pixels' });
  expect(result.replacement).toEqual({ label:'AI BG Remove', isPng:true, guarded:true });
  expect(result.revision).toMatch(/^[0-9a-f]{40}$/);
});

test('distinguishes the model-backed enlarge from the resample one', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const placement = await page.evaluate(() => {
    const menuOf = (action) => {
      const row = document.querySelector(`[data-os-click="${action}"]`);
      return row?.closest('.menu-bar > .menu-item')?.getAttribute('aria-label') || null;
    };
    const labels = [...document.querySelectorAll('.dd-item')].map(el => el.textContent.trim());
    return {
      enlarge2Menu: menuOf('click-099'),
      enlarge4Menu: menuOf('click-100'),
      model2Menu: menuOf('click-222'),
      model4Menu: menuOf('click-223'),
      backgroundRemoveMenu: menuOf('click-096'),
      claimsSmartUpscale: labels.some(text => /smart upscale/i.test(text)),
      commandLabels: OS._getCommands().filter(c => /enlarge|upscale/i.test(c.label)).map(c => `${c.cat}:${c.label}`),
      // The two paths must not share an implementation, or the labels lie.
      resampleRunsNoModel: !/loadPipeline/.test(OS.aiUpscale.toString()),
      modelLoadsAPipeline: /_loadPipeline/.test(OS.aiSuperResolve.toString())
    };
  });

  // Stepped canvas resampling plus a sharpen pass is not super-resolution, and
  // the two sit side by side saying which is which.
  expect(placement.claimsSmartUpscale).toBe(false);
  expect(placement.enlarge2Menu).toBe('Image');
  expect(placement.enlarge4Menu).toBe('Image');
  expect(placement.model2Menu).toBe('Image');
  expect(placement.model4Menu).toBe('Image');
  expect(placement.backgroundRemoveMenu).toBe('AI');
  expect(placement.commandLabels).toEqual([
    'Image:Enlarge 2x (AI model)',
    'Image:Enlarge 4x (AI model)',
    'Image:Enlarge 2x (resample)',
    'Image:Enlarge 4x (resample)'
  ]);
  expect(placement.resampleRunsNoModel).toBe(true);
  expect(placement.modelLoadsAPipeline).toBe(true);
});

test('reports and clears cached model files per model', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const model = 'Xenova/modnet';
    const revision = OS._modelRevisions[model];

    // Stand in for CacheStorage: file:// pages have none.
    const store = new Map();
    const makeResponse = (bytes) => ({
      headers: { get: (name) => (name.toLowerCase() === 'content-length' ? String(bytes) : null) },
      clone() { return this; },
      blob: async () => ({ size: bytes })
    });
    store.set(`https://huggingface.co/${model}/resolve/${revision}/onnx/model.onnx`, makeResponse(5_000_000));
    store.set(`https://huggingface.co/${model}/resolve/${revision}/config.json`, makeResponse(1_024));
    store.set('https://example.test/unrelated.bin', makeResponse(99));

    const fakeCache = {
      keys: async () => [...store.keys()].map(url => ({ url })),
      match: async (request) => store.get(request.url),
      delete: async (request) => store.delete(request.url)
    };
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { keys: async () => ['fake'], open: async () => fakeCache }
    });

    OS._aiPipelines = { [`image-segmentation:${model}`]: { dispose: () => { window.__disposed = true; } } };

    const before = (await OS._inspectAIAssetCache()).find(entry => entry.model === model);
    const removed = await OS.clearModelCache(model);
    const after = (await OS._inspectAIAssetCache()).find(entry => entry.model === model);
    const untouched = store.has('https://example.test/unrelated.bin');

    return {
      beforeMatches: before.matches,
      beforeBytes: before.bytes,
      beforeLoaded: before.loaded,
      removed,
      afterMatches: after.matches,
      afterBytes: after.bytes,
      untouched,
      pipelineDropped: !OS._aiPipelines[`image-segmentation:${model}`],
      disposed: window.__disposed === true
    };
  });

  expect(result.beforeMatches).toBe(2);
  expect(result.beforeBytes).toBe(5_001_024);
  expect(result.beforeLoaded).toBe(true);
  expect(result.removed).toBe(2);
  expect(result.afterMatches).toBe(0);
  expect(result.afterBytes).toBe(0);
  // Only that model's files go; an unrelated cache entry is left alone.
  expect(result.untouched).toBe(true);
  expect(result.pipelineDropped).toBe(true);
  expect(result.disposed).toBe(true);
});

test('boots its libraries from verified blobs with no CDN in script-src @cross-browser', async ({ page }) => {
  await openApp(page);

  const report = await page.evaluate(() => {
    const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    const scriptSrc = policy.split(';').map(part => part.trim()).find(part => part.startsWith('script-src '));
    return {
      scriptSrc,
      trustedTypesRequired: policy.includes("require-trusted-types-for 'script'"),
      trustedTypesPolicy: policy.match(/trusted-types\s+([^;]+)/)?.[1]?.trim() || null,
      trustedTypesSupported: typeof globalThis.trustedTypes?.createPolicy === 'function',
      trustedHTMLType: typeof OS._trustedHTML('<span>probe</span>'),
      // Every remaining script element is either inline or a spent blob: URL.
      remoteScriptTags: [...document.querySelectorAll('script[src]')]
        .map(el => el.getAttribute('src'))
        .filter(src => /^https?:/i.test(src)),
      fabricVersion: window.fabric?.version || null,
      hasAgPsd: typeof window.agPsd === 'object',
      hasJsPdf: typeof window.jspdf === 'object',
      bootState: document.documentElement.dataset.osBoot
    };
  });

  // A whole-CDN allowance let any injection sink load an arbitrary npm package,
  // because CSP does not require SRI on scripts it permits by host.
  expect(report.scriptSrc).not.toMatch(/https?:\/\//);
  expect(report.scriptSrc).toContain('blob:');
  expect(report.trustedTypesRequired).toBe(true);
  expect(report.trustedTypesPolicy).toBe('openshop-loader');
  expect(report.trustedHTMLType).toBe(report.trustedTypesSupported ? 'object' : 'string');
  expect(report.remoteScriptTags).toEqual([]);
  // ...and the libraries still arrive.
  expect(report.fabricVersion).toBe('7.4.0');
  expect(report.hasAgPsd).toBe(true);
  expect(report.hasJsPdf).toBe(true);
  expect(report.bootState).toBe('ready');
});

test('refuses to start when a boot library fails its integrity check', async ({ page }) => {
  await page.route('**/cdn.jsdelivr.net/npm/jspdf**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.jspdf = { tampered: true };'
  }));

  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  await page.goto(projectAppUrl(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'failed', null, { timeout: 30000 });

  // Substituted bytes must stop the editor, not quietly become the engine.
  await expect(page.locator('#welcome-boot-status')).toContainText('Could not load the editing engine');
  expect(await page.evaluate(() => window.jspdf?.tampered)).toBeUndefined();
  expect(consoleErrors.join('\n')).toMatch(/integrity check/i);
});

test('surfaces an editor initialization failure with a reload control', async ({ page }) => {
  await page.route('http://127.0.0.1:4173/', async route => {
    const response = await route.fetch();
    let body = await response.text();
    if (!body.includes('    OS.init();')) throw new Error('Could not find the editor initialization call');
    body = body.replace(
      '    OS.init();',
      "    OS.init = () => { throw new Error('forced editor initialization failure'); };\n    OS.init();"
    );
    // The test intentionally changes an inline script, so use the server shell
    // without its production CSP hash for this isolated failure injection.
    body = body.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/i, '');
    await route.fulfill({ response, body });
  });

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'failed', null, { timeout: 30000 });

  const panel = page.locator('#welcome-boot-status');
  await expect(panel).toHaveAttribute('role', 'alert');
  await expect(panel).toHaveAttribute('data-boot-failure-stage', 'editor initialization');
  await expect(panel).toContainText('Could not load the editing engine during editor initialization');
  await expect(panel).toContainText('forced editor initialization failure');
  await expect(panel.getByRole('button', { name: 'Reload OpenShop' })).toBeVisible();
  await expect(page.locator('.welcome-actions')).toBeHidden();
});

test('animation playback moves the highlight without rebuilding the strip', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    OS._animFrames = Array.from({ length: 12 }, () => pixel);
    OS._animIdx = 0;
    OS._renderFrames();

    const container = document.getElementById('timeline-frames');
    const before = [...container.children];
    let created = 0;
    const observer = new MutationObserver(records => {
      records.forEach(record => { created += record.addedNodes.length; });
    });
    observer.observe(container, { childList: true, subtree: true });

    document.getElementById('tl-fps').value = '24';
    OS.togglePlay();
    await new Promise(resolve => setTimeout(resolve, 400));
    const highlightedDuringPlayback = [...container.children].findIndex(child => child.classList.contains('active'));
    OS.togglePlay();
    observer.disconnect();

    const after = [...container.children];
    return {
      created,
      // The same element objects, not replacements that merely look the same.
      sameNodes: before.length === after.length && before.every((node, index) => node === after[index]),
      highlightedDuringPlayback,
      highlightedAfterStop: [...container.children].findIndex(child => child.classList.contains('active')),
      frames: after.length
    };
  });

  expect(result.frames).toBe(12);
  // At 24 fps over 400ms this used to create roughly 400 nodes.
  expect(result.created).toBe(0);
  expect(result.sameNodes).toBe(true);
  expect(result.highlightedDuringPlayback).toBeGreaterThan(0);
  // Stopping returns the highlight to the frame that is actually loaded.
  expect(result.highlightedAfterStop).toBe(0);
});

test('falls back cleanly when an optional platform capability is missing @cross-browser', async ({ page, browserName }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const out = {};
    // What this engine actually offers. Recorded so the gap is measured rather
    // than assumed: every runtime observation used to come from Chromium.
    out.present = {
      showOpenFilePicker: typeof window.showOpenFilePicker === 'function',
      ImageDecoder: typeof window.ImageDecoder !== 'undefined',
      locks: Boolean(navigator.locks?.request),
      broadcastChannel: typeof BroadcastChannel !== 'undefined',
      opfs: Boolean(navigator.storage?.getDirectory),
      structuredClone: typeof structuredClone === 'function'
    };

    // 1. No File System Access API: the hidden <input type=file> is the fallback.
    const picker = window.showOpenFilePicker;
    delete window.showOpenFilePicker;
    const input = document.getElementById('file-input');
    let inputClicked = 0;
    const clickSpy = () => { inputClicked++; };
    input.addEventListener('click', clickSpy);
    await OS.openFile();
    input.removeEventListener('click', clickSpy);
    if (picker) window.showOpenFilePicker = picker;
    out.fileInputFallback = inputClicked;

    // 2. No ImageDecoder: the GIF codec still identifies a one-frame image
    // and sends it through the normal static-image path.
    // Built by hand: connect-src does not allow data: URLs, by design.
    const gifBytes = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));
    const file = new File([gifBytes], 'still.gif', { type: 'image/gif' });
    const decoder = window.ImageDecoder;
    if (decoder) delete window.ImageDecoder;
    OS._docName = 'before-gif';
    OS._handleFileLoad(file);
    const started = performance.now();
    while (OS._docName !== 'still.gif' && performance.now() - started < 5000) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (decoder) window.ImageDecoder = decoder;
    // _addDecodedImageToCanvas names the document only once the decode lands.
    out.gifStaticFallback = OS._docName;

    // 3. No Web Locks: the recovery critical section still runs.
    const locks = navigator.locks;
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    out.lockFallback = await OS._withRecoveryLock(async () => 'ran');
    Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });

    // 4. No BroadcastChannel: coordination is skipped, not fatal.
    const channel = OS._recoveryChannel;
    const Broadcast = window.BroadcastChannel;
    OS._recoveryChannel = null;
    delete window.BroadcastChannel;
    let coordinationThrew = false;
    try {
      OS._initRecoveryCoordination();
      OS._claimRecoveryOwnership();
    } catch (error) {
      coordinationThrew = true;
    }
    if (Broadcast) window.BroadcastChannel = Broadcast;
    OS._recoveryChannel = channel;
    out.coordinationThrew = coordinationThrew;

    // 5. No OPFS: autosave reports rather than rejecting.
    const storage = navigator.storage;
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {} });
    out.autoSaveWithoutOpfs = await OS._autoSave();
    Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });

    return out;
  });

  expect(result.fileInputFallback).toBe(1);
  expect(result.gifStaticFallback).toBe('still');
  expect(result.lockFallback).toBe('ran');
  expect(result.coordinationThrew).toBe(false);
  expect(result.autoSaveWithoutOpfs).toBe(false);

  expect(result.present.structuredClone).toBe(true);
  expect(result.present.broadcastChannel).toBe(true);
  // WebKit exposes no origin-private file system to an opaque (file://) origin,
  // so autosave and crash recovery are simply absent there — the app degrades
  // to manual saves rather than failing, which is what the assertions above
  // check. Under a real https origin WebKit does provide OPFS.
  expect(result.present.opfs).toBe(browserName !== 'webkit');
  if (browserName === 'chromium') {
    expect(result.present.showOpenFilePicker).toBe(true);
    expect(result.present.ImageDecoder).toBe(true);
    expect(result.present.locks).toBe(true);
  }
  if (browserName === 'firefox') {
    // No File System Access API: the <input type=file> path above is the
    // shipping experience there, not a fallback. ImageDecoder is present, so
    // animated GIF import does work.
    expect(result.present.showOpenFilePicker).toBe(false);
    expect(result.present.ImageDecoder).toBe(true);
  }
});

test('runs the Photon WASM backend for real on the operation it is allowed @slow', async ({ page }) => {
  test.setTimeout(120000);
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const swatch = document.createElement('canvas');
    swatch.width = 8;
    swatch.height = 8;
    const ctx = swatch.getContext('2d');
    ctx.fillStyle = '#c8501e';
    ctx.fillRect(0, 0, 8, 8);
    const source = swatch.toDataURL('image/png');

    const addImage = async () => {
      const image = await fabric.FabricImage.fromURL(source);
      OS.canvas.add(image);
      OS.layers.push({
        id: OS._newDocumentId('layer'),
        name: 'Swatch',
        visible: true,
        locked: false,
        opacity: 100,
        blend: 'source-over',
        objects: [image]
      });
      OS.activeLayerIdx = OS.layers.length - 1;
      OS.canvas.setActiveObject(image);
      return image;
    };

    const pixelOf = image => {
      const el = image.getElement();
      const probe = document.createElement('canvas');
      probe.width = el.naturalWidth || el.width;
      probe.height = el.naturalHeight || el.height;
      probe.getContext('2d').drawImage(el, 0, 0);
      return [...probe.getContext('2d').getImageData(0, 0, 1, 1).data];
    };

    OS._photonFilterDisabled = false;
    // The application prefers the parity-verified GPU path when it is
    // available; this test is specifically the real Photon contract.
    OS._gpuFilterDisabled = true;
    OS._filterWorkerPhotonReady = false;

    // Invert is the one operation whose WASM and JavaScript results agree, so
    // it is the one the app is allowed to accelerate.
    const first = await addImage();
    const coldStart = performance.now();
    await OS.applyFilterDirect('Invert');
    const cold = {
      ms: Math.round(performance.now() - coldStart),
      ready: OS._filterWorkerPhotonReady,
      pixel: pixelOf(OS.canvas.getActiveObject() || first)
    };

    // Warm: the verified module stays resident in the filter worker.
    const second = await addImage();
    const warmStart = performance.now();
    await OS.applyFilterDirect('Invert');
    const warm = { ms: Math.round(performance.now() - warmStart), pixel: pixelOf(OS.canvas.getActiveObject() || second) };

    // Cancelling mid-run leaves the layer untouched.
    const third = await addImage();
    const before = pixelOf(third);
    const pending = OS.applyFilterDirect('Invert');
    OS.cancelActiveCompute();
    await pending;
    const afterCancel = pixelOf(OS.canvas.getActiveObject() || third);

    return { cold, warm, cancelUnchanged: before.join() === afterCancel.join() };
  });

  // The flag is only set once the worker reports the verified module loaded,
  // so this is evidence the WASM backend actually ran.
  expect(result.cold.ready).toBe(true);
  // #c8501e inverted.
  expect(result.cold.pixel.slice(0, 3)).toEqual([55, 175, 225]);
  expect(result.warm.pixel.slice(0, 3)).toEqual([55, 175, 225]);
  expect(result.cancelUnchanged).toBe(true);
  console.log(`Photon invert: cold ${result.cold.ms}ms, warm ${result.warm.ms}ms`);
});

test('registers a sandbox plugin and lets it contribute a command', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const source = `const host = globalThis.__openShopPluginHost;
      window.addEventListener('message', function(event) {
        const data = event.data;
        if (data && data.type === 'openshop:command-invoked') window.parent.postMessage({
          type: 'openshop:plugin-result', protocolVersion: host.protocolVersion, pluginId: host.pluginId, token: host.token,
          requestId: data.requestId, ok: true, result: 'ran'
        }, '*');
      });
      setTimeout(() => window.parent.postMessage({
        type: 'openshop:plugin-request', protocolVersion: host.protocolVersion, pluginId: host.pluginId, token: host.token,
        requestId: 'register-probe', method: 'register-command', args: { label: 'Probe Command', category: 'Plugin' }
      }, '*'), 0);`;
    const rejectedInit = OS.registerPlugin({ name: 'Unsafe', init() {} });
    const manifest = {
      id: 'com.example.probe', version: '1.0.0', name: 'Probe',
      sourceHash: await OS._pluginSourceHash(source), capabilities: ['commands'], minApiVersion: 1
    };
    const rejectedConsent = OS.registerPlugin({ manifest, source });
    const handle = OS.registerPlugin({ manifest, source }, { consent:true });
    await handle.ready;
    await new Promise(resolve => setTimeout(resolve, 20));
    const record = OS._pluginRecords.get(handle.id);
    const command = OS._getCommands().find(entry => entry.label === 'Probe Command');
    const commandResult = await command.fn();
    const registered = OS.plugins.some(plugin => plugin.name === 'Probe');
    const disposed = handle.dispose();
    return {
      rejectedInit,
      rejectedConsent,
      sandbox: record.iframe.getAttribute('sandbox'),
      iframeTitle: record.iframe.title,
      registered,
      commandFound: Boolean(command),
      commandResult,
      disposed,
      commandRemoved: !OS._getCommands().some(entry => entry.label === 'Probe Command')
    };
  });

  expect(result.rejectedInit).toBeUndefined();
  expect(result.rejectedConsent).toBeUndefined();
  expect(result.sandbox).toBe('allow-scripts');
  expect(result.iframeTitle).toBe('Probe plugin sandbox');
  expect(result.registered).toBe(true);
  expect(result.commandFound).toBe(true);
  expect(result.commandResult).toBe('ran');
  expect(result.disposed).toBe(true);
  expect(result.commandRemoved).toBe(true);
});

test('audits plugin provenance and revokes the grant from Preferences', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const manifest = await page.evaluate(async () => {
    const source = 'window.addEventListener("message", () => {});';
    const manifest = {
      id:'com.example.preferences-plugin', version:'2.4.1', name:'Preferences Plugin',
      sourceHash:await OS._pluginSourceHash(source), capabilities:['commands', 'document:read'], minApiVersion:1
    };
    const handle = OS.registerPlugin({ manifest, source }, { consent:true });
    await handle.ready;
    OS.showPreferences();
    return manifest;
  });

  const preferences = page.locator('.modal-overlay').filter({ has: page.getByRole('heading', { name:'Preferences' }) }).last();
  const card = preferences.locator(`[data-plugin-access-id="${manifest.id}"]`);
  await expect(card).toContainText('Preferences Plugin');
  await expect(card).toContainText('2.4.1');
  await expect(card).toContainText(manifest.sourceHash);
  await expect(card).toContainText('commands, document:read');
  await expect(card.locator('.plugin-access-status')).toHaveText('Ready');
  await expect(card.getByRole('button', { name:'Revoke access for Preferences Plugin' })).toBeVisible();

  await card.getByRole('button', { name:'Revoke access for Preferences Plugin' }).click();
  await expect(card).toHaveCount(0);
  await expect(preferences.locator('[data-plugin-access-empty]')).toBeVisible();
  await expect(preferences.getByRole('button', { name:'Revoke access for Preferences Plugin' })).toHaveCount(0);

  const state = await page.evaluate(manifest => {
    const source = 'window.addEventListener("message", () => {});';
    return {
      consents:OS.listPluginConsents(),
      plugins:OS.listPlugins(),
      reRegister:OS.registerPlugin({ manifest, source })
    };
  }, manifest);
  expect(state.consents).toEqual([]);
  expect(state.plugins).toEqual([]);
  expect(state.reRegister).toBeUndefined();
});

test('only runs Photon for operations that match the JavaScript worker exactly', async ({ page }) => {
  test.setTimeout(120000);
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const report = await page.evaluate(async () => {
    const width = 16, height = 16;
    const fixture = () => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        data[i * 4] = (i * 17) % 256;
        data[i * 4 + 1] = (i * 41) % 256;
        data[i * 4 + 2] = (i * 89) % 256;
        data[i * 4 + 3] = 255;
      }
      return new ImageData(data, width, height);
    };
    const compare = (a, b) => {
      let colour = 0;
      let alpha = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        for (let c = 0; c < 3; c++) colour = Math.max(colour, Math.abs(a.data[i + c] - b.data[i + c]));
        if (a.data[i + 3] !== b.data[i + 3]) alpha++;
      }
      return { colour, alpha };
    };

    const ops = [['grayscale', {}], ['invert', {}], ['sepia', {}], ['threshold', { thr: 128 }], ['sharpen', {}], ['emboss', {}]];
    const out = { parityOps: [...OS._photonParityOps], measured: {}, routed: {} };
    for (const [op, params] of ops) {
      OS._photonFilterDisabled = false;
      const wasm = await OS._runPhotonFilterInWorker(op, fixture(), width, height, params);
      const js = await OS._runFilterInWorker(op, fixture(), width, height, params);
      out.measured[op] = compare(wasm, js);
      // What the app actually returns for this op, whichever backend it picks.
      const routed = await OS._runFilterWithPhoton(op, fixture(), width, height, params);
      out.routed[op] = compare(routed, js);
    }
    return out;
  });

  // Whatever the app returns is the JavaScript worker's answer, for every op.
  for (const [op, delta] of Object.entries(report.routed)) {
    expect(`${op}:${delta.colour}:${delta.alpha}`).toBe(`${op}:0:0`);
  }

  // The allowlist is exactly the set that agrees, and it is checked here rather
  // than trusted: an op added to it that diverges fails this test.
  for (const op of report.parityOps) {
    expect(report.measured[op]).toEqual({ colour: 0, alpha: 0 });
  }
  const agreeing = Object.entries(report.measured)
    .filter(([, delta]) => delta.colour === 0 && delta.alpha === 0)
    .map(([op]) => op);
  expect(agreeing.sort()).toEqual([...report.parityOps].sort());

  // The measurements behind the allowlist, so a Photon upgrade that fixes them
  // shows up as a failure here rather than going unnoticed.
  expect(report.measured.grayscale.colour).toBeGreaterThan(20);
  expect(report.measured.sepia.colour).toBeGreaterThan(20);
  expect(report.measured.threshold.colour).toBe(255);
  // Convolutions agree in the interior but zero the alpha of the border ring.
  expect(report.measured.sharpen.alpha).toBe(2 * 16 + 2 * 14);
  expect(report.measured.emboss.alpha).toBe(2 * 16 + 2 * 14);
});

test('admits only GPU filters that stay within the measured parity tolerance', async ({ page }) => {
  test.setTimeout(120000);
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const report = await page.evaluate(async () => {
    const width = 16, height = 16;
    const fixture = () => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        data[i * 4] = (i * 17) % 256;
        data[i * 4 + 1] = (i * 41) % 256;
        data[i * 4 + 2] = (i * 89) % 256;
        data[i * 4 + 3] = (i * 29) % 256;
      }
      return new ImageData(data, width, height);
    };
    const compare = (a, b) => {
      let colour = 0;
      let alpha = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        for (let c = 0; c < 3; c++) colour = Math.max(colour, Math.abs(a.data[i + c] - b.data[i + c]));
        if (a.data[i + 3] !== b.data[i + 3]) alpha++;
      }
      return { colour, alpha };
    };
    const specs = [
      ['invert', {}],
      ['grayscale', {}],
      ['threshold', { thr: 128 }],
      ['brightness', { value: 0.2 }],
      ['contrast', { value: 0.25 }],
      ['blur', { radius: 1 }],
      ['sharpen', {}]
    ];
    const out = { parityOps: [...OS._gpuParityOps], measured: {}, backends: {}, errors: {} };
    for (const [op, params] of specs) {
      try {
        OS._gpuFilterDisabled = false;
        const accelerated = await OS._runGPUFilterInWorker(op, fixture(), width, height, params);
        const js = await OS._runFilterInWorker(op, fixture(), width, height, params);
        out.measured[op] = compare(accelerated, js);
        out.backends[op] = Object.keys(OS.filterBackendReport()[op]?.backends || {});
      } catch (error) {
        out.errors[op] = error?.message || String(error);
      }
    }
    return out;
  });

  const expected = ['invert', 'grayscale', 'threshold', 'brightness', 'contrast', 'blur', 'sharpen'];
  expect([...report.parityOps].sort()).toEqual([...expected].sort());
  if (Object.keys(report.errors).length) {
    throw new Error(`GPU parity probe failed: ${JSON.stringify(report.errors)}`);
  }
  for (const op of expected) {
    expect(report.measured[op].colour, `${op} colour divergence`).toBeLessThanOrEqual(1);
    expect(report.measured[op].alpha, `${op} alpha divergence`).toBe(0);
    const acceleratedBackends = report.backends[op].filter(backend => ['webgpu', 'webgl2'].includes(backend));
    expect(acceleratedBackends, `${op} backend report`).toHaveLength(1);
  }
});

test('hands AI pipelines canvas pixels, and cancels or fails without touching the layer', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    const swatch = document.createElement('canvas');
    swatch.width = 12;
    swatch.height = 9;
    const ctx = swatch.getContext('2d');
    ctx.fillStyle = '#2b6cb0';
    ctx.fillRect(0, 0, 12, 9);
    const source = swatch.toDataURL('image/png');

    const image = await fabric.FabricImage.fromURL(source);
    OS.canvas.add(image);
    OS.layers.push({
      id: OS._newDocumentId('layer'),
      name: 'Subject',
      visible: true, locked: false, opacity: 100, blend: 'source-over',
      objects: [image]
    });
    OS.activeLayerIdx = OS.layers.length - 1;
    OS.canvas.setActiveObject(image);
    const originalElement = image.getElement().src;

    class FakeRawImage {
      constructor(data, width, height, channels) {
        Object.assign(this, { data, width, height, channels });
      }
    }
    let seen = null;
    let pipelineLoad = null;
    let behaviour = 'record';
    OS._aiPipelines = {};
    OS._aiDevice = 'wasm';
    const fakeLib = {
      RawImage: FakeRawImage,
      env: {},
      pipeline: async (task, model, options) => {
        pipelineLoad = { task, model, revision:options.revision };
        return (input) => {
        seen = input;
        if (behaviour === 'throw') throw new Error('pipeline exploded');
        if (behaviour === 'hang') return new Promise(() => {});
        // A depth result the caller can consume.
        return { depth: { width: 12, height: 9, data: new Uint8ClampedArray(12 * 9) } };
        };
      }
    };
    // _loadTransformers is what caches the runtime the pipelines read.
    OS._loadTransformers = async () => { OS._aiLib = fakeLib; return fakeLib; };

    // 1. Input contract: pixels, not a data: URL that Transformers.js would
    //    fetch — connect-src blocks data:, which broke every AI feature.
    await OS.aiDepthMap();
    const input = {
      isRawImage: seen instanceof FakeRawImage,
      isString: typeof seen === 'string',
      width: seen?.width,
      height: seen?.height,
      channels: seen?.channels,
      bytes: seen?.data?.length
    };

    // 2. A failing pipeline leaves the layer alone and puts the progress away.
    behaviour = 'throw';
    OS._aiPipelines = {};
    const threw = await OS.aiDepthMap();
    const afterThrow = {
      returned: threw,
      progressVisible: document.getElementById('ai-progress').classList.contains('visible'),
      elementUnchanged: OS.canvas.getObjects().some(object => object.getElement?.().src === originalElement)
    };

    // 3. Cancelling mid-run does the same.
    behaviour = 'hang';
    OS._aiPipelines = {};
    const pending = OS.aiDepthMap();
    await new Promise(resolve => setTimeout(resolve, 250));
    const cancelled = OS.cancelActiveCompute();
    const returnedAfterCancel = await pending;
    const afterCancel = {
      cancelled,
      returnedAfterCancel,
      progressVisible: document.getElementById('ai-progress').classList.contains('visible'),
      elementUnchanged: OS.canvas.getObjects().some(object => object.getElement?.().src === originalElement)
    };

    return { input, afterThrow, afterCancel, pipelineLoad };
  });

  expect(result.input.isString).toBe(false);
  expect(result.input.isRawImage).toBe(true);
  expect(result.input.width).toBe(12);
  expect(result.input.height).toBe(9);
  expect(result.input.channels).toBe(4);
  expect(result.input.bytes).toBe(12 * 9 * 4);
  expect(result.pipelineLoad).toEqual({
    task:'depth-estimation',
    model:'onnx-community/depth-anything-v2-small',
    revision:expect.stringMatching(/^[0-9a-f]{40}$/)
  });

  expect(result.afterThrow.returned).toBe(false);
  expect(result.afterThrow.progressVisible).toBe(false);
  expect(result.afterThrow.elementUnchanged).toBe(true);

  expect(result.afterCancel.cancelled).toBe(true);
  expect(result.afterCancel.returnedAfterCancel).toBe(false);
  expect(result.afterCancel.progressVisible).toBe(false);
  expect(result.afterCancel.elementUnchanged).toBe(true);
});

test('sizes exported PDF pages and PSD resolution to the document', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Enter Studio' }).click();

  const result = await page.evaluate(async () => {
    OS.createNewDocument(600, 400, { resetProject: true, background: '#ffffff' });

    const { structure } = OS._withExportCanvasState({ transparent: true }, () => OS._buildPsdExportStructure());

    // Rebuild what exportPDF writes, without triggering a download.
    const { jsPDF } = window.jspdf;
    const pageW = OS.canvasW * 72 / 96;
    const pageH = OS.canvasH * 72 / 96;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [pageW, pageH], compress: true });
    pdf.setProperties({ title: 'Fidelity', creator: 'OpenShop' });
    pdf.setLanguage('en-US');
    const captured = OS._captureExportRaster({ format: 'png', transparent: false, matte: '#ffffff' });
    pdf.addImage(captured.dataUrl, 'PNG', 0, 0, pageW, pageH, undefined, 'SLOW');
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    let text = '';
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);

    // The same page with the compression the exporter used to omit.
    const raw = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [pageW, pageH] });
    raw.addImage(captured.dataUrl, 'PNG', 0, 0, pageW, pageH);
    const rawBytes = new Uint8Array(raw.output('arraybuffer')).length;

    return {
      compressedBytes: bytes.length,
      rawBytes,
      hasFlate: /\/Filter\s*\/FlateDecode/.test(text),
      resolution: structure.imageResources?.resolutionInfo || null,
      psdSize: [structure.width, structure.height],
      mediaBox: (text.match(/\/MediaBox\s*\[([^\]]+)\]/) || [])[1],
      hasLang: /\/Lang\s*\(/.test(text),
      hasTitle: /\/Title\s*\(/.test(text),
      imageWidth: (text.match(/\/Width\s+(\d+)/) || [])[1]
    };
  });

  // 600x400 CSS pixels is 6.25 x 4.17 inches, so 450 x 300 points. jsPDF's
  // 'px' unit produced 800 x 533.33pt — an 11.1in page at roughly 54 DPI.
  const [x0, y0, x1, y1] = result.mediaBox.trim().split(/\s+/).map(Number);
  expect([x0, y0]).toEqual([0, 0]);
  expect(Math.round(x1)).toBe(450);
  expect(Math.round(y1)).toBe(300);
  // The raster itself is still the document's pixels.
  expect(result.imageWidth).toBe('600');
  expect(result.hasLang).toBe(true);
  expect(result.hasTitle).toBe(true);
  // The image stream used to be embedded raw, which made a 600x400 export
  // roughly 940 KB.
  expect(result.hasFlate).toBe(true);
  expect(result.compressedBytes).toBeLessThan(result.rawBytes / 3);

  // Without a resolution resource Photoshop picks its own density and the
  // document's physical size becomes whatever the reader guesses.
  expect(result.psdSize).toEqual([600, 400]);
  expect(result.resolution).toMatchObject({
    horizontalResolution: 96,
    verticalResolution: 96,
    horizontalResolutionUnit: 'PPI',
    verticalResolutionUnit: 'PPI'
  });
});
