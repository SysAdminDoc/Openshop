import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, '..', 'index.html');

export function loadOpenShop() {
  delete globalThis.OS;
  const html = readFileSync(indexPath, 'utf8');
  const start = html.indexOf('const OS = {');
  const tail = html.slice(start);
  const endMatch = tail.search(/\r?\n};\r?\n\r?\nwindow\.addEventListener/);
  if (start === -1 || endMatch === -1) {
    throw new Error('Could not locate OS object in index.html');
  }
  const end = start + endMatch;
  const source = html
    .slice(start, end + 3)
    .replace('const OS =', 'globalThis.OS =');
  new Function(source)();
  return globalThis.OS;
}

export function installFabricMock() {
  class Brush {
    constructor(canvas) {
      this.canvas = canvas;
      this.color = '#000000';
      this.width = 1;
    }
  }

  globalThis.fabric = {
    PencilBrush: Brush,
    SprayBrush: class extends Brush {},
    Shadow: class {
      constructor(options) {
        Object.assign(this, options);
      }
    },
    ActiveSelection: class {
      constructor(objects, options = {}) {
        this.type = 'activeSelection';
        this._objects = objects;
        Object.assign(this, options);
      }

      forEachObject(callback) {
        this._objects.forEach(callback);
      }
    }
  };
}

export function createCanvasMock(initialObjects = []) {
  const objects = [...initialObjects];
  let activeObject = null;
  const canvas = {
    objects,
    width: 800,
    height: 600,
    isDrawingMode: false,
    selection: false,
    defaultCursor: 'default',
    hoverCursor: 'default',
    viewportTransform: [1, 0, 0, 1, 0, 0],
    add: vi.fn((object) => {
      objects.push(object);
    }),
    remove: vi.fn((object) => {
      const index = objects.indexOf(object);
      if (index >= 0) objects.splice(index, 1);
    }),
    renderAll: vi.fn(),
    requestRenderAll: vi.fn(),
    forEachObject: vi.fn((callback) => {
      objects.forEach(callback);
    }),
    getObjects: vi.fn(() => objects),
    getActiveObject: vi.fn(() => activeObject),
    setActiveObject: vi.fn((object) => {
      activeObject = object;
    }),
    discardActiveObject: vi.fn(() => {
      activeObject = null;
    }),
    toJSON: vi.fn(() => ({ objects: objects.map(({ name, type }) => ({ name, type })) })),
    loadFromJSON: vi.fn((_json, callback) => {
      if (callback) callback();
    }),
    toDataURL: vi.fn(({ format = 'png' } = {}) => `data:image/${format};base64,TEST`),
    zoomToPoint: vi.fn(),
    setViewportTransform: vi.fn((transform) => {
      canvas.viewportTransform = transform;
    }),
    setWidth: vi.fn(),
    setHeight: vi.fn()
  };
  return canvas;
}

export function mountEditorDom() {
  const optionIds = [
    'opt-select',
    'opt-brush',
    'opt-spray',
    'opt-clone',
    'opt-healing',
    'opt-dodge',
    'opt-burn',
    'opt-sponge',
    'opt-smudge',
    'opt-shape',
    'opt-polygon',
    'opt-star',
    'opt-pen',
    'opt-text',
    'opt-gradient',
    'opt-pattern',
    'opt-marquee',
    'opt-wand',
    'opt-lasso',
    'opt-measure',
    'opt-crop'
  ];
  const tools = ['select', 'brush', 'eraser', 'crop', 'marquee-rect', 'magic-wand'];

  document.body.innerHTML = `
    <div id="toolbar">
      ${tools.map((tool) => `<button class="tool-btn" data-tool="${tool}"></button>`).join('')}
    </div>
    <div id="tool-options">
      ${optionIds.map((id) => `<div class="opt-group" id="${id}" style="display:none"></div>`).join('')}
    </div>
    <div id="lasso-overlay" style="display:none"><svg><polygon points=""></polygon></svg></div>
    <div id="pen-overlay" style="display:none"></div>
    <div id="measure-overlay" style="display:none"></div>
    <div id="tool-display"></div>
    <div id="layers-list"></div>
    <input id="layer-opacity" value="100">
    <span id="layer-opacity-val"></span>
    <select id="layer-blend"><option value="source-over"></option></select>
    <div id="history-list"></div>
    <div id="object-count"></div>
    <div id="toast-container"></div>
    <span id="brush-size-val"></span>
    <span id="zoom-display"></span>
    <div id="panels"></div>
  `;
}

export function quietUiMethods(OS) {
  OS.updateInfoPanel = vi.fn();
  OS.updateLayersPanel = vi.fn();
  OS.updateHistoryPanel = vi.fn();
  OS.updateStatus = vi.fn();
  OS.updateMinimap = vi.fn();
  OS.updateHistogram = vi.fn();
  OS.recordMacroStep = vi.fn();
  OS.drawGrid = vi.fn();
  OS.drawRulers = vi.fn();
  OS._drawPixelGrid = vi.fn();
  OS.cancelCrop = vi.fn();
  OS.toast = vi.fn();
}
