import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('http://127.0.0.1:4173/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout:30000 });
}

test('reports the mobile and stylus capability matrix without overstating hardware support @mobile', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    OS.setWorkspaceMode('mobile', { announce:false });
    OS.setTool('brush');
    OS._beginPressureStroke({ pointerType:'pen', pressure:0.15 });
    OS._updatePressureBrush({ pointerType:'pen', pressure:0.85 });
    OS._endPressureStroke();

    const visualViewportBefore = OS._buildInputCapabilityReport().visualViewport.resizeEvents;
    window.visualViewport?.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('orientationchange'));
    const report = OS.buildDiagnosticsReport();
    const input = report.capabilities.input;
    const toolbar = document.getElementById('toolbar')?.getBoundingClientRect();
    const panelToggle = document.querySelector('.mobile-panel-toggle')?.getBoundingClientRect();
    return {
      input,
      visualViewportResizeObserved:input.visualViewport.resizeEvents > visualViewportBefore,
      orientationChangeObserved:input.orientation.changeEvents > 0,
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
      toolbarWithinViewport:Boolean(toolbar && toolbar.left >= 0 && toolbar.right <= window.innerWidth + 1),
      panelToggleWithinViewport:Boolean(panelToggle && panelToggle.left >= 0 && panelToggle.right <= window.innerWidth + 1)
    };
  });

  expect(result.input.workspace).toBe('mobile');
  expect(typeof result.input.pointerEvents).toBe('boolean');
  expect(typeof result.input.touchEvents).toBe('boolean');
  expect(result.input.maxTouchPoints).toBeGreaterThanOrEqual(0);
  expect(typeof result.input.pressure.api).toBe('boolean');
  expect(result.input.pressure.observedVariance).toBe(true);
  expect(result.input.pointerStream).toMatchObject({
    coalescedEvents:{ api:expect.any(Boolean), observedSamples:expect.any(Number) },
    predictedEvents:{ api:expect.any(Boolean), observedSamples:expect.any(Number) },
    tilt:{ api:expect.any(Boolean), observedSamples:expect.any(Number) },
    usesCoalescedSamples:expect.any(Boolean),
    usesPredictedSamples:expect.any(Boolean),
    usesTilt:expect.any(Boolean)
  });
  expect(result.input.visualViewport.available).toBe(true);
  expect(result.visualViewportResizeObserved).toBe(true);
  expect(result.orientationChangeObserved).toBe(true);
  expect(result.documentWidth).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.toolbarWithinViewport).toBe(true);
  expect(result.panelToggleWithinViewport).toBe(true);
});

test('supports a two-finger pinch without changing the document session @mobile', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    OS.setWorkspaceMode('mobile', { announce:false });
    const area = document.getElementById('canvas-area');
    const makeTouch = (identifier, clientX, clientY) => {
      try {
        if (typeof Touch === 'function') {
          return new Touch({ identifier, target:area, clientX, clientY, pageX:clientX, pageY:clientY, screenX:clientX, screenY:clientY });
        }
      } catch (error) { /* WebKit exposes Touch but protects its constructor. */ }
      return { identifier, target:area, clientX, clientY, pageX:clientX, pageY:clientY, screenX:clientX, screenY:clientY };
    };
    const dispatchTouches = (type, touches) => {
      let event;
      try {
        event = new TouchEvent(type, { bubbles:true, cancelable:true, touches, targetTouches:touches, changedTouches:touches });
      } catch (error) {
        event = new Event(type, { bubbles:true, cancelable:true });
        Object.defineProperty(event, 'touches', { configurable:true, value:touches });
      }
      area.dispatchEvent(event);
    };
    const before = { zoom:OS.zoom, documentId:OS._documentId, history:OS.history.length };
    dispatchTouches('touchstart', [makeTouch(1, 120, 260), makeTouch(2, 220, 260)]);
    dispatchTouches('touchmove', [makeTouch(1, 80, 260), makeTouch(2, 260, 260)]);
    dispatchTouches('touchend', []);
    return {
      before,
      after:{ zoom:OS.zoom, documentId:OS._documentId, history:OS.history.length },
      capability:OS.buildDiagnosticsReport().capabilities.input
    };
  });

  expect(result.after.zoom).toBeGreaterThan(result.before.zoom);
  expect(result.after.documentId).toBe(result.before.documentId);
  expect(result.after.history).toBe(result.before.history);
  expect(result.capability.maxTouchPoints).toBeGreaterThanOrEqual(0);
});
