import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  installFabricMock,
  installModalDelegation,
  loadOpenShop,
  mountEditorDom,
  quietUiMethods
} from './os-harness.js';

const fixtureRoot = join(process.cwd(), 'tests', 'fixtures');
const readFixture = name => readFileSync(join(fixtureRoot, name), 'utf8');
const readJSON = name => JSON.parse(readFixture(name));
const corpus = readJSON('compatibility-corpus.json');

describe('redistributable compatibility corpus', () => {
  beforeEach(() => {
    localStorage.clear();
    installFabricMock();
    installModalDelegation();
    mountEditorDom();
  });

  it('keeps every fixture path, provenance record, and invariant machine-readable', () => {
    expect(corpus.manifestVersion).toBe(1);
    expect(corpus.fixtures.length).toBeGreaterThanOrEqual(9);
    const paths = new Set();
    const formats = new Set();
    corpus.fixtures.forEach(entry => {
      expect(paths.has(entry.path)).toBe(false);
      paths.add(entry.path);
      formats.add(entry.format);
      expect(existsSync(join(fixtureRoot, entry.path))).toBe(true);
      expect(corpus.provenance[entry.provenance]).toMatchObject({
        source:expect.any(String),
        license:expect.stringMatching(/^(?:MIT|CC0-1\.0)$/)
      });
      expect(entry.invariants).toBeTruthy();
    });
    expect(formats).toEqual(new Set(['openshop', 'psd', 'pdf', 'animation', 'gif', 'jpeg']));
    const vectors = readJSON('animated-frame-vectors.json');
    expect(Object.keys(vectors.sequences)).toEqual(expect.arrayContaining(['gif', 'apng', 'webp']));
  });

  it('round-trips schema versions, layer hierarchy, masks, animation timing, and metadata', () => {
    const OS = loadOpenShop();
    quietUiMethods(OS);
    const v1 = readJSON('openshop-schema-v1.json');
    const migrated = OS._normalizeDocumentState(v1);
    expect(OS._lastDocumentMigrationReport).toMatchObject({
      format:'openshop', direction:'import', sourceVersion:1, targetVersion:2,
      steps:['schema-1-to-2'], accepted:true
    });
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.canvas).toMatchObject({ width:64, height:48 });
    expect(migrated.layers.map(layer => layer.name)).toEqual(['Background', 'Artwork group', 'Detail']);
    expect(migrated.layers.filter(layer => layer.kind === 'group').map(layer => layer.name)).toEqual(['Artwork group']);
    expect(migrated.animation.delays).toEqual([80, 160]);
    expect(migrated.animation.frames).toHaveLength(2);

    const v2 = readJSON('openshop-schema-v2.json');
    const normalized = OS._normalizeDocumentState(v2);
    const photo = normalized.canvas.fabric.objects.find(object => object._openShopObjectId === 'object-photo');
    const mask = OS._normalizeLayerMask(photo._openShopLayerMask, { validate:true });
    expect(normalized.canvas).toMatchObject({ width:96, height:64 });
    expect(normalized.layers.map(layer => layer.name)).toEqual(['Artwork group', 'Masked photo', 'Notes']);
    expect(normalized.layers.find(layer => layer.name === 'Masked photo').parentId).toBe('layer-artwork');
    expect(mask).toMatchObject({ enabled:true, feather:4, density:92, mask:{ width:2, height:2, encoding:'coverage-v1' } });
    expect([...OS._decodeSelectionMask(mask.mask).mask]).toEqual([255, 0, 128, 64]);
    expect(normalized.animation).toMatchObject({ activeFrameIndex:2, delays:[40, 120, 240] });
    expect(normalized.animation.frames).toHaveLength(3);
    expect(normalized.metadata.image).toMatchObject({
      sourceFormat:'jpeg',
      exif:expect.objectContaining({ orientation:6, hasGps:true }),
      xmp:expect.objectContaining({ title:'Corpus frame', hasLocation:true })
    });

    const reopened = OS._normalizeDocumentState(JSON.parse(JSON.stringify(normalized)));
    expect(reopened.schemaVersion).toBe(2);
    expect(reopened.layers.map(layer => layer.name)).toEqual(normalized.layers.map(layer => layer.name));
    expect(reopened.animation.delays).toEqual([40, 120, 240]);
    expect(reopened.canvas.fabric.objects.find(object => object._openShopObjectId === 'object-photo')._openShopLayerMask.mask.data)
      .toBe(photo._openShopLayerMask.mask.data);
  });

  it('rejects malformed project boundaries without touching the active document', () => {
    const OS = loadOpenShop();
    const malformed = readJSON('openshop-malformed.json');
    const activeLayer = { id:'active-layer' };
    OS.layers = [activeLayer];
    OS._documentId = 'active-document';

    let error;
    try { OS._normalizeDocumentState(malformed); }
    catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect(error.lossReport).toMatchObject({
      accepted:false,
      losses:[expect.objectContaining({ code:'openshop.invalid-document' })]
    });
    expect(OS.layers).toEqual([activeLayer]);
    expect(OS._documentId).toBe('active-document');
    expect(() => OS._decodeSelectionMask(malformed.selection.mask)).toThrow(/truncated/);
  });

  it('asserts PSD loss declarations and the upstream binary boundary', () => {
    const OS = loadOpenShop();
    const descriptor = readJSON('psd-mask-loss.json');
    const report = OS._analyzePSDImport({
      ...descriptor,
      composite:{ width:descriptor.width, height:descriptor.height, buffer:new ArrayBuffer(descriptor.width * descriptor.height * 4) }
    });
    const codes = new Set(report.losses.map(loss => loss.code));
    descriptor.expectedLosses.forEach(code => expect(codes.has(code)).toBe(true));
    expect(report.losses.every(loss => loss.message && loss.fallback)).toBe(true);

    const psd = readFileSync(join(fixtureRoot, 'photoshop-nested.psd'));
    expect(psd.subarray(0, 4).toString('ascii')).toBe('8BPS');
    const manifestEntry = corpus.fixtures.find(entry => entry.id === 'psd-nested-upstream');
    expect(manifestEntry.invariants.signature).toBe('8BPS');
  });

  it('keeps PDF page and animation frame invariants explicit', () => {
    const OS = loadOpenShop();
    const pdf = readJSON('pdf-two-page.json');
    expect(pdf.pages).toHaveLength(2);
    expect(pdf.pages.map(page => page.name)).toEqual(['Page 1', 'Page 2']);
    expect(pdf.pages.every(page => page.width === 320 && page.height === 240)).toBe(true);
    expect(pdf.declaredLosses).toEqual([
      expect.objectContaining({ code:'pdf.rasterized-page', fallback:expect.stringContaining('raster') })
    ]);

    const vectors = readJSON('animated-frame-vectors.json').sequences;
    Object.values(vectors).forEach(sequence => {
      expect(OS._normalizeAnimationDelays(sequence.delays, sequence.frameCount)).toEqual(sequence.delays);
      expect(sequence.frames.length).toBeGreaterThan(1);
      expect(sequence.delays.length).toBe(sequence.frameCount);
    });
  });

  it('parses the upstream metadata fixture and verifies the privacy loss policy', () => {
    const OS = loadOpenShop();
    const jpeg = readFileSync(join(fixtureRoot, 'exif-orientation-6.jpg'));
    expect(jpeg.subarray(0, 2).toString('hex').toUpperCase()).toBe('FFD8');
    const metadata = OS._readImageMetadata(new Uint8Array(jpeg), 'image/jpeg');
    expect(metadata).toMatchObject({
      sourceFormat:'jpeg',
      exif:expect.objectContaining({ orientation:6 })
    });
    OS._imageMetadata = metadata;
    const plan = OS._metadataExportPlan('jpeg');
    expect(plan).toMatchObject({ policy:'strip-location', action:'preserved-selected', fields:['EXIF'] });
    expect(plan.warnings).toEqual([]);
  });
});
