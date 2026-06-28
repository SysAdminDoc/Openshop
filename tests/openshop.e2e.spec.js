import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const appUrl = pathToFileURL(join(process.cwd(), 'index.html')).toString();

test('loads the editor shell and supports core UI interactions', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#editor-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#welcome-overlay')).toHaveClass(/hidden/);
  await expect(page.locator('.tool-btn[data-tool="select"]').first()).toHaveClass(/active/);

  const brushTool = page.locator('.tool-btn[data-tool="brush"]').first();
  await brushTool.click();
  await brushTool.click();
  await expect(brushTool).toHaveClass(/active/);

  const layerItems = page.locator('#layers-list .layer-item');
  const layerCount = await layerItems.count();
  await page.locator('button[title="New Layer"]').click();
  await expect(layerItems).toHaveCount(layerCount + 1);

  await page.keyboard.press('Control+Z');
  await expect(page.locator('#history-list .history-item.current')).toContainText(/New Document|New Layer/);

  await expect(page).toHaveScreenshot('openshop-editor-shell.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixelRatio: 0.03
  });
  expect(pageErrors).toEqual([]);
});

test('applies a one-click pixel filter to an active image layer', async ({ page }) => {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Skip' }).click();

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

    await new Promise((resolve) => {
      fabric.Image.fromURL(source.toDataURL('image/png'), (img) => {
        img.set({ name: 'Filter Smoke', left: 20, top: 20, selectable: true });
        OS.canvas.add(img);
        if (!OS.layers.length) OS.addLayer();
        OS.layers[OS.activeLayerIdx].objects.push(img);
        OS.canvas.setActiveObject(img);
        OS.canvas.renderAll();
        resolve();
      });
    });

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
  expect(result.activeName).toBe('Filter: Sharpen');
  expect(typeof result.photonDisabled).toBe('boolean');
});

test('creates a pixel selection from a mocked AI segment mask', async ({ page }) => {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Skip' }).click();

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

    await new Promise((resolve) => {
      fabric.Image.fromURL(source.toDataURL('image/png'), (img) => {
        img.set({ name: 'Segment Smoke', left: 0, top: 0, selectable: true });
        OS.canvas.add(img);
        OS.layers[OS.activeLayerIdx].objects.push(img);
        OS.canvas.setActiveObject(img);
        OS.canvas.renderAll();
        resolve();
      });
    });

    const data = new Uint8Array(16 * 16);
    for (let y = 4; y <= 11; y++) {
      for (let x = 12; x <= 15; x++) data[y * 16 + x] = 255;
    }
    OS._loadPipeline = async () => async () => [
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

test('mirrors tool, layer, selection, and actions for assistive tech', async ({ page }) => {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Skip' }).click();

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

test('renders persisted UI data without activating markup', async ({ page }) => {
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
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
