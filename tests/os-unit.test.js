import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createCanvasMock,
  installFabricMock,
  installModalDelegation,
  loadOpenShop,
  mountEditorDom,
  quietUiMethods
} from './os-harness.js';

describe('OpenShop core object', () => {
  beforeEach(() => {
    localStorage.clear();
    installFabricMock();
    installModalDelegation();
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
    expect(OS.layers).toHaveLength(1);
    expect(OS.layers[0].name).toBe('Layer 0');
    expect(OS.layers[0].objects).toHaveLength(0);
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

  it('mirrors canvas state into hidden accessibility nodes', () => {
    const OS = loadOpenShop();
    const canvasObject = { name: 'Subject', type: 'image' };
    OS.canvas = createCanvasMock([canvasObject]);
    OS.cancelCrop = vi.fn();
    OS.updateInfoPanel = vi.fn();
    OS.updateMinimap = vi.fn();
    OS.updateHistogram = vi.fn();
    OS.updateHistoryPanel = vi.fn();
    OS.recordMacroStep = vi.fn();
    OS.layers = [
      { name: 'Background', visible: true, locked: true, opacity: 100, blend: 'source-over', objects: [] },
      { name: 'Subject Layer', visible: true, locked: false, opacity: 80, blend: 'multiply', objects: [canvasObject] }
    ];
    OS.activeLayerIdx = 1;
    OS._selectionBounds = { x: 4, y: 6, w: 10, h: 12 };
    OS._selectionMask = { w: 20, h: 20, mask: new Uint8Array(400) };
    OS._selectionMask.mask[0] = 1;
    OS._selectionMask.mask[1] = 1;

    OS.setTool('ai-segment');
    OS._lastAction = 'Filter: Sharpen';
    OS._renderAccessibilityTree();
    OS.toast('Filter applied', 'success');

    expect(document.getElementById('canvas-a11y-tool').textContent).toBe('Tool: AI Segment');
    expect(document.getElementById('canvas-a11y-layer').textContent).toContain('Subject Layer');
    expect(document.getElementById('canvas-a11y-layer').textContent).toContain('multiply');
    expect(document.getElementById('canvas-a11y-selection').textContent).toContain('2 pixels selected');
    expect(document.getElementById('canvas-a11y-summary').textContent).toContain('Last action: Filter: Sharpen');
    expect(document.getElementById('canvas-a11y-live').textContent).toBe('Filter applied');
    expect(document.getElementById('canvas-area').getAttribute('aria-label')).toContain('Tool: AI Segment');
    expect(document.querySelectorAll('#canvas-a11y-layers li')).toHaveLength(2);
  });

  it('renders persisted recent files, palettes, and presets as inert DOM', () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    OS.cancelCrop = vi.fn();
    const payload = '<img src=x onerror=alert(1)>';
    localStorage.setItem('openshop_recent', JSON.stringify([
      { name: payload, dims: '<svg onload=alert(2)>', date: '<script>alert(3)</script>' }
    ]));
    localStorage.setItem('os_palette', JSON.stringify([
      '#112233',
      'url(javascript:alert(1))',
      '#AABBCC',
      '<img src=x onerror=alert(1)>'
    ]));
    localStorage.setItem('os_presets', JSON.stringify([
      { name: payload, adjustments: { brightness: '20', contrast: 'bad' }, custom: true }
    ]));

    OS.populateRecentFiles();
    OS.loadSavedPalette();
    OS.showPresets();

    expect(document.querySelector('#recent-files-area img')).toBeNull();
    expect(document.querySelector('#recent-files-area script')).toBeNull();
    expect(document.getElementById('recent-files-area').textContent).toContain(payload);
    expect(document.querySelectorAll('#palette-saved .palette-swatch')).toHaveLength(2);
    expect([...document.querySelectorAll('#palette-saved .palette-swatch')].map(el => el.title)).toEqual(['#112233', '#aabbcc']);
    const presetModal = document.querySelector('.modal-overlay .modal');
    expect(presetModal.querySelector('img')).toBeNull();
    expect(presetModal.querySelector('script')).toBeNull();
    expect(presetModal.textContent).toContain(payload);
  });

  it('renders dynamic command, context, note, timeline, macro, and AI UI as inert DOM', () => {
    const OS = loadOpenShop();
    const payload = '<img src=x onerror=alert(1)>';
    const active = {
      name: 'Photo',
      type: 'image',
      bringToFront: vi.fn(),
      bringForward: vi.fn(),
      sendBackwards: vi.fn(),
      sendToBack: vi.fn()
    };
    const canvas = createCanvasMock([active]);
    canvas.setActiveObject(active);
    OS.canvas = canvas;
    quietUiMethods(OS);

    OS._getCommands = () => [{ label: payload, cat: '<script>alert(2)</script>', key: '<svg onload=alert(3)>', fn: vi.fn() }];
    OS.filterCommands('');
    expect(document.querySelector('#cmd-results img')).toBeNull();
    expect(document.getElementById('cmd-results').textContent).toContain(payload);

    OS._lastFilter = payload;
    OS.initContextMenu();
    document.getElementById('canvas-area').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 4, clientY: 6 }));
    expect(document.querySelector('#context-menu img')).toBeNull();
    expect(document.getElementById('context-menu').textContent).toContain(payload);

    OS.addStickyNote({ clientX: 10, clientY: 20 });
    expect(document.querySelector('#sticky-container [onclick]')).toBeNull();
    expect(document.querySelector('#sticky-container textarea').placeholder).toBe('Type a note...');

    OS.canvasW = 2;
    OS.canvasH = 2;
    OS._animFrames = ['data:image/png;base64,TEST'];
    OS._renderFrames();
    expect(document.querySelector('#timeline-frames [onclick]')).toBeNull();
    expect(document.getElementById('timeline-frames').textContent).toContain('#1');

    OS._macroSteps = [{ action: payload }];
    OS._renderMacroList();
    expect(document.querySelector('#macro-list img')).toBeNull();
    expect(document.getElementById('macro-list').textContent).toContain(payload);

    OS._showAIProgress(payload, '<script>alert(4)</script>');
    expect(document.querySelector('#ai-title img')).toBeNull();
    expect(document.getElementById('ai-title').textContent).toContain(payload);
    expect(document.getElementById('ai-msg').textContent).toBe('<script>alert(4)</script>');

    OS.saveCurrentAsPreset();
    const presetOverlay = document.querySelector('.modal-overlay');
    expect(presetOverlay.querySelector('[onclick]')).toBeNull();
    expect(presetOverlay.textContent).toContain('Save Preset');
  });

  it('keeps the filter worker on named operations instead of string execution', async () => {
    const source = readFileSync('index.html', 'utf8');
    expect(source).not.toContain("'unsafe-eval'");
    expect(source).not.toContain('new Function');
    expect(source).not.toMatch(/_runFilterInWorker\s*\(\s*`/);
    expect(source).not.toMatch(/\bfn:`/);

    const OS = loadOpenShop();
    OS._photonFilterDisabled = true;
    OS._runFilterJob = vi.fn().mockResolvedValue('filtered');
    const imageData = new ImageData(new Uint8ClampedArray(4), 1, 1);

    await expect(OS._runFilterWithPhoton('threshold', imageData, 1, 1, { thr: 128 })).resolves.toBe('filtered');
    expect(OS._runFilterJob).toHaveBeenCalledWith(
      { backend: 'worker', op: 'threshold' },
      imageData,
      1,
      1,
      { thr: 128 }
    );
    expect(OS._getDirectPhotonFilter('Sharpen')).toEqual({ op: 'sharpen' });
    expect(OS._getDirectPhotonFilter('BlackWhite')).toEqual({ op: 'threshold', params: { thr: 128 } });
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

    await expect(OS._runFilterWithPhoton('edgeDetect', input, 1, 1)).resolves.toBe(photonResult);
    expect(OS._runPhotonFilterInWorker).toHaveBeenCalledWith('edgeDetect', input, 1, 1, undefined);
    expect(OS._runFilterInWorker).not.toHaveBeenCalled();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    OS._runPhotonFilterInWorker = vi.fn().mockRejectedValueOnce(new Error('WASM blocked'));
    OS._runFilterInWorker = vi.fn().mockResolvedValueOnce(fallbackResult);

    await expect(OS._runFilterWithPhoton('threshold', input, 1, 1, { thr: 128 })).resolves.toBe(fallbackResult);
    expect(OS._photonFilterDisabled).toBe(true);
    expect(OS._runFilterInWorker).toHaveBeenCalledWith('threshold', input, 1, 1, { thr: 128 });
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
      input,
      1,
      1,
      {}
    );
    expect(OS._commitImageData).toHaveBeenCalledWith({...info, imgData: output}, 'Filter: Sharpen');
    expect(OS._lastFilter).toBe('Sharpen');
    expect(OS.toast).toHaveBeenCalledWith('Applied Sharpen', 'success');
  });

  it('preflights PSD headers, dimensions, layers, and metadata before bitmap decode', async () => {
    const OS = loadOpenShop();
    const makeHeader = ({ width = 100, height = 80, channels = 4, depth = 8, colorMode = 3 } = {}) => {
      const bytes = new Uint8Array(26);
      bytes.set([0x38, 0x42, 0x50, 0x53], 0);
      const view = new DataView(bytes.buffer);
      view.setUint16(4, 1, false);
      view.setUint16(12, channels, false);
      view.setUint32(14, height, false);
      view.setUint32(18, width, false);
      view.setUint16(22, depth, false);
      view.setUint16(24, colorMode, false);
      return bytes;
    };
    const lib = {
      readPsd: vi.fn(() => ({
        width: 100,
        height: 80,
        children: [{ name: '<img src=x onerror=alert(1)>', left: 0, top: 0, right: 10, bottom: 10 }]
      }))
    };

    await expect(OS._preflightPSD(lib, makeHeader(), 1024)).resolves.toMatchObject({ width: 100, height: 80 });
    expect(lib.readPsd).toHaveBeenCalledWith(expect.any(Uint8Array), expect.objectContaining({
      skipCompositeImageData: true,
      skipLayerImageData: true
    }));

    expect(() => OS._validatePSDHeader(OS._readPSDHeader(makeHeader({ width: 90000 })), 1024)).toThrow(/dimensions exceed/);
    expect(() => OS._validatePSDHeader(OS._readPSDHeader(makeHeader({ depth: 32 })), 1024)).toThrow(/bit depth/);
    expect(() => OS._validatePSDHeader(OS._readPSDHeader(makeHeader({ colorMode: 4 })), 1024)).toThrow(/RGB/);
    expect(() => OS._validatePSDStructure({
      width: 100,
      height: 80,
      children: Array.from({ length: OS._psdLimits.maxLayers + 1 }, (_, i) => ({ name: `Layer ${i}` }))
    })).toThrow(/layers/);
    expect(() => OS._validatePSDStructure({
      width: 100,
      height: 80,
      children: [{ left: 0, top: 0, right: 100000, bottom: 2 }]
    })).toThrow(/layer 1 exceeds/);
  });

  it('centralizes import schemas and resource budgets', () => {
    const OS = loadOpenShop();
    OS.toast = vi.fn();
    const image = { type: 'image/png', size: 1024, name: 'safe.png' };
    expect(() => OS._validateImageFile(image)).not.toThrow();
    expect(() => OS._validateImageFile({ type: 'text/html', size: 1 })).toThrow(/Unsupported image/);
    expect(() => OS._validateDecodedImage({ width: 40000, height: 10 })).toThrow(/dimensions exceed/);
    expect(() => OS._assertJsonFileBudget({ size: OS._importLimits.maxJsonBytes + 1 }, 'Project')).toThrow(/Project file exceeds/);

    const project = {
      _openShop: { w: '1200', h: '800' },
      objects: [{ id: '<bad>', name: 'javascript:alert(1) onerror=x' }]
    };
    OS._sanitizeProjectJSON(project);
    expect(project._openShop).toEqual({ w: 1200, h: 800 });
    expect(project.objects[0].id).toBe('bad');
    expect(project.objects[0].name).not.toContain('javascript:');

    expect(() => OS._sanitizeProjectJSON({ _openShop: { w: 100000, h: 100000 } })).toThrow(/Project dimensions/);
    expect(OS._sanitizePaletteColors(['#ABCDEF', 'javascript:alert(1)', '#112233']).map(c => c)).toEqual(['#abcdef', '#112233']);
    expect(OS._sanitizePresetList([
      { name: '<img src=x onerror=alert(1)>', adjustments: { brightness: '9999', contrast: 'bad' } },
      { name: '', adjustments: {} }
    ])).toEqual([
      { name: '<img src=x onerror=alert(1)>', adjustments: { brightness: 300, contrast: 0, saturation: 0, hue: 0, vibrance: 0 }, custom: false }
    ]);
  });

  it('shows recovery storage status and restores sanitized recovery data', async () => {
    const OS = loadOpenShop();
    const canvas = createCanvasMock();
    OS.canvas = canvas;
    quietUiMethods(OS);
    OS.rebuildLayersFromCanvas = vi.fn();
    OS.zoomFit = vi.fn();
    const recovery = JSON.stringify({ _openShop: { w: 640, h: 480 }, objects: [{ name: 'javascript:alert(1)' }] });
    OS._getRecoveryInfo = vi.fn().mockResolvedValue({
      supported: true,
      exists: true,
      corrupt: false,
      ageMs: 120000,
      size: recovery.length,
      usage: 2048,
      quota: 4096,
      text: recovery
    });

    await OS.showRecoveryManager();
    const modal = document.querySelector('.modal-overlay .modal');
    expect(modal.textContent).toContain('Recovery Storage');
    expect(modal.textContent).toContain('Available');
    expect(modal.textContent).toContain('2 min ago');
    expect(modal.querySelector('[onclick]')).toBeNull();

    modal.querySelector('.btn-primary').click();
    expect(canvas.loadFromJSON).toHaveBeenCalledWith(
      expect.objectContaining({ _openShop: { w: 640, h: 480 } }),
      expect.any(Function)
    );
    expect(OS.toast).toHaveBeenCalledWith('Project restored from auto-save', 'success');

    OS._getRecoveryInfo = vi.fn().mockResolvedValue({
      supported: true,
      exists: true,
      corrupt: true,
      error: '<img src=x onerror=alert(1)>',
      ageMs: 0,
      size: 4,
      usage: 4,
      quota: 10,
      text: '{bad'
    });
    await OS.showRecoveryManager();
    const corruptModal = document.querySelector('.modal-overlay .modal');
    expect(corruptModal.querySelector('img')).toBeNull();
    expect(corruptModal.textContent).toContain('Corrupt');
    expect(corruptModal.querySelector('.btn-primary').disabled).toBe(true);
  });

  it('round-trips project save and open with sanitization', async () => {
    const OS = loadOpenShop();
    const boundary = { name: '__boundary__', type: 'rect', visible: true };
    const photo = { name: 'Photo', type: 'image', visible: true, opacity: 1 };
    const canvas = createCanvasMock([boundary, photo]);
    canvas.toJSON = vi.fn(() => ({
      objects: [
        { name: '__boundary__', type: 'rect' },
        { name: 'Photo', type: 'image' }
      ]
    }));
    OS.canvas = canvas;
    OS.layers = [{ name: 'Background', visible: true, opacity: 100, blend: 'source-over', objects: [boundary, photo] }];
    OS.canvasW = 800;
    OS.canvasH = 600;
    quietUiMethods(OS);
    OS.rebuildLayersFromCanvas = vi.fn();
    OS.zoomFit = vi.fn();
    OS.saveHistory = vi.fn();
    OS._clearAutoSave = vi.fn();

    const json = canvas.toJSON();
    json._openShop = { version: '0.18.13', w: OS.canvasW, h: OS.canvasH, layers: OS.layers.map(l => ({ name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend })) };
    expect(json._openShop.version).toBe('0.18.13');
    expect(json._openShop.w).toBe(800);
    expect(json._openShop.h).toBe(600);
    expect(json._openShop.layers).toHaveLength(1);

    const clicks = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicks.push({ download: this.download });
    });
    await OS.saveProject();
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe('openshop-project.json');

    const hostile = {
      _openShop: { w: '640', h: '480' },
      objects: [{ name: '<script>alert(1)</script>', src: 'javascript:alert(2)' }]
    };
    OS._sanitizeProjectJSON(hostile);
    expect(hostile._openShop.w).toBe(640);
    expect(hostile.objects[0].name).not.toContain('onerror=');
    expect(hostile.objects[0].src).not.toContain('javascript:');
  });

  it('offers recovery with event-delegated buttons and restores or discards', () => {
    const OS = loadOpenShop();
    const canvas = createCanvasMock();
    OS.canvas = canvas;
    quietUiMethods(OS);
    OS.rebuildLayersFromCanvas = vi.fn();
    OS.zoomFit = vi.fn();
    OS.saveHistory = vi.fn();
    OS._clearAutoSave = vi.fn();

    const project = JSON.stringify({ _openShop: { w: 320, h: 240 }, objects: [] });
    OS._offerRecovery(project);

    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.querySelector('[onclick]')).toBeNull();
    expect(overlay.textContent).toContain('Recover Unsaved Work');

    overlay.querySelector('[data-recovery-restore]').click();
    expect(canvas.loadFromJSON).toHaveBeenCalled();
    expect(OS.toast).toHaveBeenCalledWith('Project restored from auto-save', 'success');

    OS._offerRecovery(project);
    const overlay2 = document.querySelector('.modal-overlay');
    OS._discardRecovery = vi.fn();
    overlay2.querySelector('[data-recovery-discard]').click();
    expect(OS._discardRecovery).toHaveBeenCalled();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('sanitizes SVG export by stripping scripts and event handlers', () => {
    const OS = loadOpenShop();

    const malicious = `<svg xmlns="http://www.w3.org/2000/svg">
      <script>alert(1)</script>
      <rect width="100" height="100" onclick="alert(2)"/>
      <circle cx="50" cy="50" r="25" onload="alert(3)"/>
      <a href="javascript:alert(4)"><text>Click</text></a>
      <a href="data:text/html,test"><text>Link</text></a>
      <rect width="50" height="50" fill="blue"/>
    </svg>`;

    const clean = OS._sanitizeSVG(malicious);
    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onload');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('data:text/html');
    expect(clean).toContain('fill="blue"');
  });

  it('builds PSD export structure with correct layer metadata', () => {
    const OS = loadOpenShop();
    const boundary = { name: '__boundary__', visible: true, toCanvasElement: vi.fn(() => document.createElement('canvas')), left: 0, top: 0, opacity: 1 };
    const photo = { name: 'Portrait', visible: true, toCanvasElement: vi.fn(() => document.createElement('canvas')), left: 10, top: 20, opacity: 0.8 };
    const canvas = createCanvasMock([boundary, photo]);
    OS.canvas = canvas;
    OS.canvasW = 400;
    OS.canvasH = 300;
    OS.layers = [
      { name: 'BG', visible: true, opacity: 100, blend: 'source-over', objects: [boundary] },
      { name: 'Subject', visible: true, opacity: 80, blend: 'multiply', objects: [photo] }
    ];
    quietUiMethods(OS);

    let writtenPsd = null;
    const mockLib = {
      writePsd: vi.fn(psd => { writtenPsd = psd; return new Uint8Array([0x38, 0x42, 0x50, 0x53]); })
    };
    globalThis.agPsd = mockLib;

    const clicks = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicks.push({ download: this.download });
    });

    OS.exportPSD();

    expect(mockLib.writePsd).toHaveBeenCalled();
    expect(writtenPsd.width).toBe(400);
    expect(writtenPsd.height).toBe(300);
    expect(writtenPsd.children).toHaveLength(1);
    expect(writtenPsd.children[0].name).toBe('Subject');
    expect(writtenPsd.children[0].opacity).toBe(Math.round(0.8 * 255));
    expect(clicks[0].download).toBe('openshop-export.psd');

    delete globalThis.agPsd;
  });

  it('wires modal close and action buttons via data attributes', () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS.saveHistory = vi.fn();
    OS._clearAutoSave = vi.fn();
    OS.rebuildLayersFromCanvas = vi.fn();
    OS.zoomFit = vi.fn();

    OS.newImage();
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.querySelector('[onclick]')).toBeNull();

    const presets = overlay.querySelectorAll('[data-pw]');
    expect(presets.length).toBeGreaterThanOrEqual(4);
    presets[0].click();
    expect(overlay.querySelector('#ni-w').value).toBe(presets[0].dataset.pw);
    expect(overlay.querySelector('#ni-h').value).toBe(presets[0].dataset.ph);

    overlay.querySelector('[data-modal-close]').click();
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });
});
