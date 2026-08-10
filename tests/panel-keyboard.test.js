import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  createCanvasMock,
  installFabricMock,
  loadOpenShop,
  mountEditorDom
} from './os-harness.js';

function layer(name) {
  return { id:name.toLowerCase(), name, visible:true, locked:false, opacity:100, blend:'source-over', kind:'pixel', objects:[] };
}

function prepare(OS) {
  OS.canvas = createCanvasMock();
  OS.layers = [layer('Bottom'), layer('Middle'), layer('Top')];
  OS.activeLayerIdx = 1;
  OS._enforceLayerInvariants = vi.fn();
  OS._renderAccessibilityTree = vi.fn();
  OS.updateInfoPanel = vi.fn();
  OS.saveHistory = vi.fn();
  OS.toast = vi.fn();
  OS.updateLayersPanel();
  return OS;
}

beforeEach(() => {
  installFabricMock();
  mountEditorDom();
});

describe('Layers and History listbox keyboard contracts', () => {
  test('gives colour grids roving focus, activation, and a keyboard context path', () => {
    const colorGrid = document.createElement('div');
    colorGrid.id = 'color-swatches';
    document.body.appendChild(colorGrid);
    const defaultPalette = document.getElementById('palette-default');

    const OS = loadOpenShop();
    OS.setFgColor = vi.fn();
    OS.setBgColor = vi.fn();
    OS.initSwatches();
    OS.initDefaultPalette();

    const cells = [...colorGrid.querySelectorAll('[role="gridcell"]')];
    expect(colorGrid.getAttribute('role')).toBe('grid');
    expect(cells).toHaveLength(28);
    expect(cells.filter(cell => cell.tabIndex === 0)).toHaveLength(1);
    expect(cells[0].getAttribute('aria-rowindex')).toBe('1');
    expect(cells[0].getAttribute('aria-colindex')).toBe('1');

    cells[0].focus();
    cells[0].dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowRight', bubbles:true }));
    expect(document.activeElement).toBe(cells[1]);
    cells[1].dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
    expect(OS.setFgColor).toHaveBeenCalledWith('#333333');

    cells[1].dispatchEvent(new KeyboardEvent('keydown', { key:'ContextMenu', bubbles:true, cancelable:true }));
    expect(OS.setBgColor).toHaveBeenCalledWith('#333333');

    const paletteCells = [...defaultPalette.querySelectorAll('[role="gridcell"]')];
    expect(defaultPalette.getAttribute('role')).toBe('grid');
    expect(paletteCells.filter(cell => cell.tabIndex === 0)).toHaveLength(1);
    expect(paletteCells[0].getAttribute('aria-label')).toBe('Palette color #ffffff');
  });

  test('uses an active descendant and selects layers with navigation keys', () => {
    const OS = prepare(loadOpenShop());
    const list = document.getElementById('layers-list');
    expect(list.tabIndex).toBe(0);
    expect(list.getAttribute('aria-activedescendant')).toBe('openshop-layer-option-1');
    expect(list.querySelectorAll('[role="option"]')[0].getAttribute('aria-posinset')).toBe('1');

    list.focus();
    list.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowDown', bubbles:true }));
    expect(OS.activeLayerIdx).toBe(0);
    expect(list.getAttribute('aria-activedescendant')).toBe('openshop-layer-option-0');

    list.dispatchEvent(new KeyboardEvent('keydown', { key:'Home', bubbles:true }));
    expect(OS.activeLayerIdx).toBe(2);
    expect(list.getAttribute('aria-activedescendant')).toBe('openshop-layer-option-2');
  });

  test('supports keyboard reorder and deletion through the same guarded commands', () => {
    const OS = prepare(loadOpenShop());
    const list = document.getElementById('layers-list');
    list.focus();
    list.dispatchEvent(new KeyboardEvent('keydown', {
      key:'ArrowUp', ctrlKey:true, altKey:true, bubbles:true
    }));
    expect(OS.activeLayerIdx).toBe(2);
    expect(OS.layers.map(value => value.name)).toEqual(['Bottom', 'Top', 'Middle']);

    list.dispatchEvent(new KeyboardEvent('keydown', { key:'Delete', bubbles:true }));
    expect(OS.layers).toHaveLength(2);
    expect(OS.saveHistory).toHaveBeenCalledWith('Delete Layer', expect.any(Object));
  });

  test('navigates history without restoring until Enter or Space activates it', () => {
    const OS = loadOpenShop();
    OS.history = [{ action:'Paint', snapshot:'snapshot' }];
    OS.historyIdx = -1;
    OS._restoreHistory = vi.fn();
    OS.updateHistoryPanel();
    const list = document.getElementById('history-list');
    expect(list.tabIndex).toBe(0);
    expect(list.getAttribute('aria-activedescendant')).toBe('openshop-history-option-baseline');

    list.focus();
    list.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowDown', bubbles:true }));
    expect(list.getAttribute('aria-activedescendant')).toBe('openshop-history-option-0');
    expect(OS._restoreHistory).not.toHaveBeenCalled();

    list.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }));
    expect(OS._restoreHistory).toHaveBeenCalledWith(0, null);
  });
});
