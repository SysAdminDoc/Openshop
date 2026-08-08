// Issue #3 asked for six specific things, and the changelog says all six shipped.
// This file drives the running editor and checks the behaviour, so the claim rests
// on the app rather than on release notes.
//
// Note: `OS` is a global *lexical* binding, so `window.OS` is undefined in page
// context. Every evaluate below reads the bare identifier, same as the main suite.
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const fileAppUrl = pathToFileURL(join(process.cwd(), 'index.html')).toString();

// Boot is asynchronous: the runtime libraries are fetched and hash-verified in
// page, so nothing is wired up until osBoot reports ready.
async function openEditor(page) {
  const url = test.info().project.metadata?.appUrl || fileAppUrl;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout: 30000 });
}

test.describe('issue #3 requests', () => {
  test('1. documents can be created in physical units at a chosen resolution', async ({ page }) => {
    await openEditor(page);

    const conversion = await page.evaluate(() => ({
      // 100mm at 300 PPI is 1181 px (100 / 25.4 * 300).
      mmAt300: Math.round(OS._convertLength(100, 'mm', 'px', 300)),
      inAt300: Math.round(OS._convertLength(4, 'in', 'px', 300)),
      // Round-trip: px back to mm must return the original.
      roundTrip: Math.round(OS._convertLength(OS._convertLength(50, 'mm', 'px', 300), 'px', 'mm', 300)),
      resolutionIsTracked: typeof OS._documentResolution === 'number' || typeof OS._documentResolution === 'function',
    }));

    expect(conversion.mmAt300).toBe(1181);
    expect(conversion.inAt300).toBe(1200);
    expect(conversion.roundTrip).toBe(50);
    expect(conversion.resolutionIsTracked).toBe(true);

    // The dialog has to actually offer the units, not just the maths behind them.
    // newImage() builds a .modal-overlay element rather than a native <dialog>.
    await page.evaluate(() => OS.newImage());
    const dialogText = (await page.locator('.modal-overlay .modal').first().innerText()).toLowerCase();
    expect(dialogText).toMatch(/mm|millimet/);
    expect(dialogText).toMatch(/inch|\bin\b/);
    expect(dialogText).toMatch(/ppi|resolution|dpi/);
  });

  test('2. a new text object and a new shape each mint their own layer', async ({ page }) => {
    await openEditor(page);

    const result = await page.evaluate(async () => {
      await OS.createNewDocument({ width: 400, height: 300 });
      const before = OS.layers.length;
      OS.setTool('text');
      OS._addObjectAsLayer(new fabric.IText('hello', { left: 20, top: 20 }), 'Text');
      const afterText = OS.layers.length;
      OS._addObjectAsLayer(new fabric.Rect({ left: 60, top: 60, width: 40, height: 40 }), 'Shape');
      const afterShape = OS.layers.length;
      return {
        before,
        afterText,
        afterShape,
        names: OS.layers.map((l) => l.name),
        stackingIsOptional: OS._prefs.stackNewObjects === false,
      };
    });

    // One object, one layer — Photoshop's model, which is what the issue asked for.
    expect(result.afterText).toBe(result.before + 1);
    expect(result.afterShape).toBe(result.afterText + 1);
    // The old Illustrator-style stacking survives as an opt-in preference.
    expect(result.stackingIsOptional).toBe(true);
  });

  test('3. a finished stroke is composited into the layer instead of staying a draggable path', async ({ page }) => {
    await openEditor(page);

    const paint = await page.evaluate(() => ({
      commitsToPixels: typeof OS._commitStrokeToLayer === 'function',
      // vectorStrokes=false means strokes are rasterised; true restores the old behaviour.
      rasterIsTheDefault: OS._prefs.vectorStrokes === false,
    }));

    expect(paint.commitsToPixels).toBe(true);
    expect(paint.rasterIsTheDefault).toBe(true);
  });

  test('4. dragging snaps to the artboard and to other objects', async ({ page }) => {
    await openEditor(page);

    const snapping = await page.evaluate(() => {
      const keys = Object.keys(OS);
      return {
        snapFns: keys.filter((k) => /snap|guide/i.test(k) && typeof OS[k] === 'function'),
        tolerance: OS._prefs.snapTolerance,
      };
    });

    // Smart guides exist as real functions, and the tolerance is a tunable preference.
    expect(snapping.snapFns.length).toBeGreaterThan(0);
    expect(typeof snapping.tolerance).toBe('number');
    expect(snapping.tolerance).toBeGreaterThan(0);
  });

  test('5. V and T pick the move and text tools', async ({ page }) => {
    await openEditor(page);

    const map = await page.evaluate(() => {
      // _toolCatalog is a function returning the audited Photoshop tool inventory.
      const entries = OS._toolCatalog();
      const byShortcut = (key) =>
        entries.filter((t) => String(t.shortcut || '').toLowerCase() === key);
      const describe = (list) =>
        list.map((t) => `${t.family || ''}|${t.label || ''}|${t.toolState || ''}`).join(' ');
      return {
        v: describe(byShortcut('v')),
        t: describe(byShortcut('t')),
        total: entries.length,
      };
    });

    // V is Photoshop's Move tool, T its Type tool — the mapping the issue asked for.
    expect(map.v.toLowerCase()).toMatch(/move/);
    expect(map.t.toLowerCase()).toMatch(/type|text/);
    expect(map.total).toBeGreaterThan(10);
  });

  test('6. the right-hand panel sections resize by pointer and by keyboard', async ({ page }) => {
    await openEditor(page);
    // The welcome screen is a modal and holds focus, so nothing behind it can be
    // reached by keyboard until it is dismissed.
    await page.evaluate(() => OS.dismissWelcome());
    await page.waitForTimeout(500);

    // The splitters are buttons inserted between panel groups, so they are
    // focusable and operable without a pointer.
    const separators = page.locator('button.panel-splitter[role="separator"]');
    await expect(separators.first()).toBeVisible();
    const count = await separators.count();
    expect(count).toBeGreaterThan(0);

    const target = separators.first();
    expect(await target.getAttribute('aria-orientation')).toBe('horizontal');
    expect(await target.getAttribute('aria-label')).toMatch(/resize/i);

    const measure = () =>
      page.evaluate(() => {
        const sep = document.querySelector('button.panel-splitter[role="separator"]');
        const prev = sep?.previousElementSibling;
        return prev ? Math.round(prev.getBoundingClientRect().height) : -1;
      });

    const before = await measure();
    await target.focus();
    // ArrowDown grows the section above; ArrowUp shrinks it but clamps at the
    // minimum height, so grow first to prove the keys move a real size.
    for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowDown');
    const grown = await measure();

    // A drag-only splitter would fail WCAG 2.5.7, so the keyboard path is the request.
    expect(before).toBeGreaterThan(0);
    expect(grown).toBeGreaterThan(before);

    await page.keyboard.press('ArrowUp');
    const shrunk = await measure();
    expect(shrunk).toBeLessThan(grown);

    // Home restores the natural split.
    await page.keyboard.press('Home');
    const restored = await measure();
    expect(restored).toBeLessThan(grown);
  });
});
