import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readReleaseMetadata } from '../tools/release-metadata.mjs';
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
    window.showSaveFilePicker = undefined;
    Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
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

  it('switches to the compact mobile workspace and persists the choice', () => {
    const OS = loadOpenShop();
    OS.toast = vi.fn();

    OS.setWorkspaceMode('mobile');

    expect(OS.session.workspace.mode).toBe('mobile');
    expect(document.documentElement.dataset.osWorkspace).toBe('mobile');
    expect(localStorage.getItem('os_workspace_mode')).toBe('mobile');
    expect(OS.toast).toHaveBeenCalledWith('Workspace: Mobile', 'info');

    OS.setWorkspaceMode('standard', { announce:false });
    expect(document.documentElement.dataset.osWorkspace).toBe('standard');
    expect(OS.toast).toHaveBeenCalledTimes(1);
  });

  it('reports a storage quota failure instead of claiming preferences were saved', () => {
    const OS = loadOpenShop();
    OS.toast = vi.fn();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (key === 'os_prefs') {
        const error = new Error('storage full');
        error.name = 'QuotaExceededError';
        error.code = 22;
        throw error;
      }
    });

    expect(OS._persistPreferences()).toBe(false);
    expect(OS.toast).toHaveBeenCalledWith(
      'Preferences could not be saved because browser storage is full',
      'error'
    );
    expect(OS._diagnostics.at(-1)).toMatchObject({
      kind:'error',
      message:'Preferences could not be saved because browser storage is full',
      detail:{ storageKey:'os_prefs', quota:true }
    });

    setItem.mockRestore();
  });

  it('persists the ruler preference without dropping the saved accent', () => {
    const OS = loadOpenShop();
    OS._prefs.accent = '#4f72d8';
    OS.rulersVisible = false;

    expect(OS._persistPreferences(null, { announce:false })).toBe(true);
    expect(JSON.parse(localStorage.getItem('os_prefs'))).toMatchObject({
      version:2,
      accent:'#4f72d8',
      rulersVisible:false
    });
  });

  it('migrates a v1 preference record through v2 without dropping unknown keys', () => {
    const OS = loadOpenShop();
    const migrated = OS._migratePreferences({ version:1, defaultW:'800', futureSetting:{ keep:true } });

    expect(migrated).toMatchObject({
      sourceVersion:1,
      steps:['schema-1-to-2'],
      state:{ version:2, futureSetting:{ keep:true } }
    });
    OS._applyPreferenceRecord(migrated.state);
    OS._persistPreferences(null, { announce:false });
    expect(JSON.parse(localStorage.getItem('os_prefs'))).toMatchObject({
      version:2,
      defaultW:800,
      futureSetting:{ keep:true }
    });
  });

  it('round-trips an imported settings bundle and resets all saved settings atomically', () => {
    const OS = loadOpenShop();
    OS.toast = vi.fn();
    OS._renderSavedPalette = vi.fn();
    OS._renderImportedBrushes = vi.fn();
    OS._renderGradientPresets = vi.fn();
    OS._syncRulerChrome = vi.fn();
    OS._syncSessionWorkspace = vi.fn();
    OS.setTheme = vi.fn((theme, { persist } = {}) => { OS._currentTheme = theme; expect(persist).toBe(false); });
    OS.setLocale = vi.fn(language => { OS._lang = language; });
    const bundle = {
      kind:'openshop-settings', version:1,
      prefs:{ version:1, defaultW:800, futureSetting:'preserve me' },
      palette:['#ABCDEF', 'javascript:alert(1)'],
      brushes:[], gradients:[], presets:[], theme:'midnight', language:'zh'
    };

    expect(OS._applySettingsBundle(bundle)).toBe(true);
    expect(OS._settingsBundle()).toMatchObject({
      kind:'openshop-settings', version:1, theme:'midnight', language:'zh',
      prefs:{ version:2, defaultW:800, futureSetting:'preserve me' },
      palette:['#abcdef']
    });
    expect(JSON.parse(localStorage.getItem('os_brushes'))).toEqual([]);
    expect(localStorage.getItem('os_theme')).toBe('midnight');
    expect(localStorage.getItem('os_lang')).toBe('zh');

    expect(OS._resetPreferencesToDefaults()).toBe(true);
    expect(JSON.parse(localStorage.getItem('os_prefs'))).toMatchObject({ version:2, defaultW:1920, gridSize:20 });
    expect(JSON.parse(localStorage.getItem('os_palette'))).toEqual([]);
    expect(localStorage.getItem('os_theme')).toBe('default');
    expect(localStorage.getItem('os_lang')).toBe('en');
  });

  it('enables stylus pressure only after observing pressure variance', () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    OS.canvas.freeDrawingBrush = { width:8 };
    OS.state.tool = 'brush';
    const status = document.createElement('span');
    status.id = 'brush-pressure-status';
    document.body.appendChild(status);

    OS._beginPressureStroke({ pointerType:'pen', pressure:0.5 });
    OS._updatePressureBrush({ pointerType:'pen', pressure:0.5 });
    expect(OS._pressureSupported).toBe(false);
    OS._endPressureStroke();
    expect(status.textContent).toBe('Stylus: fixed');

    OS.canvas.freeDrawingBrush.width = 8;
    OS._beginPressureStroke({ pointerType:'pen', pressure:0.2 });
    OS._updatePressureBrush({ pointerType:'pen', pressure:0.9 });
    expect(OS._pressureSupported).toBe(true);
    expect(OS.canvas.freeDrawingBrush.width).not.toBe(8);
    OS._endPressureStroke();
    expect(status.textContent).toBe('Stylus: pressure');
    expect(OS.canvas.freeDrawingBrush.width).toBe(8);
  });

  it('normalizes coalesced and predicted pen samples and exposes tilt dynamics', () => {
    const OS = loadOpenShop();
    const tiltStatus = document.createElement('span');
    tiltStatus.id = 'brush-tilt-status';
    document.body.appendChild(tiltStatus);
    const coalesced = {
      pointerType:'pen', clientX:10, clientY:20, timeStamp:1, pressure:0.4,
      tiltX:12, tiltY:8
    };
    const predicted = {
      pointerType:'pen', clientX:14, clientY:24, timeStamp:3, pressure:0.7,
      tiltX:18, tiltY:11
    };
    const event = {
      pointerType:'pen', clientX:12, clientY:22, timeStamp:2, pressure:0.6,
      tiltX:16, tiltY:10,
      getCoalescedEvents:() => [coalesced],
      getPredictedEvents:() => [predicted]
    };

    expect(OS._pointerEventsFor(event)).toEqual([coalesced, event]);
    expect(OS._pointerEventsFor(event, { predicted:true })).toEqual([predicted]);
    expect(OS._pointerSampleFromEvent(event, { x:12, y:22 })).toMatchObject({
      x:12, y:22, pressure:0.6, tiltX:16, tiltY:10, hasTilt:true, predicted:false
    });
    expect(OS._pointerSampleFromEvent(predicted, { x:14, y:24 }, { predicted:true })).toMatchObject({
      x:14, y:24, pressure:0.7, hasTilt:true, predicted:true
    });

    expect(OS._inputCapabilityObservations).toMatchObject({ coalescedSamples:1, predictedSamples:1, tiltSamples:2 });
    expect(OS.setTiltDynamics(true)).toBe(true);
    expect(tiltStatus.textContent).toBe('Tilt: active');
    const brush = { width:20 };
    OS.state.tool = 'brush';
    OS.state.brushSize = 20;
    OS._applyBrushDynamics(brush, { pointerType:'pen', pressure:1, altitudeAngle:0, azimuthAngle:Math.PI / 2 });
    expect(brush.width).toBeCloseTo(9, 5);

    const report = OS._buildInputCapabilityReport();
    expect(report.pointerStream).toMatchObject({
      coalescedEvents:{ observedSamples:1 },
      predictedEvents:{ observedSamples:1 },
      tilt:{ observedSamples:2 },
      usesCoalescedSamples:true,
      usesPredictedSamples:true,
      usesTilt:true
    });
  });

  it('reconciles provisional predicted brush points before the next committed sample', () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    OS.canvas.getScenePoint = vi.fn(event => ({ x:event.clientX, y:event.clientY }));
    OS.state.tool = 'brush';
    OS.state.brushSize = 10;
    const points = [];
    const calls = [];
    const brush = {
      _points:[],
      onMouseDown() {},
      onMouseMove(pointer, event) {
        calls.push({ pointer, event });
        this._points.push({ x:pointer.x, y:pointer.y });
      },
      onMouseUp() {}
    };
    OS._bindPointerStreamBrush(brush);
    const makeEvent = (x, timeStamp, nextX = null) => ({
      pointerType:'pen', clientX:x, clientY:20, timeStamp, pressure:0.8,
      getCoalescedEvents() { return [this]; },
      getPredictedEvents() { return nextX === null ? [] : [{ pointerType:'pen', clientX:nextX, clientY:20, timeStamp:timeStamp + 0.5, pressure:0.8 }]; }
    });
    const down = makeEvent(0, 0);
    brush.onMouseDown({ x:0, y:20 }, down);
    const first = makeEvent(10, 1, 15);
    brush.onMouseMove({ x:10, y:20 }, first);
    expect(brush._openShopPredictedCount).toBe(1);
    expect(brush._points).toHaveLength(2);
    const second = makeEvent(20, 2, 25);
    brush.onMouseMove({ x:20, y:20 }, second);
    expect(brush._points).toHaveLength(3);
    brush.onMouseUp({ x:20, y:20 }, second);
    expect(brush._points).toHaveLength(2);
    expect(brush._openShopPredictedCount).toBe(0);
    expect(brush._openShopPredictedSamples).toEqual([]);
    expect(calls).toHaveLength(4);
    points.push(...brush._points);
    expect(points.map(point => point.x)).toEqual([10, 20]);
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
    expect(OS.saveHistory).toHaveBeenCalledWith(
      'New Layer',
      expect.objectContaining({ command: expect.objectContaining({ id: 'layer.add', schemaVersion: 1 }) })
    );

    OS.layers[0].objects.push(canvasObject);
    OS.deleteLayer();

    expect(OS.canvas.remove).toHaveBeenCalledWith(canvasObject);
    expect(OS.layers).toHaveLength(1);
    expect(OS.layers[0].name).toBe('Layer 0');
    expect(OS.layers[0].objects).toHaveLength(0);
    expect(OS.saveHistory).toHaveBeenCalledWith(
      'Delete Layer',
      expect.objectContaining({ command: expect.objectContaining({ id: 'layer.delete', schemaVersion: 1 }) })
    );
  });

  it('keeps layer ownership, canvas stacking, and edit eligibility canonical', () => {
    const OS = loadOpenShop();
    const bottom = { name: 'Bottom', visible: true, selectable: true, evented: true };
    const middle = { name: 'Middle', visible: true, selectable: true, evented: true };
    const top = { name: 'Top', visible: true, selectable: true, evented: true };
    OS.canvas = createCanvasMock([top, bottom, middle]);
    quietUiMethods(OS);
    OS.layers = [
      { id: 'layer-bottom', name: 'Bottom', visible: true, locked: false, opacity: 100, blend: 'source-over', objects: [bottom] },
      { id: 'layer-middle', name: 'Middle', visible: true, locked: true, opacity: 100, blend: 'source-over', objects: [middle] },
      { id: 'layer-top', name: 'Top', visible: false, locked: false, opacity: 100, blend: 'source-over', objects: [top] }
    ];
    OS.activeLayerIdx = 1;
    OS.state.tool = 'select';

    OS._enforceLayerInvariants();

    expect(OS.canvas.getObjects()).toEqual([bottom, middle, top]);
    expect(OS._getObjectLayerIndex(bottom)).toBe(0);
    expect(OS._getObjectLayerIndex(middle)).toBe(1);
    expect(OS._getObjectLayerIndex(top)).toBe(2);
    expect(bottom).toMatchObject({ visible: true, selectable: true, evented: true });
    expect(middle).toMatchObject({ visible: true, selectable: false, evented: false });
    expect(top).toMatchObject({ visible: false, selectable: false, evented: false });

    OS.setTool('brush');
    expect(OS.canvas.isDrawingMode).toBe(false);
    OS.layers[1].locked = false;
    OS._applyLayerInteractionState();
    expect(OS.canvas.isDrawingMode).toBe(true);
  });

  it('records layer properties and reorders the canvas with the layer model', () => {
    const OS = loadOpenShop();
    const lower = { name: 'Lower', visible: true };
    const upper = { name: 'Upper', visible: true };
    OS.canvas = createCanvasMock([lower, upper]);
    quietUiMethods(OS);
    OS.saveHistory = vi.fn();
    OS.layers = [
      { id: 'layer-lower', name: 'Lower', visible: true, locked: false, opacity: 100, blend: 'source-over', objects: [lower] },
      { id: 'layer-upper', name: 'Upper', visible: true, locked: false, opacity: 100, blend: 'source-over', objects: [upper] }
    ];
    OS.activeLayerIdx = 1;

    OS.toggleLayerVisibility(1);
    OS.toggleLayerVisibility(1);
    OS.toggleLayerLock(1);
    OS.toggleLayerLock(1);
    OS.setLayerOpacity(55);
    OS.renameLayer(1, 'Renamed');
    expect(OS._moveLayer(1, 0)).toBe(true);

    expect(OS.layers.map((layer) => layer.name)).toEqual(['Renamed', 'Lower']);
    expect(OS.canvas.getObjects()).toEqual([upper, lower]);
    expect(upper.opacity).toBe(0.55);
    expect(OS.saveHistory.mock.calls.map(([action]) => action)).toEqual([
      'Hide Layer',
      'Show Layer',
      'Lock Layer',
      'Unlock Layer',
      'Layer Opacity',
      'Rename Layer',
      'Reorder Layers'
    ]);
  });

  it('uses Fabric 7 native promises and handles clone rejection at the caller', async () => {
    const source = readFileSync('index.html', 'utf8');
    expect(source).not.toContain('applyFabricCompat');
    expect(source).not.toContain('reportAsyncError');
    expect(source).not.toContain('openshop:fabric-error');
    expect(source).not.toMatch(/(?:fromURL|clone|loadFromJSON)\([^)]*=>/);
    expect(source).not.toMatch(/\bgetPointer\b|\bsetWidth\b|\bsetHeight\b|\bsetBackgroundColor\b/);

    const OS = loadOpenShop();
    const active = {
      name:'Native clone subject', type:'rect', left:10, top:20,
      clone:vi.fn().mockRejectedValue(new Error('native clone failed'))
    };
    const canvas = createCanvasMock([active]);
    canvas.setActiveObject(active);
    OS.canvas = canvas;
    OS.layers = [{ id:'layer-native', name:'Native clone subject', visible:true, locked:false, opacity:100, blend:'source-over', objects:[active] }];
    OS.activeLayerIdx = 0;
    quietUiMethods(OS);

    expect(OS._layerViaCopy()).toBeUndefined();
    await vi.waitFor(() => expect(OS.toast).toHaveBeenCalledWith('Could not copy the layer: native clone failed', 'error'));
    expect(OS.layers).toHaveLength(1);
    expect(canvas.add).not.toHaveBeenCalled();
  });

  it('restores prior snapshots through undo and redo', async () => {
    const OS = loadOpenShop();
    const canvas = createCanvasMock();
    let snapshotName = 'Initial';
    canvas.toJSON = vi.fn(() => ({ objects: [{ name: snapshotName }] }));
    const restored = [];
    canvas.loadFromJSON = vi.fn((json) => {
      restored.push(json.objects[0].name);
      return Promise.resolve(canvas);
    });
    OS.canvas = canvas;
    quietUiMethods(OS);
    OS.setTool = vi.fn();

    OS.saveHistory('Initial');
    snapshotName = 'Edited';
    OS.saveHistory('Edited');

    await OS.undo();
    await OS.redo();

    expect(restored).toEqual(['Initial', 'Edited']);
    expect(OS.historyIdx).toBe(1);
    expect(OS.setTool).toHaveBeenCalledWith('select');
  });

  it('keeps initialization out of transaction history and validates versioned action files', () => {
    const OS = loadOpenShop();
    const object = { name: 'Subject', type: 'rect' };
    OS.canvas = createCanvasMock([object]);
    OS.layers = [{ id: 'layer-subject', name: 'Subject', visible: true, locked: false, opacity: 100, blend: 'source-over', objects: [object] }];
    OS.activeLayerIdx = 0;
    quietUiMethods(OS);

    OS._initializeHistory('New Document');

    expect(OS.history).toEqual([]);
    expect(OS.historyIdx).toBe(-1);
    expect(OS._historyBaseSnapshot).toContain('"kind":"openshop-document"');
    expect(OS._historyBaseLabel).toBe('New Document');

    const command = OS._makeCommand('layer.opacity.set', { layerId: 'layer-subject', opacity: 55 });
    const parsed = OS._parseMacroPayload({
      kind: 'openshop-command-sequence',
      schemaVersion: 1,
      commands: [command]
    });
    expect(parsed).toEqual([command]);
    expect(() => OS._parseMacroPayload([{ action: 'setLayerOpacity', params: [55] }])).toThrow('Unsupported command schema');
    expect(() => OS._makeCommand('layer.opacity.set', { layerId: 'layer-subject', opacity: 101 })).toThrow('out of range');
    expect(() => OS._makeCommand('_privateMethod', {})).toThrow('Unknown command');
  });

  it('validates batch recipes and writes unique UTF-8 ZIP entries', async () => {
    const OS = loadOpenShop();
    const command = OS._makeCommand('canvas.resize', { width: 320, height: 240 });
    expect(OS._parseBatchRecipe({
      kind: 'openshop-command-sequence', schemaVersion: 1, commands: [command]
    })).toEqual([command]);
    expect(() => OS._parseBatchRecipe({
      kind: 'openshop-command-sequence', schemaVersion: 1, commands: []
    })).toThrow('empty');

    const parts = [];
    const ZipBlob = class {
      constructor(values, options = {}) {
        this.parts = values;
        this.type = options.type || '';
        this.size = values.reduce((total, value) => total + value.length, 0);
      }
    };
    vi.stubGlobal('Blob', ZipBlob);
    const zip = await OS._zipBatchEntries([
      { name: 'folder/é.png', bytes: new TextEncoder().encode('first') },
      { name: 'folder/second.png', bytes: new TextEncoder().encode('second') }
    ]);
    zip.parts.forEach(part => parts.push(part));
    const bytes = parts.reduce((all, part) => {
      const merged = new Uint8Array(all.length + part.length);
      merged.set(all); merged.set(part, all.length); return merged;
    }, new Uint8Array());
    vi.unstubAllGlobals();
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain('folder/é.png');
    expect(decoded).toContain('folder/second.png');
    expect(decoded).toContain('first');
    expect(decoded).toContain('second');
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });

  it('reads the required OpenRaster archive layout and rejects unsafe paths', async () => {
    const OS = loadOpenShop();
    class ZipBlob {
      constructor(parts, options = {}) {
        this.parts = parts;
        this.type = options.type || '';
      }

      async arrayBuffer() {
        const length = this.parts.reduce((total, part) => total + part.length, 0);
        const bytes = new Uint8Array(length);
        let offset = 0;
        this.parts.forEach(part => { bytes.set(part, offset); offset += part.length; });
        return bytes.buffer;
      }
    }
    vi.stubGlobal('Blob', ZipBlob);
    const zip = await OS._zipBatchEntries([
      { name:'mimetype', bytes:new TextEncoder().encode('image/openraster') },
      { name:'stack.xml', bytes:new TextEncoder().encode('<image version="0.0.6" w="8" h="6"><stack><layer src="data/layer0.png" /></stack></image>') },
      { name:'data/layer0.png', bytes:new Uint8Array([1, 2, 3, 4]) },
      { name:'mergedimage.png', bytes:new Uint8Array([5, 6]) },
      { name:'Thumbnails/thumbnail.png', bytes:new Uint8Array([7, 8]) }
    ]);
    const entries = await OS._readORAZipEntries(new Uint8Array(await zip.arrayBuffer()));
    expect(entries.map(entry => entry.name)).toEqual([
      'mimetype', 'stack.xml', 'data/layer0.png', 'mergedimage.png', 'Thumbnails/thumbnail.png'
    ]);
    expect(new TextDecoder().decode(entries[0].bytes)).toBe('image/openraster');

    const unsafe = await OS._zipBatchEntries([
      { name:'mimetype', bytes:new TextEncoder().encode('image/openraster') },
      { name:'stack.xml', bytes:new TextEncoder().encode('<image />') },
      { name:'data/../escape.png', bytes:new Uint8Array([1]) }
    ]);
    const unsafeBytes = new Uint8Array(await unsafe.arrayBuffer());
    vi.unstubAllGlobals();
    await expect(OS._readORAZipEntries(unsafeBytes)).rejects.toThrow(/unsafe archive path/);
  });

  it('cancels batch work between files and keeps partial failures format-honest', async () => {
    const OS = loadOpenShop();
    const command = OS._makeCommand('canvas.resize', { width:320, height:240 });
    OS._captureRollbackState = vi.fn(() => ({ snapshot:'before-batch' }));
    OS._restoreRollbackState = vi.fn(async () => {});
    OS._remapBatchCommands = vi.fn(() => [command]);
    OS._executeCommand = vi.fn(async () => true);
    OS._captureExportRaster = vi.fn(() => ({ dataUrl:'data:image/png;base64,AAAA' }));
    OS._dataUrlToBlob = vi.fn(() => ({ arrayBuffer:async () => new Uint8Array([1, 2, 3]).buffer }));
    OS._loadBatchImageFile = vi.fn(async file => {
      if (file.name === 'bad.png') throw new Error('decode failed');
    });
    const files = [
      { name:'first.png', type:'image/png', size:3 },
      { name:'second.png', type:'image/png', size:3 },
      { name:'bad.png', type:'image/png', size:3 }
    ];
    const progress = [];
    const cancelled = await OS.runBatch(files, { kind:'openshop-command-sequence', schemaVersion:1, commands:[command] }, {
      onProgress:detail => { progress.push(detail); if (detail.index === 1) OS.cancelBatch(); }
    });
    expect(cancelled).toMatchObject({ cancelled:true, status:'cancelled', processed:['first.png'], failed:[] });
    expect(cancelled.blob).toBeNull();
    expect(progress.at(-1).cancelled).toBe(true);
    expect(OS._restoreRollbackState).toHaveBeenCalledWith({ snapshot:'before-batch' });

    const partial = await OS.runBatch([files[2], files[0]], { kind:'openshop-command-sequence', schemaVersion:1, commands:[command] });
    expect(partial).toMatchObject({ cancelled:false, status:'completed-with-failures', processed:['first.png'] });
    expect(partial.failed).toEqual([{ name:'bad.png', error:'decode failed' }]);
    expect(partial.blob).toBeTruthy();
  });

  it('validates manual WebRTC signaling and bounds state chunking', () => {
    const OS = loadOpenShop();
    expect(OS._collabParseDescription('{"type":"offer","sdp":"v=0"}')).toEqual({ type:'offer', sdp:'v=0' });
    expect(() => OS._collabParseDescription('{"type":"candidate","sdp":"x"}')).toThrow('invalid');
    expect(() => OS._collabParseDescription('not json')).toThrow('valid JSON');

    const messages = [];
    OS._collabChunkBytes = 4;
    OS._collab = { channel:{ readyState:'open', send:message => messages.push(message) } };
    expect(OS._collabSendPayload({ kind:'openshop-collab', version:1, type:'state', state:{ text:'0123456789' } })).toBe(true);
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every(message => JSON.parse(message).type === 'chunk')).toBe(true);
    OS.closeCollaboration();
    expect(OS._collab).toBeNull();
  });

  it('binds collaboration state to a session, peer, document, and monotonic revision', () => {
    const OS = loadOpenShop();
    OS._collab = {
      sessionId:'session-12345678',
      peerId:'peer-local123',
      remotePeerId:'peer-remote123',
      channel:{ readyState:'open', send:vi.fn() },
      applyChain:Promise.resolve(),
      chunks:new Map(),
      currentTuple:{ revision:2, peerId:'peer-local123' },
      lastReceivedByPeer:new Map(),
      localSequence:2,
      remoteRevision:null,
      consentGranted:true
    };
    OS._collabQueueState = vi.fn();
    const state = { kind:'openshop-document', schemaVersion:1, document:{ id:'remote-document' } };
    const message = {
      kind:'openshop-collab', version:OS._collabProtocolVersion, type:'state',
      sessionId:'session-12345678', peerId:'peer-remote123', documentId:'remote-document',
      revision:3, baseRevision:2, state
    };

    expect(OS._collabHandleStatePayload(message)).toBe(true);
    expect(OS._collabQueueState).toHaveBeenCalledWith(state, { tuple:{ revision:3, peerId:'peer-remote123' }, concurrent:false });
    expect(OS._collabHandleStatePayload(message)).toBe(false);
    expect(OS._collabSetStatus).toBeDefined();
    expect(OS._collab.lastReceivedByPeer.get('peer-remote123')).toBe(3);
  });

  it('surfaces concurrent collaboration conflicts with deterministic tuple ordering', () => {
    const OS = loadOpenShop();
    OS._collab = {
      sessionId:'session-12345678', peerId:'peer-local123', remotePeerId:'peer-remote123',
      currentTuple:{ revision:4, peerId:'peer-local123' }, lastReceivedByPeer:new Map(),
      chunks:new Map(), applyChain:Promise.resolve(), localSequence:4, remoteRevision:null, consentGranted:true
    };
    OS._collabQueueState = vi.fn();
    const state = { kind:'openshop-document', schemaVersion:1, document:{ id:'remote-document' } };
    const message = {
      kind:'openshop-collab', version:OS._collabProtocolVersion, type:'state',
      sessionId:'session-12345678', peerId:'peer-remote123', documentId:'remote-document',
      revision:4, baseRevision:0, state
    };

    expect(OS._collabHandleStatePayload(message)).toBe(true);
    expect(OS._collabQueueState).toHaveBeenCalledTimes(1);
    expect(OS._collabQueueState.mock.calls[0][1].concurrent).toBe(true);
    expect(OS._collab.currentTuple).toEqual({ revision:4, peerId:'peer-local123' });
  });

  it('requires manifest consent and provenance before loading a sandbox plugin', async () => {
    const OS = loadOpenShop();
    quietUiMethods(OS);

    const rejected = OS.registerPlugin({ name: 'Unsafe', init() {} });
    expect(rejected).toBeUndefined();
    expect(OS.plugins).toHaveLength(0);

    const source = 'window.addEventListener("message", () => {});';
    const manifest = {
      id: 'com.example.sandbox-probe', version: '1.0.0', name: 'Sandbox Probe',
      sourceHash: await OS._pluginSourceHash(source),
      capabilities: ['commands', 'document:read'], minApiVersion: 1
    };
    expect(OS.registerPlugin({ manifest, source })).toBeUndefined();
    expect(OS.plugins).toHaveLength(0);

    const handle = OS.registerPlugin({ manifest, source }, { consent:true });
    expect(handle).toMatchObject({ name: 'Sandbox Probe', protocolVersion: 1 });
    expect(handle.manifest).toMatchObject({ id:manifest.id, version:'1.0.0', sourceHash:manifest.sourceHash });
    const record = OS._pluginRecords.get(handle.id);
    expect(record.iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(record.iframe.title).toBe('Sandbox Probe plugin sandbox');
    expect(record.capabilities).toEqual(['commands', 'document:read']);
    OS._pluginResolveReady(record, handle);
    expect(() => OS._handlePluginRequest(record, {
      requestId: 'denied', method: 'get-selection', args: {}
    })).toThrow('Capability not granted');

    expect(OS.disposePlugin(handle)).toBe(true);
    expect(OS.plugins).toHaveLength(0);
    expect(OS.listPlugins()).toEqual([]);
    expect(OS.listPluginConsents()).toHaveLength(1);
    const changedManifest = { ...manifest, sourceHash:`sha256:${'0'.repeat(64)}` };
    expect(OS.registerPlugin({ manifest:changedManifest, source })).toBeUndefined();
    expect(OS._pluginRecords.size).toBe(0);
    expect(OS.registerPlugin({ manifest:{ ...manifest, minApiVersion:2 }, source }, { consent:true })).toBeUndefined();
    expect(OS.removePluginConsent(manifest.id)).toBe(true);
    expect(OS.listPluginConsents()).toEqual([]);
  });

  it('keeps plugin source failures failed and rejects later capability calls', async () => {
    const OS = loadOpenShop();
    quietUiMethods(OS);
    const source = 'throw new Error("plugin boot failed");';
    const manifest = {
      id: 'com.example.failed-plugin', version: '1.0.0', name: 'Failed Plugin',
      sourceHash: await OS._pluginSourceHash(source), capabilities: ['commands'], minApiVersion: 1
    };
    const handle = OS.registerPlugin({ manifest, source }, { consent:true });
    const record = OS._pluginRecords.get(handle.id);
    const ready = handle.ready.then(() => null, error => error);

    OS._pluginHandleMessage(record, {
      source: record.iframe.contentWindow,
      origin: 'null',
      data: {
        type:'openshop:plugin-error', protocolVersion:1, pluginId:record.id, token:record.token,
        error:'plugin boot failed'
      }
    });

    const error = await ready;
    expect(error).toMatchObject({ message:'plugin boot failed' });
    expect(record.state).toBe('failed');
    expect(record.disposed).toBe(true);
    expect(record.iframe.isConnected).toBe(false);
    expect(OS.listPlugins()).toEqual([expect.objectContaining({
      id:record.id,
      state:'failed',
      ready:false,
      lastFailure:expect.objectContaining({ message:'plugin boot failed' })
    })]);
    expect(OS.listPluginConsents()).toEqual([expect.objectContaining({
      id:record.id,
      lastFailure:expect.objectContaining({ message:'plugin boot failed' })
    })]);
    expect(() => OS._handlePluginRequest(record, { method:'get-document', args:{} })).toThrow('plugin boot failed');
    await expect(OS._invokePluginCommand(record, 'late-command')).rejects.toThrow('plugin boot failed');

    OS._pluginHandleMessage(record, {
      source: record.iframe.contentWindow,
      origin: 'null',
      data: { type:'openshop:plugin-ready', protocolVersion:1, pluginId:record.id, token:record.token }
    });
    expect(record.state).toBe('failed');
    expect(handle.dispose()).toBe(true);
    expect(OS.listPlugins()).toEqual([]);
  });

  it('turns a handshake timeout into a failed, non-ready plugin record', async () => {
    const OS = loadOpenShop();
    quietUiMethods(OS);
    vi.useFakeTimers();
    try {
      const source = 'window.addEventListener("message", () => {});';
      const manifest = {
        id: 'com.example.timeout-plugin', version: '1.0.0', name: 'Timeout Plugin',
        sourceHash: await OS._pluginSourceHash(source), capabilities: [], minApiVersion: 1
      };
      const handle = OS.registerPlugin({ manifest, source }, { consent:true });
      const record = OS._pluginRecords.get(handle.id);
      const ready = handle.ready.then(() => null, error => error);
      vi.advanceTimersByTime(10000);
      const error = await ready;

      expect(error).toMatchObject({ message:'Plugin handshake timed out' });
      expect(record.state).toBe('failed');
      expect(record.disposed).toBe(true);
      expect(OS.listPlugins()).toEqual([expect.objectContaining({
        id:record.id,
        state:'failed',
        ready:false,
        lastFailure:expect.objectContaining({ message:'Plugin handshake timed out' })
      })]);
      await expect(OS._invokePluginCommand(record, 'late-command')).rejects.toThrow('Plugin handshake timed out');
      expect(handle.dispose()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('audits plugin grants in Preferences and revokes them without reloading', async () => {
    const OS = loadOpenShop();
    quietUiMethods(OS);
    const view = document.createElement('section');
    view.innerHTML = '<div data-plugin-access-list role="list"></div><p data-plugin-access-empty></p>';
    document.body.append(view);
    OS._attachPluginPreferenceView(view);

    const source = 'window.addEventListener("message", () => {});';
    const manifest = {
      id:'com.example.preference-audit', version:'1.2.3', name:'Preference Audit',
      sourceHash:await OS._pluginSourceHash(source), capabilities:['commands', 'ui:toast'], minApiVersion:1
    };
    const handle = OS.registerPlugin({ manifest, source }, { consent:true });
    const record = OS._pluginRecords.get(handle.id);
    OS._pluginResolveReady(record, handle);

    const card = view.querySelector('[data-plugin-access-id="com.example.preference-audit"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Preference Audit');
    expect(card.textContent).toContain('1.2.3');
    expect(card.textContent).toContain(manifest.sourceHash);
    expect(card.textContent).toContain('commands, ui:toast');
    expect(card.querySelector('.plugin-access-status').textContent).toBe('Ready');

    const rejected = vi.fn();
    record.pending.set('queued-call', { resolve:vi.fn(), reject:rejected, timeout:setTimeout(() => {}, 10000) });
    card.querySelector('[data-plugin-revoke]').click();

    expect(OS.listPluginConsents()).toEqual([]);
    expect(OS.listPlugins()).toEqual([]);
    expect(record.disposed).toBe(true);
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ message:'Plugin disposed' }));
    expect(view.querySelector('[data-plugin-access-empty]').hidden).toBe(false);
    expect(OS.registerPlugin({ manifest, source })).toBeUndefined();
  });

  it('keeps overlapping embed export deliveries request-scoped', async () => {
    const OS = loadOpenShop();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const originalDownloadBlob = OS._downloadBlob;
    const originalDownloadDataUrl = OS._downloadDataUrl;
    OS.saveFile = vi.fn(async (format, options) => {
      await gate;
      options.deliver(new Blob([format]), `${format}-result.${format}`);
      return true;
    });

    const first = OS._captureExportedBlob('png');
    const second = OS._captureExportedBlob('webp');
    await Promise.resolve();
    expect(OS._downloadBlob).toBe(originalDownloadBlob);
    expect(OS._downloadDataUrl).toBe(originalDownloadDataUrl);

    release();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.filename).toBe('png-result.png');
    expect(secondResult.filename).toBe('webp-result.webp');
    expect(firstResult.blob.size).toBe(3);
    expect(secondResult.blob.size).toBe(4);
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
      height: 1080,
      multiplier: 1
    });
    expect(clicks[0].download).toBe('Client_Proof_01.png');
    expect(boundary.opacity).toBe(1);
    expect(OS.toast).toHaveBeenCalledWith('Exported as PNG', 'success');
  });

  it('restores temporary export state and dirty metadata when encoding fails', () => {
    const OS = loadOpenShop();
    const boundary = {
      name: '__boundary__',
      opacity: 0.65,
      visible: true,
      fill: 'checker',
      excludeFromExport: false,
      set(property, value) {
        this[property] = value;
      }
    };
    const canvas = createCanvasMock([boundary]);
    canvas.viewportTransform = [1.5, 0, 0, 1.5, 23, 17];
    canvas.backgroundColor = '#123456';
    canvas.toDataURL.mockImplementation(() => {
      throw new Error('Synthetic encoder failure');
    });
    OS.canvas = canvas;
    OS.layers = [{ id: 'layer-background', name: 'Background', visible: true, locked: true, opacity: 100, blend: 'source-over', objects: [boundary] }];
    OS.activeLayerIdx = 0;
    quietUiMethods(OS);
    OS._isDirty = true;
    OS._autoSaveDirty = true;
    OS._documentRevision = 7;
    OS._persistenceState = 'dirty';

    expect(OS.saveFile('png')).toBe(false);

    expect(canvas.viewportTransform).toEqual([1.5, 0, 0, 1.5, 23, 17]);
    expect(canvas.backgroundColor).toBe('#123456');
    expect(boundary).toMatchObject({
      opacity: 0.65,
      visible: true,
      fill: 'checker',
      excludeFromExport: false
    });
    expect(OS._isDirty).toBe(true);
    expect(OS._autoSaveDirty).toBe(true);
    expect(OS._documentRevision).toBe(7);
    expect(OS._persistenceState).toBe('dirty');
    expect(OS.toast).toHaveBeenCalledWith('Export failed: Synthetic encoder failure', 'error');
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

  it('uses the physical key code when the keyboard layout changes the key label', () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS.setTool = vi.fn();
    OS.undo = vi.fn();

    OS._initKeyboardShortcuts();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'с', code: 'KeyC', bubbles: true
    }));
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'з', code: 'KeyZ', ctrlKey: true, bubbles: true
    }));

    expect(OS.setTool).toHaveBeenCalledWith('crop');
    expect(OS.undo).toHaveBeenCalledTimes(1);
  });

  it('renders shortcut labels from the available keyboard layout map', () => {
    const OS = loadOpenShop();
    OS._keyboardLayoutMap = new Map([
      ['KeyC', 'с'], ['KeyK', 'л'], ['Digit1', '&']
    ]);

    expect(OS._displayShortcut('Ctrl+C')).toBe('Ctrl+с');
    expect(OS._displayShortcut('Ctrl+K')).toBe('Ctrl+л');
    expect(OS._displayShortcut('Ctrl+1')).toBe('Ctrl+&');
    expect(OS._displayShortcut('Ctrl++')).toBe('Ctrl++');
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
    OS._gpuFilterDisabled = true;
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

  it('rejects tampered lazy runtime bytes and never retains the poisoned response', async () => {
    const OS = loadOpenShop();
    const trusted = new TextEncoder().encode('reviewed runtime bytes');
    const tampered = new TextEncoder().encode('tampered runtime bytes');
    const digest = await crypto.subtle.digest('SHA-384', trusted);
    const integrity = `sha384-${Buffer.from(digest).toString('base64')}`;
    let responseBytes = tampered;
    const fetchRuntime = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => responseBytes.buffer.slice(0)
    }));
    vi.stubGlobal('fetch', fetchRuntime);
    OS._runtimeAssets = {
      fixture: Object.freeze({
        url: 'https://cdn.jsdelivr.net/npm/example@1.0.0/runtime.js',
        integrity,
        type: 'application/javascript'
      })
    };
    OS._runtimeAssetPromises = new Map();

    await expect(OS._fetchVerifiedRuntimeAsset('fixture')).rejects.toThrow('integrity check failed');
    expect(OS._runtimeAssetPromises.has('fixture')).toBe(false);

    // A failed check retries once bypassing the HTTP cache, so a poisoned
    // cache entry cannot pin the failure for the cache's lifetime.
    expect(fetchRuntime).toHaveBeenCalledTimes(2);
    expect(fetchRuntime.mock.calls[0][1].cache).toBe('force-cache');
    expect(fetchRuntime.mock.calls[1][1].cache).toBe('reload');

    responseBytes = trusted;
    const verified = await OS._fetchVerifiedRuntimeAsset('fixture');
    expect(verified.bytes.byteLength).toBe(trusted.byteLength);
    expect(fetchRuntime).toHaveBeenCalledTimes(3);
    await expect(OS._fetchVerifiedRuntimeAsset('undeclared')).rejects.toThrow('Unknown runtime asset');
    vi.unstubAllGlobals();
  });

  it('releases verified runtime payloads and blob URLs at the lifecycle boundary', async () => {
    const OS = loadOpenShop();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const worker = { terminate: vi.fn() };
    OS._runtimeAssetPromises = new Map([
      ['fixture', Promise.resolve({ asset:{}, bytes:new ArrayBuffer(4096) })]
    ]);
    OS._runtimeAssetByteLengths = new Map([['fixture', 4096]]);
    OS._runtimeLoadedAssets = new Set(['fixture']);
    OS._runtimeBlobPromises = new Map([['worker', Promise.resolve('blob:worker')]]);
    OS._runtimeBlobUrls = new Map([['worker', 'blob:worker']]);
    OS._runtimeBlobOwners = new Map([['worker', 1]]);
    OS._verifiedScriptPromises = new Map([['script', Promise.resolve(true)]]);
    OS._libRawBlobUrls = { wasmUrl:'blob:libraw-wasm' };
    OS._pdfJsPromise = Promise.resolve({});
    OS._libRawPromise = Promise.resolve(() => {});
    OS._avifEncoderPromise = Promise.resolve({});
    OS._avifDecoderPromise = Promise.resolve({});
    OS._aiLib = {};
    OS._photonFilterWorker = worker;
    OS._filterWorker = worker;

    expect(OS._runtimeResourceReport()).toMatchObject({
      assetPromises:1,
      retainedAssetBytes:4096,
      blobPromises:1,
      blobUrls:1,
      verifiedScriptPromises:1
    });
    const after = OS._disposeRuntimeResources();

    expect(after).toMatchObject({
      assetPromises:0,
      retainedAssetBytes:0,
      loadedAssets:0,
      blobPromises:0,
      blobUrls:0,
      blobOwners:0,
      verifiedScriptPromises:0,
      scriptUrls:0
    });
    expect(OS._pdfJsPromise).toBeNull();
    expect(OS._libRawPromise).toBeNull();
    expect(OS._aiLib).toBeNull();
    expect(worker.terminate).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:worker');
    expect(revoke).toHaveBeenCalledWith('blob:libraw-wasm');
    revoke.mockRestore();
  });

  it('keeps shared verified blob owners alive until the last consumer releases them', async () => {
    const OS = loadOpenShop();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const fetchRuntime = vi.spyOn(OS, '_fetchVerifiedRuntimeAsset').mockResolvedValue({
      asset:{ type:'application/javascript' },
      bytes:new Uint8Array([1, 2, 3]).buffer
    });

    const first = await OS._verifiedRuntimeBlobUrl('shared');
    const second = await OS._verifiedRuntimeBlobUrl('shared');
    expect(second).toBe(first);
    expect(fetchRuntime).toHaveBeenCalledTimes(1);
    expect(OS._runtimeResourceReport()).toMatchObject({
      assetPromises:0,
      retainedAssetBytes:0,
      blobPromises:1,
      blobUrls:1,
      blobOwners:2
    });

    OS._releaseVerifiedRuntimeBlob('shared');
    expect(OS._runtimeResourceReport()).toMatchObject({ blobPromises:1, blobUrls:1, blobOwners:1 });
    OS._releaseVerifiedRuntimeBlob('shared');
    expect(OS._runtimeResourceReport()).toMatchObject({ blobPromises:0, blobUrls:0, blobOwners:0, scriptUrls:0 });
    expect(revoke).toHaveBeenCalledWith(first);
    revoke.mockRestore();
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
    OS._segmentResultsAtPoint = vi.fn().mockResolvedValue(results);

    await OS.aiSegmentSelectAt({ x: 14, y: 8 });

    expect(OS._segmentResultsAtPoint).toHaveBeenCalledWith(
      expect.objectContaining({ target, clickX: 14, clickY: 8, imageW: 16, imageH: 16 }),
      expect.objectContaining({ kind: 'Segment Select', generation: 0, revision: 0 })
    );
    expect(OS._selectionBounds).toEqual({ x: 13, y: 5, w: 4, h: 8 });
    expect(OS._selectionMask.mask.filter(Boolean)).toHaveLength(32);
    expect(OS._showMaskOverlay).toHaveBeenCalledWith(OS._selectionMask);
    expect(OS.toast).toHaveBeenCalledWith('Selected segment: right-object (32 px)', 'success');
  });

  it('loads pinned SlimSAM artifacts and selects the highest-IoU point mask', async () => {
    const OS = loadOpenShop();
    quietUiMethods(OS);
    OS._showAIProgress = vi.fn();
    OS._hideAIProgress = vi.fn();
    OS._aiDevice = 'wasm';

    const model = vi.fn().mockResolvedValue({
      pred_masks: { tag: 'predictions' },
      iou_scores: { data: new Float32Array([0.2, 0.93, 0.5]) }
    });
    const postProcess = vi.fn().mockResolvedValue([{
      dims: [1, 3, 2, 2],
      data: new Float32Array([
        1, 0, 0, 0,
        0, 1, 1, 0,
        0, 0, 0, 1
      ])
    }]);
    const processor = vi.fn().mockResolvedValue({
      original_sizes: { tag: 'original' },
      reshaped_input_sizes: { tag: 'reshaped' }
    });
    processor.post_process_masks = postProcess;
    const samFromPretrained = vi.fn().mockResolvedValue(model);
    const processorFromPretrained = vi.fn().mockResolvedValue(processor);
    OS._loadTransformers = vi.fn().mockResolvedValue({
      SamModel: { from_pretrained: samFromPretrained },
      AutoProcessor: { from_pretrained: processorFromPretrained }
    });
    OS._modelDownloadFootprint = vi.fn().mockResolvedValue(null);
    OS._imageToRawImage = vi.fn().mockResolvedValue({ width: 8, height: 6, channels: 4 });

    const job = OS._startComputeJob('Segment Select', { group: 'image-processing' });
    const results = await OS._segmentResultsAtPoint({
      target: { name: 'Photo' },
      clickX: 5,
      clickY: 3,
      imageW: 8,
      imageH: 6
    }, job);
    OS._finishComputeJob(job);

    const revision = OS._modelRevisions['Xenova/slimsam-77-uniform'];
    expect(samFromPretrained).toHaveBeenCalledWith('Xenova/slimsam-77-uniform', expect.objectContaining({
      device: 'wasm', dtype: 'q8', revision
    }));
    expect(processorFromPretrained).toHaveBeenCalledWith('Xenova/slimsam-77-uniform', expect.objectContaining({ revision }));
    expect(processor).toHaveBeenCalledWith(expect.objectContaining({ width: 8, height: 6 }), {
      input_points: [[[5, 3]]]
    });
    expect(model).toHaveBeenCalledWith(expect.objectContaining({ original_sizes: { tag: 'original' } }));
    expect(postProcess).toHaveBeenCalledWith(
      { tag: 'predictions' },
      { tag: 'original' },
      { tag: 'reshaped' }
    );
    expect(results).toEqual([{
      label: 'subject',
      score: expect.closeTo(0.93, 5),
      mask: { width: 2, height: 2, channels: 1, data: new Uint8Array([0, 255, 255, 0]) }
    }]);
  });

  it('cancels a filter job by rejecting its promise, terminating its worker, and preserving document state', async () => {
    const OS = loadOpenShop();
    const target = { name: 'Photo', type: 'image', visible: true };
    const canvas = createCanvasMock([target]);
    canvas.setActiveObject(target);
    OS.canvas = canvas;
    OS.layers = [{ name: 'Photo', visible: true, locked: false, objects: [target] }];
    quietUiMethods(OS);

    const listeners = {};
    const worker = {
      addEventListener: vi.fn((type, listener) => { listeners[type] = listener; }),
      postMessage: vi.fn(),
      terminate: vi.fn()
    };
    OS._getFilterWorker = vi.fn(() => worker);
    const source = new ImageData(new Uint8ClampedArray([10, 20, 30, 255]), 1, 1);
    const revision = OS._documentRevision;
    const historyLength = OS.history.length;
    const pending = OS._runFilterJob({ backend: 'worker', op: 'posterize' }, source, 1, 1, { levels: 4 });
    const rejected = pending.catch(error => error);

    // The progress dialog reveals itself only after a short delay so fast
    // filters do not flash it, but the job is cancellable straight away.
    expect(OS._activeProgressJobId).toBeTruthy();
    expect(document.getElementById('ai-progress').classList.contains('visible')).toBe(false);
    expect(OS.cancelActiveCompute()).toBe(true);

    const error = await rejected;
    expect(error.name).toBe('AbortError');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(OS._filterJobCallbacks).toEqual({});
    expect(OS._documentRevision).toBe(revision);
    expect(OS.history).toHaveLength(historyLength);
    expect(canvas.getObjects()).toEqual([target]);
    expect(OS._activeProgressJobId).toBeNull();
  });

  it('discards a late AI result after the document revision changes', async () => {
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
    OS.layers = [{ name: 'Photo', visible: true, locked: false, objects: [target] }];
    quietUiMethods(OS);
    let resolveInference;
    const inference = new Promise(resolve => { resolveInference = resolve; });
    OS._segmentResultsAtPoint = vi.fn(() => inference);

    const pending = OS.aiSegmentSelectAt({ x: 8, y: 8 });
    await vi.waitFor(() => expect(OS._segmentResultsAtPoint).toHaveBeenCalled());
    OS._documentRevision += 1;
    resolveInference([{ label: 'subject', score: 1, mask: { width: 1, height: 1, channels: 1, data: new Uint8Array([255]) } }]);

    await expect(pending).resolves.toBe(false);
    expect(OS._selectionMask).toBeNull();
    expect(OS.history).toHaveLength(0);
    expect(canvas.getObjects()).toEqual([target]);
    expect(OS.toast).toHaveBeenCalledWith('Segment Select result discarded because the document changed', 'info');
  });

  it('uses Photon only for parity-verified operations and falls back after failure', async () => {
    const OS = loadOpenShop();
    const input = { data: new Uint8ClampedArray([10, 20, 30, 255]) };
    const photonResult = { data: new Uint8ClampedArray([245, 235, 225, 255]) };
    const fallbackResult = { data: new Uint8ClampedArray([0, 0, 0, 255]) };

    OS._gpuFilterDisabled = true;
    OS._runPhotonFilterInWorker = vi.fn().mockResolvedValueOnce(photonResult);
    OS._runFilterInWorker = vi.fn();

    await expect(OS._runFilterWithPhoton('invert', input, 1, 1)).resolves.toBe(photonResult);
    expect(OS._runPhotonFilterInWorker).toHaveBeenCalledWith('invert', input, 1, 1, undefined);
    expect(OS._runFilterInWorker).not.toHaveBeenCalled();

    // Photon's grayscale, sepia, threshold, sharpen and emboss do not compute
    // what this app computes, so they never reach the WASM backend — the result
    // must not depend on whether the optional download succeeded.
    OS._runPhotonFilterInWorker = vi.fn();
    OS._runFilterInWorker = vi.fn().mockResolvedValue(fallbackResult);
    for (const op of ['grayscale', 'sepia', 'threshold', 'sharpen', 'emboss']) {
      await expect(OS._runFilterWithPhoton(op, input, 1, 1, {})).resolves.toBe(fallbackResult);
    }
    expect(OS._runPhotonFilterInWorker).not.toHaveBeenCalled();
    expect(OS._photonFilterDisabled).toBe(false);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    OS._runPhotonFilterInWorker = vi.fn().mockRejectedValueOnce(new Error('WASM blocked'));
    OS._runFilterInWorker = vi.fn().mockResolvedValueOnce(fallbackResult);

    await expect(OS._runFilterWithPhoton('invert', input, 1, 1, {})).resolves.toBe(fallbackResult);
    expect(OS._photonFilterDisabled).toBe(true);
    expect(OS._runFilterInWorker).toHaveBeenCalledWith('invert', input, 1, 1, {});
    warn.mockRestore();
  });

  it('routes parity-verified filters through the accelerated worker and publishes FPS samples', async () => {
    const OS = loadOpenShop();
    const input = { data: new Uint8ClampedArray([10, 20, 30, 255]) };
    const accelerated = { data: new Uint8ClampedArray([245, 235, 225, 255]) };
    OS._runGPUFilterInWorker = vi.fn().mockResolvedValue(accelerated);
    OS._runPhotonFilterInWorker = vi.fn();

    expect(OS._gpuParityOps).toEqual(['invert', 'grayscale', 'threshold', 'brightness', 'contrast', 'blur', 'sharpen']);

    await expect(OS._runFilterWithPhoton('invert', input, 1, 1, {})).resolves.toBe(accelerated);
    expect(OS._runGPUFilterInWorker).toHaveBeenCalledWith('invert', input, 1, 1, {});
    expect(OS._runPhotonFilterInWorker).not.toHaveBeenCalled();

    for (const [op, params] of [
      ['grayscale', {}], ['threshold', { thr:128 }], ['brightness', { value:0.2 }],
      ['contrast', { value:0.25 }], ['blur', { radius:1 }], ['sharpen', {}]
    ]) {
      await expect(OS._runFilterWithPhoton(op, input, 1, 1, params)).resolves.toBe(accelerated);
      expect(OS._runGPUFilterInWorker).toHaveBeenCalledWith(op, input, 1, 1, params);
    }

    OS._recordFilterBenchmark('invert', 'webgpu', 4);
    OS._recordFilterBenchmark('invert', 'webgpu', 6);
    const report = OS.filterBackendReport();
    expect(report.invert.backends.webgpu).toMatchObject({ samples:2, lastMs:6 });
    expect(report.invert.backends.webgpu.fps).toBeCloseTo(200, 5);
    expect(OS.aiBackendReport().filterBackends).toEqual(report);
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
    OS._commitImageData = vi.fn().mockResolvedValue(true);

    await OS.applyFilterDirect('Sharpen');

    expect(OS._runFilterWithPhoton).toHaveBeenCalledWith(
      'sharpen',
      input,
      1,
      1,
      {}
    );
    // The success toast now belongs to the commit, which only fires it once the
    // late guard inside _replaceActiveImage has passed.
    expect(OS._commitImageData).toHaveBeenCalledWith(
      {...info, imgData: output},
      'Filter: Sharpen',
      { success: 'Applied Sharpen' }
    );
    expect(OS._lastFilter).toBe('Sharpen');
  });

  it('leaves the last filter unset when the commit is rejected late', async () => {
    const OS = loadOpenShop();
    const active = { name: 'Photo', type: 'image' };
    const canvas = createCanvasMock([active]);
    canvas.setActiveObject(active);
    OS.canvas = canvas;
    quietUiMethods(OS);

    const input = { data: new Uint8ClampedArray([10, 20, 30, 255]), width: 1, height: 1 };
    OS._getActiveImageData = vi.fn(() => ({ active, canvas: { width: 1, height: 1 }, imgData: input }));
    OS._runFilterWithPhoton = vi.fn().mockResolvedValue({ data: new Uint8ClampedArray([1, 2, 3, 255]), width: 1, height: 1 });
    // The document changed while the filter ran, so the commit refuses it.
    OS._commitImageData = vi.fn().mockResolvedValue(false);
    OS._lastFilter = 'Sepia';

    const applied = await OS.applyFilterDirect('Sharpen');

    expect(applied).toBe(false);
    // Reapply Last Filter must not point at a filter that never landed.
    expect(OS._lastFilter).toBe('Sepia');
  });

  it('bounds PSD headers, layer structure, transferred pixels, and aggregate decode memory', () => {
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
    expect(OS._readPSDHeader(makeHeader())).toMatchObject({ width: 100, height: 80, depth: 8, colorMode: 3 });
    expect(() => OS._validatePSDHeader(OS._readPSDHeader(makeHeader({ width: 90000 })), 1024)).toThrow(/dimensions exceed/);
    expect(() => OS._validatePSDHeader(OS._readPSDHeader(makeHeader({ depth: 32 })), 1024)).toThrow(/bit depth/);
    expect(() => OS._validatePSDHeader(OS._readPSDHeader(makeHeader({ colorMode: 4 })), 1024)).toThrow(/RGB/);
    expect(() => OS._validatePSDHeader(OS._readPSDHeader(makeHeader()), OS._psdLimits.maxFileBytes + 1)).toThrow(/256 MB/);
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

    const validPixels = { width: 10, height: 10, buffer: new ArrayBuffer(10 * 10 * 4) };
    expect(() => OS._validatePSDDecodedPayload({
      width: 100,
      height: 80,
      decodedBytes: validPixels.buffer.byteLength,
      composite: validPixels,
      children: []
    })).not.toThrow();
    expect(() => OS._validatePSDDecodedPayload({
      width: 100,
      height: 80,
      decodedBytes: OS._psdLimits.maxDecodedBytes + 1,
      composite: null,
      children: []
    })).toThrow(/decoded memory/);
    expect(() => OS._validatePSDDecodedPayload({
      width: 100,
      height: 80,
      decodedBytes: 8,
      composite: { width: 2, height: 2, buffer: new ArrayBuffer(8) },
      children: []
    })).toThrow(/truncated/);
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

  it('normalizes animated file formats and resolves drop intent from workspace state', () => {
    const OS = loadOpenShop();
    const animatedGif = { name:'clip.gif', type:'image/gif', size:10 };
    const animatedPng = { name:'clip.apng', type:'image/apng', size:10 };
    const webp = { name:'clip.webp', type:'image/webp', size:10 };
    const avif = { name:'clip.avif', type:'image/avif', size:10 };
    const project = { name:'clip.openshop', type:'application/vnd.openshop+json', size:10 };

    expect(OS._describeImportFormat(animatedGif)).toMatchObject({ format:'gif', animated:true, placeable:true });
    expect(OS._describeImportFormat(animatedPng)).toMatchObject({ format:'apng', animated:true, placeable:true });
    expect(OS._describeImportFormat(webp)).toMatchObject({ format:'webp', animated:true, placeable:true });
    expect(OS._describeImportFormat(avif)).toMatchObject({ format:'avif', animated:false, placeable:true });
    expect(OS._describeImportFormat(project)).toMatchObject({ format:'project', animated:false, placeable:false });

    OS._documentId = 'document-1';
    OS._blankWorkspace = false;
    expect(OS._resolveImportIntent(animatedGif, 'open')).toBe('open');
    expect(OS._resolveImportIntent(animatedGif, 'place')).toBe('place');
    expect(OS._resolveImportIntent(animatedGif, 'paste')).toBe('paste');
    expect(OS._resolveImportIntent(animatedGif, 'drop')).toBe('place');
    expect(OS._resolveImportIntent(project, 'drop')).toBe('open');

    OS._blankWorkspace = true;
    expect(OS._resolveImportIntent(animatedGif, 'drop')).toBe('open');
    expect(OS._resolveImportIntent(animatedGif, 'paste')).toBe('open');
  });

  it('caches a measured canvas ceiling and rejects both side and area overflow', () => {
    const OS = loadOpenShop();
    const configured = {
      maxDimension:OS._importLimits.maxImageDimension,
      maxPixels:OS._importLimits.maxImagePixels
    };
    const environment = OS._canvasProbeEnvironment(configured);
    localStorage.setItem(OS._canvasCeilingStorageKey, JSON.stringify({
      version:OS._canvasCeilingProbeVersion,
      maxDimension:100,
      maxPixels:1000,
      measured:true,
      source:'probe',
      environment,
      measuredAt:'2026-08-09T00:00:00.000Z'
    }));

    const ceiling = OS.getCanvasCeiling();
    expect(ceiling).toMatchObject({ maxDimension:100, maxPixels:1000, measured:true, source:'cache' });
    expect(OS._binaryCanvasProbe(32, value => value <= 17)).toBe(17);
    expect(OS._canvasDimensionFailure(101, 1).reason).toBe('dimension');
    expect(OS._canvasDimensionFailure(40, 26).reason).toBe('area');
    expect(() => OS._validateDecodedImage({ width:101, height:1 })).toThrow(/measured browser canvas ceiling/);
  });

  it('parses ASE-compatible asset palettes, ABR entries, and GRD v3 stops', () => {
    const OS = loadOpenShop();
    OS.toast = vi.fn();

    const abr = new Uint8Array([
      0x38, 0x42, 0x50, 0x53, 0x00, 0x06, 0x00, 0x02,
      0x00, 0x00, 0x00, 0x04, 1, 2, 3, 4,
      0x00, 0x00, 0x00, 0x08, 5, 6, 7, 8, 9, 10, 11, 12
    ]).buffer;
    expect(OS._parseAbrBrushes(abr, 'Ink Set.abr')).toMatchObject([
      { name: 'Ink Set 1', sourceFormat: 'ABR', version: 6 },
      { name: 'Ink Set 2', sourceFormat: 'ABR', version: 6 }
    ]);
    const parsed = OS._parseAbrBrushes(abr, 'Ink Set.abr');
    expect(parsed[0].tip).toMatchObject({ width:2, height:2, format:'raw-grayscale' });
    expect(parsed[0].unsupportedFeatures).toEqual([
      'native ABR descriptors', 'native ABR sample compression', 'native ABR dynamics'
    ]);
    expect(OS._abrStrokeSamples([
      { x:0, y:0, pressure:0.2 }, { x:40, y:0, pressure:0.8 }
    ], { size:10, spacing:50 })).toHaveLength(11);
    expect(OS._renderABRStroke([
      { x:0, y:0, pressure:0.2 }, { x:20, y:0, pressure:0.8 }
    ], {
      id:'abr-test', size:10, spacing:50, opacity:80, scatter:20,
      pressureSize:true, pressureOpacity:true,
      tip:{ width:2, height:2, alpha:[0,255,255,0] }
    })).toMatchObject({ stampCount: expect.any(Number), width:expect.any(Number), height:expect.any(Number) });
    const tiltAsset = { id:'abr-tilt', size:12, spacing:100, tip:{ width:3, height:1, alpha:[255,255,255] } };
    OS.setTiltDynamics(false);
    const upright = OS._renderABRStroke([{ x:20, y:20, hasTilt:true, altitudeAngle:Math.PI / 2, azimuthAngle:0 }], tiltAsset);
    OS.setTiltDynamics(true);
    const tilted = OS._renderABRStroke([{ x:20, y:20, hasTilt:true, altitudeAngle:0.25, azimuthAngle:Math.PI / 2 }], tiltAsset);
    expect(Array.from(tilted.rgba)).not.toEqual(Array.from(upright.rgba));
    expect(OS._renderABRStroke([
      { x:0, y:0 }, { x:5000, y:5000 }
    ], { size:100, spacing:1, tip:{ width:1, height:1, alpha:[255] } })).toMatchObject({
      error: expect.stringMatching(/raster budget/)
    });

    const grd = new ArrayBuffer(8 + 1 + 6 + 2 + (20 * 2) + 2 + 6);
    const view = new DataView(grd);
    new Uint8Array(grd).set([0x38, 0x42, 0x47, 0x52]);
    view.setUint16(4, 3, false); view.setUint16(6, 1, false);
    let cursor = 8;
    view.setUint8(cursor++, 6); new Uint8Array(grd).set([83, 117, 110, 115, 101, 116], cursor); cursor += 6;
    view.setUint16(cursor, 2, false); cursor += 2;
    const color = (offset, r, g, b) => {
      view.setInt32(cursor, offset, false); cursor += 4;
      view.setInt32(cursor, 2048, false); cursor += 4;
      view.setInt16(cursor, 0, false); cursor += 2;
      [r, g, b, 0].forEach(value => { view.setInt16(cursor, value, false); cursor += 2; });
      view.setInt16(cursor, 0, false); cursor += 2;
    };
    color(0, 255, 0, 0); color(4096, 0, 0, 255);
    view.setUint16(cursor, 0, false); cursor += 2; cursor += 6;
    expect(OS._parseGrdGradients(grd)).toEqual([{
      name: 'Sunset', type: 'linear',
      colorStops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }]
    }]);
  });

  it('shows recovery storage status and restores sanitized recovery data', async () => {
    const OS = loadOpenShop();
    const canvas = createCanvasMock();
    OS.canvas = canvas;
    quietUiMethods(OS);
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
    await vi.waitFor(() => expect(OS.toast).toHaveBeenCalledWith('Project restored from auto-save', 'success'));
    expect(canvas.loadFromJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        objects: [expect.objectContaining({ name: 'alert(1)' })]
      })
    );

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

  it('turns auto-save recovery discovery failures into retryable visible diagnostics', async () => {
    const OS = loadOpenShop();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn() }
    });
    OS._initRecoveryCoordination = vi.fn();
    OS._announceAccessibility = vi.fn();
    OS._migrateLegacyRecovery = vi.fn()
      .mockRejectedValueOnce(new Error('Recovery index unavailable'))
      .mockResolvedValue(undefined);
    OS._getRecoveryInfo = vi.fn().mockResolvedValue({ recoverable:null, generations:[] });

    await OS._initAutoSave();

    const toast = document.querySelector('#toast-container .toast.error');
    expect(toast).not.toBeNull();
    expect(toast.textContent).toContain('Auto-save recovery check: Recovery index unavailable');
    expect(toast.querySelector('button').textContent).toBe('Retry');
    expect(OS._diagnostics).toHaveLength(1);
    expect(OS._diagnostics[0]).toMatchObject({
      kind:'error',
      message:'Auto-save recovery check: Recovery index unavailable',
      detail:{ operation:'Auto-save recovery check', storage:'opfs' }
    });

    toast.querySelector('button').click();
    await vi.waitFor(() => expect(OS._migrateLegacyRecovery).toHaveBeenCalledTimes(2));
    expect(OS._getRecoveryInfo).toHaveBeenCalledTimes(1);
    expect(OS._diagnostics).toHaveLength(1);

    clearInterval(OS._autoSaveTimer);
    OS._autoSaveTimer = null;
  });

  it('retains bounded immutable recovery generations per document and globally', () => {
    const OS = loadOpenShop();
    OS._recoveryRetentionPerDocument = 3;
    OS._recoveryRetentionTotal = 5;
    const makeRecord = (documentId, index) => {
      const envelope = {
        generationId: `${documentId}-${index}`,
        documentId,
        ownerId: 'tab-a',
        leaseExpiresAt: 0,
        name: documentId,
        label: '',
        revision: index,
        createdAt: new Date(Date.UTC(2026, 6, 29, 12, 0, index)).toISOString(),
        checksumAlgorithm: 'sha256',
        checksum: String(index).padStart(64, '0')
      };
      return {
        filename: `recovery-${documentId}-${index}.json`,
        valid: true,
        legacy: false,
        envelope,
        size: 100 + index
      };
    };
    const records = [
      ...Array.from({ length: 4 }, (_, index) => makeRecord('doc-a', index)),
      ...Array.from({ length: 3 }, (_, index) => makeRecord('doc-b', index))
    ];
    const newEnvelope = makeRecord('doc-a', 5).envelope;
    const newest = OS._recoveryIndexEntry('recovery-doc-a-5.json', newEnvelope, 105);
    const retention = OS._selectRecoveryRetention(records, newest);

    expect(retention.kept).toHaveLength(5);
    expect(retention.kept.filter((entry) => entry.documentId === 'doc-a')).toHaveLength(3);
    expect(retention.kept.filter((entry) => entry.documentId === 'doc-b')).toHaveLength(2);
    expect(retention.kept[0].generationId).toBe('doc-a-5');
    expect(retention.pruned).toContain('recovery-doc-a-0.json');
  });

  it('preserves text newlines, long text, and base64 sources through sanitization', () => {
    const OS = loadOpenShop();
    const longText = `line one\nline two\tconversation=5\n${'x'.repeat(900)}`;
    // A base64 tail that the previous on\w+= scrub silently ate.
    const src = 'data:image/png;base64,AAAAoNCnowqRiJABapIV9aIw8g==';
    const project = {
      kind: 'openshop-document',
      schemaVersion: 1,
      canvas: { width: 800, height: 600, fabric: { objects: [] } },
      layers: [{ id: 'layer-1', objectIds: [] }],
      objects: [{ type: 'textbox', text: longText, src }]
    };

    OS._sanitizeProjectJSON(project);
    expect(project.objects[0].text).toBe(longText);
    expect(project.objects[0].src).toBe(src);

    // Trusted internal snapshots are validated but never rewritten.
    const trusted = { objects: [{ name: 'javascript:keep', text: longText, id: '<keep>' }] };
    OS._sanitizeProjectJSON(trusted, { trusted: true });
    expect(trusted.objects[0].name).toBe('javascript:keep');
    expect(trusted.objects[0].id).toBe('<keep>');
    expect(trusted.objects[0].text).toBe(longText);

    // Structural limits still apply in trusted mode.
    expect(() => OS._sanitizeProjectJSON(
      { objects: Array.from({ length: OS._importLimits.maxProjectObjects + 2 }, () => ({})) },
      { trusted: true }
    )).toThrow(/exceeds import limits/);
  });

  it('restores the previous document when a project fails to load', async () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS._docName = 'Original';
    OS._isDirty = true;
    OS._captureDocumentState = () => ({ kind: 'openshop-document', tag: 'original' });

    const loaded = [];
    OS._loadDocumentState = async (state, opts = {}) => {
      loaded.push(state.tag);
      // The failure surfaces only after the canvas has already been replaced.
      if (!opts.trusted) throw new Error('Project selection data is truncated');
    };
    OS._advanceDocumentGeneration = vi.fn();
    OS._clearAutoSave = vi.fn();
    const toasts = [];
    OS.toast = (message, type) => toasts.push({ message, type });

    const file = { size: 10, text: async () => JSON.stringify({ tag: 'broken' }) };
    const ok = await OS._loadProjectFile(file);

    expect(ok).toBe(false);
    expect(loaded).toEqual(['broken', 'original']);
    expect(OS._docName).toBe('Original');
    expect(OS._isDirty).toBe(true);
    expect(toasts.at(-1).message).toMatch(/previous document restored/);
  });

  it('walks history one step per undo when restores overlap', async () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS._historyBaseSnapshot = 'base';
    OS.history = [
      { action: 'a', snapshot: 's1' },
      { action: 'b', snapshot: 's2' },
      { action: 'c', snapshot: 's3' }
    ];
    OS.historyIdx = 2;

    const applied = [];
    OS._loadDocumentState = async (state) => {
      // A real load yields; overlapping calls used to read a stale historyIdx.
      await new Promise((resolve) => setTimeout(resolve, 5));
      applied.push(state.tag);
    };
    OS._restorePersistenceForSnapshot = vi.fn();
    const parse = JSON.parse;
    JSON.parse = (text) => ({ tag: text });

    try {
      const all = Promise.all([OS.undo(), OS.undo(), OS.undo()]);
      await all;
    } finally {
      JSON.parse = parse;
    }

    expect(applied).toEqual(['s2', 's1', 'base']);
    expect(OS.historyIdx).toBe(-1);
  });

  it('preserves mask, blend, and opacity when committing a pixel edit', async () => {
    const OS = loadOpenShop();
    const clipPath = { type: 'rect' };
    const active = {
      left: 10, top: 20, scaleX: 2, scaleY: 3, angle: 15,
      flipX: true, flipY: false, skewX: 4, skewY: 5,
      originX: 'left', originY: 'top',
      opacity: 0.5, globalCompositeOperation: 'multiply',
      shadow: null, visible: true, clipPath, _hasMask: true,
      name: 'Photo', type: 'image'
    };
    OS.canvas = createCanvasMock([active]);
    quietUiMethods(OS);
    OS.layers = [{ name: 'Layer 1', objects: [active] }];
    OS._guardObjectEdit = () => true;
    OS._isObjectEditable = () => true;
    OS.saveHistory = vi.fn();

    const created = {};
    installFabricMock();
    globalThis.fabric.FabricImage = {
      fromURL: async () => ({
        set(props) { Object.assign(created, props); },
        type: 'image'
      })
    };

    const ok = await OS._replaceActiveImage(active, 'data:image/png;base64,AAAA', 'Filter: Posterize');
    expect(ok).toBe(true);
    expect(created.clipPath).toBe(clipPath);
    expect(created.opacity).toBe(0.5);
    expect(created.globalCompositeOperation).toBe('multiply');
    expect(created.skewX).toBe(4);
    // The object keeps its own name; the history label is not its identity.
    expect(created.name).toBe('Photo');
  });

  it('clamps numeric dialog input instead of substituting defaults', () => {
    const OS = loadOpenShop();
    const input = (value) => ({ value });
    const opts = { min: 1, max: 8000, fallback: 1920 };

    expect(OS._readNumberInput(input('800'), opts)).toEqual({ value: 800, valid: true });
    // Out of range clamps and reports invalid rather than silently defaulting.
    expect(OS._readNumberInput(input('-50'), opts)).toEqual({ value: 1, valid: false });
    expect(OS._readNumberInput(input('999999'), opts)).toEqual({ value: 8000, valid: false });
    expect(OS._readNumberInput(input('0'), opts)).toEqual({ value: 1, valid: false });
    expect(OS._readNumberInput(input(''), opts)).toEqual({ value: 1920, valid: false });
    expect(OS._readNumberInput(input('abc'), opts)).toEqual({ value: 1920, valid: false });

    // A negative history cap would evict every entry and disable undo.
    const history = OS._readNumberInput(input('-5'), { min: 10, max: 200, fallback: 60 });
    expect(history.value).toBe(10);
    expect(history.valid).toBe(false);
  });

  it('clamps paired slider numbers and preserves fractional slider steps', () => {
    const OS = loadOpenShop();
    const range = {
      min:'-100', max:'100', value:'0', step:'1',
      getAttribute(name) { return name === 'step' ? this.step : null; }
    };
    expect(OS._readRangeNumberInput(range, '42')).toEqual({ value:42, valid:true });
    expect(OS._readRangeNumberInput(range, '-999')).toEqual({ value:-100, valid:false });
    expect(OS._readRangeNumberInput(range, 'bad', 12)).toEqual({ value:12, valid:false });

    const gamma = {
      min:'0.1', max:'4', value:'1', step:'0.1',
      getAttribute(name) { return name === 'step' ? this.step : null; }
    };
    expect(OS._readRangeNumberInput(gamma, '1.26')).toEqual({ value:1.3, valid:false });
    expect(OS._readRangeNumberInput(gamma, '2.4')).toEqual({ value:2.4, valid:true });
  });

  it('offers reciprocal and integer pixel-perfect zoom levels', () => {
    const OS = loadOpenShop();
    expect(OS._snapPixelZoom(1.8)).toBe(2);
    expect(OS._snapPixelZoom(0.34)).toBeCloseTo(1 / 3);
    OS.zoom = 1;
    expect(OS._nextPixelZoom(1)).toBe(2);
    expect(OS._nextPixelZoom(-1)).toBe(0.5);
    OS.zoom = 2;
    expect(OS._nextPixelZoom(-1)).toBe(1);
  });

  it('keeps the open document when an image open is cancelled', async () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    installModalDelegation();
    OS.createNewDocument = vi.fn();
    OS.zoomFit = vi.fn();
    OS.trackRecentFile = vi.fn();
    OS.layers = [{ id: 'l1', name: 'Background', objects: [] }];
    OS.activeLayerIdx = 0;
    const image = () => ({ width: 10, height: 10, set() {} });

    // Cancelling has to report the refusal, not just skip the add — the GIF
    // frame import keys the rest of its work off this answer.
    OS._isDirty = true;
    const declined = OS._addDecodedImageToCanvas(image(), { name: 'x.png', mode: 'open' });
    document.querySelector('.modal-overlay [data-modal-cancel]').click();
    await expect(declined).resolves.toBe(false);
    expect(OS.createNewDocument).not.toHaveBeenCalled();

    OS._isDirty = false;
    await expect(
      OS._addDecodedImageToCanvas(image(), { name: 'x.png', mode: 'open' })
    ).resolves.toBe(true);
    expect(OS.createNewDocument).toHaveBeenCalled();
  });

  it('guards document-replacing actions when the document is dirty', async () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    installModalDelegation();

    // A clean document never prompts.
    OS._isDirty = false;
    await expect(OS._confirmDiscardUnsaved()).resolves.toBe(true);
    expect(document.querySelector('.modal-overlay')).toBeNull();

    OS._isDirty = true;
    const cancelled = OS._confirmDiscardUnsaved('Creating a new document');
    const overlay = document.querySelector('.modal-overlay');
    expect(overlay.textContent).toMatch(/Discard unsaved changes\?/);
    expect([...overlay.querySelectorAll('button')].map((b) => b.textContent))
      .toEqual(['Cancel', 'Save first', 'Discard']);
    overlay.querySelector('[data-modal-cancel]').click();
    await expect(cancelled).resolves.toBe(false);
    expect(document.querySelector('.modal-overlay')).toBeNull();

    const discarded = OS._confirmDiscardUnsaved();
    const second = document.querySelector('.modal-overlay');
    [...second.querySelectorAll('button')].find((b) => b.textContent === 'Discard').click();
    await expect(discarded).resolves.toBe(true);

    // "Save first" only proceeds when the save actually succeeds.
    OS.saveProject = vi.fn().mockResolvedValue(false);
    const failed = OS._confirmDiscardUnsaved();
    const third = document.querySelector('.modal-overlay');
    [...third.querySelectorAll('button')].find((b) => b.textContent === 'Save first').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
    OS.saveProject = vi.fn().mockResolvedValue(true);
    [...document.querySelectorAll('.modal-overlay button')].find((b) => b.textContent === 'Save first').click();
    await expect(failed).resolves.toBe(true);
  });

  it('puts a verified Save/Discard/Cancel transaction in front of offline shell replacement', async () => {
    const OS = loadOpenShop();
    quietUiMethods(OS);
    installModalDelegation();
    OS._isDirty = true;
    OS._saveOfflineDocumentBeforeReplacement = vi.fn().mockResolvedValue(true);
    OS._discardOfflineDocumentBeforeReplacement = vi.fn().mockResolvedValue(true);

    const cancelled = OS._confirmOfflineRuntimeReplacement('Apply Update');
    const first = document.querySelector('.modal-overlay');
    expect(first.textContent).toMatch(/reload OpenShop and replace the running app/);
    expect([...first.querySelectorAll('button')].map(button => button.textContent))
      .toEqual(['Cancel', 'Save', 'Discard']);
    first.querySelector('[data-modal-cancel]').click();
    await expect(cancelled).resolves.toBe(false);
    expect(OS._saveOfflineDocumentBeforeReplacement).not.toHaveBeenCalled();
    expect(OS._discardOfflineDocumentBeforeReplacement).not.toHaveBeenCalled();

    const saved = OS._confirmOfflineRuntimeReplacement('Restore Previous Shell');
    const second = document.querySelector('.modal-overlay');
    [...second.querySelectorAll('button')].find(button => button.textContent === 'Save').click();
    await expect(saved).resolves.toBe(true);
    expect(OS._saveOfflineDocumentBeforeReplacement).toHaveBeenCalledTimes(1);

    const discarded = OS._confirmOfflineRuntimeReplacement('Rebuild Offline Shell');
    const third = document.querySelector('.modal-overlay');
    [...third.querySelectorAll('button')].find(button => button.textContent === 'Discard').click();
    await expect(discarded).resolves.toBe(true);
    expect(OS._discardOfflineDocumentBeforeReplacement).toHaveBeenCalledTimes(1);
  });

  it('requires an acknowledged current recovery generation before offline replacement', async () => {
    const OS = loadOpenShop();
    quietUiMethods(OS);
    OS._documentId = 'document-offline';
    OS._documentRevision = 4;
    OS._autoSave = vi.fn().mockResolvedValue(true);
    OS._autoSaveDirty = false;
    OS._getRecoveryTabId = () => 'tab-offline';
    OS._listRecoveryGenerations = vi.fn().mockResolvedValue([{
      valid:true, documentId:'document-offline', revision:4, ownerId:'tab-offline'
    }]);

    await expect(OS._saveOfflineDocumentBeforeReplacement()).resolves.toBe(true);
    expect(OS._autoSave).toHaveBeenCalledTimes(1);

    OS._listRecoveryGenerations.mockResolvedValue([]);
    await expect(OS._saveOfflineDocumentBeforeReplacement()).resolves.toBe(false);
    expect(OS.toast).toHaveBeenCalledWith(expect.stringContaining('could not be verified'), 'error');
  });

  it('offers recovery above the welcome launcher', () => {
    const OS = loadOpenShop();
    quietUiMethods(OS);
    const overlay = OS._offerRecovery({
      valid: true,
      payloadText: '{}',
      name: 'Untitled',
      createdAt: new Date(0).toISOString()
    });
    // The welcome overlay is z-index 30000 and is still up during startup.
    expect(overlay.classList.contains('recovery-overlay')).toBe(true);
    overlay.remove();
  });

  it('hides selection overlays during raster capture and restores them after', () => {
    const OS = loadOpenShop();
    const boundary = { name: '__boundary__', visible: true, opacity: 1, set(key, value) { this[key] = value; } };
    const overlay = { name: 'wand', visible: true, excludeFromExport: true, _wandOverlay: true };
    const photo = { name: 'Photo', visible: true };
    OS.canvas = createCanvasMock([boundary, overlay, photo]);
    quietUiMethods(OS);
    OS._enforceLayerInvariants = vi.fn();

    let visibleDuringCapture = null;
    OS.canvas.toDataURL = vi.fn(() => {
      visibleDuringCapture = { overlay: overlay.visible, photo: photo.visible };
      return 'data:image/png;base64,AAAA';
    });

    OS._withExportCanvasState({ transparent: true }, () => OS.canvas.toDataURL({}));

    expect(visibleDuringCapture).toEqual({ overlay: false, photo: true });
    expect(overlay.visible).toBe(true);
  });

  it('never rolls back a transaction started by another command', async () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS._captureDocumentState = vi.fn(() => ({ kind: 'openshop-document' }));
    OS._pushHistoryEntry = vi.fn(() => true);
    const rollback = vi.spyOn(OS, '_rollbackHistoryTransaction');

    let release;
    const slow = new Promise((resolve) => { release = resolve; });
    OS._getCommandRegistry = () => new Map([
      ['canvas.flatten', { execute: () => slow }]
    ]);
    OS._normalizeCommand = (command) => ({ id: command.id, schemaVersion: 1, args: {} });

    const first = OS._executeCommand({ id: 'canvas.flatten' });
    expect(OS._historyTransaction).not.toBeNull();
    const held = OS._historyTransaction;

    // Second command arrives while the first is still awaiting.
    const second = await OS._executeCommand({ id: 'canvas.flatten' });
    expect(second).toBe(false);
    expect(rollback).not.toHaveBeenCalled();
    expect(OS._historyTransaction).toBe(held);

    release(true);
    await expect(first).resolves.toBe(true);
  });

  it('keeps the document dirty when an edit lands during the autosave clear', async () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS.layers = [{ name: 'Background', visible: true, opacity: 100, blend: 'source-over', objects: [] }];
    OS.canvasW = 800;
    OS.canvasH = 600;
    OS._isDirty = true;
    OS._documentRevision = 4;
    // The edit arrives while the recovery lock is held.
    OS._clearAutoSave = vi.fn(async () => { OS._documentRevision += 1; });
    OS._writeProjectFile = vi.fn().mockResolvedValue(true);
    const toasts = [];
    OS.toast = (message, type) => toasts.push({ message, type });

    await OS._saveProjectTransaction();

    expect(OS._isDirty).toBe(true);
    expect(OS._autoSaveDirty).toBe(true);
    expect(OS._persistenceState).toBe('dirty');
    expect(toasts.some((entry) => /newer edits remain unsaved/.test(entry.message))).toBe(true);
  });

  it('sanitizes a large hostile string without quadratic backtracking', () => {
    const OS = loadOpenShop();
    const payload = { objects: [{ name: 'on'.repeat(500000) }] };
    const started = Date.now();
    OS._sanitizeProjectJSON(payload);
    expect(Date.now() - started).toBeLessThan(1000);
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
    OS.zoomFit = vi.fn();
    OS.saveHistory = vi.fn();
    OS._clearAutoSave = vi.fn();

    const state = OS._captureDocumentState();
    expect(state.kind).toBe('openshop-document');
    expect(state.schemaVersion).toBe(3);
    expect(state.canvas.width).toBe(800);
    expect(state.canvas.height).toBe(600);
    expect(state.layers).toHaveLength(1);
    expect(state.layers[0].objectIds).toHaveLength(2);

    OS._colorProfile = OS._normalizeColorProfile({
      name: 'Display P3',
      sourceKind: 'embedded-icc',
      iccData: 'data:application/vnd.openshop.icc;base64,AAECAwQ='
    });
    OS._selectionMask = { w: 2, h: 2, mask: new Uint8Array([255, 0, 0, 255]) };
    expect(OS._recordAIMask({ label: 'Subject', source: 'ai-segment' })).toBe(true);
    const metadataRoundTrip = JSON.parse(JSON.stringify(OS._captureDocumentState())).metadata;
    expect(metadataRoundTrip.colorProfile).toEqual(OS._colorProfile);
    expect(metadataRoundTrip.aiMasks).toHaveLength(1);
    expect(metadataRoundTrip.aiMasks[0]).toMatchObject({ label:'Subject', sourceKind:'ai-segment' });
    expect(OS._normalizeAIMasks(metadataRoundTrip.aiMasks, { validate:true })[0].mask.data)
      .toBe(metadataRoundTrip.aiMasks[0].mask.data);

    const clicks = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicks.push({ download: this.download });
    });
    await OS.saveProject();
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe('openshop-project.openshop');

    const hostile = {
      _openShop: { w: '640', h: '480' },
      objects: [{ name: '<script>alert(1)</script>', src: 'data:image/png;base64,AAAA' }]
    };
    OS._sanitizeProjectJSON(hostile);
    expect(hostile._openShop.w).toBe(640);
    expect(hostile.objects[0].name).not.toContain('onerror=');

    for (const src of ['javascript:alert(2)', 'https://tracker.example/beacon.png', 'http://10.0.0.1/x.png']) {
      expect(() => OS._sanitizeProjectJSON({
        _openShop: { w: '640', h: '480' },
        objects: [{ src }]
      })).toThrow(/non-embedded asset URL/);
    }
  });

  it('normalizes adjustment operations and applies their pixel math', () => {
    const OS = loadOpenShop();
    const levels = OS._normalizeAdjustment({
      type: 'levels',
      params: { black: -10, white: 128, gamma: 1 }
    });
    expect(levels).toEqual({
      type: 'levels', version: 1,
      params: { black: 0, white: 128, gamma: 1 },
      cacheKey: 'levels:v1:{"black":0,"white":128,"gamma":1}'
    });

    const pixels = { data: new Uint8ClampedArray([64, 32, 16, 255]) };
    OS._applyAdjustmentPixels(pixels, levels);
    expect([...pixels.data]).toEqual([128, 64, 32, 255]);

    const curveCommand = OS._makeCommand('layer.adjustment.update', {
      layerId: 'layer-1',
      adjustment: { type: 'curves', params: { points: [[0, 0], [128, 220], [255, 255]] } }
    });
    expect(curveCommand).toEqual(expect.objectContaining({ id: 'layer.adjustment.update', schemaVersion: 1 }));
    expect(curveCommand.args.adjustment.params.points).toEqual([[0, 0], [128, 220], [255, 255]]);
  });

  it('keeps layer masks independent from alpha with bounded feather and density', () => {
    const OS = loadOpenShop();
    const encoded = OS._encodeSelectionMask({
      w: 2, h: 2, mask: new Uint8Array([0, 255, 255, 0])
    });
    const mask = OS._normalizeLayerMask({
      mask: encoded, feather: 500, density: -20
    }, { validate:true });
    expect(mask).toMatchObject({ version:1, enabled:true, feather:100, density:0 });
    expect(mask.mask).toEqual(encoded);
    expect([...OS._layerMaskCoverage(mask, 2, 2)]).toEqual([0, 255, 255, 0]);
    expect(() => OS._normalizeLayerMask({ mask: { encoding:'coverage-v1', width:2, height:2, data:'data:application/vnd.openshop.selection;base64,AA==' } }, { validate:true })).toThrow(/truncated/);
  });

  it('normalizes embedded Smart Object sources and rejects remote payloads', () => {
    const OS = loadOpenShop();
    const source = 'data:image/png;base64,AAAA';
    expect(OS._normalizeSmartObject({ source, sourceName:'Photo.png', sourceWidth:1200, sourceHeight:800, revision:3 })).toEqual({
      version:1, kind:'image', source, sourceName:'Photo.png', sourceWidth:1200, sourceHeight:800, revision:3
    });
    expect(() => OS._normalizeSmartObject({ source:'https://example.test/photo.png' }, { validate:true })).toThrow(/invalid/);
  });

  it('keeps vector conversions as editable path commands with Bezier handles', () => {
    const OS = loadOpenShop();
    expect(OS._vectorPathData({ type:'rect', width:40, height:20 })).toEqual([
      ['M', 0, 0], ['L', 40, 0], ['L', 40, 20], ['L', 0, 20], ['Z']
    ]);
    const path = { path:[['M', 0, 0], ['C', 10, 20, 30, 40, 50, 60], ['Z']] };
    expect(OS._pathHandleEntries(path)).toEqual([
      { commandIndex:0, xIndex:1, yIndex:2, control:false },
      { commandIndex:1, xIndex:1, yIndex:2, control:true },
      { commandIndex:1, xIndex:3, yIndex:4, control:true },
      { commandIndex:1, xIndex:5, yIndex:6, control:false }
    ]);
  });

  it('preserves source text while applying basic OpenType feature choices', () => {
    const OS = loadOpenShop();
    const features = OS._normalizeTextFeatures({ ligatures:1, smallCaps:true, tabularNumbers:0 });
    expect(features).toEqual({ ligatures:true, smallCaps:true, tabularNumbers:false });
    expect(OS._formatTextFeatures('office files', features)).toBe('OFFICE FILES');
    expect(OS._normalizeTextOnPath({
      text:'Hello', pathObjectId:'path-1', features, style:{ fontSize:48, opacity:2 }
    })).toMatchObject({ version:1, text:'Hello', pathObjectId:'path-1', features, style:{ fontSize:48, opacity:1 } });
  });

  it('formats and clears a selected text range with sanitized character styles', () => {
    const OS = loadOpenShop();
    const controls = [
      ['text-font', 'select', 'Georgia'],
      ['text-size', 'number', '48'],
      ['text-color', 'color', '#ff3355'],
      ['text-decoration-color', 'color', '#22cc88'],
      ['text-decoration-thickness', 'number', '180']
    ];
    controls.forEach(([id, type, value]) => {
      const control = document.createElement(type === 'select' ? 'select' : 'input');
      control.id = id;
      if (type !== 'select') control.type = type;
      if (type === 'select') control.appendChild(new Option(value, value));
      control.value = value;
      document.body.appendChild(control);
    });
    [['text-bold', true], ['text-italic', true], ['text-underline', true], ['text-overline', false], ['text-linethrough', false]].forEach(([id, checked]) => {
      const control = document.createElement('input');
      control.id = id; control.type = 'checkbox'; control.checked = checked;
      document.body.appendChild(control);
    });
    const status = document.createElement('span'); status.id = 'text-range-status'; document.body.appendChild(status);
    const apply = document.createElement('button'); apply.id = 'apply-text-range'; document.body.appendChild(apply);
    const clear = document.createElement('button'); clear.id = 'clear-text-range'; document.body.appendChild(clear);
    const text = {
      type:'i-text', text:'Hello world', fill:'#ffffff', fontFamily:'DM Sans', fontSize:24,
      selectionStart:1, selectionEnd:5, styles:{}, set:vi.fn(function(value, next) {
        if (typeof value === 'string') this[value] = next;
        else Object.assign(this, value);
        return this;
      }), initDimensions:vi.fn(), setCoords:vi.fn()
    };
    OS.canvas = createCanvasMock([text]);
    OS.canvas.setActiveObject(text);
    OS.layers = [{ id:'layer-1', kind:'pixel', visible:true, locked:false, objects:[text] }];
    OS.activeLayerIdx = 0;
    OS._layerOwnership = null;
    OS.saveHistory = vi.fn();
    OS.updateLayersPanel = vi.fn();
    OS.toast = vi.fn();

    expect(OS.applySelectedTextRange()).toBe(true);
    expect(text.styles['0']['1']).toMatchObject({
      fontFamily:'Georgia', fontSize:48, fill:'#ff3355', fontWeight:'bold', fontStyle:'italic',
      underline:true, textDecorationColor:'#22cc88', textDecorationThickness:180
    });
    expect(text.styles['0']['0']).toBeUndefined();
    expect(OS.saveHistory).toHaveBeenCalledWith('Format Text Range');
    OS._syncTextRangeControls();
    expect(status.textContent).toBe('Characters 2–5 of 11');
    expect(apply.disabled).toBe(false);

    expect(OS.applySelectedTextRange({ clear:true })).toBe(true);
    expect(text.styles).toEqual({});
    expect(OS.saveHistory).toHaveBeenCalledWith('Clear Text Range');
    expect(clear.disabled).toBe(false);
  });

  it('migrates schema-2 text styles into the versioned range-style shape', () => {
    const OS = loadOpenShop();
    const project = {
      kind:'openshop-document', schemaVersion:2,
      canvas:{ width:100, height:80, fabric:{ objects:[{
        type:'i-text', text:'Hello', styles:{ '0':{ '0':{ fill:'#ff3355', fontSize:42, evil:'drop' } }, '__proto__':{ polluted:true } }
      }] } },
      layers:[{ id:'layer-1', name:'Text', kind:'pixel', visible:true, locked:false, opacity:100, blend:'source-over', objectIds:[] }]
    };
    const migrated = OS._migrateDocumentSchema(project);
    expect(migrated.state.schemaVersion).toBe(3);
    expect(migrated.report.steps).toEqual(['schema-2-to-3']);
    expect(migrated.state.canvas.fabric.objects[0].styles).toEqual({
      '0':{ '0':{ fill:'#ff3355', fontSize:42 } }
    });
    expect(OS._normalizeTextRangeStyles([
      { start:0, end:3, style:{ fill:'#22cc88', fontWeight:'bold', unsafe:'drop' } }
    ])).toEqual([
      { start:0, end:3, style:{ fill:'#22cc88', fontWeight:'bold' } }
    ]);
  });

  it('registers one installed-app launch consumer and routes supported files', async () => {
    const OS = loadOpenShop();
    quietUiMethods(OS);
    OS.dismissWelcome = vi.fn();
    OS._loadPSDFile = vi.fn().mockResolvedValue(true);
    OS._loadORAFile = vi.fn().mockResolvedValue(true);
    OS._loadProjectFile = vi.fn().mockResolvedValue(true);
    OS._handleFileLoad = vi.fn();

    let consumer;
    Object.defineProperty(window, 'launchQueue', {
      configurable: true,
      value: {
        setConsumer: vi.fn((callback) => { consumer = callback; })
      }
    });

    expect(OS._initFileLaunchQueue()).toBe(true);
    expect(window.launchQueue.setConsumer).toHaveBeenCalledTimes(1);

    const psd = { name: 'layers.psd', type: 'image/vnd.adobe.photoshop' };
    await consumer({ files: [{ getFile: vi.fn().mockResolvedValue(psd) }] });
    expect(OS._loadPSDFile).toHaveBeenCalledWith(psd);

    const ora = { name: 'layers.ora', type: 'image/openraster' };
    await OS._handleLaunchedFile({ getFile: vi.fn().mockResolvedValue(ora) });
    expect(OS._loadORAFile).toHaveBeenCalledWith(ora, { skipConfirm:true });

    const project = { name: 'layout.openshop', type: 'application/vnd.openshop+json' };
    const projectHandle = { getFile: vi.fn().mockResolvedValue(project) };
    await OS._handleLaunchedFile(projectHandle);
    expect(OS._loadProjectFile).toHaveBeenCalledWith(project, { handle: projectHandle });

    const image = { name: 'photo.png', type: 'image/png' };
    await OS._handleLaunchedFile({ getFile: vi.fn().mockResolvedValue(image) });
    expect(OS._handleFileLoad).toHaveBeenCalledWith(image);
    expect(OS.dismissWelcome).toHaveBeenCalledTimes(4);

    const unsupported = await OS._handleLaunchedFile({
      getFile: vi.fn().mockResolvedValue({ name: 'notes.txt', type: 'text/plain' })
    });
    expect(unsupported).toBe(false);
    expect(OS.toast).toHaveBeenCalledWith('Could not open launched file: Unsupported launched file type', 'error');
    delete window.launchQueue;
  });

  it('clears dirty and recovery state only after an acknowledged project write', async () => {
    const OS = loadOpenShop();
    const object = { name: 'Subject', type: 'rect' };
    OS.canvas = createCanvasMock([object]);
    OS.layers = [{ name: 'Subject', visible: true, locked: false, opacity: 100, blend: 'source-over', objects: [object] }];
    quietUiMethods(OS);
    OS._clearAutoSave = vi.fn().mockResolvedValue(true);
    OS.saveHistory('Edit subject');

    let finishClose;
    const writable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(() => new Promise((resolve) => { finishClose = resolve; })),
      abort: vi.fn()
    };
    OS._projectFileHandle = { createWritable: vi.fn().mockResolvedValue(writable) };

    const pending = OS.saveProject();
    await vi.waitFor(() => expect(writable.close).toHaveBeenCalled());
    expect(OS._isDirty).toBe(true);
    expect(OS._autoSaveDirty).toBe(true);
    expect(OS._clearAutoSave).not.toHaveBeenCalled();
    expect(document.getElementById('persistence-state-label').textContent).toBe('Saving…');

    finishClose();
    await expect(pending).resolves.toBe(true);

    expect(writable.write).toHaveBeenCalledWith(expect.stringContaining('"kind":"openshop-document"'));
    expect(OS._clearAutoSave).toHaveBeenCalledTimes(1);
    expect(OS._isDirty).toBe(false);
    expect(OS._autoSaveDirty).toBe(false);
    expect(OS._persistenceState).toBe('saved');
    expect(document.getElementById('persistence-state-label').textContent).toBe('All changes saved');
    expect(document.title).not.toMatch(/^\*/);
  });

  it('preserves dirty recovery state when a project write fails or is cancelled', async () => {
    const OS = loadOpenShop();
    const object = { name: 'Subject', type: 'rect' };
    OS.canvas = createCanvasMock([object]);
    OS.layers = [{ name: 'Subject', visible: true, locked: false, opacity: 100, blend: 'source-over', objects: [object] }];
    quietUiMethods(OS);
    OS._clearAutoSave = vi.fn().mockResolvedValue(true);
    OS.saveHistory('Edit subject');

    const writable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockRejectedValue(new Error('Disk full')),
      abort: vi.fn().mockResolvedValue(undefined)
    };
    OS._projectFileHandle = { createWritable: vi.fn().mockResolvedValue(writable) };

    await expect(OS.saveProject()).resolves.toBe(false);
    expect(writable.abort).toHaveBeenCalled();
    expect(OS._projectFileHandle).toBeNull();
    expect(OS._clearAutoSave).not.toHaveBeenCalled();
    expect(OS._isDirty).toBe(true);
    expect(OS._autoSaveDirty).toBe(true);
    expect(OS._persistenceState).toBe('error');
    expect(OS.toast).toHaveBeenCalledWith('Project save failed: Disk full', 'error');

    const cancelled = Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    window.showSaveFilePicker = vi.fn().mockRejectedValue(cancelled);
    await expect(OS.saveProject()).resolves.toBe(false);
    expect(OS._isDirty).toBe(true);
    expect(OS._persistenceState).toBe('dirty');
    expect(OS._clearAutoSave).not.toHaveBeenCalled();
  });

  it('keeps edits made during a project write dirty after the older snapshot commits', async () => {
    const OS = loadOpenShop();
    const object = { name: 'Subject', type: 'rect' };
    OS.canvas = createCanvasMock([object]);
    OS.layers = [{ name: 'Subject', visible: true, locked: false, opacity: 100, blend: 'source-over', objects: [object] }];
    quietUiMethods(OS);
    OS._clearAutoSave = vi.fn().mockResolvedValue(true);
    OS.saveHistory('First edit');

    let finishClose;
    const close = vi.fn(() => new Promise((resolve) => { finishClose = resolve; }));
    OS._projectFileHandle = {
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockResolvedValue(undefined),
        close,
        abort: vi.fn()
      })
    };

    const pending = OS.saveProject();
    await vi.waitFor(() => expect(close).toHaveBeenCalled());
    object.name = 'Newer Subject';
    OS.saveHistory('Newer edit');
    finishClose();
    await expect(pending).resolves.toBe(true);

    expect(OS._isDirty).toBe(true);
    expect(OS._autoSaveDirty).toBe(true);
    expect(OS._persistenceState).toBe('dirty');
    expect(OS._clearAutoSave).not.toHaveBeenCalled();
    expect(OS.toast).toHaveBeenCalledWith('Saved snapshot; newer edits remain unsaved', 'info');
  });

  it('waits for the worker acknowledgement before clearing autosave work', async () => {
    const OS = loadOpenShop();
    const object = { name: 'Subject', type: 'rect' };
    OS.canvas = createCanvasMock([object]);
    OS.layers = [{ name: 'Subject', visible: true, locked: false, opacity: 100, blend: 'source-over', objects: [object] }];
    quietUiMethods(OS);
    OS.saveHistory('Autosave edit');

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn().mockResolvedValue({
          getFileHandle: vi.fn().mockRejectedValue(new Error('Main-thread writable unavailable'))
        })
      }
    });
    let acknowledge;
    OS._writeAutoSaveWithWorker = vi.fn(() => new Promise((resolve) => { acknowledge = resolve; }));

    const pending = OS._autoSave();
    await vi.waitFor(() => expect(OS._writeAutoSaveWithWorker).toHaveBeenCalled());
    expect(OS._persistenceState).toBe('saving');
    expect(OS._autoSaveDirty).toBe(true);

    acknowledge(true);
    await expect(pending).resolves.toBe(true);
    expect(OS._autoSaveDirty).toBe(false);
    expect(OS._isDirty).toBe(true);
    expect(OS._persistenceState).toBe('dirty');

    OS._markDocumentDirty();
    OS._writeAutoSaveWithWorker = vi.fn().mockRejectedValue(new Error('Worker write failed'));
    await expect(OS._autoSave()).resolves.toBe(false);
    expect(OS._autoSaveDirty).toBe(true);
    expect(OS._isDirty).toBe(true);
    expect(OS._persistenceState).toBe('error');
  });
  it('refuses to autosave a hybrid document while a load is in flight', async () => {
    const OS = loadOpenShop();
    const object = { name: 'Subject', type: 'rect' };
    OS.canvas = createCanvasMock([object]);
    OS.layers = [{ name: 'Subject', visible: true, locked: false, opacity: 100, blend: 'source-over', objects: [object] }];
    quietUiMethods(OS);
    OS.canvasW = 800;
    OS.canvasH = 600;
    OS.saveHistory('Edit on the outgoing document');
    expect(OS._autoSaveDirty).toBe(true);

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn().mockResolvedValue({}) }
    });
    const capture = vi.spyOn(OS, '_captureDocumentState');
    OS._writeAutoSaveWithWorker = vi.fn().mockResolvedValue(true);

    // Image enliven can take seconds; hold the load at its first await.
    let finishLoad;
    OS.canvas.loadFromJSON = vi.fn(() => new Promise((resolve) => { finishLoad = resolve; }));

    const loading = OS._loadDocumentState({
      _openShop: { w: 1920, h: 1080 },
      objects: []
    }, { trusted: true }).catch(() => {});

    await vi.waitFor(() => expect(OS.canvas.loadFromJSON).toHaveBeenCalled());
    // canvasW/H already hold the incoming project; the canvas still holds the old one.
    expect(OS.canvasW).toBe(1920);
    expect(OS._documentLoadDepth).toBe(1);

    await expect(OS._autoSave()).resolves.toBe(false);
    expect(capture).not.toHaveBeenCalled();
    // The work stays queued rather than being dropped.
    expect(OS._autoSaveDirty).toBe(true);

    finishLoad({});
    await loading;
    expect(OS._documentLoadDepth).toBe(0);

    // With the load settled a capture is allowed again.
    OS._markDocumentDirty();
    await OS._autoSave();
    expect(capture).toHaveBeenCalled();
  });

  it('renames a contested document once and clears every generation in its lineage', async () => {
    const OS = loadOpenShop();
    const object = { name: 'Subject', type: 'rect' };
    OS.canvas = createCanvasMock([object]);
    OS.layers = [{ name: 'Subject', visible: true, locked: false, opacity: 100, blend: 'source-over', objects: [object] }];
    quietUiMethods(OS);
    OS.zoomFit = vi.fn();
    OS._documentId = 'document-contested';
    OS._getRecoveryTabId = () => 'this-tab';

    // A history snapshot embeds whichever id was live when it was taken.
    const snapshot = JSON.stringify(OS._captureDocumentState());

    const foreign = [{
      valid: true,
      documentId: 'document-contested',
      ownerId: 'other-tab',
      filename: 'recovery-document-contested-0.json',
      leaseExpiresAt: Date.now() + 60000
    }];

    expect(OS._ensureRecoveryOwnership(foreign)).toBe(true);
    const renamed = OS._documentId;
    expect(renamed).not.toBe('document-contested');
    expect(OS._documentIdAliases).toContain('document-contested');

    // Undo re-installs the snapshot. It must not re-claim the contested id.
    await OS._loadDocumentState(JSON.parse(snapshot), { trusted: true });
    expect(OS._documentId).toBe(renamed);

    // ...so the next autosave finds no foreign owner and does not rename again.
    expect(OS._ensureRecoveryOwnership(foreign)).toBe(false);
    expect(OS._documentId).toBe(renamed);
    expect(OS._documentIdAliases).toEqual(['document-contested']);

    // Save Project must clear the generations written under both ids.
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: vi.fn().mockResolvedValue({}) }
    });
    const generations = [
      { valid: true, legacy: false, documentId: 'document-contested', ownerId: 'this-tab', filename: 'recovery-old-0.json' },
      { valid: true, legacy: false, documentId: renamed, ownerId: 'this-tab', filename: 'recovery-new-0.json' },
      { valid: true, legacy: false, documentId: 'document-elsewhere', ownerId: 'this-tab', filename: 'recovery-other-0.json' }
    ];
    OS._listRecoveryGenerations = vi.fn().mockResolvedValue(generations);
    OS._discardRecovery = vi.fn().mockResolvedValue(true);
    OS._rewriteRecoveryIndex = vi.fn().mockResolvedValue(true);

    await expect(OS._clearAutoSave()).resolves.toBe(true);
    const cleared = OS._discardRecovery.mock.calls.map(([record]) => record.filename);
    expect(cleared).toEqual(['recovery-old-0.json', 'recovery-new-0.json']);
    // An unrelated document's recovery data is left alone.
    expect(OS._rewriteRecoveryIndex).toHaveBeenCalledWith([generations[2]]);
  });

  it('offers recovery with event-delegated buttons and restores or discards', async () => {
    const OS = loadOpenShop();
    const canvas = createCanvasMock();
    OS.canvas = canvas;
    quietUiMethods(OS);
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
    await vi.waitFor(() => expect(OS.toast).toHaveBeenCalledWith('Project restored from auto-save', 'success'));
    expect(canvas.loadFromJSON).toHaveBeenCalled();

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

  it('strips namespaced and mixed-case hrefs that the old guard let through', () => {
    const OS = loadOpenShop();

    // fabric emits image references as xlink:href — precisely the attribute the
    // dead '[xlink\:href]' selector was written to guard.
    const malicious = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <image xlink:href="javascript:alert(1)" width="10" height="10"/>
      <a href="JAVASCRIPT:alert(2)"><text>Upper</text></a>
      <a href="Data:text/html,evil"><text>Mixed</text></a>
      <a href="java	script:alert(3)"><text>Tabbed</text></a>
      <a href="vbscript:msgbox(4)"><text>Legacy</text></a>
      <image xlink:href="data:image/png;base64,AAAA" width="10" height="10"/>
      <use xlink:href="#shape"/>
      <a href="https://example.com/"><text>Fine</text></a>
    </svg>`;

    const clean = OS._sanitizeSVG(malicious);
    expect(clean).not.toMatch(/javascript/i);
    expect(clean).not.toMatch(/vbscript/i);
    expect(clean).not.toMatch(/data:text\/html/i);
    // Legitimate references survive, or export would silently lose content.
    expect(clean).toContain('data:image/png;base64,AAAA');
    expect(clean).toContain('#shape');
    expect(clean).toContain('https://example.com/');
  });

  it('breaks cyclic PSD group parents instead of dropping their layers', () => {
    const OS = loadOpenShop();

    // Reachable through a hand-edited or corrupted .openshop file: interchange
    // metadata round-trips through project JSON.
    const normalized = OS._normalizePSDInterchange({
      groups: [
        { id: 'self', name: 'Self Parent', parentId: 'self', order: 0 },
        { id: 'a', name: 'Ring A', parentId: 'b', order: 1 },
        { id: 'b', name: 'Ring B', parentId: 'a', order: 2 },
        { id: 'ok', name: 'Nested', parentId: 'self', order: 3 }
      ],
      warnings: []
    });

    const byId = new Map(normalized.groups.map(group => [group.id, group]));
    expect(byId.get('self').parentId).toBeNull();
    // One of the pair detaches; the other keeps a parent that now reaches root.
    expect(['a', 'b'].filter(id => byId.get(id).parentId === null)).toHaveLength(1);
    // A legitimate nesting is left alone.
    expect(byId.get('ok').parentId).toBe('self');
    expect(normalized.warnings.join(' ')).toMatch(/cycle/i);

    // Every group reaches the document root, so the PSD writer's root walk
    // emits all of them.
    for (const group of normalized.groups) {
      let current = group;
      let hops = 0;
      while (current.parentId && hops < 20) { current = byId.get(current.parentId); hops++; }
      expect(current.parentId).toBeNull();
    }
  });

  it('builds PSD export structure with correct layer metadata', () => {
    const OS = loadOpenShop();
    const boundary = {
      name: '__boundary__',
      visible: true,
      toCanvasElement: vi.fn(() => document.createElement('canvas')),
      left: 0,
      top: 0,
      opacity: 1,
      set(property, value) {
        this[property] = value;
      }
    };
    const photo = { name: 'Portrait', visible: true, toCanvasElement: vi.fn(() => document.createElement('canvas')), left: 10, top: 20, opacity: 0.8 };
    const canvas = createCanvasMock([boundary, photo]);
    OS.canvas = canvas;
    OS.canvasW = 400;
    OS.canvasH = 300;
    OS.layers = [
      { name: 'BG', visible: true, opacity: 100, blend: 'source-over', objects: [boundary] },
      {
        name: 'Subject',
        visible: true,
        opacity: 80,
        blend: 'multiply',
        psd: {
          sourceId: 'psd-0-0',
          parentId: 'psd-0',
          order: 0,
          sourceKind: 'bitmap',
          originalBlendMode: 'multiply',
          importedCanvasBlend: 'multiply'
        },
        objects: [photo]
      }
    ];
    OS._psdInterchange = {
      schemaVersion: 1,
      groups: [{
        id: 'psd-0',
        parentId: null,
        order: 0,
        name: 'Portraits',
        hidden: false,
        opacity: 0.75,
        blendMode: 'pass through',
        opened: false
      }],
      warnings: []
    };
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
    expect(writtenPsd.children[0]).toEqual(expect.objectContaining({
      name: 'Portraits',
      opacity: 0.75,
      blendMode: 'pass through',
      opened: false
    }));
    expect(writtenPsd.children[0].children).toHaveLength(1);
    expect(writtenPsd.children[0].children[0]).toEqual(expect.objectContaining({
      name: 'Subject',
      opacity: 0.8,
      blendMode: 'multiply'
    }));
    expect(clicks[0].download).toBe('openshop-export.psd');

    expect(OS._extractPSDColorProfile({ imageResources: { iccUntaggedProfile: new Uint8Array([4, 5, 6]) } })).toEqual(expect.objectContaining({
      sourceKind: 'psd',
      iccData: 'data:application/vnd.openshop.icc;base64,BAUG'
    }));

    delete globalThis.agPsd;
  });

  it('embeds and reads the PSD ICC profile resource without transforming pixels', () => {
    const OS = loadOpenShop();
    OS._colorProfile = {
      name: 'Fixture Display P3',
      sourceKind: 'embedded-icc',
      iccData: 'data:application/vnd.openshop.icc;base64,AAECAwQ='
    };
    const source = new Uint8Array(38);
    source.set([0x38, 0x42, 0x50, 0x53], 0);
    const sourceView = new DataView(source.buffer);
    sourceView.setUint16(4, 1, false);
    sourceView.setUint16(12, 3, false);
    sourceView.setUint32(14, 1, false);
    sourceView.setUint32(18, 1, false);
    sourceView.setUint16(22, 8, false);
    sourceView.setUint16(24, 3, false);
    sourceView.setUint32(26, 0, false);
    sourceView.setUint32(30, 0, false);
    sourceView.setUint32(34, 0, false);

    const embedded = OS._embedPSDICCProfile(source, OS._decodeProjectBytes(OS._colorProfile.iccData));
    expect([...OS._readPSDICCProfile(embedded)]).toEqual([0, 1, 2, 3, 4]);
    expect(OS._extractPSDColorProfile(null, embedded)).toEqual(expect.objectContaining({
      sourceKind: 'psd',
      iccData: 'data:application/vnd.openshop.icc;base64,AAECAwQ='
    }));
  });

  it('parses matrix ICC profiles, converts P3 pixels, and embeds the working profile in raster formats', async () => {
    const OS = loadOpenShop();
    const p3Bytes = OS._makeMatrixICCProfile('display-p3');
    const p3 = OS._parseICCProfile(p3Bytes);
    const srgb = OS._parseICCProfile(OS._makeMatrixICCProfile('srgb'));

    expect(p3).toEqual(expect.objectContaining({ name:'Display P3', colorSpace:'display-p3', valid:true }));
    expect(p3.matrix).toHaveLength(3);
    expect(p3.matrix[0]).toHaveLength(3);

    const source = new ImageData(new Uint8ClampedArray([64, 128, 150, 255, 180, 140, 120, 127]), 2, 1);
    const toSRGB = OS._convertImageDataColorProfile(source, p3, 'srgb');
    const backToP3 = OS._convertImageDataColorProfile(toSRGB.imageData, srgb, 'display-p3');
    expect(toSRGB).toMatchObject({ converted:true, conversion:'display-p3-to-srgb' });
    expect(backToP3.imageData.data[3]).toBe(255);
    expect(backToP3.imageData.data[7]).toBe(127);
    for (const index of [0, 1, 2, 4, 5, 6]) expect(Math.abs(backToP3.imageData.data[index] - source.data[index])).toBeLessThanOrEqual(2);

    const png = OS._concatByteArrays([
      new Uint8Array([137,80,78,71,13,10,26,10]),
      OS._makePNGChunk('IHDR', new Uint8Array([0,0,0,1,0,0,0,1,8,6,0,0,0])),
      OS._makePNGChunk('IEND', new Uint8Array())
    ]);
    const pngUrl = `data:image/png;base64,${OS._bytesToBase64(png)}`;
    const embeddedPng = OS._embedRasterICCDataUrl(pngUrl, 'png', p3Bytes);
    await expect(OS._readEmbeddedColorProfile(OS._dataUrlToBytes(embeddedPng), 'image/png')).resolves.toEqual(expect.objectContaining({
      name:'Display P3', colorSpace:'display-p3', sourceKind:'embedded-png'
    }));

    const jpeg = OS._concatByteArrays([new Uint8Array([0xFF, 0xD8]), new Uint8Array([0xFF, 0xD9])]);
    const jpegUrl = `data:image/jpeg;base64,${OS._bytesToBase64(jpeg)}`;
    expect(OS._readJPEGICCProfile(OS._dataUrlToBytes(OS._embedRasterICCDataUrl(jpegUrl, 'jpeg', p3Bytes)))).toEqual(p3Bytes);

    const webp = new Uint8Array([0x52,0x49,0x46,0x46,0x04,0x00,0x00,0x00,0x57,0x45,0x42,0x50]);
    const webpUrl = `data:image/webp;base64,${OS._bytesToBase64(webp)}`;
    expect(OS._readWebPICCProfile(OS._dataUrlToBytes(OS._embedRasterICCDataUrl(webpUrl, 'webp', p3Bytes))).bytes).toEqual(p3Bytes);
  });

  it('chooses one explicit PSD composite fallback for unsupported document-wide semantics', () => {
    const OS = loadOpenShop();
    const report = OS._analyzePSDImport({
      width: 100,
      height: 80,
      composite: { width: 100, height: 80, buffer: new ArrayBuffer(100 * 80 * 4) },
      children: [{
        id: 'psd-0',
        sourceKind: 'bitmap',
        name: 'Clipped glow',
        blendMode: 'normal',
        opacity: 1,
        unsupported: ['clipping', 'layer effects'],
        children: []
      }]
    });

    expect(report.flattenWholeDocument).toBe(true);
    expect(report.warnings[0]).toMatch(/one flattened appearance layer instead of duplicating the composite/);
    expect(report.warnings.join(' ')).toMatch(/clipping relationships are not supported/);
    expect(report.warnings.join(' ')).toMatch(/layer effects are not editable/);
  });

  it('wires modal close and action buttons via data attributes', () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS.saveHistory = vi.fn();
    OS._clearAutoSave = vi.fn();
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

describe('release metadata', () => {
  const read = (name) => readFileSync(join(process.cwd(), name), 'utf8');
  const { version, shellRevision } = readReleaseMetadata(process.cwd());

  it('ships no stray control bytes', () => {
    // A NUL that reached a comment once silently broke the CSP hash and the
    // app would not boot at all; the error names the policy, not the cause.
    // The test files are covered too: git and grep call a file with a NUL in it
    // binary, so a stray byte there hides every later diff and search hit.
    for (const name of [
      'index.html',
      'sw.js',
      'tools/security.mjs',
      'tests/server.mjs',
      'tests/os-unit.test.js',
      'tests/openshop.e2e.spec.js',
      'tests/offline.e2e.spec.js'
    ]) {
      const bytes = readFileSync(join(process.cwd(), name));
      const offenders = [];
      for (let i = 0; i < bytes.length; i += 1) {
        const byte = bytes[i];
        const printable = byte === 0x09 || byte === 0x0a || byte === 0x0d || byte >= 0x20;
        if (!printable) offenders.push(`${name}@${i}=0x${byte.toString(16)}`);
      }
      expect(offenders, `${name} control bytes`).toEqual([]);
    }
  });

  it('states one version everywhere a reader or a runtime can see it', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const [major, minor] = version.split('.');
    const short = `v${major}.${minor}`;

    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version, 'package-lock.json version').toBe(version);
    expect(lock.packages[''].version, 'package-lock.json root package version').toBe(version);

    const readme = read('README.md');
    expect(readme, 'README version badge').toContain(`badge/version-${version}-blue`);

    // The newest released heading, ignoring an open Unreleased section.
    const changelog = read('CHANGELOG.md');
    const released = changelog.match(/^## \[v?(\d+\.\d+\.\d+)\]/m);
    expect(released?.[1], 'newest released CHANGELOG heading').toBe(version);

    const html = read('index.html');
    expect(html, 'document <title>').toContain(`<title>OpenShop v${version} `);
    expect(html, 'logo accessible name').toContain(`aria-label="OpenShop version ${version}"`);
    expect(html, 'engine banner comment').toContain(`//  OpenShop v${version} `);
    expect(html, 'live document.title template').toContain(`— OpenShop v${version}\``);
    expect(html, 'topbar logo badge').toContain(`<span class="logo-version">${short}</span>`);
    // The first screen a new user sees. It said v0.21 on a v0.24 build because
    // this list was the drift gate and did not include it.
    expect(html, 'welcome screen badge').toContain(`<span>OpenShop</span><small>${short}</small>`);
    // Stamped into every saved project, recovery generation and exported
    // action, so a stale value misdates files long after the release.
    expect(html, 'OS.version constant').toContain(`\n    version: '${version}',`);

    // Nothing may reintroduce a hardcoded stamp beside the constant.
    const literalStamps = [...html.matchAll(/appVersion\s*:\s*'([^']+)'/g)].map(match => match[1]);
    expect(literalStamps, 'hardcoded appVersion literals').toEqual([]);
    // And no other version-shaped literal may disagree with package.json.
    const stale = [...html.matchAll(/OpenShop v(\d+\.\d+\.\d+)/g)]
      .map(match => match[1])
      .filter(found => found !== version);
    expect(stale, 'stale "OpenShop vX.Y.Z" strings').toEqual([]);

    // The offline shell keys its cache on the revision, so a stale one serves
    // the previous build forever.
    const swShellRevision = read('sw.js').match(/SHELL_REVISION = '([^']+)'/)?.[1];
    expect(swShellRevision, 'sw.js SHELL_REVISION').toBe(shellRevision);
    expect(shellRevision, 'release metadata shell revision').toMatch(new RegExp(`^${version.replace(/\./g, '\\.')}(-r\\d+)?$`));
    expect(read('tests/server.mjs'), 'tests/server.mjs productionRevision source').toContain('productionRevision = releaseMetadata.shellRevision');
    expect(read('tests/offline.e2e.spec.js'), 'offline spec productionRevision source').toContain('productionRevision = releaseMetadata.shellRevision');
    expect(read('sw.js'), 'sw.js current revision').toContain(`const SHELL_REVISION = '${shellRevision}';`);
  });
});

describe('history eviction, coalescing, and commit guards', () => {
  const primeHistory = (OS) => {
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS._captureDocumentState = vi.fn(() => ({ state: OS.__state ?? 'base' }));
    OS._initializeHistory('Baseline');
    return OS;
  };

  it('keeps the baseline snapshot correct when the history cap evicts entries', () => {
    const OS = primeHistory(loadOpenShop());
    OS.maxHistory = 3;

    for (let step = 1; step <= 5; step++) {
      OS.__state = `step-${step}`;
      OS.saveHistory(`Step ${step}`);
    }

    expect(OS.history).toHaveLength(3);
    expect(OS.history.map(entry => entry.action)).toEqual(['Step 3', 'Step 4', 'Step 5']);
    expect(OS.historyIdx).toBe(2);
    // The dropped entry's own snapshot becomes the new baseline, so undoing
    // all the way back still lands on a real document rather than null.
    expect(JSON.parse(OS._historyBaseSnapshot)).toEqual({ state: 'step-2' });
    expect(OS._historyBaseLabel).toBe('Step 2');
  });

  it('prefers a retained entry beforeSnapshot over the dropped snapshot as the new baseline', () => {
    const OS = primeHistory(loadOpenShop());
    OS.maxHistory = 2;

    OS.__state = 'a';
    OS.saveHistory('A');
    OS.__state = 'b';
    // A transaction records where it started, which is the truthful baseline
    // once the entry in front of it is evicted.
    OS._pushHistoryEntry('B', JSON.stringify({ state: 'b' }), { beforeSnapshot: JSON.stringify({ state: 'before-b' }) });
    OS.__state = 'c';
    OS.saveHistory('C');

    expect(OS.history.map(entry => entry.action)).toEqual(['B', 'C']);
    expect(JSON.parse(OS._historyBaseSnapshot)).toEqual({ state: 'before-b' });
  });


  it('evicts history on the byte budget, not just the entry count', () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS._captureDocumentState = vi.fn(() => ({ state: OS.__state ?? 'base' }));
    OS._initializeHistory('Baseline');

    // Well under the entry cap, so only the byte budget can evict here.
    OS.maxHistory = 60;
    OS.maxHistoryBytes = 4000;

    const bulk = 'x'.repeat(900);
    for (let step = 1; step <= 10; step++) {
      OS.__state = `${bulk}-${step}`;
      OS.saveHistory(`Step ${step}`);
    }

    expect(OS.history.length).toBeLessThan(10);
    expect(OS.historyByteSize()).toBeLessThanOrEqual(OS.maxHistoryBytes);
    // The cursor still points at the newest entry after eviction.
    expect(OS.historyIdx).toBe(OS.history.length - 1);
    expect(OS.history.at(-1).action).toBe('Step 10');
    // The baseline tracks the entry that fell off the front.
    expect(OS._historyBaseLabel).toBe(`Step ${10 - OS.history.length}`);
  });

  it('never empties the history even when one entry exceeds the whole budget', () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS._captureDocumentState = vi.fn(() => ({ state: OS.__state ?? 'base' }));
    OS._initializeHistory('Baseline');
    OS.maxHistoryBytes = 10;

    OS.__state = 'y'.repeat(5000);
    OS.saveHistory('Huge');
    OS.__state = 'z'.repeat(5000);
    OS.saveHistory('Huge 2');

    // Undo has to remain possible, so the newest entry is kept regardless.
    expect(OS.history).toHaveLength(1);
    expect(OS.history[0].action).toBe('Huge 2');
    expect(OS.historyIdx).toBe(0);
  });

  it('leaves history alone when the byte budget is disabled', () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS._captureDocumentState = vi.fn(() => ({ state: OS.__state ?? 'base' }));
    OS._initializeHistory('Baseline');
    OS.maxHistory = 60;
    OS.maxHistoryBytes = 0;

    const bulk = 'x'.repeat(900);
    for (let step = 1; step <= 10; step++) {
      OS.__state = `${bulk}-${step}`;
      OS.saveHistory(`Step ${step}`);
    }

    expect(OS.history).toHaveLength(10);
  });

  it('maintains cached history bytes without rescanning stable entries', () => {
    const OS = primeHistory(loadOpenShop());
    OS.maxHistory = 60;
    OS.maxHistoryBytes = 0;
    const entrySize = vi.spyOn(OS, '_historyEntryByteSize');

    for (let step = 1; step <= 4; step++) {
      OS.__state = `cached-${step}`;
      OS.saveHistory(`Cached ${step}`);
    }

    const callsBeforeRead = entrySize.mock.calls.length;
    const expected = OS.history.reduce((total, entry) => total + entry.byteSize, 0);
    expect(OS._historyByteTotal).toBe(expected);
    expect(OS.historyByteSize()).toBe(expected);
    expect(entrySize).toHaveBeenCalledTimes(callsBeforeRead);

    // Replacing the array is how a restored or branched history arrives; the
    // first read rebuilds the cache once, then subsequent reads stay O(1).
    OS.history = OS.history.slice();
    expect(OS.historyByteSize()).toBe(expected);
    const callsAfterRebuild = entrySize.mock.calls.length;
    expect(OS.historyByteSize()).toBe(expected);
    expect(entrySize).toHaveBeenCalledTimes(callsAfterRebuild);
  });

  it('bounds pixel reconstruction with periodic history checkpoints', () => {
    const OS = primeHistory(loadOpenShop());
    OS._historyCheckpointInterval = 4;
    const pixels = {
      'image-1': { width:2, height:2, tiles:{ '0:0': { width:2, height:2, data:'tile', hash:123 } } }
    };
    OS._historyBasePixelState = pixels;
    OS._historyPixelState = pixels;

    for (let step = 1; step <= 11; step++) {
      OS.__state = `checkpoint-${step}`;
      OS.saveHistory(`Checkpoint ${step}`);
    }

    expect(OS.history[3].pixelCheckpoint).toEqual(pixels);
    expect(OS.history[7].pixelCheckpoint).toEqual(pixels);
    const applyDelta = vi.spyOn(OS, '_applyHistoryPixelDelta');
    expect(OS._historyPixelsForIndex(10)).toEqual(pixels);
    expect(applyDelta).toHaveBeenCalledTimes(3);
    expect(OS._historyReconstructionMetrics).toMatchObject({ checkpointIndex:7, deltaSteps:3 });
  });

  it('coalesces same-key entries while keeping the original pre-coalesce state', () => {
    const OS = primeHistory(loadOpenShop());

    // Give the first entry a real pre-drag snapshot so its survival through
    // the coalesce is observable rather than vacuously null.
    const preDrag = JSON.stringify({ state: 'before-drag' });
    OS._pushHistoryEntry('Opacity', JSON.stringify({ state: 'slider-1' }), {
      coalesceKey: 'opacity:layer-1', beforeSnapshot: preDrag
    });
    const firstBefore = OS.history[0].beforeSnapshot;
    expect(firstBefore).toBe(preDrag);
    OS.__state = 'slider-2';
    OS.saveHistory('Opacity', { coalesceKey: 'opacity:layer-1' });
    OS.__state = 'slider-3';
    OS.saveHistory('Opacity', { coalesceKey: 'opacity:layer-1' });

    // Three drags of one slider are one undo step, not three.
    expect(OS.history).toHaveLength(1);
    expect(JSON.parse(OS.history[0].snapshot)).toEqual({ state: 'slider-3' });
    expect(OS.history[0].beforeSnapshot).toBe(firstBefore);

    // A different key starts a new entry rather than folding in.
    OS.__state = 'other';
    OS.saveHistory('Opacity', { coalesceKey: 'opacity:layer-2' });
    expect(OS.history).toHaveLength(2);
  });

  it('stores raster edits as dirty tile deltas and reconstructs the image source on restore', () => {
    const OS = primeHistory(loadOpenShop());
    const makeTile = values => ({ width:2, height:1, data:OS._encodeHistoryBytes(new Uint8Array(values)) });
    const beforePixels = { 'image-1': { width:2, height:1, tiles: { '0:0': makeTile([10,20,30,255,40,50,60,255]) } } };
    const afterPixels = { 'image-1': { width:2, height:1, tiles: { '0:0': makeTile([110,120,130,255,140,150,160,255]) } } };
    const documentState = {
      kind:'openshop-document',
      canvas:{ fabric:{ objects:[{ type:'image', _openShopObjectId:'image-1', src:'data:image/png;base64,FULL' }] } }
    };
    OS._historyBasePixelState = beforePixels;
    OS._historyPixelState = beforePixels;
    OS._historyCursorSnapshot = JSON.stringify({ state:'baseline' });
    OS._captureHistoryPixelSurfaces = vi.fn(() => afterPixels);
    OS._captureDocumentState = vi.fn(() => documentState);
    OS._pushHistoryEntry('Paint', JSON.stringify(documentState));

    const entry = OS.history[0];
    expect(JSON.parse(entry.snapshot).canvas.fabric.objects[0].src).toBeNull();
    expect(entry.pixelDelta.changes).toHaveLength(1);
    expect(OS._historyPixelsForIndex(0)).toEqual(afterPixels);

    OS._historySurfaceDataUrl = vi.fn(() => 'data:image/png;base64,REBUILT');
    const restored = JSON.parse(OS._materializeHistorySnapshot(entry.snapshot, 0));
    expect(restored.canvas.fabric.objects[0].src).toBe('data:image/png;base64,REBUILT');
  });

  it('does not capture raster pixels for metadata history entries', () => {
    const OS = primeHistory(loadOpenShop());
    OS._captureHistoryPixelSurfaces = vi.fn(() => ({}));

    OS.__state = 'renamed';
    expect(OS.saveHistory('Rename Layer')).toBe(true);
    expect(OS._captureHistoryPixelSurfaces).not.toHaveBeenCalled();
    expect(OS.history[0].pixelEdit).toBe(false);

    OS.__state = 'painted';
    expect(OS.saveHistory('Paint', { pixelEdit:true })).toBe(true);
    expect(OS._captureHistoryPixelSurfaces).toHaveBeenCalledTimes(1);
    expect(OS._captureHistoryPixelSurfaces).toHaveBeenCalledWith({ dirtyRects:null });
    expect(OS.history[1].pixelEdit).toBe(true);
  });

  it('reads only dirty tiles and reuses matching hashes without re-encoding them', () => {
    const OS = loadOpenShop();
    const source = document.createElement('canvas');
    source.width = 128; source.height = 128;
    source.getContext('2d').fillRect(0, 0, 128, 128);
    const image = {
      type:'image',
      _openShopObjectId:'image-dirty',
      width:128,
      height:128,
      getElement:() => source
    };
    const otherImage = {
      ...image,
      _openShopObjectId:'image-untouched',
      getElement:() => source
    };
    OS.canvas = createCanvasMock([image, otherImage]);
    OS._historyTileSize = 64;
    const initial = OS._captureHistoryPixelSurfaces({ forceFull:true });
    OS._historyPixelState = initial;
    OS._historyBasePixelState = initial;
    const encode = vi.spyOn(OS, '_encodeHistoryBytes');

    const next = OS._captureHistoryPixelSurfaces({
      dirtyRects:{ 'image-dirty': [{ x:0, y:0, width:2, height:2 }] }
    });

    expect(next).toEqual(initial);
    expect(OS._historyCaptureMetrics).toMatchObject({ mode:'dirty', tilesRead:1, tilesReused:8, tilesEncoded:0 });
    expect(encode).not.toHaveBeenCalled();
  });

  it('discards a filter result when the document moved on, without touching the canvas', () => {
    const OS = loadOpenShop();
    const active = { name: 'Photo', type: 'image' };
    const canvas = createCanvasMock([active]);
    canvas.setActiveObject(active);
    OS.canvas = canvas;
    quietUiMethods(OS);
    OS.toast = vi.fn();
    OS._replaceActiveImage = vi.fn();

    const info = {
      active,
      canvas: { width: 1, height: 1, toDataURL: () => 'data:image/png;base64,AA' },
      ctx: { putImageData: vi.fn() },
      imgData: { data: new Uint8ClampedArray(4), width: 1, height: 1 },
      editGuard: {
        generation: OS._documentGeneration,
        revision: OS._documentRevision,
        targetId: OS._ensureObjectId(active)
      }
    };

    OS._documentRevision += 1;
    const committed = OS._commitImageData(info, 'Posterize');

    return Promise.resolve(committed).then(result => {
      expect(result).toBe(false);
      expect(OS._replaceActiveImage).not.toHaveBeenCalled();
      expect(info.ctx.putImageData).not.toHaveBeenCalled();
      expect(canvas.getObjects()).toEqual([active]);
      expect(OS.toast).toHaveBeenCalledWith(
        'Filter result discarded because the document or target layer changed',
        'info'
      );
    });
  });

  it('rejects a commit whose target was removed from the canvas', async () => {
    const OS = loadOpenShop();
    const active = { name: 'Photo', type: 'image' };
    const canvas = createCanvasMock([active]);
    canvas.setActiveObject(active);
    OS.canvas = canvas;
    quietUiMethods(OS);
    OS.toast = vi.fn();
    OS._replaceActiveImage = vi.fn();

    const guard = {
      generation: OS._documentGeneration,
      revision: OS._documentRevision,
      targetId: OS._ensureObjectId(active)
    };
    canvas.remove(active);

    const result = await OS._commitImageData({
      active,
      canvas: { width: 1, height: 1, toDataURL: () => 'data:image/png;base64,AA' },
      ctx: { putImageData: vi.fn() },
      imgData: { data: new Uint8ClampedArray(4), width: 1, height: 1 },
      editGuard: guard
    }, 'Posterize');

    // The weaker of the three old guards let this through and left the next
    // stage to reject it with a different message.
    expect(result).toBe(false);
    expect(OS._replaceActiveImage).not.toHaveBeenCalled();
  });

  it('rejects every pending filter job and reports it when the worker crashes', async () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    quietUiMethods(OS);
    OS.toast = vi.fn();

    const listeners = {};
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      addEventListener: (type, handler) => { listeners[type] = handler; }
    };
    OS._getFilterWorker = () => worker;

    const imgData = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    const pending = OS._runFilterJob({ backend: 'worker', op: 'sharpen' }, imgData, 1, 1, {});

    expect(typeof listeners.error).toBe('function');
    listeners.error({ message: 'worker exploded' });

    await expect(pending).rejects.toBeDefined();
    // The callback registry must not leak the dead job.
    expect(OS._filterJobCallbacks).toEqual({});
  });
});

describe('raster metadata policy', () => {
  it('parses EXIF and XMP, preserves selected fields, and strips location by default', () => {
    const OS = loadOpenShop();
    const exif = new Uint8Array(128);
    exif.set([69, 120, 105, 102, 0, 0], 0);
    const exifView = new DataView(exif.buffer);
    exifView.setUint16(6, 0x4949, false);
    exifView.setUint16(8, 42, true);
    exifView.setUint32(10, 8, true);
    exifView.setUint16(14, 4, true);
    const entry = (index, tag, type, length, value) => {
      const offset = 16 + index * 12;
      exifView.setUint16(offset, tag, true);
      exifView.setUint16(offset + 2, type, true);
      exifView.setUint32(offset + 4, length, true);
      exifView.setUint32(offset + 8, value, true);
    };
    entry(0, 0x0112, 3, 1, 6);
    entry(1, 0x010F, 2, 5, 80);
    entry(2, 0x0110, 2, 6, 85);
    entry(3, 0x8825, 4, 1, 96);
    exif.set([79, 112, 101, 110, 0], 86);
    exif.set([67, 97, 109, 101, 114, 97, 0], 91);
    exifView.setUint16(102, 0, true);
    const xmp = new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><dc:title>Travel photo</dc:title><exif:GPSLatitude>1,2,3</exif:GPSLatitude></x:xmpmeta>');
    const app1 = payload => new Uint8Array([0xFF, 0xE1, (payload.length + 2) >>> 8, (payload.length + 2) & 0xFF, ...payload]);
    const jpeg = new Uint8Array([0xFF, 0xD8, ...app1(xmp), ...app1(exif.slice(0, 103)), 0xFF, 0xD9]);

    const metadata = OS._readImageMetadata(jpeg, 'image/jpeg');
    expect(metadata.exif).toMatchObject({ orientation:6, make:'Open', model:'Camera', hasGps:true });
    expect(metadata.xmp).toMatchObject({ title:'Travel photo', hasLocation:true });
    OS._imageMetadata = metadata;

    const stripped = OS._applyRasterMetadata(`data:image/jpeg;base64,${OS._bytesToBase64(jpeg)}`, 'jpeg', 'strip-location');
    const strippedMetadata = OS._readImageMetadata(OS._dataUrlToBytes(stripped.dataUrl), 'image/jpeg');
    expect(stripped.action).toBe('preserved-selected');
    expect(strippedMetadata.exif).toMatchObject({ make:'Open', model:'Camera', hasGps:false });
    expect(strippedMetadata.xmp).toMatchObject({ title:'Travel photo', hasLocation:false });

    const preserved = OS._applyRasterMetadata(`data:image/jpeg;base64,${OS._bytesToBase64(jpeg)}`, 'jpeg', 'preserve');
    const preservedMetadata = OS._readImageMetadata(OS._dataUrlToBytes(preserved.dataUrl), 'image/jpeg');
    expect(preservedMetadata.exif.hasGps).toBe(true);
    expect(preservedMetadata.xmp.hasLocation).toBe(true);

    const removed = OS._applyRasterMetadata(`data:image/jpeg;base64,${OS._bytesToBase64(jpeg)}`, 'jpeg', 'strip');
    expect(removed.action).toBe('stripped-all');
    expect(removed.dataUrl).toContain('data:image/jpeg;base64,');
    expect(OS._readImageMetadata(OS._dataUrlToBytes(removed.dataUrl), 'image/jpeg').exif).toBeNull();
  });
});

describe('component treatment', () => {
  const source = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
  const fullCss = source.slice(source.indexOf('<style>'), source.lastIndexOf('</style>'));
  // The forced-colors block deliberately swaps the accent scale for system
  // colours, so the "one accent-tinted hover treatment" rules below do not
  // describe it. It gets its own assertions instead.
  const forcedColorsStart = fullCss.indexOf('@media(forced-colors:active)');
  const css = forcedColorsStart >= 0 ? fullCss.slice(0, forcedColorsStart) : fullCss;

  it('draws one slider thumb, in both engines', () => {
    const thumbs = [...css.matchAll(/([^\n{}]*::-(?:webkit-slider|moz-range)-thumb)\s*\{([^}]*)\}/g)]
      .map(([, selector, body]) => ({ selector: selector.trim(), body }));
    const sized = thumbs.filter(rule => /width:/.test(rule.body));

    // One design per engine. Three used to coexist, and Firefox kept the
    // pre-redesign thumb everywhere because only the -webkit- rule was restyled.
    expect(sized).toHaveLength(2);
    expect(sized.map(rule => rule.selector)).toEqual([
      'input[type="range"]::-webkit-slider-thumb',
      'input[type="range"]::-moz-range-thumb'
    ]);
    const dimensions = sized.map(rule => rule.body.match(/width:([^;]+);\s*height:([^;]+);/).slice(1, 3).join('x'));
    expect(new Set(dimensions).size).toBe(1);
    const background = sized.map(rule => rule.body.match(/background:([^;]+);/)[1]);
    expect(new Set(background).size).toBe(1);

    // Each vendor pseudo-element needs its own rule: an unknown pseudo in a
    // selector list invalidates the list for every engine.
    expect(css).not.toMatch(/::-webkit-slider-thumb[^{]*,[^{]*::-moz-range-thumb/);
  });

  it('animates named properties from a small set of duration tokens', () => {
    // `transition:all` animates layout-affecting properties too.
    expect(css).not.toMatch(/transition:\s*all\b/);
    expect(css).toMatch(/--transition-chrome:/);
    expect(css).toMatch(/--dur-fast:/);
    expect(css).toMatch(/--radius-sm:/);
  });

  it('gives menu-like rows one hover treatment and stops hover from overlapping siblings', () => {
    const hover = selector => [...css.matchAll(new RegExp(`${selector}:hover\\s*\\{([^}]*)\\}`, 'g'))]
      .map(([, body]) => body);
    // Neutral for the menu bar, accent-tinted for dropdown rows and
    // --accent-dim for the context menu: three systems for one kind of control.
    expect(hover('\\.menu-item').every(body => /accent/.test(body))).toBe(true);
    expect(hover('\\.dd-item').every(body => /accent/.test(body))).toBe(true);
    expect(hover('\\.ctx-item').every(body => /accent/.test(body))).toBe(true);

    // A scaled swatch tucks under the swatches after it without this.
    expect(hover('\\.color-swatch')[0]).toMatch(/z-index:2/);
    expect(hover('\\.palette-swatch')[0]).toMatch(/z-index:2/);
    expect(css).toMatch(/\.color-swatch\{width:24px;height:24px/);
    expect(css).toMatch(/\.palette-swatch\{width:24px;height:24px/);
    // The active frame is marked with a ring rather than a scale that
    // overlapped its flex siblings.
    expect(css).toMatch(/\.frame-thumb\.active\{[^}]*\}/);
    expect(css.match(/\.frame-thumb\.active\{([^}]*)\}/)[1]).not.toMatch(/scale\(/);

    // In forced colours those same rows follow the system palette instead,
    // and the canvas opts out so the artwork is not repainted by the OS.
    expect(forcedColorsStart).toBeGreaterThan(0);
    const forced = fullCss.slice(forcedColorsStart);
    expect(forced).toMatch(/\.dd-item:hover/);
    expect(forced).toMatch(/background:Highlight/);
    expect(forced).toMatch(/forced-color-adjust:none/);
    expect(forced).toMatch(/backdrop-filter:none!important/);
  });

  it('uses the radius scale for the components that had drifted', () => {
    const radiusOf = selector => (css.match(new RegExp(`${selector}\\s*\\{[^}]*border-radius:([^;}]+)`)) || [])[1];
    expect(radiusOf('\\.btn')).toBe('var(--radius-sm)');
    expect(radiusOf('\\.preset-btn')).toBe('var(--radius-sm)');
    expect(radiusOf('\\.tool-btn')).toBe('var(--radius-md)');
    expect(radiusOf('\\.modal')).toBe('var(--radius-lg)');
    expect(radiusOf('\\.filter-panel')).toBe('var(--radius-lg)');
    // ...including every later override, which is how they drifted apart.
    expect(css).not.toMatch(/\.modal\{border-radius:14px\}/);
  });
});
