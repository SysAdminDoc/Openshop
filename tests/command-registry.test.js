import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadOpenShop, mountEditorDom } from './os-harness.js';

describe('OpenShop typed command and tool registry', () => {
  beforeEach(() => {
    localStorage.clear();
    mountEditorDom();
  });

  it('represents all audited tools and mode controls with stable IDs', () => {
    const OS = loadOpenShop();
    const tools = OS.listRegisteredTools({ documentOpen: true });
    const registry = OS._getCommandRegistry();

    expect(tools).toHaveLength(60);
    expect(new Set(tools.map(tool => tool.id)).size).toBe(60);
    expect(tools.filter(tool => tool.id.startsWith('mode.'))).toHaveLength(2);
    expect(registry.has('tool.marquee.rect')).toBe(true);
    expect(registry.has('mode.quick-mask')).toBe(true);
    expect(registry.has('mode.screen')).toBe(true);
    expect(tools.every(tool => tool.kind === 'tool' && tool.auditStatus === 'VISUALLY_INSPECTED')).toBe(true);
    expect(tools.every(tool => tool.optionsContext && tool.sideEffect && tool.undoPolicy)).toBe(true);
  });

  it('marks unimplemented tools as refused instead of executable no-ops', async () => {
    const OS = loadOpenShop();
    OS.toast = vi.fn();
    OS.recordDiagnostic = vi.fn();
    OS._announceAccessibility = vi.fn();
    const tools = OS.listRegisteredTools({ documentOpen: true });
    const unimplemented = tools.filter(tool => !tool.implemented);

    expect(unimplemented).toHaveLength(32);
    expect(unimplemented.every(tool => tool.enabled === false && tool.blocked === 'unimplemented')).toBe(true);
    const dead = unimplemented[0];
    expect(OS.getCommandState(dead.id, { documentOpen: true })).toMatchObject({
      enabled: false,
      blocked: 'unimplemented',
      implemented: false,
      selected: false
    });

    OS.state.tool = 'select';
    expect(OS.setTool(dead.toolState)).toBe(false);
    expect(OS.state.tool).toBe('select');
    expect(OS.toast).toHaveBeenCalledWith(`${dead.label} is not implemented`, 'error');

    const command = OS._makeCommand(dead.id);
    await expect(OS._invokeCommand(OS._makeCommand('macro.sequence', { commands: [command] })))
      .rejects.toThrow(`Command ${dead.id} could not be applied`);
  });

  it('keeps the toolbox disabled state and branch inventory in sync', () => {
    const OS = loadOpenShop();
    const setToolSource = OS.setTool.toString();
    OS.setTool = vi.fn();
    OS._buildToolboxFromRegistry();
    const disabled = [...document.querySelectorAll('[data-unimplemented="true"]')];
    expect(disabled).toHaveLength(32);
    expect(disabled.every(button => button.disabled && button.getAttribute('aria-disabled') === 'true')).toBe(true);

    const branchStates = new Set([...setToolSource.matchAll(/case ['"]([^'"]+)['"]/g)].map(match => match[1]));
    const executable = OS._toolCatalog().filter(tool => tool.implemented && !tool.id.startsWith('mode.'));
    expect(executable.filter(tool => !branchStates.has(tool.toolState))).toEqual([]);
  });

  it('preserves shell icons and updates a family face when its nested tool changes', () => {
    const OS = loadOpenShop();
    const toolbar = document.getElementById('toolbar');
    const addIcon = (button, name) => {
      button.innerHTML = `<svg data-icon="${name}" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>`;
    };
    addIcon(toolbar.querySelector('[data-tool="brush"]'), 'brush');
    const pencilSource = document.createElement('button');
    pencilSource.className = 'tool-btn';
    pencilSource.dataset.tool = 'pencil';
    addIcon(pencilSource, 'pencil');
    toolbar.appendChild(pencilSource);
    OS.setTool = vi.fn();

    OS._buildToolboxFromRegistry();
    const brushGroup = document.querySelector('.audit-tool-group[data-family="Brush"]');
    const face = brushGroup.querySelector(':scope > .audit-tool-face');
    const pencil = brushGroup.querySelector('.audit-tool-flyout .tool-btn[data-tool="pencil"]');

    expect(face.querySelector('.tool-face-icon')?.dataset.icon).toBe('brush');
    expect(pencil.querySelector('.tool-member-icon')?.dataset.icon).toBe('pencil');
    expect(OS.selectRegistryTool(pencil)).toBe(true);
    expect(face.dataset.tool).toBe('pencil');
    expect(face.querySelector('.tool-face-icon')?.dataset.icon).toBe('pencil');
    expect(face.querySelector('.tool-family-label')?.textContent).toBe('Brush');
    expect(face.getAttribute('aria-label')).toBe('Brush: Pencil');
    expect(OS.setTool).toHaveBeenCalledWith('pencil');
  });

  it('reports blank-state enablement without changing the command IDs', () => {
    const OS = loadOpenShop();
    OS.session.application.ready = true;
    OS._blankWorkspace = true;
    OS._documentId = null;

    expect(OS.getCommandState('tool.marquee.rect')).toMatchObject({
      id: 'tool.marquee.rect',
      enabled: false,
      blocked: true,
      selected: false
    });
    expect(OS.getCommandState('mode.quick-mask')).toMatchObject({ enabled: false, blocked: true });
    expect(OS.getCommandState('mode.screen')).toMatchObject({ enabled: true, blocked: false });
    expect(OS.getCommandState('layer.add')).toMatchObject({ enabled: false, blocked: true });
  });

  it('projects document prerequisites into menu command state', () => {
    const OS = loadOpenShop();

    expect(OS.getCommandState('menu.click-004', { documentOpen: false })).toMatchObject({
      id: 'menu.click-004',
      kind: 'menu',
      enabled: false,
      blocked: true,
      implemented: true
    });
    expect(OS.getCommandState('menu.click-001', { documentOpen: false })).toMatchObject({
      kind: 'menu',
      enabled: true,
      blocked: false
    });
    expect(OS.getCommandState('menu.click-004', { documentOpen: true })).toMatchObject({
      enabled: true,
      blocked: false
    });
    expect(OS.getCommandState('menu.click-124', { documentOpen: false })).toBeNull();
  });

  it('cycles grouped tools through one selection path', () => {
    const OS = loadOpenShop();
    OS.state.tool = 'marquee-rect';
    OS.setTool = vi.fn(tool => { OS.state.tool = tool; });

    const next = OS.cycleToolGroup('Marquee');
    const previous = OS.cycleToolGroup('Marquee', { reverse: true });

    expect(next).toBe('tool.marquee.ellipse');
    expect(previous).toBe('tool.marquee.rect');
    expect(OS.setTool).toHaveBeenCalledWith('marquee-ellipse');
    expect(OS.setTool).toHaveBeenCalledWith('marquee-rect');
  });

  it('localizes labels while preserving command identity', () => {
    const OS = loadOpenShop();
    const english = OS.getCommandState('tool.type.horizontal', { documentOpen: true });
    OS._lang = 'pseudo';
    const pseudo = OS.getCommandState('tool.type.horizontal', { documentOpen: true });

    expect(english.id).toBe(pseudo.id);
    expect(pseudo.label).not.toBe(english.label);
    expect(pseudo.shortcut).toBe('T');
  });

  it('declares tool-specific options schemas instead of only a display label', () => {
    const OS = loadOpenShop();
    const byState = state => OS.listRegisteredTools({ documentOpen: true }).find(tool => tool.toolState === state);

    expect(byState('select').optionsSchema).toMatchObject({
      context:'select',
      groupId:'opt-select',
      requiresDocument:true,
      controls:['select-auto', 'select-transform']
    });
    expect(byState('eraser').optionsSchema).toMatchObject({ context:'eraser', groupId:'opt-brush' });
    expect(byState('pen').optionsSchema).toMatchObject({ context:'pen', groupId:'opt-pen' });
    expect(byState('text').optionsSchema).toMatchObject({ context:'type', groupId:'opt-text' });
    expect(byState('zoom').optionsSchema).toMatchObject({ context:'zoom', groupId:'opt-zoom' });
    expect(OS.getCommandState('tool.move', { documentOpen:true }).optionsSchema).toMatchObject({ context:'select' });
  });
});
