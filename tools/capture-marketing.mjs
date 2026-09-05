import { spawn } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDir = join(root, 'assets', 'screenshots');
const designDir = join(root, 'design');
const port = 4174;
const origin = `http://127.0.0.1:${port}/`;

await Promise.all([
  mkdir(screenshotDir, { recursive: true }),
  mkdir(designDir, { recursive: true })
]);

const server = spawn(process.execPath, ['tests/server.mjs'], {
  cwd: root,
  env: { ...process.env, OPENSHOP_TEST_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});

let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk.toString(); });
server.stderr.on('data', chunk => { serverLog += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Capture server stopped early.\n${serverLog}`);
    try {
      const response = await fetch(origin, { cache: 'no-store' });
      if (response.ok) return;
    } catch {
      // The server may still be binding its local port.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 200));
  }
  throw new Error(`Capture server did not become ready.\n${serverLog}`);
}

async function openStudio(page) {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.documentElement.dataset.osBoot === 'ready',
    null,
    { timeout: 60_000 }
  );
  const enter = page.getByRole('button', { name: 'Enter Studio' });
  if (await enter.isVisible()) await enter.click();
  await page.locator('#welcome-overlay').waitFor({ state: 'hidden' });
}

async function buildShowcase(page) {
  await page.evaluate(async () => {
    OS.createNewDocument(1600, 1000, { resetProject: true, background: '#07101c' });

    const add = (object, name) => {
      OS._addObjectAsLayer(object, name);
      return object;
    };
    const linear = (x2, y2, colors) => new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2, y2 },
      colorStops: colors.map(([offset, color]) => ({ offset, color }))
    });

    add(new fabric.Rect({
      left: 0,
      top: 0,
      width: 1600,
      height: 1000,
      fill: linear(1600, 1000, [
        [0, '#07101d'],
        [0.52, '#102241'],
        [1, '#07101a']
      ]),
      selectable: false,
      evented: false
    }), 'Midnight backdrop');

    const gridLines = [];
    for (let x = 0; x <= 1600; x += 100) {
      gridLines.push(new fabric.Line([x, 0, x, 1000], { stroke: '#70dffc', strokeWidth: 1, opacity: 0.055 }));
    }
    for (let y = 0; y <= 1000; y += 100) {
      gridLines.push(new fabric.Line([0, y, 1600, y], { stroke: '#70dffc', strokeWidth: 1, opacity: 0.055 }));
    }
    add(new fabric.Group(gridLines, { left: 0, top: 0, selectable: false, evented: false }), 'Precision grid');

    add(new fabric.Circle({
      left: 1050,
      top: -260,
      radius: 430,
      fill: '#4458ff',
      opacity: 0.34,
      selectable: false,
      evented: false
    }), 'Indigo glow');

    add(new fabric.Path('M -80 850 C 290 600 520 1040 900 760 S 1370 480 1700 720', {
      fill: '',
      stroke: '#14d6f1',
      strokeWidth: 22,
      opacity: 0.82,
      strokeLineCap: 'round',
      selectable: false,
      evented: false
    }), 'Cyan flow');

    add(new fabric.Rect({
      left: 1035,
      top: 140,
      width: 430,
      height: 710,
      rx: 46,
      ry: 46,
      fill: 'rgba(5, 12, 25, 0.76)',
      stroke: '#46dff4',
      strokeWidth: 3,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.45)', blur: 36, offsetY: 24 }),
      selectable: false,
      evented: false
    }), 'Glass card');

    const productMark = await fabric.FabricImage.fromURL(new URL('icon-512.png', location.href).href);
    productMark.set({ left: 1094, top: 224, selectable: false, evented: false });
    productMark.scaleToWidth(312);
    add(productMark, 'OpenShop mark');

    add(new fabric.Text('LOCAL-FIRST CREATIVE WORKSPACE', {
      left: 108,
      top: 116,
      fontFamily: 'Arial',
      fontSize: 27,
      fontWeight: '700',
      charSpacing: 185,
      fill: '#68e6f7',
      selectable: false,
      evented: false
    }), 'Eyebrow');

    add(new fabric.Textbox('MAKE\nSOMETHING\nBRILLIANT', {
      left: 100,
      top: 196,
      width: 860,
      fontFamily: 'Arial',
      fontSize: 112,
      lineHeight: 0.88,
      fontWeight: '700',
      fill: '#f6f9ff',
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.32)', blur: 16, offsetY: 8 }),
      selectable: false,
      evented: false
    }), 'Headline');

    add(new fabric.Text('LAYERS  /  PSD  /  RAW  /  SVG  /  LOCAL EXPORT', {
      left: 110,
      top: 592,
      fontFamily: 'Arial',
      fontSize: 25,
      fontWeight: '600',
      charSpacing: 80,
      fill: '#c1ccdc',
      selectable: false,
      evented: false
    }), 'Format line');

    add(new fabric.Textbox('A full image studio that stays in your browser.', {
      left: 110,
      top: 650,
      width: 760,
      fontFamily: 'Arial',
      fontSize: 33,
      lineHeight: 1.25,
      fill: '#aebbd0',
      selectable: false,
      evented: false
    }), 'Supporting copy');

    add(new fabric.Rect({
      left: 108,
      top: 774,
      width: 300,
      height: 70,
      rx: 35,
      ry: 35,
      fill: linear(300, 0, [[0, '#24dff2'], [1, '#586cff']]),
      selectable: false,
      evented: false
    }), 'Action chip');

    add(new fabric.Text('OPENSHOP 0.31', {
      left: 158,
      top: 794,
      fontFamily: 'Arial',
      fontSize: 25,
      fontWeight: '700',
      charSpacing: 85,
      fill: '#03111b',
      selectable: false,
      evented: false
    }), 'Version label');

    OS._docName = 'Aurora Launch.openshop';
    OS._enforceLayerInvariants();
    OS.updateLayersPanel();
    OS.canvas.discardActiveObject();
    OS.canvas.requestRenderAll();
    OS.setTool('brush');
    OS.zoomFit();
    OS.saveHistory('Showcase artwork');
  });
  await page.waitForTimeout(500);
}

const pageErrors = [];
let browser;

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1536, height: 1024 },
    colorScheme: 'dark',
    deviceScaleFactor: 1
  });

  const desktop = await context.newPage();
  desktop.on('pageerror', error => pageErrors.push(error.message));
  await openStudio(desktop);
  await buildShowcase(desktop);

  const workspacePath = join(screenshotDir, 'editor-workspace.png');
  await desktop.screenshot({ path: workspacePath, animations: 'disabled' });
  await copyFile(workspacePath, join(designDir, 'openshop-studio-master.png'));

  await desktop.evaluate(() => OS.showExportSettings('png'));
  await desktop.getByRole('heading', { name: 'Export Settings' }).waitFor();
  await desktop.locator('#es-preview img').waitFor({ timeout: 10_000 });
  await desktop.screenshot({
    path: join(screenshotDir, 'export-settings.png'),
    animations: 'disabled'
  });

  const offline = await context.newPage();
  offline.on('pageerror', error => pageErrors.push(error.message));
  await openStudio(offline);
  await buildShowcase(offline);
  await offline.locator('#offline-state-label').waitFor({ state: 'visible' });
  await offline.waitForFunction(
    () => document.getElementById('offline-state-label')?.textContent === 'Offline ready',
    null,
    { timeout: 45_000 }
  );
  await offline.evaluate(() => OS.showOfflineManager());
  await offline.getByRole('heading', { name: 'Offline & Install' }).waitFor({ timeout: 30_000 });
  await offline.screenshot({
    path: join(screenshotDir, 'offline-install.png'),
    animations: 'disabled'
  });

  const compact = await context.newPage();
  compact.on('pageerror', error => pageErrors.push(error.message));
  await compact.setViewportSize({ width: 768, height: 1024 });
  await openStudio(compact);
  await buildShowcase(compact);
  await compact.evaluate(() => OS.setWorkspaceMode('mobile', { announce: false }));
  await compact.waitForTimeout(350);
  await compact.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    OS.zoomFit();
  });
  await compact.waitForTimeout(350);
  const compactPath = join(screenshotDir, 'compact-workspace.png');
  await compact.screenshot({ path: compactPath, animations: 'disabled' });
  await copyFile(compactPath, join(designDir, 'openshop-menu-states.png'));

  if (pageErrors.length) {
    throw new Error(`Page errors during capture:\n${pageErrors.join('\n')}`);
  }
  process.stdout.write('Captured desktop, export, offline, and compact marketing screens.\n');
} finally {
  await browser?.close();
  if (server.exitCode === null) server.kill();
}
