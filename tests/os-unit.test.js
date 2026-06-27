import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCanvasMock,
  installFabricMock,
  loadOpenShop,
  mountEditorDom,
  quietUiMethods
} from './os-harness.js';

describe('OpenShop core object', () => {
  beforeEach(() => {
    installFabricMock();
    mountEditorDom();
  });

  it('switches tools and updates canvas interaction state', () => {
    const OS = loadOpenShop();
    const object = { name: 'Layer Object', selectable: false, evented: false };
    OS.canvas = createCanvasMock([object]);
    quietUiMethods(OS);

    OS.setTool('brush');

    expect(OS.state.tool).toBe('brush');
    expect(OS.canvas.isDrawingMode).toBe(true);
    expect(document.querySelector('[data-tool="brush"]').classList.contains('active')).toBe(true);
    expect(document.getElementById('opt-brush').style.display).toBe('flex');

    OS.setTool('select');

    expect(OS.canvas.selection).toBe(true);
    expect(OS.canvas.defaultCursor).toBe('default');
    expect(object.selectable).toBe(true);
    expect(object.evented).toBe(true);

    OS.setTool('ai-segment');

    expect(OS.state.tool).toBe('ai-segment');
    expect(OS.canvas.defaultCursor).toBe('crosshair');
    expect(document.querySelector('[data-tool="ai-segment"]').classList.contains('active')).toBe(true);
    expect(document.getElementById('opt-ai-segment').style.display).toBe('flex');
  });

  it('adds and deletes layers while keeping canvas objects in sync', () => {
    const OS = loadOpenShop();
    const canvasObject = { name: 'Pixel Layer', type: 'image' };
    OS.canvas = createCanvasMock([canvasObject]);
    quietUiMethods(OS);
    OS.saveHistory = vi.fn();

    OS.addLayer();

    expect(OS.layers).toHaveLength(1);
    expect(OS.layers[0].name).toBe('Layer 0');
    expect(OS.activeLayerIdx).toBe(0);
    expect(OS.saveHistory).toHaveBeenCalledWith('New Layer');

    OS.layers[0].objects.push(canvasObject);
    OS.deleteLayer();

    expect(OS.canvas.remove).toHaveBeenCalledWith(canvasObject);
    expect(OS.layers).toHaveLength(0);
    expect(OS.saveHistory).toHaveBeenCalledWith('Delete Layer');
  });

  it('restores prior snapshots through undo and redo', () => {
    const OS = loadOpenShop();
    const canvas = createCanvasMock();
    let snapshotName = 'Initial';
    canvas.toJSON = vi.fn(() => ({ objects: [{ name: snapshotName }] }));
    const restored = [];
    canvas.loadFromJSON = vi.fn((json, callback) => {
      restored.push(json.objects[0].name);
      callback();
    });
    OS.canvas = canvas;
    quietUiMethods(OS);
    OS.rebuildLayersFromCanvas = vi.fn();
    OS.setTool = vi.fn();

    OS.saveHistory('Initial');
    snapshotName = 'Edited';
    OS.saveHistory('Edited');

    OS.undo();
    OS.redo();

    expect(restored).toEqual(['Initial', 'Edited']);
    expect(OS.historyIdx).toBe(1);
    expect(OS.setTool).toHaveBeenCalledWith('select');
  });

  it('exports PNG using a sanitized download name', () => {
    const OS = loadOpenShop();
    const boundary = {
      name: '__boundary__',
      opacity: 1,
      fill: 'transparent',
      set(property, value) {
        this[property] = value;
      }
    };
    OS.canvas = createCanvasMock([boundary]);
    quietUiMethods(OS);
    OS._docName = 'Client Proof 01';
    const clicks = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicks.push({ download: this.download, href: this.href });
    });

    OS.saveFile('png');

    expect(OS.canvas.toDataURL).toHaveBeenCalledWith({
      format: 'png',
      quality: 1,
      left: 0,
      top: 0,
      width: 1920,
      height: 1080
    });
    expect(clicks[0].download).toBe('Client_Proof_01.png');
    expect(boundary.opacity).toBe(1);
    expect(OS.toast).toHaveBeenCalledWith('Exported as PNG', 'success');
  });

  it('routes keyboard shortcuts to undo, redo, save, and tool selection', () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS.undo = vi.fn();
    OS.redo = vi.fn();
    OS.saveProject = vi.fn();
    OS.setTool = vi.fn();

    OS._initKeyboardShortcuts();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));

    expect(OS.undo).toHaveBeenCalledTimes(1);
    expect(OS.redo).toHaveBeenCalledTimes(1);
    expect(OS.saveProject).toHaveBeenCalledTimes(1);
    expect(OS.setTool).toHaveBeenCalledWith('brush');
  });

  it('converts a clicked segmentation result into a pixel selection mask', async () => {
    const OS = loadOpenShop();
    const target = {
      name: 'Subject Photo',
      type: 'image',
      width: 16,
      height: 16,
      scaleX: 1,
      scaleY: 1,
      originX: 'left',
      originY: 'top',
      visible: true,
      getElement: () => ({ naturalWidth: 16, naturalHeight: 16 }),
      calcTransformMatrix: () => [1, 0, 0, 1, 8, 8]
    };
    const canvas = createCanvasMock([target]);
    canvas.setActiveObject(target);
    OS.canvas = canvas;
    quietUiMethods(OS);
    OS._showAIProgress = vi.fn();
    OS._hideAIProgress = vi.fn();
    OS._showMaskOverlay = vi.fn();
    OS._imageToDataURL = vi.fn(() => 'data:image/png;base64,TEST');

    const makeMask = (predicate) => {
      const data = new Uint8Array(16 * 16);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (predicate(x, y)) data[y * 16 + x] = 255;
        }
      }
      return { width: 16, height: 16, channels: 1, data };
    };
    const results = [
      { label: 'left-object', score: 0.95, mask: makeMask((x, y) => x >= 1 && x <= 4 && y >= 4 && y <= 11) },
      { label: 'right-object', score: 0.9, mask: makeMask((x, y) => x >= 12 && x <= 15 && y >= 4 && y <= 11) }
    ];
    const segmenter = vi.fn().mockResolvedValue(results);
    OS._loadPipeline = vi.fn().mockResolvedValue(segmenter);

    await OS.aiSegmentSelectAt({ x: 14, y: 8 });

    expect(OS._loadPipeline).toHaveBeenCalledWith(
      'image-segmentation',
      'Xenova/detr-resnet-50-panoptic',
      'Segment Select'
    );
    expect(segmenter).toHaveBeenCalledWith('data:image/png;base64,TEST');
    expect(OS._selectionBounds).toEqual({ x: 13, y: 5, w: 4, h: 8 });
    expect(OS._selectionMask.mask.filter(Boolean)).toHaveLength(32);
    expect(OS._showMaskOverlay).toHaveBeenCalledWith(OS._selectionMask);
    expect(OS.toast).toHaveBeenCalledWith('Selected segment: right-object (32 px)', 'success');
  });

  it('prefers Photon filters and falls back to the JS worker after failure', async () => {
    const OS = loadOpenShop();
    const input = { data: new Uint8ClampedArray([10, 20, 30, 255]) };
    const photonResult = { data: new Uint8ClampedArray([255, 255, 255, 255]) };
    const fallbackResult = { data: new Uint8ClampedArray([0, 0, 0, 255]) };

    OS._runPhotonFilterInWorker = vi.fn().mockResolvedValueOnce(photonResult);
    OS._runFilterInWorker = vi.fn();

    await expect(OS._runFilterWithPhoton('edgeDetect', 'fallback()', input, 1, 1)).resolves.toBe(photonResult);
    expect(OS._runPhotonFilterInWorker).toHaveBeenCalledWith('edgeDetect', input, 1, 1, undefined);
    expect(OS._runFilterInWorker).not.toHaveBeenCalled();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    OS._runPhotonFilterInWorker = vi.fn().mockRejectedValueOnce(new Error('WASM blocked'));
    OS._runFilterInWorker = vi.fn().mockResolvedValueOnce(fallbackResult);

    await expect(OS._runFilterWithPhoton('threshold', 'fallback()', input, 1, 1, { thr: 128 })).resolves.toBe(fallbackResult);
    expect(OS._photonFilterDisabled).toBe(true);
    expect(OS._runFilterInWorker).toHaveBeenCalledWith('fallback()', input, 1, 1, { thr: 128 });
    warn.mockRestore();
  });

  it('routes one-click direct filters through the image-data backend', async () => {
    const OS = loadOpenShop();
    const active = { name: 'Photo', type: 'image' };
    const canvas = createCanvasMock([active]);
    canvas.setActiveObject(active);
    OS.canvas = canvas;
    quietUiMethods(OS);

    const input = { data: new Uint8ClampedArray([10, 20, 30, 255]), width: 1, height: 1 };
    const output = { data: new Uint8ClampedArray([30, 40, 50, 255]), width: 1, height: 1 };
    const info = { active, canvas: { width: 1, height: 1 }, imgData: input };
    OS._getActiveImageData = vi.fn(() => info);
    OS._runFilterWithPhoton = vi.fn().mockResolvedValue(output);
    OS._commitImageData = vi.fn();

    await OS.applyFilterDirect('Sharpen');

    expect(OS._runFilterWithPhoton).toHaveBeenCalledWith(
      'sharpen',
      expect.stringContaining('const src=new Uint8ClampedArray'),
      input,
      1,
      1,
      {}
    );
    expect(OS._commitImageData).toHaveBeenCalledWith({...info, imgData: output}, 'Filter: Sharpen');
    expect(OS._lastFilter).toBe('Sharpen');
    expect(OS.toast).toHaveBeenCalledWith('Applied Sharpen', 'success');
  });
});
