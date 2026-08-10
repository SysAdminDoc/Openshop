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
  test('publishes tab ownership, roving focus, command composites, and mobile drawer state', () => {
    const OS = loadOpenShop();
    const panels = document.getElementById('panels');
    panels.innerHTML = `
      <div class="panel-tab-group">
        <div class="panel-tabs"><button class="panel-tab active">Layers</button><button class="panel-tab">Properties</button></div>
        <div class="panel-tab-content active" id="layers-panel" data-group="test-group"></div>
        <div class="panel-tab-content" id="properties-panel" data-group="test-group"></div>
      </div>`;
    OS._initPanelTabSemantics();
    const tablist = panels.querySelector('[role="tablist"]');
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    expect(tabs[0].getAttribute('aria-controls')).toBe('layers-panel');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].tabIndex).toBe(-1);
    expect(document.getElementById('properties-panel').hidden).toBe(true);

    tabs[0].focus();
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowRight', bubbles:true, cancelable:true }));
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('properties-panel').hidden).toBe(false);

    const input = document.createElement('input');
    input.id = 'cmd-input';
    input.type = 'text';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-controls', 'cmd-results');
    document.body.appendChild(input);
    const results = document.getElementById('cmd-results');
    results.setAttribute('role', 'listbox');
    OS._getCommands = () => [
      { label:'First command', cat:'Test', fn:vi.fn() },
      { label:'Second command', cat:'Test', fn:vi.fn() }
    ];
    OS.filterCommands('');
    const options = [...results.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(2);
    expect(options[0].id).toBe('openshop-command-option-0');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    OS._cmdHover(1);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);

    const label = document.createElement('label');
    label.textContent = 'Dynamic opacity';
    const range = document.createElement('input');
    range.type = 'range';
    document.body.append(label, range);
    OS._normalizeAccessibleControls(document);
    expect(range.id).toMatch(/^openshop-a11y-dynamic-opacity-/);
    expect(label.htmlFor).toBe(range.id);
    expect(range.getAttribute('aria-label')).toBeNull();

    const toggle = document.createElement('button');
    toggle.id = 'mobile-panel-toggle';
    const mobilePanels = document.createElement('div');
    mobilePanels.id = 'mobile-test-panels';
    document.body.append(toggle, mobilePanels);
    document.documentElement.dataset.osWorkspace = 'mobile';
    // The production method targets the real panel id; swap the fixture into it.
    panels.id = 'panels';
    toggle.id = 'mobile-panel-toggle';
    OS._syncMobilePanelAccessibility();
    expect(panels.getAttribute('inert')).toBe('');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    OS.toggleMobilePanels(true);
    expect(panels.hasAttribute('inert')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

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
