import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shell = readFileSync('index.html', 'utf8');

describe('PS-010 application shell contract', () => {
  it('exposes the required blank-workspace ownership surfaces', () => {
    expect(shell).toContain('<div id="topbar">');
    expect(shell).toContain('<div id="toolbar" role="toolbar"');
    expect(shell).toContain('<div id="tool-options" role="region"');
    expect(shell).toContain('<div id="canvas-area" role="application"');
    expect(shell).toContain('<div id="panels" role="complementary"');
    expect(shell).toContain('<div id="blank-workspace"');
    expect(shell).toContain('<nav id="bottom-tabs" role="tablist" aria-label="Bottom panels"');
  });

  it('keeps the workspace selector and bottom tabs in the declarative event registry', () => {
    expect(shell).toContain('id="workspace-selector" aria-label="Workspace layout" data-os-change="change-043"');
    expect(shell).toContain('id="mini-bridge-tab"');
    expect(shell).toContain('id="timeline-tab"');
    expect(shell).toContain('"click-226": function(event) { OS.selectBottomTab(\'mini-bridge\') }');
    expect(shell).toContain('"change-043": function(event) { OS.setWorkspaceMode(this.value) }');
  });

  it('reserves the bottom strip so canvas ownership cannot overlap the tabs', () => {
    expect(shell).toContain('--bottom-tabs-h:32px');
    expect(shell).toContain('bottom:calc(var(--statusbar-h) + var(--bottom-tabs-h))');
    expect(shell).toContain('#bottom-tabs{position:absolute;left:var(--toolbar-w);right:var(--panel-width)');
  });
});
