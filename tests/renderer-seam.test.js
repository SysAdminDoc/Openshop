import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCanvasMock,
  loadOpenShop,
  mountEditorDom,
  quietUiMethods
} from './os-harness.js';

describe('OpenShop renderer-agnostic document seam', () => {
  beforeEach(() => {
    localStorage.clear();
    mountEditorDom();
  });

  function createDocument() {
    const OS = loadOpenShop();
    const object = { name: 'Subject', type: 'rect', left: 12, top: 18 };
    OS.canvas = createCanvasMock([object]);
    OS.canvas.viewportTransform = [1.5, 0, 0, 1.5, 24, 18];
    OS.layers = [{
      id: 'layer-1',
      name: 'Layer 1',
      visible: true,
      locked: false,
      opacity: 100,
      blend: 'source-over',
      objects: [object]
    }];
    OS.activeLayerIdx = 0;
    OS.canvasW = 320;
    OS.canvasH = 240;
    OS._documentId = 'document-1';
    OS._docName = 'Scene fixture';
    OS._blankWorkspace = false;
    quietUiMethods(OS);
    return OS;
  }

  it('captures a plain document scene without exposing Fabric objects', () => {
    const OS = createDocument();
    const scene = OS._captureDocumentScene();

    expect(scene).toMatchObject({
      kind: 'openshop-scene',
      schemaVersion: 1,
      document: { id: 'document-1', name: 'Scene fixture' },
      canvas: { width: 320, height: 240 }
    });
    expect(scene.nodes).toHaveLength(1);
    expect(scene.nodes[0].attributes).toEqual(expect.objectContaining({ type: 'rect' }));
    expect(scene.nodes[0].attributes).not.toBe(OS.canvas.getObjects()[0]);
    expect(scene).not.toHaveProperty('fabric');
  });

  it('keeps preview and export adapters separate while preserving viewport state', () => {
    const OS = createDocument();
    const scene = OS._captureDocumentScene();
    const before = OS.canvas.viewportTransform.slice();

    const preview = OS.renderDocumentScene(scene, { target: 'preview' });
    const exported = OS.renderDocumentScene(scene, { target: 'export', format: 'png' });

    expect(preview.adapter).toBe('fabric-preview');
    expect(exported.adapter).toBe('fabric-export');
    expect(exported.dataUrl).toMatch(/^data:image\/png/);
    expect(OS.canvas.viewportTransform).toEqual(before);
    expect(OS.canvas.renderAll).toHaveBeenCalled();
  });

  it('asserts deterministic parity against the reference scene adapter', () => {
    const OS = createDocument();
    const scene = OS._captureDocumentScene();
    const reference = OS.renderDocumentScene(scene, { target: 'reference' });
    const preview = OS.renderDocumentScene(scene, { target: 'preview' });

    expect(preview.sceneFingerprint).toBe(reference.sceneFingerprint);
    expect(reference.nodeCount).toBe(scene.nodes.length);
  });

  it('publishes renderer capabilities and fallback paths through the AI report', () => {
    const OS = createDocument();
    const report = OS.aiBackendReport().renderer;

    expect(report).toMatchObject({
      contract:'openshop-render-v1',
      capabilities:{
        transferControlToOffscreen:false,
        offscreenCanvasWorker:false,
        offscreenFilter:false
      },
      paths:{ preview:'fabric-main-thread', filter:'filter-worker' }
    });
  });

  it('maps supported Fabric filters to the worker pipeline and keeps unknown filters on fallback', () => {
    const OS = createDocument();
    expect(OS._offscreenFilterSpecs([
      { type:'Brightness', brightness:0.2 },
      { type:'Contrast', contrast:-0.1 },
      { type:'Pixelate', blocksize:6 }
    ])).toEqual([
      { op:'brightness', params:{ value:0.2 } },
      { op:'contrast', params:{ value:-0.1 } },
      { op:'pixelate', params:{ blocksize:6 } }
    ]);
    expect(OS._offscreenFilterSpecs([{ type:'Noise', noise:10 }])).toBeNull();
  });

  it('routes an opted-in filter operation through the OffscreenCanvas worker seam', async () => {
    const OS = createDocument();
    OS.renderer.capabilities.offscreenFilter = true;
    OS._runFilterJob = vi.fn().mockResolvedValue('offscreen-result');

    await expect(OS._runOffscreenFilterInWorker(
      'pipeline',
      { data:new Uint8ClampedArray([10,20,30,255]) },
      1,
      1,
      { filters:[{ op:'brightness', params:{ value:0.2 } }] }
    )).resolves.toBe('offscreen-result');
    expect(OS._runFilterJob).toHaveBeenCalledWith(
      { backend:'offscreen', op:'pipeline' },
      expect.anything(),
      1,
      1,
      { filters:[{ op:'brightness', params:{ value:0.2 } }] }
    );
  });
});
