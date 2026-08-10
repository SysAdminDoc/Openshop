import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.OPENSHOP_PERF_PORT || 4174);
const appUrl = `http://127.0.0.1:${port}/`;
const iterations = Math.max(1, Math.min(5, Number(process.env.OPENSHOP_PERF_ITERATIONS || 3)));
const slowFilterArg = process.argv.find(argument => argument.startsWith('--slow-filter-ms='));
const slowFilterMs = Math.max(0, Number(slowFilterArg?.split('=')[1] || process.env.OPENSHOP_PERF_SLOW_FILTER_MS || 0));

const fixtures = [
    { name:'4K', width:3840, height:2160 },
    { name:'8K', width:7680, height:4320 },
    { name:'12MP', width:4000, height:3000 }
];

// Baselines are the observed p95 ceilings from the shipped page in headless
// Chromium on the contributor machine. The fixed four-times envelope absorbs
// normal CI variance while keeping an intentionally slowed filter observable.
const PERFORMANCE_MULTIPLIER = 4;
const baselineP95Ms = Object.freeze({
    import:200,
    paint:100,
    filterPreview:150,
    filterApply:4_000,
    historyCapture:1_000,
    historyReplay:1_000,
    psdLazyDecode:1_000,
    rendererFilter:1_000,
    rendererFallback:1_000,
    undoRedo:1_000,
    export:500,
    batch:2_500,
    cancel:100,
    staleResult:100
});
const budgets = Object.freeze(Object.fromEntries(
    Object.entries(baselineP95Ms).map(([name, baseline]) => [name, {
        baselineP95Ms:baseline,
        multiplier:PERFORMANCE_MULTIPLIER,
        p95Ms:baseline * PERFORMANCE_MULTIPLIER
    }])
));

const percentile = (values, factor = 0.95) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * factor) - 1)];
};

function waitForServer(server) {
    return new Promise((resolveReady, rejectReady) => {
        const deadline = Date.now() + 15_000;
        const check = async () => {
            try {
                const response = await fetch(appUrl, { redirect:'manual' });
                if (response.ok) return resolveReady();
            } catch {
                // The server is still starting.
            }
            if (Date.now() >= deadline) return rejectReady(new Error(`Timed out waiting for ${appUrl}`));
            setTimeout(check, 100);
        };
        server.once('error', rejectReady);
        check();
    });
}

function startServer() {
    const server = spawn(process.execPath, ['tests/server.mjs'], {
        cwd:rootDir,
        env:{ ...process.env, OPENSHOP_TEST_PORT:String(port) },
        stdio:['ignore', 'ignore', 'inherit']
    });
    return { server, ready:waitForServer(server) };
}

function stopServer(server) {
    if (!server || server.killed) return;
    server.kill('SIGTERM');
}

function formatMs(value) {
    return `${value.toFixed(1)} ms`;
}

function checkReport(report) {
    const failures = [];
    report.fixtures.forEach(fixture => Object.entries(fixture.operations).forEach(([name, result]) => {
        const budget = report.budgets[name];
        if (result.p95Ms > budget.p95Ms) failures.push(`${fixture.name}.${name}.p95Ms=${result.p95Ms} > ${budget.p95Ms}`);
        if (!result.executionPaths?.backend) failures.push(`${fixture.name}.${name} did not report an execution backend`);
        if (name === 'cancel' && result.cancellation?.observed !== true) {
            failures.push(`${fixture.name}.cancel did not observe a real cancelled compute job`);
        }
        if (name === 'staleResult' && result.staleResultHandling?.discarded !== true) {
            failures.push(`${fixture.name}.staleResult did not discard a stale compute result`);
        }
        if (name === 'historyCapture' && result.historyCapture?.captureSkipped !== true) {
            failures.push(`${fixture.name}.historyCapture performed an unexpected raster capture`);
        }
        if (name === 'historyCapture' && result.historyCapture?.capturedTiles !== 0) {
            failures.push(`${fixture.name}.historyCapture read ${result.historyCapture.capturedTiles} raster tiles`);
        }
        if (name === 'historyReplay' && result.historyReplay?.reconstructionSteps > result.historyReplay?.checkpointInterval - 1) {
            failures.push(`${fixture.name}.historyReplay replayed ${result.historyReplay.reconstructionSteps} deltas without a nearby checkpoint`);
        }
        if (name === 'psdLazyDecode') {
            if (result.psdLazyDecode?.strategy !== 'useRawData' || result.psdLazyDecode?.lazy !== true) {
                failures.push(`${fixture.name}.psdLazyDecode did not use raw layer decoding`);
            }
            if (!Number.isFinite(result.psdLazyDecode?.firstLayerMs)) {
                failures.push(`${fixture.name}.psdLazyDecode did not report time-to-first-layer`);
            }
            if (!(Number(result.psdLazyDecode?.totalMemoryLimit) > 0 && Number(result.psdLazyDecode.totalMemoryLimit) < 2 * 1024 * 1024 * 1024)) {
                failures.push(`${fixture.name}.psdLazyDecode did not enforce an explicit sub-2GB memory limit`);
            }
            if (Number(result.psdLazyDecode?.decodedLayerCount) < 4) {
                failures.push(`${fixture.name}.psdLazyDecode did not exercise the large multi-layer fixture`);
            }
        }
        if (name === 'rendererFilter' && result.rendererFilter?.path !== 'offscreen-filter-worker') {
            failures.push(`${fixture.name}.rendererFilter did not exercise the OffscreenCanvas worker path`);
        }
        if (name === 'rendererFallback' && result.rendererFallback?.path !== 'filter-worker') {
            failures.push(`${fixture.name}.rendererFallback did not exercise the CPU worker fallback`);
        }
    }));
    if (failures.length) throw new Error(`Performance budget failure: ${failures.join(', ')}`);
}

async function runFixtureSample(page, fixture, slowMs, psdFixture) {
    return page.evaluate(async ({ width, height, slowFilterMs: injectedSlowMs, psdFixture }) => {
        const pathFor = (backend, fallback = 'CanvasRenderingContext2D') => {
            const webgl = Boolean(backend && window.fabric?.WebGLFilterBackend && backend instanceof fabric.WebGLFilterBackend);
            const canvas2d = Boolean(backend && window.fabric?.Canvas2dFilterBackend && backend instanceof fabric.Canvas2dFilterBackend);
            return {
                backend:backend?.constructor?.name || (canvas2d ? 'Canvas2dFilterBackend' : fallback),
                worker:false,
                gpu:webgl,
                cpu:canvas2d || (!webgl && !backend)
            };
        };
        const timed = async (operation, run, executionPaths) => {
            const started = performance.now();
            const value = await run();
            return {
                durationMs:Number((performance.now() - started).toFixed(3)),
                value,
                executionPaths
            };
        };
        if (injectedSlowMs > 0 && !OS.__openshopPerfSlowFilter) {
            const original = OS._applyImageFilters;
            OS._applyImageFilters = function (...args) {
                const result = original.apply(this, args);
                const until = performance.now() + injectedSlowMs;
                while (performance.now() < until) { /* deliberate gate probe */ }
                return result;
            };
            OS.__openshopPerfSlowFilter = true;
        }

        const imported = await timed('import', () => {
            OS.createNewDocument(width, height, { resetProject:true, clean:true });
            if (!OS._hasActiveDocument()) throw new Error('Import probe did not create an active document');
            return { width:OS.canvasW, height:OS.canvasH };
        }, pathFor(null, 'CanvasRenderingContext2D'));

        const painted = await timed('paint', () => {
            const rectangle = new fabric.Rect({
                left:Math.max(1, Math.round(width / 8)),
                top:Math.max(1, Math.round(height / 8)),
                width:Math.max(16, Math.round(width / 4)),
                height:Math.max(16, Math.round(height / 4)),
                fill:'#6c8cff',
                name:'Performance paint'
            });
            OS._addObjectAsLayer(rectangle, 'Performance paint');
            OS.saveHistory('Performance paint');
            OS.canvas.renderAll();
            return { layerCount:OS.layers.length, objectCount:OS.canvas.getObjects().length };
        }, pathFor(null, 'CanvasRenderingContext2D'));

        const source = document.createElement('canvas');
        source.width = width;
        source.height = height;
        const sourceContext = source.getContext('2d');
        sourceContext.fillStyle = 'rgb(40,80,120)';
        sourceContext.fillRect(0, 0, width, height);
        const image = new fabric.Image(source, { left:0, top:0, name:'Performance image' });
        OS.canvas.add(image);
        OS.layers[OS.activeLayerIdx].objects.push(image);
        OS.canvas.setActiveObject(image);
        OS.canvas.renderAll();
        if (OS.canvas.getActiveObject() !== image) throw new Error('Filter probe did not select its image target');

        OS.showFilterDialog('Brightness');
        const filterPanel = document.getElementById('filter-dialog-overlay');
        filterPanel.querySelector('#fp-bright').value = '25';
        const preview = await timed('filterPreview', () => OS._filterPreviewNow('Brightness'),
            pathFor(OS._previewFilterBackend, 'Canvas2dFilterBackend'));
        const previewMetrics = { ...OS._lastFilterRenderMetrics };

        const applied = await timed('filterApply', () => OS._filterApply(), pathFor(fabric.getFilterBackend?.(), 'FabricFilterBackend'));
        const applyMetrics = { ...OS._lastFilterRenderMetrics };

        const historyCapture = await timed('historyCapture', () => {
            const beforeMetrics = OS._historyCaptureMetrics;
            const fullRasterTiles = Number(beforeMetrics?.tilesRead || 0);
            const target = OS.canvas.getActiveObject();
            if (!target) throw new Error('History probe lost its image target');
            target.name = 'History metadata probe';
            const saved = OS.saveHistory('History metadata probe');
            const afterMetrics = OS._historyCaptureMetrics;
            return {
                saved,
                captureSkipped:afterMetrics === beforeMetrics,
                fullRasterTiles,
                capturedTiles:afterMetrics === beforeMetrics ? 0 : Number(afterMetrics?.tilesRead || 0)
            };
        }, pathFor(null, 'CanvasRenderingContext2D'));

        const historyReplay = await timed('historyReplay', () => {
            const previousMaxHistory = OS.maxHistory;
            const previousMaxHistoryBytes = OS.maxHistoryBytes;
            const previousCaptureDocumentState = OS._captureDocumentState;
            OS.maxHistory = Math.max(previousMaxHistory, 200);
            OS.maxHistoryBytes = 0;
            try {
                // Keep the real 8K raster state and checkpoint maps in place,
                // but avoid timing 119 repeated PNG-sized metadata snapshots.
                OS._captureDocumentState = () => ({ kind:'history-replay-probe', step:OS.history.length });
                for (let step = 0; step < 119; step++) {
                    if (!OS.saveHistory(`History replay ${step}`)) throw new Error('History replay probe could not append metadata history');
                }
                const targetIndex = OS.history.length - 1;
                OS._historyPixelsForIndex(targetIndex);
                const metrics = { ...OS._historyReconstructionMetrics };
                return {
                    steps:119,
                    historyLength:OS.history.length,
                    checkpointInterval:Number(OS._historyCheckpointInterval),
                    reconstructionSteps:Number(metrics.deltaSteps || 0),
                    checkpointIndex:Number(metrics.checkpointIndex ?? -1)
                };
            } finally {
                OS._captureDocumentState = previousCaptureDocumentState;
                OS.maxHistory = previousMaxHistory;
                OS.maxHistoryBytes = previousMaxHistoryBytes;
            }
        }, pathFor(null, 'CanvasRenderingContext2D'));

        const rendererFilter = await timed('rendererFilter', async () => {
            await OS._ensureRendererReady();
            const sourcePixels = new Uint8ClampedArray(64 * 64 * 4);
            for (let index = 0; index < sourcePixels.length; index += 4) {
                sourcePixels[index] = 40;
                sourcePixels[index + 1] = 80;
                sourcePixels[index + 2] = 120;
                sourcePixels[index + 3] = 255;
            }
            const previousGPU = OS._gpuFilterDisabled;
            const previousPhoton = OS._photonFilterDisabled;
            OS._gpuFilterDisabled = true;
            OS._photonFilterDisabled = true;
            try {
                await OS._runFilterWithPhoton('sharpen', new ImageData(sourcePixels, 64, 64), 64, 64, {});
                const report = OS.aiBackendReport();
                return {
                    path:report.renderer.paths.filter,
                    backends:Object.keys(report.filterBackends.sharpen?.backends || {})
                };
            } finally {
                OS._gpuFilterDisabled = previousGPU;
                OS._photonFilterDisabled = previousPhoton;
            }
        }, { backend:'offscreen-filter-worker', worker:true, gpu:false, cpu:false });

        const rendererFallback = await timed('rendererFallback', async () => {
            const previous = {
                capabilities:{ ...OS.renderer.capabilities },
                paths:{ ...OS.renderer.paths },
                gpuDisabled:OS._gpuFilterDisabled,
                photonDisabled:OS._photonFilterDisabled
            };
            OS.renderer.capabilities.offscreenFilter = false;
            OS.renderer.paths.filter = 'filter-worker';
            OS._gpuFilterDisabled = true;
            OS._photonFilterDisabled = true;
            try {
                const sourcePixels = new Uint8ClampedArray(64 * 64 * 4);
                sourcePixels.fill(128);
                await OS._runFilterWithPhoton('sharpen', new ImageData(sourcePixels, 64, 64), 64, 64, {});
                const report = OS.aiBackendReport();
                return {
                    path:report.renderer.paths.filter,
                    backends:Object.keys(report.filterBackends.sharpen?.backends || {})
                };
            } finally {
                OS.renderer.capabilities = previous.capabilities;
                OS.renderer.paths = previous.paths;
                OS._gpuFilterDisabled = previous.gpuDisabled;
                OS._photonFilterDisabled = previous.photonDisabled;
            }
        }, { backend:'filter-worker', worker:true, gpu:false, cpu:true });

        const exported = await timed('export', async () => {
            const captured = await OS._captureExportedBlob('png');
            if (!captured?.blob?.size) throw new Error('Export probe produced an empty blob');
            return { bytes:captured.blob.size, filename:captured.filename };
        }, pathFor(null, 'CanvasRenderingContext2D'));

        const history = await timed('undoRedo', async () => {
            await OS.undo();
            await OS.redo();
            return { historyIndex:OS.historyIdx, historyLength:OS.history.length };
        }, pathFor(null, 'CanvasRenderingContext2D'));

        const inputBlob = await new Promise((resolveBlob, rejectBlob) => source.toBlob(blob => blob ? resolveBlob(blob) : rejectBlob(new Error('Batch fixture encoding failed')), 'image/png'));
        const batch = await timed('batch', async () => {
            const file = new File([inputBlob], 'performance.png', { type:'image/png' });
            const recipe = [{
                schemaVersion:1,
                id:'layer.add',
                args:{ layerId:'performance-batch-layer', name:'Performance batch layer' }
            }];
            const result = await OS.runBatch([file], recipe, { format:'png' });
            if (result.failed.length || result.processed.length !== 1 || !result.blob?.size) {
                throw new Error('Batch probe did not process one image successfully');
            }
            return { processed:result.processed.length, bytes:result.blob.size };
        }, pathFor(null, 'CanvasRenderingContext2D'));

        const psdLazyDecode = await timed('psdLazyDecode', async () => {
            const bytes = Uint8Array.from(atob(psdFixture), character => character.charCodeAt(0));
            const imported = await OS._loadPSDFile(new File([bytes], 'performance-nested.psd', { type:'image/vnd.adobe.photoshop' }));
            const metrics = { ...OS._lastPSDImportMetrics };
            if (!imported || metrics.strategy !== 'useRawData' || metrics.lazy !== true) {
                throw new Error('PSD performance probe did not use lazy raw decoding');
            }
            return metrics;
        }, { backend:'ag-psd-worker', worker:true, gpu:false, cpu:false });

        const cancelled = await timed('cancel', () => {
            const job = OS._startComputeJob('performance-cancel');
            const observed = OS._cancelComputeJob(job, 'Performance cancellation probe');
            return { observed, signalAborted:job.controller.signal.aborted, jobs:OS._computeJobs.size };
        }, { backend:'compute-controller', worker:false, gpu:false, cpu:false });

        const stale = await timed('staleResult', () => {
            const job = OS._startComputeJob('performance-stale');
            OS._documentRevision += 1;
            let discarded = false;
            try {
                OS._assertComputeJobCurrent(job);
            } catch (error) {
                discarded = OS._isComputeAbort(error) && /changed|replaced|target/i.test(String(error.message));
            } finally {
                OS._finishComputeJob(job);
            }
            return { discarded, jobs:OS._computeJobs.size };
        }, { backend:'compute-controller', worker:false, gpu:false, cpu:false });

        const output = {
            import:imported,
            paint:painted,
            filterPreview:{ ...preview, value:previewMetrics },
            filterApply:{ ...applied, value:applyMetrics },
            historyCapture,
            historyReplay,
            psdLazyDecode,
            rendererFilter,
            rendererFallback,
            export:exported,
            undoRedo:history,
            batch,
            cancel:{ ...cancelled, value:cancelled.value },
            staleResult:{ ...stale, value:stale.value }
        };
        await OS.closeDocument({ force:true });
        return output;
    }, { ...fixture, slowFilterMs:slowMs, psdFixture });
}

async function benchmark(page, psdFixture) {
    const reportFixtures = [];
    for (const fixture of fixtures) {
        const samples = Object.fromEntries(Object.keys(budgets).map(name => [name, []]));
        for (let index = 0; index < iterations; index += 1) {
            const measured = await runFixtureSample(page, fixture, slowFilterMs, psdFixture);
            Object.entries(measured).forEach(([name, result]) => {
                samples[name].push({
                    durationMs:result.durationMs,
                    executionPaths:result.executionPaths,
                    historyCapture:name === 'historyCapture' ? result.value : undefined,
                    historyReplay:name === 'historyReplay' ? result.value : undefined,
                    psdLazyDecode:name === 'psdLazyDecode' ? result.value : undefined,
                    rendererFilter:name === 'rendererFilter' ? result.value : undefined,
                    rendererFallback:name === 'rendererFallback' ? result.value : undefined,
                    cancellation:name === 'cancel' ? { tested:true, observed:Boolean(result.value?.observed && result.value.signalAborted) } : undefined,
                    staleResultHandling:name === 'staleResult' ? { tested:true, discarded:Boolean(result.value?.discarded) } : undefined
                });
            });
        }
        const operations = Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, {
                samples:values.map(value => Number(value.durationMs.toFixed(3))),
                p50Ms:Number(percentile(values.map(value => value.durationMs), 0.5).toFixed(3)),
                p95Ms:Number(percentile(values.map(value => value.durationMs), 0.95).toFixed(3)),
                executionPaths:values.at(-1).executionPaths,
                historyCapture:values.at(-1).historyCapture,
                historyReplay:values.at(-1).historyReplay,
                psdLazyDecode:values.at(-1).psdLazyDecode,
                rendererFilter:values.at(-1).rendererFilter,
                rendererFallback:values.at(-1).rendererFallback,
                cancellation:values.at(-1).cancellation,
                staleResultHandling:values.at(-1).staleResultHandling
        }]));
        reportFixtures.push({
            name:fixture.name,
            width:fixture.width,
            height:fixture.height,
            pixels:fixture.width * fixture.height,
            operations
        });
    }
    return {
        schemaVersion:2,
        generatedAt:new Date().toISOString(),
        runtime:{ browser:'chromium', executionPath:'playwright-headless', iterations, slowFilterMs },
        budgets,
        fixtures:reportFixtures
    };
}

async function main() {
    const { server, ready } = startServer();
    let browser;
    try {
        await ready;
        browser = await chromium.launch({ headless:true });
        const page = await browser.newPage({ viewport:{ width:1440, height:1000 } });
        await page.goto(appUrl, { waitUntil:'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.dataset.osBoot === 'ready', null, { timeout:30_000 });
        await page.getByRole('button', { name:'Enter Studio' }).click();
        const psdFixture = await page.evaluate(() => {
            const width = 1536;
            const height = 1536;
            const colors = ['#cc2233', '#2244cc', '#22aa66', '#ddaa22'];
            const makeCanvas = color => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext('2d');
                context.fillStyle = color;
                context.fillRect(0, 0, width, height);
                return canvas;
            };
            const bytes = new Uint8Array(agPsd.writePsd({
                width,
                height,
                canvas:makeCanvas('#101010'),
                children:colors.map((color, index) => ({
                    name:`Performance PSD layer ${index + 1}`,
                    left:0,
                    top:0,
                    right:width,
                    bottom:height,
                    canvas:makeCanvas(color)
                }))
            }));
            let binary = '';
            for (let index = 0; index < bytes.length; index += 0x8000) {
                binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
            }
            return btoa(binary);
        });
        const report = await benchmark(page, psdFixture);
        if (process.argv.includes('--check')) checkReport(report);
        if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
        else {
            console.log(`Performance budgets passed for ${report.fixtures.length} real browser fixtures (4K, 8K, 12MP).`);
            report.fixtures.forEach(fixture => {
                const values = Object.keys(budgets).map(name => `${name} p95 ${formatMs(fixture.operations[name].p95Ms)}`);
                const firstLayerMs = fixture.operations.psdLazyDecode.psdLazyDecode?.firstLayerMs;
                if (Number.isFinite(firstLayerMs)) values.push(`psd time-to-first-layer ${formatMs(firstLayerMs)}`);
                console.log(`${fixture.name} ${fixture.width}x${fixture.height}: ${values.join(', ')}`);
            });
        }
    } finally {
        await browser?.close().catch(() => {});
        stopServer(server);
    }
}

main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
});
