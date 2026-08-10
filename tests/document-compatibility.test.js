import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCanvasMock,
  installFabricMock,
  installModalDelegation,
  loadOpenShop,
  mountEditorDom
} from './os-harness.js';

describe('document migrations and compatibility reports', () => {
  beforeEach(() => {
    localStorage.clear();
    installFabricMock();
    installModalDelegation();
    mountEditorDom();
  });

  it('rejects a future schema before touching the active document or input payload', () => {
    const OS = loadOpenShop();
    const activeLayer = { id:'active-layer' };
    OS.layers = [activeLayer];
    OS._documentId = 'active-document';
    const future = {
      kind:'openshop-document',
      schemaVersion:OS._documentSchemaVersion + 1,
      canvas:{ width:1, height:1, fabric:{ objects:[] } },
      layers:[{ id:'future-layer', objectIds:[] }]
    };
    const before = JSON.stringify(future);

    expect(() => OS._normalizeDocumentState(future)).toThrow(/Unsupported OpenShop document schema/);
    expect(JSON.stringify(future)).toBe(before);
    expect(OS.layers).toEqual([activeLayer]);
    expect(OS._documentId).toBe('active-document');
    expect(OS._lastDocumentMigrationReport).toBeNull();
  });

  it('reports the supported schema registry and legacy migration path', () => {
    const OS = loadOpenShop();
    OS.canvas = createCanvasMock();
    const current = {
      kind:'openshop-document',
      schemaVersion:1,
      canvas:{ width:1, height:1, fabric:{ objects:[] } },
      layers:[{ id:'layer-1', name:'Layer 1', visible:true, locked:false, opacity:100, blend:'source-over', objectIds:[] }]
    };
    expect(OS._normalizeDocumentState(current).schemaVersion).toBe(3);
    expect(OS._lastDocumentMigrationReport).toMatchObject({
      format:'openshop', direction:'import', accepted:true, sourceVersion:1, targetVersion:3,
      steps:['schema-1-to-2', 'schema-2-to-3']
    });
    expect(OS._documentMigrationRegistry[1]).toEqual(expect.any(Function));

    const legacy = { version:'0.18.13', objects:[], _openShop:{ w:1, h:1, version:'0.18.13' } };
    const migrated = OS._normalizeDocumentState(legacy);
    expect(migrated.kind).toBe('openshop-document');
    expect(migrated.migratedFrom).toBe('0.18.13');
    expect(OS._lastDocumentMigrationReport).toMatchObject({
      sourceVersion:'legacy', steps:['legacy-envelope-to-schema-1', 'schema-1-to-2', 'schema-2-to-3']
    });
    expect(OS._lastDocumentMigrationReport.losses[0]).toMatchObject({
      code:'openshop.legacy-envelope', path:'root'
    });
  });

  it('returns structured PSD losses for unsupported fields and approximations', () => {
    const OS = loadOpenShop();
    const report = OS._analyzePSDImport({
      width:100,
      height:80,
      composite:{ width:100, height:80, buffer:new ArrayBuffer(100 * 80 * 4) },
      children:[{
        id:'group-1',
        sourceKind:'group',
        name:'Effects',
        opacity:0.5,
        blendMode:'multiply',
        unsupported:[],
        children:[{
          id:'layer-1',
          sourceKind:'bitmap',
          name:'Masked photo',
          blendMode:'linear-dodge',
          opacity:1,
          unsupported:['layer mask', 'smart object'],
          children:[]
        }]
      }]
    });

    expect(report.losses).toEqual(expect.arrayContaining([
      expect.objectContaining({ code:'psd.group-opacity', path:'Effects', feature:'group opacity' }),
      expect.objectContaining({ code:'psd.unsupported-layer-mask', path:'Effects / Masked photo', feature:'layer mask' }),
      expect.objectContaining({ code:'psd.blend-mode', feature:'linear-dodge blending' }),
      expect.objectContaining({ code:'psd.flattened-composite', path:'document' })
    ]));
    expect(report.losses.every(loss => loss.message && loss.fallback)).toBe(true);
  });

  it('attaches a rejected loss report to unsupported PSD headers', () => {
    const OS = loadOpenShop();
    const error = (() => {
      try {
        OS._validatePSDHeader({ signature:'8BPS', version:1, channels:4, width:1, height:1, depth:8, colorMode:4 }, 0);
      } catch (caught) {
        return caught;
      }
      return null;
    })();

    expect(error).toMatchObject({ code:'psd.unsupported-color-mode' });
    expect(error.lossReport).toMatchObject({ format:'psd', direction:'import', accepted:false });
    expect(error.lossReport.losses[0]).toMatchObject({
      path:'document.colorMode', feature:'CMYK', fallback:'Import requires an 8-bit RGB document.'
    });
  });

  it('exposes structured export losses and opaque ICC handling', () => {
    const OS = loadOpenShop();
    OS._colorProfile = { iccData:'data:application/vnd.openshop.icc;base64,AAECAwQ=' };
    const exportLosses = OS._structuredPSDExportLosses(['"Photo": masks were baked into pixels.']);
    expect(exportLosses[0]).toMatchObject({
      code:'psd.export-compatibility', path:'Photo', feature:'masks were baked into pixels'
    });
    const report = OS._documentExportCompatibilityReport();
    expect(report).toMatchObject({ format:'openshop', direction:'export', accepted:true, targetVersion:3 });
  });
});
